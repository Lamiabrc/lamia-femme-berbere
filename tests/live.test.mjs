import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHash, randomBytes } from 'node:crypto';
import { backend } from './fake-confidences.mjs';
import { handleConfidences } from '../lib/confidences.mjs';
import { etatPublic } from '../lib/live.mjs';
import { b64u, genererClesVapid } from '../lib/webpush.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const CLE = 'cle-de-liaison-de-loutil-de-lamia-0123456789';
const nadia = { id: 'nadia', email: 'nadia@exemple.fr', email_confirmed_at: '2026', app_metadata: {} };
const req = (b, token) => new Request('https://x/api/confidences', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(b) });
const appel = async (be, b, token, now) => { const r = await handleConfidences(req(b, token), { env, fetcher: be.fetcher, ...(now ? { now: () => now } : {}) }); return { status: r.status, body: await r.json() }; };

function monde() {
  const be = backend({ users: { tn: nadia, tl: { id: 'lamia', email: 'lamia@exemple.fr', email_confirmed_at: '2026', app_metadata: { role: 'admin' } } } });
  Object.assign(be.db, { live_questions: [], nouveautes: [], member_profiles: [{ user_id: 'nadia', display_name: 'Nadia' }] });
  be.db.platform_settings.push({ key: 'outil_liaison', value: { hash: createHash('sha256').update(CLE).digest('hex') } }, { key: 'vapid', value: genererClesVapid() });
  const ua = createECDH('prime256v1'); ua.generateKeys();
  be.db.push_subscriptions.push({ id: 's1', user_id: 'nadia', pour: 'membre', endpoint: 'https://push.example/nadia', p256dh: b64u(ua.getPublicKey()), auth: b64u(randomBytes(16)) });
  return be;
}

test('live fermé : rien à afficher, pas de question possible', async () => {
  const be = monde();
  const e = await appel(be, { action: 'live_etat' });
  assert.equal(e.body.actif, false);
  const q = await appel(be, { action: 'live_question', texte: 'Une question' }, 'tn');
  assert.equal(q.status, 409);
});

test('la console ouvre le live avec la clé de l’outil ; une mauvaise clé est refusée', async () => {
  const be = monde();
  assert.equal((await appel(be, { action: 'live_outil_ouvrir', cle: 'x'.repeat(40) })).status, 403);
  const o = await appel(be, { action: 'live_outil_ouvrir', cle: CLE, titre: 'Divorce avant 3 ans' });
  assert.equal(o.body.actif, true);
  assert.equal(be.db.nouveautes.length, 1);
  assert.equal(be.db.nouveautes[0].type, 'live');
  assert.equal(be.db.nouveautes[0].lien, '/salon/#en-direct');
  assert.equal(o.body.envoyes, 1); // le téléphone de Nadia est prévenu
  // Rouvrir le même soir ne renvoie pas de notification.
  const bis = await appel(be, { action: 'live_outil_ouvrir', cle: CLE });
  assert.equal(bis.body.deja, true);
  assert.equal(be.db.nouveautes.length, 1);
});

test('poser une question : compte obligatoire, 3 au plus, visible seulement par Lamia', async () => {
  const be = monde();
  await appel(be, { action: 'live_outil_ouvrir', cle: CLE, notifier: false });
  assert.equal((await appel(be, { action: 'live_question', texte: 'Sans compte ?' })).status, 401);
  assert.equal((await appel(be, { action: 'live_question', texte: 'ok' }, 'tn')).status, 400);
  for (let i = 1; i <= 3; i++) assert.equal((await appel(be, { action: 'live_question', texte: `Question numéro ${i}` }, 'tn')).status, 200);
  assert.equal((await appel(be, { action: 'live_question', texte: 'Question numéro 4' }, 'tn')).status, 429);
  const e = await appel(be, { action: 'live_etat' }, 'tn');
  assert.equal(e.body.mes_questions.length, 3);
  assert.equal(be.db.live_questions[0].prenom, 'Nadia');
  // Le public (sans clé) ne lit pas les questions.
  assert.equal((await appel(be, { action: 'live_outil_questions' })).status, 403);
  const l = await appel(be, { action: 'live_outil_questions', cle: CLE });
  assert.equal(l.body.questions.length, 3);
});

