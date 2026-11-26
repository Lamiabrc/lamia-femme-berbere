import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleAnnonces, jetonAnnonce, empreinteLien } from '../lib/annonces.mjs';
import {lireFiches} from './fake-fiches.mjs';
import {pseudoDepuisTikTok} from '../content/liens-tiktok.mjs';

const ADMIN = {id:'admin-test',app_metadata:{role:'admin'}}, MEMBRE = {id:'membre-test',email:'membre@recette.invalid',app_metadata:{}};
const profil = () => ({genre:'femme',age:34,pays:'France',ville:'Lyon',profil:'Calme et attachée aux liens familiaux.',recherche:'Une relation sérieuse et respectueuse.',age_min:30,age_max:42,origine:[]});
const creation = (extra={}) => ({requete_id:randomUUID(),profil:profil(),...extra});
const lire = async (r) => ({status:r.status,...await r.json()});
function base() {
  const fiches=[],contacts=[],empreintes=[], ecritures=[], appels=[]; let sequence=5001;
  const read = async (path) => {
    appels.push(path);return lireFiches(path,{fiches,contacts,empreintes});
  };
  const insert = async (table,row) => {
    assert.equal(table,'profils_outil');
    if(fiches.some((f)=>f.outil_id===row.outil_id))throw new Error('unique');
    const f={ref:sequence++,confirme_at:null,retire_at:null,effacement_at:null,user_id:null,...row};fiches.push(f);ecritures.push(structuredClone(row));return structuredClone(f);
  };
  const patch = async (table,filter,row) => {
    ecritures.push({table,filter,row});if(table==='profils_outil')for(const f of fiches)if(filter.split('&')[0]===`ref=eq.${f.ref}`&&(!filter.includes('user_id=is.null')||f.user_id==null))Object.assign(f,row);
    return {ok:true};
  };
  const contexte = (user=ADMIN) => ({env:{SUPABASE_SERVICE_ROLE_KEY:'recette-seulement'},user,admin:user?.app_metadata?.role==='admin',read,insert,patch,
    now:()=>new Date('2026-11-19T16:00:00Z'),call:async()=>{throw new Error('Aucun appel Auth ou envoi autorisé dans cette recette');},alerter:async()=>{}});
  const envoyer = (action,body={},user=ADMIN,dep={})=>handleAnnonces(action,body,{...contexte(user),...dep}).then(lire);
  return {fiches,contacts,empreintes,ecritures,appels,envoyer,contexte,insert};
}

test('TikTok : normaliser les liens de profil et pseudos, refuser les redirections et domaines trompeurs',()=>{
 for(const s of ['@Nina.Test','nina.test','https://www.tiktok.com/@Nina.Test?lang=fr&share=1','https://m.tiktok.com/@Nina.Test/video/123'])assert.equal(pseudoDepuisTikTok(s),'nina.test');
 for(const s of ['javascript:alert(1)','https://tiktok.com.evil.invalid/@nina.test','https://vm.tiktok.com/abcd/','https://instagram.com/nina.test','nina,test','https://user:secret@www.tiktok.com/@nina.test'])assert.equal(pseudoDepuisTikTok(s),'');
});

