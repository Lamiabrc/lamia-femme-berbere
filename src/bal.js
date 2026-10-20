// La salle du Bal masqué de Venise, côté participant.
// Vidéo : Daily (mode « call object ») ; l'interface est celle de la Maison.
// Le serveur décide où chacun doit être (grand salon, tête-à-tête, attente, fin du bal).

import Daily from 'https://cdn.jsdelivr.net/npm/@daily-co/daily-js@0.89.1/+esm';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const store = {
  get() { try { return JSON.parse(sessionStorage.getItem('bal-pass') || 'null'); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('bal-pass', JSON.stringify(v)); } catch { /* navigation privée */ } },
  clear() { try { sessionStorage.removeItem('bal-pass'); } catch { /* */ } },
};

let me = store.get();           // { pass, name, salon }
let call = null, roomKey = null, state = null, offset = 0, poll = 0, joining = false, wishesSent = false;

async function api(body) {
  const r = await fetch('/api/bal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function show(step) {
  for (const el of document.querySelectorAll('[data-step]')) el.hidden = el.dataset.step !== step;
}

// ---------------------------------------------------------------- 1. l'entrée
const ERR = {
  bal_closed: 'Le bal n’est pas encore ouvert. Reviens à l’heure de la soirée : Lamia ouvre les portes quelques minutes avant.',
  not_registered: 'Nous ne trouvons pas ton inscription avec cet email et cette date de naissance. Vérifie-les, ou réserve ta place sur la page du bal.',
  bad_request: 'Vérifie ton email et ta date de naissance.',
};
$('[data-bal-entree]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-entree-status]'), btn = $('[type=submit]', e.target);
  btn.disabled = true; st.textContent = 'Un instant…'; st.classList.remove('is-error');
  const { ok, data } = await api({ action: 'enter', email: f.get('email'), birth_date: f.get('birth_date') });
  btn.disabled = false;
  if (!ok) { st.textContent = ERR[data.error] || 'L’entrée n’a pas fonctionné. Réessaie dans un instant.'; st.classList.add('is-error'); return; }
  me = data; store.set(me);
  window.lfbEvent?.('entree_bal');
  pret();
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
  let flouPret = false;
  call.on('joined-meeting', () => { if (!flouPret) { flouPret = true; preparerFlou(); } else if (prefs.flou) flou(true); });
  call.on('error', () => message('La connexion vidéo s’est interrompue. Nous te reconnectons…'));
  await tick();
  poll = setInterval(tick, 4000);
  setInterval(countdown, 500);
});
$('[data-sortir]')?.addEventListener('click', async () => { store.clear(); location.reload(); });

// ---------------------------------------------------------------- 3. dans la salle
async function tick() {
  const { ok, status, data } = await api({ action: 'state', pass: me.pass }).catch(() => ({ ok: false }));
  if (!ok) {
    if (status === 401) { store.clear(); location.reload(); return; }
    if (data?.error === 'bal_closed') { await call?.leave().catch(() => {}); clearInterval(poll); show('ferme'); return; }
    return;
  }
  state = data;
  offset = Date.parse(data.server_time) - Date.now();
  if (data.key !== roomKey && !joining) await rejoindre(data.key);
  decor();
  render();
}

async function rejoindre(key) {
  const avant = roomKey;
  joining = true;
  try {
    const { ok, data } = await api({ action: 'join', pass: me.pass });
    if (!ok) { message('La salle ne s’ouvre pas encore. Nouvel essai dans quelques secondes…'); return; }
    if (call.meetingState() === 'joined-meeting') await call.leave();
    await call.join({ url: data.url, token: data.token, startVideoOff: false, startAudioOff: false });
    roomKey = key;
    if (state?.where === 'tat') transition('Le prochain masque vous invite…', state.partner);
    else if (avant?.startsWith('tat:')) transition('Merci pour cette danse', 'Retour au grand salon');
  } catch { message('La connexion à la salle a échoué. Nouvel essai…'); }
  finally { joining = false; }
}

function message(t) { $('[data-salle-msg]').textContent = t; }

function decor() {
  const s = state, salle = $('[data-salle]');
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
  $('[data-salle-tour]').textContent = s.round ? `· tour ${s.round}` : '';
  const NOMS = { 'Grand salon': 'Le Grand Salon', 'Algérie–France': 'Salon Algérie–France', Europe: 'Salon Europe', Algérie: 'Salon de l’Olivier', 'Canada & USA': 'Salon des Érables', 'Autres pays': 'Salon des Voyageurs' };
  const [zone, tranche] = String(s.salon || '').split(' · ');
  $('[data-salle-salon]').textContent = s.salon ? (/tous/i.test(zone) ? 'Salon Tous âges' : `${NOMS[zone] || `Salon ${zone}`}${tranche ? ` · ${tranche}` : ''}`) : 'Le Bal masqué';
  $('[data-demasque]').hidden = !(s.where === 'tat' && s.demasque);
  const pb = $('[data-planb]');
  pb.hidden = !s.planb;
  if (s.planb) pb.querySelector('[data-planb-lien]').href = s.planb;
  carnet(s.met || []);
  ambiance();
  const souhaits = $('[data-souhaits]');
  souhaits.hidden = s.phase !== 'fin';
  if (s.phase === 'fin' && !wishesSent) {
    const list = [...new Map((s.met || []).map((m) => [m.uid, m])).values()];
    const box = $('[data-souhaits-liste]');
    const sig = list.map((m) => m.uid).join(',');
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = list.length
        ? list.map((m) => `<label class="souhait"><input type="checkbox" value="${esc(m.uid)}"><span>${esc(m.name)}</span></label>`).join('')
        : '<p>Tu n’as pas eu de tête-à-tête ce soir. Lamia te réservera une place au prochain bal.</p>';
    }
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
  const accueil = $('[data-salle-accueil]');
  if (accueil) accueil.hidden = Boolean(target?.tracks?.video?.state === 'playable');
  $('[data-autre-nom]').textContent = target ? (target.owner ? 'Lamia' : target.user_name || '') : (state?.where === 'tat' ? 'En attente de ton cavalier…' : 'Lamia arrive…');
  $('[data-salle-compte]').textContent = state?.where === 'tat' ? '' : `${others.length + 1} masque${others.length ? 's' : ''} au bal`;
  $('[data-micro]').setAttribute('aria-pressed', String(!call.localAudio()));
  $('[data-camera]').setAttribute('aria-pressed', String(!call.localVideo()));
}

