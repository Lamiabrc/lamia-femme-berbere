import { DATABASE_URL, PUBLIC_KEY } from "/assets/supabase-config.js";
// La salle du Bal masqué de Venise, côté participant.
// Vidéo : Daily (mode « call object ») ; l'interface est celle de la Maison.
// Le serveur décide où chacun doit être (grand salon, tête-à-tête, attente, fin du bal).

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const supabase = createClient(DATABASE_URL, PUBLIC_KEY);
import Daily from 'https://cdn.jsdelivr.net/npm/@daily-co/daily-js@0.89.1/+esm';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
let me = null;
let call = null, roomKey = null, state = null, offset = 0, poll = 0, clock = 0, joining = false, polling = false;
async function api(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch('/api/bal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function show(step) {
  for (const el of document.querySelectorAll('[data-step]')) el.hidden = el.dataset.step !== step;
}

// ---------------------------------------------------------------- 1. l'entrée
const ERR = {
 bal_closed: 'Les portes ne sont pas ouvertes. Reviens quelques minutes avant la soirée.',
 not_registered: 'Aucune inscription confirmée disponible pour ce compte. Vérifie Mon espace.',
 preferences_required: 'Complète tes préférences en reprenant le formulaire d’inscription à la soirée.',
 login_required: 'Connecte-toi grâce au lien reçu par email.',
 email_not_confirmed: 'Vérifie ton adresse email avant de continuer.'
};
$('[data-bal-entree]')?.addEventListener('submit', async e => {
 e.preventDefault();
 const f = new FormData(e.target), st = $('[data-entree-status]'), btn = $('[type=submit]',e.target);
 btn.disabled = true;
 try {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
   const { error } = await supabase.auth.signInWithOtp({email:f.get('email'),options:{shouldCreateUser:false,emailRedirectTo:location.origin+'/speed-dating/bal/'}});
   st.textContent = error ? 'Le lien n’a pas pu être envoyé. Réessaie plus tard ou connecte-toi dans Mon espace.' : 'Si ce compte existe, ouvre le lien reçu par email, puis pousse la porte.';
   return;
  }
  const {ok,data} = await api({action:'enter'});
  if (!ok) { st.textContent = ERR[data.error] || 'Entrée indisponible. Réessaie dans un instant.'; return; }
  me = data; await pret();
 } catch { st.textContent = 'La connexion a échoué. Réessaie.'; }
 finally {btn.disabled = false;}
});

// ---------------------------------------------------------------- 2. devant la porte : aperçu caméra
let preview = null;
async function pret() {
  show('pret');
  $('[data-pret-nom]').textContent = me.name;
  $('[data-pret-salon]').textContent = me.salon ? `Salon ${me.salon}` : '';
  try {
    preview = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $('[data-pret-video]').srcObject = preview;
    $('[data-pret-msg]').textContent = 'On te voit. Ajuste ton masque, puis entre au bal.';
  } catch {
    $('[data-pret-msg]').textContent = 'Ta caméra ou ton micro est bloqué. Autorise-les (cadenas à côté de l’adresse du site), puis recharge la page.';
  }
}
$('[data-entrer]')?.addEventListener('click', async () => {
  preview?.getTracks().forEach((t) => t.stop());
  show('salle');
  call = Daily.createCallObject({ subscribeToTracksAutomatically: false, dailyConfig: { useDevicePreferenceCookies: true } });
  for (const ev of ['participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped', 'joined-meeting']) call.on(ev, render);
  call.on('left-meeting', () => { roomKey = null; });
  call.on('error', () => message('La connexion vidéo s’est interrompue. Nous te reconnectons…'));
  await tick();
  poll = setInterval(tick, 4000);
  clock = setInterval(countdown, 500);
});
$('[data-sortir]')?.addEventListener('click', async () => { preview?.getTracks().forEach(t=>t.stop()); await supabase.auth.signOut(); location.reload(); });

// ---------------------------------------------------------------- 3. dans la salle
async function tick() {
  if(polling) return; polling = true;
  try {
  const { ok, status, data } = await api({ action: 'state' }).catch(() => ({ ok: false }));
  if (!ok) {
    if (status === 401 || status === 403) { await call?.leave().catch(()=>{}); clearInterval(poll); show('entree'); return; }
    if (data?.error === 'bal_closed') { await call?.leave().catch(() => {}); clearInterval(poll); show('ferme'); return; }
    return;
  }
  state = data;
  offset = Date.parse(data.server_time) - Date.now();
  if(data.where === 'admission') { if(roomKey) await call?.leave(); roomKey=null; }
  else if (data.key !== roomKey && !joining) await rejoindre(data.key);
  decor();
  render();
  } finally {polling=false;}
}

