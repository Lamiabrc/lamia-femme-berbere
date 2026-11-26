import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { handleAnnonces, essentielManquant, jetonAnnonce } from '../lib/annonces.mjs';
import { nettoyerBrouillon } from '../content/inscription-courte.mjs';
import { profilDepuisAnnonce } from '../lib/matching-direct.mjs';
const uid='10000000-0000-4000-8000-000000000001', id='10000000-0000-4000-8000-000000000002';
const user={id:uid,email:'nina@example.invalid'};
const env={SUPABASE_SERVICE_ROLE_KEY:'fixture',INSCRIPTION_BROUILLON_SERVEUR:'1'};
const base={env,user,admin:false,ipHash:'fixture',now:()=>new Date('2026-11-26T12:00:00Z'),read:async()=>[],call:async()=>Response.json({}),insert:async()=>({}),patch:async()=>({}),email:async()=>true,alerter:async()=>{}};

test('sans activation : aucune nouvelle table, compte compatible marqué à reconfirmer',async()=>{
 const calls=[];const ctx={...base,env:{SUPABASE_SERVICE_ROLE_KEY:'fixture'},user:null,email:async()=>{throw Error('email inattendu');},read:async p=>{assert.ok(!p.includes('inscription_brouillons'));return [];},call:async(p,o)=>{assert.ok(!p.includes('inscription_brouillons'));calls.push({p,body:JSON.parse(o.body)});return Response.json({user:{id:uid},properties:{action_link:'https://auth.example/verify'}});}};
 const d=await handleAnnonces('annonce_brouillon',{}, {...ctx,user});assert.deepEqual(await d.json(),{ok:true,brouillon:null,local_seulement:true});
 const r=await handleAnnonces('annonce_creer_compte',{email:user.email,password:'motdepasse-test',prenom:'Nina',brouillon:{prenom:'Nina'}},ctx);
 assert.equal(r.status,200);assert.equal((await r.json()).a_reconfirmer,true);const maj=calls.find(c=>c.p===`/auth/v1/admin/users/${uid}`);assert.equal(maj.body.user_metadata.a_reconfirmer,true);
});

test('brouillon : liste blanche, pas de mot de passe ni d’adresse email, borne des valeurs',()=>{
 const b=nettoyerBrouillon({prenom:'Nina',age:'32',ville:'x'.repeat(300),password:'secret',email:user.email,majeur:true,origineCourte:'inventée',age_min:17});
 assert.equal(b.ville.length,80);assert.equal(b.age,'32');assert.equal(b.origineCourte,'');assert.equal(b.age_min,'');assert.equal(b.password,undefined);assert.equal(b.email,undefined);assert.equal(b.majeur,undefined);
});

test('reprise en ligne : compte obligatoire et propriétaire imposé par la session',async()=>{
 const appels=[];const ctx={...base,call:async(path,opt)=>{appels.push({path,body:JSON.parse(opt.body)});return Response.json({});}};
 assert.equal((await handleAnnonces('annonce_brouillon',{donnees:{prenom:'Nina'}},{...ctx,user:null})).status,401);
 assert.equal(appels.length,0);
 assert.equal((await handleAnnonces('annonce_brouillon',{user_id:'autre',donnees:{prenom:'Nina',password:'jamais'},etape:2},ctx)).status,200);
 assert.equal(appels[0].body.user_id,uid);assert.equal(appels[0].body.donnees.password,undefined);assert.equal(appels[0].body.expires_at,'2026-12-03T12:00:00.000Z');
 let lecture;await handleAnnonces('annonce_brouillon',{user_id:'autre'},{...base,read:async p=>{lecture=p;return [];}});
 assert.ok(lecture.includes(`user_id=eq.${uid}`));assert.ok(lecture.includes('expires_at=gt.'));
});

test('migration additive : ni anonyme ni membre ne peut lire directement les brouillons privés',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${uid}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261126143000_inscription_brouillons.sql',import.meta.url),'utf8'));
  await db.query('insert into inscription_brouillons(user_id,donnees) values($1,$2)',[uid,{prenom:'Nina'}]);
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from inscription_brouillons'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');assert.equal((await db.query('select * from inscription_brouillons')).rows.length,1);await db.exec('reset role');
  await assert.rejects(db.query('update inscription_brouillons set etape=4'),/check constraint/);
 }finally{await db.close();}
});

test('dépôt court : les critères non demandés restent absents, le souhait de rencontre ne contacte personne',async()=>{
 const rows=[],calls=[];
 const r=await handleAnnonces('annonce_deposer',{inscription_version:1,prenom:'Nina',genre:'femme',age:32,ville:'Ville fictive',pays:'France',email:user.email,majeur:true,publication:true,recherche:'Une personne calme avec un projet de vie sincère.',age_min:30,age_max:42,matching:{origineTags:['Kabyle (Algerie)'],zoneGeo:'France'},interet_ref:9,medias:[1,2].map(()=>({role:'media',type:'image/jpeg',size:1000}))},{...base,insert:async(t,row)=>{rows.push({t,row});return {id,ref:900,...row};},call:async(p,o)=>{calls.push({p,o});return Response.json({url:'/fictif'});}});
 assert.equal(r.status,200);const a=rows.find(x=>x.t==='annonces').row;
 assert.equal(a.matching.accepteDivorce,undefined);assert.equal(a.matching.accepteEnfants,undefined);assert.equal(a.matching.inscriptionVersion,1);assert.equal(a.matching.interetSouhaite,9);
 assert.equal(rows.filter(x=>x.t==='annonce_interets').length,0);assert.ok(!calls.some(x=>x.p.includes('/annonce_interets')));
 assert.deepEqual(essentielManquant(a),[]);
 const p=await profilDepuisAnnonce({...a,ref:900,status:'publiee',age:32});assert.equal(p.accepteDivorce,null);assert.equal(p.accepteEnfants,null);
});