test('Lamia lit une question : elle passe « choisie » et la personne est prévenue', async () => {
  const be = monde();
  await appel(be, { action: 'live_outil_ouvrir', cle: CLE, notifier: false });
  await appel(be, { action: 'live_question', texte: 'Il veut vivre chez sa mère' }, 'tn');
  const id = be.db.live_questions[0].id;
  const avant = be.pushes.length;
  const s = await appel(be, { action: 'live_outil_statut', cle: CLE, id, statut: 'choisie' });
  assert.equal(s.body.prevenu, 1);
  assert.equal(be.pushes.length, avant + 1);
  assert.equal(be.db.live_questions[0].statut, 'choisie');
  assert.equal((await appel(be, { action: 'live_outil_statut', cle: CLE, id, statut: 'n_importe' })).status, 400);
  await appel(be, { action: 'live_outil_statut', cle: CLE, id, statut: 'repondue' });
  assert.equal(be.db.live_questions[0].statut, 'repondue');
});

test('fermer le live ; un live oublié se ferme seul au bout de 5 heures', async () => {
  const be = monde();
  await appel(be, { action: 'live_outil_ouvrir', cle: CLE, notifier: false });
  await appel(be, { action: 'live_outil_fermer', cle: CLE });
  assert.equal((await appel(be, { action: 'live_etat' })).body.actif, false);
  const t0 = new Date('2026-11-12T19:00:00Z');
  assert.equal(etatPublic({ actif: true, debut: t0.toISOString() }, new Date('2026-11-12T21:00:00Z')).actif, true);
  assert.equal(etatPublic({ actif: true, debut: t0.toISOString() }, new Date('2026-11-13T01:00:00Z')).actif, false);
});

// ---------------------------------------------------------------- l'annonce du soir
function mondeAnnonces() {
  const be = monde();
  const base = { status: 'publiee', test: false, bloque_at: null, pause_at: null, anonyme_ok: true, en_match: false, pays: 'France', situation: 'Divorce(e)', recherche: 'Une femme sérieuse.', avant_jusqu_a: null, user_id: null };
  const long = 'Je suis une personne qui aime les choses claires et la confiance.';
  Object.assign(be.db, {
    annonces: [
      { ...base, id: 'a1', ref: 10, genre: 'femme', birth_date: '1990-05-01', profil: long, email: 'libre@exemple.fr', published_at: '2026-10-01T10:00:00Z' },
      { ...base, id: 'a2', ref: 32, genre: 'homme', birth_date: '1993-01-01', profil: long, email: 'Prestige@exemple.fr', published_at: '2026-10-31T10:00:00Z', user_id: 'u32' },
      { ...base, id: 'a3', ref: 72, genre: 'homme', birth_date: '1978-01-01', profil: `${long} Appelle-moi au 06 12 34 56 78.`, email: 'passion@exemple.fr', published_at: '2026-11-02T10:00:00Z' },
      { ...base, id: 'a4', ref: 29, genre: 'homme', birth_date: '1969-01-01', profil: 'Sérieux, honnête.', email: 'court@exemple.fr', published_at: '2026-10-31T10:00:00Z' },
      { ...base, id: 'a5', ref: 50, genre: 'femme', birth_date: '1991-01-01', profil: long, email: 'pause@exemple.fr', published_at: '2026-10-02T10:00:00Z', pause_at: '2026-11-01T00:00:00Z' },
      { ...base, id: 'a6', ref: 51, genre: 'femme', birth_date: '1991-01-01', profil: long, email: 'refus@exemple.fr', published_at: '2026-10-02T10:00:00Z', anonyme_ok: false },
      { ...base, id: 'a7', ref: 52, genre: 'femme', birth_date: '1991-01-01', profil: long, email: 'sansphoto@exemple.fr', published_at: '2026-10-02T10:00:00Z' },
      { ...base, id: 'a8', ref: 53, genre: 'homme', birth_date: '1991-01-01', profil: long, email: 'priorite@exemple.fr', published_at: '2026-11-05T10:00:00Z' },
    ],
    annonce_files: ['a1', 'a2', 'a2', 'a3', 'a4', 'a5', 'a6', 'a8'].map((id, k) => ({ id: `f${k}`, annonce_id: id, kind: 'photo' })).concat([{ id: 'fi', annonce_id: 'a7', kind: 'identite' }]),
    abonnements: [{ email: 'prestige@exemple.fr', formule: 'prestige', statut: 'actif' }, { email: 'passion@exemple.fr', formule: 'passion', statut: 'actif' }, { email: 'court@exemple.fr', formule: 'passion', statut: 'actif' }, { email: 'libre@exemple.fr', formule: 'passion', statut: 'resilie' }],
    formules_offertes: [],
    achats_unite: [{ email: 'priorite@exemple.fr', type: 'live_priorite', quantite: 1, utilisees: 0 }],
    profils_outil: [{ ref: 5000, user_id: 'u32', avant_jusqu_a: null }],
  });
  return be;
}

