// La façade de la Maison : photographie de nuit fournie par Lamia, rendue interactive.
// Chaque fenêtre est une pièce : la lumière s'avive au survol, le nom et la phrase
// d'accueil apparaissent. Les volets clos sont les pièces à venir. La porte rouge est l'entrée.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

// Zones repérées sur l'image (base 1672 × 941) : [gauche, haut, droite, bas].
const W = 1376, H = 768;
const ZONES = {
  salon: [262, 305, 344, 402],
  confidences: [530, 246, 643, 296],
  'speed-dating': [671, 265, 788, 309],
  atelier: [917, 288, 951, 341],
  grenier: [1032, 240, 1121, 282],
  bibliotheque: [1063, 302, 1174, 394],
  patio: [800, 572, 1000, 700], // la cour pavée devant la Maison, le banc et le livre
  hall: [610, 371, 774, 578],
  ecrin: [785, 394, 850, 477],
  coiffeuse: [1043, 422, 1151, 493],
  dressing: [231, 474, 335, 555],
  boutique: [375, 391, 477, 477],
  galerie: [960, 417, 998, 489],
};
const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;
const box = ([l, t, r, b]) => `left:${pct(l, W)};top:${pct(t, H)};width:${pct(r - l, W)};height:${pct(b - t, H)}`;
const LABELS = { hall: 'Entrer dans la Maison' };

function spot(r) {
  const z = ZONES[r.slug];
  if (!z) return '';
  const soon = r.status === 'soon';
  const cls = ['f-spot', soon && 'is-soon', r.slug === 'hall' && 'is-door', r.slug === 'patio' && 'is-pergola', z[1] < 300 && 'tip-below'].filter(Boolean).join(' ');
  const tip = `<span class="f-tip"><strong>${esc(LABELS[r.slug] || r.name)}</strong><em>${soon ? 'Bientôt' : esc(r.welcome)}</em></span>`;
  return soon
    ? `<span class="${cls}" style="${box(z)}" tabindex="0" role="img" aria-label="${esc(r.name)} : bientôt" data-accent="${r.accent}"><span class="f-label">${esc(r.name)}</span>${tip}</span>`
    : `<a class="${cls}" style="${box(z)}" href="${r.path}" aria-label="${esc(r.name)} : ${esc(r.welcome)}" data-accent="${r.accent}"><span class="f-label">${esc(LABELS[r.slug] || r.name)}</span>${tip}</a>`;
}

export function facade(rooms) {
  return `<div class="facade" role="group" aria-label="La façade de la Maison Lamia Femme Berbère : chaque fenêtre est une pièce">
  <img class="facade-img" src="/images/maison/maison-kabyle-1200.webp" srcset="/images/maison/maison-kabyle-800.webp 800w, /images/maison/maison-kabyle-1200.webp 1200w, /images/maison/maison-kabyle-1376.webp 1376w" sizes="(max-width: 1100px) 100vw, 1100px" width="1376" height="768" alt="La Maison Lamia Femme Berbère au coucher du soleil : maison de pierre, oliviers, grande porte de bois entrouverte, livre sur un banc et montagnes de Kabylie au loin">

  ${rooms.map(spot).join('\n  ')}
</div>`;
}
