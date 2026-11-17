// Les petites images de « Notre couple » (Lamia, 16 nov. 2026 : « des images au lieu d'emoji, une ambiance d'amour »).
// Dessins maison en SVG, aux couleurs de la Maison : un médaillon dégradé (rose, lilas, or, menthe) et un trait bordeaux.
const COEUR = 'M24 33.5s-9.5-5.9-9.5-12.4a5.2 5.2 0 0 1 9.5-2.9 5.2 5.2 0 0 1 9.5 2.9c0 6.5-9.5 12.4-9.5 12.4z';
const petitCoeur = (x, y, k = 0.45) => `<path transform="translate(${x} ${y}) scale(${k}) translate(-24 -24)" d="${COEUR}" fill="#E0567A" stroke="none"/>`;
const visage = (bouche, yeux = '<circle cx="20" cy="22" r="1.4" fill="#7A1F35" stroke="none"/><circle cx="28" cy="22" r="1.4" fill="#7A1F35" stroke="none"/>') => `<circle cx="24" cy="24.5" r="11" fill="#fff"/>${yeux}${bouche}<circle cx="17.5" cy="27" r="1.6" fill="#F7B6C6" stroke="none"/><circle cx="30.5" cy="27" r="1.6" fill="#F7B6C6" stroke="none"/>`;

