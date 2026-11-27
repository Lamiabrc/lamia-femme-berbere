const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const demandes=new WeakMap();
export function liensResultats(resultats){return `<ul class="fiche-liste">${resultats.map(r=>`<li><button type="button" class="btn btn-line" data-voir-ref="${Number(r.ref)}">Ouvrir ${r.type==='profil'?'le profil':'la fiche'} n° ${Number(r.ref)}</button></li>`).join('')}</ul>`;}
export function effacerRechercheReseau(zone){demandes.delete(zone);zone.innerHTML='';}
export async function chercherReseau(valeur,zone,appel){
  const demande={};demandes.set(zone,demande);zone.innerHTML='<p role="status">Recherche dans les profils du site et les fiches du live…</p>';
  try{
    const r=await appel({action:'annonce_rechercher_reseau',recherche:valeur});if(demandes.get(zone)!==demande)return;
    zone.innerHTML=`<p role="status">${r.resultats.length?`${r.resultats.length} fiche(s) ou profil(s) retrouvé(s) pour ${esc(valeur)}.`:'Aucun profil ni fiche retrouvé pour ce lien.'}</p>${liensResultats(r.resultats)}`;
  }catch(e){if(demandes.get(zone)!==demande)return;zone.innerHTML=`<p role="status">${e.code==='reseau_invalide'?'Indique un lien de profil TikTok, Instagram ou Facebook, ou un @pseudo TikTok.':'La recherche est momentanément indisponible. Réessaie : cela ne signifie pas que la fiche est absente.'}</p>`;}
}
