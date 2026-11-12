import { DATABASE_URL, serviceHeaders } from '../lib/event-tickets.mjs';
import { etatPublic, lireEtat } from '../lib/live.mjs';

// Lamia est-elle en live ? Lu par chaque page de l'appli (fenêtre « Lamia est en live », pastille de l'onglet Live).
// Réponse publique, sans aucune donnée personnelle, gardée 20 secondes par le réseau de Vercel : presque aucun calcul.
export async function GET() {
  const env = process.env;
  let etat = etatPublic(null);
  if (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY) {
    const read = async (path) => { const r = await fetch(`${DATABASE_URL}${path}`, { headers: serviceHeaders(env), signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(`read ${r.status}`); return r.json(); };
    etat = etatPublic(await lireEtat(read).catch(() => null));
  }
  return new Response(JSON.stringify(etat), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=20, stale-while-revalidate=40' } });
}
