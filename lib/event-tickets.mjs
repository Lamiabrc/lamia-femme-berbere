// Places des soirées speed dating : paiement Stripe Checkout et confirmation.
//
// Principes :
//  * le prix, la date et les places restantes sont lus côté serveur, jamais dans le navigateur ;
//  * une place n'est confirmée qu'après lecture de la session directement chez Stripe ;
//  * tout est rejouable sans doublon (upsert sur event_id + user_id) ;
//  * le paiement reste fermé tant que CHECKOUT_ENABLED ne vaut pas « true ».
//
// Les dépendances (fetch, client Stripe) sont injectées pour être testées sans réseau.

export const DATABASE_URL = 'https://tybwvxinigahhntfeeur.supabase.co';
const PUBLIC_KEY = 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';
export const TICKET_KIND = 'event_ticket';
export const CGV_VERSION = '2026-10-brouillon';

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function serviceHeaders(env, extra = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (!key.startsWith('sb_secret_')) h.Authorization = `Bearer ${key}`;
  return h;
}

export function configured(env) {
  return Boolean(env.STRIPE_SECRET_KEY && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY));
}

// Vérifie le jeton de session Supabase envoyé par le navigateur et renvoie l'utilisateur.
export async function userFromRequest(request, { fetcher = fetch } = {}) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token.length > 4096) return null;
  const res = await fetcher(`${DATABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

export const isAdmin = (user) => user?.app_metadata?.role === 'admin';

async function db(env, fetcher, path, init = {}) {
  const res = await fetcher(`${DATABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: serviceHeaders(env, init.headers),
    signal: AbortSignal.timeout(10000),
  });
  return res;
}

async function loadEvent(env, fetcher, eventId) {
  const res = await db(env, fetcher, `speed_dating_events?id=eq.${encodeURIComponent(eventId)}&select=id,title,starts_at,capacity,ticket_price_cents,currency,status`);
  if (!res.ok) throw new Error('event_read_failed');
  const [event] = await res.json();
  return event || null;
}

async function paidCount(env, fetcher, eventId) {
  const res = await db(env, fetcher, `event_registrations?event_id=eq.${encodeURIComponent(eventId)}&payment_status=eq.paid&select=user_id`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) throw new Error('count_failed');
  const range = res.headers.get('content-range') || '*/0';
  return Number(range.split('/')[1]) || 0;
}

const UUID = /^[0-9a-f-]{36}$/i;
const frDate = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

// ------------------------------------------------------------------ création du paiement

export async function createEventCheckout(request, { env = process.env, fetcher = fetch, stripe, now = () => new Date() } = {}) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (env.CHECKOUT_ENABLED !== 'true') return json({ error: 'checkout_disabled' }, 503);
  if (!configured(env) || !stripe) return json({ error: 'not_configured' }, 503);

  const user = await userFromRequest(request, { fetcher });
  if (!user) return json({ error: 'login_required' }, 401);
  if (!user.email_confirmed_at && !user.confirmed_at) return json({ error: 'email_not_confirmed' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const eventId = String(body?.event_id || '');
  if (!UUID.test(eventId)) return json({ error: 'bad_request' }, 400);
  if (body?.cgv_accepted !== true) return json({ error: 'cgv_required' }, 400);

  const event = await loadEvent(env, fetcher, eventId);
  if (!event || event.status !== 'published') return json({ error: 'event_unavailable' }, 409);
  if (new Date(event.starts_at) <= now()) return json({ error: 'event_past' }, 409);
  if (!Number.isInteger(event.ticket_price_cents) || event.ticket_price_cents < 100) return json({ error: 'event_price_invalid' }, 409);
  if ((await paidCount(env, fetcher, eventId)) >= event.capacity) return json({ error: 'event_full' }, 409);

  // Profil membre minimal : les inscriptions y sont rattachées (clé étrangère).
  const prof = await db(env, fetcher, 'member_profiles?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: user.id }),
  });
  if (!prof.ok) return json({ error: 'registration_failed' }, 502);

  // Pré-inscription en attente (idempotente).
  const reg = await db(env, fetcher, 'event_registrations?on_conflict=event_id,user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ event_id: eventId, user_id: user.id, payment_status: 'pending', attendance_status: 'registered' }),
  });
  if (!reg.ok) return json({ error: 'registration_failed' }, 502);

  const origin = new URL(request.url).origin;
  const metadata = { kind: TICKET_KIND, event_id: eventId, user_id: user.id, cgv_version: CGV_VERSION, cgv_accepted_at: now().toISOString() };
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    locale: 'fr',
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: (event.currency || 'EUR').toLowerCase(),
        unit_amount: event.ticket_price_cents,
        product_data: { name: `Soirée Lamia : ${event.title}`, description: frDate(event.starts_at) },
      },
    }],
    metadata,
    payment_intent_data: { metadata, description: `Soirée ${event.title}` },
    success_url: `${origin}/speed-dating/merci/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/speed-dating/?paiement=annule`,
    expires_at: Math.floor(now().getTime() / 1000) + 30 * 60,
  }, { idempotencyKey: `ticket-${eventId}-${user.id}-${Math.floor(now().getTime() / 60000)}` });

  await db(env, fetcher, `event_registrations?event_id=eq.${eventId}&user_id=eq.${user.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ stripe_checkout_session_id: session.id }),
  }).catch(() => {});

  return json({ url: session.url });
}

// ------------------------------------------------------------------ confirmation

// Lit la session chez Stripe et, si elle est payée, confirme la place. Rejouable.
export async function fulfillSession(sessionId, { env = process.env, fetcher = fetch, stripe } = {}) {
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(String(sessionId))) return { status: 'invalid' };
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const m = session.metadata || {};
  if (m.kind !== TICKET_KIND || !UUID.test(m.event_id || '') || !UUID.test(m.user_id || '')) return { status: 'not_a_ticket' };
  const expectedLive = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '');
  if (session.livemode !== expectedLive) return { status: 'wrong_mode' };
  if (session.payment_status !== 'paid') return { status: 'unpaid', event_id: m.event_id };

  const upd = await db(env, fetcher, `event_registrations?event_id=eq.${m.event_id}&user_id=eq.${m.user_id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ payment_status: 'paid' }),
  });
  if (!upd.ok) return { status: 'paid_not_recorded', event_id: m.event_id };

  // Archive Stripe : les notifications de cette session sont traitées.
  await db(env, fetcher, `stripe_webhook_events?stripe_object_id=eq.${encodeURIComponent(session.id)}&processing_status=eq.pending`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ processing_status: 'processed', processed_at: new Date().toISOString() }),
  }).catch(() => {});
  return { status: 'paid', event_id: m.event_id };
}

