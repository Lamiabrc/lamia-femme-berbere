import Stripe from 'stripe';
import { handleFulfill, json, configured } from '../lib/event-tickets.mjs';
import { fulfillOrderSession, ORDER_KIND } from '../lib/preorders.mjs';

// Confirme un paiement au retour de Stripe, en relisant la session chez Stripe :
// place de soirée ou commande de la boutique.
export async function GET(request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const stripe = key ? new Stripe(key) : null;
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (new URL(request.url).searchParams.get('type') === 'commande') {
    if (!configured(process.env) || !stripe) return json({ status: 'not_configured' }, 503);
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return json({ status: 'invalid' }, 400);
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      if (session.metadata?.kind !== ORDER_KIND) return json({ status: 'not_an_order' }, 400);
      const r = await fulfillOrderSession(session);
      return json({ status: r.status, order_number: r.order_number || null });
    } catch { return json({ status: 'error' }, 502); }
  }
  return handleFulfill(request, { stripe });
}
