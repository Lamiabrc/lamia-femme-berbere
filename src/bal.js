/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
// La salle du Bal masqué Virtuel Kabyle, côté participant.
// Vidéo : Daily (mode « call object ») ; l'interface est celle de la Maison.
// Le serveur décide où chacun doit être (grand salon, tête-à-tête, attente, fin du bal).

import Daily from '/vendor/daily.mjs';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const store = {
  get() { try { return JSON.parse(sessionStorage.getItem('bal-pass') || 'null'); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('bal-pass', JSON.stringify(v)); } catch { /* navigation privée */ } },
  clear() { try { sessionStorage.removeItem('bal-pass'); } catch { /* */ } },
};

let me = store.get();           // { pass, name, salon }
let apercuCamera = false;
let call = null, roomKey = null, state = null, offset = 0, poll = 0, joining = false, wishesSent = false;

// ---------------------------------------------------------------- mode aperçu (?apercu)
// Pour voir et régler la salle sans soirée ouverte : rien n'est envoyé, personne ne te voit,
// ta caméra reste sur ton appareil. Un panneau permet de passer d'un écran à l'autre.
const APERCU = new URLSearchParams(location.search).has('apercu');
const sim = { phase: 'accueil', where: 'grand', round: 0, partner: null, demasque: false, salon: 'Grand salon · 25-39 ans', met: [], ends_at: null, planb: null };
const SIM_MET = [{ uid: 'k', name: 'Karim', round: 1 }, { uid: 'm', name: 'Massinissa', round: 2 }, { uid: 'y', name: 'Yanis', round: 3 }];
function simuler(body) {
  const now = new Date();
  if (body.action === 'enter') return { ok: true, status: 200, data: { pass: 'apercu', name: 'Lamia', salon: sim.salon } };
  if (body.action === 'state') {
    return { ok: true, status: 200, data: {
      phase: sim.phase, round: sim.round, where: sim.where, key: sim.where === 'tat' ? `tat:${sim.round}` : 'grand:apercu',
      ends_at: sim.ends_at, partner: sim.where === 'tat' ? sim.partner : null, demasque: sim.demasque, salon: sim.salon,
      planb: sim.planb, met: sim.met, reciproque: sim.where === 'tat' && Boolean(sim.reciproque), ma_reponse: sim.ma_reponse ?? null, server_time: now.toISOString(),
    } };
  }
  if (body.action === 'join') return { ok: true, status: 200, data: { url: '', token: '', key: '' } };
  return { ok: true, status: 200, data: { ok: true, count: (body.wished || []).length } };
}

