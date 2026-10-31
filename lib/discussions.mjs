// Discussion après une mise en relation par Lamia : 7 jours pour faire connaissance dans l'application,
// puis les deux échangent leurs numéros (chacun donne le sien ; il n'est montré que quand les deux l'ont donné).
// Tant que les numéros ne sont pas échangés, tout moyen de contact écrit dans un message est masqué.
// Lamia ne lit pas les discussions, sauf si l'un des deux la signale.
import { json } from './event-tickets.mjs';
import { sansContact } from './annonces.mjs';
import { telephoneNormal } from '../content/matching-options.mjs';

export const DUREE_JOURS = 7;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

// Ouverte au moment de la mise en relation, si les deux personnes ont un compte LFB.
export async function ouvrirDiscussion({ read, insert, now }, { interetId, a, b }) {
  if (!a?.user_id || !b?.user_id || a.user_id === b.user_id) return null;
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

// Vue d'une discussion pour l'un des deux.
function vue(d, moi, messages, t) {
  const cote = d.a_user === moi ? 'a' : 'b', autre = cote === 'a' ? 'b' : 'a';
  const echange = Boolean(d.a_numero && d.b_numero);
  const ouverte = !d.close_raison && new Date(d.ferme_at) > t;
  return {
    id: d.id, avec: d[`${autre}_prenom`] || `Profil n° ${d[`${autre}_ref`] ?? '?'}`, avec_ref: d[`${autre}_ref`],
    ouverte, ferme_at: d.ferme_at, close_raison: d.close_raison || null, signalee: Boolean(d.signalee_at),
    mon_numero: d[`${cote}_numero`] || null, son_numero: echange ? d[`${autre}_numero`] : null,
    il_a_partage: Boolean(d[`${autre}_numero`]), echange,
    messages: messages.map((m) => ({ moi: m.auteur === moi, lamia: m.auteur === null, texte: m.texte, le: m.created_at })),
  };
}

export async function actionDiscussion(action, b, { read, insert, patch, now, user, pousserMembre, alerter }) {
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
    for (const d of ds) {
      const msgs = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&select=auteur,texte,created_at&order=created_at.asc&limit=300`).catch(() => []);
      out.push(vue(d, user.id, msgs, t));
    }
    return json({ ok: true, discussions: out, duree_jours: DUREE_JOURS });
  }

  const d = await laMienne();
  if (!d) return json({ error: 'not_found' }, 404);
  const cote = d.a_user === user.id ? 'a' : 'b', autre = cote === 'a' ? 'b' : 'a';
  const ouverte = !d.close_raison && new Date(d.ferme_at) > t;

  if (action === 'annonce_discussion_envoyer') {
    if (!ouverte) return json({ error: 'discussion_fermee' }, 409);
    let texte = clean(b.texte, 1000);
    if (!texte) return json({ error: 'bad_request' }, 400);
    // Avant l'échange des numéros, pas de contact en clair (sécurité) : le bouton « Échanger nos numéros » est fait pour ça.
    const echange = Boolean(d.a_numero && d.b_numero);
    const masque = echange ? texte : sansContact(texte);
    texte = masque;
    // Anti-flood : 30 messages par heure.
    const recents = await read(`/rest/v1/discussion_messages?discussion_id=eq.${d.id}&auteur=eq.${user.id}&created_at=gte.${encodeURIComponent(new Date(t.getTime() - 3600e3).toISOString())}&select=id&limit=31`).catch(() => []);
    if (recents.length >= 30) return json({ error: 'rate_limited' }, 429);
    await insert('discussion_messages', { discussion_id: d.id, auteur: user.id, texte });
    // Notification à l'autre, au plus une toutes les 10 minutes.
    const champ = `notif_${autre}_at`;
    if (!d[champ] || t - new Date(d[champ]) > 600e3) {
      await patch('discussions', `id=eq.${d.id}`, { [champ]: t.toISOString() }).catch(() => {});
      await pousserMembre(d[`${autre}_user`], { titre: `💬 ${d[`${cote}_prenom`] || 'Ton match'} t’a écrit`, texte: 'Réponds-lui dans ton espace.', lien: '/mon-espace/#discussion' }).catch(() => {});
    }
    return json({ ok: true, masque: masque !== clean(b.texte, 1000) });
  }

  if (action === 'annonce_discussion_numero') {
    const tel = telephoneNormal(b.telephone);
    if (!tel) return json({ error: 'telephone_invalide' }, 400);
    await patch('discussions', `id=eq.${d.id}`, { [`${cote}_numero`]: tel });
    const echange = Boolean(d[`${autre}_numero`]);
    await pousserMembre(d[`${autre}_user`], echange
      ? { titre: '📞 Vous avez échangé vos numéros !', texte: `Le numéro de ${d[`${cote}_prenom`] || 'ton match'} est dans ton espace. Belle suite à vous deux.`, lien: '/mon-espace/#discussion' }
      : { titre: `📞 ${d[`${cote}_prenom`] || 'Ton match'} veut passer au téléphone`, texte: 'Donne ton numéro dans ton espace : vous le verrez tous les deux.', lien: '/mon-espace/#discussion' }).catch(() => {});
    if (echange) await alerter({ titre: `📞 Numéros échangés · n° ${d.a_ref} ↔ n° ${d.b_ref}`, lignes: [`${d.a_prenom || '?'} et ${d.b_prenom || '?'} passent au téléphone.`], lien: '/tableau-de-bord#application', tag: 'reciproque' }).catch(() => {});
    return json({ ok: true, echange });
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
    for (const c of ['a', 'b']) await pousserMembre(d[`${c}_user`], { titre: '⏳ Ta discussion se termine demain', texte: 'Si le courant passe, échangez vos numéros avant la fin.', lien: '/mon-espace/#discussion' }).catch(() => {});
  }
  return ds.length;
}
