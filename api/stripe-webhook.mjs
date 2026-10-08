import { receiveStripeEvent } from '../lib/stripe-webhook.mjs';

export async function POST(request) {
  return receiveStripeEvent(request);
}

export function GET() {
  const configured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));
  return Response.json({endpoint: 'stripe-webhook', deployed: true, configured, checkoutEnabled: false},
    {headers: {'Cache-Control': 'no-store'}});
}
