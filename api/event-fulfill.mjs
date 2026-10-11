import Stripe from 'stripe';
import { handleFulfill } from '../lib/event-tickets.mjs';

// Confirme une place après paiement, en relisant la session chez Stripe.
export async function GET(request) {
  const key = process.env.STRIPE_SECRET_KEY;
  return handleFulfill(request, { stripe: key ? new Stripe(key) : null });
}
