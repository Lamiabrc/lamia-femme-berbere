import { myOrders } from '../lib/mes-achats.mjs';
import { json } from '../lib/event-tickets.mjs';

export async function GET(request) {
  try { return await myOrders(request); }
  catch { console.error('mes-achats failed'); return json({ error: 'temporary_failure' }, 502); }
}
