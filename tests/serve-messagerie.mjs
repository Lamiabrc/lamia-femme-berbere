// Recette locale uniquement : deux membres fictifs, PostgreSQL en mémoire, aucun accès de production.
// node tests/serve-messagerie.mjs ; ports liés exclusivement à 127.0.0.1.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { actionDiscussion } from '../lib/discussions.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url)), pg = new PGlite();
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', D='33333333-3333-4333-8333-333333333333';
const exec=(sql,p=[])=>pg.query(sql,p), clients=[{id:A,nom:'Lamia (fictif)',token:'fixture-lamia',ref:15,genre:'femme'},{id:B,nom:'Karim (fictif)',token:'fixture-karim',ref:16,genre:'homme'}];
await pg.exec(`create table discussions(id uuid primary key,a_user uuid,b_user uuid,a_ref integer,b_ref integer,ouverte_at timestamptz,ferme_at timestamptz,close_raison text,notif_a_at timestamptz,notif_b_at timestamptz);
 create table discussion_messages(id bigint generated always as identity primary key,discussion_id uuid references discussions(id),auteur uuid,texte text,created_at timestamptz default now(),role text,auteur_nom text);
 create table blocages(auteur_user uuid,cible_user uuid,auteur_ref integer,cible_ref integer);`);
