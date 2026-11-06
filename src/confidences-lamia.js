// Intégré au tableau de bord (onglet Rencontres) : sans en-tête ni menu, directement sur la gestion des profils.
if (new URLSearchParams(location.search).has('integre')) document.documentElement.classList.add('cl-integre');
// Espace de Lamia : conversations, lecture des confidences, réponses (texte, vocal, images), alertes.
import { createClient } from '/vendor/supabase.mjs';
import { api, envoyer, erreur, esc, taille, quand, piecesHtml, PUBLIC_KEY } from './confidences-commun.js';
import { monterEnregistreur } from './enregistreur.js';
import { versOutil, lib } from './matching-options.mjs';

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
  { // Ouvrir le profil de la personne, dans un nouvel onglet pour garder la conversation.
    const cible = t.profil?.ref ? `#profil-${t.profil.ref}` : t.profil?.user_id ? `#compte-${t.profil.user_id}` : '';
    $('[data-fil-coord]').insertAdjacentHTML('beforeend', cible
      ? ` <a class="cl-btn cl-fil-profil" href="/tableau-de-bord${cible}" target="_blank" rel="noopener">👤 Ouvrir son profil${t.profil.ref ? ` n° ${t.profil.ref}` : ''}</a>`
      : ' <small class="cl-fil-profil">Aucun profil avec cet email.</small>');
  }
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
  if (h === 'annonces' || /^annonce-\d+$/.test(h)) { courant = null; vue('annonces'); chargerAnnonces(); chargerSansPhotos(); chargerDemandes(); chargerAbonnes(); chargerNouveautes(); return; }
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
// ---------------------------------------------------------------- écrire à quelqu'un : message préparé, puis l'application du réseau
const boutonEcrire = (ref, role = '') => (ref ? `<div class="cl-ecrire"><button class="cl-btn" type="button" data-ecrire="${ref}" data-role="${role}">💬 Envoyer un message au n° ${ref}</button></div>` : '');
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ecrire]');
  if (!b) return;
  const zone = b.parentElement;
  const dejaLa = zone.querySelector('[data-ecrire-zone]');
  if (dejaLa) { dejaLa.remove(); return; }
  b.disabled = true;
  const panneau = document.createElement('div');
  panneau.className = 'cl-ecrire-zone'; panneau.dataset.ecrireZone = '';
  try {
    const r = await api({ action: 'annonce_contact_preparer', ref: b.dataset.ecrire, role: b.dataset.role }, await jetonFrais());
    panneau.innerHTML = `${r.dernier_at ? `<p class="cl-aide">✉️ Déjà ouvert le ${quand(r.dernier_at)}</p>` : ''}
      <label>Message préparé <small>(tu peux le changer)</small><textarea data-ecrire-texte rows="6">${esc(r.message)}</textarea></label>
      <div class="cl-outils">${r.lien ? `<a class="cl-btn cl-plein" href="${esc(r.lien)}" target="_blank" rel="noopener" data-ecrire-ouvrir="${r.ref}">Copier et ouvrir ${esc(r.reseau)}</a>` : `<button class="cl-btn cl-plein" type="button" data-ecrire-ouvrir="${r.ref}">Copier le message</button>`}</div>
      <p class="cl-statut" role="status" data-ecrire-statut>${r.lien ? (r.reseau === 'WhatsApp' ? '' : `Dans ${esc(r.reseau)} : touche Message, colle, envoie.`) : 'Je n’ai pas encore son réseau sur le site.'}</p>`;
  } catch (err) {
    panneau.innerHTML = `<p class="cl-statut is-error">${err.code === 'fiche_retiree' ? 'Cette personne a retiré sa fiche : pas de message.' : esc(erreur(err.code))}</p>`;
  }
  b.disabled = false;
  zone.append(panneau);
});
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-ecrire-ouvrir]');
  if (!o) return;
  const p = o.closest('[data-ecrire-zone]'), t = p.querySelector('[data-ecrire-texte]'), st = p.querySelector('[data-ecrire-statut]');
  // Copié pendant le toucher, avant de quitter la page : sinon iPhone refuse.
  const secours = () => { t.select(); try { return document.execCommand('copy'); } catch { return false; } };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t.value).catch(secours); else secours();
  if (st) say(st, 'Message copié.');
  jetonFrais().then((j) => api({ action: 'annonce_contact_note', ref: o.dataset.ecrireOuvrir }, j)).catch(() => {});
});

