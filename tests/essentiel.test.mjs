import test from 'node:test';
import assert from 'node:assert/strict';
import { essentielManquant } from '../lib/annonces.mjs';

// Retour d'une membre (15 nov. 2026) : matchée avec un profil presque vide. L'essentiel doit être là avant d'être proposé.
test('profil presque vide : religion, études, situation et âge recherché manquent', () => {
  const vide = { matching: { religion: '', niveauEtudeCategorie: '', situation: '' }, age_min: null, age_max: null };
  assert.deepEqual(essentielManquant(vide), ['religion', 'études', 'situation', 'âge recherché']);
});
test('profil complet : rien ne manque ; fiche du live : jamais bloquée', () => {
  const ok = { matching: { religion: 'Islam', niveauEtudeCategorie: 'Universitaire', situation: 'Divorce(e)' }, age_min: 36, age_max: 45 };
  assert.deepEqual(essentielManquant(ok), []);
  assert.deepEqual(essentielManquant({ fiche_ref: 5001, matching: { religion: '' } }), []);
});
