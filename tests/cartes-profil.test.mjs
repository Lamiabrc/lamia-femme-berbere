import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Menu du profil : chaque champ du matching est dans une carte, et dans une seule (pas de doublon).
const src = readFileSync(new URL('../public/completer-profil.js', import.meta.url), 'utf8');
const etapes = src.slice(src.indexOf('const ETAPES = ['), src.indexOf('const ITEMS'));
const cartes = src.slice(src.indexOf('export const CARTES'), src.indexOf('].map((c) =>'));
const champs = [...etapes.matchAll(/\['[cblh]', '([A-Za-z_]+)'/g)].map((m) => m[1]);
const rangés = [...cartes.matchAll(/cles: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([A-Za-z_]+)'/g)].map((x) => x[1]));

test('menu du profil : tous les champs sont dans une carte, aucun n’est dans deux', () => {
  assert.deepEqual(champs.filter((k) => !rangés.includes(k)), []);
  assert.deepEqual(rangés.filter((k) => !champs.includes(k)), []);
  assert.equal(new Set(rangés).size, rangés.length);
});