await pg.exec(await readFile(new URL('../supabase/migrations/20261119144620_messagerie_envois_idempotents.sql',import.meta.url),'utf8'));
const t=new Date(), fin=new Date(t.getTime()+7*86400e3);
await exec('insert into discussions(id,a_user,b_user,a_ref,b_ref,ouverte_at,ferme_at) values ($1,$2,$3,15,16,$4,$5)',[D,A,B,t.toISOString(),fin.toISOString()]);
await exec('insert into discussion_messages(discussion_id,auteur,texte) values ($1,$2,$3)',[D,B,'Salam ! Ceci est un message fictif de recette.']);
const read=async(path)=>{
 const u=new URL(path,'https://fictif.invalid'), p=u.searchParams;
 if(u.pathname.includes('/annonces')||u.pathname.includes('/annonce_files'))return [];
 if(u.pathname.endsWith('/blocages'))return (await exec('select * from blocages')).rows;
 const table=u.pathname.endsWith('/discussion_messages')?'discussion_messages':'discussions', filtre=[], vals=[];
 for(const cle of ['id','discussion_id','auteur','client_message_id','created_at']){const v=p.get(cle);if(!v)continue;const n=v.indexOf('.'),op=v.slice(0,n);if(['eq','gte'].includes(op)){vals.push(v.slice(n+1));filtre.push(`${cle}${op==='eq'?'=':'>='}$${vals.length}`);}}
 if(p.has('or')&&table==='discussions'){vals.push(p.get('or').match(/a_user\.eq\.([a-f\d-]+)/)?.[1]);filtre.push(`(a_user=$${vals.length} or b_user=$${vals.length})`);}
 return (await exec(`select * from ${table}${filtre.length?' where '+filtre.join(' and '):''}${p.get('order')?.startsWith('created_at')?' order by created_at desc,id desc':''}${p.has('limit')?' limit '+Number(p.get('limit')):''}`,vals)).rows;
};
const insert=async(table,row)=>{const c=Object.keys(row);return(await exec(`insert into ${table}(${c.join(',')}) values(${c.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(row))).rows[0];};
const patch=async(table,filtre,row)=>{const c=Object.keys(row);return exec(`update ${table} set ${c.map((x,i)=>`${x}=$${i+1}`).join(',')} where id=$${c.length+1}`,[...Object.values(row),D]);};
const attentes=[], compteurs={};
const panne=new Map(), lents=new Map();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff'};
function clientModule(c){return `const user=${JSON.stringify({id:c.id,email:c.ref+'@recette.invalid',user_metadata:{first_name:c.nom},app_metadata:{}})}; let session={access_token:${JSON.stringify(c.token)},user};const callbacks=[];const result=()=>({data:{session,user},error:null});function chaine(){let x=new Proxy({},{get(_,k){if(k==='then')return f=>Promise.resolve({data:[],error:null}).then(f);return()=>x;}});return x;}
 export function createClient(){return {auth:{getSession:async()=>result(),getUser:async()=>result(),refreshSession:async()=>result(),onAuthStateChange:(f)=>{callbacks.push(f);queueMicrotask(()=>f('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>{session=null;callbacks.forEach(f=>f('SIGNED_OUT',null));return {error:null};},updateUser:async()=>({data:{user},error:null})},from:()=>chaine(),rpc:()=>chaine(),channel:()=>chaine(),removeChannel:()=>{},storage:{from:()=>chaine()}};}
 window.addEventListener('recette-connexion',()=>callbacks.forEach(f=>f('SIGNED_IN',session)));`;
}
function bandeau(c){return `<aside style="position:relative;z-index:60;background:#fff1be;color:#3b2b18;padding:12px;font:14px system-ui;border-bottom:2px solid #a5782d"><strong>RECETTE LOCALE — données fictives — ${c.nom}</strong><p>Aucun appel vers la production. Les pannes ci-dessous concernent seulement cette recette.</p><form action="/__recette/coupure" method="post" style="display:inline"><button>Prochain envoi : réponse perdue</button></form> <form action="/__recette/lecture" method="post" style="display:inline"><button>Prochaine lecture : indisponible</button></form> <form action="/__recette/lenteur" method="post" style="display:inline"><button>Prochain envoi : délai dépassé</button></form> <button type="button" onclick="dispatchEvent(new Event('recette-connexion'))">Simuler un retour de connexion</button> <a href="/__recette/etat">Compteur de recette</a></aside><script>localStorage.setItem('lfb-espace-choix','celibataire');localStorage.setItem('lfb-charte','1');</script>`;}
function profil(c){return {ok:true,profil:{test:true,ref:c.ref,status:'publiee',prenom:c.nom,mon_genre:c.genre,genre:c.genre,interets:[],matching:{},matchs:{actifs:1,limite:3,formule:'passion'},choisi_par:{nombre:0,refs:[]},matchs_lies:[],medias_ok:true,photos:2,a_completer:[],suivi:{mises_total:1,mises_mois:1},anonyme_ok:true,visible_anonyme:false,pays:'France',ville:'Ville fictive',profil:'Profil de recette uniquement.',recherche:'Tester la messagerie.',sincerite:{}}};}
const serveurs=clients.map((c,i)=>createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'), send=(code,body,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'"});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
 try{
  if(u.pathname==='/vendor/supabase.mjs')return send(200,clientModule(c),'text/javascript');
  if(u.pathname.startsWith('/__recette/')){
   if(u.pathname.endsWith('/etat')){const n=(await exec('select count(*) as n from discussion_messages where discussion_id=$1',[D])).rows[0].n;return send(200,`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Compteur de recette</title><body>${bandeau(c)}<main><h1>Compteur de recette</h1><p>Messages fictifs enregistrés : ${n}</p><pre>${JSON.stringify(compteurs,null,2)}</pre><a href="/mon-espace/#discussion">Revenir aux discussions</a></main></body></html>`,'text/html; charset=utf-8');}
   if(req.method==='POST'){if(u.pathname.endsWith('/coupure'))panne.set(c.id,'envoi');if(u.pathname.endsWith('/lecture'))panne.set(c.id,'lecture');if(u.pathname.endsWith('/lenteur'))lents.set(c.id,true);return send(200,`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Panne de recette activée</title><h1>Panne de recette activée</h1><p>${u.pathname.endsWith('/lenteur')?'Le prochain envoi sera retardé de 25 secondes.':panne.get(c.id)==='envoi'?'Le prochain envoi sera enregistré, puis sa réponse sera interrompue.':'La prochaine lecture sera indisponible.'}</p><a href="/mon-espace/#discussion">Revenir aux discussions</a></html>`,'text/html; charset=utf-8');}
  }
  if(u.pathname.startsWith('/api/')){
   let brut='';for await(const part of req)brut+=part;
   let b={};try{b=JSON.parse(brut||'{}');}catch{return send(400,{error:'bad_request'});}
   const cle=c.ref+':'+(b.action||u.pathname);compteurs[cle]=(compteurs[cle]||0)+1;
   if(b.action==='live_erreur')return send(200,{ok:true});
   if(b.action==='annonce_mon_profil')return send(200,profil(c));
   if(b.action==='annonce_discussions'||b.action==='annonce_discussion_envoyer'){
    if(req.headers.authorization!==`Bearer ${c.token}`)return send(401,{error:'login_required'});
    if(b.action==='annonce_discussions'&&panne.get(c.id)==='lecture'){panne.delete(c.id);return send(503,{error:'temporary_failure'});}
    if(b.action==='annonce_discussion_envoyer'&&lents.get(c.id)){lents.delete(c.id);await new Promise(r=>{const t=setTimeout(r,25000);attentes.push(t);});}
    const r=await actionDiscussion(b.action,b,{read,insert,patch,user:{id:c.id},now:()=>new Date(),pousserMembre:async()=>{},quiEst:async()=>({genre:c.genre,prenom:c.nom})});const data=await r.json();
    // Interrompre le corps après les en-têtes évite la relance TCP transparente du navigateur.
    if(b.action==='annonce_discussion_envoyer'&&panne.get(c.id)==='envoi'){panne.delete(c.id);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.write('{');const t=setTimeout(()=>res.destroy(),100);attentes.push(t);return;}
    if(!res.destroyed)return send(r.status,data);return;
   }
   return send(404,{error:'recette_non_couverte'});
  }
  let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
  const file=resolve(root,'.'+p);if(!file.startsWith(root.endsWith(sep)?root:root+sep))return send(404,'');
  let data=await readFile(file);if(extname(file)==='.html')data=Buffer.from(data.toString().replace(/(<body[^>]*>)/i,'$1'+bandeau(c)));
  return send(200,data,mime[extname(file)]||'application/octet-stream');
 }catch(e){console.error('Recette locale:',e.message);if(!res.destroyed)return send(500,{error:'fixture_failure'});}
}).listen(4173+i,'127.0.0.1',()=>console.log(`Recette ${c.nom}: http://127.0.0.1:${4173+i}/mon-espace/#discussion`)));
process.once('SIGINT',async()=>{attentes.forEach(clearTimeout);serveurs.forEach(s=>s.close());await pg.close();process.exit(0);});