async function api(body) {
  if (APERCU) return simuler(body);
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

// ---------------------------------------------------------------- décor propre à chaque salon
// Chaque tranche d'âge a sa salle : son image en fond, ses couleurs, son nom et sa petite phrase.
const THEMES = {
  '25-39 ans': { id: 'petillant', nom: 'Le Salon Pétillant', phrase: 'Champagne rosé, masques ivoire et rires : le bal des 25-39 ans.', decor: '/images/lamia/salon-25-39-ans-800.webp' },
  '40 ans et plus': { id: 'ambre', nom: 'Le Salon de l’Ambre', phrase: 'Thé à la menthe et lueur des bougies : le bal des 40 ans et plus.', decor: '/images/lamia/salon-40-ans-et-plus-800.webp' },
};
function themeSalon(salon) {
  const tranche = String(salon || '').split(' · ')[1];
  const t = THEMES[tranche];
  const page = $('.bal-salle-page');
  if (!page) return t;
  if (t) { page.dataset.theme = t.id; page.style.setProperty('--salle-decor', `url('${t.decor}')`); }
  else delete page.dataset.theme;
  $$('[data-salon-phrase]').forEach((e) => { e.textContent = t?.phrase || ''; e.hidden = !t; });
  return t;
}

// ---------------------------------------------------------------- 2. devant la porte : aperçu caméra
let preview = null;
async function pret() {
  show('pret');
  $('[data-pret-nom]').textContent = me.name;
  const th = themeSalon(me.salon);
  $('[data-pret-salon]').textContent = th ? th.nom : me.salon ? `Salon ${me.salon}` : '';
  // Plus d'aperçu automatique : on entre au salon d'attente caméra éteinte. Tester sa caméra est facultatif.
  $('[data-pret-msg]').textContent = 'Tu entres d’abord au salon d’attente, caméra et micro éteints. Ils s’allument seulement pendant tes tête-à-têtes.';
}
function arreterApercu() { preview?.getTracks().forEach((t) => t.stop()); preview = null; const v = $('[data-pret-video]'); if (v) v.srcObject = null; $('[data-tester]')?.setAttribute('aria-pressed', 'false'); }
$('[data-tester]')?.addEventListener('click', async () => {
  if (preview) { arreterApercu(); $('[data-tester]').textContent = 'Tester ma caméra'; return; }
  try {
    preview = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $('[data-pret-video]').srcObject = preview;
    $('[data-tester]').textContent = 'Éteindre l’essai';
    $('[data-pret-msg]').textContent = 'On te voit. Ajuste ton masque. Au salon d’attente, ta caméra sera éteinte.';
  } catch {
    $('[data-pret-msg]').textContent = 'Ta caméra ou ton micro est bloqué. Autorise-les (cadenas à côté de l’adresse du site), puis recharge la page. Ils serviront pour les tête-à-têtes.';
  }
});
$('[data-entrer]')?.addEventListener('click', async () => {
  arreterApercu();
  show('salle');
  call = Daily.createCallObject({ subscribeToTracksAutomatically: false, dailyConfig: { useDevicePreferenceCookies: true } });
  for (const ev of ['participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped', 'joined-meeting']) call.on(ev, render);
  call.on('left-meeting', () => { roomKey = null; });
  tchatBrancher();
  let flouPret = false;
  call.on('joined-meeting', () => { if (!flouPret) { flouPret = true; preparerDecor(); } else if (prefs.decor && prefs.decor !== 'aucun') appliquerDecor(prefs.decor); });
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
    if (data?.error === 'autre_connexion') { await call?.leave().catch(() => {}); clearInterval(poll); store.clear(); show('autre'); return; }
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
    if (APERCU) {
      if (!apercuCamera) {
        apercuCamera = true;
        await call.startCamera({ startVideoOff: false, startAudioOff: true }).catch(() => message('Autorise ta caméra pour voir ton image et tester les décors.'));
        preparerDecor();
      }
      roomKey = key;
      if (state?.where === 'tat') transition('Le prochain masque vous invite…', state.partner);
      else if (avant?.startsWith('tat:')) transition('Merci pour cette danse', 'Retour au grand salon');
      return;
    }
    if (call.meetingState() === 'joined-meeting') await call.leave();
    // Caméra et micro allumés seulement en tête-à-tête ; au salon d'attente, éteints.
    const enTat = state?.where === 'tat';
    await call.join({ url: data.url, token: data.token, startVideoOff: !enTat, startAudioOff: !enTat });
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
    accueil: ['Le salon d’attente', 'Bienvenue ! Ta caméra et ton micro sont éteints ici. Ils s’allumeront tout seuls quand ton tête-à-tête commencera.'],
    tat: [`Tête-à-tête avec ${s.partner || 'ton cavalier'}`, 'Présente-toi, souris, pose une vraie question. La cloche sonnera à la fin.'],
    attente: ['Le salon d’attente', 'Pas de tête-à-tête pour toi à ce tour : reste ici, caméra éteinte, ton tour arrive.'],
    fin: ['La fin du bal', 'Merci pour cette soirée. Indique en privé qui tu aimerais revoir.'],
  };
  const [titre, texte] = s.phase === 'fin' ? titres.fin : titres[s.where] || titres.accueil;
  $('[data-salle-titre]').textContent = titre;
  message(texte);
  $('[data-salle-tour]').textContent = s.round ? `· tour ${s.round}` : '';
  const NOMS = { 'Grand salon': 'Le Grand Salon', 'Algérie–France': 'Salon Algérie–France', Europe: 'Salon Europe', Algérie: 'Salon de l’Olivier', 'Canada & USA': 'Salon des Érables', 'Autres pays': 'Salon des Voyageurs' };
  const [zone, tranche] = String(s.salon || '').split(' · ');
  const th = themeSalon(s.salon);
  $('[data-salle-salon]').textContent = th ? `${th.nom} · ${tranche}` : s.salon ? (/tous/i.test(zone) ? 'Salon Tous âges' : `${NOMS[zone] || `Salon ${zone}`}${tranche ? ` · ${tranche}` : ''}`) : 'Le Bal masqué';
  $('[data-demasque]').hidden = !(s.where === 'tat' && s.demasque) || Boolean(s.reciproque);
  // Tour du démasquage (souhaits réciproques) : chacun confirme s'il veut être mis en relation.
  const rc = $('[data-reciproque]');
  rc.hidden = !(s.where === 'tat' && s.reciproque);
  if (!rc.hidden) {
    const repondu = s.ma_reponse === true || s.ma_reponse === false;
    $('[data-reciproque-boutons]').hidden = repondu;
    $('[data-reciproque-ok]').hidden = !repondu;
    if (repondu) $('[data-reciproque-ok]').textContent = s.ma_reponse ? 'C’est noté : tu veux te démasquer. Si l’autre personne dit oui aussi, Lamia vous met en relation.' : 'C’est noté. Ta réponse reste privée.';
  }
  const pb = $('[data-planb]');
  pb.hidden = !s.planb;
  if (s.planb) pb.querySelector('[data-planb-lien]').href = s.planb;
  carnet(s.met || []);
  ambiance();
  tchatVisible();
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
  if (!call || (!APERCU && call.meetingState() !== 'joined-meeting')) return;
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
  // Hors tête-à-tête : caméra et micro forcés à éteint, boutons désactivés.
  const enTat = state?.where === 'tat';
  if (!enTat && state) { if (call.localVideo()) call.setLocalVideo(false); if (call.localAudio()) call.setLocalAudio(false); }
  for (const b of [$('[data-micro]'), $('[data-camera]')]) { b.disabled = !enTat; b.title = enTat ? '' : 'S’allume pendant ton tête-à-tête'; }
  $('[data-salle]')?.classList.toggle('is-cam-eteinte', !enTat);
  $('[data-micro]').setAttribute('aria-pressed', String(!call.localAudio()));
  $('[data-camera]').setAttribute('aria-pressed', String(!call.localVideo()));
}

// ---------------------------------------------------------------- bulle de chat avec Lamia (salon d'attente)
// Lamia écrit à tout le salon ; la réponse d'un participant ne va qu'à Lamia. Rien n'est enregistré.
const fil = [];
function tchatAfficher() {
  const ol = $('[data-tchat-fil]');
  if (!ol) return;
  ol.innerHTML = fil.length ? fil.map((m) => `<li class="${m.moi ? 'is-moi' : 'is-lamia'}"><b>${m.moi ? 'Toi' : 'Lamia'}</b> ${esc(m.t)}</li>`).join('') : '<li class="tchat-vide">Lamia peut t’écrire ici. Ta réponse n’est lue que par elle.</li>';
  ol.scrollTop = ol.scrollHeight;
}
function tchatBrancher() {
  call.on('app-message', (e) => {
    const d = e?.data;
    if (d?.type !== 'tchat-lamia' || !d.t) return;
    const lamia = Object.values(call.participants()).find((p) => p.session_id === e.fromId);
    if (lamia && !lamia.owner) return;
    fil.push({ moi: false, t: String(d.t).slice(0, 300) }); tchatAfficher();
    const panneau = $('[data-tchat-panneau]');
    if (panneau?.hidden) { $('[data-tchat-nouveau]').hidden = false; panneau.hidden = false; $('[data-tchat-ouvrir]').setAttribute('aria-expanded', 'true'); }
  });
}
function tchatVisible() {
  const box = $('[data-tchat]');
  if (box) box.hidden = !state || state.where === 'tat';
}
$('[data-tchat-ouvrir]')?.addEventListener('click', () => {
  const p = $('[data-tchat-panneau]'); p.hidden = !p.hidden;
  $('[data-tchat-ouvrir]').setAttribute('aria-expanded', String(!p.hidden)); $('[data-tchat-nouveau]').hidden = true;
  if (!p.hidden) p.querySelector('input')?.focus();
});
$('[data-tchat-form]')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.t, t = input.value.trim().slice(0, 300);
  if (!t || !call) return;
  const lamia = Object.values(call.participants()).find((p) => !p.local && p.owner);
  if (!lamia) { fil.push({ moi: false, t: 'Lamia n’est pas encore dans le salon : réessaie dans un instant.' }); tchatAfficher(); return; }
  call.sendAppMessage({ type: 'tchat-membre', t, nom: me?.name || '' }, lamia.session_id);
  fil.push({ moi: true, t }); input.value = ''; tchatAfficher();
});

