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
});

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

test('Match en direct : ni la vérification de l’outil, ni « n’importe où », ni les places pleines ne bloquent', async () => {
  const lui = await profilDepuisAnnonce(annonce(30, 'homme', 38, 'Paris', { en_match: true, matching: { religion: 'Islam', zoneGeo: "N'importe ou", origineTags: ['Kabyle (Algerie)'] } }));
  const fiche = await profilDepuisFiche({ ref: 5400, genre: 'femme', age: 33, ville: 'Lyon', pays: 'France', secteur: 'France', religion: 'Islam', origine: ['Kabyle (Algerie)'], age_min: 30, age_max: 45 });
  assert.equal(lui.statut, 'Nouveau');
  assert.equal(lui.placesPleines, true);
  const r = await compatiblesDe(lui, [lui, fiche]);
  assert.equal(r.compatibles.length, 1);
  assert.equal(r.compatibles[0].ref, 5400);
});

test('une femme qui veut vivre en France n’est pas compatible avec un homme au Canada, mais il reste « à un critère près »', async () => {
  const lui = await profilDepuisAnnonce(annonce(31, 'homme', 38, 'Windsor', { pays: 'Canada', matching: { religion: 'Islam', zoneGeo: "N'importe ou" } }));
  const fiche = await profilDepuisFiche({ ref: 5401, genre: 'femme', age: 33, ville: 'Lyon', pays: 'France', secteur: 'France', religion: 'Islam', age_min: 30, age_max: 45 });
  const r = await compatiblesDe(lui, [lui, fiche]);
  assert.equal(r.compatibles.length, 0);
  assert.equal(r.unCritere.length, 1);
});

import { controlesPaire, manques as manquesProfil } from '../lib/matching-direct.mjs';
test('contrôles stricts : âge à ±2 ans, secteur, infos manquantes', () => {
  const a = { age: 30, ageMin: 28, ageMax: 35, zoneGeo: 'France', pays: 'France' };
  assert.equal(controlesPaire(a, { age: 37, ageMin: 25, ageMax: 40, zoneGeo: 'France', pays: 'France' }).age.etat, 'ok');
  assert.equal(controlesPaire(a, { age: 38, ageMin: 25, ageMax: 40, zoneGeo: 'France', pays: 'France' }).age.etat, 'hors');
  assert.equal(controlesPaire(a, { age: 33, ageMin: 25, ageMax: 40, zoneGeo: 'France', pays: 'Algerie' }).secteur.etat, 'hors');
  assert.equal(controlesPaire(a, { age: 33, ageMin: null, ageMax: null, zoneGeo: '', pays: 'France' }).age.etat, 'inconnu');
  assert.ok(manquesProfil({ age: 30 }).includes('secteur recherché'));
});

test('fiche : pseudo, lien réseau privé et matching complet alimentent le moteur', async () => {
  const p = await profilDepuisFiche({ ref: 5200, genre: 'femme', age: 31, pays: 'France', ville: 'Paris', pseudo: 'Tala', lien_reseau: 'https://www.tiktok.com/@tala.live', matching: { belleFamille: 'Je préfère ne pas dire', tailleMinRechercheCm: 175, kabyleUniquement: true } });
  assert.equal(p.prenom, 'Tala');
  assert.equal(p.tiktokAccountId, 'tala.live');
  assert.equal(p.kabyleUniquement, true);
  assert.equal(p.tailleMinRechercheCm, 175);
  const sans = await profilDepuisFiche({ ref: 5201, genre: 'homme', age: 40, pays: 'France' });
  assert.equal(sans.prenom, 'Fiche 5201');
  assert.ok(sans.contactAutre);
});

import { choixPropres as choixTest, versOutil as versTest } from '../content/matching-options.mjs';
test('exigences absolues et refus comme dans l’outil : gardés, nettoyés, transmis au moteur', async () => {
  const c = choixTest({ hardPreferences: ['age', 'location', 'inconnu'], refuseDivorce: true, accepteVeuf: true, refuseVeuf: true, religionsAcceptees: ['Islam', 'zzz'] });
  assert.deepEqual(c.hardPreferences, ['age', 'location']);
  assert.equal(c.refuseDivorce, true);
  assert.equal(c.refuseVeuf, false); // accepte et refuse ensemble : « accepte » l'emporte
  assert.deepEqual(c.religionsAcceptees, ['Islam']);
  const v = versTest({ ref: 1, matching: c, medias: [] });
  assert.deepEqual(v.hardPreferences, ['age', 'location']);
  const p = await profilDepuisFiche({ ref: 5300, genre: 'femme', age: 30, pays: 'France', matching: { hardPreferences: ['age'] } });
  assert.deepEqual(p.hardPreferences, ['age']);
});

test('le moteur ne plante pas sur une valeur qui n’est pas du texte (text.normalize)', async () => {
  const { computeMatch, emptyProfile, DEFAULT_WEIGHTS } = await import('../lib/vendor/quickpair-engine.mjs');
  const a = { ...emptyProfile(), gender: 'Femme', situation: null, desirEnfants: undefined, etudesRecherche: null, zoneGeo: undefined };
  const b = { ...emptyProfile(), gender: 'Homme', religion: 'Islam' };
  assert.doesNotThrow(() => computeMatch(a, b, DEFAULT_WEIGHTS));
});