const STATUT_ANNONCE = { a_verifier: 'À vérifier', publiee: 'Validé', refusee: 'Refusé' };
let dernieresAnnonces = [];
async function chargerAnnonces() {
  const box = $('[data-annonces]');
  box.innerHTML = '<p class="cl-vide">Chargement…</p>';
  try {
    const { annonces } = await api({ action: 'annonces_admin' }, await jetonFrais());
    const n = annonces.filter((a) => a.status === 'a_verifier').length;
    $('[data-n-annonces]').textContent = n || '';
    if (!annonces.length) { box.innerHTML = '<p class="cl-vide">Aucune annonce pour le moment.</p>'; return; }
    dernieresAnnonces = annonces;
    const aExporter = annonces.filter((a) => a.status === 'publiee' && !a.exportee_at).length;
    $('[data-export-info]').textContent = aExporter ? `${aExporter} annonce(s) publiée(s) pas encore dans l’outil.` : 'Toutes les annonces publiées sont déjà dans l’outil.';
    box.innerHTML = annonces.map((a) => `<article class="cl-carte cl-annonce" data-id="${a.id}" id="annonce-${a.ref}">
      <p class="cl-coord"><b>N° ${a.ref}</b> · ${STATUT_ANNONCE[a.status] || a.status}${a.submitted_at ? ` · reçue le ${quand(a.submitted_at)}` : ''}</p>
      ${boutonEcrire(a.ref)}
      <h3>${a.genre === 'femme' ? 'Femme' : 'Homme'}, ${a.age} ans</h3>
      <p class="cl-badges">${[a.test ? '🧪 PROFIL DE TEST (invisible du public)' : '',a.live_declare ? (a.outil_lie ? '🎥 Créé en live · fiche retrouvée dans l’outil · 3 offertes' : '🎥 Dit avoir été en live · fiche à retrouver · 3 offertes') : a.outil_lie ? '🔗 Déjà dans ton outil (même lien)' : '', a.compte ? '👤 Compte lié' : '', a.photo_partage ? '📷 Photo transmissible au match' : '🚫📷 Photo à ne pas transmettre', a.en_match ? '💞 Match en cours' : '', a.modifiee_at ? `✏️ Modifié le ${quand(a.modifiee_at)}` : ''].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('')}</p>
      <p class="cl-coord">Prénom : ${esc(a.prenom)} · ${esc(a.ville)}, ${esc(a.pays)}${a.situation ? ` · ${esc(a.situation)}` : ''} · né(e) le ${esc(a.birth_date)}<br>${esc(a.email)}${a.phone ? ` · ${esc(a.phone)}` : ''}</p>
      <div class="cl-annonce-medias">${a.medias.map((m) => !m.url ? '' : m.kind === 'video' ? `<video src="${esc(m.url)}" controls playsinline preload="metadata"></video>` : `<a href="${esc(m.url)}" target="_blank" rel="noopener"><img src="${esc(m.url)}" alt="Photo"></a>`).join('')}</div>
      ${a.identite?.url ? `<div class="cl-annonce-id"><p><b>Pièce d’identité</b> (vérifie le prénom, l’âge et que le numéro est caché) :</p>${a.identite.mime === 'application/pdf' ? `<a class="cl-btn" href="${esc(a.identite.url)}" target="_blank" rel="noopener">Ouvrir le PDF</a>` : `<a href="${esc(a.identite.url)}" target="_blank" rel="noopener"><img src="${esc(a.identite.url)}" alt="Pièce d’identité"></a>`}</div>` : a.identite_verifiee_at ? `<p class="cl-aide">✓ Identité vérifiée le ${quand(a.identite_verifiee_at)} (pièce supprimée).</p>` : ''}
      ${a.matching && Object.keys(a.matching).length ? `<p class="cl-coord">${[a.matching.situation, a.matching.enfants === 'Oui' ? `${a.matching.nbEnfants || ''} enfant(s)` : a.matching.enfants === 'Non' ? 'sans enfant' : '', a.matching.niveauEtudeDetail || a.matching.niveauEtudeCategorie, a.matching.profession, a.matching.religion, a.matching.pratique, ...(a.matching.origineTags || [])].filter(Boolean).map(lib).map(esc).join(' · ')}${a.matching.contactReseau ? `<br>Réseau : ${esc(a.matching.contactReseau)}` : ''}</p>` : ''}
      ${a.exportee_at ? `<p class="cl-aide">↪ Exportée vers l’outil de matching le ${quand(a.exportee_at)}</p>` : ''}
      ${(a.interets || []).length ? `<p class="cl-match-demande">💌 Match demandé : intéressé(e) par le profil n° ${a.interets.join(', ')}</p>` : ''}
      <p class="cl-aide">${a.anonyme_ok ? (a.visible_anonyme ? '👁 Affiché anonymement dans les Rencontres' : 'Accepte d’être affiché(e) anonymement') : 'N’a pas accepté l’affichage anonyme'}</p>
      <p><b>Qui je suis</b><br>${esc(a.profil)}</p>
      <p><b>Qui je cherche</b>${a.age_min || a.age_max ? ` (${a.age_min || 18}-${a.age_max || 99} ans)` : ''}<br>${esc(a.recherche)}</p>
      ${a.status === 'publiee' ? `<div class="cl-resultat"><label>Profils compatibles trouvés dans ton outil<input data-nb type="number" min="0" max="9999" inputmode="numeric" value="${a.nb_compatibles ?? ''}"></label><button class="cl-btn cl-plein" type="button" data-decision="resultat">Envoyer le résultat</button>${a.resultat_envoye_at ? `<small>Envoyé le ${quand(a.resultat_envoye_at)} (${a.nb_compatibles} profil(s))</small>` : ''}</div>` : ''}
      <label>Un mot pour la personne <small>(ajouté à l’email de résultat ou de refus)</small><input data-note maxlength="600" value="${esc(a.note_lamia || '')}"></label>
      <div class="cl-outils">
        ${a.status !== 'publiee' ? '<button class="cl-btn cl-plein" type="button" data-decision="publier">✓ Valider le profil</button>' : ''}
        ${a.status !== 'refusee' ? `<button class="cl-btn" type="button" data-decision="refuser">${a.status === 'publiee' ? 'Retirer le profil' : 'Refuser'}</button>` : ''}
        ${a.status === 'publiee' ? '<button class="cl-btn" type="button" data-exporter-une>↪ Fiche pour l’outil de matching</button>' : ''}
        ${a.status === 'publiee' ? `<span class="cl-aide">${a.visible_anonyme ? '👁 Affiché anonymement dans les Rencontres' : a.anonyme_ok ? 'Pour l’afficher dans les Rencontres : ton outil, écran « Le site » → Publier' : 'La personne n’a pas accepté l’affichage anonyme'}</span>${a.visible_anonyme ? ' <button class="cl-btn" type="button" data-decision="masquer">Retirer du Patio</button>' : ''}` : ''}
        ${a.medias.length ? '<button class="cl-btn" type="button" data-decision="photos_refuser">📷 Photos non conformes : en redemander</button>' : ''}
        <button class="cl-btn" type="button" data-decision="supprimer">Supprimer définitivement</button>
      </div>
      <p class="cl-statut" role="status" data-annonce-statut></p>
    </article>`).join('');
    // Lien direct vers une annonce (depuis la fiche de l'outil).
    const h = location.hash.slice(1);
    if (/^annonce-\d+$/.test(h)) document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { box.innerHTML = `<p class="cl-vide">${esc(erreur(err.code))}</p>`; }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-decision]');
  if (!b) return;
  const carte = b.closest('[data-id]'), st = carte.querySelector('[data-annonce-statut]');
  const d = b.dataset.decision;
  if (d === 'supprimer' && !confirm('Supprimer définitivement cette annonce et ses fichiers ?')) return;
  if (d === 'refuser' && !confirm('Refuser ce profil ? Les photos et la pièce d’identité seront supprimées et la personne prévenue par email.')) return;
  if (d === 'photos_refuser' && !confirm('Supprimer ses photos et lui en redemander ? Son swipe est bloqué jusqu’aux nouvelles photos, et elle est prévenue.')) return;
  if (d === 'bonus_match' && !confirm('Offrir un match de plus à ce profil ? C’est 1 match toutes les 2 semaines au maximum.')) return;
  if (d === 'resultat') { const nb = carte.querySelector('[data-nb]')?.value; if (nb === '' || nb == null) return say(st, 'Indique le nombre de profils compatibles.', true); if (!confirm(`Envoyer à cette personne : ${nb} profil(s) compatible(s) ?`)) return; }
  say(st, 'Un instant…');
  try { await api({ action: 'annonce_moderer', annonce_id: carte.dataset.id, decision: d, note: carte.querySelector('[data-note]').value, nb: carte.querySelector('[data-nb]')?.value }, await jetonFrais()); await chargerAnnonces(); }
  catch (err) { say(st, erreur(err.code), true); }
});
$('[data-ouvrir-annonces]')?.addEventListener('click', () => { location.hash = 'annonces'; });

