// Les pièces de la Maison Lamia Femme Berbère, rangées par étage.
// La table `rooms` (migration 20261011120000) reprend ces mêmes slugs.
//
// status : 'open' (ouverte) | 'soon' (en préparation)
// accent : couleur d'émail associée à la pièce (voir --email-* dans maison.css)
// floor  : 0 rez-de-chaussée (la vente), 1 premier étage (rencontres, parole, lecture),
//          2 deuxième étage (trouvailles, galerie, atelier, communauté)
// productCategories : catégories de la table `products` affichées dans la pièce

export const floors = [
  { level: 0, name: 'Le rez-de-chaussée', theme: 'Les vitrines de la Maison' },
  { level: 1, name: 'Le premier étage', theme: 'Les rencontres, la parole et la lecture' },
  { level: 2, name: 'Le deuxième étage', theme: 'Les trouvailles et les ateliers' },
];

export const rooms = [
  // ---------- rez-de-chaussée : la vente
  { slug: 'hall', path: '/', floor: 0, name: 'Le Hall', welcome: 'Bienvenue chez Lamia.',
    summary: 'L’entrée de la Maison : qui est Lamia, son histoire, et toutes les pièces.', status: 'open', accent: 'rouge' },
  { slug: 'ecrin', path: '/ecrin/', floor: 0, name: 'L’Écrin', welcome: 'Les bijoux qui racontent d’où l’on vient.',
    summary: 'Bijoux kabyles émaillés, alliances et nouvelles collections de la Maison.', status: 'open', accent: 'vert', productCategories: ['bijoux'] },
  { slug: 'boutique', path: '/boutique/', floor: 0, name: 'La Boutique', welcome: 'Tout ce que la Maison propose.',
    summary: 'L’ensemble des bijoux, livres et trouvailles, rangés par pièce.', status: 'open', accent: 'rouge', productCategories: ['bijoux', 'livres', 'trouvailles'] },
  { slug: 'dressing', path: '/dressing/', floor: 0, name: 'Le Dressing de Lamia', welcome: 'Ce qu’on porte, ce qu’on prend soin de soi.',
    summary: 'Les vêtements, les accessoires et les cosmétiques de la Maison : foulards, robes, sacs, savons, soins, huiles et rituels de beauté. Les premières pièces se préparent.', status: 'soon', accent: 'safran' },
  { slug: 'coiffeuse', path: '/coiffeuse/', floor: 0, name: 'La Coiffeuse de Lamia', welcome: 'Le rouge, les bijoux, les gestes qui nous ressemblent.',
    summary: 'Le rouge à lèvres signature de Lamia et le maquillage. En préparation.', status: 'soon', accent: 'rouge' },

  // ---------- premier étage : rencontres, parole, lecture
  { slug: 'salon', path: '/salon/', floor: 1, name: 'Le Salon de Lamia', welcome: 'Installe-toi, on parle vrai.',
    summary: 'Les lives, les débats et les prises de parole de Lamia sur l’amour, le mariage, la transmission et les femmes berbères.', status: 'open', accent: 'rouge' },
  { slug: 'speed-dating', path: '/speed-dating/', floor: 1, name: 'Le Boudoir des Rencontres', welcome: 'Des rencontres vraies, dans un cadre sûr.',
    summary: 'Des soirées de speed dating en ligne pensées pour un public précis, des tête-à-tête courts, et Lamia qui veille.', status: 'open', accent: 'rouge' },
  { slug: 'bibliotheque', path: '/bibliotheque/', floor: 1, name: 'La Bibliothèque de Yemma', welcome: 'Ce que Yemma m’a transmis.',
    summary: 'Werdi, ouvre les yeux !, la collection Yemma Werdi, les ebooks et les conseils pour aimer avec les yeux ouverts.', status: 'open', accent: 'cobalt', productCategories: ['livres'] },
  { slug: 'confidences', path: '/confidences/', floor: 1, name: 'Le Cabinet des Confidences', welcome: 'Ici, derrière les volets, tu peux tout me dire.',
    summary: 'Alerter Lamia en toute confidentialité, être accompagnée, savoir comment la Maison te protège.', status: 'open', accent: 'cobalt' },

  // ---------- deuxième étage : trouvailles, galerie, atelier, communauté
  { slug: 'grenier', path: '/grenier/', floor: 2, name: 'Le Grenier des Trouvailles', welcome: 'Ce que j’ai déniché pour toi.',
    summary: 'Mes coups de cœur de brocante : livres anciennes éditions, bibelots, cadres, sculptures, cartes postales et pièces uniques.', status: 'open', accent: 'safran', productCategories: ['trouvailles'] },
  { slug: 'galerie', path: '/galerie/', floor: 2, name: 'La Galerie', welcome: 'Regarder, comprendre, transmettre.',
    summary: 'Le patrimoine des bijoux kabyles, l’émail, les symboles, et les créations de la Maison.', status: 'open', accent: 'safran' },
  { slug: 'atelier', path: '/atelier/', floor: 2, name: 'L’Atelier', welcome: 'Là où naissent les pièces.',
    summary: 'Les coulisses des créations, les artisans et les collaborations.', status: 'soon', accent: 'vert' },
  { slug: 'patio', path: '/patio/', floor: 2, name: 'Le Patio', welcome: 'La Maison se retrouve ici.',
    summary: 'Annonces, célébrations, témoignages et rendez-vous de la communauté.', status: 'open', accent: 'vert' },
];

export const roomBySlug = Object.fromEntries(rooms.map((r) => [r.slug, r]));

// Catégorie produit → pièce d'origine (pour l'affichage d'un produit dans sa pièce).
export const categoryRoom = { bijoux: 'ecrin', livres: 'bibliotheque', trouvailles: 'grenier' };
