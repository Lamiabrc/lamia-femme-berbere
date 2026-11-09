/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
import Stripe from 'stripe';
import { adminEventReport, json } from '../lib/event-tickets.mjs';

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
