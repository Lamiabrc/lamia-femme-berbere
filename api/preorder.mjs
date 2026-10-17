import Stripe from 'stripe';
import { createPreorder } from '../lib/preorders.mjs';
import { json } from '../lib/event-tickets.mjs';

// Commande d'un article : ouvre le paiement sécurisé Stripe (ou enregistre la commande
// tant que le paiement en ligne n'est pas activé).
export async function POST(request) {
  const key = process.env.STRIPE_SECRET_KEY;
  try { return await createPreorder(request, { stripe: key ? new Stripe(key) : null }); }
  catch { console.error('order failed'); return json({ error: 'temporary_failure' }, 502); }
}
