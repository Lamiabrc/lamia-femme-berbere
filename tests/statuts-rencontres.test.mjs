import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reprendreRencontres } from '../lib/pause-rencontres.mjs';
import { assembler } from '../lib/comptes.mjs';
import { etatRelation, compterMatchsAffiches, libelleInteret } from '../content/etat-matchs.mjs';
import { handleAnnonces, listeACompleter } from '../lib/annonces.mjs';
import { discussionsPourLamia } from '../lib/discussions.mjs';

const ADMIN = { id: '11111111-1111-4111-8111-111111111111', app_metadata: { role: 'admin' } };
const MEMBRE = { id: '22222222-2222-4222-8222-222222222222', email: 'recette@example.invalid' };
const maintenant = new Date('2026-11-27T20:00:00Z');
const compter = (x) => compterMatchsAffiches({ moi: MEMBRE.id, refs: [306], maintenant, ...x });

test('cas 306 : un intérêt réciproque en réserve est en attente, jamais un match actif', () => {
  const i = { id: 'i', cible_ref: 36, statut: 'en_reserve', reciproque: true, reponse: null };
  assert.deepEqual(compter({ sortants: [i] }), { actifs: 0, en_attente: 1, au_revoir_nombre: 0 });
  assert.match(libelleInteret(i), /réciproque.*disponibilité/);
  assert.equal(compter({ sortants: [{ ...i, reponse: 'non' }] }).en_attente, 0);
  assert.equal(compter({ sortants: [{ ...i, reciproque: false }] }).en_attente, 0);
});

test('la même attente dans les deux sens n’est comptée qu’une fois', () => {
  const i = { id: 'i', cible_ref: 36, statut: 'en_reserve', reciproque: true };
  assert.equal(compter({ sortants: [i], recus: [{ ...i, id: 'j', annonces: { ref: 36, user_id: 'autre' } }] }).en_attente, 1);
});

test('état réel : discussion active, expirée, clôturée, au revoir ou non ouverte', () => {
  const i = { id: 'i', statut: 'mis_en_relation' }, d = { interet_id: 'i', ferme_at: '2026-11-30T20:00:00Z' };
  assert.equal(etatRelation(i, [d], maintenant).actif, true);
  for (const x of [{ ...d, ferme_at: '2026-11-20T00:00:00Z' }, { ...d, close_raison: 'dematch' }]) {
    assert.equal(etatRelation(i, [x], maintenant).code, 'termine');
    assert.equal(etatRelation(i, [x], maintenant).actif, false);
  }
  assert.equal(etatRelation(i, [{ ...d, dematch_at: '2026-11-27T19:00:00Z' }], maintenant).code, 'au_revoir');
  assert.equal(etatRelation(i, [], maintenant).code, 'a_ouvrir');
  assert.equal(etatRelation(i, null, maintenant).code, 'inconnu');
  assert.equal(etatRelation(i, [{ ...d, interet_id: 'autre' }], maintenant).actif, false);
});

test('la liste des discussions admin ne masque pas une fin de discussion derrière « numéros échangés »', async () => {
  const ds = [{ id: 'd1', ferme_at: '2000-01-01T00:00:00Z', a_numero: true, b_numero: true }, { id: 'd2', ferme_at: '2100-01-01T00:00:00Z', dematch_at: '2026-11-27T00:00:00Z' }];
  const r = await discussionsPourLamia({ read: async (p) => p.startsWith('/rest/v1/discussions?') ? ds : [] });
  assert.equal(r.discussions[0].etat, 'terminee'); assert.equal(r.discussions[0].numeros_echanges, true);
  assert.equal(r.discussions[1].etat, 'au_revoir');
});

test('la lecture fiable des discussions ne transforme pas une relation sans discussion en match actif', () => {
  assert.equal(compter({ sortants: [{ id: 'i', cible_ref: 36, statut: 'mis_en_relation' }], discussions: [], discussionsConfirmees: true }).actifs, 0);
});

test('cas 76 : validation avec dispense et pause conservée sont affichées indépendamment', () => {
  const base = { users: [{ id: MEMBRE.id }], profils: [], inscriptions: [], soirees: [], fiches: [], annonces: [{ id: 'a', ref: 76, user_id: MEMBRE.id, status: 'publiee', pause_at: '2026-11-23T22:19:00Z', photos_moderation: { dispense: true } }] };
  const [c] = assembler(base);
  assert.equal(c.etat, 'pause'); assert.equal(c.validation_etat, 'valide'); assert.equal(c.en_pause, true);
  const [f] = assembler({ ...base, annonces: [], fiches: [{ ref: 5200, user_id: MEMBRE.id, confirme_at: 'x', pause_at: 'x' }] });
  assert.equal(f.etat, 'pause'); assert.equal(f.validation_etat, 'valide');
  assert.ok(!listeACompleter(base.annonces[0], []).includes('photos'));
  assert.ok(listeACompleter({ ...base.annonces[0], photos_moderation: null }, []).includes('photos'));
});