// ---------------------------------------------------------------- export vers l'outil local de matching (fichier JSON à importer)
async function photoReduite(url) {
  if (!url) return '';
  try {
    const blob = await (await fetch(url)).blob();
    const img = await createImageBitmap(blob);
    const k = Math.min(1, 480 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return ''; }
}
async function exporter(liste) {
  const st = $('[data-export-statut]');
  if (!liste.length) return say(st, 'Rien à exporter : publie d’abord une annonce.', true);
  say(st, `Préparation de ${liste.length} fiche(s)…`);
  const profiles = [];
  for (const a of liste) {
    const photo = (a.medias || []).find((m) => m.kind === 'photo');
    profiles.push(versOutil(a, { photoDataUrl: await photoReduite(photo?.url) }));
  }
  const fichier = new Blob([JSON.stringify({ source: 'lamia-femme-berbere.com', exporte_le: new Date().toISOString(), profiles }, null, 2)], { type: 'application/json' });
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(fichier);
  lien.download = `annonces-site-pour-matching-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(lien); lien.click(); lien.remove();
  try { await api({ action: 'annonces_exportees', ids: liste.map((a) => a.id) }, await jetonFrais()); } catch { /* */ }
  say(st, `Fichier téléchargé (${profiles.length} fiche(s)). Dans ton outil de matching : la liste des profils, bouton « Import CSV/JSON », puis ce fichier.`);
  chargerAnnonces();
}
$('[data-exporter-nouvelles]')?.addEventListener('click', () => exporter(dernieresAnnonces.filter((a) => a.status === 'publiee' && !a.exportee_at)));
$('[data-exporter-toutes]')?.addEventListener('click', () => exporter(dernieresAnnonces.filter((a) => a.status === 'publiee')));
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-exporter-une]');
  if (!b) return;
  const a = dernieresAnnonces.find((x) => x.id === b.closest('[data-id]').dataset.id);
  if (a) exporter([a]);
});

// ---------------------------------------------------------------- abonnés et achats à l'unité
const FORMULES_NOMS = { coeur: 'Cœur (ancienne formule)', passion: 'Passion · 9 €', prestige: 'Prestige' };
const ETATS = { actif: 'actif', impaye: 'paiement en retard', resilie: 'résilié', en_attente: 'en attente', suspendu: 'suspendu' };
// Profils sans photos : le compte, et la notification envoyée à la demande de Lamia, par lots.
async function chargerSansPhotos() {
  try { const r = await api({ action: 'annonce_relance_medias' }, await jetonFrais()); $('[data-n-sans-photos]').textContent = `(${r.manquent})`; const b = $('[data-relance-medias]'); b.disabled = !r.a_prevenir; b.textContent = r.a_prevenir ? `Envoyer la notification à ${r.a_prevenir} profil${r.a_prevenir > 1 ? 's' : ''}` : 'Tous ont été notifiés'; } catch { /* */ }
}
$('[data-relance-medias]')?.addEventListener('click', async (e) => {
  if (!confirm('Envoyer la notification « il manque tes photos » à ces profils ? Elle ne part qu’une fois par personne.')) return;
  const st = $('[data-relance-statut]'); e.target.disabled = true; let total = 0, recus = 0;
  try { for (let i = 0; i < 100; i += 1) { const r = await api({ action: 'annonce_relance_medias', envoyer: true }, await jetonFrais()); total += r.traites; recus += r.notifies; st.textContent = `${total} traité(s)…`; if (!r.a_prevenir) break; }
    st.textContent = `C’est fait : ${total} profil(s) traité(s), ${recus} notification(s) reçue(s) sur un téléphone. Les autres verront la demande en ouvrant l’application.`; }
  catch { st.textContent = 'L’envoi s’est arrêté. Clique à nouveau : ceux déjà faits ne recevront rien de plus.'; }
  chargerSansPhotos();
});
async function chargerAbonnes() {
  const box = $('[data-abonnes]');
  if (!box) return;
  try {
    const { abonnes = [], unites = [] } = await api({ action: 'annonce_abonnes' }, await jetonFrais());
    const actifs = abonnes.filter((a) => ['actif', 'impaye'].includes(a.statut));
    $('[data-n-abonnes]').textContent = actifs.length ? `(${actifs.length})` : '';
    const d = (x) => x ? new Date(x).toLocaleDateString('fr-FR') : '';
    box.innerHTML = (abonnes.length || unites.length ? '' : '<p class="cl-vide">Pas encore d’abonné.</p>')
      + abonnes.map((a) => `<p class="cl-coord"><b>${esc(FORMULES_NOMS[a.formule] || a.formule)}</b>${a.periode === 'an' ? ' (annuel)' : ''} · ${esc(a.nom || '')} · ${esc(a.email)} · ${esc(ETATS[a.statut] || a.statut)}${a.resiliation_prevue ? ' · se termine' : ''}${a.fin_periode ? ` le ${d(a.fin_periode)}` : ''}</p>`).join('')
      + unites.map((u) => `<p class="cl-coord">${({ speed_dating: '🎟 Speed dating', photo_match: '📷 Photo du match (1 h)', mise_en_relation: '🤝 Match supplémentaire', coaching: '🎥 Visio de 15 minutes', coaching_30: '🎥 Coaching de 30 minutes', sauver_couple: '💞 Sauver mon couple', live_priorite: '📣 Priorité en live', prolonger_discussion: '⏳ Discussion prolongée', profil_avant: '🌟 Profil mis en avant', qui_choisi: '💞 Qui m’a choisi·e (24 h)' })[u.type] || u.type} · ${esc(u.nom || '')} · ${esc(u.email)} · ${u.quantite - u.utilisees}/${u.quantite} restant(es) · ${d(u.created_at)} ${u.utilisees < u.quantite ? `<button type="button" class="cl-btn cl-petit" data-unite-utiliser="${u.id}">Utiliser 1</button>` : ''}</p>`).join('');
    box.querySelectorAll('[data-unite-utiliser]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await api({ action: 'annonce_unite_utiliser', id: b.dataset.uniteUtiliser }, await jetonFrais()); } catch { /* */ }
      chargerAbonnes();
    }));
  } catch { box.innerHTML = '<p class="cl-vide">Les abonnés n’ont pas pu s’afficher.</p>'; }
}

// ---------------------------------------------------------------- matchs demandés (« ce profil m'intéresse »)
const STATUT_DEMANDE = { a_traiter: 'À traiter', mis_en_relation: 'Mis en relation (match actif)', en_reserve: '🗂 Gardé en réserve', pas_compatible: 'Pas compatible', dematche: 'Dématché' };
async function chargerDemandes() {
  const box = $('[data-demandes]');
  if (!box) return;
  try {
    const { demandes, personnes = {} } = await api({ action: 'matchs_demandes' }, await jetonFrais());
    const n = demandes.filter((d) => d.statut === 'a_traiter').length;
    $('[data-n-demandes]').textContent = n ? `(${n})` : '';
    if (!demandes.length) { box.innerHTML = '<p class="cl-vide">Aucune demande pour le moment.</p>'; return; }
    const qui = (p) => (p?.genre || p?.age ? `n° ${p.ref} · ${p.genre === 'femme' ? 'Femme' : p.genre === 'homme' ? 'Homme' : 'Profil'}, ${p.age} ans${p.ville ? `, ${esc(p.ville)}` : ''}${p.pays ? ` (${esc(lib(p.pays))})` : ''}${p.contact ? `<br><small>${esc(p.contact)}</small>` : ''}` : `n° ${p?.ref} <small>(profil retiré ou inconnu)</small>`);
    // Regroupées par personne : ses matchs demandés du plus fort au plus faible potentiel, pour n'en choisir qu'un.
    const niveau = (sc) => (sc == null ? ['?', 'is-inconnu', 'à vérifier dans ton outil'] : sc >= 75 ? [sc, 'is-fort', 'fort potentiel'] : sc >= 50 ? [sc, 'is-moyen', 'potentiel moyen'] : [sc, 'is-faible', 'faible potentiel']);
    const groupes = new Map();
    for (const d of demandes) { const k = d.demandeur?.ref ?? '?'; if (!groupes.has(k)) groupes.set(k, { qui: d.demandeur, liste: [] }); groupes.get(k).liste.push(d); }
    const ordre = [...groupes.values()].map((g) => {
      g.liste.sort((x, y) => (y.statut === 'a_traiter') - (x.statut === 'a_traiter') || (y.potentiel?.score ?? -1) - (x.potentiel?.score ?? -1));
      g.aTraiter = g.liste.filter((d) => d.statut === 'a_traiter').length;
      g.reserve = g.liste.filter((d) => d.statut === 'en_reserve').length;
      g.enRelation = g.liste.some((d) => d.statut === 'mis_en_relation');
      g.meilleur = g.enRelation ? null : g.liste.find((d) => d.statut === 'a_traiter');
      return g;
    }).sort((x, y) => (y.aTraiter > 0) - (x.aTraiter > 0) || (y.meilleur?.potentiel?.score ?? -1) - (x.meilleur?.potentiel?.score ?? -1));
    box.innerHTML = ordre.map((g) => `<section class="cl-carte cl-groupe">
      <h4>${qui(g.qui)}</h4>
      ${g.qui?.ref ? boutonEcrire(g.qui.ref, 'demandeur') : ''}
      <p class="cl-coord">${g.liste.length} match(s) demandé(s)${g.aTraiter ? ` · <b>${g.aTraiter} à traiter</b>` : ''}${g.reserve ? ` · 🗂 ${g.reserve} en réserve` : ''}${(personnes[g.qui?.ref]?.matchs_en_cours || 0) > 1 ? ` · <b>💞 ${personnes[g.qui.ref].matchs_en_cours} matchs en cours</b>` : g.enRelation ? ' · <b>💞 déjà mis(e) en relation</b>' : g.aTraiter ? ' · 🤖 le site s’en occupe : rien à faire' : ''}${g.qui?.status && g.qui.status !== 'publiee' ? ' · <b class="cl-a-verifier">⏳ profil pas encore vérifié</b>' : ''}</p>
      ${g.liste.map((d) => { const [sc, cl, txt] = niveau(d.potentiel?.score); return `<article class="cl-demande${d === g.meilleur ? ' is-meilleur' : ''}" data-demande="${d.id}">
        <div class="cl-pot ${cl}" title="${txt}"><b>${sc}</b><small>/100</small></div>
        <div class="cl-demande-corps">
          <p class="cl-coord">${d.potentiel?.outil ? '<b class="cl-source">algorithme de ton outil</b> · ' : d.potentiel?.provisoire ? '<b class="cl-provisoire">note provisoire : synchronise ton outil</b> · ' : ''}${d === g.meilleur ? '<b class="cl-meilleur">⭐ Meilleur potentiel</b> · ' : ''}${d.reciproque ? '<b class="cl-reciproque">💞 RÉCIPROQUE</b> · ' : ''}${d.via === 'swipe' ? '💘 swipe · ' : ''}${quand(d.created_at)} · ${txt}</p>
          <p>💌 → ${qui(d.cible)}</p>
          ${d.statut === 'a_traiter' ? `<p class="cl-coord">${d.reciproque || d.reponse === 'oui' ? '🤖 Les deux ont dit oui : la mise en relation se fera toute seule dès que les différences éventuelles sont acceptées.' : d.cible_compte === false ? '📭 Cette personne n’a pas de compte : elle ne peut pas répondre tant qu’elle n’a pas confirmé sa fiche.' : '⏳ En attente de la réponse de l’autre personne. Si elle dit oui, la mise en relation est automatique.'}</p>` : ''}
          ${d.potentiel && (d.potentiel.forts.length || d.potentiel.vigilance.length) ? `<details><summary>Pourquoi ce score</summary>${d.potentiel.forts.length ? `<p class="cl-forts">✓ ${d.potentiel.forts.map(esc).join('<br>✓ ')}</p>` : ''}${d.potentiel.vigilance.length ? `<p class="cl-vigilance">⚠ ${d.potentiel.vigilance.map(esc).join('<br>⚠ ')}</p>` : ''}</details>` : ''}
          <label>Statut<select data-demande-statut>${Object.entries(STATUT_DEMANDE).map(([k, v]) => `<option value="${k}"${k === d.statut ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
          ${boutonEcrire(d.cible_ref ?? d.cible?.ref, 'cible')}
        </div>
      </article>`; }).join('')}
      ${(() => { const pp = personnes[g.qui?.ref] || {}; const prop = pp.proposes || [], sug = pp.suggestions || [];
        return `${prop.length ? `<div class="cl-jauge"><h5>💌 Proposés par toi</h5>${prop.map((x) => { const [sc, cl] = niveau(x.score); return `<p><span class="cl-pot ${cl} is-petit"><b>${sc}</b></span> n° ${x.cible_ref} · ${x.reponse === 'oui' ? '✅ ça l’intéresse' : x.reponse === 'non' ? '✖ pas pour elle / lui' : '⏳ en attente de réponse'}</p>`; }).join('')}</div>` : ''}
        ${sug.length ? `<div class="cl-jauge"><h5>🧭 Meilleurs scores de ton outil, pas encore demandés ni proposés</h5>${sug.map((x) => { const [sc, cl] = niveau(x.score); return `<p><span class="cl-pot ${cl} is-petit"><b>${sc}</b></span> n° ${x.ref}${x.niveau ? ` · ${esc(x.niveau)}` : ''} <button class="cl-btn" type="button" data-proposer="${g.qui.ref}" data-cible="${x.ref}" data-score="${x.score}">💌 Lui proposer</button></p>`; }).join('')}</div>` : ''}`; })()}
    </section>`).join('');
  } catch (err) { box.innerHTML = `<p class="cl-vide">${esc(erreur(err.code))}</p>`; }
}
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-demande-statut]');
  if (!sel) return;
  try {
    await api({ action: 'match_demande_statut', id: sel.closest('[data-demande]').dataset.demande, statut: sel.value }, await jetonFrais());
    // Une seule mise en relation par personne : proposer de clore ses autres demandes en attente.
    if (sel.value === 'mis_en_relation') {
      const autres = [...sel.closest('.cl-groupe').querySelectorAll('[data-demande]')].filter((x) => x !== sel.closest('[data-demande]') && x.querySelector('[data-demande-statut]').value === 'a_traiter');
      if (autres.length && confirm(`Garder les ${autres.length} autre(s) demande(s) de cette personne en réserve ?\n\nSi ce match se termine, celles qui sont toujours disponibles repasseront « à traiter » et tu recevras une alerte avec le meilleur potentiel.`)) {
        const jeton = await jetonFrais();
        for (const x of autres) await api({ action: 'match_demande_statut', id: x.dataset.demande, statut: 'en_reserve' }, jeton).catch(() => {});
      }
    }
    chargerDemandes();
  } catch { /* */ }
});

