import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {reserverNotification} from '../lib/email-notifications.mjs';
import {envoyerEmail} from '../lib/email-transactionnel.mjs';

const env={SUPABASE_SERVICE_ROLE_KEY:'secret-fictif',RESEND_API_KEY:'resend-fictif',RESEND_FROM:'TAYRI <sender@example.invalid>'};
const debut=new Date('2026-11-26T12:00:00Z');
async function monde(){
 const db=new PGlite();await db.exec('create table platform_settings(key text primary key,value jsonb not null,updated_at timestamptz not null)');
 const mails=[];let date=debut;
 // Adaptateur PostgREST réduit aux opérations utilisées ; les conflits et les
 // filtres conditionnels sont réellement exécutés par PostgreSQL local.
 const fetcher=async(u,o={})=>{
  const url=new URL(u);if(url.hostname==='api.resend.com'){mails.push(JSON.parse(o.body));return Response.json({id:'fictif'});}
  assert.equal(url.pathname,'/rest/v1/platform_settings');const b=o.body?JSON.parse(o.body):null;
  let rows;
  if(o.method==='POST')rows=(await db.query('insert into platform_settings values($1,$2,$3) on conflict(key) '+(o.headers.Prefer.includes('merge-duplicates')?'do update set value=excluded.value,updated_at=excluded.updated_at':'do nothing')+' returning key',[b.key,b.value,b.updated_at])).rows;
  else {
   const key=url.searchParams.get('key').slice(3);
   if(o.method==='PATCH'){
    if(url.searchParams.has('updated_at'))rows=(await db.query('update platform_settings set value=$1,updated_at=$2 where key=$3 and updated_at <= $4 returning key',[b.value,b.updated_at,key,url.searchParams.get('updated_at').slice(4)])).rows;
    else rows=(await db.query("update platform_settings set value=$1,updated_at=$2 where key=$3 and value->>'compteur'=$4 returning key",[b.value,b.updated_at,key,url.searchParams.get('value->>compteur').slice(3)])).rows;
   } else rows=(await db.query('select value from platform_settings where key=$1',[key])).rows;
  }
  return Response.json(rows);
 };
 return {db,mails,fetcher,ctx:{env,fetcher,now:()=>date},avancer:ms=>{date=new Date(date.getTime()+ms);},close:()=>db.close()};
}

test('budget partagé : requêtes concurrentes et contenus différents, un seul email facultatif par 24 h',async()=>{
 const m=await monde();try{
  const message={to:'nina@example.invalid',subject:'Intérêt',text:'Nouveau choix',notification:true};
  const results=await Promise.all(Array.from({length:8},(_,i)=>envoyerEmail({...message,subject:`Événement ${i}`},m.ctx)));
  assert.equal(results.filter(x=>x.ok).length,1);assert.equal(m.mails.length,1);
  assert.equal((await reserverNotification('NINA@example.invalid',m.ctx)).ok,false);
  m.avancer(86400e3-1);assert.equal((await reserverNotification(message.to,m.ctx)).ok,false);
  m.avancer(1);assert.equal((await reserverNotification(message.to,m.ctx)).ok,true);
  const keys=(await m.db.query("select key,value from platform_settings where key like 'email-notification-membre-%'")).rows;
  assert.equal(keys.length,1);assert.ok(!JSON.stringify(keys).includes('nina'));
 }finally{await m.close();}
});

test('80 notifications facultatives maximum par jour de Paris, même avec plusieurs serveurs',async()=>{
 const m=await monde();try{
  await m.db.query('insert into platform_settings values($1,$2,$3)',['email-notification-jour-2026-11-26',{compteur:79},debut]);
  const r=await Promise.all(Array.from({length:5},(_,i)=>reserverNotification(`membre-${i}@example.invalid`,m.ctx)));
  assert.equal(r.filter(x=>x.ok).length,1);
  assert.equal((await m.db.query("select value from platform_settings where key='email-notification-jour-2026-11-26'")).rows[0].value.compteur,80);
  m.avancer(11*3600e3);assert.equal((await reserverNotification('nouveau@example.invalid',m.ctx)).ok,true);
  assert.equal((await m.db.query("select value from platform_settings where key='email-notification-jour-2026-11-27'")).rows[0].value.compteur,1);
 }finally{await m.close();}
});

test('si le budget est indisponible, aucune notification ; les liens essentiels restent envoyés',async()=>{
 const mails=[];const fetcher=async(u,o)=>{if(new URL(u).hostname==='api.resend.com'){mails.push(JSON.parse(o.body));return Response.json({id:'fictif'});}throw Error('base indisponible');};
 const msg={to:'nina@example.invalid',subject:'Lien demandé',text:'Contenu fictif'};
 assert.equal((await envoyerEmail({...msg,notification:true},{env,fetcher})).ok,false);assert.equal(mails.length,0);
 assert.equal((await envoyerEmail(msg,{env,fetcher})).ok,true);assert.equal(mails.length,1);
});

test('match prioritaire : une seule réservation par chat et destinataire, toujours sous le budget global',async()=>{
 const m=await monde();try{
  const to='nina@example.invalid', evenement='match:11111111-1111-4111-8111-111111111111';
  assert.equal((await reserverNotification(to,m.ctx)).ok,true);
  const results=await Promise.all(Array.from({length:6},()=>reserverNotification(to,{...m.ctx,evenement})));
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal((await reserverNotification(to,m.ctx)).motif,'personne_24h');
  m.avancer(86400e3);
  assert.equal((await reserverNotification(to,{...m.ctx,evenement})).motif,'evenement_deja_reserve');
  await m.db.query('insert into platform_settings values($1,$2,$3)',['email-notification-jour-2026-11-27',{compteur:80},new Date('2026-11-27T12:00Z')]);
  assert.equal((await reserverNotification(to,{...m.ctx,evenement:'match:22222222-2222-4222-8222-222222222222'})).motif,'plafond_jour');
 }finally{await m.close();}
});
