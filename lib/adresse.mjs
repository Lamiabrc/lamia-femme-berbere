/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
// Comment l'application s'adresse aux membres : « A gma Rachid » à un homme, « A weltma Werda » à une femme.
// Dans un texte : {A} = l'adresse, {e} = l'accord au féminin (prévenu{e}).
// Genre inconnu : on retombe sur le prénom, sinon sur une phrase sans adresse.
// « Membre » : prénom de remplacement d'un profil créé depuis une fiche du live, jamais à afficher.
const joli = (prenom) => { const p = String(prenom ?? '').trim(); if (p === 'Membre') return ''; return p ? p[0].toLocaleUpperCase('fr-FR') + p.slice(1) : ''; };
export const adresse = (genre, prenom) => {
  const a = genre === 'homme' ? 'A gma' : genre === 'femme' ? 'A weltma' : '';
  return [a, joli(prenom)].filter(Boolean).join(' ');
};
export const accord = (genre) => (genre === 'homme' ? '' : genre === 'femme' ? 'e' : '·e');
export const aDesTrous = (s) => /\{A\}|\{e\}/.test(String(s ?? ''));

export function adresser(texte, { genre, prenom } = {}) {
  const a = adresse(genre, prenom);
  return String(texte ?? '')
    .replace(/\{A\}(, )?(.?)/gu, (_, virgule, suite) => {
      if (a) return `${a}${virgule || ''}${suite}`;
      return suite.toLocaleUpperCase('fr-FR');
    })
    .replaceAll('{e}', accord(genre));
}
