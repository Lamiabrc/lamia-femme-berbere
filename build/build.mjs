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
import { GUIDES } from '../content/guides.mjs';
import { pageAnglaise, pageFrancaise, produitAnglais, enPath, FR_ONLY, STRINGS, MANQUANTS } from './english.mjs';
import { EDITABLE, defaults, applyOverrides } from '../content/editable.mjs';
import { FORMULES, UNITES, prixAnnuel, prixMensuel, euros as eurosAbo } from '../content/abonnements.mjs';

const placesLancement = (f) => (f.lancement ? `<p class="abo-places" data-prestige-places>Prix de lancement pour les ${f.lancement.places} premiers abonnés, puis ${eurosAbo(f.mois)} par mois</p>` : '');

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
    title: 'Lives en multistream, débats et société',
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
<link rel="manifest" href="/maison.webmanifest">
<script src="/assets/version-play.js"></script>
<link rel="apple-touch-icon" href="/images/marque/maison-icone-180.png">
<meta name="apple-mobile-web-app-title" content="LFB">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="stylesheet" href="/fonts/polices.css">
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
    ${link('/rencontres/', 'Rencontres', 'patio')}
    <a href="/rencontres/swipe/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Swipe</a>
    ${link('/speed-dating/', 'Speed dating', 'speed-dating')}
    ${link('/abonnement/', 'Formules', 'abonnement')}
    ${link('/salon/', 'Lives', 'salon')}
    ${link('/ecrin/', 'Bijoux kabyles', 'ecrin')}
    ${link('/bibliotheque/', 'Livre', 'bibliotheque')}
  </nav>
  <div class="header-actions">
    <details class="maison-menu" data-maison-menu>
      <summary>Menu <span aria-hidden="true">▾</span></summary>
      <div class="maison-menu-panneau">
        <div class="maison-menu-etage"><p>Rencontres</p><ul><li><a href="/rencontres/#profils-anonymes"><strong>Les profils</strong></a></li><li><a href="/rencontres/swipe/"><strong>Swiper les profils</strong></a></li><li><a href="/rencontres/#confier"><strong>Créer mon profil</strong></a></li><li><a href="/speed-dating/"><strong>Speed dating</strong></a></li><li><a href="/abonnement/"><strong>Les formules</strong></a></li><li><a href="/salon/"><strong>Le live</strong></a></li><li><a href="/confidences/"><strong>Écrire à Lamia</strong></a></li></ul></div>
        <div class="maison-menu-etage"><p>L’univers de Lamia</p><ul><li><a href="/lamia-brechet/"><strong>Qui est Lamia</strong></a></li><li><a href="/ecrin/"><strong>Bijoux kabyles</strong></a></li><li><a href="/werdi-ouvre-les-yeux/"><strong>Le livre Werdi</strong></a></li><li><a href="/boutique/"><strong>La boutique</strong></a></li><li><a href="/galerie/"><strong>La galerie</strong></a></li></ul></div>
        <div class="maison-menu-etage"><p>Mon compte</p><ul><li><a href="/mon-espace/"><strong>Mon espace</strong></a></li><li><a href="/application/"><strong>L’application</strong></a></li></ul></div>
      </div>
    </details>
    <a class="cloche" href="/nouveautes/" aria-label="Les nouveautés"><svg class="ico" aria-hidden="true"><use href="/icones.svg#cloche"/></svg><b data-cloche-point hidden></b></a>
    <a class="account-link" href="/mon-espace/" data-account-link aria-label="Se connecter ou ouvrir mon espace"><span class="account-icone" aria-hidden="true"><svg class="ico" aria-hidden="true"><use href="/icones.svg#compte"/></svg></span><span data-account-texte>Se connecter</span></a>
    <a class="cta-profil" href="/rencontres/#confier"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lettre"/></svg><span>Créer mon profil</span></a>
  </div>
</header>
<nav class="barre-app" aria-label="Raccourcis">
  <a href="/rencontres/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#profils"/></svg>Profils</a>
  <a href="/rencontres/swipe/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur"/></svg>Swipe</a>
  <a href="/mon-espace/#discussion" data-barre-messages><svg class="ico" aria-hidden="true"><use href="/icones.svg#bulle"/></svg>Messages<i data-barre-point hidden></i></a>
  <a href="/salon/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#live"/></svg>Live</a>
  <a href="/mon-espace/" data-barre-compte><svg class="ico" aria-hidden="true"><use href="/icones.svg#compte"/></svg><b>Moi</b></a>
</nav>`;
}

function footer() {
  return `<div class="frise" aria-hidden="true"></div>
<footer class="site-footer">
  <div class="footer-house">
    <p class="footer-sign">ⵣ</p>
    <p>Lamia Femme Berbère<br>Les rencontres sérieuses de Lamia, marieuse kabyle, au cœur de la culture amazighe.</p>
  </div>
  <nav aria-label="Rencontres">
    <p class="footer-title">Rencontres</p>
    <ul><li><a href="/rencontres/">Rencontres kabyles sérieuses</a></li><li><a href="/rencontres/#confier">Créer mon profil</a></li><li><a href="/speed-dating/">Speed dating</a></li><li><a href="/abonnement/">Les formules</a></li><li><a href="/salon/">Le live chaque soir</a></li><li><a href="/confidences/">Écrire à Lamia</a></li></ul>
    <p class="footer-title">Guides</p>
    <ul>${GUIDES.map((g) => `<li><a href="${g.path}">${esc(g.lien[0])}</a></li>`).join('')}</ul>
    <p class="footer-title">Boutique</p>
    <ul><li><a href="/ecrin/">Bijoux kabyles d’Ath Yenni</a></li><li><a href="/bibliotheque/">Le livre Werdi</a></li><li><a href="/grenier/">Trouvailles vintage</a></li></ul>
  </nav>
  <div>
    <p class="footer-title">Lamia</p>
    <ul>
      <li><a href="/lamia-brechet/">Qui est Lamia</a></li>
      <li><a href="/werdi-ouvre-les-yeux/">Le livre Werdi</a></li>
      <li><a href="/application/" data-installer>L’application de la Maison</a></li>
      <li><a href="https://www.tiktok.com/@lamiafemmeberbere" rel="noopener" target="_blank">TikTok @lamiafemmeberbere</a></li>
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
  salon: ['/images/lamia/lamia-portrait-tatouages-noir-480.webp', 'Lamia Femme Berbère, portrait réel'],
  'speed-dating': ['/images/lamia/lamia-portrait-sourire-rose-480.webp', 'Lamia Femme Berbère, hôte du Boudoir des Rencontres'],
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
  `<div class="product-grid" data-products="${esc(categories.join(','))}"${opts.sold ? ' data-show-sold' : ''}${opts.group ? ' data-group-by-room' : ''}${opts.rubriques ? ' data-rubriques' : ''}>
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
globalThis.__pageFr = page;

// Le Hall
page(
  '/',
  layout({
    title: 'Rencontre kabyle sérieuse pour le mariage · Lamia',
    description: 'Rencontre kabyle en vue du mariage : profils vérifiés, présentations faites par Lamia, marieuse kabyle. Ton premier match est offert.',
    path: '/',
    room: roomBySlug.hall,
    scripts: ['/assets/annonces.js'],
    body: `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', '@id': SITE_URL + '/#organisation', name: 'Lamia Femme Berbère', url: SITE_URL + '/', logo: SITE_URL + '/images/lamia/lamia-portrait-tatouages-rond-480.webp', founder: { '@type': 'Person', name: 'Lamia Bréchet Ighil', url: SITE_URL + '/lamia-brechet/' }, sameAs: ['https://www.tiktok.com/@lamiafemmeberbere', 'https://www.facebook.com/femmeberberes/'] }, { '@type': 'WebSite', '@id': SITE_URL + '/#site', name: 'Lamia Femme Berbère', url: SITE_URL + '/', publisher: { '@id': SITE_URL + '/#organisation' }, inLanguage: ['fr', 'en'] }] })}</script>
<div class="po-app accueil">
<section class="po-hero accueil-hero" aria-labelledby="accueil-titre">
  <div class="po-fond" aria-hidden="true"></div>
  <div class="po-hero-grid">
    <div class="po-hero-texte">
      <p class="lfb-azul lfb-azul-hero" lang="ber">ⴰⵣⵓⵍ</p>
      <p class="po-eyebrow">${esc(T('accueil.surtitre', 'Accueil', 'Petite ligne au-dessus du titre', 'La marieuse kabyle · rencontres sérieuses'))}</p>
      <h1 id="accueil-titre">${esc(T('accueil.titre', 'Accueil', 'Grand titre', 'Trouve ton âme sœur kabyle, avec Lamia'))}</h1>
      <p class="po-sub">${esc(T('accueil.sous-titre', 'Accueil', 'Phrase sous le titre', 'Profils vérifiés. Lamia vous présente. En vue du mariage.'))}</p>
      <p class="po-actions"><a class="po-btn" data-cta-profil href="/rencontres/#confier"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lettre"/></svg> <span>Créer mon profil ou connexion</span></a><a class="po-btn-verre" href="/rencontres/#profils-anonymes">Voir les profils</a></p>
      <p class="accueil-couple"><a href="/abonnement/#unite-sauver_couple"><strong>${esc(T('accueil.couple-titre', 'Accueil', 'Encadré couple : la question', 'T’es en couple et tu veux tenter une dernière chose avant de rompre ?'))}</strong><span>${esc(T('accueil.couple-action', 'Accueil', 'Encadré couple : le bouton', 'Réserve une séance de love coaching en ligne'))}</span><small><b>1 heure en visio avec Lamia</b><i> · ${UNITES.find((u) => u.id === 'sauver_couple').prix / 100} €</i></small></a></p>
      <ul class="accueil-preuves">
        <li>✓ Chaque profil vérifié par Lamia</li>
        <li>✓ 1er match offert</li>
        <li>✓ Live chaque soir, 21 h</li>
        <li>✓ France, Algérie, Canada, Europe</li>
      </ul>
    </div>
    <figure class="po-lamia">
      <img src="/images/lamia/lamia-portrait-tatouages-rond-480.webp" alt="Lamia Femme Berbère, marieuse kabyle" width="240" height="240" fetchpriority="high">
      <figcaption>Lamia · ta marieuse</figcaption>
    </figure>
  </div>
</section>

<section class="po-corps accueil-corps">
  <div class="patio-etapes">
    <h2>Comment ça marche</h2>
    <ol>
      <li><strong>Tu crées ton profil</strong><span>En 5 minutes : qui tu es, qui tu cherches, 2 photos. Rien n’est publié avec ton nom.</span></li>
      <li><strong>Lamia vérifie</strong><span>Les faux profils n’entrent pas. Avec ta pièce d’identité (facultative), ton profil gagne le badge « vérifié avec pièce d’identité ».</span></li>
      <li><strong>Elle cherche pour toi</strong><span>Son outil de matching compare les profils, et Lamia choisit avec son regard.</span></li>
      <li><strong>Elle vous présente</strong><span>Si vous êtes d’accord tous les deux, elle vous met en contact. La première fois, c’est offert.</span></li>
    </ol>
    <p class="po-actions"><a class="po-btn" data-cta-profil href="/rencontres/#confier"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lettre"/></svg> <span>Créer mon profil ou connexion</span></a></p>
  </div>

  <div class="accueil-bloc">
    <h2 class="annonces-titre">Les formules</h2>
    <p class="annonces-sous">Sans engagement. Le premier match est toujours offert.</p>
    <div class="abo-grille">${FORMULES.map((f) => `<a class="abo-carte abo-mini${f.vedette ? ' is-vedette' : ''}" href="${f.mois ? `/abonnement/?formule=${f.id}` : '/rencontres/#confier'}">${f.vedette ? '<span class="abo-ruban">Le plus choisi</span>' : ''}<h3>${esc(f.nom)}</h3><p class="abo-prix">${f.mois ? `<span${f.lancement ? ' data-prestige-prix="mois"' : ''}>${eurosAbo(prixMensuel(f, 0))}<small> / mois</small></span>` : 'Gratuit'}</p>${placesLancement(f)}<ul>${f.avantages.slice(0, 2).map((a) => `<li>${esc(a)}</li>`).join('')}</ul><span class="po-btn">${f.mois ? `Choisir ${esc(f.nom)}` : 'Commencer'}</span></a>`).join('')}</div>
  </div>

  <div class="accueil-bloc">
    <h2 class="annonces-titre">Ils et elles cherchent aussi</h2>
    <p class="annonces-sous">Des profils vérifiés, anonymes. Un profil te touche ? Dis-le, Lamia regarde si vous pouvez correspondre.</p>
    <div class="annonces-liste" data-annonces-liste data-limite="6"><p class="annonce-vide">Les profils arrivent…</p></div>
    <p class="po-actions"><a class="po-btn-verre" href="/rencontres/#profils-anonymes">Voir tous les profils</a></p>
  </div>

  <div class="accueil-duo">
    <a class="abo-carte accueil-carte" href="/speed-dating/">
      <h3>Speed dating en ligne</h3>
      <p data-prochaine-soiree>Des soirées en visio par tranche d’âge : quelques minutes de tête-à-tête, caméra allumée, Lamia qui veille.</p>
      <span class="po-btn-verre">Voir les prochaines soirées</span>
    </a>
    <a class="abo-carte accueil-carte" href="/salon/">
      <h3>Le live, chaque soir à 21 h</h3>
      <p>Débats, invités et annonces de mariage en direct, sur TikTok, YouTube, Facebook, Instagram et Twitch.</p>
      <span class="po-btn-verre">Le live et mes outils</span>
    </a>
  </div>
</section>
</div>

