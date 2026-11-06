// Prévient Lamia d'une nouvelle inscription ou d'une nouvelle vente :
// notification sur ses appareils (ceux activés dans son espace Confidences) et email.
// Mêmes réglages que les Confidences (adresse d'alerte, heures de silence pour les notifications).
// Ne bloque jamais l'inscription ou la vente : toute erreur est ignorée.
import { DATABASE_URL, serviceHeaders } from './event-tickets.mjs';
import { envoyerPush, genererClesVapid } from './webpush.mjs';
import { reglagesPropres, enSilence } from './confidences.mjs';

const SITE = 'https://lamia-femme-berbere.com';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

// Chaque alerte est rangée dans une catégorie : toutes vont dans le journal du tableau de bord,
// mais seules les catégories que Lamia a gardées sonnent sur son téléphone / arrivent par email.
export const CATEGORIES_ALERTE = {
  reciproque: { nom: 'Intérêts réciproques (les deux se sont choisis)', emoji: '', defaut: true },
  retrait: { nom: 'Retraits, effacements et dématchs', emoji: '', defaut: true },
  proposition: { nom: 'Réponses à tes propositions', emoji: '', defaut: true },
  boutique: { nom: 'Ventes, abonnements, inscriptions aux soirées', emoji: '', defaut: true },
  confidence: { nom: 'Nouvelles confidences et messages', emoji: '', defaut: true },
  demande: { nom: 'Matchs demandés (swipe, « ce profil m’intéresse »)', emoji: '', defaut: false },
  profil: { nom: 'Profils : nouveaux, modifiés, confirmés, reliés', emoji: '', defaut: false },
  nouveautes: { nom: 'Tes propres nouveautés envoyées aux membres', emoji: '', defaut: false },
};
export function categorieAlerte(titre = '', tag = '') {
  const t = String(titre);
  if (tag === 'reciproque' || /réciproque/i.test(t)) return 'reciproque';
  if (tag === 'reserve' || /retir|effacement|dématch|match terminé/i.test(t)) return 'retrait';
  if (tag === 'proposition' || /proposition/i.test(t)) return 'proposition';
  if (['vente', 'abonnement', 'inscription'].includes(tag)) return 'boutique';
  if (tag === 'confidence') return 'confidence';
  if (/match demandé/i.test(t)) return 'demande';
  return 'profil';
}
export function notifsPropres(v = {}) {
  return Object.fromEntries(Object.entries(CATEGORIES_ALERTE).map(([k, c]) => [k, typeof v?.[k] === 'boolean' ? v[k] : c.defaut]));
}
// Range une alerte dans le journal et dit si elle doit sonner. Ne jette jamais d'erreur.
export async function journaliser({ titre, lignes = [], lien = '', categorie = 'profil' }, { call, read }) {
  let notifs = notifsPropres();
  try { const [n] = await read('/rest/v1/platform_settings?key=eq.lamia_notifs&select=value'); notifs = notifsPropres(n?.value); } catch { /* */ }
  const sonne = notifs[categorie] !== false;
  try { await call('/rest/v1/journal_lamia', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ categorie, titre: String(titre).slice(0, 300), lignes: lignes.filter(Boolean).map((l) => String(l).slice(0, 500)).slice(0, 8), lien, notifie: sonne }) }); } catch { /* */ }
  return sonne;
}

// Une alerte qui parle d'un profil ouvre directement sa fiche : qui c'est, et pourquoi.
export function lienAlerte(titre, lien) {
  const m = String(titre).match(/n°\s*(\d+)/);
  return m ? `/tableau-de-bord#profil-${m[1]}` : lien;
}
export async function alerterLamia({ titre, lignes = [], lien = '/tableau-de-bord', tag = 'maison' }, { env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  lien = lienAlerte(titre, lien);
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return { push: 0, email: false };
  const call = (path, init = {}) => fetcher(`${DATABASE_URL}${path}`, { ...init, headers: serviceHeaders(env, init.headers), signal: AbortSignal.timeout(8000) });
  const read = async (path) => { const r = await call(path); return r.ok ? r.json() : []; };
  try {
    if (!(await journaliser({ titre, lignes, lien, categorie: categorieAlerte(titre, tag) }, { call, read }))) return { push: 0, email: false, silencieuse: true };
    const [regl] = await read('/rest/v1/platform_settings?key=eq.confidences_reglages&select=value');
    const reglages = reglagesPropres(regl?.value || {});
    let push = 0;
    if (reglages.alertes_push && !enSilence(reglages, now())) {
      const subs = await read('/rest/v1/push_subscriptions?pour=eq.lamia&select=id,endpoint,p256dh,auth');
      if (subs.length) {
        let [k] = await read('/rest/v1/platform_settings?key=eq.vapid&select=value');
        let keys = k?.value;
        if (!keys?.publicKey || !keys?.privateJwk) {
          keys = genererClesVapid();
          await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'vapid', value: keys, updated_at: now().toISOString() }) });
        }
        // Sur le téléphone : qui, de qui, et pourquoi, sans ouvrir.
        const refs = [...new Set([...titre.matchAll(/n°\s*(\d+)/g)].map((m) => m[1]))];
        const noms = refs.length ? await read(`/rest/v1/annonces?ref=in.(${refs.join(',')})&select=ref,prenom`) : [];
        const qui = refs.map((r) => { const p = noms.find((x) => String(x.ref) === r)?.prenom; return p ? `${p} (n° ${r})` : `n° ${r}`; }).join(' · ');
        const corps = [noms.length ? qui : '', lignes[0] || ''].filter(Boolean).join('\n');
        for (const s of subs) {
          const res = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: titre, body: corps, url: lien, tag: `${tag}-${Date.now()}` }, keys, { fetcher }).catch(() => ({ ok: false }));
          if (res.ok) push += 1;
          if (res.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    }
    let email = false;
    const to = reglages.email_alerte || String(env.CONFIDENCES_ALERT_EMAIL || '').trim();
    if (reglages.alertes_email && to && env.RESEND_API_KEY) {
      const from = env.BOUTIQUE_FROM || env.CONFIDENCES_FROM || env.RESEND_FROM || 'Lamia Femme Berbère <onboarding@resend.dev>';
      const html = `<div style="font-family:Georgia,serif;color:#2b2118;max-width:560px"><h2 style="font-weight:normal;color:#8a1024">${esc(titre)}</h2>${lignes.map((l) => `<p style="margin:6px 0">${esc(l)}</p>`).join('')}<p><a href="${SITE}${lien}" style="display:inline-block;margin-top:10px;padding:10px 18px;background:#8a1024;color:#fff;border-radius:999px;text-decoration:none">Ouvrir le tableau de bord</a></p></div>`;
      const r = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject: titre, html, text: `${titre}\n\n${lignes.join('\n')}\n\n${SITE}${lien}` }), signal: AbortSignal.timeout(8000) }).catch(() => null);
      email = Boolean(r?.ok);
    }
    return { push, email };
  } catch {
    return { push: 0, email: false };
  }
}
