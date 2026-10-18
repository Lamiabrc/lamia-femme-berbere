// Commandes de la boutique : achat direct par Stripe Checkout (paiement sécurisé).
// Prix, frais d'envoi et stock sont lus et recalculés ici, jamais repris du navigateur.
// La commande n'est marquée payée qu'après lecture de la session chez Stripe
// (retour de paiement ou notification signée), puis le stock baisse dans la même
// transaction (fonction finaliser_commande). Tant que le paiement en ligne n'est pas
// activé (CHECKOUT_ENABLED ≠ « true »), la commande est enregistrée et Lamia envoie
// le lien de paiement elle-même.

import { DATABASE_URL, json, userFromRequest, isAdmin, CGV_VERSION } from './event-tickets.mjs';

export const ORDER_KIND = 'product_order';
const UUID = /^[0-9a-f-]{36}$/i;
const PAIEMENT_EN_COURS_MIN = 30; // une pièce unique reste réservée pendant le paiement
import { shippingFor, MAX_QTY, tvaIncluse, reglagesPropres, taillesDe, supplementTaille } from '../content/shipping.mjs';

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

export async function createPreorder(request, { env = process.env, fetcher = fetch, stripe = null, now = () => new Date() } = {}) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (b?.website) return json({ ok: true, order_number: 0 }); // piège à robots
  if (b?.action === 'renvoyer_ebook') return renvoyerEbook(b, request, { env, fetcher });
  if (b?.cgv_accepted !== true) return json({ error: 'cgv_required' }, 400);

  const slug = clean(b.slug, 120);
  const name = clean(b.name, 120);
  const email = clean(b.email, 254).toLowerCase();
  const phone = clean(b.phone, 30);
  if (!slug || name.length < 2 || !EMAIL.test(email)) return json({ error: 'invalid_contact' }, 400);

  const res = await db(env, fetcher, `products?slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=id,name,price_cents,currency,product_type,is_unique,stock_qty,cover_image_url,metadata,categories(slug)`);
  if (!res.ok) return json({ error: 'temporary_failure' }, 502);
  const [product] = await res.json();
  if (!product) return json({ error: 'product_unavailable' }, 409);

  // Tarifs d'envoi et TVA réglés par Lamia (tableau de bord), sinon valeurs par défaut.
  let reglages = reglagesPropres();
  try {
    const rr = await db(env, fetcher, 'platform_settings?key=eq.boutique&select=value');
    if (rr.ok) { const v = (await rr.json())[0]?.value; if (v) reglages = reglagesPropres(v); }
  } catch { /* valeurs par défaut */ }
  const qty = Math.max(1, Math.min(Number.parseInt(b.qty, 10) || 1, MAX_QTY(product)));
  const ship = shippingFor(product, qty, b.method === 'retrait' ? 'retrait' : 'colissimo', reglages.tarifs);
  // Bague : la taille de doigt est obligatoire ; les grandes tailles ont un supplément.
  const tailles = taillesDe(product);
  let taille = null, unit = product.price_cents;
  if (tailles.length) {
    taille = Number.parseInt(b.taille, 10);
    if (!tailles.includes(taille)) return json({ error: 'taille_requise' }, 400);
    unit += supplementTaille(product, taille);
  }
  let address = null;
  if (ship.method === 'colissimo' || ship.method === 'lettre') {
    address = { line1: clean(b.address?.line1, 160), line2: clean(b.address?.line2, 160), postal_code: clean(b.address?.postal_code, 10), city: clean(b.address?.city, 80), country: 'France' };
    if (!address.line1 || !/^\d{5}$/.test(address.postal_code) || !address.city) return json({ error: 'invalid_address' }, 400);
  }

  // Livre numérique : pas de vente tant que le fichier n'est pas déposé dans le dossier privé.
  if (product.product_type === 'digital' && !product.metadata?.fichier) return json({ error: 'fichier_absent' }, 409);
  const enLigne = env.CHECKOUT_ENABLED === 'true' && Boolean(stripe) && Boolean(env.STRIPE_SECRET_KEY);
  // Stock : une pièce vendue n'est plus disponible ; une collection se vend tant qu'il en reste.
  if (product.product_type !== 'digital' && Number.isInteger(product.stock_qty) && product.stock_qty < qty) {
    return json({ error: product.stock_qty <= 0 ? 'product_unavailable' : 'stock_insuffisant', stock: Math.max(0, product.stock_qty) }, 409);
  }
  // Pièce unique : si quelqu'un est déjà en train de la payer, elle est réservée 30 minutes.
  if (product.is_unique) {
    const depuis = new Date(now().getTime() - PAIEMENT_EN_COURS_MIN * 60000).toISOString();
    const w = await db(env, fetcher, `order_items?product_id=eq.${product.id}&select=id,orders!inner(status,created_at)&orders.status=eq.pending&orders.created_at=gte.${encodeURIComponent(depuis)}`);
    if (w.ok && (await w.json()).length > 0) return json({ error: 'paiement_en_cours' }, 409);
  }

  const items = unit * qty;
  const total = items + ship.cents;
  const tva = tvaIncluse(total, reglages.tva);
  const o = await db(env, fetcher, 'orders?select=id,order_number', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      customer_email: email, customer_name: name, amount_total_cents: total, currency: product.currency || 'EUR', status: 'pending',
      shipping_address: { method: ship.method, phone, ...(address || {}) },
      notes: `${enLigne ? 'ACHAT EN LIGNE — paiement Stripe en cours.' : 'COMMANDE — paiement en ligne pas encore activé : envoyer le lien de paiement.'} ${clean(b.message, 600)}`.trim(),
    }),
  });
  if (!o.ok) return json({ error: 'temporary_failure' }, 502);
  const [order] = await o.json();
  const it = await db(env, fetcher, 'order_items', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ order_id: order.id, product_id: product.id, product_name: taille ? `${product.name} · taille ${taille}` : product.name, quantity: qty, unit_price_cents: unit, total_price_cents: items, metadata: { taille, shipping_cents: ship.cents, shipping_method: ship.method, tva_cents: tva, tva_taux: reglages.tva.active ? reglages.tva.taux : null } }),
  });
  if (!it.ok) return json({ error: 'temporary_failure' }, 502);
  if (!enLigne) return json({ ok: true, order_number: order.order_number, total_cents: total, shipping_cents: ship.cents, tva_cents: tva, paiement: 'manuel' });

  // Paiement sécurisé : page Stripe Checkout (3D Secure, carte, Apple Pay, Google Pay).
  const origin = new URL(request.url).origin;
  const currency = (product.currency || 'EUR').toLowerCase();
  const image = product.cover_image_url ? (product.cover_image_url.startsWith('http') ? product.cover_image_url : origin + product.cover_image_url) : null;
  const metadata = { kind: ORDER_KIND, order_id: order.id, order_number: String(order.order_number), ...(taille ? { taille: String(taille) } : {}), cgv_version: CGV_VERSION, cgv_accepted_at: now().toISOString() };
  const line_items = [{ quantity: qty, price_data: { currency, unit_amount: unit, product_data: { name: taille ? `${product.name} · taille ${taille}` : product.name, ...(image ? { images: [image] } : {}) } } }];
  if (ship.cents > 0) line_items.push({ quantity: 1, price_data: { currency, unit_amount: ship.cents, product_data: { name: ship.method === 'lettre' ? 'Envoi par lettre' : 'Envoi suivi Colissimo' } } });
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      customer_email: email,
      client_reference_id: order.id,
      line_items,
      metadata,
      payment_intent_data: { metadata, description: `Commande n° ${order.order_number} · ${product.name}` },
      success_url: `${origin}/commande/merci/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/produit/?p=${encodeURIComponent(slug)}&paiement=annule`,
      expires_at: Math.floor(now().getTime() / 1000) + PAIEMENT_EN_COURS_MIN * 60,
    }, { idempotencyKey: `order-${order.id}` });
  } catch {
    await db(env, fetcher, `orders?id=eq.${order.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'cancelled', notes: 'Paiement non ouvert (erreur Stripe).' }) }).catch(() => {});
    return json({ error: 'paiement_indisponible' }, 502);
  }
  await db(env, fetcher, `orders?id=eq.${order.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stripe_checkout_session_id: session.id }) }).catch(() => {});
  return json({ ok: true, url: session.url, order_number: order.order_number });
}

