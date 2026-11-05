import test from 'node:test';
import assert from 'node:assert/strict';
import { choixPropres, versOutil, potentiel, fichePotentiel, lib } from '../content/matching-options.mjs';

test('secteur d’activité et situation administrative : seules les valeurs connues passent', () => {
  const m = choixPropres({ secteurPro: 'Sante', situationAdministrative: 'Situation administrative stable', situationAdminRecherche: 'Situation administrative stable' });
  assert.equal(m.secteurPro, 'Sante');
  assert.equal(m.situationAdministrative, 'Situation administrative stable');
  assert.equal(m.situationAdminRecherche, 'Situation administrative stable');
  const x = choixPropres({ secteurPro: 'Pirate', situationAdministrative: 'Sans papiers', situationAdminRecherche: 'oui' });
  assert.deepEqual([x.secteurPro, x.situationAdministrative, x.situationAdminRecherche], ['', '', '']);
  // La caractéristique « Stable » garde son libellé.
  assert.equal(lib('Stable'), 'Stable');
});

test('export vers l’outil : secteur dans la profession, papiers et accord live dans les notes privées', () => {
  const base = { ref: 12, prenom: 'Nina', genre: 'femme', medias: [], matching: { secteurPro: 'Sante', profession: 'Infirmière', situationAdministrative: 'Pas encore stable' } };
  const sans = versOutil(base);
  assert.equal(sans.profession, 'Santé – Infirmière');
  assert.match(sans.notes, /Situation administrative \(privée, jamais en live\) : Pas encore stable/);
  assert.match(sans.notes, /N’a PAS accepté d’être présenté\(e\) en live/);
  const avec = versOutil({ ...base, live_ok: true, live_ok_at: '2026-11-05T10:00:00Z' });
  assert.match(avec.notes, /Accepte d’être présenté\(e\) en live \(accord du 2026-11-05\)/);
});

test('matching : « situation administrative stable » recherchée devient un point de vigilance, jamais un refus', () => {
  const A = fichePotentiel({ matching: { situationAdminRecherche: 'Situation administrative stable' } }, { age: 30 });
  const ok = potentiel(A, fichePotentiel({ matching: { situationAdministrative: 'Situation administrative stable' } }, { age: 30 }));
  const ko = potentiel(A, fichePotentiel({ matching: { situationAdministrative: 'Pas encore stable' } }, { age: 30 }), { a: 'A', b: 'B' });
  assert.ok(ok.score > ko.score);
  assert.ok(ko.vigilance.some((v) => /administrative/.test(v)));
});
