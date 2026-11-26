// Recette du composant d'administration : fiches fictives, jamais de réseau Supabase.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {actionFichesAdmin} from '../lib/fiches-admin.mjs';
import {handleAnnonces} from '../lib/annonces.mjs';
import {lireFiches} from './fake-fiches.mjs';
const root=resolve('.');
const fiches=Array.from({length:25},(_,i)=>({ref:8366+i,outil_id:i%5===0?'site-admin-fictif-'+i:'live-fictif-'+i,genre:i%2?'homme':'femme',age:32+i%8,pays:'France',ville:'Ville fictive',visible:i!==3,confirme_at:'2026-11-01',retire_at:i===3?'2026-11-02':null,effacement_at:null,pause_at:i===4?'2026-11-03':null,user_id:i%3===0?'compte-fictif':null}));
const contacts=fiches.map(f=>({ref:f.ref,reseau:'tiktok',pseudo:'recette.'+f.ref}));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const bootstrap=`import{monterFichesAdmin}from'/fiches-admin.js';
const fiches=monterFichesAdmin({appel:async body=>{const r=await fetch('/api/recette-fiches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error),{code:d.error});return d;}});
document.querySelector('[data-onglets]').hidden=false;
function ouvrir(tab){document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==tab);document.body.dataset.onglet=tab;history.replaceState(null,'','#'+tab);if(tab==='fiches')fiches.ouvrir();scrollTo(0,0);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tab],[data-go]');if(b){e.preventDefault();ouvrir(b.dataset.tab||b.dataset.go);}});ouvrir('fiches');`;
createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:4182');
 const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'"});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
 try{
  if(u.pathname==='/recette-fiches.mjs')return send(200,bootstrap,'text/javascript');
  if(u.pathname==='/api/recette-fiches'){
   let body='';for await(const part of req)body+=part;if(body.length>50000)return send(413,{});
   const b=JSON.parse(body||'{}');
   const read=async path=>lireFiches(path,{fiches,contacts});
   if(b.action==='annonce_admin_completer'){
    const r=await handleAnnonces(b.action,b,{env:{SUPABASE_SERVICE_ROLE_KEY:'recette-locale'},admin:true,user:{app_metadata:{role:'admin'}},read,patch:async(table,filtre,row)=>{const ref=Number(filtre.split('ref=eq.')[1]);Object.assign(fiches.find(f=>f.ref===ref),row);return {ok:true};},call:async()=>Response.json({}),insert:async()=>({}),now:()=>new Date()});return send(r.status,await r.json());
   }
   const r=await actionFichesAdmin(b.action,b,{admin:true,user:{app_metadata:{role:'admin'}},read,insert:async()=>{throw Error('Création non simulée dans cette recette de liste');},ligneFiche:p=>p,lienFiche:ref=>`http://127.0.0.1:4182/fiche-fictive/?n=${ref}`,now:()=>new Date()});
   return send(r.status,await r.json());
  }
  if(u.pathname==='/'||u.pathname==='/recette-fiches/'){
   const html=(await readFile(resolve(root,'public/tableau-de-bord.html'),'utf8')).replace('src="/tableau.js"','src="/recette-fiches.mjs"').replace('<body class="tdb">','<body class="tdb"><aside style="padding:12px;background:#edf2fb;color:#273b80">RECETTE LOCALE · fiches fictives · aucune donnée de membre</aside>');return send(200,html,mime['.html']);
  }
  const prefix=u.pathname.startsWith('/assets/')?'dist':'public';const file=resolve(root,prefix,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+sep))return send(404,{});return send(200,await readFile(file),mime[extname(file)]||'application/octet-stream');
 }catch(e){return send(e.code==='ENOENT'?404:500,{error:'recette_fiches'});}
}).listen(4182,'127.0.0.1',()=>console.log('http://127.0.0.1:4182/recette-fiches/'));
