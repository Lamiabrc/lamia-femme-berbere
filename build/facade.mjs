// La façade de la Maison : photographie de nuit fournie par Lamia, rendue interactive.
// Chaque fenêtre est une pièce : la lumière s'avive au survol, le nom et la phrase
// d'accueil apparaissent. Les volets clos sont les pièces à venir. La porte rouge est l'entrée.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

// Zones repérées sur l'image (base 1672 × 941) : [gauche, haut, droite, bas].
const W = 1672, H = 941;
const ZONES = {
  // deuxième étage
  grenier: [362, 128, 535, 284],
  galerie: [676, 128, 826, 284],
  atelier: [978, 128, 1134, 286],
  // premier étage
  salon: [250, 330, 420, 505],
  'speed-dating': [514, 330, 688, 505],
  bibliotheque: [775, 330, 948, 505],
  confidences: [1012, 330, 1192, 505],
  // rez-de-chaussée
  ecrin: [206, 566, 346, 752],
  boutique: [392, 566, 540, 754],
  hall: [638, 560, 792, 772],
  dressing: [854, 566, 978, 754],
  coiffeuse: [1012, 566, 1142, 754],
  patio: [1236, 566, 1560, 830], // la pergola et la terrasse
};
// Lanternes et étoiles qui scintillent : [x, y, taille].
const LANTERNS = [[600, 600, 60], [828, 600, 60], [1280, 618, 50], [1434, 624, 50], [255, 870, 60], [1500, 900, 50]];
const STARS = [[60, 30], [180, 18], [1300, 24], [1470, 70]];

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
    ? `<span class="${cls}" style="${box(z)}" tabindex="0" role="img" aria-label="${esc(r.name)} : bientôt" data-accent="${r.accent}">${tip}</span>`
    : `<a class="${cls}" style="${box(z)}" href="${r.path}" aria-label="${esc(r.name)} : ${esc(r.welcome)}" data-accent="${r.accent}">${tip}</a>`;
}

export function facade(rooms) {
  const lights = LANTERNS.map(([x, y, s], i) => `<span class="f-flame" style="left:${pct(x - s / 2, W)};top:${pct(y - s / 2, H)};width:${pct(s, W)};height:${pct(s, H)};animation-delay:${i * 0.7}s" aria-hidden="true"></span>`).join('');
  const stars = STARS.map(([x, y], i) => `<span class="f-twinkle" style="left:${pct(x, W)};top:${pct(y, H)};animation-delay:${(i * 0.9) % 4}s" aria-hidden="true"></span>`).join('');
  return `<div class="facade" role="group" aria-label="La façade de la Maison Lamia Femme Berbère : chaque fenêtre est une pièce">
  <img class="facade-img" src="/images/maison/facade-soir-1200.webp" srcset="/images/maison/facade-soir-800.webp 800w, /images/maison/facade-soir-1200.webp 1200w, /images/maison/facade-soir-1672.webp 1672w" sizes="(max-width: 1100px) 100vw, 1100px" width="1672" height="941" alt="La Maison Lamia Femme Berbère au coucher du soleil : maison de pierre aux volets bleus et bougainvilliers, chaque fenêtre éclairée porte le nom de sa pièce, grande porte de bois entrouverte, pergola du Patio à droite, montagnes de Kabylie au loin">
  ${lights}${stars}
  ${rooms.map(spot).join('\n  ')}
</div>`;
}
