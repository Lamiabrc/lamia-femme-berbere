import { registerForEvent } from '../lib/event-register.mjs';
import { json } from '../lib/event-tickets.mjs';

// Réservation gratuite pour un compte connecté avec une adresse email vérifiée.
export async function POST(request) {
  try { return await registerForEvent(request); }
  catch (e) { console.error('event-register failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
}
