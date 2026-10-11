import { createPreorder } from '../lib/preorders.mjs';
import { json } from '../lib/event-tickets.mjs';

export async function POST(request) {
  try { return await createPreorder(request); }
  catch { console.error('preorder failed'); return json({ error: 'temporary_failure' }, 502); }
}