// Lit une session chez Stripe et, si elle est payée, finalise la commande (rejouable).
export async function fulfillOrderSession(session, { env = process.env, fetcher = fetch } = {}) {
  const m = session?.metadata || {};
  if (m.kind !== ORDER_KIND || !UUID.test(m.order_id || '')) return { status: 'not_an_order' };
  const expectedLive = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '');
  if (session.livemode !== expectedLive) return { status: 'wrong_mode' };
  if (session.payment_status !== 'paid') return { status: 'unpaid', order_number: m.order_number };
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
  const r = await db(env, fetcher, 'rpc/finaliser_commande', { method: 'POST', body: JSON.stringify({ p_order: m.order_id, p_session: session.id, p_payment_intent: pi }) });
  if (!r.ok) return { status: 'paid_not_recorded', order_number: m.order_number };
  return { status: 'paid', order_number: m.order_number, nouvelle: (await r.json()) === true };
}

export async function listPreorders(request, { env = process.env, fetcher = fetch } = {}) {
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  const user = await userFromRequest(request, { fetcher });
  if (!isAdmin(user)) return json({ error: 'forbidden' }, 403);
  const r = await db(env, fetcher, 'orders?select=order_number,created_at,customer_name,customer_email,amount_total_cents,status,shipping_address,notes,order_items(product_name,quantity,total_price_cents,metadata)&order=created_at.desc&limit=200');
  return json({ orders: r.ok ? await r.json() : [] });
}

