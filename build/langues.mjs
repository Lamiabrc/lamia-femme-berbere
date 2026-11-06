// Versions arabe (/ar/…) et kabyle (/kab/…) du parcours des rencontres.
// Même principe que la version anglaise : les pages françaises sont traduites à partir d'un
// dictionnaire français → langue (content/<langue>/strings.json). Un texte absent reste en français.
// Le kabyle reste hors menu et hors Google tant que Lamia ne l'a pas relu (publie: false).

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => (existsSync(join(ROOT, f)) ? JSON.parse(readFileSync(join(ROOT, f), 'utf8')) : {});

export const PAGES_RENCONTRES = ['/', '/rencontres/', '/rencontres/swipe/', '/rencontres/confirmer/', '/rencontres/visio/', '/mon-espace/', '/abonnement/', '/abonnement/merci/', '/application/', '/hors-ligne/', '/speed-dating/', '/speed-dating/inscription/', '/speed-dating/merci/', '/speed-dating/bal/', '/speed-dating/salle/', '/speed-dating/souhaits/', '/salon/', '/confidences/', '/nouveautes/', '/rencontre-kabyle-algerie/', '/rencontre-kabyle-canada/', '/rencontre-kabyle-europe/', '/lamia-brechet/', '/guides/mariage-kabyle/', '/guides/france-algerie/'];

export const LANGUES = {
  ar: { dir: 'rtl', etiquette: 'العربية', court: 'ع', titre: 'النسخة العربية', og: 'ar_DZ', publie: true },
  kab: { dir: 'ltr', etiquette: 'Taqbaylit', court: 'ⵣ', titre: 'Taqbaylit', og: 'fr_FR', publie: false },
};
export const LANGUES_PUBLIEES = Object.keys(LANGUES).filter((l) => LANGUES[l].publie);
export const dictionnaire = (l) => lire(`content/${l}/strings.json`);
export const motifs = (l) => lire(`content/${l}/motifs.json`);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encodeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encodeAttr = (s) => encodeText(s).replace(/"/g, '&quot;');
const ATTRS = /(\s(?:alt|title|aria-label|placeholder|data-label)=")([^"]*)(")/g;

// Tous les textes d'une page française (pour préparer les traductions).
export function textesDePage(html) {
  const vus = new Set();
  const noter = (b) => { const t = norm(decode(b)); if (t && /[A-Za-zÀ-ÿ]{2}/.test(t)) vus.add(t); };
  html.replace(/(<meta (?:name|property)="(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)" content=")([^"]*)(")/g, (_, a, v) => { noter(v); return ''; });
  html.replace(/<title>([\s\S]*?)<\/title>/, (_, t) => { noter(t); return ''; });
  html.replace(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head>[\s\S]*?<\/head>)|(<[^>]+>)|([^<]+)/g, (m, brut, tag, texte) => {
    if (brut) return m;
    if (tag) tag.replace(ATTRS, (_, a, v) => { noter(v); return ''; }); else noter(texte);
    return m;
  });
  return vus;
}

export function pageTraduite(html, frPath, siteUrl, langue, D, manquants) {
  const L = LANGUES[langue];
  const chemin = `/${langue}${frPath}`;
  const dedans = new Set(PAGES_RENCONTRES);
  const traduire = (brut, attr = false) => {
    const t = norm(decode(brut));
    if (!t || !/[A-Za-zÀ-ÿ]{2}/.test(t)) return brut;
    const v = D[t];
    if (typeof v !== 'string') { manquants.add(t); return brut; }
    return brut.match(/^\s*/)[0] + (attr ? encodeAttr(v) : encodeText(v)) + brut.match(/\s*$/)[0];
  };
  const lien = (href) => {
    const m = href.match(/^(\/[^?#]*)([?#].*)?$/);
    if (!m || !dedans.has(m[1])) return href;
    return `/${langue}${m[1]}${m[2] || ''}`;
  };
  let out = html
    .replace('<html lang="fr">', `<html lang="${langue}" dir="${L.dir}">`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${siteUrl}${chemin}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${siteUrl}${chemin}$2`)
    .replace('<meta property="og:site_name"', `<meta property="og:locale" content="${L.og}">\n<meta property="og:site_name"`);
  if (!L.publie) out = out.replace('</head>', '<meta name="robots" content="noindex, nofollow">\n</head>');
  out = out.replace(/(<meta (?:name|property)="(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)" content=")([^"]*)(")/g, (_, a, v, b) => a + traduire(v, true) + b);
  out = out.replace(/<title>([\s\S]*?)<\/title>/, (_, t) => `<title>${traduire(t)}</title>`);
  out = out.replace(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head>[\s\S]*?<\/head>)|(<[^>]+>)|([^<]+)/g, (m, brut, tag, texte) => {
    if (brut) return brut;
    if (tag) return tag.replace(ATTRS, (_, a, v, b) => a + traduire(v, true) + b).replace(/(\shref=")(\/[^"]*)(")/g, (_, a, v, b) => a + lien(v) + b);
    return traduire(texte);
  });
  out = out.replace(/<a class="lang-link"[^>]*>[^<]*<\/a>/, '');
  out = out.replace('<div class="header-actions">', `<div class="header-actions">\n    <a class="lang-link" href="${frPath}" hreflang="fr" lang="fr" title="Version française">FR</a>`);
  return out.replace('</head>', '<script src="/assets/i18n.js" defer></script>\n</head>');
}

// Lien vers l'arabe (et le kabyle une fois relu) sur les pages françaises du parcours.
export function liensLangues(html, frPath, siteUrl) {
  if (!PAGES_RENCONTRES.includes(frPath)) return html;
  const liens = LANGUES_PUBLIEES.map((l) => `<a class="lang-link" href="/${l}${frPath}" hreflang="${l}" lang="${l}" title="${LANGUES[l].titre}">${LANGUES[l].court}</a>`).join('\n    ');
  const alternates = LANGUES_PUBLIEES.map((l) => `<link rel="alternate" hreflang="${l === 'ar' ? 'ar' : l}" href="${siteUrl}/${l}${frPath}">`).join('\n');
  return html.replace('</head>', `${alternates}\n</head>`).replace('<div class="header-actions">', `<div class="header-actions">\n    ${liens}`);
}