async function rejoindre(key) {
  joining = true;
  try {
    const { ok, data } = await api({ action: 'join' });
    if (!ok) { message('La salle ne s’ouvre pas encore. Nouvel essai dans quelques secondes…'); return; }
    if (call.meetingState() === 'joined-meeting') await call.leave();
    await call.join({ url: data.url, token: data.token, startVideoOff: false, startAudioOff: false });
    roomKey = data.key;
    if (state?.where === 'tat') carillon();
  } catch { message('La connexion à la salle a échoué. Nouvel essai…'); }
  finally { joining = false; }
}

function message(t) { $('[data-salle-msg]').textContent = t; }

function decor() {
  const s = state, salle = $('[data-salle]');
  $('[data-micro]').disabled = s.where !== 'tat';
  $('[data-camera]').disabled = s.where !== 'tat';
  salle.dataset.where = s.where;
  salle.dataset.phase = s.phase;
  const titres = {
    accueil: ['Le grand salon', 'Lamia ouvre le bal. Garde ton masque, les tête-à-tête commencent bientôt.'],
    tat: [`Tête-à-tête avec ${s.partner || 'ton cavalier'}`, 'Présente-toi, souris, pose une vraie question. La cloche sonnera à la fin.'],
    attente: ['Le grand salon', 'Pas de tête-à-tête pour toi à ce tour : reste au salon, ton tour arrive.'],
    fin: ['La fin du bal', 'Merci pour cette soirée. Indique en privé qui tu aimerais revoir.'],
  };
  const [titre, texte] = s.phase === 'fin' ? titres.fin : titres[s.where] || titres.accueil;
  $('[data-salle-titre]').textContent = titre;
  message(texte);
  $('[data-salle-tour]').textContent = s.round ? `Tour ${s.round}` : '';
  if(s.where === 'admission') { $('[data-salle-titre]').textContent='Salle d’attente'; message('Lamia vérifie les présences et va te laisser entrer.'); }
  $('[data-block]').hidden = s.where !== 'tat';
  const souhaits = $('[data-souhaits]');
  souhaits.hidden = !(s.met?.length || s.mutual?.length);
  const box = $('[data-souhaits-liste]');
  const sig = JSON.stringify([s.met,s.choices]);
  if(box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = (s.met || []).map(m => {
      const c = s.choices?.find(c=>c.other_id===m.uid);
      return `<div class="box"><strong>${esc(m.name)}</strong>
       <p>${c ? ({yes:'Intérêt enregistré',no:'Pas intéressé',skip:'Choix passé'})[c.choice] : 'Ton choix'}</p>
       <button type="button" class="btn bal-btn-line" data-choice="yes" data-other="${esc(m.uid)}">Intéressé·e</button>
       <button type="button" class="btn bal-btn-line" data-choice="no" data-other="${esc(m.uid)}">Pas intéressé·e</button>
       <button type="button" class="btn bal-btn-line" data-choice="skip" data-other="${esc(m.uid)}">Passer</button>
       <button type="button" class="btn bal-btn-line" data-block-other="${esc(m.uid)}">Bloquer</button></div>`;
    }).join('');
  }
  const mutualBox=$('[data-mutual]'), ms=JSON.stringify(s.mutual);
  if(mutualBox.dataset.sig !== ms) {
    mutualBox.dataset.sig=ms;
    mutualBox.innerHTML=(s.mutual||[]).map(m=>`<p>${esc(m.name)} : intérêt réciproque.
     <button type="button" class="btn bal-btn-line" data-consent="${esc(m.uid)}" data-value="${!m.contact_consent}">${m.contact_consent?'Retirer mon accord':'Autoriser Lamia à transmettre mon email si l’autre accepte aussi'}</button></p>`).join('') || '<p>Aucun intérêt réciproque pour le moment.</p>';
  }

}

function countdown() {
  const el = $('[data-salle-temps]');
  if (!state?.ends_at || state.where !== 'tat') { el.textContent = ''; el.style.removeProperty('--reste'); return; }
  const left = Math.max(0, Date.parse(state.ends_at) - (Date.now() + offset));
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('is-fin', left < 30000);
  if (left === 0 && !state.relance) { state.relance = true; tick(); }
}

