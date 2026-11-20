// Recette des seuls états affichés, sessions et messages fictifs. Aucun accès à la production.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compterMatchsAffiches } from '../content/etat-matchs.mjs';
import { handleAnnonces } from '../lib/annonces.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',D='33333333-3333-4333-8333-333333333333';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const t=new Date(), fin=new Date(t.getTime()+24*3600e3).toISOString(), avant=new Date(t.getTime()-24*3600e3).toISOString();
const user={id:A,email:'recette@fictif.invalid',user_metadata:{first_name:'Recette'},app_metadata:{}};
function contexte(ref){const u=new URL(ref||'/','http://recette.invalid');return {recette:u.searchParams.get('recette')||'termine',terminee:true,actif:false,genre:'homme'};}
function profil(c){const ds=[{id:D,interet_id:'ancien',a_user:A,b_user:B,a_ref:15,b_ref:16,ouverte_at:avant,ferme_at:c.terminee?avant:fin,dematch_at:c.actif?null:avant,close_raison:c.terminee?'dematch':null}];
 const compte=compterMatchsAffiches({sortants:[],recus:[],discussions:ds,moi:A,refs:[15],maintenant:t});
 return {ok:true,profil:{test:true,ref:15,status:'publiee',prenom:'Recette fictive',mon_genre:c.genre,genre:c.genre,pays:'France',ville:'Ville fictive',profil:'Portrait fictif de recette.',recherche:'Recherche fictive.',matching:{},medias_ok:true,photos:2,a_completer:[],interets:[],matchs_lies:[],choisi_par:{nombre:0,refs:[],inclus:true},suivi:{mises_total:1,mises_mois:1},
  matchs:{...compte,limite:c.actif?1:c.terminee?3:0,capacite:3,formule:'passion',places_en_attente:!c.terminee,au_revoir:!c.actif&&!c.terminee,choix_multiples:null}}};}
function discussion(c){return {ok:true,discussions:[{id:D,avec:'Profil fictif n° 16',avec_ref:16,ouverte:!c.terminee,ouverte_at:avant,ferme_at:c.terminee?avant:fin,close_raison:c.terminee?'dematch':null,
 dematch:c.actif?null:{par_moi:false,raison:'Une autre raison',fin:c.terminee?avant:fin,restants:1},messages:[{moi:false,texte:'Bonjour ! Ceci est un message fictif de recette.',le:avant}],prenom:{partage:true},fin:{},prolongeable:false}]};}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:4178'),c=contexte(req.headers.referer);
 const send=(s,b,type='application/json')=>{res.writeHead(s,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'"});res.end(typeof b==='string'||Buffer.isBuffer(b)?b:JSON.stringify(b));};
 try{
  if(url.pathname==='/vendor/supabase.mjs')return send(200,`const session={access_token:'recette-fictive',user:${JSON.stringify(user)}};export function createClient(){return {auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:f=>{queueMicrotask(()=>f('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};},updateUser:async()=>({error:null})}};}`,'text/javascript');
  if(url.pathname.startsWith('/api/')){
   let s='';for await(const p of req)s+=p;const b=JSON.parse(s||'{}');
   if(b.action==='live_erreur')return send(200,{ok:true});
   if(url.pathname==='/api/mes-achats')return send(200,{orders:[],abonnement:{abonnement:{formule:'passion',statut:'actif',periode:'mois'},unites:{}}});
   if(b.action==='annonce_mon_profil')return send(200,profil(c));
   if(b.action==='annonce_discussions')return send(200,discussion(c));
   if(b.action==='annonce_interets_recus'){
    if(c.recette==='erreur')return send(502,{error:'temporary_failure'});
    const moi={id:A,ref:15,user_id:A,email:user.email,status:'publiee',test:false};
    const i={id:D,cible_ref:15,created_at:avant,statut:c.recette==='recu'?'a_traiter':'pas_compatible',reponse:c.recette==='recu'?null:'oui',annonces:{ref:16,genre:'femme',birth_date:'1992-01-01',status:c.recette==='indisponible'?'retiree':'publiee',test:false,profil:'Présentation entièrement fictive.',recherche:'Une relation sérieuse.'}};
    const read=async(p)=>p.includes('/annonces?')?[moi]:p.includes('/annonce_interets?')?[i]:[];
    const r=await handleAnnonces(b.action,b,{env:{},user,admin:false,read,call:async()=>{throw new Error('aucune écriture dans cette recette');},patch:async()=>{throw new Error('aucune écriture dans cette recette');},now:()=>t});return send(r.status,await r.json());
   }
   if(url.pathname.includes('/abonnement'))return send(200,{ok:true,abonnement:{formule:'passion',statut:'actif'},unites:{}});
   return send(404,{error:'recette_hors_perimetre'});
  }
  let p=decodeURIComponent(url.pathname);if(p.endsWith('/'))p+='index.html';const file=resolve(root,'.'+p);
  if(!file.startsWith(root.endsWith(sep)?root:root+sep))return send(404,'');let d=await readFile(file);
  if(extname(file)==='.html')d=Buffer.from(d.toString().replace(/(<body[^>]*>)/i,`$1<aside style="background:#fff1be;color:#36291c;padding:10px;font:14px system-ui">RECETTE LOCALE — profils et messages fictifs — aucun accès à la production.<nav><a href="/mon-espace/?recette=aurevoir#mon-profil">Au revoir</a> · <a href="/mon-espace/?recette=actif#mon-profil">Match actif</a> · <a href="/mon-espace/?recette=terminee#discussion">Échange terminé</a> · <a href="/mon-espace/?genre=homme#mon-profil">Version homme</a></nav></aside>`));
  send(200,d,mime[extname(file)]||'application/octet-stream');
 }catch(e){if(e.code==='ENOENT')return send(404,'');console.error('Recette fictive :',e.message);if(!res.destroyed)send(500,{error:'recette_erreur'});}
}).listen(4178,'127.0.0.1',()=>console.log('Recette fictive : http://127.0.0.1:4178/mon-espace/?recette=termine&interet=33333333-3333-4333-8333-333333333333#interets'));
process.once('SIGINT',()=>server.close(()=>process.exit(0)));
