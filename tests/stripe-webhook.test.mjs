import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {receiveStripeEvent, EVENT_TYPES} from '../lib/stripe-webhook.mjs';
const stripe = new Stripe('sk_test_fixture');
const env = {STRIPE_SECRET_KEY:'rk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_local_fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture'};
const fixture = (type='checkout.session.completed') => ({id:'evt_fixture',type,created:Math.floor(Date.now()/1000),livemode:true,data:{object:{id:'cs_fixture',payment_status:'paid'}}});
function signed(event=fixture(), {secret=env.STRIPE_WEBHOOK_SECRET,timestamp=Math.floor(Date.now()/1000),tamper=false}={}) {
 const payload=JSON.stringify(event);
 const header=stripe.webhooks.generateTestHeaderString({payload,secret,timestamp});
 return new Request('https://example.com/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':header},body:payload+(tamper?' ': '')});
}
const noStore=()=>{throw Error('must not write')};
const quiet={error(){}};
test('missing signature and unsupported method cannot write',async()=>{
 assert.equal((await receiveStripeEvent(new Request('https://example.com',{method:'POST'}),{env,fetcher:noStore})).status,400);
 assert.equal((await receiveStripeEvent(new Request('https://example.com'),{env,fetcher:noStore})).status,405);
});
test('unconfigured receiver fails closed',async()=>{
 assert.equal((await receiveStripeEvent(signed(),{env:{},fetcher:noStore})).status,503);
});
test('forged, stale and modified payload signatures are rejected',async()=>{
 for(const options of [{secret:'wrong'},{timestamp:Math.floor(Date.now()/1000)-400},{tamper:true}]) {
  assert.equal((await receiveStripeEvent(signed(fixture(),options),{env,fetcher:noStore})).status,400);
 }
});
test('test mode and foreign account events are rejected',async()=>{
 for(const event of [{...fixture(),livemode:false},{...fixture(),account:'acct_other'}]) {
  assert.equal((await receiveStripeEvent(signed(event),{env,fetcher:noStore})).status,400);
 }
});
test('unselected event is acknowledged without persistence',async()=>{
 const response=await receiveStripeEvent(signed(fixture('customer.created')),{env,fetcher:noStore});
 assert.deepEqual(await response.json(),{received:true,ignored:true});
});
test('all eight selected events are durably recorded as pending',async()=>{
 for(const type of EVENT_TYPES){
 let record;
 const response=await receiveStripeEvent(signed(fixture(type)),{env,fetcher:async(url,options)=>{
  assert.match(url,/on_conflict=stripe_event_id/);
  assert.match(options.headers.Prefer,/ignore-duplicates/);
  record=JSON.parse(options.body);return {ok:true};
 }});
 assert.equal(response.status,200);assert.equal(record.event_type,type);assert.equal(record.processing_status,'pending');
 assert(!JSON.stringify(record).includes('server-fixture'));
 }
});
test('duplicate deliveries keep one record through atomic ignore-on-conflict',async()=>{
 const rows=new Map();
 const fetcher=async(url,options)=>{
  const row=JSON.parse(options.body);
  assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
  if(!rows.has(row.stripe_event_id))rows.set(row.stripe_event_id,row);
  return {ok:true};
 };
 await Promise.all([receiveStripeEvent(signed(),{env,fetcher}),receiveStripeEvent(signed(),{env,fetcher})]);
 assert.equal(rows.size,1);
});
test('database failures return retryable 503 and never acknowledge receipt',async()=>{
 for(const fetcher of [async()=>({ok:false}),async()=>{throw Error('offline')}]) {
 assert.equal((await receiveStripeEvent(signed(),{env,fetcher,logger:quiet})).status,503);
 }
});
test('new Supabase secret is not sent as a JWT',async()=>{
 const response=await receiveStripeEvent(signed(),{env:{...env,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'},fetcher:async(url,options)=>{
 assert.equal(options.headers.apikey,'sb_secret_fixture');assert.equal(options.headers.Authorization,undefined);return {ok:true};
 }});assert.equal(response.status,200);
});
test('oversized request is rejected before persistence',async()=>{
 const request=new Request('https://example.com',{method:'POST',headers:{'stripe-signature':'fixture','content-length':'1048577'},body:'{}'});
 assert.equal((await receiveStripeEvent(request,{env,fetcher:noStore})).status,413);
});
