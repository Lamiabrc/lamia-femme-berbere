// Discussion après une mise en relation par Lamia : 7 jours pour faire connaissance dans l'application,
// puis les deux échangent leurs numéros (chacun donne le sien ; il n'est montré que quand les deux l'ont donné).
// Tant que les numéros ne sont pas échangés, tout moyen de contact écrit dans un message est masqué.
// Lamia ne lit pas les discussions, sauf si l'un des deux la signale.
import { randomUUID } from 'node:crypto';
import { json } from './event-tickets.mjs';
import { sansContact } from './annonces.mjs';
import { telephoneNormal } from '../content/matching-options.mjs';
import { adresse, accord } from './adresse.mjs';
import { vueParcours, validerEtape, ETAPES } from './parcours.mjs';
import { blocageEntre } from './blocages.mjs';

export const DUREE_JOURS = 7;

// Dématch courtois (anti-ghosting) : deux messages chacun pour se dire au revoir, 48 heures au plus.
export const MESSAGES_AU_REVOIR = 2;
export const HEURES_AU_REVOIR = 48;
export const RAISONS_DEMATCH = {
  physique: 'L’attirance physique',
  enfants: 'Le sujet des enfants',
  localisation: 'La distance ou le lieu de vie',
  caractere: 'Le caractère',
  valeurs: 'Les valeurs',
  parcours: 'Une étape du parcours',
  autre: 'Une autre raison',
};
export function raisonLisible(d) {
  if (d.dematch_raison === 'parcours') { const e = ETAPES.find((x) => x.id === d.dematch_etape); if (e) return `L’étape « ${e.mot} » du parcours`; }
  return RAISONS_DEMATCH[d.dematch_raison] || RAISONS_DEMATCH.autre;
}
// Garde-fous (règle de Lamia, 5 nov. 2026).
// 1. Après 3 matchs en 3 jours, 24 heures de pause avant un nouveau match.
export const PAUSE_APRES_MATCHS = 3, PAUSE_FENETRE_HEURES = 72, PAUSE_HEURES = 24;
// Renvoie la date de fin de pause (ISO) si la personne doit attendre, sinon null.
export async function finDePause({ read, now }, userId) {
  if (!userId) return null;
  const t = now();
  const depuis = new Date(t.getTime() - PAUSE_FENETRE_HEURES * 3600e3).toISOString();
  const ds = await read(`/rest/v1/discussions?or=(a_user.eq.${userId},b_user.eq.${userId})&ouverte_at=gte.${encodeURIComponent(depuis)}&select=ouverte_at&order=ouverte_at.desc&limit=${PAUSE_APRES_MATCHS}`).catch(() => []);
  if (ds.length < PAUSE_APRES_MATCHS) return null;
  const fin = new Date(new Date(ds[0].ouverte_at).getTime() + PAUSE_HEURES * 3600e3);
  return fin > t ? fin.toISOString() : null;
}
// 2. Dématcher peu après avoir eu le numéro de l'autre : avertissement, et Lamia est prévenue.
export const HEURES_DEMATCH_RAPIDE = 24;
// 3. Messages vocaux : 2 minutes au plus, dans le stockage privé des annonces.
export const VOCAL_MAX_S = 120, VOCAL_MAX_OCTETS = 4 * 1024 * 1024;
const VOCAL_EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/x-m4a': 'm4a' };
const CONSEIL_NUMERO = '💡 Conseil de Lamia : avant d’échanger vos numéros, prenez le temps de vous poser les vraies questions (projet de mariage, famille, lieu de vie, religion, enfants). Un numéro se donne quand la confiance est là.';
const messagesAuRevoir = (d, messages, userId) => messages.filter((m) => m.auteur === userId && new Date(m.created_at) >= new Date(d.dematch_at)).length;

