import Stripe from 'stripe';

export const EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted'
]);
const EXPECTED_ACCOUNT = 'acct_1OB0kuAiy7hcxWtQ';
const DATABASE_URL = 'https://tybwvxinigahhntfeeur.supabase.co';
const MAX_BODY_BYTES = 1024 * 1024;

function json(body, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

async function readRawBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new Error('too_large');
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('too_large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Durable inbox only: payment fulfillment must consume these events transactionally.
// Nothing here grants membership or marks an order paid from the browser return URL.
export async function receiveStripeEvent(request, {
  env = process.env, fetcher = fetch, logger = console
} = {}) {
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  const signature = request.headers.get('stripe-signature');
  if (!signature) return json({error: 'Missing Stripe signature'}, 400);
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = env.STRIPE_SECRET_KEY;
  const databaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!webhookSecret || !stripeKey || !databaseKey) {
    return json({error: 'Webhook configuration incomplete'}, 503);
  }
  let raw;
  try { raw = await readRawBody(request); }
  catch { return json({error: 'Invalid or oversized payload'}, 413); }
  let event;
  try {
    const stripe = new Stripe(stripeKey);
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret, 300);
  } catch {
    return json({error: 'Invalid Stripe signature or payload'}, 400);
  }
  if (!event.id || !event.type || !Number.isInteger(event.created) || !event.data?.object?.id) {
    return json({error: 'Malformed Stripe event'}, 400);
  }
  const expectedLive = /^(sk|rk)_live_/.test(stripeKey);
  if (event.livemode !== expectedLive || (event.account && event.account !== EXPECTED_ACCOUNT)) {
    return json({error: 'Unexpected Stripe account or mode'}, 400);
  }
  if (!EVENT_TYPES.has(event.type)) return json({received: true, ignored: true});
  const record = {
    stripe_event_id: event.id,
    event_type: event.type,
    stripe_object_id: event.data.object.id,
    stripe_account_id: EXPECTED_ACCOUNT,
    livemode: event.livemode,
    stripe_created_at: new Date(event.created * 1000).toISOString(),
    payload: event,
    processing_status: 'pending'
  };
  try {
    const headers = {
      apikey: databaseKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal'
    };
    // Legacy service_role JWT needs Authorization; new sb_secret keys use apikey.
    if (!databaseKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${databaseKey}`;
    const result = await fetcher(`${DATABASE_URL}/rest/v1/stripe_webhook_events?on_conflict=stripe_event_id`, {
      method: 'POST', headers, body: JSON.stringify(record), signal: AbortSignal.timeout(10000)
    });
    if (!result.ok) throw new Error('database_write_failed');
    return json({received: true});
  } catch {
    // No payload, customer data, key, or upstream response is logged.
    logger.error('Stripe webhook persistence failed', {eventId: event.id, type: event.type});
    return json({error: 'Temporary storage failure; please retry'}, 503);
  }
}
