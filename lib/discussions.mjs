// Discussion après une mise en relation par Lamia : 7 jours pour faire connaissance dans l'application,
// puis les deux échangent leurs numéros (chacun donne le sien ; il n'est montré que quand les deux l'ont donné).
// Tant que les numéros ne sont pas échangés, tout moyen de contact écrit dans un message est masqué.
// Lamia ne lit pas les discussions, sauf si l'un des deux la signale.
import { json } from './event-tickets.mjs';
import { RAISON_COURTE, motifSignalement } from '../content/signalement.mjs';
import { sansContact } from './annonces.mjs';
import { telephoneNormal } from '../content/matching-options.mjs';
import { adresse, accord } from './adresse.mjs';
import { vueParcours, validerEtape, ETAPES } from './parcours.mjs';
import { blocageEntre } from './blocages.mjs';

// Une personne peut écrire si l'un de ses profils (hors test) a ses 2 photos et qu'elles n'ont pas été refusées.
export async function photosOk(read, uid) {
  const annonces = await read(`/rest/v1/annonces?user_id=eq.${uid}&status=in.(publiee,a_verifier,brouillon)&select=id,test,photos_refusees_at`).catch(() => null);
  if (!annonces) return true; // en cas de panne, on ne bloque pas
  if (!annonces.length || annonces.some((a) => a.test)) return true;
  const saines = annonces.filter((a) => !a.photos_refusees_at);
  if (!saines.length) return false;
  const photos = await read(`/rest/v1/annonce_files?annonce_id=in.(${saines.map((a) => a.id).join(',')})&kind=eq.photo&select=annonce_id`).catch(() => null);
  if (!photos) return true;
  const n = {}; for (const f of photos) n[f.annonce_id] = (n[f.annonce_id] || 0) + 1;
  return Object.values(n).some((x) => x >= 2);
}

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