// ------------------------------------------------------------------ livres numériques
// Fichiers du dossier privé « ebooks » liés aux articles d'une commande (metadata.fichier).
export async function fichiersCommande(orderId, { env = process.env, fetcher = fetch } = {}) {
  if (!UUID.test(orderId || '')) return [];
  const r = await db(env, fetcher, `order_items?order_id=eq.${orderId}&select=product_name,products(slug,product_type,metadata)`);
  if (!r.ok) return [];
  return (await r.json())
    .filter((i) => i.products?.product_type === 'digital' && /^[\w-]+\/[\w.-]+\.(pdf|epub)$/.test(i.products?.metadata?.fichier || ''))
    .map((i) => ({ nom: i.product_name, slug: i.products.slug, fichier: i.products.metadata.fichier }));
}

// Lien signé de quelques minutes vers le fichier, avec un nom de fichier lisible.
export async function lienSigne(fichier, nom, { env = process.env, fetcher = fetch, minutes = 15 } = {}) {
  const ext = fichier.split('.').pop();
  const r = await fetcher(`${DATABASE_URL}/storage/v1/object/sign/ebooks/${fichier}`, {
    method: 'POST', headers: headers(env), body: JSON.stringify({ expiresIn: minutes * 60 }), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const { signedURL } = await r.json();
  const propre = String(nom || 'livre').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'livre';
  // Sans « download » : le PDF s'ouvre directement dans le navigateur (lecture, puis enregistrement).
  void propre; void ext;
  return `${DATABASE_URL}/storage/v1${signedURL}`;
}

// Téléchargement depuis le lien de la page Merci ou de Mon espace : la session doit être payée chez Stripe.
export async function telechargerDepuisSession(session, deps = {}) {
  const env = deps.env || process.env;
  const m = session?.metadata || {};
  if (m.kind !== ORDER_KIND || !UUID.test(m.order_id || '')) return { status: 'not_an_order' };
  if (session.livemode !== /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '')) return { status: 'wrong_mode' };
  if (session.payment_status !== 'paid') return { status: 'unpaid' };
  const [f] = await fichiersCommande(m.order_id, deps);
  if (!f) return { status: 'no_file' };
  const url = await lienSigne(f.fichier, f.nom, deps);
  return url ? { status: 'ok', url } : { status: 'error' };
}

// « Je n'ai pas reçu mon livre » : on renvoie, par email, les liens de téléchargement
// à l'adresse utilisée pour l'achat. La réponse est toujours la même, pour ne pas révéler
// qui a acheté quoi ; le lien ne part qu'à la boîte mail de l'acheteuse.
export async function renvoyerEbook(b, request, { env = process.env, fetcher = fetch } = {}) {
  const email = clean(b.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return json({ error: 'invalid_contact' }, 400);
  if (!env.RESEND_API_KEY) return json({ ok: true, email: false });
  const safe = email.replace(/[%_*,()]/g, '');
  const r = await db(env, fetcher, `orders?customer_email=ilike.${encodeURIComponent(safe)}&status=in.(paid,fulfilled)&stripe_checkout_session_id=not.is.null&select=order_number,customer_email,stripe_checkout_session_id,order_items(product_name,products(product_type,metadata))&order=created_at.desc&limit=20`);
  const orders = r.ok ? (await r.json()).filter((o) => String(o.customer_email).toLowerCase() === email) : [];
  const origin = new URL(request.url).origin;
  const liens = orders.flatMap((o) => (o.order_items || [])
    .filter((i) => i.products?.product_type === 'digital' && i.products?.metadata?.fichier)
    .map((i) => ({ nom: i.product_name, n: o.order_number, url: `${origin}/api/event-fulfill?type=telecharger&session_id=${encodeURIComponent(o.stripe_checkout_session_id)}` })));
  if (liens.length) {
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const from = env.BOUTIQUE_FROM || env.CONFIDENCES_FROM || env.RESEND_FROM || 'Lamia Femme Berbère <onboarding@resend.dev>';
    const html = `<p>Bonjour,</p><p>Voici ton lien pour télécharger ton livre :</p>${liens.map((l) => `<p><a href="${esc(l.url)}" style="display:inline-block;padding:12px 18px;background:#1b1a18;color:#fff;border-radius:999px;text-decoration:none">Télécharger « ${esc(l.nom)} »</a><br><small>Commande n° ${esc(l.n)}</small></p>`).join('')}<p>Tu le retrouves aussi à tout moment dans « Mon espace » sur lamia-femme-berbere.com.</p><p>Belle lecture,<br>Lamia</p>`;
    const text = `Bonjour,\n\nVoici ton lien pour télécharger ton livre :\n${liens.map((l) => `${l.nom} (commande n° ${l.n}) : ${l.url}`).join('\n')}\n\nBelle lecture,\nLamia`;
    await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [email], subject: 'Ton livre Lamia Femme Berbère', html, text }), signal: AbortSignal.timeout(10000) }).catch(() => null);
  }
  return json({ ok: true, email: true });
}
