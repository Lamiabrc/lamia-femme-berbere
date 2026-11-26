// Données nécessaires à une reprise, sans email, mot de passe, consentement ni photo.
import { O, choixPropres } from './matching-options.mjs';
export function nettoyerBrouillon(v={}) {
  const txt=(k,n)=>String(v[k]??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);
  const entier=k=>{const n=Number(v[k]);return Number.isInteger(n)&&n>=18&&n<=99?String(n):'';};
  const d={prenom:txt('prenom',60),genre:['femme','homme'].includes(v.genre)?v.genre:'',age:entier('age'),ville:txt('ville',80),pays:O.pays.includes(v.pays)?v.pays:'',origineCourte:O.origine.includes(v.origineCourte)?v.origineCourte:'',age_min:entier('age_min'),age_max:entier('age_max'),zoneGeo:O.zoneGeo.includes(v.zoneGeo)?v.zoneGeo:'',recherche:txt('recherche',1500)};
  if(v.historique && typeof v.historique==='object'){
    const m=v.historique.matching&&typeof v.historique.matching==='object'?v.historique.matching:{};
    d.historique={profil:String(v.historique.profil||'').slice(0,1500),matching:Object.fromEntries(Object.entries(choixPropres(m)).filter(([k])=>Object.hasOwn(m,k)))};
  }
  return d;
}
