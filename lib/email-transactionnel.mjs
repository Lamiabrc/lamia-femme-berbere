// Transport commun. La réussite signifie « accepté par le fournisseur », pas livré.
// Le secours n'est utilisé qu'après un refus certain : jamais après une réponse
// perdue ou un délai dépassé, qui pourrait masquer un email déjà enregistré.
import { createHash } from 'node:crypto';
import { reserverNotification } from './email-notifications.mjs';

const ADRESSE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export const emailConfigure = (env = process.env) => Boolean(env.RESEND_API_KEY || (env.BREVO_API_KEY && env.BREVO_FROM));
export function expediteur(valeur) {
  const s = String(valeur || '').trim();
  const m = s.match(/^([^<>]+)\s*<([^<>]+)>$/);
  const email = (m ? m[2] : s).trim();
  return ADRESSE.test(email) && !/[\r\n]/.test(s) ? { email, ...(m ? { name: m[1].trim().replace(/^"|"$/g, '') } : {}) } : null;
}
const ECHEC_CERTAIN = new Set(['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded', 'quota_exceeded', 'invalid_api_key', 'missing_api_key']);
function refusSecourable(status, code) {
  // Ne pas contourner une suppression, un désabonnement, un destinataire invalide
  // ou un rejet de contenu en changeant de fournisseur.
  return status === 429 || ([401, 403].includes(status) && ECHEC_CERTAIN.has(code));
}

export async function envoyerEmail({ to, from, subject, html, text, cle, notification = false, evenement = null }, {
  env = process.env, fetcher = fetch, timeoutMs = 3500, now = () => new Date(),
} = {}) {
  const destinataires = (Array.isArray(to) ? to : [to]).map(x => String(x || '').trim());
  if (!destinataires.length || destinataires.some(x => !ADRESSE.test(x) || /[\r\n]/.test(x))) return { ok: false, etat: 'destinataire_invalide' };
  if(notification){
    if(destinataires.length!==1)return {ok:false,etat:'notification_multiple_refusee'};
    if(!emailConfigure(env))return {ok:false,etat:'non_configure'};
    const budget=await reserverNotification(destinataires[0],{env,fetcher,now,evenement});
    if(!budget.ok)return {ok:false,etat:'notification_limitee',motif:budget.motif};
  }
  const sender = from || env.CONFIDENCES_FROM || env.RESEND_FROM;
  const id = createHash('sha256').update(cle || JSON.stringify([destinataires, sender, subject, html, text, ...(evenement ? [evenement] : [])])).digest('hex');
  const delai = Math.max(100, Math.min(Number(timeoutMs) || 10000, 15000));
  const tenter = async (url, headers, body, fournisseur) => {
    let r;
    try { r = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(delai) }); }
    catch { return { ok: false, etat: 'incertain', fournisseur, secours: false }; }
    const d = await Promise.resolve().then(() => r.json()).catch(() => ({}));
    if (r.ok) return { ok: true, etat: 'accepte', fournisseur, id: d.id || d.messageId || null };
    const code = typeof d.name === 'string' ? d.name : typeof d.code === 'string' ? d.code : '';
    return { ok: false, etat: r.status >= 500 ? 'incertain' : 'refuse', fournisseur, statut: r.status, secours: refusSecourable(r.status, code) };
  };
  let premier = null;
  if (env.RESEND_API_KEY) {
    if (!expediteur(sender)) return { ok: false, etat: 'expediteur_invalide' };
    let incertain = false;
    for (let essai = 0; essai < 3; essai++) {
      if (essai) await new Promise(r => setTimeout(r, Math.min(1000, Math.max(1, Number(env.EMAIL_RETRY_PAUSE_MS || env.RESEND_PAUSE_MS) || 250)) * essai));
      premier = await tenter('https://api.resend.com/emails', { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Idempotency-Key': `tayri/${id}` },
        { from: sender, to: destinataires, subject, html, text }, 'resend');
      incertain ||= premier.etat === 'incertain';
      if (premier.ok) return premier;
      // Même clé chez le même fournisseur : une réponse perdue n'entraîne pas un nouvel email.
      if (premier.etat !== 'incertain' && !(premier.statut === 429 && !(env.BREVO_API_KEY && env.BREVO_FROM))) break;
    }
    if (incertain) return { ...premier, etat: 'incertain', secours: false };
    if (premier.ok || !premier.secours) return premier;
  }
  if (env.BREVO_API_KEY && env.BREVO_FROM) {
    const secours = expediteur(env.BREVO_FROM);
    if (!secours) return { ok: false, etat: 'expediteur_secours_invalide', ...(premier ? { premier: premier.etat } : {}) };
    return tenter('https://api.brevo.com/v3/smtp/email', { 'api-key': env.BREVO_API_KEY }, {
      sender: secours, to: destinataires.map(email => ({ email })), subject, htmlContent: html, textContent: text,
      headers: { idempotencyKey: id },
    }, 'brevo');
  }
  return premier || { ok: false, etat: 'non_configure' };
}
