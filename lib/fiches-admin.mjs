import { json, isAdmin } from './event-tickets.mjs';
import { choixPropres } from '../content/matching-options.mjs';
import {createHash} from 'node:crypto';
import {rechercherReseau,resultatsReseau} from './recherche-reseaux.mjs';
import {identiteReseau} from '../content/liens-reseaux.mjs';
import {pseudoDepuisTikTok,urlDepuisTikTok} from '../content/liens-tiktok.mjs';

export const PREFIXE_FICHE_SITE = 'site-admin-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAMPS = 'ref,pseudo,lien_reseau,outil_id,genre,age,pays,ville,village,secteur,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max,metier,religion,pratique,religion_recherche,pratique_recherche,mode_vie,visible,updated_at,confirme_at,retire_at,effacement_at,pause_at,user_id';
const CHAMPS_LISTE = 'ref,pseudo,lien_reseau,outil_id,genre,age,pays,ville,visible,updated_at,confirme_at,retire_at,effacement_at,pause_at,user_id';
const etat = (f) => f.retire_at || f.effacement_at ? 'retiree' : f.confirme_at ? 'confirmee' : 'en_attente';
const identique = (a, b) => Object.keys(b).filter((k) => !['updated_at', 'visible', 'matching'].includes(k)).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

// Les fiches restent dans le modèle existant. Aucun compte ni mot de passe n'est créé par Lamia.
export async function actionFichesAdmin(action, b, { admin, user, read, insert, ligneFiche, lienFiche, now }) {
  if (!admin || !isAdmin(user)) return json({ error: 'forbidden' }, 403);
  const vue = (f,c=null) => {const pseudo=etat(f)==='retiree'?'':pseudoDepuisTikTok(f.lien_reseau)||(c?.reseau==='tiktok'?pseudoDepuisTikTok('@'+c.pseudo):'');return ({ ref: f.ref, pseudo: f.pseudo || null, genre: f.genre, age: f.age, pays: f.pays, ville: f.ville, profil: f.profil, recherche: f.recherche,
    confirmation: etat(f), visible: Boolean(f.visible && !f.retire_at && !f.effacement_at && !f.pause_at), compte: Boolean(f.user_id), en_pause:Boolean(f.pause_at), source_creation:String(f.outil_id||'').startsWith(PREFIXE_FICHE_SITE)?'site':'live',
    tiktok:pseudo?{pseudo,lien:urlDepuisTikTok(pseudo)}:null,lien: etat(f) === 'retiree' ? null : lienFiche(f.ref), le: f.updated_at });};
  async function avecContacts(rows){
    let contacts=[],disponibles=true;
    const refs=rows.filter(f=>etat(f)!=='retiree').map(f=>f.ref);
    if(refs.length)try{contacts=await read(`/rest/v1/contacts_lamia?ref=in.(${refs.join(',')})&select=ref,reseau,pseudo`);}catch{disponibles=false;}
    const parRef=new Map(contacts.map(c=>[c.ref,c]));return {fiches:rows.map(f=>vue(f,parRef.get(f.ref))),contacts_disponibles:disponibles};
  }
  if (action === 'annonce_fiches_admin') {
    const avant = b.avant == null ? null : Number(b.avant);
    if (avant !== null && (!Number.isSafeInteger(avant) || avant < 5001)) return json({ error: 'bad_request' }, 400);
    const source=b.source_creation||'toutes';
    if(!['toutes','site','live'].includes(source))return json({error:'bad_request'},400);
    const filtre=source==='site'?`&outil_id=like.${PREFIXE_FICHE_SITE}*`:source==='live'?`&or=(outil_id.not.like.${PREFIXE_FICHE_SITE}*,outil_id.is.null)`:'';
    let recherche='';
    if(b.tiktok){
      const pseudo=pseudoDepuisTikTok(b.tiktok);if(!pseudo)return json({error:'tiktok_invalide'},400);
      let r;try{r=await rechercherReseau(read,b.tiktok);}catch{return json({error:'recherche_indisponible'},503);}
      if(!r.refsFiches.length)return json({ok:true,fiches:[],suivant:null,contacts_disponibles:true});
      recherche=`&ref=in.(${r.refsFiches.join(',')})`;
    }
    const rows = await read(`/rest/v1/profils_outil?select=${CHAMPS_LISTE}${filtre}${recherche}${b.sans_compte===true?'&user_id=is.null':''}${b.actives_seulement===true?'&retire_at=is.null&effacement_at=is.null':''}${avant ? `&ref=lt.${avant}` : ''}&order=ref.desc&limit=21`);
    return json({ ok: true, ...await avecContacts(rows.slice(0,20)), suivant: rows.length > 20 ? rows[19].ref : null });
  }
  if(action==='annonce_rechercher_reseau'){
    if(!identiteReseau(b.recherche))return json({error:'reseau_invalide'},400);
    try{return json({ok:true,resultats:resultatsReseau(await rechercherReseau(read,b.recherche))});}
    catch{return json({error:'recherche_indisponible'},503);}
  }
  if (action === 'annonce_lien_fiche_admin') {
    const ref = Number(b.ref);
    if (!Number.isSafeInteger(ref) || ref < 5001) return json({ error: 'bad_request' }, 400);
    const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=${CHAMPS}&limit=1`);
    if(!f)return json({error:'not_found'},404);
    const d=await avecContacts([f]);return json({ok:true,fiche:d.fiches[0],contacts_disponibles:d.contacts_disponibles});
  }
  if (action !== 'annonce_fiche_admin_creer' || !UUID.test(String(b.requete_id || ''))) return json({ error: 'bad_request' }, 400);
  const p = b.profil;
  if (!p || !['femme', 'homme'].includes(p.genre)) return json({ error: 'genre_requis' }, 400);
  if (!Number.isInteger(Number(p.age)) || Number(p.age) < 18 || Number(p.age) > 99) return json({ error: 'age_invalide' }, 400);
  for (const k of ['age_min', 'age_max']) if (p[k] != null && p[k] !== '' && (!Number.isInteger(Number(p[k])) || Number(p[k]) < 18 || Number(p[k]) > 99)) return json({ error: 'ages_recherches' }, 400);
  if (p.age_min && p.age_max && Number(p.age_min) > Number(p.age_max)) return json({ error: 'ages_recherches' }, 400);
  const identite=identiteReseau(p.lien_reseau);
  const outilId=PREFIXE_FICHE_SITE+(identite?createHash('sha256').update(identite).digest('hex'):b.requete_id.toLowerCase());
  const row = { ...ligneFiche({ ...p, outil_id: outilId }, now().toISOString()), visible: b.publier === true,
    // Infos privées de Lamia : jamais dans l'annonce anonyme.
    pseudo: String(p.pseudo ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40) || null,
    lien_reseau: String(p.lien_reseau ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) || null,
    matching: choixPropres(p.matching && typeof p.matching === 'object' ? p.matching : {}) };
  if (!Array.isArray(p.origine) || !p.origine.length) row.origine = [];
  if (!row.profil || !row.recherche || !row.pays) return json({ error: 'annonce_incomplete' }, 400);
  const retrouver = async () => (await read(`/rest/v1/profils_outil?outil_id=eq.${row.outil_id}&select=${CHAMPS}&limit=1`))[0];
  const doublon=resultats=>json({error:'profil_existant',existants:resultats},409);
  const reponse = (f, rejoue) => identique(f, row) ? json({ ok: true, fiche: vue(f), rejoue }) : identite?doublon([{ref:f.ref,type:'fiche'}]):json({ error: 'requete_deja_utilisee' }, 409);
  const deja = await retrouver();
  if (deja) return reponse(deja, true);
  if(identite){
    let r;try{r=await rechercherReseau(read,p.lien_reseau);}catch{return json({error:'recherche_indisponible'},503);}
    const existants=resultatsReseau(r);if(existants.length)return doublon(existants);
  }
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
