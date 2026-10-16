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
import { legalPages, livraisonTexte, tvaTexte } from '../content/legal.mjs';
import { reglagesPropres } from '../content/shipping.mjs';
import { facade } from './facade.mjs';
import { EDITABLE, defaults, applyOverrides } from '../content/editable.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://lamia-femme-berbere.com').replace(/\/$/, '');
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || String(Date.now());

// Textes et images modifiés par Lamia depuis son tableau de bord (platform_settings « site_content »).
// Lus avec la clé de service, disponible uniquement pendant la construction sur Vercel.
const DEFAULTS = defaults();
let IMG = {};
async function loadOverrides() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) return {};
  try {
    const h = { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) };
    const r = await fetch('https://tybwvxinigahhntfeeur.supabase.co/rest/v1/platform_settings?key=eq.site_content&select=value', { headers: h, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return {};
    return (await r.json())[0]?.value?.values || {};
  } catch { return {}; }
}
const OVR = await loadOverrides();
IMG = applyOverrides(OVR);
// Tout texte ou image marqué avec T() / IMGT() devient modifiable depuis le tableau de bord (clés « site.* »).
const REGISTRE = [];
const vu = new Set();
const enreg = (f) => { if (!vu.has(f.key)) { vu.add(f.key); REGISTRE.push(f); DEFAULTS[f.key] = f.def; } };
const T = (key, group, label, def, long = false) => {
  enreg({ key: `site.${key}`, group, label, long, def });
  const v = OVR[`site.${key}`];
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : def;
};
const IMGT = (key, group, label, tag) => {
  const def = tag.match(/ src="([^"]+)"/)[1];
  enreg({ key: `site.${key}`, group, label, image: true, def });
  const v = OVR[`site.${key}`];
  if (typeof v !== 'string' || !/^(https:\/\/|\/images\/)/.test(v)) return tag;
  return tag.replace(/ srcset="[^"]*"/, '').replace(/ sizes="[^"]*"/, '').replace(` src="${def}"`, ` src="${v.replace(/"/g, '&quot;')}"`);
};
// Réglages de la boutique (frais d'envoi, TVA) pour les conditions de vente.
async function loadBoutique() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) return reglagesPropres();
  try {
    const h = { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) };
    const r = await fetch('https://tybwvxinigahhntfeeur.supabase.co/rest/v1/platform_settings?key=eq.boutique&select=value', { headers: h, signal: AbortSignal.timeout(10000) });
    return reglagesPropres(r.ok ? (await r.json())[0]?.value || {} : {});
  } catch { return reglagesPropres(); }
}
const BOUTIQUE = await loadBoutique();
const imgOr = (name, fallback) => IMG[name] || fallback;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

// Couverture fournie par Lamia : public/images/couvertures/<nom>-640.webp (et -1120.webp).
const cover = (name, alt, cls = 'cover') =>
  existsSync(join(ROOT, 'public/images/couvertures', `${name}-640.webp`))
    ? `<figure class="${cls}"><img src="/images/couvertures/${name}-640.webp" srcset="/images/couvertures/${name}-640.webp 640w, /images/couvertures/${name}-1120.webp 1120w" sizes="(max-width: 900px) 100vw, 40vw" alt="${esc(alt)}" loading="lazy"></figure>`
    : '';

const openRooms = rooms.filter((r) => r.status === 'open' && r.slug !== 'hall');
const soonRooms = rooms.filter((r) => r.status === 'soon');

const HOME_UNIVERSES = [
  {
    href: '/ecrin/',
    room: 'L’Écrin',
    title: 'Bijoux kabyles artisanaux d’Ath Yenni',
    text: 'Argent, émail, corail et créations de la Maison, façonnés à la main par des artisans d’Ath Yenni.',
  },
  {
    href: '/bibliotheque/',
    room: 'La Bibliothèque de Yemma',
    title: 'Livres, guides et transmission',
    text: 'Amour, relations, famille et culture : des livres pour transmettre et garder les yeux ouverts.',
  },
  {
    href: '/speed-dating/',
    room: 'Le Boudoir des Rencontres',
    title: 'Speed dating et rencontres sérieuses',
    text: 'Des soirées en visio, des tête-à-tête rapides et un cadre chaleureux pensé par Lamia.',
    featured: true,
  },
  {
    href: '/salon/',
    room: 'Le Salon de Lamia',
    title: 'Lives TikTok, débats et société',
    text: 'Couple, mariage, célibat, humour et sujets de société : retrouvez les prises de parole de Lamia.',
  },
  {
    href: '/grenier/',
    room: 'Le Grenier des Trouvailles',
    title: 'Brocante, objets anciens et coups de cœur',
    text: 'Objets français, souvenirs kabyles, livres anciens, décoration et curiosités chinées au fil du temps.',
  },
];

// ---------------------------------------------------------------- gabarit commun

function layout({ title, description, path, room, body, scripts = [], noindex = false, ambiance, ogTitle, ogDescription, ogImage, ogImageAlt, ogImageWidth = 600, ogImageHeight = 600 }) {
  const canonical = SITE_URL + path;
  const accent = room?.accent || 'rouge';
  const socialTitle = ogTitle || title;
  const socialDescription = ogDescription || description;
  const socialImage = ogImage ? (ogImage.startsWith('http') ? ogImage : SITE_URL + ogImage) : SITE_URL + '/images/marque/lamia-logo-600.webp';
  const socialImageAlt = ogImageAlt || 'Lamia Femme Berbère';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:site_name" content="La Maison Lamia Femme Berbère">
<meta property="og:title" content="${esc(socialTitle)}">
<meta property="og:description" content="${esc(socialDescription)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(socialImage)}">
<meta property="og:image:width" content="${esc(ogImageWidth)}">
<meta property="og:image:height" content="${esc(ogImageHeight)}">
<meta property="og:image:alt" content="${esc(socialImageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(socialTitle)}">
<meta name="twitter:description" content="${esc(socialDescription)}">
<meta name="twitter:image" content="${esc(socialImage)}">
<meta name="twitter:image:alt" content="${esc(socialImageAlt)}">
<meta name="theme-color" content="#1B1A18">
<link rel="icon" href="/images/marque/lamia-logo-net-160.webp" type="image/webp">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/maison.css?v=${VERSION}">
</head>
<body data-room="${esc(room?.slug || '')}" data-ambiance="${esc(ambiance || room?.slug || '')}" data-accent="${esc(accent)}">
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
    <img src="/images/marque/lamia-logo-net-160.webp" width="52" height="52" alt="">
    <span><strong>Lamia</strong> Femme Berbère</span>
  </a>
  <nav class="site-nav" aria-label="Navigation principale">
    ${link('/', 'Accueil', 'hall')}
    ${link('/boutique/', 'Boutique', 'boutique')}
    ${link('/ecrin/', 'Bijoux kabyles', 'ecrin')}
    ${link('/bibliotheque/', 'Livres', 'bibliotheque')}
    ${link('/speed-dating/', 'Speed Dating', 'speed-dating')}
    ${link('/salon/', 'Lives TikTok', 'salon')}
  </nav>
  <div class="header-actions">
    <details class="maison-menu" data-maison-menu>
      <summary>La Maison <span aria-hidden="true">▾</span></summary>
      <div class="maison-menu-panneau">
        ${floors.map((f) => `<div class="maison-menu-etage"><p>${esc(f.name)}</p><ul>${rooms.filter((r) => r.floor === f.level).map((r) => `<li${r.status === 'soon' ? ' class="is-soon"' : ''}><a href="${r.path}"${room?.slug === r.slug ? ' aria-current="page"' : ''}><strong>${esc(r.name)}</strong>${r.status === 'soon' ? '<em>bientôt</em>' : ''}</a></li>`).join('')}</ul></div>`).join('')}
        <div class="maison-menu-etage"><p>Lamia</p><ul><li><a href="/lamia-brechet/"><strong>Qui est Lamia</strong></a></li><li><a href="/werdi-ouvre-les-yeux/"><strong>Le livre Werdi</strong></a></li><li><a href="/mon-espace/"><strong>Mon espace</strong></a></li><li><a href="/#plan"><strong>Le plan de la Maison</strong></a></li></ul></div>
      </div>
    </details>
    <a class="account-link" href="/mon-espace/" data-account-link>Se connecter</a>
    <a class="alert-link" href="/confidences/">Me confier</a>
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
    <p class="footer-legal"><a href="/mentions-legales/">Mentions légales</a> · <a href="/cgv/">Conditions de vente</a> · <a href="/retours/">Livraison et retours</a> · <a href="/conditions-utilisation/">Conditions d’utilisation</a> · <a href="/confidentialite/">Confidentialité et cookies</a> · <a href="#" data-gerer-cookies>Gérer les cookies</a></p>
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
  ecrin: ['/images/collier/collier-mannequin-robe-kabyle-640.webp', 'Le collier kabyle émaillé porté avec une robe kabyle brodée'],
  galerie: ['/images/collier/collier-mannequin-cou-640.webp', 'Le collier émaillé porté, médaillon et pampilles'],
  bibliotheque: ['/images/marque/lamia-illu-ecrit-480.webp', 'Lamia assise en tailleur, écrivant dans un carnet', true],
  salon: ['/images/lamia/lamia-portrait-pro-480.webp', 'Lamia Femme Berbère, portrait réel'],
  'speed-dating': ['/images/lamia/lamia-portrait-pro-480.webp', 'Lamia Femme Berbère, hôte du Boudoir des Rencontres'],
  boutique: ['/images/collier/collier-mannequin-lanterne-640.webp', 'Le collier kabyle émaillé porté, à la lumière des lanternes'],
  patio: ['/images/marque/lamia-illu-debout-480.webp', 'Lamia en robe kabyle brodée, debout, la main sur le cœur', true],
  grenier: ['/images/marque/lamia-illu-pensive-480.webp', 'Lamia pensive, foulard kabyle et bracelets d’argent', true],
};
function roomHead(room, extra = '') {
  const im = HEAD_IMAGES[room.slug];
  const imgTete = im && IMGT(`image.tete.${room.slug}`, room.name, 'Image en haut de la pièce', `<img src="${im[0]}" alt="${esc(im[1])}"${!im[2] && ['salon', 'speed-dating'].includes(room.slug) ? ' class="is-lamia-photo"' : ''}>`);
  const arch = im?.[2]
    ? `<figure class="head-illu">${imgTete}</figure>`
    : im
    ? `<figure class="head-arch has-image">${imgTete}</figure>`
    : '<span class="head-arch" aria-hidden="true"></span>';
  return `<section class="room-head${im ? ' with-image' : ''}${im?.[2] ? ' with-illu' : ''}">${arch}
  <p class="room-name"><span class="pip" aria-hidden="true"></span>${esc(room.name)}</p>
  <h1>${esc(room.headline || room.welcome)}</h1>
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
  <ul>${picks.map((r) => `<li data-accent="${r.accent}"><a href="${r.path}"><span class="pip" aria-hidden="true"></span><span class="room-index-copy"><strong>${esc(r.name)}</strong><span>${esc(r.welcome)}</span></span></a></li>`).join('')}</ul>
</section>`;
}

