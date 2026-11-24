import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backend } from './fake-confidences.mjs';
import { handleConfidences, LECTURES_ESPACE } from '../lib/confidences.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', RESEND_API_KEY: 're_test' };
const nadia = { id: 'nadia', email: 'nadia@exemple.fr', email_confirmed_at: '2026', app_metadata: {} };
const req = (b, token) => new Request('https://x/api/confidences', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(b) });
const appel = async (be, b, token) => { const r = await handleConfidences(req(b, token), { env, fetcher: be.fetcher }); return { status: r.status, body: await r.json() }; };

test('annonce_espace : une seule demande renvoie les 9 lectures, chacune avec son statut', async () => {
  const be = backend({ users: { N: nadia } });
  const r = await appel(be, { action: 'annonce_espace' }, 'N');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.reponses).sort(), [...LECTURES_ESPACE].sort());
  for (const v of Object.values(r.body.reponses)) assert.ok(Number.isInteger(v.status));
});
test('annonce_espace : connexion obligatoire', async () => {
  const be = backend({ users: {} });
  assert.equal((await appel(be, { action: 'annonce_espace' })).status, 401);
});
test('la réponse groupée est identique à l’appel direct', async () => {
  const be = backend({ users: { N: nadia } });
  const g = (await appel(be, { action: 'annonce_espace' }, 'N')).body.reponses.annonce_mes_photos;
  const d = await appel(be, { action: 'annonce_mes_photos' }, 'N');
  assert.equal(g.status, d.status); assert.deepEqual(g.body, d.body);
});
test('côté page : le groupe part avec le profil, chaque bloc le consomme une fois, sinon vrai appel', () => {
  const s = readFileSync(new URL('../src/espace.js', import.meta.url), 'utf8');
  assert.match(s, /if \(body\.action === 'annonce_mon_profil'\) lancerGroupe\(session\)/);
  assert.match(s, /delete \(await groupe\.pret\)\[body\.action\]/);
  assert.match(s, /return appelProfilDirect\(body, session\)/);
});
