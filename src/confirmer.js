// Confirmation d'une fiche créée en live avec Lamia : la personne ouvre son lien personnel,
// voit sa fiche anonyme et choisit : « je confirme » (elle apparaît dans les profils) ou « je ne veux plus apparaître ».
import { api, esc, PUBLIC_KEY, creerCompte } from './confidences-commun.js';
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
import { lib } from './matching-options.mjs';

const zone = document.querySelector('[data-confirmer]');
const q = new URLSearchParams(location.search);
const n = q.get('n'), t = q.get('t');

const ERREURS = {
  lien_invalide: 'Ce lien ne fonctionne pas. Vérifie que tu l’as copié en entier, ou écris à Lamia pour qu’elle te le renvoie.',
  texte_requis: 'Écris en quelques mots ce que tu veux changer.',
};

function fiche(f) {
  const infos = [f.age && `${f.age} ans`, f.pays && lib(f.pays), f.situation && lib(f.situation), f.enfants === 'Oui' ? 'avec enfant(s)' : f.enfants === 'Non' ? 'sans enfant' : '', f.etudes && `études : ${lib(f.etudes).toLowerCase()}`].filter(Boolean);
  const ages = f.age_min || f.age_max ? ` · ${f.age_min || 18} à ${f.age_max || 99} ans` : '';
  return `<article class="confirmer-fiche">
    <p class="confirmer-num">Fiche n° ${esc(f.ref)} · ${f.genre === 'femme' ? 'une femme' : 'un homme'}</p>
    <p class="confirmer-infos">${esc(infos.join(' · '))}</p>
    ${f.ville || f.village ? `<p class="confirmer-infos">${esc([f.ville, f.village && `village : ${f.village}`].filter(Boolean).join(' · '))}</p>` : ''}
    ${f.profil ? `<h3>Qui je suis</h3><p data-membre>${esc(f.profil)}</p>` : ''}
    <h3>Qui je cherche${esc(ages)}</h3><p>${esc(f.recherche || 'À préciser avec Lamia.')}</p>
  </article>`;
}

const formulaire = `<form class="confirmer-modif" data-form-modif hidden><label>Qu’est-ce que tu veux changer dans ta fiche ?<textarea name="texte" rows="4" maxlength="1000" placeholder="Ex. : je n’habite plus à Lyon mais à Paris ; je cherche plutôt un homme de 35 à 42 ans…" required></textarea></label><button type="submit" class="po-btn">Envoyer ma demande à Lamia</button></form>`;
const effacer = `<p class="confirmer-note"><button type="button" class="confirmer-lien" data-effacer>Je ne veux plus du tout être dans l’outil de Lamia</button></p>`;

// Quelqu'un a choisi cette fiche : son annonce anonyme, et ce qu'il reste à faire pour répondre.
function choisie(d) {
  const l = d.interets || [];
  if (!l.length) return '';
  const n = l.length, plus = n > 3 ? `<p class="confirmer-note">Et ${n - 3} autre${n - 3 > 1 ? 's' : ''} : tu les verras dans ton espace.</p>` : '';
  const suite = d.confirme && d.compte
    ? '<p class="confirmer-actions"><a class="po-btn" href="/mon-espace/#interets">Répondre dans mon espace</a></p>'
    : d.confirme
      ? '<p><strong>Dernière étape :</strong> crée ton accès ci-dessous pour répondre.</p>'
      : '<p><strong>Pour répondre, il te reste à confirmer ta fiche, créer ton compte et ajouter 2 photos.</strong> C’est gratuit et ça prend une minute. Personne ne verra ton prénom, tes contacts ni tes photos dans les profils.</p><p class="confirmer-actions"><button type="button" class="po-btn" data-aller-confirmer>Confirmer ma fiche et créer mon compte</button></p>';
  return `<section class="confirmer-choisie">
    <h2><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> ${n > 1 ? `${n} personnes s’intéressent` : 'Quelqu’un s’intéresse'} à toi</h2>
    <p>${n > 1 ? 'Voici leurs annonces, anonymes comme la tienne.' : 'Voici son annonce, anonyme comme la tienne.'}</p>
    ${l.slice(0, 3).map(fiche).join('')}${plus}${suite}
  </section>`;
}

