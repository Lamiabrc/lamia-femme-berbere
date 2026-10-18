// « Mes achats » : les commandes et précommandes de la personne connectée.
// Lecture côté serveur (clé de service), filtrée sur l'email du compte connecté et confirmé.

import { DATABASE_URL, json, serviceHeaders, userFromRequest } from './event-tickets.mjs';

export async function myOrders(request, { env = process.env, fetcher = fetch } = {}) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  const user = await userFromRequest(request, { fetcher });
  if (!user?.email) return json({ error: 'login_required' }, 401);
  if (!user.email_confirmed_at && !user.confirmed_at) return json({ orders: [] });
  const email = user.email.toLowerCase();
  const safe = email.replace(/[%_*,()]/g, '');
  const r = await fetcher(`${DATABASE_URL}/rest/v1/orders?customer_email=ilike.${encodeURIComponent(safe)}&select=order_number,status,amount_total_cents,currency,created_at,paid_at,fulfilled_at,customer_email,stripe_checkout_session_id,order_items(product_name,quantity,total_price_cents,products(product_type,metadata))&order=created_at.desc&limit=50`, {
    headers: serviceHeaders(env), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('orders_read_failed');
  const orders = (await r.json())
    .filter((o) => String(o.customer_email || '').toLowerCase() === email)
    .map(({ customer_email, stripe_checkout_session_id: sid, order_items: items = [], ...o }) => ({
      ...o,
      order_items: items.map(({ products: p, ...i }) => ({ ...i, telechargement: ['paid', 'fulfilled'].includes(o.status) && sid && p?.product_type === 'digital' && p?.metadata?.fichier ? `/api/event-fulfill?type=telecharger&session_id=${encodeURIComponent(sid)}` : null })),
    }));
  return json({ orders });
}
