import test from 'node:test';
import assert from 'node:assert/strict';
import { profilDepuisAnnonce, profilDepuisFiche, compatiblesDe } from '../lib/matching-direct.mjs';

const annonce = (ref, genre, age, ville, extra = {}) => ({ ref, prenom: `P${ref}`, genre, age, ville, pays: 'France', status: 'publiee', matching: { religion: 'Musulman', ...(extra.matching || {}) }, ...extra, medias: [{ kind: 'photo' }] });

test('un homme et une femme compatibles se trouvent', async () => {
  const h = await profilDepuisAnnonce(annonce(1, 'homme', 32, 'Lyon', { age_min: 25, age_max: 35 }));
  const f = await profilDepuisAnnonce(annonce(2, 'femme', 28, 'Lyon', { age_min: 28, age_max: 40 }));
  const r = await compatiblesDe(h, [h, f], { minScore: 0 });
  assert.equal(r.compatibles.length + r.unCritere.length >= 1, true);
  assert.equal((r.compatibles[0] || r.unCritere[0]).ref, 2);
});

test('deux hommes ne sont jamais compatibles', async () => {
  const a = await profilDepuisAnnonce(annonce(1, 'homme', 30, 'Paris'));
  const b = await profilDepuisAnnonce(annonce(3, 'homme', 31, 'Paris'));
  const r = await compatiblesDe(a, [a, b]);
  assert.equal(r.compatibles.length, 0);
});

test('une religion différente bloque', async () => {
  const h = await profilDepuisAnnonce(annonce(1, 'homme', 30, 'Paris', { matching: { religion: 'Musulman', religionRecherche: 'Musulman' } }));
  const f = await profilDepuisAnnonce(annonce(4, 'femme', 29, 'Paris', { matching: { religion: 'Chrétien' } }));
  const r = await compatiblesDe(h, [h, f]);
  assert.equal(r.compatibles.length, 0);
});

test('une fiche de l’outil est convertie', async () => {
  const p = await profilDepuisFiche({ ref: 5161, genre: 'femme', age: 30, pays: 'France', ville: 'Lyon', caracteristiques: 'calme, drôle', visible: true });
  assert.equal(p.sexe, 'Femme');
  assert.equal(p.id, 'f-5161');
  assert.deepEqual(p.caracteristiques, ['calme', 'drôle']);
});

test('une fiche en match est exclue', async () => {
  const h = await profilDepuisAnnonce(annonce(1, 'homme', 32, 'Lyon'));
  const f = await profilDepuisFiche({ ref: 5200, genre: 'femme', age: 28, ville: 'Lyon', pays: 'France', match_live_at: '2026-11-20' });
  const r = await compatiblesDe(h, [h, f]);
  assert.equal(r.compatibles.length, 0);
});
