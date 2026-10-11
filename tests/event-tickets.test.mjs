// Tests des places de soirée, sans réseau : base et Stripe simulés.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventCheckout, fulfillSession, adminEventReport } from '../lib/event-tickets.mjs';

const EVENT = '11111111-2222-3333-4444-555555555555';
const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const env = { CHECKOUT_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_live_fixture', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const now = () => new Date('2026-10-12T10:00:00Z');

function fakeDb({ event = {}, paid = 0, user = { id: USER, email: 'a@b.fr', email_confirmed_at: 'x' }, regOk = true, patchOk = true } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    const ok = (body, headers = {}) => ({ ok: true, json: async () => body, headers: new Headers(headers) });
    if (url.includes('/auth/v1/user')) return user ? ok(user) : { ok: false };
    if (url.includes('/auth/v1/admin/users/')) return ok({ email: 'membre@exemple.fr' });
    if (url.includes('speed_dating_events')) return ok([{ id: EVENT, title: 'Soirée 30-40', starts_at: '2026-10-20T18:00:00Z', capacity: 20, ticket_price_cents: 1200, currency: 'EUR', status: 'published', ...event }]);
    if (url.includes('event_registrations') && init.headers?.Prefer === 'count=exact') return ok([], { 'content-range': `0-0/${paid}` });
    if (url.includes('event_registrations') && init.method === 'POST') return { ok: regOk };
    if (url.includes('event_registrations') && init.method === 'PATCH') return { ok: patchOk };
    if (url.includes('event_registrations')) return ok([{ user_id: USER, payment_status: 'pending', attendance_status: 'registered', created_at: 'x' }]);
    if (url.includes('stripe_webhook_events')) return { ok: true };
    if (url.includes('speed_dating_wishes')) return { ok: false };
    throw new Error('appel inattendu ' + url);
  };
  return { fetcher, calls };
}

function fakeStripe(session = {}) {
  const created = [];
  return {
    created,
    checkout: { sessions: {
      create: async (params) => { created.push(params); return { url: 'https://checkout.stripe.com/c/pay/cs_live_x' }; },
      retrieve: async (id) => ({ id, livemode: true, payment_status: 'paid', metadata: { kind: 'event_ticket', event_id: EVENT, user_id: USER }, ...session }),
    } },
    paymentIntents: { search: async () => ({ data: [] }) },
  };
}

const req = (body, { token = 'jwt', method = 'POST' } = {}) =>
  new Request('https://maison.example/api/event-checkout', { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });

test('le paiement est fermé tant que CHECKOUT_ENABLED ne vaut pas true', async () => {
  const { fetcher, calls } = fakeDb();
  const res = await createEventCheckout(req({ event_id: EVENT, cgv_accepted: true }), { env: { ...env, CHECKOUT_ENABLED: undefined }, fetcher, stripe: fakeStripe(), now });
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
});

test('connexion obligatoire et CGV obligatoires', async () => {
  let { fetcher } = fakeDb({ user: null });
  assert.equal((await createEventCheckout(req({ event_id: EVENT, cgv_accepted: true }), { env, fetcher, stripe: fakeStripe(), now })).status, 401);
  ({ fetcher } = fakeDb());
  assert.equal((await createEventCheckout(req({ event_id: EVENT }), { env, fetcher, stripe: fakeStripe(), now })).status, 400);
});

test('le prix vient de la base, jamais du navigateur', async () => {
  const { fetcher } = fakeDb();
  const stripe = fakeStripe();
  const res = await createEventCheckout(req({ event_id: EVENT, cgv_accepted: true, price: 1 }), { env, fetcher, stripe, now });
  assert.equal(res.status, 200);
  assert.equal(stripe.created[0].line_items[0].price_data.unit_amount, 1200);
  assert.equal(stripe.created[0].metadata.user_id, USER);
  assert.match(stripe.created[0].success_url, /^https:\/\/maison\.example\/speed-dating\/merci\//);
});

test('soirée complète, passée ou non publiée : refus', async () => {
  for (const opts of [{ paid: 20 }, { event: { starts_at: '2026-10-01T18:00:00Z' } }, { event: { status: 'draft' } }]) {
    const { fetcher } = fakeDb(opts);
    assert.equal((await createEventCheckout(req({ event_id: EVENT, cgv_accepted: true }), { env, fetcher, stripe: fakeStripe(), now })).status, 409);
  }
});

test('une place n’est confirmée que si Stripe indique « payé »', async () => {
  let { fetcher, calls } = fakeDb();
  assert.equal((await fulfillSession('cs_live_abc', { env, fetcher, stripe: fakeStripe({ payment_status: 'unpaid' }) })).status, 'unpaid');
  assert.ok(!calls.some((c) => c.init.method === 'PATCH'));
  ({ fetcher, calls } = fakeDb());
  assert.equal((await fulfillSession('cs_live_abc', { env, fetcher, stripe: fakeStripe() })).status, 'paid');
  assert.ok(calls.some((c) => c.url.includes('event_registrations') && c.init.method === 'PATCH'));
});

test('session étrangère, mode test ou identifiant invalide : rien n’est confirmé', async () => {
  const { fetcher } = fakeDb();
  assert.equal((await fulfillSession('pas-un-id', { env, fetcher, stripe: fakeStripe() })).status, 'invalid');
  assert.equal((await fulfillSession('cs_live_abc', { env, fetcher, stripe: fakeStripe({ metadata: {} }) })).status, 'not_a_ticket');
  assert.equal((await fulfillSession('cs_live_abc', { env, fetcher, stripe: fakeStripe({ livemode: false }) })).status, 'wrong_mode');
});

test('le tableau des inscrits est réservé au rôle admin', async () => {
  let { fetcher } = fakeDb();
  const get = new Request(`https://maison.example/api/admin-events?event_id=${EVENT}`, { headers: { authorization: 'Bearer jwt' } });
  assert.equal((await adminEventReport(get, { env, fetcher, stripe: fakeStripe() })).status, 403);
  ({ fetcher } = fakeDb({ user: { id: USER, app_metadata: { role: 'admin' } } }));
  const res = await adminEventReport(get, { env, fetcher, stripe: fakeStripe() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.people[0].email, 'membre@exemple.fr');
  assert.equal(body.wishesAvailable, false);
});
