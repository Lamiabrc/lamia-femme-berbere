import { handleConfidences } from '../lib/confidences.mjs';
import { json } from '../lib/event-tickets.mjs';
import { envoyerNouveautes } from '../lib/nouveautes.mjs';

// L'outil de matching de Lamia tourne sur son ordinateur (http://127.0.0.1:18080) : il a le droit d'appeler cette API.
const OUTIL = /^http:\/\/(127\.0\.0\.1|localhost):18080$/;
const cors = (request, res) => {
  const o = request.headers.get('origin') || '';
  if (!OUTIL.test(o)) return res;
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', o); h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS'); h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: h });
};

// Les Confidences avec Lamia : confidences, conversations privées, espace de Lamia, notifications, profils.
export async function POST(request) {
  try { return cors(request, await handleConfidences(request)); }
  catch (e) { console.error('confidences failed', e?.message); return cors(request, json({ error: 'temporary_failure' }, 502)); }
}
export async function OPTIONS(request) {
  return cors(request, new Response(null, { status: 204 }));
}

// Chaque soir (tâche programmée de Vercel) : les nouveautés pas encore annoncées partent en notification, regroupées.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? request.headers.get('authorization') === `Bearer ${secret}` : /vercel-cron/i.test(request.headers.get('user-agent') || '');
  if (!ok) return json({ error: 'forbidden' }, 403);
  try { return json({ ok: true, ...(await envoyerNouveautes()) }); }
  catch (e) { console.error('nouveautes failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
}