function afficher(d) {
  afficherFiche(d);
  if (!d.retire && !d.efface) zone.insertAdjacentHTML('afterbegin', choisie(d));
  // Arrivée depuis « Modifier mon annonce » : le formulaire s'ouvre directement.
  if (location.hash === '#modifier') zone.querySelector('[data-modifier]')?.click();
}
function afficherFiche(d) {
  const f = d.fiche;
  if (d.efface) {
    zone.innerHTML = `<div class="confirmer-etat"><p><strong>C’est noté.</strong> Ta fiche est retirée du site et Lamia est prévenue : elle va l’effacer de son outil de matching.</p><p>Merci d’être passé·e en live, et belle route à toi.</p></div>`;
    return;
  }
  if (d.retire) {
    zone.innerHTML = `${fiche(f)}<div class="confirmer-etat"><p><strong>Ta fiche n’apparaît plus sur le site.</strong> C’est noté, et Lamia est prévenue. Si tu changes d’avis, écris-lui.</p><p><a class="po-btn-verre" href="/confidences/">Écrire à Lamia</a></p></div>`;
    return;
  }
  if (d.confirme) {
    zone.innerHTML = `${fiche(f)}<div class="confirmer-etat"><p><strong><svg class="ico" aria-hidden="true"><use href="/icones.svg#circle-check"/></svg> Merci, ta fiche est confirmée.</strong> Elle porte maintenant la mention « confirmé » dans les profils de Lamia, toujours anonyme : personne ne voit ton prénom, ton TikTok ni ton numéro.</p>
      <p>C’est fait ! Tes <strong>3 premières mises en relation sont offertes</strong>.</p>
      <p class="confirmer-actions"><button type="button" class="po-btn-verre" data-retirer>Je ne veux plus apparaître</button></p>${effacer}</div>${acces(d)}`;
    monterAcces(d);
    return;
  }
  if (d.modif) {
    zone.innerHTML = `${fiche(f)}<div class="confirmer-etat"><p><strong><svg class="ico" aria-hidden="true"><use href="/icones.svg#pencil"/></svg> Ta demande de modification est envoyée à Lamia.</strong> Ta fiche reste affichée « en attente de confirmation » le temps que Lamia la corrige, puis elle te renvoie ce même lien pour que tu la valides.</p>
      <p class="confirmer-actions"><button type="button" class="po-btn" data-confirmer-oui>Finalement, je la confirme telle quelle</button><button type="button" class="po-btn-verre" data-modifier>Préciser ma demande</button></p>${formulaire}${effacer}</div>${acces(d)}`;
    monterAcces(d);
    return;
  }
  // Une seule étape : la fiche, puis un seul bouton qui confirme et crée l'accès.
  zone.innerHTML = `<p class="confirmer-intro">Voici ta fiche. Elle est <strong>anonyme</strong> : ni prénom, ni TikTok, ni numéro, ni photo.</p>
    ${fiche(f)}
    <div class="confirmer-etat" data-simple><p class="annonce-vide">Un instant…</p></div>
    <p class="confirmer-note">Pas tout à fait ça ? <button type="button" class="confirmer-lien" data-modifier>Modifier ma fiche</button> · <button type="button" class="confirmer-lien" data-retirer>Ne pas apparaître</button></p>
    ${formulaire}${effacer}`;
  monterSimple();
}

