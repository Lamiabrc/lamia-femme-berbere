import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

const SUPABASE_URL='https://tybwvxinigahhntfeeur.supabase.co';
const SUPABASE_KEY='sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const money=c=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format((c||0)/100);
let session=null,mediaRecorder=null,audioChunks=[],audioBlob=null;

function show(el){el?.classList.add('show')}
function hide(el){el?.classList.remove('show')}
function toast(msg){const t=$('#softToast');if(!t)return alert(msg);t.textContent=msg;show(t);setTimeout(()=>hide(t),3600)}

async function refreshSession(){
  const {data}=await supabase.auth.getSession(); session=data.session;
  const b=$('#memberButton'); if(b)b.textContent=session?'Mon espace':'Espace membre';
  if(session){await loadProfile();await loadMatches();}
}
supabase.auth.onAuthStateChange(async()=>{await refreshSession()});

function openMember(){show($('#memberModal'));document.body.classList.add('modal-open')}
function closeMember(){hide($('#memberModal'));document.body.classList.remove('modal-open')}
$('#memberButton')?.addEventListener('click',openMember);
$('#closeMember')?.addEventListener('click',closeMember);
$('#memberModal')?.addEventListener('click',e=>{if(e.target.id==='memberModal')closeMember()});

$('#signupForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const email=f.get('email'),password=f.get('password');
  const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
  if(error)return toast(error.message);
  toast('Compte créé. Vérifie ton email puis connecte-toi pour compléter ton profil.');
  e.target.reset();
});
$('#loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const f=new FormData(e.target);
  const {error}=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
  if(error)return toast(error.message); toast('Bienvenue dans ton espace Lamia.');
});
$('#logoutBtn')?.addEventListener('click',async()=>{await supabase.auth.signOut();toast('Déconnecté.');});

async function loadProfile(){
  if(!session)return;
  const uid=session.user.id;
  const {data:p}=await supabase.from('member_profiles').select('*').eq('user_id',uid).maybeSingle();
  const {data:socials}=await supabase.from('social_accounts').select('*').eq('user_id',uid);
  const form=$('#profileForm'); if(!form)return;
  form.hidden=false; $('#authForms').hidden=true; $('#logoutBtn').hidden=false;
  for(const k of ['display_name','real_first_name','birth_date','city','region','country','profession','bio','marriage_horizon']){
    if(form.elements[k])form.elements[k].value=p?.[k]||'';
  }
  if(form.elements.marriage_intent)form.elements.marriage_intent.checked=p?.marriage_intent!==false;
  if(form.elements.marketing_email_consent)form.elements.marketing_email_consent.checked=!!p?.marketing_email_consent;
  if(form.elements.preferred_social_network)form.elements.preferred_social_network.value=p?.preferred_social_network||'tiktok';
  const primary=(socials||[]).find(x=>x.is_primary)||(socials||[])[0];
  if(form.elements.social_handle)form.elements.social_handle.value=primary?.handle_or_url||'';
  $('#memberEmail').textContent=session.user.email||'';
}
$('#profileForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); if(!session)return openMember();
  const f=new FormData(e.target),uid=session.user.id;
  const payload={
    user_id:uid,display_name:f.get('display_name'),real_first_name:f.get('real_first_name'),
    birth_date:f.get('birth_date')||null,city:f.get('city'),region:f.get('region'),country:f.get('country')||'France',
    profession:f.get('profession'),bio:f.get('bio'),marriage_horizon:f.get('marriage_horizon'),
    marriage_intent:f.get('marriage_intent')==='on',preferred_social_network:f.get('preferred_social_network'),
    marketing_email_consent:f.get('marketing_email_consent')==='on',profile_status:'active',
    community_rules_accepted_at:new Date().toISOString(),updated_at:new Date().toISOString()
  };
  const {error}=await supabase.from('member_profiles').upsert(payload,{onConflict:'user_id'});
  if(error)return toast(error.message);
  const handle=f.get('social_handle');
  if(handle){
    await supabase.from('social_accounts').upsert({user_id:uid,network:f.get('preferred_social_network'),handle_or_url:handle,is_primary:true},{onConflict:'user_id,network'});
  }
  toast('Profil enregistré.');
});

