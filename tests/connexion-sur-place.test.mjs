import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { userFromRequest, DATABASE_URL, _viderClesPourTests } from '../lib/event-tickets.mjs';

// Vérification du jeton sur place (14 nov. 2026) : moins d'appels à Supabase aux heures de pointe.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig' };
const autre = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jeton = (claims = {}, { cle = privateKey, kid = 'k1' } = {}) => {
  const h = b64({ alg: 'ES256', kid, typ: 'JWT' });
  const p = b64({ sub: 'u-1', email: 'nina@example.com', aud: 'authenticated', role: 'authenticated', iss: `${DATABASE_URL}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600, app_metadata: { role: 'admin' }, user_metadata: { email_verified: true, first_name: 'Nina' }, ...claims });
  const s = sign('sha256', Buffer.from(`${h}.${p}`), { key: cle, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${h}.${p}.${s}`;
};
const demande = (t) => new Request('https://x/api', { headers: { authorization: `Bearer ${t}` } });
const espion = () => {
  const appels = [];
  const fetcher = async (u) => {
    appels.push(u);
    if (u.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
    return Response.json({ id: 'u-reseau', email: 'reseau@example.com', email_confirmed_at: '2026-01-01' });
  };
  return { appels, fetcher };
};

test('jeton valide : utilisateur reconnu sans demander à Supabase qui est connecté', async () => {
  _viderClesPourTests();
  const { appels, fetcher } = espion();
  const u = await userFromRequest(demande(jeton()), { fetcher });
  assert.equal(u.id, 'u-1');
  assert.equal(u.email, 'nina@example.com');
  assert.equal(u.app_metadata.role, 'admin');
  assert.ok(u.email_confirmed_at);
  await userFromRequest(demande(jeton()), { fetcher });
  assert.deepEqual(appels.filter((x) => x.endsWith('/auth/v1/user')), []);
  assert.equal(appels.length, 1); // les clés ne sont lues qu'une fois
});

test('jeton expiré, mauvaise signature ou mauvais émetteur : refusé', async () => {
  _viderClesPourTests();
  const { fetcher } = espion();
  assert.equal(await userFromRequest(demande(jeton({ exp: Math.floor(Date.now() / 1000) - 60 })), { fetcher }), null);
  assert.equal(await userFromRequest(demande(jeton({}, { cle: autre })), { fetcher }), null);
  assert.equal(await userFromRequest(demande(jeton({ iss: 'https://ailleurs/auth/v1' })), { fetcher }), null);
  assert.equal(await userFromRequest(demande(jeton({ role: 'anon' })), { fetcher }), null);
});

test('email pas marqué vérifié ou clé inconnue : on demande à Supabase', async () => {
  _viderClesPourTests();
  const { appels, fetcher } = espion();
  assert.equal((await userFromRequest(demande(jeton({ user_metadata: {} })), { fetcher })).id, 'u-reseau');
  assert.equal((await userFromRequest(demande(jeton({}, { kid: 'inconnue' })), { fetcher })).id, 'u-reseau');
  assert.equal(appels.filter((x) => x.endsWith('/auth/v1/user')).length, 2);
});
