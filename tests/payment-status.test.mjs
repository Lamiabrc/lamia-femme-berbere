import test from 'node:test';
import assert from 'node:assert/strict';
import paymentStatus from '../api/payment-status.js';
import {GET as webhookStatus} from '../api/stripe-webhook.mjs';

test('le diagnostic du webhook ne prétend pas que le paiement est coupé quand il est activé',async()=>{
 const avant=process.env.CHECKOUT_ENABLED;
 try{process.env.CHECKOUT_ENABLED='true';assert.equal((await (await webhookStatus()).json()).checkoutEnabled,true);process.env.CHECKOUT_ENABLED='false';assert.equal((await (await webhookStatus()).json()).checkoutEnabled,false);}
 finally{if(avant===undefined)delete process.env.CHECKOUT_ENABLED;else process.env.CHECKOUT_ENABLED=avant;}
});
const keys=['STRIPE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','CHECKOUT_ENABLED'];
async function probe({enabled='true',charges=true,response=null,error=false}={}){
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]])),fetchBefore=globalThis.fetch;
 try{
  Object.assign(process.env,{STRIPE_SECRET_KEY:'sk_live_fictif',SUPABASE_SERVICE_ROLE_KEY:'fixture',STRIPE_WEBHOOK_SECRET:'fixture',CHECKOUT_ENABLED:enabled});
  globalThis.fetch=async()=>{if(error)throw new TypeError('fixture réseau');return response||Response.json({id:'acct_1OB0kuAiy7hcxWtQ',charges_enabled:charges,payouts_enabled:true});};
  let body;await paymentStatus({method:'GET'},{setHeader(){},status(){return this;},json(d){body=d;return d;}});return body;
 }finally{globalThis.fetch=fetchBefore;for(const k of keys)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
}
test('paiement activé et encaissement autorisé : le diagnostic dit prêt, sans publier de clé',async()=>{const p=await probe();assert.equal(p.checkoutReady,true);assert.equal(p.checkoutEnabled,true);assert.ok(!JSON.stringify(p).includes('fictif'));});
test('un arrêt local ou une suspension Stripe reste distinct d’une panne de vérification',async()=>{assert.equal((await probe({enabled:'false'})).checkoutReady,false);assert.equal((await probe({charges:false})).checkoutReady,false);const p=await probe({error:true});assert.equal(p.checkoutReady,null);assert.equal(p.stripeConnection,'unavailable');});
test('une clé refusée ne donne jamais un état prêt',async()=>{assert.equal((await probe({response:Response.json({},{status:401})})).checkoutReady,false);});
