import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';
import { ADMIN, MEMBRE } from './helpers/moderation-photos-base.mjs';

// Fausse base minimale : une annonce (n° 42) et une fiche (n° 5100), les modifications sont notées.
function monde() {
  const annonce = { id: '11111111-1111-4111-8111-111111111111', ref: 42, user_id: null, matching: { situation: 'Jamais marie(e)' }, ville: 'Paris', pays: 'France', age_min: null, age_max: null, situation: 'Jamais marie(e)' };
  const fiche = { ref: 5100 };
  const patchs = [];
  const read = async (path) => {
    if (path.includes('/annonces?ref=eq.42') || path.includes('/annonces?id=eq.')) return [annonce];
    if (path.includes('/profils_outil?ref=eq.5100')) return [fiche];
    return [];
  };
  const patch = async (table, filter, row) => { patchs.push({ table, filter, row }); if (table === 'annonces') Object.assign(annonce, row); return [row]; };
  const ctx = (user) => ({ admin: true, user, read, patch, call: async () => Response.json([]), insert: async () => true, env: {}, email: async () => true, alerter: async () => {}, now: () => new Date('2026-11-24T12:00:00Z') });
  const action = async (n, b, user = ADMIN) => { const r = await handleAnnonces(n, b, ctx(user)); return { status: r.status, ...(await r.json()) }; };
  return { annonce, patchs, action };
}

test('Lamia complète une annonce : champs valides gardés, anciens conservés, âge recherché enregistré', async () => {
  const m = monde();
  const r = await m.action('annonce_admin_completer', { ref: 42, age_min: 30, age_max: 36, pays: 'France', matching: { zoneGeo: 'France', belleFamille: 'valeur-inconnue', religion: 'Islam' } });
  assert.equal(r.status, 200);
  assert.equal(m.annonce.age_min, 30); assert.equal(m.annonce.age_max, 36);
  assert.equal(m.annonce.matching.situation, 'Jamais marie(e)');
  assert.equal(m.annonce.matching.belleFamille, '');
});

test('Complétion refusée : pas administratrice, âges inversés, pays inconnu', async () => {
  const m = monde();
  assert.equal((await m.action('annonce_admin_completer', { ref: 42, matching: {} }, MEMBRE).catch(() => ({ status: 403 }))).status, 403);
  assert.equal((await m.action('annonce_admin_completer', { ref: 42, age_min: 40, age_max: 30, matching: {} })).status, 400);
  assert.equal((await m.action('annonce_admin_completer', { ref: 42, pays: 'Atlantide', matching: {} })).status, 400);
});

test('Fiche de l’outil : seules les colonnes existantes sont renseignées', async () => {
  const m = monde();
  const r = await m.action('annonce_admin_completer', { ref: 5100, age_min: 28, age_max: 34, ville: 'Lyon', matching: { zoneGeo: 'France', belleFamille: 'x' } });
  assert.equal(r.status, 200);
  const p = m.patchs.find((x) => x.table === 'profils_outil').row;
  assert.equal(p.age_min, 28); assert.equal(p.ville, 'Lyon'); assert.equal(p.secteur, 'France'); assert.ok(!('belleFamille' in p));
});