// ---------------------------------------------------------------- pages

const pages = [];
const page = (path, html) => pages.push({ path, html });

// Le Hall
page(
  '/',
  layout({
    title: 'Lamia Femme Berbère | Speed Dating & Rencontre Célibataire Kabyle',
    description: 'Découvrez Lamia Femme Berbère, pour des rencontres sérieuses entre célibataires kabyles et maghrébins. Participez à nos soirées de speed dating en visio pour trouver l’amour et le mariage.',
    path: '/',
    room: roomBySlug.hall,
    body: `<section class="entree" data-entree aria-label="Entrer dans la Maison">
  <div class="entree-scene">
    <div class="entree-cam" data-entree-cam>
      ${IMGT('image.hall.entree', 'Le Hall', 'Image de la maison (entrée du site)', `<img class="entree-img" src="/images/maison/maison-kabyle-1376.webp" srcset="/images/maison/maison-kabyle-800.webp 800w, /images/maison/maison-kabyle-1200.webp 1200w, /images/maison/maison-kabyle-1376.webp 1376w" sizes="(max-width: 700px) 200vw, 100vw" width="1376" height="768" alt="La Maison de Lamia en Kabylie, sa porte ouverte et lumineuse" fetchpriority="high" decoding="async">`)}
    </div>
    <span class="entree-stars" aria-hidden="true"></span>
    <span class="entree-glow" aria-hidden="true"></span>
    <div class="entree-text">
      <p class="entree-kicker">La Maison franco-kabyle</p>
      <h1 class="entree-title">Lamia Femme Berbère<span class="entree-title-sous">${esc(T('hall.titre-sous', 'Le Hall', 'Sous-titre du grand titre', 'Speed Dating & Rencontres Célibataires Kabyles'))}</span></h1>
      <p class="entree-subtitle">${esc(T('hall.phrase', 'Le Hall', 'Phrase sous le grand titre', 'Trouvez l’amour et le mariage sérieux grâce à l’alliance de la tradition berbère et de la modernité.', true))}</p>
      <p class="entree-hint">Faites défiler pour pousser la porte</p>
      <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true"><path d="M2 4l9 9 9-9M2 17l9 9 9-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <span class="entree-lumiere" aria-hidden="true"></span>
    <a class="entree-skip" href="#hall">Entrer directement</a>
  </div>
</section>

<section class="hall-hero" id="hall">
  <div class="hall-copy">
    <p class="room-name"><span class="pip" aria-hidden="true"></span>Le Hall</p>
    <h2>Le Hall — Entrez dans l’univers de Lamia Femme Berbère</h2>
    <p class="lead">Bijoux kabyles, livres, brocante, speed dating, lives et créations : cette Maison rassemble l’univers de Lamia entre Kabylie, Algérie et France.</p>
    <p class="hall-actions"><a class="btn btn-ink" href="#plan">Visiter la Maison</a><a class="btn btn-line" href="/lamia-brechet/">Qui est Lamia</a></p>
  </div>
  <div class="hall-stage">
    <span class="arch-shadow" aria-hidden="true"></span>
    <figure class="hall-arch hall-arch-lamia">
      <picture>
        ${IMGT('image.hall.portrait', 'Le Hall', 'Portrait de Lamia dans l’arche', `<img src="/images/lamia/lamia-portrait-pro-480.webp" width="480" height="600" loading="eager" alt="Lamia Femme Berbère, portrait réel">`)}
      </picture>
      <figcaption><strong>Lamia</strong><span>Je vous ouvre la porte de ma Maison.</span></figcaption>
    </figure>
    <figure class="hall-medal">
      <img src="${esc(imgOr('hall-medal', '/images/collier/collier-kabyle-15g-detail-320.webp'))}" width="320" height="400" alt="Médaillon kabyle émaillé bleu, vert et jaune, corail au centre">
    </figure>
    <a class="yemma-signature lamia-signature" href="/lamia-brechet/">Lamia Femme Berbère <span>Découvrir mon histoire →</span></a>
  </div>
  <div class="hall-apercus" aria-label="En ce moment dans la Maison">
    <a class="apercu is-bal" href="/speed-dating/#events-title">
      <span class="apercu-mask" aria-hidden="true"><svg viewBox="0 0 64 32" width="64" height="32"><path d="M2 8c10-6 20-4 30 4C42 4 52 2 62 8c0 12-8 20-18 20-6 0-9-4-12-8-3 4-6 8-12 8C10 28 2 20 2 8Z" fill="none" stroke="currentColor" stroke-width="2.2"/><ellipse cx="19" cy="15" rx="6" ry="4" fill="currentColor"/><ellipse cx="45" cy="15" rx="6" ry="4" fill="currentColor"/></svg></span>
      <span class="apercu-kicker">Speed dating · gratuit</span>
      <strong>Bal masqué de Venise</strong>
      <span class="apercu-info">Samedi 31 octobre, 21 h · en visio · salon Algérie–France, Europe, Olivier, Érables, Voyageurs et tous âges · 20 personnes par salon</span>
      <span class="apercu-cta">Réserver ma place →</span>
    </a>
    <a class="apercu" href="/produit/?p=collier-kabyle-argente-emaille-15g">
      ${IMGT('image.hall.apercu-collier', 'Le Hall', 'Aperçu : collier', `<img src="/images/collier/collier-kabyle-15g-hero-320.webp" width="320" height="400" alt="" loading="lazy">`)}
      <span class="apercu-kicker">L’Écrin · précommande</span>
      <strong>Collier kabyle émaillé</strong>
      <span class="apercu-info">Modèle de 1974, fabriqué à Ath Yenni<span data-prix="collier-kabyle-argente-emaille-15g"></span></span>
    </a>
    <a class="apercu" href="/bibliotheque/">
      ${IMGT('image.hall.apercu-werdi', 'Le Hall', 'Aperçu : livre Werdi', `<img src="/images/marque/lamia-illu-banquette-560.webp" width="560" height="678" alt="" loading="lazy">`)}
      <span class="apercu-kicker">La Bibliothèque · précommande</span>
      <strong>Werdi, ouvre les yeux !</strong>
      <span class="apercu-info" data-prix-werdi>Livre broché et ebook</span>
    </a>
    <a class="apercu" href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">
      ${IMGT('image.hall.apercu-live', 'Le Hall', 'Aperçu : live TikTok', `<img src="/images/lamia/lamia-portrait-pro-320.webp" width="320" height="400" alt="Lamia Femme Berbère" loading="lazy" class="is-lamia">`)}
      <span class="apercu-kicker">Le Salon · chaque soir</span>
      <strong>Live Mariage Kabyle</strong>
      <span class="apercu-info">De 21 h à 23 h, en direct sur TikTok</span>
    </a>
  </div>

  <aside class="home-reassurance" aria-label="Informations de commande">
    <strong>Achetez en toute confiance.</strong>
    <span>Paiement sécurisé</span>
    <span>Précommandes suivies avec soin</span>
    <span>Vous êtes informé(e) par e-mail de l’avancement</span>
    <span>Livraison depuis la France</span>
  </aside>

  <a class="hall-cue" href="#univers"><span>Découvrir les univers de la Maison</span><svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true"><path d="M2 4l9 9 9-9M2 17l9 9 9-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
</section>

<section class="home-speed" aria-labelledby="home-speed-title">
  <a class="home-speed-visual home-speed-poster" href="/speed-dating/#events-title" aria-label="Le speed dating de Lamia Femme Berbère : réserver une place">
    ${IMGT('image.hall.affiche-rencontres', 'Le Hall', 'Affiche du speed dating (partie rencontres)', `<img src="/images/lamia/affiche-boudoir-venise-1149.webp" srcset="/images/lamia/affiche-boudoir-venise-560.webp 560w, /images/lamia/affiche-boudoir-venise-1149.webp 1149w" sizes="(max-width: 820px) 86vw, 430px" width="1149" height="1368" alt="Affiche : le Boudoir des Rencontres, spécial Bal masqué de Venise, speed dating sérieux en ligne avec Lamia" loading="lazy">`)}
  </a>
  <div class="home-speed-copy">
    <p class="home-speed-kicker">Le Boudoir des Rencontres · speed dating kabyle</p>
    <h2 id="home-speed-title">${esc(T('hall.rencontres-titre', 'Le Hall', 'Partie rencontres : titre', 'Trouvez l’amour et le mariage sérieux'))}</h2>
    <p class="home-speed-lead">${esc(T('hall.rencontres-texte', 'Le Hall', 'Partie rencontres : premier paragraphe', 'Bienvenue sur Lamia Femme Berbère, un espace dédié aux rencontres sérieuses au sein de la communauté kabyle et maghrébine. Marre des discussions virtuelles sans lendemain sur les applications de rencontre classiques ? Ici, l’humain et l’authenticité reviennent au cœur de la rencontre.', true))}</p>
    <p class="home-speed-note">${esc(T('hall.rencontres-texte2', 'Le Hall', 'Partie rencontres : deuxième paragraphe', 'À travers nos soirées de speed dating kabyle en visio et nos lives, nous offrons aux célibataires un espace bienveillant, sécurisé et chaleureux pour faire des rencontres authentiques. Notre objectif : vous accompagner pas à pas vers un mariage sérieux et durable, dans le respect des valeurs culturelles et familiales berbères.', true))}</p>
    <h3 class="home-speed-pourquoi">Pourquoi choisir nos soirées ?</h3>
    <ul class="home-speed-raisons">
      <li><strong>Une connexion authentique</strong> : pas de profils fantômes, on échange en direct et en tête-à-tête, caméra allumée.</li>
      <li><strong>La tradition et la modernité</strong> : des salons par pays et par âge (Algérie–France, Europe, Algérie, Canada et USA…) pour rencontrer les bonnes personnes.</li>
      <li><strong>Une communauté engagée</strong> : des participants motivés par la même recherche de stabilité et de mariage, et Lamia qui veille sur chaque soirée.</li>
    </ul>
    <ul class="home-speed-meta" aria-label="Prochaine soirée">
      <li><strong>Première soirée offerte</strong></li>
      <li>Bal masqué de Venise</li>
      <li>Samedi 31 octobre · 21 h</li>
      <li>En visio</li>
    </ul>
    <p class="home-speed-actions"><a class="btn home-speed-cta" href="/speed-dating/#events-title">Je m’inscris au prochain speed dating</a><a class="btn home-speed-live" href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank">Rejoindre le live</a></p>
  </div>
</section>

<section class="home-universes" id="univers" aria-labelledby="univers-title">
  <div class="home-universes-intro">
    <p class="room-name"><span class="pip" aria-hidden="true"></span>Les pièces essentielles</p>
    <h2 id="univers-title">Que souhaitez-vous découvrir ?</h2>
    <p>La Maison garde ses pièces et son histoire. Ces cinq portes vous permettent simplement d’aller directement à l’essentiel.</p>
  </div>
  <div class="home-universes-grid">
    ${HOME_UNIVERSES.map((u) => `<a class="home-universe-card${u.featured ? ' is-featured' : ''}" href="${u.href}">
      <span class="home-universe-room">${esc(u.room)}</span>
      <h3>${esc(u.room)} — ${esc(u.title)}</h3>
      <p>${esc(u.text)}</p>
      <span class="home-universe-cta">Découvrir →</span>
    </a>`).join('')}
  </div>
</section>

<section class="plan-section" id="plan" aria-labelledby="plan-title">
  <div class="plan-intro">
    <h2 id="plan-title">Une Maison entre Kabylie et France</h2>
    <p>Les bijoux et la boutique au rez-de-chaussée, les rencontres, les lives et les livres au premier, les trouvailles tout en haut. Chaque pièce garde son caractère.</p>
  </div>
  ${facade(rooms)}
  <div class="floors">
    ${[...floors].reverse().map((f) => `<section class="floor" aria-labelledby="etage-${f.level}">
      <h3 id="etage-${f.level}">${esc(f.name)}<span>${esc(f.theme)}</span></h3>
      <ul class="room-index">${rooms.filter((r) => r.floor === f.level && r.slug !== 'hall').map((r) => `<li class="${r.status === 'soon' ? 'is-soon' : ''}" data-accent="${r.accent}"><a href="${r.path}"><span class="pip" aria-hidden="true"></span><span class="room-index-copy"><strong>${esc(r.name)}</strong><span>${r.status === 'soon' ? 'Bientôt' : esc(r.welcome)}</span></span></a></li>`).join('')}</ul>
    </section>`).join('')}
  </div>
</section>

<section class="story story-lamia" aria-labelledby="story-title">
  <figure class="story-lamia-portrait">${IMGT('image.hall.histoire', 'Le Hall', 'Portrait à côté de mon histoire', `<img src="/images/lamia/lamia-portrait-pro-480.webp" width="480" height="600" loading="lazy" alt="Lamia Femme Berbère">`)}</figure>
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
<section class="videos-haut">
  <div class="videos" data-youtube-videos hidden>
    <h2>Mes dernières vidéos YouTube</h2>
    <div class="video-cadre" data-youtube-cadre><button class="btn btn-gold" type="button" data-youtube-charger>▶ Afficher mes vidéos</button><p class="video-note">En affichant les vidéos, YouTube peut déposer ses propres cookies.</p></div>
  </div>
</section>
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
  </aside>
</section>
<figure class="banniere-salon">${IMGT('image.salon.banniere', 'Le Salon de Lamia', 'Grande bannière', `<img src="/images/lamia/banniere-lamia-berbere-1672.webp" srcset="/images/lamia/banniere-lamia-berbere-900.webp 900w, /images/lamia/banniere-lamia-berbere-1672.webp 1672w" sizes="(max-width: 1300px) 100vw, 1240px" width="1672" height="941" loading="lazy" alt="Lamia Berbère : humour, société, politique, contradictions du quotidien. Un regard berbère, kabyle, algérien, français et maghrébin.">`)}</figure>
<section class="reseaux" aria-labelledby="reseaux-titre">
  <h2 id="reseaux-titre">Mes réseaux</h2>
  <p class="reseaux-intro">Où me retrouver, me suivre et me poser vos questions.</p>
  <div class="reseaux-grille"><a class="reseau reseau-tiktok" data-social="tiktok" href="https://www.tiktok.com/@lamiaberbere" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M16.6 5.8a4.3 4.3 0 0 1-3.4-3.8h-3v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V8.8a5.7 5.7 0 1 0 4.8 5.6V8.1a7.3 7.3 0 0 0 4.3 1.4v-3c-.3 0-.6-.1-.9-.7Z"/></svg><strong>TikTok</strong><span>Mes lives chaque soir, de 21 h à 23 h</span></a><a class="reseau reseau-facebook" data-social="facebook" href="https://www.facebook.com/femmeberberes/" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.3H7.7V14h2.7v8h3.1Z"/></svg><strong>Facebook</strong><span>La page Femme Berbère</span></a><a class="reseau reseau-instagram" data-social="instagram" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm5-8.1a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1C3.7 15 3.6 14.7 3.6 12s0-3 .1-4.1C3.8 5.2 5.1 3.8 7.9 3.7 9 3.6 9.3 3.6 12 3.6Z"/></svg><strong>Instagram</strong><span>Photos, coulisses et bijoux</span></a><a class="reseau reseau-youtube" data-social="youtube" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z"/></svg><strong>YouTube</strong><span>Mes vidéos et mes lives en replay</span></a><a class="reseau reseau-snapchat" data-social="snapchat" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M12 3c2.9 0 4.9 2.1 4.9 5v2.1l1.3-.4c.6-.1 1 .6.5 1l-1.6 1c.6 1.9 2 3.2 3.6 3.6.4.1.4.6 0 .8-.7.3-1.5.5-2.2.6-.1.4-.2.9-.4 1.2-1.1-.2-2.2 0-3.1.7-.9.6-2 .9-3 .9s-2.1-.3-3-.9c-.9-.7-2-.9-3.1-.7-.2-.3-.3-.8-.4-1.2-.7-.1-1.5-.3-2.2-.6-.4-.2-.4-.7 0-.8 1.6-.4 3-1.7 3.6-3.6l-1.6-1c-.5-.4-.1-1.1.5-1l1.3.4V8c0-2.9 2-5 4.9-5Z"/></svg><strong>Snapchat</strong><span>Le quotidien, au plus près</span></a><a class="reseau reseau-whatsapp" data-social="whatsapp" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Zm4.9 12.6c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg><strong>WhatsApp</strong><span>La chaîne des nouvelles de la Maison</span></a></div>
  <div class="videos" data-tiktok-videos>
    <h2>Mes vidéos TikTok</h2>
    <div class="video-cadre is-tiktok" data-tiktok-cadre><button class="btn btn-gold" type="button" data-tiktok-charger>▶ Afficher mes vidéos TikTok</button><p class="video-note">En affichant les vidéos, TikTok peut déposer ses propres cookies.</p></div>
  </div>
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
  ${cover('werdi', 'Couverture du livre Werdi, ouvre les yeux ! de Lamia Bréchet', 'book-cover') || '<figure class="book-illu"><img src="/images/marque/lamia-illu-banquette-560.webp" width="560" height="1050" loading="lazy" alt="Illustration : Yemma, la voix de la collection"></figure>'}
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
<section class="ecrin-portes" aria-labelledby="portes-titre">
  <h2 id="portes-titre">Le collier, porté</h2>
  <div class="ecrin-portes-grille">
    ${IMGT('image.ecrin.porte-1', 'L’Écrin', 'Collier porté, photo 1', `<img src="/images/collier/collier-mannequin-noir-640.webp" width="640" height="800" loading="lazy" alt="Le collier kabyle émaillé porté sur une robe noire">`)}
    ${IMGT('image.ecrin.porte-2', 'L’Écrin', 'Collier porté, photo 2', `<img src="/images/collier/collier-mannequin-robe-kabyle-640.webp" width="640" height="800" loading="lazy" alt="Le collier porté avec une robe kabyle blanche brodée de rouge">`)}
    ${IMGT('image.ecrin.porte-3', 'L’Écrin', 'Collier porté, photo 3', `<img src="/images/collier/collier-mannequin-lanterne-640.webp" width="640" height="800" loading="lazy" alt="Le collier porté à la lumière des lanternes">`)}
    ${IMGT('image.ecrin.porte-4', 'L’Écrin', 'Collier porté, photo 4', `<img src="/images/collier/collier-mannequin-cou-640.webp" width="640" height="800" loading="lazy" alt="Le médaillon central, son corail et ses trois pampilles">`)}
  </div>
  <figure class="ecrin-planche">${IMGT('image.ecrin.planche-1', 'L’Écrin', 'Planche de présentation 1', `<img src="/images/collier/collier-planche-presentation-1536.webp" srcset="/images/collier/collier-planche-presentation-900.webp 900w, /images/collier/collier-planche-presentation-1536.webp 1536w" sizes="(max-width: 1300px) 100vw, 1240px" width="1536" height="1024" loading="lazy" alt="Collier kabyle artisanal : argent véritable 15 g, émaillage traditionnel, fait main, livraison en France, emballage soigné">`)}</figure>
  <figure class="ecrin-planche">${IMGT('image.ecrin.planche-2', 'L’Écrin', 'Planche de présentation 2', `<img src="/images/collier/collier-planche-details-1536.webp" srcset="/images/collier/collier-planche-details-900.webp 900w, /images/collier/collier-planche-details-1536.webp 1536w" sizes="(max-width: 1300px) 100vw, 1240px" width="1536" height="1024" loading="lazy" alt="Les détails du collier : médaillons émaillés, corail, pampilles, fermoir, écrin cadeau">`)}</figure>
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

// Le Boudoir des Rencontres : le speed dating de la Maison (page générale, la première soirée est offerte)
page(
  '/speed-dating/',
  layout({
    title: 'Speed dating en ligne sérieux — Le Boudoir des Rencontres | Lamia Femme Berbère',
    description: 'Des soirées de speed dating en visio pour des rencontres sérieuses, par salons (Algérie–France, Europe, Algérie, Canada et USA…) et par âge, animées par Lamia. Pour le lancement, la première soirée est offerte : le Bal masqué de Venise, le 31 octobre à 21 h.',
    path: '/speed-dating/',
    room: roomBySlug['speed-dating'],
    scripts: ['/assets/membre.js'],
    ogTitle: 'Le speed dating de Lamia Femme Berbère — première soirée offerte',
    ogDescription: 'Rencontres sérieuses en visio, par salons et par âge, animées par Lamia. Pour le lancement, le Bal masqué de Venise du 31 octobre est gratuit.',
    ogImage: '/images/lamia/lamia-venise-1672.webp',
    ogImageAlt: 'Lamia Femme Berbère, masque vénitien à la main, sur le Grand Canal de Venise',
    ogImageWidth: 1672,
    ogImageHeight: 941,
    body: `<div class="bal">
<section class="bal-hero bal-hero-rich">
  <span class="bal-paillettes" aria-hidden="true"></span>
  <span class="boudoir-curtain boudoir-curtain-left hero-rideau" aria-hidden="true"></span>
  <span class="boudoir-curtain boudoir-curtain-right hero-rideau" aria-hidden="true"></span>
  <figure class="bal-hero-poster">
    ${IMGT('image.speed.affiche', 'Le Boudoir des Rencontres', 'Image en haut de la page Speed dating', `<img src="/images/lamia/boudoir-speed-dating-1024.webp" srcset="/images/lamia/boudoir-speed-dating-600.webp 600w, /images/lamia/boudoir-speed-dating-1024.webp 1024w" sizes="(max-width: 900px) 92vw, 480px" width="1024" height="1024" alt="Le Boudoir des Rencontres : salon de velours bordeaux et logo Lamia Femme Berbère, LF Virtual Speed Dating" loading="eager">`)}
  </figure>
  <div class="bal-hero-copy">
    <p class="bal-kicker">Speed dating en ligne · animé par Lamia</p>
    <h1>${esc(T('speed.titre', 'Le Boudoir des Rencontres', 'Titre en haut (ligne 1)', 'Le Boudoir'))} <span>${esc(T('speed.titre2', 'Le Boudoir des Rencontres', 'Titre en haut (ligne 2)', 'des Rencontres'))}</span></h1>
    <p class="bal-welcome">${esc(roomBySlug['speed-dating'].welcome)}</p>
    <p class="bal-lead">${esc(P.speedDating.intro)}</p>
    <div class="bal-facts" aria-label="En bref">
      <span>En visio, depuis chez vous</span><span>Salons par pays et par âge</span><span>20 personnes max par salon</span><span>Lamia veille</span>
    </div>
    <p class="bal-actions"><a class="btn btn-gold" href="#events-title">Voir les prochaines soirées</a><a class="btn bal-btn-line" href="/speed-dating/salle/">Tester ma caméra</a></p>
  </div>
</section>

<section class="lancement" aria-labelledby="lancement-title">
  <figure class="lancement-image">
    ${IMGT('image.speed.lancement', 'Le Boudoir des Rencontres', 'Image de la soirée de lancement', `<img src="/images/lamia/lamia-venise-1672.webp" srcset="/images/lamia/lamia-venise-900.webp 900w, /images/lamia/lamia-venise-1672.webp 1672w" sizes="(max-width: 860px) 100vw, 560px" width="1672" height="941" alt="Lamia, masque vénitien à la main, sur le Grand Canal de Venise à la tombée de la nuit" loading="lazy">`)}
  </figure>
  <div class="lancement-texte">
    <p class="bal-kicker">Soirée de lancement · offerte</p>
    <h2 id="lancement-title">${esc(T('speed.lancement-titre', 'Le Boudoir des Rencontres', 'Soirée de lancement : titre', 'La première soirée est gratuite : le Bal masqué de Venise'))}</h2>
    <p>Pour lancer le Boudoir, Lamia vous offre la première soirée, le <strong>samedi 31 octobre à 21 h</strong>, en visio, sur le thème du Carnaval de Venise. Venez masqué·e, le mystère fait partie du jeu. Les soirées suivantes seront payantes.</p>
    <p><a class="btn btn-gold" href="#events-title">Réserver ma place offerte</a></p>
  </div>
</section>

<section class="bal-deroule" aria-labelledby="deroule-title">
  <h2 id="deroule-title">Comment se passe une soirée</h2>
  <ol>
    <li><strong>Vous choisissez</strong><span>Une soirée, puis votre salon. Votre tranche d’âge est choisie automatiquement. L’inscription prend une minute, sans mot de passe.</span></li>
    <li><strong>Vous vous préparez</strong><span>Vous testez votre caméra et votre micro dans l’antichambre. Les informations pratiques vous sont envoyées avant la soirée.</span></li>
    <li><strong>Vous entrez dans le grand salon</strong><span>À l’heure dite, Lamia accueille tout le monde et ouvre la soirée.</span></li>
    <li><strong>Vous faites connaissance</strong><span>Des tête-à-tête de quelques minutes, au son d’une cloche. Les cavaliers rencontrés s’inscrivent dans votre carnet de bal.</span></li>
    <li><strong>Vous choisissez qui revoir</strong><span>En privé, dans votre carnet. Si le souhait est réciproque, Lamia vous met en relation.</span></li>
  </ol>
</section>

<section class="bal-code" aria-labelledby="salons-title">
  <h2 id="salons-title">Des salons pour se retrouver</h2>
  <ul>
    <li><strong>Salon Algérie–France</strong> : pour échanger entre les deux rives, que vous viviez en Algérie ou en France.</li>
    <li><strong>Salon Europe</strong> : France et pays d’Europe.</li>
    <li><strong>Salon de l’Olivier</strong> : Algérie.</li>
    <li><strong>Salon des Érables</strong> : Canada et États-Unis.</li>
    <li><strong>Salon des Voyageurs</strong> : tous les autres pays.</li>
    <li><strong>Salon Tous âges</strong> : pour celles et ceux pour qui l’âge n’est pas important.</li>
  </ul>
  <p class="bal-note">Chaque salon est divisé en trois tranches d’âge (25-39, 40-50, plus de 50 ans), avec 20 personnes au maximum, pour garder des échanges de qualité.</p>
</section>

<section class="bal-code" aria-labelledby="code-title">
  <h2 id="code-title">Un cadre chaleureux et respectueux</h2>
  <ul>
    <li><strong>Des rencontres sérieuses</strong> : on vient pour rencontrer quelqu’un, pas pour faire défiler des profils.</li>
    <li><strong>Caméra allumée</strong>, dans un endroit calme, et aucun propos déplacé.</li>
    <li><strong>Lamia veille</strong> : l’accueil, l’animation et le suivi de chaque soirée.</li>
    <li><strong>Une ambiance</strong> : chaque soirée a son thème. Pour la première, masque vénitien, loup ou tenue élégante.</li>
    <li><strong>Un souci ?</strong> <a href="/confidences/">Les Confidences avec Lamia</a> permettent de lui écrire ou de lui signaler un souci en toute discrétion.</li>
  </ul>
</section>

<section class="boudoir-reservation" aria-labelledby="events-title">
  <span class="boudoir-curtain boudoir-curtain-left" aria-hidden="true"></span>
  <span class="boudoir-curtain boudoir-curtain-right" aria-hidden="true"></span>
  <div class="boudoir-reservation-head">
    <p class="bal-kicker">Prenez place dans le salon</p>
    <h2 id="events-title">Les prochaines soirées</h2>
    <p>Pour le lancement, la première soirée est offerte, sur inscription. Les places sont limitées afin de préserver la qualité des échanges.</p>
  </div>
  <div class="boudoir-reservation-stage">
    <aside class="boudoir-side-note">
      <span class="boudoir-side-icon" aria-hidden="true">✦</span>
      <strong>Soirée de lancement</strong>
      <span>Samedi 31 octobre · 21 h</span>
      <span>En visio · offerte</span>
      <span>20 personnes maximum par salon</span>
    </aside>
    <div class="events">
      <div class="event-grid" data-events><p class="loading">Les soirées arrivent…</p></div>
    </div>
  </div>
</section>
<section class="member-panel bal-espace" aria-labelledby="member-title">
  <h2 id="member-title">Le soir de la soirée</h2>
  <p>Pas besoin de compte : inscrivez-vous juste au-dessus, puis le soir venu, entrez par la porte de la salle avec votre email et votre date de naissance. À la fin, votre <strong>carnet de bal</strong> vous permet d’indiquer, en privé, qui vous aimeriez revoir.</p>
  <p class="bal-actions"><a class="btn btn-gold" href="/speed-dating/bal/">Entrer dans la salle</a><a class="btn bal-btn-line" href="/speed-dating/salle/">Tester ma caméra</a><a class="btn bal-btn-line" href="/mon-espace/">Mon espace</a></p>
</section>
<section class="origin">
  <blockquote>« ${esc(P.speedDating.promise)} »<cite>Lamia</cite></blockquote>
  <p>${esc(P.speedDating.origin)}</p>
</section>
</div>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Event', name: 'Bal masqué de Venise — soirée de lancement du speed dating de Lamia Femme Berbère', startDate: '2026-10-31T21:00:00+01:00', endDate: '2026-10-31T23:00:00+01:00', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled', location: { '@type': 'VirtualLocation', url: SITE_URL + '/speed-dating/' }, image: SITE_URL + '/images/lamia/lamia-venise-1672.webp', description: 'Soirée de speed dating en visio, par salons et par âge, sur le thème du Carnaval de Venise. Offerte pour le lancement.', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: SITE_URL + '/speed-dating/' }, organizer: { '@type': 'Person', name: 'Lamia Bréchet Ighil', url: SITE_URL + '/lamia-brechet/' } })}</script>`,
  })
);

// Mon espace : connexion des membres et de Lamia
page(
  '/mon-espace/',
  layout({
    title: 'Mon espace · Lamia Femme Berbère',
    description: 'Connecte-toi à ton espace de la Maison Lamia Femme Berbère.',
    path: '/mon-espace/',
    room: roomBySlug.hall,
    ambiance: 'espace',
    noindex: true,
    scripts: ['/assets/espace.js'],
    body: `<section class="espace">
  <p class="room-name"><span class="pip" aria-hidden="true"></span>Mon espace</p>

  <div data-espace-out hidden>
    <h1>Se connecter</h1>
    <div class="espace-grid">
      <form class="espace-card" data-espace-login>
        <h2>J’ai un mot de passe</h2>
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn btn-ink" type="submit">Me connecter</button>
        <p class="form-status" role="status" data-espace-status></p>
      </form>
      <form class="espace-card" data-espace-reset>
        <h2>Pas encore de mot de passe ?</h2>
        <p>Tu t’es inscrit·e à une soirée sans mot de passe, ou tu l’as oublié : reçois un lien par email pour en choisir un.</p>
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <button class="btn btn-line" type="submit">Recevoir le lien</button>
        <p class="form-status" role="status" data-reset-status></p>
      </form>
      <form class="espace-card" data-espace-signup>
        <h2>Créer mon espace</h2>
        <p>Pour suivre tes soirées et tes achats.</p>
        <label>Prénom<input name="first_name" autocomplete="given-name" maxlength="60" required></label>
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Mot de passe (8 caractères minimum)<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn btn-line" type="submit">Créer mon espace</button>
        <p class="form-status" role="status" data-signup-status></p>
      </form>
    </div>
    <p class="espace-note">Pour entrer au Bal masqué, pas besoin de compte : <a class="text-link" href="/speed-dating/bal/">la porte du bal</a> te demande seulement ton email et ta date de naissance.</p>
  </div>

  <form class="espace-card espace-new" data-espace-newpass hidden>
    <h1>Choisis ton mot de passe</h1>
    <label>Nouveau mot de passe<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
    <button class="btn btn-ink" type="submit">Enregistrer</button>
    <p class="form-status" role="status" data-newpass-status></p>
  </form>

  <div data-espace-in hidden>
    <h1>Bonjour <span data-espace-nom></span></h1>
    <p class="espace-email">Connecté·e avec <strong data-espace-email></strong> </p>
    <p><button class="btn btn-line" type="button" data-espace-logout>Se déconnecter</button></p>
    <details class="espace-mdp">
      <summary>Modifier mon mot de passe</summary>
      <form data-espace-mdp>
        <label>Nouveau mot de passe (8 caractères minimum)<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
        <label>Confirmer le nouveau mot de passe<input name="password2" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn btn-ink" type="submit">Enregistrer</button>
        <p class="form-status" role="status" data-mdp-status></p>
      </form>
    </details>

    <section class="espace-admin" data-espace-admin hidden>
      <h2>Espace administratrice</h2>
      <div class="espace-liens">
        <a href="/tableau-de-bord"><strong>Tableau de bord</strong><span>Ventes, produits, textes du site, visites, alertes</span></a>
        <a href="/admin-soirees/"><strong>Mes soirées et précommandes</strong><span>Inscrits, salons, précommandes du livre et du collier</span></a>
        <a href="/admin-bal.html"><strong>Maîtresse du bal</strong><span>Ouvrir les portes, lancer les tours, souhaits réciproques</span></a>
        <a href="/confidences-lamia/"><strong>Confidences</strong><span>Lire et répondre, vocaux, notifications</span></a>
        <a href="/admin.html"><strong>Signalements</strong><span>Profils signalés, écrits et audio</span></a>
        <a href="/pilotage.html"><strong>Pilotage</strong><span>Feuille de route et indicateurs</span></a>
      </div>
    </section>

    <section>
      <h2>Mes achats</h2>
      <div class="espace-achats" data-espace-achats><p class="loading">Un instant…</p></div>
    </section>

    <section>
      <h2>Les boutiques de la Maison</h2>
      <div class="espace-liens is-light is-boutiques">
        <a href="/boutique/"><strong>La Boutique</strong><span>Tout ce que la Maison propose</span></a>
        <a href="/ecrin/"><strong>L’Écrin</strong><span>Les bijoux d’Ath Yenni</span></a>
        <a href="/bibliotheque/"><strong>La Bibliothèque</strong><span>Werdi, broché et ebook</span></a>
        <a href="/grenier/"><strong>Le Grenier</strong><span>Mes trouvailles de brocante</span></a>
      </div>
    </section>

    <section>
      <h2>Mes soirées</h2>
      <div class="espace-soirees" data-espace-soirees><p class="loading">Un instant…</p></div>
    </section>
    <div class="espace-liens is-light">
      <a href="/speed-dating/bal/"><strong>Entrer au bal</strong><span>Le soir de la soirée</span></a>
      <a href="/speed-dating/souhaits/"><strong>Mon carnet de bal</strong><span>Qui aimerais-tu revoir ?</span></a>
      <a href="/confidences/"><strong>Me confier à Lamia</strong><span>Écrire, laisser un vocal, échanger</span></a>
    </div>
  </div>
