import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';

// Fiches du live à relancer : jamais contactées d'abord, lien TikTok venu de l'outil, message email + 2 photos.
test('liste des fiches du live à relancer', async () => {
  const fiches = Array.from({ length: 25 }, (_, i) => ({ ref: 6000 + i, genre: i % 2 ? 'homme' : 'femme', age: 30, ville: 'Lyon', pays: 'France' }));
  const contacts = fiches.filter((f) => f.ref !== 6003).map((f) => ({ ref: f.ref, reseau: 'tiktok', pseudo: `p${f.ref}`, dernier_at: f.ref === 6024 ? '2026-11-20T10:00:00Z' : null }));
  const read = async (url) => (url.startsWith('/rest/v1/profils_outil') ? fiches : url.startsWith('/rest/v1/contacts_lamia') ? contacts : []);
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40), ANNONCE_SECRET: 'y'.repeat(40) };
  const opts = { env, read, call: async () => ({ ok: true }), insert: async () => [], patch: async () => [], admin: true, user: { id: 'a', email: 'admin@example.invalid' }, now: () => new Date('2026-11-26T12:00:00Z') };
  const r = await handleAnnonces('annonce_fiches_a_relancer', { page: 0 }, opts);
  const d = await r.json();
  assert.equal(d.total, 24);
  assert.equal(d.a_faire, 23);
  assert.equal(d.fiches.length, 20);
  assert.equal(d.fiches[0].ref, 6023);
  assert.ok(!d.fiches.some((f) => f.ref === 6024), 'la fiche déjà contactée est en fin de liste');
  assert.equal(d.fiches[0].lien, 'https://www.tiktok.com/@p6023');
  assert.match(d.fiches[0].message, /email et 2 photos/);
  assert.match(d.fiches[0].message, /rencontres\/confirmer\/\?n=6023/);
  const p2 = await (await handleAnnonces('annonce_fiches_a_relancer', { page: 1 }, opts)).json();
  assert.equal(p2.fiches.length, 4);
  assert.equal(p2.fiches.at(-1).ref, 6024);
});
