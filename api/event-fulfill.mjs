import Stripe from 'stripe';
import { handleFulfill, json, configured } from '../lib/event-tickets.mjs';
import { fulfillOrderSession, ORDER_KIND, fichiersCommande, telechargerDepuisSession } from '../lib/preorders.mjs';

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
      // Livre numérique : lien de téléchargement (vérifié à nouveau au moment du clic).
      const fichiers = r.status === 'paid' ? await fichiersCommande(session.metadata.order_id).catch(() => []) : [];
      return json({ status: r.status, order_number: r.order_number || null, telechargements: fichiers.map((f) => ({ nom: f.nom, url: `/api/event-fulfill?type=telecharger&session_id=${encodeURIComponent(id)}` })) });
    } catch { return json({ status: 'error' }, 502); }
  }
  if (new URL(request.url).searchParams.get('type') === 'telecharger') {
    if (!configured(process.env) || !stripe || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return json({ status: 'invalid' }, 400);
    try {
      const r = await telechargerDepuisSession(await stripe.checkout.sessions.retrieve(id));
      if (r.status === 'ok') return new Response(null, { status: 302, headers: { Location: r.url, 'Cache-Control': 'no-store' } });
      return new Response('Ce lien de téléchargement n’est pas valable. Écris à Lamia avec ton numéro de commande : lamia.brechet@outlook.fr', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch { return json({ status: 'error' }, 502); }
  }
  return handleFulfill(request, { stripe });
}
