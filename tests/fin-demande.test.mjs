/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { finDemande } from '../lib/annonces.mjs';

test('une demande sans suite dit clairement ce qui s’est passé', () => {
  const pc = (x) => finDemande({ statut: 'pas_compatible', ...x });
  assert.equal(pc({ reponse: 'non', annule_motif: 'A répondu « pas pour moi »' }), 'autre');
  assert.equal(pc({ avis_ok_cible: false, annule_motif: 'Différence refusée par la personne' }), 'autre');
  assert.equal(pc({ avis_ok_demandeur: false, annule_motif: 'Différence refusée par la personne' }), 'moi');
  assert.equal(pc({ annule_motif: 'Annulé par Lamia' }), 'lamia');
  assert.equal(pc({}), 'indispo'); // blocage ou compte supprimé : on ne dit pas lequel
  assert.equal(finDemande({ statut: 'dematche' }), null);
});
