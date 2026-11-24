import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';

// Comptes validés sans email le 24 nov. 2026 (quota Resend) : confirmation envoyée à partir du 1er décembre.
function serveur({ date, delivered = true }) {
  const mails = [], majs = [];
  const users = [
    { id: 'u1', email: 'a@exemple.fr', user_metadata: { a_reconfirmer: true, first_name: 'Nina' } },
    { id: 'u2', email: 'b@exemple.fr', user_metadata: { a_reconfirmer: true, reconfirmation_envoyee_at: 'x' } },
    { id: 'u3', email: 'c@exemple.fr', user_metadata: {} },
  ];
  const ctx = {
    env: { SUPABASE_SERVICE_ROLE_KEY: 'k' }, cron: true, ipHash: 'ip', now: () => new Date(date),
    read: async () => [], insert: async () => ({}), patch: async () => ({}), alerter: async () => {},
    call: async (path, o = {}) => {
      if (path.startsWith('/auth/v1/admin/users?')) return Response.json({ users });
      if (path === '/auth/v1/admin/generate_link') return Response.json({ action_link: 'https://auth/verify?t=1' });
      if (path.startsWith('/auth/v1/admin/users/')) { majs.push({ path, body: JSON.parse(o.body) }); return Response.json({}); }
      return Response.json([]);
    },
    email: async (...a) => { mails.push(a); return delivered; },
  };
  return { mails, majs, run: () => handleAnnonces('annonce_rappels_cron', {}, ctx) };
}

test('avant le 1er décembre : aucune reconfirmation', async () => {
  const s = serveur({ date: '2026-11-30T12:00:00Z' });
  await s.run().catch(() => {});
  assert.equal(s.mails.filter((m) => /Confirme ton adresse/.test(m[1])).length, 0);
});

test('à partir du 1er décembre : seul le compte marqué et pas encore relancé reçoit le lien, puis il est noté', async () => {
  const s = serveur({ date: '2026-12-01T09:00:00Z' });
  await s.run().catch(() => {});
  const m = s.mails.filter((x) => /Confirme ton adresse/.test(x[1]));
  assert.equal(m.length, 1);
  assert.equal(m[0][0], 'a@exemple.fr');
  assert.equal(m[0][4], true);
  assert.ok(s.majs.some((x) => x.path.endsWith('/u1') && x.body.user_metadata.reconfirmation_envoyee_at));
});

test('envoi encore impossible : la marque reste pour réessayer le lendemain', async () => {
  const s = serveur({ date: '2026-12-01T09:00:00Z', delivered: false });
  await s.run().catch(() => {});
  assert.equal(s.majs.length, 0);
});
