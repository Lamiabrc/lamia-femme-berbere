// Les pièces de la Maison Lamia Femme Berbère, rangées par étage.
// La table `rooms` (migration 20261011120000) reprend ces mêmes slugs.
//
// status : 'open' (ouverte) | 'soon' (en préparation)
// accent : couleur d'émail associée à la pièce (voir --email-* dans maison.css)
// floor  : 0 rez-de-chaussée (la vente), 1 premier étage (rencontres, parole, lecture),
//          2 deuxième étage (trouvailles, galerie, atelier)
// productCategories : catégories de la table `products` affichées dans la pièce

export const floors = [
  { level: 0, name: 'Le rez-de-chaussée', theme: 'Les vitrines et la cour de la Maison' },
  { level: 1, name: 'Le premier étage', theme: 'Les rencontres, la parole et la lecture' },
  { level: 2, name: 'Le deuxième étage', theme: 'Les trouvailles, la galerie et l’atelier' },
];

export const rooms = [
  // ---------- rez-de-chaussée : la vente
  { slug: 'hall', path: '/', floor: 0, name: 'Le Hall', welcome: 'Bienvenue chez Lamia.', headline: 'Entrez dans l’univers de Lamia Femme Berbère',
    summary: 'Bijoux kabyles, livres, brocante, rencontres, lives et créations : la Maison réunit l’univers de Lamia entre Kabylie, Algérie et France.', status: 'open', accent: 'rouge' },
  { slug: 'ecrin', path: '/ecrin/', floor: 0, name: 'L’Écrin', welcome: 'Les bijoux qui racontent d’où l’on vient.', headline: 'Bijoux kabyles artisanaux et créations d’Ath Yenni',
    summary: 'La collection exclusive de bijoux kabyles de la Maison, fabriquée à Ath Yenni par ses artisans bijoutiers.', status: 'open', accent: 'vert', productCategories: ['bijoux'] },
  { slug: 'boutique', path: '/boutique/', floor: 0, name: 'La Boutique', welcome: 'Tout ce que la Maison propose.', headline: 'Sélection Lamia Femme Berbère',
    summary: 'L’ensemble des bijoux, livres et trouvailles, rangés par pièce.', status: 'open', accent: 'rouge', productCategories: ['bijoux', 'livres', 'trouvailles'] },
  { slug: 'dressing', path: '/dressing/', floor: 0, name: 'Le Dressing de Lamia', welcome: 'Ce qu’on porte, ce qu’on prend soin de soi.',
    summary: 'Les vêtements, les accessoires et les cosmétiques de la Maison : foulards, robes, sacs, savons, soins, huiles et rituels de beauté. Les premières pièces se préparent.', status: 'soon', accent: 'safran' },
  { slug: 'coiffeuse', path: '/coiffeuse/', floor: 0, name: 'La Coiffeuse de Lamia', welcome: 'Le rouge, les bijoux, les gestes qui nous ressemblent.',
    summary: 'Le rouge à lèvres signature de Lamia et le maquillage. En préparation.', status: 'soon', accent: 'rouge' },

  { slug: 'patio', path: '/patio/', floor: 0, name: 'Le Patio', welcome: 'La cour de la Maison, où l’on se retrouve.', headline: 'Trouve ton âme sœur avec Lamia',
    summary: 'Confie ton profil à Lamia, découvre des profils vérifiés et anonymes, et laisse-la faire le lien, en toute discrétion.', status: 'open', accent: 'vert' },

  // ---------- premier étage : rencontres, parole, lecture
  { slug: 'salon', path: '/salon/', floor: 1, name: 'Le Salon de Lamia', welcome: 'Installe-toi, on parle vrai.', headline: 'Lives en multistream, débats et mariage kabyle',
    summary: 'Les lives, les débats et les prises de parole de Lamia sur l’amour, le mariage, la transmission et la société.', status: 'open', accent: 'rouge' },
  { slug: 'speed-dating', path: '/speed-dating/', floor: 1, name: 'Le Boudoir des Rencontres', welcome: 'Des rencontres vraies, dans un cadre sûr.', headline: 'Speed dating sérieux en ligne',
    summary: 'Des soirées en visio, des tête-à-tête rapides et un cadre chaleureux pensé pour des rencontres sérieuses.', status: 'open', accent: 'rouge' },
  { slug: 'bibliotheque', path: '/bibliotheque/', floor: 1, name: 'La Bibliothèque de Yemma', welcome: 'Ce que Yemma m’a transmis.', headline: 'Livres et guides de transmission, amour et culture kabyle',
    summary: 'Werdi, ouvre les yeux !, la collection Yemma Werdi, les ebooks et les conseils pour aimer avec les yeux ouverts.', status: 'open', accent: 'cobalt', productCategories: ['livres'] },
  { slug: 'confidences', path: '/confidences/', floor: 1, name: 'Les Confidences avec Lamia', welcome: 'Un mot, un doute, une histoire… je t’écoute.',
    summary: 'Se confier à Lamia par écrit, par message vocal ou en conversation privée, et lui signaler un profil en toute discrétion.', status: 'open', accent: 'cobalt' },

  // ---------- deuxième étage : trouvailles, galerie, atelier, communauté
  { slug: 'grenier', path: '/grenier/', floor: 2, name: 'Le Grenier des Trouvailles', welcome: 'Ce que j’ai déniché pour toi.', headline: 'Brocante, objets anciens et coups de cœur de Lamia',
    summary: 'Disques, cartes postales, objets français, souvenirs kabyles, décoration, cadres, bibelots et pièces chinées : le Grenier rassemble mes trouvailles au fil des brocantes et des voyages.', status: 'open', accent: 'safran', productCategories: ['trouvailles'] },
  { slug: 'galerie', path: '/galerie/', floor: 2, name: 'La Galerie', welcome: 'Regarder, comprendre, transmettre.',
    summary: 'Le patrimoine des bijoux kabyles, l’émail, les symboles, et les créations de la Maison.', status: 'open', accent: 'safran' },
  { slug: 'atelier', path: '/atelier/', floor: 2, name: 'L’Atelier', welcome: 'Là où naissent les pièces.',
    summary: 'Les coulisses des créations, les artisans et les collaborations.', status: 'soon', accent: 'vert' },
];

export const roomBySlug = Object.fromEntries(rooms.map((r) => [r.slug, r]));

// Catégorie produit → pièce d'origine (pour l'affichage d'un produit dans sa pièce).
export const categoryRoom = { bijoux: 'ecrin', livres: 'bibliotheque', trouvailles: 'grenier' };
