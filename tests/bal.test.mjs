import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBal, pairRound, signPass, readPass } from '../lib/bal.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', DAILY_API_KEY: 'daily_fixture' };
const EV = 'f66f3c27-c03d-43cb-976a-49c65ec415a7';
const U1 = '11111111-1111-1111-1111-111111111111';
const req = (b, h = {}) => new Request('https://x/api/bal', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });

test('laissez-passer signé : valide, falsifié, expiré', () => {
  const p = signPass(env, { uid: U1, exp: Date.now() + 1000 });
  assert.equal(readPass(env, p).uid, U1);
  assert.equal(readPass(env, p.slice(0, -2) + 'xx'), null);
  assert.equal(readPass({ SUPABASE_SERVICE_ROLE_KEY: 'autre' }, p), null);
  assert.equal(readPass(env, signPass(env, { uid: U1, exp: Date.now() - 1 })), null);
});

test('tours : paires femme-homme du même salon, jamais deux fois les mêmes', () => {
  const P = (uid, g, ev = 'A') => ({ uid, gender: g, ev, name: uid });
  const present = [P('f1', 'femme'), P('f2', 'femme'), P('h1', 'homme'), P('h2', 'homme'), P('h3', 'homme'), P('f9', 'femme', 'B')];
  const r1 = pairRound(present, [], () => 0.5);
  assert.equal(r1.pairs.length, 2);
  for (const [a, b] of r1.pairs) { assert.notEqual(a.gender, b.gender); assert.equal(a.ev, b.ev); }
  assert.deepEqual(r1.waiting.map((w) => w.uid).sort(), ['f9', r1.waiting.find((w) => w.gender === 'homme').uid].sort());
  const met = r1.pairs.map(([a, b]) => [a.uid, b.uid].sort().join('|'));
  const r2 = pairRound(present, met, () => 0.3);
  for (const [a, b] of r2.pairs) assert.ok(!met.includes([a.uid, b.uid].sort().join('|')));
});

function fake(state, { reg = [{ event_id: EV }], prof = [{ real_first_name: 'Nadia', gender: 'femme', birth_date: '1990-05-04' }] } = {}) {
  const calls = [];
  const ok = (b) => ({ ok: true, status: 200, json: async () => b });
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('platform_settings?key=eq.bal_state')) return ok(state ? [{ value: state }] : []);
    if (url.includes('generate_link')) return ok({ user: { id: U1 } });
    if (url.includes('event_registrations?user_id')) return ok(reg);
    if (url.includes('member_profiles?user_id=eq')) return ok(prof);
    if (url.includes('/meeting-tokens')) return ok({ token: 'tok' });
    if (url.includes('platform_settings?on_conflict')) return ok(null);
    throw new Error('inattendu ' + url);
  };
  return { fetcher, calls };
}
const open = { open: true, session: 'abc123', phase: 'accueil', soiree: { events: { [EV]: 'France · 25-39 ans' } }, grand: { name: 'bal-abc123-grand', url: 'https://x.daily.co/bal-abc123-grand' }, assign: {}, met: {} };

test('entrée au bal : inscrite avec la bonne date de naissance', async () => {
  const { fetcher } = fake(open);
  const r = await handleBal(req({ action: 'enter', email: 'Nadia@ex.fr', birth_date: '1990-05-04' }), { env, fetcher });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(readPass(env, body.pass).uid, U1);
  assert.equal(body.salon, 'France · 25-39 ans');
  const bad = await handleBal(req({ action: 'enter', email: 'nadia@ex.fr', birth_date: '1991-01-01' }), { env, fetcher: fake(open).fetcher });
  assert.equal(bad.status, 404);
  const closed = await handleBal(req({ action: 'enter', email: 'nadia@ex.fr', birth_date: '1990-05-04' }), { env, fetcher: fake({ ...open, open: false }).fetcher });
  assert.equal((await closed.json()).error, 'bal_closed');
});

test('pendant un tour : la personne est envoyée dans son tête-à-tête, puis revient au grand salon', async () => {
  const now = new Date('2026-10-31T20:10:00Z');
  const pass = signPass(env, { uid: U1, ev: EV, name: 'Nadia', s: 'abc123', exp: now.getTime() + 3600e3 });
  const tour = { ...open, phase: 'tour', round: 1, ends_at: '2026-10-31T20:16:00Z', assign: { [U1]: { room: 'bal-abc123-r1-01', url: 'https://x.daily.co/bal-abc123-r1-01', partner: 'Karim', ends_at: '2026-10-31T20:16:00Z' } } };
  let r = await handleBal(req({ action: 'state', pass }), { env, fetcher: fake(tour).fetcher, now: () => now });
  let s = await r.json();
  assert.deepEqual([s.where, s.partner], ['tat', 'Karim']);
  const { fetcher, calls } = fake(tour);
  r = await handleBal(req({ action: 'join', pass }), { env, fetcher, now: () => now });
  assert.equal((await r.json()).url, 'https://x.daily.co/bal-abc123-r1-01');
  assert.equal(calls.find((c) => c.url.includes('meeting-tokens')).body.properties.room_name, 'bal-abc123-r1-01');
  r = await handleBal(req({ action: 'state', pass }), { env, fetcher: fake(tour).fetcher, now: () => new Date('2026-10-31T20:17:00Z') });
  s = await r.json();
  assert.equal(s.where, 'grand');
});

test('souhaits : seulement parmi les personnes rencontrées', async () => {
  const pass = signPass(env, { uid: U1, ev: EV, name: 'Nadia', s: 'abc123', exp: Date.now() + 3600e3 });
  const fin = { ...open, phase: 'fin', met: { [U1]: [{ uid: 'k', name: 'Karim' }] } };
  const { fetcher, calls } = fake(fin);
  const r = await handleBal(req({ action: 'wish', pass, wished: ['k', 'intrus'] }), { env, fetcher });
  assert.equal((await r.json()).count, 1);
  assert.deepEqual(calls.find((c) => c.url.includes('on_conflict')).body.value.wished, ['k']);
});

test('les commandes du bal sont réservées à Lamia', async () => {
  const fetcher = async (url) => { if (url.includes('/auth/v1/user')) return { ok: false, status: 401, json: async () => ({}) }; throw new Error(url); };
  const r = await handleBal(req({ action: 'round' }, { authorization: 'Bearer x' }), { env, fetcher });
  assert.equal(r.status, 403);
});
