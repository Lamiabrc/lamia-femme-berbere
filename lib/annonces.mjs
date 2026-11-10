// Annonces de rencontre déposées par la communauté (Patio, Confidences).
// Les annonces ne sont JAMAIS publiées : elles arrivent chez Lamia, qui les vérifie et les passe dans son outil
// de matching. La personne reçoit seulement le nombre de profils compatibles, sans savoir lesquels.
// La photo de la pièce d'identité (numéro caché par la main) ne sert qu'à la vérification :
// elle n'est jamais montrée sur le site et elle est supprimée dès que Lamia publie ou refuse l'annonce.
// Passe par /api/confidences (actions « annonce_* ») pour rester dans la limite des fonctions Vercel.

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DATABASE_URL, json } from './event-tickets.mjs';
import { envoyerPush, genererClesVapid } from './webpush.mjs';
import { abonnesPourLamia, utiliserUnite, etatAbonnement, consommerMatchAchete, consommerUnite, rendreUnite } from './abonnements.mjs';
import { formule as formuleAbo } from '../content/abonnements.mjs';
import { refsCachees, blocageEntre, actionBlocage } from './blocages.mjs';
import { suiviDematchs } from './discussions.mjs';
import { actionModeration, ACTIONS_MODERATION, offrirSiModerateur } from './moderateurs.mjs';
import { ageEtLieuOk, dansMesCriteres, O, choixPropres, versOutil, telephoneNormal, fichePotentiel, potentiel, phrasesDifference } from '../content/matching-options.mjs';
import { CATEGORIES_ALERTE, notifsPropres, journaliser } from './alerte-lamia.mjs';
import { adresse, accord, adresser, aDesTrous } from './adresse.mjs';
import { actionSalons } from './salons.mjs';
import { actionCoaching, rappelsCoaching } from './coaching.mjs';
import { compterMatchs, ouvrirDiscussion, fermerDiscussion, actionDiscussion, discussionsPourLamia, rappelsDiscussions } from './discussions.mjs';

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
// Ce que Lamia peut offrir, avec où le retrouver.
const CADEAUX = { mise_en_relation: ['un match', '/rencontres/swipe/'], speed_dating: ['une soirée de speed dating', '/mon-espace/#speed-dating'], coaching: ['une visio de coaching', '/mon-espace/#coaching'], coaching_30: ['un coaching de 30 minutes', '/mon-espace/#coaching'], sauver_couple: ['une séance Sauver mon couple', '/mon-espace/#coaching'] };
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
// Comparé par empreinte pour retrouver un profil ; en clair seulement dans contacts_lamia, réservé à Lamia (accord du 5 novembre 2026).
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
// Le lien qui ouvre la bonne personne dans l'application du réseau. Un numéro passe par WhatsApp, avec le message déjà rempli.
export function lienContact(contact, telephone, message = '') {
  const n = normLien(contact);
  if (n) {
    const i = n.indexOf(':'), reseau = n.slice(0, i), pseudo = n.slice(i + 1);
    if (reseau === 'tiktok') return { reseau: 'TikTok', lien: `https://www.tiktok.com/@${pseudo}` };
    if (reseau === 'instagram') return { reseau: 'Instagram', lien: `https://www.instagram.com/${pseudo}/` };
    if (reseau === 'facebook') return { reseau: 'Facebook', lien: /^\d+$/.test(pseudo) ? `https://www.facebook.com/profile.php?id=${pseudo}` : `https://www.facebook.com/${pseudo}` };
  }
  const chiffres = String(telephone || '').replace(/\D/g, '');
  if (chiffres.length >= 8) return { reseau: 'WhatsApp', lien: `https://wa.me/${chiffres}?text=${encodeURIComponent(message)}` };
  return { reseau: '', lien: '' };
}
export const pseudoTikTok = (s) => (normLien(s).startsWith('tiktok:') ? normLien(s).slice(7) : '');

