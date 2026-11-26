// Budget partagé des emails facultatifs, avant tout appel à un fournisseur.
// Réservations conservatrices : une réponse DB incertaine interdit l'envoi.
// Pas de migration : clés privées dans platform_settings, dont key est unique.
import { createHmac } from 'node:crypto';
import { DATABASE_URL, serviceHeaders } from './event-tickets.mjs';

export async function reserverNotification(to, {env,fetcher=fetch,now=()=>new Date()}={}) {
  const secret=env?.SUPABASE_SERVICE_ROLE_KEY||env?.SUPABASE_SECRET_KEY;
  if(!secret)return {ok:false,motif:'budget_indisponible'};
  const instant=now(), stamp=instant.toISOString();
  const max=80;
  const jour=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);
  const personne='email-notification-membre-'+createHmac('sha256',secret).update(String(to).trim().toLowerCase()).digest('hex');
  const global='email-notification-jour-'+jour;
  const signal=AbortSignal.timeout(5000);
  const lire=async(path,init={})=>{
    const r=await fetcher(`${DATABASE_URL}/rest/v1/platform_settings?${path}`,{...init,headers:serviceHeaders(env,{'Prefer':'return=representation',...init.headers}),signal});
    if(!r.ok)throw Error('budget_indisponible');
    const rows=await r.json();if(!Array.isArray(rows))throw Error('budget_indisponible');return rows;
  };
  const inserer=(key,value)=>lire('on_conflict=key&select=key',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({key,value,updated_at:stamp})});
  try{
    // L'unicité de key et la mise à jour conditionnelle empêchent deux fonctions
    // concurrentes de réserver la même fenêtre de 24 h.
    const nouveau=await inserer(personne,{reserve:true});
    if(!nouveau.length){
      const seuil=encodeURIComponent(new Date(instant.getTime()-86400e3).toISOString());
      const pris=await lire(`key=eq.${personne}&updated_at=lte.${seuil}&select=key`,{method:'PATCH',body:JSON.stringify({updated_at:stamp,value:{reserve:true}})});
      if(!pris.length)return {ok:false,motif:'personne_24h'};
    }
    if((await inserer(global,{compteur:1})).length)return {ok:true};
    // Comparer puis remplacer sous condition : la base réévalue le compteur
    // après verrouillage ; une concurrence ne peut pas dépasser 80 réservations.
    for(let essai=0;essai<4;essai++){
      const [r]=await lire(`key=eq.${global}&select=value`);
      const n=r?.value?.compteur;
      if(!Number.isInteger(n)||n<1)return {ok:false,motif:'budget_indisponible'};
      if(n>=max)return {ok:false,motif:'plafond_jour'};
      const pris=await lire(`key=eq.${global}&value->>compteur=eq.${n}&select=key`,{method:'PATCH',body:JSON.stringify({value:{compteur:n+1},updated_at:stamp})});
      if(pris.length)return {ok:true};
    }
    return {ok:false,motif:'budget_occupe'};
  }catch{return {ok:false,motif:'budget_indisponible'};}
}