</section>`,
  })
);

// La salle du bal (vidéo) : grand salon, tête-à-tête, souhaits
page(
  '/speed-dating/bal/',
  layout({
    title: 'La salle du Bal masqué de Venise',
    description: 'Entre dans la salle du Bal masqué de Venise : grand salon, tête-à-tête masqués et souhaits de fin de bal.',
    path: '/speed-dating/bal/',
    room: roomBySlug['speed-dating'],
    noindex: true,
    body: `<div class="bal bal-salle-page" style="--salle-decor:url('${esc(imgOr('salle-decor', '/images/lamia/boudoir-speed-dating-1024.webp'))}')">
<div class="appli-alerte" data-appli hidden role="alert">
  <p class="appli-titre">Ouvre cette page dans Safari ou Chrome</p>
  <p>Tu es dans le navigateur de <strong data-appli-nom>ton application</strong> : il bloque souvent la caméra et le micro.</p>
  <p data-appli-ios hidden>Sur iPhone : touche <strong>…</strong> ou l’icône de partage en haut ou en bas de l’écran, puis <strong>« Ouvrir dans le navigateur »</strong> (ou « Ouvrir dans Safari »).</p>
  <p data-appli-android hidden>Sur Android : touche <strong>⋮</strong> en haut à droite, puis <strong>« Ouvrir dans Chrome »</strong>, ou utilise le bouton ci-dessous.</p>
  <p class="bal-actions"><button class="btn btn-gold" type="button" data-appli-copier>Copier le lien</button><a class="btn bal-btn-line" data-appli-chrome hidden>Ouvrir dans Chrome</a></p>
