import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ids} from './helpers/dating-fixture.mjs';
import {handleBal} from '../lib/bal.mjs';
test('no date-of-birth bypass, no forged administrator, no unpaid or suspended admission',async()=>{
 const f=fixture();
 assert.equal((await f.run('intruder',{action:'enter',email:'x',birth_date:'1990-01-01'})).status,401);
 assert.equal((await f.run('a',{action:'open',event_id:ids.event})).status,403);
 await f.run('admin',{action:'open',event_id:ids.event});
 f.tables.event_registrations[0].payment_status='pending';
 assert.equal((await f.run('a',{action:'enter'})).status,403);
 f.tables.event_registrations[0].payment_status='waived';
 f.tables.member_profiles[0].profile_status='suspended';
 assert.equal((await f.run('a',{action:'enter'})).status,403);
 assert.ok(!f.calls.some(c=>c.url.includes('generate_link')));
});

test('failed video revocation remains durable and retries after the doors are closed',async()=>{
 const f=fixture();
 await f.run('admin',{action:'open',event_id:ids.event});
 await f.run('admin',{action:'admit',user_id:ids.a});
 // Daily accepts at most 100 user IDs per request, including large multi-salon events.
 f.state().admitted.push(...Array.from({length:120},(_,i)=>'fixture-user-'+i));
 const request=new Request('https://fixture.invalid/api/bal',{method:'POST',headers:{authorization:'Bearer admin'},body:JSON.stringify({action:'close'})});
 await assert.rejects(handleBal(request,{env:f.env,now:f.now,fetcher:(url,init)=>url.endsWith('/eject')?Promise.resolve(Response.json({}, {status:503})):f.fetcher(url,init)}),/video_service_failed/);
 assert.equal(f.state().open,false);
 assert.ok(f.state().pending_ejections.length);
 const recovered=await f.run('admin',{action:'admin_state'});
 assert.equal(recovered.status,200);
 assert.equal(f.state().pending_ejections.length,0);
 const ejects=f.calls.filter(c=>c.url.endsWith('/eject'));
 assert.equal(ejects.length,2);
 assert.ok(ejects.every(c=>c.body.user_ids.length<=100));
 assert.equal((await f.run('a',{action:'join'})).status,409);
});
test('complete isolated rehearsal: waiting, admission, private rooms, automatic rounds, mutual consent and close',async()=>{
 const f=fixture();assert.equal((await f.run('admin',{action:'open',event_id:ids.event})).status,200);
 for(const u of ['a','b','c']) {
  assert.equal((await f.run(u,{action:'enter'})).status,200);
  assert.equal((await f.run(u,{action:'join'})).status,403);
  await f.run('admin',{action:'admit',user_id:ids[u]});
 }
 await f.run('a',{action:'join'});
 const lobbyToken=f.calls.filter(c=>c.url.includes('meeting-tokens')).at(-1).body.properties;
 assert.equal(lobbyToken.permissions.canSend,false);
 const first=await f.run('admin',{action:'round',minutes:2,max_rounds:2,automatic:true});
 assert.equal(first.body.state.round,1);
 assert.equal(first.body.state.last_round.pairs,1);
 assert.equal(first.body.state.last_round.waiting.length,1);
 const partner=f.state().assign[ids.a].partner_uid===ids.b?'b':'c';
 const room=f.state().assign[ids.a].room;
 await f.run('a',{action:'join',room:'someone-elses-room'});
 const meeting=f.calls.filter(c=>c.url.includes('meeting-tokens')).at(-1).body.properties;
 assert.equal(meeting.room_name,room);
 assert.equal(meeting.is_owner,false);
 assert.equal(meeting.eject_at_token_exp,true);
 assert.equal((await f.run('admin',{action:'admin_join',room})).status,403);
 await f.run('a',{action:'feedback',other_id:ids[partner],choice:'yes',contact_consent:true});
 assert.deepEqual((await f.run(partner,{action:'state'})).body.mutual,[]);
 await f.run(partner,{action:'feedback',other_id:ids.a,choice:'yes'});
 const mutual=(await f.run('a',{action:'state'})).body;
 assert.equal(mutual.mutual.length,1);
 assert.equal(JSON.stringify(mutual).includes('@'),false);
 let admin=(await f.run('admin',{action:'admin_state'})).body;
 assert.equal(admin.mutual[0][0].email,undefined);
 await f.run(partner,{action:'feedback',other_id:ids.a,choice:'yes',contact_consent:true});
 admin=(await f.run('admin',{action:'admin_state'})).body;
 assert.equal(admin.mutual[0][0].email,'consented@example.invalid');
 f.advance(166000);
 for(const u of ['a','b','c'])await f.run(u,{action:'enter'}); // renewed presence
 const responses=await Promise.all(['a','b','c'].map(u=>f.run(u,{action:'state'})));
 assert.equal(f.state().round,2);
 assert.equal(f.state().history.length,2);
 assert.ok(responses.every(r=>r.status===200));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/rooms')&&c.body.properties.max_participants===2).length,2);
 await f.run('admin',{action:'close'});
 assert.equal((await f.run('a',{action:'state'})).status,409);
 assert.ok(f.calls.some(c=>c.url.endsWith('/eject')&&c.body.ban===true));
});
test('blocking is bilateral; excludes a partner, hides reciprocal interest and ejects the conversation',async()=>{
 const f=fixture();await f.run('admin',{action:'open',event_id:ids.event});
 for(const u of ['a','b']){await f.run(u,{action:'enter'});await f.run('admin',{action:'admit',user_id:ids[u]});}
 await f.run('admin',{action:'round',minutes:2});
 await f.run('a',{action:'block',other_id:ids.b});
 assert.equal((await f.run('b',{action:'state'})).body.where,'grand');
 assert.equal((await f.run('a',{action:'feedback',other_id:ids.b,choice:'yes'})).status,400);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/eject')).length,1);
 assert.equal((await f.run('a',{action:'feedback',other_id:ids.c,choice:'yes'})).status,400);
 await f.run('admin',{action:'exclude',user_id:ids.b});
 assert.equal((await f.run('b',{action:'join'})).status,403);
});
