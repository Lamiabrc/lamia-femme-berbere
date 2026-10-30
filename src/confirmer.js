// Confirmation d'une fiche créée en live avec Lamia : la personne ouvre son lien personnel,
// voit sa fiche anonyme et choisit : « je confirme » (elle apparaît dans les profils) ou « je ne veux plus apparaître ».
import { api, esc } from './confidences-commun.js';
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
    ${f.profil ? `<h3>Qui je suis</h3><p>${esc(f.profil)}</p>` : ''}
    <h3>Qui je cherche${esc(ages)}</h3><p>${esc(f.recherche || 'À préciser avec Lamia.')}</p>
  </article>`;
}

const formulaire = `<form class="confirmer-modif" data-form-modif hidden><label>Qu’est-ce que tu veux changer dans ta fiche ?<textarea name="texte" rows="4" maxlength="1000" placeholder="Ex. : je n’habite plus à Lyon mais à Paris ; je cherche plutôt un homme de 35 à 42 ans…" required></textarea></label><button type="submit" class="po-btn">Envoyer ma demande à Lamia</button></form>`;
const effacer = `<p class="confirmer-note"><button type="button" class="confirmer-lien" data-effacer>Je ne veux plus du tout être dans l’outil de Lamia</button></p>`;

function afficher(d) {
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
    zone.innerHTML = `${fiche(f)}<div class="confirmer-etat"><p><strong>✅ Merci, ta fiche est confirmée.</strong> Elle porte maintenant la mention « ✅ confirmé » dans les profils de Lamia, toujours anonyme : personne ne voit ton prénom, ton TikTok ni ton numéro.</p>
      <p>Crée ton espace pour swiper les profils à ton tour et suivre tes mises en relation. Réponds « Oui » à la question « As-tu déjà créé ton profil en live avec Lamia ? » : ta fiche sera retrouvée et tes <strong>3 premières mises en relation sont offertes</strong>.</p>
      <p class="confirmer-actions"><a class="po-btn" href="/rencontres/#confier">Créer mon espace</a><button type="button" class="po-btn-verre" data-retirer>Je ne veux plus apparaître</button></p>${effacer}</div>`;
    return;
  }
  if (d.modif) {
    zone.innerHTML = `${fiche(f)}<div class="confirmer-etat"><p><strong>✏️ Ta demande de modification est envoyée à Lamia.</strong> Ta fiche reste affichée « en attente de confirmation » le temps que Lamia la corrige, puis elle te renvoie ce même lien pour que tu la valides.</p>
      <p class="confirmer-actions"><button type="button" class="po-btn" data-confirmer-oui>Finalement, je la confirme telle quelle</button><button type="button" class="po-btn-verre" data-modifier>Préciser ma demande</button></p>${formulaire}${effacer}</div>`;
    return;
  }
  zone.innerHTML = `<p class="confirmer-intro">Voici ta fiche, telle qu’elle apparaît sur le site avec la mention « en attente de confirmation ». Elle est <strong>anonyme</strong> : ni prénom, ni TikTok, ni numéro, ni photo. Seule Lamia sait qui tu es.</p>
    ${fiche(f)}
    <div class="confirmer-etat"><p>Tu es d’accord pour qu’elle reste dans les profils, pour que d’autres célibataires sérieux puissent la découvrir ?</p>
    <p class="confirmer-actions"><button type="button" class="po-btn" data-confirmer-oui>✅ Oui, je confirme ma fiche</button><button type="button" class="po-btn-verre" data-modifier>✏️ Je veux la modifier avant</button><button type="button" class="po-btn-verre" data-retirer>Non, je ne veux pas apparaître</button></p>
    ${formulaire}${effacer}</div>`;
}

async function agir(action, extra = {}) {
  zone.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try { afficher(await api({ action, n, t, ...extra })); }
  catch (e) { zone.innerHTML = `<p class="confirmer-erreur">${esc(ERREURS[e.code] || 'Un souci est survenu. Réessaie dans un instant.')}</p>`; }
}

zone.addEventListener('click', (e) => {
  if (e.target.closest('[data-confirmer-oui]')) agir('annonce_confirmer_outil');
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
