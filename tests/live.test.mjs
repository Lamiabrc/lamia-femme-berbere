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