// Confirme la fiche et la relie au compte, en un seul geste. L'accord de la personne reste explicite : c'est le bouton « Je confirme ».
async function monterSimple() {
  const z = zone.querySelector('[data-simple]');
  if (!z) return;
  const { data: { session } } = await supabase.auth.getSession();
  const finir = async (s, dire) => {
    try { await api({ action: 'annonce_lier_fiche_outil', n, t }, s.access_token); }
    catch (e) { dire(e.code === 'deja_liee' ? 'Cette fiche est déjà reliée à un autre compte. Écris à Lamia pour qu’elle t’aide.' : 'Ça n’a pas fonctionné. Réessaie dans un instant.'); return; }
    await agir('annonce_confirmer_outil');
    // La fiche est confirmée : direction l'espace pour ajouter les photos, obligatoires pour swiper et répondre.
    location.assign('/mon-espace/#photos');
  };
  if (session) {
    z.innerHTML = `<p>Tu es connecté·e avec <strong>${esc(session.user.email)}</strong>.</p><p class="confirmer-actions"><button type="button" class="po-btn" data-tout><svg class="ico" aria-hidden="true"><use href="/icones.svg#circle-check"/></svg> Je confirme ma fiche</button></p><p class="confirmer-note" data-simple-msg></p>`;
    z.querySelector('[data-tout]').addEventListener('click', (e) => { e.target.disabled = true; const msg = z.querySelector('[data-simple-msg]'); finir(session, (x) => { msg.textContent = x; e.target.disabled = false; }); });
    return;
  }
  z.innerHTML = `<form class="confirmer-modif" data-simple-form>
    <p><strong>Tu es d’accord pour apparaître dans les profils ?</strong> Choisis ton accès, puis ajoute 2 photos de toi (elles restent privées) :</p>
    <label>Ton prénom<input name="prenom" autocomplete="given-name" required></label>
    <label>Ton email<input name="email" type="email" autocomplete="email" required></label>
    <label>Un mot de passe (8 caractères minimum)<input name="mdp" type="password" minlength="8" autocomplete="new-password" required></label>
    <button type="submit" class="po-btn" data-tout><svg class="ico" aria-hidden="true"><use href="/icones.svg#circle-check"/></svg> Je confirme ma fiche</button>
    <p class="confirmer-note" data-simple-msg role="status"></p></form>`;
  const f = z.querySelector('form'), msg = f.querySelector('[data-simple-msg]'), bouton = f.querySelector('[data-tout]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dire = (x) => { msg.innerHTML = x; bouton.disabled = false; };
    bouton.disabled = true; msg.textContent = 'Un instant…';
    const email = f.email.value.trim(), mdp = f.mdp.value;
    try { await creerCompte({ email, password: mdp, prenom: f.prenom.value.trim(), source: 'fiche-live' }); }
    catch (err) { if (err.code !== 'compte_existe') return dire(err.code === 'trop_de_demandes' ? 'Plusieurs comptes viennent d’être créés depuis cette connexion. Réessaie dans une heure.' : 'Le compte n’a pas pu être créé. Réessaie dans un instant.'); }
    // Si l'email a déjà un compte, le mot de passe saisi suffit à s'y connecter.
    const co = await supabase.auth.signInWithPassword({ email, password: mdp });
    if (co.error) return dire('Cet email a déjà un compte, avec un autre mot de passe. Saisis le bon, ou <a href="/mon-espace/">choisis-en un nouveau</a>, puis reviens sur ce lien.');
    await finir(co.data.session, dire);
  });
}

// Accès direct : la personne crée son compte (ou se connecte) et sa fiche y est reliée.
// Elle suit ensuite sa fiche et les intérêts reçus dans « Mon espace », et reçoit un email à chaque intérêt.
const acces = (d) => `<div class="confirmer-etat confirmer-acces" data-acces>
  <h2>${d.compte ? 'Ton accès' : 'Crée ton accès pour suivre ta fiche'}</h2>
  <p>Avec ton accès, tu vois dans ton espace qui s’intéresse à ta fiche (anonymement), tu réponds « ça m’intéresse aussi » ou non, et tu reçois un email à chaque nouvel intérêt.</p>
  <div data-acces-zone><p class="annonce-vide">Un instant…</p></div></div>`;
