// Précommandes : réservation sans paiement immédiat. Lamia confirme et envoie le
// moyen de paiement. Prix et frais d'envoi recalculés ici, jamais repris du navigateur.

import { DATABASE_URL, json, userFromRequest, isAdmin } from './event-tickets.mjs';
import { shippingFor, MAX_QTY } from '../content/shipping.mjs';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function headers(env, extra = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (!key.startsWith('sb_secret_')) h.Authorization = `Bearer ${key}`;
  return h;
}
const db = (env, fetcher, path, init = {}) =>
  fetcher(`${DATABASE_URL}/rest/v1/${path}`, { ...init, headers: headers(env, init.headers), signal: AbortSignal.timeout(10000) });

export async function createPreorder(request, { env = process.env, fetcher = fetch } = {}) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (b?.website) return json({ ok: true, order_number: 0 }); // piège à robots
  if (b?.cgv_accepted !== true) return json({ error: 'cgv_required' }, 400);

  const slug = clean(b.slug, 120);
  const name = clean(b.name, 120);
  const email = clean(b.email, 254).toLowerCase();
  const phone = clean(b.phone, 30);
  if (!slug || name.length < 2 || !EMAIL.test(email)) return json({ error: 'invalid_contact' }, 400);

  const res = await db(env, fetcher, `products?slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=id,name,price_cents,currency,product_type,is_unique,stock_qty,categories(slug)`);
  if (!res.ok) return json({ error: 'temporary_failure' }, 502);
  const [product] = await res.json();
  if (!product) return json({ error: 'product_unavailable' }, 409);

  const qty = Math.max(1, Math.min(Number.parseInt(b.qty, 10) || 1, MAX_QTY(product)));
  const ship = shippingFor(product, qty, b.method === 'retrait' ? 'retrait' : 'colissimo');
  let address = null;
  if (ship.method === 'colissimo') {
    address = { line1: clean(b.address?.line1, 160), line2: clean(b.address?.line2, 160), postal_code: clean(b.address?.postal_code, 10), city: clean(b.address?.city, 80), country: 'France' };
    if (!address.line1 || !/^\d{5}$/.test(address.postal_code) || !address.city) return json({ error: 'invalid_address' }, 400);
  }

  // Pièce unique déjà réservée : la demande est enregistrée en liste d'attente.
  let waitlist = false;
  if (product.is_unique) {
    const w = await db(env, fetcher, `order_items?product_id=eq.${product.id}&select=id,orders!inner(status)&orders.status=in.(pending,paid)`);
    if (w.ok) waitlist = (await w.json()).length > 0;
  }

  const items = product.price_cents * qty;
  const total = items + ship.cents;
  const o = await db(env, fetcher, 'orders?select=id,order_number', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      customer_email: email, customer_name: name, amount_total_cents: total, currency: product.currency || 'EUR', status: 'pending',
      shipping_address: { method: ship.method, phone, ...(address || {}) },
      notes: `PRÉCOMMANDE${waitlist ? ' — LISTE D’ATTENTE' : ''} — paiement non encaissé. ${clean(b.message, 600)}`.trim(),
    }),
  });
  if (!o.ok) return json({ error: 'temporary_failure' }, 502);
  const [order] = await o.json();
  const it = await db(env, fetcher, 'order_items', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ order_id: order.id, product_id: product.id, product_name: product.name, quantity: qty, unit_price_cents: product.price_cents, total_price_cents: items, metadata: { preorder: true, shipping_cents: ship.cents, shipping_method: ship.method, waitlist } }),
  });
  if (!it.ok) return json({ error: 'temporary_failure' }, 502);
  return json({ ok: true, order_number: order.order_number, total_cents: total, shipping_cents: ship.cents, waitlist });
}

export async function listPreorders(request, { env = process.env, fetcher = fetch } = {}) {
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  const user = await userFromRequest(request, { fetcher });
  if (!isAdmin(user)) return json({ error: 'forbidden' }, 403);
  const r = await db(env, fetcher, 'orders?select=order_number,created_at,customer_name,customer_email,amount_total_cents,status,shipping_address,notes,order_items(product_name,quantity,total_price_cents,metadata)&order=created_at.desc&limit=200');
  return json({ orders: r.ok ? await r.json() : [] });
}
