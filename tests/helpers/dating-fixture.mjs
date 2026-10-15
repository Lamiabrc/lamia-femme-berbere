// Isolated service emulator: no network, real accounts, email delivery or Daily billing.
import { handleBal } from '../../lib/bal.mjs';
export const ids={admin:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',a:'11111111-1111-1111-1111-111111111111',b:'22222222-2222-2222-2222-222222222222',c:'33333333-3333-3333-3333-333333333333',event:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'};
export function fixture() {
 let clock=new Date('2026-10-31T19:55:00Z'), lease=null;
 const tables={platform_settings:[],dating_presence:[],dating_blocks:[],dating_feedback:[],
 speed_dating_events:[{id:ids.event,title:'Répétition locale',audience:'France',status:'published',starts_at:'2026-10-31T20:00:00Z',ends_at:'2026-10-31T22:00:00Z'}],
 event_registrations:['a','b','c'].map(k=>({event_id:ids.event,user_id:ids[k],payment_status:'waived',attendance_status:'registered'})),
 member_profiles:['a','b','c'].map((k,i)=>({user_id:ids[k],display_name:['Nadia','Karim','Samir'][i],gender:i?'homme':'femme',birth_date:'1990-01-01',profile_status:'active'})),
 dating_preferences:['a','b','c'].map((k,i)=>({user_id:ids[k],genders:[i?'femme':'homme'],min_age:18,max_age:99}))};
 const calls=[], ok=(body,status=200)=>Response.json(body,{status});
 const state=()=>tables.platform_settings.find(x=>x.key==='bal_state')?.value;
 const fetcher=async(url,init={})=>{
   const u=new URL(url), body=init.body?JSON.parse(init.body):null;
   calls.push({url,method:init.method||'GET',body});
   if(u.pathname==='/auth/v1/user') {
     const key=new Headers(init.headers).get('authorization')?.replace('Bearer ','');
     return ids[key] ? ok({id:ids[key],email:key+'@example.invalid',email_confirmed_at:'2026-01-01',app_metadata:{role:key==='admin'?'admin':'member'}}) : ok({},401);
   }
   if(u.pathname.startsWith('/auth/v1/admin/users/'))return ok({email:'consented@example.invalid'});
   if(u.hostname==='api.daily.co') {
     if(u.pathname==='/v1/rooms')return ok({name:body.name,url:'https://fixture.daily.co/'+body.name});
     if(u.pathname==='/v1/meeting-tokens')return ok({token:'fixture-token'});
     if(u.pathname.endsWith('/eject'))return ok({ejectedIds:body.user_ids});
     throw new Error('unexpected Daily route '+u.pathname);
   }
   if(u.pathname==='/rest/v1/rpc/save_dating_state') {
     if(JSON.stringify(state()||null)!==JSON.stringify(body.p_expected))return ok(false);
     tables.platform_settings=tables.platform_settings.filter(x=>x.key!=='bal_state');
     tables.platform_settings.push({key:'bal_state',value:structuredClone(body.p_next)});return ok(true);
   }
   if(u.pathname==='/rest/v1/rpc/claim_dating_round') {if(lease)return ok(false);lease=body.p_token;return ok(true);}
   if(u.pathname==='/rest/v1/rpc/release_dating_round') {if(lease===body.p_token)lease=null;return ok(null);}
   const table=u.pathname.replace('/rest/v1/','');
   if(!tables[table])throw new Error('unexpected table '+table);
   if(init.method==='POST') {
     const keys=u.searchParams.get('on_conflict')?.split(',');
     const index=keys?tables[table].findIndex(x=>keys.every(k=>x[k]===body[k])):-1;
     if(index>=0)tables[table][index]={...tables[table][index],...body};else tables[table].push(body);
     return ok(null);
   }
   let rows=tables[table].filter(row=>[...u.searchParams].every(([k,v])=>{
     if(['select','order','limit'].includes(k))return true;
     if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
     if(v.startsWith('in.('))return v.slice(4,-1).split(',').includes(String(row[k]));
     if(v.startsWith('gte.'))return String(row[k])>=v.slice(4);
     throw new Error('unsupported fixture filter '+v);
   }));
   return ok(rows);
 };
 const env={SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture',DAILY_API_KEY:'fixture'};
 const request=(actor,body)=>new Request('http://localhost/api/bal',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor},body:JSON.stringify(body)});
 const run=async(actor,body)=>{const response=await handleBal(request(actor,body),{env,fetcher,now:()=>clock});return {status:response.status,body:await response.json()};};
 return {tables,calls,fetcher,env,run,request,state,now:()=>clock,advance:ms=>{clock=new Date(clock.getTime()+ms);}};
}
