import test from 'node:test';
import assert from 'node:assert/strict';
import {registerForEvent,ageOn} from '../lib/event-register.mjs';
const env={SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'};
const uid='11111111-1111-1111-1111-111111111111',ev='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const body={event_id:ev,first_name:'Nadia',gender:'femme',birth_date:'1990-01-01',city:'Lyon',preferred_genders:['homme'],min_age:25,max_age:40,rules_accepted:true};
const req=b=>new Request('http://localhost/api/event-register',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(b)});
test('verified account ownership; no anonymous creation, email confirmation or cross-user writes',async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{
 calls.push({url,init});if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,email_confirmed_at:'2026-01-01'});
 if(url.endsWith('/rpc/reserve_dating_event'))return Response.json({status:'registered'});
 throw new Error('unexpected route');
 };
 const r=await registerForEvent(req({...body,user_id:'attacker',email:'someone@example.invalid'}),{env,fetcher});
 assert.equal(r.status,200);
 assert.equal(JSON.parse(calls[1].init.body).p_user,uid);
 assert.equal(calls.length,2);
 const denied=await registerForEvent(req(body),{env,fetcher:async()=>Response.json({}, {status:401})});
 assert.equal(denied.status,401);
 const unconfirmed=await registerForEvent(req(body),{env,fetcher:async()=>Response.json({id:uid})});
 assert.equal(unconfirmed.status,403);
});
test('invalid birthday, missing preferences and missing rules rejected before database writes',async()=>{
 const fetcher=async url=>{assert.ok(url.endsWith('/auth/v1/user'));return Response.json({id:uid,email_confirmed_at:'yes'});};
 for(const patch of [{birth_date:'1990-02-31'},{preferred_genders:[]},{min_age:17},{min_age:50,max_age:30},{rules_accepted:false}])
 assert.equal((await registerForEvent(req({...body,...patch}),{env,fetcher})).status,400);
});
test('age respects birthday',()=>{assert.equal(ageOn('1990-11-01','2026-10-31'),35);});