test('création, liste et lien : refus avant lecture pour un visiteur, membre ou faux rôle user_metadata',async()=>{
  const b=base();
  for(const user of [null,MEMBRE,{...MEMBRE,user_metadata:{role:'admin'}}])for(const action of ['annonce_fiche_admin_creer','annonce_fiches_admin','annonce_lien_fiche_admin']){
    const r=await b.envoyer(action,creation(),user);assert.equal(r.status,403);
  }
  assert.equal(b.appels.length,0);assert.equal(b.ecritures.length,0);
});
test('une fiche préparée reste invisible et son lien signé reprend le parcours existant, sans créer de compte',async()=>{
  const b=base(), body=creation();body.profil.profil+=' Contact : hello@example.com 0612345678';
  body.profil.email='adresse-privee@recette.invalid';body.profil.password='secret-interdit';
  const r=await b.envoyer('annonce_fiche_admin_creer',body);
  assert.equal(r.status,200);assert.equal(r.fiche.confirmation,'en_attente');assert.equal(r.fiche.visible,false);
  assert.equal(b.fiches[0].user_id,null);assert.deepEqual(b.fiches[0].origine,[]);
  const url=new URL(r.fiche.lien);assert.equal(url.pathname,'/rencontres/confirmer/');assert.equal(url.searchParams.get('n'),'5001');
  assert.equal(url.searchParams.get('t'),jetonAnnonce(b.contexte().env,'outil-5001','confirmer'));
  assert.doesNotMatch(JSON.stringify(b.ecritures),/hello@example|0612345678|adresse-privee|secret-interdit/);
});
test('Lamia peut demander explicitement la publication immédiate de l’annonce anonyme',async()=>{
  const b=base(),r=await b.envoyer('annonce_fiche_admin_creer',creation({publier:true}));
  assert.equal(r.fiche.visible,true);assert.equal(r.fiche.confirmation,'en_attente');
});
test('les âges, le genre, le pays et les textes sont contrôlés côté serveur',async()=>{
  for(const diff of [{age:17},{age:100},{age:32.5},{genre:'autre'},{age_min:45,age_max:25},{age_min:17},{profil:'  '},{recherche:''},{pays:''}]){
    const b=base(),r=await b.envoyer('annonce_fiche_admin_creer',creation({profil:{...profil(),...diff}}));assert.equal(r.status,400,JSON.stringify(diff));assert.equal(b.ecritures.length,0);
  }
});
test('réponse perdue après insertion : un nouvel essai récupère la fiche, sans doublon',async()=>{
  const b=base(),body=creation();
  const r=await b.envoyer('annonce_fiche_admin_creer',body,ADMIN,{insert:async(...args)=>{await b.insert(...args);throw new Error('accusé perdu');}});
  assert.equal(r.rejoue,true);const autre=await b.envoyer('annonce_fiche_admin_creer',body);
  assert.equal(autre.fiche.lien,r.fiche.lien);assert.equal(b.fiches.length,1);
});
test('deux créations concurrentes avec la même tentative gardent un seul numéro',async()=>{
  const b=base(),body=creation(),r=await Promise.all([b.envoyer('annonce_fiche_admin_creer',body),b.envoyer('annonce_fiche_admin_creer',body)]);
  assert.ok(r.every((x)=>x.ok));assert.equal(r[0].fiche.ref,r[1].fiche.ref);assert.equal(b.fiches.length,1);
});
test('une relance ne peut ni écraser un autre texte, ni réactiver une fiche retirée',async()=>{
  const b=base(),body=creation();await b.envoyer('annonce_fiche_admin_creer',body);
  const r=await b.envoyer('annonce_fiche_admin_creer',{...body,profil:{...body.profil,profil:'Autre portrait'}});assert.equal(r.status,409);
  b.fiches[0].retire_at='2026-11-19';const rejoue=await b.envoyer('annonce_fiche_admin_creer',body);
  assert.equal(rejoue.fiche.lien,null);assert.equal(rejoue.fiche.visible,false);assert.equal(rejoue.fiche.confirmation,'retiree');
});
test('la liste est paginée et le lien peut être retrouvé par numéro, y compris pour une ancienne fiche',async()=>{
  const b=base();for(let i=0;i<23;i++)await b.envoyer('annonce_fiche_admin_creer',creation());
  b.fiches.push({ref:6000,outil_id:'ancienne-fiche',age:40,genre:'homme'});
  const r=await b.envoyer('annonce_fiches_admin');assert.equal(r.fiches.length,20);assert.equal(r.suivant,5005);assert.equal(r.fiches[0].ref,6000);assert.equal(r.fiches[0].source_creation,'live');
  const suite=await b.envoyer('annonce_fiches_admin',{avant:r.suivant});assert.equal(suite.fiches.length,4);assert.equal(suite.suivant,null);
  assert.equal(new Set([...r.fiches,...suite.fiches].map(f=>f.ref)).size,24);
  const ancienne=await b.envoyer('annonce_lien_fiche_admin',{ref:6000});assert.equal(ancienne.fiche.ref,6000);assert.ok(ancienne.fiche.lien);
  assert.equal((await b.envoyer('annonce_lien_fiche_admin',{ref:'6000&select=*'})).status,400);
});

test('anciennes fiches, sans identifiant d’outil et nouveau formulaire : toutes accessibles, sources filtrables',async()=>{
 const b=base();await b.envoyer('annonce_fiche_admin_creer',creation());
 b.fiches.push({ref:8366,outil_id:'ancien-live',genre:'femme',confirme_at:'2026-11-01',visible:true},{ref:8367,outil_id:null,genre:'homme'});
 const ecritures=b.ecritures.length;
 const toutes=await b.envoyer('annonce_fiches_admin');assert.deepEqual(toutes.fiches.map(f=>f.ref),[8367,8366,5001]);
 assert.deepEqual((await b.envoyer('annonce_fiches_admin',{source_creation:'live'})).fiches.map(f=>f.ref),[8367,8366]);
 assert.deepEqual((await b.envoyer('annonce_fiches_admin',{source_creation:'site'})).fiches.map(f=>f.ref),[5001]);
 assert.equal((await b.envoyer('annonce_lien_fiche_admin',{ref:8366})).fiche.ref,8366);assert.equal(b.ecritures.length,ecritures);
 assert.equal((await b.envoyer('annonce_fiches_admin',{source_creation:'live&select=*'})).status,400);
});

