// Espace de Lamia : conversations, lecture des confidences, réponses (texte, vocal, images), alertes.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { api, envoyer, erreur, esc, taille, quand, piecesHtml, PUBLIC_KEY } from './confidences-commun.js';
import { monterEnregistreur } from './enregistreur.js';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const $ = (s) => document.querySelector(s);
const say = (el, msg, err = false) => { if (!el) return; el.textContent = msg; el.classList.toggle('is-error', err); };
const CANAL = { ecrit: '✎', vocal: '🎙', conversation: '❦' };
let session = null, threads = [], filtre = 'a_lire', courant = null, minuteur = 0;

async function jetonFrais() { ({ data: { session } } = await supabase.auth.getSession()); return session?.access_token; }

function vue(nom) {
  for (const [k, sel] of [['login', '[data-login]'], ['liste', '[data-liste-vue]'], ['fil', '[data-fil-vue]'], ['reglages', '[data-reglages-vue]'], ['annonces', '[data-annonces-vue]']]) $(sel).hidden = k !== nom;
  $('[data-retour]').hidden = !['fil', 'reglages', 'annonces'].includes(nom);
  $('[data-ouvrir-reglages]').hidden = nom === 'login';
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- connexion
async function demarrer() {
  ({ data: { session } } = await supabase.auth.getSession());
  if (session?.user?.app_metadata?.role !== 'admin') { vue('login'); if (session) say($('[data-login-statut]'), 'Ce compte n’a pas le rôle administratrice.', true); return; }
  await chargerListe();
  api({ action: 'annonces_admin' }, await jetonFrais()).then(({ annonces }) => { const n = annonces.filter((a) => a.status === 'a_verifier').length; $('[data-n-annonces]').textContent = n || ''; }).catch(() => {});
  router();
  clearInterval(minuteur);
  minuteur = setInterval(() => { if (document.visibilityState === 'visible') (courant ? rafraichirFil() : chargerListe()); }, 30000);
  etatPush();
}
$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  say($('[data-login-statut]'), 'Un instant…');
  const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) return say($('[data-login-statut]'), 'Email ou mot de passe incorrect.', true);
  say($('[data-login-statut]'), '');
  demarrer();
});
$('[data-sortir]').addEventListener('click', async () => {
  try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 3000))]); } catch { /* */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
  location.replace('/confidences-lamia/');
});

