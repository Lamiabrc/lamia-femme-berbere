import test from 'node:test';
import assert from 'node:assert/strict';
import { choixPropres, versOutil, potentiel, fichePotentiel, religionsAccepteesDe, O } from '../content/matching-options.mjs';

test('plusieurs religions acceptées : gardées, nettoyées, résumées', () => {
  const m = choixPropres({ religion: 'Islam', pratique: 'Pratique moderee', religionsAcceptees: ['Islam', 'Agnostique', 'Laique', 'Pirate'], fermeDifferencePratique: 'Non' });
  assert.deepEqual(m.religionsAcceptees, ['Islam', 'Agnostique', 'Laique']);
  assert.equal(m.religionRecherche, '');
  assert.equal(m.fermeDifferencePratique, 'Non');
  assert.deepEqual(choixPropres({ religionsAcceptees: ['Islam'] }).religionRecherche, 'Islam');
  assert.equal(choixPropres({ religionsAcceptees: [] }).religionRecherche, 'Pas important');
});

test('« Autre » : la précision est gardée seulement si Autre est choisi', () => {
  assert.equal(choixPropres({ religion: 'Autre', religionAutre: 'Yézidisme' }).religionAutre, 'Yézidisme');
  assert.equal(choixPropres({ religion: 'Islam', religionAutre: 'Yézidisme' }).religionAutre, '');
  assert.equal(choixPropres({ religionsAcceptees: ['Autre'], religionRechercheAutre: 'Sikhisme' }).religionRechercheAutre, 'Sikhisme');
});

test('anciennes fiches : la religion recherchée unique devient la liste', () => {
  assert.deepEqual(religionsAccepteesDe({ religionRecherche: 'Islam' }), ['Islam']);
  assert.deepEqual(religionsAccepteesDe({ religionRecherche: 'Pas important' }), []);
  assert.ok(O.religion.includes('Laique') && O.religion.includes('Judaisme'));
});

test('export vers l’outil : la liste et « fermé à la différence » partent dans la fiche', () => {
  const fiche = versOutil({ ref: 7, prenom: 'Test', genre: 'homme', matching: choixPropres({ religion: 'Islam', religionsAcceptees: ['Islam', 'Laique'], fermeDifferencePratique: 'Oui' }) });
  assert.deepEqual(fiche.religionsAcceptees, ['Islam', 'Laique']);
  assert.equal(fiche.fermeDifferencePratique, 'Oui');
});

test('potentiel du site : religion non acceptée = point rédhibitoire', () => {
  const A = fichePotentiel({ matching: choixPropres({ religion: 'Islam', religionsAcceptees: ['Islam', 'Agnostique', 'Laique'] }) }, { age: 35 });
  const agn = fichePotentiel({ matching: choixPropres({ religion: 'Agnostique' }) }, { age: 33 });
  const chr = fichePotentiel({ matching: choixPropres({ religion: 'Chretienne' }) }, { age: 33 });
  assert.ok(potentiel(A, agn).score > potentiel(A, chr).score);
  assert.ok(potentiel(A, chr).vigilance.some((v) => v.includes('pas acceptée')));
});