export async function handleFulfill(request, deps = {}) {
  const env = deps.env || process.env;
  if (!configured(env) || !deps.stripe) return json({ status: 'not_configured' }, 503);
  const id = new URL(request.url).searchParams.get('session_id');
  try {
    const result = await fulfillSession(id, deps);
    return json({ status: result.status }, result.status === 'invalid' ? 400 : 200);
  } catch {
    return json({ status: 'error' }, 502);
  }
}

// ------------------------------------------------------------------ tableau de Lamia

export async function adminEventReport(request, { env = process.env, fetcher = fetch, stripe } = {}) {
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const user = await userFromRequest(request, { fetcher });
  if (!isAdmin(user)) return json({ error: 'forbidden' }, 403);

  const eventId = new URL(request.url).searchParams.get('event_id');
  if (!eventId) {
    const res = await db(env, fetcher, 'speed_dating_events?select=id,title,starts_at,capacity,ticket_price_cents,status&order=starts_at.desc');
    return json({ events: res.ok ? await res.json() : [] });
  }
  if (!UUID.test(eventId)) return json({ error: 'bad_request' }, 400);

  // Rattrapage : les paiements réussis chez Stripe confirment les places manquées.
  const paidInStripe = new Map();
  if (stripe) {
    try {
      const found = await stripe.paymentIntents.search({ query: `metadata['event_id']:'${eventId}' AND status:'succeeded'`, limit: 100 });
      for (const pi of found.data) if (pi.metadata?.user_id) paidInStripe.set(pi.metadata.user_id, pi.amount_received);
    } catch { /* recherche Stripe indisponible : on s'appuie sur la base */ }
  }

  const ev = await loadEvent(env, fetcher, eventId).catch(() => null);
  const free = ev ? ev.ticket_price_cents === 0 : false;
  const res = await db(env, fetcher, `event_registrations?event_id=eq.${eventId}&select=user_id,payment_status,attendance_status,created_at&order=created_at`);
  const rows = res.ok ? await res.json() : [];
  const profiles = new Map();
  if (rows.length) {
    const ids = rows.map((r) => r.user_id).filter((id) => UUID.test(id)).join(',');
    const pr = await db(env, fetcher, `member_profiles?user_id=in.(${ids})&select=user_id,display_name,real_first_name,gender,birth_date,city`).catch(() => null);
    if (pr?.ok) for (const p of await pr.json()) profiles.set(p.user_id, p);
  }
  const ageAt = (birth) => {
    if (!birth || !ev) return null;
    const b = new Date(`${birth}T12:00:00Z`), d = new Date(ev.starts_at);
    let a = d.getUTCFullYear() - b.getUTCFullYear();
    if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
    return a;
  };
  const people = [];
  for (const r of rows) {
    let email = null;
    const u = await fetcher(`${DATABASE_URL}/auth/v1/admin/users/${r.user_id}`, { headers: serviceHeaders(env), signal: AbortSignal.timeout(8000) });
    if (u.ok) email = (await u.json()).email || null;
    const paid = free || r.payment_status === 'paid' || paidInStripe.has(r.user_id);
    if (!free && paid && r.payment_status !== 'paid') {
      await db(env, fetcher, `event_registrations?event_id=eq.${eventId}&user_id=eq.${r.user_id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: 'paid' }),
      }).catch(() => {});
    }
    const p = profiles.get(r.user_id) || {};
    people.push({ email, paid, registered_at: r.created_at, attendance: r.attendance_status,
      first_name: p.real_first_name || p.display_name || null, gender: p.gender || null, age: ageAt(p.birth_date), city: p.city || null });
  }

  // Souhaits après la soirée (table créée par la migration speed_dating_v1).
  let wishes = [];
  const w = await db(env, fetcher, `speed_dating_wishes?event_id=eq.${eventId}&select=user_id,wished,message,created_at&order=created_at`);
  if (w.ok) {
    const emails = new Map();
    for (const p of rows) emails.set(p.user_id, people[rows.indexOf(p)]?.email);
    wishes = (await w.json()).map((x) => ({ from: emails.get(x.user_id) || 'membre', wished: x.wished, message: x.message, at: x.created_at }));
  }
  return json({ people, wishes, wishesAvailable: w.ok, free });
}