// ---------------------------------------------------------------- liste
async function chargerListe() {
  try {
    const r = await api({ action: 'lamia_liste' }, await jetonFrais());
    threads = r.threads;
    $('[data-total]').textContent = r.non_lus ? `(${r.non_lus})` : '';
    document.title = r.non_lus ? `(${r.non_lus}) Confidences` : 'Confidences · Lamia';
    try { r.non_lus ? navigator.setAppBadge?.(r.non_lus) : navigator.clearAppBadge?.(); } catch { /* */ }
    rendreListe();
  } catch (err) { $('[data-liste]').innerHTML = `<li class="cl-vide">${esc(erreur(err.code))}</li>`; }
}
function rendreListe() {
  for (const s of ['a_lire', 'en_cours', 'termine']) { const n = threads.filter((t) => t.status === s).length; $(`[data-n="${s}"]`).textContent = n || ''; }
  document.querySelectorAll('[data-filtre]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtre === filtre)));
  const list = filtre === 'tous' ? threads : threads.filter((t) => t.status === filtre);
  $('[data-liste]').innerHTML = list.length ? list.map((t) => `<li><a class="cl-ligne${t.unread_lamia ? ' is-nonlu' : ''}" href="#${t.id}">
      <span class="cl-canal" aria-hidden="true">${CANAL[t.channel] || '✎'}</span>
      <span class="cl-ligne-texte"><strong>${esc(t.name)}</strong><small>${t.apercu?.author === 'lamia' ? 'Toi : ' : ''}${esc(t.apercu?.extrait || (t.channel === 'vocal' ? 'Message vocal' : 'Pièce jointe'))}</small></span>
      <span class="cl-ligne-droite"><time>${esc(quand(t.last_message_at))}</time>${t.unread_lamia ? `<b class="cl-pastille">${t.unread_lamia}</b>` : ''}</span></a></li>`).join('')
    : `<li class="cl-vide">${filtre === 'a_lire' ? 'Rien à lire pour le moment.' : 'Aucune conversation ici.'}</li>`;
}
document.querySelectorAll('[data-filtre]').forEach((b) => b.addEventListener('click', () => { filtre = b.dataset.filtre; rendreListe(); }));

// ---------------------------------------------------------------- une conversation
const rec = monterEnregistreur($('[data-vocal] [data-rec]'));
let images = [];
const rendrePj = () => { $('[data-pj]').innerHTML = images.map((f, i) => `<li>🖼 ${esc(f.name)} <small>${taille(f.size)}</small> <button type="button" class="cl-lien" data-retirer="${i}">Retirer</button></li>`).join(''); };
$('[data-images]').addEventListener('change', (e) => { for (const f of e.target.files) if (f.type.startsWith('image/') && images.length < 6) images.push(f); e.target.value = ''; rendrePj(); });
$('[data-pj]').addEventListener('click', (e) => { const i = e.target.closest('[data-retirer]')?.dataset.retirer; if (i != null) { images.splice(Number(i), 1); rendrePj(); } });
$('[data-ouvrir-vocal]').addEventListener('click', () => { const v = $('[data-vocal]'); v.hidden = !v.hidden; });

function rendreFil(t) {
  courant = t;
  $('[data-fil-nom]').textContent = t.name;
  $('[data-fil-coord]').innerHTML = `<a href="mailto:${esc(t.email)}">${esc(t.email)}</a>${t.phone ? ` · <a href="tel:${esc(t.phone.replace(/[^+\d]/g, ''))}">${esc(t.phone)}</a>` : ''} · ${t.channel === 'conversation' ? 'conversation privée' : t.channel === 'vocal' ? 'confidence vocale' : 'confidence écrite'}`;
  $('[data-fil-statut]').value = t.status;
  const box = $('[data-messages]');
  box.innerHTML = t.messages.map((m) => `<article class="cl-bulle is-${m.author}"><p class="cl-qui">${m.author === 'lamia' ? 'Toi' : esc(t.name)} · <time>${esc(quand(m.created_at))}</time></p>${m.body ? `<p class="cl-texte">${esc(m.body)}</p>` : ''}${piecesHtml(m.files)}</article>`).join('');
  box.lastElementChild?.scrollIntoView({ block: 'end' });
}
async function ouvrirFil(id) {
  vue('fil');
  $('[data-messages]').innerHTML = '<p class="cl-vide">Un instant…</p>';
  try { const r = await api({ action: 'lamia_fil', thread_id: id }, await jetonFrais()); rendreFil(r.thread); chargerListe(); }
  catch (err) { $('[data-messages]').innerHTML = `<p class="cl-vide">${esc(erreur(err.code))}</p>`; }
}
async function rafraichirFil() { if (!courant) return; try { const r = await api({ action: 'lamia_fil', thread_id: courant.id }, await jetonFrais()); if (r.thread.messages.length !== courant.messages.length) rendreFil(r.thread); } catch { /* */ } }

$('[data-fil-statut]').addEventListener('change', async (e) => {
  try { await api({ action: 'lamia_statut', thread_id: courant.id, status: e.target.value }, await jetonFrais()); courant.status = e.target.value; chargerListe(); }
  catch (err) { say($('[data-rep-statut]'), erreur(err.code), true); }
});
$('[data-repondre]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, st = $('[data-rep-statut]'), btn = form.querySelector('[type=submit]');
  const fichiers = images.map((f) => ({ blob: f, name: f.name }));
  if (rec.blob()) fichiers.push({ blob: rec.blob(), name: 'vocal-lamia', duration: rec.duree() });
  btn.disabled = true; say(st, 'Envoi…');
  try {
    await envoyer({ action: 'lamia_repondre', thread_id: courant.id, body: form.body.value }, fichiers, await jetonFrais(), (i, n) => say(st, `Envoi des fichiers (${i}/${n})…`));
    form.body.value = ''; images = []; rendrePj(); rec.vider(); $('[data-vocal]').hidden = true;
    say(st, 'Envoyé.');
    await ouvrirFil(courant.id);
  } catch (err) { say(st, erreur(err.code), true); }
  btn.disabled = false;
});
$('[data-supprimer]').addEventListener('click', async () => {
  if (!courant || !window.confirm(`Supprimer définitivement la conversation avec ${courant.name} (messages, vocaux, fichiers) ?`)) return;
  try { await api({ action: 'lamia_supprimer', thread_id: courant.id }, await jetonFrais()); courant = null; location.hash = ''; await chargerListe(); }
  catch (err) { say($('[data-rep-statut]'), erreur(err.code), true); }
});

