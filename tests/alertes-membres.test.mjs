/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';

// Chaque alerte envoyée à un membre est notée : par quel canal, et vue quand il ouvre son espace.
function monde({ emailOk = true } = {}) {
  const db = { achats_unite: [], alertes_membres: [] }, mails = [];
  const ok = (x) => ({ ok: true, json: async () => x });
  const ID = '11111111-2222-3333-4444-555555555555';
  const call = async (u) => (u.includes(`/auth/v1/admin/users/${ID}`) ? ok({ id: ID, email: 'said@x.fr', user_metadata: { first_name: 'Said' } }) : ok([]));
  const read = async (u) => (u.includes('alertes_membres') ? db.alertes_membres : []);
  const insert = async (t, row) => { (db[t] ||= []).push({ id: String(db[t].length + 1), created_at: '2026-11-09T14:45:00Z', ...row }); return row; };
  const patch = async (t, filtre, v) => { for (const r of db[t] || []) if (filtre.includes(`user_id=eq.${r.user_id}`) && !r.vu_at) Object.assign(r, v); return { ok: true }; };
  const ctx = (admin, user = null) => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert, patch, admin, user, ipHash: 'ip', now: () => new Date('2026-11-09T15:00:00Z'), email: async (...a) => { mails.push(a); return emailOk; }, alerter: async () => {} });
  return { db, mails, ID, ctx };
}
const go = async (action, b, c) => (await handleAnnonces(action, b, c)).json();

test('un cadeau de Lamia prévient le membre et laisse une trace dans le journal', async () => {
  const w = monde();
  assert.equal((await go('annonce_offrir', { user_id: w.ID, quoi: 'coaching' }, w.ctx(true))).ok, true);
  assert.equal(w.mails.length, 1);
  const [a] = w.db.alertes_membres;
  assert.match(a.titre, /Lamia t’offre/); assert.equal(a.email_envoye, true); assert.equal(a.notifications, 0); assert.equal(a.vu_at, undefined);
  // Lamia voit l'alerte ; un membre, non.
  const l = await go('annonce_alertes', {}, w.ctx(true));
  assert.equal(l.actif, true); assert.equal(l.alertes.length, 1);
  assert.equal((await handleAnnonces('annonce_alertes', {}, w.ctx(false))).status, 403);
  // Le membre ouvre son espace : l'alerte passe « vue ».
  await go('annonce_mon_profil', {}, w.ctx(false, { id: w.ID, email: 'said@x.fr' }));
  assert.equal(w.db.alertes_membres[0].vu_at, '2026-11-09T15:00:00.000Z');
});
test('un email qui ne part pas est noté comme non reçu', async () => {
  const w = monde({ emailOk: false });
  await go('annonce_offrir', { user_id: w.ID, quoi: 'coaching' }, w.ctx(true));
  assert.equal(w.db.alertes_membres[0].email_envoye, false);
});

test('Lamia voit les cadeaux pas encore utilisés et peut relancer la personne', async () => {
  const w = monde();
  await go('annonce_offrir', { user_id: w.ID, quoi: 'coaching' }, w.ctx(true));
  w.db.achats_unite[0].id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const ctx = w.ctx(true); const lire = ctx.read;
  ctx.read = async (u) => (u.includes('achats_unite') ? w.db.achats_unite : lire(u));
  const l = await go('annonce_alertes', {}, ctx);
  assert.deepEqual(l.cadeaux.map((c) => [c.prenom, c.quoi]), [['Said', 'une visio de coaching']]);
  assert.equal((await handleAnnonces('annonce_cadeau_relancer', { id: l.cadeaux[0].id }, w.ctx(false))).status, 403);
  assert.equal((await go('annonce_cadeau_relancer', { id: l.cadeaux[0].id }, ctx)).ok, true);
  assert.equal(w.mails.length, 2); assert.match(w.db.alertes_membres[1].titre, /Lamia t’a offert une visio de coaching/);
});