</div>
<section class="bal-step" data-step="entree">
  <div class="bal-hero is-short">
    <p class="bal-kicker">Le Bal masqué de Venise</p>
    <h1>La porte du bal</h1>
    <p class="bal-lead">Entre avec l’email et la date de naissance donnés à ton inscription.</p>
  </div>
  <form class="bal-porte" data-bal-entree>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Date de naissance<input name="birth_date" type="date" required></label>
    <button class="btn btn-gold" type="submit">Pousser la porte</button>
    <p class="form-status" role="status" data-entree-status></p>
    <p class="bal-petit">Pas encore inscrit·e ? <a class="text-link" href="/speed-dating/#events-title">Réserve ta place</a>. Un souci de caméra ? <a class="text-link" href="/speed-dating/salle/">Passe par l’antichambre</a>.</p>
  </form>
</section>

<section class="bal-step" data-step="pret" hidden>
  <div class="bal-hero is-short">
    <p class="bal-kicker" data-pret-salon></p>
    <h1>Bonsoir <span data-pret-nom></span></h1>
  </div>
  <div class="ante">
    <div class="ante-miroir"><video data-pret-video playsinline muted autoplay></video><span class="ante-cadre" aria-hidden="true"></span></div>
    <div class="ante-panneau">
      <p class="ante-msg" data-pret-msg>Activation de ta caméra…</p>
      <button class="btn btn-gold" type="button" data-entrer>Entrer au bal</button>
      <button class="btn bal-btn-line" type="button" data-sortir>Ce n’est pas moi</button>
    </div>
  </div>