$('[data-micro]')?.addEventListener('click', () => { call?.setLocalAudio(!call.localAudio()); render(); });
$('[data-camera]')?.addEventListener('click', () => { call?.setLocalVideo(!call.localVideo()); render(); });
$('[data-quitter]')?.addEventListener('click', async () => { clearInterval(poll); await call?.leave(); show('quitte'); });

$('[data-reciproque]')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-reciproque-rep]'); if (!b) return;
  const oui = b.dataset.reciproqueRep === 'oui';
  $$('[data-reciproque-rep]').forEach((x) => { x.disabled = true; });
  const { ok } = await api({ action: 'demasque', pass: me.pass, oui });
  $$('[data-reciproque-rep]').forEach((x) => { x.disabled = false; });
  if (!ok) { message('Ta réponse n’est pas partie : réessaie.'); return; }
  if (APERCU) sim.ma_reponse = oui;
  state.ma_reponse = oui; decor();
});

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

// Décor : garder sa pièce, la flouter, ou la remplacer par un salon du bal (sans écran vert).
// Possible seulement là où le navigateur traite la vidéo (surtout sur ordinateur) ; ailleurs, un conseil.
const DECORS = {
  aucun: { type: 'none' },
  flou: { type: 'background-blur', config: { strength: 1 } },
  petillant: { type: 'background-image', config: { source: `${location.origin}/images/lamia/salon-25-39-ans-800.webp` } },
  ambre: { type: 'background-image', config: { source: `${location.origin}/images/lamia/salon-40-ans-et-plus-800.webp` } },
};
let decorDispo = false;
async function appliquerDecor(nom) {
  if (!call || !decorDispo) return;
  const choix = DECORS[nom] ? nom : 'aucun';
  try {
    await call.updateInputSettings({ video: { processor: DECORS[choix] } });
    $('[data-decor]').value = choix;
  } catch {
    if (choix !== 'flou' && choix !== 'aucun') { message('Ce décor ne se charge pas sur ton appareil : essaie le flou.'); $('[data-decor]').value = 'aucun'; }
    else { $('[data-decor-choix]').hidden = true; $('[data-decor-conseil]').hidden = false; }
  }
}
$('[data-decor]')?.addEventListener('change', (e) => { prefs.decor = e.target.value; savePrefs(); appliquerDecor(prefs.decor); });
function preparerDecor() {
  try { decorDispo = Boolean(Daily.supportedBrowser?.().supportsVideoProcessing); } catch { decorDispo = false; }
  $('[data-decor-choix]').hidden = !decorDispo;
  $('[data-decor-conseil]').hidden = decorDispo;
  // Ancien réglage « flou » gardé d'un bal précédent.
  if (!prefs.decor && prefs.flou) prefs.decor = 'flou';
  if (decorDispo && prefs.decor && prefs.decor !== 'aucun') appliquerDecor(prefs.decor);
}

