/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
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
