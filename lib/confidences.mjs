// Les Confidences avec Lamia : confidences écrites ou vocales, conversations privées, espace de Lamia.
// Tout passe par ce serveur (clé de service Supabase) : les tables et le stockage « confidences » sont fermés au navigateur.
// Les fichiers sont envoyés directement au stockage privé grâce à des liens d'envoi signés, à usage unique.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DATABASE_URL, json, serviceHeaders, userFromRequest, isAdmin } from './event-tickets.mjs';
import { genererClesVapid, envoyerPush } from './webpush.mjs';
import { handleAnnonces } from './annonces.mjs';
import { lectureFiable, lecturesParRequete } from './supabase-lecture.mjs';
import { actionCouple } from './couple.mjs';
import { actionNouveautes } from './nouveautes.mjs';
import { alerterLamia, journaliser } from './alerte-lamia.mjs';
import { etatAbonnement, consommerUnite, rendreUnite } from './abonnements.mjs';
import { daily, ensureRoom, meetingToken } from './bal.mjs';
import { unite } from '../content/abonnements.mjs';
import { handleLive } from './live.mjs';
import { envoyerEmail, emailConfigure } from './email-transactionnel.mjs';

const SITE = 'https://lamia-femme-berbere.com';
const BUCKET = 'confidences';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Le lien d'inscription au test fermé Google Play (il s'ouvre une fois la version acceptée par Google).
export const LIEN_TEST_PLAY = 'https://play.google.com/apps/testing/com.lamiafemmeberbere.lfb';
export const MESSAGE_TESTEUR_PLAY = `Salam ! Merci d’avoir accepté de tester TAYRI sur Google Play.\n\nTon adresse est maintenant sur la liste des testeurs. Voici le lien pour rejoindre le test, à ouvrir sur ton téléphone Android connecté avec cette même adresse Gmail :\n${LIEN_TEST_PLAY}\n\n1. Ouvre le lien et appuie sur « Devenir testeur ».\n2. Installe TAYRI depuis Google Play.\n3. Garde l’appli installée au moins 14 jours.\n\nSi le lien ne marche pas encore, c’est que Google vérifie l’appli : réessaie dans quelques jours. Tu peux me répondre ici si tu as une question.\n\nLamia`;
// Notification « dernière étape » : un appui (ou le bouton) ouvre directement la page Google Play où l'on devient testeur.
export const PUSH_TESTEUR_PLAY = { title: 'TAYRI : dernière étape', body: 'Appuie sur « Devenir testeur » pour rejoindre le test sur Google Play, avec ton adresse Gmail.', url: LIEN_TEST_PLAY, tag: 'testeur-play', actions: [{ action: 'testeur', title: 'Devenir testeur' }], icon: '/images/marque/notif-lfb-2.png' };
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,180}\.[a-z]{2,24}$/i;
const STATUTS = ['a_lire', 'en_cours', 'termine'];
const MAX_FILES = 6;
const MAX_TOTAL = 60 * 1024 * 1024;

// Types de fichiers acceptés, avec leur taille maximale.
export const TYPES = {
  'audio/webm': ['audio', 25], 'audio/ogg': ['audio', 25], 'audio/mp4': ['audio', 25], 'audio/mpeg': ['audio', 25], 'audio/mp3': ['audio', 25],
  'audio/wav': ['audio', 25], 'audio/x-wav': ['audio', 25], 'audio/aac': ['audio', 25], 'audio/x-m4a': ['audio', 25], 'audio/m4a': ['audio', 25],
  'image/jpeg': ['image', 12], 'image/png': ['image', 12], 'image/webp': ['image', 12], 'image/gif': ['image', 12], 'image/heic': ['image', 12], 'image/heif': ['image', 12],
  'application/pdf': ['document', 15], 'text/plain': ['document', 2], 'application/msword': ['document', 15],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['document', 15],
  'application/vnd.oasis.opendocument.text': ['document', 15],
};
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf', 'text/plain': 'txt', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.oasis.opendocument.text': 'odt' };

export const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const baseType = (t) => String(t || '').split(';')[0].trim().toLowerCase();

// Vérifie la liste des fichiers annoncés avant l'envoi (type, taille, nombre).
export function verifierFichiers(list) {
  if (!Array.isArray(list)) return { files: [] };
  if (list.length > MAX_FILES) return { error: 'too_many_files' };
  const files = [];
  let total = 0;
  for (const f of list) {
    const mime = baseType(f?.type);
    const t = TYPES[mime];
    if (!t) return { error: 'file_type' };
    const size = Math.round(Number(f?.size));
    if (!(size > 0) || size > t[1] * 1024 * 1024) return { error: 'file_size' };
    total += size;
    files.push({ mime, kind: t[0], size, name: clean(f?.name, 120) || `${t[0]}.${EXT[mime]}`, duration: Math.max(0, Math.min(3600, Math.round(Number(f?.duration) || 0))) || null });
  }
  if (total > MAX_TOTAL) return { error: 'file_size' };
  return { files };
}