const DESSINS = {
  // Humeurs
  // Humeurs : la météo du cœur en pictogrammes au trait (orage → plein soleil), plus de visages dessinés (17 nov. 2026).
  h1: ['or', '<path d="M15.5 31h16.5a5.5 5.5 0 0 0 .4-11 8 8 0 0 0-15.2 2.2A4.5 4.5 0 0 0 15.5 31z"/><path d="M24.5 31.5l-2.5 4.5h4l-2.5 4.5"/>'],
  h2: ['or', '<path d="M15.5 31h16.5a5.5 5.5 0 0 0 .4-11 8 8 0 0 0-15.2 2.2A4.5 4.5 0 0 0 15.5 31z"/><path d="M19 34.5l-1 2.5M24 34.5l-1 2.5M29 34.5l-1 2.5"/>'],
  h3: ['or', '<path d="M15.5 31h16.5a5.5 5.5 0 0 0 .4-11 8 8 0 0 0-15.2 2.2A4.5 4.5 0 0 0 15.5 31z"/>'],
  h4: ['or', '<circle cx="19" cy="19" r="4.5"/><path d="M19 11.5v2M11.5 19h2M13.7 13.7l1.4 1.4M24.3 13.7l-1.4 1.4"/><path d="M18 33h15a5 5 0 0 0 .3-10 7 7 0 0 0-13.3 2A4 4 0 0 0 18 33z"/>'],
  h5: ['or', '<circle cx="24" cy="24" r="6"/><path d="M24 12v3M24 33v3M12 24h3M33 24h3M15.5 15.5l2.1 2.1M30.4 30.4l2.1 2.1M15.5 32.5l2.1-2.1M30.4 17.6l2.1-2.1"/>'],
  // Onglets et rubriques
  nous: ['rose', `<path transform="translate(-4 2) scale(.82) translate(5 5)" d="${COEUR}" fill="#fff"/><path transform="translate(7 -2) scale(.7) translate(10 10)" d="${COEUR}" fill="#F7B6C6"/>`],
  douceurs: ['rose', `<rect x="12" y="16" width="24" height="17" rx="3" fill="#fff"/><path d="M12.5 17.5l11.5 8.5 11.5-8.5"/>${petitCoeur(24, 29.5, 0.32)}`],
  jeux: ['lilas', `<rect x="13" y="15" width="14" height="19" rx="2.5" fill="#fff" transform="rotate(-12 20 24)"/><rect x="21" y="14" width="14" height="19" rx="2.5" fill="#fff" transform="rotate(10 28 24)"/>${petitCoeur(28.5, 23.5, 0.3)}`],
  planning: ['or', `<rect x="12.5" y="15" width="23" height="20" rx="3.5" fill="#fff"/><path d="M12.5 21h23M18 12.5v5M30 12.5v5"/>${petitCoeur(24, 28, 0.3)}`],
  mariage: ['or', `<circle cx="20" cy="27" r="7" fill="none"/><circle cx="28" cy="27" r="7" fill="none"/><path d="M28 13.5l2.5 3-2.5 3-2.5-3z" fill="#fff"/><path d="M28 19.5v.5"/>`],
  aide: ['menthe', `<path d="M12 28c3 6 21 6 24 0"/><path d="M16 31.5c-2-1-3.5-3-3.5-5"/><path transform="translate(0 -3) scale(.75) translate(8 8)" d="${COEUR}" fill="#fff"/>`],
  // Activités
  rendez_vous: ['rose', '<path d="M15 14h7l-.8 7a2.7 2.7 0 0 1-5.4 0z" fill="#fff"/><path d="M18.5 23.8V33M15.5 33h6"/><path d="M26 14h7l-.8 7a2.7 2.7 0 0 1-5.4 0z" fill="#fff"/><path d="M29.5 23.8V33M26.5 33h6"/><path d="M24 11.5v2M21.5 12.5l1 1M26.5 12.5l-1 1"/>'],
  balade: ['menthe', '<path d="M15 33c0-11 7.5-18 19-18 0 11-7 18-19 18z" fill="#fff"/><path d="M15 33l11-11"/>'],
  repas: ['or', '<circle cx="24" cy="25" r="8.5" fill="#fff"/><circle cx="24" cy="25" r="4.5"/><path d="M12 15v6a2 2 0 0 0 2 2v10M14 15v5M36 15c-2 2-2 6 0 8v10"/>'],
  rituel: ['or', '<rect x="19.5" y="22" width="9" height="13" rx="1.5" fill="#fff"/><path d="M24 12.5c2.5 3 2.5 5.5 0 7.5-2.5-2-2.5-4.5 0-7.5z" fill="#FBD38D"/><path d="M24 20v2"/>'],
  gratitude: ['rose', '<circle cx="24" cy="17.5" r="4" fill="#fff"/><circle cx="17.5" cy="22.5" r="4" fill="#fff"/><circle cx="30.5" cy="22.5" r="4" fill="#fff"/><circle cx="20" cy="29.5" r="4" fill="#fff"/><circle cx="28" cy="29.5" r="4" fill="#fff"/><circle cx="24" cy="24" r="3.2" fill="#F6C760"/>'],
  famille: ['menthe', `<path d="M13 24l11-9.5L35 24v10.5H13z" fill="#fff"/>${petitCoeur(24, 28, 0.35)}`],
  coaching: ['lilas', '<path d="M13 16.5h22a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H22l-5.5 4.5v-4.5H13A2.5 2.5 0 0 1 10.5 28v-9a2.5 2.5 0 0 1 2.5-2.5z" fill="#fff"/><path d="M17 22h14M17 26h9"/>'],
  autre: ['lilas', '<path d="M24 12.5l2.6 8.9 8.9 2.6-8.9 2.6-2.6 8.9-2.6-8.9-8.9-2.6 8.9-2.6z" fill="#fff"/>'],
  // Cadeaux
  bijou: ['or', '<path d="M15 15c2 8 5 12 9 12s7-4 9-12"/><path d="M24 27l3 3.5-3 4-3-4z" fill="#fff"/><circle cx="18" cy="21.5" r="1" fill="#7A1F35" stroke="none"/><circle cx="30" cy="21.5" r="1" fill="#7A1F35" stroke="none"/>'],
  parfum: ['rose', '<rect x="16.5" y="21" width="15" height="14" rx="4" fill="#fff"/><rect x="20.5" y="16.5" width="7" height="4.5" rx="1" fill="#F7B6C6"/><path d="M24 13.5v3M29 14l2-1.5M29 16.5h2.5"/>'],
  fleurs: ['rose', '<path d="M24 35l-4-12M24 35l4-12M24 35V22"/><circle cx="19.5" cy="19" r="4" fill="#fff"/><circle cx="28.5" cy="19" r="4" fill="#F7B6C6"/><circle cx="24" cy="15.5" r="4" fill="#fff"/><path d="M19 31h10"/>'],
  chocolat: ['or', `<path transform="translate(0 1)" d="${COEUR}" fill="#fff"/><path d="M19.5 21h9M18 25h12M21 29h6"/>`],
  diner: ['lilas', '<path d="M11.5 31h25"/><path d="M14 31a10 10 0 0 1 20 0z" fill="#fff"/><circle cx="24" cy="19" r="1.6" fill="#fff"/>'],
  spa: ['menthe', '<path d="M24 33c-5-3-6.5-8-5-14 3 1.5 5 4.5 5 8 0-3.5 2-6.5 5-8 1.5 6 0 11-5 14z" fill="#fff"/><path d="M24 33c-5 0-9.5-2.5-11-7 3.5-.5 7 .5 9 3M24 33c5 0 9.5-2.5 11-7-3.5-.5-7 .5-9 3"/>'],
  weekend: ['or', '<rect x="13.5" y="19" width="21" height="14.5" rx="2.5" fill="#fff"/><path d="M20 19v-3h8v3M19 19v14.5M29 19v14.5"/>'],
  coffret: ['rose', '<rect x="14" y="21.5" width="20" height="13" rx="1.5" fill="#fff"/><rect x="12.5" y="17.5" width="23" height="4.5" rx="1" fill="#F7B6C6"/><path d="M24 17.5v17M24 17.5c-2-4-7-4.5-6-1.5s6 1.5 6 1.5zM24 17.5c2-4 7-4.5 6-1.5s-6 1.5-6 1.5z"/>'],
  photo: ['lilas', '<rect x="12.5" y="18" width="23" height="16" rx="3" fill="#fff"/><circle cx="24" cy="26" r="4.5"/><path d="M19.5 18l2-3h5l2 3"/>'],
  cadeau: ['rose', '<rect x="14" y="21.5" width="20" height="13" rx="1.5" fill="#fff"/><rect x="12.5" y="17.5" width="23" height="4.5" rx="1" fill="#F7B6C6"/><path d="M24 17.5v17M24 17.5c-2-4-7-4.5-6-1.5s6 1.5 6 1.5zM24 17.5c2-4 7-4.5 6-1.5s-6 1.5-6 1.5z"/>'],
  // Bulle du jour, bocal, défi
  question: ['lilas', '<path d="M13 15.5h22a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H23l-5.5 4.5v-4.5H13a2.5 2.5 0 0 1-2.5-2.5V18a2.5 2.5 0 0 1 2.5-2.5z" fill="#fff"/><path d="M21.5 20.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 2"/><circle cx="24" cy="27.3" r=".5"/>'],
  bocal: ['or', `<rect x="16" y="13.5" width="16" height="4" rx="1.5" fill="#F7B6C6"/><path d="M17 17.5h14v13a4.5 4.5 0 0 1-4.5 4.5h-5a4.5 4.5 0 0 1-4.5-4.5z" fill="#fff"/>${petitCoeur(21.5, 28, 0.25)}${petitCoeur(26.5, 24.5, 0.22)}<path d="M26 31l.6 1.4 1.4.6-1.4.6-.6 1.4" stroke-width="1.4"/>`],
  defi: ['menthe', '<path d="M24 35V22"/><path d="M24 24c-6 0-9-3-9-8 6 0 9 3 9 8zM24 22c0-5 3-8 9-8 0 5-3 8-9 8z" fill="#fff"/>'],
  // Jeux
  preferes: ['lilas', '<path d="M24 34V24M24 24l-8-8M24 24l8-8M16 16h4.5M16 16v4.5M32 16h-4.5M32 16v4.5"/>'],
  verites: ['rose', '<path d="M12.5 25c3.5-4.5 7-5.5 11.5-3 4.5-2.5 8-1.5 11.5 3-3.5 5.5-7.5 7.5-11.5 7.5s-8-2-11.5-7.5z" fill="#fff"/><path d="M12.5 25c5 1.5 18 1.5 23 0"/>'],
  piquant: ['rose', '<path d="M16 33c7.5.5 15-4.5 15.5-13 .1-2-2-2.6-3-.8-2.5 6-7 9.5-12.2 10.6-2.2.4-2.3 3.1-.3 3.2z" fill="#F0506E"/><path d="M31 19.5c0-2.5 1-4.5 3.5-5M29.5 18.5c1-1.5 2.5-1.5 3.5-.5"/>'],
  coquin: ['rose', `<path d="M12.5 26c3.5-4.5 7-5.5 11.5-3 4.5-2.5 8-1.5 11.5 3-3.5 5.5-7.5 7.5-11.5 7.5s-8-2-11.5-7.5z" fill="#E0567A"/><path d="M12.5 26c5 1.5 18 1.5 23 0" stroke="#fff"/>${petitCoeur(33, 15, 0.3)}`],
  quiz: ['or', `<path d="M24 12.5a8 8 0 0 0-4.5 14.6c.8.6 1.2 1.6 1.2 2.6v1h6.6v-1c0-1 .4-2 1.2-2.6A8 8 0 0 0 24 12.5z" fill="#fff"/><path d="M21 34.5h6"/>${petitCoeur(24, 21.5, 0.25)}`],
  defis: ['menthe', '<path d="M14 30c3-9 8-14 20-16-2 12-7 17-16 20" fill="#fff"/><path d="M14 34l6-6"/><circle cx="26" cy="22" r="2"/>'],
  // Fiançailles
  demande: ['rose', '<path d="M14.5 26h19v8.5a1.5 1.5 0 0 1-1.5 1.5H16a1.5 1.5 0 0 1-1.5-1.5z" fill="#fff"/><path d="M14.5 26l2-7h15l2 7"/><circle cx="24" cy="21.5" r="3.6" fill="none"/><path d="M24 15.5l1.5 1.8-1.5 1.8-1.5-1.8z" fill="#fff"/>'],
  fiancailles: ['or', '<circle cx="20" cy="27" r="7" fill="none"/><circle cx="28" cy="27" r="7" fill="none"/><path d="M28 13.5l2.5 3-2.5 3-2.5-3z" fill="#fff"/>'],
  henne: ['rose', '<path d="M18 35.5c-3-3-4.5-6.5-4.5-10v-3.5a1.8 1.8 0 0 1 3.6 0v2.5V14.5a1.8 1.8 0 0 1 3.6 0v8V12.5a1.8 1.8 0 0 1 3.6 0v10-8a1.8 1.8 0 0 1 3.6 0v12c0 5.5-2.5 9-6 9z" fill="#fff"/><circle cx="23.5" cy="28" r="1.6" fill="#B4426E" stroke="none"/><circle cx="23.5" cy="23.5" r=".8" fill="#B4426E" stroke="none"/><circle cx="20" cy="28" r=".8" fill="#B4426E" stroke="none"/><circle cx="27" cy="28" r=".8" fill="#B4426E" stroke="none"/>'],
  civil: ['lilas', '<rect x="15.5" y="12.5" width="17" height="23" rx="2" fill="#fff"/><path d="M19.5 18h9M19.5 22h9M19.5 26h5"/><circle cx="28" cy="30.5" r="2.5" fill="#F7B6C6"/>'],
  voyage: ['menthe', '<path d="M12 27l23-9-6 17-5-6-6 3z" fill="#fff"/><path d="M24 29l11-11"/>'],
};
DESSINS.familles = DESSINS.famille; DESSINS.tenues = DESSINS.bijou; DESSINS.mariage_jour = DESSINS.mariage;
const FONDS = { rose: ['#FDE3EA', '#F6B4C6'], lilas: ['#EFE6FC', '#CDB8F2'], or: ['#FBF0D6', '#EBCB86'], menthe: ['#E3F4EE', '#A9DCCB'] };

// Les dégradés, une seule fois dans la page.
export function preparerImages() {
  if (document.getElementById('couple-degrades')) return;
  const defs = Object.entries(FONDS).map(([k, [a, b]]) => `<linearGradient id="ci-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `<svg id="couple-degrades" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>`);
}

// Version chic (17 nov. 2026) : médaillon ivoire au filet doré, trait bordeaux fin, aucun aplat pastel ni remplissage.
export function img(nom, classe = '') {
  const [, trait] = DESSINS[nom] || DESSINS.cadeau;
  const fin = trait.replace(/fill="#(?:fff|FFF|F7B6C6|E0567A)"/g, 'fill="none"').replace(/stroke="none"/g, 'stroke="#B8893E"');
  return `<svg class="ci ${classe}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22.5" fill="#FBF7F1" stroke="#D9BF8C" stroke-width="1"/><g fill="none" stroke="#7A1F35" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${fin}</g></svg>`;
}
