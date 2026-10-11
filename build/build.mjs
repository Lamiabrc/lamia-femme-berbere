// Générateur de la Maison Lamia Femme Berbère.
// Aucune dépendance : node build/build.mjs → dossier dist/ (servi par Vercel).
// Les pages sont pré-rendues ; les données vivantes (produits, soirées) sont chargées
// côté navigateur depuis Supabase avec la clé publique uniquement.

import { mkdir, rm, writeFile, cp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rooms, roomBySlug } from '../content/rooms.mjs';
import * as P from '../content/pages.mjs';
import { legalPages } from '../content/legal.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://lamia-femme-berbere.com').replace(/\/$/, '');
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || String(Date.now());

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

// Couverture fournie par Lamia : public/images/couvertures/<nom>-640.webp (et -1120.webp).
const cover = (name, alt, cls = 'cover') =>
  existsSync(join(ROOT, 'public/images/couvertures', `${name}-640.webp`))
    ? `<figure class="${cls}"><img src="/images/couvertures/${name}-640.webp" srcset="/images/couvertures/${name}-640.webp 640w, /images/couvertures/${name}-1120.webp 1120w" sizes="(max-width: 900px) 100vw, 40vw" alt="${esc(alt)}" loading="lazy"></figure>`
    : '';

const openRooms = rooms.filter((r) => r.status === 'open' && r.slug !== 'hall');
const soonRooms = rooms.filter((r) => r.status === 'soon');

// ---------------------------------------------------------------- gabarit commun

function layout({ title, description, path, room, body, scripts = [], noindex = false }) {
  const canonical = SITE_URL + path;
  const accent = room?.accent || 'rouge';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE_URL}/images/marque/lamia-logo-600.webp">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/images/marque/lamia-logo-160.webp" type="image/webp">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/maison.css?v=${VERSION}">
