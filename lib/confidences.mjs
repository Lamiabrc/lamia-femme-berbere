// Les Confidences avec Lamia : confidences écrites ou vocales, conversations privées, espace de Lamia.
// Tout passe par ce serveur (clé de service Supabase) : les tables et le stockage « confidences » sont fermés au navigateur.
// Les fichiers sont envoyés directement au stockage privé grâce à des liens d'envoi signés, à usage unique.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DATABASE_URL, json, serviceHeaders, userFromRequest, isAdmin } from './event-tickets.mjs';
import { genererClesVapid, envoyerPush } from './webpush.mjs';
import { handleAnnonces } from './annonces.mjs';
import { alerterLamia } from './alerte-lamia.mjs';

const SITE = 'https://lamia-femme-berbere.com';
const BUCKET = 'confidences';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

export async function handleConfidences(request, { env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  const call = (path, init = {}) => fetcher(`${DATABASE_URL}${path}`, { ...init, headers: serviceHeaders(env, init.headers), signal: AbortSignal.timeout(15000) });
  const read = async (path) => { const r = await call(path); if (!r.ok) throw new Error(`read ${r.status}`); return r.json(); };
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
  async function email(to, subject, html, text) {
    if (!env.RESEND_API_KEY || !to) return false;
    const from = env.CONFIDENCES_FROM || env.RESEND_FROM || 'Lamia Femme Berbère <onboarding@resend.dev>';
    const r = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html, text }), signal: AbortSignal.timeout(10000) }).catch(() => null);
    return Boolean(r?.ok);
  }
  // Prévient Lamia : notification sur ses appareils (sans contenu) et email de secours avec un lien vers son espace.
  async function prevenirLamia(thread, message, nouveau) {
    const reglages = reglagesPropres((await setting('confidences_reglages')) || {});
    // Pas d'alerte en rafale : une seule par conversation toutes les 10 minutes.
    const recent = await read(`/rest/v1/confidence_messages?thread_id=eq.${thread.id}&author=eq.visiteur&ready=eq.true&id=neq.${message.id}&created_at=gte.${encodeURIComponent(new Date(now().getTime() - 600e3).toISOString())}&select=id&limit=1`).catch(() => []);
    if (recent.length) return { push: 0, email: false, groupee: true };
    const lien = `${SITE}/confidences-lamia/#${thread.id}`;
    let push = 0;
    if (reglages.alertes_push && !enSilence(reglages, now())) {
      const subs = await read('/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth').catch(() => []);
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
    let mail = false;
    const to = reglages.email_alerte || clean(env.CONFIDENCES_ALERT_EMAIL, 254);
    if (reglages.alertes_email && to) {
      const fichiers = await read(`/rest/v1/confidence_files?message_id=eq.${message.id}&select=kind`).catch(() => []);
      const pieces = fichiers.length ? `${fichiers.filter((f) => f.kind === 'audio').length ? 'un message vocal' : ''}${fichiers.filter((f) => f.kind !== 'audio').length ? `${fichiers.some((f) => f.kind === 'audio') ? ' et ' : ''}${fichiers.filter((f) => f.kind !== 'audio').length} pièce(s) jointe(s)` : ''}` : '';
      const html = `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px">
<h2 style="font-weight:normal;color:#9c6b78">${nouveau ? 'Nouvelle confidence' : 'Nouveau message'} de ${esc(thread.name)}</h2>
${message.body ? `<blockquote style="margin:0;padding:12px 16px;background:#fbf3f1;border-left:3px solid #d9b9a2;white-space:pre-wrap">${esc(message.body)}</blockquote>` : ''}
${pieces ? `<p>Avec ${pieces}.</p>` : ''}
<p>Email : ${esc(thread.email)}${thread.phone ? ` · Téléphone : ${esc(thread.phone)}` : ''}</p>
<p><a href="${lien}" style="display:inline-block;padding:10px 18px;background:#9c6b78;color:#fff;border-radius:999px;text-decoration:none">Ouvrir la conversation</a></p>
<p style="font-size:12px;color:#8a7a7e">Le lien ouvre ton espace sécurisé : connexion avec ton compte administratrice. Les vocaux et fichiers ne sont jamais envoyés par email.</p></div>`;
      const text = `${nouveau ? 'Nouvelle confidence' : 'Nouveau message'} de ${thread.name}\n\n${message.body || ''}\n${pieces ? `\nAvec ${pieces}.` : ''}\nEmail : ${thread.email}${thread.phone ? ` · Téléphone : ${thread.phone}` : ''}\n\nOuvrir : ${lien}`;
      mail = await email(to, `${nouveau ? 'Nouvelle confidence' : 'Nouveau message'} · Les Confidences`, html, text);
    }
    return { push, email: mail };
  }
  async function prevenirVisiteur(thread) {
    const reglages = reglagesPropres((await setting('confidences_reglages')) || {});
    if (!reglages.prevenir_visiteur) return false;
    const lien = `${SITE}/confidences/#conversation`;
    return email(thread.email, 'Lamia t’a répondu · Les Confidences',
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonjour ${esc(thread.name)},</h2><p>Lamia t’a répondu dans ta conversation privée.</p><p><a href="${lien}" style="display:inline-block;padding:10px 18px;background:#9c6b78;color:#fff;border-radius:999px;text-decoration:none">Lire sa réponse</a></p><p style="font-size:12px;color:#8a7a7e">Pour protéger ta confidence, sa réponse n’est pas recopiée dans cet email. Connecte-toi avec cette adresse email pour la lire.</p></div>`,
      `Bonjour ${thread.name},\n\nLamia t’a répondu dans ta conversation privée.\nLire sa réponse : ${lien}\n\nConnecte-toi avec cette adresse email pour la lire.`);
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

  // ---------------------------------------------------------------- annonces de rencontre (dépôt, lecture, modération)
  if (action.startsWith('annonce') || action.startsWith('outil_') || action.startsWith('match')) {
    const alerter = (msg) => Promise.race([alerterLamia(msg, { env, fetcher, now }), new Promise((r) => setTimeout(r, 7000))]);
    return handleAnnonces(action, b, { env, call, read, insert, patch, admin, user, ipHash, now, email, alerter });
  }

  // ---------------------------------------------------------------- 1 et 2 : confidence écrite ou vocale (sans compte)
  if (action === 'envoyer') {
    if (clean(b.website, 200)) return json({ ok: true, thread_id: null, message_id: null, uploads: [] }); // piège à robots
    if (b.consent !== true) return json({ error: 'consent_required' }, 400);
    const name = clean(b.name, 80), email = clean(b.email, 254).toLowerCase(), phone = clean(b.phone, 40) || null;
    const body = clean(b.body, 8000);
    if (!name) return json({ error: 'missing_name' }, 400);
    if (!EMAIL.test(email)) return json({ error: 'invalid_email' }, 400);
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

  // ---------------------------------------------------------------- 3 : conversation privée (connexion par lien email)
  if (['mes_conversations', 'ecrire', 'supprimer_ma_conversation'].includes(action)) {
    const email = String(user?.email || '').toLowerCase();
    if (!user || !email || !user.email_confirmed_at && !user.confirmed_at) return json({ error: 'login_required' }, 401);
    const mine = await read(`/rest/v1/confidence_threads?email=eq.${encodeURIComponent(email)}&select=*&order=last_message_at.desc`);
    if (action === 'mes_conversations') {
      const threads = await Promise.all(mine.map(filComplet));
      if (mine.some((t) => t.unread_visitor)) await patch('confidence_threads', `email=eq.${encodeURIComponent(email)}`, { unread_visitor: 0 });
      return json({ ok: true, email, threads: threads.filter((t) => t.messages.length).map(({ unread_lamia, ...t }) => t) });
    }
    if (action === 'supprimer_ma_conversation') {
      const t = mine.find((x) => x.id === b.thread_id);
      if (!t) return json({ error: 'not_found' }, 404);
      await supprimerFil(t.id);
      return json({ ok: true });
    }
    // ecrire
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

  if (action === 'lamia_liste') {
    const threads = await read('/rest/v1/confidence_threads?select=id,name,email,phone,channel,status,unread_lamia,unread_visitor,last_message_at,created_at&order=last_message_at.desc&limit=300');
    const ids = threads.map((t) => t.id);
    const derniers = ids.length ? await read(`/rest/v1/confidence_messages?thread_id=in.(${ids.join(',')})&ready=eq.true&select=thread_id,author,body,created_at&order=created_at.desc&limit=600`) : [];
    const apercu = {};
    for (const m of derniers) if (!apercu[m.thread_id]) apercu[m.thread_id] = { author: m.author, extrait: clean(m.body, 90) };
    const vides = new Set(threads.filter((t) => !apercu[t.id]).map((t) => t.id));
    return json({ ok: true, threads: threads.filter((t) => !vides.has(t.id)).map((t) => ({ ...t, apercu: apercu[t.id] })), non_lus: threads.reduce((n, t) => n + (vides.has(t.id) ? 0 : t.unread_lamia), 0) });
  }
  if (['lamia_fil', 'lamia_repondre', 'lamia_statut', 'lamia_supprimer'].includes(action)) {
    if (!UUID.test(String(b.thread_id || ''))) return json({ error: 'bad_request' }, 400);
    const [thread] = await read(`/rest/v1/confidence_threads?id=eq.${b.thread_id}&select=*`);
    if (!thread) return json({ error: 'not_found' }, 404);
    if (action === 'lamia_fil') {
      if (thread.unread_lamia) await patch('confidence_threads', `id=eq.${thread.id}`, { unread_lamia: 0 });
      return json({ ok: true, thread: await filComplet({ ...thread, unread_lamia: 0 }) });
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
  if (action === 'reglages') return json({ ok: true, reglages: reglagesPropres((await setting('confidences_reglages')) || {}), email_configure: Boolean(env.RESEND_API_KEY) });
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
    const subs = await read('/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth');
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
    if (!env.RESEND_API_KEY) return json({ error: 'email_not_configured' }, 400);
    if (!to) return json({ error: 'no_alert_email' }, 400);
    const ok = await email(to, 'Test · Les Confidences', '<p>Les alertes email des Confidences fonctionnent.</p>', 'Les alertes email des Confidences fonctionnent.');
    return ok ? json({ ok: true }) : json({ error: 'email_failed' }, 502);
  }
  return json({ error: 'unknown_action' }, 400);
}
