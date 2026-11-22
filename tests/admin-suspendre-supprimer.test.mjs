import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';

// Lamia, 22 nov. 2026 : « je n'ai pas de bouton suspendre » et « je ne peux pas supprimer de compte ».
const ID = '11111111-2222-3333-4444-555555555555';
function monde({ photos = 2, abonne = false } = {}) {
  const patches = [], mails = [];
  const ok = (x) => ({ ok: true, json: async () => x });
  const read = async (u) => {
    if (u.includes('/annonces?ref=eq.77')) return [{ id: 'a77', ref: 77, user_id: ID, prenom: 'Said', genre: 'homme', email: 'said@x.fr', status: 'publiee' }];
    if (u.includes('annonce_files')) return Array.from({ length: photos }, (_, i) => ({ id: i }));
    return [];
  };
  const call = async (u) => (u.includes(`/auth/v1/admin/users/${ID}`) ? ok({ id: ID, email: 'said@x.fr', app_metadata: {} }) : ok([]));
  const patch = async (t, f, v) => { patches.push([t, f, v]); return { ok: true }; };
  const ctx = (admin) => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert: async (t, r) => r, patch, admin, user: null, ipHash: 'ip', now: () => new Date('2026-11-22T10:00:00Z'), email: async (...a) => { mails.push(a); return true; } });
  return { patches, mails, ctx };
}
const go = async (action, b, c) => handleAnnonces(action, b, c);

test('suspendre un profil : réservé à Lamia, le profil sort des rencontres et la personne est prévenue', async () => {
  const w = monde();
  assert.equal((await go('annonce_profil_suspendre', { ref: 77, suspendre: true }, w.ctx(false))).status, 403);
  const r = await (await go('annonce_profil_suspendre', { ref: 77, suspendre: true, motif: 'photo floue' }, w.ctx(true))).json();
  assert.equal(r.suspendu, true);
  assert.ok(w.patches.some(([t, , v]) => t === 'annonces' && v.status === 'a_verifier' && v.visible_anonyme === false));
});
test('remettre en ligne : refusé sans les 2 photos, accepté avec', async () => {
  const sans = monde({ photos: 1 });
  assert.equal((await go('annonce_profil_suspendre', { ref: 77, suspendre: false }, sans.ctx(true))).status, 409);
  const avec = monde({ photos: 2 });
  assert.equal((await (await go('annonce_profil_suspendre', { ref: 77, suspendre: false }, avec.ctx(true))).json()).suspendu, false);
  assert.ok(avec.patches.some(([, , v]) => v.status === 'publiee'));
});
test('supprimer un compte : Lamia seulement, avec le mot SUPPRIMER', async () => {
  const w = monde();
  assert.equal((await go('annonce_compte_supprimer', { user_id: ID, confirmation: 'SUPPRIMER' }, w.ctx(false))).status, 403);
  assert.equal((await go('annonce_compte_supprimer', { user_id: ID }, w.ctx(true))).status, 400);
});