<section class="accueil-univers" aria-labelledby="univers-titre">
  <h2 id="univers-titre">L’univers de Lamia</h2>
  <div class="accueil-univers-grille">
    <a class="accueil-univers-carte" href="/ecrin/"><img src="/images/collier/collier-kabyle-15g-hero-320.webp" width="320" height="400" alt="Collier kabyle en argent émaillé d’Ath Yenni" loading="lazy"><span><strong>Bijoux kabyles d’Ath Yenni</strong>Argent émaillé et corail, faits main par les artisans du village.</span></a>
    <a class="accueil-univers-carte" href="/werdi-ouvre-les-yeux/"><img src="/images/marque/lamia-illu-banquette-560.webp" width="560" height="678" alt="Werdi, ouvre les yeux !, le livre de Lamia" loading="lazy"><span><strong>Le livre Werdi, ouvre les yeux !</strong>Les conseils d’une maman kabyle pour aimer avec les yeux ouverts.</span></a>
  </div>
</section>

<section class="story story-lamia" aria-labelledby="story-title">
  <figure class="story-lamia-portrait">${IMGT('image.hall.histoire', 'Le Hall', 'Portrait à côté de mon histoire', `<img src="/images/lamia/lamia-portrait-carnet-480.webp" width="480" height="600" loading="lazy" alt="Lamia Femme Berbère">`)}</figure>
  <div>
    <h2 id="story-title">${esc(P.hall.story.title)}</h2>
    ${P.hall.story.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    <p><a class="text-link" href="/lamia-brechet/">Mon histoire et ma démarche</a></p>
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
    body: `${roomHead(roomBySlug.salon, '<p class="patio-actions"><a class="ame-soeur-btn" href="#ce-soir">Ce soir en live</a><a class="salon-ancre" href="#coeur-direct">Les débats</a><a class="salon-ancre" href="#outil-live">Le matching en live</a><a class="salon-ancre" href="#replays">Les replays</a></p>')}
<section class="room-body salon-ce-soir" id="ce-soir" aria-labelledby="ce-soir-titre">
  <div class="salon-live">
    <p class="prose-lead">${esc(P.salon.intro)}</p>
    ${P.salon.lives
      .map(
        (l) => `<article class="live-card">${cover('live', 'Couverture du Live Mariage Kabyle de Lamia', 'live-cover')}<h2>${esc(l.name)}</h2><p class="live-when">${esc(l.when)}</p><p>${esc(l.text)}</p><a class="btn btn-ink" href="#reseaux-titre">Choisir ma plateforme</a> <a class="btn btn-gold" href="#coeur-direct">Les débats et mes outils</a></article>`
      )
      .join('')}
  </div>
  <aside class="side-note">
    <h2>Les règles du Salon</h2>
    ${list(P.salon.rules)}
  </aside>
</section>
<section class="reseaux salon-plateformes" aria-labelledby="reseaux-titre">
  <h2 id="reseaux-titre">Choisis ta plateforme</h2>
  <p class="reseaux-intro">Le même live, au même moment, partout. Suis-moi là où tu es le plus à l’aise.</p>
  <div class="reseaux-grille"><a class="reseau reseau-tiktok" data-social="tiktok" href="https://www.tiktok.com/@lamiafemmeberbere" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M16.6 5.8a4.3 4.3 0 0 1-3.4-3.8h-3v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V8.8a5.7 5.7 0 1 0 4.8 5.6V8.1a7.3 7.3 0 0 0 4.3 1.4v-3c-.3 0-.6-.1-.9-.7Z"/></svg><strong>TikTok</strong><span>Le live, avec mes invités en direct</span></a><a class="reseau reseau-facebook" data-social="facebook" href="https://www.facebook.com/femmeberberes/" rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.3H7.7V14h2.7v8h3.1Z"/></svg><strong>Facebook</strong><span>La page Femme Berbère</span></a><a class="reseau reseau-instagram" data-social="instagram" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm5-8.1a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1C3.7 15 3.6 14.7 3.6 12s0-3 .1-4.1C3.8 5.2 5.1 3.8 7.9 3.7 9 3.6 9.3 3.6 12 3.6Z"/></svg><strong>Instagram</strong><span>Le live, les coulisses et les bijoux</span></a><a class="reseau reseau-youtube" data-social="youtube" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z"/></svg><strong>YouTube</strong><span>Mes vidéos et mes lives en replay</span></a><a class="reseau reseau-twitch" data-social="twitch" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M4.3 3 3 6.4v13.1h4.5V22h2.5l2.5-2.5h3.7l4.8-4.8V3H4.3Zm15.1 10.9-2.8 2.8h-4.5l-2.4 2.4v-2.4H5.9V4.7h13.5v9.2Zm-2.8-5.7v4.9h-1.7V8.2h1.7Zm-4.5 0v4.9h-1.7V8.2h1.7Z"/></svg><strong>Twitch</strong><span>Le live, aussi sur Twitch</span></a><a class="reseau reseau-snapchat" data-social="snapchat" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M12 3c2.9 0 4.9 2.1 4.9 5v2.1l1.3-.4c.6-.1 1 .6.5 1l-1.6 1c.6 1.9 2 3.2 3.6 3.6.4.1.4.6 0 .8-.7.3-1.5.5-2.2.6-.1.4-.2.9-.4 1.2-1.1-.2-2.2 0-3.1.7-.9.6-2 .9-3 .9s-2.1-.3-3-.9c-.9-.7-2-.9-3.1-.7-.2-.3-.3-.8-.4-1.2-.7-.1-1.5-.3-2.2-.6-.4-.2-.4-.7 0-.8 1.6-.4 3-1.7 3.6-3.6l-1.6-1c-.5-.4-.1-1.1.5-1l1.3.4V8c0-2.9 2-5 4.9-5Z"/></svg><strong>Snapchat</strong><span>Le quotidien, au plus près</span></a><a class="reseau reseau-whatsapp" data-social="whatsapp" hidden rel="noopener" target="_blank"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Zm4.9 12.6c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg><strong>WhatsApp</strong><span>La chaîne des nouvelles de la Maison</span></a></div>
</section>
<section class="po-app outil-live" id="coeur-direct" aria-labelledby="coeur-direct-titre">
  <div class="outil-live-tete">
    <img src="/images/lamia/lamia-portrait-tatouages-rond-480.webp" alt="" width="120" height="120" loading="lazy">
    <div>
      <p class="po-eyebrow">Ma salle de rédaction · chaque soir</p>
      <h2 id="coeur-direct-titre">Le Cœur en Direct, mon outil pour préparer le live</h2>
      <p>Avant chaque live, je passe par ma salle de rédaction, Le Cœur en Direct. C’est là que je prépare l’émission du soir : le thème, les débats, les questions et les animations. L’amour, le couple, le mariage, la famille, et nos cultures kabyle, algérienne, française et maghrébine.</p>
    </div>
  </div>
  <div class="patio-etapes">
    <h2>Comment je choisis les débats</h2>
    <ol>
      <li><strong>Un thème par soir</strong><span>L’outil me propose une thématique principale. C’est moi qui la valide ou la refuse, et je prépare les animations qui vont avec.</span></li>
      <li><strong>Des questions neuves</strong><span>Chaque soir, de nouvelles questions dans le même esprit, jamais celles de la veille. On ne tourne pas en rond.</span></li>
      <li><strong>Du concret qui fait réagir</strong><span>L’argent dans le couple, le 50/50, les exigences des hommes et des femmes, le bled ou la France, le contrôle, la belle-famille, le mariage gris : des situations vraies, posées sans détour.</span></li>
      <li><strong>Vos réactions comptent</strong><span>L’outil retient les sujets qui vous ont fait le plus réagir, pour que les prochains lives vous ressemblent encore plus.</span></li>
    </ol>
  </div>
  <div class="patio-etapes">
    <h2>Le déroulé d’un live</h2>
    <ol>
      <li><strong>Le débat du soir</strong><span>On ouvre sur le thème du jour. Chacun donne son avis, avec respect, sur toutes les plateformes à la fois.</span></li>
      <li><strong>Les invités</strong><span>Sur TikTok, je fais monter des invités en direct pour témoigner ou débattre.</span></li>
      <li><strong>Les annonces de mariage</strong><span>Je présente à l’écran les annonces de mon outil de matching, sans nom ni contact.</span></li>
      <li><strong>Bientôt</strong><span>« Débats sans filtre », avec « Mariage sans filtre » et « Les questions qui dérangent », et le « Duel hommes / femmes ».</span></li>
    </ol>
    <p class="po-actions"><a class="po-btn" href="#reseaux-titre">Choisir ma plateforme pour ce soir</a><a class="po-btn-verre" href="#outil-live">Mon outil de matching en live</a></p>
  </div>
</section>
<section class="po-app outil-live" id="outil-live" aria-labelledby="outil-live-titre">
  <div class="outil-live-tete">
    <img src="/images/lamia/lamia-portrait-tatouages-rond-480.webp" alt="Lamia Femme Berbère" width="120" height="120" loading="lazy">
    <div>
      <p class="po-eyebrow">En direct chaque soir · par Lamia, marieuse kabyle</p>
      <h2 id="outil-live-titre">Mon outil de matching, en live</h2>
      <p>Pendant le live, mon outil de matching est affiché à l’écran, sur toutes les plateformes à la fois. C’est lui qui me sert à présenter les annonces de mariage, à chercher les profils compatibles et à suivre chaque rencontre. Voici comment il marche, et surtout comment naît un match.</p>
    </div>
  </div>
  <div class="patio-etapes">
    <h2>Comment j’utilise l’outil</h2>
    <ol>
      <li><strong>Ta fiche est créée</strong><span>En live comme invité, en message privé ou sur le site, dans les Rencontres. Je note ce qui compte : âge, ville, village d’origine, situation, enfants, études, pratique, valeurs, et la personne que tu cherches.</span></li>
      <li><strong>Je vérifie</strong><span>Caméra en direct, vidéo, photo ou vocal : un profil n’entre dans le matching qu’une fois vérifié. Les profils douteux sont bloqués.</span></li>
      <li><strong>L’annonce passe en live</strong><span>Si tu es d’accord, je présente ton annonce à l’écran, sans ton nom ni tes contacts. Les personnes intéressées se signalent, en live ou dans les Rencontres du site.</span></li>
      <li><strong>Le suivi</strong><span>Chaque fiche a un statut : en attente de match, en match, en stand-by, en couple. Rien ne se perd, et personne n’est proposé à deux personnes en même temps.</span></li>
    </ol>
  </div>
  <div class="patio-etapes">
    <h2>Comment naît un match</h2>
    <ol>
      <li><strong>L’outil compare</strong><span>Il croise ta fiche avec tous les profils en attente : âge souhaité de part et d’autre, secteur recherché, origine, situation, enfants, études, pratique, caractère. Il donne un score de compatibilité.</span></li>
      <li><strong>Trois niveaux</strong><span><b>Prioritaire</b> : score élevé, âge et secteur cohérents, rien à négocier. <b>Prometteur</b> : bon score, aucune condition enfreinte. <b>À explorer</b> : possible, sans blocage, à discuter.</span></li>
      <li><strong>Les blocages sont respectés</strong><span>Ce qui est rédhibitoire pour toi (un divorce, des enfants, une distance…) écarte le profil d’office, même avec un bon score.</span></li>
      <li><strong>Moi, je décide</strong><span>L’outil propose, c’est moi qui valide. Je relis les deux fiches, je vous parle, et je ne propose un match que si j’y crois vraiment.</span></li>
      <li><strong>La mise en relation</strong><span>Si vous êtes d’accord tous les deux, je vous mets en contact. Ton numéro reste chez moi jusque-là. La première mise en relation est offerte, les suivantes avec une <a href="/abonnement/">formule</a>.</span></li>
      <li><strong>Je vous suis</strong><span>Je prends des nouvelles après la rencontre. Si ça ne colle pas, on clôt le match avec respect et ton profil revient en attente pour une nouvelle chance.</span></li>
    </ol>
    <p class="po-actions"><a class="po-btn" href="/rencontres/#confier"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lettre"/></svg> Créer mon profil</a><a class="po-btn-verre" href="/rencontres/#profils-anonymes">Voir les profils anonymes</a></p>
  </div>
</section>
<section class="salon-replays" id="replays" aria-labelledby="replays-titre">
  <h2 id="replays-titre">Revoir les lives et mes vidéos</h2>
  <div class="videos-haut">
  <div class="videos" data-youtube-videos hidden>
    <h2>Mes dernières vidéos YouTube</h2>
    <div class="video-cadre" data-youtube-cadre><button class="btn btn-gold" type="button" data-youtube-charger><svg class="ico" aria-hidden="true"><use href="/icones.svg#play"/></svg> Afficher mes vidéos</button><p class="video-note">En affichant les vidéos, YouTube peut déposer ses propres cookies.</p></div>
  </div>
</div>
  <div class="videos" data-tiktok-videos>
    <h2>Mes vidéos TikTok</h2>
    <div class="video-cadre is-tiktok" data-tiktok-cadre><button class="btn btn-gold" type="button" data-tiktok-charger><svg class="ico" aria-hidden="true"><use href="/icones.svg#play"/></svg> Afficher mes vidéos TikTok</button><p class="video-note">En affichant les vidéos, TikTok peut déposer ses propres cookies.</p></div>
  </div>
</section>
<figure class="banniere-salon">${IMGT('image.salon.banniere', 'Le Salon de Lamia', 'Grande bannière', `<img src="/images/lamia/banniere-lamia-berbere-1672.webp" srcset="/images/lamia/banniere-lamia-berbere-900.webp 900w, /images/lamia/banniere-lamia-berbere-1672.webp 1672w" sizes="(max-width: 1300px) 100vw, 1240px" width="1672" height="941" loading="lazy" alt="Lamia Berbère : humour, société, politique, contradictions du quotidien. Un regard berbère, kabyle, algérien, français et maghrébin.">`)}</figure>
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
    title: 'Bijoux kabyles en argent émaillé d’Ath Yenni · L’Écrin',
    description: 'Bijoux kabyles en argent émaillé et corail, faits main à Ath Yenni par des artisans du village. Collection exclusive de Lamia Femme Berbère.',
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
    title: 'Trouvailles vintage et objets de brocante · Lamia',
    description: 'Les coups de cœur de brocante de Lamia : livres anciennes éditions, bibelots, cadres, sculptures, cartes postales, pièces uniques.',
    path: '/grenier/',
    room: roomBySlug.grenier,
    ogImage: '/images/grenier/grenier-des-trouvailles-1672.webp', ogImageAlt: 'Le Grenier des Trouvailles de Lamia Femme Berbère', ogImageWidth: 1672, ogImageHeight: 941,
    body: `${roomHead(roomBySlug.grenier)}
<figure class="banniere-salon banniere-grenier">${IMGT('image.grenier.banniere', 'Le Grenier', 'Grande image du Grenier', `<img src="/images/grenier/grenier-des-trouvailles-1672.webp" srcset="/images/grenier/grenier-des-trouvailles-900.webp 900w, /images/grenier/grenier-des-trouvailles-1672.webp 1672w" sizes="(max-width: 1300px) 100vw, 1240px" width="1672" height="941" fetchpriority="high" alt="Le Grenier des Trouvailles de Lamia Femme Berbère : platine et caisses de vinyles, livres anciens, bougeoirs, malle et poteries sous les poutres">`)}</figure>
<section class="room-body two-col">
  <div><p class="prose-lead">${esc(P.grenier.intro)}</p></div>
  <aside class="side-note"><h2>Ce qu’on trouve au Grenier</h2>${list(P.grenier.families)}</aside>
</section>
<section class="room-shelf" aria-labelledby="finds-title">
  <h2 id="finds-title">Les trouvailles du moment</h2>
  ${productGrid(roomBySlug.grenier.productCategories, { sold: true, rubriques: true })}
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
    noindex: true,
    body: `<section class="product-page" data-product-page><p class="loading">La pièce arrive…</p></section>`,
  })
);

