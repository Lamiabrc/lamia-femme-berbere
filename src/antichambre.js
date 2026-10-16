// L'antichambre du bal : test de la caméra, du micro et de la connexion.
// Tout reste dans le navigateur : aucune image ni aucun son n'est envoyé.

const $ = (s) => document.querySelector(s);
const box = $('[data-ante]');
let stream = null, audioCtx = null, raf = 0;

const mark = (name, state) => {
  const li = box.querySelector(`[data-check="${name}"]`);
  li.classList.remove('is-ok', 'is-ko');
  if (state) li.classList.add(state === 'ok' ? 'is-ok' : 'is-ko');
};
const say = (msg) => { $('[data-ante-msg]').textContent = msg; };

function reseau() { mark('reseau', navigator.onLine ? 'ok' : 'ko'); }
addEventListener('online', reseau);
addEventListener('offline', reseau);
reseau();

function stop() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  $('[data-ante-video]').srcObject = null;
  $('[data-ante-vide]').hidden = false;
  $('[data-ante-stop]').hidden = true;
  $('[data-ante-start]').hidden = false;
  $('[data-ante-niveau]').style.width = '0%';
  say('Caméra coupée. Tu peux recommencer quand tu veux.');
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    mark('camera', 'ko'); mark('micro', 'ko');
    return say('Ce navigateur ne permet pas la vidéo. Essaie avec Chrome, Edge, Firefox ou Safari à jour.');
  }
  say('Autorise la caméra et le micro dans la fenêtre de ton navigateur…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    mark('camera', 'ko'); mark('micro', 'ko');
    if (e?.name === 'NotAllowedError') return say('L’accès a été refusé. Clique sur le cadenas à côté de l’adresse du site, autorise la caméra et le micro, puis réessaie.');
    if (e?.name === 'NotFoundError') return say('Aucune caméra ou aucun micro trouvé. Branche-les, ou essaie depuis ton téléphone.');
    if (e?.name === 'NotReadableError') return say('La caméra est déjà utilisée par une autre application (TikTok Live, Zoom…). Ferme-la puis réessaie.');
    return say('La caméra n’a pas pu démarrer. Réessaie dans un instant.');
  }
  const video = $('[data-ante-video]');
  video.srcObject = stream;
  $('[data-ante-vide]').hidden = true;
  $('[data-ante-start]').hidden = true;
  $('[data-ante-stop]').hidden = false;
  mark('camera', stream.getVideoTracks().length ? 'ok' : 'ko');
  window.lfbEvent?.('test_camera');

  const track = stream.getAudioTracks()[0];
  if (!track) { mark('micro', 'ko'); return say('La caméra fonctionne, mais aucun micro n’est disponible.'); }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let heard = false;
  const loop = () => {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    const level = Math.min(100, Math.round((peak / 64) * 100));
    $('[data-ante-niveau]').style.width = `${level}%`;
    if (!heard && level > 18) {
      heard = true;
      mark('micro', 'ok');
      say('Tout est prêt : on te voit et on t’entend. Ajuste ton masque, et à samedi au bal !');
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  say('On te voit ! Dis quelques mots pour vérifier ton micro.');
}

$('[data-ante-start]').addEventListener('click', start);
$('[data-ante-stop]').addEventListener('click', stop);
addEventListener('pagehide', () => stream && stop());
