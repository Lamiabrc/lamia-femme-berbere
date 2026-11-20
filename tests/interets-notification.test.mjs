import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { notificationInteret, lienInteret } from '../content/interets-notification.mjs';
import { creerInteretUnique } from '../lib/interets-notification.mjs';
import { handleAnnonces } from '../lib/annonces.mjs';
const uid=randomUUID(),aid=randomUUID(),iid=randomUUID(),autreId=randomUUID();
const moi={id:aid,ref:44,user_id:uid,status:'publiee',genre:'homme',email:'membre@fictif.invalid',test:false};
const source={ref:8,status:'publiee',genre:'femme',birth_date:'1998-01-01',profil:'Présentation fictive',recherche:'Relation sérieuse.',test:false};
function base({statut='a_traiter',reponse=null,testSource=false,retiree=false}={}){
  const i={id:iid,cible_ref:6001,demandeur_id:autreId,statut,reponse,reciproque:reponse==='oui',annonces:{...source,test:testSource,status:retiree?'retiree':'publiee'}};
  let panne=false;const writes=[],lectures=[];
  const read=async(path)=>{
    lectures.push(path);if(panne && path.includes('/annonce_interets?'))throw new Error('lecture indisponible');
    if(path.includes('/annonces?'))return [structuredClone(moi)];
    if(path.includes('/profils_outil?'))return [{ref:6001,user_id:uid}];
    if(path.includes('/annonce_interets?')){const q=new URL(path,'https://fictif.invalid').searchParams;if(q.get('id')&&q.get('id')!==`eq.${iid}`)return [];return [structuredClone(i)];}
    return [];
  };
  const ctx={user:{id:uid,email:moi.email,app_metadata:{}},admin:false,read,env:{},now:()=>new Date('2026-11-20T14:00:00Z'),call:async(...args)=>{writes.push(args);return Response.json([]);},patch:async()=>{throw new Error('aucune écriture attendue');},email:async()=>{throw new Error('aucun email attendu');},alerter:async()=>{}};
  const action=async(n,b={})=>{const r=await handleAnnonces(n,b,ctx);return {status:r.status,...await r.json()};};
  return {i,ctx,action,writes,lectures,panne:()=>{panne=true;}};
}
test('un ancien oui sans suite ne promet plus un match, une réserve dit clairement son attente',()=>{
  assert.equal(notificationInteret({id:iid,statut:'pas_compatible',reponse:'oui'}).etat,'termine');
  assert.match(notificationInteret({id:iid,statut:'en_reserve',reponse:'oui'}).texte,/attente de disponibilité/);
  assert.match(lienInteret(iid),new RegExp(`interet=${iid}#interets$`));
});
test('une création concurrente en doublon renvoie un seul nouvel intérêt, sans 409',async()=>{
  const lignes=[];const call=async(_path,opt)=>{
    assert.match(opt.headers.Prefer,/ignore-duplicates/);const row=JSON.parse(opt.body);
    if(lignes.some((x)=>x.demandeur_id===row.demandeur_id&&x.cible_ref===row.cible_ref))return Response.json([]);
    const n={id:randomUUID(),...row};lignes.push(n);return Response.json([n]);
  };
  const out=await Promise.all([creerInteretUnique(call,{demandeur_id:aid,cible_ref:6001}),creerInteretUnique(call,{demandeur_id:aid,cible_ref:6001})]);assert.equal(out.filter(Boolean).length,1);assert.equal(lignes.length,1);
});
test('un intérêt précis terminé est expliqué sans réactiver la demande',async()=>{
  const b=base({statut:'pas_compatible',reponse:'oui'}),r=await b.action('annonce_interets_recus',{notification_id:iid});assert.equal(r.notification.etat,'termine');assert.equal(r.interets[0].statut,'pas_compatible');assert.equal(b.writes.length,0);
});
test('profil retiré, lien absent et profil de test ne divulguent aucun ancien portrait',async()=>{
  for(const opts of [{retiree:true},{testSource:true}]){const b=base(opts),r=await b.action('annonce_interets_recus',{notification_id:iid});assert.equal(r.notification.etat,'indisponible');assert.equal(r.interets.length,0);assert.doesNotMatch(JSON.stringify(r),/Présentation fictive/);}
  const b=base(),r=await b.action('annonce_interets_recus',{notification_id:randomUUID()});assert.equal(r.notification.etat,'indisponible');assert.ok(b.lectures.some((p)=>p.includes('id=eq.')&&p.includes('cible_ref=in.(44,6001)')));
});
test('une panne de lecture n’est pas transformée en liste vide réussie',async()=>{
  const b=base();b.panne();await assert.rejects(b.action('annonce_interets_recus'),/lecture indisponible/);
});
test('réponse répétée et intérêt terminé ne déclenchent aucune modification ni notification',async()=>{
  const b=base({reponse:'oui'}),r=await b.action('annonce_repondre_interet',{id:iid,reponse:'oui'});assert.equal(r.deja,true);assert.equal(b.writes.length,0);
  const c=base({statut:'pas_compatible',reponse:'oui'});assert.equal((await c.action('annonce_repondre_interet',{id:iid,reponse:'oui'})).error,'interet_termine');assert.equal(c.writes.length,0);
});
test('identifiant de notification invalide et absence de connexion sont refusés',async()=>{
  const b=base();assert.equal((await b.action('annonce_interets_recus',{notification_id:'xx&select=*'})).status,400);
  const r=await handleAnnonces('annonce_interets_recus',{}, {...b.ctx,user:null});assert.equal(r.status,401);
});
test('le pilote ne suspend ni un premier avertissement photo ni tous les membres pendant une panne de lecture',async()=>{
  for(const avertissement of [true,false]){
    const changements=[];const profil={...moi,prenom:'Recette',photos_moderation:avertissement?{etat:'avertissement'}:null};
    const read=async(p)=>{
      if(p==='/rest/v1/annonces?status=eq.publiee&test=eq.false&select=*&limit=2000')return [profil];
      if(p.includes('/annonce_files?kind=eq.photo&annonce_id=in.')){if(!avertissement)throw new Error('panne de lecture');return [];}
      return [];
    };
    const r=await handleAnnonces('annonce_pilote',{op:'lancer'},{env:{},admin:true,user:{id:uid,app_metadata:{role:'admin'}},read,call:async()=>Response.json([]),insert:async()=>({}),patch:async(t,f,v)=>{changements.push({t,f,v});return {ok:true};},now:()=>new Date('2026-11-20'),email:async()=>true,alerter:async()=>{}});
    assert.equal(r.status,200);assert.ok(!changements.some((x)=>x.t==='annonces'&&x.v.status==='a_verifier'));
  }
});
