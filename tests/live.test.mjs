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
  const be = backend({ users: { tn: nadia } });
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
