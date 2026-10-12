import test from 'node:test';
import assert from 'node:assert/strict';
import { registerForEvent, ageOn } from '../lib/event-register.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const EV = 'f66f3c27-c03d-43cb-976a-49c65ec415a7';
const UID = '11111111-2222-3333-4444-555555555555';
const now = () => new Date('2026-10-12T10:00:00Z');
const event = { id: EV, title: 'Bal masqué', starts_at: '2026-10-31T20:00:00Z', capacity: 30, ticket_price_cents: 0, status: 'published', min_age: null, max_age: null };

function fake({ ev = event, exists = false, confirmed = true, taken = 0, mine = [], profile = [] } = {}) {
  const calls = [];
  const ok = (b, extra = {}) => ({ ok: true, status: 200, json: async () => b, headers: new Headers(extra) });
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('speed_dating_events?')) return ok(ev ? [ev] : []);
    if (url.endsWith('/auth/v1/admin/users') && init.method === 'POST') return exists ? { ok: false, status: 422, json: async () => ({}) } : ok({ id: UID });
    if (url.endsWith('/auth/v1/admin/generate_link')) return ok({ user: { id: UID, email_confirmed_at: confirmed ? 'x' : null } });
    if (url.includes(`/auth/v1/admin/users/${UID}`)) return ok({});
    if (url.includes('event_registrations?event_id') && url.includes('user_id=eq') && !init.method) return ok(mine);
    if (url.includes('event_registrations?event_id') && url.includes('neq.cancelled')) return ok([], { 'content-range': `0-0/${taken}` });
    if (url.includes('member_profiles?user_id') && !init.method) return ok(profile);
    if (init.method === 'POST' || init.method === 'PATCH') return ok(null);
    throw new Error('inattendu ' + url);
  };
  return { fetcher, calls };
}
const req = (b) => new Request('https://x/api/event-register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const base = { event_id: EV, email: 'Nadia@Exemple.fr', first_name: 'Nadia', gender: 'femme', birth_date: '1990-05-04', city: 'Lyon', rules_accepted: true };

test('âge calculé au jour de la soirée', () => {
  assert.equal(ageOn('1990-11-01', '2026-10-31T20:00:00Z'), 35);
  assert.equal(ageOn('1990-10-31', '2026-10-31T20:00:00Z'), 36);
});

test('nouvelle personne : compte confirmé, profil, place', async () => {
  const { fetcher, calls } = fake();
  const r = await registerForEvent(req(base), { env, fetcher, now });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'registered');
  const user = calls.find((c) => c.url.endsWith('/admin/users'));
  assert.equal(user.body.email, 'nadia@exemple.fr');
  assert.equal(user.body.email_confirm, true);
  const prof = calls.find((c) => c.url.endsWith('/member_profiles') && c.method === 'POST');
  assert.equal(prof.body.gender, 'femme');
  const reg = calls.find((c) => c.url.includes('event_registrations?on_conflict'));
  assert.deepEqual([reg.body.user_id, reg.body.payment_status], [UID, 'waived']);
});

test('compte existant non confirmé : retrouvé et confirmé, profil non écrasé', async () => {
  const { fetcher, calls } = fake({ exists: true, confirmed: false, profile: [{ user_id: UID, display_name: 'Nana', gender: 'femme' }] });
  const r = await registerForEvent(req(base), { env, fetcher, now });
  assert.equal(r.status, 200);
  assert.ok(calls.some((c) => c.method === 'PUT' && c.body.email_confirm === true));
  const patch = calls.find((c) => c.url.includes('member_profiles?user_id') && c.method === 'PATCH');
  assert.equal(patch.body.display_name, undefined);
  assert.equal(patch.body.city, 'Lyon');
});

test('déjà inscrite : pas de doublon', async () => {
  const { fetcher, calls } = fake({ exists: true, mine: [{ attendance_status: 'registered' }] });
  const r = await registerForEvent(req(base), { env, fetcher, now });
  assert.equal((await r.json()).status, 'registered');
  assert.ok(!calls.some((c) => c.url.includes('on_conflict')));
});

test('refus : complet, payante, mineure, règles, robot', async () => {
  let r = await registerForEvent(req(base), { env, fetcher: fake({ taken: 30 }).fetcher, now });
  assert.equal((await r.json()).error, 'event_full');
  r = await registerForEvent(req(base), { env, fetcher: fake({ ev: { ...event, ticket_price_cents: 1200 } }).fetcher, now });
  assert.equal((await r.json()).error, 'paid_event');
  r = await registerForEvent(req({ ...base, birth_date: '2010-01-01' }), { env, fetcher: fake().fetcher, now });
  assert.equal((await r.json()).error, 'too_young');
  r = await registerForEvent(req({ ...base, rules_accepted: false }), { env, fetcher: fake().fetcher, now });
  assert.equal((await r.json()).error, 'rules_required');
  const bot = fake();
  r = await registerForEvent(req({ ...base, website: 'spam' }), { env, fetcher: bot.fetcher, now });
  assert.equal(r.status, 200);
  assert.equal(bot.calls.length, 0);
});
