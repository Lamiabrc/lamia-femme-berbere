// Générateur de la Maison Lamia Femme Berbère.
// Aucune dépendance : node build/build.mjs → dossier dist/ (servi par Vercel).
// Les pages sont pré-rendues ; les données vivantes (produits, soirées) sont chargées
// côté navigateur depuis Supabase avec la clé publique uniquement.

import { mkdir, rm, writeFile, cp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rooms, roomBySlug, floors } from '../content/rooms.mjs';
import * as P from '../content/pages.mjs';
import { legalPages } from '../content/legal.mjs';
import { facade } from './facade.mjs';

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
    ${link('/#plan', 'La Maison', 'plan')}
    ${link('/ecrin/', 'L’Écrin', 'ecrin')}
    ${link('/grenier/', 'Le Grenier', 'grenier')}
    ${link('/bibliotheque/', 'La Bibliothèque', 'bibliotheque')}
    ${link('/speed-dating/', 'Rencontres', 'speed-dating')}
  </nav>
  <div class="header-actions">
    <a class="plan-link" href="/#plan">La Maison</a>
    <a class="alert-link" href="/confidences/">Alerter Lamia</a>
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
    body: `<section class="entree" data-entree aria-label="Entrer dans la Maison">
  <div class="entree-scene">
    <div class="entree-cam" data-entree-cam>
      <img class="entree-img" src="/images/maison/facade-soir-1672.webp" srcset="/images/maison/facade-soir-800.webp 800w, /images/maison/facade-soir-1200.webp 1200w, /images/maison/facade-soir-1672.webp 1672w" sizes="(max-width: 700px) 200vw, 100vw" width="1672" height="941" alt="" fetchpriority="high" decoding="async">
    </div>
    <span class="entree-stars" aria-hidden="true"></span>
    <span class="entree-glow" aria-hidden="true"></span>
    <div class="entree-text">
      <p class="entree-kicker">Lamia Femme Berbère</p>
      <p class="entree-title">La Maison t’attend.</p>
      <p class="entree-hint">Fais défiler pour pousser la porte</p>
      <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true"><path d="M2 4l9 9 9-9M2 17l9 9 9-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <span class="entree-lumiere" aria-hidden="true"></span>
    <a class="entree-skip" href="#hall">Entrer directement</a>
  </div>
</section>

<section class="hall-hero" id="hall">
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
  <div class="hall-apercus" aria-label="En ce moment dans la Maison">
    <a class="apercu is-bal" href="/speed-dating/#events-title">
      <span class="apercu-mask" aria-hidden="true"><svg viewBox="0 0 64 32" width="64" height="32"><path d="M2 8c10-6 20-4 30 4C42 4 52 2 62 8c0 12-8 20-18 20-6 0-9-4-12-8-3 4-6 8-12 8C10 28 2 20 2 8Z" fill="none" stroke="currentColor" stroke-width="2.2"/><ellipse cx="19" cy="15" rx="6" ry="4" fill="currentColor"/><ellipse cx="45" cy="15" rx="6" ry="4" fill="currentColor"/></svg></span>
      <span class="apercu-kicker">Speed dating · gratuit</span>
      <strong>Bal masqué de Venise</strong>
      <span class="apercu-info">Samedi 31 octobre, 21 h · en visio · salons France, Algérie, Canada, autres pays et tous âges · 20 personnes par salon</span>
      <span class="apercu-cta">Réserver ma place →</span>
    </a>
    <a class="apercu" href="/produit/?p=collier-kabyle-argente-emaille-15g">
      <img src="/images/collier/collier-kabyle-15g-hero-320.webp" width="320" height="400" alt="" loading="lazy">
      <span class="apercu-kicker">L’Écrin · précommande</span>
      <strong>Collier kabyle émaillé</strong>
      <span class="apercu-info">Modèle de 1974, fabriqué à Ath Yenni · 99 €</span>
    </a>
    <a class="apercu" href="/bibliotheque/">
      <img src="/images/marque/yemma-portrait-700.webp" width="700" height="1050" alt="" loading="lazy">
      <span class="apercu-kicker">La Bibliothèque · précommande</span>
      <strong>Werdi, ouvre les yeux !</strong>
      <span class="apercu-info">Livre broché 15,90 € · ebook 12,90 €</span>
    </a>
    <a class="apercu" href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">
      <img src="/images/marque/lamia-logo-160.webp" width="160" height="160" alt="" loading="lazy" class="is-logo">
      <span class="apercu-kicker">Le Salon · chaque soir</span>
      <strong>Live Mariage Kabyle</strong>
      <span class="apercu-info">De 21 h à 23 h, en direct sur TikTok</span>
    </a>
  </div>
  <a class="hall-cue" href="#plan"><span>Approcher de la Maison</span><svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true"><path d="M2 4l9 9 9-9M2 17l9 9 9-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
</section>

<section class="plan-section" id="plan" aria-labelledby="plan-title">
  <div class="plan-intro">
    <h2 id="plan-title">La Maison, à la tombée du soir</h2>
    <p>Les vitrines au rez-de-chaussée, les rencontres et la lecture au premier, les trouvailles tout en haut. Pousse la fenêtre qui t’appelle.</p>
  </div>
  ${facade(rooms)}
  <div class="floors">
    ${[...floors].reverse().map((f) => `<section class="floor" aria-labelledby="etage-${f.level}">
      <h3 id="etage-${f.level}">${esc(f.name)}<span>${esc(f.theme)}</span></h3>
      <ul class="room-index">${rooms.filter((r) => r.floor === f.level && r.slug !== 'hall').map((r) => `<li class="${r.status === 'soon' ? 'is-soon' : ''}" data-accent="${r.accent}"><a href="${r.path}"><span class="pip" aria-hidden="true"></span><strong>${esc(r.name)}</strong><span>${r.status === 'soon' ? 'Bientôt' : esc(r.welcome)}</span></a></li>`).join('')}</ul>
    </section>`).join('')}
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
<section class="room-body two-col">
  <div><h2>${esc(P.ecrin.athYenni.title)}</h2><p>${esc(P.ecrin.athYenni.text)}</p></div>
  <aside class="side-note"><p><strong>${esc(P.ecrin.athYenni.signature)}</strong></p></aside>
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
    title: 'Le Boudoir des Rencontres · Speed dating sérieux',
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
    <p>Pour une soirée gratuite, pas besoin d’espace : inscris-toi directement dans la soirée, juste au-dessus. Ton espace membre sert ensuite à indiquer qui tu aimerais revoir et à alerter Lamia. Ton adresse email reste privée.</p>
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
    <article class="now-card" data-accent="rouge" data-next-event><p class="now-room">Le Boudoir des Rencontres</p><h3>Prochaine soirée</h3><p>Les prochaines soirées arrivent.</p><a href="/speed-dating/">Voir les soirées</a></article>
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

// Qui est Lamia ? (URL conservée) — page éditoriale, texte de Lamia
const LIVE_PHOTO = existsSync(join(ROOT, 'public/images/lamia/lamia-live-900.webp'));
page(
  '/lamia-brechet/',
  layout({
    title: 'Qui est Lamia ? Lamia Bréchet Ighil | Lamia Femme Berbère',
    description: 'Lamia Bréchet Ighil, derrière « Lamia Femme Berbère » : les lives, la culture kabyle, Yemma Werdi, les rencontres, les bijoux d’Ath Yenni, et une Maison où l’on vient la retrouver.',
    path: '/lamia-brechet/',
    room: roomBySlug.hall,
    body: `<article class="lamia-page">
  <header class="lamia-open">
    <div class="lamia-open-text">
      <p class="lamia-kicker">Qui est Lamia ?</p>
      <h1><span class="lamia-prenom">Lamia</span><span class="lamia-nom">Bréchet Ighil</span></h1>
      <p class="lamia-derriere">derrière « Lamia Femme Berbère »</p>
    </div>
    <figure class="lamia-portrait">
      <img src="/images/lamia/lamia-salon-900.webp" srcset="/images/lamia/lamia-salon-560.webp 560w, /images/lamia/lamia-salon-900.webp 900w, /images/lamia/lamia-salon-1122.webp 1122w" sizes="(max-width: 900px) 92vw, 46vw" width="1122" height="1402" fetchpriority="high" alt="Lamia Bréchet Ighil dans son salon, en robe kabyle brodée, lunettes, collier et bracelet d’argent émaillé, au coucher du soleil">
    </figure>
  </header>

  <section class="lamia-intro">
    <p class="lamia-lettrine">Je m’appelle Lamia Bréchet Ighil.</p>
    <p>Si tu me connais déjà, il y a de fortes chances que nous nous soyons rencontrés sur un écran : dans un live, une vidéo, un débat sur le couple, le mariage, le célibat… ou au détour d’une de ces discussions où l’on commence très sérieusement et où, cinq minutes plus tard, tout le monde éclate de rire.</p>
    <p>Lamia Femme Berbère, c’est moi, mais ce n’est pas seulement mon nom sur les réseaux.</p>
    <p class="lamia-fort">C’est un regard, une voix, une communauté et désormais une Maison.</p>
    <p>Je parle d’amour et de mariage, bien sûr. Mais aussi de société, de relations humaines, de contradictions, de transmission et de tout ce qui fait nos vies entre plusieurs cultures, plusieurs générations et plusieurs façons de voir le monde.</p>
    <p>Et j’aime le faire avec une règle assez simple : <em>on peut parler de choses sérieuses sans devenir triste ni moralisatrice.</em></p>
  </section>

  <section class="lamia-chapitre">
    <p class="lamia-num">I</p>
    <h2>Tout a commencé par la parole</h2>
    <p>Avant les livres, avant les bijoux et avant La Maison, il y a eu les échanges.</p>
    <p class="lamia-fort">Les lives sont devenus mon salon.</p>
    <p>On y parle de célibat, d’amour, de mariage, de choix, de comportements qui nous font rire ou nous interrogent, de ce qu’on attend d’un homme ou d’une femme, de traditions que l’on veut conserver et de celles que l’on a parfois envie de bousculer.</p>
    <p>Je ne cherche pas à distribuer les bons et les mauvais points. J’aime davantage poser la question que personne n’ose poser, écouter les réponses, confronter les points de vue et parfois mettre les pieds dans le plat.</p>
    <p><em>Avec humour, mais jamais sans respect.</em></p>
    <p>C’est aussi pour cela que beaucoup de personnes qui arrivent pour un débat restent ensuite pour l’ambiance, les rencontres et la communauté.</p>
  </section>

  <section class="lamia-chapitre">
    <p class="lamia-num">II</p>
    <h2>«&nbsp;Lamia Femme Berbère&nbsp;», entre héritage et vie d’aujourd’hui</h2>
    <p>Je suis profondément attachée à la culture kabyle et à ce qu’elle transmet : la famille, les histoires, les bijoux, les symboles, la parole des anciens, cette façon particulière de rire de nous-mêmes aussi.</p>
    <p>Mais je ne veux pas enfermer cette culture dans une vitrine. <strong>Une culture vit lorsqu’on la porte dans le présent.</strong></p>
    <p>C’est cette idée que j’essaie de faire vivre dans tout ce que je crée : faire dialoguer l’héritage et la modernité, la Kabylie et la France, les traditions et les choix individuels.</p>
    <p class="lamia-trio"><span>Sans folklore forcé.</span><span>Sans nostalgie obligatoire.</span><span>Sans demander à quelqu’un de choisir une moitié de lui-même.</span></p>
  </section>

  <section class="lamia-chapitre">
    <p class="lamia-num">III</p>
    <h2>Yemma Werdi est née de ces conversations</h2>
    <p>À force de parler avec des jeunes femmes de leurs rencontres, de leurs doutes, de leurs emballements amoureux et parfois de leurs mauvaises surprises, une autre voix est apparue : Yemma.</p>
    <p>La mère qui écoute avant de juger. Celle qui peut te dire :</p>
    <blockquote class="lamia-citation">Aime. Rêve. Fais confiance.<br>Mais garde les yeux ouverts.</blockquote>
    <p>C’est ainsi qu’est né <a class="text-link" href="/werdi-ouvre-les-yeux/"><em>Werdi, ouvre les yeux !</em></a></p>
    <p>Je ne veux pas dire à une femme qui elle doit aimer ni décider à sa place. Je veux lui donner suffisamment de repères pour qu’elle puisse décider elle-même, avec son cœur mais aussi avec son intelligence.</p>
    <p>Et je tiens beaucoup à une nuance : construire un couple ne signifie pas chercher une personne parfaite. Un couple demande aussi du dialogue, des efforts, des compromis et des concessions. Il faut simplement apprendre à distinguer <strong>faire une place à l’autre</strong> de <strong>s’effacer soi-même</strong>.</p>
  </section>

  <section class="lamia-chapitre">
    <p class="lamia-num">IV</p>
    <h2>Et puis il y a eu les rencontres</h2>
    <p>Les lives m’ont également montré quelque chose : énormément de personnes veulent encore rencontrer quelqu’un sérieusement, mais ne se reconnaissent pas forcément dans les applications classiques.</p>
    <p>Alors j’ai commencé à créer des occasions de rencontre autour de la communauté. <strong>Pas un catalogue de profils à faire défiler.</strong> Des moments où des personnes viennent avec une véritable intention, discutent, rient, se découvrent et décident ensuite, librement, si elles souhaitent se revoir.</p>
    <p>C’est aujourd’hui <a class="text-link" href="/speed-dating/">le Boudoir des Rencontres</a> de La Maison.</p>
    <p>Et parce qu’une rencontre doit rester respectueuse et sûre, j’ai aussi voulu <a class="text-link" href="/confidences/">un Cabinet des Confidences</a> : un endroit où quelqu’un peut venir me signaler discrètement un comportement inquiétant.</p>
  </section>

  <section class="lamia-chapitre">
    <p class="lamia-num">V</p>
    <h2>Mes bijoux : porter quelque chose qui raconte d’où l’on vient</h2>
    <p>Mon amour des bijoux kabyles est devenu lui aussi un projet concret.</p>
    <p>Dans <a class="text-link" href="/ecrin/">L’Écrin</a>, je développe avec Hamani Hamid, chef artisan à Ath Yenni, une collection de bijoux fabriqués en Kabylie par les artisans bijoutiers d’Ath Yenni.</p>
    <p>Je ne voulais pas simplement vendre un objet « inspiré de ». Je voulais participer à une création qui reste liée aux artisans, au geste, aux émaux, à l’argent et à cette histoire que l’on porte littéralement sur soi.</p>
    <p>Le premier collier de la Maison reprend un modèle exclusif créé en 1974.</p>
  </section>

  <section class="lamia-live${LIVE_PHOTO ? ' has-photo' : ''}">
    ${LIVE_PHOTO ? `<figure><img src="/images/lamia/lamia-live-900.webp" width="900" height="1125" loading="lazy" alt="Lamia en live, casque sur les oreilles, motifs kabyles dessinés sur le visage"></figure>` : ''}
    <div>
      <h2>Et oui… c’est aussi moi en live</h2>
      <p>Pas de studio, pas de personnage figé : c’est aussi comme ça que beaucoup d’entre vous me connaissent. En direct, avec mes lunettes, mes idées, mes coups de gueule, mes fous rires… et parfois quelques thichrad supplémentaires.</p>
      <p><a class="text-link" href="/salon/">Tous les soirs au Salon, de 21 h à 23 h</a></p>
    </div>
  </section>

  <section class="lamia-chapitre lamia-maison">
    <h2>La Maison, c’est finalement tout ça</h2>
    <p>Aujourd’hui, La Maison Lamia Femme Berbère réunit les différentes facettes de ce que je construis.</p>
    <ul class="lamia-pieces">
      <li><a href="/salon/"><strong>Le Salon</strong> pour parler.</a></li>
      <li><a href="/bibliotheque/"><strong>La Bibliothèque de Yemma</strong> pour transmettre.</a></li>
      <li><a href="/ecrin/"><strong>L’Écrin</strong> pour créer et faire vivre les bijoux d’Ath Yenni.</a></li>
      <li><a href="/speed-dating/"><strong>Le Boudoir</strong> pour provoquer de vraies rencontres.</a></li>
      <li><a href="/confidences/"><strong>Le Cabinet des Confidences</strong> pour protéger.</a></li>
      <li><a href="/grenier/"><strong>Le Grenier</strong> pour mes trouvailles et mes coups de cœur.</a></li>
      <li><a href="/patio/"><strong>Le Patio</strong> pour la communauté.</a></li>
    </ul>
    <p>Et d’autres portes s’ouvriront encore.</p>
    <p>Parce que cette Maison n’a pas été pensée comme une boutique dans laquelle on vient seulement acheter quelque chose. <strong>Elle a été pensée comme un endroit où l’on vient retrouver Lamia.</strong></p>
  </section>

  <footer class="lamia-fin">
    <blockquote>« Tu peux être profondément attachée à ce que l’on t’a transmis et rester totalement libre de décider de ce que tu veux en faire. »</blockquote>
    <p class="lamia-bienvenue">Bienvenue chez moi. Bienvenue à la Maison.</p>
    <p class="lamia-boutons"><a class="btn btn-ink" href="/#hall">Entrer dans la Maison</a><a class="btn btn-line" href="/werdi-ouvre-les-yeux/">Découvrir Werdi</a><a class="btn btn-line" href="/salon/">Retrouver mes lives</a></p>
  </footer>