</section>

<section class="bal-step salle" data-step="salle" data-salle hidden>
  <div class="planb" data-planb hidden role="alert"><p><strong>La salle a un souci ?</strong> Lamia a ouvert une salle de secours.</p><a class="btn btn-gold" data-planb-lien target="_blank" rel="noopener">Rejoindre la salle de secours</a></div>
  <div class="transition" data-transition hidden aria-live="polite"><div><svg viewBox="0 0 64 32" width="120" height="60" aria-hidden="true"><path d="M2 8c10-6 20-4 30 4C42 4 52 2 62 8c0 12-8 20-18 20-6 0-9-4-12-8-3 4-6 8-12 8C10 28 2 20 2 8Z" fill="#e3bd6e" stroke="#fff6dc" stroke-width="1.2"/><ellipse cx="19" cy="15" rx="6" ry="4" fill="#120d1a"/><ellipse cx="45" cy="15" rx="6" ry="4" fill="#120d1a"/></svg><p class="transition-titre" data-transition-titre>Le prochain masque vous invite…</p><p class="transition-nom" data-transition-nom></p></div></div>
  <header class="salle-haut">
    <div><p class="bal-kicker"><span data-salle-salon></span> <span data-salle-tour></span></p><h1 data-salle-titre>Le grand salon</h1></div>
    <p class="salle-temps" data-salle-temps aria-live="off"></p>
  </header>
  <div class="salle-scene">
    <figure class="salle-autre"><div class="salle-accueil" data-salle-accueil style="--accueil:url('${esc(imgOr('salle-accueil', '/images/lamia/lamia-venise-1672.webp'))}')" role="img" aria-label="Lamia vous accueille au Bal masqué de Venise"><p>« ${esc(P.speedDating.salleAccueil)} »<span>Lamia</span></p></div><video data-video-autre playsinline autoplay></video><img class="salle-logo" src="/images/marque/lamia-logo-net-160.webp" alt="" width="64" height="64"><figcaption data-autre-nom>Lamia arrive…</figcaption><span class="salle-cadre" aria-hidden="true"></span></figure>
    <figure class="salle-moi"><video data-video-moi playsinline autoplay muted></video><figcaption>Toi</figcaption></figure>
    <audio data-audio-autre autoplay></audio>
  </div>
  <p class="salle-msg" role="status" data-salle-msg></p>
  <p class="salle-demasque" data-demasque hidden>Dernier tête-à-tête : le moment du démasquage. Retire ton masque si tu le souhaites.</p>
  <p class="salle-compte" data-salle-compte></p>
  <aside class="carnet" data-carnet aria-label="Mon carnet de bal"><h2>Mon carnet de bal</h2><ol data-carnet-liste><li class="carnet-vide">Tes cavaliers s’inscriront ici au fil des tours.</li></ol></aside>
  <div class="salle-boutons">
    <button class="btn bal-btn-line" type="button" data-micro aria-pressed="false">Micro</button>
    <button class="btn bal-btn-line" type="button" data-camera aria-pressed="false">Caméra</button>
    <button class="btn bal-btn-line" type="button" data-flou aria-pressed="false" hidden>Flouter mon décor</button>
    <button class="btn bal-btn-line" type="button" data-musique aria-pressed="true">Musique douce</button>
    <a class="btn bal-btn-line" href="/confidences/#signaler" target="_blank" rel="noopener">Signaler à Lamia</a>
    <button class="btn bal-btn-line" type="button" data-quitter>Quitter le bal</button>
  </div>
  <form class="souhaits" data-souhaits hidden>
    <h2>Ton carnet de bal</h2>
    <p>Coche les personnes que tu aimerais revoir. Ton choix reste privé : si c’est réciproque, Lamia vous met en relation.</p>
    <div class="souhaits-liste" data-souhaits-liste></div>
    <fieldset class="avis"><legend>Trois questions sur ce bal</legend>
      <div class="avis-q"><span>As-tu aimé ce bal ?</span><label><input type="radio" name="aime" value="oui"> Oui</label><label><input type="radio" name="aime" value="moyen"> Moyen</label><label><input type="radio" name="aime" value="non"> Non</label></div>
      <div class="avis-q"><span>Reviendrais-tu ?</span><label><input type="radio" name="reviendrait" value="oui"> Oui</label><label><input type="radio" name="reviendrait" value="peut-etre"> Peut-être</label><label><input type="radio" name="reviendrait" value="non"> Non</label></div>
      <div class="avis-q"><span>Paierais-tu 12 € pour la prochaine soirée ?</span><label><input type="radio" name="paierait" value="oui"> Oui</label><label><input type="radio" name="paierait" value="peut-etre"> Peut-être</label><label><input type="radio" name="paierait" value="non"> Non</label></div>
    </fieldset>
    <label>Un mot pour Lamia (facultatif)<textarea name="message" rows="2" maxlength="500"></textarea></label>
    <button class="btn btn-gold" type="submit">Envoyer mon carnet</button>
    <p class="form-status" data-souhaits-status></p>
  </form>
