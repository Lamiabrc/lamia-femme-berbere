// « Notre couple » (Lamia, 16 nov. 2026) : un espace à part des rencontres, pour les personnes en couple.
// Sur le modèle de l'espace Famille de QVT Box : l'un crée l'espace, invite l'autre par un code,
// et les deux partagent un planning d'activités de couple. Autour : coaching, lives, boutique, écrire à Lamia,
// et « faire plaisir » (bijou, chocolat, fleurs), en attendant les partenariats de Lamia.
import { json } from './event-tickets.mjs';

export const TYPES_ACTIVITE = {
  rendez_vous: 'Rendez-vous à deux', balade: 'Balade', repas: 'Repas', rituel: 'Rituel du couple',
  gratitude: 'Moment de gratitude', famille: 'Avec la famille', coaching: 'Coaching avec Lamia', autre: 'Autre',
};
export const CADEAUX = { bijou: 'Un bijou', chocolat: 'Des chocolats', fleurs: 'Des fleurs' };
const CODE_JOURS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const nouveauCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export async function actionCouple(action, b, { read, insert, patch, call, now, user, alerter = async () => {} }) {
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
        activites: acts.map((x) => ({ id: x.id, titre: x.titre, type: x.type, type_nom: TYPES_ACTIVITE[x.type] || x.type, quand: x.quand, pour_nous: x.visibilite === 'nous', de_moi: x.auteur === user.id, fait: Boolean(x.fait_at) })),
      },
    };
  };

  if (action === 'couple_etat') return json({ ok: true, ...(await etat()), types: TYPES_ACTIVITE, cadeaux: CADEAUX });

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

  if (action === 'couple_cadeau') {
    if (!CADEAUX[b.type]) return json({ error: 'bad_request' }, 400);
    const note = clean(b.note, 300);
    await insert('cadeaux_demandes', { user_id: user.id, couple_id: lien.couple_id, type: b.type, note: note || null });
    await alerter({ titre: `Faire plaisir · ${CADEAUX[b.type].toLowerCase()}`, lignes: [`${prenom} (${user.email}) voudrait offrir ${CADEAUX[b.type].toLowerCase()} à son ou sa partenaire.`, ...(note ? [`« ${note} »`] : []), 'À traiter à la main en attendant les partenariats.'], lien: '/tableau-de-bord#accueil', tag: 'cadeau' }).catch(() => {});
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