// ---------------------------------------------------------------- navigation
function router() {
  if (!session) return;
  const h = location.hash.slice(1);
  if (h === 'reglages') { courant = null; vue('reglages'); chargerReglages(); return; }
  if (h === 'annonces') { courant = null; vue('annonces'); chargerAnnonces(); return; }
  if (/^[0-9a-f-]{36}$/i.test(h)) return ouvrirFil(h);
  courant = null; vue('liste'); rendreListe();
}
addEventListener('hashchange', router);
$('[data-retour]').addEventListener('click', () => { location.hash = ''; });
$('[data-ouvrir-reglages]').addEventListener('click', () => { location.hash = 'reglages'; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session) (courant ? rafraichirFil() : chargerListe()); });

// ---------------------------------------------------------------- notifications
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installee = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushPossible = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const cleVersOctets = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function abonnement() { if (!pushPossible) return null; const reg = await navigator.serviceWorker.getRegistration('/'); return reg ? reg.pushManager.getSubscription() : null; }
async function etatPush() {
  const sub = await abonnement().catch(() => null);
  const etat = $('[data-push-etat]'), alerte = $('[data-alerte-notif]');
  $('[data-ios-aide]').hidden = !(ios && !installee);
  $('[data-push-activer]').hidden = Boolean(sub);
  $('[data-push-couper]').hidden = !sub;
  let msg;
  if (!pushPossible) msg = ios && !installee ? 'Pour recevoir les notifications sur iPhone, installe d’abord cette page sur ton écran d’accueil (voir ci-dessous).' : 'Ce navigateur ne permet pas les notifications. Les alertes email restent actives.';
  else if (Notification.permission === 'denied') msg = 'Les notifications ont été refusées pour ce site. Autorise-les dans les réglages du navigateur ou du téléphone.';
  else msg = sub ? 'Activées sur cet appareil : tu reçois « Nouvelle confidence » ou « Nouveau message », sans le contenu.' : 'Pas encore activées sur cet appareil.';
  etat.textContent = msg;
  alerte.hidden = Boolean(sub);
  alerte.innerHTML = sub ? '' : 'Pour être prévenue sur ce téléphone, <a href="#reglages">active les notifications</a>.';
}
$('[data-push-activer]').addEventListener('click', async () => {
  const st = $('[data-push-statut]');
  if (!pushPossible) return say(st, ios ? 'Installe d’abord la page sur ton écran d’accueil, puis ouvre-la depuis l’icône « Confidences ».' : 'Ce navigateur ne permet pas les notifications.', true);
  try {
    say(st, 'Un instant…');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return say(st, 'Les notifications n’ont pas été autorisées.', true);
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const { publicKey } = await api({ action: 'push_cle' }, await jetonFrais());
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVersOctets(publicKey) });
    await api({ action: 'push_abonner', subscription: sub.toJSON(), label: `${ios ? 'iPhone/iPad' : /android/i.test(navigator.userAgent) ? 'Android' : 'Ordinateur'} · ${new Date().toLocaleDateString('fr-FR')}` }, await jetonFrais());
    say(st, 'C’est activé. Appuie sur « Envoyer un test » pour vérifier.');
  } catch (err) { say(st, `L’activation n’a pas fonctionné (${err.message || 'erreur'}).`, true); }
  etatPush();
});
$('[data-push-couper]').addEventListener('click', async () => {
  const sub = await abonnement().catch(() => null);
  if (sub) { await api({ action: 'push_desabonner', endpoint: sub.endpoint }, await jetonFrais()).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  say($('[data-push-statut]'), 'Notifications désactivées sur cet appareil.');
  etatPush();
});
$('[data-push-test]').addEventListener('click', async () => {
  const st = $('[data-push-statut]');
  try { const r = await api({ action: 'push_tester' }, await jetonFrais()); say(st, r.appareils ? `Test envoyé à ${r.appareils} appareil(s), ${r.recus} accepté(s) par le service de notification.` : 'Aucun appareil n’est encore abonné.', !r.recus); }
  catch (err) { say(st, erreur(err.code), true); }
});

// ---------------------------------------------------------------- réglages des alertes
const heures = ['<option value="">—</option>', ...Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h} h</option>`)].join('');
document.querySelectorAll('[name=silence_debut],[name=silence_fin]').forEach((s) => { s.innerHTML = heures; });
async function chargerReglages() {
  try {
    const { reglages: r, email_configure } = await api({ action: 'reglages' }, await jetonFrais());
    const f = $('[data-reglages]');
    for (const k of ['alertes_push', 'alertes_email', 'prevenir_visiteur']) f[k].checked = r[k];
    f.email_alerte.value = r.email_alerte;
    f.silence_debut.value = r.silence_debut ?? '';
    f.silence_fin.value = r.silence_fin ?? '';
    $('[data-email-etat]').textContent = email_configure ? 'Le service d’envoi d’emails est configuré.' : 'Le service d’envoi d’emails n’est pas encore configuré (clé RESEND_API_KEY à ajouter dans Vercel) : en attendant, seules les notifications fonctionnent.';
  } catch (err) { say($('[data-reglages-statut]'), erreur(err.code), true); }
  etatPush();
}
$('[data-reglages]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const reglages = { alertes_push: f.alertes_push.checked, alertes_email: f.alertes_email.checked, prevenir_visiteur: f.prevenir_visiteur.checked, email_alerte: f.email_alerte.value, silence_debut: f.silence_debut.value === '' ? null : Number(f.silence_debut.value), silence_fin: f.silence_fin.value === '' ? null : Number(f.silence_fin.value) };
  try { await api({ action: 'reglages_enregistrer', reglages }, await jetonFrais()); say($('[data-reglages-statut]'), 'Réglages enregistrés.'); }
  catch (err) { say($('[data-reglages-statut]'), erreur(err.code), true); }
});
$('[data-email-test]').addEventListener('click', async () => {
  const st = $('[data-reglages-statut]');
  try { await api({ action: 'email_tester' }, await jetonFrais()); say(st, 'Email de test envoyé.'); }
  catch (err) { say(st, err.code === 'email_not_configured' ? 'Le service d’emails n’est pas encore configuré.' : err.code === 'no_alert_email' ? 'Indique d’abord l’adresse qui reçoit les alertes, puis enregistre.' : 'L’email de test n’est pas parti.', true); }
});

supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') vue('login'); });
demarrer();

// ---------------------------------------------------------------- annonces de rencontre à vérifier
const STATUT_ANNONCE = { a_verifier: 'À vérifier', publiee: 'En ligne', refusee: 'Refusée' };
async function chargerAnnonces() {
  const box = $('[data-annonces]');
  box.innerHTML = '<p class="cl-vide">Chargement…</p>';
  try {
    const { annonces } = await api({ action: 'annonces_admin' }, await jetonFrais());
    const n = annonces.filter((a) => a.status === 'a_verifier').length;
    $('[data-n-annonces]').textContent = n || '';
    if (!annonces.length) { box.innerHTML = '<p class="cl-vide">Aucune annonce pour le moment.</p>'; return; }
    box.innerHTML = annonces.map((a) => `<article class="cl-carte cl-annonce" data-id="${a.id}">
      <p class="cl-coord"><b>N° ${a.ref}</b> · ${STATUT_ANNONCE[a.status] || a.status}${a.submitted_at ? ` · reçue le ${quand(a.submitted_at)}` : ''}</p>
      <h3>${esc(a.prenom)}, ${a.age} ans · ${a.genre === 'femme' ? 'femme' : 'homme'}</h3>
      <p class="cl-coord">${esc(a.ville)}, ${esc(a.pays)}${a.situation ? ` · ${esc(a.situation)}` : ''} · né(e) le ${esc(a.birth_date)}<br>${esc(a.email)}${a.phone ? ` · ${esc(a.phone)}` : ''}</p>
      <div class="cl-annonce-medias">${a.medias.map((m) => !m.url ? '' : m.kind === 'video' ? `<video src="${esc(m.url)}" controls playsinline preload="metadata"></video>` : `<a href="${esc(m.url)}" target="_blank" rel="noopener"><img src="${esc(m.url)}" alt="Photo"></a>`).join('')}</div>
      ${a.identite?.url ? `<div class="cl-annonce-id"><p><b>Pièce d’identité</b> (vérifie le prénom, l’âge et que le numéro est caché) :</p>${a.identite.mime === 'application/pdf' ? `<a class="cl-btn" href="${esc(a.identite.url)}" target="_blank" rel="noopener">Ouvrir le PDF</a>` : `<a href="${esc(a.identite.url)}" target="_blank" rel="noopener"><img src="${esc(a.identite.url)}" alt="Pièce d’identité"></a>`}</div>` : a.identite_verifiee_at ? `<p class="cl-aide">✓ Identité vérifiée le ${quand(a.identite_verifiee_at)} (pièce supprimée).</p>` : ''}
      <p><b>Qui je suis</b><br>${esc(a.profil)}</p>
      <p><b>Qui je cherche</b>${a.age_min || a.age_max ? ` (${a.age_min || 18}-${a.age_max || 99} ans)` : ''}<br>${esc(a.recherche)}</p>
      <label>Un mot pour la personne <small>(envoyé par email en cas de refus)</small><input data-note maxlength="600" value="${esc(a.note_lamia || '')}"></label>
      <div class="cl-outils">
        ${a.status !== 'publiee' ? '<button class="cl-btn cl-plein" type="button" data-decision="publier">✓ Publier</button>' : ''}
        ${a.status !== 'refusee' ? `<button class="cl-btn" type="button" data-decision="refuser">${a.status === 'publiee' ? 'Retirer du site' : 'Refuser'}</button>` : ''}
        <button class="cl-btn" type="button" data-decision="supprimer">Supprimer définitivement</button>
      </div>
      <p class="cl-statut" role="status" data-annonce-statut></p>
    </article>`).join('');
  } catch (err) { box.innerHTML = `<p class="cl-vide">${esc(erreur(err.code))}</p>`; }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-decision]');
  if (!b) return;
  const carte = b.closest('[data-id]'), st = carte.querySelector('[data-annonce-statut]');
  const d = b.dataset.decision;
  if (d === 'supprimer' && !confirm('Supprimer définitivement cette annonce et ses fichiers ?')) return;
  if (d === 'refuser' && !confirm('Refuser cette annonce ? Les photos et la pièce d’identité seront supprimées et la personne prévenue par email.')) return;
  say(st, 'Un instant…');
  try { await api({ action: 'annonce_moderer', annonce_id: carte.dataset.id, decision: d, note: carte.querySelector('[data-note]').value }, await jetonFrais()); await chargerAnnonces(); }
  catch (err) { say(st, erreur(err.code), true); }
});
$('[data-ouvrir-annonces]')?.addEventListener('click', () => { location.hash = 'annonces'; });
