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

const PUBLIQUES = { annonces_publiques: { action: 'annonces_publiques', s: 120 }, annonce_places_bal: { action: 'annonce_places_bal', s: 60 }, annonce_nouveautes: { action: 'annonce_nouveautes', s: 300 } };

// Chaque soir (tâche programmée de Vercel) : les nouveautés pas encore annoncées partent en notification, regroupées.
export async function GET(request) {
  // Économie : les listes identiques pour tous les visiteurs sont servies par le réseau de Vercel (cache),
  // sans réveiller le serveur à chaque page.
  const publique = PUBLIQUES[new URL(request.url).searchParams.get('action') || ''];
  if (publique) {
    try {
      const r = await handleConfidences(new Request('https://lamia-femme-berbere.com/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: publique.action }) }));
      if (!r.ok) return r;
      return new Response(await r.text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=0, s-maxage=${publique.s}, stale-while-revalidate=${publique.s * 5}` } });
    } catch (e) { console.error('confidences failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
  }
  const secret = process.env.CRON_SECRET;
  const ok = secret ? request.headers.get('authorization') === `Bearer ${secret}` : /vercel-cron/i.test(request.headers.get('user-agent') || '');
  if (!ok) return json({ error: 'forbidden' }, 403);
  try {
    const nouveautes = await envoyerNouveautes();
    // Rappel aux discussions qui se terminent demain.
    const r = await handleConfidences(new Request('https://lamia-femme-berbere.com/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annonce_rappels_cron' }) }), { cron: true }).catch(() => null);
    // Filet de sécurité : les rappels des salons tournent aussi une fois par jour d'ici.
    await handleConfidences(new Request('https://lamia-femme-berbere.com/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'salon_cron' }) }), { cron: true }).catch(() => null);
    // Les testeurs ajoutés à la liste Google Play reçoivent le lien du test dans leur conversation avec Lamia.
    await handleConfidences(new Request('https://lamia-femme-berbere.com/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'testeurs_play_cron' }) }), { cron: true }).catch(() => null);
    return json({ ok: true, ...nouveautes, rappels: r ? (await r.json().catch(() => ({}))).rappels ?? null : null });
  }
  catch (e) { console.error('nouveautes failed', e?.message); return json({ error: 'temporary_failure' }, 502); }
}
