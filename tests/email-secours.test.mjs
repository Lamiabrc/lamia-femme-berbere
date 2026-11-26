import test from 'node:test';
import assert from 'node:assert/strict';
import { envoyerEmail, expediteur, emailConfigure } from '../lib/email-transactionnel.mjs';
const env = { RESEND_API_KEY: 'cle-fictive', RESEND_FROM: 'TAYRI <test@example.invalid>', BREVO_API_KEY: 'secours-fictif', BREVO_FROM: 'TAYRI <test@example.invalid>', EMAIL_RETRY_PAUSE_MS:'1' };
const message = { to: 'destinataire@example.invalid', subject: 'Essai fictif', html: '<p>Contenu fictif</p>', text: 'Contenu fictif' };
test('quota refusé : passage immédiat au secours, même destinataire et même contenu', async () => {
  const calls=[];
  const r=await envoyerEmail(message,{env,fetcher:async(url,opt)=>{calls.push({url,body:JSON.parse(opt.body),headers:opt.headers});return calls.length===1?Response.json({name:'monthly_quota_exceeded'},{status:429}):Response.json({messageId:'fictif'},{status:201});}});
  assert.equal(r.ok,true);assert.equal(r.fournisseur,'brevo');assert.equal(calls.length,2);
  assert.equal(calls[1].body.to[0].email,message.to);assert.equal(calls[1].body.textContent,message.text);assert.ok(calls[0].headers['Idempotency-Key']);assert.ok(calls[1].body.headers.idempotencyKey);
});
test('Resend accepte : aucun envoi vers le secours',async()=>{let n=0;const r=await envoyerEmail(message,{env,fetcher:async()=>{n++;return Response.json({id:'fictif'});}});assert.equal(r.ok,true);assert.equal(n,1);});
for(const [nom,response,nombre] of [['réponse perdue',()=>{throw new TypeError('coupure');},3],['erreur serveur',()=>Response.json({message:'indisponible'},{status:503}),3],['destinataire supprimé',()=>Response.json({name:'suppressed'},{status:422}),1],['domaine non validé',()=>Response.json({name:'validation_error'},{status:403}),1]])test(`${nom} : pas de deuxième fournisseur`,async()=>{let n=0;const r=await envoyerEmail(message,{env,fetcher:async()=>{n++;return response();}});assert.equal(r.ok,false);assert.equal(n,nombre);});
test('clé idempotente stable sur une reprise du même envoi',async()=>{const keys=[];for(let i=0;i<2;i++)await envoyerEmail(message,{env,fetcher:async(_u,o)=>{keys.push(o.headers['Idempotency-Key']);return Response.json({id:'fictif'});}});assert.equal(keys[0],keys[1]);});
test('Brevo seul configuré : pas de dépendance à une clé Resend',async()=>{let url;const r=await envoyerEmail(message,{env:{BREVO_API_KEY:'fictif',BREVO_FROM:env.BREVO_FROM},fetcher:async(u)=>{url=u;return Response.json({messageId:'fictif'},{status:201});}});assert.equal(r.ok,true);assert.match(url,/brevo/);});
test('adresse ou expéditeur invalide : aucun appel réseau',async()=>{let n=0;assert.equal((await envoyerEmail({...message,to:'invalide'},{env,fetcher:async()=>n++})).ok,false);assert.equal(n,0);assert.equal(expediteur('TAYRI\r\nBcc: autre@example.invalid'),null);assert.equal(emailConfigure({BREVO_API_KEY:'x'}),false);});