// Petite cloche au début de chaque tête-à-tête (son synthétisé, rien à télécharger).
function carillon() {
  try {
    const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
    o.start(); o.stop(ctx.currentTime + 1.7);
  } catch { /* son facultatif */ }
}

function attach(el, track) {
  if (!el) return;
  const cur = el.srcObject?.getTracks?.()[0];
  if (track && cur?.id === track.id) return;
  el.srcObject = track ? new MediaStream([track]) : null;
}

function render() {
  if (!call || call.meetingState() !== 'joined-meeting') return;
  $('[data-micro]').disabled = state?.where !== 'tat';
  $('[data-camera]').disabled = state?.where !== 'tat';
  const ps = call.participants();
  const local = ps.local;
  const others = Object.values(ps).filter((p) => !p.local);
  // Au grand salon on ne reçoit que la vidéo de Lamia ; en tête-à-tête, celle de la personne en face.
  const target = state?.where === 'tat' ? others[0] : others.find((p) => p.owner);
  for (const p of others) {
    const want = p === target;
    const sub = p.tracks?.video?.subscribed;
    if (want && sub !== true) call.updateParticipant(p.session_id, { setSubscribedTracks: { audio: true, video: true } });
    if (!want && sub === true) call.updateParticipant(p.session_id, { setSubscribedTracks: { audio: false, video: false } });
  }
  attach($('[data-video-moi]'), local?.tracks?.video?.persistentTrack);
  attach($('[data-video-autre]'), target?.tracks?.video?.state === 'playable' ? target.tracks.video.persistentTrack : null);
  attach($('[data-audio-autre]'), target?.tracks?.audio?.state === 'playable' ? target.tracks.audio.persistentTrack : null);
  $('[data-autre-nom]').textContent = target ? (target.owner ? 'Lamia' : target.user_name || '') : (state?.where === 'tat' ? 'En attente de ton cavalier…' : 'Lamia arrive…');
  $('[data-salle-compte]').textContent = state?.where === 'tat' ? '' : `${others.length + 1} masque${others.length ? 's' : ''} au bal`;
  $('[data-micro]').setAttribute('aria-pressed', String(!call.localAudio()));
  $('[data-camera]').setAttribute('aria-pressed', String(!call.localVideo()));
}

$('[data-micro]')?.addEventListener('click', () => { call?.setLocalAudio(!call.localAudio()); render(); });
$('[data-camera]')?.addEventListener('click', () => { call?.setLocalVideo(!call.localVideo()); render(); });
$('[data-quitter]')?.addEventListener('click', async () => { clearInterval(poll); clearInterval(clock); await call?.leave(); await call?.destroy(); show('quitte'); });

async function block(other) {
 if(!other || !confirm('Bloquer cette personne et arrêter le tête-à-tête ?')) return;
 const {ok}=await api({action:'block',other_id:other});
 if(ok) { await call?.leave().catch(()=>{}); roomKey=null; await tick(); }
 else message('Le blocage n’a pas pu être confirmé. Quitte la salle et alerte Lamia.');
}
$('[data-block]')?.addEventListener('click',()=>block(state?.partner_uid));
$('[data-souhaits]')?.addEventListener('click',async e=>{
 const blocked=e.target.closest('[data-block-other]');
 if(blocked)return block(blocked.dataset.blockOther);
 const b=e.target.closest('[data-choice],[data-consent]'); if(!b)return;
 b.disabled=true;
 try {
  const body=b.dataset.consent ? {action:'feedback',other_id:b.dataset.consent,choice:'yes',contact_consent:b.dataset.value==='true'} : {action:'feedback',other_id:b.dataset.other,choice:b.dataset.choice,contact_consent:false};
  const {ok}=await api(body);
  $('[data-souhaits-status]').textContent=ok?'Ton choix est enregistré.':'L’enregistrement a échoué. Réessaie.';
  await tick();
 } finally {b.disabled=false;}
});
show('entree');
const {data:{session:initialSession}}=await supabase.auth.getSession();
if(initialSession) {
 $('[data-bal-entree] input[name=email]').value=initialSession.user.email || '';
 $('[data-entree-status]').textContent='Compte connecté. Tu peux pousser la porte.';
}
