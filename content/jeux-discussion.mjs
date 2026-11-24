// Jeux dans la bulle de chat (décision de Lamia du 22 nov. 2026, demandés le 24 nov. : « pour pimenter »).
// Légers et pudiques : les jeux intimes restent dans « Notre couple ». Partagé par le serveur et la page.
//
// Une carte envoyée devient un message lisible partout (même sans l'appli à jour) :
//   « Tu préfères… : Thé ou café ? ⟦jeu:preferes:0⟧ »   puis chaque réponse : « Café ⟦rep:preferes:0⟧ ».
// Révélation à deux : le serveur cache la réponse de l'autre tant qu'on n'a pas répondu soi-même.

export const JEUX = {
  preferes: {
    nom: 'Tu préfères…', sous: 'Choisis, sans réfléchir', choix: true,
    cartes: [
      ['Thé à la menthe', 'Café'],
      ['La mer', 'La montagne en Kabylie'],
      ['Un dîner au restaurant', 'Un repas fait maison'],
      ['Le matin', 'Le soir'],
      ['Un message vocal', 'Un message écrit'],
      ['Un voyage surprise', 'Un voyage préparé ensemble'],
      ['Les grandes fêtes de famille', 'Un repas en petit comité'],
      ['Couscous', 'Tajine'],
      ['Un film à la maison', 'Une balade'],
      ['Ville', 'Village'],
      ['Chanter faux à un mariage', 'Danser toute la nuit'],
      ['Chats', 'Chiens'],
    ],
  },
  quisuisje: {
    nom: 'Qui suis-je ?', sous: 'Devine, puis on vérifie',
    cartes: [
      'Devine : je suis plutôt lève-tôt ou couche-tard ?',
      'Devine mon plat préféré.',
      'Devine la ville ou le village d’où vient ma famille.',
      'Devine ce que je fais le dimanche matin.',
      'Devine mon chanteur ou ma chanteuse préféré·e.',
      'Devine si je suis plutôt calme ou plutôt bavard·e.',
      'Devine ma couleur préférée.',
      'Devine le métier dont je rêvais enfant.',
    ],
  },
  aime: {
    nom: 'Ce que j’aime le plus', sous: 'Pour se découvrir',
    cartes: [
      'Qu’est-ce qui te fait rire à coup sûr ?',
      'Ton endroit préféré au monde ?',
      'Le petit plaisir qui illumine ta journée ?',
      'La chanson que tu peux écouter en boucle ?',
      'Ce que tu préfères dans les fêtes kabyles ?',
      'La qualité que tu admires le plus chez quelqu’un ?',
      'Le souvenir d’enfance qui te fait sourire ?',
      'Ton moment préféré de la semaine ?',
    ],
  },
  verite: {
    nom: 'Action ou vérité douce', sous: 'Rien de gênant, promis',
    cartes: [
      'Vérité : ta première impression en voyant mon profil ?',
      'Vérité : qu’est-ce qui t’a fait dire oui ?',
      'Action : envoie trois mots qui te décrivent.',
      'Vérité : ta plus grosse bêtise d’enfant ?',
      'Action : raconte ta journée en une phrase et un adjectif.',
      'Vérité : un défaut que tu assumes ?',
      'Action : recommande-moi une chanson, sans dire pourquoi.',
      'Vérité : qu’est-ce qui te rend fier ou fière cette année ?',
    ],
  },
  quotidien: {
    nom: 'Moi au quotidien', sous: 'La vraie vie',
    cartes: [
      'Tu sais cuisiner ? Ton plat signature ?',
      'Ta couleur préférée ?',
      'Ton petit-déjeuner idéal ?',
      'Ménage : tu aimes, tu supportes ou tu fuis ?',
      'Ton passe-temps du moment ?',
      'Plutôt organisé·e ou plutôt improvisation ?',
      'Combien de temps pour te préparer le matin ?',
      'Ton plat de maman (ou de grand-mère) préféré ?',
    ],
  },
};

// « Premiers mots à toucher » : pour écrire sans peur, quand la discussion est encore vide.
export const PREMIERS_MOTS = [
  'Azul ! Ravi·e de ce match.',
  'Bonjour ! Qu’est-ce qui t’a fait dire oui ?',
  'Salut ! Tu es plutôt thé à la menthe ou café ?',
  'Azul ! Comment s’est passée ta journée ?',
  'Bonjour ! Ton plat préféré, pour commencer ?',
  'Salut ! Qu’est-ce qui te fait sourire en ce moment ?',
];

export const texteCarte = (jeu, i) => {
  const c = JEUX[jeu]?.cartes?.[i];
  if (c == null) return null;
  return Array.isArray(c) ? `${c[0]} ou ${c[1]} ?` : c;
};

const RE_JEU = /\s*⟦jeu:([a-z]+):(\d{1,3})⟧\s*$/;
const RE_REP = /\s*⟦rep:([a-z]+):(\d{1,3})⟧\s*$/;

export const messageCarte = (jeu, i) => `${JEUX[jeu].nom} : ${texteCarte(jeu, i)} ⟦jeu:${jeu}:${i}⟧`;
export const messageReponse = (jeu, i, texte) => `${texte} ⟦rep:${jeu}:${i}⟧`;

// Lit un message : carte, réponse ou message ordinaire.
export function lireJeu(texte) {
  const t = String(texte || '');
  let m = t.match(RE_JEU);
  if (m && texteCarte(m[1], Number(m[2])) != null) return { type: 'carte', cle: `${m[1]}:${m[2]}`, jeu: m[1], i: Number(m[2]), texte: t.replace(RE_JEU, '') };
  m = t.match(RE_REP);
  if (m) return { type: 'reponse', cle: `${m[1]}:${m[2]}`, jeu: m[1], i: Number(m[2]), texte: t.replace(RE_REP, '') };
  return null;
}