// Règle de Lamia : deux photos de soi. Une vidéo ne compte pas (trop facile à contourner). Sans cela, on ne swipe pas et on ne répond pas.
export const mediasSuffisants = (files) => files.filter((f) => f.kind === 'photo').length >= 2;
export function verifierMedias(list, { optionnel = false } = {}) {
  if (!Array.isArray(list)) return optionnel ? { files: [] } : { error: 'medias_requis' };
  const out = [];
  for (const f of list.slice(0, 4)) {
    const role = f?.role === 'identite' ? 'identite' : 'media';
    const mime = baseType(f?.type);
    const t = TYPES_ANNONCE[mime];
    if (!t) return { error: 'file_type' };
    if (role === 'media' && t[0] === 'pdf') return { error: 'file_type' };
    if (t[0] === 'video') return { error: 'file_type' };
    const size = Math.round(Number(f?.size));
    if (!(size > 0) || size > t[1] * 1024 * 1024) return { error: 'file_size' };
    out.push({ kind: role === 'identite' ? 'identite' : t[0] === 'video' ? 'video' : 'photo', mime, size });
  }
  const photos = out.filter((f) => f.kind === 'photo').length, videos = out.filter((f) => f.kind === 'video').length, ids = out.filter((f) => f.kind === 'identite').length;
  if (ids > 1) return { error: 'identite_trop' }; // facultative : elle renforce le profil
  if (videos > 1 || photos > 2 || (videos && photos)) return { error: 'medias_trop' };
  if (!mediasSuffisants(out) && !optionnel) return { error: 'medias_requis' };
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
// Pourquoi une demande n'a pas abouti, pour l'afficher clairement à la personne qui l'a envoyée.
// Le motif écrit par Lamia reste privé, et un blocage ne se distingue pas d'un profil parti.
export function finDemande(i) {
  if (i.statut !== 'pas_compatible') return null;
  if (i.avis_ok_demandeur === false) return 'moi';
  if (i.reponse === 'non' || i.avis_ok_cible === false) return 'autre';
  return i.annule_motif ? 'lamia' : 'indispo';
}
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
    const autres = await read(`/rest/v1/annonce_interets?cible_ref=in.(${(await refsDe(a)).join(',')})&statut=eq.mis_en_relation&reciproque=eq.false&select=id`).catch(() => []);
    const mise = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.mis_en_relation&reciproque=eq.false&select=id`).catch(() => []);
    return Math.max(new Set(mien.map((x) => x.cible_ref ?? x.id)).size + autres.length + mise.length, a.en_match ? 1 : 0);
  };
  // Règle de Lamia (3 nov. 2026) : matchs en cours en même temps selon la formule (Découverte 1, Passion 2, Prestige 5).
  const limiteMatchs = (f) => f?.matchs || 1;
  // La formule d'un profil quelconque (l'autre personne d'un match, par exemple).
  const formuleDeProfil = async (x) => {
    const mail = x?.email || (x?.user_id ? (await compteDe(x.user_id).catch(() => null))?.email : null);
    if (!mail) return formuleAbo('decouverte');
    const id = formuleDe ? await formuleDe(mail) : (await etatAbonnement(mail, { env }).catch(() => ({}))).abonnement?.formule;
    return formuleAbo(id) || formuleAbo('decouverte');
  };
  // en_match veut dire « plus de place » : le profil ne peut plus matcher et sort des profils anonymes. Renvoie true si c'est le cas.
  const recalculerEnMatch = async (x) => {
    if (!x?.id) return false;
    const [p] = await read(`/rest/v1/annonces?id=eq.${x.id}&select=id,ref,email,user_id,en_match`).catch(() => []);
    if (!p) return false;
    const m = await matchsEnCoursParPersonne().catch(() => null);
    if (!m) return Boolean(p.en_match);
    const plein = Math.max(m.deRef(p.ref), p.user_id ? m.deCompte(p.user_id) : 0) >= limiteMatchs(await formuleDeProfil(p));
    if (plein !== Boolean(p.en_match)) await patch('annonces', `id=eq.${p.id}`, { en_match: plein });
    return plein;
  };
  // Profils qui m'ont choisi·e et que je n'ai pas encore traités.
  // Une même personne peut avoir une annonce et une fiche du live : ses références comptent ensemble.
  const refsDe = async (a) => {
    const fiches = a?.user_id ? await read(`/rest/v1/profils_outil?user_id=eq.${a.user_id}&select=ref`).catch(() => []) : [];
    return [...new Set([a.ref, a.fiche_ref, ...fiches.map((f) => f.ref)].filter(Boolean))];
  };
  // « Voir qui m'a choisi·e » acheté à l'unité : valable 24 heures. Renvoie sa date de fin, ou null.
  const passQuiChoisi = async () => {
    if (!user?.email) return null;
    const [x] = await read(`/rest/v1/achats_unite?email=ilike.${encodeURIComponent(user.email.toLowerCase().replace(/[%_*,()]/g, ''))}&type=eq.qui_choisi&acces_jusqu_a=gte.${encodeURIComponent(now().toISOString())}&select=acces_jusqu_a&order=acces_jusqu_a.desc&limit=1`).catch(() => []);
    return x?.acces_jusqu_a || null;
  };
  const quiMaChoisi = async (a) => {
    const miennes = await refsDe(a);
    const refs = (await read(`/rest/v1/annonce_interets?cible_ref=in.(${miennes.join(',')})&statut=eq.a_traiter&select=demandeur_id,annonces!inner(ref,status)`).catch(() => [])).map((x) => x.annonces?.ref).filter(Boolean);
    if (!refs.length) return refs;
    const caches = await refsCachees({ read }, miennes);
    return refs.filter((r) => !caches.has(r));
  };
  // Fiches de l'outil : toutes affichées (sauf celles que la personne a retirées), avec la mention « confirmé » ou « en attente de confirmation ».
  const profilsOutilPublics = async () => (await read('/rest/v1/profils_outil?visible=eq.true&retire_at=is.null&pause_at=is.null&select=ref,genre,age,ville,village,pays,secteur,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max,religion,pratique,mode_vie,metier,confirme_at,recommande_at,moderateur_at,avant_jusqu_a&order=updated_at.desc&limit=2000').catch(() => []))
    .map(({ confirme_at: c, recommande_at: r, moderateur_at: mo, avant_jusqu_a: av, ...p }) => ({ ...p, outil: true, confirme: Boolean(c), recommande: Boolean(r), moderateur: Boolean(mo), en_avant: Boolean(av && new Date(av) > now()), profil: sansContact(p.profil), recherche: sansContact(p.recherche) }));
  // Scores de l'outil de Lamia (même algorithme que pendant le live), dans un sens ou dans l'autre.
  async function scoresOutil(paires) {
    const refs = [...new Set(paires.flat())].filter((r) => r > 0);
    if (!refs.length) return () => null;
    const rows = await read(`/rest/v1/scores_outil?a_ref=in.(${refs.join(',')})&b_ref=in.(${refs.join(',')})&select=a_ref,b_ref,score,niveau`).catch(() => []);
    const m = new Map(rows.map((r) => [`${r.a_ref}-${r.b_ref}`, r]));
    return (x, y) => m.get(`${x}-${y}`) || m.get(`${y}-${x}`) || null;
  }
  // Règle de Lamia : 1 match offert (3 pour un profil créé en live) — depuis le 10 nov. 2026, Découverte n'a plus de total : 1 match à la fois, plus 1 en live toutes les 2 semaines ; Passion 10 par mois, Prestige illimité ; 5 € le match à l'unité.
  // En Algérie, le paiement en ligne n'est pas possible : d'autres matchs passent toujours par le live.
  const enAlgerie = (x) => /alg/i.test(String(x?.pays || ''));
  async function lecteurQuotas() {
    const rel = await read('/rest/v1/annonce_interets?statut=in.(mis_en_relation,dematche)&select=cible_ref,updated_at,annonces!inner(ref)&limit=5000').catch(() => []);
    const debutMois = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1)).toISOString();
    return async (x, formuleConnue = null) => {
      const miens = rel.filter((i) => i.annonces?.ref === x.ref || i.cible_ref === x.ref);
      const offerts = (x.fiche || x.live_declare ? 3 : 1) + (Number(x.matchs_bonus) || 0);
      if (miens.length < offerts) return { ok: true };
      const mail = x.email || (x.user_id ? (await compteDe(x.user_id))?.email : null);
      const etat = !formuleConnue && mail && !formuleDe ? await etatAbonnement(mail, { env }).catch(() => ({})) : {};
      const f = formuleConnue || formuleAbo(formuleDe && mail ? await formuleDe(mail) : etat.abonnement?.formule) || formuleAbo('decouverte');
      // Règle de Lamia (10 nov. 2026) : en Découverte, les matchs gratuits sont illimités mais un seul à la fois (la limite « en cours » s'applique).
      if (f.mois === 0) return { ok: true };
      if (f.mois > 0 && (f.mises === null || miens.filter((i) => String(i.updated_at || '') >= debutMois).length < f.mises)) return { ok: true };
      if (etat.unites?.mise_en_relation > 0) return { ok: true, via: 'unite', mail };
      return { ok: false, formule: f.id };
    };
  }
  // Match offert en live : 1 toutes les 2 semaines par personne (son profil et sa fiche comptent ensemble). Renvoie la date du prochain, ou null.
  const dateFr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  async function prochainMatchLive(x) {
    const dates = [x.match_live_at];
    if (x.user_id) for (const t of ['annonces', 'profils_outil']) for (const l of await read(`/rest/v1/${t}?user_id=eq.${x.user_id}&select=match_live_at`).catch(() => [])) dates.push(l.match_live_at);
    const dernier = Math.max(0, ...dates.filter(Boolean).map((d) => new Date(d).getTime()));
    const suivant = dernier + 14 * 86400e3;
    return dernier && suivant > now().getTime() ? new Date(suivant).toISOString() : null;
  }
  // Les matchs en cours de chacun : les mises en relation pas encore terminées.
  async function matchsEnCoursParPersonne() {
    const rel = await read('/rest/v1/annonce_interets?statut=eq.mis_en_relation&select=id,cible_ref,annonces!inner(ref,user_id)&limit=3000');
    const compteDe = new Map(rel.filter((i) => i.annonces?.user_id).map((i) => [i.annonces.ref, i.annonces.user_id]));
    const cibles = [...new Set(rel.map((i) => i.cible_ref))];
    if (cibles.length) {
      const [aa, ff] = await Promise.all([read(`/rest/v1/annonces?ref=in.(${cibles.join(',')})&select=ref,user_id`).catch(() => []), read(`/rest/v1/profils_outil?ref=in.(${cibles.join(',')})&select=ref,user_id`).catch(() => [])]);
      for (const x of [...aa, ...ff]) if (x.user_id) compteDe.set(x.ref, x.user_id);
    }
    return compterMatchs(rel.map((i) => ({ id: i.id, a: i.annonces?.ref, b: i.cible_ref })), compteDe);
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
      const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: titre, body: texte, url: lien, tag: `${tag}-${Date.now()}`, icon: '/images/marque/notif-lfb-2.png' }, keys).catch(() => ({ ok: false }));
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
    const notifications = await pousserMembre(m.user_id, { titre, texte, lien }).catch(() => 0);
    let emailOk = false;
    if (m.email && !String(m.email).endsWith('.invalid')) emailOk = await email(m.email, titre,
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">${esc(titre)}</h2><p>${esc(texte)}</p><p><a href="https://lamia-femme-berbere.com${lien}">${esc(bouton)}</a></p><p style="font-size:13px">${esc(pied)}</p></div>`,
      `${titre}\n\n${texte}\nhttps://lamia-femme-berbere.com${lien}`).then((ok) => ok !== false, () => false);
    // Journal : Lamia voit dans son tableau de bord qui a été prévenu, par quel canal, et s'il a ouvert son espace depuis.
    await insert('alertes_membres', { user_id: m.user_id || null, email: m.email ? String(m.email).toLowerCase() : null, prenom: qui.prenom || null, titre: String(titre).slice(0, 200), lien, notifications: Number(notifications) || 0, email_envoye: emailOk }).catch(() => {});
  }
  // Fin d'un match : les choix gardés en réserve repassent « à traiter » s'ils sont toujours disponibles ; Lamia voit le meilleur potentiel.
  async function reactiverReserve(a) {
    if (!a?.id) return;
    const res = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.en_reserve&select=id,cible_ref`).catch(() => []);
    if (!res.length) return;
    const refsSite = res.map((x) => x.cible_ref).filter((r) => r < REF_OUTIL), refsOutil = res.map((x) => x.cible_ref).filter((r) => r >= REF_OUTIL);
    const site = refsSite.length ? await read(`/rest/v1/annonces?ref=in.(${refsSite.join(',')})&select=ref,status,en_match,birth_date,pays,matching,age_min,age_max`).catch(() => []) : [];
    const outil = refsOutil.length ? await read(`/rest/v1/profils_outil?ref=in.(${refsOutil.join(',')})&select=ref,visible,retire_at,age,age_min,age_max,pays,religion,pratique,religion_recherche,pratique_recherche,enfants,situation,origine,mode_vie,etudes`).catch(() => []) : [];
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
    await alerter({ titre: `Match terminé · n° ${moi.ref} : ${dispo.length} choix en réserve à reprendre`, lignes: [`Meilleur potentiel disponible : n° ${dispo[0].ref} (${dispo[0].score}/100)`, dispo.length > 1 ? `Aussi : ${dispo.slice(1, 4).map((d) => `n° ${d.ref} (${d.score})`).join(', ')}` : '', 'Dans tes Confidences, Matchs demandés'].filter(Boolean), lien: '/confidences-lamia/#annonces', tag: 'reserve' }).catch(() => {});
    await prevenirMembre(moi, { titre: `{A}, Lamia reprend tes autres choix`, texte: `Ton match est terminé. ${dispo.length > 1 ? `Tes ${dispo.length} autres choix gardés en réserve sont` : 'Ton autre choix gardé en réserve est'} toujours disponible${dispo.length > 1 ? 's' : ''} : Lamia les étudie de nouveau pour te proposer le meilleur.` });
  }
  // Match actif : tant qu'il dure, les deux profils ne peuvent plus matcher (ni apparaître dans les profils anonymes).
  const appliquerStatut = async (interetId, statut) => {
    const [d] = await read(`/rest/v1/annonce_interets?id=eq.${interetId}&select=cible_ref,statut,annonces!inner(id,ref,status,prenom,genre,email,user_id,live_declare,matchs_bonus)`).catch(() => []);
    if (!d) return { error: 'not_found' };
    if (statut === 'mis_en_relation' && d.annonces?.status !== 'publiee') return { error: 'profil_non_verifie' };
    // Personne ne dépasse le nombre de matchs en cours de sa formule.
    if (statut === 'mis_en_relation' && d.statut !== 'mis_en_relation') {
      const m = await matchsEnCoursParPersonne().catch(() => null);
      // Par compte aussi : une personne peut être engagée par son annonce ou par sa fiche du live.
      const uCible = d.cible_ref >= REF_OUTIL ? (await read(`/rest/v1/profils_outil?ref=eq.${d.cible_ref}&select=user_id`).catch(() => []))[0]?.user_id : null;
      const [cMail] = d.cible_ref < REF_OUTIL ? await read(`/rest/v1/annonces?ref=eq.${d.cible_ref}&select=ref,email,user_id,live_declare,matchs_bonus`).catch(() => []) : [];
      const autre = cMail || { ref: d.cible_ref, user_id: uCible || null, fiche: true };
      const nb = (ref, u) => (m ? Math.max(m.deRef(ref), u ? m.deCompte(u) : 0) : 0);
      if (nb(d.annonces.ref, d.annonces.user_id) >= limiteMatchs(await formuleDeProfil(d.annonces)) || nb(d.cible_ref, autre.user_id) >= limiteMatchs(await formuleDeProfil(autre))) return { error: 'deja_en_match' };
      // Un match acheté à l'unité est décompté maintenant, une seule fois.
      const quota = await lecteurQuotas();
      for (const x of [d.annonces, autre]) { const q = await quota(x).catch(() => ({})); if (q.via === 'unite') await consommerMatchAchete(q.mail, { env }).catch(() => {}); }
    }
    await patch('annonce_interets', `id=eq.${interetId}`, { statut, updated_at: now().toISOString() });
    if (statut === 'mis_en_relation' || statut === 'dematche') {
      const actif = statut === 'mis_en_relation';
      const [c] = d.cible_ref < REF_OUTIL ? await read(`/rest/v1/annonces?ref=eq.${d.cible_ref}&select=id,ref,prenom,genre,email,user_id`).catch(() => []) : [];
      // Fiche du live : si la personne swipe aussi, son profil est engagé (ou libéré) en même temps que sa fiche.
      const profilDeFiche = await annonceDeFiche(d.cible_ref);
      // Le profil n'est plus proposé quand toutes ses places sont prises : ses autres choix passent alors en réserve (ils reviennent si un match casse).
      const concernes = [d.annonces, c, profilDeFiche].filter(Boolean);
      const pleins = new Map();
      for (const m of concernes) pleins.set(m.id, await recalculerEnMatch(m));
      if (actif) for (const m of concernes.filter((x) => pleins.get(x.id))) await patch('annonce_interets', `demandeur_id=eq.${m.id}&statut=eq.a_traiter&id=neq.${interetId}`, { statut: 'en_reserve', updated_at: now().toISOString() }).catch(() => {});
      const cFiche = actif && !c && d.cible_ref >= REF_OUTIL ? await compteParRef(d.cible_ref).catch(() => null) : null;
      if (actif) {
        // 7 jours de discussion dans l'application, si les deux ont un compte.
        const disc = await ouvrirDiscussion({ read, insert, now }, { interetId, a: d.annonces, b: c || cFiche }).catch(() => null);
        for (const m of [d.annonces, c, cFiche].filter(Boolean)) await prevenirMembre(m, disc
          ? { titre: `{A}, Lamia t’a trouvé un match !`, texte: 'Lamia a choisi pour toi la personne avec le meilleur potentiel. Une discussion privée de 7 jours s’ouvre dans ton espace : faites connaissance, puis échangez vos numéros quand vous êtes prêts.', bouton: 'Ouvrir la discussion', lien: '/mon-espace/#discussion' }
          : { titre: `{A}, Lamia t’a trouvé un match !`, texte: 'Lamia a choisi pour toi la personne avec le meilleur potentiel. Elle te contacte très vite pour vous mettre en relation.' });
      } else { await fermerDiscussion({ patch, now }, interetId); await reactiverReserve(d.annonces).catch(() => {}); if (c) await reactiverReserve(c).catch(() => {}); if (profilDeFiche) await reactiverReserve(profilDeFiche).catch(() => {}); }
    }
    return { ok: true };
  };
  // Le profil (annonce) de la personne qui possède cette fiche du live, s'il existe.
  async function annonceDeFiche(ref) {
    if (ref < REF_OUTIL) return null;
    const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=user_id`).catch(() => []);
    if (!f?.user_id) return null;
    const [c] = await read(`/rest/v1/annonces?user_id=eq.${f.user_id}&status=in.(a_verifier,publiee)&select=id,ref,prenom,genre,status,email,user_id,en_match,pause_at,interet_notifie_at,fiche_ref&limit=1`).catch(() => []);
    return c || null;
  }
  // Sans « refs » : tous les matchs de la personne. Avec « refs » : seulement le match avec ces profils.
  const finirMatch = async (a, { refs = null } = {}) => {
    const enCours = (await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.mis_en_relation&select=id,cible_ref`).catch(() => [])).filter((i) => !refs || refs.includes(i.cible_ref));
    const idsAutres = refs ? (await read(`/rest/v1/annonces?ref=in.(${refs.join(',')})&select=id`).catch(() => [])).map((x) => x.id) : null;
    for (const i of [...enCours]) await fermerDiscussion({ patch, now }, i.id);
    for (const i of enCours) await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'dematche', updated_at: now().toISOString() });
    const visant = (await read(`/rest/v1/annonce_interets?cible_ref=in.(${(await refsDe(a)).join(',')})&statut=eq.mis_en_relation&select=id,demandeur_id`).catch(() => [])).filter((i) => !idsAutres || idsAutres.includes(i.demandeur_id));
    for (const i of visant) await fermerDiscussion({ patch, now }, i.id);
    for (const i of visant) await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'dematche', updated_at: now().toISOString() });
    // Chacun retrouve une place : on recalcule, et ses choix gardés en réserve reviennent.
    if (!refs) await patch('annonces', `id=eq.${a.id}`, { en_match: false });
    else await recalculerEnMatch(a);
    await reactiverReserve(a).catch(() => {});
    for (const i of enCours) { const [c] = i.cible_ref < REF_OUTIL ? await read(`/rest/v1/annonces?ref=eq.${i.cible_ref}&select=id`).catch(() => []) : [await annonceDeFiche(i.cible_ref)]; if (c) { await recalculerEnMatch(c); await reactiverReserve(c).catch(() => {}); } }
    for (const i of visant) { await recalculerEnMatch({ id: i.demandeur_id }); await reactiverReserve({ id: i.demandeur_id }).catch(() => {}); }
  };
  const outilParRef = async (refs) => { const r = [...new Set(refs.filter((x) => x >= REF_OUTIL))]; return r.length ? read(`/rest/v1/profils_outil?ref=in.(${r.join(',')})&select=ref,outil_id,user_id,genre,age,pays`).catch(() => []) : []; };
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
  // Le prénom donné à l'inscription ou dans l'annonce va aussi dans la fiche du compte (member_profiles), sans écraser ce qui y est déjà.
  const noterPrenom = async (userId, prenom) => {
    const p = clean(prenom, 60);
    if (!userId || !p) return;
    await call('/rest/v1/member_profiles?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId, real_first_name: p }) }).catch(() => {});
    await call(`/rest/v1/member_profiles?user_id=eq.${userId}&or=(real_first_name.is.null,real_first_name.eq.)`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ real_first_name: p }) }).catch(() => {});
  };
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
    try { const cree = await r.json(); await noterPrenom(cree?.id || cree?.user?.id, b.prenom); } catch { /* le compte est créé : le prénom suivra avec l'annonce */ }
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
    const redirect = `${SITE}${['en', 'ar', 'kab'].includes(b.langue) ? `/${b.langue}` : b.en ? '/en' : ''}${retours[b.retour] || '/mon-espace/'}`;
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
    if (!matching.origineTags.length) return json({ error: 'origine_requise' }, 400);
    if (!EMAIL.test(mail)) return json({ error: 'invalid_email' }, 400);
    if (!live && (profil.length < 20 || recherche.length < 20)) return json({ error: 'textes_courts' }, 400);
    const { files, error } = verifierMedias(b.medias);
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
    await noterPrenom(user.id, prenom);
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
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Merci ${esc(salutDe(a))} !</h2><p>Ton profil n° ${a.ref} est bien arrivé. Lamia le lit elle-même et le vérifie. Il n’est publié nulle part : il reste chez Lamia, qui le passe dans son outil de matching.</p><p>${files.some((f) => f.kind === 'identite') ? 'Ta pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.' : 'Tu peux modifier ton profil quand tu veux dans ton espace : https://lamia-femme-berbere.com/mon-espace/'}</p>${a.live_declare ? '<p>Profil créé en live avec Lamia : tes 3 premières mises en relation sont offertes.</p>' : ''}<p style="font-size:13px">Tu pourras retirer ton annonce et effacer tes données à tout moment avec ce lien (garde-le précieusement) :<br><a href="${lienRetrait}">Retirer mon annonce</a></p></div>`,
      `Merci ${salutDe(a)} !\n\nTon annonce n° ${a.ref} est bien arrivée. Lamia la vérifie ; elle n’est publiée nulle part.\nTa pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.\n\nPour retirer ton annonce à tout moment : ${lienRetrait}`).catch(() => false);
    const auto = await autoValider({ ...a, status: 'a_verifier' }, files).catch(() => ({ valide: false, manques: [] }));
    const demandes = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${id}&select=cible_ref`).catch(() => []);
    if (demandes.length || !auto.valide) await alerter({ titre: demandes.length ? `Match demandé · n° ${a.ref} → n° ${demandes.map((d) => d.cible_ref).join(', ')}` : `Nouveau profil à vérifier · n° ${a.ref}`, lignes: [auto.manques.length ? `Pas validé automatiquement, il manque : ${auto.manques.join(', ')}` : '', `${a.prenom}, ${a.genre === 'femme' ? 'une femme' : 'un homme'} de ${ageAu(a.birth_date, now())} ans${a.ville ? `, ${a.ville}` : ''}${a.pays ? ` (${a.pays})` : ''}`, a.live_declare ? (a.outil_id ? 'Profil créé en live : fiche retrouvée dans ton outil (3 mises en relation offertes)' : 'Dit avoir créé son profil en live : fiche pas retrouvée, vérifie son pseudo TikTok') : a.outil_id ? 'Ce profil existe déjà dans ton outil (même lien de réseau social) : il y est relié' : '', demandes.length ? `Intéressé(e) par le profil n° ${demandes.map((d) => d.cible_ref).join(', ')}` : '', 'Dans ton espace Confidences, onglet Annonces'].filter(Boolean), lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true, ref: a.ref });
  }

  // ---------------------------------------------------------------- annonces publiées (lecture publique)
  // Profils anonymes du Patio : ni prénom, ni photo, ni ville, ni contact. Seulement ceux que Lamia a choisi d'afficher.
  if (action === 'annonces_publiques') return json({ ok: true, annonces: await listePublique() });
  // Profils de test (Lamia) : jamais montrés au public, seulement à un profil de test.
  async function listePublique({ tests = false } = {}) {
    const list = await read(`/rest/v1/annonces?status=eq.publiee&visible_anonyme=eq.true&anonyme_ok=eq.true&en_match=eq.false&pause_at=is.null&test=eq.${tests}&select=ref,genre,birth_date,pays,situation,matching,profil,recherche,age_min,age_max,published_at,identite_verifiee_at,recommande_at,moderateur_at,avant_jusqu_a&order=published_at.desc&limit=80`);
    const secteurDe = (m) => sansContact(clean([m?.zoneGeo, m?.paysRechercheDetail, m?.regionRechercheDetail].filter(Boolean).join(' · '), 120));
    return list.map((a) => ({
      ref: a.ref, recommande: Boolean(a.recommande_at), moderateur: Boolean(a.moderateur_at), en_avant: Boolean(a.avant_jusqu_a && new Date(a.avant_jusqu_a) > now()), genre: a.genre, age: ageAu(a.birth_date, now()), pays: a.pays, situation: a.situation,
      enfants: a.matching?.enfants || '', etudes: a.matching?.niveauEtudeCategorie || '', origine: a.matching?.origineTags || [],
      caracteristiques: a.matching?.caracteristiques || [], profil: sansContact(a.profil), recherche: sansContact(a.recherche), age_min: a.age_min, age_max: a.age_max, piece_identite: Boolean(a.identite_verifiee_at),
      religion: a.matching?.religion || '', pratique: a.matching?.pratique || '', religion_texte: sansContact(a.matching?.religionTexte || ''), metier: sansContact(clean(a.matching?.profession, 80)) || '', mode_vie: a.matching?.hygieneVie || [], autres: sansContact(a.matching?.autresModeVie || ''), secteur: secteurDe(a.matching) || null,
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
  // Une seule fois par annonce : « ton annonce est publiée, n° X » et, sans accord, la demande d'accord.
  const notifierParutions = async () => {
    const champs = 'select=id,ref,user_id,email,genre,prenom,fiche_ref,outil_id,anonyme_ok';
    const parues = await read(`/rest/v1/annonces?status=eq.publiee&visible_anonyme=eq.true&test=eq.false&parue_notifiee_at=is.null&${champs}&limit=50`).catch(() => []);
    for (const a of parues) {
      await patch('annonces', `id=eq.${a.id}`, { parue_notifiee_at: now().toISOString() });
      await prevenirMembre(a, { titre: `{A}, ton annonce n° ${a.ref} est publiée`, texte: `Ton annonce n° ${a.ref} est visible sur le site, de façon anonyme : sans prénom, photo, ville ni contact. Tu peux la modifier quand tu veux avec « Modifier mon annonce ».`, bouton: 'Voir mon espace' }).catch(() => {});
    }
    const sans = await read(`/rest/v1/annonces?status=eq.publiee&anonyme_ok=eq.false&test=eq.false&accord_demande_at=is.null&bloque_at=is.null&${champs}&limit=50`).catch(() => []);
    let demandes = 0;
    for (const a of sans) {
      const fiche = a.user_id ? (await read(`/rest/v1/profils_outil?user_id=eq.${a.user_id}&visible=eq.true&select=ref&limit=1`).catch(() => [])).length > 0 : false;
      await patch('annonces', `id=eq.${a.id}`, { accord_demande_at: now().toISOString() });
      if (fiche || a.fiche_ref || a.outil_id) continue; // une fiche la représente déjà
      await prevenirMembre(a, { titre: `{A}, veux-tu que ton annonce soit visible ?`, texte: `Ton profil n° ${a.ref} est validé, mais il n’est pas affiché : tu n’as pas donné ton accord. Si tu veux qu’il apparaisse de façon anonyme (sans prénom, photo, ville ni contact), réponds dans ton espace. Sans réponse, il reste masqué.`, bouton: 'Répondre', lien: '/mon-espace/#affichage' }).catch(() => {});
      demandes += 1;
    }
    return { parues: parues.length, demandes };
  };
  // Comptes créés sans annonce : une seule relance, annulée si la personne a créé son annonce entre-temps.
  const relancerComptes = async () => {
    const liste = await read('/rest/v1/relances_compte?envoyee_at=is.null&select=user_id,email,prenom&limit=60').catch(() => []);
    let envoyees = 0;
    for (const r of liste) {
      await patch('relances_compte', `user_id=eq.${r.user_id}`, { envoyee_at: now().toISOString() });
      const [a] = await read(`/rest/v1/annonces?or=(user_id.eq.${r.user_id},email.eq.${encodeURIComponent(String(r.email).toLowerCase())})&status=in.(a_verifier,publiee)&select=ref&limit=1`).catch(() => []);
      const [f] = await read(`/rest/v1/profils_outil?user_id=eq.${r.user_id}&select=ref&limit=1`).catch(() => []);
      if (a || f) continue;
      await prevenirMembre({ user_id: r.user_id, email: r.email, prenom: r.prenom }, { titre: '{A}, ton annonce t’attend', texte: 'Ton compte LFB est créé, mais tu n’as pas encore d’annonce. Crée-la en quelques minutes : c’est elle qui te permet de swiper et de recevoir des propositions. Elle reste anonyme, sans prénom, photo, ville ni contact.', bouton: 'Créer une annonce', lien: '/rencontres/#confier', pied: 'Si tu n’en veux pas, ne fais rien : tu ne recevras pas d’autre rappel.' }).catch(() => {});
      envoyees += 1;
    }
    return envoyees;
  };
  const monProfil = async () => {
    if (!user?.email) return null;
    const e = encodeURIComponent(String(user.email).toLowerCase());
    const [a] = await read(`/rest/v1/annonces?or=(user_id.eq.${user.id},email.eq.${e})&status=in.(a_verifier,publiee,refusee)&select=*&order=submitted_at.desc&limit=1`).catch(() => []);
    if (a && !a.user_id) await patch('annonces', `id=eq.${a.id}`, { user_id: user.id }).catch(() => {});
    return a || null;
  };
  // Fiche du live confirmée et reliée à ce compte : on prépare le profil interne qui permet de swiper.
  // Il reste invisible dans les profils (c'est la fiche qui est affichée) et ne demande rien à la personne.
  const profilOuFicheLive = async () => {
    const a = await monProfil();
    if (a || !user?.email) return a;
    const [f] = await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&retire_at=is.null&confirme_at=not.is.null&select=*&order=confirme_at.desc&limit=1`).catch(() => []);
    if (!f || !['femme', 'homme'].includes(f.genre) || !(f.age >= 18)) return null;
    const t = now();
    await insert('annonces', {
      status: 'publiee', prenom: clean(user.user_metadata?.first_name, 60) || 'Membre', genre: f.genre,
      birth_date: `${t.getUTCFullYear() - f.age}-01-01`, ville: clean(f.ville, 80), pays: clean(f.pays, 60),
      profil: sansContact(clean(f.profil, 1500)), recherche: sansContact(clean(f.recherche, 1500)),
      age_min: f.age_min >= 18 && f.age_min <= 99 ? f.age_min : null, age_max: f.age_max >= 18 && f.age_max <= 99 ? f.age_max : null,
      email: String(user.email).toLowerCase(), user_id: user.id, outil_id: f.outil_id, fiche_ref: f.ref,
      live_declare: true, anonyme_ok: true, visible_anonyme: false, situation: clean(f.situation, 40) || null,
      submitted_at: t.toISOString(), published_at: t.toISOString(),
      matching: { religion: f.religion || '', pratique: f.pratique || '', religionRecherche: f.religion_recherche || '', pratiqueRecherche: f.pratique_recherche || '', enfants: f.enfants || '', origineTags: f.origine || [], caracteristiques: f.caracteristiques || [], hygieneVie: f.mode_vie || [], niveauEtudeCategorie: f.etudes || '', zoneGeo: f.secteur || '' },
    }).catch(() => null); // deux onglets en même temps : l'index unique refuse le second, et la relecture trouve le premier
    return monProfil();
  };
  const mesMedias = async (a) => read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&kind=in.(photo,video)&select=id,kind,storage_path`);
  // En cas de panne de lecture, on ne bloque personne.
  const manqueMedias = async (a) => { if (a.test) return false; try { return !mediasSuffisants(await mesMedias(a)); } catch { return false; } };
  // Ajouter ses photos depuis son espace, ou juste après avoir confirmé sa fiche du live.
  if (action === 'annonce_ajouter_medias') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await profilOuFicheLive();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const deja = (await mesMedias(a).catch(() => [])).filter((f) => f.kind === 'photo');
    if (mediasSuffisants(deja)) return json({ ok: true, deja: true, uploads: [] });
    const { files, error } = verifierMedias(b.medias, { optionnel: true });
    if (error) return json({ error }, 400);
    const nouveaux = files.filter((f) => f.kind !== 'identite');
    if (!nouveaux.length || !mediasSuffisants([...deja, ...nouveaux]) || deja.length + nouveaux.length > 2) return json({ error: 'medias_requis', deja: deja.length }, 400);
    const uploads = [], t = now().getTime();
    let n = deja.length;
    for (const f of nouveaux) {
      n += 1;
      const path = `${a.id}/${f.kind}-${t}-${n}.${EXT[f.mime]}`;
      const r = await call(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', body: '{}' });
      if (!r.ok) throw new Error(`sign ${r.status}`);
      const { url } = await r.json();
      await insert('annonce_files', { annonce_id: a.id, kind: f.kind, storage_path: path, mime: f.mime, size_bytes: f.size, position: n });
      uploads.push({ url: `${DATABASE_URL}/storage/v1${url}`, type: f.mime, path });
    }
    return json({ ok: true, uploads });
  }
  // Les fichiers annoncés sont-ils bien arrivés ? Ceux qui manquent sont oubliés, pour pouvoir réessayer.
  if (action === 'annonce_medias_verifier') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await profilOuFicheLive();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const liste = await mesMedias(a).catch(() => []);
    const r = await call(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix: `${a.id}/`, limit: 20 }) });
    if (!r.ok) return json({ error: 'upload_failed' }, 502);
    const presents = new Set((await r.json()).map((o) => `${a.id}/${o.name}`));
    const manquants = liste.filter((f) => !presents.has(f.storage_path));
    for (const f of manquants) await call(`/rest/v1/annonce_files?id=eq.${f.id}`, { method: 'DELETE' }).catch(() => {});
    const restants = liste.filter((f) => presents.has(f.storage_path));
    const ok = mediasSuffisants(restants);
    if (ok && manquants.length === 0) await alerter({ titre: `Profil n° ${a.ref} : photos ajoutées`, lignes: ['La personne a ajouté ses photos depuis son espace.'], lien: `/confidences-lamia/#annonce-${a.ref}`, tag: 'annonce' }).catch(() => {});
    return json({ ok: true, medias_ok: ok, photos: restants.filter((f) => f.kind === 'photo').length });
  }
  if (action === 'annonce_alertes') {
    if (!admin) return json({ error: 'forbidden' }, 403);
    const l = await read('/rest/v1/alertes_membres?select=id,prenom,email,titre,lien,notifications,email_envoye,vu_at,created_at&order=created_at.desc&limit=40').catch(() => null);
    // Les cadeaux de Lamia pas encore utilisés, pour pouvoir relancer la personne.
    const dons = await read('/rest/v1/achats_unite?stripe_session_id=like.offert-*&select=id,email,nom,type,quantite,utilisees,created_at&order=created_at.desc&limit=40').catch(() => []);
    return json({ ok: true, actif: Array.isArray(l), alertes: l || [], cadeaux: dons.filter((x) => x.utilisees < x.quantite).map((x) => ({ id: x.id, prenom: x.nom, email: x.email, quoi: CADEAUX[x.type]?.[0] || x.type, le: x.created_at })) });
  }
  if (action === 'annonce_cadeau_relancer') {
    if (!admin) return json({ error: 'forbidden' }, 403);
    const id = String(b.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400);
    const [x] = await read(`/rest/v1/achats_unite?id=eq.${id}&stripe_session_id=like.offert-*&select=id,email,nom,type,quantite,utilisees`).catch(() => []);
    if (!x || !(x.utilisees < x.quantite)) return json({ error: 'not_found' }, 404);
    const [a] = await read(`/rest/v1/annonces?email=ilike.${encodeURIComponent(String(x.email).replace(/[%_*,()]/g, ''))}&user_id=not.is.null&select=user_id,genre,prenom&order=created_at.desc&limit=1`).catch(() => []);
    const [quoi, lien] = CADEAUX[x.type] || ['un cadeau', '/mon-espace/'];
    await prevenirMembre({ user_id: a?.user_id || null, email: x.email, genre: a?.genre, prenom: a?.prenom || x.nom || '' }, { titre: `{A}, Lamia t’a offert ${quoi}`, texte: 'Il t’attend dans ton espace : choisis ton créneau quand tu veux.', bouton: 'Voir mon cadeau', lien });
    return json({ ok: true });
  }
  if (action === 'annonce_mon_profil') {
    if (!user) return json({ error: 'login_required' }, 401);
    // Le membre ouvre son espace : ses alertes en attente passent « vues ».
    await patch('alertes_membres', `user_id=eq.${user.id}&vu_at=is.null`, { vu_at: now().toISOString() }).catch(() => {});
    const a = await monProfil();
    if (!a) return json({ ok: true, profil: null });
    const interets = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&select=cible_ref,statut,reponse,annule_motif,avis_ok_demandeur,avis_ok_cible,created_at,updated_at&order=created_at.desc`).catch(() => []);
    const recus = await read(`/rest/v1/annonce_interets?cible_ref=in.(${(await refsDe(a)).join(',')})&statut=eq.mis_en_relation&select=updated_at`).catch(() => []);
    // Mises en relation faites (demandées par la personne ou reçues), au total et depuis le 1er du mois.
    const faites = [...interets.filter((i) => i.statut === 'mis_en_relation' || i.statut === 'dematche'), ...recus];
    const debutMois = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1)).toISOString();
    const suivi = { mises_total: faites.length, mises_mois: faites.filter((i) => (i.updated_at || i.created_at || '') >= debutMois).length };
    // Matchs en cours : pour chacun, la photo si la formule l'inclut (Passion, Prestige) ou si elle a été achetée pour 1 h, et si le match a accepté de la transmettre.
    await recalculerEnMatch(a).catch(() => {});
    const fChoix = await maFormule(), inclusPhoto = Boolean(fChoix.photoMatch);
    const [dem, rec] = await Promise.all([
      read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&statut=eq.mis_en_relation&select=cible_ref`).catch(() => []),
      read(`/rest/v1/annonce_interets?cible_ref=in.(${(await refsDe(a)).join(',')})&statut=eq.mis_en_relation&select=demandeur_id`).catch(() => []),
    ]);
    const achatsPhoto = user.email ? await read(`/rest/v1/achats_unite?email=ilike.${encodeURIComponent(user.email.toLowerCase().replace(/[%_*,()]/g, ''))}&type=eq.photo_match&photo_jusqu_a=gte.${encodeURIComponent(now().toISOString())}&select=photo_ref,photo_jusqu_a`).catch(() => []) : [];
    const lignesMatch = [...dem.map((i) => ({ filtre: i.cible_ref < REF_OUTIL ? `ref=eq.${i.cible_ref}` : null, ref: i.cible_ref })), ...rec.map((i) => ({ filtre: `id=eq.${i.demandeur_id}`, ref: null }))];
    const matchsLies = [];
    for (const l of lignesMatch) {
      const [m] = l.filtre ? await read(`/rest/v1/annonces?${l.filtre}&select=id,ref,photo_partage`).catch(() => []) : [];
      const ref = m?.ref ?? l.ref;
      if (ref === null || ref === undefined || matchsLies.some((x) => x.ref === ref)) continue;
      const v = { inclus: inclusPhoto, ref, url: null, accepte: m ? Boolean(m.photo_partage) : null, achetable: false, jusqu_a: null };
      if (m?.photo_partage) {
        const [f] = await read(`/rest/v1/annonce_files?annonce_id=eq.${m.id}&kind=eq.photo&select=storage_path&order=position.asc&limit=1`).catch(() => []);
        const achat = achatsPhoto.find((x) => x.photo_ref === ref);
        v.jusqu_a = achat?.photo_jusqu_a || null;
        v.achetable = Boolean(f && !inclusPhoto && !achat);
        if (f && (inclusPhoto || achat)) {
          const secondes = inclusPhoto ? 1800 : Math.max(60, Math.min(1800, Math.ceil((new Date(achat.photo_jusqu_a) - now()) / 1000)));
          v.url = (await liensLecture([f], secondes))[f.storage_path] || null;
        }
      }
      matchsLies.push(v);
    }
    const choisiPar = await quiMaChoisi(a);
    const passChoix = fChoix.quiMaChoisi ? null : await passQuiChoisi();
    const [avant] = await read(`/rest/v1/annonces?id=eq.${a.id}&select=avant_jusqu_a`).catch(() => []);
    const etatMatchs = { actifs: await matchsEnCours(a), limite: limiteMatchs(fChoix, a), formule: fChoix.id };
    const medias = await mesMedias(a).catch(() => null);
    return json({ ok: true, profil: { en_pause: Boolean(a.pause_at), demander_affichage: a.status === 'publiee' && !a.anonyme_ok && !a.fiche_ref && !a.outil_id && !a.pause_at, test: Boolean(a.test), medias_ok: !medias || a.test ? true : mediasSuffisants(medias), photos: medias ? medias.filter((f) => f.kind === 'photo').length : 0, fiche_live: Boolean(a.fiche_ref), photo_match: matchsLies[0] || null, matchs_lies: matchsLies, matchs: etatMatchs, en_avant_jusqu_a: avant?.avant_jusqu_a && new Date(avant.avant_jusqu_a) > now() ? avant.avant_jusqu_a : null, choisi_par: { nombre: choisiPar.length, refs: fChoix.quiMaChoisi || passChoix ? choisiPar : [], jusqu_a: passChoix, inclus: Boolean(fChoix.quiMaChoisi || passChoix) },
      ref: a.ref, status: a.status, prenom: a.prenom, telephone: a.phone || '', sans_reseau: !a.matching?.contactReseau && Boolean(a.phone), genre: a.genre, birth_date: a.birth_date, ville: a.ville, pays: a.pays, profil: a.profil, recherche: a.recherche,
      age_min: a.age_min, age_max: a.age_max, matching: a.matching || {}, anonyme_ok: a.anonyme_ok, visible_anonyme: a.visible_anonyme, live_declare: a.live_declare, outil_lie: Boolean(a.outil_id), en_match: a.en_match, compte: Boolean(a.user_id), modifiee_at: a.modifiee_at,
      piece_identite: Boolean(a.identite_verifiee_at), live: a.live_declare, live_retrouve: Boolean(a.outil_id), offertes: (a.live_declare ? 3 : 1) + (Number(a.matchs_bonus) || 0), algerie: enAlgerie(a),
      en_match: a.en_match, nb_compatibles: a.nb_compatibles, interets: interets.map((i) => ({ cible_ref: i.cible_ref, statut: i.statut, fin: finDemande(i), date: i.updated_at || i.created_at })), suivi, photo_partage: Boolean(a.photo_partage),
    } });
  }
  // Réponse à « veux-tu que ton annonce soit visible anonymement ? »
  // Pause : l'annonce et les fiches de la personne deviennent invisibles, sans rien effacer. Elle reprend quand elle veut.
  if (action === 'annonce_pause') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    const [fiche] = await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&retire_at=is.null&select=ref&limit=1`).catch(() => []);
    if (!a && !fiche) return json({ error: 'pas_de_profil' }, 404);
    const pause_at = b.pause === false ? null : now().toISOString();
    if (a) await patch('annonces', `id=eq.${a.id}`, { pause_at });
    if (fiche) await patch('profils_outil', `user_id=eq.${user.id}`, { pause_at });
    return json({ ok: true, en_pause: Boolean(pause_at) });
  }
  if (action === 'annonce_affichage_accord') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    if (b.oui !== true) { await patch('annonces', `id=eq.${a.id}`, { accord_demande_at: a.accord_demande_at || now().toISOString(), visible_anonyme: false, anonyme_ok: false }); return json({ ok: true, visible: false }); }
    const ficheVisible = (await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&visible=eq.true&select=ref&limit=1`).catch(() => [])).length > 0;
    const visible = a.status === 'publiee' && !a.fiche_ref && !a.outil_id && !ficheVisible;
    // Il vient de voir sa réponse à l'écran : pas besoin de le prévenir encore.
    await patch('annonces', `id=eq.${a.id}`, { anonyme_ok: true, ...(visible ? { visible_anonyme: true, parue_notifiee_at: now().toISOString() } : {}) });
    return json({ ok: true, visible, ref: a.ref });
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
    // Profil complété : validé tout de suite s'il ne manque plus rien.
    if (a.status === 'a_verifier') { const [maj] = await read(`/rest/v1/annonces?id=eq.${a.id}&select=*`).catch(() => []); if (maj) await autoValider(maj).catch(() => {}); }
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
    const titre = adresser(reciproque ? '{A}, c’est réciproque !' : '{A}, quelqu’un s’intéresse à toi', moiCible);
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
      await alerter({ titre: r.error ? `Accord reçu · n° ${i.cible_ref} accepte n° ${d.ref}` : `Match fait · n° ${d.ref} ↔ n° ${i.cible_ref}`, lignes: [r.error ? `La mise en relation n’a pas pu se faire toute seule (${r.error === 'profil_non_verifie' ? 'profil pas encore validé' : r.error}) : fais-la dans ton outil.` : `${parLamia ? 'Tu as noté son accord' : 'La personne a dit oui dans son espace'} : ${d.prenom} et elle sont prévenus. Le duo arrive dans ton outil à la prochaine récupération.`], lien: '/confidences-lamia/#annonces', tag: 'reciproque' }).catch(() => {});
      return { match: !r.error };
    }
    await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'pas_compatible', updated_at: now().toISOString() });
    await reactiverReserve({ id: d.id }).catch(() => {});
    await alerter({ titre: `Refus · n° ${i.cible_ref} a dit non à n° ${d.ref}`, lignes: [`${d.prenom} le voit dans ses demandes. Ses autres choix restent à traiter.`], lien: '/confidences-lamia/#annonces', tag: 'proposition' }).catch(() => {});
    return { match: false };
  }
  // Réponse à « d'accord quand même ? » (critère pas respecté). Oui : si l'autre a déjà dit oui, le match se fait ; sinon Lamia continue (demander l'accord de l'autre).
  async function conclureAvis(i, reponse, { parLamia = false } = {}) {
    const d = i.annonces, qui = i.avis_qui === 'demandeur' ? `n° ${d.ref}` : `n° ${i.cible_ref}`;
    const ok = i.avis_qui === 'demandeur' ? { avis_ok_demandeur: reponse === 'oui' } : { avis_ok_cible: reponse === 'oui' };
    await patch('annonce_interets', `id=eq.${i.id}`, { avis_reponse: reponse, avis_repondu_at: now().toISOString(), ...ok, ...(i.avis_qui === 'cible' && reponse === 'oui' ? { reponse: 'oui', reciproque: true, repondu_at: now().toISOString() } : {}) });
    if (reponse === 'oui') {
      const maj = { ...i, ...ok };
      // L'autre personne a aussi un critère pas respecté : on lui demande à son tour.
      const cotes = await cotesAvis(d.ref, i.cible_ref);
      const reste = avisManquants(maj, cotes);
      if (reste.length) { await demanderAvisAuto(maj, reste[0], cotes[reste[0]]).catch(() => false); return { match: false, reste: 'avis' }; }
      const lAutreVeut = i.avis_qui === 'cible' || i.reciproque || i.reponse === 'oui';
      if (lAutreVeut) { const faits = await miseEnRelationAuto().catch(() => []); return { match: faits.length > 0 }; }
      await journaliser({ titre: `${qui} accepte la différence · n° ${d.ref} → n° ${i.cible_ref}`, lignes: [`${parLamia ? 'Tu as noté son accord' : 'La personne a dit oui dans son espace'}. Il reste l’accord de l’autre personne.`], lien: '/tableau-de-bord#activite', categorie: 'proposition' }, { call, read }).catch(() => {});
      return { match: false, reste: 'accord' };
    }
    await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'pas_compatible', annule_motif: 'Différence refusée par la personne', updated_at: now().toISOString() });
    await reactiverReserve({ id: d.id }).catch(() => {});
    await journaliser({ titre: `Refus · ${qui} n’accepte pas la différence (n° ${d.ref} → n° ${i.cible_ref})`, lignes: ['La demande est annulée. Celle ou celui qui l’a envoyée le voit dans ses demandes.'], lien: '/tableau-de-bord#activite', categorie: 'proposition' }, { call, read }).catch(() => {});
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
    if (ref < REF_OUTIL) { const [c] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=status,en_match,test,pause_at`).catch(() => []); return Boolean(c && c.status === 'publiee' && !c.en_match && !c.pause_at); }
    const [o] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=visible,retire_at,pause_at`).catch(() => []);
    if (!o || o.retire_at || o.pause_at) return false;
    const liee = await annonceDeFiche(ref);
    // Une fiche masquée (plus dans l'export de l'outil) reste libre si la personne a son annonce publiée sur le site :
    // sinon ses « oui » réciproques restent bloqués pour toujours et l'autre personne reste à 1 / 1.
    if (o.visible === false && !(liee?.status === 'publiee' && !liee.pause_at)) return false;
    if (liee?.en_match) return false;
    const enCours = await read(`/rest/v1/annonce_interets?cible_ref=eq.${ref}&statut=eq.mis_en_relation&select=id&limit=6`).catch(() => []);
    if (!enCours.length) return true;
    const [fo] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=user_id`).catch(() => []);
    return enCours.length < limiteMatchs(await formuleDeProfil({ user_id: fo?.user_id }));
  }
  // ---- Profils incomplets : jamais validés à la main. La personne reçoit ce qui manque ; dès qu'elle l'ajoute, c'est validé tout seul.
  async function relancerIncomplets({ force = false } = {}) {
    const list = await read('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=*').catch(() => []);
    let relances = 0;
    for (const a of list) {
      const f = await read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&select=id,kind,storage_path`).catch(() => []);
      const manques = manquesProfil(a, f);
      if (!manques.length) continue;
      if (!force && a.relance_manques_at && now() - new Date(a.relance_manques_at) < 3 * 86400e3) continue;
      const liste = manques.map((m) => (m === 'photo' ? 'au moins une photo de toi' : m === 'email valide' ? 'une adresse email valide' : 'un lien vers ton TikTok, Instagram ou Facebook, ou un numéro de téléphone')).join(', ');
      await prevenirMembre(a, { titre: `${a.prenom ? `${a.prenom}, ` : ''}il manque presque rien à ton profil`, texte: `Pour que Lamia valide ton profil n° ${a.ref}, il manque : ${liste}. Ajoute-le dans ton espace (« Modifier mon annonce ») : dès que c’est fait, ton profil est validé automatiquement et tu reçois tes premiers matchs. Bonus : si tu ajoutes ta pièce d’identité, ton profil reçoit le badge « identité vérifiée » (elle n’est jamais publiée et elle est supprimée après vérification).`, bouton: 'Compléter mon profil', lien: '/mon-espace/#mon-profil' }).catch(() => {});
      await patch('annonces', `id=eq.${a.id}`, { relance_manques_at: now().toISOString() }).catch(() => {});
      relances++;
    }
    return relances;
  }
  // ---- Un critère d'une des deux personnes n'est pas respecté (secteur, âge…) : le site lui demande tout seul
  //      si elle accepte la différence (et l'invite à mettre son profil à jour). Sans réponse oui, pas de mise en relation.
  const CRITERES = [[/secteur/i, 'secteur'], [/^age|âge/i, 'age'], [/situation matrimoniale|marie/i, 'situation'], [/religion/i, 'religion'], [/enfant/i, 'enfants'], [/taille/i, 'taille'], [/etude|éducation|education|diplom/i, 'etudes'], [/fum|tabac|alcool|hygien/i, 'mode de vie'], [/administrative|papiers/i, 'papiers']];
  function criteresDe(blocages) {
    const out = [], vus = new Set();
    for (const bl of blocages || []) {
      if (/non confirm|profil source|non valide/i.test(bl)) continue; // donnée manquante, pas un critère refusé
      const c = CRITERES.find(([re]) => re.test(bl));
      if (!c) continue;
      const cote = /en retour/i.test(bl) ? 'b' : 'a', k = `${cote}${c[1]}`;
      if (!vus.has(k)) { vus.add(k); out.push({ cote, critere: c[1] }); }
    }
    return out;
  }
  // Côtés (demandeur / cible) dont un critère n'est pas respecté, pour la demande demandeurRef → cibleRef.
  async function cotesAvis(demandeurRef, cibleRef, lignes = null) {
    const rows = lignes || await read(`/rest/v1/scores_outil?or=(and(a_ref.eq.${demandeurRef},b_ref.eq.${cibleRef}),and(a_ref.eq.${cibleRef},b_ref.eq.${demandeurRef}))&select=a_ref,b_ref,blocages`).catch(() => []);
    const row = rows.find((r) => r.a_ref === demandeurRef && r.b_ref === cibleRef) || rows.find((r) => r.a_ref === cibleRef && r.b_ref === demandeurRef);
    if (!row?.blocages?.length) return {};
    const sens = row.a_ref === demandeurRef;
    const res = {};
    for (const c of criteresDe(row.blocages)) { const qui = (c.cote === 'a') === sens ? 'demandeur' : 'cible'; (res[qui] ||= []).push(c.critere); }
    return res;
  }
  const avisManquants = (i, cotes) => Object.keys(cotes).filter((q) => !(q === 'demandeur' ? i.avis_ok_demandeur : i.avis_ok_cible));
  async function questionAvis(criteres, moiRef, autreRef) {
    const autre = await ficheParRef(autreRef).catch(() => null);
    return phrasesDifference(criteres, autre || {}).join(' ');
  }
  async function demanderAvisAuto(i, qui, criteres) {
    const d = i.annonces;
    const m = qui === 'demandeur' ? (d.user_id ? d : null) : await compteParRef(i.cible_ref).catch(() => null);
    if (!m) return false; // pas de compte : Lamia passe par WhatsApp
    const question = await questionAvis(criteres, qui === 'demandeur' ? d.ref : i.cible_ref, qui === 'demandeur' ? i.cible_ref : d.ref);
    await patch('annonce_interets', `id=eq.${i.id}`, { avis_qui: qui, avis_question: question, avis_demande_at: now().toISOString(), avis_reponse: null, avis_repondu_at: null });
    await prevenirMembre(m, { titre: `${m.prenom ? `${m.prenom}, ` : ''}un profil t’intéresse… avec une différence`, texte: `Ce profil ne correspond pas à ce que tu as demandé : ${question} Tu acceptes quand même ? Réponds oui ou non dans ton espace.`, bouton: 'Répondre', lien: '/mon-espace/#interets' }).catch(() => {});
    return true;
  }
  async function avisAuto() {
    const liste = await read('/rest/v1/annonce_interets?statut=eq.a_traiter&select=id,cible_ref,reciproque,reponse,avis_qui,avis_demande_at,avis_reponse,avis_ok_demandeur,avis_ok_cible,annonces!inner(id,ref,prenom,email,user_id,status)&order=created_at.asc&limit=400').catch(() => []);
    if (!liste.length) return 0;
    const refs = [...new Set(liste.flatMap((i) => [i.annonces.ref, i.cible_ref]))];
    const lignes = await read(`/rest/v1/scores_outil?a_ref=in.(${refs.join(',')})&b_ref=in.(${refs.join(',')})&blocages=not.is.null&select=a_ref,b_ref,blocages&limit=20000`).catch(() => []);
    let n = 0;
    for (const i of liste) {
      if (i.avis_demande_at && !i.avis_reponse) continue; // déjà en attente de réponse
      const cotes = await cotesAvis(i.annonces.ref, i.cible_ref, lignes);
      const manque = avisManquants(i, cotes);
      if (!manque.length) continue;
      const qui = manque.includes('demandeur') ? 'demandeur' : 'cible';
      if (await demanderAvisAuto(i, qui, cotes[qui])) n++;
      if (n >= 60) break;
    }
    return n;
  }

  // 1. Les deux ont dit oui : mise en relation tout de suite (les deux sont prévenus, la discussion s'ouvre).
  async function miseEnRelationAuto() {
    const reg = await reglagesPilote();
    if (!reg.actif) return [];
    const liste = await read('/rest/v1/annonce_interets?statut=eq.a_traiter&or=(reciproque.eq.true,reponse.eq.oui)&select=id,cible_ref,created_at,avis_ok_demandeur,avis_ok_cible,annonces!inner(id,pause_at,ref,prenom,status,en_match,test,email,pays,user_id,live_declare,matchs_bonus)&order=created_at.asc&limit=200').catch(() => []);
    const pris = new Set(), faits = [];
    const quota = await lecteurQuotas();
    for (const i of liste) {
      const a = i.annonces;
      if (!a || a.status !== 'publiee' || a.en_match || a.pause_at || pris.has(a.ref) || pris.has(i.cible_ref)) continue;
      if (!(await refLibre(i.cible_ref))) continue;
      // Un critère pas respecté : on attend que la personne concernée ait accepté la différence.
      if (avisManquants(i, await cotesAvis(a.ref, i.cible_ref)).length) continue;
      // Plus de match disponible d'un côté ou de l'autre : la demande attend (live ou formule).
      if (!(await quota(a)).ok) continue;
      const [ca] = i.cible_ref < REF_OUTIL ? await read(`/rest/v1/annonces?ref=eq.${i.cible_ref}&select=ref,email,pays,user_id,live_declare,matchs_bonus`).catch(() => []) : await read(`/rest/v1/profils_outil?ref=eq.${i.cible_ref}&select=ref,user_id,pays,matchs_bonus`).then((l) => l.map((x) => ({ ...x, fiche: true }))).catch(() => []);
      if (ca && !(await quota(ca)).ok) continue;
      const r = await appliquerStatut(i.id, 'mis_en_relation').catch(() => ({ error: 'erreur' }));
      if (r.error) continue;
      pris.add(a.ref); pris.add(i.cible_ref);
      faits.push(`n° ${a.ref} ↔ n° ${i.cible_ref}`);
      await journaliser({ titre: `Mise en relation automatique · n° ${a.ref} ↔ n° ${i.cible_ref}`, lignes: ['Les deux ont dit oui : le site les a mis en relation (discussion de 7 jours ouverte).'], lien: '/tableau-de-bord#activite', categorie: 'reciproque' }, { call, read }).catch(() => {});
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
    const site = await read('/rest/v1/annonces?status=eq.publiee&test=eq.false&en_match=eq.false&pause_at=is.null&user_id=not.is.null&select=id,ref,prenom,genre,email,user_id,pays,live_declare,matchs_bonus').catch(() => []);
    const fiches = await read('/rest/v1/profils_outil?user_id=not.is.null&retire_at=is.null&pause_at=is.null&visible=eq.true&select=ref,user_id,pays,matchs_bonus').catch(() => []);
    const occupees = new Map();
    for (const x of await read('/rest/v1/annonce_interets?statut=eq.mis_en_relation&select=cible_ref').catch(() => [])) occupees.set(x.cible_ref, (occupees.get(x.cible_ref) || 0) + 1);
    const fichesLibres = [];
    for (const f of fiches) if (!occupees.has(f.ref) || occupees.get(f.ref) < limiteMatchs(await formuleDeProfil(f))) fichesLibres.push(f);
    const membres = new Map([...site.map((a) => [a.ref, a]), ...fichesLibres.map((f) => [f.ref, f])]);
    // Pas de nouvelle proposition à qui n'a plus de match disponible.
    const quota = await lecteurQuotas();
    for (const [ref, m] of [...membres]) if (!(await quota({ ...m, fiche: !m.id }).catch(() => ({ ok: true }))).ok) membres.delete(ref);
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
      await prevenirMembre(membre, { titre: `{A}, Lamia te propose ${n > 1 ? `${n} profils` : 'un profil'}`, texte: 'Lamia a sélectionné pour toi des profils qui te correspondent. Découvre leurs fiches (anonymes) dans ton espace et dis oui ou non : si l’autre personne dit oui aussi, vous êtes mis en relation tout de suite.', bouton: 'Voir mes propositions', lien: '/mon-espace/#propositions' }).catch(() => {});
    }
    return { propositions: nouvelles.length, personnes: touches.size };
  }
  async function piloteAuto({ proposer = false, reglages = {} } = {}) {
    const reg = await reglagesPilote();
    if (!reg.actif && !proposer) return { actif: false };
    const avis = await avisAuto().catch(() => 0);
    const relances = proposer ? await relancerIncomplets().catch(() => 0) : 0;
    const relations = await miseEnRelationAuto();
    const envoi = proposer ? await proposerEnMasse(reglages) : { propositions: 0, personnes: 0 };
    const dernier = { le: now().toISOString(), relations: relations.length, propositions: envoi.propositions, personnes: envoi.personnes, avis, relances };
    if (relations.length || envoi.propositions || proposer) await noterPilote({ dernier });
    return { actif: reg.actif, relations, avis, relances, ...envoi };
  }

  async function noterInteret(a, ref, via = 'bouton') {
    if (a.test) { const [t] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=ref,test&limit=1`).catch(() => []); if (!t?.test) return false; } // compte de test : jamais vers un vrai membre
    if (await blocageEntre({ read }, a.ref, ref)) return false; // sans rien dire : la personne bloquée ne doit pas le savoir
    const miennes = await refsDe(a);
    if (miennes.includes(ref)) return false; // sa propre fiche
    await insert('annonce_interets', { demandeur_id: a.id, cible_ref: ref, via }).catch(() => {});
    // La personne visée a une fiche du live et swipe aussi : elle a peut-être déjà choisi celle-ci.
    const profilCible = await annonceDeFiche(ref);
    const retourFiche = profilCible ? (await read(`/rest/v1/annonce_interets?demandeur_id=eq.${profilCible.id}&cible_ref=in.(${miennes.join(',')})&select=id`).catch(() => []))[0] : null;
    if (ref >= REF_OUTIL && !retourFiche) {
      // Fiche de l'outil reliée à un compte : la personne est prévenue par email (sans savoir qui).
      const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&user_id=not.is.null&select=ref,user_id,genre,interet_notifie_at`).catch(() => []);
      if (f) { const u = await compteDe(f.user_id); if (u?.email) await prevenirChoisi({ ref: f.ref, user_id: f.user_id, genre: f.genre, email: u.email, prenom: u.user_metadata?.first_name || '', interet_notifie_at: f.interet_notifie_at }, false, 'profils_outil'); }
      return false;
    }
    const [c] = retourFiche ? [profilCible] : await read(`/rest/v1/annonces?ref=eq.${ref}&status=in.(a_verifier,publiee)&select=id,ref,prenom,genre,status,email,user_id,interet_notifie_at`).catch(() => []);
    if (!c) return false;
    const [retour] = retourFiche ? [retourFiche] : await read(`/rest/v1/annonce_interets?demandeur_id=eq.${c.id}&cible_ref=in.(${miennes.join(',')})&select=id`).catch(() => []);
    if (!retour) { await prevenirChoisi(c, false); return false; }
    await prevenirChoisi(c, true);
    await prevenirChoisi(a, true);
    await patch('annonce_interets', `id=eq.${retour.id}`, { reciproque: true }).catch(() => {});
    await patch('annonce_interets', `demandeur_id=eq.${a.id}&cible_ref=eq.${ref}`, { reciproque: true }).catch(() => {});
    // Pilote automatique : mise en relation tout de suite si les deux profils sont validés et libres.
    const faits = await miseEnRelationAuto().catch(() => []);
    if (!faits.length) await alerter({ titre: `Intérêt réciproque · n° ${a.ref} ↔ n° ${c.ref}`, lignes: [`${a.prenom} (n° ${a.ref}) et ${c.prenom} (n° ${c.ref}) se sont choisis l’un l’autre.`, [a, c].every((x) => x.status === 'publiee') ? 'Les deux profils sont vérifiés.' : 'Un des deux profils n’est pas encore vérifié : la mise en relation se fera dès qu’il sera validé.'], lien: '/tableau-de-bord#activite', tag: 'reciproque' }).catch(() => {});
    return true;
  }
  // Swipe : profils de l'autre genre, pas encore vus (ni choisis ni passés).
  // Le genre du membre connecté (son annonce, sinon sa fiche du live), pour ouvrir les profils sur l'autre genre.
  // Test Google Play : un membre sur Android demande à être testeur (son accord, son adresse de compte).
  if (action === 'testeur_play') {
    if (!user?.email) return json({ error: 'login_required' }, 401);
    const deja = (await read(`/rest/v1/testeurs_play?user_id=eq.${user.id}&select=user_id`).catch(() => [])).length > 0;
    await call('/rest/v1/testeurs_play?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: user.id, email: String(user.email).toLowerCase(), appli_installee: b.installee === true }) });
    // Lamia est prévenue de chaque nouveau « Oui » ; elle le retrouve dans Confidences > Testeurs Play.
    if (!deja && alerter) {
      const [a] = await read(`/rest/v1/annonces?user_id=eq.${user.id}&select=ref,prenom&limit=1`).catch(() => []);
      await alerter({ titre: `Nouveau testeur Google Play${a?.prenom ? ` : ${a.prenom}` : ''}`, lignes: [a?.ref ? `Profil ${a.ref} · ${String(user.email).toLowerCase()}` : String(user.email).toLowerCase(), 'Il sera ajouté à la liste Google Play demain matin, puis recevra le lien dans sa conversation.'], lien: '/confidences-lamia/#testeurs', tag: 'testeur' }).catch(() => {});
    }
    return json({ ok: true });
  }
  if (action === 'mon_genre') {
    if (!user) return json({ error: 'login_required' }, 401);
    const [a] = await read(`/rest/v1/annonces?user_id=eq.${user.id}&select=genre&order=created_at.desc&limit=1`).catch(() => []);
    const [o] = a ? [] : await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&retire_at=is.null&select=genre&limit=1`).catch(() => []);
    return json({ ok: true, genre: a?.genre || o?.genre || null });
  }
  if (action === 'annonce_swipe_liste') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await profilOuFicheLive();
    if (!a) {
      // Fiche créée en live pas encore confirmée, ou incomplète : ne pas lui demander de refaire un profil.
      const [fiche] = await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&retire_at=is.null&select=ref,confirme_at&limit=1`).catch(() => []);
      if (!fiche) {
        // Modérateur sans annonce : il lit les annonces, mais sans profil il ne swipe pas et ne matche pas.
        const [off] = await read(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(String(user.email || '').toLowerCase())}&raison=eq.moderateur&select=email`).catch(() => []);
        if (off) return json({ error: 'moderateur_sans_annonce' }, 404);
      }
      // Fiche à confirmer : on donne directement son lien, pour la confirmer en un geste.
      return json({ error: !fiche ? 'pas_de_profil' : fiche.confirme_at ? 'fiche_live' : 'fiche_a_confirmer', lien: fiche && !fiche.confirme_at ? `https://lamia-femme-berbere.com/rencontres/confirmer/?n=${fiche.ref}&t=${jetonAnnonce(env, `outil-${fiche.ref}`, 'confirmer')}` : undefined }, 404);
    }
    if (a.pause_at) return json({ error: 'annonce_en_pause' }, 409);
    if (await manqueMedias(a)) return json({ error: 'photos_requises' }, 403);
    const [deja, passes] = await Promise.all([
      read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&select=cible_ref`).catch(() => []),
      read(`/rest/v1/annonce_passes?demandeur_id=eq.${a.id}&select=cible_ref`).catch(() => []),
    ]);
    // Jamais proposés : soi-même, les profils déjà choisis et les blocages. Les profils passés reviennent en fin de pile.
    const vus = new Set([a.ref, ...deja.map((x) => x.cible_ref), ...(await refsDe(a)), ...(await refsCachees({ read }, await refsDe(a)))]);
    const dejaPasses = new Set(passes.map((x) => x.cible_ref));
    const autre = a.genre === 'femme' ? 'homme' : 'femme';
    // Un compte de test ne voit que les profils de test : il ne doit jamais déranger un vrai membre.
    let profils = (a.test ? await listePublique({ tests: true }) : await listePublique()).filter((p) => p.genre === autre && !vus.has(p.ref));
    const f = await maFormule(), choisi = await quiMaChoisi(a), faits = await swipesDuJour(a);
    const voitChoix = Boolean(f.quiMaChoisi || (await passQuiChoisi()));
    const moi = { age: ageAu(a.birth_date, now()), age_min: a.age_min, age_max: a.age_max, pays: a.pays, secteur: a.matching?.zoneGeo || '' };
    // Les plus compatibles d'abord : ceux qui me cherchent aussi, puis le score de l'outil de Lamia (celui de la fiche du live aussi), sinon le potentiel calculé ici.
    { const refs = await refsDe(a);
      const so = await read(`/rest/v1/scores_outil?or=(a_ref.in.(${refs.join(',')}),b_ref.in.(${refs.join(',')}))&select=a_ref,b_ref,score&order=score.desc&limit=3000`).catch(() => []);
      const sc = new Map();
      for (const r of so) { const k = refs.includes(r.a_ref) ? r.b_ref : r.a_ref; if (!sc.has(k)) sc.set(k, r.score); }
      const A = fichePotentiel(a, { age: moi.age });
      const noter = (p) => { try { return sc.get(p.ref) ?? potentiel(A, fichePotentiel(p, { outil: true })).score; } catch { return -1; } };
            // D'abord les personnes qui ont un compte : elles seules peuvent répondre tout de suite.
      const [ca, cf] = await Promise.all([read('/rest/v1/annonces?user_id=not.is.null&select=ref&limit=5000').catch(() => []), read('/rest/v1/profils_outil?user_id=not.is.null&select=ref&limit=5000').catch(() => [])]);
      const avecCompte = new Set([...ca, ...cf].map((x) => x.ref));
      profils = profils.map((p, i) => ({ p, i, c: avecCompte.has(p.ref) ? 1 : 0, m: ageEtLieuOk(moi, p) ? 1 : 0, s: noter(p) })).sort((x, y) => y.c - x.c || y.m - x.m || y.s - x.s || x.i - y.i).map((x) => x.p);
      // Le swipe ne s'arrête jamais. D'abord les profils jamais vus dans ses critères (âge et localisation), puis ceux hors critères,
      // puis les profils déjà passés, dans un ordre mélangé pour que chaque tour soit différent.
      const c = new Set(voitChoix ? choisi : []);
      const danslesCriteres = (p) => c.has(p.ref) || dansMesCriteres(moi, p);
      const melange = (l) => { const m = [...l]; for (let i = m.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [m[i], m[j]] = [m[j], m[i]]; } return m; };
      const jamaisVus = profils.filter((p) => !dejaPasses.has(p.ref)), revus = profils.filter((p) => dejaPasses.has(p.ref));
      const marquer = (l, extra) => l.map((p) => ({ ...p, ...extra }));
      profils = [
        ...jamaisVus.filter(danslesCriteres),
        ...marquer(jamaisVus.filter((p) => !danslesCriteres(p)), { hors_criteres: true }),
        ...marquer(melange(revus.filter(danslesCriteres)), { revu: true }),
        ...marquer(melange(revus.filter((p) => !danslesCriteres(p))), { revu: true, hors_criteres: true }),
      ]; }
    // Profils mis en avant (service payant) : d'abord, parmi les profils jamais vus qui correspondent aux critères.
    { const av = (p) => p.en_avant && !p.revu && !p.hors_criteres; profils = [...profils.filter(av), ...profils.filter((p) => !av(p))]; }
    // « Qui m'a choisi·e » (Passion, Prestige, ou acheté pour 24 heures) : ces profils passent en tête, marqués. Sinon : seulement leur nombre.
    if (voitChoix) { const c = new Set(choisi); profils = [...profils.filter((p) => c.has(p.ref)).map((p) => ({ ...p, ta_choisi: true })), ...profils.filter((p) => !c.has(p.ref))]; }
    // Cœurs avec message : payés par l'autre, ils passent en tête pour tout le monde, la phrase affichée.
    { const coeurs = await read(`/rest/v1/annonce_interets?cible_ref=in.(${(await refsDe(a)).join(',')})&message=not.is.null&statut=eq.a_traiter&select=message,annonces!inner(ref)&order=message_at.desc&limit=50`).catch(() => []);
      const mots = new Map(coeurs.filter((c) => c.annonces?.ref).map((c) => [c.annonces.ref, c.message]));
      if (mots.size) profils = [...profils.filter((p) => mots.has(p.ref)).map((p) => ({ ...p, ta_choisi: true, coeur_message: mots.get(p.ref) })), ...profils.filter((p) => !mots.has(p.ref))]; }
    const credits = user.email ? (await etatAbonnement(user.email, { env }).catch(() => ({}))).unites?.coeur_message || 0 : 0;
    const restants = f.swipesJour ? Math.max(0, f.swipesJour - faits) : null;
    const matchs = { actifs: await matchsEnCours(a), limite: limiteMatchs(f, a), formule: f.id };
    const mc = a.matching || {};
    const criteres = { age_min: a.age_min || null, age_max: a.age_max || null, religion: mc.religionRecherche && mc.religionRecherche !== 'Pas important' ? mc.religionRecherche : '', pratique: mc.pratiqueRecherche && mc.pratiqueRecherche !== 'Pas important' ? mc.pratiqueRecherche : '' };
    return json({ ok: true, profils, criteres, adresse: adresse(a.genre, a.prenom || user.user_metadata?.first_name), genre: autre, formule: f.id, algerie: enAlgerie(a), quota: { limite: f.swipesJour, restants }, choisi: { nombre: choisi.length, refs: voitChoix ? choisi : [] }, matchs, coeurs_message: credits });
  }
  if (action === 'annonce_swipe') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await profilOuFicheLive();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0) || ref === a.ref || !['oui', 'non'].includes(b.choix)) return json({ error: 'bad_request' }, 400);
    const f = await maFormule();
    if (b.choix === 'oui' && a.pause_at) return json({ error: 'annonce_en_pause' }, 409);
    if (b.choix === 'oui' && await manqueMedias(a)) return json({ error: 'photos_requises' }, 403);
    if (b.choix === 'non') { await insert('annonce_passes', { demandeur_id: a.id, cible_ref: ref }).catch(() => {}); return json({ ok: true }); }
    const actifs = await matchsEnCours(a), limite = limiteMatchs(f, a);
    if (actifs >= limite) return json({ error: 'limite_matchs', actifs, limite, formule: f.id }, 409);
    { const q = await (await lecteurQuotas())(a, user?.app_metadata?.role === 'admin' ? f : null); if (!q.ok) return json({ error: 'quota_matchs', formule: q.formule, algerie: enAlgerie(a) }, 409); }
    // Cœur avec message (2 €) : un crédit acheté est décompté, la phrase part avec le cœur, sans contact possible.
    let coeur = null, mot = '';
    if (b.message !== undefined && b.message !== null) {
      mot = sansContact(clean(b.message, 200));
      if (mot.length < 2) return json({ error: 'message_vide' }, 400);
      coeur = await consommerUnite(user.email, 'coeur_message', { env }).catch(() => null);
      if (!coeur) return json({ error: 'coeur_requis' }, 402);
    }
    const match = await noterInteret(a, ref, 'swipe');
    if (coeur) {
      const r = await patch('annonce_interets', `demandeur_id=eq.${a.id}&cible_ref=eq.${ref}`, { message: mot, message_at: now().toISOString() }).then(() => true).catch(() => false);
      if (!r) await rendreUnite(coeur, { env }).catch(() => {});
    }
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
    if (b.tester) await pousserMembre(user.id, { titre: 'Notifications activées', texte: '{A}, tu seras prévenu{e} ici dès qu’une personne s’intéresse à toi ou que Lamia te trouve un match.' });
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
    const a = await profilOuFicheLive();
    if (!a) return json({ error: 'pas_de_profil' }, 404);
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0) || ref === a.ref) return json({ error: 'bad_request' }, 400);
    if (a.pause_at) return json({ error: 'annonce_en_pause' }, 409);
    if (await manqueMedias(a)) return json({ error: 'photos_requises' }, 403);
    { const f = await maFormule(), actifs = await matchsEnCours(a), limite = limiteMatchs(f, a); if (actifs >= limite) return json({ error: 'limite_matchs', actifs, limite, formule: f.id }, 409); const q = await (await lecteurQuotas())(a, user?.app_metadata?.role === 'admin' ? f : null); if (!q.ok) return json({ error: 'quota_matchs', formule: q.formule, algerie: enAlgerie(a) }, 409); }
    if (await noterInteret(a, ref)) return json({ ok: true, match: true });
    await alerter({ titre: `Match demandé · n° ${a.ref} → n° ${ref}`, lignes: [`${a.prenom} s’intéresse au profil n° ${ref}`, a.status === 'publiee' ? 'Profil déjà vérifié' : 'Profil pas encore vérifié'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true });
  }
  // Mettre fin à un match en cours : la personne peut de nouveau matcher.
  if (action === 'annonce_dematcher') {
    if (!user) return json({ error: 'login_required' }, 401);
    const a = await monProfil();
    if (!a) return json({ ok: true });
    const avec = Number.parseInt(b.ref, 10);
    if (!Number.isInteger(avec) && !a.en_match) return json({ ok: true });
    // Une discussion est ouverte : le dématch passe par elle, pour se dire au revoir.
    if (Number.isInteger(avec)) {
      const ouvertes = await read(`/rest/v1/discussions?or=(a_user.eq.${user.id},b_user.eq.${user.id})&close_raison=is.null&select=id,a_ref,b_ref,ferme_at&limit=10`).catch(() => []);
      if (ouvertes.some((d) => [d.a_ref, d.b_ref].includes(avec) && new Date(d.ferme_at) > now())) return json({ error: 'dematch_dans_discussion' }, 409);
    }
    await finirMatch(a, Number.isInteger(avec) && avec > 0 ? { refs: [avec] } : {});
    await alerter({ titre: `Dématch · profil n° ${a.ref}`, lignes: [`${a.prenom} a mis fin à un match en cours depuis son espace${Number.isInteger(avec) ? ` (avec le n° ${avec})` : ''}.`, 'Son profil a de nouveau une place pour matcher.'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
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
      // Validé et d'accord pour l'affichage anonyme : l'annonce paraît tout de suite, sauf si une fiche la représente déjà.
      const ficheVisible = a.user_id ? (await read(`/rest/v1/profils_outil?user_id=eq.${a.user_id}&visible=eq.true&select=ref&limit=1`).catch(() => [])).length > 0 : false;
      const afficher = a.anonyme_ok === true && !a.test && !a.fiche_ref && !a.outil_id && !ficheVisible;
      await patch('annonces', `id=eq.${id}`, { status: 'publiee', ...(afficher ? { visible_anonyme: true } : {}), published_at: a.published_at || now().toISOString(), identite_verifiee_at: avecPiece ? a.identite_verifiee_at || now().toISOString() : null, note_lamia: note });
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
    await alerter({ titre: `Profil n° ${a.ref} validé automatiquement`, lignes: [`${a.prenom} : photo, email et ${a.phone ? 'téléphone' : 'lien de réseau'} vérifiés.`, f.some((x) => x.kind === 'identite') ? 'Une pièce d’identité a été envoyée : regarde-la quand tu peux (badge « pièce d’identité » à donner).' : ''].filter(Boolean), lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
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
    await avisAuto().catch(() => 0);
    await miseEnRelationAuto().catch(() => []);
    // Les profils à vérifier arrivent aussi dans l'outil, pour que Lamia teste leur potentiel avant de valider (sans pièce d'identité).
    const list = await read('/rest/v1/annonces?status=in.(a_verifier,publiee)&test=eq.false&select=*&order=submitted_at.desc&limit=500');
    const ids = list.map((a) => a.id);
    const files = ids.length ? await read(`/rest/v1/annonce_files?annonce_id=in.(${ids.join(',')})&kind=neq.identite&select=annonce_id,kind,mime,storage_path,position`) : [];
    const urls = await liensLecture(files, 3600);
    const interets = ids.length ? await read(`/rest/v1/annonce_interets?select=id,demandeur_id,cible_ref,statut,created_at,reciproque,via,reponse,accord_demande_at,avis_qui,avis_demande_at,avis_reponse,avis_ok_demandeur,avis_ok_cible,annule_motif&order=created_at.desc&limit=500`) : [];
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
    const demandes = interets.filter((i) => refDe[i.demandeur_id]).map((i) => ({ id: i.id, demandeur: `site-annonce-${refDe[i.demandeur_id]}`, cible: outil[i.cible_ref] || `site-annonce-${i.cible_ref}`, statut: i.statut, created_at: i.created_at, reciproque: Boolean(i.reciproque), via: i.via || '', reponse: i.reponse || null, accord_demande_at: i.accord_demande_at || null, avis_qui: i.avis_qui || null, avis_demande_at: i.avis_demande_at || null, avis_reponse: i.avis_reponse || null, avis_ok_demandeur: Boolean(i.avis_ok_demandeur), avis_ok_cible: Boolean(i.avis_ok_cible), annule_motif: i.annule_motif || null, demandeur_ref: refDe[i.demandeur_id], cible_ref: i.cible_ref, verifie: list.find((a) => a.id === i.demandeur_id)?.status === 'publiee', demandeur_compte: Boolean(list.find((a) => a.id === i.demandeur_id)?.user_id), ...etatCible(i.cible_ref) }));
    if (ids.length) await patch('annonces', `id=in.(${ids.join(',')})&exportee_at=is.null`, { exportee_at: now().toISOString() });
    const enAttente = await read('/rest/v1/annonces?status=eq.a_verifier&select=ref').catch(() => []);
    // Réponses des personnes à qui Lamia a envoyé leur fiche : confirmée, à modifier, refusée (retirée) ou effacement demandé.
    const reps = await read('/rest/v1/profils_outil?select=outil_id,confirme_at,retire_at,modif_at,modif_demandee,effacement_at,effacement_fait_at,corrections').catch(() => []);
    const confirmations = {}, modifications = {}, corrections = {};
    for (const x of reps) {
      if (x.effacement_fait_at) continue;
      confirmations[x.outil_id] = x.effacement_at ? 'effacement' : x.retire_at ? 'retiree' : x.confirme_at ? 'confirmee' : x.modif_at ? 'a_modifier' : 'en_attente';
      if (x.modif_at && !x.confirme_at && !x.retire_at) modifications[x.outil_id] = x.modif_demandee || '';
      if (x.corrections && Object.keys(x.corrections).length && !x.retire_at) corrections[x.outil_id] = x.corrections;
    }
    return json({ ok: true, profiles, demandes, a_verifier: enAttente.map((x) => x.ref), confirmations, modifications, corrections });
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
      await offrirSiModerateur({ read, call, insert }, ref, user.email).catch(() => {});
      await alerter({ titre: `Fiche n° ${ref} reliée à un compte`, lignes: [`La personne a créé son accès (${user.email}) : elle suit sa fiche et les intérêts reçus dans son espace.`], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    return json({ ok: true, ref });
  }
  // Intérêts reçus : la personne choisie voit la fiche ANONYME de celle qui s'intéresse à elle (comme dans les profils du site)
  // et répond oui (c'est réciproque : Lamia est prévenue) ou non. Jamais de prénom, de photo ni de contact.
  const ficheAnonymeDe = (a) => ({ ref: a.ref, genre: a.genre, age: ageAu(a.birth_date, now()), ville: a.ville, pays: a.pays, situation: a.situation, profil: sansContact(a.profil || ''), recherche: sansContact(a.recherche || ''), age_min: a.age_min, age_max: a.age_max, origine: a.matching?.origineTags || [], caracteristiques: a.matching?.caracteristiques || [], religion: a.matching?.religion || '', metier: sansContact(clean(a.matching?.profession, 80)) || '', secteur: sansContact(clean([a.matching?.zoneGeo, a.matching?.paysRechercheDetail, a.matching?.regionRechercheDetail].filter(Boolean).join(' · '), 120)) || null });
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
    const caches = await refsCachees({ read }, refs);
    for (const x of liste) { if (caches.has(x.cible_ref)) continue; const fiche = await ficheParRef(x.cible_ref); if (fiche) out.push({ id: x.id, pour: x.pour_ref, le: x.created_at, message: x.message, reponse: x.reponse, fiche }); }
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
    await alerter({ titre: b.reponse === 'oui' ? `${reciproque ? '' : ''} Proposition acceptée · n° ${x.pour_ref} → n° ${x.cible_ref}` : `Proposition refusée · n° ${x.pour_ref} → n° ${x.cible_ref}`, lignes: [b.reponse === 'oui' ? (reciproque ? 'Les deux ont dit oui : fais la mise en relation.' : 'La personne est intéressée par le profil que tu lui as proposé.') : 'La personne ne souhaite pas ce profil.'], lien: '/confidences-lamia/#annonces', tag: 'proposition' }).catch(() => {});
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
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,demandeur_id,statut,reciproque,reponse,avis_qui,avis_reponse,avis_ok_demandeur,avis_ok_cible,annonces!inner(id,ref,prenom,email,status,user_id)`).catch(() => []);
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
    const caches = await refsCachees({ read }, refs);
    return json({ ok: true, interets: recus.filter((i) => i.annonces && ['a_verifier', 'publiee'].includes(i.annonces.status) && !caches.has(i.annonces.ref)).map((i) => ({ id: i.id, pour: i.cible_ref, le: i.created_at, statut: i.statut, reponse: i.reponse || (i.reciproque ? 'oui' : null), fiche: ficheAnonymeDe(i.annonces) })) });
  }
  if (action === 'annonce_repondre_interet') {
    if (!user) return json({ error: 'login_required' }, 401);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['oui', 'non'].includes(b.reponse)) return json({ error: 'bad_request' }, 400);
    const refs = await mesRefs();
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,demandeur_id,statut,accord_demande_at,annonces!inner(id,ref,prenom,email,status)`).catch(() => []);
    if (!i || !refs.includes(i.cible_ref)) return json({ error: 'not_found' }, 404);
    if (b.reponse === 'oui') { const moi = await profilOuFicheLive(); if (moi?.pause_at) return json({ error: 'annonce_en_pause' }, 409); if (moi && await manqueMedias(moi)) return json({ error: 'photos_requises' }, 403); }
    await patch('annonce_interets', `id=eq.${id}`, { reponse: b.reponse, repondu_at: now().toISOString(), ...(b.reponse === 'oui' ? { reciproque: true } : {}) });
    if (i.accord_demande_at && i.statut === 'a_traiter') return json({ ok: true, reponse: b.reponse, ...(await conclureAccord(i, b.reponse)) });
    // « Pas pour moi » : la demande sort de la liste « À matcher » de Lamia (le demandeur le voit dans ses demandes) ; ses autres choix en réserve reviennent.
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
      await alerter({ titre: `Intérêt réciproque · n° ${d.ref} ↔ n° ${i.cible_ref}`, lignes: [`La personne du profil n° ${i.cible_ref} a répondu OUI à l’intérêt du profil n° ${d.ref} (${d.prenom}).`, 'Teste-les dans ton outil, puis fais la mise en relation.'], lien: '/confidences-lamia/#annonces', tag: 'reciproque' }).catch(() => {});
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
  // Ce que la personne a le droit de changer dans sa fiche : tout, sauf le genre et le numéro.
  const corrigerFiche = (p, f) => {
    if (!f || typeof f !== 'object') return { erreur: 'fiche_requise' };
    const a = (k) => Object.prototype.hasOwnProperty.call(f, k);
    const v = {};
    const liste = (k, choix) => { if (!a(k)) return; const x = clean(f[k], 80); if (x === '') v[k] = null; else if (choix.includes(x) || x === p[k]) v[k] = x; };
    const texte = (k, max) => { if (a(k)) v[k] = sansContact(clean(f[k], max)) || null; };
    if (a('age')) { const n = entier(f.age, 18, 99); if (!n) return { erreur: 'age_invalide' }; v.age = n; }
    liste('pays', O.pays); liste('situation', O.situation); liste('enfants', O.enfants);
    liste('etudes', [...O.etudeCategorie, ...Object.values(O.etudeDetail).flat()]);
    liste('religion', O.religion); liste('pratique', O.pratique);
    texte('ville', 60); texte('village', 60); texte('secteur', 120); texte('metier', 80);
    for (const k of ['profil', 'recherche']) if (a(k)) { const x = sansContact(clean(f[k], 700)); if (x.length >= 3) v[k] = x; }
    if (a('age_min')) v.age_min = entier(f.age_min, 18, 99);
    if (a('age_max')) v.age_max = entier(f.age_max, 18, 99);
    const min = 'age_min' in v ? v.age_min : p.age_min, max = 'age_max' in v ? v.age_max : p.age_max;
    if (min && max && min > max) { v.age_min = max; v.age_max = min; }
    const champs = Object.fromEntries(Object.entries(v).filter(([k, x]) => (x ?? null) !== (p[k] ?? null)));
    return { champs };
  };
  const annonceDepuisFiche = (f, matching, t) => ({
    ville: clean(f.ville, 80), pays: clean(f.pays, 60), profil: sansContact(clean(f.profil, 1500)), recherche: sansContact(clean(f.recherche, 1500)),
    age_min: f.age_min >= 18 && f.age_min <= 99 ? f.age_min : null, age_max: f.age_max >= 18 && f.age_max <= 99 ? f.age_max : null,
    situation: clean(f.situation, 40) || null, ...(f.age >= 18 ? { birth_date: `${t.getUTCFullYear() - f.age}-01-01` } : {}),
    matching: { ...(matching || {}), religion: f.religion || '', pratique: f.pratique || '', profession: f.metier || '', enfants: f.enfants || '', niveauEtudeCategorie: f.etudes || '', zoneGeo: f.secteur || '' },
    modifiee_at: t.toISOString(),
  });
  // L'outil vient de republier : les corrections faites par les personnes repassent par-dessus.
  const remettreCorrections = async (filtre) => {
    const l = await read(`/rest/v1/profils_outil?corrige_at=not.is.null${filtre}&select=ref,outil_id,corrections`).catch(() => []);
    const utiles = l.filter((x) => x.corrections && Object.keys(x.corrections).length);
    for (let i = 0; i < utiles.length; i += 20) await Promise.all(utiles.slice(i, i + 20).map((x) => patch('profils_outil', `ref=eq.${x.ref}`, x.corrections).catch(() => {})));
    return Object.fromEntries(utiles.map((x) => [x.outil_id, x.corrections]));
  };
  if (['annonce_fiche_outil', 'annonce_confirmer_outil', 'annonce_retirer_outil', 'annonce_modifier_outil', 'annonce_effacer_outil'].includes(action)) {
    const ref = Number.parseInt(b.n, 10);
    if (!(ref >= REF_OUTIL) || !jetonAnnonceValide(env, `outil-${ref}`, b.t, 'confirmer')) return json({ error: 'lien_invalide' }, 403);
    const [p] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=ref,outil_id,genre,age,ville,village,pays,secteur,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max,religion,pratique,metier,corrections,confirme_at,retire_at,modif_at,effacement_at,user_id`).catch(() => []);
    if (!p) return json({ error: 'lien_invalide' }, 404);
    let corrige = false;
    if (action === 'annonce_confirmer_outil' && !p.confirme_at && !p.retire_at) {
      p.confirme_at = now().toISOString();
      await patch('profils_outil', `ref=eq.${ref}`, { confirme_at: p.confirme_at });
      await alerter({ titre: `Fiche n° ${ref} confirmée`, lignes: [`${p.genre === 'femme' ? 'Une femme' : 'Un homme'}${p.age ? ` de ${p.age} ans` : ''} a confirmé sa fiche : elle porte maintenant la mention « confirmé » sur le site.`], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    if (action === 'annonce_retirer_outil' && !p.retire_at) {
      p.retire_at = now().toISOString();
      await patch('profils_outil', `ref=eq.${ref}`, { retire_at: p.retire_at, visible: false });
      await patch('annonces', `fiche_ref=eq.${ref}`, { status: 'retiree', visible_anonyme: false, en_match: false }).catch(() => {});
      await alerter({ titre: `Fiche n° ${ref} retirée par la personne`, lignes: ['Elle ne veut plus apparaître sur le site. Sa fiche reste dans ton outil.'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    // « Modifier ma fiche » : la personne corrige tout elle-même, c'est enregistré tout de suite. Lamia n'a rien à faire.
    // Ses corrections sont gardées à part : si l'outil republie la fiche, elles sont remises par-dessus.
    if (action === 'annonce_modifier_outil') {
      if (p.retire_at || p.effacement_at) return json({ error: 'fiche_retiree' }, 400);
      const c = corrigerFiche(p, b.fiche);
      if (c.erreur) return json({ error: c.erreur }, 400);
      if (Object.keys(c.champs).length || p.modif_at) {
        const corrections = { ...(p.corrections || {}), ...c.champs };
        await patch('profils_outil', `ref=eq.${ref}`, { ...c.champs, corrections, corrige_at: now().toISOString(), modif_demandee: null, modif_at: null });
        Object.assign(p, c.champs, { corrections, modif_at: null });
        // Le profil interne qui sert au swipe suit la fiche.
        const [a] = await read(`/rest/v1/annonces?fiche_ref=eq.${ref}&select=id,matching&limit=1`).catch(() => []);
        if (a) await patch('annonces', `id=eq.${a.id}`, annonceDepuisFiche(p, a.matching, now())).catch(() => {});
      }
      corrige = true;
    }
    // « Je ne veux plus être dans l'outil de Lamia » : retirée du site tout de suite, et Lamia doit effacer la fiche de son outil.
    if (action === 'annonce_effacer_outil' && !p.effacement_at) {
      p.effacement_at = now().toISOString(); p.retire_at = p.retire_at || p.effacement_at;
      await patch('profils_outil', `ref=eq.${ref}`, { effacement_at: p.effacement_at, retire_at: p.retire_at, visible: false });
      await alerter({ titre: `Fiche n° ${ref} : demande d’effacement`, lignes: ['La personne ne veut plus du tout être dans ton outil. Sa fiche est retirée du site.', 'Supprime-la de ton outil de matching (droit à l’effacement).'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    }
    const { confirme_at: c, retire_at: r, modif_at: m, effacement_at: e, user_id: u, corrections: _corr, ...f } = p;
    // Les personnes qui ont choisi cette fiche : leur annonce anonyme, pour donner envie de confirmer et de répondre.
    let interets = [];
    if (!r && !e) {
      const recus = await read(`/rest/v1/annonce_interets?cible_ref=eq.${ref}&statut=eq.a_traiter&select=created_at,annonces!inner(ref,genre,birth_date,ville,pays,situation,profil,recherche,age_min,age_max,matching,status)&order=created_at.desc&limit=20`).catch(() => []);
      const caches = await refsCachees({ read }, [ref]).catch(() => new Set());
      interets = recus.filter((i) => i.annonces && ['a_verifier', 'publiee'].includes(i.annonces.status) && !caches.has(i.annonces.ref)).map((i) => ficheAnonymeDe(i.annonces));
    }
    return json({ ok: true, fiche: { ...f, profil: sansContact(f.profil), recherche: sansContact(f.recherche) }, confirme: Boolean(c), retire: Boolean(r), modif: Boolean(m) && !c, efface: Boolean(e), compte: Boolean(u), corrige, interets });
  }
  // Une fiche de l'outil, anonyme, prête à être enregistrée sur le site.
  const ligneFiche = (p, t) => ({
      outil_id: clean(p?.outil_id, 80), genre: p?.genre === 'femme' || p?.genre === 'homme' ? p.genre : '', age: entier(p?.age, 18, 99),
      pays: clean(p?.pays, 60) || null, ville: sansContact(clean(p?.ville, 60)) || null, village: sansContact(clean(p?.village, 60)) || null, secteur: sansContact(clean(p?.secteur, 120)) || null, situation: clean(p?.situation, 60) || null, enfants: clean(p?.enfants, 10) || null, etudes: clean(p?.etudes, 80) || null,
      origine: tableau(p?.origine, 6).length ? tableau(p?.origine, 6) : ['Kabyle (Algerie)'], caracteristiques: tableau(p?.caracteristiques), profil: sansContact(clean(p?.profil, 700)), recherche: sansContact(clean(p?.recherche, 700)),
      age_min: entier(p?.age_min, 18, 99), age_max: entier(p?.age_max, 18, 99), visible: true, updated_at: t,
      metier: sansContact(clean(p?.metier || p?.profession, 80)) || null,
      religion: O.religion.includes(p?.religion) ? p.religion : null, pratique: O.pratique.includes(p?.pratique) ? p.pratique : null,
      religion_recherche: O.religionRecherche.includes(p?.religion_recherche) ? p.religion_recherche : null, pratique_recherche: O.pratiqueRecherche.includes(p?.pratique_recherche) ? p.pratique_recherche : null, mode_vie: (Array.isArray(p?.mode_vie) ? p.mode_vie : []).filter((x) => [...O.fumeur, ...O.sport, ...O.alcool, ...O.chemma].includes(x)).slice(0, 6),
  });
  // Pendant le live : une seule fiche, créée ou mise à jour tout de suite, sans toucher aux autres. Lamia reçoit son lien personnel.
  if (action === 'outil_fiche_live') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const r = ligneFiche(b.profil, now().toISOString());
    if (!r.outil_id || !r.genre || /^site-annonce-/.test(r.outil_id)) return json({ error: 'bad_request' }, 400);
    const u = await call('/rest/v1/profils_outil?on_conflict=outil_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([r]) });
    if (!u.ok) return json({ error: 'temporary_failure' }, 502);
    await patch('profils_outil', `outil_id=eq.${encodeURIComponent(r.outil_id)}&retire_at=not.is.null`, { visible: false });
    await remettreCorrections(`&outil_id=eq.${encodeURIComponent(r.outil_id)}`);
    const [x] = await read(`/rest/v1/profils_outil?outil_id=eq.${encodeURIComponent(r.outil_id)}&select=ref,confirme_at,retire_at,modif_at,effacement_at`);
    if (!x) return json({ error: 'temporary_failure' }, 502);
    return json({ ok: true, ref: x.ref, lien: lienFiche(x.ref), confirmation: x.effacement_at ? 'effacement' : x.retire_at ? 'retiree' : x.confirme_at ? 'confirmee' : x.modif_at ? 'a_modifier' : 'en_attente' });
  }
  if (action === 'outil_publier') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    if (!Array.isArray(b.profils)) return json({ error: 'bad_request' }, 400);
    const t = now().toISOString();
    const rows = b.profils.slice(0, 600).map((p) => ligneFiche(p, t)).filter((r) => r.outil_id && r.genre);
    // Profils déposés sur le site (site-annonce-N) : ils reviennent dans le Patio sous leur propre numéro,
    // avec leurs propres textes, seulement s'ils sont validés et si la personne a accepté l'affichage anonyme.
    const SITE = /^site-annonce-(\d+)$/;
    const refsListe = rows.map((r) => r.outil_id.match(SITE)?.[1]).filter(Boolean).map(Number);
    // Une annonce fusionnée avec une fiche publiée ne revient pas : on ne montre pas deux fois la même personne.
    const fichesPubliees = new Set(rows.map((r) => r.outil_id).filter((x) => !SITE.test(x)));
    const liees = refsListe.length ? await read(`/rest/v1/annonces?ref=in.(${refsListe.join(',')})&select=ref,outil_id,user_id`).catch(() => []) : [];
    const avecCompte = await read('/rest/v1/profils_outil?user_id=not.is.null&select=user_id,outil_id').catch(() => []);
    const comptesFiche = new Set(avecCompte.filter((f) => fichesPubliees.has(f.outil_id)).map((f) => f.user_id));
    const doublons = new Set(liees.filter((x) => (x.outil_id && fichesPubliees.has(x.outil_id)) || (x.user_id && comptesFiche.has(x.user_id))).map((x) => x.ref));
    const refsSite = refsListe.filter((r) => !doublons.has(r));
    // Seules les annonces déjà connues de l'outil en sortent : une nouvelle annonce pas encore récupérée reste affichée.
    // L'outil dit lesquelles retirer (décochées, bloquées, closes). Une annonce validée sur le site n'a pas à repasser ses critères de live.
    const aRetirer = Array.isArray(b.retires_site) ? b.retires_site.map((x) => String(x).match(SITE)?.[1]).filter(Boolean).map(Number).filter((r) => !refsSite.includes(r)) : null;
    if (aRetirer) { const liste = [...aRetirer, ...doublons]; if (liste.length) await patch('annonces', `visible_anonyme=eq.true&ref=in.(${liste.join(',')})`, { visible_anonyme: false }); }
    else await patch('annonces', `visible_anonyme=eq.true&exportee_at=not.is.null${refsSite.length ? `&ref=not.in.(${refsSite.join(',')})` : ''}`, { visible_anonyme: false });
    if (refsSite.length) await patch('annonces', `ref=in.(${refsSite.join(',')})&status=eq.publiee&anonyme_ok=eq.true`, { visible_anonyme: true });
    const [{ count: nSite } = {}] = refsSite.length ? await read(`/rest/v1/annonces?ref=in.(${refsSite.join(',')})&status=eq.publiee&anonyme_ok=eq.true&select=count`).catch(() => [{}]) : [{ count: 0 }];
    rows.splice(0, rows.length, ...rows.filter((r) => !SITE.test(r.outil_id)));
    if (rows.length) await call('/rest/v1/profils_outil?on_conflict=outil_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    // Ce que les personnes ont corrigé elles-mêmes reste : l'outil le reçoit pour se mettre à jour.
    const corrections = await remettreCorrections('');
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
      corrections: Object.fromEntries(Object.entries(corrections).filter(([id]) => garde.has(id))),
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
    if (cible) await prevenirMembre(cible, { titre: `{A}, quelqu’un t’a choisi{e}`, texte: 'Lamia a regardé vos deux profils et pense que vous pourriez bien vous entendre. Découvre sa fiche (anonyme) dans ton espace et réponds oui ou non : si tu dis oui, Lamia vous met en relation.', bouton: 'Répondre', lien: '/mon-espace/#interets' });
    await prevenirMembre(i.annonces, { titre: `{A}, Lamia a transmis ta demande`, texte: 'Lamia pense que vous pourriez bien vous entendre : elle a demandé son accord à la personne que tu as choisie. Tu seras prévenu{e} dès qu’elle répond.', lien: '/mon-espace/' });
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
    if (m) await prevenirMembre(m, { titre: `{A}, Lamia te demande ton avis`, texte: `${question} Lamia pense que vous pourriez quand même bien vous entendre. Regarde sa fiche (anonyme) dans ton espace et dis-lui si tu es d’accord.`, bouton: 'Répondre à Lamia', lien: '/mon-espace/#interets' });
    return json({ ok: true, compte: Boolean(m) });
  }
  if (action === 'outil_reponse_avis') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['oui', 'non'].includes(b.reponse)) return json({ error: 'bad_request' }, 400);
    const [i] = await read(`/rest/v1/annonce_interets?id=eq.${id}&select=id,cible_ref,demandeur_id,statut,reciproque,reponse,avis_qui,avis_ok_demandeur,avis_ok_cible,annonces!inner(id,ref,prenom,email,status,user_id)`).catch(() => []);
    if (!i || !i.avis_qui) return json({ error: 'not_found' }, 404);
    return json({ ok: true, ...(await conclureAvis(i, b.reponse, { parLamia: true })) });
  }
  // Annuler une demande, avec le motif (gardé pour Lamia). Le demandeur voit « Lamia a annulé » sans le motif ; les autres choix en réserve reviennent.
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
  // Depuis l'outil : la personne est venue soutenir le live, Lamia lui offre un match de plus (1 toutes les 2 semaines).
  // Le lien personnel d'une fiche : Lamia l'envoie elle-même (WhatsApp, TikTok) à une personne choisie qui n'a pas de compte.
  if (action === 'outil_lien_fiche') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref >= REF_OUTIL)) return json({ error: 'bad_request' }, 400);
    const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=ref,user_id,retire_at`).catch(() => []);
    if (!f || f.retire_at) return json({ error: 'profil_absent_du_site' }, 404);
    return json({ ok: true, ref, lien: lienFiche(ref), compte: Boolean(f.user_id) });
  }
  // La tour de contrôle de l'outil de live : ce qui attend Lamia sur le site, en chiffres.
  if (action === 'outil_cockpit') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const compter = async (u) => (await read(u).catch(() => [])).length;
    const [a_verifier, demandes, confidences, signalements, safety, commandes, abonnes, evenements] = await Promise.all([
      compter('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=ref'),
      read('/rest/v1/annonce_interets?statut=eq.a_traiter&select=reciproque,annonces!inner(test)').catch(() => []),
      read('/rest/v1/confidence_threads?select=unread_lamia&unread_lamia=gt.0').catch(() => []),
      compter('/rest/v1/signalements?traite_at=is.null&select=id'),
      compter('/rest/v1/safety_reports?status=not.in.(resolved,dismissed)&select=id'),
      compter('/rest/v1/orders?status=eq.paid&fulfilled_at=is.null&select=id'),
      compter('/rest/v1/abonnements?statut=eq.actif&select=id'),
      read(`/rest/v1/speed_dating_events?status=neq.draft&starts_at=gte.${encodeURIComponent(now().toISOString())}&select=title,starts_at&order=starts_at.asc&limit=1`).catch(() => []),
    ]);
    const vrais = demandes.filter((d) => !d.annonces?.test);
    return json({ ok: true, a_verifier, demandes: vrais.length, reciproques: vrais.filter((d) => d.reciproque).length, confidences: confidences.reduce((n, t) => n + (Number(t.unread_lamia) || 0), 0), signalements: signalements + safety, commandes, abonnes, prochaine_soiree: evenements[0] || null });
  }
  if (action === 'outil_match_live') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const v = clean(b.id, 80), m = v.match(/^site-annonce-(\d+)$/);
    const ref = m ? Number(m[1]) : /^\d+$/.test(v) ? Number(v) : (await read(`/rest/v1/profils_outil?outil_id=eq.${encodeURIComponent(v)}&select=ref`).catch(() => []))[0]?.ref;
    if (!ref) return json({ error: 'profil_absent_du_site' }, 404);
    const table = ref < REF_OUTIL ? 'annonces' : 'profils_outil';
    const [x] = await read(`/rest/v1/${table}?ref=eq.${ref}&select=ref,matchs_bonus,user_id,match_live_at`).catch(() => []);
    if (!x) return json({ error: 'profil_absent_du_site' }, 404);
    const prochain = await prochainMatchLive(x);
    if (prochain) return json({ error: 'match_live_trop_tot', prochain, message: `Déjà un match offert en live : le prochain est possible à partir du ${dateFr(prochain)}.` }, 409);
    const bonus = (Number(x.matchs_bonus) || 0) + 1;
    await patch(table, `ref=eq.${ref}`, { matchs_bonus: bonus, match_live_at: now().toISOString() });
    if (x.user_id) await pousserMembre(x.user_id, { titre: '{A}, Lamia t’offre un match !', texte: 'Merci d’être venu{e} au live. Tu peux de nouveau choisir un profil.', lien: '/rencontres/swipe/' }).catch(() => {});
    return json({ ok: true, ref, bonus });
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
  // « Recommandé par Lamia » : posé sur la fiche affichée (pour un profil interne, c'est sa fiche du live).
  const poserRecommandation = async (ref, oui) => {
    if (!(ref > 0)) return null;
    const [a] = ref < REF_OUTIL ? await read(`/rest/v1/annonces?ref=eq.${ref}&select=ref,fiche_ref,recommande_at`).catch(() => []) : [];
    const cible = a?.fiche_ref || ref;
    const table = cible < REF_OUTIL ? 'annonces' : 'profils_outil';
    const [x] = await read(`/rest/v1/${table}?ref=eq.${cible}&select=ref,recommande_at`).catch(() => []);
    if (!x) return null;
    if (typeof oui !== 'boolean') return { ref: cible, recommande: Boolean(x.recommande_at) };
    await patch(table, `ref=eq.${cible}`, { recommande_at: oui ? now().toISOString() : null });
    return { ref: cible, recommande: oui };
  };
  // Fin réelle d'un dématch courtois : le match se termine, chacun retrouve une place, la discussion se ferme.
  const terminerDematch = async (d) => {
    const auteur = d[`${d.dematch_par}_user`], avec = d[`${d.dematch_par === 'a' ? 'b' : 'a'}_ref`];
    const [a] = await read(`/rest/v1/annonces?user_id=eq.${auteur}&status=in.(a_verifier,publiee)&select=*&limit=1`).catch(() => []);
    if (a && avec) await finirMatch(a, { refs: [avec] }).catch(() => {});
    await patch('annonce_interets', `id=eq.${d.interet_id}&statut=eq.mis_en_relation`, { statut: 'dematche', updated_at: now().toISOString() }).catch(() => {});
    await patch('discussions', `id=eq.${d.id}&close_raison=is.null`, { ferme_at: now().toISOString(), close_raison: 'dematch' }).catch(() => {});
    await alerter({ titre: `Dématch · n° ${d.a_ref} ↔ n° ${d.b_ref}`, lignes: ['Le match est terminé après le temps de l’au revoir.'], lien: '/tableau-de-bord#activite', tag: 'dematch' }).catch(() => {});
  };
  const compteDeRef = async (ref) => {
    if (ref < REF_OUTIL) { const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&status=in.(a_verifier,publiee)&select=id,ref,prenom,genre,email,user_id`).catch(() => []); return a?.user_id ? a : null; }
    const [o] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&user_id=not.is.null&select=ref,user_id,genre`).catch(() => []);
    if (!o) return null;
    const u = await compteDe(o.user_id);
    return u ? { ref, user_id: o.user_id, genre: o.genre, email: u.email, prenom: u.user_metadata?.first_name || '' } : null;
  };
  if (action === 'outil_recommander') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const r = await poserRecommandation(await refDepuisOutil(b.id), b.oui);
    return r ? json({ ok: true, ...r }) : json({ error: 'profil_absent_du_site' }, 404);
  }
  if (action === 'outil_proposer') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const pour = await refDepuisOutil(b.membre), cible = await refDepuisOutil(b.cible);
    if (!pour || !cible) return json({ error: 'profil_absent_du_site' }, 404);
    if (pour === cible) return json({ error: 'bad_request' }, 400);
    const membre = await compteDeRef(pour);
    if (!membre) return json({ error: 'pas_de_compte', pour }, 409);
    const r = await call('/rest/v1/propositions?on_conflict=pour_ref,cible_ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ pour_ref: pour, cible_ref: cible, potentiel: Number.isFinite(Number(b.potentiel)) ? Math.round(Number(b.potentiel)) : null, message: clean(b.message, 300) || null }) });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    await prevenirMembre(membre, { titre: `{A}, Lamia te propose un profil`, texte: 'Lamia a trouvé un profil qui pourrait te correspondre. Découvre sa fiche (anonyme) dans ton espace et dis-lui si elle t’intéresse.', bouton: 'Voir le profil proposé', lien: '/mon-espace/#propositions' });
    return json({ ok: true, pour, cible });
  }
  // Les profils qui paient, pour la page « Abonnés » de l'outil.
  if (action === 'outil_abonnes') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const abos = await read('/rest/v1/abonnements?statut=in.(actif,impaye)&select=email,nom,formule,periode,statut,fin_periode,resiliation_prevue,created_at&order=created_at.asc&limit=500');
    const lancement = formuleAbo('prestige').lancement;
    const prises = (await read(`/rest/v1/abonnements?formule=eq.prestige&statut=neq.en_attente&select=id&limit=${lancement.places + 1}`).catch(() => [])).length;
    const parMail = new Map();
    if (abos.length) {
      for (const a of await read('/rest/v1/annonces?status=in.(a_verifier,publiee)&select=ref,email,outil_id&limit=5000').catch(() => [])) if (a.email) parMail.set(String(a.email).toLowerCase(), a.outil_id || `site-annonce-${a.ref}`);
      // Seulement s'il reste des abonnés sans fiche : retrouver le mail d'un compte demande un appel par compte.
      if (abos.some((a) => !parMail.has(String(a.email).toLowerCase()))) {
        const fiches = await read('/rest/v1/profils_outil?user_id=not.is.null&select=outil_id,user_id&limit=2000').catch(() => []);
        const comptes = await Promise.all(fiches.map((f) => compteDe(f.user_id).catch(() => null)));
        fiches.forEach((f, i) => { const m = comptes[i]?.email?.toLowerCase(); if (m && !parMail.has(m)) parMail.set(m, f.outil_id); });
      }
    }
    return json({ ok: true, places: Math.max(0, lancement.places - prises), abonnes: abos.map((a) => ({ email: a.email, nom: a.nom, formule: a.formule, periode: a.periode, statut: a.statut, fin_periode: a.fin_periode, resiliation_prevue: a.resiliation_prevue, depuis: a.created_at, id_outil: parMail.get(String(a.email).toLowerCase()) || null })) });
  }
  // Deux fiches de l'outil fusionnées : la fiche retirée disparaît du site, ses demandes et son compte passent sur la fiche gardée.
  if (action === 'outil_fusion') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const garde = clean(b.garde, 80), retire = clean(b.retire, 80);
    if (!garde || !retire || garde === retire) return json({ error: 'bad_request' }, 400);
    // Les annonces reliées suivent la fiche gardée : sans ça, « Récupérer » ferait revenir le doublon dans l'outil.
    const refAnnonce = /^site-annonce-(\d+)$/.exec(retire)?.[1];
    if (refAnnonce && !garde.startsWith('site-annonce-')) await patch('annonces', `ref=eq.${refAnnonce}`, { outil_id: garde }).catch(() => {});
    else if (!refAnnonce && !garde.startsWith('site-annonce-')) await patch('annonces', `outil_id=eq.${encodeURIComponent(retire)}`, { outil_id: garde }).catch(() => {});
    const [fr] = await read(`/rest/v1/profils_outil?outil_id=eq.${encodeURIComponent(retire)}&select=ref,user_id`).catch(() => []);
    if (!fr) return json({ ok: true, demandes: 0 }); // une annonce du site ou une fiche jamais publiée : rien à faire
    const [fg] = await read(`/rest/v1/profils_outil?outil_id=eq.${encodeURIComponent(garde)}&select=ref,user_id`).catch(() => []);
    let demandes = 0;
    if (fg) {
      for (const i of await read(`/rest/v1/annonce_interets?cible_ref=eq.${fr.ref}&select=id`).catch(() => [])) { const r = await patch('annonce_interets', `id=eq.${i.id}`, { cible_ref: fg.ref }).catch(() => null); if (r?.ok) demandes += 1; }
      for (const p of await read(`/rest/v1/propositions?or=(pour_ref.eq.${fr.ref},cible_ref.eq.${fr.ref})&select=id,pour_ref,cible_ref`).catch(() => [])) await patch('propositions', `id=eq.${p.id}`, p.pour_ref === fr.ref ? { pour_ref: fg.ref } : { cible_ref: fg.ref }).catch(() => {});
      if (fr.user_id && !fg.user_id) await patch('profils_outil', `ref=eq.${fg.ref}`, { user_id: fr.user_id }).catch(() => {});
    }
    await patch('profils_outil', `ref=eq.${fr.ref}`, { visible: false, ...(fg && fr.user_id && !fg.user_id ? { user_id: null } : {}) });
    await journaliser({ titre: `Fiches fusionnées · n° ${fr.ref}${fg ? ` → n° ${fg.ref}` : ''}`, lignes: [`La fiche n° ${fr.ref} n’apparaît plus sur le site.`], lien: '/tableau-de-bord#activite', categorie: 'profil' }, { call, read }).catch(() => {});
    return json({ ok: true, demandes });
  }
  if (action === 'outil_fusion_annuler') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const retire = clean(b.retire, 80);
    if (!retire) return json({ error: 'bad_request' }, 400);
    const refAnnonce = /^site-annonce-(\d+)$/.exec(retire)?.[1];
    if (refAnnonce) await patch('annonces', `ref=eq.${refAnnonce}`, { outil_id: null }).catch(() => {});
    else await patch('profils_outil', `outil_id=eq.${encodeURIComponent(retire)}&retire_at=is.null`, { visible: true });
    return json({ ok: true });
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
    for (const l of lignes) { const a2 = ref(l.a), b2 = ref(l.b), sc = Math.round(Number(l.s)); if (!a2 || !b2 || a2 === b2 || !(sc >= 0 && sc <= 100)) continue; const k = `${a2}-${b2}`; if (vus.has(k)) continue; vus.add(k); rows.push({ a_ref: a2, b_ref: b2, score: sc, niveau: clean(l.t, 60) || null, bloque: l.bl === true ? true : l.bl === false ? false : null, blocages: Array.isArray(l.bx) && l.bx.length ? l.bx.slice(0, 8).map((x) => clean(x, 160)) : null, updated_at: t }); }
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
  // Les pseudos des fiches de l'outil, pour que Lamia puisse leur écrire depuis son téléphone (son accord du 5 novembre 2026).
  if (action === 'outil_contacts') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const fiches = await read('/rest/v1/profils_outil?select=ref,outil_id,retire_at,effacement_at&limit=8000').catch(() => []);
    const refDe = new Map(fiches.filter((f) => !f.retire_at && !f.effacement_at).map((f) => [f.outil_id, f.ref]));
    // Fiche retirée ou effacée : son pseudo quitte le site aussi.
    const parties = fiches.filter((f) => f.retire_at || f.effacement_at).map((f) => f.ref);
    if (parties.length) await call(`/rest/v1/contacts_lamia?ref=in.(${parties.join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => {});
    const rows = [];
    for (const x of (Array.isArray(b.contacts) ? b.contacts : []).slice(0, 8000)) {
      const n = normLien(clean(x?.lien, 200)), ref = refDe.get(clean(x?.outil_id, 80));
      if (!n || !ref) continue;
      const i = n.indexOf(':');
      rows.push({ ref, reseau: n.slice(0, i), pseudo: n.slice(i + 1), updated_at: now().toISOString() });
    }
    const uniques = [...new Map(rows.map((r) => [r.ref, r])).values()];
    for (let i = 0; i < uniques.length; i += 500) await call('/rest/v1/contacts_lamia?on_conflict=ref', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(uniques.slice(i, i + 500)) });
    return json({ ok: true, n: uniques.length });
  }
  // Empreintes des pseudos TikTok des fiches de l'outil, pour retrouver un profil créé en live.
  if (action === 'outil_tiktok') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const rows = (Array.isArray(b.empreintes) ? b.empreintes : []).slice(0, 8000)
      .map((x) => ({ h: clean(x?.h, 64), outil_id: clean(x?.outil_id, 80), updated_at: now().toISOString() }))
      .filter((x) => /^[0-9a-f]{64}$/.test(x.h) && x.outil_id);
    // Deux fiches avec le même lien (des doublons) donnent la même empreinte : envoyées ensemble, tout le lot était refusé (erreur 21000).
    const uniques = [...new Map([...rows].reverse().map((r) => [r.h, r])).values()].reverse();
    await call('/rest/v1/outil_tiktok?h=neq.x', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    for (let i = 0; i < uniques.length; i += 500) await call('/rest/v1/outil_tiktok?on_conflict=h', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(uniques.slice(i, i + 500)) });
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
    if (abonnement && !abonnement.resiliation_prevue && !abonnement.offert) return json({ error: 'abonnement_actif' }, 409);
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
    await patch('coaching_creneaux', `user_id=eq.${user.id}`, { user_id: null, email: null, prenom: null, reserve_at: null, rappel_at: null }).catch(() => {});
    await call(`/rest/v1/push_subscriptions?user_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {});
    await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(mail)}`, { method: 'DELETE' }).catch(() => {});
    await call(`/rest/v1/beta_testeurs?compte_email=eq.${encodeURIComponent(mail)}`, { method: 'DELETE' }).catch(() => {});
    await call(`/rest/v1/moderateur_invitations?email=eq.${encodeURIComponent(mail)}`, { method: 'DELETE' }).catch(() => {});
    const r = await call(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(() => null);
    await alerter({ titre: `Compte supprimé${mes.length ? ` · profil n° ${mes.map((a) => a.ref).join(', ')}` : ''}`, lignes: ['La personne a supprimé son compte depuis l’application : profil, photos, demandes et discussions effacés.', fiches.length ? `Sa fiche n° ${fiches.map((f) => f.ref).join(', ')} est à effacer de ton outil (fait automatiquement à la prochaine récupération).` : ''].filter(Boolean), lien: '/tableau-de-bord#application', tag: 'reserve' }).catch(() => {});
    return json({ ok: true, compte: Boolean(r?.ok) });
  }
  // Discussion entre deux personnes mises en relation (7 jours, puis échange des numéros).
  if (action.startsWith('annonce_coaching')) return actionCoaching(action, b, { env, call, read, insert, patch, admin, user, now, alerter, prevenirMembre, ...(formuleDe ? { etat: async (mail) => ({ abonnement: { formule: await formuleDe(mail), statut: 'actif' } }) } : {}), jeton: (id) => jetonAnnonce(env, id, 'visio'), jetonOk: (id, x) => jetonAnnonceValide(env, id, x, 'visio') });
  if (action.startsWith('salon_')) return actionSalons(action, b, { env, call, read, insert, patch, admin, user, ipHash, now, alerter, cron, prevenirMembre });
  if (ACTIONS_MODERATION.includes(action)) return actionModeration(action, b, { read, insert, patch, call, now, user, admin, alerter, compteDeRef, prevenirMembre, refOutil: REF_OUTIL, lienFiche });
  if (['annonce_bloquer', 'annonce_bloquer_signaler', 'annonce_debloquer', 'annonce_mes_blocages', 'annonce_signaler_profil'].includes(action)) return actionBlocage(action, b, { read, insert, patch, call, now, user, alerter, monProfil, mesRefs, compteDeRef, finirMatch, fermerDiscussion, REF_OUTIL });
  if (['annonce_discussions', 'annonce_discussion_envoyer', 'annonce_discussion_numero', 'annonce_discussion_signaler', 'annonce_parcours_valider', 'annonce_discussion_dematcher', 'annonce_discussion_prenom'].includes(action)) return actionDiscussion(action, b, { read, insert, patch, now, user, pousserMembre, alerter, quiEst, matchsEnCoursParPersonne, terminerDematch });
  if (action === 'annonce_rappels_cron') {
    if (!cron) return json({ error: 'forbidden' }, 403);
    // Chaque jour : rappels de discussion, puis le pilote (mises en relation, et nouvelles propositions pour ceux qui n'en ont plus).
    const rappels = await rappelsDiscussions({ read, patch, now, pousserMembre });
    await autoValiderEnAttente().catch(() => ({}));
    const pilote = await piloteAuto({ proposer: true }).catch(() => null);
    const coaching = await rappelsCoaching({ read, patch, now, alerter, prevenirMembre }).catch(() => 0);
    const parutions = await notifierParutions().catch(() => null);
    const relances = await relancerComptes().catch(() => null);
    const dematchs = await suiviDematchs({ read, patch, now, pousserMembre, terminerDematch }).catch(() => null);
    return json({ ok: true, rappels, pilote, coaching, parutions, relances, dematchs });
  }
  if (!admin) return json({ error: 'forbidden' }, 403);
  // ---------------------------------------------------------------- la fiche d'une personne (onglet Profils)
  const annoncesDe = (id, mail) => read(`/rest/v1/annonces?or=(user_id.eq.${id}${mail ? `,email.eq.${encodeURIComponent(String(mail).toLowerCase())}` : ''})&select=id,ref,prenom,genre,birth_date,ville,pays,status,test,en_match,live_declare,matchs_bonus,bloque_at,user_id,situation,profil,recherche,age_min,age_max,email,phone,matching,identite_verifiee_at,submitted_at,published_at,exportee_at,outil_id,fiche_ref,visible_anonyme,photo_partage,note_lamia,moderateur_at,recommande_at,modifiee_at&order=submitted_at.desc`).catch(() => []);
  // Photos et vidéos de ces annonces pour le tableau de bord. La pièce d'identité n'en fait jamais partie.
  const mediasDe = async (ids) => {
    if (!ids.length) return {};
    const f = await read(`/rest/v1/annonce_files?annonce_id=in.(${ids.join(',')})&kind=in.(photo,video)&select=annonce_id,kind,storage_path,position`).catch(() => []);
    const urls = await liensLecture(f, 3600).catch(() => ({}));
    const out = {};
    for (const x of [...f].sort((p, q) => p.position - q.position)) if (urls[x.storage_path]) (out[x.annonce_id] ||= []).push({ kind: x.kind, url: urls[x.storage_path] });
    return out;
  };
  const CHAMPS_FICHE = 'ref,genre,age,ville,village,pays,secteur,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max,religion,pratique,mode_vie,modif_demandee,moderateur_at,recommande_at';
  if (action === 'annonce_profil_detail') {
    let id = /^[0-9a-f-]{36}$/i.test(String(b.user_id)) ? b.user_id : null;
    const ref = Number.parseInt(b.ref, 10);
    let ficheSeule = null, annonceSeule = null;
    if (!id && ref > 0) {
      if (ref >= REF_OUTIL) { const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=${CHAMPS_FICHE},user_id,outil_id,confirme_at,retire_at,visible`).catch(() => []); if (!f) return json({ error: 'not_found' }, 404); id = f.user_id; ficheSeule = f; }
      else { const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=id,ref,user_id,prenom,genre,birth_date,ville,pays,status,test,en_match,situation,profil,recherche,age_min,age_max,email,phone,matching,identite_verifiee_at,submitted_at,published_at,exportee_at,outil_id,fiche_ref,visible_anonyme,photo_partage,note_lamia,moderateur_at,recommande_at,modifiee_at`).catch(() => []); if (!a) return json({ error: 'not_found' }, 404); id = a.user_id; annonceSeule = a; }
    }
    const journalDe = async (refs) => {
      const lignes = await read('/rest/v1/journal_lamia?select=titre,lignes,lien,created_at&order=created_at.desc&limit=400').catch(() => []);
      return lignes.filter((j) => refs.some((r) => new RegExp(`n°\\s*${r}(?!\\d)`).test(`${j.titre} ${(j.lignes || []).join(' ')}`))).slice(0, 12);
    };
    // Le prénom à côté de chaque n° cité, pour lire tout de suite qui est qui.
    const nomsDe = async (textes) => {
      const refs = [...new Set(textes.join(' ').match(/\d{1,6}/g) || [])].filter((r) => Number(r) < 100000).slice(0, 80);
      const l = refs.length ? await read(`/rest/v1/annonces?ref=in.(${refs.join(',')})&select=ref,prenom`).catch(() => []) : [];
      return Object.fromEntries(l.filter((x) => x.prenom).map((x) => [x.ref, x.prenom]));
    };
    if (!id) {
      const [recus, journal] = await Promise.all([read(`/rest/v1/annonce_interets?cible_ref=eq.${ref}&select=statut,created_at,annonces!inner(ref,prenom)&order=created_at.desc&limit=20`).catch(() => []), journalDe([ref])]);
      const choisi_par = recus.map((i) => ({ ref: i.annonces.ref, prenom: i.annonces.prenom, statut: i.statut, le: i.created_at }));
      // Une fiche sans compte peut avoir une annonce du site reliée : ses photos et ses réponses sont utiles aussi.
      const liee = ficheSeule?.outil_id ? await read(`/rest/v1/annonces?outil_id=eq.${encodeURIComponent(ficheSeule.outil_id)}&select=id`).catch(() => []) : [];
      const pleines = annonceSeule ? [annonceSeule] : liee.length ? await read(`/rest/v1/annonces?id=in.(${liee.map((x) => x.id).join(',')})&select=*`).catch(() => []) : [];
      const med = await mediasDe(pleines.map((x) => x.id));
      return json({ ok: true, sans_compte: true, annonces: pleines.map(({ id: i, birth_date: d, ip_hash: _h, ...x }) => ({ ...x, age: ageAu(d, now()), medias: med[i] || [] })), fiches: ficheSeule ? [{ ...ficheSeule, outil_id: undefined, user_id: undefined, confirmee: Boolean(ficheSeule.confirme_at), retiree: Boolean(ficheSeule.retire_at) }] : [], choisi_par, journal, noms: await nomsDe(journal.flatMap((j) => [j.titre, ...(j.lignes || [])])) });
    }
    const u = await compteDe(id);
    if (!u) return json({ error: 'not_found' }, 404);
    const mail = String(u.email || '').toLowerCase();
    const [annonces, fiches] = await Promise.all([annoncesDe(id, mail), read(`/rest/v1/profils_outil?user_id=eq.${id}&select=${CHAMPS_FICHE},confirme_at,retire_at,bloque_at,matchs_bonus`).catch(() => [])]);
    const refs = [...annonces.map((a) => a.ref), ...fiches.map((f) => f.ref)], ids = annonces.map((a) => a.id);
    const dans = (l) => l.join(',');
    const e = encodeURIComponent(mail.replace(/[%*,()]/g, ''));
    const [choix, passes, recus, fichiers, faits, subis, signFaits, signSubis, discussions, unites, abos, coaching, salons] = await Promise.all([
      ids.length ? read(`/rest/v1/annonce_interets?demandeur_id=in.(${dans(ids)})&select=cible_ref,statut,via,created_at&order=created_at.desc&limit=500`).catch(() => []) : [],
      ids.length ? read(`/rest/v1/annonce_passes?demandeur_id=in.(${dans(ids)})&select=created_at&order=created_at.desc&limit=1000`).catch(() => []) : [],
      refs.length ? read(`/rest/v1/annonce_interets?cible_ref=in.(${dans(refs)})&select=statut,created_at,annonces!inner(ref,prenom)&order=created_at.desc&limit=200`).catch(() => []) : [],
      ids.length ? read(`/rest/v1/annonce_files?annonce_id=in.(${dans(ids)})&kind=in.(photo,video)&select=kind`).catch(() => []) : [],
      read(`/rest/v1/blocages?auteur_user=eq.${id}&select=cible_ref,motif,created_at&order=created_at.desc&limit=50`).catch(() => []),
      read(`/rest/v1/blocages?or=(cible_user.eq.${id}${refs.length ? `,cible_ref.in.(${dans(refs)})` : ''})&select=auteur_ref,motif,created_at&order=created_at.desc&limit=50`).catch(() => []),
      read(`/rest/v1/signalements?auteur_user=eq.${id}&select=cible_ref,motif,created_at,traite_at&order=created_at.desc&limit=30`).catch(() => []),
      refs.length ? read(`/rest/v1/signalements?cible_ref=in.(${dans(refs)})&select=auteur_ref,motif,created_at,traite_at&order=created_at.desc&limit=30`).catch(() => []) : [],
      read(`/rest/v1/discussions?or=(a_user.eq.${id},b_user.eq.${id})&select=id,a_user,a_ref,b_ref,ouverte_at,ferme_at,close_raison&order=ouverte_at.desc&limit=20`).catch(() => []),
      mail ? read(`/rest/v1/achats_unite?email=ilike.${e}&select=type,quantite,utilisees,stripe_session_id,created_at&order=created_at.desc&limit=50`).catch(() => []) : [],
      mail ? read(`/rest/v1/abonnements?email=ilike.${e}&statut=eq.actif&select=formule,periode,fin_periode&limit=1`).catch(() => []) : [],
      read(`/rest/v1/coaching_creneaux?user_id=eq.${id}&select=debut&order=debut.desc&limit=5`).catch(() => []),
      read(`/rest/v1/salon_inscriptions?user_id=eq.${id}&select=salon,statut,created_at&order=created_at.desc&limit=5`).catch(() => []),
    ]);
    const msgs = discussions.length ? await read(`/rest/v1/discussion_messages?discussion_id=in.(${dans(discussions.map((d) => d.id))})&select=id&limit=1000`).catch(() => []) : [];
    const dates = [choix[0]?.created_at, passes[0]?.created_at, u.last_sign_in_at].filter(Boolean).sort();
    const reste = (t) => unites.filter((x) => x.type === t).reduce((n, x) => n + Math.max(0, x.quantite - x.utilisees), 0);
    const medias = await mediasDe(ids);
    const journal = refs.length ? await journalDe(refs) : [];
    const produits = await read('/rest/v1/products?status=eq.active&select=id,name,product_type,stock_qty&order=name.asc&limit=200').catch(() => []);
    return json({ ok: true,
      compte: { id, email: u.email, prenom: u.user_metadata?.first_name || annonces[0]?.prenom || '', cree_le: u.created_at, vu_le: u.last_sign_in_at, admin: u.app_metadata?.role === 'admin', bloque: Boolean(u.banned_until && new Date(u.banned_until) > now()), derniere_action: dates[dates.length - 1] || null },
      annonces: annonces.map(({ id: i, birth_date: d, ...a }) => ({ ...a, age: ageAu(d, now()), medias: medias[i] || [] })), fiches: fiches.map((f) => ({ ...f, confirmee: Boolean(f.confirme_at), retiree: Boolean(f.retire_at), bloquee: Boolean(f.bloque_at) })),
      activite: { swipes_oui: choix.filter((c) => c.via === 'swipe').length, swipes_non: passes.length, demandes: choix.length, en_cours: choix.filter((c) => c.statut === 'mis_en_relation').map((c) => c.cible_ref), dematchs: choix.filter((c) => c.statut === 'dematche').length, recus: recus.length, messages: msgs.length, photos: fichiers.filter((f) => f.kind === 'photo').length, videos: fichiers.filter((f) => f.kind === 'video').length },
      choix: choix.slice(0, 12).map((c) => ({ ref: c.cible_ref, statut: c.statut, via: c.via, le: c.created_at })),
      choisi_par: recus.slice(0, 12).map((i) => ({ ref: i.annonces.ref, prenom: i.annonces.prenom, statut: i.statut, le: i.created_at })),
      discussions: discussions.map((d) => ({ avec: d.a_user === id ? d.b_ref : d.a_ref, ouverte: d.ouverte_at, ferme: d.ferme_at, raison: d.close_raison })),
      blocages: { fait: faits.map((x) => ({ ref: x.cible_ref, motif: x.motif, le: x.created_at })), subi: subis.map((x) => ({ ref: x.auteur_ref, motif: x.motif, le: x.created_at })) },
      signalements: { fait: signFaits.map((x) => ({ ref: x.cible_ref, motif: x.motif, le: x.created_at, traite: Boolean(x.traite_at) })), subi: signSubis.map((x) => ({ ref: x.auteur_ref, motif: x.motif, le: x.created_at, traite: Boolean(x.traite_at) })) },
      formule: abos[0]?.formule || 'decouverte',
      credits: { match: reste('mise_en_relation'), speed_dating: reste('speed_dating'), coaching: reste('coaching') + reste('coaching_30') + reste('sauver_couple') },
      cadeaux: unites.filter((x) => String(x.stripe_session_id || '').startsWith('offert-')).map((x) => ({ type: x.type, quantite: x.quantite, utilisees: x.utilisees, le: x.created_at })),
      coaching: coaching.map((c) => c.debut), salons, produits,
      journal,
      noms: await nomsDe([...journal.flatMap((j) => [j.titre, ...(j.lignes || [])]), ...choix.map((c) => String(c.cible_ref)), ...faits.map((x) => String(x.cible_ref)), ...subis.map((x) => String(x.auteur_ref)), ...signFaits.map((x) => String(x.cible_ref)), ...signSubis.map((x) => String(x.auteur_ref)), ...discussions.flatMap((d) => [String(d.a_ref), String(d.b_ref)])]),
    });
  }
  // Bloquer une personne : plus de connexion, profil et fiches retirés, matchs en cours terminés. Réversible, sans message à la personne.
  if (action === 'annonce_profil_bloquer') {
    const id = String(b.user_id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400);
    const u = await compteDe(id);
    if (!u) return json({ error: 'not_found' }, 404);
    if (u.app_metadata?.role === 'admin') return json({ error: 'compte_admin' }, 403);
    const annonces = await annoncesDe(id, u.email), t = now().toISOString();
    const r = await call(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: b.bloquer === false ? 'none' : '876000h' }) });
    if (!r.ok) return json({ error: 'blocage_impossible' }, 502);
    if (b.bloquer === false) {
      for (const a of annonces.filter((x) => x.bloque_at)) await patch('annonces', `ref=eq.${a.ref}`, { status: (await read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&kind=eq.photo&select=id`).catch(() => [])).length >= 2 ? 'publiee' : 'a_verifier', bloque_at: null });
      await patch('profils_outil', `user_id=eq.${id}&bloque_at=not.is.null`, { bloque_at: null, retire_at: null, visible: true });
      await call(`/rest/v1/member_profiles?user_id=eq.${id}&profile_status=eq.suspended`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ profile_status: 'draft' }) }).catch(() => {});
      return json({ ok: true, bloque: false });
    }
    for (const a of annonces.filter((x) => ['a_verifier', 'publiee'].includes(x.status))) {
      await finirMatch(a).catch(() => {});
      await patch('annonces', `ref=eq.${a.ref}`, { status: 'retiree', visible_anonyme: false, en_match: false, bloque_at: t });
    }
    await patch('profils_outil', `user_id=eq.${id}&retire_at=is.null`, { bloque_at: t, retire_at: t, visible: false });
    await call(`/rest/v1/member_profiles?user_id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ profile_status: 'suspended' }) }).catch(() => {});
    return json({ ok: true, bloque: true });
  }
  // Offrir : matchs, soirée de speed dating, visio de coaching ou produit. La personne est prévenue.
  if (action === 'annonce_offrir') {
    const id = String(b.user_id), quoi = String(b.quoi), n = Number.parseInt(b.quantite, 10) || 1;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !(n >= 1 && n <= 10)) return json({ error: 'bad_request' }, 400);
    const u = await compteDe(id);
    if (!u?.email) return json({ error: 'not_found' }, 404);
    const [a] = await annoncesDe(id, u.email);
    const qui = { user_id: id, email: u.email, genre: a?.genre, prenom: a?.prenom || u.user_metadata?.first_name || '' };
    const TYPES = { match: ['mise_en_relation', n > 1 ? `${n} matchs` : 'un match', '/rencontres/swipe/'], speed_dating: ['speed_dating', n > 1 ? `${n} soirées de speed dating` : 'une soirée de speed dating', '/mon-espace/#speed-dating'], coaching: ['coaching', n > 1 ? `${n} visios de coaching` : 'une visio de coaching', '/mon-espace/#coaching'] };
    if (TYPES[quoi]) {
      const [type, texte, lien] = TYPES[quoi];
      await insert('achats_unite', { email: String(u.email).toLowerCase(), nom: qui.prenom || null, type, quantite: n, utilisees: 0, stripe_session_id: `offert-${randomUUID()}` });
      await prevenirMembre(qui, { titre: `{A}, Lamia t’offre ${texte}`, texte: `C’est un cadeau de Lamia. Tu le retrouves dans ton espace.`, bouton: 'Voir mon cadeau', lien }).catch(() => {});
      return json({ ok: true });
    }
    if (quoi !== 'produit') return json({ error: 'bad_request' }, 400);
    const pid = clean(b.product_id, 40);
    if (!UUID.test(pid)) return json({ error: 'bad_request' }, 400);
    const [p] = await read(`/rest/v1/products?id=eq.${pid}&select=id,name,product_type,stock_qty,currency,status`).catch(() => []);
    if (!p || p.status !== 'active') return json({ error: 'produit_indisponible' }, 409);
    if (Number.isInteger(p.stock_qty) && p.stock_qty < 1 && p.product_type !== 'digital') return json({ error: 'stock_vide' }, 409);
    const physique = p.product_type !== 'digital';
    const ad = { line1: clean(b.adresse?.line1, 200), postal_code: clean(b.adresse?.postal_code, 20), city: clean(b.adresse?.city, 100), country: clean(b.adresse?.country, 60) || 'France' };
    if (physique && !(ad.line1 && ad.postal_code && ad.city)) return json({ error: 'adresse_requise' }, 400);
    const o = await call('/rest/v1/orders?select=id,order_number', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_email: String(u.email).toLowerCase(), customer_name: qui.prenom || null, amount_total_cents: 0, currency: p.currency || 'EUR', status: 'paid', paid_at: now().toISOString(), shipping_address: physique ? { method: 'cadeau', ...ad } : { method: 'numerique' }, notes: 'Cadeau de Lamia, offert depuis la fiche du profil.' }) });
    if (!o.ok) return json({ error: 'temporary_failure' }, 502);
    const [order] = await o.json();
    const it = await call('/rest/v1/order_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ order_id: order.id, product_id: p.id, product_name: p.name, quantity: 1, unit_price_cents: 0, total_price_cents: 0, metadata: { cadeau: true } }) });
    if (!it.ok) return json({ error: 'temporary_failure' }, 502);
    if (Number.isInteger(p.stock_qty) && physique) await patch('products', `id=eq.${p.id}&stock_qty=eq.${p.stock_qty}`, { stock_qty: p.stock_qty - 1 }).catch(() => {});
    await prevenirMembre(qui, { titre: `{A}, Lamia t’offre un cadeau`, texte: `${p.name} : c’est un cadeau de Lamia.${physique ? ' Il part bientôt à ton adresse.' : ' Lamia te l’envoie très vite.'}`, bouton: 'Mon espace' }).catch(() => {});
    return json({ ok: true, commande: order.order_number });
  }
  if (action === 'annonce_cockpit_stats') {
    const r = await call('/rest/v1/rpc/cockpit_stats', { method: 'POST', body: '{}' });
    if (!r.ok) return json({ error: 'lecture' }, 502);
    return json({ ok: true, stats: await r.json() });
  }
  // Profils qui n'ont pas leurs photos : combien, et notification dans l'application (une fois par personne, à la demande de Lamia).
  if (action === 'annonce_relance_medias') {
    const profils = await read('/rest/v1/annonces?status=in.(a_verifier,publiee)&test=eq.false&user_id=not.is.null&select=id,ref,user_id,genre,prenom&limit=5000').catch(() => []);
    const fichiers = await read('/rest/v1/annonce_files?kind=in.(photo,video)&select=annonce_id,kind&limit=20000').catch(() => null);
    if (!fichiers) return json({ error: 'lecture' }, 502);
    const parProfil = new Map();
    for (const f of fichiers) parProfil.set(f.annonce_id, [...(parProfil.get(f.annonce_id) || []), f]);
    const sansMedias = profils.filter((a) => !mediasSuffisants(parProfil.get(a.id) || []));
    // Fiches du live confirmées avec un compte, mais sans profil encore créé sur le site : aucune photo non plus.
    const fiches = await read('/rest/v1/profils_outil?user_id=not.is.null&confirme_at=not.is.null&retire_at=is.null&select=ref,user_id&limit=5000').catch(() => []);
    const avecProfil = new Set(profils.map((a) => a.user_id));
    for (const f of fiches) if (!avecProfil.has(f.user_id)) { avecProfil.add(f.user_id); sansMedias.push({ ref: f.ref, user_id: f.user_id }); }
    const [reg] = await read('/rest/v1/platform_settings?key=eq.relance_medias&select=value').catch(() => []);
    const faits = reg?.value || {};
    const reste = sansMedias.filter((a) => !faits[a.ref]);
    if (b.envoyer !== true) return json({ ok: true, manquent: sansMedias.length, a_prevenir: reste.length });
    let notifies = 0;
    const lot = reste.slice(0, 40);
    for (const a of lot) {
      const n = await pousserMembre(a.user_id, { titre: '{A}, il manque tes photos', texte: 'Ajoute 2 photos de toi pour continuer à swiper et pouvoir répondre. Elles restent privées.', lien: '/mon-espace/#photos', tag: 'photos' }).catch(() => 0);
      if (n) notifies += 1;
      faits[a.ref] = now().toISOString();
    }
    if (lot.length) await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'relance_medias', value: faits }) });
    return json({ ok: true, traites: lot.length, notifies, a_prevenir: reste.length - lot.length, manquent: sansMedias.length });
  }
  // Cartographie de l'activité et réglages du pilote automatique (tableau de bord de Lamia).
  if (action === 'annonce_pilote') {
    const op = clean(b.op, 20);
    if (op === 'reglages') {
      await noterPilote({ actif: b.actif !== false, parPersonne: Number(b.parPersonne) || PILOTE_DEFAUT.parPersonne, scoreMin: Number.isFinite(Number(b.scoreMin)) ? Number(b.scoreMin) : PILOTE_DEFAUT.scoreMin });
    } else if (op === 'lancer') {
      const r = await piloteAuto({ proposer: true });
      return json({ ok: true, lance: r, ...(await carteActivite()) });
    } else if (op === 'valider_tout') {
      // Jamais de profil incomplet validé : les complets sont validés, les autres reçoivent ce qui leur manque
      // (validation automatique dès qu'ils l'ajoutent). Ensuite, les « oui » réciproques débloqués se font tout seuls.
      const avant = (await read('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=id').catch(() => [])).length;
      await autoValiderEnAttente().catch(() => ({}));
      const apres = (await read('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=id').catch(() => [])).length;
      const relances = await relancerIncomplets({ force: true }).catch(() => 0);
      const relations = await miseEnRelationAuto().catch(() => []);
      return json({ ok: true, valides: avant - apres, relances, relations: relations.length, ...(await carteActivite()) });
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
    const enCours = await matchsEnCoursParPersonne().catch(() => null);
    const rel = interets.filter((i) => i.statut === 'mis_en_relation' || i.statut === 'dematche').map((i) => {
      const d = discDe.get(i.id);
      const etat = i.statut === 'dematche' ? 'terminé' : !d ? 'en relation (sans discussion : pas de compte)' : d.signalee_at ? 'signalée' : d.a_numero && d.b_numero ? 'numéros échangés' : d.close_raison ? 'discussion fermée' : new Date(d.ferme_at) > t ? 'discussion en cours' : 'discussion terminée sans numéros';
      return { id: i.id, a: n(i.annonces.ref), b: n(i.cible_ref), le: i.updated_at, etat, actif: i.statut === 'mis_en_relation', reciproque: Boolean(i.reciproque || i.reponse === 'oui'), discussion: Boolean(d && !d.close_raison && new Date(d.ferme_at) > t), a_matchs: enCours?.deRef(i.annonces.ref) || 0, b_matchs: enCours?.deRef(i.cible_ref) || 0 };
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
        en_relation: rel.filter((r) => r.actif).length, numeros: rel.filter((r) => r.etat.startsWith('')).length,
      },
      relations: rel.slice(0, 60),
      propositions: paires.slice(0, 80),
      // Ce qui reste bloqué sans Lamia : réciproques dont un profil n'est pas validé ou déjà pris.
      en_attente: (await read('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=id,ref,prenom,email,phone,matching&order=submitted_at.asc').catch(() => [])).map((a) => ({ ref: a.ref, prenom: a.prenom })),
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
      en_pause: Boolean(a.pause_at), submitted_at: a.submitted_at, identite_verifiee_at: a.identite_verifiee_at, note_lamia: a.note_lamia, matching: a.matching || {}, exportee_at: a.exportee_at, nb_compatibles: a.nb_compatibles, resultat_envoye_at: a.resultat_envoye_at, anonyme_ok: a.anonyme_ok, visible_anonyme: a.visible_anonyme, photo_partage: Boolean(a.photo_partage), test: Boolean(a.test), matchs_bonus: a.matchs_bonus || 0, live_declare: a.live_declare, outil_lie: Boolean(a.outil_id), compte: Boolean(a.user_id), en_match: a.en_match, modifiee_at: a.modifiee_at,
      identite: files.filter((f) => f.annonce_id === a.id && f.kind === 'identite').map((f) => ({ mime: f.mime, url: urls[f.storage_path] || null }))[0] || null,
    })) });
  }
  if (action === 'matchs_demandes') {
    const list = await read('/rest/v1/annonce_interets?select=id,cible_ref,statut,created_at,reciproque,via,annonces!inner(id,ref,prenom,genre,birth_date,ville,pays,status,matching,age_min,age_max)&order=created_at.desc&limit=300');
    const refs = [...new Set(list.map((x) => x.cible_ref))];
    const cibles = refs.length ? await read(`/rest/v1/annonces?ref=in.(${refs.join(',')})&select=ref,prenom,genre,birth_date,ville,pays,status,matching,age_min,age_max`) : [];
    const fichesOutil = refs.some((r) => r >= REF_OUTIL) ? await read(`/rest/v1/profils_outil?ref=in.(${refs.filter((r) => r >= REF_OUTIL).join(',')})&select=ref,age,age_min,age_max,pays,religion,pratique,religion_recherche,pratique_recherche,enfants,situation,origine,mode_vie,etudes`).catch(() => []) : [];
    // Potentiel de chaque match demandé, pour choisir LA mise en relation à faire par personne.
    const pot = (x) => {
      const d = x.annonces, c = cibles.find((y) => y.ref === x.cible_ref), o = fichesOutil.find((y) => y.ref === x.cible_ref);
      if (!d || (!c && !o)) return null;
      const A = fichePotentiel(d, { age: ageAu(d.birth_date, now()) }), B = c ? fichePotentiel(c, { age: ageAu(c.birth_date, now()) }) : fichePotentiel(o, { outil: true });
      return potentiel(A, B, { a: `n° ${d.ref}`, b: `n° ${x.cible_ref}` });
    };
    const resume = (a) => a && ({ ref: a.ref, prenom: a.prenom, genre: a.genre, age: ageAu(a.birth_date, now()), ville: a.ville, pays: a.pays, status: a.status, contact: a.matching?.contactReseau || '' });
    const outils = await outilParRef(refs);
    const resumeOutil = (o) => o && ({ ref: o.ref, genre: o.genre, age: o.age, ville: '', pays: o.pays || '' });
    const so = await scoresOutil(list.map((x) => [x.annonces?.ref, x.cible_ref]));
    const potFinal = (x) => { const o = so(x.annonces?.ref, x.cible_ref); const simple = pot(x); return o ? { score: o.score, niveau: o.niveau, outil: true, forts: simple?.forts || [], vigilance: simple?.vigilance || [] } : simple ? { ...simple, provisoire: true } : null; };
    // Pour jauger chaque personne : ce que Lamia lui a proposé, et les meilleurs scores de l'outil pas encore demandés ni proposés.
    const demandeurs = [...new Set(list.map((x) => x.annonces?.ref).filter(Boolean))];
    const props = demandeurs.length ? await read(`/rest/v1/propositions?pour_ref=in.(${demandeurs.join(',')})&select=pour_ref,cible_ref,reponse,created_at`).catch(() => []) : [];
    const meilleurs = demandeurs.length ? await read(`/rest/v1/scores_outil?a_ref=in.(${demandeurs.join(',')})&select=a_ref,b_ref,score,niveau&order=score.desc&limit=600`).catch(() => []) : [];
    const enCours = await matchsEnCoursParPersonne().catch(() => null);
    const parPersonne = Object.fromEntries(demandeurs.map((r) => {
      const deja = new Set([...list.filter((x) => x.annonces?.ref === r).map((x) => x.cible_ref), ...props.filter((p) => p.pour_ref === r).map((p) => p.cible_ref)]);
      return [r, { matchs_en_cours: enCours?.deRef(r) || 0, proposes: props.filter((p) => p.pour_ref === r).map((p) => ({ ...p, score: so(r, p.cible_ref)?.score ?? null })), suggestions: meilleurs.filter((m) => m.a_ref === r && !deja.has(m.b_ref)).slice(0, 5).map((m) => ({ ref: m.b_ref, score: m.score, niveau: m.niveau })) }];
    }));
    return json({ ok: true, personnes: parPersonne, demandes: list.map((x) => ({ id: x.id, statut: x.statut, created_at: x.created_at, reciproque: Boolean(x.reciproque), reponse: x.reponse || null, cible_compte: x.cible_ref >= REF_OUTIL ? Boolean(outils.find((o) => o.ref === x.cible_ref)?.user_id) : true, via: x.via, potentiel: potFinal(x), demandeur: resume(x.annonces), cible: resume(cibles.find((c) => c.ref === x.cible_ref)) || resumeOutil(outils.find((o) => o.ref === x.cible_ref)) || { ref: x.cible_ref } })) });
  }
  // Écrire soi-même à quelqu'un : le message préparé selon sa situation et le lien vers son réseau. Lamia relit, copie, ouvre et envoie.
  if (action === 'annonce_contact_preparer') {
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0)) return json({ error: 'bad_request' }, 400);
    const espace = 'https://lamia-femme-berbere.com/mon-espace/';
    const fin = 'Merci pour ton soutien, pour moi et mes idées 🥰';
    const [c] = await read(`/rest/v1/contacts_lamia?ref=eq.${ref}&select=reseau,pseudo,dernier_at`).catch(() => []);
    let contact = '', telephone = '', message = '';
    if (ref >= REF_OUTIL) {
      const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=ref,user_id,retire_at,effacement_at`).catch(() => []);
      if (!f) return json({ error: 'profil_absent_du_site' }, 404);
      if (f.retire_at || f.effacement_at) return json({ error: 'fiche_retiree' }, 409);
      contact = c?.pseudo ? `${c.reseau === 'tiktok' ? 'tiktok.com/@' : c.reseau === 'instagram' ? 'instagram.com/' : 'facebook.com/'}${c.pseudo}` : '';
      message = f.user_id
        ? `Salam ! Tu as reçu une demande de match 💌 Va vite dans ton espace pour confirmer ou refuser : ${espace}\n${fin}`
        : `Salam ! Voici le lien de ton annonce : ${lienFiche(ref)}\nTu as reçu des demandes de match 💌 Va vite créer ton profil, puis confirme ou refuse. Si tu es déjà en couple, annule ton annonce sur Lamia Femme Berbère. ${fin}`;
    } else {
      const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=ref,prenom,status,phone,matching`).catch(() => []);
      if (!a) return json({ error: 'profil_absent_du_site' }, 404);
      contact = a.matching?.contactReseau || a.matching?.tiktokLive || '';
      telephone = a.phone || '';
      const salut = `Salam ${a.prenom || ''} !`.replace('  ', ' ');
      if (b.role === 'cible') message = `${salut} Tu as reçu une demande de match 💌 Va vite dans ton espace pour confirmer ou refuser : ${espace}\n${fin}`;
      else if (b.role === 'demandeur') message = `${salut} J’ai bien vu ta demande de match sur ton annonce n° ${ref} 💌 Tu peux suivre sa réponse dans ton espace : ${espace}\n${fin}`;
      else if (a.status === 'publiee') message = `${salut} Ton annonce n° ${ref} est bien publiée sur Lamia Femme Berbère. Tu la retrouves dans ton espace : ${espace}\n${fin}`;
      else if (a.status === 'refusee') message = `${salut} Ton annonce n° ${ref} a besoin d’une correction avant d’être publiée. Regarde dans ton espace : ${espace}\n${fin}`;
      else message = `${salut} J’ai bien reçu ton annonce n° ${ref}. Il me manque peut-être une information pour la valider : vérifie-la dans ton espace : ${espace}\n${fin}`;
    }
    return json({ ok: true, ref, message, ...lienContact(contact, telephone, message), dernier_at: c?.dernier_at || null });
  }
  if (action === 'annonce_contact_note') {
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0)) return json({ error: 'bad_request' }, 400);
    await call('/rest/v1/contacts_lamia?on_conflict=ref', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ref, dernier_at: now().toISOString() }) });
    return json({ ok: true });
  }
  if (action === 'annonce_proposer') {
    const pour = Number.parseInt(b.pour, 10), cible = Number.parseInt(b.cible, 10);
    if (!(pour > 0) || !(cible > 0) || pour === cible) return json({ error: 'bad_request' }, 400);
    const membre = await compteDeRef(pour);
    if (!membre) return json({ error: 'pas_de_compte' }, 409);
    await call('/rest/v1/propositions?on_conflict=pour_ref,cible_ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ pour_ref: pour, cible_ref: cible, potentiel: Number.parseInt(b.score, 10) || null, message: clean(b.message, 300) || null }) });
    await prevenirMembre(membre, { titre: `{A}, Lamia te propose un profil`, texte: 'Lamia a trouvé un profil qui pourrait te correspondre. Découvre sa fiche (anonyme) dans ton espace et dis-lui si elle t’intéresse.', bouton: 'Voir le profil proposé', lien: '/mon-espace/#propositions' });
    return json({ ok: true });
  }
  if (action === 'annonce_a_faire') {
    const manquesAttente = await autoValiderEnAttente().catch(() => ({}));
    const t = now(), fin = new Date(t.getTime() + 48 * 3600e3).toISOString();
    const depuis = new Date(t.getTime() - 7 * 864e5).toISOString(), semaine = new Date(t.getTime() + 7 * 864e5).toISOString();
    const [verif, dem, fiches, props, nouv, evs, coachs, blocs, signs] = await Promise.all([
      read('/rest/v1/annonces?status=eq.a_verifier&test=eq.false&select=ref,prenom').catch(() => []),
      read('/rest/v1/annonce_interets?statut=eq.a_traiter&select=reciproque,annonces!inner(ref,test)').catch(() => []),
      read('/rest/v1/profils_outil?visible=eq.true&retire_at=is.null&select=confirme_at,modif_at,effacement_at').catch(() => []),
      read('/rest/v1/propositions?reponse=eq.oui&select=pour_ref,cible_ref,repondu_at&order=repondu_at.desc&limit=50').catch(() => []),
      read('/rest/v1/nouveautes?envoyee_at=is.null&select=id').catch(() => []),
      read(`/rest/v1/speed_dating_events?status=in.(published,sold_out)&ends_at=gte.${encodeURIComponent(t.toISOString())}&starts_at=lte.${encodeURIComponent(fin)}&select=id,title,audience,starts_at,capacity&order=starts_at`).catch(() => []),
      read(`/rest/v1/coaching_creneaux?user_id=not.is.null&debut=gte.${encodeURIComponent(new Date(t.getTime() - 3600e3).toISOString())}&debut=lte.${encodeURIComponent(semaine)}&select=debut,duree_min,prenom,email&order=debut`).catch(() => []),
      read(`/rest/v1/blocages?created_at=gte.${encodeURIComponent(depuis)}&select=auteur_ref,cible_ref,motif,created_at&order=created_at.desc&limit=30`).catch(() => []),
      read('/rest/v1/signalements?traite_at=is.null&select=id,auteur_ref,cible_ref,motif,created_at&order=created_at.desc&limit=30').catch(() => []),
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
      coachings: coachs.map((c) => ({ debut: c.debut, duree: c.duree_min, prenom: c.prenom, email: c.email })),
      blocages: blocs, signalements: signs,
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
  // Lamia a regardé un signalement : il sort de la liste « à traiter ».
  if (action === 'annonce_signalement_traite') {
    const id = clean(b.id, 40);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400);
    await patch('signalements', `id=eq.${id}&traite_at=is.null`, { traite_at: now().toISOString() });
    return json({ ok: true });
  }
  if (action === 'annonce_effacement_fait') {
    const ref = entier(b.ref, 1, 999999);
    if (!ref) return json({ error: 'bad_request' }, 400);
    await patch('profils_outil', `ref=eq.${ref}&retire_at=not.is.null`, { effacement_fait_at: now().toISOString(), visible: false, profil: 'Fiche effacée à la demande de la personne.', recherche: 'Fiche effacée à la demande de la personne.', ville: null, village: null, secteur: null, caracteristiques: [], origine: [], etudes: null, modif_demandee: null, user_id: null });
    return json({ ok: true });
  }
  if (action === 'annonce_recommander') {
    const r = await poserRecommandation(Number.parseInt(b.ref, 10), Boolean(b.oui));
    return r ? json({ ok: true, ...r }) : json({ error: 'not_found' }, 404);
  }
  if (action === 'annonce_recommandes') {
    const [aa, ff] = await Promise.all([read('/rest/v1/annonces?recommande_at=not.is.null&select=ref,genre,birth_date,ville&limit=200').catch(() => []), read('/rest/v1/profils_outil?recommande_at=not.is.null&select=ref,genre,age,ville&limit=200').catch(() => [])]);
    return json({ ok: true, profils: [...aa.map((x) => ({ ref: x.ref, genre: x.genre, age: ageAu(x.birth_date, now()), ville: x.ville })), ...ff.map((x) => ({ ref: x.ref, genre: x.genre, age: x.age, ville: x.ville }))] });
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
    // Photos qui ne montrent pas la personne : elles sont supprimées et on lui en redemande. Son swipe se bloque jusqu'aux nouvelles.
    if (b.decision === 'photos_refuser') {
      const med = files.filter((f) => f.kind === 'photo' || f.kind === 'video');
      if (med.length) await call(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: med.map((f) => f.storage_path) }) }).catch(() => {});
      for (const f of med) await call(`/rest/v1/annonce_files?id=eq.${f.id}`, { method: 'DELETE' }).catch(() => {});
      await prevenirMembre(a, { titre: '{A}, tes photos doivent te montrer', texte: 'Lamia a retiré tes photos car elles ne te montrent pas clairement. Ajoute 2 photos de toi, visage visible, pour continuer à swiper et répondre. Elles restent privées.', bouton: 'Ajouter mes photos', lien: '/mon-espace/#photos', pied: 'Tes photos ne sont pas affichées dans les profils.' }).catch(() => {});
      return json({ ok: true, retirees: med.length });
    }
    if (b.decision === 'bonus_match') {
      const prochain = await prochainMatchLive(a);
      if (prochain) return json({ error: 'match_live_trop_tot', prochain, message: `Déjà un match offert en live : le prochain est possible à partir du ${dateFr(prochain)}.` }, 409);
      await patch('annonces', `id=eq.${id}`, { matchs_bonus: (Number(a.matchs_bonus) || 0) + 1, match_live_at: now().toISOString() });
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
      const lien = `${SITE}/rencontres/swipe/`;
      const corps = nb > 0
        ? `D’après l’outil de matching de Lamia, ton profil pourrait correspondre à <strong>${nb} personne${nb > 1 ? 's' : ''}</strong>. Pour discrétion, personne ne sait qui correspond à qui : seule Lamia le sait.</p><p>Swipe les profils pour choisir ceux qui te plaisent. <strong>Tes matchs sont gratuits, 1 à la fois.</strong> Pour aller plus vite et soutenir le live de Lamia, découvre ses formules : https://lamia-femme-berbere.com/abonnement/ (sans engagement).`
        : `Pour le moment, l’outil de matching de Lamia ne trouve pas encore de profil qui te corresponde, mais de nouvelles personnes arrivent chaque semaine. Lamia garde ton profil et te prévient dès qu’une belle correspondance apparaît.`;
      const txt = corps.replace(/<[^>]+>/g, '');
      await email(a.email, nb > 0 ? `${salutDe(a)}, ${nb} profil${nb > 1 ? 's' : ''} pourrai${nb > 1 ? 'ent' : 't'} te correspondre` : `${salutDe(a)}, ton profil est bien chez Lamia`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">${esc(salutDe(a))},</h2><p>${corps}</p>${note ? `<p>Le mot de Lamia : « ${esc(note)} »</p>` : ''}${nb > 0 ? `<p><a href="${lien}" style="display:inline-block;padding:10px 18px;background:#7d1530;color:#fff;border-radius:999px;text-decoration:none">Voir les profils</a></p>` : ''}</div>`,
        `${salutDe(a)},\n\n${txt}${note ? `\n\nLe mot de Lamia : « ${note} »` : ''}${nb > 0 ? `\n\nVoir les profils : ${lien}` : ''}`).catch(() => false);
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
