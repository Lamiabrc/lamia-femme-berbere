// La façade de la Maison, à la tombée du soir.
// Chaque pièce ouverte est une fenêtre éclairée ; chaque pièce à venir garde ses volets
// clos, un filet de lumière entre les battants. L'entrée est la grande porte rouge.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

// Position de chaque pièce sur la façade (viewBox 1000 × 780).
const SPOTS = {
  bibliotheque: { x: 110, y: 235, w: 120, h: 120 },
  galerie: { x: 325, y: 235, w: 120, h: 120 },
  atelier: { x: 555, y: 235, w: 120, h: 120 },
  grenier: { x: 770, y: 235, w: 120, h: 120 },
  salon: { x: 60, y: 450, w: 145, h: 125 },
  patio: { x: 255, y: 440, w: 185, h: 135, court: true },
  ecrin: { x: 490, y: 450, w: 115, h: 125 },
  coiffeuse: { x: 665, y: 450, w: 100, h: 125 },
  dressing: { x: 825, y: 450, w: 100, h: 125 },
  confidences: { x: 70, y: 665, w: 100, h: 125 },
  boutique: { x: 235, y: 665, w: 115, h: 125 },
  hall: { x: 415, y: 650, w: 170, h: 218, main: true },
  'speed-dating': { x: 650, y: 665, w: 115, h: 125 },
  'salle-de-bain': { x: 820, y: 665, w: 110, h: 125 },
};

// Noms courts, lisibles sur la façade.
const LABELS = { bibliotheque: 'Bibliothèque', galerie: 'Galerie', atelier: 'Atelier', grenier: 'Grenier', salon: 'Salon', patio: 'Patio', ecrin: 'Écrin', coiffeuse: 'Coiffeuse', dressing: 'Dressing', confidences: 'Confidences', boutique: 'Boutique', 'speed-dating': 'Speed dating', 'salle-de-bain': 'Salle de bain' };

// Arc plein cintre : un rectangle coiffé d'un demi-cercle.
const arch = (x, y, w, h) => `M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z`;
const short = (name) => name.replace(/^(Le |La |L’)/, '');

function windowFor(r, s) {
  const { x, y, w, h } = s;
  const cx = x + w / 2;
  const soon = r.status === 'soon';
  const label = `<text class="f-label${soon ? ' is-soon' : ''}" x="${cx}" y="${y + h + 28}" text-anchor="middle">${esc(LABELS[r.slug] || short(r.name))}</text>`;
  const welcome = `<text class="f-welcome" x="${cx}" y="${y + h + 50}" text-anchor="middle">${soon ? 'bientôt' : esc(r.welcome)}</text>`;
  const pip = `<path class="f-pip" d="M${cx} ${y - 16}l8 8l-8 8l-8 -8z"/>`;

  if (s.main) {
    // La grande porte de la Maison.
    return `<a class="f-room f-door-main" href="${r.path}" aria-label="Entrer dans la Maison : ${esc(r.welcome)}" data-accent="rouge">
      <path class="f-door-frame" d="${arch(x - 12, y - 12, w + 24, h + 12)}"/>
      <path class="f-door" d="${arch(x, y, w, h)}"/>
      <line class="f-door-split" x1="${cx}" y1="${y + 4}" x2="${cx}" y2="${y + h}"/>
      <circle class="f-knocker" cx="${cx - 18}" cy="${y + h * 0.58}" r="9"/><circle class="f-knocker" cx="${cx + 18}" cy="${y + h * 0.58}" r="9"/>
      ${[0.3, 0.45, 0.72, 0.86].map((k) => `<circle class="f-stud" cx="${x + 16}" cy="${y + h * k}" r="3"/><circle class="f-stud" cx="${x + w - 16}" cy="${y + h * k}" r="3"/>`).join('')}
      <text class="f-label is-main" x="${cx}" y="${y - 24}" text-anchor="middle">Entrée</text>
    </a>`;
  }

  if (soon) {
    // Volets clos, un filet de lumière entre les battants.
    return `<g class="f-room is-soon" data-accent="${r.accent}"><title>${esc(r.name)} : bientôt</title>
      <path class="f-frame" d="${arch(x - 8, y - 8, w + 16, h + 8)}"/>
      <path class="f-light" d="${arch(x, y, w, h)}"/>
      <path class="f-shutter" d="${arch(x, y, w, h)}" clip-path="url(#clip-left-${r.slug})"/>
      <path class="f-shutter" d="${arch(x, y, w, h)}" clip-path="url(#clip-right-${r.slug})"/>
      <clipPath id="clip-left-${r.slug}"><rect x="${x}" y="${y}" width="${w / 2 - 3}" height="${h}"/></clipPath>
      <clipPath id="clip-right-${r.slug}"><rect x="${cx + 3}" y="${y}" width="${w / 2 - 3}" height="${h}"/></clipPath>
      ${[0.35, 0.55, 0.75].map((k) => `<line class="f-slat" x1="${x + 6}" y1="${y + h * k}" x2="${cx - 8}" y2="${y + h * k}"/><line class="f-slat" x1="${cx + 8}" y1="${y + h * k}" x2="${x + w - 6}" y2="${y + h * k}"/>`).join('')}
      ${pip}${label}${welcome}
    </g>`;
  }

  // Fenêtre éclairée (ou porte basse, ou arcade du patio).
  const inner = s.court
    ? `<path class="f-court" d="${arch(x, y, w, h)}"/>
       <path class="f-leaf" d="M${x + 30} ${y + h}c10 -40 30 -60 50 -70c-6 26 -20 50 -50 70z"/>
       <path class="f-leaf" d="M${x + w - 30} ${y + h}c-10 -44 -34 -62 -56 -72c6 28 22 54 56 72z"/>
       <path class="f-leaf" d="M${cx} ${y + h}c-4 -36 4 -64 18 -82c4 30 -2 58 -18 82z"/>
       <path class="f-lantern-small" d="M${cx - 9} ${y + 40}h18l-4 26h-10z"/><line class="f-chain" x1="${cx}" y1="${y + 10}" x2="${cx}" y2="${y + 40}"/>`
    : `<path class="f-light" d="${arch(x, y, w, h)}"/>
       <path class="f-mullion" d="M${cx} ${y + 6}V${y + h}M${x} ${y + h * 0.55}H${x + w}"/>`;
  return `<a class="f-room" href="${r.path}" aria-label="${esc(r.name)} : ${esc(r.welcome)}" data-accent="${r.accent}">
    <path class="f-frame" d="${arch(x - 8, y - 8, w + 16, h + 8)}"/>
    ${inner}
    <path class="f-glass" d="${arch(x, y, w, h)}"/>
    ${pip}${label}${welcome}
  </a>`;
}

