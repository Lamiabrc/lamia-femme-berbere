// Enregistreur vocal partagé (page des Confidences et espace de Lamia).
// Le micro ne s'allume qu'après un clic sur « Démarrer » ; il s'éteint dès qu'on arrête.

const FORMATS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
export const enregistrementPossible = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const duree = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Monte l'enregistreur dans un conteneur qui possède les éléments data-rec-*.
// Renvoie { blob(), duree(), vider() }.
export function monterEnregistreur(box, { max = 600, onChange = () => {} } = {}) {
  const q = (s) => box.querySelector(`[data-rec-${s}]`);
  const el = { start: q('start'), pause: q('pause'), resume: q('resume'), stop: q('stop'), redo: q('redo'), time: q('time'), state: q('state'), audio: q('audio'), file: q('file'), meter: q('meter') };
  let rec = null, stream = null, chunks = [], blob = null, secondes = 0, timer = 0, depart = 0, cumul = 0, ctx = null, raf = 0;

  const etat = (nom, texte) => {
    box.dataset.recEtat = nom;
    if (el.state) el.state.textContent = texte;
    const vis = { start: ['pret', 'refuse'], pause: ['enreg'], resume: ['pause'], stop: ['enreg', 'pause'], redo: ['fini'] };
    for (const [k, list] of Object.entries(vis)) if (el[k]) el[k].hidden = !list.includes(nom);
    if (el.audio) el.audio.hidden = nom !== 'fini';
    onChange(nom);
  };
  const tic = () => { secondes = cumul + (Date.now() - depart) / 1000; if (el.time) el.time.textContent = duree(secondes); if (secondes >= max) arreter(); };
  const couper = () => { clearInterval(timer); cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; ctx?.close().catch(() => {}); ctx = null; if (el.meter) el.meter.style.setProperty('--niveau', '0'); };

  async function demarrer() {
    if (!enregistrementPossible()) return etat('refuse', 'L’enregistrement n’est pas disponible sur ce navigateur. Tu peux importer un fichier audio.');
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return etat('refuse', e?.name === 'NotAllowedError' ? 'Le micro a été refusé. Autorise-le dans ton navigateur (le cadenas près de l’adresse), ou importe un fichier audio.' : 'Le micro n’est pas accessible. Tu peux importer un fichier audio.'); }
    const mimeType = FORMATS.find((f) => MediaRecorder.isTypeSupported?.(f));
    rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = []; blob = null; cumul = 0; secondes = 0;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      blob = new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] });
      if (el.audio) { el.audio.src = URL.createObjectURL(blob); }
      couper();
      etat('fini', `Message vocal prêt (${duree(secondes)}). Réécoute-le avant de l’envoyer.`);
    };
    rec.start(1000);
    depart = Date.now(); timer = setInterval(tic, 250);
    // Petit indicateur de niveau pour voir que le micro capte bien.
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 256; ctx.createMediaStreamSource(stream).connect(an);
      const d = new Uint8Array(an.fftSize);
      const loop = () => { an.getByteTimeDomainData(d); let p = 0; for (const v of d) p = Math.max(p, Math.abs(v - 128)); el.meter?.style.setProperty('--niveau', Math.min(1, p / 50).toFixed(2)); raf = requestAnimationFrame(loop); };
      loop();
    } catch { /* indicateur facultatif */ }
    etat('enreg', 'Enregistrement en cours…');
  }
  function pause() { if (rec?.state !== 'recording') return; rec.pause(); cumul += (Date.now() - depart) / 1000; clearInterval(timer); etat('pause', 'En pause. Reprends quand tu veux.'); }
  function reprendre() { if (rec?.state !== 'paused') return; rec.resume(); depart = Date.now(); timer = setInterval(tic, 250); etat('enreg', 'Enregistrement en cours…'); }
  function arreter() { if (!rec || rec.state === 'inactive') return; if (rec.state === 'recording') cumul += (Date.now() - depart) / 1000; secondes = cumul; clearInterval(timer); rec.stop(); }
  function vider() { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } couper(); rec = null; chunks = []; blob = null; secondes = 0; if (el.time) el.time.textContent = '0:00'; if (el.audio) el.audio.removeAttribute('src'); if (el.file) el.file.value = ''; etat('pret', 'Prêt·e ? Appuie sur « Démarrer » quand tu veux.'); }

  el.start?.addEventListener('click', demarrer);
  el.pause?.addEventListener('click', pause);
  el.resume?.addEventListener('click', reprendre);
  el.stop?.addEventListener('click', arreter);
  el.redo?.addEventListener('click', vider);
  // Import d'un fichier audio si l'enregistrement n'est pas possible.
  el.file?.addEventListener('change', () => {
    const f = el.file.files?.[0];
    if (!f) return;
    if (!/^audio\//.test(f.type)) { el.file.value = ''; return etat('refuse', 'Ce fichier n’est pas un fichier audio.'); }
    if (f.size > 25 * 1024 * 1024) { el.file.value = ''; return etat('refuse', 'Ce fichier audio dépasse 25 Mo.'); }
    couper(); blob = f; secondes = 0;
    if (el.audio) { el.audio.src = URL.createObjectURL(f); el.audio.onloadedmetadata = () => { if (Number.isFinite(el.audio.duration)) { secondes = el.audio.duration; if (el.time) el.time.textContent = duree(secondes); } }; }
    etat('fini', `Fichier audio prêt : ${f.name}.`);
  });
  vider();
  return { blob: () => blob, duree: () => Math.round(secondes), vider };
}