const uiSource = (await readFile(new URL('../public/completer-profil.js', import.meta.url), 'utf8')).replace("import { O, lib } from '/assets/matching-options.mjs';", 'const O = {}, lib = x => x;');
const ui = await import('data:text/javascript;base64,' + Buffer.from(uiSource).toString('base64'));
const photosUi = await import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL('../public/moderation-photos.js', import.meta.url), 'utf8')).toString('base64'));
test('les cartes ne marquent pas « bloqué » une dispense ou des photos dont le chargement a échoué', () => {
  const a = { ref: 76, status: 'publiee', nb_photos: 0, medias: [], photos_moderation: { dispense: true } };
  assert.equal(ui.carteValider({ annonces: [a] }), '');
  assert.equal(ui.carteValider({ annonces: [{ ...a, photos_moderation: null, nb_photos: 2, medias_indisponibles: true }] }), '');
  assert.equal(photosUi.rendreAjoutPhotos({ ...a, nb_photos: 2 }), '');
  assert.equal(photosUi.rendreAjoutPhotos({ ...a, nb_photos: null, medias_indisponibles: true }), '');
  assert.match(photosUi.rendreModerationPhotos({ ...a, medias_indisponibles: true }), /ne peuvent pas être chargées/);
  assert.match(ui.cartePause({ annonces: [{ ...a, pause_at: 'x' }] }), /data-reprendre-profil="76"/);
  assert.doesNotMatch(ui.cartePause({ annonces: [{ ...a, pause_at: 'x', bloque_at: 'x' }] }), /data-reprendre-profil/);
});

function mondeReprise({ fiche = false, panne = false } = {}) {
  const annonces = [{ id: 'a', ref: 76, user_id: MEMBRE.id, fiche_ref: 5224, status: 'publiee', pause_at: 'x', photos_moderation: { dispense: true } }];
  const fiches = [{ ref: 5224, user_id: MEMBRE.id, visible: true, confirme_at: 'x', pause_at: 'x' }];
  const ecritures = [], journal = [];
  const lignes = (path) => {
    const u = new URL(path, 'https://recette.invalid'), rows = u.pathname.endsWith('/annonces') ? annonces : fiches;
    return rows.filter((r) => [...u.searchParams].every(([k, v]) => ['select', 'limit'].includes(k) || v === 'is.null' ? ['select', 'limit'].includes(k) || r[k] == null : v.startsWith('eq.') ? String(r[k]) === v.slice(3) : false));
  };
  const ctx = { admin: true, user: ADMIN, read: async (p) => structuredClone(lignes(p)), call: async (p, opt) => { ecritures.push(p); if (panne) return Response.json({}, { status: 503 }); const rows = lignes(p); rows.forEach((r) => Object.assign(r, JSON.parse(opt.body))); return Response.json(rows); }, journal: async (ref) => journal.push(ref) };
  const go = async (extra = {}) => { const r = await reprendreRencontres({ ref: fiche ? 5224 : 76 }, { ...ctx, ...extra }); return { status: r.status, ...await r.json() }; };
  return { annonces, fiches, ecritures, journal, go };
}

test('la reprise explicite est réservée à une véritable administratrice, avant toute lecture', async () => {
  const w = mondeReprise();
  for (const user of [null, MEMBRE, { ...MEMBRE, user_metadata: { role: 'admin' } }]) assert.equal((await w.go({ user, read: () => { throw new Error('lecture interdite'); } })).status, 403);
  assert.equal(w.ecritures.length, 0);
});
test('reprise explicite : annonce et fiche reliée reprennent, sans changer les droits ni envoyer d’email', async () => {
  for (const fiche of [false, true]) {
    const w = mondeReprise({ fiche }); assert.equal((await w.go()).status, 200);
    assert.equal(w.annonces[0].pause_at, null); assert.equal(w.fiches[0].pause_at, null);
    assert.equal(w.annonces[0].photos_moderation.dispense, true); assert.equal(w.annonces[0].status, 'publiee');
    assert.equal((await w.go()).deja, true); assert.equal(w.journal.length, 1);
  }
});
test('la reprise ne contourne ni suspension, ni refus de photos, ni retrait', async () => {
  for (const maj of [{ status: 'a_verifier' }, { bloque_at: 'x' }, { photos_refusees_at: 'x' }]) {
    const w = mondeReprise(); Object.assign(w.annonces[0], maj); assert.equal((await w.go()).status, 409); assert.equal(w.ecritures.length, 0);
  }
  for (const maj of [{ retire_at: 'x' }, { visible: false }, { confirme_at: null }]) {
    const w = mondeReprise({ fiche: true }); Object.assign(w.fiches[0], maj); assert.equal((await w.go()).status, 409); assert.equal(w.ecritures.length, 0);
  }
});
test('une panne d’écriture ne renvoie jamais une fausse confirmation de reprise', async () => {
  const w = mondeReprise({ panne: true }); assert.equal((await w.go()).status, 502); assert.equal(w.annonces[0].pause_at, 'x'); assert.equal(w.journal.length, 0);
});

