// Version anglaise de la Maison (/en/…).
// Les pages françaises sont générées comme d'habitude, puis chaque page publique est
// traduite ici à partir d'un dictionnaire français → anglais (content/en/strings.json).
// Un texte absent du dictionnaire (par exemple un texte modifié depuis le tableau de bord)
// reste en français : la construction affiche la liste de ces textes à traduire.
// Les fiches produits ont leur propre traduction (content/en/products.json), appliquée
// à la construction des pages produits et dans le navigateur.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => (existsSync(join(ROOT, f)) ? JSON.parse(readFileSync(join(ROOT, f), 'utf8')) : {});

export const STRINGS = lire('content/en/strings.json');
export const PRODUCTS = lire('content/en/products.json');

// Pages qui restent uniquement en français (outils privés de Lamia).
export const FR_ONLY = /^\/(admin|pilotage|tableau-de-bord|confidences-lamia)/;

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encodeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encodeAttr = (s) => encodeText(s).replace(/"/g, '&quot;');

export const MANQUANTS = new Set();

// Traduit une chaîne en gardant ses espaces de début et de fin.
let SIGNALER = true;
function traduire(brut, attr = false) {
  const t = norm(decode(brut));
  if (!t || !/[A-Za-zÀ-ÿ]{2}/.test(t)) return brut;
  const en = STRINGS[t];
  if (typeof en !== 'string') { if (SIGNALER) MANQUANTS.add(t); return brut; }
  const avant = brut.match(/^\s*/)[0], apres = brut.match(/\s*$/)[0];
  return avant + (attr ? encodeAttr(en) : encodeText(en)) + apres;
}

// Adresse anglaise d'une page française (null si la page n'existe qu'en français).
export const enPath = (path) => (FR_ONLY.test(path) ? null : path === '/404.html' ? '/en/404.html' : `/en${path}`);

// Lien interne → version anglaise quand elle existe.
function lienAnglais(href, pagesEn) {
  const m = href.match(/^(\/[^?#]*)([?#].*)?$/);
  if (!m || /^\/(en\/|images\/|assets\/|api\/)/.test(m[1]) || m[1] === '/en') return href;
  if (m[1].startsWith('/produit/')) return `/en${href}`;
  return pagesEn.has(m[1]) ? `/en${m[1]}${m[2] || ''}` : href;
}

const ATTRS = /(\s(?:alt|title|aria-label|placeholder|data-label)=")([^"]*)(")/g;

// Lien vers l'autre langue + balises hreflang, sur les deux versions.
function alternates(html, frPath, siteUrl) {
  const en = enPath(frPath);
  if (!en || frPath.endsWith('.html')) return html;
  return html.replace('</head>', `<link rel="alternate" hreflang="fr" href="${siteUrl}${frPath}">\n<link rel="alternate" hreflang="en" href="${siteUrl}${en}">\n<link rel="alternate" hreflang="x-default" href="${siteUrl}${frPath}">\n</head>`);
}

export function pageFrancaise(html, frPath, siteUrl) {
  const en = enPath(frPath);
  if (!en) return html;
  return alternates(html, frPath, siteUrl).replace('<div class="header-actions">', `<div class="header-actions">\n    <a class="lang-link" href="${en}" hreflang="en" lang="en" title="English version">EN</a>`);
}

// Traduit une page complète.
export function pageAnglaise(html, frPath, siteUrl, pagesEn, { signaler = true } = {}) {
  SIGNALER = signaler;
  const en = enPath(frPath);
  let out = alternates(html, frPath, siteUrl)
    .replace('<html lang="fr">', '<html lang="en">')
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${siteUrl}${en}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${siteUrl}${en}$2`)
    .replace('<meta property="og:site_name"', '<meta property="og:locale" content="en_GB">\n<meta property="og:site_name"');
  // Textes des balises meta (titre et description de partage).
  out = out.replace(/(<meta (?:name|property)="(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)" content=")([^"]*)(")/g, (_, a, v, b) => a + traduire(v, true) + b);
  out = out.replace(/<title>([\s\S]*?)<\/title>/, (_, t) => `<title>${traduire(t)}</title>`);
  // Le reste : texte visible et attributs, hors scripts et styles.
  out = out.replace(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head>[\s\S]*?<\/head>)|(<[^>]+>)|([^<]+)/g, (m, brut, tag, texte) => {
    if (brut) return brut;
    if (tag) {
      return tag
        .replace(ATTRS, (_, a, v, b) => a + traduire(v, true) + b)
        .replace(/(\shref=")(\/[^"]*)(")/g, (_, a, v, b) => a + lienAnglais(v, pagesEn) + b);
    }
    return traduire(texte);
  });
  out = out.replace('<div class="header-actions">', `<div class="header-actions">\n    <a class="lang-link" href="${frPath}" hreflang="fr" lang="fr" title="Version française">FR</a>`);
  // Le dictionnaire du navigateur traduit les textes ajoutés après le chargement (catalogue, panier…).
  out = out.replace('</head>', '<script src="/assets/i18n.js" defer></script>\n</head>');
  if (/class="article legal"/.test(out)) {
    out = out.replace(/(<article class="article legal">(?:<p class="draft-banner">[\s\S]*?<\/p>)?<h1>[\s\S]*?<\/h1>)/, '$1<p class="lang-note">This English translation is provided for convenience. The French version is the only legally binding one.</p>');
  }
  return out;
}

// Version anglaise d'une fiche produit (champs absents : on garde le français).
export function produitAnglais(p) {
  const t = PRODUCTS[p.slug];
  if (!t) return p;
  const gallery = Array.isArray(p.gallery)
    ? p.gallery.map((g, i) => (g && typeof g === 'object' && t.alts?.[i] ? { ...g, alt: t.alts[i] } : g))
    : p.gallery;
  const metadata = { ...(p.metadata || {}) };
  for (const k of ['craft', 'origin', 'designers']) if (t[k] && metadata[k]) metadata[k] = t[k];
  return { ...p, name: t.name || p.name, subtitle: p.subtitle ? t.subtitle || p.subtitle : p.subtitle, description: p.description ? t.description || p.description : p.description, gallery, metadata };
}
