import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validerPhotos, suspendreEnRetard, photosNonVues } from '../lib/moderation-photos.mjs';

const ADMIN = { id: 'a', app_metadata: { role: 'admin' } };
const T0 = new Date('2026-11-24T12:00:00Z');
// Faux serveur : un profil, ses écritures conditionnelles réussissent si la révision correspond.
function faux(a, files = []) {
  const ecritures = [], notes = [];
  const read = async (p) => (p.includes('annonce_files') ? files : p.includes('annonces?') ? [a] : []);
  const call = async (p, o) => { const row = JSON.parse(o.body); ecritures.push(row); Object.assign(a, row); return Response.json([a]); };
  return { ecritures, notes, read, call, prevenir: async (x, n) => { notes.push(n); } };
}
const profil = (m = null, extra = {}) => ({ id: 'p', ref: 7, status: 'publiee', bloque_at: null, photos_refusees_at: null, photos_moderation: m, ...extra });

test('Photos OK : réservé à l’administratrice', async () => {
  const f = faux(profil());
  const r = await validerPhotos({ ref: 7 }, { admin: false, user: null, read: f.read, call: f.call, now: () => T0 });
  assert.equal(r.status, 403); assert.equal(f.ecritures.length, 0);
});
test('Photos OK : enregistre valide_at, ne prévient pas le membre', async () => {
  const a = profil(); const f = faux(a);
  const r = await validerPhotos({ ref: 7 }, { admin: true, user: ADMIN, read: f.read, call: f.call, now: () => T0 });
  assert.equal(r.status, 200);
  assert.equal(a.photos_moderation.etat, 'valide'); assert.equal(a.photos_moderation.valide_at, T0.toISOString());
  assert.equal(f.notes.length, 0);
});
test('Photos OK sur un profil suspendu pour photos : la suspension est levée', async () => {
  const t = '2026-11-23T10:00:00.000Z';
  const a = profil({ etat: 'suspendu', suspendu_at: t, terminee_at: t, status_avant: 'publiee' }, { status: 'a_verifier', photos_refusees_at: t });
  const f = faux(a);
  await validerPhotos({ ref: 7 }, { admin: true, user: ADMIN, read: f.read, call: f.call, now: () => T0 });
  assert.equal(a.photos_refusees_at, null); assert.equal(a.status, 'publiee');
});
test('photos non vues : seulement celles ajoutées après le dernier « Photos OK »', () => {
  const files = [{ kind: 'photo', created_at: '2026-11-24T08:00:00Z' }, { kind: 'photo', created_at: '2026-11-20T08:00:00Z' }, { kind: 'identite', created_at: '2026-11-24T09:00:00Z' }];
  assert.equal(photosNonVues(profil(), files).length, 1);
  assert.equal(photosNonVues(profil({ valide_at: '2026-11-24T08:30:00Z' }), files).length, 0);
});
test('24 h sans remplacement : profil masqué et membre prévenu une fois', async () => {
  const m = { etat: 'avertissement', averti_at: '2026-11-23T11:00:00.000Z', terminee_at: '2026-11-23T11:00:01.000Z', photos: [{ id: 'x', position: 1 }], revision: 'r' };
  const a = profil(m); const f = faux(a, [{ id: 'x', kind: 'photo' }, { id: 'y', kind: 'photo' }]);
  const n = await suspendreEnRetard({ read: f.read, call: f.call, now: () => T0, prevenir: f.prevenir });
  assert.equal(n, 1); assert.ok(a.photos_refusees_at); assert.equal(a.status, 'a_verifier'); assert.equal(a.photos_moderation.etat, 'suspendu');
  assert.equal(f.notes.length, 1); assert.match(f.notes[0].texte, /24 h/);
});
test('moins de 24 h : rien ne change', async () => {
  const m = { etat: 'avertissement', averti_at: '2026-11-24T06:00:00.000Z', terminee_at: '2026-11-24T06:00:01.000Z', photos: [{ id: 'x' }], revision: 'r' };
  const a = profil(m); const f = faux(a, [{ id: 'x', kind: 'photo' }, { id: 'y', kind: 'photo' }]);
  assert.equal(await suspendreEnRetard({ read: f.read, call: f.call, now: () => T0, prevenir: f.prevenir }), 0);
  assert.equal(f.ecritures.length, 0);
});
test('24 h mais photo déjà remplacée : pas de suspension', async () => {
  const m = { etat: 'avertissement', averti_at: '2026-11-23T11:00:00.000Z', terminee_at: '2026-11-23T11:00:01.000Z', photos: [{ id: 'x' }], revision: 'r' };
  const a = profil(m); const f = faux(a, [{ id: 'y', kind: 'photo' }, { id: 'z', kind: 'photo' }]);
  assert.equal(await suspendreEnRetard({ read: f.read, call: f.call, now: () => T0, prevenir: f.prevenir }), 0);
  assert.equal(a.photos_refusees_at, null); assert.equal(f.notes.length, 0);
});
test('branchement : actions, passage de l’heure et tableau de bord', () => {
  const s = readFileSync(new URL('../lib/annonces.mjs', import.meta.url), 'utf8');
  assert.match(s, /annonce_photos_a_valider/); assert.match(s, /annonce_photos_valider/);
  assert.match(s, /annonce_matchs_cron[\s\S]{0,200}suspendreEnRetard/);
  const t = readFileSync(new URL('../public/tableau.js', import.meta.url), 'utf8');
  assert.match(t, /data-photos-ok/); assert.match(t, /Photos à valider/);
});