async function loadEvents(){
  const box=$('#eventGrid'); if(!box)return;
  const {data,error}=await supabase.from('speed_dating_events').select('*').in('status',['published','sold_out']).order('starts_at');
  if(error||!data?.length){box.innerHTML='<article class="event-card"><p class="eyebrow">Bientôt</p><h3>Les prochaines soirées arrivent</h3><p>Crée ton espace membre pour être prévenu(e).</p></article>';return}
  box.innerHTML=data.map(ev=>`<article class="event-card">
    <div class="event-date">${new Date(ev.starts_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}</div>
    <p class="eyebrow">Speed Dating Virtuel</p><h3>${esc(ev.title)}</h3>
    <p>${esc(ev.description||'')}</p><div class="event-meta"><span>${ev.min_age||18}–${ev.max_age||'+'} ans</span><span>${money(ev.ticket_price_cents)}</span><span>${ev.capacity} places</span></div>
    <button class="btn soft reserve-event" data-event="${ev.id}" ${ev.status==='sold_out'?'disabled':''}>Réserver ma place</button>
  </article>`).join('');
  document.querySelectorAll('.reserve-event').forEach(b=>b.onclick=()=>reserveEvent(b.dataset.event));
}
async function reserveEvent(eventId){
  if(!session){openMember();return toast('Connecte-toi pour réserver ta place.')}
  const {error}=await supabase.from('event_registrations').upsert({event_id:eventId,user_id:session.user.id,payment_status:'pending',attendance_status:'registered'},{onConflict:'event_id,user_id'});
  if(error)return toast(error.message);
  toast('Place pré-réservée. Le paiement sécurisé sera activé avec Stripe Lamia.');
}
$('#monthlyPassBtn')?.addEventListener('click',()=>{if(!session)openMember();toast('Pass Rencontre préparé à 19 €/mois. Paiement Stripe à connecter.');});

async function loadMatches(){
  const box=$('#matchStatus');if(!box||!session)return;
  const {data}=await supabase.from('matches').select('id,compatibility_score,status,source,created_at').order('created_at',{ascending:false});
  box.innerHTML=data?.length?data.map(m=>`<div class="mini-match"><strong>${m.compatibility_score??'—'}%</strong><span>${esc(m.status)} · ${esc(m.source)}</span></div>`).join(''):'<p>Aucun match actif pour le moment. Ton profil servira au matching et aux speed datings.</p>';
}

function openReport(){if(!session){openMember();return toast('Connecte-toi pour envoyer une alerte sécurisée à Lamia.')}show($('#reportModal'))}
$('#openReport')?.addEventListener('click',openReport);
$('#closeReport')?.addEventListener('click',()=>hide($('#reportModal')));
$('#reportModal')?.addEventListener('click',e=>{if(e.target.id==='reportModal')hide(e.target)});

$('#startAudio')?.addEventListener('click',async()=>{
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    audioChunks=[]; mediaRecorder=new MediaRecorder(stream);
    mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);
    mediaRecorder.onstop=()=>{audioBlob=new Blob(audioChunks,{type:'audio/webm'});$('#audioState').textContent='Audio prêt à être envoyé à Lamia.';stream.getTracks().forEach(t=>t.stop())};
    mediaRecorder.start();$('#audioState').textContent='Enregistrement en cours…';
  }catch{toast("Impossible d'accéder au micro.");}
});
$('#stopAudio')?.addEventListener('click',()=>{if(mediaRecorder?.state==='recording')mediaRecorder.stop()});

$('#reportForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); if(!session)return openMember();
  const f=new FormData(e.target);
  const reason=f.get('reason'),severity=reason==='danger'?'red':reason==='not_marriage'?'yellow':'orange';
  const {data:report,error}=await supabase.from('safety_reports').insert({
    reporter_user_id:session.user.id,reported_label:f.get('reported_label'),reason,severity,
    written_details:f.get('written_details'),wants_follow_up:true
  }).select('id').single();
  if(error)return toast(error.message);
  if(audioBlob){
    const path=`${session.user.id}/${report.id}/${Date.now()}.webm`;
    const up=await supabase.storage.from('safety-evidence').upload(path,audioBlob,{contentType:'audio/webm'});
    if(!up.error)await supabase.from('report_evidence').insert({report_id:report.id,uploader_user_id:session.user.id,evidence_type:'audio',storage_path:path});
  }
  toast('Alerte transmise à Lamia de façon confidentielle.');
  e.target.reset();audioBlob=null;$('#audioState').textContent='';hide($('#reportModal'));
});

async function loadSocials(){
  const {data}=await supabase.from('platform_settings').select('key,value').in('key',['social_links','matching']);
  const map=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));
  document.querySelectorAll('[data-social-link]').forEach(a=>{const u=map.social_links?.[a.dataset.socialLink];if(u){a.href=u;a.classList.remove('disabled')}else{a.removeAttribute('href');a.classList.add('disabled');a.title='Lien à renseigner';}});
  const m=$('#matchingLink');if(m&&map.matching?.url){m.href=map.matching.url;m.classList.remove('disabled')}
}

if(window.matchMedia('(pointer:fine)').matches){
  const c=$('#lfbCursor');let x=0,y=0,tx=0,ty=0;
  window.addEventListener('mousemove',e=>{tx=e.clientX;ty=e.clientY});
  const loop=()=>{x+=(tx-x)*.18;y+=(ty-y)*.18;c.style.transform=`translate3d(${x}px,${y}px,0)`;requestAnimationFrame(loop)};loop();
}

await refreshSession(); await Promise.all([loadEvents(),loadSocials()]);