export function facade(rooms) {
  const tiles = Array.from({ length: 24 }, (_, i) => `<path class="f-tile" d="M${44 + i * 38} 180a19 19 0 0 1 38 0"/>`).join('');
  const stars = [[120, 40], [230, 88], [380, 30], [470, 76], [610, 46], [690, 100], [960, 120], [40, 110], [300, 118], [540, 112], [760, 28]]
    .map(([x, y], i) => `<circle class="f-star" cx="${x}" cy="${y}" r="${i % 3 ? 1.6 : 2.4}"/>`).join('');
  const windows = rooms.filter((r) => SPOTS[r.slug]).map((r) => windowFor(r, SPOTS[r.slug])).join('\n');
  return `<svg class="house-facade" viewBox="0 0 1000 930" role="group" aria-label="La façade de la Maison Lamia Femme Berbère : chaque fenêtre est une pièce">
  <defs>
    <linearGradient id="f-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#191a33"/><stop offset="1" stop-color="#3a2a44"/></linearGradient>
    <radialGradient id="f-glow" cx=".5" cy=".62" r=".75"><stop offset="0" stop-color="#ffe2a3"/><stop offset=".55" stop-color="#f3b45c"/><stop offset="1" stop-color="#c9732f"/></radialGradient>
    <radialGradient id="f-court" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#ffe9bd"/><stop offset="1" stop-color="#e2a85a"/></radialGradient>
    <radialGradient id="f-halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd48a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd48a" stop-opacity="0"/></radialGradient>
    <pattern id="f-frise" width="40" height="14" patternUnits="userSpaceOnUse"><path d="M0 14L10 4L20 14Z" fill="#1c1517"/><path d="M20 0L30 10L40 0Z" fill="#b0162e"/></pattern>
  </defs>
  ${stars}
  <path class="f-moon" d="M860 34a36 36 0 1 0 32 56a30 30 0 1 1 -32 -56z"/>
  <ellipse class="f-ground" cx="500" cy="896" rx="560" ry="40"/>
  <rect class="f-wall" x="30" y="180" width="940" height="690"/>
  <path class="f-roof" d="M10 192L50 140H950L990 192Z"/>
  ${tiles}
  <rect x="30" y="188" width="940" height="14" fill="url(#f-frise)"/>
  <rect x="30" y="856" width="940" height="14" fill="url(#f-frise)"/>
  <ellipse cx="500" cy="760" rx="190" ry="120" fill="url(#f-halo)"/>
  <g class="f-lantern"><line x1="612" y1="642" x2="612" y2="664"/><path d="M600 664h24l-5 34h-14z"/></g>
  ${windows}
</svg>`;
}