// Ouverte au moment de la mise en relation, si les deux personnes ont un compte TAYRI.
// jours : durée de la discussion (7 par défaut) ; null = sans limite (Prestige).
export const SANS_LIMITE_JOURS = 3650;
export async function ouvrirDiscussion({ read, insert, now }, { interetId, a, b, jours = DUREE_JOURS }) {
  if (!a?.user_id || !b?.user_id || a.user_id === b.user_id) return null;
  if (await blocageEntre({ read }, a.ref, b.ref)) return null;
  const [deja] = await read(`/rest/v1/discussions?interet_id=eq.${interetId}&select=id`).catch(() => []);
  if (deja) return deja;
  const t = now();
  return insert('discussions', {
    interet_id: interetId, a_user: a.user_id, b_user: b.user_id, a_ref: a.ref ?? null, b_ref: b.ref ?? null,
    a_prenom: clean(a.prenom, 40) || null, b_prenom: clean(b.prenom, 40) || null,
    ouverte_at: t.toISOString(), ferme_at: new Date(t.getTime() + (jours === null ? SANS_LIMITE_JOURS : Math.max(1, Number(jours) || DUREE_JOURS)) * 86400e3).toISOString(),
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
    ouverte, ouverte_at: d.ouverte_at || d.created_at || null, ferme_at: d.ferme_at, close_raison: d.close_raison || null, signalee: Boolean(d.signalee_at),
    mon_numero: d[`${cote}_numero`] || null, son_numero: echange ? d[`${autre}_numero`] : null,
    il_a_partage: Boolean(d[`${autre}_numero`]), echange,
    prolongeable: !d.close_raison && !echange && !d.dematch_at,
    dematch: d.dematch_at ? {
      par_moi: d.dematch_par === cote, raison: raisonLisible(d), fin: d.ferme_at,
      restants: Math.max(0, MESSAGES_AU_REVOIR - messagesAuRevoir(d, messages, moi)),
      son_message: messagesAuRevoir(d, messages, d[`${autre}_user`]) > 0,
    } : null,
    // Par honnêteté : seulement un nombre, jamais qui.
    ses_autres_matchs: matchs && !d.close_raison ? Math.max(0, matchs.deCompte(d[`${autre}_user`]) - 1) : 0,
    mes_autres_matchs: matchs && !d.close_raison ? Math.max(0, matchs.deCompte(moi) - 1) : 0,
    messages: messages.map((m) => ({ moi: m.auteur === moi, lamia: m.auteur === null, par_lamia: m.role === 'lamia', texte: m.texte, le: m.created_at })),
    parcours: vueParcours(d, cote),
    lamia_invitee: Boolean(d.lamia_invitee_at),
    // Fin des 7 jours : « C'est fini » ou « On est en couple » (les deux doivent le dire pour ouvrir l'espace commun).
    fin: { mien: d[`${cote}_couple_at`] ? 'couple' : d[`${cote}_fini_at`] ? 'fini' : null, son_couple: Boolean(d[`${autre}_couple_at`]), couple: Boolean(d.a_couple_at && d.b_couple_at) },
  };
}

export async function actionDiscussion(action, b, { read, insert, patch, now, user, pousserMembre, alerter, quiEst, matchsEnCoursParPersonne = null, terminerDematch = null, libererMatch = null, ouvrirCouple = null, pauseCouple = null }) {
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
    // Tout en parallèle (17 nov. 2026 : le n° 146 attendait plus de 20 s et ses messages ne s'affichaient plus).
    const [ds, matchs, moi, mesPhotos, blocages] = await Promise.all([
      mesDiscussions(),
      matchsEnCoursParPersonne ? matchsEnCoursParPersonne().catch(() => null) : null,
      quiEst ? quiEst(user.id).catch(() => ({})) : {},
      photosOk(read, user.id),
      // Les personnes bloquées ne doivent plus apparaître dans la messagerie,
      // y compris parmi les discussions terminées ou signalées.
      read(`/rest/v1/blocages?auteur_user=eq.${user.id}&select=cible_ref,cible_user&limit=2000`),
    ]);
    const refsBloquees = new Set(blocages.map((x) => Number(x.cible_ref)));
    const comptesBloques = new Set(blocages.map((x) => x.cible_user).filter(Boolean));
    const visibles = ds.filter((d) => {
      const autreRef = Number(d.a_user === user.id ? d.b_ref : d.a_ref);
      const autreUid = d.a_user === user.id ? d.b_user : d.a_user;
      return !refsBloquees.has(autreRef) && !comptesBloques.has(autreUid);
    });
    const out = await Promise.all(visibles.map(async (d) => {
      const autreUid = d.a_user === user.id ? d.b_user : d.a_user;
      const ouverteD = !d.close_raison && new Date(d.ferme_at) > t;
      const ficheLive = Number(d[d.a_user === user.id ? 'b_ref' : 'a_ref']) >= 5001;
      const [msgs, profilAutre, sesPhotos] = await Promise.all([
        // Les 300 plus récents (17 nov. 2026 : au-delà de 300 messages, les nouveaux « disparaissaient »).
        read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&select=auteur,texte,created_at,role,auteur_nom&order=created_at.desc&limit=300`).then((l) => [...l].reverse(), () => []),
        ficheLive && autreUid ? read(`/rest/v1/annonces?user_id=eq.${autreUid}&status=in.(a_verifier,publiee)&select=ref&order=ref.asc&limit=1`).then((l) => l[0] || null, () => null) : null,
        ouverteD && autreUid ? photosOk(read, autreUid) : true,
      ]);
      const v = vue(d, user.id, msgs, t, matchs);
      // Un match fermé sans au revoir (annulé, 17 nov. 2026 : n° 142) : rien à demander, il part dans l'historique.
      v.vide = !msgs.some((m) => m.auteur);
      v.annulee = Boolean(d.close_raison && d.close_raison !== 'signalee' && !d.dematch_at);
      // Un seul numéro par personne (le plus court) : une fiche du live reliée à un profil du site affiche le numéro du profil.
      if (/^Profil n° /.test(v.avec) && profilAutre?.ref && Number(profilAutre.ref) !== Number(v.avec_ref)) { v.ancien_ref = v.avec_ref; v.avec = `Profil n° ${profilAutre.ref}`; v.avec_ref = profilAutre.ref; }
      // L'autre n'a plus ses photos (refusées ou absentes) : on le dit, sans détail (Lamia, 17 nov. 2026).
      if (v.ouverte) v.son_bloque_photos = Boolean(autreUid) && !sesPhotos;
      return v;
    }));
    const photosRequises = out.some((x) => x.ouverte) && !mesPhotos;
    return json({ ok: true, discussions: out, duree_jours: DUREE_JOURS, photos_requises: photosRequises, adresse: adresse(moi.genre, moi.prenom), accord: accord(moi.genre) });
  }

  const d = await laMienne();
  if (!d) return json({ error: 'not_found' }, 404);

  if (action === 'annonce_discussion_fin') {
    const cote = d.a_user === user.id ? 'a' : 'b', autre = cote === 'a' ? 'b' : 'a';
    if (d.dematch_at || d.close_raison === 'signalee') return json({ error: 'discussion_fermee' }, 409);
    const couple = b.choix === 'couple';
    await patch('discussions', `id=eq.${d.id}`, { [`${cote}_couple_at`]: couple ? t.toISOString() : null, [`${cote}_fini_at`]: couple ? null : t.toISOString() });
    let ouvert = false;
    if (couple && d[`${autre}_couple_at`] && ouvrirCouple) {
      // Les deux le disent : l'espace commun s'ouvre, la discussion ne se ferme plus, et les deux sortent des rencontres.
      const qui = quiEst ? { a: await quiEst(d.a_user).catch(() => ({})), b: await quiEst(d.b_user).catch(() => ({})) } : { a: {}, b: {} };
      ouvert = Boolean(await ouvrirCouple([{ user_id: d.a_user, prenom: qui.a.prenom }, { user_id: d.b_user, prenom: qui.b.prenom }], d.id).catch(() => null));
      if (ouvert) {
        await patch('discussions', `id=eq.${d.id}`, { ferme_at: new Date(t.getTime() + 100 * 365 * 86400e3).toISOString() });
        if (pauseCouple) await pauseCouple([d.a_user, d.b_user]).catch(() => {});
        await pousserMembre?.(d[`${autre}_user`], { titre: 'Vous êtes en couple 💞', texte: 'Votre espace « Notre couple » est ouvert.', lien: '/notre-couple/' }).catch(() => {});
        await alerter?.({ titre: '💍 Un couple est né', lignes: [`Profils n° ${d.a_ref} et n° ${d.b_ref} : les deux ont dit « on est en couple ». Leur espace commun est ouvert.`], tag: 'couple' }).catch(() => {});
      }
    } else if (couple) await pousserMembre?.(d[`${autre}_user`], { titre: 'Une question de ton match', texte: 'Ton match dit que vous êtes en couple. Et toi ?', lien: `/mon-espace/#discussion` }).catch(() => {});
    return json({ ok: true, couple: ouvert });
  }
  const cote = d.a_user === user.id ? 'a' : 'b', autre = cote === 'a' ? 'b' : 'a';
  const ouverte = !d.close_raison && new Date(d.ferme_at) > t;

  if (action === 'annonce_discussion_envoyer') {
    if (!ouverte) return json({ error: 'discussion_fermee' }, 409);
    // Pas de discussion sans ses 2 photos validées (Lamia, 17 nov. 2026) : photos refusées ou jamais envoyées, on les ajoute d'abord.
    if (!(await photosOk(read, user.id))) return json({ error: 'photos_requises' }, 403);
    let texte = clean(b.texte, 1000);
    if (!texte) return json({ error: 'bad_request' }, 400);
    const auRevoir = d.dematch_at ? await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&created_at=gte.${encodeURIComponent(d.dematch_at)}&select=auteur,created_at&limit=20`).catch(() => []) : null;
    if (auRevoir && messagesAuRevoir(d, auRevoir, user.id) >= MESSAGES_AU_REVOIR) return json({ error: 'au_revoir_fini' }, 409);
    // Avant l'échange des numéros, pas de contact en clair (sécurité) : le bouton « Échanger nos numéros » est fait pour ça.
    const echange = Boolean(d.a_numero && d.b_numero);
    const masque = echange ? texte : sansContact(texte);
    texte = masque;
    // Pas de limite pour une vraie conversation. Seul un robot peut envoyer plus de 60 messages en une minute.
    const recents = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&auteur=eq.${user.id}&created_at=gte.${encodeURIComponent(new Date(t.getTime() - 60e3).toISOString())}&select=id&limit=61`).catch(() => []);
    if (recents.length >= 60) return json({ error: 'rate_limited' }, 429);
    await insert('discussion_messages', { discussion_id: d.id, auteur: user.id, texte });
    // Chacun a dit au revoir : le match se termine sans attendre les 48 heures.
    if (auRevoir && messagesAuRevoir(d, auRevoir, user.id) + 1 >= MESSAGES_AU_REVOIR && messagesAuRevoir(d, auRevoir, d[`${autre}_user`]) >= MESSAGES_AU_REVOIR && terminerDematch) {
      await terminerDematch(d).catch(() => {});
      return json({ ok: true, texte, masque: masque !== clean(b.texte, 1000), termine: true });
    }
    // Notification à l'autre, au plus une toutes les 10 minutes.
    const champ = `notif_${autre}_at`;
    if (!d[champ] || t - new Date(d[champ]) > 600e3) {
      await patch('discussions', `id=eq.${d.id}`, { [champ]: t.toISOString() }).catch(() => {});
      await pousserMembre(d[`${autre}_user`], { titre: `${nomVisible(d, cote)} t’a écrit`, texte: '{A}, réponds-lui dans ton espace.', lien: '/mon-espace/#discussion' }).catch(() => {});
    }
    return json({ ok: true, texte, masque: masque !== clean(b.texte, 1000) });
  }

  if (action === 'annonce_discussion_dematcher') {
    if (!ouverte) return json({ error: 'discussion_fermee' }, 409);
    if (d.dematch_at) return json({ error: 'deja_dematche' }, 409);
    const raison = clean(b.raison, 20);
    if (!RAISONS_DEMATCH[raison]) return json({ error: 'raison_requise' }, 400);
    const etape = raison === 'parcours' ? clean(b.etape, 40) : null;
    if (raison === 'parcours' && !ETAPES.some((x) => x.id === etape)) return json({ error: 'raison_requise' }, 400);
    const fin = new Date(t.getTime() + HEURES_AU_REVOIR * 3600e3).toISOString();
    const maj = { dematch_par: cote, dematch_raison: raison, dematch_etape: etape, dematch_at: t.toISOString(), ferme_at: fin };
    await patch('discussions', `id=eq.${d.id}&close_raison=is.null`, maj);
    // Les deux retrouvent une place tout de suite ; la discussion reste ouverte pour l'au revoir.
    if (libererMatch) await libererMatch(d).catch(() => {});
    const qui = prenomVisible(d, cote) || 'La personne', motif = raisonLisible({ ...d, ...maj });
    await insert('discussion_messages', { discussion_id: d.id, auteur: null, texte: `${qui} met fin à ce match, avec tout son respect. Raison : ${motif}. Vous avez chacun ${MESSAGES_AU_REVOIR} messages pour vous dire au revoir. Vous pouvez tous les deux matcher à nouveau dès maintenant.` });
    await pousserMembre(d[`${autre}_user`], { titre: `${qui} met fin à votre match`, texte: `{A}, un au revoir t’attend dans votre discussion. Raison : ${motif}. Tu peux lui répondre pendant ${HEURES_AU_REVOIR} heures, et tu peux déjà matcher à nouveau.`, lien: '/mon-espace/#discussion' }).catch(() => {});
    return json({ ok: true, fin, restants: MESSAGES_AU_REVOIR });
  }

  if (action === 'annonce_discussion_numero') {
    if (d.dematch_at) return json({ error: 'discussion_fermee' }, 409);
    const tel = telephoneNormal(b.telephone);
    if (!tel) return json({ error: 'telephone_invalide' }, 400);
    await patch('discussions', `id=eq.${d.id}`, { [`${cote}_numero`]: tel });
    const echange = Boolean(d[`${autre}_numero`]);
    await pousserMembre(d[`${autre}_user`], echange
      ? { titre: 'Vous avez échangé vos numéros !', texte: `{A}, le numéro de ${prenomVisible(d, cote) || 'ton match'} est dans ton espace. Belle suite à vous deux.`, lien: '/mon-espace/#discussion' }
      : { titre: `${nomVisible(d, cote)} veut passer au téléphone`, texte: '{A}, donne ton numéro dans ton espace : vous le verrez tous les deux.', lien: '/mon-espace/#discussion' }).catch(() => {});
    if (echange) await alerter({ titre: `Numéros échangés · n° ${d.a_ref} ↔ n° ${d.b_ref}`, lignes: [`${d.a_prenom || '?'} et ${d.b_prenom || '?'} passent au téléphone.`], lien: '/tableau-de-bord#application', tag: 'reciproque' }).catch(() => {});
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
    await pousserMembre(d[`${autre}_user`], { titre: `${prenom} t’a donné son prénom`, texte: '{A}, tu peux aussi partager le tien quand tu veux, dans votre discussion.', lien: '/mon-espace/#discussion' }).catch(() => {});
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
      ? { titre: `Étape franchie à deux : ${r.etape.titre}`, texte: '{A}, la suite de votre parcours vous attend dans ton espace.', lien: '/mon-espace/#discussion' }
      : { titre: `${prenom} a validé une étape`, texte: `{A}, à toi de valider « ${r.etape.titre} » quand tu es prêt·e.`, lien: '/mon-espace/#discussion' }).catch(() => {});
    if (r.fini) await alerter({ titre: `Parcours terminé · n° ${d.a_ref} ↔ n° ${d.b_ref}`, lignes: [`${d.a_prenom || '?'} et ${d.b_prenom || '?'} ont validé toutes les étapes jusqu’au mariage.`], lien: '/tableau-de-bord#application', tag: 'reciproque' }).catch(() => {});
    return json({ ok: true, franchie: Boolean(r.franchie), fini: Boolean(r.fini) });
  }

  if (action === 'annonce_discussion_signaler') {
    const motif = RAISON_COURTE[b.raison] ? motifSignalement(b.raison, clean(b.motif, 500)) : clean(b.motif, 500);
    await patch('discussions', `id=eq.${d.id}`, { signalee_at: t.toISOString(), signalee_par: user.id, ferme_at: t.toISOString(), close_raison: 'signalee' });
    await alerter({ titre: `Discussion signalée · n° ${d[`${cote}_ref`]} signale n° ${d[`${autre}_ref`]}`, lignes: [motif || 'Sans motif.', 'La discussion est fermée. Lis-la dans ton tableau de bord, onglet Application.'], lien: '/tableau-de-bord#application', tag: 'reserve' }).catch(() => {});
    return json({ ok: true });
  }

  return json({ error: 'unknown_action' }, 400);
}

// Pour Lamia : la liste des discussions (sans le contenu), et le contenu seulement d'une discussion signalée.
export async function discussionsPourLamia({ read }, idSignalee = null) {
  const ds = await read('/rest/v1/discussions?select=id,a_ref,b_ref,a_prenom,b_prenom,ouverte_at,ferme_at,a_numero,b_numero,signalee_at,close_raison,lamia_invitee_at&order=ouverte_at.desc&limit=100').catch(() => []);
  // Nombre de messages des discussions affichées seulement, lu page par page : la base ne renvoie jamais plus de
  // 1000 lignes d'un coup (17 nov. 2026 : 3 013 messages en tout, les compteurs de Lamia étaient faux).
  const nb = [];
  if (ds.length) {
    for (let o = 0; o < 200000; o += 1000) {
      const l = await read(`/rest/v1/discussion_messages?discussion_id=in.(${ds.map((x) => x.id).join(',')})&select=discussion_id&order=id&limit=1000&offset=${o}`).catch(() => []);
      nb.push(...l);
      if (l.length < 1000) break;
    }
  }
  const compte = {};
  for (const m of nb) compte[m.discussion_id] = (compte[m.discussion_id] || 0) + 1;
  let messages = null;
  // Lamia lit une discussion seulement si elle est signalée, ou si elle y a été invitée (20 €, 16 nov. 2026).
  if (idSignalee && UUID.test(idSignalee) && ds.find((x) => x.id === idSignalee && (x.signalee_at || x.lamia_invitee_at))) {
    const [d] = await read(`/rest/v1/discussions?id=eq.${idSignalee}&select=a_user,a_prenom,a_ref,b_prenom,b_ref`).catch(() => []);
    messages = (await read(`/rest/v1/discussion_messages?discussion_id=eq.${idSignalee}&select=auteur,texte,created_at,role&order=created_at.asc&limit=500`).catch(() => []))
      .map((m) => ({ qui: m.role === 'lamia' ? 'Toi (Lamia)' : m.auteur === null ? 'Message du site' : m.auteur === d?.a_user ? `${d?.a_prenom || ''} (n° ${d?.a_ref})` : `${d?.b_prenom || ''} (n° ${d?.b_ref})`, texte: m.texte, created_at: m.created_at }));
  }
  const t = Date.now();
  return {
    discussions: ds.map((x) => ({ id: x.id, a_ref: x.a_ref, b_ref: x.b_ref, a_prenom: x.a_prenom, b_prenom: x.b_prenom, ouverte_at: x.ouverte_at, ferme_at: x.ferme_at, messages: compte[x.id] || 0, lamia_invitee: Boolean(x.lamia_invitee_at),
      etat: x.signalee_at ? 'signalee' : x.a_numero && x.b_numero ? 'numeros' : x.close_raison ? x.close_raison : new Date(x.ferme_at) > t ? 'ouverte' : 'terminee' })),
    messages,
  };
}

// Lamia écrit dans une discussion où elle a été invitée : les deux sont prévenus.
export async function lamiaEcrit({ read, insert, pousserMembre }, id, texte) {
  if (!UUID.test(String(id || ''))) return { error: 'bad_request' };
  const [d] = await read(`/rest/v1/discussions?id=eq.${id}&lamia_invitee_at=not.is.null&select=id,a_user,b_user`).catch(() => []);
  if (!d) return { error: 'non_invitee' };
  const t = String(texte || '').trim().slice(0, 2000);
  if (t.length < 2) return { error: 'message_vide' };
  await insert('discussion_messages', { discussion_id: d.id, auteur: null, role: 'lamia', auteur_nom: 'Lamia', texte: t });
  for (const u of [d.a_user, d.b_user]) await pousserMembre?.(u, { titre: 'Lamia vous a écrit', texte: '{A}, Lamia a répondu dans votre discussion.', lien: '/mon-espace/#discussion' }).catch(() => {});
  return { ok: true };
}

// Rappel 24 h avant la fin (lancé par la tâche quotidienne).
export async function rappelsDiscussions({ read, patch, now, pousserMembre }) {
  const t = now();
  const ds = await read(`/rest/v1/discussions?close_raison=is.null&rappel_at=is.null&ferme_at=gt.${encodeURIComponent(t.toISOString())}&ferme_at=lt.${encodeURIComponent(new Date(t.getTime() + 36 * 3600e3).toISOString())}&select=*`).catch(() => []);
  for (const d of ds) {
    if (d.a_numero && d.b_numero) continue;
    await patch('discussions', `id=eq.${d.id}`, { rappel_at: t.toISOString() }).catch(() => {});
    for (const c of ['a', 'b']) await pousserMembre(d[`${c}_user`], { titre: '{A}, ta discussion se termine demain', texte: 'Si le courant passe, échangez vos numéros avant la fin.', lien: '/mon-espace/#discussion' }).catch(() => {});
  }
  return ds.length;
}

// Passage quotidien (17 nov. 2026, n° 142 : « je ne sais pas comment lui écrire ») : une discussion ouverte depuis 24 h
// où personne n'a encore écrit reçoit un rappel simple, une seule fois (clé relance_muettes).
export async function relancerMuettes({ read, now, pousserMembre, lireReglage, ecrireReglage }) {
  const t = now(), hier = new Date(t.getTime() - 86400e3).toISOString();
  const deja = new Set((await lireReglage('relance_muettes').catch(() => null)) || []);
  const ds = await read(`/rest/v1/discussions?close_raison=is.null&dematch_at=is.null&ferme_at=gt.${encodeURIComponent(t.toISOString())}&ouverte_at=lt.${encodeURIComponent(hier)}&select=id,a_user,b_user&limit=200`).catch(() => []);
  let n = 0;
  for (const d of ds) {
    if (deja.has(d.id)) continue;
    const msgs = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&auteur=not.is.null&select=id&limit=1`).catch(() => [{}]);
    if (msgs.length) continue;
    for (const u of [d.a_user, d.b_user]) await pousserMembre(u, { titre: '{A}, ton match t’attend', texte: 'Ouvre Messages, écris-lui en bas de la discussion, puis appuie sur Envoyer. Un simple bonjour suffit.', lien: '/mon-espace/#discussion' }).catch(() => {});
    deja.add(d.id); n += 1;
  }
  if (n) await ecrireReglage('relance_muettes', [...deja].slice(-500)).catch(() => {});
  return n;
}

// Passage quotidien (Lamia, 16 nov. 2026) : « Où en êtes-vous ? » une seule fois à ceux qui ont échangé leurs numéros
// ou qui se parlent depuis plus d'une semaine, sans avoir encore répondu « en couple » ou « c'est fini ».
// Les discussions déjà questionnées sont notées dans les réglages (clé fin_question_envoyee).
export async function demanderOuEnEtes({ read, now, pousserMembre, lireReglage, ecrireReglage }) {
  const t = now(), semaine = new Date(t.getTime() - 7 * 86400e3).toISOString();
  const deja = new Set((await lireReglage('fin_question_envoyee').catch(() => null)) || []);
  const ds = await read(`/rest/v1/discussions?dematch_at=is.null&a_couple_at=is.null&b_couple_at=is.null&a_fini_at=is.null&b_fini_at=is.null&or=(and(a_numero.not.is.null,b_numero.not.is.null),ouverte_at.lt.${encodeURIComponent(semaine)})&select=id,a_user,b_user,close_raison&limit=200`).catch(() => []);
  let n = 0;
  for (const d of ds) {
    if (deja.has(d.id) || d.close_raison === 'signalee') continue;
    for (const c of ['a', 'b']) await pousserMembre(d[`${c}_user`], { titre: '{A}, où en êtes-vous ?', texte: 'En couple, ou c’est fini ? Dis-le en un geste dans ta discussion.', lien: '/mon-espace/#discussion' }).catch(() => {});
    deja.add(d.id); n += 1;
    if (n >= 50) break;
  }
  if (n) await ecrireReglage('fin_question_envoyee', [...deja]).catch(() => {});
  return n;
}

// Passage quotidien : un rappel à qui n'a pas encore dit au revoir, puis fin du match après 48 heures.
export async function suiviDematchs({ read, patch, now, pousserMembre, terminerDematch, libererMatch = null }) {
  const t = now();
  const liste = await read('/rest/v1/discussions?dematch_at=not.is.null&close_raison=is.null&select=*&limit=100').catch(() => []);
  let rappels = 0, termines = 0;
  for (const d of liste) {
    if (new Date(d.ferme_at) <= t) { await terminerDematch(d).catch(() => {}); termines += 1; continue; }
    // Un au revoir encore ouvert ne doit bloquer personne : les places sont rendues (aussi pour les dématchs d'avant cette règle).
    if (libererMatch) await libererMatch(d).catch(() => {});
    if (d.dematch_rappel_at) continue;
    const auteur = d[`${d.dematch_par}_user`];
    const msgs = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&auteur=eq.${auteur}&created_at=gte.${encodeURIComponent(d.dematch_at)}&select=id&limit=1`).catch(() => []);
    if (msgs.length) continue;
    await patch('discussions', `id=eq.${d.id}`, { dematch_rappel_at: t.toISOString() });
    await pousserMembre(auteur, { titre: 'Un au revoir reste à écrire', texte: '{A}, ton match attend un mot de ta part. Deux messages suffisent pour partir avec élégance.', lien: '/mon-espace/#discussion' }).catch(() => {});
    rappels += 1;
  }
  return { rappels, termines };
}

