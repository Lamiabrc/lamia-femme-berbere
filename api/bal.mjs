/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
import { handleBal } from '../lib/bal.mjs';
import { json } from '../lib/event-tickets.mjs';

// La salle du Bal masqué (participants et poste de Lamia).
export async function POST(request) {
  try { return await handleBal(request); }
  catch (e) { console.error('bal failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
}
