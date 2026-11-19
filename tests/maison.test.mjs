// Vérifie que la Maison se génère correctement et ne contient aucun secret.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rooms } from '../content/rooms.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
execFileSync(process.execPath, [join(ROOT, 'build/build.mjs')], { stdio: 'ignore' });

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

test('chaque pièce a sa page', () => {
  for (const r of rooms) {
    const file = r.path === '/' ? join(DIST, 'index.html') : join(DIST, r.path, 'index.html');
    assert.ok(existsSync(file), `page manquante : ${r.path}`);
    const expected = r.slug === 'speed-dating' ? 'Le Boudoir des Rencontres' : (r.headline || r.welcome);
    assert.match(readFileSync(file, 'utf8'), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/’/g, '&#39;|’')));
  }
});

test('les anciennes adresses publiques sont conservées', () => {
  for (const p of ['werdi-ouvre-les-yeux', 'lamia-brechet']) assert.ok(existsSync(join(DIST, p, 'index.html')));
  assert.ok(existsSync(join(DIST, 'admin.html')), 'tableau des alertes conservé');
});

test('aucun secret dans les fichiers publiés', () => {
  const forbidden = [/sk_(live|test)_[A-Za-z0-9]{10,}/, /service_role/i, /SUPABASE_SERVICE_ROLE_KEY/, /whsec_[A-Za-z0-9]{10,}/];
  for (const f of files(DIST).filter((x) => /\.(html|js|css|json|xml|txt)$/.test(x))) {
    const s = readFileSync(f, 'utf8');
    for (const re of forbidden) assert.doesNotMatch(s, re, `${f} contient ${re}`);
  }
});

test('les pièces prévues ne proposent rien à acheter', () => {
  for (const r of rooms.filter((x) => x.status === 'soon')) {
    const html = readFileSync(join(DIST, r.path, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /data-products=/);
  }
});

test('toutes les pages HTML partagent le socle TAYRI, y compris produits et outils autonomes', () => {
  for (const f of files(DIST).filter((x) => x.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    if (!/<html\b/i.test(html)) continue; // fichier de vérification Google, pas un écran
    assert.match(html, /class="[^"]*\btayri-shell\b/, `cadre absent : ${f}`);
    assert.match(html, /href="\/assets\/tayri\.css(?:\?[^\"]*)?"/, `style absent : ${f}`);
  }
});

test('accueil TAYRI : accès directs, boutique complète et profils conservés sans porte à franchir', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.ok(html.indexOf('class="tayri-accueil"') < html.indexOf('data-swipe-accueil'));
  for (const route of ['/rencontres/', '/espace-couple/', '/boutique/', '/ecrin/', '/bibliotheque/', '/grenier/', '/mon-espace/']) assert.ok(html.includes(`href="${route}"`), route);
  assert.match(html, /src="\/images\/marque\/tayri-coeur.webp"/);
  assert.doesNotMatch(html, /data-entree(?:\s|>)/);
});

test('les scripts des pages autonomes sont conservés à l’identique', () => {
  const scripts = (html) => html.match(/<script\b[\s\S]*?<\/script>/gi) || [];
  for (const file of ['admin.html', 'admin-bal.html', 'admin-soirees.html', 'pilotage.html', 'tableau-de-bord.html', 'salle-coaching.html', 'salle-soiree.html', 'securite-enfants/index.html']) {
    assert.deepEqual(scripts(readFileSync(join(DIST, file), 'utf8')), scripts(readFileSync(join(ROOT, 'public', file), 'utf8')), file);
  }
});
