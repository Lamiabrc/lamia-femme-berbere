// Recette du vrai tableau.js, avec une base et une session administratrice fictives.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {handleAnnonces} from '../lib/annonces.mjs';
import {lireFiches} from './fake-fiches.mjs';
const root=resolve('.'),uid='10000000-0000-4000-8000-000000000001';
const fiches=[{ref:99993,outil_id:'recette-live',genre:'homme',age:35,ville:'Ville fictive',pays:'France',situation:'Jamais marie(e)',enfants:'Non',religion:'Islam',pratique:'Pratiquant',age_min:28,age_max:40,secteur:'France',visible:true,confirme_at:'2026-11-01',profil:'Présentation fictive.',recherche:'Recherche fictive.',matching:{}}];
const contacts=[{ref:99993,reseau:'tiktok',pseudo:'recette.homere'}],annonces=[];
const compte={id:uid,email:'recette@example.invalid',prenom:'Recette membre',cree_le:'2026-11-01',email_confirme:true,etat:'att_profil',sans_profil:true,profil:{city:'Ancienne ville fictive'},inscriptions:[],annonces:[],fiches:[{ref:99990,pseudo:'Membre fictif'}]};
let sauvegardes=0;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:4183');
 const send=(s,d,type='application/json')=>{res.writeHead(s,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'; form-action 'self'"});res.end(typeof d==='string'||Buffer.isBuffer(d)?d:JSON.stringify(d));};
 try{
  if(u.pathname==='/vendor/supabase.mjs')return send(200,`const session={access_token:'fixture',user:{id:'${uid}',email:'admin@example.invalid',app_metadata:{role:'admin'}}};export function createClient(){return {auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}}`,'text/javascript');
  if(u.pathname==='/recette-statuts')return send(200,{sauvegardes,fiches:fiches.map(f=>({ref:f.ref,ville:f.ville})),creations:fiches.length-1});
  if(u.pathname.startsWith('/api/')){
   let raw='';for await(const p of req)raw+=p;const b=JSON.parse(raw||'{}');
   if(b.action==='dashboard')return send(503,{error:'recette_dashboard_non_simule'});
   if(b.action==='comptes_liste')return send(200,{ok:true,comptes:[compte],soirees:[{id:'soiree-fictive',titre:'Soirée fictive',date:'2027-01-01'}]});
   if(b.action==='annonce_profil_detail'){
    if(b.ref===99994)await new Promise(r=>setTimeout(r,700));
    const sans=b.ref!==99990&&!b.user_id;
    return send(200,{ok:true,sans_compte:sans,compte:sans?null:{id:uid},annonces:[],fiches:sans?[{...fiches[0],ref:b.ref||99993}]:[],activite:{en_cours:[]},credits:{match:0,speed_dating:0,coaching:0},cadeaux:[],choix:[],choisi_par:[],discussions:[],blocages:{fait:[],subi:[]},signalements:{fait:[],subi:[]}});
   }
   if(['annonce_admin_completer','annonce_fiche_admin_creer','annonce_fiches_admin','annonce_lien_fiche_admin','annonce_rechercher_reseau'].includes(b.action)){
    const read=async p=>lireFiches(p,{fiches,contacts,annonces});
    const r=await handleAnnonces(b.action,b,{env:{SUPABASE_SERVICE_ROLE_KEY:'recette'},admin:true,user:{id:uid,app_metadata:{role:'admin'}},read,
     patch:async(table,filtre,row)=>{const ref=Number(filtre.split('ref=eq.')[1]);Object.assign(fiches.find(f=>f.ref===ref),row);sauvegardes++;return {ok:true};},
     insert:async(table,row)=>{const f={ref:100000+fiches.length,...row};fiches.push(f);return f;},call:async()=>Response.json({}),now:()=>new Date()});
    return send(r.status,await r.json());
   }
   return send(200,{ok:true,fiches:[],total:0,profils:[],journal:[],recommandes:[],moderateurs:[],beta:[]});
  }
  if(u.pathname==='/tableau-de-bord'||u.pathname==='/'){
   const html=(await readFile(resolve(root,'public/tableau-de-bord.html'),'utf8')).replace('<body class="tdb">','<body class="tdb"><aside style="padding:8px;background:#e7efff">RECETTE LOCALE · données fictives · aucun compte réel</aside>');return send(200,html,mime['.html']);
  }
  const file=resolve(root,u.pathname.startsWith('/assets/')?'dist':'public','.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(root+sep))return send(404,'');return send(200,await readFile(file),mime[extname(file)]||'application/octet-stream');
 }catch(e){return send(e.code==='ENOENT'?404:500,{error:'recette'});}
}).listen(4183,'127.0.0.1',()=>console.log('http://127.0.0.1:4183/tableau-de-bord#profil-99993'));
