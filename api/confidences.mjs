import { handleConfidences } from '../lib/confidences.mjs';
import { json } from '../lib/event-tickets.mjs';

// Les Confidences avec Lamia : confidences, conversations privées, espace de Lamia, notifications.
export async function POST(request) {
  try { return await handleConfidences(request); }
  catch (e) { console.error('confidences failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
}