test('annonce du soir : les formules d’abord, jamais un profil en pause, sans photo ou qui refuse l’anonymat', async () => {
  const be = mondeAnnonces();
  assert.equal((await appel(be, { action: 'live_outil_annonces', cle: 'mauvaise-cle-mais-assez-longue-pour-etre-lue-0000' })).status, 403);
  const r = await appel(be, { action: 'live_outil_annonces', cle: CLE });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.candidats.map((c) => c.ref), [32, 72, 53, 10]);
  assert.deepEqual(r.body.candidats.map((c) => c.formule), ['prestige', 'passion', 'priorite', '']);
  assert.deepEqual(r.body.a_completer.map((c) => c.ref), [29], 'une formule mais un texte trop court : à compléter');
  const p72 = r.body.candidats.find((c) => c.ref === 72);
  assert.doesNotMatch(p72.profil, /06 12/, 'aucun numéro ne sort du site');
  assert.equal(r.body.candidats[0].email, undefined, 'jamais d’adresse email dans la console');
  assert.equal(r.body.annonce, null);
});

test('annonce du soir : choisir, retravailler le texte, la montrer la fait passer derrière', async () => {
  const be = mondeAnnonces();
  assert.equal((await appel(be, { action: 'live_outil_annonce_choisir', cle: CLE, ref: 51 })).status, 409, 'elle a refusé l’affichage anonyme');
  assert.equal((await appel(be, { action: 'live_outil_annonce_choisir', cle: CLE, ref: 'x' })).status, 400);
  const c = await appel(be, { action: 'live_outil_annonce_choisir', cle: CLE, ref: 32, titre: 'Clair, droit, il sait ce qu’il veut', texte: 'Un homme de 33 ans   qui aime les choses claires.' });
  assert.equal(c.body.annonce.ref, 32);
  assert.equal(c.body.annonce.texte, 'Un homme de 33 ans qui aime les choses claires.');
  // Un simple « à l'écran » ne perd pas le texte déjà enregistré.
  await appel(be, { action: 'live_outil_annonce_choisir', cle: CLE, ref: 32, ecran: true });
  be.db.platform_settings.push({ key: 'live_claude', value: { notes: [{ at: '2026-11-12T19:10:00Z', texte: 'Le public demande son métier.' }] } });
  const r = await appel(be, { action: 'live_outil_annonces', cle: CLE });
  assert.equal(r.body.annonce.titre, 'Clair, droit, il sait ce qu’il veut');
  assert.equal(r.body.annonce.fiche.ref, 32);
  assert.equal(r.body.annonce.fiche.formule, 'prestige');
  assert.deepEqual(r.body.candidats.map((c2) => c2.ref), [72, 53, 10, 32], 'déjà passée : elle laisse la place aux suivantes');
  assert.equal(r.body.notes[0].texte, 'Le public demande son métier.');
  assert.equal((await appel(be, { action: 'live_outil_annonce_choisir', cle: CLE, ref: null })).body.annonce, null);
  assert.equal((await appel(be, { action: 'live_outil_annonces', cle: CLE })).body.annonce, null);
});

