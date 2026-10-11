import Stripe from 'stripe';
import { createEventCheckout, json } from '../lib/event-tickets.mjs';

// Crée la session de paiement d'une place de soirée (fermé tant que CHECKOUT_ENABLED ≠ true).
export async function POST(request) {
  const key = process.env.STRIPE_SECRET_KEY;
  try {
    return await createEventCheckout(request, { stripe: key ? new Stripe(key) : null });
  } catch {
    console.error('event-checkout failed');
    return json({ error: 'temporary_failure' }, 502);
  }
}
