// Recette manuelle de la vraie page Mon espace. Aucune connexion à la production.
// node tests/serve-matchs-numeros.mjs puis http://127.0.0.1:4182/mon-espace/#mon-profil
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('.'),uid='10000000-0000-4000-8000-000000000001';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
let choix=null,numero=null,mode='normal',calls=0;
const profil=()=>({ref:99991,status:'publiee',mon_genre:'homme',medias_ok:true,sincerite_signee:true,photos:2,matching:{},matchs:{actifs:1,limite:choix==='oui'?8:1,capacite:8,formule:'prestige',places_en_attente:choix!=='oui',choix_multiples:choix},matchs_lies:[]});
const discussion=()=>({id:'33333333-3333-4333-8333-333333333333',avec:'Profil fictif n° 99992',avec_ref:99992,ouverte:false,ouverte_at:'2026-11-01T10:00:00Z',ferme_at:'2026-11-08T10:00:00Z',numero_possible:mode!=='fermee',close_raison:mode==='fermee'?'signalee':null,messages:[],vide:true,mon_numero:numero,il_a_partage:mode==='mutuel',echange:Boolean(numero&&mode==='mutuel'),son_numero:numero&&mode==='mutuel'?'+33600000001':null,fin:{}});
const reponse=(b)=>{
  if(b.action==='annonce_mon_profil')return {ok:true,profil:profil()};
  if(b.action==='annonce_matchs_multiples'){calls++;if(mode==='erreur')return {error:'preference_indisponible'};choix=b.choix;return {ok:true};}
  if(b.action==='annonce_discussions')return {ok:true,discussions:[discussion()],numero_ok:mode!=='formule'&&mode!=='indisponible',numero_indisponible:mode==='indisponible'};
  if(b.action==='annonce_discussion_numero'){numero=b.telephone;return {ok:true};}
  return {ok:true,orders:[],blocages:[],fiches:[],interets:[],propositions:[],photos:[],medias:[],reponses:{}};
};
createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:4182');
  const send=(s,d,type='application/json')=>{res.writeHead(s,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; object-src 'none'; form-action 'self'"});res.end(typeof d==='string'||Buffer.isBuffer(d)?d:JSON.stringify(d));};
  try{
    if(u.pathname==='/vendor/supabase.mjs')return send(200,`const session={access_token:'fixture',user:{id:'${uid}',email:'recette@example.invalid',user_metadata:{first_name:'Recette'},app_metadata:{}}};export function createClient(){return {auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}}`,'text/javascript');
    if(u.pathname==='/recette-mode'){mode=u.searchParams.get('mode')||'normal';numero=null;choix=null;calls=0;res.writeHead(302,{Location:'/mon-espace/#'+(u.searchParams.get('vue')||'discussion')});return res.end();}
    if(u.pathname==='/recette-statuts')return send(200,{mode,choix,numeroEnregistre:Boolean(numero),appelsAccord:calls});
    if(u.pathname.startsWith('/api/')){let raw='';for await(const p of req)raw+=p;const b=JSON.parse(raw||'{}'),r=reponse(b);return send(r.error?503:200,r);}
    let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
    const file=resolve(root,p.startsWith('/fonts/')||p.startsWith('/images/')?'public':'dist','.'+p);
    if(!file.startsWith(root+sep))return send(404,'');
    let data=await readFile(file);
    if(extname(file)==='.html')data=Buffer.from(data.toString().replace(/(<body[^>]*>)/i,'$1<aside style="padding:8px;background:#e8efff;color:#183c78;position:relative;z-index:100">RECETTE LOCALE · profils et numéros fictifs · aucun envoi réel</aside><script>localStorage.setItem("lfb-espace-choix","celibataire");</script>'));
    return send(200,data,mime[extname(file)]||'application/octet-stream');
  }catch(e){return send(e.code==='ENOENT'?404:500,{error:'recette'});}
}).listen(4182,'127.0.0.1',()=>console.log('http://127.0.0.1:4182/mon-espace/#mon-profil'));
