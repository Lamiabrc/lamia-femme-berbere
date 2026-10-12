import { handleAdmin } from '../lib/admin.mjs';
import { json } from '../lib/event-tickets.mjs';

// Tableau de bord de Lamia (et compteur de visites anonyme).
async function handle(request) {
  try { return await handleAdmin(request); }
  catch (e) { console.error('admin failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
}
export const GET = handle;
export const POST = handle;
