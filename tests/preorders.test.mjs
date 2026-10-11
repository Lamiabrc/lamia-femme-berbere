import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreorder } from '../lib/preorders.mjs';
import { shippingFor } from '../content/shipping.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const PRODUCTS = {
  broche: { id: 'p1', name: 'Werdi broché', price_cents: 1590, currency: 'EUR', product_type: 'physical', is_unique: false, stock_qty: 999, categories: { slug: 'livres' } },
  collier: { id: 'p2', name: 'Collier', price_cents: 9900, currency: 'EUR', product_type: 'physical', is_unique: true, stock_qty: 1, categories: { slug: 'bijoux' } },
};
function fake(slug, { reserved = false } = {}) {
  const writes = [];
  const fetcher = async (url, init = {}) => {
    const ok = (b) => ({ ok: true, json: async () => b });
    if (url.includes('/products?')) return ok(PRODUCTS[slug] ? [PRODUCTS[slug]] : []);
    if (url.includes('order_items?product_id')) return ok(reserved ? [{ id: 'x' }] : []);
    if (url.includes('/orders?') && init.method === 'POST') { writes.push(JSON.parse(init.body)); return ok([{ id: 'o1', order_number: 42 }]); }
    if (url.endsWith('/order_items') && init.method === 'POST') { writes.push(JSON.parse(init.body)); return { ok: true }; }
    throw new Error('inattendu ' + url);
  };
  return { fetcher, writes };
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
  assert.match(writes[0].notes, /PRÉCOMMANDE/);
});

test('collier déjà réservé : liste d’attente', async () => {
  const { fetcher } = fake('collier', { reserved: true });
  const body = await (await createPreorder(req({ ...base, slug: 'collier', qty: 5 }), { env, fetcher })).json();
  assert.equal(body.waitlist, true);
  assert.equal(body.total_cents, 9900 + 1090);
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
