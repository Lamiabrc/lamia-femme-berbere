import test from 'node:test';
import assert from 'node:assert/strict';
import { lectureFiable, lecturesParRequete, routeSansDonnees } from '../lib/supabase-lecture.mjs';
import { userFromRequest } from '../lib/event-tickets.mjs';
import { myOrders } from '../lib/mes-achats.mjs';

test('une lecture récupère une panne transitoire, au maximum une seule reprise',async()=>{
  let n=0;const r=await lectureFiable('https://base.invalid/rest/v1/annonces',{}, {pause:async()=>{},fetcher:async()=>++n===1?Response.json({}, {status:503}):Response.json([42])});
  assert.deepEqual(await r.json(),[42]);assert.equal(n,2);
  n=0;assert.equal((await lectureFiable('https://base.invalid/rest/v1/annonces',{}, {pause:async()=>{},fetcher:async()=>{n++;return Response.json({}, {status:503});}})).status,503);assert.equal(n,2);
});
test('un timeout de lecture peut être repris, une erreur applicative ne déclenche pas de reprise',async()=>{
  let n=0;assert.equal((await lectureFiable('https://base.invalid/auth/v1/user',{}, {pause:async()=>{},fetcher:async()=>{if(++n===1)throw new DOMException('retard','TimeoutError');return Response.json({id:'u'});}})).status,200);
  assert.equal(n,2);n=0;
  await assert.rejects(lectureFiable('https://base.invalid/rest/v1/annonces',{}, {fetcher:async()=>{n++;throw new Error('bug de programmation');}}));assert.equal(n,1);
});
test('aucune répétition des messages, paiements, retraits et mises à jour, même après timeout',async()=>{
  for(const method of ['POST','PATCH','PUT','DELETE']){
    let n=0;await assert.rejects(lectureFiable('https://base.invalid/rest/v1/discussion_messages',{method}, {fetcher:async()=>{n++;throw new DOMException('retard','TimeoutError');}}));assert.equal(n,1,method);
  }
});
test('401, 403, 400, 409 et 500 sont rendus sans nouvelle tentative',async()=>{
  for(const status of [401,403,400,409,500]){let n=0;const r=await lectureFiable('https://base.invalid/rest/v1/annonces',{}, {fetcher:async()=>{n++;return Response.json({}, {status});}});assert.equal(r.status,status);assert.equal(n,1);}
});
test('Retry-After et annulation explicite ne provoquent pas de rafale',async()=>{
  let n=0;const r=await lectureFiable('https://base.invalid/rest/v1/annonces',{}, {timeoutMs:1000,fetcher:async()=>{n++;return Response.json({}, {status:429,headers:{'Retry-After':'60'}});}});assert.equal(r.status,429);assert.equal(n,1);
  const c=new AbortController();c.abort();n=0;
  await assert.rejects(lectureFiable('https://base.invalid/rest/v1/annonces',{signal:c.signal}, {fetcher:async()=>{n++;throw new DOMException('annulé','AbortError');}}));assert.equal(n,1);
});
test('la reprise respecte le budget total, sans redémarrer un délai complet',async()=>{
  let t=0,n=0;await assert.rejects(lectureFiable('https://base.invalid/rest/v1/annonces',{}, {timeoutMs:1000,horloge:()=>t,pause:async(ms)=>{t+=ms;},fetcher:async()=>{n++;t+=900;throw new DOMException('retard','TimeoutError');}}));assert.equal(n,1);
});
test('diagnostic sans email, jeton, paramètres ni identifiant personnel',async()=>{
  const url='https://base.invalid/rest/v1/annonces?email=eq.prive@example.com&token=secret';
  await assert.rejects(lectureFiable(url,{}, {contexte:'annonce_mon_profil',pause:async()=>{},fetcher:async()=>{throw new TypeError(url);}}),(e)=>{assert.match(e.message,/GET \/rest\/v1\/annonces/);assert.doesNotMatch(e.message,/prive|secret|email=/);return true;});
  assert.equal(routeSansDonnees('https://base.invalid/storage/v1/object/sign/photos-personnelles/abc'),'/storage/v1/object');
});
test('mémo par requête, appels concurrents partagés, résultat indépendant et aucune fuite entre requêtes',async()=>{
  let n=0;const appel=async()=>{n++;return Response.json([{ref:42}]);};const a=lecturesParRequete(appel),b=lecturesParRequete(appel);
  const [x,y]=await Promise.all([a.read('/rest/v1/annonces'),a.read('/rest/v1/annonces')]);x[0].ref=99;assert.equal(y[0].ref,42);assert.equal(n,1);
  assert.equal((await a.read('/rest/v1/annonces'))[0].ref,42);await b.read('/rest/v1/annonces');assert.equal(n,2);
});
test('une écriture et une lecture échouée invalident le mémo',async()=>{
  let valeur=0,n=0;const a=lecturesParRequete(async(_p,opt={})=>{n++;if(opt.method==='PATCH')valeur=1;return Response.json([valeur]);});
  assert.deepEqual(await a.read('/rest/v1/annonces'),[0]);await a.call('/rest/v1/annonces',{method:'PATCH'});assert.deepEqual(await a.read('/rest/v1/annonces'),[1]);assert.equal(n,3);
  let appels=0;const b=lecturesParRequete(async()=>++appels===1?Response.json({}, {status:503}):Response.json([1]));await assert.rejects(b.read('/x'));assert.deepEqual(await b.read('/x'),[1]);
});
test('Auth reprend un défaut réseau mais vérifie toujours le compte côté serveur',async()=>{
  let n=0;const u=await userFromRequest(new Request('https://site.invalid/',{headers:{Authorization:'Bearer jeton-fictif'}}),{fetcher:async()=>{if(++n===1)throw new TypeError('connexion');return Response.json({id:'u',email:'fictif@example.invalid',app_metadata:{}});}});
  assert.equal(n,2);assert.equal(u.id,'u');
});
test('historique achats et abonnement sont lus en parallèle, toujours filtrés sur le propriétaire',async()=>{
  let abonnementLance=false;const r=await myOrders(new Request('https://site.invalid/',{headers:{Authorization:'Bearer fictif'}}),{env:{SUPABASE_SERVICE_ROLE_KEY:'fictif'},fetcher:async(url)=>{
    if(url.includes('/auth/v1/user'))return Response.json({id:'u',email:'fictif@example.invalid',email_confirmed_at:'2026'});
    if(url.includes('/rest/v1/abonnements')){abonnementLance=true;return Response.json([]);}
    if(url.includes('/rest/v1/orders')){assert.equal(abonnementLance,true);return Response.json([{order_number:1,customer_email:'autre@example.invalid'}]);}
    return Response.json([]);
  }});assert.deepEqual((await r.json()).orders,[]);
});
