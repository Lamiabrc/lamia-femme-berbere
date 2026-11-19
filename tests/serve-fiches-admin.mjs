// Recette locale du tableau de bord et de son lien destinataire. Données fictives en mémoire uniquement.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAnnonces } from '../lib/annonces.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url)), fiches=[], annonces=[];
const admin={id:'11111111-1111-4111-8111-111111111111',email:'admin@recette.invalid',app_metadata:{role:'admin'},user_metadata:{first_name:'Lamia (fictif)'}};
const membre={id:'22222222-2222-4222-8222-222222222222',email:'membre@recette.invalid',app_metadata:{},user_metadata:{first_name:'Nina (fictif)'}};
const read=async(path)=>{
  const u=new URL(path,'https://recette.invalid'),q=u.searchParams;
  let rows=u.pathname.endsWith('/profils_outil')?fiches:u.pathname.endsWith('/annonces')?annonces:[];
  for(const [k,v] of q){if(['select','order','limit'].includes(k))continue;
    if(v.startsWith('eq.'))rows=rows.filter(f=>String(f[k])===v.slice(3));
    if(v.startsWith('lt.'))rows=rows.filter(f=>f[k]<Number(v.slice(3)));
    if(v==='is.null')rows=rows.filter(f=>f[k]==null);
    if(v==='not.is.null')rows=rows.filter(f=>f[k]!=null);
    if(v.startsWith('like.'))rows=rows.filter(f=>String(f[k]).startsWith(v.slice(5).replace(/\*$/,'')));
  }
  if(q.get('order')==='ref.desc')rows=[...rows].sort((a,b)=>b.ref-a.ref);
  return structuredClone(rows.slice(0,Number(q.get('limit'))||rows.length));
};
const insert=async(table,row)=>{
  if(table==='profils_outil'){
    if(fiches.some(f=>f.outil_id===row.outil_id))throw new Error('unique');
    const f={ref:5001+fiches.length,confirme_at:null,retire_at:null,effacement_at:null,user_id:null,...row};fiches.push(f);return structuredClone(f);
  }
  if(table==='annonces'){const a={id:'33333333-3333-4333-8333-333333333333',ref:annonces.length+1,test:true,...row};annonces.push(a);return a;}
  return {};
};
const patch=async(table,filtre,row)=>{if(table==='profils_outil')for(const f of fiches)if(filtre.split('&')[0]===`ref=eq.${f.ref}`&&(!filtre.includes('user_id=is.null')||f.user_id==null))Object.assign(f,row);return {ok:true};};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
let perdreReponse=false;
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:4175');
  const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'"});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
  try{
    if(u.pathname==='/vendor/supabase.mjs')return send(200,`const user=location.pathname.startsWith('/tableau')?${JSON.stringify(admin)}:${JSON.stringify(membre)};const session={user,access_token:user.app_metadata.role==='admin'?'fixture-admin':'fixture-membre'};const result=()=>({data:{session,user},error:null});export function createClient(){return {auth:{getSession:async()=>result(),getUser:async()=>result(),onAuthStateChange:f=>{queueMicrotask(()=>f('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>({error:null})}};}`,'text/javascript');
    if(u.pathname.startsWith('/api/')){
      let texte='';for await(const p of req)texte+=p;const b=JSON.parse(texte||'{}');
      if(u.pathname.startsWith('/api/admin'))return send(503,{error:'recette_hors_perimetre'});
      if(b.action==='live_erreur')return send(200,{ok:true});
      if(b.action==='recette_perdre_reponse'){perdreReponse=true;return send(200,{ok:true});}
      if(typeof b.action!=='string')return send(404,{error:'recette_hors_perimetre'});
      const user=req.headers.authorization==='Bearer fixture-admin'?admin:req.headers.authorization==='Bearer fixture-membre'?membre:null;
      const r=await handleAnnonces(b.action,b,{env:{SUPABASE_SERVICE_ROLE_KEY:'uniquement-recette-locale'},user,admin:user===admin,read,insert,patch,now:()=>new Date(),alerter:async()=>{},call:async()=>Response.json([])});
      const d=await r.json();
      // Les liens fictifs restent dans ce serveur, jamais sur le site réel.
      const corps=JSON.stringify(d).replaceAll('https://lamia-femme-berbere.com/rencontres/confirmer/','http://127.0.0.1:4175/rencontres/confirmer/');
      if(b.action==='annonce_fiche_admin_creer'&&perdreReponse){perdreReponse=false;res.writeHead(200,{'Content-Type':'application/json'});res.write('{');setTimeout(()=>res.destroy(),100);return;}
      return send(r.status,corps);
    }
    let p=decodeURIComponent(u.pathname);if(p==='/tableau-de-bord')p+='.html';if(p.endsWith('/'))p+='index.html';
    const file=resolve(root,'.'+p);if(!file.startsWith(root.endsWith(sep)?root:root+sep))return send(404,'');
    let data=await readFile(file);
    if(extname(file)==='.html')data=Buffer.from(data.toString().replace(/(<body[^>]*>)/i,`$1<aside style="padding:12px;background:#fff1be;font:14px system-ui;color:#352917">RECETTE LOCALE — administration et personne fictives — aucun appel vers la production. Les autres outils du tableau de bord ne sont pas simulés.<button type="button" onclick="fetch('/api/confidences/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'recette_perdre_reponse'})}).then(()=>this.textContent='Interruption activée')">Interrompre la prochaine création</button></aside>`));
    return send(200,data,mime[extname(file)]||'application/octet-stream');
  }catch(e){if(e.code==='ENOENT')return send(404,'');console.error('Recette fictive:',e.message);if(!res.destroyed)send(500,{error:'recette_erreur'});}
}).listen(4175,'127.0.0.1',()=>console.log('Recette fictive : http://127.0.0.1:4175/tableau-de-bord#creer-profil'));
process.once('SIGINT',()=>server.close(()=>process.exit(0)));
