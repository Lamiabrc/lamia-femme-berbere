import { json, isAdmin } from './event-tickets.mjs';

export const PREFIXE_FICHE_SITE = 'site-admin-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAMPS = 'ref,outil_id,genre,age,pays,ville,village,secteur,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max,metier,religion,pratique,religion_recherche,pratique_recherche,mode_vie,visible,updated_at,confirme_at,retire_at,effacement_at,user_id';
const etat = (f) => f.retire_at || f.effacement_at ? 'retiree' : f.confirme_at ? 'confirmee' : 'en_attente';
const identique = (a, b) => Object.keys(b).filter((k) => !['updated_at', 'visible'].includes(k)).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

// Les fiches restent dans le modèle existant. Aucun compte ni mot de passe n'est créé par Lamia.
export async function actionFichesAdmin(action, b, { admin, user, read, insert, ligneFiche, lienFiche, now }) {
  if (!admin || !isAdmin(user)) return json({ error: 'forbidden' }, 403);
  const vue = (f) => ({ ref: f.ref, genre: f.genre, age: f.age, pays: f.pays, ville: f.ville, profil: f.profil, recherche: f.recherche,
    confirmation: etat(f), visible: Boolean(f.visible && !f.retire_at && !f.effacement_at), compte: Boolean(f.user_id),
    lien: etat(f) === 'retiree' ? null : lienFiche(f.ref), le: f.updated_at });
  if (action === 'annonce_fiches_admin') {
    const avant = b.avant == null ? null : Number(b.avant);
    if (avant !== null && (!Number.isSafeInteger(avant) || avant < 5001)) return json({ error: 'bad_request' }, 400);
    const rows = await read(`/rest/v1/profils_outil?outil_id=like.${PREFIXE_FICHE_SITE}*${avant ? `&ref=lt.${avant}` : ''}&select=${CHAMPS}&order=ref.desc&limit=21`);
    return json({ ok: true, fiches: rows.slice(0, 20).map(vue), suivant: rows.length > 20 ? rows[19].ref : null });
  }
  if (action === 'annonce_lien_fiche_admin') {
    const ref = Number(b.ref);
    if (!Number.isSafeInteger(ref) || ref < 5001) return json({ error: 'bad_request' }, 400);
    const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=${CHAMPS}&limit=1`);
    return f ? json({ ok: true, fiche: vue(f) }) : json({ error: 'not_found' }, 404);
  }
  if (action !== 'annonce_fiche_admin_creer' || !UUID.test(String(b.requete_id || ''))) return json({ error: 'bad_request' }, 400);
  const p = b.profil;
  if (!p || !['femme', 'homme'].includes(p.genre)) return json({ error: 'genre_requis' }, 400);
  if (!Number.isInteger(Number(p.age)) || Number(p.age) < 18 || Number(p.age) > 99) return json({ error: 'age_invalide' }, 400);
  for (const k of ['age_min', 'age_max']) if (p[k] != null && p[k] !== '' && (!Number.isInteger(Number(p[k])) || Number(p[k]) < 18 || Number(p[k]) > 99)) return json({ error: 'ages_recherches' }, 400);
  if (p.age_min && p.age_max && Number(p.age_min) > Number(p.age_max)) return json({ error: 'ages_recherches' }, 400);
  const row = { ...ligneFiche({ ...p, outil_id: PREFIXE_FICHE_SITE + b.requete_id.toLowerCase() }, now().toISOString()), visible: b.publier === true };
  if (!Array.isArray(p.origine) || !p.origine.length) row.origine = [];
  if (!row.profil || !row.recherche || !row.pays) return json({ error: 'annonce_incomplete' }, 400);
  const retrouver = async () => (await read(`/rest/v1/profils_outil?outil_id=eq.${row.outil_id}&select=${CHAMPS}&limit=1`))[0];
  const reponse = (f, rejoue) => identique(f, row) ? json({ ok: true, fiche: vue(f), rejoue }) : json({ error: 'requete_deja_utilisee' }, 409);
  const deja = await retrouver();
  if (deja) return reponse(deja, true);
  try {
    const f = await insert('profils_outil', row);
    if (!f?.ref) throw new Error('fiche non enregistrée');
    return reponse(f, false);
  } catch (err) {
    // La contrainte unique existante sur outil_id protège aussi un double clic ou un accusé perdu.
    const f = await retrouver();
    if (f) return reponse(f, true);
    throw err;
  }
}
