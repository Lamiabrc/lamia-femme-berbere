// Raisons d'un signalement : la même liste pour l'application et pour le serveur.
// Ce sont des impressions déclarées par un membre, jamais des faits établis : seule Lamia les lit, et rien n'est décidé automatiquement.
export const RAISONS_SIGNALEMENT = [
  ['papiers', 'Je pense que cette personne cherche des papiers'],
  ['predateur', 'Comportement de prédateur : insistance, pression, harcèlement'],
  ['pas_serieux', 'Pas sérieux : ne cherche pas le mariage'],
  ['sexuel', 'Contenu ou propos à caractère sexuel'],
  ['arnaque', 'Faux profil ou demande d’argent'],
  ['insultes', 'Insultes, menaces ou propos haineux'],
  ['mineur', 'Je pense que cette personne est mineure'],
  ['autre', 'Autre raison'],
];
// Libellés courts, pour l'alerte et le tableau de bord de Lamia.
export const RAISON_COURTE = { papiers: 'Suspicion papiers', predateur: 'Prédateur, harcèlement', pas_serieux: 'Pas sérieux', sexuel: 'Contenu sexuel', arnaque: 'Faux profil, argent', insultes: 'Insultes, menaces', mineur: 'Personne mineure ?', autre: 'Autre' };
// Le motif enregistré : la raison choisie, puis les précisions de la personne.
export const motifSignalement = (raison, details) => `${RAISON_COURTE[raison] || RAISON_COURTE.autre}${details ? ` : ${details}` : ''}`;