</head>
<body data-room="${esc(room?.slug || '')}" data-accent="${esc(accent)}">
<a class="skip" href="#contenu">Aller au contenu</a>
${header(room)}
<main id="contenu">
${body}
</main>
${footer()}
${cartDrawer()}
<script type="module" src="/assets/maison.js?v=${VERSION}"></script>
${scripts.map((s) => `<script type="module" src="${s}?v=${VERSION}"></script>`).join('\n')}
</body>
</html>`;
}

function header(room) {
  const link = (href, label, slug) =>
    `<a href="${href}"${room?.slug === slug ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="site-header">
  <a class="brand" href="/" aria-label="Lamia Femme Berbère, retour au Hall">
    <img src="/images/marque/lamia-logo-160.webp" width="52" height="52" alt="">
    <span><strong>Lamia</strong> Femme Berbère</span>
  </a>
  <nav class="site-nav" aria-label="Navigation principale">
    ${link('/#plan', 'Le plan de la Maison', 'plan')}
    ${link('/ecrin/', 'L’Écrin', 'ecrin')}
    ${link('/grenier/', 'Le Grenier', 'grenier')}
    ${link('/bibliotheque/', 'La Bibliothèque', 'bibliotheque')}
    ${link('/speed-dating/', 'Speed dating', 'speed-dating')}
  </nav>
  <div class="header-actions">
    <a class="plan-link" href="/#plan">Le plan</a>
    <a class="alert-link" href="/confidences/">Alerter Lamia</a>
    <button class="cart-button" type="button" data-cart-open aria-label="Ouvrir le panier">Panier <span data-cart-count>0</span></button>
  </div>
</header>`;
}

function footer() {
  return `<div class="frise" aria-hidden="true"></div>
<footer class="site-footer">
  <div class="footer-house">
    <p class="footer-sign">ⵣ</p>
    <p>La Maison Lamia Femme Berbère<br>Mémoire, transmission, création.</p>
  </div>
  <nav aria-label="Toutes les pièces">
    <p class="footer-title">Les pièces</p>
    <ul>${rooms.map((r) => `<li><a href="${r.path}">${esc(r.name)}${r.status === 'soon' ? ' <small>(bientôt)</small>' : ''}</a></li>`).join('')}</ul>
  </nav>
  <div>
    <p class="footer-title">Lamia</p>
    <ul>
      <li><a href="/lamia-brechet/">Qui est Lamia</a></li>
      <li><a href="/werdi-ouvre-les-yeux/">Le livre Werdi</a></li>
      <li><a href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">TikTok @lamiaberbere</a></li>
      <li data-social="instagram" hidden><a rel="noopener" target="_blank">Instagram</a></li>
      <li><a href="https://www.facebook.com/femmeberberes/" rel="noopener" target="_blank">Facebook Femme Berbère</a></li>
      <li data-social="youtube" hidden><a rel="noopener" target="_blank">YouTube</a></li>
    </ul>
    <p class="footer-legal"><a href="/mentions-legales/">Mentions légales</a> · <a href="/cgv/">Conditions de vente</a> · <a href="/confidentialite/">Confidentialité</a></p>
  </div>
</footer>`;
}

function cartDrawer() {
  return `<div class="cart-overlay" data-cart-close hidden></div>
<aside class="cart-drawer" aria-label="Panier" aria-hidden="true" data-cart>
  <div class="cart-head"><h2>Ton panier</h2><button type="button" data-cart-close aria-label="Fermer le panier">Fermer</button></div>
  <div class="cart-items" data-cart-items><p>Ton panier est vide.</p></div>
  <div class="cart-foot">
    <p class="cart-total">Total <strong data-cart-total>0,00 €</strong></p>
    <button class="btn btn-ink" type="button" disabled>Paiement en ligne bientôt disponible</button>
    <p class="cart-note">Le panier garde tes choix. Le paiement sécurisé par Stripe ouvrira après la mise en ligne des conditions de vente.</p>
  </div>
</aside>`;
}

// ---------------------------------------------------------------- blocs réutilisables

// Image affichée dans l'arche de l'en-tête, quand la pièce en a une.
const HEAD_IMAGES = {
  ecrin: ['/images/collier/collier-kabyle-15g-porte-640.webp', 'Collier kabyle émaillé porté'],
  galerie: ['/images/collier/collier-kabyle-15g-detail-640.webp', 'Détail d’un médaillon émaillé'],
  bibliotheque: ['/images/marque/yemma-transmission-900.webp', 'Yemma transmet à sa fille, un livre à la main'],
  salon: ['/images/marque/lamia-logo-600.webp', 'Le visage de Lamia Femme Berbère'],
  boutique: ['/images/collier/collier-kabyle-15g-ecrin-640.webp', 'Collier kabyle dans son écrin'],
};
function roomHead(room, extra = '') {
  const im = HEAD_IMAGES[room.slug];
  const arch = im
    ? `<figure class="head-arch has-image"><img src="${im[0]}" alt="${esc(im[1])}"${room.slug === 'salon' ? ' class="is-drawing"' : ''}></figure>`
    : '<span class="head-arch" aria-hidden="true"></span>';
  return `<section class="room-head${im ? ' with-image' : ''}">${arch}
  <p class="room-name"><span class="pip" aria-hidden="true"></span>${esc(room.name)}</p>
  <h1>${esc(room.welcome)}</h1>
  <p class="lead">${esc(room.summary)}</p>
  ${extra}
</section>
<div class="frise frise-fine" aria-hidden="true"></div>`;
}

const productGrid = (categories, opts = {}) =>
  `<div class="product-grid" data-products="${esc(categories.join(','))}"${opts.sold ? ' data-show-sold' : ''}${opts.group ? ' data-group-by-room' : ''}>
  <p class="loading">Les pièces arrivent…</p>
</div>`;

function otherRooms(current) {
  const picks = openRooms.filter((r) => r.slug !== current).slice(0, 4);
  return `<section class="next-rooms" aria-label="Continuer la visite">
  <h2>Continuer la visite</h2>
  <ul>${picks.map((r) => `<li data-accent="${r.accent}"><a href="${r.path}"><span class="pip" aria-hidden="true"></span><strong>${esc(r.name)}</strong><span>${esc(r.welcome)}</span></a></li>`).join('')}</ul>
</section>`;
}

// Le plan de la Maison : l'élément signature du Hall.
function housePlan() {
  const cells = rooms
    .map((r) => {
      const { x, y, w, h, door, open } = r.plan;
      const soon = r.status === 'soon';
      const cx = x + w / 2;
      const words = r.name.replace(/^(Le |La |L’)/, '').split(' ');
      // Coupe le nom en deux lignes au plus.
      const half = Math.ceil(words.length / 2);
      const lines = words.length > 2 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [words.join(' ')];
      // Taille du nom adaptée à la largeur de la pièce (serif ≈ 0.5 em par caractère).
      const longest = Math.max(...lines.map((l) => l.length));
      const fs = Math.round(Math.min(24, (w - 20) / (longest * 0.5), (h - 30) / (lines.length * 1.25)));
      const lh = Math.round(fs * 1.15);
      const ty = y + h / 2 - ((lines.length - 1) * lh) / 2 + fs * 0.33;
      const label = lines
        .map((l, i) => `<tspan x="${cx}" y="${Math.round(ty + i * lh)}">${esc(l)}</tspan>`)
        .join('');
      const shape = `<rect class="room-shape${open ? ' is-court' : ''}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      const doorMark =
        door === 'bottom'
          ? `<path class="door-gap" d="M${cx - 30} ${y + h}H${cx + 30}"/><path class="door-swing" d="M${cx - 30} ${y + h}A60 60 0 0 1 ${cx + 30} ${y + h - 52}"/><text class="entree" x="${cx}" y="${y + h + 2}" dy="-8">Entrée</text>`
          : '';
      const pip = `<path class="room-pip" d="M${x + 18} ${y + 10}l7 7l-7 7l-7 -7z"/>`;
      const inner = `${shape}${pip}${soon ? `<rect class="room-hatch" x="${x}" y="${y}" width="${w}" height="${h}"/>` : ''}<text class="room-label" text-anchor="middle" font-size="${fs}">${label}</text>${soon && h >= 150 ? `<text class="room-soon" x="${cx}" y="${y + h - 18}" text-anchor="middle">bientôt</text>` : ''}${doorMark}`;
      return soon
        ? `<g class="plan-room is-soon" data-accent="${r.accent}"><title>${esc(r.name)} : bientôt</title>${inner}</g>`
        : `<a class="plan-room" href="${r.path}" data-accent="${r.accent}" aria-label="${esc(r.name)} : ${esc(r.welcome)}">${inner}</a>`;
    })
    .join('');
  return `<svg class="house-plan" viewBox="0 0 1000 660" role="group" aria-label="Plan de la Maison Lamia Femme Berbère">
  <defs>
    <pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12"/></pattern>
    <pattern id="tiles" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M15 3L27 15L15 27L3 15Z"/></pattern>
    <filter id="house-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#1c1517" flood-opacity=".16"/></filter>
  </defs>
  <rect class="house-wall" x="20" y="20" width="960" height="600" filter="url(#house-shadow)"/>
  ${cells}
</svg>`;
}