test('détail admin : deux photos enregistrées restent comptées si les liens privés ne se chargent pas', async () => {
  const a = { id: 'a', ref: 306, user_id: null, status: 'publiee', pause_at: 'x', photos_moderation: { dispense: true } };
  const read = async (p) => p.startsWith('/rest/v1/annonces?ref=eq.306') ? [a] : p.startsWith('/rest/v1/annonce_files?annonce_id=in.') ? [1, 2].map((position) => ({ annonce_id: 'a', id: 'p' + position, kind: 'photo', position, storage_path: 'fictif/' + position })) : [];
  const r = await handleAnnonces('annonce_profil_detail', { ref: 306 }, { env: {}, admin: true, user: ADMIN, read, call: async () => Response.json({}, { status: 503 }), now: () => maintenant });
  const d = await r.json(); assert.equal(r.status, 200); assert.equal(d.annonces[0].nb_photos, 2); assert.equal(d.annonces[0].medias.length, 0); assert.equal(d.annonces[0].medias_indisponibles, true); assert.equal(d.annonces[0].pause_at, 'x');
});

test('une panne Auth n’est pas présentée comme une fiche inexistante ou une personne sans activité', async () => {
  const ctx = { env: {}, admin: true, user: ADMIN, read: async () => [], call: async () => { throw new Error('Auth temporairement indisponible'); }, now: () => maintenant };
  await assert.rejects(handleAnnonces('annonce_profil_detail', { user_id: MEMBRE.id }, ctx), /Auth temporairement indisponible/);
});

test('API Mon espace : les attentes des deux côtés sont visibles, les discussions terminées ne deviennent pas des matchs actifs', async () => {
  const a = { id: 'a', ref: 306, user_id: MEMBRE.id, email: MEMBRE.email, status: 'publiee', genre: 'femme', matching: {}, en_match: false };
  const donnees = {
    annonces: [a], profils_outil: [],
    annonce_files: [{ annonce_id: 'a', kind: 'photo' }, { annonce_id: 'a', kind: 'photo' }],
    discussions: [{ id: 'd', interet_id: 'ancien', a_user: MEMBRE.id, a_ref: 306, b_ref: 40, ferme_at: '2026-11-20T00:00:00Z', close_raison: null }],
    annonce_interets: [
      { id: 'reserve', demandeur_id: 'a', cible_ref: 36, statut: 'en_reserve', reciproque: true, reponse: null },
      { id: 'sans-reponse', demandeur_id: 'a', cible_ref: 37, statut: 'a_traiter', reciproque: false, reponse: null },
      { id: 'ancien', demandeur_id: 'a', cible_ref: 40, statut: 'mis_en_relation', reciproque: true },
      { id: 'recu', demandeur_id: 'b', cible_ref: 306, statut: 'en_reserve', reciproque: true, annonces: { ref: 38, user_id: 'autre' } },
    ],
  };
  const read = async (path) => {
    const u = new URL(path, 'https://recette.invalid'), table = u.pathname.split('/').at(-1);
    let l = donnees[table] || [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit'].includes(k)) continue;
      if (k === 'or') { if (table === 'annonces') l = l.filter((x) => x.user_id === MEMBRE.id); continue; }
      if (v.startsWith('eq.')) l = l.filter((x) => String(x[k]) === v.slice(3));
      else if (v.startsWith('in.(')) l = l.filter((x) => v.slice(4, -1).split(',').includes(String(x[k])));
      else if (v === 'is.null') l = l.filter((x) => x[k] == null);
    }
    return structuredClone(l);
  };
  const r = await handleAnnonces('annonce_mon_profil', { discret: true }, { env: {}, admin: false, user: MEMBRE, read, call: async () => Response.json([]), patch: async () => ({}), insert: async () => ({}), formuleDe: async () => 'decouverte', now: () => maintenant });
  assert.equal(r.status, 200);
  const { profil: p } = await r.json();
  assert.equal(p.matchs.actifs, 0); assert.equal(p.matchs.en_attente, 2);
  assert.equal(p.interets.find((i) => i.cible_ref === 36).reciproque, true);
  assert.equal(p.interets.find((i) => i.cible_ref === 40).etat_affiche.code, 'termine');
  assert.equal(p.matchs_lies.length, 0);
  assert.equal(p.suivi.mises_total, 1);
});