</section>

<section class="bal-step" data-step="ferme" hidden>
  <div class="bal-hero is-short"><h1>Le bal est fermé</h1><p class="bal-lead">Les portes ne sont pas encore ouvertes, ou le bal est terminé. Merci, et à très vite à la Maison.</p><p class="bal-actions"><a class="btn btn-gold" href="/speed-dating/">Retour au Boudoir</a></p></div>
</section>
<section class="bal-step" data-step="quitte" hidden>
  <div class="bal-hero is-short"><h1>Tu as quitté le bal</h1><p class="bal-lead">Tu peux revenir à tout moment tant que le bal est ouvert.</p><p class="bal-actions"><button class="btn btn-gold" type="button" onclick="location.reload()">Revenir au bal</button></p></div>
</section>
</div>
<script type="module" src="/assets/bal.js?v=${VERSION}"></script>`,
  })
);

// L'antichambre : tester sa caméra et son micro avant le bal (rien n'est envoyé)
page(
  '/speed-dating/salle/',
  layout({
    title: 'L’antichambre du bal · tester ma caméra',
    description: 'Avant le Bal masqué de Venise, vérifie ta caméra et ton micro. Ta vidéo reste sur ton appareil.',
    path: '/speed-dating/salle/',
    room: roomBySlug['speed-dating'],
    noindex: true,
    body: `<div class="bal bal-ante">
<div class="appli-alerte" data-appli hidden role="alert">
  <p class="appli-titre">Ouvre cette page dans Safari ou Chrome</p>
  <p>Tu es dans le navigateur de <strong data-appli-nom>ton application</strong> : il bloque souvent la caméra et le micro.</p>
  <p data-appli-ios hidden>Sur iPhone : touche <strong>…</strong> ou l’icône de partage en haut ou en bas de l’écran, puis <strong>« Ouvrir dans le navigateur »</strong> (ou « Ouvrir dans Safari »).</p>
  <p data-appli-android hidden>Sur Android : touche <strong>⋮</strong> en haut à droite, puis <strong>« Ouvrir dans Chrome »</strong>, ou utilise le bouton ci-dessous.</p>
  <p class="bal-actions"><button class="btn btn-gold" type="button" data-appli-copier>Copier le lien</button><a class="btn bal-btn-line" data-appli-chrome hidden>Ouvrir dans Chrome</a></p>
</div>
<section class="bal-hero is-short">
  <p class="bal-kicker">Le Bal masqué de Venise</p>
  <h1>L’antichambre</h1>
  <p class="bal-lead">Avant d’entrer au bal, ajuste ton masque et vérifie ta caméra et ton micro. Ta vidéo reste sur ton appareil : rien n’est enregistré ni envoyé.</p>
</section>
<section class="ante" data-ante>
  <div class="ante-miroir">
    <video data-ante-video playsinline muted autoplay></video>
    <p class="ante-vide" data-ante-vide>Ton reflet apparaîtra ici.</p>
    <span class="ante-cadre" aria-hidden="true"></span>
  </div>
  <div class="ante-panneau">
    <button class="btn btn-gold" type="button" data-ante-start>Activer ma caméra et mon micro</button>
    <ul class="ante-checks">
      <li data-check="camera"><span></span>Caméra</li>
      <li data-check="micro"><span></span>Micro <i class="ante-niveau"><b data-ante-niveau></b></i></li>
      <li data-check="reseau"><span></span>Connexion internet</li>
    </ul>
    <p class="ante-msg" role="status" data-ante-msg>Clique sur le bouton, puis autorise la caméra et le micro quand ton navigateur te le demande.</p>
    <button class="btn bal-btn-line" type="button" data-ante-stop hidden>Couper la caméra</button>
    <p class="ante-note">Le soir du bal, Lamia t’envoie par email le lien de la salle. Garde cette page pour faire un essai avant 21 h.</p>
    <p><a class="text-link" href="/speed-dating/">Retour au Bal masqué</a></p>
  </div>
</section>
</div>
<script type="module" src="/assets/antichambre.js?v=${VERSION}"></script>`,
  })
);

// Les Confidences avec Lamia : se confier par écrit, par la voix, ou en conversation privée ; signaler un profil.
const recHtml = (id) => `<div class="rec" data-rec>
        <div class="rec-ecran"><span class="rec-point" aria-hidden="true"></span><strong class="rec-temps" data-rec-time>0:00</strong><span class="rec-niveau" data-rec-meter aria-hidden="true"></span></div>
        <p class="rec-etat" data-rec-state role="status">Prêt·e ? Appuie sur « Démarrer » quand tu veux.</p>
        <div class="rec-boutons">
          <button class="conf-btn conf-btn-plein" type="button" data-rec-start>● Démarrer</button>
          <button class="conf-btn" type="button" data-rec-pause hidden>❚❚ Pause</button>
          <button class="conf-btn" type="button" data-rec-resume hidden>● Reprendre</button>
          <button class="conf-btn" type="button" data-rec-stop hidden>■ Arrêter</button>
          <button class="conf-btn" type="button" data-rec-redo hidden>↺ Recommencer</button>
        </div>
        <audio class="conf-audio" data-rec-audio controls hidden></audio>
        <label class="rec-import">Pas de micro ? <span>Importer un fichier audio</span><input type="file" accept="audio/*" data-rec-file id="${id}"></label>
      </div>`;
const identite = `<div class="conf-champs">
        <label>Prénom ou pseudonyme<input name="name" autocomplete="given-name" maxlength="80" required></label>
        <label>Email <small>(pour recevoir ma réponse)</small><input name="email" type="email" autocomplete="email" maxlength="254" required></label>
        <label>Téléphone <small>(facultatif)</small><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
      </div>`;
const consentement = `<label class="conf-accord"><input type="checkbox" name="consent" required> <span>J’accepte que mon message, mes fichiers et mes coordonnées soient conservés de façon privée pour que Lamia puisse me répondre. Seule Lamia y a accès. Je peux demander leur suppression à tout moment. <a href="/confidentialite/" target="_blank" rel="noopener">En savoir plus</a></span></label>
      <input class="conf-piege" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">`;
