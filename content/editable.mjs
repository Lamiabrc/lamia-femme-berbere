// Les textes et images que Lamia peut modifier depuis son tableau de bord.
// Chaque clé pointe vers un texte de content/pages.mjs (« pages.<objet>.<champ> »)
// ou de content/rooms.mjs (« rooms.<slug>.<champ> »), ou vers une image (« images.<nom> »).
// Les valeurs modifiées sont gardées dans platform_settings (clé « site_content »)
// et appliquées à la construction du site (bouton « Publier »).

import * as P from './pages.mjs';
import { rooms } from './rooms.mjs';

// Textes des pages, rangés par pièce (slug).
const PAGE_FIELDS = {
  hall: [
    ['pages.hall.title', 'Grand titre de l’accueil'],
    ['pages.hall.lead', 'Texte sous le grand titre', true],
    ['pages.hall.story.title', 'Titre de l’histoire'],
    ['pages.hall.story.paragraphs.0', 'Histoire, paragraphe 1', true],
    ['pages.hall.story.paragraphs.1', 'Histoire, paragraphe 2', true],
  ],
  ecrin: [['pages.ecrin.intro', 'Introduction', true], ['pages.ecrin.athYenni.text', 'Texte « Fabriqués à Ath Yenni »', true], ['pages.ecrin.note', 'Note sur les bijoux faits main', true]],
  bibliotheque: [['pages.bibliotheque.intro', 'Introduction', true], ['pages.bibliotheque.book.text', 'Présentation de Werdi', true], ['pages.bibliotheque.book.quote', 'Citation du livre', true]],
  salon: [['pages.salon.intro', 'Introduction', true]],
  grenier: [['pages.grenier.intro', 'Introduction', true]],
  'speed-dating': [['pages.speedDating.intro', 'Introduction du Bal', true], ['pages.speedDating.promise', 'Citation de Lamia', true], ['pages.speedDating.origin', 'Origine des soirées', true], ['pages.speedDating.salleAccueil', 'Mot d’accueil dans la salle vidéo (avant que Lamia arrive)', true]],
  confidences: [['pages.confidences.intro', 'Introduction', true]],
  patio: [['pages.patio.intro', 'Introduction', true]],
  galerie: [['pages.galerie.intro', 'Introduction', true]],
};

export const EDITABLE = [
  ...rooms.flatMap((r) => [
    ...(PAGE_FIELDS[r.slug] || []).map(([key, label, long]) => ({ key, group: r.name, label, long: Boolean(long) })),
    { key: `rooms.${r.slug}.welcome`, group: r.name, label: 'Phrase d’accueil (titre de la pièce)' },
    { key: `rooms.${r.slug}.summary`, group: r.name, label: 'Présentation courte (cartes et plan)', long: true },
  ]),
  { key: 'images.hall-arch', group: 'Images', label: 'Image de l’arche du Hall', image: true, def: '/images/marque/lamia-logo-600.webp' },
  { key: 'images.hall-medal', group: 'Images', label: 'Médaillon rond du Hall', image: true, def: '/images/collier/collier-kabyle-15g-detail-320.webp' },
  { key: 'images.salle-decor', group: 'Images', label: 'Décor de la salle vidéo du bal (fond derrière les vidéos)', image: true, def: '/images/lamia/lamia-salon-1122.webp' },
  { key: 'images.salle-accueil', group: 'Images', label: 'Photo de Lamia dans la salle vidéo (avant son arrivée)', image: true, def: '/images/marque/lamia-portrait-reel-480.webp' },
  { key: 'images.lamia-portrait', group: 'Images', label: 'Portrait de la page « Qui est Lamia »', image: true, def: '/images/lamia/lamia-salon-900.webp' },
];

function getPath(obj, parts) { return parts.reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, parts, value) {
  const last = parts.pop();
  const target = getPath(obj, parts);
  if (target && typeof target === 'object' && last in target && typeof target[last] === 'string') target[last] = value;
}
const roots = () => ({ pages: P, rooms: Object.fromEntries(rooms.map((r) => [r.slug, r])) });

// Valeurs actuelles (par défaut) de chaque champ.
export function defaults() {
  const r = roots();
  return Object.fromEntries(EDITABLE.map((f) => {
    const [root, ...rest] = f.key.split('.');
    return [f.key, f.image ? f.def : getPath(r[root], rest) ?? ''];
  }));
}

// Applique les modifications de Lamia aux contenus (avant la construction des pages).
export function applyOverrides(over = {}) {
  const r = roots();
  const images = {};
  for (const f of EDITABLE) {
    const v = over[f.key];
    if (typeof v !== 'string' || !v.trim()) continue;
    const [root, ...rest] = f.key.split('.');
    if (f.image) { if (/^(https:\/\/|\/images\/)/.test(v)) images[rest.join('.')] = v; continue; }
    setPath(r[root], rest, v.trim().slice(0, 4000));
  }
  return images;
}