</article>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: 'Lamia Bréchet Ighil', alternateName: 'Lamia Femme Berbère', url: SITE_URL + '/lamia-brechet/', image: SITE_URL + '/images/lamia/lamia-salon-900.webp', sameAs: ['https://www.tiktok.com/@lamiaberbere', 'https://www.facebook.com/femmeberberes/'] })}</script>`,
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
    title: 'Merci · Le Boudoir des Rencontres',
    description: 'Confirmation de ta place.',
    path: '/speed-dating/merci/',
    room: roomBySlug['speed-dating'],
    noindex: true,
    scripts: ['/assets/membre.js'],
    body: `<section class="room-head" data-merci><p class="room-name"><span class="pip" aria-hidden="true"></span>Le Boudoir des Rencontres</p><h1>Vérification de ton paiement…</h1><p class="lead" data-merci-text>Un instant, je confirme ta place.</p><p><a class="btn btn-line" href="/speed-dating/">Revenir au Salon</a></p></section>`,
  })
);

// Souhaits après une soirée
page(
  '/speed-dating/souhaits/',
  layout({
    title: 'Mes souhaits après la soirée · Le Boudoir des Rencontres',
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
    body: `<section class="room-head"><p class="room-name"><span class="pip" aria-hidden="true"></span>Porte introuvable</p><h1>Cette porte ne mène nulle part.</h1><p class="lead">La page a peut-être changé de pièce. Reviens au Hall pour retrouver ton chemin.</p><p><a class="btn btn-ink" href="/#plan">Revenir à la Maison</a></p></section>`,
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
await cp(join(ROOT, 'content', 'shipping.mjs'), join(DIST, 'assets', 'shipping.mjs'));

const indexable = pages.filter((p) => !p.path.endsWith('.html') && !['/produit/', '/speed-dating/merci/', '/speed-dating/souhaits/', '/cgv/', '/mentions-legales/', '/confidentialite/'].includes(p.path));
await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable.map((p) => `<url><loc>${SITE_URL}${p.path}</loc></url>`).join('')}</urlset>\n`
);
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /pilotage.html\nDisallow: /admin-soirees.html\nDisallow: /speed-dating/merci/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Maison générée : ${pages.length} pages dans dist/`);
