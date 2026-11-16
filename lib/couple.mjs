// « Notre couple » (Lamia, 16 nov. 2026) : un espace à part des rencontres, pour les personnes en couple.
// Sur le modèle de l'espace Famille de QVT Box : l'un crée l'espace, invite l'autre par un code,
// et les deux partagent un planning d'activités de couple. Autour : coaching, lives, boutique, écrire à Lamia,
// et « faire plaisir » (bijou, chocolat, fleurs), en attendant les partenariats de Lamia.
import { DATABASE_URL, json } from './event-tickets.mjs';

export const TYPES_ACTIVITE = {
  rendez_vous: 'Rendez-vous à deux', balade: 'Balade', repas: 'Repas', rituel: 'Rituel du couple',
  gratitude: 'Moment de gratitude', famille: 'Avec la famille', coaching: 'Coaching avec Lamia', autre: 'Autre',
};
// La liste de cadeaux de couple (Lamia, 16 nov. 2026), en attendant ses partenariats.
export const CADEAUX = {
  bijou: 'Un bijou', parfum: 'Un parfum', fleurs: 'Des fleurs', chocolat: 'Des chocolats',
  diner: 'Un dîner au restaurant', spa: 'Un spa ou un massage à deux', weekend: 'Un week-end à deux',
  coffret: 'Un coffret beauté', photo: 'Une séance photo de couple', autre: 'Une autre idée',
};
const CODE_JOURS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const nouveauCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// Deux personnes qui se disent « en couple » à la fin de leur discussion : leur espace s'ouvre tout seul.
// Si l'un des deux a déjà un espace (seul·e, en attente), l'autre le rejoint ; sinon un nouvel espace est créé.
export async function ouvrirCoupleDuo({ read, insert, patch }, [x, y], discussionId = null) {
  const liens = await read(`/rest/v1/couple_membres?user_id=in.(${x.user_id},${y.user_id})&select=couple_id,user_id`).catch(() => []);
  const deX = liens.find((l) => l.user_id === x.user_id), deY = liens.find((l) => l.user_id === y.user_id);
  if (deX && deY) return deX.couple_id === deY.couple_id ? deX.couple_id : null; // chacun a déjà un autre espace : on ne touche à rien
  const existant = deX || deY;
  if (existant) {
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${existant.couple_id}&select=user_id`).catch(() => [{}, {}]);
    if (membres.length >= 2) return null;
    const nouveau = deX ? y : x;
    await insert('couple_membres', { couple_id: existant.couple_id, user_id: nouveau.user_id, prenom: nouveau.prenom || null });
    await patch('couples', `id=eq.${existant.couple_id}`, { code: null, code_expire_at: null, ...(discussionId ? { discussion_id: discussionId } : {}) });
    return existant.couple_id;
  }
  const c = await insert('couples', { created_by: x.user_id, discussion_id: discussionId });
  await insert('couple_membres', { couple_id: c.id, user_id: x.user_id, prenom: x.prenom || null });
  await insert('couple_membres', { couple_id: c.id, user_id: y.user_id, prenom: y.prenom || null });
  return c.id;
}

// Mots doux tout prêts (Lamia, 16 nov. 2026) : un geste, et l'autre reçoit une notification.
// Les plus envoyés sont réservés à l'abonnement Couple, avec leur animation tendre ; le mot écrit soi-même aussi (Lamia, 16 nov. 2026).
export const MOTS_DOUX = ['Je t’aime ❤️', 'Tu me manques 🥺', 'J’ai hâte de te retrouver 🤗', 'J’ai hâte de t’avoir à mes côtés 💞', 'Je pense à toi 💭', 'Merci d’être là 🌸', 'Bonne nuit mon cœur 🌙', 'Bonne journée mon amour ☀️'];
export const MOTS_PAYANTS = ['Je t’aime ❤️', 'Tu me manques 🥺', 'J’ai hâte de te retrouver 🤗', 'J’ai hâte de t’avoir à mes côtés 💞'];
// L'animation qui accompagne un mot (dans le fil) : « je t'aime » un cœur qui bat, « tu me manques » deux cœurs qui se cherchent…
export const ANIMATION = { 'Je t’aime ❤️': 'coeur', 'Tu me manques 🥺': 'manque', 'J’ai hâte de te retrouver 🤗': 'retrouver', 'J’ai hâte de t’avoir à mes côtés 💞': 'retrouver' };

export async function actionCouple(action, b, { read, insert, patch, call, now, user, alerter = async () => {}, pousser = async () => 0, journal = async () => {} }) {
  // L'abonnement Couple d'un des deux vaut pour les deux.
  const premium = async (coupleId) => {
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${coupleId}&select=user_id`).catch(() => []);
    const emails = [String(user.email || '').toLowerCase()];
    for (const m of membres) if (m.user_id !== user.id) { try { const r = await call(`/auth/v1/admin/users/${m.user_id}`); const u = r?.ok && r.json ? await r.json() : null; if (u?.email) emails.push(String(u.email).toLowerCase()); } catch { /* sans l'email de l'autre, on regarde seulement le mien */ } }
    const abos = await read(`/rest/v1/abonnements?formule=eq.couple&statut=in.(actif,impaye)&select=email&limit=20`).catch(() => []);
    return abos.some((a) => emails.includes(String(a.email || '').toLowerCase()));
  };
  if (!user) return json({ error: 'login_required' }, 401);
  const t = now();
  const prenom = clean(user.user_metadata?.first_name, 40) || 'Moi';
  const monLien = async () => (await read(`/rest/v1/couple_membres?user_id=eq.${user.id}&select=couple_id`).catch(() => []))[0] || null;
  const etat = async () => {
    const lien = await monLien();
    if (!lien) return { couple: null };
    const [[c], membres, acts] = await Promise.all([
      read(`/rest/v1/couples?id=eq.${lien.couple_id}&select=id,nom,created_by,code,code_expire_at`),
      read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id,prenom,joined_at&order=joined_at`),
      read(`/rest/v1/couple_activites?couple_id=eq.${lien.couple_id}&or=(visibilite.eq.nous,auteur.eq.${user.id})&select=id,auteur,titre,type,quand,visibilite,fait_at,created_at&order=quand.asc.nullslast&limit=200`),
    ]);
    if (!c) return { couple: null };
    const seul = membres.length < 2;
    return {
      couple: {
        id: c.id, nom: c.nom || 'Notre couple',
        membres: membres.map((m) => ({ prenom: m.prenom || 'Partenaire', moi: m.user_id === user.id })),
        code: seul && c.code && new Date(c.code_expire_at) > t ? c.code : null,
        premium: await premium(c.id),
        // Passion ou Prestige en cours : on lui propose de le transformer en abonnement Couple (avec son accord).
        conversion: await (async () => { const [x] = await read(`/rest/v1/abonnements?email=ilike.${encodeURIComponent(String(user.email || '').replace(/[%*,()]/g, ''))}&formule=in.(passion,prestige)&statut=in.(actif,impaye)&select=formule,periode,prix_centimes&order=created_at.desc&limit=1`).catch(() => []); return x ? { formule: x.formule, annuel: x.periode !== 'mois', prix: x.prix_centimes } : null; })(),
        mots: acts.filter((x) => x.type === 'mot').sort((p, q) => String(q.created_at).localeCompare(String(p.created_at))).slice(0, 20).map((x) => ({ id: x.id, texte: x.titre, de_moi: x.auteur === user.id, le: x.created_at, animation: ANIMATION[x.titre] || null })),
        activites: acts.filter((x) => x.type !== 'mot').map((x) => ({ id: x.id, titre: x.titre, type: x.type, type_nom: TYPES_ACTIVITE[x.type] || x.type, quand: x.quand, pour_nous: x.visibilite === 'nous', de_moi: x.auteur === user.id, fait: Boolean(x.fait_at) })),
      },
    };
  };

  if (action === 'couple_etat') return json({ ok: true, ...(await etat()), types: TYPES_ACTIVITE, cadeaux: CADEAUX, mots_doux: MOTS_DOUX, mots_payants: MOTS_PAYANTS });

  if (action === 'couple_creer') {
    if (await monLien()) return json({ ok: true, ...(await etat()) });
    const c = await insert('couples', { nom: clean(b.nom, 60) || null, created_by: user.id, code: nouveauCode(), code_expire_at: new Date(t.getTime() + CODE_JOURS * 86400e3).toISOString() });
    await insert('couple_membres', { couple_id: c.id, user_id: user.id, prenom });
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_rejoindre') {
    if (await monLien()) return json({ error: 'deja_en_couple' }, 409);
    const code = clean(b.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return json({ error: 'code_invalide' }, 400);
    const [c] = await read(`/rest/v1/couples?code=eq.${code}&select=id,code_expire_at`).catch(() => []);
    if (!c || new Date(c.code_expire_at) <= t) return json({ error: 'code_invalide' }, 404);
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${c.id}&select=user_id`).catch(() => []);
    if (membres.length >= 2) return json({ error: 'complet' }, 409);
    await insert('couple_membres', { couple_id: c.id, user_id: user.id, prenom });
    await patch('couples', `id=eq.${c.id}`, { code: null, code_expire_at: null });
    return json({ ok: true, ...(await etat()) });
  }

  const lien = await monLien();
  if (!lien) return json({ error: 'pas_de_couple' }, 404);

  if (action === 'couple_code') {
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => []);
    if (membres.length >= 2) return json({ error: 'complet' }, 409);
    await patch('couples', `id=eq.${lien.couple_id}`, { code: nouveauCode(), code_expire_at: new Date(t.getTime() + CODE_JOURS * 86400e3).toISOString() });
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_activite_ajouter') {
    const titre = clean(b.titre, 120);
    if (titre.length < 2) return json({ error: 'titre_requis' }, 400);
    const type = TYPES_ACTIVITE[b.type] ? b.type : 'autre';
    const quand = b.quand && !Number.isNaN(new Date(b.quand).getTime()) ? new Date(b.quand).toISOString() : null;
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre, type, quand, visibilite: b.pour_nous === false ? 'moi' : 'nous' });
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_activite_fait' || action === 'couple_activite_suppr') {
    const id = clean(b.id, 40);
    if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
    const [x] = await read(`/rest/v1/couple_activites?id=eq.${id}&couple_id=eq.${lien.couple_id}&or=(visibilite.eq.nous,auteur.eq.${user.id})&select=id,auteur`).catch(() => []);
    if (!x) return json({ error: 'not_found' }, 404);
    if (action === 'couple_activite_fait') await patch('couple_activites', `id=eq.${id}`, { fait_at: b.fait === false ? null : t.toISOString() });
    else {
      if (x.auteur !== user.id) return json({ error: 'forbidden' }, 403);
      await call(`/rest/v1/couple_activites?id=eq.${id}`, { method: 'DELETE' });
    }
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_mot') {
    const texte = clean(b.texte, 200);
    if (texte.length < 2) return json({ error: 'titre_requis' }, 400);
    const gratuit = MOTS_DOUX.includes(texte) && !MOTS_PAYANTS.includes(texte);
    if (!gratuit && !(await premium(lien.couple_id))) return json({ error: 'couple_requis' }, 402);
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: texte, type: 'mot', visibilite: 'nous', fait_at: t.toISOString() });
    const autres = (await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => [])).filter((m) => m.user_id !== user.id);
    for (const m of autres) await pousser(m.user_id, { titre: `💌 ${prenom}`, texte }).catch(() => 0);
    return json({ ok: true, envoye: autres.length > 0, ...(await etat()) });
  }

  if (action === 'couple_cadeau') {
    if (!CADEAUX[b.type]) return json({ error: 'bad_request' }, 400);
    const note = clean(b.note, 300);
    await insert('cadeaux_demandes', { user_id: user.id, couple_id: lien.couple_id, type: b.type, note: note || null });
    await alerter({ titre: `Faire plaisir · ${CADEAUX[b.type].toLowerCase()}`, lignes: [`${prenom} (${user.email}) voudrait offrir ${CADEAUX[b.type].toLowerCase()} à son ou sa partenaire.`, ...(note ? [`« ${note} »`] : []), 'À traiter à la main en attendant les partenariats.'], lien: '/tableau-de-bord#accueil', tag: 'cadeau' }).catch(() => {});
    return json({ ok: true });
  }

  // « On s'est mariés » (Lamia, 16 nov. 2026) : avec une photo du mariage, Lamia leur offre un cadeau.
  // La photo va dans le stockage privé (jamais publiée) ; Lamia reçoit une alerte avec un lien privé de 7 jours et l'adresse.
  if (action === 'couple_mariage_photo') {
    const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
    if (!EXT[b.mime] || !(Number(b.size) > 0 && Number(b.size) <= 15 * 1024 * 1024)) return json({ error: 'photo_invalide' }, 400);
    const path = `mariages/${lien.couple_id}/${t.getTime()}.${EXT[b.mime]}`;
    const r = await call(`/storage/v1/object/upload/sign/annonces/${path}`, { method: 'POST', body: '{}' });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    const { url } = await r.json();
    return json({ ok: true, upload: { url: `${DATABASE_URL}/storage/v1${url}`, type: b.mime, path } });
  }
  if (action === 'couple_mariage') {
    const path = clean(b.path, 200);
    if (!path.startsWith(`mariages/${lien.couple_id}/`)) return json({ error: 'photo_requise' }, 400);
    const adresse = clean(b.adresse, 400), date = clean(b.date, 20);
    if (adresse.length < 10) return json({ error: 'adresse_requise' }, 400);
    let lienPhoto = '';
    try { const r = await call('/storage/v1/object/sign/annonces', { method: 'POST', body: JSON.stringify({ expiresIn: 7 * 86400, paths: [path] }) }); const [x] = r.ok ? await r.json() : []; if (x?.signedURL) lienPhoto = `${DATABASE_URL}/storage/v1${x.signedURL}`; } catch { /* le lien se redemande plus tard */ }
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id,prenom`).catch(() => []);
    const noms = membres.map((m) => m.prenom || 'Partenaire').join(' et ');
    const lignes = [`${noms} se sont mariés${date ? ` le ${date}` : ''} 🎉`, `Adresse pour le cadeau : ${adresse}`, `Contact : ${user.email}`, lienPhoto ? `Photo (lien privé, 7 jours) : ${lienPhoto}` : `Photo dans le stockage : ${path}`];
    await journal({ titre: `💍 Mariage · ${noms}`, lignes, categorie: 'profil' }).catch(() => {});
    await alerter({ titre: `💍 ${noms} se sont mariés`, lignes: [...lignes, 'Un cadeau de Lamia à leur envoyer.'], tag: 'mariage' }).catch(() => {});
    for (const m of membres) if (m.user_id !== user.id) await pousser(m.user_id, { titre: '💍 Félicitations !', texte: 'Lamia a bien reçu votre photo de mariage : votre cadeau arrive.' }).catch(() => 0);
    return json({ ok: true });
  }

  if (action === 'couple_quitter') {
    await call(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&user_id=eq.${user.id}`, { method: 'DELETE' });
    const reste = await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => [{}]);
    if (!reste.length) await call(`/rest/v1/couples?id=eq.${lien.couple_id}`, { method: 'DELETE' }).catch(() => {});
    return json({ ok: true, couple: null });
  }

  return json({ error: 'unknown_action' }, 400);
}
