// Les Confidences avec Lamia : écrire, parler (vocal), ou échanger en conversation privée.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { api, envoyer, erreur, esc, taille, quand, piecesHtml, PUBLIC_KEY } from './confidences-commun.js';
import { monterEnregistreur } from './enregistreur.js';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const $ = (s, root = document) => root.querySelector(s);
const say = (el, msg, err = false) => { if (!el) return; el.textContent = msg; el.classList.toggle('is-error', err); };

// ---------------------------------------------------------------- les trois choix
function ouvrir(nom, scroll = true) {
  document.querySelectorAll('[data-choix]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.choix === nom)));
  document.querySelectorAll('[data-panneau]').forEach((p) => { p.hidden = p.dataset.panneau !== nom; });
  const p = $(`[data-panneau="${nom}"]`);
  if (scroll && p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (nom === 'conversation') chargerConversation();
}
document.querySelectorAll('[data-choix]').forEach((b) => b.addEventListener('click', () => ouvrir(b.dataset.choix)));

// ---------------------------------------------------------------- liste de fichiers à joindre, avec retrait possible
function listeFichiers(input, ul, filtre = () => true) {
  let files = [];
  const rendre = () => {
    ul.innerHTML = files.map((f, i) => `<li><span>${f.type.startsWith('image/') ? '🖼' : '📄'} ${esc(f.name)} <small>${taille(f.size)}</small></span><button type="button" class="conf-lien" data-retirer="${i}" aria-label="Retirer ${esc(f.name)}">Retirer</button></li>`).join('');
  };
  input.addEventListener('change', () => {
    for (const f of input.files) if (filtre(f) && files.length < 6 && !files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
    input.value = '';
    rendre();
  });
  ul.addEventListener('click', (e) => { const i = e.target.closest('[data-retirer]')?.dataset.retirer; if (i != null) { files.splice(Number(i), 1); rendre(); } });
  return { get: () => files, vider: () => { files = []; rendre(); } };
}

const merci = (form, prenom) => {
  form.innerHTML = `<div class="conf-merci"><p class="conf-sur">C’est bien arrivé</p><h2>Merci ${esc(prenom)}, ta confidence est entre de bonnes mains.</h2><p>Lamia te répond personnellement dès qu’elle est disponible, par email ou dans ta conversation privée.</p><p>Pour lire sa réponse ici, ouvre « Échanger avec Lamia » et connecte-toi avec la même adresse email.</p><p><button type="button" class="conf-btn" data-choix-apres="conversation">Échanger avec Lamia</button></p></div>`;
  form.querySelector('[data-choix-apres]').addEventListener('click', () => ouvrir('conversation'));
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const champs = (form) => { const f = new FormData(form); return { name: f.get('name'), email: f.get('email'), phone: f.get('phone'), body: f.get('body'), consent: f.get('consent') === 'on', website: f.get('website') }; };

// ---------------------------------------------------------------- 1. écrire
const formEcrit = $('[data-conf-ecrit]');
if (formEcrit) {
  const pj = listeFichiers($('[data-fichiers]', formEcrit), $('[data-liste]', formEcrit));
  formEcrit.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('[data-statut]', formEcrit), btn = $('.conf-envoyer', formEcrit);
    const c = champs(formEcrit);
    if (!c.consent) return say(st, erreur('consent_required'), true);
    btn.disabled = true; say(st, 'Envoi en cours…');
    try {
      await envoyer({ action: 'envoyer', channel: 'ecrit', ...c }, pj.get().map((f) => ({ blob: f, name: f.name })), null, (i, n) => say(st, `Envoi des fichiers (${i}/${n})…`));
      merci(formEcrit, c.name);
    } catch (err) { say(st, erreur(err.code), true); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------- 2. parler
const formVocal = $('[data-conf-vocal]');
if (formVocal) {
  const rec = monterEnregistreur($('[data-rec]', formVocal));
  formVocal.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('[data-statut]', formVocal), btn = $('.conf-envoyer', formVocal);
    const c = champs(formVocal);
    if (!rec.blob()) return say(st, 'Enregistre ton message vocal (ou importe un fichier audio) avant d’envoyer.', true);
    if (!c.consent) return say(st, erreur('consent_required'), true);
    btn.disabled = true; say(st, 'Envoi de ton vocal…');
    try {
      await envoyer({ action: 'envoyer', channel: 'vocal', ...c }, [{ blob: rec.blob(), name: 'message-vocal', duration: rec.duree() }], null);
      rec.vider();
      merci(formVocal, c.name);
    } catch (err) { say(st, erreur(err.code), true); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------- 3. conversation privée
let session = null, fil = null, charge = false, minuteur = 0;
const conv = $('[data-conv]'), connexion = $('[data-conv-connexion]');
const pjConv = conv ? listeFichiers($('[data-conv-images]'), $('[data-conv-liste]'), (f) => f.type.startsWith('image/')) : null;
const recConv = conv ? monterEnregistreur($('[data-conv-vocal] [data-rec]')) : null;
$('[data-conv-vocal-ouvrir]')?.addEventListener('click', () => { const v = $('[data-conv-vocal]'); v.hidden = !v.hidden; });

$('[data-conv-lien]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = $('[data-conv-lien-statut]');
  const email = new FormData(e.target).get('email');
  say(st, 'Un instant…');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/confidences/#conversation`, shouldCreateUser: true } });
  if (error) return say(st, /rate|limit/i.test(error.message) ? 'Trop de demandes de lien en peu de temps. Réessaie dans une heure.' : 'Le lien n’a pas pu partir. Vérifie ton adresse et réessaie.', true);
  say(st, 'C’est parti : ouvre l’email reçu et clique sur le lien (pense à regarder les courriers indésirables). Tu reviendras directement ici.');
});

function rendreFil(threads) {
  const box = $('[data-conv-fil]');
  const msgs = threads.flatMap((t) => t.messages.map((m) => ({ ...m, t }))).sort((a, b) => a.created_at.localeCompare(b.created_at));
  fil = threads.find((t) => t.channel === 'conversation') || threads[0] || null;
  $('[data-conv-premier]').hidden = Boolean(fil);
  box.innerHTML = msgs.length
    ? msgs.map((m) => `<article class="conf-bulle is-${m.author}"><p class="conf-bulle-qui">${m.author === 'lamia' ? 'Lamia' : 'Toi'} · <time>${esc(quand(m.created_at))}</time></p>${m.body ? `<p class="conf-bulle-texte">${esc(m.body)}</p>` : ''}${piecesHtml(m.files)}</article>`).join('')
    : '<p class="conf-vide">Ta conversation commence ici. Écris à Lamia, ou laisse-lui un vocal.</p>';
  box.scrollTop = box.scrollHeight;
}

async function chargerConversation() {
  ({ data: { session } } = await supabase.auth.getSession());
  if (!conv) return;
  connexion.hidden = Boolean(session);
  conv.hidden = !session;
  if (!session) return;
  $('[data-conv-email]').textContent = session.user.email;
  if (!charge) $('[data-conv-fil]').innerHTML = '<p class="conf-vide">Un instant…</p>';
  try { const r = await api({ action: 'mes_conversations' }, session.access_token); rendreFil(r.threads); charge = true; }
  catch (err) { say($('[data-conv-statut]'), erreur(err.code), true); }
  clearInterval(minuteur);
  minuteur = setInterval(() => { if (document.visibilityState === 'visible' && !$('[data-panneau="conversation"]').hidden) chargerSilencieux(); }, 30000);
}
async function chargerSilencieux() { try { const r = await api({ action: 'mes_conversations' }, session.access_token); rendreFil(r.threads); } catch { /* */ } }

$('[data-conv-form]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, st = $('[data-conv-statut]'), btn = form.querySelector('[type=submit]');
  const f = new FormData(form);
  const fichiers = [...pjConv.get().map((x) => ({ blob: x, name: x.name }))];
  if (recConv.blob()) fichiers.push({ blob: recConv.blob(), name: 'message-vocal', duration: recConv.duree() });
  const premier = { action: 'ecrire', body: f.get('body'), thread_id: fil?.id || undefined, name: f.get('name'), consent: f.get('consent') === 'on' };
  if (!fil && !premier.consent) return say(st, erreur('consent_required'), true);
  btn.disabled = true; say(st, 'Envoi…');
  try {
    ({ data: { session } } = await supabase.auth.getSession());
    await envoyer(premier, fichiers, session?.access_token, (i, n) => say(st, `Envoi des fichiers (${i}/${n})…`));
    form.querySelector('textarea[name=body]').value = '';
    pjConv.vider(); recConv.vider(); $('[data-conv-vocal]').hidden = true;
    say(st, 'Envoyé. Lamia te répond dès qu’elle est disponible.');
    await chargerSilencieux();
  } catch (err) { say(st, erreur(err.code), true); }
  btn.disabled = false;
});

$('[data-conv-supprimer]')?.addEventListener('click', async () => {
  if (!fil) return;
  if (!window.confirm('Supprimer définitivement cette conversation, ses vocaux et ses fichiers ?')) return;
  try { await api({ action: 'supprimer_ma_conversation', thread_id: fil.id }, session.access_token); fil = null; await chargerSilencieux(); say($('[data-conv-statut]'), 'Ta conversation a été supprimée.'); }
  catch (err) { say($('[data-conv-statut]'), erreur(err.code), true); }
});
$('[data-conv-sortir]')?.addEventListener('click', async () => {
  try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 3000))]); } catch { /* */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
  location.replace('/confidences/#conversation'); location.reload();
});

// Arrivée par le lien de connexion, ou par un lien direct vers la conversation.
supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' && location.hash.includes('conversation')) setTimeout(() => ouvrir('conversation', false), 0); });
if (location.hash.startsWith('#conversation') || /access_token|type=magiclink/.test(location.hash)) ouvrir('conversation', false);
else if (location.hash === '#signaler') { const d = $('.conf-details'); if (d) d.open = true; }