page(
  '/confidences/',
  layout({
    title: 'Les Confidences avec Lamia · Un mot, un doute, une histoire',
    description: 'Confie-toi à Lamia par écrit, par message vocal ou en conversation privée. Lamia te répond personnellement dès qu’elle est disponible.',
    path: '/confidences/',
    room: roomBySlug.confidences,
    scripts: ['/assets/membre.js', '/assets/confidences.js'],
    body: `<div class="conf">
<section class="conf-hero">
  <img class="conf-logo" src="/images/marque/lamia-logo-net-600.webp" width="140" height="140" alt="Lamia Femme Berbère">
  <p class="conf-sur">Le petit salon</p>
  <h1>Les Confidences avec Lamia</h1>
  <p class="conf-sous">« Un mot, un doute, une histoire… je t’écoute. »</p>
  <p class="conf-promesse">Lamia te répond personnellement dès qu’elle est disponible.</p>
</section>

<section class="conf-choix" aria-label="Comment veux-tu te confier ?">
  <button type="button" class="conf-carte" data-choix="ecrire" aria-expanded="false"><span class="conf-icone" aria-hidden="true">✎</span><strong>Je préfère écrire</strong><small>Un message, et si tu veux des photos ou des documents.</small></button>
  <button type="button" class="conf-carte" data-choix="parler" aria-expanded="false"><span class="conf-icone" aria-hidden="true">🎙</span><strong>Je préfère parler</strong><small>Un message vocal, enregistré ici même.</small></button>
  <button type="button" class="conf-carte" data-choix="conversation" aria-expanded="false"><span class="conf-icone" aria-hidden="true">❦</span><strong>Échanger avec Lamia</strong><small>Une conversation privée, que tu retrouves quand tu veux.</small></button>
</section>

<section class="conf-panneau" data-panneau="ecrire" hidden>
  <form class="conf-form" data-conf-ecrit novalidate>
    <h2>Je préfère écrire</h2>
    ${identite}
    <label>Ton message<textarea name="body" rows="7" maxlength="8000" placeholder="Prends ton temps. Écris comme tu parlerais à une amie."></textarea></label>
    <div class="conf-fichiers">
      <label class="conf-ajout">＋ Ajouter des fichiers <small>images, PDF, documents</small><input type="file" multiple accept="image/*,.pdf,.doc,.docx,.odt,.txt,application/pdf" data-fichiers></label>
      <ul class="conf-liste" data-liste></ul>
    </div>
    ${consentement}
    <button class="conf-btn conf-btn-plein conf-envoyer" type="submit">Confier mon message à Lamia</button>
    <p class="conf-statut" role="status" data-statut></p>
  </form>
</section>

<section class="conf-panneau" data-panneau="parler" hidden>
  <form class="conf-form" data-conf-vocal novalidate>
    <h2>Je préfère parler</h2>
    <p class="conf-aide">Le micro ne s’allume que lorsque tu appuies sur « Démarrer ». Tu peux mettre en pause, réécouter et recommencer avant d’envoyer. 10 minutes au maximum.</p>
    ${recHtml('import-vocal')}
    ${identite}
    <label>Un mot pour accompagner ton vocal <small>(facultatif)</small><textarea name="body" rows="3" maxlength="8000"></textarea></label>
    ${consentement}
    <button class="conf-btn conf-btn-plein conf-envoyer" type="submit">Envoyer mon message vocal</button>
    <p class="conf-statut" role="status" data-statut></p>
  </form>
</section>

<section class="conf-panneau" data-panneau="conversation" id="conversation" hidden>
  <div class="conf-form" data-conv-connexion>
    <h2>Échanger avec Lamia</h2>
    <p>Une conversation privée, rien qu’entre toi et Lamia : textes, vocaux et images. C’est Lamia elle-même qui te répond, jamais un robot.</p>
    <p>Pour retrouver ta conversation, pas de mot de passe : tu reçois un lien de connexion par email.</p>
    <form class="conf-ligne" data-conv-lien>
      <label>Ton email<input name="email" type="email" autocomplete="email" required></label>
      <button class="conf-btn conf-btn-plein" type="submit">Recevoir mon lien</button>
    </form>
    <p class="conf-statut" role="status" data-conv-lien-statut></p>
  </div>
  <div class="conf-form conf-conv" data-conv hidden>
    <div class="conf-conv-tete"><h2>Ma conversation avec Lamia</h2><p><small data-conv-email></small> · <button type="button" class="conf-lien" data-conv-sortir>Me déconnecter</button></p></div>
    <div class="conf-fil" data-conv-fil aria-live="polite"></div>
    <form class="conf-composer" data-conv-form novalidate>
      <div data-conv-premier hidden>
        <label>Prénom ou pseudonyme<input name="name" maxlength="80"></label>
        ${consentement}
      </div>
      <label class="conf-visuel-cache" for="conv-texte">Ton message</label>
      <textarea id="conv-texte" name="body" rows="3" maxlength="8000" placeholder="Écris à Lamia…"></textarea>
      <div class="conf-composer-outils">
        <label class="conf-btn conf-petit">🖼 Image<input type="file" accept="image/*" multiple data-conv-images hidden></label>
        <button class="conf-btn conf-petit" type="button" data-conv-vocal-ouvrir>🎙 Vocal</button>
        <button class="conf-btn conf-btn-plein" type="submit">Envoyer</button>
      </div>
      <ul class="conf-liste" data-conv-liste></ul>
      <div data-conv-vocal hidden>${recHtml('import-conv')}</div>
      <p class="conf-statut" role="status" data-conv-statut></p>
    </form>
    <p class="conf-petit-texte">Tu peux <button type="button" class="conf-lien" data-conv-supprimer>supprimer cette conversation</button> à tout moment : messages, vocaux et fichiers sont alors effacés.</p>
  </div>
</section>

<section class="conf-donnees">
  <h2>Tes confidences restent entre toi et Lamia</h2>
  <ul>
    <li>Tes messages, vocaux et fichiers sont gardés dans un espace privé : seules toi et Lamia y avez accès.</li>
    <li>Lamia reçoit une simple alerte, sans le contenu, sur son téléphone.</li>
    <li>Tu peux demander la suppression de tes données à tout moment, depuis ta conversation ou en écrivant à <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a>.</li>
    <li>Lamia lit tout elle-même, mais ne peut pas promettre une réponse immédiate. Et internet ne garantit jamais un anonymat absolu : évite d’écrire ce que tu ne voudrais pas confier.</li>
  </ul>
  <p class="conf-urgence">${esc(P.confidences.emergency)}</p>
</section>

<section class="conf-signaler" id="signaler" aria-labelledby="signaler-titre">
  <h2 id="signaler-titre">Signaler un profil ou un comportement</h2>
  <p>Ce n’est pas une confidence mais une alerte : un faux profil, une personne déjà en couple, une pression, une arnaque ou un comportement inquiétant lors d’une soirée. La personne signalée ne sait jamais qui a envoyé l’alerte.</p>
  <details class="conf-details">
    <summary>Faire un signalement</summary>
    <form class="report-form" data-report hidden>
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
      <label>Raconte-moi ce qui s’est passé<textarea name="written_details" rows="5" maxlength="5000"></textarea></label>
      <div class="audio-row"><button class="conf-btn" type="button" data-audio-start>Enregistrer un audio</button><button class="conf-btn" type="button" data-audio-stop disabled>Arrêter</button><span data-audio-state></span></div>
      <button class="conf-btn conf-btn-plein" type="submit">Envoyer le signalement</button>
    </form>
    <div data-report-login>
      <p>Pour signaler un profil, connecte-toi à ton espace : Lamia pourra te recontacter si besoin.</p>
      <p><a class="conf-btn" href="/mon-espace/">Me connecter</a></p>
    </div>
    <p class="form-status" role="status" data-report-status></p>
  </details>
</section>
</div>`,
  })
);