test('annonce du soir : mise en avant 7 jours sur le site, sans rallonge au second clic', async () => {
  const be = mondeAnnonces();
  const quand = new Date('2026-11-12T19:30:00Z');
  const r = await appel(be, { action: 'live_outil_annonce_avant', cle: CLE, ref: 32 }, null, quand);
  assert.equal(r.body.jusqu_a, '2026-11-19T19:30:00.000Z');
  assert.equal(be.db.annonces.find((a) => a.ref === 32).avant_jusqu_a, '2026-11-19T19:30:00.000Z');
  assert.equal(be.db.profils_outil[0].avant_jusqu_a, '2026-11-19T19:30:00.000Z', 'sa fiche de l’outil suit');
  const bis = await appel(be, { action: 'live_outil_annonce_avant', cle: CLE, ref: 32 }, null, new Date('2026-11-12T20:10:00Z'));
  assert.equal(bis.body.deja, true);
  assert.equal(bis.body.jusqu_a, '2026-11-19T19:30:00.000Z');
  assert.equal((await appel(be, { action: 'live_outil_annonce_avant', cle: CLE, ref: 999 })).status, 404);
  assert.equal((await appel(be, { action: 'live_outil_annonce_avant', cle: 'mauvaise-cle-mais-assez-longue-pour-etre-lue-0000', ref: 32 })).status, 403);
});

// ---------------------------------------------------------------- les erreurs remontées par l'appli
test('erreurs de l’appli : remontées sans compte ou avec, lues seulement par la console, avec le numéro du profil', async () => {
  const be = monde();
  Object.assign(be.db, { erreurs_appli: [], annonces: [{ id: 'a1', ref: 41, prenom: 'Nadia', status: 'publiee', user_id: 'nadia' }] });
  assert.equal((await appel(be, { action: 'live_erreur', message: '' })).status, 400);
  assert.equal((await appel(be, { action: 'live_erreur', type: 'appel', message: 'temporary_failure', appel: '/api/confidences/ · interet', statut: 502, page: '/rencontres/swipe/', appareil: 'Android 14', version: '9f1c' }, 'tn')).status, 200);
  assert.equal((await appel(be, { action: 'live_erreur', type: 'nimporte', message: 'x is not defined'.padEnd(900, '!') })).status, 200);
  assert.equal(be.db.erreurs_appli.length, 2);
  assert.equal(be.db.erreurs_appli[0].user_id, 'nadia');
  assert.equal(be.db.erreurs_appli[1].user_id, null);
  assert.equal(be.db.erreurs_appli[1].type, 'page', 'un type inconnu devient « page »');
  assert.equal(be.db.erreurs_appli[1].message.length, 300);
  assert.equal((await appel(be, { action: 'live_outil_erreurs' })).status, 403, 'le public ne lit pas les erreurs');
  const l = await appel(be, { action: 'live_outil_erreurs', cle: CLE });
  assert.equal(l.body.erreurs.length, 2);
  assert.equal(l.body.non_vues, 2);
  const deNadia = l.body.erreurs.find((e) => e.connecte);
  assert.equal(deNadia.ref, 41);
  assert.equal(deNadia.prenom, 'Nadia');
  assert.equal(deNadia.statut, 502);
  assert.equal(deNadia.user_id, undefined);
  await appel(be, { action: 'live_outil_erreurs_vues', cle: CLE });
  assert.equal((await appel(be, { action: 'live_outil_erreurs', cle: CLE })).body.non_vues, 0);
});

// ---------------------------------------------------------------- « L'appli et moi » : un membre par son numéro
function mondeMembres() {
  const be = monde();
  Object.assign(be.db, { abonnements: [{ email: 'Nadia@exemple.fr', formule: 'prestige', statut: 'actif', resiliation_prevue: false, created_at: '2026-11-01' }], formules_offertes: [], erreurs_appli: [{ user_id: 'nadia', created_at: '2026-11-15T07:00:00.000Z', type: 'page', message: 'Cannot set', page: '/mon-espace/', statut: 0 }] });
  be.db.annonces.push({ ref: 173, prenom: 'Nadia', genre: 'Femme', birth_date: '1990-05-02', ville: 'Lyon', pays: 'France', status: 'publiee', email: 'nadia@exemple.fr', phone: '0600000000', user_id: 'nadia', en_match: false, bloque_at: null, pause_at: null });
  be.db.profils_outil.push({ ref: 5120, genre: 'Femme', age: 36, ville: 'Lyon', pays: 'France', user_id: 'nadia', retire_at: null, bloque_at: null, pause_at: null }, { ref: 6000, genre: 'Homme', age: 41, ville: 'Paris', pays: 'France', user_id: null, retire_at: null, bloque_at: null, pause_at: null });
  return be;
}
const maintenant = new Date('2026-11-15T08:00:00.000Z');

