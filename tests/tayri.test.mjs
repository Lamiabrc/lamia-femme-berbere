import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationTayri, rubriqueTayri, habillerPageStatique, universTayri, entreeTayri } from '../build/tayri.mjs';

test('Boutique reste le repère actif des trois rayons et des fiches, dans chaque langue', () => {
  for (const prefix of ['', '/en', '/ar', '/kab']) {
    for (const path of ['/boutique/', '/ecrin/', '/bibliotheque/', '/grenier/', '/produit/un-produit/']) {
      assert.equal(rubriqueTayri(prefix + path), 'boutique');
      const nav = navigationTayri(prefix + path);
      assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
      assert.match(nav, /href="\/boutique\/" aria-current="page"/);
    }
  }
});

test('Couple garde son propre repère dans la présentation comme dans l’espace privé', () => {
  for (const path of ['/espace-couple/', '/notre-couple/', '/en/notre-couple/']) assert.equal(rubriqueTayri(path), 'couple');
});

test('les ambiances suivent le parcours réel malgré les anciennes pièces réutilisées', () => {
  assert.equal(universTayri('/espace-couple/', { slug: 'hall' }), 'couple');
  assert.equal(universTayri('/ar/mon-espace/', { slug: 'patio' }), 'compte');
  assert.equal(universTayri('/en/produit/livre/', { slug: 'bibliotheque' }), 'bibliotheque');
  assert.equal(universTayri('/confidences/', { slug: 'patio' }), 'confidences');
  assert.equal(entreeTayri('/'), '');
});

test('les trois rayons restent accessibles depuis chaque famille de fiche produit', () => {
  for (const slug of ['ecrin', 'bibliotheque', 'grenier']) {
    const nav = entreeTayri('/produit/une-piece/', { slug });
    for (const href of ['/boutique/', '/ecrin/', '/bibliotheque/', '/grenier/']) assert.ok(nav.includes(`href="${href}"`));
    assert.doesNotMatch(nav, /aria-current="page"/);
  }
});

test('les commandes de compte et notifications restent disponibles dans la navigation mobile', () => {
  const nav = navigationTayri('/mon-espace/', { mobile: true });
  assert.match(nav, /data-barre-compte data-barre-messages aria-current="page"/);
  assert.match(nav, /data-barre-point hidden/);
  assert.equal((nav.match(/<a /g) || []).length, 5);
});

test('l’habillage des outils conserve le formulaire et ses scripts, et ignore les fichiers de vérification', () => {
  const form = '<form id="login"><input type="password"><button>Connexion</button></form>';
  const script = '<script type="module">window.example = 1;</script>';
  const html = habillerPageStatique('<html><head><title>Pilotage</title></head><body class="outil">' + form + script + '</body></html>');
  assert.match(html, /class="outil tayri-shell tayri-autonome tayri-administration"/);
  assert.ok(html.includes(form));
  assert.ok(html.includes(script));
  assert.equal(habillerPageStatique('google-site-verification: verification.html'), 'google-site-verification: verification.html');
});