// L'espace de Lamia pour les confidences : application installable sur son téléphone (notifications).
page(
  '/confidences-lamia/',
  `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Confidences · Lamia</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#a86f7b">
<link rel="manifest" href="/confidences-lamia.webmanifest">
<link rel="icon" href="/images/marque/confidences-icone-192.png" type="image/png">
<link rel="apple-touch-icon" href="/images/marque/confidences-icone-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Confidences">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/confidences-lamia.css?v=${VERSION}">
</head>
<body class="cl">
<header class="cl-haut">
  <button class="cl-retour" type="button" data-retour hidden aria-label="Retour à la liste">‹</button>
  <img src="/images/marque/confidences-icone-192.png" width="36" height="36" alt="">
  <h1>Confidences <span data-total></span></h1>
  <button class="cl-icone" type="button" data-ouvrir-reglages aria-label="Réglages des alertes">⚙︎</button>
</header>

<main class="cl-main">
  <form class="cl-login" data-login hidden>
    <h2>Bonjour Lamia</h2>
    <p>Connecte-toi avec ton compte administratrice.</p>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="cl-btn cl-plein" type="submit">Me connecter</button>
    <p class="cl-statut" data-login-statut role="status"></p>
  </form>

  <section data-liste-vue hidden>
    <nav class="cl-onglets" aria-label="Classement">
      <button type="button" data-filtre="a_lire" aria-pressed="true">À lire <b data-n="a_lire"></b></button>
      <button type="button" data-filtre="en_cours" aria-pressed="false">En cours <b data-n="en_cours"></b></button>
      <button type="button" data-filtre="termine" aria-pressed="false">Terminé <b data-n="termine"></b></button>
      <button type="button" data-filtre="tous" aria-pressed="false">Tout</button>
    </nav>
    <div class="cl-alerte" data-alerte-notif hidden></div>
    <ul class="cl-liste" data-liste></ul>
  </section>

  <section class="cl-fil" data-fil-vue hidden>
    <div class="cl-fil-tete">
      <div><h2 data-fil-nom></h2><p class="cl-coord" data-fil-coord></p></div>
      <label class="cl-statut-choix">Classement<select data-fil-statut><option value="a_lire">À lire</option><option value="en_cours">En cours</option><option value="termine">Terminé</option></select></label>
    </div>
    <div class="cl-messages" data-messages aria-live="polite"></div>
    <form class="cl-repondre" data-repondre>
      <textarea name="body" rows="3" maxlength="8000" placeholder="Ta réponse…" aria-label="Ta réponse"></textarea>
      <ul class="cl-pj" data-pj></ul>
      <div data-vocal hidden>
        <div class="rec" data-rec>
          <div class="rec-ecran"><span class="rec-point" aria-hidden="true"></span><strong class="rec-temps" data-rec-time>0:00</strong><span class="rec-niveau" data-rec-meter aria-hidden="true"></span></div>
          <p class="rec-etat" data-rec-state role="status"></p>
          <div class="rec-boutons">
            <button class="cl-btn cl-plein" type="button" data-rec-start>● Démarrer</button>
            <button class="cl-btn" type="button" data-rec-pause hidden>❚❚ Pause</button>
            <button class="cl-btn" type="button" data-rec-resume hidden>● Reprendre</button>
            <button class="cl-btn" type="button" data-rec-stop hidden>■ Arrêter</button>
            <button class="cl-btn" type="button" data-rec-redo hidden>↺ Recommencer</button>
          </div>
          <audio data-rec-audio controls hidden></audio>
          <label class="rec-import">Ou <span>importer un fichier audio</span><input type="file" accept="audio/*" data-rec-file></label>
        </div>
      </div>
      <div class="cl-outils">
        <label class="cl-btn cl-petit">🖼 Image<input type="file" accept="image/*" multiple data-images hidden></label>
        <button class="cl-btn cl-petit" type="button" data-ouvrir-vocal>🎙 Vocal</button>
        <button class="cl-btn cl-plein" type="submit">Envoyer</button>
      </div>
      <p class="cl-statut" data-rep-statut role="status"></p>
    </form>
    <p class="cl-bas"><button type="button" class="cl-lien" data-supprimer>Supprimer cette conversation</button> (à la demande de la personne)</p>
  </section>

  <section class="cl-reglages" data-reglages-vue hidden>
    <h2>Alertes</h2>
    <div class="cl-carte">
      <h3>Notifications sur cet appareil</h3>
      <p data-push-etat>…</p>
      <p class="cl-aide" data-ios-aide hidden>Sur iPhone et iPad : ouvre cette page dans Safari, touche le bouton Partager <b>⎙</b>, puis <b>« Sur l’écran d’accueil »</b>. Ouvre ensuite « Confidences » depuis l’écran d’accueil et reviens ici pour activer les notifications (iOS 16.4 ou plus récent).</p>
      <div class="cl-outils"><button class="cl-btn cl-plein" type="button" data-push-activer>Activer sur cet appareil</button><button class="cl-btn" type="button" data-push-couper hidden>Désactiver sur cet appareil</button><button class="cl-btn" type="button" data-push-test>Envoyer un test</button></div>
      <p class="cl-statut" data-push-statut role="status"></p>
    </div>
    <form class="cl-carte" data-reglages>
      <h3>Réglages</h3>
      <label class="cl-case"><input type="checkbox" name="alertes_push"> Notifications sur mes appareils</label>
      <label class="cl-case"><input type="checkbox" name="alertes_email"> Alerte email de secours</label>
      <label>Adresse qui reçoit les alertes email<input name="email_alerte" type="email" placeholder="ton adresse email"></label>
      <fieldset><legend>Ne pas me déranger (notifications coupées, emails maintenus)</legend>
        <div class="cl-heures"><label>De<select name="silence_debut"></select></label><label>à<select name="silence_fin"></select></label></div>
      </fieldset>
      <label class="cl-case"><input type="checkbox" name="prevenir_visiteur"> Prévenir la personne par email quand je réponds</label>
      <p class="cl-aide">Une seule alerte par conversation toutes les 10 minutes, même si la personne envoie plusieurs messages. Les notifications n’affichent jamais le contenu.</p>
      <p class="cl-aide" data-email-etat></p>
      <div class="cl-outils"><button class="cl-btn cl-plein" type="submit">Enregistrer</button><button class="cl-btn" type="button" data-email-test>Envoyer un email de test</button></div>
      <p class="cl-statut" data-reglages-statut role="status"></p>
    </form>
    <p class="cl-bas"><a class="cl-lien" href="/admin.html">Signalements de profils</a> · <a class="cl-lien" href="/tableau-de-bord">Tableau de bord</a> · <button type="button" class="cl-lien" data-sortir>Me déconnecter</button></p>
  </section>
</main>
<script type="module" src="/assets/confidences-lamia.js?v=${VERSION}"></script>
</body>
</html>`
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
  <figure>${IMGT('image.galerie.oeuvre', 'La Galerie', 'Image dans le cadre doré', `<img src="/images/collier/collier-kabyle-15g-detail-1120.webp" width="1120" height="1399" loading="lazy" alt="Détail d’un médaillon kabyle émaillé bleu, vert et jaune, cabochon de corail au centre">`)}<figcaption>Visuel d’ambiance</figcaption></figure>
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
      ${IMG['lamia-portrait'] ? `<img src="${esc(IMG['lamia-portrait'])}"` : '<img src="/images/lamia/lamia-salon-900.webp" srcset="/images/lamia/lamia-salon-560.webp 560w, /images/lamia/lamia-salon-900.webp 900w, /images/lamia/lamia-salon-1122.webp 1122w"'} sizes="(max-width: 900px) 92vw, 46vw" width="1122" height="1402" fetchpriority="high" alt="Lamia Bréchet Ighil dans son salon, en robe kabyle brodée, lunettes, collier et bracelet d’argent émaillé, au coucher du soleil">
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
    <p>Et parce qu’une rencontre doit rester respectueuse et sûre, j’ai aussi voulu <a class="text-link" href="/confidences/">un espace de confidences</a> : un endroit où quelqu’un peut venir me signaler discrètement un comportement inquiétant.</p>
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
      <li><a href="/confidences/"><strong>Les Confidences avec Lamia</strong> pour protéger.</a></li>
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

// Souhaits après une soirée : le choix se fait directement dans la salle du bal.
// La page autonome reste informative tant que la table dédiée n'a pas été validée.
page(
  '/speed-dating/souhaits/',
  layout({
    title: 'Mes souhaits après la soirée · Le Boudoir des Rencontres',
    description: 'À la fin du bal, indique en privé les personnes que tu souhaites revoir.',
    path: '/speed-dating/souhaits/',
    room: roomBySlug['speed-dating'],
    noindex: true,
    body: `<section class="room-head"><p class="room-name"><span class="pip" aria-hidden="true"></span>Le Boudoir des Rencontres</p><h1>Qui aimerais-tu revoir ?</h1><p class="lead">À la fin de chaque Bal, ton formulaire de souhaits s’ouvre directement dans la salle. Tu ne peux choisir que parmi les personnes que tu as réellement rencontrées.</p><p>Ton choix reste privé. Si le souhait est réciproque, Lamia voit la réciprocité et peut vous mettre en relation.</p><p class="bal-actions"><a class="btn btn-ink" href="/speed-dating/bal/">Revenir à la salle du bal</a><a class="btn btn-line" href="/speed-dating/">Retour au Boudoir</a></p></section>`,
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
      body: `<article class="article legal"><p class="draft-banner">Brouillon : ce texte sera complété et relu avant l’ouverture des ventes.</p><h1>${esc(lp.title)}</h1>${lp.body.replaceAll('{{LIVRAISON}}', livraisonTexte(BOUTIQUE.tarifs)).replace('{{TVA}}', tvaTexte(BOUTIQUE.tva))}</article>`,
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
await mkdir(join(DIST, 'assets'), { recursive: true });
await writeFile(join(DIST, 'assets', 'editable.json'), JSON.stringify({ fields: [...EDITABLE, ...REGISTRE], defaults: DEFAULTS }));
for (const f of ['maison.css', 'maison.js', 'membre.js', 'antichambre.js', 'bal.js', 'espace.js', 'confidences.js', 'confidences-commun.js', 'enregistreur.js', 'confidences-lamia.js', 'confidences-lamia.css']) await cp(join(ROOT, 'src', f), join(DIST, 'assets', f));
await cp(join(ROOT, 'content', 'shipping.mjs'), join(DIST, 'assets', 'shipping.mjs'));

const indexable = pages.filter((p) => !p.path.endsWith('.html') && !['/produit/', '/speed-dating/merci/', '/speed-dating/souhaits/', '/cgv/', '/mentions-legales/', '/confidentialite/', '/retours/', '/conditions-utilisation/', '/confidences-lamia/'].includes(p.path));
await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable.map((p) => `<url><loc>${SITE_URL}${p.path}</loc></url>`).join('')}</urlset>\n`
);
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /pilotage.html\nDisallow: /admin-soirees.html\nDisallow: /speed-dating/merci/\nDisallow: /speed-dating/bal/\nDisallow: /mon-espace/\nDisallow: /tableau-de-bord\nDisallow: /admin-bal.html\nDisallow: /confidences-lamia/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Maison générée : ${pages.length} pages dans dist/`);