// Jeton qui autorise à terminer l'envoi d'un message (sans compte), lié au message et valable 2 heures.
export function jeton(env, messageId, now = Date.now()) {
  const exp = Math.floor(now / 1000) + 7200;
  const sig = createHmac('sha256', `${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY}|confidences`).update(`${messageId}.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}
export function jetonValide(env, messageId, token, now = Date.now()) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  const good = createHmac('sha256', `${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY}|confidences`).update(`${messageId}.${exp}`).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Heures de silence : pas de notification sur le téléphone entre « debut » et « fin » (heure de Paris).
export function enSilence(reglages, now = new Date()) {
  const d = Number(reglages?.silence_debut), f = Number(reglages?.silence_fin);
  if (!Number.isInteger(d) || !Number.isInteger(f) || d === f) return false;
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now).find((x) => x.type === 'hour')?.value) % 24;
  return d < f ? h >= d && h < f : h >= d || h < f;
}

export const REGLAGES_DEFAUT = { email_alerte: '', alertes_email: true, alertes_push: true, silence_debut: null, silence_fin: null, prevenir_visiteur: true };
export function reglagesPropres(v = {}) {
  const r = { ...REGLAGES_DEFAUT };
  const email = clean(v.email_alerte, 254).toLowerCase();
  r.email_alerte = EMAIL.test(email) ? email : '';
  for (const k of ['alertes_email', 'alertes_push', 'prevenir_visiteur']) if (typeof v[k] === 'boolean') r[k] = v[k];
  for (const k of ['silence_debut', 'silence_fin']) { const n = Number(v[k]); r[k] = v[k] === null || v[k] === '' || !Number.isInteger(n) || n < 0 || n > 23 ? null : n; }
  return r;
}

export const LECTURES_ESPACE = ['annonce_coaching', 'annonce_beta_moi', 'annonce_mes_blocages', 'annonce_mes_fiches_outil', 'annonce_propositions', 'annonce_avis_lamia', 'annonce_interets_recus', 'annonce_discussions', 'annonce_mes_photos'];
export async function handleConfidences(request, { env = process.env, fetcher = fetch, now = () => new Date(), cron = false, etat = etatAbonnement } = {}) {
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  const { call, read } = lecturesParRequete((path, init = {}) => lectureFiable(`${DATABASE_URL}${path}`, { ...init, headers: serviceHeaders(env, init.headers) }, { fetcher, timeoutMs:15000, contexte:action }));
  const insert = async (table, row) => {
    const r = await call(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error(`insert ${table} ${r.status}`);
    return (await r.json())[0];
  };
  const patch = (table, filter, row) => call(`/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  const setting = async (key) => { const r = await call(`/rest/v1/platform_settings?key=eq.${key}&select=value`); return r.ok ? (await r.json())[0]?.value ?? null : null; };
  const saveSetting = (key, value) => call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_at: now().toISOString() }) });

  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const action = clean(b.action, 30);
  const user = request.headers.get('authorization') ? await userFromRequest(request, { fetcher }) : null;
  const admin = isAdmin(user);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ipHash = createHash('sha256').update(`${ip}|${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY}`).digest('hex').slice(0, 24);

  // « Mon espace » : toutes les lectures de l'ouverture en UNE demande (une seule vérification de connexion), chaque réponse gardant sa forme habituelle.
  if (action === 'annonce_espace') {
    if (!user) return json({ error: 'login_required' }, 401);
    const reponses = {};
    await Promise.all(LECTURES_ESPACE.map(async (nom) => {
      try {
        const r = await handleConfidences(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ action: nom }) }), { env, fetcher, now, cron, etat });
        reponses[nom] = { status: r.status, body: await r.json().catch(() => ({})) };
      } catch { reponses[nom] = { status: 500, body: { error: 'erreur' } }; }
    }));
    return json({ ok: true, reponses });
  }

  // ---------------------------------------------------------------- outils communs
  async function liensEnvoi(threadId, messageId, files) {
    const out = [];
    for (const [i, f] of files.entries()) {
      const path = `${threadId}/${messageId}/${i + 1}-${f.kind}.${EXT[f.mime]}`;
      const r = await call(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', body: '{}' });
      if (!r.ok) throw new Error(`sign ${r.status}`);
      const { url } = await r.json();
      await insert('confidence_files', { message_id: messageId, thread_id: threadId, storage_path: path, kind: f.kind, mime: f.mime, size_bytes: f.size, original_name: f.name, duration_s: f.duration });
      out.push({ path, url: `${DATABASE_URL}/storage/v1${url}`, type: f.mime });
    }
    return out;
  }
  async function liensLecture(files) {
    if (!files.length) return {};
    const r = await call(`/storage/v1/object/sign/${BUCKET}`, { method: 'POST', body: JSON.stringify({ expiresIn: 1800, paths: files.map((f) => f.storage_path) }) });
    if (!r.ok) return {};
    const list = await r.json();
    return Object.fromEntries(list.filter((x) => x.signedURL).map((x) => [x.path, `${DATABASE_URL}/storage/v1${x.signedURL}`]));
  }
  async function filComplet(thread) {
    const [messages, files] = await Promise.all([
      read(`/rest/v1/confidence_messages?thread_id=eq.${thread.id}&ready=eq.true&select=id,author,body,created_at&order=created_at`),
      read(`/rest/v1/confidence_files?thread_id=eq.${thread.id}&select=id,message_id,storage_path,kind,mime,size_bytes,original_name,duration_s`),
    ]);
    const urls = await liensLecture(files);
    return { ...thread, messages: messages.map((m) => ({ ...m, files: files.filter((f) => f.message_id === m.id).map(({ storage_path, ...f }) => ({ ...f, url: urls[storage_path] || null })) })) };
  }
  async function supprimerFil(threadId) {
    const files = await read(`/rest/v1/confidence_files?thread_id=eq.${threadId}&select=storage_path`);
    if (files.length) await call(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: files.map((f) => f.storage_path) }) });
    await call(`/rest/v1/confidence_threads?id=eq.${threadId}`, { method: 'DELETE' });
  }
  async function cleVapid() {
    let k = await setting('vapid');
    if (!k?.publicKey || !k?.privateJwk) { k = genererClesVapid(); await saveSetting('vapid', k); }
    return k;
  }
  // 24 nov. 2026 : quota Resend du mois dépassé (3 353 / 3 000). Mode économie : seuls les emails « essentiels »
  // (confirmation de compte, lien de connexion) partent ; tout le reste passe par les notifications et l'espace du membre.
  // Pour tout rétablir (offre payante ou autre fournisseur) : variable EMAILS_TOUS=1 dans Vercel.
  async function email(to, subject, html, text, essentiel = false, {evenement=null} = {}) {
    if (!emailConfigure(env) || !to) return false;
    if (!essentiel && env.EMAILS_TOUS !== '1') return false;
    const from = env.CONFIDENCES_FROM || env.RESEND_FROM || 'Lamia Femme Berbère <onboarding@resend.dev>';
    // Le transport commun conserve les reprises idempotentes et bascule vers Brevo après un quota refusé.
    const r = await envoyerEmail({ from, to, subject, html, text, notification: !essentiel, evenement }, { env, fetcher, now });
    if (!r.ok && (r.etat !== 'notification_limitee' || r.motif === 'budget_indisponible')) console.warn('email_transactionnel', { etat: r.etat, motif:r.motif||null, fournisseur: r.fournisseur || null, statut: r.statut || null });
    return r.ok;
  }
  // Prévient Lamia : notification sur ses appareils (sans contenu) et journal. Pas d'email.
  async function prevenirLamia(thread, message, nouveau) {
    const reglages = reglagesPropres((await setting('confidences_reglages')) || {});
    // Pas d'alerte en rafale : une seule par conversation toutes les 10 minutes.
    const recent = await read(`/rest/v1/confidence_messages?thread_id=eq.${thread.id}&author=eq.visiteur&ready=eq.true&id=neq.${message.id}&created_at=gte.${encodeURIComponent(new Date(now().getTime() - 600e3).toISOString())}&select=id&limit=1`).catch(() => []);
    if (recent.length) return { push: 0, email: false, groupee: true };
    if (!(await journaliser({ titre: nouveau ? 'Nouvelle confidence' : 'Nouveau message dans une confidence', lignes: [thread.name ? `De ${thread.name}` : ''], lien: `/confidences-lamia/#${thread.id}`, categorie: 'confidence' }, { call, read }))) return { push: 0, email: false, silencieuse: true };
    const lien = `${SITE}/confidences-lamia/#${thread.id}`;
    let push = 0;
    if (reglages.alertes_push && !enSilence(reglages, now())) {
      const subs = await read('/rest/v1/push_subscriptions?pour=eq.lamia&select=id,endpoint,p256dh,auth').catch(() => []);
      if (subs.length) {
        const keys = await cleVapid();
        const titre = nouveau ? 'Nouvelle confidence' : 'Nouveau message';
        for (const s of subs) {
          const res = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: titre, body: 'Ouvre ton espace pour la lire.', url: `/confidences-lamia/#${thread.id}`, tag: `conf-${thread.id}` }, keys, { fetcher }).catch(() => ({ ok: false }));
          if (res.ok) { push += 1; patch('push_subscriptions', `id=eq.${s.id}`, { last_ok_at: now().toISOString() }).catch(() => {}); }
          if (res.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    }
    // Pas d'email pour les confidences : elles se lisent dans l'application (email réservé aux ventes et encaissements).
    return { push, email: false };
  }
  async function prevenirVisiteur(thread, { force = false, premier = false } = {}) {
    const reglages = reglagesPropres((await setting('confidences_reglages')) || {});
    if (!reglages.prevenir_visiteur && !force) return false;
    const lien = `${SITE}/confidences/#conversation`;
    const quoi = premier ? 'Lamia t’a écrit' : 'Lamia t’a répondu', bouton = premier ? 'Lire son message' : 'Lire sa réponse';
    return email(thread.email, `${quoi} · Les Confidences`,
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonjour ${esc(thread.name)},</h2><p>${quoi} dans ta conversation privée.</p><p><a href="${lien}" style="display:inline-block;padding:10px 18px;background:#9c6b78;color:#fff;border-radius:999px;text-decoration:none">${bouton}</a></p><p style="font-size:12px;color:#8a7a7e">Pour protéger ta vie privée, le message n’est pas recopié dans cet email. Connecte-toi avec cette adresse email pour le lire.</p></div>`,
      `Bonjour ${thread.name},\n\n${quoi} dans ta conversation privée.\n${bouton} : ${lien}\n\nConnecte-toi avec cette adresse email pour le lire.`);
  }
  // Lamia écrit la première à un membre (ou reprend sa conversation) : message texte visible tout de suite, membre prévenu.
  async function ecrireDeLamia(adresse, body, nom = '') {
    const mail = String(adresse || '').trim().toLowerCase();
    const fils = await read(`/rest/v1/confidence_threads?email=eq.${encodeURIComponent(mail)}&channel=eq.conversation&select=*&order=last_message_at.desc&limit=1`);
    let thread = fils[0];
    const premier = !thread;
    if (!thread) {
      const [a] = await read(`/rest/v1/annonces?email=eq.${encodeURIComponent(mail)}&select=prenom&order=created_at.desc&limit=1`).catch(() => []);
      const name = clean(nom, 80) || clean(a?.prenom, 80) || mail.split('@')[0].slice(0, 80);
      thread = await insert('confidence_threads', { email: mail, name, channel: 'conversation', status: 'en_cours' });
    }
    const t = now().toISOString();
    await insert('confidence_messages', { thread_id: thread.id, author: 'lamia', body, ready: true, created_at: t });
    await patch('confidence_threads', `id=eq.${thread.id}`, { last_message_at: t, unread_visitor: (thread.unread_visitor || 0) + 1, ...(thread.status === 'a_lire' ? { status: 'en_cours' } : {}) });
    const visiteur = await prevenirVisiteur(thread, { force: true, premier }).catch(() => false);
    const notification = await pousserVisiteur(mail).catch(() => 0);
    return { thread_id: thread.id, visiteur, notification };
  }
  // Notification sur le téléphone du membre (appli ou site installé), s'il les a activées.
  async function pousserVisiteur(mail) {
    const [a] = await read(`/rest/v1/annonces?email=eq.${encodeURIComponent(mail)}&user_id=not.is.null&select=user_id&limit=1`).catch(() => []);
    const [t] = a ? [] : await read(`/rest/v1/testeurs_play?email=eq.${encodeURIComponent(mail)}&select=user_id&limit=1`).catch(() => []);
    const userId = a?.user_id || t?.user_id;
    if (!userId) return 0;
    const subs = await read(`/rest/v1/push_subscriptions?user_id=eq.${userId}&pour=eq.membre&select=id,endpoint,p256dh,auth`).catch(() => []);
    if (!subs.length) return 0;
    const keys = await cleVapid();
    let n = 0;
    for (const s of subs) {
      const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: 'Lamia t’a écrit', body: 'Un nouveau message t’attend dans ta conversation privée.', url: '/confidences/#conversation', tag: `lamia-${Date.now()}`, icon: '/images/marque/notif-lfb-2.png' }, keys).catch(() => ({ ok: false }));
      if (r.ok) n += 1;
      if (r.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
    }
    return n;
  }
  // Email « Devenir testeur » avec le bouton qui ouvre la page Google Play du test. Une seule fois par membre.
  async function emailTesteur(t) {
    const [a] = await read(`/rest/v1/annonces?user_id=eq.${t.user_id}&select=prenom&limit=1`).catch(() => []);
    const prenom = clean(a?.prenom, 60);
    const ok = await email(t.email, 'TAYRI : dernière étape pour tester l’appli',
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#1f3c9c">Salam${prenom ? ` ${esc(prenom)}` : ''} !</h2><p>Merci d’avoir accepté de tester <b>TAYRI</b> sur Google Play. Ton adresse est bien sur la liste des testeurs.</p><p>Il reste une dernière étape, sinon Google ne te compte pas : sur ton téléphone Android, connecté avec <b>${esc(t.email)}</b>, appuie sur ce bouton, puis sur « Devenir testeur » :</p><p><a href="${LIEN_TEST_PLAY}" style="display:inline-block;padding:12px 22px;background:#1f3c9c;color:#fff;border-radius:999px;text-decoration:none">Devenir testeur</a></p><p>Ensuite, installe TAYRI depuis Google Play et garde l’appli au moins 14 jours.</p><p>Merci pour ton aide,<br>Lamia</p></div>`,
      `Salam${prenom ? ` ${prenom}` : ''} !\n\nMerci d’avoir accepté de tester TAYRI sur Google Play. Ton adresse est bien sur la liste des testeurs.\n\nDernière étape, sinon Google ne te compte pas : sur ton téléphone Android connecté avec ${t.email}, ouvre ce lien et appuie sur « Devenir testeur » :\n${LIEN_TEST_PLAY}\n\nEnsuite, installe TAYRI depuis Google Play et garde l’appli au moins 14 jours.\n\nMerci pour ton aide,\nLamia`);
    if (ok) await patch('testeurs_play', `user_id=eq.${t.user_id}`, { email_testeur_at: now().toISOString() });
    return ok;
  }
  async function emailerTesteurs(max) {
    const liste = await read(`/rest/v1/testeurs_play?ajoute_at=not.is.null&play_vu_at=is.null&email_testeur_at=is.null&select=user_id,email&order=ajoute_at&limit=${max + 1}`).catch(() => []);
    let envoyes = 0;
    for (const t of liste.slice(0, max)) if (await emailTesteur(t).catch(() => false)) envoyes += 1;
    return { envoyes, reste: Math.max(0, liste.length - max) };
  }
  // Notification « Devenir testeur » sur les téléphones d'un membre (s'il a activé les notifications).
  async function pousserTesteur(userId) {
    const subs = await read(`/rest/v1/push_subscriptions?user_id=eq.${userId}&pour=eq.membre&select=id,endpoint,p256dh,auth`).catch(() => []);
    if (!subs.length) return 0;
    const keys = await cleVapid();
    let n = 0;
    for (const s of subs) {
      const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, PUSH_TESTEUR_PLAY, keys, { fetcher }).catch(() => ({ ok: false }));
      if (r.ok) n += 1;
      if (r.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
    }
    return n;
  }
  // Crée le message (non visible tant que l'envoi n'est pas terminé) et les liens d'envoi des fichiers.
  async function nouveauMessage(thread, author, body, files) {
    const message = await insert('confidence_messages', { thread_id: thread.id, author, body: body || null, ip_hash: author === 'visiteur' ? ipHash : null });
    const uploads = await liensEnvoi(thread.id, message.id, files);
    return { thread_id: thread.id, message_id: message.id, token: jeton(env, message.id, now().getTime()), uploads };
  }
  async function tropDEnvois(limite) {
    const since = encodeURIComponent(new Date(now().getTime() - 3600e3).toISOString());
    const r = await read(`/rest/v1/confidence_messages?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id&limit=${limite + 1}`).catch(() => []);
    return r.length >= limite;
  }

  // Chaque soir : les testeurs ajoutés à la liste Google Play reçoivent le lien du test dans leur conversation avec Lamia.
  if (action === 'testeurs_play_cron') {
    if (!cron) return json({ error: 'forbidden' }, 403);
    // Ceux qui l'ont déjà reçu sont notés dans les réglages (une seule fois chacun).
    const deja = new Set((await setting('testeurs_play_lien_envoye')) || []);
    const liste = (await read('/rest/v1/testeurs_play?ajoute_at=not.is.null&select=user_id,email&order=ajoute_at&limit=500')).filter((t) => !deja.has(t.user_id));
    let envoyes = 0;
    for (const t of liste.slice(0, 50)) {
      try {
        await ecrireDeLamia(t.email, MESSAGE_TESTEUR_PLAY);
        await pousserTesteur(t.user_id).catch(() => 0);
        deja.add(t.user_id); envoyes += 1;
        await saveSetting('testeurs_play_lien_envoye', [...deja]);
      } catch (e) { console.error('testeur play', e?.message); }
    }
    const emails = await emailerTesteurs(40).catch(() => ({ envoyes: 0 }));
    return json({ ok: true, envoyes, emails: emails.envoyes });
  }

  // ---------------------------------------------------------------- « Notre couple », à part des rencontres (16 nov. 2026)
  if (action.startsWith('couple_')) {
    const alerter = (msg) => Promise.race([alerterLamia(msg, { env, fetcher, now }), new Promise((r) => setTimeout(r, 7000))]);
    // Mots doux : une notification sur le téléphone de l'autre.
    const pousser = async (userId, { titre, texte, lien = '/notre-couple/' }) => {
      const subs = await read(`/rest/v1/push_subscriptions?user_id=eq.${userId}&pour=eq.membre&select=id,endpoint,p256dh,auth`).catch(() => []);
      if (!subs.length) return 0;
      const keys = await cleVapid();
      let n = 0;
      for (const s of subs) {
        const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: titre, body: texte, url: lien, tag: `couple-${Date.now()}`, icon: '/images/marque/notif-lfb-2.png' }, keys, { fetcher }).catch(() => ({ ok: false }));
        if (r.ok) n += 1;
        if (r.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
      }
      return n;
    };
    // Soirées à distance : la soirée achetée seule, et la salle privée à deux (Daily, une salle par soirée, un jeton par personne).
    const soiree = {
      vendue: !unite('soiree_distance')?.horsVente,
      consommer: (email) => consommerUnite(email, 'soiree_distance', { env, fetcher }),
      rendre: (id) => rendreUnite(id, { env, fetcher }),
      salle: env.DAILY_API_KEY ? async (name, exp, nom) => {
        const api = daily(env, fetcher);
        const room = await ensureRoom(api, name, { exp, max: 2 });
        const j = await meetingToken(api, { room_name: room.name, exp, user_name: nom });
        return `${room.url}?t=${encodeURIComponent(j)}`;
      } : null,
    };
    return actionCouple(action, b, { read, insert, patch, call, now, user, alerter, pousser, soiree, journal: (x) => journaliser(x, { call, read }) });
  }

  // Mois sans soirée speed dating (Lamia, 23 nov. 2026) : les abonnés Passion et Prestige reçoivent à la place
  // 1 cœur avec message et 3 jours de profil mis en avant. Vérifié du 1er au 5 du mois suivant, une seule fois par mois.
  if (action === 'compensation_soirees_cron') {
    if (!cron) return json({ error: 'forbidden' }, 403);
    const t = now(), paris = new Date(t.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    if (paris.getDate() > 5) return json({ ok: true, rien: 'pas_le_moment' });
    const debut = new Date(Date.UTC(paris.getFullYear(), paris.getMonth() - 1, 1)), fin = new Date(Date.UTC(paris.getFullYear(), paris.getMonth(), 1));
    const mois = debut.toISOString().slice(0, 7), cle = `compensation_soirees_${mois}`;
    if (await setting(cle)) return json({ ok: true, rien: 'deja_fait', mois });
    const soirees = await read(`/rest/v1/salon_editions?statut=in.(confirme,terminee)&starts_at=gte.${encodeURIComponent(debut.toISOString())}&starts_at=lt.${encodeURIComponent(fin.toISOString())}&select=id&limit=1`).catch(() => null);
    if (soirees === null) return json({ ok: false, rien: 'lecture_impossible' });
    if (soirees.length) { await saveSetting(cle, { soirees: true, le: t.toISOString() }); return json({ ok: true, mois, soirees: true }); }
    const abos = await read('/rest/v1/abonnements?statut=eq.actif&formule=in.(passion,prestige)&select=email&limit=500').catch(() => []);
    let n = 0;
    for (const x of abos) {
      const mail = String(x.email || '').toLowerCase();
      if (!mail) continue;
      try {
        await insert('achats_unite', { email: mail, type: 'coeur_message', quantite: 1, utilisees: 0, montant_centimes: 0, stripe_session_id: `offert-sans-soiree-${mois}-coeur-${mail}` });
        const [a] = await read(`/rest/v1/annonces?email=eq.${encodeURIComponent(mail)}&user_id=not.is.null&select=user_id,avant_jusqu_a&limit=1`).catch(() => []);
        if (a?.user_id) {
          const finAvant = new Date(Math.max(a.avant_jusqu_a ? new Date(a.avant_jusqu_a).getTime() : 0, t.getTime()) + 3 * 86400e3).toISOString();
          await insert('achats_unite', { email: mail, type: 'profil_avant', quantite: 1, utilisees: 1, montant_centimes: 0, acces_jusqu_a: finAvant, stripe_session_id: `offert-sans-soiree-${mois}-avant-${mail}` });
          await patch('annonces', `user_id=eq.${a.user_id}`, { avant_jusqu_a: finAvant }).catch(() => {});
          await patch('profils_outil', `user_id=eq.${a.user_id}`, { avant_jusqu_a: finAvant }).catch(() => {});
        }
        await ecrireDeLamia(mail, 'Salam ! Il n’y a pas eu de soirée speed dating le mois dernier. À la place, je t’ai offert 1 cœur avec message et 3 jours de mise en avant de ton profil. C’est déjà dans ton espace. Lamia').catch(() => {});
        n += 1;
      } catch (e) { console.error('compensation soirée', e?.message); }
    }
    await saveSetting(cle, { soirees: false, abonnes: n, le: t.toISOString() });
    return json({ ok: true, mois, soirees: false, abonnes: n });
  }

  // ---------------------------------------------------------------- le live de Lamia dans l'appli (boîte à questions, console)
  if (action.startsWith('live_')) return handleLive(action, b, { env, fetcher, call, read, insert, patch, user, admin, now, ecrire: ecrireDeLamia });

  // ---------------------------------------------------------------- annonces de rencontre (dépôt, lecture, modération)
  if (['annonce_nouveautes', 'annonce_places_bal', 'annonce_notif_prefs', 'annonce_nouveautes_admin', 'annonce_nouveaute_publier', 'annonce_nouveautes_envoyer', 'annonce_nouveaute_suppr'].includes(action)) return actionNouveautes(action, b, { env, fetcher, now, admin, user });
  if (action === 'testeur_play' || action === 'mon_genre' || action.startsWith('annonce') || action.startsWith('outil_') || action.startsWith('match') || action.startsWith('salon_')) {
    const alerter = (msg) => Promise.race([alerterLamia(msg, { env, fetcher, now }), new Promise((r) => setTimeout(r, 7000))]);
    return handleAnnonces(action, b, { env, call, read, insert, patch, admin, user, ipHash, now, email, alerter, cron });
  }

  // Les Confidences sont fermées depuis le 15 nov. 2026 (Lamia : doublon avec sa conversation directe avec chaque membre).
  // Un membre répond toujours à Lamia quand c'est elle qui a écrit ; le signalement reste à part, ouvert à tous.
  const emailConfirme = user && (user.email_confirmed_at || user.confirmed_at) ? String(user.email || '').toLowerCase() : '';
  // CONFIDENCES_OUVERTES=true les rouvre aux abonnés, si Lamia change d'avis.
  // « Sans rencontre » (Lamia, 15 nov. 2026) : la personne vient pour la boutique, le live, le coaching de couple
  // et pour échanger avec Lamia. Elle peut lui écrire la première, gratuitement. Le choix est gardé dans son compte.
  const sansRencontre = async () => {
    if (!user?.id || !emailConfirme) return false;
    // En pause dans les rencontres : la personne garde Lamia en poche et peut lui écrire.
    const [enPause] = await read(`/rest/v1/annonces?user_id=eq.${user.id}&pause_at=not.is.null&select=id&limit=1`).catch(() => []);
    if (enPause) return true;
    // Le jeton peut dater d'avant le choix : on relit toujours le compte (appel rare, seulement ici).
    const r = await call(`/auth/v1/admin/users/${user.id}`).catch(() => null);
    return Boolean(r?.ok && (await r.json().catch(() => ({})))?.app_metadata?.sans_rencontre);
  };
  const estAbonne = async () => Boolean(admin || await sansRencontre() || (env.CONFIDENCES_OUVERTES === 'true' && emailConfirme && (await etat(emailConfirme, { env, fetcher }).catch(() => null))?.abonnement));
  if (action === 'confidences_acces') return json({ ok: true, connecte: Boolean(emailConfirme), abonne: await estAbonne() });
  if (action === 'sans_rencontre') {
    if (!user?.id || !emailConfirme) return json({ error: 'login_required' }, 401);
    if (b.choisir === undefined) return json({ ok: true, sans_rencontre: await sansRencontre() });
    const oui = b.choisir === true;
    const r = await call(`/auth/v1/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ app_metadata: { sans_rencontre: oui } }) }).catch(() => null);
    if (!r?.ok) return json({ error: 'temporary_failure' }, 502);
    if (oui) await insert('journal_lamia', { categorie: 'profil', titre: `Nouveau membre « sans rencontre » : ${clean(user.user_metadata?.first_name, 60) || emailConfirme.split('@')[0]}`, lignes: ['Vient pour la boutique, le live, le coaching de couple et pour t’écrire (sans profil ni swipe).'] }).catch(() => {});
    return json({ ok: true, sans_rencontre: oui });
  }

  // ---------------------------------------------------------------- 1 et 2 : confidence écrite ou vocale (abonnés)
  if (action === 'envoyer') {
    if (clean(b.website, 200)) return json({ ok: true, thread_id: null, message_id: null, uploads: [] }); // piège à robots
    if (!(await estAbonne())) return json({ error: 'reserve_abonnes' }, 403);
    if (b.consent !== true) return json({ error: 'consent_required' }, 400);
    // L'adresse est celle du compte : personne ne peut écrire au nom d'un abonné en tapant son email.
    const name = clean(b.name, 80), email = emailConfirme, phone = clean(b.phone, 40) || null;
    const body = clean(b.body, 8000);
    if (!name) return json({ error: 'missing_name' }, 400);
    const { files, error } = verifierFichiers(b.files);
    if (error) return json({ error }, 400);
    if (!body && !files.length) return json({ error: 'empty' }, 400);
    if (await tropDEnvois(6)) return json({ error: 'rate_limited' }, 429);
    const channel = b.channel === 'vocal' ? 'vocal' : 'ecrit';
    const thread = await insert('confidence_threads', { email, name, phone, channel });
    return json({ ok: true, ...(await nouveauMessage(thread, 'visiteur', body, files)) });
  }

  // ---------------------------------------------------------------- fin d'envoi : vérifie les fichiers, rend le message visible, prévient
  if (action === 'finaliser') {
    const messageId = clean(b.message_id, 40);
    if (!UUID.test(messageId) || !jetonValide(env, messageId, b.token, now().getTime())) return json({ error: 'forbidden' }, 403);
    const [message] = await read(`/rest/v1/confidence_messages?id=eq.${messageId}&select=id,thread_id,author,body,ready,created_at`);
    if (!message) return json({ error: 'not_found' }, 404);
    if (message.ready) return json({ ok: true, deja: true });
    const files = await read(`/rest/v1/confidence_files?message_id=eq.${messageId}&select=id,storage_path`);
    // On ne garde que les fichiers réellement arrivés dans le stockage.
    let restants = 0;
    if (files.length) {
      const r = await call(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix: `${message.thread_id}/${messageId}/`, limit: 100 }) });
      const presents = new Set(r.ok ? (await r.json()).map((o) => `${message.thread_id}/${messageId}/${o.name}`) : []);
      for (const f of files) {
        if (presents.has(f.storage_path)) restants += 1;
        else await call(`/rest/v1/confidence_files?id=eq.${f.id}`, { method: 'DELETE' });
      }
    }
    if (!message.body && !restants) { await call(`/rest/v1/confidence_messages?id=eq.${messageId}`, { method: 'DELETE' }); return json({ error: 'upload_failed' }, 400); }
    const [thread] = await read(`/rest/v1/confidence_threads?id=eq.${message.thread_id}&select=*`);
    const premier = (await read(`/rest/v1/confidence_messages?thread_id=eq.${thread.id}&ready=eq.true&select=id&limit=1`)).length === 0;
    await patch('confidence_messages', `id=eq.${messageId}`, { ready: true, created_at: now().toISOString() });
    const maj = { last_message_at: now().toISOString() };
    if (message.author === 'visiteur') { maj.unread_lamia = thread.unread_lamia + 1; if (thread.status === 'termine') maj.status = 'a_lire'; }
    else { maj.unread_visitor = thread.unread_visitor + 1; if (thread.status === 'a_lire') maj.status = 'en_cours'; }
    await patch('confidence_threads', `id=eq.${thread.id}`, maj);
    const alerte = message.author === 'visiteur' ? await prevenirLamia(thread, message, premier) : { visiteur: await prevenirVisiteur(thread) };
    return json({ ok: true, fichiers: restants, alerte });
  }

  // Parrainage (Lamia, 23 nov. 2026) : un nouveau compte venu par le lien d'invitation d'un membre (?invite=<n° de profil>).
  // Compté seulement pour un compte créé il y a moins de 3 jours, une seule fois, jamais pour soi-même.
  if (action === 'parrainage_noter') {
    if (!user?.id) return json({ error: 'login_required' }, 401);
    const ref = Number.parseInt(String(b.code ?? ''), 10);
    if (!Number.isFinite(ref) || ref <= 0) return json({ ok: false, raison: 'code' });
    const [p] = await read(`/rest/v1/annonces?ref=eq.${ref}&user_id=not.is.null&select=user_id&limit=1`).catch(() => []);
    if (!p?.user_id || p.user_id === user.id) return json({ ok: false, raison: 'code' });
    const r = await call(`/auth/v1/admin/users/${user.id}`).catch(() => null);
    const u = r?.ok ? await r.json().catch(() => null) : null;
    if (!u?.created_at || now().getTime() - new Date(u.created_at).getTime() > 3 * 86400e3) return json({ ok: false, raison: 'ancien_compte' });
    await call('/rest/v1/parrainages?on_conflict=filleul_user_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ filleul_user_id: user.id, parrain_user_id: p.user_id }) }).catch(() => null);
    return json({ ok: true });
  }
  // Le membre a ouvert la version Google Play de l'appli : il l'a donc installée (noté une fois).
  if (action === 'testeur_play_vu') {
    if (!user?.id) return json({ error: 'login_required' }, 401);
    await patch('testeurs_play', `user_id=eq.${user.id}&play_vu_at=is.null`, { play_vu_at: now().toISOString() }).catch(() => {});
    return json({ ok: true });
  }
  // Bandeau « Devenir testeur » : le membre connecté est-il sur la liste des testeurs Google Play ?
  if (action === 'testeur_play_moi') {
    if (!user?.id) return json({ error: 'login_required' }, 401);
    const [t] = await read(`/rest/v1/testeurs_play?user_id=eq.${user.id}&ajoute_at=not.is.null&play_vu_at=is.null&select=user_id&limit=1`).catch(() => []);
    return json({ ok: true, sur_liste: Boolean(t), lien: t ? LIEN_TEST_PLAY : null });
  }

  // ---------------------------------------------------------------- 3 : conversation privée (connexion par lien email)
  if (['mes_conversations', 'ecrire', 'supprimer_ma_conversation', 'mes_non_lus'].includes(action)) {
    const email = String(user?.email || '').toLowerCase();
    if (!user || !email || !user.email_confirmed_at && !user.confirmed_at) return json({ error: 'login_required' }, 401);
    const mine = await read(`/rest/v1/confidence_threads?email=eq.${encodeURIComponent(email)}&select=*&order=last_message_at.desc`);
    // Pour le bandeau de l'appli : combien de messages de Lamia ne sont pas encore lus.
    if (action === 'mes_non_lus') return json({ ok: true, non_lus: mine.reduce((n, t) => n + (t.unread_visitor || 0), 0) });
    if (action === 'mes_conversations') {
      const threads = await Promise.all(mine.map(filComplet));
      if (mine.some((t) => t.unread_visitor)) await patch('confidence_threads', `email=eq.${encodeURIComponent(email)}`, { unread_visitor: 0 });
      return json({ ok: true, email, abonne: await estAbonne(), threads: threads.filter((t) => t.messages.length).map(({ unread_lamia, ...t }) => ({ ...t, lamia_a_ecrit: t.messages.some((m) => m.author === 'lamia') })) });
    }
    if (action === 'supprimer_ma_conversation') {
      const t = mine.find((x) => x.id === b.thread_id);
      if (!t) return json({ error: 'not_found' }, 404);
      await supprimerFil(t.id);
      return json({ ok: true });
    }
    // ecrire : relire et supprimer restent possibles sans abonnement, pas écrire… sauf pour répondre à Lamia quand elle a écrit.
    const filDemande = b.thread_id ? mine.find((x) => x.id === b.thread_id) : null;
    const lamiaAEcrit = filDemande ? (await read(`/rest/v1/confidence_messages?thread_id=eq.${filDemande.id}&author=eq.lamia&ready=eq.true&select=id&limit=1`)).length > 0 : false;
    if (!lamiaAEcrit && !(await estAbonne())) return json({ error: 'reserve_abonnes' }, 403);
    const body = clean(b.body, 8000);
    const { files, error } = verifierFichiers(b.files);
    if (error) return json({ error }, 400);
    if (!body && !files.length) return json({ error: 'empty' }, 400);
    if (await tropDEnvois(30)) return json({ error: 'rate_limited' }, 429);
    let thread = b.thread_id ? mine.find((x) => x.id === b.thread_id) : null;
    if (b.thread_id && !thread) return json({ error: 'not_found' }, 404);
    if (!thread) {
      if (b.consent !== true) return json({ error: 'consent_required' }, 400);
      const name = clean(b.name, 80) || clean(user.user_metadata?.first_name, 80) || email.split('@')[0].slice(0, 80);
      thread = await insert('confidence_threads', { email, name, phone: clean(b.phone, 40) || null, channel: 'conversation' });
    }
    return json({ ok: true, ...(await nouveauMessage(thread, 'visiteur', body, files)) });
  }

  // ---------------------------------------------------------------- espace de Lamia
  if (!admin) return json({ error: 'forbidden' }, 403);

  // Qui écrit : son annonce ou son compte, retrouvés par l'email de la conversation. Pour Lamia seule.
  const profilDuFil = async (email) => {
    const mail = String(email || '').trim().toLowerCase();
    if (!mail) return null;
    const annonces = await read(`/rest/v1/annonces?email=ilike.${encodeURIComponent(mail)}&select=id,ref,email,user_id,status,test&order=created_at.desc&limit=20`).catch(() => []);
    const a = annonces.find((x) => String(x.email).toLowerCase() === mail);
    if (a) {
      const nb = a.test ? 2 : (await read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&kind=eq.photo&select=id`).catch(() => null))?.length;
      return { ref: a.ref, user_id: a.user_id || null, photos: Number.isFinite(nb) ? nb : null };
    }
    const r = await call('/auth/v1/admin/users?per_page=1000').catch(() => null);
    const liste = r?.ok ? await r.json().catch(() => null) : null;
    const u = (liste?.users || []).find((x) => String(x.email).toLowerCase() === mail);
    return u ? { ref: null, user_id: u.id } : null;
  };
  // Les membres qui ont dit « Oui » au test Google Play, avec où ils en sont et leur conversation.
  if (action === 'lamia_testeurs') {
    const liste = await read('/rest/v1/testeurs_play?select=user_id,email,appli_installee,demande_at,ajoute_at,play_vu_at,email_testeur_at&order=demande_at.desc&limit=500');
    const deja = new Set((await setting('testeurs_play_lien_envoye')) || []);
    const ids = liste.map((t) => t.user_id), mails = liste.map((t) => t.email);
    const enc = (l) => l.map((x) => `"${String(x).replace(/"/g, '')}"`).join(',');
    const [annonces, fiches, fils] = liste.length ? await Promise.all([
      read(`/rest/v1/annonces?user_id=in.(${ids.join(',')})&select=ref,prenom,user_id`).catch(() => []),
      read(`/rest/v1/profils_outil?user_id=in.(${ids.join(',')})&select=ref,user_id`).catch(() => []),
      read(`/rest/v1/confidence_threads?email=in.(${encodeURIComponent(enc(mails))})&channel=eq.conversation&select=id,email,last_message_at&order=last_message_at.desc`).catch(() => []),
    ]) : [[], [], []];
    return json({ ok: true, lien: LIEN_TEST_PLAY, testeurs: liste.map((t) => {
      const a = annonces.find((x) => x.user_id === t.user_id), f = fiches.find((x) => x.user_id === t.user_id);
      return { ...t, prenom: a?.prenom || '', ref: a?.ref || f?.ref || null, lien_envoye: deja.has(t.user_id), thread_id: fils.find((x) => x.email === t.email)?.id || null };
    }) });
  }
  // Lamia envoie l'email « Devenir testeur » à ceux qui ne l'ont pas encore reçu (40 par appui).
  if (action === 'lamia_testeurs_email') return json({ ok: true, ...(await emailerTesteurs(40)) });
  // Lamia relance tous les testeurs de la liste : notification avec le bouton « Devenir testeur ».
  if (action === 'lamia_testeurs_relancer') {
    const liste = await read('/rest/v1/testeurs_play?ajoute_at=not.is.null&play_vu_at=is.null&select=user_id&limit=500');
    let telephones = 0, membres = 0;
    for (const t of liste) { const n = await pousserTesteur(t.user_id).catch(() => 0); telephones += n; if (n) membres += 1; }
    return json({ ok: true, testeurs: liste.length, membres_prevenus: membres, telephones });
  }
  if (action === 'lamia_ecrire_a') {
    const mail = clean(b.email, 254).toLowerCase(), body = clean(b.body, 8000);
    if (!EMAIL.test(mail)) return json({ error: 'bad_email' }, 400);
    if (!body) return json({ error: 'empty' }, 400);
    return json({ ok: true, ...(await ecrireDeLamia(mail, body, b.name)) });
  }
  if (action === 'lamia_liste') {
    const threads = await read('/rest/v1/confidence_threads?select=id,name,email,phone,channel,status,unread_lamia,unread_visitor,last_message_at,created_at&order=last_message_at.desc&limit=300');
    const ids = threads.map((t) => t.id);
    const derniers = ids.length ? await read(`/rest/v1/confidence_messages?thread_id=in.(${ids.join(',')})&ready=eq.true&select=thread_id,author,body,created_at&order=created_at.desc&limit=600`) : [];
    const apercu = {};
    for (const m of derniers) if (!apercu[m.thread_id]) apercu[m.thread_id] = { author: m.author, extrait: clean(m.body, 90) };
    const vides = new Set(threads.filter((t) => !apercu[t.id]).map((t) => t.id));
    // Photos manquantes : un membre qui écrit « je ne peux pas swiper » n'a souvent pas ses 2 photos.
    const sansPhotos = new Set();
    try {
      const mails = [...new Set(threads.filter((t) => t.email && !vides.has(t.id)).map((t) => String(t.email).trim().toLowerCase()))];
      const ann = [];
      for (let i = 0; i < mails.length; i += 50) ann.push(...await read(`/rest/v1/annonces?email=in.(${encodeURIComponent(mails.slice(i, i + 50).map((m) => `"${m.replace(/"/g, '')}"`).join(','))})&test=eq.false&status=in.(publiee,a_verifier,brouillon)&select=id,email`).catch(() => []));
      const nb = new Map();
      for (let i = 0; i < ann.length; i += 60) for (const f of await read(`/rest/v1/annonce_files?annonce_id=in.(${ann.slice(i, i + 60).map((x) => x.id).join(',')})&kind=eq.photo&select=annonce_id`).catch(() => [])) nb.set(f.annonce_id, (nb.get(f.annonce_id) || 0) + 1);
      for (const x of ann) if ((nb.get(x.id) || 0) < 2) sansPhotos.add(String(x.email).toLowerCase());
    } catch { /* l'alerte est un plus : la liste s'affiche quand même */ }
    return json({ ok: true, threads: threads.filter((t) => !vides.has(t.id)).map((t) => ({ ...t, apercu: apercu[t.id], sans_photos: sansPhotos.has(String(t.email || '').trim().toLowerCase()) })), non_lus: threads.reduce((n, t) => n + (vides.has(t.id) ? 0 : t.unread_lamia), 0) });
  }
  if (['lamia_fil', 'lamia_repondre', 'lamia_statut', 'lamia_supprimer'].includes(action)) {
    if (!UUID.test(String(b.thread_id || ''))) return json({ error: 'bad_request' }, 400);
    const [thread] = await read(`/rest/v1/confidence_threads?id=eq.${b.thread_id}&select=*`);
    if (!thread) return json({ error: 'not_found' }, 404);
    if (action === 'lamia_fil') {
      if (thread.unread_lamia) await patch('confidence_threads', `id=eq.${thread.id}`, { unread_lamia: 0 });
      return json({ ok: true, thread: { ...(await filComplet({ ...thread, unread_lamia: 0 })), profil: await profilDuFil(thread.email) } });
    }
    if (action === 'lamia_statut') {
      if (!STATUTS.includes(b.status)) return json({ error: 'bad_request' }, 400);
      await patch('confidence_threads', `id=eq.${thread.id}`, { status: b.status });
      return json({ ok: true });
    }
    if (action === 'lamia_supprimer') { await supprimerFil(thread.id); return json({ ok: true }); }
    const body = clean(b.body, 8000);
    const { files, error } = verifierFichiers(b.files);
    if (error) return json({ error }, 400);
    if (!body && !files.length) return json({ error: 'empty' }, 400);
    return json({ ok: true, ...(await nouveauMessage(thread, 'lamia', body, files)) });
  }
  if (action === 'reglages') return json({ ok: true, reglages: reglagesPropres((await setting('confidences_reglages')) || {}), email_configure: emailConfigure(env) });
  if (action === 'reglages_enregistrer') {
    const r = reglagesPropres(b.reglages || {});
    await saveSetting('confidences_reglages', r);
    return json({ ok: true, reglages: r });
  }
  if (action === 'push_cle') return json({ ok: true, publicKey: (await cleVapid()).publicKey });
  if (action === 'push_abonner') {
    const s = b.subscription || {};
    const endpoint = clean(s.endpoint, 1000);
    if (!/^https:\/\//.test(endpoint) || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'bad_request' }, 400);
    await call('/rest/v1/push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: user.id, endpoint, p256dh: clean(s.keys.p256dh, 200), auth: clean(s.keys.auth, 100), label: clean(b.label, 80) || null }) });
    return json({ ok: true });
  }
  if (action === 'push_desabonner') {
    await call(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(clean(b.endpoint, 1000))}`, { method: 'DELETE' });
    return json({ ok: true });
  }
  if (action === 'push_tester') {
    const subs = await read('/rest/v1/push_subscriptions?pour=eq.lamia&select=id,endpoint,p256dh,auth');
    const keys = await cleVapid();
    let ok = 0;
    for (const s of subs) {
      const res = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: 'Les Confidences', body: 'Les notifications fonctionnent sur cet appareil.', url: '/confidences-lamia/' }, keys, { fetcher }).catch(() => ({ ok: false }));
      if (res.ok) ok += 1;
      if (res.gone) await call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' });
    }
    return json({ ok: true, appareils: subs.length, recus: ok });
  }
  if (action === 'email_tester') {
    const reglages = reglagesPropres((await setting('confidences_reglages')) || {});
    const to = reglages.email_alerte || clean(env.CONFIDENCES_ALERT_EMAIL, 254);
    if (!emailConfigure(env)) return json({ error: 'email_not_configured' }, 400);
    if (!to) return json({ error: 'no_alert_email' }, 400);
    const ok = await email(to, 'Test · Les Confidences', '<p>Les alertes email des Confidences fonctionnent.</p>', 'Les alertes email des Confidences fonctionnent.');
    return ok ? json({ ok: true }) : json({ error: 'email_failed' }, 502);
  }
  return json({ error: 'unknown_action' }, 400);
}
