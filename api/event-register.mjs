/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
import { registerForEvent } from '../lib/event-register.mjs';
import { json } from '../lib/event-tickets.mjs';

// Inscription directe aux soirées gratuites (sans email de confirmation).
export async function POST(request) {
  try { return await registerForEvent(request); }
  catch (e) { console.error('event-register failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
}
