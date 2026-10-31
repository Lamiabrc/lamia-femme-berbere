import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin } from '../lib/admin.mjs';
import { profilPropre, dateNaissance, assembler } from '../lib/comptes.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const post = (b) => new Request('https://x/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify(b) });
const U1 = '11111111-1111-4111-8111-111111111111';
const EV = '22222222-2222-4222-8222-222222222222';

function fake({ user = { id: 'a', app_metadata: { role: 'admin' } }, regs = [] } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });
    if (url.includes('/auth/v1/user')) return user ? ok(user) : { ok: false, status: 401, json: async () => ({}) };
    if (url.includes('/auth/v1/admin/users?')) return ok({ users: [{ id: U1, email: 'Kahina@Exemple.fr', created_at: '2026-10-31T10:00:00Z', email_confirmed_at: 'x', user_metadata: { source_inscription: 'tiktok' } }] });
    if (url.includes(`/auth/v1/admin/users/${U1}`)) return ok({ id: U1 });
    if (url.includes('/auth/v1/admin/users/')) return { ok: false, status: 404, json: async () => ({}) };
    if (url.includes('member_profiles') && method === 'GET') return ok([{ user_id: U1, real_first_name: 'Kahina', gender: 'femme', birth_date: '1976-10-16', city: 'Paris', profile_status: 'active' }]);
    if (url.includes('event_registrations') && method === 'GET') return ok([{ user_id: U1, event_id: EV, attendance_status: 'registered', payment_status: 'waived' }]);
    if (url.includes('event_registrations') && method === 'PATCH') return ok(regs);
    if (url.includes('speed_dating_events')) return ok([{ id: EV, title: 'Bal', audience: 'Grand salon · 40 ans et plus', starts_at: '2099-01-01T20:00:00Z', status: 'published', ticket_price_cents: 0 }]);
    if (url.includes('annonces')) return ok([{ ref: 12, status: 'publiee', user_id: null, email: 'kahina@exemple.fr', test: false }]);
    if (url.includes('profils_outil')) return ok([]);
    return ok([]);
  };
  return { fetcher, calls };
}

test('comptes : réservé à l’administratrice', async () => {
  const { fetcher } = fake({ user: { id: 'b', app_metadata: {} } });
  const r = await handleAdmin(post({ action: 'comptes_liste' }), { env, fetcher });
  assert.equal(r.status, 403);
});

test('comptes : la liste réunit profil, soirées et annonce (retrouvée par email)', async () => {
  const { fetcher } = fake();
  const d = await (await handleAdmin(post({ action: 'comptes_liste' }), { env, fetcher })).json();
  assert.equal(d.comptes.length, 1);
  const c = d.comptes[0];
  assert.equal(c.profil.real_first_name, 'Kahina');
  assert.equal(c.inscriptions[0].salon, 'Grand salon · 40 ans et plus');
  assert.deepEqual(c.annonces.map((a) => a.ref), [12]);
  assert.equal(c.source, 'tiktok');
  assert.equal(d.soirees.length, 1);
});

test('comptes : modifier le genre et la date de naissance, rien d’autre', async () => {
  const { fetcher, calls } = fake();
  const r = await handleAdmin(post({ action: 'comptes_modifier', user_id: U1, profil: { gender: 'homme', birth_date: '1986-07-31', user_id: 'pirate' } }), { env, fetcher });
  assert.equal(r.status, 200);
  const p = calls.find((c) => c.url.includes(`member_profiles?user_id=eq.${U1}`) && c.method === 'PATCH');
  assert.equal(p.body.gender, 'homme');
  assert.equal(p.body.birth_date, '1986-07-31');
  assert.equal(p.body.user_id, undefined);
});

test('comptes : valeurs refusées', async () => {
  assert.equal(profilPropre({ gender: 'autre' }).erreur, 'genre');
  assert.equal(profilPropre({ profile_status: 'x' }).erreur, 'statut');
  assert.equal(dateNaissance('2015-01-01').ok, false); // mineur
  assert.equal(dateNaissance('1990-02-31').ok, false); // date impossible
  assert.equal(dateNaissance('').value, null);
  const { fetcher } = fake();
  const r = await handleAdmin(post({ action: 'comptes_modifier', user_id: 'pas-un-id' }), { env, fetcher });
  assert.equal(r.status, 400);
  const inconnu = await handleAdmin(post({ action: 'comptes_modifier', user_id: '33333333-3333-4333-8333-333333333333', profil: { city: 'Paris' } }), { env, fetcher });
  assert.equal(inconnu.status, 404);
});

test('comptes : annuler une inscription existante, inscrire à une nouvelle soirée', async () => {
  const a = fake({ regs: [{ id: 'r1' }] });
  await handleAdmin(post({ action: 'comptes_inscription', user_id: U1, event_id: EV, statut: 'cancelled' }), { env, fetcher: a.fetcher });
  assert.equal(a.calls.find((c) => c.method === 'PATCH' && c.url.includes('event_registrations')).body.attendance_status, 'cancelled');
  assert.ok(!a.calls.some((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/event_registrations')));

  const b = fake({ regs: [] });
  await handleAdmin(post({ action: 'comptes_inscription', user_id: U1, event_id: EV, statut: 'registered' }), { env, fetcher: b.fetcher });
  const ins = b.calls.find((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/event_registrations'));
  assert.deepEqual(ins.body, { event_id: EV, user_id: U1, attendance_status: 'registered', payment_status: 'waived' });
});

test('comptes : assemblage sans profil', () => {
  const l = assembler({ users: [{ id: U1, email: 'a@b.fr', created_at: '2026-01-01' }], profils: [], inscriptions: [], soirees: [], annonces: [], fiches: [] });
  assert.equal(l[0].profil, null);
  assert.deepEqual(l[0].inscriptions, []);
});
