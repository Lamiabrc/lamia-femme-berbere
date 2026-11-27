import {createHash} from 'node:crypto';
import {identiteReseau} from '../content/liens-reseaux.mjs';

// Lecture privée réservée aux actions d'administration. Aucun contenu de conversation.
async function toutes(read,table,champs){
  const lignes=[];let apres=0;
  while(true){
    const lot=await read(`/rest/v1/${table}?ref=gt.${apres}&select=${champs}&order=ref.asc&limit=500`);
    lignes.push(...lot);if(lot.length<500)return lignes;
    const suivant=Number(lot.at(-1)?.ref);if(!(suivant>apres))throw Error('pagination_reseaux');apres=suivant;
  }
}
const contactIdentite=c=>identiteReseau(`${c.reseau==='tiktok'?'https://www.tiktok.com/@':c.reseau==='instagram'?'https://www.instagram.com/':c.reseau==='facebook'?'https://www.facebook.com/':''}${c.pseudo||''}`);
export async function rechercherReseau(read,valeur){
  const identite=identiteReseau(valeur);if(!identite)throw Object.assign(Error('reseau_invalide'),{code:'reseau_invalide'});
  const hash=createHash('sha256').update(`lfb-lien:${identite}`).digest('hex');
  const [contacts,empreintes,fiches,annonces]=await Promise.all([
    toutes(read,'contacts_lamia','ref,reseau,pseudo'),
    read(`/rest/v1/outil_tiktok?h=eq.${hash}&select=outil_id&limit=1`),
    toutes(read,'profils_outil','ref,outil_id,lien_reseau,user_id'),
    toutes(read,'annonces','ref,fiche_ref,outil_id,user_id,matching'),
  ]);
  const refsContacts=new Set(contacts.filter(c=>contactIdentite(c)===identite).map(c=>c.ref));
  const outils=new Set(empreintes.map(e=>e.outil_id));
  const profils=annonces.filter(a=>[a.matching?.contactReseau,a.matching?.tiktokLive].some(v=>identiteReseau(v)===identite));
  const refsFiches=fiches.filter(f=>{
    const courant=identiteReseau(f.lien_reseau);if(courant)return courant===identite;
    return refsContacts.has(f.ref)||outils.has(f.outil_id)||profils.some(a=>a.fiche_ref===f.ref||(a.outil_id&&a.outil_id===f.outil_id)||(a.user_id&&a.user_id===f.user_id));
  }).map(f=>f.ref);
  return {identite,refsFiches,refsAnnonces:profils.map(a=>a.ref)};
}
export const resultatsReseau=r=>[...r.refsAnnonces.map(ref=>({ref,type:'profil'})),...r.refsFiches.map(ref=>({ref,type:'fiche'}))];
