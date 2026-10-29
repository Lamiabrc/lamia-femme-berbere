import test from 'node:test';
import assert from 'node:assert/strict';
import { verifierMedias, ageAu, jetonAnnonce, jetonAnnonceValide } from '../lib/annonces.mjs';

const photo = { role: 'media', type: 'image/jpeg', size: 1000 };
const video = { role: 'media', type: 'video/mp4', size: 1000 };
const id = { role: 'identite', type: 'image/jpeg', size: 1000 };

test('médias : photos ou vidéo ; pièce d’identité facultative (une seule)', () => {
  assert.deepEqual(verifierMedias([photo]).files.map((f) => f.kind), ['photo']);
  assert.equal(verifierMedias([photo, id, id]).error, 'identite_trop');
  assert.equal(verifierMedias([id]).error, 'medias_requis');
  assert.equal(verifierMedias([photo, photo, photo, id]).error, 'medias_trop');
  assert.equal(verifierMedias([photo, video, id]).error, 'medias_trop');
  assert.equal(verifierMedias([{ ...video, size: 60 * 1024 * 1024 }, id]).error, 'file_size');
  assert.equal(verifierMedias([photo, { role: 'identite', type: 'video/mp4', size: 10 }]).error, 'file_type');
  assert.deepEqual(verifierMedias([photo, photo, id]).files.map((f) => f.kind), ['photo', 'photo', 'identite']);
  assert.deepEqual(verifierMedias([video, { ...id, type: 'application/pdf' }]).files.map((f) => f.kind), ['video', 'identite']);
});

test('âge et jetons de retrait', () => {
  assert.equal(ageAu('2000-06-15', new Date('2026-06-14T12:00:00Z')), 25);
  assert.equal(ageAu('2000-06-15', new Date('2026-06-15T12:00:00Z')), 26);
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'x' };
  const t = jetonAnnonce(env, 'abc');
  assert.ok(jetonAnnonceValide(env, 'abc', t));
  assert.ok(!jetonAnnonceValide(env, 'abd', t));
  assert.ok(!jetonAnnonceValide(env, 'abc', jetonAnnonce(env, 'abc', 'envoi')));
});
