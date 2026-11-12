// Le live de Lamia dans l'appli (12 nov. 2026).
// Quand Lamia ouvre le live depuis sa console (l'outil sur son ordinateur), l'appli le montre :
// le live YouTube dans la rubrique Live, une fenêtre « Lamia est en live » et une boîte à questions.
// Les questions ne sont visibles que par Lamia ; il faut un compte pour en poser une.
import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from './event-tickets.mjs';
import { envoyerPush, genererClesVapid } from './webpush.mjs';
import { envoyerNouveautes } from './nouveautes.mjs';

export const YOUTUBE_CHAINE = 'UCw9wm85Fnv7gpzDLtgYsCfQ';
export const YOUTUBE_LIVE = `https://www.youtube.com/embed/live_stream?channel=${YOUTUBE_CHAINE}&autoplay=1&mute=1&playsinline=1`;
export const TIKTOK_LIVE = 'https://www.tiktok.com/@lamiafemmeberbere/live';
export const PAGE_LIVE = '/salon/#en-direct';
export const MAX_QUESTIONS = 3; // par personne et par live
export const DUREE_MAX_H = 5; // un live oublié ouvert se ferme seul au bout de 5 heures
const STATUTS = ['nouvelle', 'choisie', 'repondue', 'ecartee'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// L'état du live tel que le voit le public : en direct ou non, depuis quand, le titre du soir.
export function etatPublic(v, now = new Date()) {
  const debut = v?.debut ? new Date(v.debut) : null;
  const actif = Boolean(v?.actif && debut && now - debut < DUREE_MAX_H * 3600e3);
  return { actif, debut: actif ? debut.toISOString() : null, titre: actif ? clean(v.titre, 140) : '', youtube: YOUTUBE_LIVE, tiktok: TIKTOK_LIVE };
}

export async function lireEtat(read) {
  const [row] = await read('/rest/v1/platform_settings?key=eq.live_etat&select=value').catch(() => []);
  return row?.value || null;
}

export async function handleLive(action, b, { env = process.env, fetcher = fetch, call, read, insert, patch, user = null, admin = false, now = () => new Date() } = {}) {
  const saveEtat = (value) => call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'live_etat', value, updated_at: now().toISOString() }) });
  // La console de Lamia s'identifie avec la clé de liaison de l'outil (comme la synchronisation des profils).
  const cleOk = async () => {
    if (admin) return true;
    const cle = clean(b.cle, 120);
    if (cle.length < 30) return false;
    const [row] = await read('/rest/v1/platform_settings?key=eq.outil_liaison&select=value').catch(() => []);
    const h = row?.value?.hash;
    if (!h) return false;
    const x = Buffer.from(createHash('sha256').update(cle).digest('hex')), y = Buffer.from(String(h));
    return x.length === y.length && timingSafeEqual(x, y);
  };
  const brut = await lireEtat(read);
  const etat = etatPublic(brut, now());
  const email = user && (user.email_confirmed_at || user.confirmed_at) ? String(user.email || '').toLowerCase() : '';

  // ---------------------------------------------------------------- public : le live est-il ouvert ? (et mes questions si je suis connecté)
  if (action === 'live_etat') {
    let mes = [];
    if (email && etat.actif) mes = await read(`/rest/v1/live_questions?user_id=eq.${user.id}&live_debut=eq.${encodeURIComponent(etat.debut)}&select=id,texte,statut,created_at&order=created_at.desc`).catch(() => []);
    return json({ ok: true, ...etat, connecte: Boolean(email), mes_questions: mes, max: MAX_QUESTIONS });
  }

  // ---------------------------------------------------------------- un membre pose sa question (compte obligatoire, live ouvert)
  if (action === 'live_question') {
    if (!email) return json({ error: 'login_required' }, 401);
    if (!etat.actif) return json({ error: 'live_ferme' }, 409);
    const texte = clean(b.texte, 500);
    if (texte.length < 5) return json({ error: 'question_vide' }, 400);
    const deja = await read(`/rest/v1/live_questions?user_id=eq.${user.id}&live_debut=eq.${encodeURIComponent(etat.debut)}&select=id`).catch(() => []);
    if (deja.length >= MAX_QUESTIONS) return json({ error: 'trop_de_questions' }, 429);
    const [p] = await read(`/rest/v1/member_profiles?user_id=eq.${user.id}&select=display_name`).catch(() => []);
    const prenom = clean(p?.display_name, 40) || clean(user.user_metadata?.prenom || user.user_metadata?.first_name, 40) || 'Membre';
    const q = await insert('live_questions', { user_id: user.id, prenom, texte, statut: 'nouvelle', live_debut: etat.debut });
    return json({ ok: true, question: { id: q.id, texte: q.texte, statut: q.statut, created_at: q.created_at } });
  }

  // ---------------------------------------------------------------- console de Lamia
  if (!action.startsWith('live_outil_')) return json({ error: 'unknown_action' }, 400);
  if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);

  if (action === 'live_outil_ouvrir') {
    // Déjà ouvert : on garde le même live (et on ne renvoie pas la notification).
    if (etat.actif) return json({ ok: true, ...etat, deja: true, envoyes: 0 });
    const titre = clean(b.titre, 140);
    const debut = now().toISOString();
    const r = await saveEtat({ actif: true, debut, titre });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    let envoyes = 0;
    if (b.notifier !== false) {
      const n = await insert('nouveautes', { type: 'live', titre: (titre ? `Lamia est en live : ${titre}` : 'Lamia est en live').slice(0, 140), texte: 'Pose-lui ta question dans l’appli : elle te répond en direct.', lien: PAGE_LIVE, source: 'live' }).catch(() => null);
      if (n) envoyes = (await envoyerNouveautes({ env, fetcher, now, ids: [n.id] }).catch(() => ({ envoyes: 0 }))).envoyes || 0;
    }
    return json({ ok: true, ...etatPublic({ actif: true, debut, titre }, now()), envoyes });
  }
  if (action === 'live_outil_fermer') {
    await saveEtat({ ...(brut || {}), actif: false, fin: now().toISOString() });
    return json({ ok: true, actif: false });
  }
  if (action === 'live_outil_questions') {
    const debut = etat.debut || brut?.debut;
    const questions = debut ? await read(`/rest/v1/live_questions?live_debut=eq.${encodeURIComponent(new Date(debut).toISOString())}&select=id,created_at,prenom,texte,statut&order=created_at.desc&limit=300`) : [];
    return json({ ok: true, ...etat, questions });
  }
  if (action === 'live_outil_statut') {
    const id = clean(b.id, 40), statut = clean(b.statut, 20);
    if (!UUID.test(id) || !STATUTS.includes(statut)) return json({ error: 'bad_request' }, 400);
    const [q] = await read(`/rest/v1/live_questions?id=eq.${id}&select=id,user_id,statut`);
    if (!q) return json({ error: 'not_found' }, 404);
    const avant = q.statut;
    await patch('live_questions', `id=eq.${id}`, { statut, ...(statut === 'choisie' ? { choisie_at: now().toISOString() } : {}) });
    // La personne est prévenue sur son téléphone quand Lamia lit sa question : elle vient écouter la réponse.
    let prevenu = 0;
    if (statut === 'choisie' && avant !== 'choisie' && q.user_id) {
      const subs = await read(`/rest/v1/push_subscriptions?user_id=eq.${q.user_id}&select=id,endpoint,p256dh,auth`).catch(() => []);
      if (subs.length) {
        const [k] = await read('/rest/v1/platform_settings?key=eq.vapid&select=value').catch(() => []);
        const keys = k?.value?.publicKey ? k.value : genererClesVapid();
        for (const s of subs) {
          const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: 'Lamia lit ta question en direct', body: 'Viens vite : elle te répond maintenant.', url: PAGE_LIVE, tag: `live-question-${id}`, icon: '/images/marque/notif-live.png' }, keys, { fetcher }).catch(() => ({ ok: false }));
          if (r.ok) prevenu += 1;
          if (r.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    }
    return json({ ok: true, prevenu });
  }
  return json({ error: 'unknown_action' }, 400);
}
