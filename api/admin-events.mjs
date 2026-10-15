import Stripe from 'stripe';
import { adminEventReport, json } from '../lib/event-tickets.mjs';
import { manageDatingEvents } from '../lib/dating-events.mjs';

export async function POST(request) {
  try { return await manageDatingEvents(request); }
  catch { return json({error:'temporary_failure'},502); }
}

// Tableau des soirées pour Lamia : réservé au rôle admin, vérifié côté serveur.
export async function GET(request) {
  const key = process.env.STRIPE_SECRET_KEY;
  try {
    return await adminEventReport(request, { stripe: key ? new Stripe(key) : null });
  } catch {
    console.error('admin-events failed');
    return json({ error: 'temporary_failure' }, 502);
  }
}
