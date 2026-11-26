// Recette locale : données fictives, aucun appel à Supabase ou à un fournisseur email.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve('.'), mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
let confirmed=false;
const uid='10000000-0000-4000-8000-000000000001';
createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:4181');
 const send=(s,d,type='application/json')=>{res.writeHead(s,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'"});res.end(typeof d==='string'||Buffer.isBuffer(d)?d:JSON.stringify(d));};
 try{
  if(u.pathname==='/vendor/supabase.mjs')return send(200,`let session=${confirmed?JSON.stringify({access_token:'fixture',user:{id:uid,email:'nina@example.invalid'}}):'null'};export function createClient(){return {auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user},error:null}),onAuthStateChange:f=>{queueMicrotask(()=>f('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}}},signInWithPassword:async()=>({data:{session:session={access_token:'fixture',user:{id:'${uid}',email:'nina@example.invalid'}}},error:null})}}}`,'text/javascript');
  if(u.pathname==='/recette-confirmer'){confirmed=true;res.writeHead(302,{Location:'/rencontres/#confier'});return res.end();}
  if(u.pathname==='/recette-recommencer'){confirmed=false;res.writeHead(302,{Location:'/rencontres/#confier'});return res.end();}
  if(u.pathname==='/recette-edition/')return send(200,`<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recette · profil fictif</title><link rel="stylesheet" href="/fonts/polices.css"><link rel="stylesheet" href="/assets/maison.css"><link rel="stylesheet" href="/assets/tayri.css"><body class="tayri-shell" data-tayri-univers="compte"><p>RECETTE LOCALE · profil fictif · aucune donnée de production</p><main style="max-width:720px;margin:auto"><div id="edition"></div></main><script type="module">import{monterFormulaire}from'/assets/annonces.js';await monterFormulaire(document.querySelector('#edition'),{existant:{prenom:'Nina',genre:'femme',birth_date:'1994-01-01',ville:'Ville fictive',pays:'France',profil:'Une présentation fictive.',recherche:'Une rencontre respectueuse.',matching:{inscriptionVersion:1,origineTags:['Kabyle (Algerie)'],zoneGeo:'France'},age_min:30,age_max:42},token:'fixture'});</script></body></html>`,'text/html');
  if(u.pathname.startsWith('/api/')){
   let raw='';for await(const p of req)raw+=p;if(raw.length>50000)return send(413,{});const b=JSON.parse(raw||'{}');
   if(b.action==='annonce_creer_compte')return send(200,{ok:true,a_reconfirmer:true,brouillon_id:uid});
   if(b.action==='annonce_brouillon')return send(200,{ok:true,brouillon:null});
   if(b.action==='annonce_deposer')return send(200,{ok:true,annonce_id:'fixture-id',token:'fixture-token',uploads:(b.medias||[]).map(f=>({url:'http://127.0.0.1:4181/recette-upload',type:f.type}))});
   if(b.action==='annonce_finaliser')return send(200,{ok:true,ref:9999});
   if(b.action==='annonces_publiques')return send(200,{ok:true,annonces:[]});
   if(b.action==='annonce_mon_profil')return send(200,{ok:true,profil:null});
   return send(200,{ok:true});
  }
  if(u.pathname==='/recette-upload'){for await(const _ of req){}return send(200,{ok:true});}
  let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
  const prefix=p.startsWith('/docs/')?'':p.startsWith('/fonts/')||p.startsWith('/images/')?'public':'dist';
  const file=resolve(root,prefix,'.'+p);if(!file.startsWith(root+sep))return send(404,'');
  let d=await readFile(file);if(extname(file)==='.html')d=Buffer.from(d.toString().replace(/(<body[^>]*>)/i,'$1<aside style="padding:8px;background:#f2e2dc;color:#392b34">RECETTE LOCALE · données fictives · <a href="/recette-confirmer">Confirmer le compte fictif</a></aside>'));
  return send(200,d,mime[extname(file)]||'application/octet-stream');
 }catch(e){return send(e.code==='ENOENT'?404:500,{error:e.code==='ENOENT'?'absent':'recette'});}
}).listen(4181,'127.0.0.1',()=>console.log('http://127.0.0.1:4181/docs/phase1-maquettes.html'));