// ---------------------------------------------------------------- panneau de l'aperçu
function panneauApercu() {
  const box = document.createElement('aside');
  box.className = 'apercu-panneau';
  box.setAttribute('aria-label', 'Aperçu de la salle');
  box.innerHTML = `<p class="apercu-titre"><strong>Aperçu de la salle</strong> · rien n'est en ligne, personne ne te voit</p>
    <div class="apercu-boutons">
      <button type="button" data-ap="entree">Porte</button>
      <button type="button" data-ap="pret">Antichambre</button>
      <button type="button" data-ap="accueil">Grand salon</button>
      <button type="button" data-ap="tat">Tête-à-tête</button>
      <button type="button" data-ap="attente">En attente</button>
      <button type="button" data-ap="demasque">Démasquage</button>
      <button type="button" data-ap="reciproque">Tour réciproque</button>
      <button type="button" data-ap="planb">Plan B</button>
      <button type="button" data-ap="fin">Fin du bal</button>
      <button type="button" data-ap="ferme">Bal fermé</button>
      <select data-ap-salon aria-label="Salon"><option value="Grand salon · 25-39 ans">Salon 25-39 ans</option><option value="Grand salon · 40 ans et plus">Salon 40 ans et plus</option></select>
      <button type="button" data-ap-replier aria-expanded="true">Replier</button>
    </div>`;
  document.body.append(box);
  const allerSalle = async () => {
    me = { pass: 'apercu', name: 'Lamia', salon: sim.salon };
    if (!call) { $('[data-entrer]').click(); return; }
    show('salle'); await tick();
  };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ap],[data-ap-replier]');
    if (!b) return;
    if (b.hasAttribute('data-ap-replier')) { const r = box.classList.toggle('is-replie'); b.textContent = r ? 'Aperçu' : 'Replier'; b.setAttribute('aria-expanded', String(!r)); return; }
    const v = b.dataset.ap;
    $$('[data-ap]', box).forEach((x) => x.classList.toggle('is-on', x === b));
    if (v === 'entree') { show('entree'); return; }
    if (v === 'pret') { me = { pass: 'apercu', name: 'Lamia', salon: sim.salon }; pret(); return; }
    if (v === 'ferme') { show('ferme'); return; }
    sim.planb = v === 'planb' ? 'https://meet.google.com/apercu' : null;
    sim.demasque = v === 'demasque' || v === 'reciproque';
    sim.reciproque = v === 'reciproque';
    if (v === 'reciproque') { sim.ma_reponse = null; Object.assign(sim, { phase: 'tour', where: 'tat', round: 4, partner: 'Karim', ends_at: new Date(Date.now() + 5 * 60e3).toISOString(), met: SIM_MET }); }
    if (v === 'accueil' || v === 'planb') Object.assign(sim, { phase: 'accueil', where: 'grand', round: sim.round, ends_at: null });
    if (v === 'tat' || v === 'demasque') {
      sim.round = v === 'demasque' ? 3 : Math.min(3, sim.round + 1) || 1;
      Object.assign(sim, { phase: 'tour', where: 'tat', partner: SIM_MET[sim.round - 1].name, ends_at: new Date(Date.now() + (v === 'demasque' ? 45e3 : 6 * 60e3)).toISOString(), met: SIM_MET.slice(0, sim.round) });
    }
    if (v === 'attente') Object.assign(sim, { phase: 'tour', where: 'attente', round: Math.max(1, sim.round), ends_at: new Date(Date.now() + 4 * 60e3).toISOString() });
    if (v === 'fin') Object.assign(sim, { phase: 'fin', where: 'grand', ends_at: null, met: SIM_MET });
    await allerSalle();
  });
  $('[data-ap-salon]', box).addEventListener('change', async (e) => {
    sim.salon = e.target.value; me = { ...(me || {}), pass: 'apercu', name: 'Lamia', salon: sim.salon };
    if (!$('[data-step="pret"]').hidden) pret(); else if (call) await tick();
  });
}

// Au chargement : si la personne est déjà entrée ce soir, on reprend.
if (APERCU) { store.clear(); me = null; panneauApercu(); show('entree'); }
else if (me?.pass) pret(); else show('entree');
