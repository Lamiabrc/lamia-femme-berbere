import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { basePhotos, ADMIN, MEMBRE } from './helpers/moderation-photos-base.mjs';
import { constaterRemplacement } from '../lib/moderation-photos.mjs';
import { avisPhotos, gracePhotos } from '../content/moderation-photos.mjs';
import { photosOk } from '../lib/discussions.mjs';

async function recette(t){const b=await basePhotos();t.after(()=>b.db.close());return b;}
test('contrôle réservé au rôle administrateur authentifié, avant toute lecture',async(t)=>{
  const b=await recette(t);
  for(const u of [null,MEMBRE,{...MEMBRE,user_metadata:{role:'admin'}}])assert.equal((await b.envoyer(b.commande(),u)).status,403);
  assert.equal(b.appels.length,0);
});
test('migration additive : état nul et aucun droit direct accordé aux membres',async(t)=>{
  const b=await recette(t);assert.equal((await b.a()).photos_moderation,null);
  const r=await b.db.query("select has_column_privilege('authenticated','annonces','photos_moderation','UPDATE') as autorise");assert.equal(r.rows[0].autorise,false);
});
test('premier avertissement : retirer une seule photo préserve l’autre, la vidéo et l’identité ; aucun blocage du chat',async(t)=>{
  const b=await recette(t),r=await b.envoyer(b.commande({photos:[{id:b.p1,commentaire:'Visage masqué',supprimer:true}]}));
  assert.equal(r.status,200);assert.equal(r.effacees,1);
  const a=await b.a();assert.equal(a.status,'publiee');assert.equal(a.photos_refusees_at,null);assert.ok(gracePhotos(a));
  const files=await b.read(`/rest/v1/annonce_files?annonce_id=eq.${b.id}`);
  assert.deepEqual(new Set(files.map((f)=>f.id)),new Set([b.p2,b.identite,b.video]));assert.equal(b.objets.size,3);
  assert.equal(await photosOk(b.read,MEMBRE.id),true);
  assert.match(b.notifications[0][1].texte,/Visage masqué/);assert.match(b.notifications[0][1].texte,/24 h/);
});
test('deux photos peuvent être commentées ensemble sans les supprimer',async(t)=>{
  const b=await recette(t);await b.envoyer(b.commande({photos:[{id:b.p1,commentaire:'Photo trop sombre'},{id:b.p2,commentaire:'Photo identique'}]}));
  const m=avisPhotos(await b.a(),await b.read('/rest/v1/annonce_files'));
  assert.equal(m.photos.length,2);assert.equal(m.photos[1].commentaire,'Photo identique');assert.ok(m.photos.every((p)=>p.presente));assert.equal(b.objets.size,4);
  assert.doesNotMatch(JSON.stringify(m),/storage_path|retraits|empreinte|requete_id/);
});
test('refus des photos d’autrui, de la pièce d’identité et des chemins corrompus',async(t)=>{
  const b=await recette(t);
  for(const id of [b.autre,b.identite,b.video,'42&kind=neq.identite'])assert.equal((await b.envoyer(b.commande({photos:[{id,supprimer:true}]}))).status,400);
  await b.db.query('update annonce_files set storage_path=$1 where id=$2',[`${b.id}/../identite.jpg`,b.p1]);
  assert.equal((await b.envoyer(b.commande())).status,400);assert.equal((await b.a()).photos_moderation,null);assert.equal(b.objets.size,4);
});
test('commentaire et sélection obligatoires au premier contrôle',async(t)=>{
  const b=await recette(t);
  assert.equal((await b.envoyer(b.commande({photos:[]}))).error,'selection_requise');
  assert.equal((await b.envoyer(b.commande({commentaire:' ',photos:[{id:b.p1}]}))).error,'commentaire_requis');
});
test('double clic concurrent et réponse perdue : un seul avertissement, aucun passage automatique à la suspension',async(t)=>{
  const b=await recette(t),c=b.commande();const r=await Promise.all([b.envoyer(c),b.envoyer(c)]);assert.ok(r.some((x)=>x.ok));
  assert.equal((await b.envoyer(c)).status,200);assert.equal(b.notifications.length,1);assert.equal((await b.a()).photos_moderation.etat,'avertissement');
  assert.equal((await b.envoyer({...c,commentaire:'Autre texte'})).status,409);
});
test('un ancien écran ne peut pas déclencher un second contrôle ; suspension manuelle explicite',async(t)=>{
  const b=await recette(t);
  assert.equal((await b.envoyer(b.commande({operation:'suspendre'}))).error,'avertissement_requis');
  await b.envoyer(b.commande());const a=await b.a();
  assert.equal((await b.envoyer(b.commande({operation:'suspendre',photos:[]}))).error,'controle_obsolete');
  assert.equal((await b.envoyer(b.commande({operation:'suspendre',revision:a.photos_moderation.revision,photos:[]}))).status,200);
  assert.equal((await b.a()).status,'a_verifier');assert.equal(await photosOk(b.read,MEMBRE.id),false);
});
test('panne Storage ou métadonnées : retrait repris sans effacer une autre photo ni envoyer deux messages',async(t)=>{
  const b=await recette(t),c=b.commande({photos:[{id:b.p1,supprimer:true}]});b.panneStorage(true);
  assert.equal((await b.envoyer(c)).status,502);assert.equal(b.notifications.length,0);assert.equal(b.objets.size,4);assert.ok(gracePhotos(await b.a()));
  b.panneStorage(false);b.panneMetadata(true);assert.equal((await b.envoyer(c)).status,502);assert.equal(b.objets.size,3);
  b.panneMetadata(false);assert.equal((await b.envoyer(c)).status,200);await b.envoyer(c);assert.equal(b.notifications.length,1);assert.equal(b.objets.size,3);
});
test('écriture réussie mais accusé perdu : la même tentative termine le contrôle',async(t)=>{
  const b=await recette(t),c=b.commande();b.perdreAck();await assert.rejects(b.envoyer(c));
  assert.equal((await b.envoyer(c)).status,200);assert.equal(b.notifications.length,1);
});
test('le membre remplace seulement les photos signalées et la nouvelle photo retrouve le bon emplacement',async(t)=>{
  const b=await recette(t);await b.envoyer(b.commande());
  assert.equal((await b.action('annonce_photo_retirer',{photo_id:b.p2})).status,403);
  assert.equal((await b.action('annonce_photo_retirer',{photo_id:b.p1})).status,200);
  const r=await b.action('annonce_ajouter_medias',{medias:[{role:'media',type:'image/jpeg',size:1000}]});assert.equal(r.status,200);assert.equal(r.uploads.length,1);
  const files=await b.read('/rest/v1/annonce_files?kind=eq.photo');assert.equal(files.find((f)=>f.id===b.p2).position,2);assert.equal(files.find((f)=>f.id!==b.p2).position,1);
});
test('déblocage automatique seulement après réception réelle des remplacements ; les anciennes photos ne suffisent pas',async(t)=>{
  const b=await recette(t);await b.envoyer(b.commande());let a=await b.a();await b.envoyer(b.commande({operation:'suspendre',revision:a.photos_moderation.revision,photos:[]}));
  await b.action('annonce_medias_verifier');assert.equal((await b.a()).photos_moderation.etat,'suspendu');
  await b.action('annonce_photo_retirer',{photo_id:b.p1});const up=await b.action('annonce_ajouter_medias',{medias:[{type:'image/jpeg',size:1000}]});
  // Métadonnée signée mais fichier pas encore reçu : maintien de la suspension.
  await b.action('annonce_medias_verifier');assert.equal((await b.a()).photos_moderation.etat,'suspendu');
  const second=await b.action('annonce_ajouter_medias',{medias:[{type:'image/jpeg',size:1000}]});b.objets.add(second.uploads[0].path);
  const v=await b.action('annonce_medias_verifier');assert.equal(v.medias_ok,true);a=await b.a();assert.equal(a.photos_moderation.etat,'corrige');assert.equal(a.photos_refusees_at,null);assert.equal(a.status,'publiee');assert.ok(await photosOk(b.read,MEMBRE.id));
});
test('un profil retiré/bloqué ne peut pas être réactivé par la correction des photos',async(t)=>{
  const b=await recette(t);await b.envoyer(b.commande());let a=await b.a();await b.envoyer(b.commande({operation:'suspendre',revision:a.photos_moderation.revision,photos:[]}));
  await b.db.exec("update annonces set status='retiree',bloque_at='2026-11-20'");a=await b.a();
  const files=[{id:randomUUID(),kind:'photo'},{id:b.p2,kind:'photo'}];await constaterRemplacement(a,files,b.ctx());
  assert.equal((await b.a()).status,'retiree');assert.equal((await b.a()).bloque_at,'2026-11-20');
});
test('un membre sans deux photos et sans avertissement reste soumis à la règle habituelle',async(t)=>{
  const b=await recette(t);await b.db.query('delete from annonce_files where id=$1',[b.p1]);assert.equal(await photosOk(b.read,MEMBRE.id),false);
});
test('le premier avertissement permet encore de swiper et de répondre même après retrait des deux photos',async(t)=>{
  const b=await recette(t);await b.envoyer(b.commande({photos:[{id:b.p1,supprimer:true},{id:b.p2,supprimer:true}]}));
  assert.equal(await photosOk(b.read,MEMBRE.id),true);
  const swipe=await b.action('annonce_swipe',{ref:43,choix:'oui'});
  assert.notEqual(swipe.error,'photos_requises');
  await b.db.query('update annonces set photos_moderation=null');
  assert.equal((await b.action('annonce_swipe',{ref:43,choix:'oui'})).error,'photos_requises');
});
test('après suspension, Lamia peut encore commenter et retirer une photo sans lever la restriction',async(t)=>{
  const b=await recette(t);await b.envoyer(b.commande());let a=await b.a();await b.envoyer(b.commande({operation:'suspendre',revision:a.photos_moderation.revision,photos:[]}));a=await b.a();
  const r=await b.envoyer(b.commande({revision:a.photos_moderation.revision,photos:[{id:b.p1,supprimer:true}]}));
  assert.equal(r.status,200);const apres=await b.a();assert.equal(apres.photos_moderation.etat,'suspendu');assert.equal(apres.photos_refusees_at,a.photos_refusees_at);assert.equal(await photosOk(b.read,MEMBRE.id),false);
});
test('les deux anciennes routes ne peuvent plus supprimer toutes les photos ni suspendre immédiatement',async(t)=>{
  const b=await recette(t);
  for(const [action,body] of [['annonce_photos_refuser',{ref:42}],['annonce_moderer',{annonce_id:b.id,decision:'photos_refuser'}]])assert.equal((await b.action(action,body,ADMIN)).error,'selection_requise');
  assert.equal(b.objets.size,4);assert.equal((await b.a()).photos_refusees_at,null);
});
