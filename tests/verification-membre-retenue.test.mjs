import test from 'node:test';
import assert from 'node:assert/strict';
import { userFromRequest, _viderMembresPourTests, _viderClesPourTests } from '../lib/event-tickets.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jeton = (exp, sub = 'u1') => `${b64({ alg: 'HS256' })}.${b64({ sub, exp })}.sig`;
const requete = (t) => new Request('https://x.test/', { headers: { authorization: `Bearer ${t}` } });
const dans = (s) => Math.floor(Date.now() / 1000) + s;

function faux(user) {
  let appels = 0;
  const fetcher = async (url) => {
    if (url.includes('/auth/v1/user')) { appels += 1; return user ? { ok: true, status: 200, json: async () => user } : { ok: false, status: 401, json: async () => ({}) }; }
    throw new Error(url);
  };
  return { fetcher, appels: () => appels };
}

test('membre confirmé : Supabase n’est interrogé qu’une fois tant que le jeton vit', async () => {
  _viderMembresPourTests(); _viderClesPourTests();
  const f = faux({ id: 'u1', email: 'a@b.fr' });
  const t = jeton(dans(3000));
  for (let i = 0; i < 5; i += 1) assert.equal((await userFromRequest(requete(t), { fetcher: f.fetcher }))?.id, 'u1');
  assert.equal(f.appels(), 1);
});

test('jeton expiré ou refusé : jamais retenu', async () => {
  _viderMembresPourTests(); _viderClesPourTests();
  const f = faux({ id: 'u1' });
  const vieux = jeton(dans(-10));
  await userFromRequest(requete(vieux), { fetcher: f.fetcher });
  await userFromRequest(requete(vieux), { fetcher: f.fetcher });
  assert.equal(f.appels(), 2);
  const refus = faux(null), t2 = jeton(dans(3000, 'u2'));
  assert.equal(await userFromRequest(requete(t2), { fetcher: refus.fetcher }), null);
  assert.equal(await userFromRequest(requete(t2), { fetcher: refus.fetcher }), null);
  assert.equal(refus.appels(), 2);
});

test('un autre jeton ne profite pas de la mémoire d’un membre', async () => {
  _viderMembresPourTests(); _viderClesPourTests();
  const ok = faux({ id: 'u1' });
  await userFromRequest(requete(jeton(dans(3000))), { fetcher: ok.fetcher });
  const non = faux(null);
  assert.equal(await userFromRequest(requete(jeton(dans(3000), 'intrus')), { fetcher: non.fetcher }), null);
  assert.equal(non.appels(), 1);
});
