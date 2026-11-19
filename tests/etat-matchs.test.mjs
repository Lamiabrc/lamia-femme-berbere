import test from 'node:test';
import assert from 'node:assert/strict';
import { compterMatchsAffiches, capaciteMatchs, libelleInteret, titreDiscussion } from '../content/etat-matchs.mjs';
const moi='moi', maintenant=new Date('2026-11-19T20:00:00Z');
const discussion=(extra={})=>({id:'d1',interet_id:'i1',a_user:moi,b_user:'autre',a_ref:11,b_ref:22,ouverte_at:'2026-11-18T20:00:00Z',ferme_at:'2026-11-21T20:00:00Z',close_raison:null,...extra});
const compter=(extra={})=>compterMatchsAffiches({moi,refs:[11],maintenant,...extra});
test('cinq intérêts réciproques en attente et un au revoir ne sont pas cinq matchs actifs',()=>{
  const r=compter({sortants:Array.from({length:5},(_,i)=>({id:'p'+i,cible_ref:30+i,statut:'a_traiter',reciproque:true})),discussions:[discussion({dematch_at:'2026-11-19T18:00:00Z'})]});
  assert.deepEqual(r,{actifs:0,en_attente:5,au_revoir_nombre:1});
});
test('les deux intérêts réciproques et la discussion de la même paire ne comptent qu’une fois',()=>{
  assert.equal(compter({sortants:[{id:'i1',cible_ref:22,statut:'mis_en_relation'}],recus:[{id:'i2',statut:'mis_en_relation',annonces:{ref:22,user_id:'autre'}}],discussions:[discussion()]}).actifs,1);
});
test('nouveau match de la même paire : l’ancien au revoir reste séparé',()=>{
  const r=compter({sortants:[{id:'i1',cible_ref:22,statut:'mis_en_relation'},{id:'i2',cible_ref:22,statut:'mis_en_relation'}],discussions:[discussion({dematch_at:'2026-11-19T18:00:00Z'}),discussion({id:'d2',interet_id:'i2'})]});
  assert.deepEqual(r,{actifs:1,en_attente:0,au_revoir_nombre:1});
});
test('une relation rattachée à une discussion fermée ou expirée n’est pas annoncée comme active',()=>{
  for(const d of [discussion({close_raison:'dematch'}),discussion({ferme_at:'2026-11-18T00:00:00Z'})])assert.equal(compter({sortants:[{id:'i1',cible_ref:22,statut:'mis_en_relation'}],discussions:[d]}).actifs,0);
});
test('une mise en relation sans compte ou discussion existe, un intérêt non réciproque reste une demande',()=>{
  assert.deepEqual(compter({sortants:[{id:'a',cible_ref:22,statut:'mis_en_relation'},{id:'b',cible_ref:23,statut:'a_traiter',reciproque:false}]}),{actifs:1,en_attente:0,au_revoir_nombre:0});
});
test('l’ancienne demande dans l’autre sens ne ressuscite pas un match en au revoir',()=>{
  assert.equal(compter({sortants:[{id:'i1',cible_ref:22,statut:'mis_en_relation'}],recus:[{id:'i2',statut:'mis_en_relation',annonces:{ref:22,user_id:'autre'}}],discussions:[discussion({dematch_at:'2026-11-19T18:00:00Z'})]}).actifs,0);
});
test('une nouvelle mise en relation explicite après l’ancien dématch est conservée',()=>{
  assert.equal(compter({sortants:[{id:'nouveau',cible_ref:22,statut:'mis_en_relation',updated_at:'2026-11-19T19:00:00Z'}],discussions:[discussion({dematch_at:'2026-11-19T18:00:00Z'})]}).actifs,1);
});
test('les discussions d’autres membres sont ignorées',()=>{
  assert.equal(compter({discussions:[discussion({a_user:'x',b_user:'y',a_ref:50,b_ref:51})]}).actifs,0);
});
test('la capacité affichée ne transforme pas une limite de consentement à zéro en offre de zéro match',()=>{
  assert.equal(capaciteMatchs({capacite:3,limite:0,places_en_attente:true}),3);
  assert.equal(capaciteMatchs({capacite:5,limite:0,places_en_attente:true}),5);
  assert.equal(capaciteMatchs({limite:0,places_en_attente:true}),null);
  assert.equal(capaciteMatchs({limite:1}),1);
});
test('l’historique dit terminé, en cours ou en attente selon l’état réel',()=>{
  assert.equal(libelleInteret({reponse:'oui',statut:'dematche'}),'Match terminé');
  assert.equal(libelleInteret({reponse:'oui',statut:'mis_en_relation'}),'Match en cours');
  assert.match(libelleInteret({reponse:'oui',statut:'a_traiter'}),/en attente/);
  assert.equal(titreDiscussion({ouverte:true,dematch:{restants:1}}),'Au revoir en cours');
  assert.equal(titreDiscussion({ouverte:false,dematch:{restants:1}}),'Échange terminé');
});