test('deux photos reçues : le profil reste en attente de validation humaine',async()=>{
 const a={id,ref:900,status:'brouillon',prenom:'Nina',genre:'femme',email:user.email,user_id:uid,matching:{inscriptionVersion:1}};
 const files=[1,2].map(i=>({id:`photo-${i}`,kind:'photo',storage_path:`${id}/photo-${i}.jpg`}));const changements=[];
 const r=await handleAnnonces('annonce_finaliser',{annonce_id:id,token:jetonAnnonce(env,id,'envoi')},{...base,read:async p=>p.startsWith('/rest/v1/annonces?id=')?[a]:p.includes('annonce_files')?files:[],patch:async(t,q,row)=>{changements.push({t,row});return row;},call:async p=>p.includes('/object/list/')?Response.json(files.map(f=>({name:f.storage_path.slice(id.length+1)}))):Response.json({})});
 assert.equal(r.status,200);assert.ok(changements.some(x=>x.row.status==='a_verifier'));assert.ok(!changements.some(x=>x.row.status==='publiee'));
});

test('un profil non validé ne peut pas envoyer de cœur ni répondre oui',async()=>{
 const a={id,ref:900,status:'a_verifier',user_id:uid,email:user.email};let ecritures=0;
 for(const action of ['annonce_interet','annonce_swipe','annonce_relancer']){
  const r=await handleAnnonces(action,{ref:9,choix:'oui'},{...base,read:async p=>p.includes('/annonces?or=')?[a]:[],insert:async()=>{ecritures++;return {};}});
  assert.equal(r.status,403);assert.equal((await r.json()).error,'profil_non_verifie');
 }assert.equal(ecritures,0);
});

test('modifier une seule réponse préserve les critères avancés et permet un retour à « non renseigné »',async()=>{
 const a={id,ref:900,status:'publiee',user_id:uid,email:user.email,matching:{inscriptionVersion:1,hardPreferences:['age'],accepteUnEnfant:true,religionAutre:'Une précision conservée',accepteDivorce:false}};
 const changements=[];const ctx={...base,read:async p=>p.includes('/annonces?or=')?[a]:[],patch:async(t,q,v)=>{changements.push(v);return v;}};
 await handleAnnonces('annonce_modifier',{matching:{zoneGeo:'France',accepteDivorce:null}},ctx);
 const m=changements[0].matching;assert.deepEqual(m.hardPreferences,['age']);assert.equal(m.accepteUnEnfant,true);assert.equal(m.religionAutre,'Une précision conservée');assert.equal(m.accepteDivorce,undefined);assert.equal(m.accepteVeuf,undefined);
});

test('un numéro de profil en attente ne permet aucun contact ni consommation de cœur',async()=>{
 const a={id,ref:900,status:'publiee',user_id:uid,email:user.email,matching:{}};let ecritures=0;
 const ctx={...base,formuleDe:async()=> 'decouverte',read:async p=>p.includes('/annonces?or=')?[a]:p.includes('/annonces?ref=eq.9')?[{ref:9,status:'a_verifier'}]:p.includes('declarations_sincerite')?[{}]:p.includes('annonce_files?annonce_id=')?[{kind:'photo'},{kind:'photo'}]:[],insert:async()=>{ecritures++;return {};}};
 const r=await handleAnnonces('annonce_interet',{ref:9},ctx);assert.equal(r.status,403);assert.equal((await r.json()).error,'profil_non_verifie');assert.equal(ecritures,0);
});

test('un ancien brouillon conserve ses réponses détaillées sans garder de credentials',()=>{
 const d=nettoyerBrouillon({historique:{profil:'Une ancienne présentation.',matching:{hardPreferences:['age'],accepteDivorce:true,religionAutre:'Une précision',password:'secret',email:'prive@example.invalid'}}});
 assert.equal(d.historique.profil,'Une ancienne présentation.');assert.deepEqual(d.historique.matching.hardPreferences,['age']);assert.equal(d.historique.matching.accepteDivorce,true);assert.equal(d.historique.matching.accepteVeuf,undefined);assert.equal(d.historique.matching.password,undefined);assert.equal(d.historique.matching.email,undefined);
});

test('Lamia peut valider le parcours court sans exiger la présentation reportée à plus tard',async()=>{
 const a={id,ref:900,status:'a_verifier',user_id:uid,email:'nina@example.test',prenom:'Nina',matching:{inscriptionVersion:1,zoneGeo:'France'},age_min:30,age_max:42};const changements=[];
 const r=await handleAnnonces('annonce_admin_valider',{ref:900},{...base,admin:true,user:{id:'admin',app_metadata:{role:'admin'}},read:async p=>p.startsWith('/rest/v1/annonces?ref=eq.900')?[a]:p.includes('/annonce_files?annonce_id=')?[{kind:'photo'},{kind:'photo'}]:[],patch:async(t,q,row)=>{changements.push(row);return row;}});
 assert.equal(r.status,200);assert.ok(changements.some(v=>v.status==='publiee'));
});
