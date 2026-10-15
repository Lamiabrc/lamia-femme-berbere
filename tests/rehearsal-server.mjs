// Local-only UI rehearsal. No provider credentials, outbound API or real media.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {fixture,ids} from './helpers/dating-fixture.mjs';
import {handleBal} from '../lib/bal.mjs';
const f=fixture(),root=fileURLToPath(new URL('../dist/',import.meta.url));
const sdk=`const actor=new URLSearchParams(location.search).get('actor')||'a';
export function createClient(){
 const session={access_token:actor,user:{id:${JSON.stringify(ids)}[actor],email:actor+'@example.invalid',app_metadata:{role:actor==='admin'?'admin':'member'}}};
 return {auth:{getSession:async()=>({data:{session}}),signInWithPassword:async()=>({error:null}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(name){
 const filters=[];let single=false;const q={select(){return q},in(k,v){filters.push([k,v]);return q},eq(k,v){filters.push([k,[v]]);return q},gte(){return q},order(){return q},single(){single=true;return q},upsert(){return Promise.resolve({error:null})},then(resolve,reject){return fetch('/__fixture/table?name='+name).then(r=>r.json()).then(rows=>{rows=rows.filter(r=>filters.every(([k,vs])=>vs.includes(r[k])));return {data:single?rows[0]:rows,error:null}}).then(resolve,reject)}};return q;}};
}`;
const daily=`export default {createCallObject(){let state='new',listeners={};const obj={on(n,fn){listeners[n]=fn;return obj},meetingState:()=>state,async join(){state='joined-meeting';listeners['joined-meeting']?.()},async leave(){state='left-meeting';listeners['left-meeting']?.()},async destroy(){},participants:()=>({local:{local:true,tracks:{}}}),localAudio:()=>false,localVideo:()=>false,setLocalAudio(){},setLocalVideo(){},updateParticipant(){}};return obj;}}`;
http.createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,'http://127.0.0.1:4317');
 res.setHeader('Content-Security-Policy', "connect-src 'self'; media-src 'self' blob:");
 if(url.pathname==='/assets/supabase-config.js'){res.setHeader('Content-Type','text/javascript');return res.end("export const DATABASE_URL='http://127.0.0.1:4317'; export const PUBLIC_KEY='sb_publishable_fixture';");}
 if(url.pathname==='/__fixture/supabase.js'){res.setHeader('Content-Type','text/javascript');return res.end(sdk);}
 if(url.pathname==='/__fixture/daily.js'){res.setHeader('Content-Type','text/javascript');return res.end(daily);}
 if(url.pathname==='/__fixture/table'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(f.tables[url.searchParams.get('name')]||[]));}
 if(url.pathname==='/api/bal'){
   let raw='';for await(const chunk of req)raw+=chunk;
   if(raw.length>20000){res.writeHead(413);return res.end();}
   const request=new Request(url,{method:'POST',headers:req.headers,body:raw});
   const result=await handleBal(request,{env:f.env,fetcher:f.fetcher,now:f.now});
   res.writeHead(result.status,{'Content-Type':'application/json'});return res.end(await result.text());
 }
 let path=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
 const full=resolve(root,'.'+path);if(!full.startsWith(resolve(root)+'/')&&!full.startsWith(resolve(root)+'\\'))throw new Error('path');
 let data=await readFile(full);
 const ext=extname(full),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp'};
 if(['.js','.html'].includes(ext)){
   let text=data.toString().replaceAll('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm','/__fixture/supabase.js').replaceAll('https://cdn.jsdelivr.net/npm/@daily-co/daily-js@0.89.1/+esm','/__fixture/daily.js');
   // A simulator does not request camera/microphone permission or fabricate media validation.
   if(path.endsWith('/bal.js'))text=text.replace('await navigator.mediaDevices.getUserMedia({ video: true, audio: true })','new MediaStream()');
   if(ext==='.html')text=text.replace('<body','<body').replace(/(<body[^>]*>)/,'$1<aside style="background:#fff1b7;color:#111;padding:10px;font:16px sans-serif">Répétition locale simulée — aucun email, paiement ou appel vidéo réel.</aside>');
   data=Buffer.from(text);
 }
 res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local rehearsal: '+e.message);}
}).listen(4317,'127.0.0.1',()=>console.log('Isolated rehearsal http://127.0.0.1:4317/admin-bal.html?actor=admin and /speed-dating/bal/?actor=a or b'));
