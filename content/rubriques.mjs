// Rubriques du Grenier. Chaque trouvaille porte une « famille » (metadata.famille) ;
// la rubrique affichée sur le site se déduit de cette famille.
// Ce fichier est partagé : site (copié dans /assets), tableau de bord et tests.

export const RUBRIQUES = [
  { id: 'musique', nom: 'Musique', familles: ['disques', 'cassettes', 'cd', 'partitions'] },
  { id: 'films', nom: 'Films', familles: ['dvd', 'vhs'] },
  { id: 'cartes', nom: 'Cartes postales', familles: ['cartes-postales', 'papiers'] },
  { id: 'bibelots', nom: 'Bibelots & déco', familles: ['objets', 'bibelots', 'decoration', 'cadres'] },
  { id: 'vaisselle', nom: 'Vaisselle', familles: ['vaisselle'] },
  { id: 'kabyle', nom: 'Souvenirs kabyles & algériens', familles: ['kabyle', 'algerie'] },
  { id: 'bijoux-anciens', nom: 'Bijoux anciens', familles: ['bijoux-anciens'] },
];

// Familles proposées dans le tableau de bord, avec leur libellé.
export const FAMILLES = [
  ['disques', 'Disques vinyles et 78 tours'],
  ['cassettes', 'Cassettes audio'],
  ['cd', 'CD'],
  ['partitions', 'Partitions et méthodes de musique'],
  ['dvd', 'DVD'],
  ['vhs', 'Cassettes VHS'],
  ['cartes-postales', 'Cartes postales'],
  ['papiers', 'Vieux papiers, affiches, images'],
  ['objets', 'Objets et bibelots'],
  ['decoration', 'Décoration'],
  ['cadres', 'Cadres, tableaux, statuettes'],
  ['vaisselle', 'Vaisselle'],
  ['kabyle', 'Objets kabyles'],
  ['algerie', 'Souvenirs d’Algérie'],
  ['bijoux-anciens', 'Bijoux anciens chinés'],
];

export function rubriqueDe(product) {
  const f = product?.metadata?.famille;
  const r = RUBRIQUES.find((x) => x.familles.includes(f));
  if (r) return r.id;
  if (/^carte/.test(product?.slug || '')) return 'cartes';
  return 'bibelots';
}
