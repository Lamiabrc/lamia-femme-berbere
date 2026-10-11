// La façade de la Maison : photographie de nuit fournie par Lamia, rendue interactive.
// Chaque fenêtre est une pièce : la lumière s'avive au survol, le nom et la phrase
// d'accueil apparaissent. Les volets clos sont les pièces à venir. La porte rouge est l'entrée.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

// Zones repérées sur l'image (base 1672 × 941) : [gauche, haut, droite, bas].
const W = 1672, H = 941;
const ZONES = {
  bibliotheque: [362, 150, 475, 295],
  galerie: [640, 150, 752, 295],
  atelier: [912, 140, 1037, 295],
  grenier: [1198, 150, 1310, 295],
  salon: [325, 378, 434, 527],
  patio: [510, 335, 722, 530],
  ecrin: [797, 378, 905, 527],
  coiffeuse: [1022, 372, 1145, 527],
  dressing: [1238, 372, 1362, 527],
  confidences: [326, 632, 435, 785],
  boutique: [530, 632, 640, 785],
  hall: [772, 628, 921, 866],
  'speed-dating': [1045, 632, 1155, 785],
  'salle-de-bain': [1237, 628, 1360, 785],
};
// Lanternes et étoiles qui scintillent : [x, y, taille].
const LANTERNS = [[716, 662, 70], [978, 662, 70], [623, 420, 60]];
const STARS = [[1460, 70], [1530, 150], [1620, 40], [120, 30], [250, 80], [1390, 30], [60, 120]];

const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;
const box = ([l, t, r, b]) => `left:${pct(l, W)};top:${pct(t, H)};width:${pct(r - l, W)};height:${pct(b - t, H)}`;
const LABELS = { bibliotheque: 'La Bibliothèque de Yemma', galerie: 'La Galerie', atelier: 'L’Atelier', grenier: 'Le Grenier des Trouvailles', salon: 'Le Salon de Lamia', patio: 'Le Patio', ecrin: 'L’Écrin', coiffeuse: 'La Coiffeuse', dressing: 'Le Dressing', confidences: 'Le Cabinet des Confidences', boutique: 'La Boutique', 'speed-dating': 'Le Salon du Speed Dating', 'salle-de-bain': 'La Salle de bain', hall: 'Entrer dans la Maison' };

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
  <img class="facade-img" src="/images/maison/facade-nuit-1200.webp" srcset="/images/maison/facade-nuit-800.webp 800w, /images/maison/facade-nuit-1200.webp 1200w, /images/maison/facade-nuit-1672.webp 1672w" sizes="(max-width: 1100px) 100vw, 1100px" width="1672" height="941" alt="La Maison Lamia Femme Berbère la nuit : façade blanchie à la chaux ornée de motifs kabyles, fenêtres éclairées, volets bleus, grande porte rouge entre deux lanternes">
  ${lights}${stars}
  ${rooms.map(spot).join('\n  ')}
</div>`;
}