// Combien de matchs en cours a chaque personne (une même personne peut avoir un profil et une fiche de l'outil).
// liens : [{ id, a, b }] avec les références des deux profils ; compteDe : référence → compte.
export function compterMatchs(liens, compteDe) {
  const cle = (ref) => { const u = compteDe.get(ref); return u ? `u:${u}` : `r:${ref}`; };
  const parCle = new Map();
  for (const l of liens) for (const ref of [l.a, l.b]) { const k = cle(ref); if (!parCle.has(k)) parCle.set(k, new Set()); parCle.get(k).add(l.id); }
  return { deRef: (ref) => parCle.get(cle(ref))?.size || 0, deCompte: (id) => parCle.get(`u:${id}`)?.size || 0 };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

// Ouverte au moment de la mise en relation, si les deux personnes ont un compte LFB.
export async function ouvrirDiscussion({ read, insert, now }, { interetId, a, b }) {
  if (!a?.user_id || !b?.user_id || a.user_id === b.user_id) return null;
  if (await blocageEntre({ read }, a.ref, b.ref)) return null;
  const [deja] = await read(`/rest/v1/discussions?interet_id=eq.${interetId}&select=id`).catch(() => []);
  if (deja) return deja;
  const t = now();
  return insert('discussions', {
    interet_id: interetId, a_user: a.user_id, b_user: b.user_id, a_ref: a.ref ?? null, b_ref: b.ref ?? null,
    a_prenom: clean(a.prenom, 40) || null, b_prenom: clean(b.prenom, 40) || null,
    ouverte_at: t.toISOString(), ferme_at: new Date(t.getTime() + DUREE_JOURS * 86400e3).toISOString(),
  }).catch(() => null);
}

// Fin du match (dématch) : la discussion se ferme.
export async function fermerDiscussion({ patch, now }, interetId, raison = 'dematch') {
  await patch('discussions', `interet_id=eq.${interetId}&close_raison=is.null`, { ferme_at: now().toISOString(), close_raison: raison }).catch(() => {});
}

// Le prénom reste caché tant que la personne n'a pas choisi de le partager.
const prenomVisible = (d, cote) => (d[`${cote}_prenom_partage_at`] && d[`${cote}_prenom`]) || null;
const nomVisible = (d, cote) => prenomVisible(d, cote) || 'Ton match';
// « Plus tard » : on repose la question après quelques messages échangés, sans insister entre-temps.
const MESSAGES_AVANT_RAPPEL_PRENOM = 6;
function etatPrenom(d, cote, messages, ouverte) {
  const partage = Boolean(d[`${cote}_prenom_partage_at`]);
  const tard = d[`${cote}_prenom_plus_tard_at`];
  const depuis = tard ? messages.filter((m) => new Date(m.created_at) > new Date(tard) && m.auteur !== null).length : 0;
  return { mien: d[`${cote}_prenom`] || null, partage, demander: ouverte && !d.dematch_at && !partage && (!tard || depuis >= MESSAGES_AVANT_RAPPEL_PRENOM) };
}

// Vue d'une discussion pour l'un des deux.
function vue(d, moi, messages, t, matchs = null) {
  const cote = d.a_user === moi ? 'a' : 'b', autre = cote === 'a' ? 'b' : 'a';
  const echange = Boolean(d.a_numero && d.b_numero);
  const ouverte = !d.close_raison && new Date(d.ferme_at) > t;
  return {
    id: d.id, avec: prenomVisible(d, autre) || `Profil n° ${d[`${autre}_ref`] ?? '?'}`, avec_ref: d[`${autre}_ref`],
    prenom: etatPrenom(d, cote, messages, ouverte),
    ouverte, ferme_at: d.ferme_at, close_raison: d.close_raison || null, signalee: Boolean(d.signalee_at),
    mon_numero: d[`${cote}_numero`] || null, son_numero: echange ? d[`${autre}_numero`] : null,
    il_a_partage: Boolean(d[`${autre}_numero`]), echange, numeros_at: d.numeros_at || null,
    prolongeable: !d.close_raison && !echange && !d.dematch_at,
    dematch: d.dematch_at ? {
      par_moi: d.dematch_par === cote, raison: raisonLisible(d), fin: d.ferme_at,
      restants: Math.max(0, MESSAGES_AU_REVOIR - messagesAuRevoir(d, messages, moi)),
      son_message: messagesAuRevoir(d, messages, d[`${autre}_user`]) > 0,
    } : null,
    // Par honnêteté : seulement un nombre, jamais qui.
    ses_autres_matchs: matchs && !d.close_raison ? Math.max(0, matchs.deCompte(d[`${autre}_user`]) - 1) : 0,
    mes_autres_matchs: matchs && !d.close_raison ? Math.max(0, matchs.deCompte(moi) - 1) : 0,
    messages: messages.map((m) => ({ moi: m.auteur === moi, lamia: m.auteur === null, texte: m.texte, le: m.created_at, audio: m.audio_url || null, duree: m.audio_duree || null })),
    nb_echanges: messages.filter((m) => m.auteur !== null).length,
    parcours: vueParcours(d, cote),
  };
}

export async function actionDiscussion(action, b, { read, insert, patch, now, user, pousserMembre, alerter, quiEst, matchsEnCoursParPersonne = null, terminerDematch = null, signerAudio = null, lienDepotAudio = null }) {
  if (!user) return json({ error: 'login_required' }, 401);
  const t = now();
  const mesDiscussions = () => read(`/rest/v1/discussions?or=(a_user.eq.${user.id},b_user.eq.${user.id})&select=*&order=ouverte_at.desc&limit=10`).catch(() => []);
  const laMienne = async () => {
    const id = clean(b.id, 40);
    if (!UUID.test(id)) return null;
    const [d] = await read(`/rest/v1/discussions?id=eq.${id}&or=(a_user.eq.${user.id},b_user.eq.${user.id})&select=*`).catch(() => []);
    return d || null;
  };

  if (action === 'annonce_discussions') {
    const ds = await mesDiscussions();
    const out = [];
    const matchs = matchsEnCoursParPersonne ? await matchsEnCoursParPersonne().catch(() => null) : null;
    for (const d of ds) {
      const msgs = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&select=auteur,texte,created_at,audio_path,audio_duree&order=created_at.asc&limit=300`).catch(() => []);
      const audios = msgs.filter((m) => m.audio_path);
      const urls = audios.length && signerAudio ? await signerAudio(audios.map((m) => m.audio_path)).catch(() => ({})) : {};
      for (const m of audios) m.audio_url = urls[m.audio_path] || null;
      out.push(vue(d, user.id, msgs, t, matchs));
    }
    const moi = quiEst ? await quiEst(user.id).catch(() => ({})) : {};
    return json({ ok: true, discussions: out, duree_jours: DUREE_JOURS, adresse: adresse(moi.genre, moi.prenom), accord: accord(moi.genre) });
  }

  const d = await laMienne();
  if (!d) return json({ error: 'not_found' }, 404);
  const cote = d.a_user === user.id ? 'a' : 'b', autre = cote === 'a' ? 'b' : 'a';
  const ouverte = !d.close_raison && new Date(d.ferme_at) > t;

  if (action === 'annonce_discussion_envoyer') {
    if (!ouverte) return json({ error: 'discussion_fermee' }, 409);
    let texte = clean(b.texte, 1000);
    // Message vocal déposé juste avant (annonce_discussion_vocal_lien) : son chemin doit être dans cette discussion.
    const audio = clean(b.audio_path, 200);
    const vocal = audio && new RegExp(`^discussions/${d.id}/[0-9a-f-]{36}\\.(webm|m4a|ogg|mp3|aac)$`).test(audio) ? audio : null;
    if (audio && !vocal) return json({ error: 'bad_request' }, 400);
    if (vocal) texte = '🎤 Message vocal';
    if (!texte) return json({ error: 'bad_request' }, 400);
    const auRevoir = d.dematch_at ? await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&created_at=gte.${encodeURIComponent(d.dematch_at)}&select=auteur,created_at&limit=20`).catch(() => []) : null;
    if (auRevoir && messagesAuRevoir(d, auRevoir, user.id) >= MESSAGES_AU_REVOIR) return json({ error: 'au_revoir_fini' }, 409);
    // Avant l'échange des numéros, pas de contact en clair (sécurité) : le bouton « Échanger nos numéros » est fait pour ça.
    const echange = Boolean(d.a_numero && d.b_numero);
    const masque = echange || vocal ? texte : sansContact(texte);
    texte = masque;
    // Pas de limite pour une vraie conversation. Seul un robot peut envoyer plus de 60 messages en une minute.
    const recents = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&auteur=eq.${user.id}&created_at=gte.${encodeURIComponent(new Date(t.getTime() - 60e3).toISOString())}&select=id&limit=61`).catch(() => []);
    if (recents.length >= 60) return json({ error: 'rate_limited' }, 429);
    await insert('discussion_messages', { discussion_id: d.id, auteur: user.id, texte, ...(vocal ? { audio_path: vocal, audio_duree: Math.max(1, Math.min(VOCAL_MAX_S, Number.parseInt(b.duree, 10) || 0)) } : {}) });
    // Chacun a dit au revoir : le match se termine sans attendre les 48 heures.
    if (auRevoir && messagesAuRevoir(d, auRevoir, user.id) + 1 >= MESSAGES_AU_REVOIR && messagesAuRevoir(d, auRevoir, d[`${autre}_user`]) >= MESSAGES_AU_REVOIR && terminerDematch) {
      await terminerDematch(d).catch(() => {});
      return json({ ok: true, masque: masque !== clean(b.texte, 1000), termine: true });
    }
    // Notification à l'autre, au plus une toutes les 10 minutes.
    const champ = `notif_${autre}_at`;
    if (!d[champ] || t - new Date(d[champ]) > 600e3) {
      await patch('discussions', `id=eq.${d.id}`, { [champ]: t.toISOString() }).catch(() => {});
      await pousserMembre(d[`${autre}_user`], { titre: vocal ? `🎤 ${nomVisible(d, cote)} t’a laissé un vocal` : `💬 ${nomVisible(d, cote)} t’a écrit`, texte: vocal ? '{A}, écoute-le dans ton espace.' : '{A}, réponds-lui dans ton espace.', lien: '/mon-espace/#discussion' }).catch(() => {});
    }
    return json({ ok: true, masque: masque !== clean(b.texte, 1000) });
  }

  // Lien pour déposer un message vocal (envoyé ensuite avec annonce_discussion_envoyer et son chemin).
  if (action === 'annonce_discussion_vocal_lien') {
    if (!ouverte) return json({ error: 'discussion_fermee' }, 409);
    if (d.dematch_at) return json({ error: 'vocal_au_revoir' }, 409);
    const mime = clean(b.mime, 60).split(';')[0];
    const ext = VOCAL_EXT[mime];
    if (!ext) return json({ error: 'file_type' }, 400);
    if (!(Number(b.taille) > 0) || Number(b.taille) > VOCAL_MAX_OCTETS) return json({ error: 'vocal_trop_long' }, 400);
    if (Number(b.duree) > VOCAL_MAX_S + 2) return json({ error: 'vocal_trop_long' }, 400);
    if (!lienDepotAudio) return json({ error: 'indisponible' }, 503);
    const path = `discussions/${d.id}/${randomUUID()}.${ext}`;
    const url = await lienDepotAudio(path).catch(() => null);
    if (!url) return json({ error: 'indisponible' }, 503);
    return json({ ok: true, path, url, type: mime });
  }

  if (action === 'annonce_discussion_dematcher') {
    if (!ouverte) return json({ error: 'discussion_fermee' }, 409);
    if (d.dematch_at) return json({ error: 'deja_dematche' }, 409);
    const raison = clean(b.raison, 20);
    if (!RAISONS_DEMATCH[raison]) return json({ error: 'raison_requise' }, 400);
    const etape = raison === 'parcours' ? clean(b.etape, 40) : null;
    if (raison === 'parcours' && !ETAPES.some((x) => x.id === etape)) return json({ error: 'raison_requise' }, 400);
    // Numéros échangés il y a moins de 24 heures : on prévient d'abord la personne, et Lamia le saura.
    const rapide = d.numeros_at && t - new Date(d.numeros_at) < HEURES_DEMATCH_RAPIDE * 3600e3;
    if (rapide && b.confirme !== true) return json({ error: 'avertissement_numero', message: 'Attention : tu as obtenu le numéro de ton match il y a moins de 24 heures. Récupérer des numéros puis dématcher très vite peut être pénalisé (pause, voire suspension de ton profil). La prochaine fois, prends le temps de poser plus de questions avant de demander un numéro. Veux-tu quand même mettre fin à ce match ?' }, 409);
    const fin = new Date(t.getTime() + HEURES_AU_REVOIR * 3600e3).toISOString();
    const maj = { dematch_par: cote, dematch_raison: raison, dematch_etape: etape, dematch_at: t.toISOString(), ferme_at: fin };
    await patch('discussions', `id=eq.${d.id}&close_raison=is.null`, maj);
    const qui = prenomVisible(d, cote) || 'La personne', motif = raisonLisible({ ...d, ...maj });
    await insert('discussion_messages', { discussion_id: d.id, auteur: null, texte: `${qui} met fin à ce match, avec tout son respect. Raison : ${motif}. Vous avez chacun ${MESSAGES_AU_REVOIR} messages pour vous dire au revoir.` });
    if (rapide) {
      // Combien de fois en 30 jours cette personne a dématché moins de 24 heures après l'échange des numéros.
      const depuis = new Date(t.getTime() - 30 * 86400e3).toISOString();
      const siennes = await read(`/rest/v1/discussions?or=(a_user.eq.${user.id},b_user.eq.${user.id})&dematch_at=gte.${encodeURIComponent(depuis)}&numeros_at=not.is.null&select=a_user,dematch_par,dematch_at,numeros_at`).catch(() => []);
      const fois = Math.max(1, siennes.filter((x) => x[`${x.dematch_par}_user`] === user.id && new Date(x.dematch_at) - new Date(x.numeros_at) < HEURES_DEMATCH_RAPIDE * 3600e3).length);
      const h = Math.max(1, Math.round((t - new Date(d.numeros_at)) / 3600e3));
      await alerter({ titre: `⚠️ Dématch rapide après échange de numéros · n° ${d[`${cote}_ref`]}`, lignes: [`${d[`${cote}_prenom`] || 'La personne'} (n° ${d[`${cote}_ref`]}) met fin au match avec le n° ${d[`${autre}_ref`]} ${h} h après avoir eu son numéro.`, fois > 1 ? `C’est la ${fois}e fois en 30 jours : regarde s’il faut lui parler ou suspendre son profil.` : 'Première fois en 30 jours : la personne a été avertie.'], lien: '/tableau-de-bord#application', tag: 'reserve' }).catch(() => {});
    }
    await pousserMembre(d[`${autre}_user`], { titre: `💌 ${qui} met fin à votre match`, texte: `{A}, un au revoir t’attend dans votre discussion. Raison : ${motif}. Tu peux lui répondre pendant ${HEURES_AU_REVOIR} heures.`, lien: '/mon-espace/#discussion' }).catch(() => {});
    return json({ ok: true, fin, restants: MESSAGES_AU_REVOIR });
  }

  if (action === 'annonce_discussion_numero') {
    if (d.dematch_at) return json({ error: 'discussion_fermee' }, 409);
    const tel = telephoneNormal(b.telephone);
    if (!tel) return json({ error: 'telephone_invalide' }, 400);
    const echange = Boolean(d[`${autre}_numero`]), premier = !d.a_numero && !d.b_numero;
    await patch('discussions', `id=eq.${d.id}`, { [`${cote}_numero`]: tel, ...(echange && !d.numeros_at ? { numeros_at: t.toISOString() } : {}) });
    // Premier numéro proposé : le conseil de Lamia s'affiche pour les deux, une seule fois.
    if (premier) await insert('discussion_messages', { discussion_id: d.id, auteur: null, texte: CONSEIL_NUMERO }).catch(() => {});
    await pousserMembre(d[`${autre}_user`], echange
      ? { titre: '📞 Vous avez échangé vos numéros !', texte: `{A}, le numéro de ${prenomVisible(d, cote) || 'ton match'} est dans ton espace. Belle suite à vous deux.`, lien: '/mon-espace/#discussion' }
      : { titre: `📞 ${nomVisible(d, cote)} veut passer au téléphone`, texte: '{A}, donne ton numéro dans ton espace : vous le verrez tous les deux.', lien: '/mon-espace/#discussion' }).catch(() => {});
    if (echange) await alerter({ titre: `📞 Numéros échangés · n° ${d.a_ref} ↔ n° ${d.b_ref}`, lignes: [`${d.a_prenom || '?'} et ${d.b_prenom || '?'} passent au téléphone.`], lien: '/tableau-de-bord#application', tag: 'reciproque' }).catch(() => {});
    return json({ ok: true, echange });
  }

  // Partager son prénom est un choix de chacun, à tout moment : maintenant, ou plus tard après les premiers échanges.
  if (action === 'annonce_discussion_prenom') {
    if (!ouverte || d.dematch_at) return json({ error: 'discussion_fermee' }, 409);
    if (b.choix === 'plus_tard') {
      await patch('discussions', `id=eq.${d.id}`, { [`${cote}_prenom_plus_tard_at`]: t.toISOString() });
      return json({ ok: true });
    }
    if (b.choix !== 'partager') return json({ error: 'bad_request' }, 400);
    if (d[`${cote}_prenom_partage_at`]) return json({ ok: true });
    const prenom = d[`${cote}_prenom`] || clean((quiEst ? await quiEst(user.id).catch(() => ({})) : {}).prenom, 40);
    if (!prenom) return json({ error: 'prenom_absent' }, 409);
    await patch('discussions', `id=eq.${d.id}`, { [`${cote}_prenom`]: prenom, [`${cote}_prenom_partage_at`]: t.toISOString() });
    await insert('discussion_messages', { discussion_id: d.id, auteur: null, texte: `Ton match partage son prénom : ${prenom}.` });
    await pousserMembre(d[`${autre}_user`], { titre: `👋 ${prenom} t’a donné son prénom`, texte: '{A}, tu peux aussi partager le tien quand tu veux, dans votre discussion.', lien: '/mon-espace/#discussion' }).catch(() => {});
    return json({ ok: true, prenom });
  }

  if (action === 'annonce_parcours_valider') {
    const vuePourMoi = vueParcours(d, cote);
    if (!vuePourMoi) return json({ error: 'not_found' }, 404);
    if (!vuePourMoi.actif) return json({ error: 'discussion_fermee' }, 409);
    const r = validerEtape(d, cote, clean(b.etape, 40));
    if (r.error) return json({ error: r.error }, 409);
    if (r.deja) return json({ ok: true });
    await patch('discussions', `id=eq.${d.id}`, { parcours: r.parcours });
    const prenom = nomVisible(d, cote);
    await pousserMembre(d[`${autre}_user`], r.franchie
      ? { titre: `💍 Étape franchie à deux : ${r.etape.titre}`, texte: '{A}, la suite de votre parcours vous attend dans ton espace.', lien: '/mon-espace/#discussion' }
      : { titre: `💍 ${prenom} a validé une étape`, texte: `{A}, à toi de valider « ${r.etape.titre} » quand tu es prêt·e.`, lien: '/mon-espace/#discussion' }).catch(() => {});
    if (r.fini) await alerter({ titre: `💍 Parcours terminé · n° ${d.a_ref} ↔ n° ${d.b_ref}`, lignes: [`${d.a_prenom || '?'} et ${d.b_prenom || '?'} ont validé toutes les étapes jusqu’au mariage.`], lien: '/tableau-de-bord#application', tag: 'reciproque' }).catch(() => {});
    return json({ ok: true, franchie: Boolean(r.franchie), fini: Boolean(r.fini) });
  }

  if (action === 'annonce_discussion_signaler') {
    const motif = clean(b.motif, 500);
    await patch('discussions', `id=eq.${d.id}`, { signalee_at: t.toISOString(), signalee_par: user.id, ferme_at: t.toISOString(), close_raison: 'signalee' });
    await alerter({ titre: `🚩 Discussion signalée · n° ${d[`${cote}_ref`]} signale n° ${d[`${autre}_ref`]}`, lignes: [motif || 'Sans motif.', 'La discussion est fermée. Lis-la dans ton tableau de bord, onglet Application.'], lien: '/tableau-de-bord#application', tag: 'reserve' }).catch(() => {});
    return json({ ok: true });
  }

  return json({ error: 'unknown_action' }, 400);
}

// Pour Lamia : la liste des discussions (sans le contenu), et le contenu seulement d'une discussion signalée.
export async function discussionsPourLamia({ read }, idSignalee = null) {
  const ds = await read('/rest/v1/discussions?select=id,a_ref,b_ref,a_prenom,b_prenom,ouverte_at,ferme_at,a_numero,b_numero,signalee_at,close_raison&order=ouverte_at.desc&limit=100').catch(() => []);
  const nb = await read('/rest/v1/discussion_messages?select=discussion_id&limit=5000').catch(() => []);
  const compte = {};
  for (const m of nb) compte[m.discussion_id] = (compte[m.discussion_id] || 0) + 1;
  let messages = null;
  if (idSignalee && UUID.test(idSignalee) && ds.find((x) => x.id === idSignalee && x.signalee_at)) {
    const [d] = await read(`/rest/v1/discussions?id=eq.${idSignalee}&select=a_user,a_prenom,a_ref,b_prenom,b_ref`).catch(() => []);
    messages = (await read(`/rest/v1/discussion_messages?discussion_id=eq.${idSignalee}&select=auteur,texte,created_at&order=created_at.asc&limit=500`).catch(() => []))
      .map((m) => ({ qui: m.auteur === d?.a_user ? `${d?.a_prenom || ''} (n° ${d?.a_ref})` : `${d?.b_prenom || ''} (n° ${d?.b_ref})`, texte: m.texte, created_at: m.created_at }));
  }
  const t = Date.now();
  return {
    discussions: ds.map((x) => ({ id: x.id, a_ref: x.a_ref, b_ref: x.b_ref, a_prenom: x.a_prenom, b_prenom: x.b_prenom, ouverte_at: x.ouverte_at, ferme_at: x.ferme_at, messages: compte[x.id] || 0,
      etat: x.signalee_at ? 'signalee' : x.a_numero && x.b_numero ? 'numeros' : x.close_raison ? x.close_raison : new Date(x.ferme_at) > t ? 'ouverte' : 'terminee' })),
    messages,
  };
}

// Rappel 24 h avant la fin (lancé par la tâche quotidienne).
export async function rappelsDiscussions({ read, patch, now, pousserMembre }) {
  const t = now();
  const ds = await read(`/rest/v1/discussions?close_raison=is.null&rappel_at=is.null&ferme_at=gt.${encodeURIComponent(t.toISOString())}&ferme_at=lt.${encodeURIComponent(new Date(t.getTime() + 36 * 3600e3).toISOString())}&select=*`).catch(() => []);
  for (const d of ds) {
    if (d.a_numero && d.b_numero) continue;
    await patch('discussions', `id=eq.${d.id}`, { rappel_at: t.toISOString() }).catch(() => {});
    for (const c of ['a', 'b']) await pousserMembre(d[`${c}_user`], { titre: '⏳ {A}, ta discussion se termine demain', texte: 'Si le courant passe, échangez vos numéros avant la fin.', lien: '/mon-espace/#discussion' }).catch(() => {});
  }
  return ds.length;
}

// Passage quotidien : un rappel à qui n'a pas encore dit au revoir, puis fin du match après 48 heures.
export async function suiviDematchs({ read, patch, now, pousserMembre, terminerDematch }) {
  const t = now();
  const liste = await read('/rest/v1/discussions?dematch_at=not.is.null&close_raison=is.null&select=*&limit=100').catch(() => []);
  let rappels = 0, termines = 0;
  for (const d of liste) {
    if (new Date(d.ferme_at) <= t) { await terminerDematch(d).catch(() => {}); termines += 1; continue; }
    if (d.dematch_rappel_at) continue;
    const auteur = d[`${d.dematch_par}_user`];
    const msgs = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&auteur=eq.${auteur}&created_at=gte.${encodeURIComponent(d.dematch_at)}&select=id&limit=1`).catch(() => []);
    if (msgs.length) continue;
    await patch('discussions', `id=eq.${d.id}`, { dematch_rappel_at: t.toISOString() });
    await pousserMembre(auteur, { titre: '🤝 Un au revoir reste à écrire', texte: '{A}, ton match attend un mot de ta part. Deux messages suffisent pour partir avec élégance.', lien: '/mon-espace/#discussion' }).catch(() => {});
    rappels += 1;
  }
  return { rappels, termines };
}