test('un membre par son numéro : le numéro court et le numéro long mènent à la même personne, sans email ni téléphone', async () => {
  const be = mondeMembres();
  assert.equal((await appel(be, { action: 'live_outil_membre', ref: 173 })).status, 403);
  const court = await appel(be, { action: 'live_outil_membre', cle: CLE, ref: 173 }, null, maintenant);
  assert.equal(court.status, 200);
  const m = court.body.membre;
  assert.equal(m.ref, 173); assert.equal(m.autre_ref, 5120); assert.equal(m.prenom, 'Nadia'); assert.equal(m.age, 36);
  assert.equal(m.formule, 'prestige'); assert.equal(m.telephones, 1); assert.equal(m.joignable, true); assert.equal(m.erreurs.length, 1);
  assert.ok(!JSON.stringify(court.body).includes('exemple.fr')); assert.ok(!JSON.stringify(court.body).includes('0600000000'));
  const long = await appel(be, { action: 'live_outil_membre', cle: CLE, ref: 5120 }, null, maintenant);
  assert.equal(long.body.membre.ref, 173);
  const seul = await appel(be, { action: 'live_outil_membre', cle: CLE, ref: 6000 }, null, maintenant);
  assert.equal(seul.body.membre.ref, 6000); assert.equal(seul.body.membre.joignable, false); assert.equal(seul.body.membre.formule, '');
  assert.equal((await appel(be, { action: 'live_outil_membre', cle: CLE, ref: 999 })).status, 404);
  assert.equal((await appel(be, { action: 'live_outil_membre', cle: CLE, ref: 'abc' })).status, 400);
});

test('écrire à un membre par son numéro : message dans sa conversation, bouton vers une page du site', async () => {
  const be = mondeMembres();
  assert.equal((await appel(be, { action: 'live_outil_membre_ecrire', ref: 173, texte: 'Coucou' })).status, 403);
  assert.equal((await appel(be, { action: 'live_outil_membre_ecrire', cle: CLE, ref: 173 })).status, 400);
  assert.equal((await appel(be, { action: 'live_outil_membre_ecrire', cle: CLE, ref: 173, texte: 'x', bouton: 'https://ailleurs.example' })).status, 400);
  assert.equal((await appel(be, { action: 'live_outil_membre_ecrire', cle: CLE, ref: 6000, texte: 'Coucou' })).status, 409);
  const r = await appel(be, { action: 'live_outil_membre_ecrire', cle: CLE, ref: 5120, texte: 'Je passe ton annonce ce soir.', bouton: 'abonnement' });
  assert.equal(r.status, 200); assert.equal(r.body.ref, 173);
  assert.equal(be.db.confidence_threads.length, 1); assert.equal(be.db.confidence_threads[0].email, 'nadia@exemple.fr');
  const msg = be.db.confidence_messages[0];
  assert.equal(msg.author, 'lamia'); assert.equal(msg.ready, true);
  assert.match(msg.body, /^Je passe ton annonce ce soir\.\n\nPour choisir ta formule, c’est ici : https:\/\/lamia-femme-berbere\.com\/abonnement\/$/);
});

