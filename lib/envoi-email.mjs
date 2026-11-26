// Envoi d'un email (26 nov. 2026) : Brevo d'abord (plan gratuit, 300 par jour), Resend en secours.
// Si Brevo refuse ou ne répond pas, le même email repart par Resend : on ne perd plus de lien de connexion.
// Renvoie true si l'un des deux a accepté l'email.

const DEFAUT = 'Lamia Femme Berbère <onboarding@resend.dev>';

// « Lamia Femme Berbère <contact@domaine.com> » → { name, email }
export function expediteur(from) {
  const t = String(from || '').trim();
  const m = t.match(/^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || undefined, email: m[2] };
  return { email: t };
}

async function viaBrevo(env, fetcher, { from, to, subject, html, text }) {
  const sender = expediteur(from);
  // L'adresse de test de Resend n'existe pas chez Brevo : sans vraie adresse d'expédition, on passe directement à Resend.
  if (!sender.email || /@resend\.dev$/i.test(sender.email)) return false;
  const r = await fetcher('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender, to: to.map((email) => ({ email })), subject, htmlContent: html, ...(text ? { textContent: text } : {}) }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  return Boolean(r?.ok);
}

async function viaResend(env, fetcher, { from, to, subject, html, text }, { essais = 1, pause = 1100 } = {}) {
  for (let essai = 0; essai < essais; essai += 1) {
    if (essai) await new Promise((ok) => setTimeout(ok, pause * essai));
    const r = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (r?.ok) return true;
    // Une erreur définitive (adresse refusée, quota) ne sert à rien de la réessayer ; 429 et 5xx, si.
    if (r && r.status !== 429 && r.status < 500) return false;
  }
  return false;
}

export const emailPossible = (env = {}) => Boolean(env.BREVO_API_KEY || env.RESEND_API_KEY);

export async function envoyerEmail(env = {}, fetcher = fetch, { from, to, subject, html, text }, options = {}) {
  const dest = (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);
  if (!dest.length) return false;
  const mail = { from: from || DEFAUT, to: dest, subject, html, text };
  if (env.BREVO_API_KEY && (await viaBrevo(env, fetcher, mail))) return true;
  if (env.RESEND_API_KEY) return viaResend(env, fetcher, mail, options);
  return false;
}
