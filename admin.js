import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const supabase=createClient('https://tybwvxinigahhntfeeur.supabase.co','sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc');
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
let rows=[],filter='all';
async function boot(){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)return;
 const role=session.user.app_metadata?.role;
 if(role!=='admin'){ $('#loginStatus').textContent="Ce compte n'a pas le rôle administratrice."; return; }
 $('#loginBox').classList.add('hidden');$('#dashboard').classList.remove('hidden');await load();
}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error){$('#loginStatus').textContent=error.message;return;}await boot();});
$('#logout').addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});
document.querySelectorAll('[data-sev]').forEach(b=>b.onclick=()=>{filter=b.dataset.sev;document.querySelectorAll('[data-sev]').forEach(x=>x.classList.toggle('active',x===b));render();});
async function load(){
 const {data,error}=await supabase.from('safety_reports').select('id,reported_label,reason,severity,written_details,status,created_at').order('created_at',{ascending:false});
 if(error){$('#alerts').innerHTML='<div class="empty">Impossible de charger les alertes.</div>';return;}
 rows=data||[];render();
}
function labelReason(r){return({not_marriage:'Ne cherche pas réellement le mariage',fake_profile:'Faux profil / identité douteuse',already_partnered:'Déjà marié(e) / en couple',pressure:'Insistance, pression ou propos déplacés',scam:'Arnaque ou demande d’argent',danger:'Menace, harcèlement ou danger',other:'Autre'})[r]||r}
function render(){
 const list=filter==='all'?rows:rows.filter(x=>x.severity===filter);
 $('#alerts').innerHTML=list.length?list.map(r=>`<article class="alert-card ${esc(r.severity)}"><div><div class="meta"><span class="badge">${esc(r.severity.toUpperCase())}</span><span>${new Date(r.created_at).toLocaleString('fr-FR')}</span><span>Statut : ${esc(r.status)}</span></div><h3>${esc(r.reported_label||'Profil signalé')}</h3><strong>${esc(labelReason(r.reason))}</strong><p class="details">${esc(r.written_details||'Aucun détail écrit fourni.')}</p></div><div class="actions"><button class="soft" data-status="reviewing" data-id="${r.id}">Examiner</button><button class="soft" data-status="needs_info" data-id="${r.id}">Demander précisions</button><button class="soft" data-status="watch" data-id="${r.id}">À surveiller</button><button class="soft" data-status="resolved" data-id="${r.id}">Résolu</button></div></article>`).join(''):'<div class="empty">Aucune alerte dans cette catégorie.</div>';
 document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>setStatus(b.dataset.id,b.dataset.status));
}
async function setStatus(id,status){const {error}=await supabase.from('safety_reports').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(!error){const x=rows.find(r=>r.id===id);if(x)x.status=status;render();}}
boot();