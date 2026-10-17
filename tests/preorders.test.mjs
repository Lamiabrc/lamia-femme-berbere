import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreorder, fulfillOrderSession } from '../lib/preorders.mjs';
import { shippingFor } from '../content/shipping.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const PRODUCTS = {
  broche: { id: 'p1', name: 'Werdi broché', price_cents: 1590, currency: 'EUR', product_type: 'physical', is_unique: false, stock_qty: 999, categories: { slug: 'livres' } },
  collier: { id: 'p2', name: 'Collier', price_cents: 9900, currency: 'EUR', product_type: 'physical', is_unique: true, stock_qty: 1, categories: { slug: 'bijoux' } },
};
function fake(slug, { reserved = false } = {}) {
  const writes = [], patches = [], rpc = [];
  const fetcher = async (url, init = {}) => {
    const ok = (b) => ({ ok: true, json: async () => b });
    if (url.includes('/products?')) return ok(PRODUCTS[slug] ? [PRODUCTS[slug]] : []);
    if (url.includes('order_items?product_id')) return ok(reserved ? [{ id: 'x' }] : []);
    if (url.includes('/orders?') && init.method === 'POST') { writes.push(JSON.parse(init.body)); return ok([{ id: 'o1', order_number: 42 }]); }
    if (url.endsWith('/order_items') && init.method === 'POST') { writes.push(JSON.parse(init.body)); return { ok: true }; }
    if (url.includes('/orders?id=eq.') && init.method === 'PATCH') { patches.push(JSON.parse(init.body)); return { ok: true }; }
    if (url.includes('/rpc/finaliser_commande')) { rpc.push(JSON.parse(init.body)); return ok(rpc.length === 1); }
    throw new Error('inattendu ' + url);
  };
  return { fetcher, writes, patches, rpc };
}
const req = (b) => new Request('https://x/api/preorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const base = { name: 'Nadia K', email: 'nadia@exemple.fr', cgv_accepted: true, method: 'colissimo', address: { line1: '1 rue A', postal_code: '35000', city: 'Rennes' } };

test('frais d’envoi', () => {
  assert.equal(shippingFor(PRODUCTS.broche, 1, 'colissimo').cents, 790);
  assert.equal(shippingFor(PRODUCTS.broche, 3, 'colissimo').cents, 990);
  assert.equal(shippingFor(PRODUCTS.collier, 1, 'colissimo').cents, 1090);
  assert.equal(shippingFor(PRODUCTS.collier, 1, 'retrait').cents, 0);
  assert.equal(shippingFor({ product_type: 'digital' }, 1, 'colissimo').cents, 0);
});

test('précommande du livre : prix et frais recalculés côté serveur', async () => {
  const { fetcher, writes } = fake('broche');
  const r = await createPreorder(req({ ...base, slug: 'broche', qty: 2, price: 1 }), { env, fetcher });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.total_cents, 1590 * 2 + 990);
  assert.equal(writes[0].status, 'pending');
  assert.equal(body.paiement, 'manuel');
});

test('pièce unique en cours de paiement par quelqu’un d’autre : refusée 30 minutes', async () => {
  const { fetcher } = fake('collier', { reserved: true });
  const r = await createPreorder(req({ ...base, slug: 'collier' }), { env, fetcher });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'paiement_en_cours');
});

test('pièce vendue (stock 0) ou quantité trop grande : refus', async () => {
  PRODUCTS.vendue = { ...PRODUCTS.collier, stock_qty: 0 };
  PRODUCTS.peu = { ...PRODUCTS.broche, stock_qty: 2 };
  assert.equal((await (await createPreorder(req({ ...base, slug: 'vendue' }), { env, fetcher: fake('vendue').fetcher })).json()).error, 'product_unavailable');
  const r = await (await createPreorder(req({ ...base, slug: 'peu', qty: 3 }), { env, fetcher: fake('peu').fetcher })).json();
  assert.deepEqual([r.error, r.stock], ['stock_insuffisant', 2]);
});

test('achat direct : page de paiement Stripe avec prix serveur, envoi et retour', async () => {
  const { fetcher, patches } = fake('broche');
  let args;
  const stripe = { checkout: { sessions: { create: async (a, o) => { args = [a, o]; return { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }; } } } };
  const r = await createPreorder(req({ ...base, slug: 'broche', qty: 2, price: 1 }), { env: { ...env, CHECKOUT_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_x' }, fetcher, stripe });
  const body = await r.json();
  assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  const [a, o] = args;
  assert.deepEqual(a.line_items.map((l) => [l.quantity, l.price_data.unit_amount]), [[2, 1590], [1, 990]]);
  assert.equal(a.metadata.kind, 'product_order');
  assert.equal(a.metadata.order_id, 'o1');
  assert.match(a.success_url, /\/commande\/merci\/\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.match(a.cancel_url, /paiement=annule/);
  assert.equal(o.idempotencyKey, 'order-o1');
  assert.deepEqual(patches, [{ stripe_checkout_session_id: 'cs_test_1' }]);
});

test('finalisation : seulement une session payée, dans le bon mode, une seule fois', async () => {
  const { fetcher, rpc } = fake('broche');
  const e = { ...env, STRIPE_SECRET_KEY: 'sk_test_x' };
  const s = { id: 'cs_test_1', livemode: false, payment_status: 'paid', payment_intent: 'pi_1', metadata: { kind: 'product_order', order_id: '11111111-1111-1111-1111-111111111111', order_number: '42' } };
  assert.equal((await fulfillOrderSession({ ...s, payment_status: 'unpaid' }, { env: e, fetcher })).status, 'unpaid');
  assert.equal((await fulfillOrderSession({ ...s, livemode: true }, { env: e, fetcher })).status, 'wrong_mode');
  assert.equal((await fulfillOrderSession({ ...s, metadata: { kind: 'event_ticket' } }, { env: e, fetcher })).status, 'not_an_order');
  const a = await fulfillOrderSession(s, { env: e, fetcher });
  const b = await fulfillOrderSession(s, { env: e, fetcher });
  assert.deepEqual([a.status, a.nouvelle, b.status, b.nouvelle], ['paid', true, 'paid', false]);
  assert.deepEqual(rpc[0], { p_order: s.metadata.order_id, p_session: 'cs_test_1', p_payment_intent: 'pi_1' });
});

test('refus : CGV, email, adresse, produit inconnu', async () => {
  const { fetcher } = fake('broche');
  assert.equal((await createPreorder(req({ ...base, slug: 'broche', cgv_accepted: false }), { env, fetcher })).status, 400);
  assert.equal((await createPreorder(req({ ...base, slug: 'broche', email: 'pas-un-email' }), { env, fetcher })).status, 400);
  assert.equal((await createPreorder(req({ ...base, slug: 'broche', address: { line1: '', postal_code: '35', city: '' } }), { env, fetcher })).status, 400);
  assert.equal((await createPreorder(req({ ...base, slug: 'inconnu' }), { env, fetcher: fake('inconnu').fetcher })).status, 409);
});

test('retrait à Rennes : pas d’adresse exigée', async () => {
  const { fetcher } = fake('broche');
  const r = await createPreorder(req({ ...base, slug: 'broche', method: 'retrait', address: null }), { env, fetcher });
  assert.equal((await r.json()).total_cents, 1590);
});