async function monterAcces(d) {
  const z = zone.querySelector('[data-acces-zone]');
  if (!z) return;
  const { data: { session } } = await supabase.auth.getSession();
  const lier = async (s) => {
    try { await api({ action: 'annonce_lier_fiche_outil', n, t }, s.access_token); z.innerHTML = `<p><strong>✓ Ta fiche est reliée à ton compte (${esc(s.user.email)}).</strong></p><p><a class="po-btn" href="/mon-espace/#interets">Voir mon espace</a></p>`; }
    catch (e) { z.innerHTML = `<p class="confirmer-erreur">${e.code === 'deja_liee' ? 'Cette fiche est déjà reliée à un autre compte. Si c’est une erreur, écris à Lamia.' : 'La liaison n’a pas fonctionné. Réessaie dans un instant.'}</p>`; }
  };
  if (session && d.compte) { z.innerHTML = `<p><strong>✓ Ta fiche est reliée à ton compte (${esc(session.user.email)}).</strong></p><p><a class="po-btn" href="/mon-espace/">Aller dans mon espace</a></p>`; return; }
  if (session) { z.innerHTML = `<p>Tu es connecté·e avec <strong>${esc(session.user.email)}</strong>.</p><p><button type="button" class="po-btn" data-lier>Relier ma fiche à ce compte</button></p>`; z.querySelector('[data-lier]').onclick = () => lier(session); return; }
  z.innerHTML = `<form class="confirmer-modif" data-acces-form>
    <p class="confirmer-actions"><button type="button" class="po-btn-verre is-on" data-mode="creer">Je crée mon accès</button><button type="button" class="po-btn-verre" data-mode="connexion">J’ai déjà un compte</button></p>
    <label data-seul-creer>Ton prénom<input name="prenom" autocomplete="given-name"></label>
    <label>Ton email<input name="email" type="email" autocomplete="email" required></label>
    <label>Mot de passe (8 caractères minimum)<input name="mdp" type="password" minlength="8" autocomplete="new-password" required></label>
    <button type="submit" class="po-btn" data-acces-ok>Créer mon accès</button>
    <p class="confirmer-note" data-seul-connexion hidden>Mot de passe oublié, ou jamais choisi ? <a href="/mon-espace/">Recevoir un lien pour en choisir un</a>, puis reviens sur ce lien.</p>
    <p class="confirmer-note" data-acces-msg></p></form>`;
  const f = z.querySelector('form'); let mode = 'creer';
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; mode = b.dataset.mode; f.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('is-on', x === b)); f.querySelector('[data-seul-creer]').hidden = mode !== 'creer'; f.querySelector('[data-seul-connexion]').hidden = mode === 'creer'; f.querySelector('[data-acces-ok]').textContent = mode === 'creer' ? 'Créer mon accès' : 'Me connecter'; f.mdp.autocomplete = mode === 'creer' ? 'new-password' : 'current-password'; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = f.querySelector('[data-acces-msg]'); const email = f.email.value.trim(), mdp = f.mdp.value;
    msg.textContent = 'Un instant…';
    if (mode === 'creer') {
      try { await creerCompte({ email, password: mdp, prenom: f.prenom.value.trim(), source: 'fiche-live' }); }
      catch (err) { if (err.code !== 'compte_existe') { msg.textContent = err.code === 'trop_de_demandes' ? 'Plusieurs comptes viennent d’être créés depuis cette connexion. Réessaie dans une heure.' : 'Le compte n’a pas pu être créé. Vérifie ton email, et un mot de passe d’au moins 8 caractères.'; return; } }
    }
    const co = await supabase.auth.signInWithPassword({ email, password: mdp });
    if (co.error) { msg.textContent = mode === 'creer' ? 'Un compte existe déjà avec cet email : choisis « J’ai déjà un compte ».' : 'Email ou mot de passe incorrect.'; return; }
    await lier(co.data.session);
  });
}

async function agir(action, extra = {}) {
  zone.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try { afficher(await api({ action, n, t, ...extra })); }
  catch (e) { zone.innerHTML = `<p class="confirmer-erreur">${esc(ERREURS[e.code] || 'Un souci est survenu. Réessaie dans un instant.')}</p>`; }
}

zone.addEventListener('click', (e) => {
  if (e.target.closest('[data-aller-confirmer]')) { const c = zone.querySelector('[data-simple]'); c?.scrollIntoView({ behavior: 'smooth', block: 'center' }); c?.querySelector('input, [data-tout]')?.focus({ preventScroll: true }); }
  else if (e.target.closest('[data-confirmer-oui]')) agir('annonce_confirmer_outil');
  else if (e.target.closest('[data-retirer]') && confirm('Ta fiche ne sera plus visible sur le site. Tu confirmes ?')) agir('annonce_retirer_outil');
  else if (e.target.closest('[data-modifier]')) { const fm = zone.querySelector('[data-form-modif]'); fm.hidden = false; fm.querySelector('textarea').focus(); }
  else if (e.target.closest('[data-effacer]') && confirm('Ta fiche sera retirée du site et Lamia l’effacera de son outil de matching. Tu confirmes ?')) agir('annonce_effacer_outil');
});
zone.addEventListener('submit', (e) => {
  if (!e.target.closest('[data-form-modif]')) return;
  e.preventDefault();
  agir('annonce_modifier_outil', { texte: e.target.texte.value.trim() });
});

if (!n || !t) zone.innerHTML = `<p class="confirmer-erreur">${esc(ERREURS.lien_invalide)}</p>`;
else agir('annonce_fiche_outil');