test('offrir une formule à un membre par son numéro, puis la reprendre ; la formule d’un modérateur n’est pas retirée d’ici', async () => {
  const be = mondeMembres();
  be.db.abonnements.length = 0;
  assert.equal((await appel(be, { action: 'live_outil_membre_formule', ref: 173, formule: 'prestige' })).status, 403);
  assert.equal((await appel(be, { action: 'live_outil_membre_formule', cle: CLE, ref: 173, formule: 'or' })).status, 400);
  assert.equal((await appel(be, { action: 'live_outil_membre_formule', cle: CLE, ref: 6000, formule: 'passion' })).status, 409);
  const r = await appel(be, { action: 'live_outil_membre_formule', cle: CLE, ref: 5120, formule: 'prestige' });
  assert.equal(r.status, 200);
  assert.deepEqual(be.db.formules_offertes.map((f) => [f.email, f.formule, f.raison, f.ref]), [['nadia@exemple.fr', 'prestige', 'lamia', 173]]);
  const vue = await appel(be, { action: 'live_outil_membre', cle: CLE, ref: 173 }, null, maintenant);
  assert.equal(vue.body.membre.formule, 'prestige'); assert.equal(vue.body.membre.formule_offerte, true);
  await appel(be, { action: 'live_outil_membre_formule', cle: CLE, ref: 173, formule: 'passion' });
  assert.equal(be.db.formules_offertes.length, 1); assert.equal(be.db.formules_offertes[0].formule, 'passion');
  assert.equal((await appel(be, { action: 'live_outil_membre_formule', cle: CLE, ref: 173, formule: '' })).status, 200);
  assert.equal(be.db.formules_offertes.length, 0);
  be.db.formules_offertes.push({ email: 'nadia@exemple.fr', formule: 'passion', raison: 'moderateur', ref: 173 });
  assert.equal((await appel(be, { action: 'live_outil_membre_formule', cle: CLE, ref: 173, formule: '' })).status, 409);
  assert.equal(be.db.formules_offertes.length, 1);
});

test('le tableau de bord (Lamia connectée) fait les mêmes gestes sans la clé de l’outil ; un modérateur garde son rôle quand sa formule change', async () => {
  const be = mondeMembres();
  be.db.abonnements.length = 0;
  assert.equal((await appel(be, { action: 'live_outil_membre', ref: 173 }, 'tn')).status, 403);
  assert.equal((await appel(be, { action: 'live_outil_membre', ref: 173 }, 'tl', maintenant)).status, 200);
  assert.equal((await appel(be, { action: 'live_outil_erreurs' }, 'tl', maintenant)).status, 200);
  be.db.formules_offertes.push({ email: 'nadia@exemple.fr', formule: 'passion', raison: 'moderateur', ref: 173 });
  assert.equal((await appel(be, { action: 'live_outil_membre_formule', ref: 173, formule: 'prestige' }, 'tl')).status, 200);
  assert.deepEqual(be.db.formules_offertes.map((f) => [f.formule, f.raison]), [['prestige', 'moderateur']]);
});

test('erreurs remontées sans compte : les prénoms des membres restent lus (pas de « null » dans la liste des comptes)', async () => {
  const be = monde();
  const urls = [];
  const f = be.fetcher;
  be.fetcher = async (u, init) => { urls.push(String(u)); return f(u, init); };
  be.db.erreurs_appli = [
    { id: 'e1', user_id: null, created_at: new Date().toISOString(), type: 'appel', message: 'envoi_impossible', page: '/mon-espace/', appel: '/api/confidences · annonce_lien_connexion', statut: 502, appareil: 'x', version: 'v', vue_at: null },
    { id: 'e2', user_id: 'nadia', created_at: new Date().toISOString(), type: 'appel', message: 'temporary_failure', page: '/mon-espace/', appel: '/api/mes-achats', statut: 502, appareil: 'x', version: 'v', vue_at: null },
  ];
  const l = await appel(be, { action: 'live_outil_erreurs', cle: CLE });
  assert.equal(l.status, 200);
  const lectures = urls.filter((u) => decodeURIComponent(u).includes('user_id=in.('));
  assert.ok(lectures.length >= 2, 'les comptes sont lus');
  for (const u of lectures) {
    const liste = decodeURIComponent(u).match(/user_id=in\.\(([^)]*)\)/)[1].split(',');
    assert.deepEqual(liste, ['nadia'], `seulement de vrais comptes dans ${u}`);
  }
  assert.equal(l.body.erreurs.find((e) => e.connecte).prenom, 'Nadia');
});
