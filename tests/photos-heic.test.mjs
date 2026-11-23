import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('HEIC : converti en JPEG à l’envoi quand le navigateur sait le lire (iPhone)', () => {
  const s = lire('../src/annonces.js');
  assert.doesNotMatch(s, /!\/heic\|heif\|gif\//);
  assert.match(s, /type\.startsWith\('image\/'\) && !\/gif\/\.test\(type\)/);
});
test('Mes photos : une photo HEIC est expliquée et remplaçable, une image cassée aussi', () => {
  const s = lire('../src/espace.js');
  assert.match(s, /ton téléphone ne sait pas l’afficher/); assert.match(s, /data-photo-illisible/); assert.match(s, /addEventListener\('error'/);
});
test('retrait d’une photo illisible : seulement les siennes, seulement HEIC/HEIF', () => {
  const s = lire('../lib/annonces.mjs');
  const i = s.indexOf("action === 'annonce_photo_illisible'");
  const bloc = s.slice(i, i + 900);
  assert.match(bloc, /login_required/); assert.match(bloc, /hei\[cf\]/); assert.match(bloc, /monProfil\(\)/);
  assert.match(s, /select=id,kind,storage_path,position,mime/);
});