// ---------------------------------------------------------------- pages

const pages = [];
const page = (path, html) => pages.push({ path, html });

// Le Hall
page(
  '/',
  layout({
    title: 'La Maison Lamia Femme Berbère',
    description: 'Bienvenue chez Lamia : bijoux kabyles, livres de Yemma Werdi, trouvailles de brocante, lives et soirées de rencontre sérieuses.',
    path: '/',
    room: roomBySlug.hall,
    body: `<section class="hall-hero">
  <div class="hall-copy">
    <p class="room-name"><span class="pip" aria-hidden="true"></span>Le Hall</p>
    <h1>${esc(P.hall.title)}</h1>
    <p class="lead">${esc(P.hall.lead)}</p>
    <p class="hall-actions"><a class="btn btn-ink" href="#plan">Visiter la Maison</a><a class="btn btn-line" href="/lamia-brechet/">Qui est Lamia</a></p>
  </div>
  <div class="hall-stage">
    <span class="arch-shadow" aria-hidden="true"></span>
    <figure class="hall-arch">
      <img src="/images/marque/lamia-logo-600.webp" width="600" height="600" alt="Le visage de Lamia Femme Berbère : lunettes, lèvres rouges et bijoux kabyles">
    </figure>
    <figure class="hall-medal">
      <img src="/images/collier/collier-kabyle-15g-detail-320.webp" width="320" height="400" alt="Médaillon kabyle émaillé bleu, vert et jaune, corail au centre">
    </figure>
  </div>
</section>
<div class="frise" aria-hidden="true"></div>

<section class="plan-section" id="plan" aria-labelledby="plan-title">
  <div class="plan-intro">
    <h2 id="plan-title">Le plan de la Maison</h2>
    <p>Chaque pièce a son rôle. Les portes hachurées s’ouvriront bientôt.</p>
  </div>
  ${housePlan()}
  <ul class="room-index">
    ${openRooms.map((r) => `<li data-accent="${r.accent}"><a href="${r.path}"><span class="pip" aria-hidden="true"></span><strong>${esc(r.name)}</strong><span>${esc(r.welcome)}</span></a></li>`).join('')}
    ${soonRooms.map((r) => `<li class="is-soon" data-accent="${r.accent}"><a href="${r.path}"><span class="pip" aria-hidden="true"></span><strong>${esc(r.name)}</strong><span>Bientôt</span></a></li>`).join('')}
  </ul>
</section>

<section class="now-section is-dark" aria-labelledby="now-title">
  <h2 id="now-title">En ce moment dans la Maison</h2>
  <div class="now-grid">
    <article class="now-card" data-accent="rouge">
      <p class="now-room">Le Salon de Lamia</p>
      <h3>Live Mariage Kabyle</h3>
      <p>Tous les soirs, de 21 h à 23 h, sur TikTok.</p>
      <a href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">Rejoindre le live sur TikTok</a>
    </article>
    <article class="now-card" data-accent="rouge" data-next-event>
      <p class="now-room">Le Salon du Speed Dating</p>
      <h3>Prochaine soirée</h3>
      <p>Les prochaines soirées arrivent.</p>
      <a href="/speed-dating/">Voir les soirées</a>
    </article>
    <article class="now-card" data-accent="vert">
      <p class="now-room">L’Écrin</p>
      <h3>Collier kabyle émaillé</h3>
      <p>Argent émaillé et corail, une pièce unique.</p>
      <a href="/ecrin/">Entrer dans l’Écrin</a>
    </article>
  </div>
</section>

<section class="story" aria-labelledby="story-title">
  <figure><img src="/images/marque/yemma-transmission-900.webp" width="900" height="600" loading="lazy" alt="Illustration : Yemma transmet à sa fille"></figure>
  <div>
    <h2 id="story-title">${esc(P.hall.story.title)}</h2>
    ${P.hall.story.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    <p><a class="text-link" href="/lamia-brechet/">Rencontrer Lamia et découvrir sa démarche</a></p>
  </div>
</section>`,
  })
);

