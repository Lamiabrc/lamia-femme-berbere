import { handleBal } from '../lib/bal.mjs';
import { json } from '../lib/event-tickets.mjs';

// La salle du Bal masqué (participants et poste de Lamia).
export async function POST(request) {
  try { return await handleBal(request); }
  catch (e) {
    console.error('bal failed', e?.message);
    const error = e?.status === 409 ? 'state_changed' : ['video_service_failed', 'video_not_configured'].includes(e?.message) ? e.message : 'temporary_failure';
    return json({ error }, e?.status === 409 ? 409 : 502);
  }
}
