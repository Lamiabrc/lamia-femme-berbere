// UI réelle, photos illustrées et PostgreSQL éphémère. Aucun compte/service en ligne.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePhotos, ADMIN, MEMBRE } from './helpers/moderation-photos-base.mjs';
import { avisPhotos } from '../content/moderation-photos.mjs';
const b=await basePhotos(),root=fileURLToPath(new URL('../dist/',import.meta.url));
const avatar=(p)=>p===2?'/images/celib/onglet-profil-homme.webp':'/images/celib/onglet-profil-femme.webp';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:4177');
  const send=(s,d,type='application/json')=>{res.writeHead(s,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'"});res.end(typeof d==='string'||Buffer.isBuffer(d)?d:JSON.stringify(d));};
  try {
    if(u.pathname==='/vendor/supabase.mjs')return send(200,`const user=location.pathname.startsWith('/tableau')?${JSON.stringify({...ADMIN,email:'admin@fictif.invalid'})}:${JSON.stringify(MEMBRE)};const session={access_token:user.app_metadata.role==='admin'?'fixture-admin':'fixture-membre',user};export function createClient(){return {auth:{getSession:async()=>({data:{session,user},error:null}),getUser:async()=>({data:{user},error:null}),onAuthStateChange:f=>{queueMicrotask(()=>f('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};},updateUser:async()=>({error:null})}}}`,'text/javascript');
    if(u.pathname.startsWith('/api/')){
      let body='';for await(const p of req)body+=p;const c=JSON.parse(body||'{}'),a=await b.a(),files=await b.read(`/rest/v1/annonce_files?kind=eq.photo&annonce_id=eq.${b.id}`);
      if(u.pathname==='/api/admin')return c.action==='comptes_liste'?send(200,{comptes:[],soirees:[]}):send(503,{error:'recette_hors_perimetre'});
      if(c.action==='annonce_profil_detail')return send(200,{ok:true,sans_compte:true,annonces:[{...a,age:34,medias:files.map((p)=>({id:p.id,kind:'photo',position:p.position,url:avatar(p.position)}))}],fiches:[],journal:[],choisi_par:[]});
      if(c.action==='annonce_mon_profil')return send(200,{ok:true,profil:{test:false,ref:42,status:a.status,prenom:'Recette fictive',genre:'femme',mon_genre:'femme',pays:'France',ville:'Ville fictive',profil:'Un profil entièrement fictif.',recherche:'Une relation respectueuse.',matching:{},medias_ok:files.length>=2,photos:files.length,photos_moderation:avisPhotos(a,files),a_completer:[],matchs_lies:[],interets:[],choisi_par:{nombre:0,refs:[],inclus:true},suivi:{mises_total:0,mises_mois:0},matchs:{actifs:0,capacite:3,limite:3,formule:'passion'}}});
      if(c.action==='annonce_mes_photos')return send(200,{ok:true,photos:files.map((p)=>avatar(p.position)),partage:false});
      if(c.action==='annonce_photos_moderer')return send(...await (async()=>{const r=await b.envoyer(c);return [r.status,r];})());
      if(c.action==='annonce_photo_retirer')return send(...await (async()=>{const r=await b.action(c.action,c);return [r.status,r];})());
      if(c.action==='annonce_ajouter_medias'){
        const r=await b.action(c.action,c);if(r.uploads)r.uploads=r.uploads.map((p)=>({...p,url:`http://127.0.0.1:4177/recette-upload?path=${encodeURIComponent(p.path)}`}));return send(r.status,r);
      }
      if(c.action==='annonce_medias_verifier'){const r=await b.action(c.action,c);return send(r.status,r);}
      if(c.action==='annonce_discussions')return send(200,{ok:true,discussions:[]});
      if(c.action==='annonce_interets_recus')return send(200,{ok:true,interets:[]});
      if(u.pathname.includes('/mes-achats'))return send(200,{orders:[],abonnement:{abonnement:{formule:'passion',statut:'actif',periode:'mois'},unites:{}}});
      if(u.pathname.includes('/abonnement'))return send(200,{ok:true,abonnement:{formule:'passion',statut:'actif'},unites:{}});
      return send(200,{ok:true});
    }
    if(u.pathname==='/recette-upload' && req.method==='PUT'){for await(const _ of req){}b.objets.add(u.searchParams.get('path'));return send(200,{ok:true});}
    let p=decodeURIComponent(u.pathname);if(p==='/tableau-de-bord/'||p==='/tableau-de-bord')p='/tableau-de-bord.html';if(p.endsWith('/'))p+='index.html';const file=resolve(root,'.'+p);
    if(!file.startsWith(root.endsWith(sep)?root:root+sep))return send(404,'');let d=await readFile(file);
    if(extname(file)==='.html')d=Buffer.from(d.toString().replace(/(<body[^>]*>)/i,'$1<aside style="padding:8px;background:#fff1be;color:#30251a">RECETTE LOCALE — photos illustrées, profils fictifs — aucun accès à la production.</aside>'));
    return send(200,d,mime[extname(file)]||'application/octet-stream');
  }catch(e){if(e.code==='ENOENT')return send(404,'');console.error(e.message);return send(500,{error:'recette_erreur'});}
}).listen(4177,'127.0.0.1',()=>console.log('Recette : http://127.0.0.1:4177/tableau-de-bord/#profil-42'));
process.once('SIGINT',()=>server.close(async()=>{await b.db.close();process.exit(0);}));