// Le Salon de Lamia
page(
  '/salon/',
  layout({
    title: 'Le Salon de Lamia · Lives et débats',
    description: 'Les lives de Lamia Femme Berbère : couple, célibat, engagement, humour et culture kabyle, tous les soirs de 21 h à 23 h.',
    path: '/salon/',
    room: roomBySlug.salon,
    body: `${roomHead(roomBySlug.salon)}
<section class="room-body two-col">
  <div>
    <p class="prose-lead">${esc(P.salon.intro)}</p>
    ${P.salon.lives
      .map(
        (l) => `<article class="live-card">${cover('live', 'Couverture du Live Mariage Kabyle de Lamia', 'live-cover')}<h2>${esc(l.name)}</h2><p class="live-when">${esc(l.when)}</p><p>${esc(l.text)}</p><a class="btn btn-ink" href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">Suivre Lamia sur TikTok</a></article>`
      )
      .join('')}
  </div>
  <aside class="side-note">
    <h2>Les règles du Salon</h2>
    ${list(P.salon.rules)}
    <h2>Retrouver Lamia</h2>
    <ul class="social-list">
      <li><a href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">TikTok @lamiaberbere</a></li>
      <li data-social="instagram" hidden><a rel="noopener" target="_blank">Instagram</a></li>
      <li><a href="https://www.facebook.com/femmeberberes/" rel="noopener" target="_blank">Facebook Femme Berbère</a></li>
      <li data-social="youtube" hidden><a rel="noopener" target="_blank">YouTube</a></li>
    </ul>
  </aside>
</section>
${otherRooms('salon')}`,
  })
);

// La Bibliothèque de Yemma
page(
  '/bibliotheque/',
  layout({
    title: 'La Bibliothèque de Yemma · Werdi, ouvre les yeux !',
    description: 'La collection Yemma Werdi de Lamia Bréchet : Werdi, ouvre les yeux !, le petit manuel de la fille amoureuse, du virtuel au réel.',
    path: '/bibliotheque/',
    room: roomBySlug.bibliotheque,
    body: `${roomHead(roomBySlug.bibliotheque)}
<section class="book-feature">
  ${cover('werdi', 'Couverture du livre Werdi, ouvre les yeux ! de Lamia Bréchet', 'book-cover') || '<figure><img src="/images/marque/yemma-portrait-700.webp" width="700" height="1050" loading="lazy" alt="Illustration : Yemma, la voix de la collection"></figure>'}
  <div>
    <h2>${esc(P.bibliotheque.book.title)}</h2>
    <p class="book-sub">${esc(P.bibliotheque.book.subtitle)}</p>
    <blockquote>« ${esc(P.bibliotheque.book.quote)} »</blockquote>
    <p>${esc(P.bibliotheque.book.text)}</p>
    <p>${esc(P.bibliotheque.intro)}</p>
    <p><a class="btn btn-line" href="/werdi-ouvre-les-yeux/">Découvrir le livre</a></p>
  </div>
</section>
<section class="room-shelf" aria-labelledby="shelf-title">
  <h2 id="shelf-title">Sur les étagères</h2>
  ${productGrid(roomBySlug.bibliotheque.productCategories)}
</section>
${otherRooms('bibliotheque')}`,
  })
);

// L'Écrin
page(
  '/ecrin/',
  layout({
    title: 'L’Écrin · Bijoux kabyles émaillés',
    description: 'Bijoux kabyles en argent émaillé, alliances et créations de la Maison Lamia Femme Berbère.',
    path: '/ecrin/',
    room: roomBySlug.ecrin,
    body: `${roomHead(roomBySlug.ecrin)}
<section class="room-body">
  <p class="prose-lead">${esc(P.ecrin.intro)}</p>
  ${productGrid(roomBySlug.ecrin.productCategories)}
  <p class="fine">${esc(P.ecrin.note)}</p>
</section>
${otherRooms('ecrin')}`,
  })
);

// Le Grenier des Trouvailles
page(
  '/grenier/',
  layout({
    title: 'Le Grenier des Trouvailles · Brocante de Lamia',
    description: 'Les coups de cœur de brocante de Lamia : livres anciennes éditions, bibelots, cadres, sculptures, cartes postales, pièces uniques.',
    path: '/grenier/',
    room: roomBySlug.grenier,
    body: `${roomHead(roomBySlug.grenier)}
<section class="room-body two-col">
  <div><p class="prose-lead">${esc(P.grenier.intro)}</p></div>
  <aside class="side-note"><h2>Ce qu’on trouve au Grenier</h2>${list(P.grenier.families)}</aside>
</section>
<section class="room-shelf" aria-labelledby="finds-title">
  <h2 id="finds-title">Les trouvailles du moment</h2>
  ${productGrid(roomBySlug.grenier.productCategories, { sold: true })}
</section>
${otherRooms('grenier')}`,
  })
);

// La Boutique
page(
  '/boutique/',
  layout({
    title: 'La Boutique · Maison Lamia Femme Berbère',
    description: 'Tous les bijoux kabyles, livres et trouvailles de la Maison Lamia Femme Berbère, rangés par pièce.',
    path: '/boutique/',
    room: roomBySlug.boutique,
    body: `${roomHead(roomBySlug.boutique)}
<section class="room-body">${productGrid(roomBySlug.boutique.productCategories, { group: true })}</section>`,
  })
);

// Fiche produit (données chargées côté navigateur)
page(
  '/produit/',
  layout({
    title: 'Une pièce de la Maison · Lamia Femme Berbère',
    description: 'Une pièce de la Maison Lamia Femme Berbère.',
    path: '/produit/',
    body: `<section class="product-page" data-product-page><p class="loading">La pièce arrive…</p></section>`,
  })
);

// Le Salon du Speed Dating
page(
  '/speed-dating/',
  layout({
    title: 'Le Salon du Speed Dating · Rencontres sérieuses',
    description: 'Des soirées de rencontre en ligne pour un public précis, en tête-à-tête, dans un cadre sûr veillé par Lamia.',
    path: '/speed-dating/',
    room: roomBySlug['speed-dating'],
    scripts: ['/assets/membre.js'],
    body: `${roomHead(roomBySlug['speed-dating'])}
<section class="room-body two-col">
  <div>
    <p class="prose-lead">${esc(P.speedDating.intro)}</p>
    <h2>Comment se passe une soirée</h2>
    <ol class="steps">${P.speedDating.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </div>
  <aside class="side-note">
    <h2>Chaque soirée a son public</h2>
    <p>Lamia choisit pour chaque soirée qui peut y participer, par exemple :</p>
    ${list(P.speedDating.criteria)}
    <p>Tu ne vois que les soirées qui te correspondent. Personne ne peut parcourir les profils des autres membres.</p>
  </aside>
</section>
<section class="events" aria-labelledby="events-title">
  <h2 id="events-title">Les prochaines soirées</h2>
  <div class="event-grid" data-events><p class="loading">Les soirées arrivent…</p></div>
</section>
<section class="member-panel" aria-labelledby="member-title" data-member>
  <h2 id="member-title">Ton espace membre</h2>
  <div data-member-out>
    <p>Crée ton espace pour réserver une soirée. Ton adresse email reste privée.</p>
    <div class="auth-grid">
      <form data-signup><h3>Créer mon espace</h3><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Mot de passe<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn btn-ink" type="submit">Créer mon espace</button></form>
      <form data-login><h3>J’ai déjà un espace</h3><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-line" type="submit">Me connecter</button></form>
    </div>
  </div>
  <div data-member-in hidden>
    <p>Connectée en tant que <strong data-member-email></strong>.</p>
    <button class="btn btn-line" type="button" data-logout>Me déconnecter</button>
  </div>
  <p class="form-status" role="status" data-member-status></p>
</section>
<section class="room-body"><p>Tu as participé à une soirée ? <a class="text-link" href="/speed-dating/souhaits/">Indique qui tu aimerais revoir</a>.</p></section>
<section class="origin">
  <blockquote>« ${esc(P.speedDating.promise)} »<cite>Lamia</cite></blockquote>
  <p>${esc(P.speedDating.origin)}</p>
</section>`,
  })
);

// Le Cabinet des Confidences
page(
  '/confidences/',
  layout({
    title: 'Le Cabinet des Confidences · Alerter Lamia',
    description: 'Alerter Lamia en toute confidentialité : faux profil, pression, comportement inquiétant.',
    path: '/confidences/',
    room: roomBySlug.confidences,
    scripts: ['/assets/membre.js'],
    body: `${roomHead(roomBySlug.confidences)}
<section class="room-body two-col">
  <div>
    <p class="prose-lead">${esc(P.confidences.intro)}</p>
    <form class="report-form" data-report hidden>
      <h2>Alerter Lamia</h2>
      <label>Profil ou personne concernée<input name="reported_label" required maxlength="200"></label>
      <label>Pourquoi veux-tu m’alerter ?
        <select name="reason" required>
          <option value="not_marriage">Ne cherche pas réellement le mariage</option>
          <option value="fake_profile">Faux profil ou identité douteuse</option>
          <option value="already_partnered">Déjà marié·e ou en couple</option>
          <option value="pressure">Insistance, pression ou propos déplacés</option>
          <option value="scam">Arnaque ou demande d’argent</option>
          <option value="danger">Menace, harcèlement ou danger</option>
          <option value="other">Autre</option>
        </select>
      </label>
      <label>Raconte-moi ce qui s’est passé<textarea name="written_details" rows="6" maxlength="5000"></textarea></label>
      <div class="audio-row"><button class="btn btn-line" type="button" data-audio-start>Enregistrer un audio</button><button class="btn btn-line" type="button" data-audio-stop disabled>Arrêter</button><span data-audio-state></span></div>
      <button class="btn btn-ink" type="submit">Envoyer l’alerte à Lamia</button>
    </form>
    <div data-report-login>
      <p>Pour envoyer une alerte, connecte-toi à ton espace membre. Cela permet à Lamia de te recontacter si besoin.</p>
      <p><a class="btn btn-ink" href="/speed-dating/#member-title">Me connecter ou créer mon espace</a></p>
    </div>
    <p class="form-status" role="status" data-report-status></p>
  </div>
  <aside class="side-note">
    <h2>Ce que je te garantis</h2>
    ${list(P.confidences.guarantees)}
    <p class="urgent">${esc(P.confidences.emergency)}</p>
  </aside>
</section>`,
  })
);

// Le Patio
page(
  '/patio/',
  layout({
    title: 'Le Patio · Communauté Lamia Femme Berbère',
    description: 'Annonces, célébrations, témoignages et rendez-vous de la communauté Lamia Femme Berbère.',
    path: '/patio/',
    room: roomBySlug.patio,
    body: `${roomHead(roomBySlug.patio)}
<section class="room-body">
  <p class="prose-lead">${esc(P.patio.intro)}</p>
  <div class="now-grid">
    <article class="now-card" data-accent="rouge"><p class="now-room">Chaque soir</p><h3>Live Mariage Kabyle</h3><p>De 21 h à 23 h, sur TikTok.</p><a href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">Rejoindre le live</a></article>
    <article class="now-card" data-accent="rouge" data-next-event><p class="now-room">Le Salon du Speed Dating</p><h3>Prochaine soirée</h3><p>Les prochaines soirées arrivent.</p><a href="/speed-dating/">Voir les soirées</a></article>
    <article class="now-card" data-accent="vert"><p class="now-room">Bientôt</p><h3>Vos témoignages</h3><p>Le mur des célébrations et des témoignages ouvrira avec les premiers récits de la communauté.</p></article>
  </div>
</section>
${otherRooms('patio')}`,
  })
);

// La Galerie
page(
  '/galerie/',
  layout({
    title: 'La Galerie · Patrimoine des bijoux kabyles',
    description: 'L’émail, le corail et la transmission : ce que racontent les bijoux kabyles.',
    path: '/galerie/',
    room: roomBySlug.galerie,
    body: `${roomHead(roomBySlug.galerie)}
<section class="gallery-feature">
  <figure><img src="/images/collier/collier-kabyle-15g-detail-1120.webp" width="1120" height="1399" loading="lazy" alt="Détail d’un médaillon kabyle émaillé bleu, vert et jaune, cabochon de corail au centre"><figcaption>Visuel d’ambiance</figcaption></figure>
  <div>
    <p class="prose-lead">${esc(P.galerie.intro)}</p>
    ${P.galerie.items.map((i) => `<h2>${esc(i.title)}</h2><p>${esc(i.text)}</p>`).join('')}
  </div>
</section>
${otherRooms('galerie')}`,
  })
);

// Pièces prévues (porte entrouverte)
for (const r of soonRooms) {
  page(
    r.path,
    layout({
      title: `${r.name} · Bientôt dans la Maison`,
      description: r.summary,
      path: r.path,
      room: r,
      body: `<section class="room-head is-soon">
  <p class="room-name"><span class="pip" aria-hidden="true"></span>${esc(r.name)}</p>
  <h1>${esc(r.welcome)}</h1>
  <p class="lead">${esc(r.summary)}</p>
  <p class="door-ajar">Cette porte est encore entrouverte. Pour être prévenue de son ouverture, suis Lamia sur <a href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">TikTok</a>.</p>
</section>
${otherRooms(r.slug)}`,
    })
  );
}

// Lamia Bréchet (URL conservée)
page(
  '/lamia-brechet/',
  layout({
    title: 'Lamia Bréchet, autrice de Yemma Werdi | Lamia Femme Berbère',
    description: 'Lamia Bréchet, la voix derrière Yemma Werdi : des lives aux pages d’un livre, transmettre sans décider à la place de l’autre.',
    path: '/lamia-brechet/',
    room: roomBySlug.hall,
    body: `<article class="article">
  <p class="room-name"><span class="pip" aria-hidden="true"></span>Qui est Lamia</p>
  <h1>Lamia Bréchet, la voix derrière Yemma Werdi.</h1>
  <p class="lead">Des échanges en live aux pages d’un livre, Lamia parle d’amour, de mariage et de choix avec une même intention : transmettre sans décider à la place de l’autre.</p>
  <h2>« De mon écran à ton cœur »</h2>
  <p>Dans le mot qui ouvre <em>Werdi, ouvre les yeux !</em>, Lamia Bréchet s’adresse à sa lectrice comme à une fille ou à une sœur. Elle évoque les lives, les vidéos et les discussions sur l’amour et le mariage qui peuvent avoir été leur première rencontre.</p>
  <p>Le livre prolonge cette proximité. La voix de Yemma apporte des repères pour prendre le temps de connaître l’autre, écouter, parler et observer la cohérence des actes dans la durée.</p>
  <h2>Une transmission ancrée dans la culture kabyle</h2>
  <p>L’univers Yemma Werdi fait dialoguer la transmission kabyle avec les questions des relations d’aujourd’hui, du virtuel au réel. La tendresse d’une parole maternelle y accompagne la liberté de choisir.</p>
  <p>Le Mektoub a sa place dans cette vision de l’amour. Mais une rencontre ne construit pas à elle seule un couple : le dialogue, les efforts réciproques et la manière de se respecter comptent aussi.</p>
  <blockquote>« Je ne suis pas là pour décider à ta place »<cite>Lamia, « Un mot de Lamia »</cite></blockquote>
  <h2>Aimer sans s’effacer</h2>
  <p>La démarche de Lamia laisse une place à l’imperfection. Les maladresses et les différences ne sont pas toutes des signaux d’alerte. L’enjeu est de distinguer les ajustements ordinaires d’un couple de ce qui abîme le respect, la liberté ou la sécurité.</p>
  <p>Choisir avec les yeux ouverts, c’est pouvoir aimer, faire des concessions et construire une relation sans renoncer à soi.</p>
  <p class="article-links"><a class="btn btn-ink" href="/werdi-ouvre-les-yeux/">Découvrir le livre</a><a class="btn btn-line" href="/salon/">Les lives de Lamia</a></p>
</article>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: 'Lamia Bréchet', url: SITE_URL + '/lamia-brechet/', sameAs: ['https://www.tiktok.com/@lamiaberbere'] })}</script>`,
  })
);

// Werdi, ouvre les yeux ! (URL conservée)
page(
  '/werdi-ouvre-les-yeux/',
  layout({
    title: 'Werdi, ouvre les yeux ! — Livre de Lamia Bréchet',
    description: 'Werdi, ouvre les yeux ! : le petit manuel de la fille amoureuse, du virtuel au réel, par Lamia Bréchet. Collection Yemma Werdi.',
    path: '/werdi-ouvre-les-yeux/',
    room: roomBySlug.bibliotheque,
    body: `<article class="article">
  <p class="room-name"><span class="pip" aria-hidden="true"></span>La Bibliothèque de Yemma</p>
  <h1>Werdi, ouvre les yeux !</h1>
  ${cover('werdi', 'Couverture du livre Werdi, ouvre les yeux ! de Lamia Bréchet', 'book-cover article-cover')}
  <p class="lead">Le petit manuel de la fille amoureuse, du virtuel au réel. Un livre de Lamia Bréchet pour aimer, choisir et construire sans se perdre.</p>
  <h2>La voix de Yemma pour parler d’amour</h2>
  <p>Ce guide s’adresse aux jeunes femmes qui se questionnent sur une rencontre, une relation ou un projet de mariage. Il invite à garder la douceur de l’amour tout en prenant le temps de connaître la personne en face de soi.</p>
  <p>Dans son mot d’ouverture, Lamia présente une parole de transmission : elle ne choisit pas le partenaire de sa lectrice. Elle propose de regarder la relation avec attention, de dialoguer et de laisser les actes éclairer les promesses.</p>
  <h2>Du virtuel au réel : prendre le temps de choisir</h2>
  <p>Une discussion en ligne peut ouvrir une histoire. Pour lui donner une place dans la vie réelle, le livre met en avant la confiance, le temps et les échanges. Une belle déclaration ne suffit pas à montrer ce qu’un couple saura construire.</p>
  <p>Le Mektoub, les attentes, les différences et les concessions traversent cette réflexion. L’amour peut laisser place au rêve tout en s’appuyant sur des choix concrets et réciproques.</p>
  <h2>Construire une relation sans se perdre</h2>
  <p>La conclusion rappelle qu’un couple n’a pas besoin d’être parfait. Il apprend, s’ajuste et répare. Le respect de chacun reste le fil conducteur : s’aimer sans s’effacer, faire des concessions sans se trahir et avancer à deux.</p>
  <blockquote>« Le Mektoub peut ouvrir une porte. À vous deux d’en faire une maison. »<cite>Lamia, conclusion de Werdi, ouvre les yeux !</cite></blockquote>
  <p class="article-links"><a class="btn btn-ink" href="/bibliotheque/">Le livre dans la Bibliothèque</a><a class="btn btn-line" href="/lamia-brechet/">Rencontrer l’autrice</a></p>