$('[data-micro]')?.addEventListener('click', () => { call?.setLocalAudio(!call.localAudio()); render(); });
$('[data-camera]')?.addEventListener('click', () => { call?.setLocalVideo(!call.localVideo()); render(); });
$('[data-quitter]')?.addEventListener('click', async () => { clearInterval(poll); await call?.leave(); show('quitte'); });

$('[data-souhaits]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const wished = [...e.target.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
  const fd = new FormData(e.target);
  const { ok } = await api({ action: 'wish', pass: me.pass, wished, message: fd.get('message'), avis: { aime: fd.get('aime'), reviendrait: fd.get('reviendrait'), paierait: fd.get('paierait') } });
  if (ok) { wishesSent = true; e.target.innerHTML = '<p class="souhaits-ok">Ton carnet est envoyé. Si un souhait est réciproque, Lamia vous mettra en relation. Merci d’être venu·e au bal, belle nuit !</p>'; }
  else $('[data-souhaits-status]').textContent = 'L’envoi n’a pas fonctionné. Réessaie.';
});

// ---------------------------------------------------------------- le carnet de bal
function carnet(met) {
  const ol = $('[data-carnet-liste]');
  const sig = met.map((m) => `${m.uid}:${m.round}`).join(',');
  if (ol.dataset.sig === sig) return;
  ol.dataset.sig = sig;
  ol.innerHTML = met.length
    ? met.map((m) => `<li><span class="carnet-tour">Tour ${esc(m.round)}</span><span class="carnet-nom">${esc(m.name)}</span></li>`).join('')
    : '<li class="carnet-vide">Tes cavaliers s’inscriront ici au fil des tours.</li>';
}

// ---------------------------------------------------------------- transitions entre les danses
function transition(titre, nom) {
  const t = $('[data-transition]');
  $('[data-transition-titre]').textContent = titre;
  $('[data-transition-nom]').textContent = nom || '';
  t.hidden = false;
  t.classList.remove('is-out'); void t.offsetWidth; t.classList.add('is-in');
  carillon();
  clearTimeout(transition.timer);
  transition.timer = setTimeout(() => { t.classList.add('is-out'); setTimeout(() => { t.hidden = true; }, 600); }, 3200);
}

// ---------------------------------------------------------------- ambiance feutrée : musique douce et flou du décor
const prefs = (() => { try { return JSON.parse(localStorage.getItem('bal-prefs') || '{}'); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('bal-prefs', JSON.stringify(prefs)); } catch { /* */ } };
let musique = null;
// Nappe musicale très douce, synthétisée (rien à télécharger) : accords lents, volume bas.
function creerMusique() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const filtre = ctx.createBiquadFilter(); filtre.type = 'lowpass'; filtre.frequency.value = 900; filtre.connect(master);
  const accords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
  const voix = accords[0].map((f) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.18; o.connect(g); g.connect(filtre); o.start(); return o; });
  let i = 0;
  const tourne = setInterval(() => { i = (i + 1) % accords.length; voix.forEach((o, k) => o.frequency.linearRampToValueAtTime(accords[i][k], ctx.currentTime + 3)); }, 9000);
  return {
    volume(v) { master.gain.linearRampToValueAtTime(v, ctx.currentTime + 1.5); if (ctx.state === 'suspended') ctx.resume(); },
    stop() { clearInterval(tourne); ctx.close().catch(() => {}); },
  };
}
function ambiance() {
  const veut = prefs.musique !== false;
  const auSalon = state && state.where !== 'tat';
  $('[data-musique]').setAttribute('aria-pressed', String(veut));
  $('[data-musique]').textContent = veut ? 'Couper la musique' : 'Musique douce';
  if (veut && !musique) { try { musique = creerMusique(); } catch { musique = null; } }
  musique?.volume(veut && auSalon ? 0.035 : 0);
}
$('[data-musique]')?.addEventListener('click', () => { prefs.musique = prefs.musique === false; savePrefs(); ambiance(); });

let flouDispo = false;
async function flou(actif) {
  if (!call || !flouDispo) return;
  try {
    await call.updateInputSettings({ video: { processor: actif ? { type: 'background-blur', config: { strength: 1 } } : { type: 'none' } } });
    $('[data-flou]').setAttribute('aria-pressed', String(actif));
    $('[data-flou]').textContent = actif ? 'Décor net' : 'Flouter mon décor';
  } catch { $('[data-flou]').hidden = true; }
}
$('[data-flou]')?.addEventListener('click', () => { prefs.flou = !(prefs.flou === true); savePrefs(); flou(prefs.flou); });
function preparerFlou() {
  try { flouDispo = Boolean(Daily.supportedBrowser?.().supportsVideoProcessing); } catch { flouDispo = false; }
  $('[data-flou]').hidden = !flouDispo;
  if (flouDispo && prefs.flou) flou(true);
}

// Au chargement : si la personne est déjà entrée ce soir, on reprend.
if (me?.pass) pret(); else show('entree');