// ---------------------------------------------------------------- clé de liaison avec l'outil de matching
$('[data-outil-cle]')?.addEventListener('click', async () => {
  const st = $('[data-outil-statut]');
  if (!confirm('Créer une nouvelle clé de liaison ? L’ancienne clé ne fonctionnera plus dans ton outil.')) return;
  try {
    const { cle } = await api({ action: 'outil_cle' }, await jetonFrais());
    $('[data-outil-valeur]').value = cle; $('[data-outil-zone]').hidden = false;
    say(st, 'Copie cette clé et colle-la dans ton outil (écran « Le site »). Elle ne sera plus affichée ensuite.');
  } catch (err) { say(st, erreur(err.code), true); }
});
$('[data-outil-copier]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('[data-outil-valeur]').value); say($('[data-outil-statut]'), 'Clé copiée.'); } catch { $('[data-outil-valeur]').select(); } });

// ---------------------------------------------------------------- nouveautés : publier un article / une actu / un live, voir ce qui est parti
async function chargerNouveautes() {
  const box = $('[data-nouv-liste]');
  if (!box) return;
  try {
    const { nouveautes = [], abonnes = 0, types = {} } = await api({ action: 'annonce_nouveautes_admin' }, await jetonFrais());
    const attente = nouveautes.filter((n) => !n.envoyee_at).length;
    $('[data-n-nouv]').textContent = attente ? `(${attente} en attente)` : '';
    box.innerHTML = `<p class="cl-aide">🔔 ${abonnes} téléphone(s) de membres abonnés aux notifications.${attente ? ` <button class="cl-btn" type="button" data-nouv-envoyer>Envoyer les ${attente} en attente maintenant</button>` : ''}</p>`
      + nouveautes.slice(0, 15).map((n) => { const t = types[n.type] || {}; return `<p class="cl-nouv" style="border-left:5px solid ${t.couleur || '#999'}">${t.emoji || ''} <b>${esc(n.titre)}</b> <small>· ${quand(n.created_at)} · ${n.envoyee_at ? `envoyée (${n.nb_envoyes})` : 'en attente'}</small> <button class="cl-btn" type="button" data-nouv-suppr="${n.id}" aria-label="Supprimer">✕</button></p>`; }).join('');
  } catch (err) { box.innerHTML = `<p class="cl-vide">${esc(erreur(err.code))}</p>`; }
}
$('[data-nouv-form]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, st = $('[data-nouv-statut]');
  say(st, 'Un instant…');
  try {
    const r = await api({ action: 'annonce_nouveaute_publier', type: f.type.value, titre: f.titre.value, texte: f.texte.value, lien: f.lien.value, envoyer: f.envoyer.checked }, await jetonFrais());
    say(st, f.envoyer.checked ? `Publiée et envoyée sur ${r.envoyes || 0} téléphone(s).` : 'Publiée (pas encore envoyée).');
    f.titre.value = ''; f.texte.value = ''; f.lien.value = '';
    chargerNouveautes();
  } catch (err) { say(st, erreur(err.code), true); }
});
document.addEventListener('click', async (e) => {
  const env = e.target.closest('[data-nouv-envoyer]'), sup = e.target.closest('[data-nouv-suppr]');
  if (env) { env.disabled = true; try { await api({ action: 'annonce_nouveautes_envoyer' }, await jetonFrais()); } catch { /* */ } chargerNouveautes(); }
  if (sup && confirm('Supprimer cette nouveauté du fil ?')) { try { await api({ action: 'annonce_nouveaute_suppr', id: sup.dataset.nouvSuppr }, await jetonFrais()); } catch { /* */ } chargerNouveautes(); }
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-proposer]');
  if (!b) return;
  if (!confirm(`Proposer le profil n° ${b.dataset.cible} à la personne n° ${b.dataset.proposer} ? Elle le verra dans son espace LFB (fiche anonyme) et recevra une notification.`)) return;
  b.disabled = true;
  try { await api({ action: 'annonce_proposer', pour: b.dataset.proposer, cible: b.dataset.cible, score: b.dataset.score }, await jetonFrais()); b.textContent = '✅ Proposé'; }
  catch (err) { b.disabled = false; alert(err.code === 'pas_de_compte' ? 'Cette personne n’a pas encore de compte LFB.' : 'La proposition n’est pas partie. Réessaie.'); }
});
