import {pseudoDepuisTikTok} from './liens-tiktok.mjs';
// Identité d'un profil social : domaine vérifié, sans paramètres de partage.
export function identiteReseau(valeur){
  const s=String(valeur||'').trim(),tik=pseudoDepuisTikTok(s);
  if(tik)return `tiktok:${tik}`;
  let u;try{u=new URL(/^[a-z]+:/i.test(s)?s:`https://${s}`);}catch{return '';}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return '';
  const h=u.hostname.toLowerCase().replace(/^(www|m)\./,''),part=u.pathname.split('/').filter(Boolean);
  let nom='',reseau='';
  if(h==='instagram.com'){reseau='instagram';nom=part[0]||'';if(['p','reel','reels','stories','explore'].includes(nom.toLowerCase()))return '';}
  if(['facebook.com','fb.com'].includes(h)){reseau='facebook';nom=part[0]==='profile.php'?u.searchParams.get('id'):part[0];if(['share','watch','reel','groups'].includes(String(nom).toLowerCase()))return '';}
  nom=String(nom||'').toLowerCase().replace(/\.+$/,'');
  return reseau&&/^[\w.]{2,60}$/.test(nom)?`${reseau}:${nom}`:'';
}
