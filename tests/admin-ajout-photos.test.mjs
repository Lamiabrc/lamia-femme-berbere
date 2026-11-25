import test from 'node:test';
import assert from 'node:assert/strict';
import { basePhotos, ADMIN, MEMBRE } from './helpers/moderation-photos-base.mjs';

// Lamia ajoute elle-même les photos d'un profil quand la personne les lui envoie par TikTok ou Facebook.
async function recette(t, { sansPhotos = true } = {}) {
  const b = await basePhotos(); t.after(() => b.db.close());
  if (sansPhotos) {
    for (const id of [b.p1, b.p2]) {
      const [f] = (await b.db.query('select storage_path from annonce_files where id=$1', [id])).rows;
      b.objets.delete(f.storage_path);
      await b.db.query('delete from annonce_files where id=$1', [id]);
    }
  }
  return b;
}
const jpeg = { role: 'media', type: 'image/jpeg', size: 2000 };
const admin = (b, nom, corps) => b.action(nom, corps, ADMIN);
const photos = async (b) => (await b.read(`/rest/v1/annonce_files?annonce_id=eq.${b.id}&kind=eq.photo`)).sort((x, y) => x.position - y.position);

test('réservé à l’administratrice authentifiée, avant toute lecture', async (t) => {
  const b = await recette(t);
  for (const u of [null, MEMBRE, { ...MEMBRE, user_metadata: { role: 'admin' } }]) {
    for (const nom of ['annonce_admin_ajouter_medias', 'annonce_admin_medias_verifier']) {
      assert.equal((await b.action(nom, { ref: 42, medias: [jpeg, jpeg] }, u)).status, 403);
    }
  }
  assert.equal(b.appels.length, 0);
  assert.equal((await photos(b)).length, 0);
});

test('ajoute les 2 photos reçues à un profil sans photo, puis le profil les compte une fois reçues', async (t) => {
  const b = await recette(t);
  const r = await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias: [jpeg, { ...jpeg, type: 'image/png' }] });
  assert.equal(r.status, 200);
  assert.equal(r.uploads.length, 2);
  for (const u of r.uploads) assert.ok(u.path.startsWith(`${b.id}/`));
  assert.deepEqual((await photos(b)).map((f) => f.position), [1, 2]);
  // Annoncées mais pas encore reçues : la vérification ne les compte pas.
  assert.equal((await admin(b, 'annonce_admin_medias_verifier', { ref: 42 })).medias_ok, false);
  const r2 = await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias: [jpeg, jpeg] });
  for (const u of r2.uploads) b.objets.add(u.path);
  const v = await admin(b, 'annonce_admin_medias_verifier', { ref: 42 });
  assert.equal(v.medias_ok, true);
  assert.equal(v.photos, 2);
});

test('une seule photo ne suffit pas quand le profil n’en a aucune : il en faut deux au total', async (t) => {
  const b = await recette(t);
  const r = await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias: [jpeg] });
  assert.equal(r.status, 400);
  assert.equal(r.error, 'medias_requis');
  assert.equal((await photos(b)).length, 0);
});

test('la photo manquante complète un profil qui en a déjà une', async (t) => {
  const b = await recette(t, { sansPhotos: false });
  await b.db.query('delete from annonce_files where id=$1', [b.p2]);
  const r = await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias: [jpeg] });
  assert.equal(r.status, 200);
  assert.equal(r.uploads.length, 1);
  assert.equal((await photos(b)).find((f) => f.storage_path === r.uploads[0].path).position, 2);
});

test('un profil qui a déjà ses 2 photos n’en reçoit pas d’autres', async (t) => {
  const b = await recette(t, { sansPhotos: false });
  const r = await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias: [jpeg, jpeg] });
  assert.equal(r.status, 200);
  assert.equal(r.deja, true);
  assert.deepEqual(r.uploads, []);
  assert.equal((await photos(b)).length, 2);
});

test('refuse les vidéos et les PDF, et plus de 2 photos', async (t) => {
  const b = await recette(t);
  for (const medias of [[{ ...jpeg, type: 'video/mp4' }, jpeg], [{ ...jpeg, type: 'application/pdf' }, jpeg], [jpeg, jpeg, jpeg]]) {
    assert.equal((await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias })).status, 400);
  }
  assert.equal((await photos(b)).length, 0);
});

test('profil retiré ou bloqué, inconnu ou numéro invalide : aucune photo ajoutée', async (t) => {
  const b = await recette(t);
  for (const ref of [999, 0, -1, 'abc', null]) {
    assert.equal((await admin(b, 'annonce_admin_ajouter_medias', { ref, medias: [jpeg, jpeg] })).status, 404);
  }
  await b.db.exec("update annonces set status='retiree'");
  assert.equal((await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias: [jpeg, jpeg] })).status, 409);
  await b.db.exec("update annonces set status='publiee', bloque_at='2026-11-20'");
  assert.equal((await admin(b, 'annonce_admin_ajouter_medias', { ref: 42, medias: [jpeg, jpeg] })).status, 409);
  assert.equal((await photos(b)).length, 0);
});

test('l’envoi par le membre lui-même fonctionne toujours comme avant', async (t) => {
  const b = await recette(t);
  const r = await b.action('annonce_ajouter_medias', { medias: [jpeg, jpeg] }, MEMBRE);
  assert.equal(r.status, 200);
  assert.equal(r.uploads.length, 2);
  assert.equal((await b.action('annonce_ajouter_medias', { medias: [jpeg, jpeg] }, null)).status, 401);
});

test('Lamia remplace une photo refusée : l’ancienne n’est retirée qu’une fois la nouvelle arrivée', async (t) => {
  const b = await recette(t, { sansPhotos: false });
  assert.equal((await b.action('annonce_admin_remplacer_photo', { ref: 42, photo_id: b.p1, ...{ type: 'image/jpeg', size: 2000 } }, MEMBRE)).status, 403);
  const r = await admin(b, 'annonce_admin_remplacer_photo', { ref: 42, photo_id: b.p1, type: 'image/jpeg', size: 2000 });
  assert.equal(r.status, 200);
  assert.ok(r.upload.path.startsWith(`${b.id}/`));
  // Envoi pas arrivé : l'ancienne reste, la ligne vide disparaît.
  const rate = await admin(b, 'annonce_admin_remplacer_photo_finir', { ref: 42, photo_id: b.p1 });
  assert.equal(rate.status, 502);
  assert.ok((await photos(b)).some((f) => f.id === b.p1));
  const r2 = await admin(b, 'annonce_admin_remplacer_photo', { ref: 42, photo_id: b.p1, type: 'image/png', size: 2000 });
  b.objets.add(r2.upload.path);
  const fin = await admin(b, 'annonce_admin_remplacer_photo_finir', { ref: 42, photo_id: b.p1 });
  assert.equal(fin.status, 200);
  const l = await photos(b);
  assert.equal(l.length, 2);
  assert.ok(!l.some((f) => f.id === b.p1));
  assert.equal(l.find((f) => f.position === 1).storage_path, r2.upload.path);
  const mauvais = await admin(b, 'annonce_admin_remplacer_photo', { ref: 42, photo_id: '00000000-0000-4000-8000-000000000000', type: 'image/jpeg', size: 10 });
  assert.equal(mauvais.status, 400);
});
