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

test('des champs de fiche en liste, nombre ou vides ne font pas planter le calcul', async () => {
  const h = await profilDepuisAnnonce(annonce(20, 'homme', 33, 'Lyon'));
  const f = await profilDepuisFiche({ ref: 5300, genre: 'femme', age: 29, ville: null, pays: 'France', origine: ['Kabyle (Algerie)'], etudes: 3, situation: null, profil: ['a', 'b'], recherche: 12, metier: ['x'], religion: ['Islam'], caracteristiques: null, mode_vie: ['Fumeur: non'], village: 7 });
  const g = await profilDepuisAnnonce(annonce(21, 'femme', 30, 'Lyon', { matching: { origineTags: 'Kabyle', caracteristiques: 'calme', hygieneVie: 3 }, profil: ['texte'], recherche: 5, ville: 8 }));
  const r = await compatiblesDe(h, [h, f, g]);
  assert.ok(Array.isArray(r.compatibles));
import { choixPropres } from '../content/matching-options.mjs';

test('les champs facultatifs du formulaire passent jusqu’au moteur', async () => {
  const m = choixPropres({ religion: 'Islam', situationAdministrative: 'RAS', rapportReseaux: ['Pas de réseaux sociaux', 'inconnu'], belleFamille: 'Proche de ma famille', fumeurRecherche: 'Fumeur: non', tailleMinRechercheCm: '170' });
  assert.deepEqual(m.rapportReseaux, ['Pas de réseaux sociaux']);
  assert.equal(m.tailleMinRechercheCm, 170);
  const p = await profilDepuisAnnonce(annonce(10, 'femme', 29, 'Lyon', { matching: m }));
  assert.equal(p.situationAdministrative, 'OK');
  assert.equal(p.belleFamille, 'Proche de ma famille');
  assert.deepEqual(p.hygieneVieRecherche, ['Fumeur: non']);
  const dn = await profilDepuisAnnonce(annonce(11, 'homme', 33, 'Lyon', { matching: choixPropres({ situationAdministrative: 'Double nationalité' }) }));
  assert.equal(dn.situationAdministrative, 'Double nationalité');
});

test('un fumeur est bloqué si la personne veut un non-fumeur (mode de vie recherché)', async () => {
  const elle = await profilDepuisAnnonce(annonce(12, 'femme', 29, 'Lyon', { matching: choixPropres({ religion: 'Islam', fumeurRecherche: 'Fumeur: non' }) }));
  const lui = await profilDepuisAnnonce(annonce(13, 'homme', 32, 'Lyon', { matching: choixPropres({ religion: 'Islam', fumeur: 'Fumeur: oui' }) }));
  const r = await compatiblesDe(elle, [elle, lui]);
  assert.equal(r.compatibles.length, 0);
});
