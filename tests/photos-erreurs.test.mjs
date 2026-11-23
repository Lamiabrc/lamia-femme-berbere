import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/annonces.js', import.meta.url), 'utf8');
// On extrait les deux fonctions pures pour les essayer sans navigateur.
const bloc = src.slice(src.indexOf('const PHOTOS_OK'), src.indexOf('// Un PUT de photo'));
const typeDe = (f) => (f.type && f.type !== 'application/octet-stream' ? f.type : 'application/octet-stream');
const ERR = { file_type: 'format' };
const { problemePhoto, raisonEchecPhotos } = new Function('typeDe', 'ERR', `${bloc.replaceAll('export function', 'function')}; return { problemePhoto, raisonEchecPhotos };`)(typeDe, ERR);

test('une photo trop lourde dit son poids et la limite', () => {
  assert.match(problemePhoto({ type: 'image/jpeg', size: 20 * 1048576, name: 'a.jpg' }), /20 Mo.*12 Mo/);
});
test('un format refusé est nommé', () => {
  assert.match(problemePhoto({ type: 'image/gif', size: 1000, name: 'a.gif' }), /GIF.*pas accepté/);
});
test('une vidéo est expliquée', () => assert.match(problemePhoto({ type: 'video/mp4', size: 10, name: 'a.mp4' }), /vidéos/));
test('une bonne photo ne donne aucun problème', () => assert.equal(problemePhoto({ type: 'image/heic', size: 3e6, name: 'a.heic' }), ''));
test('chaque cause d’échec a sa phrase', () => {
  assert.match(raisonEchecPhotos({ code: 'upload_reseau' }), /connexion internet/);
  assert.match(raisonEchecPhotos({ code: 'upload_status_413' }), /trop lourde/);
  assert.match(raisonEchecPhotos({ code: 'login_required' }), /session a expiré/);
  assert.match(raisonEchecPhotos(new TypeError('Failed to fetch')), /connexion internet/);
  assert.match(raisonEchecPhotos({ message: 'http_503' }), /serveur/);
});
test('cause inconnue : un code à transmettre, jamais un message muet', () => {
  assert.match(raisonEchecPhotos({ code: 'zzz' }), /code : zzz/);
});

test('rapport automatique à Lamia : action serveur, catégorie propre, téléphone et fichiers (sans photo ni nom)', () => {
  const s = readFileSync(new URL('../lib/annonces.mjs', import.meta.url), 'utf8');
  assert.match(s, /annonce_probleme_photos[\s\S]{0,900}categorie: 'probleme'[\s\S]{0,500}Téléphone/);
  assert.match(readFileSync(new URL('../lib/alerte-lamia.mjs', import.meta.url), 'utf8'), /probleme:/);
  assert.match(src, /prevenirLamiaPhotos\(e, choix, token\)/);
});
