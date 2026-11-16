import test from 'node:test';
import assert from 'node:assert/strict';
import { reseauxActifs, prenomDuReseau, RESEAUX } from '../src/connexion-sociale.mjs';

test('seuls les réseaux activés dans Supabase sont proposés, dans l’ordre du site', () => {
  assert.deepEqual(reseauxActifs({ external: { email: true, linkedin_oidc: true, google: true, facebook: false } }).map((r) => r.id), ['google', 'linkedin_oidc']);
  assert.deepEqual(reseauxActifs({ external: { email: true, tiktok: true, instagram: true } }), []);
  assert.deepEqual(reseauxActifs(null), []);
  assert.deepEqual(reseauxActifs({}), []);
});

test('Instagram et TikTok ne sont pas proposés (pas d’email, pas gérés par Supabase)', () => {
  assert.deepEqual(RESEAUX.map((r) => r.id), ['google', 'facebook', 'linkedin_oidc']);
});

test('le prénom vient du réseau : prénom donné, sinon premier mot du nom', () => {
  assert.equal(prenomDuReseau({ given_name: 'Lamia', full_name: 'Lamia B.' }), 'Lamia');
  assert.equal(prenomDuReseau({ full_name: 'Sofiane Ait Ahmed' }), 'Sofiane');
  assert.equal(prenomDuReseau({ name: 'Yasmine' }), 'Yasmine');
  assert.equal(prenomDuReseau({}), '');
  assert.equal(prenomDuReseau(undefined), '');
  assert.ok(prenomDuReseau({ given_name: 'x'.repeat(200) }).length <= 60);
});