// Le Boudoir des Rencontres : le speed dating de la Maison (page générale, la première soirée est offerte)
page(
  '/speed-dating/',
  layout({
    title: 'Speed dating kabyle en ligne · Le Bal masqué de Lamia',
    description: 'Speed dating kabyle en visio, deux salons par âge, 20 personnes maximum par salon. Viens masqué·e, Lamia anime la soirée. Inscription toujours ouverte.',
    path: '/speed-dating/',
    room: roomBySlug['speed-dating'],
    scripts: ['/assets/membre.js', '/assets/soirees.js'],
    ogTitle: 'Le speed dating de Lamia Femme Berbère',
    ogDescription: 'Rencontres sérieuses en visio, en deux salons par âge, animées par Lamia. Inscription toujours ouverte, deux salons par âge.',
    ogImage: '/images/lamia/lamia-salon-1122.webp',
    ogImageAlt: 'Lamia Femme Berbère en robe kabyle, dans son salon',
    ogImageWidth: 1122,
    ogImageHeight: 1402,
    body: `<div class="bal boudoir-immersif">
<span class="boudoir-scene" aria-hidden="true"></span>
<span class="boudoir-rideau-fixe boudoir-rideau-gauche" aria-hidden="true"></span>
<span class="boudoir-rideau-fixe boudoir-rideau-droit" aria-hidden="true"></span>
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
      <span>En visio, depuis chez toi</span><span>Deux salons par âge</span><span>20 personnes max par salon</span><span>Lamia veille</span>
    </div>
    <p class="bal-actions"><a class="btn btn-gold" href="/speed-dating/inscription/">M’inscrire à un salon</a><a class="btn bal-btn-line" href="/speed-dating/salle/">Tester ma caméra</a></p>
  </div>
</section>

<div class="boudoir-plateau">
<section class="lancement" aria-labelledby="lancement-title">
  <figure class="lancement-image">
    ${IMGT('image.speed.lancement', 'Le Boudoir des Rencontres', 'Image du thème des soirées', `<img src="/images/lamia/lamia-salon-1122.webp" srcset="/images/lamia/lamia-salon-560.webp 560w, /images/lamia/lamia-salon-900.webp 900w, /images/lamia/lamia-salon-1122.webp 1122w" sizes="(max-width: 860px) 100vw, 560px" width="1122" height="1402" alt="Lamia en robe kabyle, dans son salon" loading="lazy">`)}
  </figure>
  <div class="lancement-texte">
    <p class="bal-kicker">Le thème de toutes nos soirées</p>
    <h2 id="lancement-title">${esc(T('speed.lancement-titre', 'Le Boudoir des Rencontres', 'Thème des soirées : titre', 'Le Bal masqué Virtuel Kabyle'))}</h2>
    <p>Chaque soirée du Boudoir est un <strong>bal masqué virtuel kabyle</strong>, en visio, depuis chez toi. Viens masqué·e, en robe kabyle, avec tes bijoux ou dans ta plus belle tenue : le mystère fait partie du jeu, et le démasquage vient à la fin.</p>
    <p><a class="btn btn-gold" href="#events-title">Réserver ma place</a></p>
  </div>
</section>

<section class="salons-accueil" aria-labelledby="events-title">
  <p class="bal-kicker">L’inscription est toujours ouverte</p>
  <h2 id="events-title">Choisis ton salon</h2>
  <p class="salons-gratuit" data-salons-gratuit hidden>La prochaine soirée est gratuite</p>
  <p>Deux salons, plusieurs secteurs de recherche. Quand assez de femmes et d’hommes sont inscrits dans un même secteur, le salon est confirmé et tu es prévenu·e.</p>
  <div class="salons-deux">
    <a class="salons-carte" href="/speed-dating/inscription/?salon=20-39"><span><strong>Salon 20-39 ans</strong><small>Je m’inscris</small></span></a>
    <a class="salons-carte" href="/speed-dating/inscription/?salon=40%2B"><span><strong>Salon 40 ans et plus</strong><small>Je m’inscris</small></span></a>
  </div>
  <div class="salons-confirmes" data-salons-confirmes hidden></div>
</section>
</div>
<section class="bal-deroule" aria-labelledby="deroule-title">
  <h2 id="deroule-title">Comment se passe une soirée</h2>
  <ol>
    <li><strong>Tu choisis</strong><span>Avec ton profil validé, tu choisis ton salon, puis les secteurs où tu cherches. Cela prend une minute.</span></li>
    <li><strong>Ton salon est confirmé</strong><span>Dès qu’il y a assez de femmes et d’hommes dans un secteur, Lamia fixe la date et tu es prévenu·e. Tu reçois aussi un rappel le jour même, une heure avant, puis au démarrage.</span></li>
    <li><strong>Tu entres dans le grand salon</strong><span>À l’heure dite, Lamia accueille tout le monde et ouvre la soirée.</span></li>
    <li><strong>Tu fais connaissance</strong><span>Des tête-à-tête de quelques minutes, au son d’une cloche. Les cavaliers rencontrés s’inscrivent dans ton carnet de bal.</span></li>
    <li><strong>Tu choisis qui revoir</strong><span>En privé, dans ton carnet. Si le souhait est réciproque, Lamia vous présente.</span></li>
  </ol>
</section>

<section class="bal-code" aria-labelledby="salons-title">
  <h2 id="salons-title">Deux salons, en deux tranches d’âge</h2>
  <ul>
    <li><strong>Salon 20-39 ans</strong></li>
    <li><strong>Salon 40 ans et plus</strong></li>
  </ul>
  <p class="bal-note">Toutes les zones sont réunies : Algérie, France, Europe, Canada et ailleurs. Ton salon est choisi automatiquement d’après ta date de naissance, avec 20 personnes au maximum par salon, pour garder des échanges de qualité.</p>
</section>

<section class="bal-code" aria-labelledby="code-title">
  <h2 id="code-title">Un cadre chaleureux et respectueux</h2>
  <ul>
    <li><strong>Des rencontres sérieuses</strong> : on vient pour se parler vraiment, en face à face.</li>
    <li><strong>Caméra allumée</strong>, dans un endroit calme, et aucun propos déplacé.</li>
    <li><strong>Lamia veille</strong> : l’accueil, l’animation et le suivi de chaque soirée. Elle peut passer saluer un tête-à-tête pendant le bal : son nom s’affiche quand elle entre.</li>
    <li><strong>Une ambiance</strong> : chaque soirée est un bal masqué virtuel kabyle : masque, robe kabyle ou tenue élégante.</li>
    <li><strong>Un souci ?</strong> <a href="/confidences/">Les Confidences avec Lamia</a> permettent de lui écrire ou de lui signaler un souci en toute discrétion.</li>
  </ul>
</section>

<section class="member-panel bal-espace" aria-labelledby="member-title">
  <h2 id="member-title">Le soir de la soirée</h2>
  <p><a class="text-link" href="/speed-dating/inscription/">Inscris-toi à un salon</a> avec ton profil validé, puis le soir venu, entre par la porte de la salle avec ton email et ta date de naissance. À la fin, ton <strong>carnet de bal</strong> te permet d’indiquer, en privé, qui tu aimerais revoir.</p>
  <p class="bal-actions"><a class="btn btn-gold" href="/speed-dating/bal/">Entrer dans la salle</a><a class="btn bal-btn-line" href="/speed-dating/salle/">Tester ma caméra</a><a class="btn bal-btn-line" href="/mon-espace/">Mon espace</a></p>
</section>
<section class="origin">
  <blockquote>« ${esc(P.speedDating.promise)} »<cite>Lamia</cite></blockquote>
  <p>${esc(P.speedDating.origin)}</p>
</section>
</div>`,
  })
);