</article>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Book', name: 'Werdi, ouvre les yeux !', author: { '@type': 'Person', name: 'Lamia Bréchet' }, inLanguage: 'fr', url: SITE_URL + '/werdi-ouvre-les-yeux/' })}</script>`,
  })
);

// Après le paiement d'une place
page(
  '/speed-dating/merci/',
  layout({
    title: 'Merci · Le Salon du Speed Dating',
    description: 'Confirmation de ta place.',
    path: '/speed-dating/merci/',
    room: roomBySlug['speed-dating'],
    noindex: true,
    scripts: ['/assets/membre.js'],
    body: `<section class="room-head" data-merci><p class="room-name"><span class="pip" aria-hidden="true"></span>Le Salon du Speed Dating</p><h1>Vérification de ton paiement…</h1><p class="lead" data-merci-text>Un instant, je confirme ta place.</p><p><a class="btn btn-line" href="/speed-dating/">Revenir au Salon</a></p></section>`,
  })
);

// Souhaits après une soirée
page(
  '/speed-dating/souhaits/',
  layout({
    title: 'Mes souhaits après la soirée · Le Salon du Speed Dating',
    description: 'Indique en privé les personnes que tu souhaites revoir.',
    path: '/speed-dating/souhaits/',
    room: roomBySlug['speed-dating'],
    noindex: true,
    scripts: ['/assets/membre.js'],
    body: `${roomHead({ ...roomBySlug['speed-dating'], slug: 'souhaits', welcome: 'Qui aimerais-tu revoir ?', summary: 'Tes souhaits restent privés. Si un souhait est réciproque, Lamia vous met en relation.' })}
<section class="room-body">
  <form class="report-form" data-wishes hidden>
    <label>La soirée<select name="event_id" required></select></label>
    <label>Les prénoms ou numéros des personnes que tu souhaites revoir<textarea name="wished" rows="4" maxlength="1000" required placeholder="Par exemple : Yanis (n° 4), Karim (n° 9)"></textarea></label>
    <label>Un mot pour Lamia (facultatif)<textarea name="message" rows="3" maxlength="1000"></textarea></label>
    <button class="btn btn-ink" type="submit">Envoyer mes souhaits</button>
  </form>
  <div data-wishes-login><p>Connecte-toi à ton espace membre pour indiquer tes souhaits.</p><p><a class="btn btn-ink" href="/speed-dating/#member-title">Me connecter</a></p></div>
  <p class="form-status" role="status" data-wishes-status></p>
</section>`,
  })
);

