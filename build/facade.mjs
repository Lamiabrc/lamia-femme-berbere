// La façade de la Maison : photographie de nuit fournie par Lamia, rendue interactive.
// Chaque fenêtre est une pièce : la lumière s'avive au survol, le nom et la phrase
// d'accueil apparaissent. Les volets clos sont les pièces à venir. La porte rouge est l'entrée.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

// Zones repérées sur l'image (base 1672 × 941) : [gauche, haut, droite, bas].
const W = 1672, H = 941;
const ZONES = {
  // deuxième étage
  grenier: [362, 150, 475, 295],
  galerie: [640, 150, 752, 295],
  atelier: [912, 140, 1037, 295],
  patio: [1198, 150, 1310, 295],
  // premier étage
  salon: [325, 378, 434, 535],
  'speed-dating': [512, 335, 770, 545],
  bibliotheque: [797, 378, 905, 532],
  confidences: [1022, 372, 1145, 535],
  // rez-de-chaussée
  ecrin: [303, 632, 450, 795],
  boutique: [530, 632, 640, 790],
  hall: [772, 628, 921, 866],
  dressing: [1043, 632, 1153, 790],
  coiffeuse: [1237, 628, 1360, 790],
};
// Lanternes et étoiles qui scintillent : [x, y, taille].
const LANTERNS = [[713, 660, 70], [976, 660, 70], [648, 400, 60], [380, 662, 46]];
const STARS = [[1460, 70], [1530, 150], [1620, 40], [120, 30], [250, 80], [1390, 30], [60, 120]];

const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;
const box = ([l, t, r, b]) => `left:${pct(l, W)};top:${pct(t, H)};width:${pct(r - l, W)};height:${pct(b - t, H)}`;
const LABELS = { hall: 'Entrer dans la Maison' };

function spot(r) {
  const z = ZONES[r.slug];
  if (!z) return '';
  const soon = r.status === 'soon';
  const cls = ['f-spot', soon && 'is-soon', r.slug === 'hall' && 'is-door', z[1] < 300 && 'tip-below'].filter(Boolean).join(' ');
  const tip = `<span class="f-tip"><strong>${esc(LABELS[r.slug] || r.name)}</strong><em>${soon ? 'Bientôt' : esc(r.welcome)}</em></span>`;
  return soon
    ? `<span class="${cls}" style="${box(z)}" tabindex="0" role="img" aria-label="${esc(r.name)} : bientôt" data-accent="${r.accent}">${tip}</span>`
    : `<a class="${cls}" style="${box(z)}" href="${r.path}" aria-label="${esc(r.name)} : ${esc(r.welcome)}" data-accent="${r.accent}">${tip}</a>`;
}

export function facade(rooms) {
  const lights = LANTERNS.map(([x, y, s], i) => `<span class="f-flame" style="left:${pct(x - s / 2, W)};top:${pct(y - s / 2, H)};width:${pct(s, W)};height:${pct(s, H)};animation-delay:${i * 0.7}s" aria-hidden="true"></span>`).join('');
  const stars = STARS.map(([x, y], i) => `<span class="f-twinkle" style="left:${pct(x, W)};top:${pct(y, H)};animation-delay:${(i * 0.9) % 4}s" aria-hidden="true"></span>`).join('');
  return `<div class="facade" role="group" aria-label="La façade de la Maison Lamia Femme Berbère : chaque fenêtre est une pièce">
  <img class="facade-img" src="/images/maison/facade-nuit-1200.webp" srcset="/images/maison/facade-nuit-800.webp 800w, /images/maison/facade-nuit-1200.webp 1200w, /images/maison/facade-nuit-1672.webp 1672w" sizes="(max-width: 1100px) 100vw, 1100px" width="1672" height="941" alt="La Maison Lamia Femme Berbère la nuit : façade blanchie à la chaux ornée de motifs kabyles, bijoux en vitrine au rez-de-chaussée, boudoir aux fauteuils rouges au premier étage, volets bleus, grande porte rouge surmontée du visage de Lamia">
  ${lights}${stars}
  ${rooms.map(spot).join('\n  ')}
</div>`;
}