// Pages par pays et guides (content/guides.mjs)
for (const g of GUIDES) {
  page(g.path, layout({
    title: g.title[0], description: g.description[0], path: g.path, room: roomBySlug[g.room],
    body: `<article class="article">
  <p class="room-name"><span class="pip" aria-hidden="true"></span>${esc(g.kicker[0])}</p>
  <h1>${esc(g.h1[0])}</h1>
  <p class="prose-lead">${esc(g.lead[0])}</p>
  ${g.sections.map(([h, ps]) => `<h2>${esc(h[0])}</h2>${ps.map((p) => `<p>${esc(p[0])}</p>`).join('')}`).join('\n  ')}
  <p class="article-links">${g.liens.map((l, i) => `<a class="btn ${i ? 'btn-line' : 'btn-ink'}" href="${esc(l[1])}">${esc(l[0])}</a>`).join('')}</p>
  ${g.sourcesLiens.length ? `<h2>Sources</h2><ul>${g.sourcesLiens.map(([t, u]) => `<li><a href="${esc(u)}" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>` : ''}
</article>`,
  }));
}

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
      <form class="espace-card espace-card-vedette" data-espace-reset>
        <h2>Me connecter sans mot de passe</h2>
        <p>Reçois un lien par email : un clic et tu es dans ton espace. Ça marche aussi si tu as oublié ton mot de passe.</p>
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <button class="btn btn-ink" type="submit">Recevoir mon lien de connexion</button>
        <p class="form-status" role="status" data-reset-status></p>
      </form>
      <p class="espace-card" data-moderateur-avis hidden><svg class="ico" aria-hidden="true"><use href="/icones.svg#shield"/></svg> Lamia te propose un compte modérateur. Crée ton accès ou connecte-toi ci-dessous, puis confirme.</p>
      <form class="espace-card" data-espace-login>
        <h2>J’ai un mot de passe</h2>
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn btn-line" type="submit">Me connecter</button>
        <p class="form-status" role="status" data-espace-status></p>
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
    <p class="lfb-azul" lang="ber">ⴰⵣⵓⵍ</p>
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
    <details class="espace-mdp espace-supprimer">
      <summary>Supprimer mon compte</summary>
      <form data-espace-supprimer>
        <p>Ton profil, tes photos, tes demandes, tes discussions et tes notifications sont effacés pour de bon, et Lamia est prévenue pour effacer ta fiche de son outil. Tes factures sont gardées, comme la loi l’exige. Si tu as un abonnement, résilie-le d’abord (bloc « Mon abonnement »).</p>
        <label>Écris SUPPRIMER pour confirmer<input name="confirmation" autocomplete="off" required></label>
        <button class="btn btn-line" type="submit">Supprimer définitivement mon compte</button>
        <p class="form-status" role="status" data-supprimer-status></p>
      </form>
    </details>

    <section class="espace-admin" data-espace-admin hidden>
      <h2>Espace administratrice</h2>
      <div class="espace-liens">
        <a href="/tableau-de-bord"><strong>Ma tour de contrôle</strong><span>Tout gérer : à faire, comptes, rencontres, ventes, textes</span></a>
        <a href="/admin-soirees/"><strong>Mes soirées et précommandes</strong><span>Inscrits, salons, précommandes du livre et du collier</span></a>
        <a href="/admin-bal.html"><strong>Maîtresse du bal</strong><span>Ouvrir les portes, lancer les tours, souhaits réciproques</span></a>
        <a href="/confidences-lamia/"><strong>Confidences</strong><span>Lire et répondre, vocaux, notifications</span></a>
        <a href="/admin.html"><strong>Signalements</strong><span>Profils signalés, écrits et audio</span></a>
        <a href="/pilotage.html"><strong>Pilotage</strong><span>Feuille de route et indicateurs</span></a>
      </div>
      <p class="espace-admin-note">Ce compte sert à gérer la Maison. Pour essayer l’application comme un membre, connecte-toi avec un compte de test.</p>
    </section>

    <section id="mon-profil">
      <h2>Mon profil âme sœur</h2>
      <p><button type="button" class="btn btn-line btn-installer" data-installer-bouton><svg class="ico" aria-hidden="true"><use href="/icones.svg#smartphone"/></svg> Installer l’application sur mon téléphone</button></p>
      <div class="espace-notifs" data-espace-notifs></div>
      <div class="espace-profil" data-espace-profil><p class="loading">Un instant…</p></div>
      <div class="espace-profil" id="mes-fiches" data-espace-fiches></div>
    </section>

    <section id="discussion" data-espace-discussion-bloc hidden>
      <h2>Mes matchs en cours</h2>
      <p>Vos matchs réciproques : vous avez 7 jours pour faire connaissance ici, en privé. Quand vous êtes prêts, échangez vos numéros pour passer au téléphone. Lamia ne lit pas vos messages, sauf si l’un de vous la signale.</p>
      <div class="espace-profil" id="moderateur" data-espace-moderateur hidden></div>
      <div class="espace-profil" id="beta" data-espace-beta hidden></div>
      <div class="espace-profil" data-espace-blocages hidden><h3>Profils bloqués</h3><ul data-blocages-liste></ul></div>
      <p class="parcours-livre"><svg class="ico" aria-hidden="true"><use href="/icones.svg#gem"/></svg> Vous suivez le parcours de mariage de Lamia, détaillé dans l’ebook <a class="text-link" href="/werdi-ouvre-les-yeux/"><em>Werdi, ouvre les yeux !</em></a></p>
      <div data-espace-discussion></div>
    </section>

    <section id="coaching" data-espace-coaching-bloc hidden>
      <h2>Mon coaching avec Lamia</h2>
      <p data-coaching-intro>Une visio de 15 minutes avec Lamia, pour ton profil et tes rencontres. Elle n’est jamais enregistrée.</p>
      <div class="espace-profil" data-espace-coaching></div>
    </section>

    <section id="speed-dating">
      <h2>Mon speed dating</h2>
      <div id="salons" data-espace-salon><p class="loading">Un instant…</p></div>
      <div data-espace-soirees-bloc hidden>
        <h3>Mes soirées réservées</h3>
        <div class="espace-soirees" data-espace-soirees></div>
      </div>
      <div data-espace-passees-bloc hidden>
        <h3>Mes soirées passées</h3>
        <div class="espace-soirees" data-espace-passees></div>
      </div>
      <div class="espace-liens is-light">
        <a href="/speed-dating/salle/"><strong>Tester ma caméra</strong><span>Avant la soirée</span></a>
        <a href="/speed-dating/bal/"><strong>Entrer dans la salle</strong><span>Le soir de la soirée</span></a>
        <a href="/speed-dating/souhaits/"><strong>Mon carnet de bal</strong><span>Qui aimerais-tu revoir ?</span></a>
      </div>
    </section>

    <section id="propositions">
      <h2>Profils proposés par Lamia</h2>
      <p>Lamia a choisi pour toi des profils qui te correspondent, selon son algorithme. Leur fiche est anonyme. Dis oui ou non : <strong>si l’autre personne dit oui aussi, vous êtes mis en relation tout de suite</strong>, avec une discussion privée de 7 jours.</p>
      <p><a class="btn btn-line" href="/confidences/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> Contacter Lamia</a></p>
      <div class="espace-interets" data-espace-propositions><p class="loading">Un instant…</p></div>
    </section>
    <section id="interets">
      <h2>Intérêts reçus</h2>
      <p>Les personnes qui ont dit que ton profil les intéresse. Leur fiche est anonyme, comme sur le site. Si l’une t’intéresse aussi, c’est réciproque : Lamia vous met en relation.</p>
      <div class="espace-interets" data-espace-interets><p class="loading">Un instant…</p></div>
    </section>

    <section>
      <h2>Mon abonnement âme sœur</h2>
      <div class="espace-achats" data-espace-abonnement><p class="loading">Un instant…</p></div>
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

    <section id="demasquage" data-espace-demasquage-section hidden>
      <h2><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Mes démasquages</h2>
      <p class="espace-note">Tu as choisi quelqu’un au bal, et cette personne t’a choisi·e aussi. Veux-tu te démasquer ? Ta réponse reste privée : si vous dites oui tous les deux, Lamia vous met en relation.</p>
      <div class="espace-soirees" data-espace-demasquage></div>
    </section>

    <div class="espace-liens is-light">
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
    title: 'La salle du Bal masqué Virtuel Kabyle',
    description: 'Entre dans la salle du Bal masqué Virtuel Kabyle : grand salon, tête-à-tête masqués et souhaits de fin de bal.',
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
    <p class="bal-kicker">Le Bal masqué Virtuel Kabyle</p>
    <h1>La porte du bal</h1>
    <p class="bal-lead">Entre avec l’email et la date de naissance donnés à ton inscription.</p>
  </div>
  <form class="bal-porte" data-bal-entree>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Date de naissance<input name="birth_date" type="date" required></label>
    <button class="btn btn-gold" type="submit">Pousser la porte</button>
    <p class="form-status" role="status" data-entree-status></p>
    <p class="bal-petit">Pas encore inscrit·e ? <a class="text-link" href="/speed-dating/inscription/">Inscris-toi à un salon</a>. Un souci de caméra ? <a class="text-link" href="/speed-dating/salle/">Passe par l’antichambre</a>.</p>
  </form>
</section>

<section class="bal-step" data-step="pret" hidden>
  <div class="bal-hero is-short">
    <p class="bal-kicker" data-pret-salon></p><p class="salon-phrase" data-salon-phrase hidden></p>
    <h1>Bonsoir <span data-pret-nom></span></h1>
  </div>
  <div class="ante">
    <div class="ante-miroir"><video data-pret-video playsinline muted autoplay></video><span class="ante-cadre" aria-hidden="true"></span></div>
    <div class="ante-panneau">
      <p class="ante-msg" data-pret-msg>Tu entres d’abord au salon d’attente, caméra et micro éteints.</p>
      <button class="btn btn-gold" type="button" data-entrer>Entrer au salon d’attente</button>
      <button class="btn bal-btn-line" type="button" data-tester aria-pressed="false">Tester ma caméra</button>
      <button class="btn bal-btn-line" type="button" data-sortir>Ce n’est pas moi</button>
    </div>
  </div>
</section>

<section class="bal-step salle" data-step="salle" data-salle hidden>
  <div class="planb" data-planb hidden role="alert"><p><strong>La salle a un souci ?</strong> Lamia a ouvert une salle de secours.</p><a class="btn btn-gold" data-planb-lien target="_blank" rel="noopener">Rejoindre la salle de secours</a></div>
  <div class="transition" data-transition hidden aria-live="polite"><div><svg viewBox="0 0 64 32" width="120" height="60" aria-hidden="true"><path d="M2 8c10-6 20-4 30 4C42 4 52 2 62 8c0 12-8 20-18 20-6 0-9-4-12-8-3 4-6 8-12 8C10 28 2 20 2 8Z" fill="#F3E0B9" stroke="#fff6dc" stroke-width="1.2"/><ellipse cx="19" cy="15" rx="6" ry="4" fill="#120d1a"/><ellipse cx="45" cy="15" rx="6" ry="4" fill="#120d1a"/></svg><p class="transition-titre" data-transition-titre>Le prochain masque vous invite…</p><p class="transition-nom" data-transition-nom></p></div></div>
  <header class="salle-haut">
    <div><p class="bal-kicker"><span data-salle-salon></span> <span data-salle-tour></span></p><h1 data-salle-titre>Le grand salon</h1><p class="salon-phrase" data-salon-phrase hidden></p></div>
    <p class="salle-temps" data-salle-temps aria-live="off"></p>
  </header>
  <div class="salle-scene">
    <figure class="salle-autre"><div class="salle-accueil" data-salle-accueil style="--accueil:url('${esc(imgOr('salle-accueil', '/images/lamia/lamia-salon-1122.webp'))}')" role="img" aria-label="Lamia vous accueille au Bal masqué Virtuel Kabyle"><p>« ${esc(P.speedDating.salleAccueil)} »<span>Lamia</span></p></div><video data-video-autre playsinline autoplay></video><img class="salle-logo" src="/images/marque/lamia-logo-net-160.webp" alt="" width="64" height="64"><figcaption data-autre-nom>Lamia arrive…</figcaption><span class="salle-cadre" aria-hidden="true"></span></figure>
    <figure class="salle-moi"><video data-video-moi playsinline autoplay muted></video><figcaption>Toi</figcaption></figure>
    <audio data-audio-autre autoplay></audio>
  </div>
  <p class="salle-msg" role="status" data-salle-msg></p>
  <p class="salle-demasque" data-demasque hidden>Dernier tête-à-tête : le moment du démasquage. Retire ton masque si tu le souhaites.</p>
  <div class="salle-reciproque" data-reciproque hidden>
    <p class="salle-reciproque-titre"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Vous vous êtes choisis tous les deux</p>
    <p>Après ce tête-à-tête sans masque, veux-tu te démasquer pour de bon, et que Lamia vous mette en relation ? Ta réponse reste privée.</p>
    <p class="bal-actions" data-reciproque-boutons><button class="btn btn-gold" type="button" data-reciproque-rep="oui">Oui, je me démasque</button><button class="btn bal-btn-line" type="button" data-reciproque-rep="non">Pas cette fois</button></p>
    <p class="salle-reciproque-ok" data-reciproque-ok hidden></p>
  </div>
  <p class="salle-compte" data-salle-compte></p>
  <div class="tchat" data-tchat hidden>
    <button class="tchat-bulle" type="button" data-tchat-ouvrir aria-expanded="false"><svg class="ico" aria-hidden="true"><use href="/icones.svg#message-circle"/></svg> Écrire à Lamia <b data-tchat-nouveau hidden>•</b></button>
    <div class="tchat-panneau" data-tchat-panneau hidden>
      <ol class="tchat-fil" data-tchat-fil aria-live="polite"><li class="tchat-vide">Lamia peut t’écrire ici. Ta réponse n’est lue que par elle.</li></ol>
      <form class="tchat-form" data-tchat-form><input name="t" maxlength="300" autocomplete="off" placeholder="Ta réponse à Lamia…" aria-label="Message à Lamia"><button class="btn btn-gold" type="submit">Envoyer</button></form>
    </div>
  </div>
  <aside class="carnet" data-carnet aria-label="Mon carnet de bal"><h2>Mon carnet de bal</h2><ol data-carnet-liste><li class="carnet-vide">Tes cavaliers s’inscriront ici au fil des tours.</li></ol></aside>
  <div class="salle-boutons">
    <button class="btn bal-btn-line" type="button" data-micro aria-pressed="false">Micro</button>
    <button class="btn bal-btn-line" type="button" data-camera aria-pressed="false">Caméra</button>
    <label class="btn bal-btn-line decor-choix" data-decor-choix hidden>Mon décor<select data-decor aria-label="Choisir mon décor">
      <option value="aucun">Ma pièce</option>
      <option value="flou">Pièce floutée</option>
      <option value="petillant">Salon Pétillant</option>
      <option value="ambre">Salon de l’Ambre</option>
    </select></label>
    <button class="btn bal-btn-line" type="button" data-musique aria-pressed="true">Musique douce</button>
    <a class="btn bal-btn-line" href="/confidences/#signaler" target="_blank" rel="noopener">Signaler à Lamia</a>
    <button class="btn bal-btn-line" type="button" data-quitter>Quitter le bal</button>
  </div>
  <p class="decor-conseil" data-decor-conseil hidden>Astuce : installe-toi devant un mur uni, avec une lumière face à toi. Ton masque fera le reste.</p>
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
<section class="bal-step" data-step="autre" hidden>
  <div class="bal-hero is-short"><h1>Tu es entré·e ailleurs</h1><p class="bal-lead">Ton compte vient d’entrer au bal sur un autre appareil ou un autre onglet. Une seule connexion par personne : celle-ci est fermée.</p><p class="bal-actions"><button class="btn btn-gold" type="button" onclick="location.reload()">Revenir ici à la place</button></p></div>
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
    description: 'Avant le Bal masqué Virtuel Kabyle, vérifie ta caméra et ton micro. Ta vidéo reste sur ton appareil.',
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
  <p class="bal-kicker">Le Bal masqué Virtuel Kabyle</p>
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

// Le lien d'inscription aux soirées : toujours actif.
page(
  '/speed-dating/inscription/',
  layout({
    title: 'S’inscrire à un salon · Le Boudoir des Rencontres',
    description: 'Inscris-toi aux soirées de speed dating de Lamia : deux salons par âge, plusieurs secteurs de recherche, autant de femmes que d’hommes.',
    path: '/speed-dating/inscription/',
    room: roomBySlug['speed-dating'],
    scripts: ['/assets/soirees.js'],
    body: `<div class="bal"><section class="salons">
  <p class="bal-kicker">Le Boudoir des Rencontres</p>
  <h1>Choisis ton salon</h1>
  <p class="salons-gratuit" data-salons-gratuit hidden>La prochaine soirée est gratuite</p>
  <p>L’inscription est ouverte en permanence. Dès que ${'6'} femmes et ${'6'} hommes attendent dans un même secteur, Lamia confirme le salon et fixe la date.</p>
  <p class="salons-aide" data-salon-chargement>Un instant…</p>
  <div class="salons-merci" data-salon-sans-compte hidden>
    <h2>Il te faut un profil validé</h2>
    <p>Pour t’inscrire à une soirée, crée ton profil, ou connecte-toi si tu en as déjà un. Cela garantit que chacun sait à qui il parle.</p>
    <p class="bal-actions"><a class="btn btn-gold" href="/rencontres/#confier">Créer mon profil</a><a class="btn bal-btn-line" href="/mon-espace/">Me connecter</a></p>
  </div>
  <div class="salons-merci" data-salon-sans-profil hidden>
    <h2>Il te manque ton profil</h2>
    <p data-salon-sans-profil-texte>Pour t’inscrire à une soirée, crée d’abord ton profil. Tu reviendras ensuite ici choisir ton salon.</p>
    <p class="bal-actions"><a class="btn btn-gold" href="/rencontres/#confier">Créer mon profil</a><a class="btn bal-btn-line" href="/mon-espace/">Mon espace</a></p>
  </div>
  <form data-salon-form novalidate hidden>
    <fieldset class="salons-etape"><legend>1. Ton salon</legend>
      <div class="salons-deux">
        <label class="salons-carte"><input type="radio" name="salon" value="20-39"><span><strong>Salon 20-39 ans</strong><small>Pour celles et ceux qui préfèrent ce salon</small></span></label>
        <label class="salons-carte"><input type="radio" name="salon" value="40+"><span><strong>Salon 40 ans et plus</strong><small>Pour celles et ceux qui préfèrent ce salon</small></span></label>
      </div>
    </fieldset>
    <fieldset class="salons-etape"><legend>2. Les secteurs où tu cherches</legend>
      <p class="salons-aide">Plusieurs choix possibles : plus tu en coches, plus vite tu trouves un salon.</p>
      <div class="salons-options" data-salon-options><p class="salons-aide">Choisis d’abord ton salon.</p></div>
    </fieldset>
    <fieldset class="salons-etape" data-salon-autre hidden><legend>3. L’autre tranche d’âge</legend>
      <label class="salons-option"><input type="checkbox" name="accepte_autre"><span><strong data-salon-autre-titre></strong><small data-salon-autre-aide></small></span></label>
    </fieldset>
    <label class="salons-accord"><input name="rules" type="checkbox" required><span>Je viens pour une rencontre sérieuse, caméra allumée, et j’accepte le cadre de la soirée et les <a class="text-link" href="/conditions-utilisation/">conditions d’utilisation</a>.</span></label>
    <button class="btn btn-gold" type="submit">M’inscrire au salon</button>
    <p class="salons-statut" role="status" data-salon-status></p>
  </form>
  <div class="salons-merci" data-salon-merci hidden>
    <h2>Tu es inscrit·e</h2>
    <p>Tu n’as rien à payer pour l’instant. Tu recevras un message quand ton salon sera confirmé, puis un rappel le jour de la soirée, une heure avant et au démarrage. Tout se retrouve dans <a class="text-link" href="/mon-espace/#speed-dating">Mon speed dating</a>.</p>
    <p>Pour recevoir aussi ces messages sur ton téléphone, active les notifications dans <a class="text-link" href="/mon-espace/">Mon espace</a>.</p>
  </div>
</section></div>`,
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
  <button type="button" class="conf-carte" data-choix="parler" aria-expanded="false"><span class="conf-icone" aria-hidden="true"><svg class="ico" aria-hidden="true"><use href="/icones.svg#mic"/></svg></span><strong>Je préfère parler</strong><small>Un message vocal, enregistré ici même.</small></button>
  <button type="button" class="conf-carte" data-choix="conversation" aria-expanded="false"><span class="conf-icone" aria-hidden="true">❦</span><strong>Échanger avec Lamia</strong><small>Une conversation privée, que tu retrouves quand tu veux.</small></button>
  <button type="button" class="conf-carte" data-choix="annonce" aria-expanded="false"><span class="conf-icone" aria-hidden="true"><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg></span><strong>Trouver mon âme sœur</strong><small>Ton profil, confié à Lamia et à son outil de matching.</small></button>
</section>

<section class="conf-panneau" data-panneau="annonce" id="annonce" hidden>
  <div class="conf-form">
    <h2>Trouver mon âme sœur avec Lamia</h2>
    <p>Tu cherches quelqu’un de sérieux pour construire ta vie ? Présente-toi avec ton cœur et dis qui tu aimerais rencontrer. Ton profil n’est jamais publié : Lamia le vérifie, le passe dans son outil de matching et te dit avec combien de personnes tu pourrais correspondre. Pour les découvrir, tu lui écris. La première mise en relation est offerte.</p>
    <div data-annonce-box></div>
  </div>
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
        <label class="conf-btn conf-petit"><svg class="ico" aria-hidden="true"><use href="/icones.svg#image"/></svg> Image<input type="file" accept="image/*" multiple data-conv-images hidden></label>
        <button class="conf-btn conf-petit" type="button" data-conv-vocal-ouvrir><svg class="ico" aria-hidden="true"><use href="/icones.svg#mic"/></svg> Vocal</button>
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
<meta name="theme-color" content="#1B1A18">
<link rel="manifest" href="/confidences-lamia.webmanifest">
<link rel="icon" href="/images/marque/confidences-icone-192.png" type="image/png">
<link rel="apple-touch-icon" href="/images/marque/confidences-icone-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Confidences">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="stylesheet" href="/fonts/polices.css">
<link rel="stylesheet" href="/assets/confidences-lamia.css?v=${VERSION}">
</head>
<body class="cl">
<header class="cl-haut">
  <button class="cl-retour" type="button" data-retour hidden aria-label="Retour à la liste">‹</button>
  <a class="cl-logo" href="/" aria-label="Retour à l’accueil du site"><img src="/images/marque/lamia-logo-net-160.webp" width="36" height="36" alt=""></a>
  <h1>Confidences <span data-total></span></h1>
  <button class="cl-icone" type="button" data-ouvrir-reglages aria-label="Réglages des alertes"><svg class="ico" aria-hidden="true"><use href="/icones.svg#settings"/></svg>︎</button>
</header>
<nav class="cl-nav" aria-label="Navigation">
  <a href="/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#house"/></svg> Accueil du site</a>
  <a href="/tableau-de-bord"><svg class="ico" aria-hidden="true"><use href="/icones.svg#chart-column"/></svg> Tableau de bord</a>
  <a href="/rencontres/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Rencontres</a>
  <a href="/mon-espace/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#user"/></svg> Mon espace</a>
</nav>

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
      <button type="button" data-ouvrir-annonces><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> Annonces <b data-n-annonces></b></button>
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
        <label class="cl-btn cl-petit"><svg class="ico" aria-hidden="true"><use href="/icones.svg#image"/></svg> Image<input type="file" accept="image/*" multiple data-images hidden></label>
        <button class="cl-btn cl-petit" type="button" data-ouvrir-vocal><svg class="ico" aria-hidden="true"><use href="/icones.svg#mic"/></svg> Vocal</button>
        <button class="cl-btn cl-plein" type="submit">Envoyer</button>
      </div>
      <p class="cl-statut" data-rep-statut role="status"></p>
    </form>
    <p class="cl-bas"><button type="button" class="cl-lien" data-supprimer>Supprimer cette conversation</button> (à la demande de la personne)</p>
  </section>

  <section class="cl-reglages" data-annonces-vue hidden>
    <h2>Annonces de rencontre</h2>
    <p class="cl-aide">Les profils ne sont jamais publiés. 1) Vérifie le profil (et la pièce d’identité si la personne l’a donnée : elle est facultative), puis « Valider » : la pièce est supprimée, et le profil garde le badge « vérifié avec pièce d’identité ». 2) Exporte vers ton outil et fais le matching. 3) Indique le nombre de profils compatibles et « Envoyer le résultat » : la personne reçoit ce nombre par email (sans savoir qui), avec l’invitation à t’écrire (première mise en relation offerte, ensuite abonnement).</p>
        <div class="cl-carte cl-export">
      <h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#camera"/></svg> Profils sans leurs photos <span data-n-sans-photos></span></h3>
      <p class="cl-aide">Tant qu’il manque 2 photos, la personne voit une demande dans l’application et ne peut ni swiper ni répondre. Le bouton lui envoie aussi une notification sur son téléphone, une seule fois, si elle les a activées.</p>
      <button class="cl-btn cl-plein" type="button" data-relance-medias>Envoyer la notification</button>
      <p class="cl-statut" data-relance-statut></p>
    </div>
        <div class="cl-carte cl-export">
      <h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#credit-card"/></svg> Abonnés et achats à l’unité <span data-n-abonnes></span></h3>
      <p class="cl-aide">Les formules payées sur la page Abonnement. Quand tu fais une mise en relation ou inscris quelqu’un à un speed dating payé à l’unité, clique « Utiliser 1 » pour le décompter. Les résiliations se font par la personne depuis son espace.</p>
      <div data-abonnes></div>
    </div>
    <div class="cl-carte cl-export">
      <h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> Matchs demandés <span data-n-demandes></span></h3>
      <p class="cl-aide">Quand quelqu’un clique sur « Ce profil m’intéresse » ou swipe un profil à droite, la demande arrive ici. Quand deux personnes se choisissent l’une l’autre, la demande passe en tête avec « INTÉRÊT RÉCIPROQUE » et tu reçois une alerte (notification et email). Les demandes sont regroupées par personne et notées sur 100 selon leur potentiel (âge, religion, pratique, origine, enfants, situation, tabac, pays, dans les deux sens) : fais la mise en relation avec le meilleur potentiel, puis confirme dans ton outil. Personne d’autre ne la voit. Elle est aussi notée dans la fiche exportée vers ton outil.</p>
      <div data-demandes></div>
    </div>
    <div class="cl-carte cl-export">
      <h3>↪ Vers mon outil de matching</h3>
      <p class="cl-aide">Les réponses du formulaire suivent exactement les champs de ton outil. Télécharge le fichier, puis dans l’outil : la liste des profils, bouton « Import CSV/JSON », et choisis ce fichier. Les profils déjà importés ne sont pas dupliqués.</p>
      <p class="cl-aide" data-export-info></p>
      <div class="cl-outils"><button class="cl-btn cl-plein" type="button" data-exporter-nouvelles>Exporter les nouvelles annonces</button><button class="cl-btn" type="button" data-exporter-toutes>Tout réexporter</button></div>
      <p class="cl-statut" role="status" data-export-statut></p>
    </div>
    <details class="cl-carte cl-export cl-nouveautes cl-replie">
      <summary><h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#megaphone"/></svg> Annoncer aux membres (actu, live…) <span data-n-nouv></span></h3></summary>
      <p class="cl-aide">Les produits mis en vente s’ajoutent tout seuls et partent en notification chaque soir à 18 h (regroupés). Pour un article, une actu ou un live, écris-le ici : il part tout de suite, avec sa couleur, chez les membres qui ont activé les notifications.</p>
      <form class="cl-nouv-form" data-nouv-form>
        <label>Type<select name="type"><option value="actu">Actu (vert)</option><option value="article">Article (bleu)</option><option value="live">Live (rouge)</option><option value="boutique">Boutique (doré)</option></select></label>
        <label>Titre<input name="titre" maxlength="140" required placeholder="Ce soir à 21 h : live spécial mariage"></label>
        <label>Texte <small>(facultatif)</small><textarea name="texte" maxlength="600" rows="2"></textarea></label>
        <label>Lien <small>(facultatif, ex. /salon/ ou /produit/…)</small><input name="lien" maxlength="300" placeholder="/salon/"></label>
        <label class="cl-case"><input type="checkbox" name="envoyer" checked> Envoyer la notification maintenant</label>
        <button class="cl-btn cl-plein" type="submit">Publier</button>
        <p class="cl-statut" data-nouv-statut></p>
      </form>
      <div data-nouv-liste></div>
    </details>
    <details class="cl-carte cl-export cl-replie">
      <summary><h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#link"/></svg> Clé de liaison avec mon outil</h3></summary>
      <p class="cl-aide">Ton outil récupère tout seul les profils validés et les matchs demandés grâce à une clé secrète. Crée la clé une fois, colle-la dans l’écran « Le site » de ton outil. Si tu crées une nouvelle clé, l’ancienne ne marche plus.</p>
      <div class="cl-outils"><button class="cl-btn cl-plein" type="button" data-outil-cle>Créer une clé de liaison</button></div>
      <div data-outil-zone hidden><input data-outil-valeur readonly style="width:100%;font-family:monospace"> <button class="cl-btn" type="button" data-outil-copier>Copier</button></div>
      <p class="cl-statut" role="status" data-outil-statut></p>
    </details>
    <div data-annonces></div>
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
  '/rencontres/',
  layout({
    title: 'Profils kabyles vérifiés · Les Rencontres de Lamia',
    description: 'Parcours les profils kabyles vérifiés par Lamia, de façon anonyme. France, Algérie, Canada, Europe. Tu choisis, elle vous présente.',
    path: '/rencontres/',
    room: roomBySlug.patio,
    scripts: ['/assets/annonces.js'],
    body: `<div class="po-app">
<section class="po-hero" aria-labelledby="po-titre">
  <div class="po-fond" aria-hidden="true"></div>
  <div class="po-hero-grid">
    <div class="po-hero-texte">
      <p class="po-eyebrow">Les Rencontres de Lamia</p>
      <h1 id="po-titre">Profils kabyles vérifiés : comment ça marche</h1>
      <p class="po-sub">Tu crées ton profil, Lamia vérifie, cherche et vous présente.</p>
      <p class="po-actions"><button type="button" class="po-btn" data-annonce-ouvrir data-cta-profil aria-expanded="false"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lettre"/></svg> <span>Créer mon profil ou connexion</span></button><a class="po-btn-verre" href="#profils-anonymes">Voir les profils</a></p>
    </div>
    <figure class="po-lamia">
      <img src="/images/lamia/lamia-portrait-tatouages-rond-480.webp" alt="Lamia Femme Berbère, marieuse kabyle" width="240" height="240">
      <figcaption>Lamia · ta marieuse</figcaption>
    </figure>
  </div>
</section>
<section class="room-body patio-body po-corps">
  <div class="annonce-retrait" data-annonce-retrait hidden></div>
  <div class="annonce-box" id="confier" data-annonce-box hidden></div>
  <div class="patio-etapes po-panel" id="annonces">
    <h2>Comment ça marche</h2>
    <ol>
      <li><strong>Tu crées ton profil</strong><span>En 5 minutes : qui tu es, qui tu cherches, 2 photos. Ton identité n’est jamais publiée.</span></li>
      <li><strong>Lamia vérifie</strong><span>Elle vérifie ton profil. Son outil compare les profils, et c’est elle qui choisit. Ta pièce d’identité est facultative : si tu la donnes, ton profil porte le badge renforcé.</span></li>
      <li><strong>Tu sais combien te correspondent</strong><span>Lamia te dit avec combien de personnes tu pourrais correspondre. Personne ne sait qui matche avec qui.</span></li>
      <li><strong>Lamia vous présente</strong><span>Si vous êtes d’accord tous les deux, elle vous met en contact. Ton numéro reste chez elle jusque-là. La première fois, c’est offert.</span></li>
    </ol>
    <p class="po-actions"><button type="button" class="po-btn" data-annonce-ouvrir data-cta-profil aria-expanded="false"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lettre"/></svg> <span>Créer mon profil ou connexion</span></button></p>
  </div>
  <div class="patio-etapes po-panel" id="questions">
    <h2>Tes questions</h2>
    <ol>
      <li><strong>Mon nom est-il visible ?</strong><span>Non. Sur les profils, on ne voit ni prénom, ni photo, ni contact : seulement un numéro de profil.</span></li>
      <li><strong>Pourquoi 2 photos ?</strong><span>Lamia en a besoin pour vérifier ton profil et écarter les faux profils. Tes photos ne s’affichent pas sur les profils publics.</span></li>
      <li><strong>La pièce d’identité est-elle obligatoire ?</strong><span>Non, elle est facultative. Si tu la donnes, ton profil porte le badge renforcé.</span></li>
      <li><strong>Que se passe-t-il quand nous sommes d’accord tous les deux ?</strong><span>Lamia vous présente, et une discussion privée de 7 jours s’ouvre dans votre espace. Vous échangez vos numéros ensuite.</span></li>
      <li><strong>Le site est-il réservé aux Kabyles ?</strong><span>Non. Lamia est marieuse kabyle, et les rencontres sont aussi ouvertes aux Chaouis, aux Touaregs, aux autres Amazighs et aux personnes d’autres origines. Chacun indique son origine sur son profil.</span></li>
      <li><strong>D’où viennent les profils ?</strong><span>De France, d’Algérie, du Canada, d’Europe et d’ailleurs. <a class="text-link" href="/rencontre-kabyle-canada/">Canada</a> · <a class="text-link" href="/rencontre-kabyle-algerie/">Algérie</a> · <a class="text-link" href="/rencontre-kabyle-europe/">Belgique et Europe</a></span></li>
      <li><strong>Je vis en Algérie, comment faire ?</strong><span>Ton profil et ton premier match sont gratuits. Le paiement en ligne n’y est pas possible : <a class="text-link" href="/salon/">viens au live</a>, chaque soir à 21 h, pour d’autres matchs.</span></li>
      <li><strong>Combien ça coûte ?</strong><span>Découverte est gratuite et ton premier match est offert. <a class="text-link" href="/abonnement/">Voir toutes les formules</a>.</span></li>
    </ol>
  </div>
  <h2 class="annonces-titre" id="profils-anonymes">Les profils vérifiés</h2>
  <p class="annonces-sous">Ni prénom, ni photo, ni contact. Un profil te touche ? Clique sur « Ce profil m’intéresse » : Lamia regarde si vous pouvez correspondre. Ton identité reste secrète : on ne voit que des numéros de profil.</p>
  <p class="po-actions btn-swipe"><a class="po-btn" href="/rencontres/swipe/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Swiper les profils, un par un</a></p>
  <div class="annonces-liste" data-annonces-liste><p class="annonce-vide">Les profils arrivent…</p></div>
  <div class="accueil-duo">
    <a class="abo-carte accueil-carte" href="/speed-dating/"><h3>Speed dating en ligne</h3><p>Des soirées en visio par tranche d’âge, caméra allumée, avec Lamia qui veille.</p><span class="po-btn-verre">Voir les prochaines soirées</span></a>
    <a class="abo-carte accueil-carte" href="/salon/"><h3>Le live, chaque soir à 21 h</h3><p>Les annonces de mariage présentées en direct, sur toutes les plateformes.</p><span class="po-btn-verre">Le live et mes outils</span></a>
  </div>
</section>
</div>`,
  })
);

// Abonnement « Trouve ton âme sœur »
// Tableau récapitulatif : tout vient de content/abonnements.mjs, pour rester juste quand un prix ou un nombre change.
const tableauFormules = () => {
  const [d, pa, pr] = ['decouverte', 'passion', 'prestige'].map((id) => FORMULES.find((f) => f.id === id));
  const oui = '<span class="abo-oui" aria-label="Oui">✓</span>', non = '<span class="abo-non" aria-label="Non">–</span>';
  const v = (x) => (x ? oui : non);
  const lignes = [
    ['Prix par mois', 'Gratuit', eurosAbo(pa.mois), `${eurosAbo(pr.lancement.prix)} pour les ${pr.lancement.places} premiers abonnés, puis ${eurosAbo(pr.mois)}`],
    ['Prix à l’année', '–', eurosAbo(prixAnnuel(pa)), `${eurosAbo(prixAnnuel(pr, 0))}, puis ${eurosAbo(prixAnnuel(pr))}`],
    ['Matchs', `${d.mises} offert`, `${pa.mises} par mois`, 'Illimités'],
    ['Matchs en cours en même temps', d.matchs, pa.matchs, pr.matchs],
    ['Speed datings inclus par mois', '–', pa.speedDatings, pr.speedDatings],
    ['Swipe sans limite', oui, oui, oui],
    ['7 jours de discussion avec ton match', oui, oui, oui],
    ['Le profil de qui t’a choisi·e', 'Le nombre seulement', v(pa.quiMaChoisi), v(pr.quiMaChoisi)],
    ['La photo de ton match, s’il ou elle l’accepte', `${eurosAbo(UNITES.find((u) => u.id === 'photo_match').prix)} pour 1 heure`, 'Incluse', 'Incluse'],
    ['Tes questions à Lamia sur ton profil', non, oui, oui],
    ['Profil prioritaire dans le matching', non, non, oui],
    ['Annonce présentée en priorité en live', non, non, oui],
    ['Coaching avec Lamia', non, non, '1 visio de 15 minutes par mois'],
    ['Option mariage, de la rencontre aux familles', non, non, oui],
  ];
  return `<h2 class="annonces-titre">Les formules en un coup d’œil</h2>
  <div class="abo-tableau-cadre" tabindex="0" role="region" aria-label="Tableau récapitulatif des formules"><table class="abo-tableau">
    <thead><tr><th scope="col"><span class="abo-cache">Ce qui est inclus</span></th>${[d, pa, pr].map((f) => `<th scope="col"${f.vedette ? ' class="is-vedette"' : ''}>${esc(f.nom)}</th>`).join('')}</tr></thead>
    <tbody>${lignes.map(([titre, ...cases]) => `<tr><th scope="row">${esc(titre)}</th>${cases.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <p class="abo-tableau-note">En live : 1 match supplémentaire offert toutes les 2 semaines, quelle que soit ta formule.</p>`;
};
const carteFormule = (f) => `<article class="abo-carte${f.vedette ? ' is-vedette' : ''}" data-formule="${f.id}">
  ${f.vedette ? '<p class="abo-ruban">Le plus choisi</p>' : ''}
  <h3>${esc(f.nom)}</h3>
  <p class="abo-accroche">${esc(f.accroche)}</p>
  <p class="abo-prix">${f.mois ? `<span data-prix-mois${f.lancement ? ' data-prestige-prix="mois"' : ''}>${eurosAbo(prixMensuel(f, 0))}<small> / mois</small></span><span data-prix-an hidden${f.lancement ? ' data-prestige-prix="an"' : ''}>${eurosAbo(prixAnnuel(f, 0))}<small> / an</small><em>soit 2 mois offerts</em></span>` : 'Gratuit'}</p>
  ${placesLancement(f)}
  <ul>${f.avantages.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  ${f.mois ? `<button type="button" class="po-btn" data-choisir="${f.id}">Choisir ${esc(f.nom)}</button>` : '<a class="po-btn-verre" href="/rencontres/#confier">Créer mon profil</a>'}
</article>`;
page(
  '/abonnement/',
  layout({
    title: 'Tarifs des rencontres kabyles · Formules Lamia',
    description: 'Découverte gratuite, Passion à 9 €, Prestige à 22 € pour les 20 premiers abonnés, puis 49 € par mois. Sans engagement, résiliable en un clic.',
    path: '/abonnement/',
    room: roomBySlug.patio,
    scripts: ['/assets/abonnement.js'],
    body: `<div class="po-app">
<section class="po-hero abo-hero" aria-labelledby="abo-titre">
  <div class="po-fond" aria-hidden="true"></div>
  <div class="po-hero-grid">
    <div class="po-hero-texte">
      <p class="po-eyebrow">Par Lamia, marieuse kabyle</p>
      <h1 id="abo-titre">Les formules de rencontre kabyle</h1>
      <p class="po-sub">Un match est toujours offert. En live, 1 match supplémentaire toutes les 2 semaines.</p>
      <p class="po-lead">Ou choisis le rythme qui te ressemble : 10 matchs par mois et 2 en cours, ou illimités et 5 en cours, avec le coaching et l’option mariage de Lamia. Sans engagement, résiliable en un clic depuis ton espace.</p>
      <p class="po-lead">Tu vis en Algérie ? Le paiement en ligne n’y est pas possible : <a class="text-link" href="/salon/">viens au live</a>, chaque soir à 21 h, pour d’autres matchs.</p>
    </div>
    <figure class="po-lamia"><img src="/images/lamia/lamia-portrait-tatouages-rond-480.webp" alt="Lamia Femme Berbère" width="200" height="200"><figcaption>Lamia · ta marieuse</figcaption></figure>
  </div>
</section>
<section class="po-corps abo-corps">
  <p class="abo-alerte" data-abo-alerte hidden></p>
  <div class="abo-periode" role="radiogroup" aria-label="Paiement">
    <button type="button" role="radio" aria-checked="true" data-periode="mois">Au mois</button>
    <button type="button" role="radio" aria-checked="false" data-periode="an">À l’année <b>2 mois offerts</b></button>
  </div>
  <div class="abo-grille">${FORMULES.map(carteFormule).join('')}</div>
  ${tableauFormules()}
  <h2 class="annonces-titre" id="unites">Sans abonnement, à l’unité</h2>
  <div class="abo-unites">${UNITES.map((u) => `<article class="abo-carte abo-unite" id="unite-${u.id}"><h3>${esc(u.nom)}</h3><p class="abo-prix">${eurosAbo(u.prix)}</p><p>${esc(u.texte)}</p>${u.depuisEspace ? '<a class="po-btn-verre" href="/mon-espace/">Mon espace</a>' : `<button type="button" class="po-btn-verre" data-unite="${u.id}">Acheter</button>`}</article>`).join('')}</div>
  <form class="abo-form annonce-form" data-abo-form hidden>
    <h2 data-abo-titre>Ta formule</h2>
    <p class="annonce-aide" data-abo-resume></p>
    <div class="annonce-grille">
      <label>Ton prénom et ton nom<input name="nom" autocomplete="name" required minlength="2"></label>
      <label>Ton email<input name="email" type="email" autocomplete="email" required><small>Utilise l’email de ton profil confié à Lamia.</small></label>
      <label data-abo-qte hidden>Quantité<select name="quantite">${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}</select></label>
    </div>
    <label class="annonce-case"><input type="checkbox" name="cgv" required> <span>J’accepte les <a href="/cgv/#abonnement" target="_blank">conditions de vente</a>, et je demande que le service commence tout de suite.</span></label>
    <p class="po-actions"><button class="po-btn" type="submit">Payer en toute sécurité</button><button class="po-btn-verre" type="button" data-abo-annuler>Annuler</button></p>
    <p class="form-status" role="status" data-abo-statut></p>
  </form>
  <div class="patio-etapes">
    <h2>Questions fréquentes</h2>
    <ol>
      <li><strong>C’est quoi, un match ?</strong><span>Lamia te propose une personne qui te correspond vraiment. Si vous êtes d’accord tous les deux, elle vous met en contact. Ton numéro reste chez elle jusque-là.</span></li>
      <li><strong>Plusieurs matchs en même temps, ça veut dire quoi ?</strong><span>Tu peux avoir 1 match en cours avec Découverte, 2 avec Passion et 5 avec Prestige. Quand tu mets fin à un match, une place se libère.</span></li>
      <li><strong>Comment se passe le coaching ?</strong><span>Dans ton espace, tu choisis un créneau parmi ceux ouverts par Lamia : une visio de 15 minutes, non enregistrée, incluse chaque mois avec Prestige ou à 15 € à l’unité. Il existe aussi un coaching de 30 minutes à 39 € et « Sauver mon couple », 1 heure à deux ou seul·e, à 89 €. Tu peux annuler jusqu’à 24 heures avant et choisir un autre créneau.</span></li>
      <li><strong>Et les speed datings inclus ?</strong><span>Ta place aux soirées de speed dating en ligne de ton salon, dans la limite indiquée chaque mois. Lamia la note quand tu t’inscris.</span></li>
      <li><strong>Je peux arrêter quand je veux ?</strong><span>Oui. Dans ton espace, « Gérer mon abonnement » : tu résilies en un clic. Ton abonnement reste actif jusqu’à la fin de la période payée.</span></li>
      <li><strong>Lamia garantit-elle un mariage ?</strong><span>Personne ne peut le promettre. Lamia s’engage sur le sérieux : profils vérifiés, matching soigné, et un vrai suivi.</span></li>
    </ol>
  </div>
</section>
</div>`,
  })
);
// Nouveautés de la Maison (produits, articles, actus, lives), chaque type de sa couleur.
page(
  '/nouveautes/',
  layout({
    title: 'Les nouveautés · Lamia Femme Berbère',
    description: 'Les nouveautés de Lamia : trouvailles et bijoux de la boutique, articles, actus et lives.',
    path: '/nouveautes/',
    room: roomBySlug.patio,
    scripts: ['/assets/nouveautes.js'],
    body: `<div class="po-app"><section class="po-hero"><div class="po-fond" aria-hidden="true"></div>
  <p class="po-eyebrow"><svg class="ico" aria-hidden="true"><use href="/icones.svg#bell"/></svg> Les nouveautés</p><h1>Quoi de neuf chez Lamia ?</h1>
  <p class="po-lead">Les nouvelles trouvailles de la boutique, les bijoux kabyles, les articles, les actus et les lives de Lamia. Active les notifications dans <a href="/mon-espace/">Mon espace</a> pour ne rien manquer.</p>
</section>
<div class="nouveautes-app"><div class="nouveautes-filtres" data-nouveautes-filtres></div><div class="nouveautes-liste" data-nouveautes><p class="annonce-vide">Un instant…</p></div></div></div>`,
  })
);
// Swipe : découvrir les profils un par un et dire lesquels intéressent (application sur téléphone).
page(
  '/rencontres/swipe/',
  layout({
    noindex: true,
    title: 'Swipe · Les profils vérifiés',
    description: 'Découvre les profils vérifiés un par un : à droite s’il t’intéresse, à gauche sinon. Si vous vous choisissez tous les deux, Lamia vous met en relation.',
    path: '/rencontres/swipe/',
    room: roomBySlug.patio,
    scripts: ['/assets/swipe.js'],
    body: `<div class="po-app swipe-page"><header class="swipe-tete">
  <h1><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Swipe</h1>
  <details class="swipe-explique"><summary>Comment ça marche ?</summary><p>À droite (cœur) s’il t’intéresse, à gauche (croix) sinon, sans limite. Ton identité reste secrète : on ne voit que des numéros de profil. Si vous vous choisissez tous les deux, Lamia est prévenue et vous met en relation.</p></details>
</header>
<div class="swipe-app">
  <p class="swipe-antighost"><svg class="ico" aria-hidden="true"><use href="/icones.svg#handshake"/></svg> <strong>Appli anti-ghosting</strong> : ici, on ne disparaît pas. Pour dématcher, on se dit au revoir.</p>
  <div class="swipe-infos" data-swipe-infos></div>
  <div class="swipe-filtres-zone" data-swipe-filtres></div>
  <p class="swipe-compteur" data-swipe-compteur></p>
  <p class="swipe-adresse" data-swipe-adresse hidden></p>
  <svg class="swipe-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><radialGradient id="corail-b" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#F08A68"/><stop offset=".6" stop-color="#D2482C"/><stop offset="1" stop-color="#A5301C"/></radialGradient><linearGradient id="or-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF4B8"/><stop offset=".45" stop-color="#C9A86A"/><stop offset=".62" stop-color="#F3E0B9"/><stop offset="1" stop-color="#8A6414"/></linearGradient><clipPath id="clip-rond"><circle cx="90" cy="92" r="72"/></clipPath><clipPath id="clip-triangle"><path d="M14 44Q90 30 166 44 174 56 168 68L100 190Q90 204 80 190L12 68Q6 56 14 44Z"/></clipPath><g id="pampille"><circle cy="-5" r="3.6" fill="none" stroke="url(#or-b)" stroke-width="1.8"/><circle cy="1" r="3.6" fill="none" stroke="url(#or-b)" stroke-width="1.8"/><path d="M0 4 9 24Q9 36 0 46-9 36-9 24Z" fill="#1B1A18" stroke="url(#or-b)" stroke-width="2.2" stroke-linejoin="round"/><path d="M0 7 6.5 22Q0 27-6.5 22Z" fill="#C9A86A" stroke="#F3E0B9" stroke-width=".7"/><path d="M0 22Q6 28 4.6 33 0 40-4.6 33-6 28 0 22Z" fill="#F3E0B9" stroke="#F3E0B9" stroke-width=".7"/><circle cy="48" r="4.6" fill="url(#or-b)"/><circle cy="48" r="3" fill="#C9A86A"/></g><g id="bijou-femme"><circle cx="90" cy="0" r="17" fill="none" stroke="url(#or-b)" stroke-width="4.5"/><path d="M46 10L126 -9L136 -13L126 -5.5L47 13Q42 13 46 10Z" fill="url(#or-b)" stroke="#8A6414" stroke-width=".5"/><use href="#pampille" x="48" y="158"/><use href="#pampille" x="90" y="178"/><use href="#pampille" x="132" y="158"/><circle cx="90" cy="92" r="76" fill="none" stroke="url(#or-b)" stroke-width="8"/><circle cx="90" cy="92" r="72" fill="#1B1A18"/><image href="/images/outil/avatar-femme.webp" x="17" y="19" width="146" height="146" clip-path="url(#clip-rond)" preserveAspectRatio="xMidYMid slice"/><circle cx="90" cy="168" r="11.1" fill="url(#or-b)"/><circle cx="90" cy="168" r="8.5" fill="url(#corail-b)"/><ellipse cx="87.3" cy="164.9" rx="2.2" ry="1.4" fill="#FBC4AE" opacity=".8"/></g><g id="bijou-homme"><circle cx="90" cy="16" r="17" fill="none" stroke="url(#or-b)" stroke-width="4.5"/><path d="M46 26L126 7L136 3L126 10.5L47 29Q42 29 46 26Z" fill="url(#or-b)" stroke="#8A6414" stroke-width=".5"/><use href="#pampille" x="56" y="150"/><use href="#pampille" x="90" y="198"/><use href="#pampille" x="124" y="150"/><path d="M14 44Q90 30 166 44 174 56 168 68L100 190Q90 204 80 190L12 68Q6 56 14 44Z" fill="#1B1A18"/><image href="/images/outil/avatar-homme.webp" x="-6" y="30" width="190" height="190" clip-path="url(#clip-triangle)" preserveAspectRatio="xMidYMid slice"/><path d="M14 44Q90 30 166 44 174 56 168 68L100 190Q90 204 80 190L12 68Q6 56 14 44Z" fill="none" stroke="url(#or-b)" stroke-width="8" stroke-linejoin="round"/><circle cx="90" cy="192" r="11.1" fill="url(#or-b)"/><circle cx="90" cy="192" r="8.5" fill="url(#corail-b)"/><ellipse cx="87.3" cy="188.9" rx="2.2" ry="1.4" fill="#FBC4AE" opacity=".8"/></g></defs></svg>
  <div class="swipe-pile" data-swipe><p class="annonce-vide">Les profils arrivent…</p></div>
  <div class="swipe-boutons" data-swipe-boutons hidden><button type="button" data-swipe-non aria-label="Pas pour moi"><svg class="ico" aria-hidden="true"><use href="/icones.svg#croix"/></svg></button><button type="button" class="swipe-annuler" data-swipe-annuler aria-label="Revenir au profil précédent" disabled><svg class="ico" aria-hidden="true"><use href="/icones.svg#retour"/></svg></button><button type="button" data-swipe-oui aria-label="Ce profil m’intéresse"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur-plein"/></svg></button></div>
  <p class="swipe-aide">La flèche ronde te fait revenir sur ton dernier choix. Sur ordinateur : flèches ← et → du clavier. Ajoute le site à ton écran d’accueil pour l’avoir comme une application.</p>
</div></div>`,
  })
);
page(
  '/abonnement/merci/',
  layout({
    title: 'Merci · Abonnement',
    description: 'Ton paiement est bien reçu.',
    path: '/abonnement/merci/',
    room: roomBySlug.patio,
    scripts: ['/assets/abonnement-merci.js'],
    body: `<div class="po-app"><section class="po-hero abo-hero"><div class="po-fond" aria-hidden="true"></div>
  <p class="po-eyebrow">Merci</p><h1>Bienvenue, ton cœur est entre de bonnes mains</h1>
  <p class="abo-alerte" data-abo-confirmation>Vérification du paiement…</p>
  <p class="po-lead">Ton paiement est bien reçu. Tu reçois un reçu par email, et Lamia est prévenue. Si ce n’est pas encore fait, crée ton profil pour que Lamia puisse chercher la bonne personne.</p>
  <p class="po-actions"><a class="po-btn" href="/rencontres/#confier"><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> Créer mon profil</a><a class="po-btn-verre" href="/mon-espace/">Mon espace</a></p>
</section></div>`,
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
      noindex: true,
      room: r,
      body: `<section class="room-head is-soon">
  <p class="room-name"><span class="pip" aria-hidden="true"></span>${esc(r.name)}</p>
  <h1>${esc(r.welcome)}</h1>
  <p class="lead">${esc(r.summary)}</p>
  <p class="door-ajar">Cette porte est encore entrouverte. Pour être prévenue de son ouverture, suis Lamia sur <a href="https://www.tiktok.com/@lamiafemmeberbere" rel="noopener" target="_blank">TikTok</a>.</p>
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
    title: 'Lamia Bréchet Ighil, marieuse kabyle · Lamia Femme Berbère',
    description: 'Lamia Bréchet Ighil, marieuse kabyle derrière Lamia Femme Berbère : lives, rencontres en vue du mariage, culture kabyle et amazighe, bijoux d’Ath Yenni.',
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
      <li><a href="/rencontres/"><strong>Les Rencontres</strong> pour trouver l’âme sœur.</a></li>
    </ul>
    <p>Et d’autres portes s’ouvriront encore.</p>
    <p>Parce que cette Maison n’a pas été pensée comme une boutique dans laquelle on vient seulement acheter quelque chose. <strong>Elle a été pensée comme un endroit où l’on vient retrouver Lamia.</strong></p>
  </section>

  <footer class="lamia-fin">
    <blockquote>« Tu peux être profondément attachée à ce que l’on t’a transmis et rester totalement libre de décider de ce que tu veux en faire. »</blockquote>
    <p class="lamia-bienvenue">Bienvenue chez moi. Bienvenue à la Maison.</p>
    <p class="lamia-boutons"><a class="btn btn-ink" href="/rencontres/">Les Rencontres de Lamia</a><a class="btn btn-line" href="/werdi-ouvre-les-yeux/">Découvrir Werdi</a><a class="btn btn-line" href="/salon/">Retrouver mes lives</a></p>
  </footer>
</article>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: 'Lamia Bréchet Ighil', alternateName: 'Lamia Femme Berbère', url: SITE_URL + '/lamia-brechet/', image: SITE_URL + '/images/lamia/lamia-salon-900.webp', sameAs: ['https://www.tiktok.com/@lamiafemmeberbere', 'https://www.facebook.com/femmeberberes/'] })}</script>`,
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

// Après le paiement d'un article de la boutique
page(
  '/commande/merci/',
  layout({
    title: 'Merci pour ton achat · Lamia Femme Berbère',
    description: 'Confirmation de ton achat.',
    path: '/commande/merci/',
    room: roomBySlug.boutique,
    noindex: true,
    body: `<section class="room-head" data-merci-commande><p class="room-name"><span class="pip" aria-hidden="true"></span>La Boutique</p><h1>Vérification de ton paiement…</h1><p class="lead" data-merci-text>Un instant, je confirme ton achat auprès de la banque.</p><p class="bal-actions"><a class="btn btn-ink" href="/boutique/">Revenir à la Boutique</a><a class="btn btn-line" href="/mon-espace/">Mon espace</a></p></section>`,
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

// Le conjoint rejoint la visio « Sauver mon couple » avec le lien transmis, sans compte
page(
  '/rencontres/visio/',
  layout({
    title: 'Visio avec Lamia · Les Rencontres de Lamia',
    description: 'Rejoindre la visio avec Lamia, à deux.',
    path: '/rencontres/visio/',
    room: roomBySlug.patio,
    noindex: true,
    scripts: ['/assets/visio-invite.js'],
    body: `<div class="po-app"><section class="po-hero"><div class="po-fond" aria-hidden="true"></div>
  <p class="po-eyebrow">Les Rencontres de Lamia</p><h1>Votre visio avec Lamia</h1>
  <p class="po-lead">Un moment à deux avec Lamia. Rien n’est enregistré.</p>
</section>
<section class="confirmer-app" data-visio-invite><p class="annonce-vide">Un instant…</p></section></div>`,
  })
);

// Confirmation d'une fiche créée en live (lien personnel envoyé par Lamia)
page(
  '/rencontres/confirmer/',
  layout({
    title: 'Confirme ta fiche · Les Rencontres de Lamia',
    description: 'Ta fiche créée en live avec Lamia : confirme-la pour qu’elle apparaisse, anonymement, dans les profils.',
    path: '/rencontres/confirmer/',
    room: roomBySlug.patio,
    noindex: true,
    scripts: ['/assets/confirmer.js'],
    body: `<div class="po-app"><section class="po-hero"><div class="po-fond" aria-hidden="true"></div>
  <p class="po-eyebrow">Les Rencontres de Lamia</p><h1>Ta fiche est prête</h1>
  <p class="po-lead">Tu es passé·e en live avec Lamia : ta fiche est dans son outil de matching et apparaît sur le site, anonyme, en attente de ta confirmation.</p>
</section>
<section class="confirmer-app" data-confirmer><p class="annonce-vide">Ta fiche arrive…</p></section></div>`,
  })
);

// L'application installable
page(
  '/application/',
  layout({
    title: 'L’application de rencontre kabyle de Lamia',
    description: 'Installe l’application de Lamia sur ton téléphone : les profils vérifiés, le swipe, ton espace, le live et le speed dating à portée de doigt.',
    path: '/application/',
    room: roomBySlug.boutique,
    body: `<section class="room-head"><p class="room-name"><span class="pip" aria-hidden="true"></span>L’application</p><h1>L’application de rencontre kabyle de Lamia</h1><p class="lead">Installe l’application de Lamia sur ton téléphone : une icône sur ton écran d’accueil, les profils vérifiés, le swipe, ton espace et le live en plein écran, sans passer par un magasin d’applications de lourd.</p>
<p class="bal-actions"><button type="button" class="btn btn-ink btn-installer" data-installer-bouton><svg class="ico" aria-hidden="true"><use href="/icones.svg#smartphone"/></svg> Installer l’application</button><span data-installee hidden>✓ L’application est déjà installée sur cet appareil.</span></p></section>
<section class="article"><h2>Sur Android</h2><ol><li>Ouvre lamia-femme-berbere.com dans Chrome.</li><li>Touche le bouton « Installer l’application » ci-dessus, ou le menu ⋮ puis « Installer l’application ».</li><li>Confirme : l’icône de la Maison apparaît sur ton écran d’accueil.</li></ol>
<h2>Sur iPhone</h2><ol><li>Ouvre lamia-femme-berbere.com dans Safari.</li><li>Touche le bouton Partager (le carré avec une flèche vers le haut).</li><li>Choisis « Sur l’écran d’accueil », puis « Ajouter ».</li></ol>
<p>L’application se met à jour toute seule, en même temps que le site. Tes paiements restent sécurisés de la même façon.</p></section>`,
  })
);

page(
  '/hors-ligne/',
  layout({
    title: 'Pas de connexion · Lamia Femme Berbère',
    description: 'Pas de connexion internet pour le moment.',
    path: '/hors-ligne/',
    noindex: true,
    body: `<section class="room-head"><p class="room-name"><span class="pip" aria-hidden="true"></span>La Maison</p><h1>Pas de connexion pour l’instant</h1><p class="lead">La Maison a besoin d’internet pour t’ouvrir ses portes. Vérifie ta connexion, puis réessaie.</p><p><a class="btn btn-ink" href="/">Réessayer</a></p></section>`,
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
      body: `<article class="article legal">${lp.finale ? '' : '<p class="draft-banner">Brouillon : ce texte sera complété et relu avant l’ouverture des ventes.</p>'}<h1>${esc(lp.title)}</h1>${lp.body.replaceAll('{{LIVRAISON}}', livraisonTexte(BOUTIQUE.tarifs)).replace('{{TVA}}', tvaTexte(BOUTIQUE.tva))}</article>`,
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
    body: `<section class="room-head"><p class="room-name"><span class="pip" aria-hidden="true"></span>Porte introuvable</p><h1>Cette porte ne mène nulle part.</h1><p class="lead">La page a peut-être changé d’adresse.</p><p><a class="btn btn-ink" href="/">Revenir à l’accueil</a> <a class="btn btn-line" href="/rencontres/">Les Rencontres</a></p></section>`,
  })
);


// ---------------------------------------------------------------- une vraie page par pièce (référencement)
// Chaque produit en vente reçoit sa propre adresse /produit/<slug>/, pré-remplie pour Google :
// titre, description, image de partage, données Product (schema.org) et texte visible sans JavaScript.
// Le catalogue est lu avec la clé publique, comme le fait le navigateur.
async function loadCatalogue() {
  try {
    const r = await fetch('https://tybwvxinigahhntfeeur.supabase.co/rest/v1/products?select=slug,name,subtitle,description,price_cents,currency,stock_qty,is_unique,product_type,cover_image_url,gallery,metadata,updated_at,categories(slug)&status=eq.active', {
      headers: { apikey: 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc' }, signal: AbortSignal.timeout(15000),
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}
const CATALOGUE = await loadCatalogue();
const roomDeCategorie = (cat) => rooms.find((r) => r.slug !== 'boutique' && (r.productCategories || []).includes(cat)) || roomBySlug.boutique;
const resume = (t, n = 158) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length <= n ? x : x.slice(0, x.lastIndexOf(' ', n - 1)).replace(/[,;:·.\s]+$/, '') + '…'; };
const paragraphes = (t) => String(t || '').split(/\n\s*\n/).map((b) => `<p>${b.split('\n').map(esc).join('<br>')}</p>`).join('');
const PRODUITS_INDEXES = [];
const PAGES_PRODUITS_EN = [];
for (const [prod, lang] of CATALOGUE.flatMap((x) => [[x, 'fr'], [produitAnglais(x), 'en']])) {
  if (!prod.slug || !/^[a-z0-9-]+$/.test(prod.slug)) continue;
  const room = roomDeCategorie(prod.categories?.slug);
  const path = `${lang === 'en' ? '/en' : ''}/produit/${prod.slug}/`;
  const page = lang === 'en' ? (pth, html) => PAGES_PRODUITS_EN.push({ path: pth, html, fr: `/produit/${prod.slug}/` }) : globalThis.__pageFr;
  const prix = ((prod.price_cents || 0) / 100).toFixed(2);
  const dispo = prod.stock_qty > 0 || !prod.is_unique;
  const images = [prod.cover_image_url, ...(Array.isArray(prod.gallery) ? prod.gallery.map((g) => (typeof g === 'string' ? g : g?.url)) : [])].filter((u) => typeof u === 'string' && /^(\/images\/|https:\/\/)/.test(u));
  const abs = (u) => (u.startsWith('http') ? u : SITE_URL + u);
  const occasion = room.slug === 'grenier' || /anciens/.test(prod.metadata?.famille || '');
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: prod.name, description: resume(prod.description, 500) || prod.subtitle || prod.name,
    image: [...new Set(images)].slice(0, 6).map(abs), sku: prod.slug, url: SITE_URL + path,
    ...(occasion ? {} : { brand: { '@type': 'Brand', name: 'Lamia Femme Berbère' } }),
    offers: { '@type': 'Offer', url: SITE_URL + path, priceCurrency: prod.currency || 'EUR', price: prix,
      availability: dispo ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      itemCondition: prod.metadata?.etat === 'neuf' || !occasion ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: 'La Maison Lamia Femme Berbère' } },
  };
  const titre = lang === 'en' ? `${prod.name} — €${prix.replace('.00', '')} · ${STRINGS[room.name] || room.name}` : `${prod.name} — ${prix.replace('.', ',').replace(',00', '')} € · ${room.name}`;
  page(path, layout({
    title: titre.length > 70 ? `${prod.name} · Lamia Femme Berbère` : titre,
    description: resume([prod.subtitle, prod.description].filter(Boolean).join('. ')),
    path, room,
    ogImage: images[0], ogImageAlt: prod.name,
    body: `<section class="product-page" data-product-page data-slug="${esc(prod.slug)}">
  <div class="gallery">${images[0] ? `<figure class="gallery-main"><img src="${esc(images[0])}" alt="${esc(prod.name)}" width="1120" height="1400" fetchpriority="high"></figure>` : ''}</div>
  <div class="product-info">
    <a class="back-room" href="${room.path}"><span class="pip" aria-hidden="true"></span>${esc(room.name)}</a>
    <h1>${esc(prod.name)}</h1>
    ${prod.subtitle ? `<p class="lead">${esc(prod.subtitle)}</p>` : ''}
    <p class="product-price">${lang === 'en' ? `€${esc(prix)}` : `${esc(prix.replace('.', ','))} €`}</p>
    <div class="product-desc">${paragraphes(prod.description)}</div>
    ${room.slug === 'grenier' && lang === 'fr' ? '<p class="passerelle">Ce grenier est celui de Lamia, marieuse kabyle. <a href="/rencontres/">Découvrir ses rencontres sérieuses</a></p>' : ''}
  </div>
</section>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  }));
  if (dispo && lang === 'fr') PRODUITS_INDEXES.push({ path, lastmod: String(prod.updated_at || '').slice(0, 10) });
}
console.log(`Pages produits : ${CATALOGUE.length}`);

// ---------------------------------------------------------------- version anglaise (/en/…)

const pagesFr = pages.filter((p) => !FR_ONLY.test(p.path));
const PAGES_EN = new Set(pagesFr.filter((p) => !p.path.endsWith('.html') && !p.path.startsWith('/produit/')).map((p) => p.path));
const pagesEn = [
  ...pagesFr.filter((p) => !/^\/produit\/./.test(p.path)).map((p) => ({ path: enPath(p.path), html: pageAnglaise(p.html, p.path, SITE_URL, PAGES_EN) })),
  ...PAGES_PRODUITS_EN.map((p) => ({ path: p.path, html: pageAnglaise(p.html, p.fr, SITE_URL, PAGES_EN, { signaler: false }) })),
];
for (const p of pagesFr) p.html = pageFrancaise(p.html, p.path, SITE_URL);
if (MANQUANTS.size) console.log(`Version anglaise : ${MANQUANTS.size} texte(s) sans traduction, laissés en français :\n  - ${[...MANQUANTS].slice(0, 40).join('\n  - ')}`);
pages.push(...pagesEn);

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
for (const f of ['version-play.js', 'abonnement.js', 'abonnement-merci.js', 'swipe.js', 'nouveautes.js', 'confirmer.js', 'visio-invite.js', 'maison.css', 'maison.js', 'membre.js', 'antichambre.js', 'soirees.js', 'bal.js', 'espace.js', 'confidences.js', 'confidences-commun.js', 'annonces.js', 'enregistreur.js', 'confidences-lamia.js', 'confidences-lamia.css']) await cp(join(ROOT, 'src', f), join(DIST, 'assets', f));
await cp(join(ROOT, 'content', 'shipping.mjs'), join(DIST, 'assets', 'shipping.mjs'));
await cp(join(ROOT, 'content', 'rubriques.mjs'), join(DIST, 'assets', 'rubriques.mjs'));
await cp(join(ROOT, 'content', 'matching-options.mjs'), join(DIST, 'assets', 'matching-options.mjs'));
await cp(join(ROOT, 'src', 'i18n.js'), join(DIST, 'assets', 'i18n.js'));
await mkdir(join(DIST, 'assets', 'i18n'), { recursive: true });
await cp(join(ROOT, 'content', 'en', 'products.json'), join(DIST, 'assets', 'i18n', 'products-en.json'));
const MOTIFS_EN = JSON.parse(await readFile(join(ROOT, 'content', 'en', 'patterns.json'), 'utf8'));
const MOTIFS_APPLI = JSON.parse(await readFile(join(ROOT, 'content', 'en', 'app-patterns.json'), 'utf8'));
await writeFile(join(DIST, 'assets', 'i18n', 'en.json'), JSON.stringify({ strings: STRINGS, pages: [...PAGES_EN], motifs: [...MOTIFS_APPLI.motifs, ...MOTIFS_EN.motifs], noms: MOTIFS_EN.noms, membre: MOTIFS_APPLI.membre, segments: MOTIFS_APPLI.segments }));

const indexable = pages.filter((p) => !soonRooms.some((r) => p.path.replace(/^\/en\//, '/') === r.path) && !p.path.endsWith('.html') && !p.path.startsWith('/en/produit/') && !['/produit/', '/mon-espace/', '/speed-dating/bal/', '/speed-dating/salle/', '/suppression-compte/', '/speed-dating/merci/', '/commande/merci/', '/abonnement/merci/', '/rencontres/swipe/', '/rencontres/confirmer/', '/rencontres/visio/', '/speed-dating/souhaits/', '/cgv/', '/mentions-legales/', '/confidentialite/', '/retours/', '/conditions-utilisation/', '/confidences-lamia/', '/hors-ligne/'].includes(p.path.replace(/^\/en\//, '/')));
await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable.filter((p) => !p.path.startsWith('/produit/')).map((p) => `<url><loc>${SITE_URL}${p.path}</loc></url>`).join('')}${PRODUITS_INDEXES.map((p) => `<url><loc>${SITE_URL}${p.path}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url><url><loc>${SITE_URL}/en${p.path}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`).join('')}</urlset>\n`
);
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /pilotage.html\nDisallow: /admin-soirees.html\nDisallow: /speed-dating/merci/\nDisallow: /speed-dating/bal/\nDisallow: /mon-espace/\nDisallow: /tableau-de-bord\nDisallow: /admin-bal.html\nDisallow: /confidences-lamia/\nDisallow: /en/speed-dating/merci/\nDisallow: /en/speed-dating/bal/\nDisallow: /en/mon-espace/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Maison générée : ${pages.length} pages dans dist/`);
