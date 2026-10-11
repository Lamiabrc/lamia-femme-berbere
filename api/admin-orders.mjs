import { listPreorders } from '../lib/preorders.mjs';
import { json } from '../lib/event-tickets.mjs';

export async function GET(request) {
  try { return await listPreorders(request); }
  catch { console.error('admin-orders failed'); return json({ error: 'temporary_failure' }, 502); }
}
