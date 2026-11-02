import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// render() repasse à chaque événement de connexion : un écouteur ajouté sur un bloc qui reste en place
// faisait partir chaque message en trois exemplaires.
test('Mon espace : aucun écouteur empilé sur les blocs recréés à chaque connexion', () => {
  const s = readFileSync(new URL('../src/espace.js', import.meta.url), 'utf8');
  assert.doesNotMatch(s, /^\s*box\.addEventListener\(/m);
});
