import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/erreurs.js',import.meta.url),'utf8');
async function signalement(err, quitter = false) {
  const envois=[], timers=[], events={};
  const window={addEventListener:(n,f)=>{events[n]=f;},fetch:async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='live_erreur'){envois.push(body);return {ok:true};}throw err;}};
  const location={href:'https://recette.invalid/mon-espace/',origin:'https://recette.invalid',pathname:'/mon-espace/',hash:'#discussion'};
  vm.runInNewContext(source,{window,location,navigator:{onLine:true,userAgent:'Recette fictive'},document:{visibilityState:'visible',querySelector:()=>null},localStorage:{getItem:()=>null},URL,setTimeout:f=>timers.push(f)});
  await assert.rejects(window.fetch('/api/confidences/',{body:JSON.stringify({action:'annonce_discussion_envoyer',texte:'CONTENU FICTIF À NE PAS JOURNALISER'})}));
  if(quitter)events.pagehide();
  timers.forEach(f=>f());await Promise.resolve();return envois;
}
test('un délai dépassé est distingué d’une panne réseau, sans journaliser le message',async()=>{
  for(const err of [Object.assign(new Error('timeout'),{name:'TimeoutError'}),Object.assign(new Error('timeout'),{code:'delai_depasse'})]){
    const logs=await signalement(err);assert.equal(logs[0].message,'délai de réponse dépassé');assert.ok(!JSON.stringify(logs).includes('CONTENU FICTIF'));
  }
});
test('un changement de session ou un départ de page ne devient pas une alerte réseau',async()=>{
  assert.deepEqual(await signalement(Object.assign(new Error('session'),{code:'session_changee'})),[]);
  assert.deepEqual(await signalement(new TypeError('Failed to fetch'),true),[]);
});
test('une vraie coupure reste signalée avec l’action technique uniquement',async()=>{
  const logs=await signalement(new TypeError('Failed to fetch'));assert.equal(logs[0].message,'pas de réponse du site');assert.equal(logs[0].appel,'/api/confidences/ · annonce_discussion_envoyer');assert.equal(logs[0].statut,0);
});