test('sans compte : filtrer avant de paginer, sans être bloqué par les vingt premiers comptes liés',async()=>{
 const b=base();for(let i=0;i<24;i++)b.fiches.push({ref:9000+i,outil_id:'live-'+i,user_id:'compte-'+i});
 b.fiches.push({ref:8366,outil_id:'ancienne-sans-compte',visible:true,confirme_at:'2026-11-01'});
 const r=await b.envoyer('annonce_fiches_admin',{sans_compte:true,actives_seulement:true});assert.deepEqual(r.fiches.map(f=>f.ref),[8366]);assert.equal(r.suivant,null);
});

test('TikTok : contacts des lives, liens saisis, empreintes historiques et correction prioritaire',async()=>{
 const b=base();
 b.fiches.push({ref:8366,outil_id:'live-8366',visible:true},{ref:8367,outil_id:'site-admin-manuel',lien_reseau:'https://www.tiktok.com/@Nina.Test?share=1'},{ref:8368,outil_id:'identifiant,"(ancien)'},{ref:8369,outil_id:'corrige',lien_reseau:'https://www.tiktok.com/@nouveau.pseudo'});
 b.contacts.push({ref:8366,reseau:'tiktok',pseudo:'nina.test'},{ref:8369,reseau:'tiktok',pseudo:'nina.test'});
 b.empreintes.push({h:empreinteLien('tiktok:nina.test'),outil_id:'identifiant,"(ancien)'});
 const toutes=await b.envoyer('annonce_fiches_admin');assert.equal(toutes.fiches.find(f=>f.ref===8366).tiktok.lien,'https://www.tiktok.com/@nina.test');
 const r=await b.envoyer('annonce_fiches_admin',{tiktok:'https://www.tiktok.com/@Nina.Test?lang=fr'});assert.deepEqual(r.fiches.map(f=>f.ref),[8368,8367,8366]);
 assert.deepEqual((await b.envoyer('annonce_fiches_admin',{tiktok:'@nina.test',source_creation:'live'})).fiches.map(f=>f.ref),[8368,8366]);
 assert.deepEqual((await b.envoyer('annonce_fiches_admin',{tiktok:'@nouveau.pseudo'})).fiches.map(f=>f.ref),[8369]);
 assert.equal((await b.envoyer('annonce_lien_fiche_admin',{ref:8367})).fiche.tiktok.pseudo,'nina.test');
 assert.equal((await b.envoyer('annonce_fiches_admin',{tiktok:'https://evil.invalid/@nina.test'})).status,400);assert.equal(b.ecritures.length,0);
});

test('recherche TikTok paginée : toutes les correspondances restent récupérables, sans doublon',async()=>{
 const b=base();for(let i=0;i<23;i++){b.fiches.push({ref:8366+i,outil_id:'live-'+i});b.contacts.push({ref:8366+i,reseau:'tiktok',pseudo:'meme.pseudo'});}
 const a=await b.envoyer('annonce_fiches_admin',{tiktok:'@meme.pseudo'}),c=await b.envoyer('annonce_fiches_admin',{tiktok:'@meme.pseudo',avant:a.suivant});
 assert.equal(a.fiches.length,20);assert.equal(c.fiches.length,3);assert.equal(new Set([...a.fiches,...c.fiches].map(f=>f.ref)).size,23);
});

test('ajouter/corriger uniquement TikTok conserve la fiche et la prise de contact utilise le lien corrigé',async()=>{
 const b=base();b.fiches.push({ref:8366,outil_id:'ancien',genre:'femme',visible:false,pause_at:'2026-11-01',matching:{hardPreferences:['age']},profil:'Portrait conservé'});b.contacts.push({ref:8366,reseau:'tiktok',pseudo:'ancien.pseudo'});
 const r=await b.envoyer('annonce_admin_completer',{ref:8366,lien_reseau:'https://www.tiktok.com/@nouveau.pseudo'});assert.equal(r.status,200);
 assert.equal(b.fiches[0].visible,false);assert.equal(b.fiches[0].pause_at,'2026-11-01');assert.equal(b.fiches[0].profil,'Portrait conservé');assert.deepEqual(b.fiches[0].matching,{hardPreferences:['age']});
 assert.equal((await b.envoyer('annonce_contact_preparer',{ref:8366})).lien,'https://www.tiktok.com/@nouveau.pseudo');
});

