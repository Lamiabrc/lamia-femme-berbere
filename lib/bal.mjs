// Session-authenticated speed dating; all private state is read/written server-side.
import { randomBytes } from 'node:crypto';
import { DATABASE_URL, json, serviceHeaders, userFromRequest, isAdmin } from './event-tickets.mjs';
import { ageOn } from './event-register.mjs';
import { pairRound, pairKey } from './dating-pairs.mjs';
export { pairRound } from './dating-pairs.mjs';
const UUID=/^[0-9a-f-]{36}$/i;
const clean=(s,n=120)=>String(s||'').trim().slice(0,n);
const memberActions=new Set(['enter','state','join','feedback','block']);
export async function handleBal(request,{env=process.env,fetcher=fetch,now=()=>new Date()}={}) {
 if(request.method!=='POST') return json({error:'method_not_allowed'},405);
 if(!(env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY)) return json({error:'not_configured'},503);
 const user=await userFromRequest(request,{fetcher});
 if(!user) return json({error:'login_required'},401);
 if(!user.email_confirmed_at) return json({error:'email_not_confirmed'},403);
 let b; try { b=await request.json(); } catch { return json({error:'bad_request'},400); }
 const action=clean(b.action,30), t=now().getTime();
 const call=(path,init={})=>fetcher(DATABASE_URL+'/rest/v1/'+path,{...init,headers:serviceHeaders(env,init.headers),signal:AbortSignal.timeout(10000)});
 const read=async path=>{const r=await call(path);if(!r.ok) throw new Error('database_read_failed');return r.json();};
 const write=async (path,body,method='POST')=>{
   const r=await call(path,{method,headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
   if(!r.ok) throw new Error('database_write_failed');
 };
 const daily=async(path,body)=>{
   if(!env.DAILY_API_KEY) throw new Error('video_not_configured');
   const r=await fetcher('https://api.daily.co/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.DAILY_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
   if(!r.ok) throw new Error('video_service_failed');
   return r.json();
 };
 let state=(await read('platform_settings?key=eq.bal_state&select=value'))[0]?.value||null;
 const save=async next=>{
   const r=await call('rpc/save_dating_state',{method:'POST',body:JSON.stringify({p_expected:state,p_next:next})});
   if(!r.ok) throw new Error('state_write_failed');
   if(!(await r.json())) {const e=new Error('state_changed'); e.status=409; throw e;}
   state=next;
 };
 const room=async(name,max,expiry)=>daily('/rooms',{name,privacy:'private',properties:{exp:Math.floor(expiry/1000),max_participants:max,enable_chat:false,eject_at_room_exp:true,enable_prejoin_ui:false}});
 const token=async props=>(await daily('/meeting-tokens',{properties:props})).token;
 const events=()=>Object.keys(state?.soiree?.events||{});
 const roster=async()=>{
   const ids=events(); if(!ids.length)return [];
   const regs=await read('event_registrations?event_id=in.('+ids.join(',')+')&attendance_status=in.(registered,checked_in,attended)&payment_status=in.(paid,waived)&select=user_id,event_id');
   if(!regs.length)return [];
   const uids=[...new Set(regs.map(r=>r.user_id))].join(',');
   const [profiles,prefs]=await Promise.all([
     read('member_profiles?user_id=in.('+uids+')&select=user_id,display_name,gender,birth_date,profile_status'),
     read('dating_preferences?user_id=in.('+uids+')&select=*')
   ]);
   return regs.flatMap(r=>{
     const p=profiles.find(p=>p.user_id===r.user_id), pref=prefs.find(p=>p.user_id===r.user_id);
     if(!p||!pref||['suspended','paused'].includes(p.profile_status)||ageOn(p.birth_date,now())<18||state.excluded?.includes(r.user_id))return [];
     return [{uid:r.user_id,ev:r.event_id,name:p.display_name||'Membre',gender:p.gender,age:ageOn(p.birth_date,state.soiree.starts_at),...pref}];
   });
 };
 const blocked=async()=> (await read('dating_blocks?select=user_id,other_id')).map(x=>pairKey(x.user_id,x.other_id));
 const presence=async()=> {
   const since=new Date(t-45000).toISOString();
   return read('dating_presence?session=eq.'+state.session+'&last_seen=gte.'+encodeURIComponent(since)+'&select=user_id');
 };
 const endRooms=async(rooms,users)=>{
   const ids=[...new Set(users)];
   await Promise.all([...new Set(rooms)].flatMap(name=>{
     const requests=[];
     for(let i=0;i<ids.length;i+=100)requests.push(daily('/rooms/'+encodeURIComponent(name)+'/eject',{user_ids:ids.slice(i,i+100),ban:true}));
     return requests;
   }));
 };
 // Save revocations with the state change so a provider outage cannot lose them.
 const revocations=(rooms,users)=>[...new Set(rooms)].map(room=>({room,users:[...new Set(users)],expires_at:state.expires_at}));
 const drainRevocations=async()=>{
   const pending=state?.pending_ejections||[];
   if(!pending.length)return;
   for(const job of pending)if(t<Date.parse(job.expires_at))await endRooms([job.room],job.users);
   await save({...state,pending_ejections:[]});
 };
 await drainRevocations();
 const buildRound=async({minutes=state.minutes||6,maxRounds=state.max_rounds||8,automatic=state.automatic}={})=>{
   if(state.phase==='tour'&&t<Date.parse(state.ends_at)) return false;
   const [all,here,blocks]=await Promise.all([roster(),presence(),blocked()]);
   const active=new Set(here.map(x=>x.user_id));
   const present=all.filter(p=>active.has(p.uid)&&state.admitted?.includes(p.uid));
   const {pairs,waiting}=pairRound(present,state.history||[],blocks);
   if((state.round||0)>=maxRounds||!pairs.length) {
     await save({...state,phase:'fin',automatic:false,assign:{},ends_at:null});return true;
   }
   const round=(state.round||0)+1, suffix=randomBytes(4).toString('hex');
   const ends=new Date(t+minutes*60000+15000).toISOString();
   const made=await Promise.all(pairs.map((_,i)=>room('bal-'+state.session+'-r'+round+'-'+suffix+'-'+i,2,Date.parse(ends))));
   const next=structuredClone(state);
   next.assign={}; next.met ||= {}; next.history ||= [];
   pairs.forEach(([a,c],i)=>{
     const r=made[i];
     for(const [x,y] of [[a,c],[c,a]]) {
       next.assign[x.uid]={room:r.name,url:r.url,partner:y.name,partner_uid:y.uid,ends_at:ends};
       next.met[x.uid]=[...(next.met[x.uid]||[]),{uid:y.uid,name:y.name,round}];
     }
     next.history.push(pairKey(a.uid,c.uid));
   });
   Object.assign(next,{phase:'tour',round,ends_at:ends,minutes,max_rounds:maxRounds,automatic,last_round:{pairs:pairs.length,waiting:waiting.map(p=>p.name)}});
   await save(next);return true;
 };

 const nextRound=async options=>{
   const token=randomBytes(16).toString('hex');
   const r=await call('rpc/claim_dating_round',{method:'POST',body:JSON.stringify({p_token:token})});
   if(!r.ok)throw new Error('round_lock_failed');
   if(!await r.json())return false;
   try {
     const current=(await read('platform_settings?key=eq.bal_state&select=value'))[0]?.value;
     if(!current?.open||current.session!==state.session)return false;
     state=current;
     if(action==='state'&&(!state.automatic||state.phase!=='tour'||t<Date.parse(state.ends_at)+30000))return false;
     return await buildRound(options);
   } finally {
     await call('rpc/release_dating_round',{method:'POST',body:JSON.stringify({p_token:token})});
   }
 };

 if(memberActions.has(action)) {
   if(!state?.open || t>=Date.parse(state.expires_at))return json({error:'bal_closed'},409);
   const ids=events();
   const regs=await read('event_registrations?user_id=eq.'+user.id+'&event_id=in.('+ids.join(',')+')&attendance_status=in.(registered,checked_in,attended)&payment_status=in.(paid,waived)&select=event_id');
   const prof=(await read('member_profiles?user_id=eq.'+user.id+'&select=display_name,birth_date,gender,profile_status'))[0];
   if(!regs.length||!prof||['suspended','paused'].includes(prof.profile_status)||state.excluded?.includes(user.id)||!prof.birth_date||ageOn(prof.birth_date,now())<18)return json({error:'not_registered'},403);
   const prefs=(await read('dating_preferences?user_id=eq.'+user.id+'&select=*'))[0];
   if(!prefs)return json({error:'preferences_required'},409);
   await write('dating_presence?on_conflict=session,user_id',{session:state.session,user_id:user.id,last_seen:now().toISOString()});
   if(action==='enter')return json({name:prof.display_name,salon:state.soiree.events[regs[0].event_id],session:state.session});
   if(state.automatic&&state.phase==='tour'&&t>=Date.parse(state.ends_at)+30000) {
     try {await nextRound();} catch(e) {if(e.status!==409)throw e;state=(await read('platform_settings?key=eq.bal_state&select=value'))[0]?.value;}
   }
   if(!state?.open||state.excluded?.includes(user.id))return json({error:'bal_closed'},409);
   const bans=await blocked();
   let a=state.assign?.[user.id];
   const rawAssignment=a;
   if(a&&(bans.includes(pairKey(user.id,a.partner_uid))||state.excluded?.includes(a.partner_uid)))a=null;
   const admitted=state.admitted?.includes(user.id);
   const inTat=admitted&&state.phase==='tour'&&a&&Date.parse(a.ends_at)>t;
   const key=!admitted?'waiting':inTat?'tat:'+a.room:'grand:'+state.grand.name;
   if(action==='state') {
     const choices=await read('dating_feedback?session=eq.'+state.session+'&select=user_id,other_id,choice,contact_consent');
     const mine=choices.filter(x=>x.user_id===user.id);
     const mutual=mine.filter(x=>x.choice==='yes'&&!bans.includes(pairKey(user.id,x.other_id))&&choices.some(y=>y.user_id===x.other_id&&y.other_id===user.id&&y.choice==='yes'));
     return json({session:state.session,phase:state.phase,round:state.round||0,where:!admitted?'admission':inTat?'tat':'grand',key,
       ends_at:inTat?a.ends_at:null,partner:inTat?a.partner:null,partner_uid:inTat?a.partner_uid:null,
       met:(state.met?.[user.id]||[]).filter(m=>!inTat||m.uid!==a.partner_uid),
       choices:mine,mutual:mutual.map(x=>({uid:x.other_id,name:state.met?.[user.id]?.find(m=>m.uid===x.other_id)?.name||'Membre',contact_consent:x.contact_consent})),server_time:now().toISOString()});
   }
   if(action==='join') {
     if(!admitted)return json({error:'awaiting_admission'},403);
     if(!env.DAILY_API_KEY)return json({error:'video_not_configured'},503);
     const r=inTat?{name:a.room,url:a.url}:state.grand;
     const exp=Math.floor((inTat?Date.parse(a.ends_at):Date.parse(state.expires_at))/1000);
     const tok=await token({room_name:r.name,user_id:user.id,user_name:prof.display_name,exp,eject_at_token_exp:true,is_owner:false,enable_screenshare:false,
       permissions:{canSend:inTat?['audio','video']:false,canAdmin:false}});
     return json({url:r.url,token:tok,key});
   }
   const other=clean(b.other_id,36), met=state.met?.[user.id]||[];
   if(!UUID.test(other)||!met.some(m=>m.uid===other))return json({error:'unknown_partner'},400);
   if(action==='block') {
     await write('dating_blocks?on_conflict=user_id,other_id',{user_id:user.id,other_id:other});
     if(rawAssignment?.partner_uid===other) {
       await save({...state,pending_ejections:revocations([rawAssignment.room],[user.id,other])});
       await drainRevocations();
     }
     return json({ok:true});
   }
   if(!['yes','no','skip'].includes(b.choice)||bans.includes(pairKey(user.id,other)))return json({error:'bad_request'},400);
   await write('dating_feedback?on_conflict=session,user_id,other_id',{session:state.session,user_id:user.id,other_id:other,choice:b.choice,contact_consent:b.choice==='yes'&&b.contact_consent===true});
   return json({ok:true});
 }

 if(!isAdmin(user))return json({error:'forbidden'},403);
 if(action==='open') {
   if(state?.open)return json({error:'already_open'},409);
   const id=clean(b.event_id,36);if(!UUID.test(id))return json({error:'bad_request'},400);
   const ev=(await read('speed_dating_events?id=eq.'+id+'&select=*'))[0];
   if(!ev||!['published','sold_out'].includes(ev.status)||Date.parse(ev.ends_at)<=t)return json({error:'event_unavailable'},409);
   const siblings=await read('speed_dating_events?title=eq.'+encodeURIComponent(ev.title)+'&starts_at=eq.'+encodeURIComponent(ev.starts_at)+'&status=in.(published,sold_out)&select=id,audience');
   const session=randomBytes(12).toString('hex'), expiry=Math.min(t+4*3600000,Date.parse(ev.ends_at)+3600000);
   const grand=await room('bal-'+session+'-grand',300,expiry);
   await save({open:true,session,phase:'accueil',soiree:{title:ev.title,starts_at:ev.starts_at,events:Object.fromEntries(siblings.map(x=>[x.id,x.audience]))},
     grand:{name:grand.name,url:grand.url},round:0,assign:{},met:{},history:[],admitted:[],excluded:[],automatic:false,expires_at:new Date(expiry).toISOString()});
 } else if(action==='admit'||action==='exclude') {
   if(!state?.open)return json({error:'bal_closed'},409);
   const uid=clean(b.user_id,36);if(!UUID.test(uid)||!(await roster()).some(p=>p.uid===uid))return json({error:'bad_request'},400);
   if(action==='admit')await save({...state,admitted:[...new Set([...(state.admitted||[]),uid])]});
   else {
     const rooms=[state.grand.name,...Object.values(state.assign).map(a=>a.room)];
     await save({...state,excluded:[...new Set([...(state.excluded||[]),uid])],pending_ejections:revocations(rooms,[uid])});
     await drainRevocations();
   }
 } else if(action==='round') {
   if(!state?.open)return json({error:'bal_closed'},409);
   const minutes=Number(b.minutes||6),maxRounds=Number(b.max_rounds||8);
   if(!Number.isInteger(minutes)||minutes<2||minutes>15||!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>20)return json({error:'bad_request'},400);
   if(!await nextRound({minutes,maxRounds,automatic:b.automatic===true}))return json({error:'round_running'},409);
 } else if(['grand','fin','close'].includes(action)) {
   if(!state?.open)return json({error:'bal_closed'},409);
   const assignments=Object.values(state.assign||{});
   const next={...state,phase:action==='fin'?'fin':action==='close'?'ferme':'accueil',automatic:false,assign:{},ends_at:null,open:action!=='close'};
   const rooms=[...new Set(assignments.map(a=>a.room))];
   if(action==='close')rooms.push(state.grand.name);
   await save({...next,pending_ejections:revocations(rooms,[...state.admitted,user.id])});
   await drainRevocations();
 } else if(action==='admin_join') {
   if(!state?.open)return json({error:'bal_closed'},409);
   // Administrators may host the lobby, never silently join a private pair.
   if(b.room&&b.room!==state.grand.name)return json({error:'private_conversation'},403);
   const tok=await token({room_name:state.grand.name,user_id:user.id,user_name:'Lamia',is_owner:true,exp:Math.floor(Date.parse(state.expires_at)/1000),eject_at_token_exp:true});
   return json({url:state.grand.url+'?t='+encodeURIComponent(tok)});
 } else if(action!=='admin_state')return json({error:'bad_request'},400);
 if(!state)return json({state:null,video:Boolean(env.DAILY_API_KEY)});
 const [all,here,feedback,blocks]=await Promise.all([roster(),presence(),read('dating_feedback?session=eq.'+state.session+'&select=*'),blocked()]);
 const people=all.map(p=>({uid:p.uid,name:p.name,salon:state.soiree.events[p.ev],present:here.some(x=>x.user_id===p.uid),admitted:state.admitted?.includes(p.uid)}));
 const mutual=feedback.filter(a=>a.choice==='yes'&&all.some(p=>p.uid===a.user_id)&&all.some(p=>p.uid===a.other_id)&&a.user_id<a.other_id&&!blocks.includes(pairKey(a.user_id,a.other_id))&&feedback.some(b=>b.user_id===a.other_id&&b.other_id===a.user_id&&b.choice==='yes'));
 const result=[];
 for(const a of mutual) {
   const b=feedback.find(b=>b.user_id===a.other_id&&b.other_id===a.user_id);
   const pair=[a.user_id,a.other_id].map(uid=>({uid,name:all.find(p=>p.uid===uid)?.name||'Membre'}));
   if(a.contact_consent&&b.contact_consent)for(const p of pair) {
     const r=await fetcher(DATABASE_URL+'/auth/v1/admin/users/'+p.uid,{headers:serviceHeaders(env),signal:AbortSignal.timeout(8000)});
     if(r.ok)p.email=(await r.json()).email;
   }
   result.push(pair);
 }
 return json({video:Boolean(env.DAILY_API_KEY),state,people,present:people.filter(p=>p.present).length,
   salons:events().map(id=>({id,label:state.soiree.events[id],inscrits:all.filter(p=>p.ev===id).length,presents:all.filter(p=>p.ev===id&&here.some(h=>h.user_id===p.uid)).length})),
   tat:[...new Set(Object.values(state.assign||{}).map(a=>a.room))].map(room=>({room})),mutual:result,wishes_count:new Set(feedback.map(x=>x.user_id)).size});
}
