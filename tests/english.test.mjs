import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageAnglaise, pageFrancaise, produitAnglais, enPath, STRINGS, PRODUCTS } from '../build/english.mjs';

const html = `<!doctype html>
<html lang="fr">
<head><title>Le Grenier des Trouvailles</title><link rel="canonical" href="https://x.fr/grenier/"></head>
<body><header><div class="header-actions"><a href="/mon-espace/">Se connecter</a></div></header>
<main><img src="/images/a.webp" alt="Le Grenier des Trouvailles"><a href="/grenier/#musique">Le Grenier des Trouvailles</a> <a href="/admin.html">admin</a></main></body></html>`;

test('page anglaise : langue, liens, textes et lien FR', () => {
  const pages = new Set(['/grenier/', '/mon-espace/']);
  const en = pageAnglaise(html, '/grenier/', 'https://x.fr', pages);
  assert.match(en, /<html lang="en">/);
  assert.match(en, /href="https:\/\/x\.fr\/en\/grenier\/"/);
  assert.match(en, /<a href="\/en\/grenier\/#musique">The Attic of Finds<\/a>/);
  assert.match(en, /alt="The Attic of Finds"/);
  assert.match(en, /<a href="\/en\/mon-espace\/">Sign in<\/a>/);
  assert.match(en, /href="\/admin\.html"/);
  assert.match(en, /<a class="lang-link" href="\/grenier\/" hreflang="fr"/);
  assert.match(en, /hreflang="en" href="https:\/\/x\.fr\/en\/grenier\/"/);
  assert.match(en, /\/assets\/i18n\.js/);
});

test('page française : lien EN, pas pour les outils privés', () => {
  assert.match(pageFrancaise(html, '/grenier/', 'https://x.fr'), /<a class="lang-link" href="\/en\/grenier\/" hreflang="en"/);
  assert.equal(enPath('/tableau-de-bord.html'), null);
  assert.equal(enPath('/confidences-lamia/'), null);
});

test('fiche produit traduite, champs manquants gardés', () => {
  const slug = Object.keys(PRODUCTS)[0];
  const p = produitAnglais({ slug, name: 'nom', subtitle: null, description: 'desc', gallery: [{ url: '/a', alt: 'fr' }], metadata: {} });
  assert.equal(p.name, PRODUCTS[slug].name);
  assert.equal(p.subtitle, null);
  assert.deepEqual(produitAnglais({ slug: 'inconnu', name: 'x' }), { slug: 'inconnu', name: 'x' });
});

test('dictionnaire : aucune traduction vide', () => {
  for (const [fr, en] of Object.entries(STRINGS)) assert.ok(typeof en === 'string' && en.trim(), fr);
});