test('une panne des contacts ne fait pas disparaître les fiches ni prétendre que les liens manquent',async()=>{
 const b=base();b.fiches.push({ref:8366,outil_id:'live'});const lire=b.contexte().read;
 const r=await b.envoyer('annonce_fiches_admin',{},ADMIN,{read:async path=>{if(path.includes('contacts_lamia'))throw Error('indisponible');return lire(path);}});
 assert.equal(r.fiches.length,1);assert.equal(r.contacts_disponibles,false);
});

test('récupérer une fiche retirée ou en pause ne réactive rien et ne recrée aucun lien pour une fiche retirée',async()=>{
 const b=base();b.fiches.push({ref:8366,outil_id:'ancienne-retiree',visible:true,retire_at:'2026-11-01'},{ref:8367,outil_id:'ancienne-pause',visible:true,pause_at:'2026-11-01'},{ref:8368,outil_id:'ancienne-effacee',visible:true,effacement_at:'2026-11-01'});
 const avant=structuredClone(b.fiches);const r=await b.envoyer('annonce_fiches_admin');assert.equal(r.fiches.length,3);assert.ok(r.fiches.every(f=>!f.visible));assert.equal(r.fiches.find(f=>f.ref===8366).lien,null);assert.equal(r.fiches.find(f=>f.ref===8368).lien,null);assert.equal(r.fiches.find(f=>f.ref===8367).en_pause,true);
 assert.deepEqual((await b.envoyer('annonce_fiches_admin',{actives_seulement:true})).fiches.map(f=>f.ref),[8367]);assert.deepEqual(b.fiches,avant);assert.equal(b.ecritures.length,0);
});
test('la personne ouvre son lien, le relie à son compte puis confirme et publie sa fiche',async()=>{
  const b=base(),r=await b.envoyer('annonce_fiche_admin_creer',creation()),u=new URL(r.fiche.lien),body={n:r.fiche.ref,t:u.searchParams.get('t')};
  assert.equal((await b.envoyer('annonce_fiche_outil',body,null)).status,200);
  assert.equal((await b.envoyer('annonce_confirmer_outil',body,null)).status,401);
  assert.equal((await b.envoyer('annonce_confirmer_outil',body,MEMBRE)).status,401);
  assert.equal((await b.envoyer('annonce_lier_fiche_outil',body,MEMBRE)).status,200);
  assert.equal((await b.envoyer('annonce_confirmer_outil',body,MEMBRE)).status,200);assert.equal(b.fiches[0].visible,true);assert.ok(b.fiches[0].confirme_at);
  assert.equal((await b.envoyer('annonce_lier_fiche_outil',body,{...MEMBRE,id:'autre'})).status,409);
  assert.equal((await b.envoyer('annonce_fiche_outil',{...body,t:'faux'},MEMBRE)).status,403);
});
test('le retrait est conservé et une confirmation échouée n’est pas annoncée comme réussie',async()=>{
  const b=base(),r=await b.envoyer('annonce_fiche_admin_creer',creation()),body={n:r.fiche.ref,t:new URL(r.fiche.lien).searchParams.get('t')};
  b.fiches[0].user_id=MEMBRE.id;
  assert.equal((await b.envoyer('annonce_confirmer_outil',body,MEMBRE,{patch:async()=>({ok:false})})).status,502);assert.equal(b.fiches[0].confirme_at,null);
  await b.envoyer('annonce_retirer_outil',body,MEMBRE);await b.envoyer('annonce_confirmer_outil',body,MEMBRE);
  assert.equal(b.fiches[0].visible,false);assert.equal(b.fiches[0].confirme_at,null);
});
test('deux personnes qui ouvrent le même lien en même temps ne peuvent pas écraser son propriétaire',async()=>{
  const b=base(),r=await b.envoyer('annonce_fiche_admin_creer',creation()),body={n:r.fiche.ref,t:new URL(r.fiche.lien).searchParams.get('t')};
  const resultats=await Promise.all([b.envoyer('annonce_lier_fiche_outil',body,MEMBRE),b.envoyer('annonce_lier_fiche_outil',body,{...MEMBRE,id:'autre-membre'})]);
  assert.deepEqual(resultats.map((x)=>x.status).sort(),[200,409]);assert.equal(b.fiches[0].user_id,MEMBRE.id);
});
test('la création sur le site ne réactive aucune ancienne clé de liaison PC',async()=>{
  const b=base();assert.equal((await b.envoyer('outil_fiche_live',{cle:'ancienne-cle',profil:profil()})).status,403);assert.equal(b.fiches.length,0);
});
