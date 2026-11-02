// Comment l'application s'adresse aux membres : « A gma » à un homme, « A weltma » à une femme.
// Dans un texte : {A} = l'adresse, {e} = l'accord au féminin (prévenu{e}).
// Genre inconnu : on retombe sur le prénom, sinon sur une phrase sans adresse.
export const adresse = (genre) => (genre === 'homme' ? 'A gma' : genre === 'femme' ? 'A weltma' : '');
export const accord = (genre) => (genre === 'homme' ? '' : genre === 'femme' ? 'e' : '·e');
export const aDesTrous = (s) => /\{A\}|\{e\}/.test(String(s ?? ''));

export function adresser(texte, { genre, prenom } = {}) {
  const a = adresse(genre);
  return String(texte ?? '')
    .replace(/\{A\}(, )?(.?)/gu, (_, virgule, suite) => {
      if (a) return `${a}${virgule || ''}${suite}`;
      if (prenom) return `${prenom}${virgule || ''}${suite}`;
      return suite.toLocaleUpperCase('fr-FR');
    })
    .replaceAll('{e}', accord(genre));
}