// Pages légales (brouillons)
for (const lp of legalPages) {
  page(
    lp.path,
    layout({
      title: `${lp.title} · Lamia Femme Berbère`,
      description: lp.title,
      path: lp.path,
      noindex: true,
      body: `<article class="article legal"><p class="draft-banner">Brouillon : ce texte sera complété et relu avant l’ouverture des ventes.</p><h1>${esc(lp.title)}</h1>${lp.body}</article>`,
    })
  );
}

// 404
page(
  '/404.html',
  layout({
    title: 'Porte introuvable · Lamia Femme Berbère',
    description: 'Cette page n’existe pas.',
    path: '/404.html',
    noindex: true,
    body: `<section class="room-head"><p class="room-name"><span class="pip" aria-hidden="true"></span>Porte introuvable</p><h1>Cette porte ne mène nulle part.</h1><p class="lead">La page a peut-être changé de pièce. Reviens au Hall pour retrouver ton chemin.</p><p><a class="btn btn-ink" href="/#plan">Revenir au plan de la Maison</a></p></section>`,
  })
);

// ---------------------------------------------------------------- écriture

await rm(DIST, { recursive: true, force: true });
for (const p of pages) {
  const file = p.path.endsWith('.html') ? join(DIST, p.path) : join(DIST, p.path, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, p.html);
}
await cp(join(ROOT, 'public'), DIST, { recursive: true });
await mkdir(join(DIST, 'assets'), { recursive: true });
for (const f of ['maison.css', 'maison.js', 'membre.js']) await cp(join(ROOT, 'src', f), join(DIST, 'assets', f));

const indexable = pages.filter((p) => !p.path.endsWith('.html') && !['/produit/', '/speed-dating/merci/', '/speed-dating/souhaits/', '/cgv/', '/mentions-legales/', '/confidentialite/'].includes(p.path));
await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable.map((p) => `<url><loc>${SITE_URL}${p.path}</loc></url>`).join('')}</urlset>\n`
);
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /pilotage.html\nDisallow: /admin-soirees.html\nDisallow: /speed-dating/merci/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Maison générée : ${pages.length} pages dans dist/`);
