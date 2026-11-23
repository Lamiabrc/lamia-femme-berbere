// « Bloquer et signaler » : la raison est obligatoire, les précisions facultatives.
import { RAISONS_SIGNALEMENT } from './signalement.mjs';
import { esc } from './confidences-commun.js';

export const SIGNALEMENT_HTML = `<fieldset class="signaler-raisons"><legend>Pourquoi signales-tu ce profil ?</legend>
${RAISONS_SIGNALEMENT.map(([code, texte]) => `<label><input type="radio" name="raison-signalement" value="${esc(code)}"> <span>${esc(texte)}</span></label>`).join('')}
</fieldset>
<label class="profil-motif">Que s’est-il passé ? (facultatif)<textarea rows="3" maxlength="500" data-motif></textarea></label>
<p class="signaler-note"><small>Seule Lamia lit ton signalement. La personne n’est pas prévenue et ne saura jamais qui l’a signalée. Décris des faits, sans insulte : c’est une impression, pas une accusation. Il est effacé au bout d’un an.</small></p>`;

// Ce que la personne a choisi dans `racine`, ou null (avec un message) tant qu'aucune raison n'est cochée.
export function lireSignalement(racine, statut) {
  const raison = racine.querySelector('input[name="raison-signalement"]:checked')?.value;
  if (!raison) { if (statut) statut.textContent = 'Choisis une raison pour envoyer ton signalement.'; return null; }
  return { raison, motif: racine.querySelector('[data-motif]')?.value || '' };
}

// Fenêtre complète, pour les pages qui n'ont pas la leur. Rend { raison, motif }, ou null si la personne renonce.
export function demanderSignalement(titre, intro) {
  return new Promise((fin) => {
    document.querySelector('.signaler-fenetre')?.remove();
    const d = document.createElement('div');
    d.className = 'swipe-fenetre signaler-fenetre'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="swipe-fenetre-boite"><h2>${esc(titre)}</h2><p>${esc(intro)}</p>${SIGNALEMENT_HTML}<p class="po-actions"><button type="button" class="po-btn" data-signaler-ok>Bloquer et signaler</button><button type="button" class="po-btn-verre" data-signaler-non>Annuler</button></p><p role="status" data-signaler-statut></p></div>`;
    document.body.appendChild(d);
    const fermer = (v) => { d.remove(); fin(v); };
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-signaler-non]')) return fermer(null);
      if (e.target.closest('[data-signaler-ok]')) { const v = lireSignalement(d, d.querySelector('[data-signaler-statut]')); if (v) fermer(v); }
    });
  });
}

// Dans une discussion : « Bloquer et signaler » ferme tout de suite, sans au revoir. Avant ça, on demande si la personne veut simplement arrêter
// (au revoir et raison, comme le dématch courtois) ou signaler un comportement. Rend 'polie', 'signaler', ou null si la personne renonce.
export function proposerFinPolie() {
  return new Promise((fin) => {
    document.querySelector('.signaler-fenetre')?.remove();
    const d = document.createElement('div');
    d.className = 'swipe-fenetre signaler-fenetre'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="swipe-fenetre-boite"><h2>Tu veux juste arrêter cette discussion ?</h2>
      <p>Si c’est simplement que ça ne colle pas, termine poliment : l’autre personne reçoit un au revoir et ta raison, et ça lui évite de se sentir ignorée.</p>
      <p>Signale seulement un comportement qui te dérange : la discussion est alors fermée tout de suite, sans message, et Lamia lit ton signalement.</p>
      <p class="po-actions"><button type="button" class="po-btn" data-fin-polie>Terminer poliment</button><button type="button" class="po-btn-verre" data-fin-signaler>Signaler un comportement</button></p>
      <p class="po-actions"><button type="button" class="link-button" data-fin-annuler>Annuler</button></p></div>`;
    document.body.appendChild(d);
    const fermer = (v) => { d.remove(); fin(v); };
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-fin-annuler]')) return fermer(null);
      if (e.target.closest('[data-fin-polie]')) return fermer('polie');
      if (e.target.closest('[data-fin-signaler]')) return fermer('signaler');
    });
  });
}
