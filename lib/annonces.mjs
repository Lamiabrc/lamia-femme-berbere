// Annonces de rencontre déposées par la communauté (Patio, Confidences).
// Les annonces ne sont JAMAIS publiées : elles arrivent chez Lamia, qui les vérifie et les passe dans son outil
// de matching. La personne reçoit seulement le nombre de profils compatibles, sans savoir lesquels.
// La photo de la pièce d'identité (numéro caché par la main) ne sert qu'à la vérification :
// elle n'est jamais montrée sur le site et elle est supprimée dès que Lamia publie ou refuse l'annonce.
// Passe par /api/confidences (actions « annonce_* ») pour rester dans la limite des fonctions Vercel.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DATABASE_URL, json } from './event-tickets.mjs';
import { envoyerPush, genererClesVapid } from './webpush.mjs';
import { abonnesPourLamia, utiliserUnite, etatAbonnement } from './abonnements.mjs';
import { formule as formuleAbo } from '../content/abonnements.mjs';
import { O, choixPropres, versOutil, telephoneNormal, fichePotentiel, potentiel } from '../content/matching-options.mjs';
import { CATEGORIES_ALERTE, notifsPropres, journaliser } from './alerte-lamia.mjs';
import { adresse, accord, adresser, aDesTrous } from './adresse.mjs';
import { actionSalons } from './salons.mjs';
import { ouvrirDiscussion, fermerDiscussion, actionDiscussion, discussionsPourLamia, rappelsDiscussions } from './discussions.mjs';

