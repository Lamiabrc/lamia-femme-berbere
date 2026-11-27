import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {backend} from './fake-confidences.mjs';
import {handleConfidences} from '../lib/confidences.mjs';
import {envoyerEmail} from '../lib/email-transactionnel.mjs';

test('reprise admin : API → transport → budget → fournisseur, deux emails malgré un email récent et aucun doublon',async()=>{
 const admin={id:randomUUID(),email:'admin@example.fr',app_metadata:{role:'admin'}}, a={id:randomUUID(),email:'a@example.fr'}, b={id:randomUUID(),email:'b@example.fr'};
 const be=backend({users:{ADMIN:admin,A:a,B:b}}), id=randomUUID(), interet=randomUUID();
 const now=()=>new Date('2026-11-27T21:00Z');
 const env={SUPABASE_SERVICE_ROLE_KEY:'cle-fictive-recette-priorite',RESEND_API_KEY:'fictif',RESEND_FROM:'TAYRI <test@example.fr>',EMAILS_TOUS:'1'};
 be.db.annonces.push({id:randomUUID(),ref:11,user_id:a.id,status:'publiee',email:a.email,prenom:'Recette A',genre:'femme'},{id:randomUUID(),ref:12,user_id:b.id,status:'publiee',email:b.email,prenom:'Recette B',genre:'homme'});
 be.db.annonce_interets=[{id:interet,statut:'mis_en_relation',via:'lamia_main'}];
 be.db.discussions=[{id,interet_id:interet,a_ref:11,b_ref:12,a_user:a.id,b_user:b.id,ferme_at:'2026-12-11',dematch_at:null,close_raison:null,signalee_at:null}];
 be.db.blocages=[];be.db.alertes_membres=[];
 const ctx={env,fetcher:be.fetcher,now};
 for(const to of [a.email,b.email])assert.equal((await envoyerEmail({to,subject:'Ancienne alerte',text:'Fictif',notification:true},ctx)).ok,true);
 const appel=async(token='ADMIN')=>{
  const r=await handleConfidences(new Request('https://recette.invalid/api/confidences',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({action:'annonce_pilote',op:'notifier_match',id})}),ctx);
  return {status:r.status,...await r.json()};
 };
 assert.equal((await appel('A')).status,403);assert.equal(be.mails.length,2);
 const premier=await appel();assert.equal(premier.status,200);
 assert.ok(premier.notifications.every(n=>n.email_envoye));assert.equal(be.mails.length,4);
 assert.equal((await appel()).status,200);assert.equal(be.mails.length,4);
 assert.equal((await envoyerEmail({to:a.email,subject:'Autre alerte',notification:true},ctx)).motif,'personne_24h');
 assert.equal(be.db.platform_settings.find(r=>r.key==='email-notification-jour-2026-11-27').value.compteur,4);
 assert.equal(be.db.discussions.length,1);
 be.db.discussions[0].close_raison='dematch';assert.equal((await appel()).status,409);assert.equal(be.mails.length,4);
});
