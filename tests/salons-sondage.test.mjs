import test from 'node:test';
import assert from 'node:assert/strict';
import { placesRestantes, sondage, MAX_PAR_GENRE } from '../lib/salons.mjs';

test('places restantes : 10 femmes et 10 hommes au plus par salon', () => {
  const l = [{ genre: 'femme' }, { genre: 'homme' }, { genre: 'homme' }];
  assert.deepEqual(placesRestantes(l), { femmes: MAX_PAR_GENRE - 1, hommes: MAX_PAR_GENRE - 2 });
  assert.deepEqual(placesRestantes(Array.from({ length: 12 }, () => ({ genre: 'homme' }))), { femmes: 10, hommes: 0 });
});

test('sondage : compte les préférences, ignore les réponses absentes', () => {
  assert.deepEqual(sondage([{ prefere_jour: 'weekend' }, { prefere_jour: 'weekend' }, { prefere_jour: 'semaine' }, {}]), { weekend: 2, semaine: 1, indifferent: 0 });
});
