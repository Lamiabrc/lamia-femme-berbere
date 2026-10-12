import test from 'node:test';
import assert from 'node:assert/strict';
import { myOrders } from '../lib/mes-achats.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const req = () => new Request('https://x/api/mes-achats', { headers: { authorization: 'Bearer jeton' } });
const fetcherFor = (user, rows) => async (url) => {
  if (url.includes('/auth/v1/user')) return user ? { ok: true, json: async () => user } : { ok: false, json: async () => ({}) };
  if (url.includes('/rest/v1/orders')) return { ok: true, json: async () => rows };
  throw new Error(url);
};

test('mes achats : seulement les commandes du compte connecté', async () => {
  const rows = [
    { order_number: 7, status: 'pending', customer_email: 'Nadia@Ex.fr', order_items: [] },
    { order_number: 8, status: 'pending', customer_email: 'nadiaXex.fr', order_items: [] },
  ];
  const r = await myOrders(req(), { env, fetcher: fetcherFor({ id: 'u', email: 'nadia@ex.fr', email_confirmed_at: 'x' }, rows) });
  const body = await r.json();
  assert.deepEqual(body.orders.map((o) => o.order_number), [7]);
  assert.equal(body.orders[0].customer_email, undefined);
});

test('mes achats : connexion obligatoire, email confirmé', async () => {
  assert.equal((await myOrders(req(), { env, fetcher: fetcherFor(null, []) })).status, 401);
  const r = await myOrders(req(), { env, fetcher: fetcherFor({ id: 'u', email: 'a@b.fr' }, [{ order_number: 1, customer_email: 'a@b.fr' }]) });
  assert.deepEqual((await r.json()).orders, []);
});
