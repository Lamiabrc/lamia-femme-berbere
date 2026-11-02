// Parcours vers le mariage : il s'ouvre avec la discussion du match, les deux avancent ensemble.
// Une étape est franchie quand les deux l'ont validée ; la suivante s'ouvre alors.
// Les textes sont ceux de Lamia : c'est ici qu'on les modifie.

export const ETAPES = [
  {
    id: 'connaitre', titre: 'Se découvrir sans masque',
    texte: 'Prenez le temps de voir qui est vraiment en face. Ce que la personne montre, ce qu’elle vit au quotidien, ce qu’elle cherche et pourquoi maintenant.',
    questions: ['Pourquoi cherches-tu à te marier maintenant ?', 'À quoi ressemble ta vie de tous les jours ?', 'Qu’as-tu appris de tes relations passées ?'],
  },
  {
    id: 'valeurs', titre: 'Parler de ce qui compte',
    texte: 'La foi, la culture, la langue, la place des traditions. Mieux vaut le dire maintenant, simplement, que le découvrir après le mariage.',
    questions: ['Quelle place la religion a-t-elle dans ta vie, et dans celle de ton futur foyer ?', 'Qu’est-ce que tu veux transmettre de la culture kabyle ?', 'Sur quoi ne pourrais-tu jamais transiger ?'],
  },
  {
    id: 'foyer', titre: 'Imaginer le foyer',
    texte: 'Les enfants, la famille de chacun, le pays où vivre, le travail, l’argent. Le quotidien d’un couple se joue souvent ici.',
    questions: ['Veux-tu des enfants, et comment vois-tu leur éducation ?', 'Quelle place auront nos familles dans notre couple ?', 'Dans quel pays te vois-tu vivre, et comment partager l’argent et les tâches ?'],
  },
  {
    id: 'concessions', titre: 'Choisir ses concessions',
    texte: 'Personne ne coche toutes les cases. Dites ce que vous pouvez accepter par amour, et ce que vous accepteriez en le regrettant.',
    questions: ['Qu’es-tu prêt ou prête à changer pour notre couple ?', 'Qu’est-ce que tu n’attends surtout pas de moi ?', 'Comment réagis-tu quand on n’est pas d’accord ?'],
  },
  {
    id: 'yeux', titre: 'Ouvrir les yeux',
    texte: 'Aime, rêve, fais confiance… mais ne donne jamais ton cœur au point de perdre ton intelligence. Vérifiez que les paroles et les actes vont ensemble. Une demande d’argent, de la pression, des histoires qui changent ou un refus de se montrer sont des signaux d’alerte : parles-en à Lamia.',
    questions: ['Peut-on se voir en visio cette semaine ?', 'Tes proches savent-ils que tu me parles ?'],
  },
  {
    id: 'voix', titre: 'Passer au téléphone',
    texte: 'Si le courant passe, échangez vos numéros avec le bouton prévu, puis parlez-vous de vive voix. Une voix dit souvent ce qu’un message ne dit pas.',
    questions: [],
  },
  {
    id: 'rencontre', titre: 'Se rencontrer pour de vrai',
    texte: 'Première rencontre dans un lieu public, en journée, et en prévenant un proche. Si vous êtes loin, une visio avec un proche présent peut être une première étape.',
    questions: [],
  },
  {
    id: 'familles', titre: 'Présenter les familles',
    texte: 'Quand le projet devient sérieux, faites-le entrer dans la vie réelle : présentez-vous à vos proches et écoutez ce qu’ils voient.',
    questions: [],
  },
  {
    id: 'demande', titre: 'Dire oui',
    texte: 'Vous êtes décidés : la demande, les fiançailles, le mariage. Prévenez Lamia, elle veut partager cette joie avec vous.',
    questions: [],
  },
];

const valides = (d, cote) => { const l = d.parcours?.[cote]; return Array.isArray(l) ? l : []; };

// État du parcours vu par l'un des deux. Rien si le parcours n'est pas ouvert sur cette discussion.
export function vueParcours(d, cote) {
  if (!d.parcours_actif) return null;
  const autre = cote === 'a' ? 'b' : 'a';
  const moi = valides(d, cote), lui = valides(d, autre);
  let courante = ETAPES.findIndex((e) => !(moi.includes(e.id) && lui.includes(e.id)));
  if (courante < 0) courante = ETAPES.length;
  return {
    actif: !d.close_raison && (new Date(d.ferme_at) > new Date() || Boolean(d.a_numero && d.b_numero)),
    fini: courante === ETAPES.length, courante, total: ETAPES.length,
    etapes: ETAPES.map((e, i) => ({
      ...e, numero: i + 1, etat: i < courante ? 'faite' : i === courante ? 'en_cours' : 'a_venir',
      moi: moi.includes(e.id), lui: lui.includes(e.id),
    })),
  };
}

// Valider l'étape en cours pour soi. Renvoie le nouveau parcours, et ce qui vient de changer.
export function validerEtape(d, cote, etapeId) {
  const autre = cote === 'a' ? 'b' : 'a';
  const moi = valides(d, cote), lui = valides(d, autre);
  const courante = ETAPES.find((e) => !(moi.includes(e.id) && lui.includes(e.id)));
  if (!courante || courante.id !== etapeId) return { error: 'etape_non_ouverte' };
  if (moi.includes(etapeId)) return { parcours: d.parcours, deja: true };
  const parcours = { ...(d.parcours || {}), [cote]: [...moi, etapeId] };
  return { parcours, etape: courante, franchie: lui.includes(etapeId), fini: lui.includes(etapeId) && etapeId === ETAPES[ETAPES.length - 1].id };
}