const BUCKET = 'annonces';
const SITE = 'https://lamia-femme-berbere.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,180}\.[a-z]{2,24}$/i;
export const TYPES_ANNONCE = {
  'image/jpeg': ['image', 12], 'image/png': ['image', 12], 'image/webp': ['image', 12], 'image/heic': ['image', 12], 'image/heif': ['image', 12],
  'video/mp4': ['video', 50], 'video/quicktime': ['video', 50], 'video/webm': ['video', 50],
  'application/pdf': ['pdf', 12],
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf' };
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const salutDe = (a) => adresse(a?.genre, a?.prenom);
const baseType = (t) => String(t || '').split(';')[0].trim().toLowerCase();

// Retire d'un texte public tout moyen de contact : liens, @pseudos, emails, numéros de téléphone.
export function sansContact(t) {
  return String(t || '')
    .replace(/https?:\/\/\S+|www\.\S+|\b[\w.-]+\.(com|fr|net|org|dz|be|ca|me|io|tv|app|link)\b\S*/gi, '…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '…')
    .replace(/@[\w.]{2,}/g, '…')
    .replace(/(\+|00)?\d[\d\s.\-()]{7,}\d/g, '…')
    .replace(/\b(snap(chat)?|insta(gram)?|tiktok|facebook|fb|whats ?app|telegram|messenger|t[ée]l[ée]phone|num[ée]ro|appelle[sz]?-moi)\b\s*:?\s*\S*/gi, '…');
}

export function ageAu(birth, today = new Date()) {
  const b = new Date(`${birth}T12:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  let a = today.getUTCFullYear() - b.getUTCFullYear();
  if (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

// Médias annoncés : 1 ou 2 photos, ou 1 vidéo ; et obligatoirement la photo de la pièce d'identité.
// Lien de réseau social ramené à « réseau:pseudo » (TikTok, Instagram, Facebook) ; un @pseudo seul compte comme TikTok.
// Comparé seulement par empreinte : le site ne garde jamais en clair les liens des fiches de l'outil.
export function normLien(s) {
  const t = String(s || '').trim().toLowerCase();
  const net = (n, p) => `${n}:${String(p).replace(/\.+$/, '')}`;
  let m;
  if ((m = t.match(/tiktok\.com\/@([\w.]{2,30})/))) return net('tiktok', m[1]);
  if ((m = t.match(/instagram\.com\/([\w.]{2,30})/))) return net('instagram', m[1]);
  if ((m = t.match(/(?:facebook|fb)\.com\/(?:profile\.php\?id=)?([\w.]{2,60})/))) return net('facebook', m[1]);
  if ((m = t.match(/^@?([\w.]{2,30})$/))) return net('tiktok', m[1]);
  return '';
}
export const empreinteLien = (n) => createHash('sha256').update(`lfb-lien:${n}`).digest('hex');
export const pseudoTikTok = (s) => (normLien(s).startsWith('tiktok:') ? normLien(s).slice(7) : '');

export function verifierMedias(list, { optionnel = false } = {}) {
  if (!Array.isArray(list)) return optionnel ? { files: [] } : { error: 'medias_requis' };
  const out = [];
  for (const f of list.slice(0, 4)) {
    const role = f?.role === 'identite' ? 'identite' : 'media';
    const mime = baseType(f?.type);
    const t = TYPES_ANNONCE[mime];
    if (!t) return { error: 'file_type' };
    if (role === 'media' && t[0] === 'pdf') return { error: 'file_type' };
    if (role === 'identite' && t[0] === 'video') return { error: 'file_type' };
    const size = Math.round(Number(f?.size));
    if (!(size > 0) || size > t[1] * 1024 * 1024) return { error: 'file_size' };
    out.push({ kind: role === 'identite' ? 'identite' : t[0] === 'video' ? 'video' : 'photo', mime, size });
  }
  const photos = out.filter((f) => f.kind === 'photo').length, videos = out.filter((f) => f.kind === 'video').length, ids = out.filter((f) => f.kind === 'identite').length;
  if (ids > 1) return { error: 'identite_trop' }; // facultative : elle renforce le profil
  if (!(photos + videos) && !optionnel) return { error: 'medias_requis' };
  if (videos > 1 || photos > 2 || (videos && photos)) return { error: 'medias_trop' };
  return { files: out };
}

const signe = (env, id, usage) => createHmac('sha256', `${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY}|annonces|${usage}`).update(id).digest('base64url');
export const jetonAnnonce = (env, id, usage = 'retrait') => signe(env, id, usage);
export function jetonAnnonceValide(env, id, token, usage = 'retrait') {
  const a = Buffer.from(String(token || '')), b = Buffer.from(signe(env, id, usage));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Profils de l'outil de matching publiés anonymement par Lamia (n° 5001 et plus).
const REF_OUTIL = 5001;
const STATUTS_DEMANDE = ['a_traiter', 'mis_en_relation', 'pas_compatible', 'dematche', 'en_reserve'];
const tableau = (v, n = 12) => (Array.isArray(v) ? v : []).map((x) => clean(x, 60)).filter(Boolean).slice(0, n);
const entier = (v, min, max) => { const n = Number.parseInt(v, 10); return n >= min && n <= max ? n : null; };

export async function handleAnnonces(action, b, { env, call, read, insert, patch, admin, user = null, ipHash, now, email, alerter, formuleDe = null, cron = false }) {
  // Formule de la personne connectée (Découverte si aucun abonnement actif) ; Lamia (admin) a tout, pour tester.
  const maFormule = async () => {
    if (user?.app_metadata?.role === 'admin') return formuleAbo('prestige');
    const id = formuleDe ? await formuleDe(user.email) : (await etatAbonnement(user.email, { env }).catch(() => ({}))).abonnement?.formule;
    return formuleAbo(id) || formuleAbo('decouverte');
  };
  // Minuit à Paris, pour les quotas du jour.
  const minuitParis = () => { const d = now(); const decal = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' })) - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })); const p = new Date(d.getTime() + decal); p.setUTCHours(0, 0, 0, 0); return new Date(p.getTime() - decal).toISOString(); };
  const swipesDuJour = async (a) => { const t = encodeURIComponent(minuitParis()); const [x, y] = await Promise.all([read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&via=eq.swipe&created_at=gte.${t}&select=id`).catch(() => []), read(`/rest/v1/annonce_passes?demandeur_id=eq.${a.id}&created_at=gte.${t}&select=id`).catch(() => [])]); return x.length + y.length; };
  // Matchs en cours = intérêts réciproques pas encore clos (en attente de Lamia ou mis en relation).
  const matchsEnCours = async (a) => {
    const mien = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&reciproque=eq.true&statut=in.(a_traiter,mis_en_relation)&select=id,cible_ref`).catch(() => []);
    const autres = await read(`/rest/v1/annonce_interets?cible_ref=eq.${a.ref}&statut=eq.mis_en_relation&reciproque=eq.false&select=id`).catch(() => []);
    const mise = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.mis_en_relation&reciproque=eq.false&select=id`).catch(() => []);
    return Math.max(new Set(mien.map((x) => x.cible_ref ?? x.id)).size + autres.length + mise.length, a.en_match ? 1 : 0);
  };
  const limiteMatchs = (f, a) => (f.matchs || 1) + (Number(a.matchs_bonus) || 0);
  // Profils qui m'ont choisi·e et que je n'ai pas encore traités.
  const quiMaChoisi = async (a) => (await read(`/rest/v1/annonce_interets?cible_ref=eq.${a.ref}&statut=eq.a_traiter&select=demandeur_id,annonces!inner(ref,status)`).catch(() => [])).map((x) => x.annonces?.ref).filter(Boolean);
  // Fiches de l'outil : toutes affichées (sauf celles que la personne a retirées), avec la mention « confirmé » ou « en attente de confirmation ».
  const profilsOutilPublics = async () => (await read('/rest/v1/profils_outil?visible=eq.true&retire_at=is.null&select=ref,genre,age,ville,village,pays,secteur,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max,religion,pratique,mode_vie,confirme_at&order=updated_at.desc&limit=300').catch(() => []))
    .map(({ confirme_at: c, ...p }) => ({ ...p, outil: true, confirme: Boolean(c), profil: sansContact(p.profil), recherche: sansContact(p.recherche) }));
  // Scores de l'outil de Lamia (même algorithme que pendant le live), dans un sens ou dans l'autre.
  async function scoresOutil(paires) {
    const refs = [...new Set(paires.flat())].filter((r) => r > 0);
    if (!refs.length) return () => null;
    const rows = await read(`/rest/v1/scores_outil?a_ref=in.(${refs.join(',')})&b_ref=in.(${refs.join(',')})&select=a_ref,b_ref,score,niveau`).catch(() => []);
    const m = new Map(rows.map((r) => [`${r.a_ref}-${r.b_ref}`, r]));
    return (x, y) => m.get(`${x}-${y}`) || m.get(`${y}-${x}`) || null;
  }
  // Prévenir un membre : notification sur ses téléphones (s'il les a activées dans Mon espace) et email.
  // Le genre et le prénom de la personne, pour lui dire « A gma Rachid » ou « A weltma Werda ».
  async function quiEst(userId) {
    if (!userId) return {};
    const [a] = await read(`/rest/v1/annonces?user_id=eq.${userId}&select=genre,prenom&limit=1`).catch(() => []);
    if (a?.genre) return { genre: a.genre, prenom: a.prenom };
    const [f] = await read(`/rest/v1/profils_outil?user_id=eq.${userId}&select=genre&limit=1`).catch(() => []);
    const u = await compteDe(userId).catch(() => null);
    return { genre: f?.genre || null, prenom: u?.user_metadata?.first_name || '' };
  }
  async function pousserMembre(userId, { titre, texte, lien = '/mon-espace/', tag = 'membre' }) {
    if (!userId) return 0;
    if (aDesTrous(titre) || aDesTrous(texte)) {
      const qui = await quiEst(userId);
      titre = adresser(titre, qui); texte = adresser(texte, qui);
    }
    const subs = await read(`/rest/v1/push_subscriptions?user_id=eq.${userId}&pour=eq.membre&select=id,endpoint,p256dh,auth`).catch(() => []);
    if (!subs.length) return 0;
    const [k] = await read('/rest/v1/platform_settings?key=eq.vapid&select=value').catch(() => []);
    let keys = k?.value;
    if (!keys?.publicKey || !keys?.privateJwk) { keys = genererClesVapid(); await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'vapid', value: keys, updated_at: now().toISOString() }) }).catch(() => {}); }
    let n = 0;
    for (const s of subs) {
      const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: titre, body: texte, url: lien, tag: `${tag}-${Date.now()}`, icon: '/images/marque/notif-lfb.png' }, keys).catch(() => ({ ok: false }));
      if (r.ok) n += 1;
      if (r.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
    }
    return n;
  }
  async function prevenirMembre(m, { titre, texte, bouton = 'Voir mon espace', lien = '/mon-espace/', pied = 'Ton identité et celle de l’autre personne restent secrètes : seule Lamia sait qui vous êtes.' }) {
    if (!m) return;
    const trouve = m.genre && m.prenom ? {} : await quiEst(m.user_id);
    const qui = { genre: m.genre || trouve.genre, prenom: m.prenom || trouve.prenom };
    titre = adresser(titre, qui); texte = adresser(texte, qui);
    await pousserMembre(m.user_id, { titre, texte, lien }).catch(() => {});
    if (m.email && !String(m.email).endsWith('.invalid')) await email(m.email, titre,
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">${esc(titre)}</h2><p>${esc(texte)}</p><p><a href="https://lamia-femme-berbere.com${lien}">${esc(bouton)}</a></p><p style="font-size:13px">${esc(pied)}</p></div>`,
      `${titre}\n\n${texte}\nhttps://lamia-femme-berbere.com${lien}`).catch(() => {});
  }
  // Fin d'un match : les choix gardés en réserve repassent « à traiter » s'ils sont toujours disponibles ; Lamia voit le meilleur potentiel.
  async function reactiverReserve(a) {
    if (!a?.id) return;
    const res = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.en_reserve&select=id,cible_ref`).catch(() => []);
    if (!res.length) return;
    const refsSite = res.map((x) => x.cible_ref).filter((r) => r < REF_OUTIL), refsOutil = res.map((x) => x.cible_ref).filter((r) => r >= REF_OUTIL);
    const site = refsSite.length ? await read(`/rest/v1/annonces?ref=in.(${refsSite.join(',')})&select=ref,status,en_match,birth_date,pays,matching,age_min,age_max`).catch(() => []) : [];
    const outil = refsOutil.length ? await read(`/rest/v1/profils_outil?ref=in.(${refsOutil.join(',')})&select=ref,visible,retire_at,age,age_min,age_max,pays,religion,pratique,enfants,situation,origine,mode_vie,etudes`).catch(() => []) : [];
    const [moi] = await read(`/rest/v1/annonces?id=eq.${a.id}&select=id,ref,prenom,genre,email,user_id,birth_date,pays,matching,age_min,age_max`).catch(() => []);
    if (!moi) return;
    const A = fichePotentiel(moi, { age: ageAu(moi.birth_date, now()) });
    const dispo = [];
    for (const x of res) {
      const c = site.find((y) => y.ref === x.cible_ref), o = outil.find((y) => y.ref === x.cible_ref);
      const ok = c ? c.status === 'publiee' && !c.en_match : o ? o.visible && !o.retire_at : false;
      if (!ok) { if (!c && !o) await patch('annonce_interets', `id=eq.${x.id}`, { statut: 'pas_compatible', updated_at: now().toISOString() }).catch(() => {}); continue; }
      await patch('annonce_interets', `id=eq.${x.id}`, { statut: 'a_traiter', updated_at: now().toISOString() }).catch(() => {});
      dispo.push({ ref: x.cible_ref, score: (await scoresOutil([[moi.ref, x.cible_ref]]))(moi.ref, x.cible_ref)?.score ?? potentiel(A, c ? fichePotentiel(c, { age: ageAu(c.birth_date, now()) }) : fichePotentiel(o, { outil: true })).score });
    }
    if (!dispo.length) return;
    dispo.sort((x, y) => y.score - x.score);
    await alerter({ titre: `🔁 Match terminé · n° ${moi.ref} : ${dispo.length} choix en réserve à reprendre`, lignes: [`Meilleur potentiel disponible : n° ${dispo[0].ref} (${dispo[0].score}/100)`, dispo.length > 1 ? `Aussi : ${dispo.slice(1, 4).map((d) => `n° ${d.ref} (${d.score})`).join(', ')}` : '', 'Dans tes Confidences, Matchs demandés'].filter(Boolean), lien: '/confidences-lamia/#annonces', tag: 'reserve' }).catch(() => {});
    await prevenirMembre(moi, { titre: `🔁 {A}, Lamia reprend tes autres choix`, texte: `Ton match est terminé. ${dispo.length > 1 ? `Tes ${dispo.length} autres choix gardés en réserve sont` : 'Ton autre choix gardé en réserve est'} toujours disponible${dispo.length > 1 ? 's' : ''} : Lamia les étudie de nouveau pour te proposer le meilleur.` });
  }
  // Match actif : tant qu'il dure, les deux profils ne peuvent plus matcher (ni apparaître dans les profils anonymes).
  const appliquerStatut = async (interetId, statut) => {
    const [d] = await read(`/rest/v1/annonce_interets?id=eq.${interetId}&select=cible_ref,annonces!inner(id,ref,status,prenom,genre,email,user_id)`).catch(() => []);
    if (!d) return { error: 'not_found' };
    if (statut === 'mis_en_relation' && d.annonces?.status !== 'publiee') return { error: 'profil_non_verifie' };
    await patch('annonce_interets', `id=eq.${interetId}`, { statut, updated_at: now().toISOString() });
    if (statut === 'mis_en_relation' || statut === 'dematche') {
      const actif = statut === 'mis_en_relation';
      await patch('annonces', `id=eq.${d.annonces.id}`, { en_match: actif });
      if (d.cible_ref < REF_OUTIL) await patch('annonces', `ref=eq.${d.cible_ref}`, { en_match: actif });
      const [c] = d.cible_ref < REF_OUTIL ? await read(`/rest/v1/annonces?ref=eq.${d.cible_ref}&select=id,ref,prenom,genre,email,user_id`).catch(() => []) : [];
      // Une mise en relation à la fois : les autres choix des deux personnes passent en réserve (ils reviennent si le match casse).
      if (actif) for (const m of [d.annonces, c].filter(Boolean)) await patch('annonce_interets', `demandeur_id=eq.${m.id}&statut=eq.a_traiter&id=neq.${interetId}`, { statut: 'en_reserve', updated_at: now().toISOString() }).catch(() => {});
      const cFiche = actif && !c && d.cible_ref >= REF_OUTIL ? await compteParRef(d.cible_ref).catch(() => null) : null;
      if (actif) {
        // 7 jours de discussion dans l'application, si les deux ont un compte.
        const disc = await ouvrirDiscussion({ read, insert, now }, { interetId, a: d.annonces, b: c || cFiche }).catch(() => null);
        for (const m of [d.annonces, c, cFiche].filter(Boolean)) await prevenirMembre(m, disc
          ? { titre: `💞 {A}, Lamia t’a trouvé un match !`, texte: 'Lamia a choisi pour toi la personne avec le meilleur potentiel. Une discussion privée de 7 jours s’ouvre dans ton espace : faites connaissance, puis échangez vos numéros quand vous êtes prêts.', bouton: 'Ouvrir la discussion', lien: '/mon-espace/#discussion' }
          : { titre: `💞 {A}, Lamia t’a trouvé un match !`, texte: 'Lamia a choisi pour toi la personne avec le meilleur potentiel. Elle te contacte très vite pour vous mettre en relation.' });
      } else { await fermerDiscussion({ patch, now }, interetId); await reactiverReserve(d.annonces).catch(() => {}); if (c) await reactiverReserve(c).catch(() => {}); }
    }
    return { ok: true };
  };
  const finirMatch = async (a) => {
    await patch('annonces', `id=eq.${a.id}`, { en_match: false });
    const enCours = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.mis_en_relation&select=id,cible_ref`).catch(() => []);
    for (const i of [...enCours]) await fermerDiscussion({ patch, now }, i.id);
    for (const i of enCours) { await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'dematche', updated_at: now().toISOString() }); if (i.cible_ref < REF_OUTIL) await patch('annonces', `ref=eq.${i.cible_ref}`, { en_match: false }); }
    const visant = await read(`/rest/v1/annonce_interets?cible_ref=eq.${a.ref}&statut=eq.mis_en_relation&select=id,demandeur_id`).catch(() => []);
    for (const i of visant) await fermerDiscussion({ patch, now }, i.id);
    for (const i of visant) { await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'dematche', updated_at: now().toISOString() }); await patch('annonces', `id=eq.${i.demandeur_id}`, { en_match: false }); }
    await reactiverReserve(a).catch(() => {});
    for (const i of enCours) if (i.cible_ref < REF_OUTIL) { const [c] = await read(`/rest/v1/annonces?ref=eq.${i.cible_ref}&select=id`).catch(() => []); if (c) await reactiverReserve(c).catch(() => {}); }
    for (const i of visant) await reactiverReserve({ id: i.demandeur_id }).catch(() => {});
  };
  const outilParRef = async (refs) => { const r = [...new Set(refs.filter((x) => x >= REF_OUTIL))]; return r.length ? read(`/rest/v1/profils_outil?ref=in.(${r.join(',')})&select=ref,outil_id,genre,age,pays`).catch(() => []) : []; };
  async function liensLecture(files, duree = 3600) {
    if (!files.length) return {};
    const r = await call(`/storage/v1/object/sign/${BUCKET}`, { method: 'POST', body: JSON.stringify({ expiresIn: duree, paths: files.map((f) => f.storage_path) }) });
    if (!r.ok) return {};
    return Object.fromEntries((await r.json()).filter((x) => x.signedURL).map((x) => [x.path, `${DATABASE_URL}/storage/v1${x.signedURL}`]));
  }
  async function effacer(files) {
    if (!files.length) return;
    await call(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: files.map((f) => f.storage_path) }) });
    await call(`/rest/v1/annonce_files?id=in.(${files.map((f) => f.id).join(',')})`, { method: 'DELETE' });
  }
  const publique = (a, files, urls) => ({
    ref: a.ref, prenom: a.prenom, genre: a.genre, age: ageAu(a.birth_date, now()), ville: a.ville, pays: a.pays, situation: a.situation,
    profil: a.profil, recherche: a.recherche, age_min: a.age_min, age_max: a.age_max, published_at: a.published_at,
    origine: a.matching?.origineTags || [], caracteristiques: a.matching?.caracteristiques || [],
    medias: files.filter((f) => f.kind !== 'identite').sort((x, y) => x.position - y.position).map((f) => ({ kind: f.kind, mime: f.mime, url: urls[f.storage_path] || null })),
  });

  // ---------------------------------------------------------------- création de compte par le site
  // Le compte est créé déjà confirmé : pas d'email de confirmation, donc plus de « trop de demandes » quand beaucoup
  // de personnes s'inscrivent en même temps (la limite d'envoi d'emails de l'authentification est très basse).
  // Garde-fou : 5 comptes au plus par heure depuis une même connexion.
  if (action === 'annonce_creer_compte') {
    const mail = String(b.email || '').trim().toLowerCase();
    const mdp = String(b.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) || mail.length > 200) return json({ error: 'email_invalide' }, 400);
    if (mdp.length < 8 || mdp.length > 72) return json({ error: 'mot_de_passe' }, 400);
    const depuis = encodeURIComponent(new Date(now().getTime() - 3600e3).toISOString());
    const recents = await read(`/rest/v1/creations_compte?ip_hash=eq.${ipHash}&created_at=gte.${depuis}&select=id&limit=6`).catch(() => []);
    if (recents.length >= 5) return json({ error: 'trop_de_demandes' }, 429);
    const r = await call('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: mail, password: mdp, email_confirm: true, user_metadata: { first_name: clean(b.prenom, 60), source: clean(b.source, 40) || 'site' } }) });
    if (!r.ok) return json({ error: r.status === 422 || r.status === 400 ? 'compte_existe' : 'compte_impossible' }, r.status === 422 || r.status === 400 ? 409 : 502);
    await insert('creations_compte', { ip_hash: ipHash }).catch(() => {});
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- lien de connexion par email (sans mot de passe)
  // Envoyé par l'email du site (Resend), pas par celui de l'authentification, limité à quelques emails par heure pour tout le site.
  // Garde-fous : 3 liens par heure pour une même adresse, 8 par heure depuis une même connexion.
  if (action === 'annonce_lien_connexion') {
    const mail = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) || mail.length > 200) return json({ error: 'email_invalide' }, 400);
    const h = createHash('sha256').update(`lfb-connexion:${mail}`).digest('hex');
    const depuis = encodeURIComponent(new Date(now().getTime() - 3600e3).toISOString());
    const [parMail, parIp] = await Promise.all([
      read(`/rest/v1/liens_connexion?email_hash=eq.${h}&created_at=gte.${depuis}&select=id&limit=4`).catch(() => []),
      read(`/rest/v1/liens_connexion?ip_hash=eq.${ipHash}&created_at=gte.${depuis}&select=id&limit=9`).catch(() => []),
    ]);
    if (parMail.length >= 3 || parIp.length >= 8) return json({ error: 'trop_de_demandes' }, 429);
    const retours = { espace: '/mon-espace/', confidences: '/confidences/#conversation', swipe: '/rencontres/swipe/', rencontres: '/rencontres/#confier' };
    const redirect = `${SITE}${b.en ? '/en' : ''}${retours[b.retour] || '/mon-espace/'}`;
    // Pas de compte avec cet email : on ne crée rien, on le dit (le formulaire propose de créer l'espace).
    const ex = await call('/rest/v1/rpc/compte_existe', { method: 'POST', body: JSON.stringify({ p_email: mail }) }).catch(() => null);
    if (ex?.ok && (await ex.json().catch(() => null)) === false) return json({ ok: true, existe: false });
    const r = await call('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: mail, redirect_to: redirect }) });
    if (!r.ok) return json({ ok: true, existe: false });
    const d = await r.json().catch(() => ({}));
    const lien = d.action_link || d.properties?.action_link;
    if (!lien) return json({ error: 'envoi_impossible' }, 502);
    await insert('liens_connexion', { ip_hash: ipHash, email_hash: h }).catch(() => {});
    const prenom = d.user_metadata?.first_name || d.user?.user_metadata?.first_name || '';
    const ok = await email(mail, 'Ton lien pour te connecter à la Maison Lamia Femme Berbère',
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#8a1024">Bonjour${prenom ? ` ${esc(prenom)}` : ''} !</h2><p>Clique sur ce bouton pour entrer dans ton espace, sans mot de passe :</p><p><a href="${esc(lien)}" style="display:inline-block;padding:12px 22px;background:#8a1024;color:#fff;border-radius:999px;text-decoration:none">Me connecter</a></p><p style="font-size:13px">Ce lien marche une seule fois et pendant une heure. Une fois connecté·e, tu peux choisir un nouveau mot de passe dans ton espace.</p><p style="font-size:13px">Tu n’as rien demandé ? Ignore simplement cet email.</p></div>`,
      `Bonjour${prenom ? ` ${prenom}` : ''} !\n\nPour entrer dans ton espace sans mot de passe, ouvre ce lien (valable une heure, une seule fois) :\n${lien}\n\nTu n’as rien demandé ? Ignore cet email.`).catch(() => false);
    return ok ? json({ ok: true, existe: true }) : json({ error: 'envoi_impossible' }, 502);
  }

  // ---------------------------------------------------------------- dépôt (sans compte)
  if (action === 'annonce_deposer') {
    if (clean(b.website, 200)) return json({ ok: true, annonce_id: null, uploads: [] });
    if (b.majeur !== true || b.publication !== true) return json({ error: 'consent_required' }, 400);
    // « Profil créé en live avec Lamia » : formulaire allégé, la fiche existe déjà dans son outil.
    const live = b.live === true;
    const avecPiece = (Array.isArray(b.medias) ? b.medias : []).some((f) => f?.role === 'identite');
    if (avecPiece && b.identite_ok !== true) return json({ error: 'consent_required' }, 400);
    const prenom = clean(b.prenom, 60), ville = clean(b.ville, 80), pays = clean(b.pays, 60);
    const mail = clean(b.email, 254).toLowerCase();
    const profil = clean(b.profil, 1500), recherche = clean(b.recherche, 1500);
    const genre = b.genre === 'homme' ? 'homme' : b.genre === 'femme' ? 'femme' : null;
    const birth = /^\d{4}-\d{2}-\d{2}$/.test(String(b.birth_date || '')) ? b.birth_date : null;
    const age = birth ? ageAu(birth, now()) : null;
    if (!prenom) return json({ error: 'missing_name' }, 400);
    if (!genre) return json({ error: 'missing_genre' }, 400);
    if (age === null || age > 99) return json({ error: 'invalid_birth_date' }, 400);
    if (age < 18) return json({ error: 'mineur' }, 400);
    if (!live && (!ville || !O.pays.includes(pays))) return json({ error: 'missing_lieu' }, 400);
    if (pays && !O.pays.includes(pays)) return json({ error: 'missing_lieu' }, 400);
    const matching = choixPropres(b.matching || {});
    if (live && clean(b.tiktok_live, 200)) matching.tiktokLive = clean(b.tiktok_live, 200);
    // Contact obligatoire : un réseau social, ou (si la personne n'en a pas) un numéro de téléphone valide.
    const tel = b.sans_reseau === true ? telephoneNormal(b.telephone) : '';
    if (b.sans_reseau === true) { delete matching.contactReseau; if (!tel) return json({ error: 'telephone_invalide' }, 400); }
    else if (!matching.contactReseau) return json({ error: 'contact_requis' }, 400);
    if (!EMAIL.test(mail)) return json({ error: 'invalid_email' }, 400);
    if (!live && (profil.length < 20 || recherche.length < 20)) return json({ error: 'textes_courts' }, 400);
    const { files, error } = verifierMedias(b.medias, { optionnel: live });
    if (error) return json({ error }, 400);
    // Chaque profil est lié à un compte (pour pouvoir le modifier) : connecté, ou compte créé avec cet email.
    // Compte obligatoire AVANT le formulaire : il faut être connecté(e), et le profil prend l'email du compte.
    if (!user?.email) return json({ error: 'compte_requis' }, 401);
    if (String(user.email).toLowerCase() !== mail) return json({ error: 'compte_autre_email' }, 400);
    const dejaLa = await read(`/rest/v1/annonces?email=eq.${encodeURIComponent(mail)}&status=in.(a_verifier,publiee)&select=id&limit=1`).catch(() => []);
    if (dejaLa.length) return json({ error: 'deja_profil' }, 409);
    // Le même lien de réseau social a déjà servi à un profil du site : pas de doublon.
    const lienH = normLien(matching.contactReseau) ? empreinteLien(normLien(matching.contactReseau)) : null;
    if (lienH) { const [d] = await read(`/rest/v1/annonces?lien_h=eq.${lienH}&status=in.(a_verifier,publiee)&select=id&limit=1`).catch(() => []); if (d) return json({ error: 'deja_profil_lien' }, 409); }
    // Le profil existe-t-il déjà dans l'outil de Lamia (créé en live ou en message privé) ? Recherche par empreinte des liens.
    let outilId = null;
    const empreintes = [...new Set([b.tiktok_live, matching.contactReseau].map(normLien).filter(Boolean).map(empreinteLien))];
    if (empreintes.length) { const [t] = await read(`/rest/v1/outil_tiktok?h=in.(${empreintes.join(',')})&select=outil_id&limit=1`).catch(() => []); outilId = t?.outil_id || null; }
    const since = encodeURIComponent(new Date(now().getTime() - 86400e3).toISOString());
    const recentes = await read(`/rest/v1/annonces?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id&limit=4`).catch(() => []);
    if (recentes.length >= 3) return json({ error: 'rate_limited' }, 429);
    const amin = Number.parseInt(b.age_min, 10), amax = Number.parseInt(b.age_max, 10);
    let annonce;
    try { annonce = await insert('annonces', {
      prenom, genre, birth_date: birth, ville: ville || '', pays: pays || '', email: mail, phone: tel || null, user_id: user.id, live_declare: live, outil_id: outilId, lien_h: lienH,
      situation: matching.situation || null, matching, profil, recherche,
      age_min: amin >= 18 && amin <= 99 ? amin : null, age_max: amax >= 18 && amax <= 99 ? amax : null, ip_hash: ipHash,
      anonyme_ok: b.anonyme_ok === true, photo_partage: b.photo_partage === true, photo_partage_at: b.photo_partage === true ? now().toISOString() : null,
    }); } catch { return json({ error: 'enregistrement' }, 500); }
    const interet = Number.parseInt(b.interet_ref, 10);
    if (interet > 0 && interet !== annonce.ref) await noterInteret(annonce, interet).catch(() => {});
    const uploads = [];
    let n = 0;
    for (const f of files) {
      n += 1;
      const path = `${annonce.id}/${f.kind}-${n}.${EXT[f.mime]}`;
      const r = await call(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', body: '{}' });
      if (!r.ok) throw new Error(`sign ${r.status}`);
      const { url } = await r.json();
      await insert('annonce_files', { annonce_id: annonce.id, kind: f.kind, storage_path: path, mime: f.mime, size_bytes: f.size, position: n });
      uploads.push({ url: `${DATABASE_URL}/storage/v1${url}`, type: f.mime });
    }
    return json({ ok: true, annonce_id: annonce.id, token: jetonAnnonce(env, annonce.id, 'envoi'), uploads });
  }

  if (action === 'annonce_finaliser') {
    const id = clean(b.annonce_id, 40);
    if (!UUID.test(id) || !jetonAnnonceValide(env, id, b.token, 'envoi')) return json({ error: 'forbidden' }, 403);
    const [a] = await read(`/rest/v1/annonces?id=eq.${id}&select=*`);
    if (!a) return json({ error: 'not_found' }, 404);
    if (a.status !== 'brouillon') return json({ ok: true, deja: true, ref: a.ref });
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${id}&select=id,kind,storage_path`);
    const r = await call(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix: `${id}/`, limit: 20 }) });
    const presents = new Set(r.ok ? (await r.json()).map((o) => `${id}/${o.name}`) : []);
    const manquants = files.filter((f) => !presents.has(f.storage_path));
    if (manquants.length) return json({ error: 'upload_failed' }, 400);
    await patch('annonces', `id=eq.${id}`, { status: 'a_verifier', submitted_at: now().toISOString() });
    const lienRetrait = `${SITE}/rencontres/?retirer=${a.id}.${jetonAnnonce(env, a.id)}#annonces`;
    await email(a.email, `Ton annonce n° ${a.ref} est bien arrivée chez Lamia`,
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Merci ${esc(salutDe(a))} !</h2><p>Ton profil n° ${a.ref} est bien arrivé. Lamia le lit elle-même et le vérifie. Il n’est publié nulle part : il reste chez Lamia, qui le passe dans son outil de matching.</p><p>${files.some((f) => f.kind === 'identite') ? 'Ta pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.' : 'Tu peux modifier ton profil quand tu veux dans ton espace : https://lamia-femme-berbere.com/mon-espace/'}</p>${a.live_declare ? '<p>🎥 Profil créé en live avec Lamia : tes 3 premières mises en relation sont offertes.</p>' : ''}<p style="font-size:13px">Tu pourras retirer ton annonce et effacer tes données à tout moment avec ce lien (garde-le précieusement) :<br><a href="${lienRetrait}">Retirer mon annonce</a></p></div>`,
      `Merci ${salutDe(a)} !\n\nTon annonce n° ${a.ref} est bien arrivée. Lamia la vérifie ; elle n’est publiée nulle part.\nTa pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.\n\nPour retirer ton annonce à tout moment : ${lienRetrait}`).catch(() => false);
    const auto = await autoValider({ ...a, status: 'a_verifier' }, files).catch(() => ({ valide: false, manques: [] }));
    const demandes = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${id}&select=cible_ref`).catch(() => []);
    if (demandes.length || !auto.valide) await alerter({ titre: demandes.length ? `Match demandé · n° ${a.ref} → n° ${demandes.map((d) => d.cible_ref).join(', ')}` : `Nouveau profil à vérifier · n° ${a.ref}`, lignes: [auto.manques.length ? `Pas validé automatiquement, il manque : ${auto.manques.join(', ')}` : '', `${a.prenom}, ${a.genre === 'femme' ? 'une femme' : 'un homme'} de ${ageAu(a.birth_date, now())} ans${a.ville ? `, ${a.ville}` : ''}${a.pays ? ` (${a.pays})` : ''}`, a.live_declare ? (a.outil_id ? '🎥 Profil créé en live : fiche retrouvée dans ton outil (3 mises en relation offertes)' : '🎥 Dit avoir créé son profil en live : fiche pas retrouvée, vérifie son pseudo TikTok') : a.outil_id ? '🔗 Ce profil existe déjà dans ton outil (même lien de réseau social) : il y est relié' : '', demandes.length ? `Intéressé(e) par le profil n° ${demandes.map((d) => d.cible_ref).join(', ')}` : '', 'Dans ton espace Confidences, onglet Annonces'].filter(Boolean), lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true, ref: a.ref });
  }

  // ---------------------------------------------------------------- annonces publiées (lecture publique)
  // Profils anonymes du Patio : ni prénom, ni photo, ni ville, ni contact. Seulement ceux que Lamia a choisi d'afficher.
  if (action === 'annonces_publiques') return json({ ok: true, annonces: await listePublique() });
  // Profils de test (Lamia) : jamais montrés au public, seulement à un profil de test.
  async function listePublique({ tests = false } = {}) {
    const list = await read(`/rest/v1/annonces?status=eq.publiee&visible_anonyme=eq.true&anonyme_ok=eq.true&en_match=eq.false&test=eq.${tests}&select=ref,genre,birth_date,pays,situation,matching,profil,recherche,age_min,age_max,published_at,identite_verifiee_at&order=published_at.desc&limit=80`);
    const secteurDe = (m) => sansContact(clean([m?.zoneGeo, m?.paysRechercheDetail, m?.regionRechercheDetail].filter(Boolean).join(' · '), 120));
    return list.map((a) => ({
      ref: a.ref, genre: a.genre, age: ageAu(a.birth_date, now()), pays: a.pays, situation: a.situation,
      enfants: a.matching?.enfants || '', etudes: a.matching?.niveauEtudeCategorie || '', origine: a.matching?.origineTags || [],
      caracteristiques: a.matching?.caracteristiques || [], profil: sansContact(a.profil), recherche: sansContact(a.recherche), age_min: a.age_min, age_max: a.age_max, piece_identite: Boolean(a.identite_verifiee_at),
      religion: a.matching?.religion || '', pratique: a.matching?.pratique || '', religion_texte: sansContact(a.matching?.religionTexte || ''), mode_vie: a.matching?.hygieneVie || [], autres: sansContact(a.matching?.autresModeVie || ''), secteur: secteurDe(a.matching) || null,
    })).concat(await profilsOutilPublics());
  }

  // ---------------------------------------------------------------- retrait par la personne (lien reçu par email)
  if (action === 'annonce_retirer') {
    const id = clean(b.annonce_id, 40);
    if (!UUID.test(id) || !jetonAnnonceValide(env, id, b.token)) return json({ error: 'forbidden' }, 403);
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${id}&select=id,storage_path`);
    await effacer(files);
    await patch('annonces', `id=eq.${id}`, { status: 'retiree', visible_anonyme: false, email: 'retiree@annonce.invalid', phone: null, profil: 'Annonce retirée par son autrice ou son auteur.', recherche: 'Annonce retirée par son autrice ou son auteur.' });
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- mon profil (personne connectée)
  const monProfil = async () => {
    if (!user?.email) return null;
    const e = encodeURIComponent(String(user.email).toLowerCase());
    const [a] = await read(`/rest/v1/annonces?or=(user_id.eq.${user.id},email.eq.${e})&status=in.(a_verifier,publiee,refusee)&select=*&order=submitted_at.desc&limit=1`).catch(() => []);
    if (a && !a.user_id) await patch('annonces', `id=eq.${a.id}`, { user_id: user.id }).catch(() => {});
    return a || null;
  };
  if (action === 'annonce_mon_profil') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ ok: true, profil: null });
    const interets = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&select=cible_ref,statut,created_at,updated_at&order=created_at.desc`).catch(() => []);
    const recus = await read(`/rest/v1/annonce_interets?cible_ref=eq.${a.ref}&statut=eq.mis_en_relation&select=updated_at`).catch(() => []);
    // Mises en relation faites (demandées par la personne ou reçues), au total et depuis le 1er du mois.
    const faites = [...interets.filter((i) => i.statut === 'mis_en_relation' || i.statut === 'dematche'), ...recus];
    const debutMois = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1)).toISOString();
    const suivi = { mises_total: faites.length, mises_mois: faites.filter((i) => (i.updated_at || i.created_at || '') >= debutMois).length };
    // Match en cours : photo du match si la formule l'inclut (Passion, Prestige) et si le match a accepté de la transmettre.
    let photoMatch = null;
    if (a.en_match) {
      const [d] = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.mis_en_relation&select=cible_ref&limit=1`).catch(() => []);
      const [c] = d ? [] : await read(`/rest/v1/annonce_interets?cible_ref=eq.${a.ref}&statut=eq.mis_en_relation&select=demandeur_id&limit=1`).catch(() => []);
      const filtre = d ? (d.cible_ref < REF_OUTIL ? `ref=eq.${d.cible_ref}` : null) : c ? `id=eq.${c.demandeur_id}` : null;
      const inclus = Boolean((await maFormule()).photoMatch);
      photoMatch = { inclus, ref: d?.cible_ref || null, url: null, accepte: null };
      if (filtre) {
        const [m] = await read(`/rest/v1/annonces?${filtre}&select=id,ref,photo_partage`).catch(() => []);
        if (m) {
          photoMatch.ref = m.ref; photoMatch.accepte = Boolean(m.photo_partage);
          if (inclus && m.photo_partage) {
            const [f] = await read(`/rest/v1/annonce_files?annonce_id=eq.${m.id}&kind=eq.photo&select=storage_path&order=position.asc&limit=1`).catch(() => []);
            if (f) photoMatch.url = (await liensLecture([f], 1800))[f.storage_path] || null;
          }
        }
      }
    }
    const choisiPar = await quiMaChoisi(a), fChoix = await maFormule();
    const etatMatchs = { actifs: await matchsEnCours(a), limite: limiteMatchs(fChoix, a), formule: fChoix.id };
    return json({ ok: true, profil: { photo_match: photoMatch, matchs: etatMatchs, choisi_par: { nombre: choisiPar.length, refs: fChoix.quiMaChoisi ? choisiPar : [], inclus: Boolean(fChoix.quiMaChoisi) },
      ref: a.ref, status: a.status, prenom: a.prenom, telephone: a.phone || '', sans_reseau: !a.matching?.contactReseau && Boolean(a.phone), genre: a.genre, birth_date: a.birth_date, ville: a.ville, pays: a.pays, profil: a.profil, recherche: a.recherche,
      age_min: a.age_min, age_max: a.age_max, matching: a.matching || {}, anonyme_ok: a.anonyme_ok, visible_anonyme: a.visible_anonyme, live_declare: a.live_declare, outil_lie: Boolean(a.outil_id), en_match: a.en_match, compte: Boolean(a.user_id), modifiee_at: a.modifiee_at,
      piece_identite: Boolean(a.identite_verifiee_at), live: a.live_declare, live_retrouve: Boolean(a.outil_id), offertes: a.live_declare ? 3 : 1,
      en_match: a.en_match, nb_compatibles: a.nb_compatibles, interets: interets.map((i) => ({ cible_ref: i.cible_ref, statut: i.statut, date: i.updated_at || i.created_at })), suivi, photo_partage: Boolean(a.photo_partage),
    } });
  }
  if (action === 'annonce_modifier') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ error: 'not_found' }, 404);
    const prenom = clean(b.prenom, 60) || a.prenom, ville = clean(b.ville, 80), pays = clean(b.pays, 60);
    if (pays && !O.pays.includes(pays)) return json({ error: 'missing_lieu' }, 400);
    const matching = { ...(a.matching || {}), ...choixPropres(b.matching || {}) };
    let tel = '';
    if (b.sans_reseau === true) { delete matching.contactReseau; tel = telephoneNormal(b.telephone); if (!tel) return json({ error: 'telephone_invalide' }, 400); }
    else if (!matching.contactReseau) return json({ error: 'contact_requis' }, 400);
    const amin = Number.parseInt(b.age_min, 10), amax = Number.parseInt(b.age_max, 10);
    await patch('annonces', `id=eq.${a.id}`, {
      prenom, ville: ville || a.ville, pays: pays || a.pays, profil: clean(b.profil, 1500) || a.profil, recherche: clean(b.recherche, 1500) || a.recherche, matching, situation: matching.situation || a.situation, phone: tel || null,
      age_min: amin >= 18 && amin <= 99 ? amin : a.age_min, age_max: amax >= 18 && amax <= 99 ? amax : a.age_max, anonyme_ok: b.anonyme_ok === true, photo_partage: b.photo_partage === true, ...(b.photo_partage === true && !a.photo_partage ? { photo_partage_at: now().toISOString() } : {}),
      ...(b.anonyme_ok === true ? {} : { visible_anonyme: false }), modifiee_at: now().toISOString(), user_id: user.id,
    });
    await alerter({ titre: `Profil n° ${a.ref} modifié par ${a.prenom}`, lignes: ['La personne a mis à jour son profil depuis son espace.', 'Ton outil récupère la nouvelle version à la prochaine synchronisation.'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true });
  }
  // Consentement photo, changé depuis « Mon espace ».
  if (action === 'annonce_photo_partage') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ error: 'not_found' }, 404);
    const oui = b.photo_partage === true;
    await patch('annonces', `id=eq.${a.id}`, { photo_partage: oui, photo_partage_at: oui ? now().toISOString() : null, modifiee_at: now().toISOString() });
    await alerter({ titre: `Profil n° ${a.ref} : photo ${oui ? 'transmissible' : 'à NE PAS transmettre'} à son match`, lignes: [`${a.prenom} a changé son choix depuis son espace.`], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true, photo_partage: oui });
  }
  // Intérêt noté ; si l'autre personne (profil du site) a déjà choisi ce profil aussi : intérêt réciproque, Lamia est alertée.
  // Prévenir par email la personne choisie, sans jamais dire qui l'a choisie.
  // Simple intérêt : au plus un email toutes les 12 h par personne. Intérêt réciproque : toujours.
  async function prevenirChoisi(c, reciproque, table = 'annonces') {
    if (!c?.email) return;
    if (!reciproque && c.interet_notifie_at && now() - new Date(c.interet_notifie_at) < 12 * 3600e3) return;
    if (!reciproque) await patch(table, table === 'annonces' ? `id=eq.${c.id}` : `ref=eq.${c.ref}`, { interet_notifie_at: now().toISOString() }).catch(() => {});
    const trouve = c.genre && c.prenom ? {} : await quiEst(c.user_id);
    const genre = c.genre || trouve.genre;
    const moiCible = { genre, prenom: c.prenom || trouve.prenom };
    const titre = adresser(reciproque ? '💞 {A}, c’est réciproque !' : '💌 {A}, quelqu’un s’intéresse à toi', moiCible);
    const corps = reciproque
      ? `Une personne que tu as choisie t’a choisi${accord(genre)} aussi. Lamia est prévenue : elle vérifie vos deux profils et vous met en relation très vite.`
      : 'Une personne vient de dire que ton profil l’intéresse. Découvre sa fiche (anonyme) dans ton espace et dis si elle t’intéresse aussi : si oui, c’est réciproque et Lamia vous met en relation.';
    const lien = 'https://lamia-femme-berbere.com/mon-espace/#interets';
    const uid = c.user_id || (table === 'annonces' && c.id ? (await read(`/rest/v1/annonces?id=eq.${c.id}&select=user_id`).catch(() => []))[0]?.user_id : null);
    await pousserMembre(uid, { titre, texte: reciproque ? 'Lamia est prévenue : elle vous met en relation très vite.' : 'Quelqu’un s’intéresse à ton profil. Découvre sa fiche anonyme.', lien: '/mon-espace/#interets' }).catch(() => {});
    await email(c.email, titre,
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">${esc(titre)}</h2><p>${corps}</p><p><a href="${lien}">${reciproque ? 'Voir mon espace' : 'Voir sa fiche et répondre'}</a></p><p style="font-size:13px">Ton identité et celle de l’autre personne restent secrètes : seule Lamia sait qui vous êtes.</p></div>`,
      `${titre}\n\n${corps}\n${lien}\n\nTon identité et celle de l’autre personne restent secrètes : seule Lamia sait qui vous êtes.`).catch(() => {});
  }
  // Réponse à une demande d'accord : oui = mise en relation (les deux sont prévenus), non = pas compatible et ses autres choix reviennent.
  async function conclureAccord(i, reponse, { parLamia = false } = {}) {
    const d = i.annonces;
    if (reponse === 'oui') {
      const r = await appliquerStatut(i.id, 'mis_en_relation');
      await alerter({ titre: r.error ? `💞 Accord reçu · n° ${i.cible_ref} accepte n° ${d.ref}` : `💞 Match fait · n° ${d.ref} ↔ n° ${i.cible_ref}`, lignes: [r.error ? `La mise en relation n’a pas pu se faire toute seule (${r.error === 'profil_non_verifie' ? 'profil pas encore validé' : r.error}) : fais-la dans ton outil.` : `${parLamia ? 'Tu as noté son accord' : 'La personne a dit oui dans son espace'} : ${d.prenom} et elle sont prévenus. Le duo arrive dans ton outil à la prochaine récupération.`], lien: '/confidences-lamia/#annonces', tag: 'reciproque' }).catch(() => {});
      return { match: !r.error };
    }
    await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'pas_compatible', updated_at: now().toISOString() });
    await reactiverReserve({ id: d.id }).catch(() => {});
    await alerter({ titre: `Refus · n° ${i.cible_ref} a dit non à n° ${d.ref}`, lignes: [`${d.prenom} n’est pas prévenu·e du refus. Ses autres choix restent à traiter.`], lien: '/confidences-lamia/#annonces', tag: 'proposition' }).catch(() => {});
    return { match: false };
  }
  // Réponse à « d'accord quand même ? » (critère pas respecté). Oui : si l'autre a déjà dit oui, le match se fait ; sinon Lamia continue (demander l'accord de l'autre).
  async function conclureAvis(i, reponse, { parLamia = false } = {}) {
    const d = i.annonces, qui = i.avis_qui === 'demandeur' ? `n° ${d.ref}` : `n° ${i.cible_ref}`;
    await patch('annonce_interets', `id=eq.${i.id}`, { avis_reponse: reponse, avis_repondu_at: now().toISOString(), ...(i.avis_qui === 'cible' && reponse === 'oui' ? { reponse: 'oui', reciproque: true, repondu_at: now().toISOString() } : {}) });
    if (reponse === 'oui') {
      const lAutreVeut = i.avis_qui === 'cible' || i.reciproque || i.reponse === 'oui';
      if (lAutreVeut) return conclureAccord(i, 'oui', { parLamia });
      await alerter({ titre: `👍 ${qui} est d’accord quand même · n° ${d.ref} → n° ${i.cible_ref}`, lignes: [`${parLamia ? 'Tu as noté son accord' : 'La personne a dit oui dans son espace'} malgré le critère pas respecté.`, 'Il reste l’accord de l’autre personne : clique « Demander son accord » dans ton outil.'], lien: '/tableau-de-bord#application', tag: 'proposition' }).catch(() => {});
      return { match: false, reste: 'accord' };
    }
    await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'pas_compatible', annule_motif: 'Pas d’accord malgré le critère', updated_at: now().toISOString() });
    await reactiverReserve({ id: d.id }).catch(() => {});
    await alerter({ titre: `Refus · ${qui} n’est pas d’accord (n° ${d.ref} → n° ${i.cible_ref})`, lignes: ['La demande est annulée. Personne d’autre n’est prévenu du refus.'], lien: '/tableau-de-bord#application', tag: 'proposition' }).catch(() => {});
    return { match: false };
  }
  async function compteParRef(ref) {
    if (ref < REF_OUTIL) { const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&status=in.(a_verifier,publiee)&select=id,ref,prenom,genre,email,user_id`).catch(() => []); return a?.user_id ? a : null; }
    const [o] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&user_id=not.is.null&select=ref,user_id,genre`).catch(() => []);
    if (!o) return null;
    const u = await compteDe(o.user_id);
    return u ? { ref, user_id: o.user_id, genre: o.genre, email: u.email, prenom: u.user_metadata?.first_name || '' } : null;
  }
  async function compteDe(id) {
    const r = await call(`/auth/v1/admin/users/${id}`).catch(() => null);
    return r?.ok ? r.json().catch(() => null) : null;
  }
  // ================================================================ pilote automatique
  // Lamia ne valide plus chaque action : le site envoie les meilleurs matchs (scores de son outil) aux deux personnes,
  // et dès que les deux disent oui, il les met en relation tout seul (discussion de 7 jours, puis numéros).
  // Lamia regarde la cartographie, règle le pilote (nombre de profils, note minimum) et peut annuler un match.
  const PILOTE_DEFAUT = { actif: true, parPersonne: 3, scoreMin: 55 };
  async function reglagesPilote() {
    const [r] = await read('/rest/v1/platform_settings?key=eq.pilote_auto&select=value').catch(() => []);
    const v = r?.value || {};
    return { actif: v.actif !== false, parPersonne: Math.min(10, Math.max(1, Number(v.parPersonne) || PILOTE_DEFAUT.parPersonne)), scoreMin: Math.min(100, Math.max(0, Number(v.scoreMin ?? PILOTE_DEFAUT.scoreMin))), dernier: v.dernier || null };
  }
  async function noterPilote(maj) {
    const actuel = await reglagesPilote();
    const { dernier, ...reste } = { ...actuel, ...maj };
    await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'pilote_auto', value: { ...reste, dernier }, updated_at: now().toISOString() }) }).catch(() => {});
  }
  // La personne visée est-elle libre (validée, visible, pas déjà en match) ?
  async function refLibre(ref) {
    if (ref < REF_OUTIL) { const [c] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=status,en_match,test`).catch(() => []); return Boolean(c && c.status === 'publiee' && !c.en_match); }
    const [o] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=visible,retire_at`).catch(() => []);
    if (!o || o.retire_at || o.visible === false) return false;
    const enCours = await read(`/rest/v1/annonce_interets?cible_ref=eq.${ref}&statut=eq.mis_en_relation&select=id&limit=1`).catch(() => []);
    return !enCours.length;
  }
  // 1. Les deux ont dit oui : mise en relation tout de suite (les deux sont prévenus, la discussion s'ouvre).
  async function miseEnRelationAuto() {
    const reg = await reglagesPilote();
    if (!reg.actif) return [];
    const liste = await read('/rest/v1/annonce_interets?statut=eq.a_traiter&or=(reciproque.eq.true,reponse.eq.oui)&select=id,cible_ref,created_at,annonces!inner(id,ref,prenom,status,en_match,test)&order=created_at.asc&limit=200').catch(() => []);
    const pris = new Set(), faits = [];
    for (const i of liste) {
      const a = i.annonces;
      if (!a || a.status !== 'publiee' || a.en_match || pris.has(a.ref) || pris.has(i.cible_ref)) continue;
      if (!(await refLibre(i.cible_ref))) continue;
      const r = await appliquerStatut(i.id, 'mis_en_relation').catch(() => ({ error: 'erreur' }));
      if (r.error) continue;
      pris.add(a.ref); pris.add(i.cible_ref);
      faits.push(`n° ${a.ref} ↔ n° ${i.cible_ref}`);
      await journaliser({ titre: `💞 Mise en relation automatique · n° ${a.ref} ↔ n° ${i.cible_ref}`, lignes: ['Les deux ont dit oui : le site les a mis en relation (discussion de 7 jours ouverte).'], lien: '/tableau-de-bord#activite', categorie: 'reciproque' }, { call, read }).catch(() => {});
    }
    return faits;
  }
  // Les deux ont dit oui à des propositions croisées : on enregistre l'accord comme un intérêt réciproque.
  async function accordCroise(pourRef, cibleRef) {
    const [x, y] = pourRef < REF_OUTIL ? [pourRef, cibleRef] : cibleRef < REF_OUTIL ? [cibleRef, pourRef] : [null, null];
    if (!x) return false;
    const [a] = await read(`/rest/v1/annonces?ref=eq.${x}&select=id`).catch(() => []);
    if (!a) return false;
    const [deja] = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&cible_ref=eq.${y}&select=id`).catch(() => []);
    if (deja) await patch('annonce_interets', `id=eq.${deja.id}`, { reciproque: true, reponse: 'oui', repondu_at: now().toISOString() });
    else await insert('annonce_interets', { demandeur_id: a.id, cible_ref: y, via: 'lamia', reciproque: true, reponse: 'oui', repondu_at: now().toISOString() });
    if (y < REF_OUTIL) { const [c] = await read(`/rest/v1/annonces?ref=eq.${y}&select=id`).catch(() => []); if (c) await patch('annonce_interets', `demandeur_id=eq.${c.id}&cible_ref=eq.${x}`, { reciproque: true }).catch(() => {}); }
    return true;
  }
  // 2. Envoi en masse : pour chaque personne qui a un compte, les meilleurs profils (note de l'outil, sans blocage),
  //    proposés dans les deux sens. Une seule notification par personne.
  async function proposerEnMasse({ parPersonne, scoreMin } = {}) {
    const reg = await reglagesPilote();
    const N = parPersonne || reg.parPersonne, min = scoreMin ?? reg.scoreMin;
    const site = await read('/rest/v1/annonces?status=eq.publiee&test=eq.false&en_match=eq.false&user_id=not.is.null&select=id,ref,prenom,genre,email,user_id').catch(() => []);
    const fiches = await read('/rest/v1/profils_outil?user_id=not.is.null&retire_at=is.null&visible=eq.true&select=ref,user_id').catch(() => []);
    const occupees = new Set((await read('/rest/v1/annonce_interets?statut=eq.mis_en_relation&select=cible_ref').catch(() => [])).map((x) => x.cible_ref));
    const membres = new Map([...site.map((a) => [a.ref, a]), ...fiches.filter((f) => !occupees.has(f.ref)).map((f) => [f.ref, f])]);
    const refs = [...membres.keys()];
    if (refs.length < 2) return { propositions: 0, personnes: 0 };
    const scores = await read(`/rest/v1/scores_outil?a_ref=in.(${refs.join(',')})&b_ref=in.(${refs.join(',')})&score=gte.${min}&or=(bloque.is.null,bloque.eq.false)&select=a_ref,b_ref,score&order=score.desc&limit=5000`).catch(() => []);
    const cle = (x, y) => (x < y ? `${x}-${y}` : `${y}-${x}`);
    const deja = new Set();
    for (const p of await read('/rest/v1/propositions?select=pour_ref,cible_ref&limit=20000').catch(() => [])) deja.add(cle(p.pour_ref, p.cible_ref));
    const idVersRef = new Map(site.map((a) => [a.id, a.ref]));
    const toutesAnnonces = await read('/rest/v1/annonces?select=id,ref&limit=5000').catch(() => []);
    for (const a of toutesAnnonces) idVersRef.set(a.id, a.ref);
    for (const i of await read('/rest/v1/annonce_interets?select=demandeur_id,cible_ref&limit=20000').catch(() => [])) { const r = idVersRef.get(i.demandeur_id); if (r) deja.add(cle(r, i.cible_ref)); }
    for (const p of await read('/rest/v1/annonce_passes?select=demandeur_id,cible_ref&limit=20000').catch(() => [])) { const r = idVersRef.get(p.demandeur_id); if (r) deja.add(cle(r, p.cible_ref)); }
    // Propositions encore sans réponse (moins de 10 jours) : on n'en ajoute pas au-delà du nombre réglé.
    const enAttente = new Map();
    const depuis = encodeURIComponent(new Date(now().getTime() - 10 * 86400e3).toISOString());
    for (const p of await read(`/rest/v1/propositions?reponse=is.null&created_at=gte.${depuis}&select=pour_ref&limit=5000`).catch(() => [])) enAttente.set(p.pour_ref, (enAttente.get(p.pour_ref) || 0) + 1);
    const nouvelles = [], touches = new Set();
    for (const s of scores) {
      const k = cle(s.a_ref, s.b_ref);
      if (deja.has(k)) continue;
      if ((enAttente.get(s.a_ref) || 0) >= N || (enAttente.get(s.b_ref) || 0) >= N) continue;
      deja.add(k);
      nouvelles.push({ pour_ref: s.a_ref, cible_ref: s.b_ref, potentiel: s.score, auto: true }, { pour_ref: s.b_ref, cible_ref: s.a_ref, potentiel: s.score, auto: true });
      enAttente.set(s.a_ref, (enAttente.get(s.a_ref) || 0) + 1); enAttente.set(s.b_ref, (enAttente.get(s.b_ref) || 0) + 1);
      touches.add(s.a_ref); touches.add(s.b_ref);
    }
    for (let i = 0; i < nouvelles.length; i += 500) await call('/rest/v1/propositions?on_conflict=pour_ref,cible_ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(nouvelles.slice(i, i + 500)) });
    for (const ref of touches) {
      const m = membres.get(ref);
      const membre = ref < REF_OUTIL ? m : await compteParRef(ref).catch(() => null);
      const n = nouvelles.filter((x) => x.pour_ref === ref).length;
      await prevenirMembre(membre, { titre: `💌 {A}, Lamia te propose ${n > 1 ? `${n} profils` : 'un profil'}`, texte: 'Lamia a sélectionné pour toi des profils qui te correspondent. Découvre leurs fiches (anonymes) dans ton espace et dis oui ou non : si l’autre personne dit oui aussi, vous êtes mis en relation tout de suite.', bouton: 'Voir mes propositions', lien: '/mon-espace/#propositions' }).catch(() => {});
    }
    return { propositions: nouvelles.length, personnes: touches.size };
  }
  async function piloteAuto({ proposer = false, reglages = {} } = {}) {
    const reg = await reglagesPilote();
    if (!reg.actif && !proposer) return { actif: false };
    const relations = await miseEnRelationAuto();
    const envoi = proposer ? await proposerEnMasse(reglages) : { propositions: 0, personnes: 0 };
    const dernier = { le: now().toISOString(), relations: relations.length, propositions: envoi.propositions, personnes: envoi.personnes };
    if (relations.length || envoi.propositions || proposer) await noterPilote({ dernier });
    return { actif: reg.actif, relations, ...envoi };
  }

  async function noterInteret(a, ref, via = 'bouton') {
    await insert('annonce_interets', { demandeur_id: a.id, cible_ref: ref, via }).catch(() => {});
    if (ref >= REF_OUTIL) {
      // Fiche de l'outil reliée à un compte : la personne est prévenue par email (sans savoir qui).
      const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&user_id=not.is.null&select=ref,user_id,genre,interet_notifie_at`).catch(() => []);
      if (f) { const u = await compteDe(f.user_id); if (u?.email) await prevenirChoisi({ ref: f.ref, user_id: f.user_id, genre: f.genre, email: u.email, prenom: u.user_metadata?.first_name || '', interet_notifie_at: f.interet_notifie_at }, false, 'profils_outil'); }
      return false;
    }
    const [c] = await read(`/rest/v1/annonces?ref=eq.${ref}&status=in.(a_verifier,publiee)&select=id,ref,prenom,genre,status,email,user_id,interet_notifie_at`).catch(() => []);
    if (!c) return false;
    const [retour] = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${c.id}&cible_ref=eq.${a.ref}&select=id`).catch(() => []);
    if (!retour) { await prevenirChoisi(c, false); return false; }
    await prevenirChoisi(c, true);
    await prevenirChoisi(a, true);
    await patch('annonce_interets', `id=eq.${retour.id}`, { reciproque: true }).catch(() => {});
    await patch('annonce_interets', `demandeur_id=eq.${a.id}&cible_ref=eq.${ref}`, { reciproque: true }).catch(() => {});
    // Pilote automatique : mise en relation tout de suite si les deux profils sont validés et libres.
    const faits = await miseEnRelationAuto().catch(() => []);
    if (!faits.length) await alerter({ titre: `💞 Intérêt réciproque · n° ${a.ref} ↔ n° ${c.ref}`, lignes: [`${a.prenom} (n° ${a.ref}) et ${c.prenom} (n° ${c.ref}) se sont choisis l’un l’autre.`, [a, c].every((x) => x.status === 'publiee') ? 'Les deux profils sont vérifiés.' : 'Un des deux profils n’est pas encore vérifié : la mise en relation se fera dès qu’il sera validé.'], lien: '/tableau-de-bord#activite', tag: 'reciproque' }).catch(() => {});
    return true;
  }
  // Swipe : profils de l'autre genre, pas encore vus (ni choisis ni passés).
  if (action === 'annonce_swipe_liste') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const [deja, passes] = await Promise.all([
      read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&select=cible_ref`).catch(() => []),
      read(`/rest/v1/annonce_passes?demandeur_id=eq.${a.id}&select=cible_ref`).catch(() => []),
    ]);
    const vus = new Set([a.ref, ...deja.map((x) => x.cible_ref), ...passes.map((x) => x.cible_ref)]);
    const autre = a.genre === 'femme' ? 'homme' : 'femme';
    let profils = [...(a.test ? await listePublique({ tests: true }) : []), ...(await listePublique())].filter((p) => p.genre === autre && !vus.has(p.ref));
    { const so = await read(`/rest/v1/scores_outil?or=(a_ref.eq.${a.ref},b_ref.eq.${a.ref})&select=a_ref,b_ref,score&limit=1000`).catch(() => []);
      const sc = new Map(so.map((r) => [r.a_ref === a.ref ? r.b_ref : r.a_ref, r.score]));
      if (sc.size) profils = profils.map((p, i) => ({ p, i, s: sc.get(p.ref) ?? -1 })).sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.p); }
    const f = await maFormule(), choisi = await quiMaChoisi(a), faits = await swipesDuJour(a);
    // « Qui m'a choisi·e » (Passion, Prestige) : ces profils passent en tête, marqués. Sinon : seulement leur nombre.
    if (f.quiMaChoisi) { const c = new Set(choisi); profils = [...profils.filter((p) => c.has(p.ref)).map((p) => ({ ...p, ta_choisi: true })), ...profils.filter((p) => !c.has(p.ref))]; }
    const restants = f.swipesJour ? Math.max(0, f.swipesJour - faits) : null;
    const matchs = { actifs: await matchsEnCours(a), limite: limiteMatchs(f, a), formule: f.id };
    const mc = a.matching || {};
    const criteres = { age_min: a.age_min || null, age_max: a.age_max || null, religion: mc.religionRecherche && mc.religionRecherche !== 'Pas important' ? mc.religionRecherche : '', pratique: mc.pratiqueRecherche && mc.pratiqueRecherche !== 'Pas important' ? mc.pratiqueRecherche : '' };
    return json({ ok: true, profils, criteres, genre: autre, formule: f.id, quota: { limite: f.swipesJour, restants }, choisi: { nombre: choisi.length, refs: f.quiMaChoisi ? choisi : [] }, matchs });
  }
  if (action === 'annonce_swipe') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0) || ref === a.ref || !['oui', 'non'].includes(b.choix)) return json({ error: 'bad_request' }, 400);
    const f = await maFormule();
    if (b.choix === 'non') { await insert('annonce_passes', { demandeur_id: a.id, cible_ref: ref }).catch(() => {}); return json({ ok: true }); }
    const actifs = await matchsEnCours(a), limite = limiteMatchs(f, a);
    if (actifs >= limite) return json({ error: 'limite_matchs', actifs, limite, formule: f.id }, 409);
    const match = await noterInteret(a, ref, 'swipe');
    return json({ ok: true, match, ref, matchs: { actifs: actifs + (match ? 1 : 0), limite } });
  }
  // Revenir sur le dernier swipe (tant que Lamia ne l'a pas traité et que ce n'est pas devenu un match).
  if (action === 'annonce_swipe_annuler') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0)) return json({ error: 'bad_request' }, 400);
    await call(`/rest/v1/annonce_passes?demandeur_id=eq.${a.id}&cible_ref=eq.${ref}`, { method: 'DELETE' }).catch(() => {});
    await call(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&cible_ref=eq.${ref}&statut=eq.a_traiter&reciproque=eq.false`, { method: 'DELETE' }).catch(() => {});
    return json({ ok: true });
  }
  if (action === 'annonce_push_cle') {
    const [k] = await read('/rest/v1/platform_settings?key=eq.vapid&select=value').catch(() => []);
    let keys = k?.value;
    if (!keys?.publicKey) { keys = genererClesVapid(); await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'vapid', value: keys, updated_at: now().toISOString() }) }); }
    return json({ ok: true, publicKey: keys.publicKey });
  }
  if (action === 'annonce_push_abonner') {
    if (!user) return json({ error: 'login_required' }, 401);
    const sub = b.subscription || {}, endpoint = clean(sub.endpoint, 1000);
    if (!/^https:\/\//.test(endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: 'bad_request' }, 400);
    await call('/rest/v1/push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: user.id, endpoint, p256dh: clean(sub.keys.p256dh, 200), auth: clean(sub.keys.auth, 100), label: user.app_metadata?.role === 'admin' ? 'Lamia · téléphone' : 'membre', pour: user.app_metadata?.role === 'admin' ? 'lamia' : 'membre' }) });
    if (b.tester) await pousserMembre(user.id, { titre: '🔔 Notifications activées', texte: '{A}, tu seras prévenu{e} ici dès qu’une personne s’intéresse à toi ou que Lamia te trouve un match.' });
    return json({ ok: true });
  }
  if (action === 'annonce_push_desabonner') {
    if (!user) return json({ error: 'login_required' }, 401);
    await call(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(clean(b.endpoint, 1000))}&user_id=eq.${user.id}&pour=eq.membre`, { method: 'DELETE' });
    return json({ ok: true });
  }
  // « Ce profil m'intéresse » quand on a déjà un profil : pas de nouveau formulaire.
  if (action === 'annonce_interet') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0) || ref === a.ref) return json({ error: 'bad_request' }, 400);
    { const f = await maFormule(), actifs = await matchsEnCours(a), limite = limiteMatchs(f, a); if (actifs >= limite) return json({ error: 'limite_matchs', actifs, limite, formule: f.id }, 409); }
    if (await noterInteret(a, ref)) return json({ ok: true, match: true });
    await alerter({ titre: `Match demandé · n° ${a.ref} → n° ${ref}`, lignes: [`${a.prenom} s’intéresse au profil n° ${ref}`, a.status === 'publiee' ? 'Profil déjà vérifié' : 'Profil pas encore vérifié'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true });
  }
  // Mettre fin à un match en cours : la personne peut de nouveau matcher.
  if (action === 'annonce_dematcher') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a || !a.en_match) return json({ ok: true });
    await finirMatch(a);
    await alerter({ titre: `Dématch · profil n° ${a.ref}`, lignes: [`${a.prenom} a mis fin à son match en cours depuis son espace.`, 'Son profil peut de nouveau matcher.'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- liaison avec l'outil de matching (sur l'ordinateur de Lamia)
  // L'outil s'identifie avec une clé secrète générée par Lamia dans son espace ; seule son empreinte est gardée ici.
  // Validation d'un profil par Lamia (depuis son espace ou depuis son outil) : pièce d'identité effacée, email à la personne.
  async function validerProfil(a, files, note = null, { auto = false } = {}) {
      const id = a.id;
      // Validation automatique : personne n'a regardé la pièce d'identité, donc elle est gardée pour Lamia et le badge n'est pas donné.
      if (!auto) await effacer(files.filter((f) => f.kind === 'identite'));
      // La pièce d'identité est facultative : le badge « vérifié avec pièce d'identité » n'est donné que si elle a été fournie.
      const avecPiece = !auto && (files.some((f) => f.kind === 'identite') || Boolean(a.identite_verifiee_at));
      await patch('annonces', `id=eq.${id}`, { status: 'publiee', published_at: a.published_at || now().toISOString(), identite_verifiee_at: avecPiece ? a.identite_verifiee_at || now().toISOString() : null, note_lamia: note });
      if (a.status !== 'publiee') await email(a.email, `Ton profil n° ${a.ref} est validé par Lamia`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonne nouvelle ${esc(salutDe(a))} !</h2><p>${auto ? 'Ton profil est complet : il est validé.' : avecPiece ? 'Lamia a vérifié ton profil et ton identité. Ta pièce d’identité a été supprimée.' : 'Lamia a vérifié ton profil.'}</p><p>Ton profil n’est publié nulle part : il reste chez Lamia, qui le passe dans son outil de matching. Elle te dira bientôt avec combien de personnes tu pourrais correspondre.</p></div>`,
        `Bonne nouvelle ${salutDe(a)} ! Lamia a vérifié ton profil${avecPiece ? ' et ton identité (ta pièce d’identité a été supprimée)' : ''}. Ton profil n’est publié nulle part : Lamia le passe dans son outil de matching et te dira bientôt avec combien de personnes tu pourrais correspondre.`).catch(() => false);
  }
  // Un profil est complet quand : au moins une photo bien arrivée, un email valide, et un lien de réseau social reconnu
  // (TikTok, Instagram, Facebook) ou un numéro de téléphone valide. Complet = validé automatiquement.
  function manquesProfil(a, files) {
    const m = [];
    if (!files.some((f) => f.kind === 'photo')) m.push('photo');
    if (!EMAIL.test(String(a.email || '')) || /\.invalid$/.test(a.email)) m.push('email valide');
    if (!normLien(a.matching?.contactReseau) && !telephoneNormal(a.phone)) m.push('lien de réseau social ou téléphone valide');
    return m;
  }
  async function autoValider(a, files = null) {
    if (a.status !== 'a_verifier' || a.test) return { valide: false, manques: [] };
    const f = files || await read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&select=id,kind,storage_path`).catch(() => []);
    const manques = manquesProfil(a, f);
    if (manques.length) return { valide: false, manques };
    await validerProfil(a, f, 'Validé automatiquement : photo, email et contact vérifiés.', { auto: true });
    await alerter({ titre: `✅ Profil n° ${a.ref} validé automatiquement`, lignes: [`${a.prenom} : photo, email et ${a.phone ? 'téléphone' : 'lien de réseau'} vérifiés.`, f.some((x) => x.kind === 'identite') ? 'Une pièce d’identité a été envoyée : regarde-la quand tu peux (badge « pièce d’identité » à donner).' : ''].filter(Boolean), lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return { valide: true, manques: [] };
  }
  // Repasse sur les profils en attente : valide ceux qui sont complets, renvoie ce qui manque aux autres.
  async function autoValiderEnAttente() {
    const list = await read('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=*').catch(() => []);
    const manques = {};
    for (const a of list) { const r = await autoValider(a).catch(() => ({ valide: false, manques: [] })); if (!r.valide) manques[a.ref] = r.manques; }
    return manques;
  }
  const cleOk = async () => {
    const cle = clean(b.cle, 120);
    if (cle.length < 30) return false;
    const [row] = await read('/rest/v1/platform_settings?key=eq.outil_liaison&select=value').catch(() => []);
    const h = row?.value?.hash;
    if (!h) return false;
    const x = Buffer.from(createHash('sha256').update(cle).digest('hex')), y = Buffer.from(String(h));
    return x.length === y.length && timingSafeEqual(x, y);
  };
  if (action === 'outil_synchro') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    await autoValiderEnAttente().catch(() => ({}));
    await miseEnRelationAuto().catch(() => []);
    // Les profils à vérifier arrivent aussi dans l'outil, pour que Lamia teste leur potentiel avant de valider (sans pièce d'identité).
    const list = await read('/rest/v1/annonces?status=in.(a_verifier,publiee)&test=eq.false&select=*&order=submitted_at.desc&limit=500');
    const ids = list.map((a) => a.id);
    const files = ids.length ? await read(`/rest/v1/annonce_files?annonce_id=in.(${ids.join(',')})&kind=neq.identite&select=annonce_id,kind,mime,storage_path,position`) : [];
    const urls = await liensLecture(files, 3600);
    const interets = ids.length ? await read(`/rest/v1/annonce_interets?select=id,demandeur_id,cible_ref,statut,created_at,reciproque,via,reponse,accord_demande_at,avis_qui,avis_demande_at,avis_reponse,annule_motif&order=created_at.desc&limit=500`) : [];
    const profiles = list.map((a) => {
      const f = files.filter((x) => x.annonce_id === a.id).sort((x, y) => x.position - y.position);
      const photo = f.find((x) => x.kind === 'photo');
      return { ...versOutil({ ...a, age: ageAu(a.birth_date, now()), medias: f.map((x) => ({ kind: x.kind })), interets: interets.filter((i) => i.demandeur_id === a.id).map((i) => i.cible_ref) }), photoUrl: photo ? urls[photo.storage_path] || '' : '', outilLie: a.outil_id || '', siteModifieLe: ['v2', a.status, a.modifiee_at || a.published_at || a.submitted_at || ''].join('|'), live: a.live_declare, enMatch: a.en_match, aVerifier: a.status === 'a_verifier', ref: a.ref };
    });
    const refDe = Object.fromEntries(list.map((a) => [a.id, a.ref]));
    const fichesCibles = await (async () => { const r = [...new Set(interets.map((i) => i.cible_ref).filter((x) => x >= REF_OUTIL))]; return r.length ? read(`/rest/v1/profils_outil?ref=in.(${r.join(',')})&select=ref,outil_id,confirme_at,retire_at,user_id`).catch(() => []) : []; })();
    const outil = Object.fromEntries(fichesCibles.map((p) => [p.ref, p.outil_id]));
    // Pour Lamia : la personne choisie est-elle validée sur le site, et a-t-elle un compte (prévenue par le site) ou faut-il passer par WhatsApp ?
    const etatCible = (ref) => {
      if (ref < REF_OUTIL) { const a = list.find((x) => x.ref === ref); return a ? { cible_etat: a.status === 'publiee' ? 'valide' : 'a_verifier', cible_compte: Boolean(a.user_id) } : { cible_etat: 'absent', cible_compte: false }; }
      const f = fichesCibles.find((x) => x.ref === ref);
      return f ? { cible_etat: f.retire_at ? 'retiree' : f.confirme_at ? 'confirmee' : 'en_attente', cible_compte: Boolean(f.user_id) } : { cible_etat: 'absent', cible_compte: false };
    };
    const demandes = interets.filter((i) => refDe[i.demandeur_id]).map((i) => ({ id: i.id, demandeur: `site-annonce-${refDe[i.demandeur_id]}`, cible: outil[i.cible_ref] || `site-annonce-${i.cible_ref}`, statut: i.statut, created_at: i.created_at, reciproque: Boolean(i.reciproque), via: i.via || '', reponse: i.reponse || null, accord_demande_at: i.accord_demande_at || null, avis_qui: i.avis_qui || null, avis_demande_at: i.avis_demande_at || null, avis_reponse: i.avis_reponse || null, annule_motif: i.annule_motif || null, demandeur_ref: refDe[i.demandeur_id], cible_ref: i.cible_ref, verifie: list.find((a) => a.id === i.demandeur_id)?.status === 'publiee', demandeur_compte: Boolean(list.find((a) => a.id === i.demandeur_id)?.user_id), ...etatCible(i.cible_ref) }));
    if (ids.length) await patch('annonces', `id=in.(${ids.join(',')})&exportee_at=is.null`, { exportee_at: now().toISOString() });
    const enAttente = await read('/rest/v1/annonces?status=eq.a_verifier&select=ref').catch(() => []);
    // Réponses des personnes à qui Lamia a envoyé leur fiche : confirmée, à modifier, refusée (retirée) ou effacement demandé.
    const reps = await read('/rest/v1/profils_outil?select=outil_id,confirme_at,retire_at,modif_at,modif_demandee,effacement_at,effacement_fait_at').catch(() => []);
    const confirmations = {}, modifications = {};
    for (const x of reps) {
      if (x.effacement_fait_at) continue;
      confirmations[x.outil_id] = x.effacement_at ? 'effacement' : x.retire_at ? 'retiree' : x.confirme_at ? 'confirmee' : x.modif_at ? 'a_modifier' : 'en_attente';
      if (x.modif_at && !x.confirme_at && !x.retire_at) modifications[x.outil_id] = x.modif_demandee || '';
    }
    return json({ ok: true, profiles, demandes, a_verifier: enAttente.map((x) => x.ref), confirmations, modifications });
  }
  // L'outil a supprimé les fiches refusées : on efface aussi leur contenu sur le site (seul le numéro reste, pour qu'elles ne reviennent pas).
  if (action === 'outil_efface') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => clean(x, 80)).filter((x) => /^[\w:.-]+$/.test(x)).slice(0, 200);
    if (!ids.length) return json({ ok: true, effaces: 0 });
    await patch('profils_outil', `outil_id=in.(${ids.map((x) => `"${x}"`).join(',')})&retire_at=not.is.null`, { effacement_fait_at: now().toISOString(), visible: false, profil: 'Fiche effacée à la demande de la personne.', recherche: 'Fiche effacée à la demande de la personne.', ville: null, village: null, secteur: null, caracteristiques: [], origine: [], etudes: null, modif_demandee: null, user_id: null });
    return json({ ok: true, effaces: ids.length });
  }
  // ---------------------------------------------------------------- confirmation des fiches de l'outil par les personnes
  // Lamia envoie à chaque personne saisie en live un lien personnel (n° de fiche + jeton signé).
  // La fiche est affichée « en attente de confirmation » jusqu'à ce que la personne confirme ; « ne plus apparaître » la masque définitivement.
  const jetonFiche = (ref) => jetonAnnonce(env, `outil-${ref}`, 'confirmer');
  const lienFiche = (ref) => `https://lamia-femme-berbere.com/rencontres/confirmer/?n=${ref}&t=${jetonFiche(ref)}`;
  // Relier sa fiche de l'outil à son compte (depuis son lien personnel), puis la suivre dans « Mon espace ».
  if (action === 'annonce_lier_fiche_outil') {
    if (!user) return json({ error: 'login_required' }, 401);
    const ref = Number.parseInt(b.n, 10);
    if (!(ref >= REF_OUTIL) || !jetonAnnonceValide(env, `outil-${ref}`, b.t, 'confirmer')) return json({ error: 'lien_invalide' }, 403);
    const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=ref,user_id,retire_at`).catch(() => []);
    if (!f) return json({ error: 'lien_invalide' }, 404);
    if (f.user_id && f.user_id !== user.id) return json({ error: 'deja_liee' }, 409);
    if (!f.user_id) {
      await patch('profils_outil', `ref=eq.${ref}`, { user_id: user.id });
      await alerter({ titre: `🔗 Fiche n° ${ref} reliée à un compte`, lignes: [`La personne a créé son accès (${user.email}) : elle suit sa fiche et les intérêts reçus dans son espace.`], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    return json({ ok: true, ref });
  }
  // Intérêts reçus : la personne choisie voit la fiche ANONYME de celle qui s'intéresse à elle (comme dans les profils du site)
  // et répond oui (c'est réciproque : Lamia est prévenue) ou non. Jamais de prénom, de photo ni de contact.
  const ficheAnonymeDe = (a) => ({ ref: a.ref, genre: a.genre, age: ageAu(a.birth_date, now()), ville: a.ville, pays: a.pays, situation: a.situation, profil: sansContact(a.profil || ''), recherche: sansContact(a.recherche || ''), age_min: a.age_min, age_max: a.age_max, origine: a.matching?.origineTags || [], caracteristiques: a.matching?.caracteristiques || [], secteur: sansContact(clean([a.matching?.zoneGeo, a.matching?.paysRechercheDetail, a.matching?.regionRechercheDetail].filter(Boolean).join(' · '), 120)) || null });
  const mesRefs = async () => {
    const a = await monProfil();
    const fiches = await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&select=ref`).catch(() => []);
    return [...(a ? [a.ref] : []), ...fiches.map((f) => f.ref)];
  };
  // Fiche anonyme d'un profil (du site ou de l'outil), pour les propositions de Lamia.
  async function ficheParRef(ref) {
    if (ref < REF_OUTIL) { const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=ref,genre,birth_date,ville,pays,situation,profil,recherche,age_min,age_max,matching,status`).catch(() => []); return a ? ficheAnonymeDe(a) : null; }
    const [o] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=ref,genre,age,ville,village,pays,secteur,situation,profil,recherche,age_min,age_max,origine,caracteristiques`).catch(() => []);
    return o ? { ...o, profil: sansContact(o.profil || ''), recherche: sansContact(o.recherche || '') } : null;
  }
  if (action === 'annonce_propositions') {
    if (!user) return json({ error: 'login_required' }, 401);
    const refs = await mesRefs();
    if (!refs.length) return json({ ok: true, propositions: [] });
    const liste = await read(`/rest/v1/propositions?pour_ref=in.(${refs.join(',')})&select=id,pour_ref,cible_ref,message,reponse,created_at&order=created_at.desc&limit=20`).catch(() => []);
    const out = [];
    for (const x of liste) { const fiche = await ficheParRef(x.cible_ref); if (fiche) out.push({ id: x.id, pour: x.pour_ref, le: x.created_at, message: x.message, reponse: x.reponse, fiche }); }
    return json({ ok: true, propositions: out });
  }
  if (action === 'annonce_proposition_rep') {
    if (!user) return json({ error: 'login_required' }, 401);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['oui', 'non'].includes(b.reponse)) return json({ error: 'bad_request' }, 400);
    const refs = await mesRefs();
    const [x] = await read(`/rest/v1/propositions?id=eq.${id}&select=*`).catch(() => []);
    if (!x || !refs.includes(x.pour_ref)) return json({ error: 'not_found' }, 404);
    await patch('propositions', `id=eq.${id}`, { reponse: b.reponse, repondu_at: now().toISOString() });
    let reciproque = false;
    if (b.reponse === 'oui') {
      const moi = await monProfil();
      if (moi && moi.ref === x.pour_ref) reciproque = await noterInteret(moi, x.cible_ref, 'lamia').catch(() => false);
      // L'autre personne avait aussi accepté la proposition inverse : c'est réciproque.
      const [inverse] = await read(`/rest/v1/propositions?pour_ref=eq.${x.cible_ref}&cible_ref=eq.${x.pour_ref}&reponse=eq.oui&select=id`).catch(() => []);
      if (inverse) { reciproque = true; await accordCroise(x.pour_ref, x.cible_ref).catch(() => false); }
    } else {
      // Non : la proposition inverse encore sans réponse est retirée (l'autre n'attend pas pour rien).
      await call(`/rest/v1/propositions?pour_ref=eq.${x.cible_ref}&cible_ref=eq.${x.pour_ref}&reponse=is.null`, { method: 'DELETE' }).catch(() => {});
    }
    const relie = reciproque ? (await miseEnRelationAuto().catch(() => [])).length > 0 : false;
    if (x.auto && !relie) return json({ ok: true, reponse: b.reponse, reciproque });
    if (relie) return json({ ok: true, reponse: b.reponse, reciproque, mis_en_relation: true });
    await alerter({ titre: b.reponse === 'oui' ? `${reciproque ? '💞' : '✅'} Proposition acceptée · n° ${x.pour_ref} → n° ${x.cible_ref}` : `Proposition refusée · n° ${x.pour_ref} → n° ${x.cible_ref}`, lignes: [b.reponse === 'oui' ? (reciproque ? 'Les deux ont dit oui : fais la mise en relation.' : 'La personne est intéressée par le profil que tu lui as proposé.') : 'La personne ne souhaite pas ce profil.'], lien: '/confidences-lamia/#annonces', tag: 'proposition' }).catch(() => {});
    return json({ ok: true, reponse: b.reponse, reciproque });
  }
  // « Lamia te demande ton avis » : un critère de la personne n'est pas respecté (secteur…), Lamia lui demande si c'est d'accord quand même.
  if (action === 'annonce_avis_lamia') {
    if (!user) return json({ error: 'login_required' }, 401);
    const refs = await mesRefs(), moi = await monProfil();
    const ors = [moi ? `and(demandeur_id.eq.${moi.id},avis_qui.eq.demandeur)` : '', refs.length ? `and(cible_ref.in.(${refs.join(',')}),avis_qui.eq.cible)` : ''].filter(Boolean);
    if (!ors.length) return json({ ok: true, avis: [] });
    const rows = await read(`/rest/v1/annonce_interets?or=(${ors.join(',')})&avis_demande_at=not.is.null&statut=in.(a_traiter,en_reserve)&select=id,cible_ref,avis_qui,avis_question,avis_demande_at,avis_reponse,annonces!inner(ref,genre,birth_date,ville,pays,situation,profil,recherche,age_min,age_max,matching,status)&order=avis_demande_at.desc&limit=20`).catch(() => []);
    const out = [];
    for (const i of rows) {
      const fiche = i.avis_qui === 'demandeur' ? await ficheParRef(i.cible_ref) : ficheAnonymeDe(i.annonces);
      if (fiche) out.push({ id: i.id, question: i.avis_question || '', le: i.avis_demande_at, reponse: i.avis_reponse || null, fiche });
    }
    return json({ ok: true, avis: out });
  }
  if (action === 'annonce_repondre_avis') {
    if (!user) return json({ error: 'login_required' }, 401);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['oui', 'non'].includes(b.reponse)) return json({ error: 'bad_request' }, 400);
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,demandeur_id,statut,reciproque,reponse,avis_qui,avis_reponse,annonces!inner(id,ref,prenom,email,status,user_id)`).catch(() => []);
    if (!i || !i.avis_qui) return json({ error: 'not_found' }, 404);
    const refs = await mesRefs();
    const cEstMoi = i.avis_qui === 'demandeur' ? i.annonces.user_id === user.id : refs.includes(i.cible_ref);
    if (!cEstMoi) return json({ error: 'not_found' }, 404);
    if (i.statut !== 'a_traiter' && i.statut !== 'en_reserve') return json({ ok: true, reponse: i.avis_reponse, deja: true });
    return json({ ok: true, reponse: b.reponse, ...(await conclureAvis(i, b.reponse)) });
  }
  if (action === 'annonce_interets_recus') {
    if (!user) return json({ error: 'login_required' }, 401);
    const refs = await mesRefs();
    if (!refs.length) return json({ ok: true, interets: [] });
    const recus = await read(`/rest/v1/annonce_interets?cible_ref=in.(${refs.join(',')})&select=id,cible_ref,created_at,statut,reciproque,reponse,annonces!inner(ref,genre,birth_date,ville,pays,situation,profil,recherche,age_min,age_max,matching,status)&order=created_at.desc&limit=100`).catch(() => []);
    return json({ ok: true, interets: recus.filter((i) => i.annonces && ['a_verifier', 'publiee'].includes(i.annonces.status)).map((i) => ({ id: i.id, pour: i.cible_ref, le: i.created_at, statut: i.statut, reponse: i.reponse || (i.reciproque ? 'oui' : null), fiche: ficheAnonymeDe(i.annonces) })) });
  }
  if (action === 'annonce_repondre_interet') {
    if (!user) return json({ error: 'login_required' }, 401);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['oui', 'non'].includes(b.reponse)) return json({ error: 'bad_request' }, 400);
    const refs = await mesRefs();
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,demandeur_id,statut,accord_demande_at,annonces!inner(id,ref,prenom,email,status)`).catch(() => []);
    if (!i || !refs.includes(i.cible_ref)) return json({ error: 'not_found' }, 404);
    await patch('annonce_interets', `id=eq.${id}`, { reponse: b.reponse, repondu_at: now().toISOString(), ...(b.reponse === 'oui' ? { reciproque: true } : {}) });
    if (i.accord_demande_at && i.statut === 'a_traiter') return json({ ok: true, reponse: b.reponse, ...(await conclureAccord(i, b.reponse)) });
    // « Pas pour moi » : la demande sort de la liste « À matcher » de Lamia (le demandeur n'est pas prévenu) ; ses autres choix en réserve reviennent.
    if (b.reponse === 'non' && ['a_traiter', 'en_reserve'].includes(i.statut)) {
      await patch('annonce_interets', `id=eq.${id}`, { statut: 'pas_compatible', annule_motif: 'A répondu « pas pour moi »', updated_at: now().toISOString() }).catch(() => {});
      await reactiverReserve({ id: i.demandeur_id }).catch(() => {});
    }
    if (b.reponse === 'oui') {
      const d = i.annonces;
      // Si la personne choisie a elle-même un profil sur le site, son intérêt en retour est noté aussi.
      const moi = await monProfil();
      if (moi && moi.ref === i.cible_ref) { await insert('annonce_interets', { demandeur_id: moi.id, cible_ref: d.ref, via: 'reponse', reciproque: true }).catch(() => {}); }
      await prevenirChoisi(d, true);
      if ((await miseEnRelationAuto().catch(() => [])).length) return json({ ok: true, reponse: b.reponse, mis_en_relation: true });
      await alerter({ titre: `💞 Intérêt réciproque · n° ${d.ref} ↔ n° ${i.cible_ref}`, lignes: [`La personne du profil n° ${i.cible_ref} a répondu OUI à l’intérêt du profil n° ${d.ref} (${d.prenom}).`, 'Teste-les dans ton outil, puis fais la mise en relation.'], lien: '/confidences-lamia/#annonces', tag: 'reciproque' }).catch(() => {});
    }
    return json({ ok: true, reponse: b.reponse });
  }
  if (action === 'annonce_mes_fiches_outil') {
    if (!user) return json({ error: 'login_required' }, 401);
    const fiches = await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&select=ref,genre,age,ville,village,pays,situation,profil,recherche,age_min,age_max,confirme_at,retire_at,modif_at,visible`).catch(() => []);
    const out = [];
    for (const f of fiches) {
      const recus = await read(`/rest/v1/annonce_interets?cible_ref=eq.${f.ref}&select=created_at,statut,reciproque&order=created_at.desc`).catch(() => []);
      out.push({
        ref: f.ref, genre: f.genre, age: f.age, ville: f.ville, village: f.village, pays: f.pays, situation: f.situation,
        profil: sansContact(f.profil), recherche: sansContact(f.recherche), age_min: f.age_min, age_max: f.age_max,
        etat: f.retire_at ? 'retiree' : f.confirme_at ? 'confirmee' : f.modif_at ? 'a_modifier' : 'en_attente', visible: f.visible && !f.retire_at,
        interets: { total: recus.length, en_etude: recus.filter((x) => x.statut === 'a_traiter').length, mis_en_relation: recus.filter((x) => x.statut === 'mis_en_relation').length, dernier: recus[0]?.created_at || null },
        lien: lienFiche(f.ref),
      });
    }
    return json({ ok: true, fiches: out });
  }
  if (['annonce_fiche_outil', 'annonce_confirmer_outil', 'annonce_retirer_outil', 'annonce_modifier_outil', 'annonce_effacer_outil'].includes(action)) {
    const ref = Number.parseInt(b.n, 10);
    if (!(ref >= REF_OUTIL) || !jetonAnnonceValide(env, `outil-${ref}`, b.t, 'confirmer')) return json({ error: 'lien_invalide' }, 403);
    const [p] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=ref,genre,age,ville,village,pays,secteur,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max,confirme_at,retire_at,modif_at,effacement_at,user_id`).catch(() => []);
    if (!p) return json({ error: 'lien_invalide' }, 404);
    if (action === 'annonce_confirmer_outil' && !p.confirme_at && !p.retire_at) {
      p.confirme_at = now().toISOString();
      await patch('profils_outil', `ref=eq.${ref}`, { confirme_at: p.confirme_at });
      await alerter({ titre: `✅ Fiche n° ${ref} confirmée`, lignes: [`${p.genre === 'femme' ? 'Une femme' : 'Un homme'}${p.age ? ` de ${p.age} ans` : ''} a confirmé sa fiche : elle porte maintenant la mention « confirmé » sur le site.`], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    if (action === 'annonce_retirer_outil' && !p.retire_at) {
      p.retire_at = now().toISOString();
      await patch('profils_outil', `ref=eq.${ref}`, { retire_at: p.retire_at, visible: false });
      await alerter({ titre: `🚪 Fiche n° ${ref} retirée par la personne`, lignes: ['Elle ne veut plus apparaître sur le site. Sa fiche reste dans ton outil.'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    // « Je veux la modifier avant » : la fiche reste masquée ; Lamia reçoit la demande et la corrige dans son outil.
    if (action === 'annonce_modifier_outil') {
      const texte = clean(b.texte, 1000);
      if (texte.length < 3) return json({ error: 'texte_requis' }, 400);
      p.modif_at = now().toISOString();
      await patch('profils_outil', `ref=eq.${ref}`, { modif_demandee: texte, modif_at: p.modif_at, confirme_at: null });
      p.confirme_at = null;
      await alerter({ titre: `✏️ Fiche n° ${ref} : modification demandée`, lignes: ['La personne veut corriger sa fiche avant qu’elle apparaisse :', texte.slice(0, 300), 'Corrige-la dans ton outil, puis republie : elle pourra la confirmer.'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    // « Je ne veux plus être dans l'outil de Lamia » : retirée du site tout de suite, et Lamia doit effacer la fiche de son outil.
    if (action === 'annonce_effacer_outil' && !p.effacement_at) {
      p.effacement_at = now().toISOString(); p.retire_at = p.retire_at || p.effacement_at;
      await patch('profils_outil', `ref=eq.${ref}`, { effacement_at: p.effacement_at, retire_at: p.retire_at, visible: false });
      await alerter({ titre: `🗑️ Fiche n° ${ref} : demande d’effacement`, lignes: ['La personne ne veut plus du tout être dans ton outil. Sa fiche est retirée du site.', 'Supprime-la de ton outil de matching (droit à l’effacement).'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    const { confirme_at: c, retire_at: r, modif_at: m, effacement_at: e, user_id: u, ...f } = p;
    return json({ ok: true, fiche: { ...f, profil: sansContact(f.profil), recherche: sansContact(f.recherche) }, confirme: Boolean(c), retire: Boolean(r), modif: Boolean(m) && !c, efface: Boolean(e), compte: Boolean(u) });
  }
  if (action === 'outil_publier') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    if (!Array.isArray(b.profils)) return json({ error: 'bad_request' }, 400);
    const t = now().toISOString();
    const rows = b.profils.slice(0, 600).map((p) => ({
      outil_id: clean(p?.outil_id, 80), genre: p?.genre === 'femme' || p?.genre === 'homme' ? p.genre : '', age: entier(p?.age, 18, 99),
      pays: clean(p?.pays, 60) || null, ville: sansContact(clean(p?.ville, 60)) || null, village: sansContact(clean(p?.village, 60)) || null, secteur: sansContact(clean(p?.secteur, 120)) || null, situation: clean(p?.situation, 60) || null, enfants: clean(p?.enfants, 10) || null, etudes: clean(p?.etudes, 80) || null,
      origine: tableau(p?.origine, 6), caracteristiques: tableau(p?.caracteristiques), profil: sansContact(clean(p?.profil, 700)), recherche: sansContact(clean(p?.recherche, 700)),
      age_min: entier(p?.age_min, 18, 99), age_max: entier(p?.age_max, 18, 99), visible: true, updated_at: t,
      religion: O.religion.includes(p?.religion) ? p.religion : null, pratique: O.pratique.includes(p?.pratique) ? p.pratique : null, mode_vie: (Array.isArray(p?.mode_vie) ? p.mode_vie : []).filter((x) => [...O.fumeur, ...O.sport, ...O.alcool, ...O.chemma].includes(x)).slice(0, 6),
    })).filter((r) => r.outil_id && r.genre);
    // Profils déposés sur le site (site-annonce-N) : ils reviennent dans le Patio sous leur propre numéro,
    // avec leurs propres textes, seulement s'ils sont validés et si la personne a accepté l'affichage anonyme.
    const SITE = /^site-annonce-(\d+)$/;
    const refsSite = rows.map((r) => r.outil_id.match(SITE)?.[1]).filter(Boolean).map(Number);
    await patch('annonces', `visible_anonyme=eq.true${refsSite.length ? `&ref=not.in.(${refsSite.join(',')})` : ''}`, { visible_anonyme: false });
    if (refsSite.length) await patch('annonces', `ref=in.(${refsSite.join(',')})&status=eq.publiee&anonyme_ok=eq.true`, { visible_anonyme: true });
    const [{ count: nSite } = {}] = refsSite.length ? await read(`/rest/v1/annonces?ref=in.(${refsSite.join(',')})&status=eq.publiee&anonyme_ok=eq.true&select=count`).catch(() => [{}]) : [{ count: 0 }];
    rows.splice(0, rows.length, ...rows.filter((r) => !SITE.test(r.outil_id)));
    if (rows.length) await call('/rest/v1/profils_outil?on_conflict=outil_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    // Une fiche retirée par la personne ne revient jamais, même si l'outil la republie.
    await patch('profils_outil', 'retire_at=not.is.null', { visible: false });
    const tous = await read('/rest/v1/profils_outil?select=ref,outil_id,visible,confirme_at,retire_at,modif_demandee,modif_at,effacement_at');
    const garde = new Set(rows.map((r) => r.outil_id));
    const masques = tous.filter((x) => x.visible && !garde.has(x.outil_id)).map((x) => x.ref);
    if (masques.length) await patch('profils_outil', `ref=in.(${masques.join(',')})`, { visible: false });
    const gardes = tous.filter((x) => garde.has(x.outil_id));
    return json({
      ok: true, publies: rows.length + (nSite || 0), du_site: nSite || 0, masques: masques.length,
      refs: Object.fromEntries(gardes.map((x) => [x.outil_id, x.ref])),
      // Publipostage : le lien personnel de chaque fiche, et où en est sa confirmation.
      liens: Object.fromEntries(gardes.map((x) => [x.outil_id, lienFiche(x.ref)])),
      confirmations: Object.fromEntries(gardes.map((x) => [x.outil_id, x.effacement_at ? 'effacement' : x.retire_at ? 'retiree' : x.confirme_at ? 'confirmee' : x.modif_at ? 'a_modifier' : 'en_attente'])),
      modifications: Object.fromEntries(gardes.filter((x) => x.modif_at && !x.confirme_at && !x.retire_at).map((x) => [x.outil_id, x.modif_demandee || ''])),
      confirmees: gardes.filter((x) => x.confirme_at && !x.retire_at).length,
    });
  }
  // Lamia a cliqué « Demander son accord » sur un match demandé : la personne choisie est prévenue et répond dans son espace.
  if (action === 'outil_demander_accord') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40);
    if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,statut,annonces!inner(id,ref,prenom,genre,email,user_id)`).catch(() => []);
    if (!i) return json({ error: 'not_found' }, 404);
    await patch('annonce_interets', `id=eq.${id}`, { accord_demande_at: now().toISOString() });
    const cible = await compteParRef(i.cible_ref).catch(() => null);
    if (cible) await prevenirMembre(cible, { titre: `💌 {A}, quelqu’un t’a choisi{e}`, texte: 'Lamia a regardé vos deux profils et pense que vous pourriez bien vous entendre. Découvre sa fiche (anonyme) dans ton espace et réponds oui ou non : si tu dis oui, Lamia vous met en relation.', bouton: 'Répondre', lien: '/mon-espace/#interets' });
    await prevenirMembre(i.annonces, { titre: `⏳ {A}, Lamia a transmis ta demande`, texte: 'Lamia pense que vous pourriez bien vous entendre : elle a demandé son accord à la personne que tu as choisie. Tu seras prévenu{e} dès qu’elle répond.', lien: '/mon-espace/' });
    return json({ ok: true, compte: Boolean(cible) });
  }
  // La personne a répondu à Lamia en dehors du site (WhatsApp, TikTok) : Lamia note sa réponse depuis l'outil.
  if (action === 'outil_reponse_accord') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['oui', 'non'].includes(b.reponse)) return json({ error: 'bad_request' }, 400);
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,demandeur_id,statut,annonces!inner(id,ref,prenom,email,status)`).catch(() => []);
    if (!i) return json({ error: 'not_found' }, 404);
    await patch('annonce_interets', `id=eq.${id}`, { reponse: b.reponse, repondu_at: now().toISOString(), accord_demande_at: now().toISOString(), ...(b.reponse === 'oui' ? { reciproque: true } : {}) });
    return json({ ok: true, ...(await conclureAccord(i, b.reponse, { parLamia: true })) });
  }
  // Un critère n'est pas respecté (secteur…) : Lamia demande à la personne concernée si c'est d'accord quand même.
  if (action === 'outil_demander_avis') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40), qui = b.qui === 'cible' ? 'cible' : 'demandeur';
    const question = sansContact(clean(b.question, 400));
    if (!UUID.test(id) || !question) return json({ error: 'bad_request' }, 400);
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,statut,annonces!inner(id,ref,prenom,genre,email,user_id)`).catch(() => []);
    if (!i) return json({ error: 'not_found' }, 404);
    await patch('annonce_interets', `id=eq.${id}`, { avis_qui: qui, avis_question: question, avis_demande_at: now().toISOString(), avis_reponse: null, avis_repondu_at: null });
    const m = qui === 'demandeur' ? (i.annonces.user_id ? i.annonces : null) : await compteParRef(i.cible_ref).catch(() => null);
    if (m) await prevenirMembre(m, { titre: `💬 {A}, Lamia te demande ton avis`, texte: `${question} Lamia pense que vous pourriez quand même bien vous entendre. Regarde sa fiche (anonyme) dans ton espace et dis-lui si tu es d’accord.`, bouton: 'Répondre à Lamia', lien: '/mon-espace/#interets' });
    return json({ ok: true, compte: Boolean(m) });
  }
  if (action === 'outil_reponse_avis') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['oui', 'non'].includes(b.reponse)) return json({ error: 'bad_request' }, 400);
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,demandeur_id,statut,reciproque,reponse,avis_qui,annonces!inner(id,ref,prenom,email,status,user_id)`).catch(() => []);
    if (!i || !i.avis_qui) return json({ error: 'not_found' }, 404);
    return json({ ok: true, ...(await conclureAvis(i, b.reponse, { parLamia: true })) });
  }
  // Annuler une demande, avec le motif (gardé pour Lamia). Personne n'est prévenu ; les autres choix en réserve reviennent.
  if (action === 'outil_annuler_demande') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40);
    if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,demandeur_id`).catch(() => []);
    if (!i) return json({ error: 'not_found' }, 404);
    await patch('annonce_interets', `id=eq.${id}`, { statut: 'pas_compatible', annule_motif: sansContact(clean(b.motif, 300)) || 'Annulé par Lamia', updated_at: now().toISOString() });
    await reactiverReserve({ id: i.demandeur_id }).catch(() => {});
    return json({ ok: true });
  }
  if (action === 'outil_demande_statut') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !STATUTS_DEMANDE.includes(b.statut)) return json({ error: 'bad_request' }, 400);
    const r = await appliquerStatut(id, b.statut);
    return r.error ? json(r, r.error === 'not_found' ? 404 : 409) : json({ ok: true });
  }
  // Valider un profil du site depuis l'outil, après avoir testé son potentiel.
  // Depuis l'outil : proposer un profil à une personne qui a un compte LFB (profil du site ou fiche reliée à un compte).
  const refDepuisOutil = async (id) => {
    const v = clean(id, 80), m = v.match(/^site-annonce-(\d+)$/);
    if (m) return Number(m[1]);
    if (/^\d+$/.test(v)) return Number(v);
    const [o] = await read(`/rest/v1/profils_outil?outil_id=eq.${encodeURIComponent(v)}&select=ref`).catch(() => []);
    return o?.ref || null;
  };
  const compteDeRef = async (ref) => {
    if (ref < REF_OUTIL) { const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&status=in.(a_verifier,publiee)&select=id,ref,prenom,genre,email,user_id`).catch(() => []); return a?.user_id ? a : null; }
    const [o] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&user_id=not.is.null&select=ref,user_id,genre`).catch(() => []);
    if (!o) return null;
    const u = await compteDe(o.user_id);
    return u ? { ref, user_id: o.user_id, genre: o.genre, email: u.email, prenom: u.user_metadata?.first_name || '' } : null;
  };
  if (action === 'outil_proposer') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const pour = await refDepuisOutil(b.membre), cible = await refDepuisOutil(b.cible);
    if (!pour || !cible) return json({ error: 'profil_absent_du_site' }, 404);
    if (pour === cible) return json({ error: 'bad_request' }, 400);
    const membre = await compteDeRef(pour);
    if (!membre) return json({ error: 'pas_de_compte', pour }, 409);
    const r = await call('/rest/v1/propositions?on_conflict=pour_ref,cible_ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ pour_ref: pour, cible_ref: cible, potentiel: Number.isFinite(Number(b.potentiel)) ? Math.round(Number(b.potentiel)) : null, message: clean(b.message, 300) || null }) });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    await prevenirMembre(membre, { titre: `💌 {A}, Lamia te propose un profil`, texte: 'Lamia a trouvé un profil qui pourrait te correspondre. Découvre sa fiche (anonyme) dans ton espace et dis-lui si elle t’intéresse.', bouton: 'Voir le profil proposé', lien: '/mon-espace/#propositions' });
    return json({ ok: true, pour, cible });
  }
  if (action === 'outil_comptes') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const site = await read('/rest/v1/annonces?status=in.(a_verifier,publiee)&test=eq.false&select=ref').catch(() => []);
    const fiches = await read('/rest/v1/profils_outil?user_id=not.is.null&select=outil_id').catch(() => []);
    return json({ ok: true, membres: [...site.map((x) => `site-annonce-${x.ref}`), ...fiches.map((f) => f.outil_id)] });
  }
  if (action === 'outil_scores') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const lignes = (Array.isArray(b.scores) ? b.scores : []).slice(0, 8000);
    const tous = await read('/rest/v1/profils_outil?select=ref,outil_id').catch(() => []);
    const parId = new Map(tous.map((x) => [x.outil_id, x.ref]));
    const ref = (id) => { const v = String(id || ''), m = v.match(/^site-annonce-(\d+)$/); return m ? Number(m[1]) : parId.get(v) || null; };
    const t = now().toISOString(), vus = new Set();
    const rows = [];
    for (const l of lignes) { const a2 = ref(l.a), b2 = ref(l.b), sc = Math.round(Number(l.s)); if (!a2 || !b2 || a2 === b2 || !(sc >= 0 && sc <= 100)) continue; const k = `${a2}-${b2}`; if (vus.has(k)) continue; vus.add(k); rows.push({ a_ref: a2, b_ref: b2, score: sc, niveau: clean(l.t, 60) || null, bloque: l.bl === true ? true : l.bl === false ? false : null, updated_at: t }); }
    for (let i = 0; i < rows.length; i += 1000) await call('/rest/v1/scores_outil?on_conflict=a_ref,b_ref', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 1000)) });
    return json({ ok: true, enregistres: rows.length });
  }
  // Depuis l'outil : « Lancer les matchs en masse » (et à chaque récupération, les mises en relation automatiques).
  if (action === 'outil_pilote') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const reglages = { parPersonne: Number(b.parPersonne) || undefined, scoreMin: Number.isFinite(Number(b.scoreMin)) ? Number(b.scoreMin) : undefined };
    return json({ ok: true, ...(await piloteAuto({ proposer: b.proposer === true, reglages })) });
  }
  if (action === 'outil_propositions') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    return json({ ok: true, propositions: await read('/rest/v1/propositions?select=pour_ref,cible_ref,reponse,created_at,repondu_at&order=created_at.desc&limit=300').catch(() => []) });
  }
  if (action === 'outil_valider') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0)) return json({ error: 'bad_request' }, 400);
    const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=*`);
    if (!a) return json({ error: 'not_found' }, 404);
    if (a.status !== 'a_verifier') return json({ ok: true, status: a.status });
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&select=id,kind,storage_path`);
    await validerProfil(a, files, clean(b.note, 600) || null);
    return json({ ok: true, status: 'publiee' });
  }
  // Empreintes des pseudos TikTok des fiches de l'outil, pour retrouver un profil créé en live.
  if (action === 'outil_tiktok') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const rows = (Array.isArray(b.empreintes) ? b.empreintes : []).slice(0, 8000)
      .map((x) => ({ h: clean(x?.h, 64), outil_id: clean(x?.outil_id, 80), updated_at: now().toISOString() }))
      .filter((x) => /^[0-9a-f]{64}$/.test(x.h) && x.outil_id);
    await call('/rest/v1/outil_tiktok?h=neq.x', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    for (let i = 0; i < rows.length; i += 500) await call('/rest/v1/outil_tiktok?on_conflict=h', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) });
    return json({ ok: true, n: rows.length });
  }

  // ---------------------------------------------------------------- espace de Lamia
  // Supprimer mon compte (RGPD, et obligatoire pour une application) : profil, photos, demandes, discussions, notifications,
  // fiche de l'outil (Lamia doit l'effacer de son outil : elle est prévenue), puis le compte lui-même.
  // Les commandes et factures restent (obligation légale de conservation), sans lien avec un compte.
  if (action === 'annonce_supprimer_compte') {
    if (!user) return json({ error: 'login_required' }, 401);
    if (clean(b.confirmation, 20).toUpperCase() !== 'SUPPRIMER') return json({ error: 'confirmation_requise' }, 400);
    if (user.app_metadata?.role === 'admin') return json({ error: 'forbidden' }, 403);
    const { abonnement } = await etatAbonnement(user.email, { env }).catch(() => ({ abonnement: null }));
    if (abonnement && !abonnement.resiliation_prevue) return json({ error: 'abonnement_actif' }, 409);
    const t = now().toISOString();
    const mail = String(user.email || '').toLowerCase();
    const mes = await read(`/rest/v1/annonces?or=(user_id.eq.${user.id},email.eq.${encodeURIComponent(mail)})&select=id,ref`).catch(() => []);
    for (const a of mes) {
      const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&select=id,storage_path`).catch(() => []);
      await effacer(files).catch(() => {});
      await finirMatch(a).catch(() => {});
      await call(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}`, { method: 'DELETE' }).catch(() => {});
      await patch('annonce_interets', `cible_ref=eq.${a.ref}&statut=in.(a_traiter,en_reserve)`, { statut: 'pas_compatible', updated_at: t }).catch(() => {});
      await patch('annonces', `id=eq.${a.id}`, { status: 'retiree', visible_anonyme: false, en_match: false, email: `supprime-${a.ref}@annonce.invalid`, phone: null, user_id: null, prenom: 'Compte supprimé', ville: '', profil: 'Compte supprimé par son autrice ou son auteur.', recherche: 'Compte supprimé par son autrice ou son auteur.', matching: {}, note_lamia: null, ip_hash: null, lien_h: null });
    }
    const fiches = await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&select=ref`).catch(() => []);
    if (fiches.length) await patch('profils_outil', `user_id=eq.${user.id}`, { retire_at: t, effacement_at: t, visible: false, user_id: null });
    await patch('discussions', `or=(a_user.eq.${user.id},b_user.eq.${user.id})&close_raison=is.null`, { ferme_at: t, close_raison: 'compte_supprime' }).catch(() => {});
    await call(`/rest/v1/discussion_messages?auteur=eq.${user.id}`, { method: 'DELETE' }).catch(() => {});
    await call(`/rest/v1/push_subscriptions?user_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {});
    const r = await call(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(() => null);
    await alerter({ titre: `🗑️ Compte supprimé${mes.length ? ` · profil n° ${mes.map((a) => a.ref).join(', ')}` : ''}`, lignes: ['La personne a supprimé son compte depuis l’application : profil, photos, demandes et discussions effacés.', fiches.length ? `Sa fiche n° ${fiches.map((f) => f.ref).join(', ')} est à effacer de ton outil (fait automatiquement à la prochaine récupération).` : ''].filter(Boolean), lien: '/tableau-de-bord#application', tag: 'reserve' }).catch(() => {});
    return json({ ok: true, compte: Boolean(r?.ok) });
  }
  // Discussion entre deux personnes mises en relation (7 jours, puis échange des numéros).
  if (action.startsWith('salon_')) return actionSalons(action, b, { env, call, read, insert, patch, admin, user, ipHash, now, alerter, cron, prevenirMembre });
  if (['annonce_discussions', 'annonce_discussion_envoyer', 'annonce_discussion_numero', 'annonce_discussion_signaler'].includes(action)) return actionDiscussion(action, b, { read, insert, patch, now, user, pousserMembre, alerter, quiEst });
  if (action === 'annonce_rappels_cron') {
    if (!cron) return json({ error: 'forbidden' }, 403);
    // Chaque jour : rappels de discussion, puis le pilote (mises en relation, et nouvelles propositions pour ceux qui n'en ont plus).
    const rappels = await rappelsDiscussions({ read, patch, now, pousserMembre });
    await autoValiderEnAttente().catch(() => ({}));
    const pilote = await piloteAuto({ proposer: true }).catch(() => null);
    return json({ ok: true, rappels, pilote });
  }
  if (!admin) return json({ error: 'forbidden' }, 403);
  // Cartographie de l'activité et réglages du pilote automatique (tableau de bord de Lamia).
  if (action === 'annonce_pilote') {
    const op = clean(b.op, 20);
    if (op === 'reglages') {
      await noterPilote({ actif: b.actif !== false, parPersonne: Number(b.parPersonne) || PILOTE_DEFAUT.parPersonne, scoreMin: Number.isFinite(Number(b.scoreMin)) ? Number(b.scoreMin) : PILOTE_DEFAUT.scoreMin });
    } else if (op === 'lancer') {
      const r = await piloteAuto({ proposer: true });
      return json({ ok: true, lance: r, ...(await carteActivite()) });
    } else if (op === 'dematcher') {
      const id = clean(b.id, 40);
      if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
      await appliquerStatut(id, 'dematche');
    } else if (op === 'retirer_proposition') {
      const id = clean(b.id, 40);
      if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
      const [x] = await read(`/rest/v1/propositions?id=eq.${id}&select=pour_ref,cible_ref`).catch(() => []);
      if (x) await call(`/rest/v1/propositions?or=(and(pour_ref.eq.${x.pour_ref},cible_ref.eq.${x.cible_ref}),and(pour_ref.eq.${x.cible_ref},cible_ref.eq.${x.pour_ref}))&reponse=is.null`, { method: 'DELETE' }).catch(() => {});
    }
    return json({ ok: true, ...(await carteActivite()) });
  }
  async function carteActivite() {
    const reglages = await reglagesPilote();
    const [props, interets, discs, annonces, fiches] = await Promise.all([
      read('/rest/v1/propositions?select=id,pour_ref,cible_ref,reponse,potentiel,auto,created_at,repondu_at&order=created_at.desc&limit=2000').catch(() => []),
      read('/rest/v1/annonce_interets?select=id,cible_ref,statut,reciproque,reponse,via,created_at,updated_at,annonces!inner(ref,prenom,status)&order=updated_at.desc&limit=3000').catch(() => []),
      read('/rest/v1/discussions?select=interet_id,ouverte_at,ferme_at,a_numero,b_numero,close_raison,signalee_at').catch(() => []),
      read('/rest/v1/annonces?status=in.(a_verifier,publiee,brouillon)&test=eq.false&select=ref,prenom,status,user_id,en_match').catch(() => []),
      read('/rest/v1/profils_outil?select=ref,user_id,retire_at').catch(() => []),
    ]);
    const nom = new Map(annonces.map((a) => [a.ref, a.prenom || `n° ${a.ref}`]));
    const n = (ref) => `${nom.get(ref) || (ref >= REF_OUTIL ? 'fiche' : 'profil')} n° ${ref}`;
    const discDe = new Map(discs.map((d) => [d.interet_id, d]));
    const t = now();
    const rel = interets.filter((i) => i.statut === 'mis_en_relation' || i.statut === 'dematche').map((i) => {
      const d = discDe.get(i.id);
      const etat = i.statut === 'dematche' ? 'terminé' : !d ? 'en relation (sans discussion : pas de compte)' : d.signalee_at ? '🚩 signalée' : d.a_numero && d.b_numero ? '📞 numéros échangés' : d.close_raison ? 'discussion fermée' : new Date(d.ferme_at) > t ? '💬 discussion en cours' : 'discussion terminée sans numéros';
      return { id: i.id, a: n(i.annonces.ref), b: n(i.cible_ref), le: i.updated_at, etat, actif: i.statut === 'mis_en_relation' };
    });
    const vus = new Set(), paires = [];
    for (const p of props) {
      const k = [p.pour_ref, p.cible_ref].sort().join('-');
      if (vus.has(k)) continue; vus.add(k);
      const inv = props.find((q) => q.pour_ref === p.cible_ref && q.cible_ref === p.pour_ref);
      const reps = [p.reponse, inv?.reponse];
      paires.push({ id: p.id, a: n(p.pour_ref), b: n(p.cible_ref), score: p.potentiel, auto: p.auto, le: p.created_at, etat: reps.includes('non') ? 'refusé' : reps.every((r) => r === 'oui') ? 'les deux ont dit oui' : reps.includes('oui') ? 'un oui, en attente de l’autre' : 'en attente des deux' });
    }
    const aTraiter = interets.filter((i) => i.statut === 'a_traiter');
    const comptes = { site: annonces.filter((a) => a.user_id).length, fiches: fiches.filter((f) => f.user_id && !f.retire_at).length };
    return {
      reglages,
      chiffres: {
        profils_valides: annonces.filter((a) => a.status === 'publiee').length, profils_a_verifier: annonces.filter((a) => a.status === 'a_verifier').length, profils_inacheves: annonces.filter((a) => a.status === 'brouillon').length,
        comptes_joignables: comptes.site + comptes.fiches,
        propositions: paires.length, propositions_attente: paires.filter((p) => p.etat.startsWith('en attente') || p.etat.startsWith('un oui')).length, propositions_oui: paires.filter((p) => p.etat === 'les deux ont dit oui').length, propositions_non: paires.filter((p) => p.etat === 'refusé').length,
        demandes_attente: aTraiter.length, demandes_reciproques: aTraiter.filter((i) => i.reciproque || i.reponse === 'oui').length, refus: interets.filter((i) => i.statut === 'pas_compatible').length,
        en_relation: rel.filter((r) => r.actif).length, numeros: rel.filter((r) => r.etat.startsWith('📞')).length,
      },
      relations: rel.slice(0, 60),
      propositions: paires.slice(0, 80),
      // Ce qui reste bloqué sans Lamia : réciproques dont un profil n'est pas validé ou déjà pris.
      bloques: aTraiter.filter((i) => i.reciproque || i.reponse === 'oui').map((i) => ({ id: i.id, a: n(i.annonces.ref), b: n(i.cible_ref), raison: i.annonces.status !== 'publiee' ? 'profil pas encore validé' : 'une des deux personnes est déjà en relation' })).slice(0, 40),
    };
  }
  if (action === 'annonce_discussions_admin') return json({ ok: true, ...(await discussionsPourLamia({ read }, clean(b.id, 40) || null)) });
  if (action === 'outil_cle') {
    const cle = randomBytes(32).toString('base64url');
    await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'outil_liaison', value: { hash: createHash('sha256').update(cle).digest('hex'), created_at: now().toISOString() }, updated_at: now().toISOString() }) });
    return json({ ok: true, cle });
  }
  if (action === 'annonces_admin') {
    const list = await read('/rest/v1/annonces?status=in.(a_verifier,publiee,refusee)&select=*&order=submitted_at.desc&limit=100');
    const files = list.length ? await read(`/rest/v1/annonce_files?annonce_id=in.(${list.map((a) => a.id).join(',')})&select=id,annonce_id,kind,mime,storage_path,position`) : [];
    const urls = await liensLecture(files, 1800);
    const interets = list.length ? await read(`/rest/v1/annonce_interets?demandeur_id=in.(${list.map((a) => a.id).join(',')})&select=demandeur_id,cible_ref`).catch(() => []) : [];
    return json({ ok: true, annonces: list.map((a) => ({
      interets: interets.filter((x) => x.demandeur_id === a.id).map((x) => x.cible_ref),
      ...publique(a, files.filter((f) => f.annonce_id === a.id), urls), id: a.id, status: a.status, email: a.email, phone: a.phone, birth_date: a.birth_date,
      submitted_at: a.submitted_at, identite_verifiee_at: a.identite_verifiee_at, note_lamia: a.note_lamia, matching: a.matching || {}, exportee_at: a.exportee_at, nb_compatibles: a.nb_compatibles, resultat_envoye_at: a.resultat_envoye_at, anonyme_ok: a.anonyme_ok, visible_anonyme: a.visible_anonyme, photo_partage: Boolean(a.photo_partage), test: Boolean(a.test), matchs_bonus: a.matchs_bonus || 0, live_declare: a.live_declare, outil_lie: Boolean(a.outil_id), compte: Boolean(a.user_id), en_match: a.en_match, modifiee_at: a.modifiee_at,
      identite: files.filter((f) => f.annonce_id === a.id && f.kind === 'identite').map((f) => ({ mime: f.mime, url: urls[f.storage_path] || null }))[0] || null,
    })) });
  }
  if (action === 'matchs_demandes') {
    const list = await read('/rest/v1/annonce_interets?select=id,cible_ref,statut,created_at,reciproque,via,annonces!inner(id,ref,prenom,genre,birth_date,ville,pays,status,matching,age_min,age_max)&order=created_at.desc&limit=300');
    const refs = [...new Set(list.map((x) => x.cible_ref))];
    const cibles = refs.length ? await read(`/rest/v1/annonces?ref=in.(${refs.join(',')})&select=ref,prenom,genre,birth_date,ville,pays,status,matching,age_min,age_max`) : [];
    const fichesOutil = refs.some((r) => r >= REF_OUTIL) ? await read(`/rest/v1/profils_outil?ref=in.(${refs.filter((r) => r >= REF_OUTIL).join(',')})&select=ref,age,age_min,age_max,pays,religion,pratique,enfants,situation,origine,mode_vie,etudes`).catch(() => []) : [];
    // Potentiel de chaque match demandé, pour choisir LA mise en relation à faire par personne.
    const pot = (x) => {
      const d = x.annonces, c = cibles.find((y) => y.ref === x.cible_ref), o = fichesOutil.find((y) => y.ref === x.cible_ref);
      if (!d || (!c && !o)) return null;
      const A = fichePotentiel(d, { age: ageAu(d.birth_date, now()) }), B = c ? fichePotentiel(c, { age: ageAu(c.birth_date, now()) }) : fichePotentiel(o, { outil: true });
      return potentiel(A, B, { a: `n° ${d.ref}`, b: `n° ${x.cible_ref}` });
    };
    const resume = (a) => a && ({ ref: a.ref, prenom: a.prenom, genre: a.genre, age: ageAu(a.birth_date, now()), ville: a.ville, pays: a.pays, status: a.status, contact: a.matching?.contactReseau || '' });
    const outils = await outilParRef(refs);
    const resumeOutil = (o) => o && ({ ref: o.ref, prenom: 'profil de ton outil', genre: o.genre, age: o.age, ville: 'fiche dans le logiciel', pays: o.pays || '' });
    const so = await scoresOutil(list.map((x) => [x.annonces?.ref, x.cible_ref]));
    const potFinal = (x) => { const o = so(x.annonces?.ref, x.cible_ref); const simple = pot(x); return o ? { score: o.score, niveau: o.niveau, outil: true, forts: simple?.forts || [], vigilance: simple?.vigilance || [] } : simple ? { ...simple, provisoire: true } : null; };
    // Pour jauger chaque personne : ce que Lamia lui a proposé, et les meilleurs scores de l'outil pas encore demandés ni proposés.
    const demandeurs = [...new Set(list.map((x) => x.annonces?.ref).filter(Boolean))];
    const props = demandeurs.length ? await read(`/rest/v1/propositions?pour_ref=in.(${demandeurs.join(',')})&select=pour_ref,cible_ref,reponse,created_at`).catch(() => []) : [];
    const meilleurs = demandeurs.length ? await read(`/rest/v1/scores_outil?a_ref=in.(${demandeurs.join(',')})&select=a_ref,b_ref,score,niveau&order=score.desc&limit=600`).catch(() => []) : [];
    const parPersonne = Object.fromEntries(demandeurs.map((r) => {
      const deja = new Set([...list.filter((x) => x.annonces?.ref === r).map((x) => x.cible_ref), ...props.filter((p) => p.pour_ref === r).map((p) => p.cible_ref)]);
      return [r, { proposes: props.filter((p) => p.pour_ref === r).map((p) => ({ ...p, score: so(r, p.cible_ref)?.score ?? null })), suggestions: meilleurs.filter((m) => m.a_ref === r && !deja.has(m.b_ref)).slice(0, 5).map((m) => ({ ref: m.b_ref, score: m.score, niveau: m.niveau })) }];
    }));
    return json({ ok: true, personnes: parPersonne, demandes: list.map((x) => ({ id: x.id, statut: x.statut, created_at: x.created_at, reciproque: Boolean(x.reciproque), via: x.via, potentiel: potFinal(x), demandeur: resume(x.annonces), cible: resume(cibles.find((c) => c.ref === x.cible_ref)) || resumeOutil(outils.find((o) => o.ref === x.cible_ref)) || { ref: x.cible_ref } })) });
  }
  if (action === 'annonce_proposer') {
    const pour = Number.parseInt(b.pour, 10), cible = Number.parseInt(b.cible, 10);
    if (!(pour > 0) || !(cible > 0) || pour === cible) return json({ error: 'bad_request' }, 400);
    const membre = await compteDeRef(pour);
    if (!membre) return json({ error: 'pas_de_compte' }, 409);
    await call('/rest/v1/propositions?on_conflict=pour_ref,cible_ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ pour_ref: pour, cible_ref: cible, potentiel: Number.parseInt(b.score, 10) || null, message: clean(b.message, 300) || null }) });
    await prevenirMembre(membre, { titre: `💌 {A}, Lamia te propose un profil`, texte: 'Lamia a trouvé un profil qui pourrait te correspondre. Découvre sa fiche (anonyme) dans ton espace et dis-lui si elle t’intéresse.', bouton: 'Voir le profil proposé', lien: '/mon-espace/#propositions' });
    return json({ ok: true });
  }
  if (action === 'annonce_a_faire') {
    const manquesAttente = await autoValiderEnAttente().catch(() => ({}));
    const t = now(), fin = new Date(t.getTime() + 48 * 3600e3).toISOString();
    const [verif, dem, fiches, props, nouv, evs] = await Promise.all([
      read('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=ref,prenom').catch(() => []),
      read('/rest/v1/annonce_interets?statut=eq.a_traiter&select=reciproque,annonces!inner(ref,test)').catch(() => []),
      read('/rest/v1/profils_outil?visible=eq.true&retire_at=is.null&select=confirme_at,modif_at,effacement_at').catch(() => []),
      read('/rest/v1/propositions?reponse=eq.oui&select=pour_ref,cible_ref,repondu_at&order=repondu_at.desc&limit=50').catch(() => []),
      read('/rest/v1/nouveautes?envoyee_at=is.null&select=id').catch(() => []),
      read(`/rest/v1/speed_dating_events?status=in.(published,sold_out)&ends_at=gte.${encodeURIComponent(t.toISOString())}&starts_at=lte.${encodeURIComponent(fin)}&select=id,title,audience,starts_at,capacity&order=starts_at`).catch(() => []),
    ]);
    const vraies = dem.filter((d) => !d.annonces?.test);
    const ins = evs.length ? await read(`/rest/v1/event_registrations?event_id=in.(${evs.map((e) => e.id).join(',')})&attendance_status=neq.cancelled&select=event_id`).catch(() => []) : [];
    return json({ ok: true, a_faire: {
      a_verifier: verif.map((x) => x.ref), manques: manquesAttente,
      demandes: vraies.length, personnes: new Set(vraies.map((d) => d.annonces.ref)).size, reciproques: vraies.filter((d) => d.reciproque).length,
      fiches_en_attente: fiches.filter((f) => !f.confirme_at && !f.modif_at && !f.effacement_at).length, fiches_confirmees: fiches.filter((f) => f.confirme_at).length,
      fiches_a_modifier: fiches.filter((f) => f.modif_at && !f.confirme_at).length, fiches_a_effacer: fiches.filter((f) => f.effacement_at).length,
      propositions_oui: props.length, nouveautes_en_attente: nouv.length,
      soirees: evs.map((e) => ({ titre: e.title, salon: e.audience, debut: e.starts_at, inscrits: ins.filter((x) => x.event_id === e.id).length, places: e.capacity })),
    } });
  }
  // ------------------------------------------------ Gestion de l'application : qui fait quoi, retraits, réglages des notifications
  if (action === 'annonce_journal') {
    const cat = Object.keys(CATEGORIES_ALERTE).includes(b.categorie) ? `&categorie=eq.${b.categorie}` : '';
    const [journal, nonLus, reglage, fiches, annoncesRet, appareils] = await Promise.all([
      read(`/rest/v1/journal_lamia?select=id,created_at,categorie,titre,lignes,lien,notifie,lu${cat}&order=created_at.desc&limit=${b.categorie === 'aucune' ? 1 : 200}`).catch(() => []),
      read('/rest/v1/journal_lamia?lu=eq.false&select=categorie').catch(() => []),
      read('/rest/v1/platform_settings?key=eq.lamia_notifs&select=value').catch(() => []),
      read('/rest/v1/profils_outil?retire_at=not.is.null&select=ref,genre,age,ville,pays,retire_at,effacement_at,effacement_fait_at&order=retire_at.desc&limit=200').catch(() => []),
      read('/rest/v1/annonces?status=eq.retiree&select=ref,genre,created_at,modifiee_at&order=ref.desc&limit=200').catch(() => []),
      read('/rest/v1/push_subscriptions?select=pour').catch(() => []),
    ]);
    const parCat = {};
    for (const x of nonLus) parCat[x.categorie] = (parCat[x.categorie] || 0) + 1;
    return json({ ok: true, journal, non_lus: nonLus.length, non_lus_par: parCat,
      categories: CATEGORIES_ALERTE, notifs: notifsPropres(reglage[0]?.value),
      retraits: [
        ...fiches.map((f) => ({ ref: f.ref, source: 'fiche', genre: f.genre, age: f.age, lieu: [f.ville, f.pays].filter(Boolean).join(', '), quand: f.effacement_at || f.retire_at, effacement: Boolean(f.effacement_at), fait: Boolean(f.effacement_fait_at) })),
        ...annoncesRet.map((a) => ({ ref: a.ref, source: 'profil', genre: a.genre, quand: a.modifiee_at || a.created_at, effacement: true, fait: true })),
      ].sort((x, y) => String(y.quand).localeCompare(String(x.quand))),
      appareils: { lamia: appareils.filter((x) => x.pour === 'lamia').length, membres: appareils.filter((x) => x.pour === 'membre').length } });
  }
  if (action === 'annonce_journal_lu') {
    await patch('journal_lamia', 'lu=eq.false', { lu: true });
    return json({ ok: true });
  }
  if (action === 'annonce_notifs_lamia') {
    const value = notifsPropres(b.notifs || {});
    await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'lamia_notifs', value, updated_at: now().toISOString() }) });
    return json({ ok: true, notifs: value });
  }
  // Lamia a supprimé la fiche de son outil : on efface aussi tout son contenu sur le site (seul le numéro reste, pour qu'elle ne revienne jamais).
  if (action === 'annonce_effacement_fait') {
    const ref = entier(b.ref, 1, 999999);
    if (!ref) return json({ error: 'bad_request' }, 400);
    await patch('profils_outil', `ref=eq.${ref}&retire_at=not.is.null`, { effacement_fait_at: now().toISOString(), visible: false, profil: 'Fiche effacée à la demande de la personne.', recherche: 'Fiche effacée à la demande de la personne.', ville: null, village: null, secteur: null, caracteristiques: [], origine: [], etudes: null, modif_demandee: null, user_id: null });
    return json({ ok: true });
  }
  if (action === 'annonce_abonnes') return json({ ok: true, ...(await abonnesPourLamia({ env })) });
  if (action === 'annonce_unite_utiliser') {
    const id = clean(b.id, 40);
    if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
    return json({ ok: await utiliserUnite(id, { env }) });
  }
  if (action === 'match_demande_statut') {
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !STATUTS_DEMANDE.includes(b.statut)) return json({ error: 'bad_request' }, 400);
    // Profil vérifié avant toute mise en relation ; un match actif bloque les deux profils jusqu'au dématch.
    const r = await appliquerStatut(id, b.statut);
    return r.error ? json(r, r.error === 'not_found' ? 404 : 409) : json({ ok: true });
  }
  if (action === 'annonces_exportees') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => UUID.test(String(x))).slice(0, 100);
    if (ids.length) await patch('annonces', `id=in.(${ids.join(',')})`, { exportee_at: now().toISOString() });
    return json({ ok: true });
  }
  if (action === 'annonce_moderer') {
    const id = clean(b.annonce_id, 40);
    if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
    const [a] = await read(`/rest/v1/annonces?id=eq.${id}&select=*`);
    if (!a) return json({ error: 'not_found' }, 404);
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${id}&select=id,kind,storage_path`);
    const note = clean(b.note, 600) || null;
    if (b.decision === 'bonus_match') {
      await patch('annonces', `id=eq.${id}`, { matchs_bonus: (Number(a.matchs_bonus) || 0) + 1 });
      return json({ ok: true, matchs_bonus: (Number(a.matchs_bonus) || 0) + 1 });
    }
    if (b.decision === 'publier') {
      await validerProfil(a, files, note);
      return json({ ok: true, status: 'publiee' });
    }
    if (b.decision === 'refuser') {
      await effacer(files);
      await patch('annonces', `id=eq.${id}`, { status: 'refusee', visible_anonyme: false, note_lamia: note });
      await email(a.email, `Ton annonce n° ${a.ref}`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">${esc(salutDe(a))},</h2><p>Lamia n’a pas pu retenir ton profil cette fois-ci.${note ? ` Son mot : « ${esc(note)} »` : ''}</p><p>Tes photos et ta pièce d’identité ont été supprimées. Tu peux déposer une nouvelle annonce quand tu veux, ou écrire à Lamia dans les Confidences.</p></div>`,
        `${salutDe(a)},\n\nLamia n’a pas pu retenir ton profil cette fois-ci.${note ? ` Son mot : « ${note} »` : ''}\nTes photos et ta pièce d’identité ont été supprimées. Tu peux déposer une nouvelle annonce quand tu veux.`).catch(() => false);
      return json({ ok: true, status: 'refusee' });
    }
    if (b.decision === 'resultat') {
      const nb = Number.parseInt(b.nb, 10);
      if (!(nb >= 0 && nb <= 9999)) return json({ error: 'bad_request' }, 400);
      if (a.status !== 'publiee') return json({ error: 'a_valider' }, 409);
      await patch('annonces', `id=eq.${id}`, { nb_compatibles: nb, resultat_envoye_at: now().toISOString(), note_lamia: note });
      const lien = `${SITE}/confidences/?profil=${a.ref}#ecrire`;
      const corps = nb > 0
        ? `D’après l’outil de matching de Lamia, ton profil pourrait correspondre à <strong>${nb} personne${nb > 1 ? 's' : ''}</strong>. Pour discrétion, personne ne sait qui correspond à qui : seule Lamia le sait.</p><p>Écris-lui pour en prendre connaissance. <strong>${a.live_declare ? 'Tes 3 premières mises en relation sont offertes (profil créé en live avec Lamia).' : 'Ta première mise en relation est offerte.'}</strong> Pour aller plus loin et rencontrer d’autres profils, découvre les formules de Lamia : https://lamia-femme-berbere.com/abonnement/ (sans engagement).`
        : `Pour le moment, l’outil de matching de Lamia ne trouve pas encore de profil qui te corresponde, mais de nouvelles personnes arrivent chaque semaine. Lamia garde ton profil et te prévient dès qu’une belle correspondance apparaît.`;
      const txt = corps.replace(/<[^>]+>/g, '');
      await email(a.email, nb > 0 ? `${salutDe(a)}, ${nb} profil${nb > 1 ? 's' : ''} pourrai${nb > 1 ? 'ent' : 't'} te correspondre` : `${salutDe(a)}, ton profil est bien chez Lamia`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">${esc(salutDe(a))},</h2><p>${corps}</p>${note ? `<p>Le mot de Lamia : « ${esc(note)} »</p>` : ''}${nb > 0 ? `<p><a href="${lien}" style="display:inline-block;padding:10px 18px;background:#7d1530;color:#fff;border-radius:999px;text-decoration:none">💌 Écrire à Lamia</a></p>` : ''}</div>`,
        `${salutDe(a)},\n\n${txt}${note ? `\n\nLe mot de Lamia : « ${note} »` : ''}${nb > 0 ? `\n\nÉcrire à Lamia : ${lien}` : ''}`).catch(() => false);
      return json({ ok: true, status: 'resultat_envoye' });
    }
    if (b.decision === 'afficher' || b.decision === 'masquer') {
      if (b.decision === 'afficher' && (!a.anonyme_ok || a.status !== 'publiee')) return json({ error: 'pas_consenti' }, 409);
      await patch('annonces', `id=eq.${id}`, { visible_anonyme: b.decision === 'afficher' });
      return json({ ok: true });
    }
    if (b.decision === 'supprimer') {
      await effacer(files);
      await call(`/rest/v1/annonces?id=eq.${id}`, { method: 'DELETE' });
      return json({ ok: true, status: 'supprimee' });
    }
    return json({ error: 'bad_request' }, 400);
  }
  return json({ error: 'bad_request' }, 400);
}
