import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';
import { handleConfidences } from '../lib/confidences.mjs';
import { backend } from './fake-confidences.mjs';

// Comme la vraie base Supabase : jamais plus de 1000 lignes par lecture, même avec « limit=20000 » ; « offset » donne la page suivante.
function baseCoupee(db) {
  const lus = [];
  const cond = (l, k, v) => {
    const m = v.match(/^(eq|in|is|not\.is|gte)\.(.*)$/s); if (!m) return true;
    const [, op, x] = m; const c = l[k];
    if (op === 'eq') return String(c) === x;
    if (op === 'in') return x.replace(/[()"]/g, '').split(',').includes(String(c));
    if (op === 'is') return c == null;
    if (op === 'not.is') return c != null;
    if (op === 'gte') return Number(c) >= Number(x);
    return true;
  };
  const read = async (u) => {
    lus.push(u);
    const [, table, qs = ''] = u.match(/^\/rest\/v1\/([a-z_]+)\??(.*)$/) || [];
    let lignes = db[table] || [];
    let limit = 1000, offset = 0;
    for (const part of qs.split('&')) {
      const i = part.indexOf('='); if (i < 0) continue;
      const k = part.slice(0, i), v = decodeURIComponent(part.slice(i + 1));
      if (k === 'limit') { limit = Math.min(Number(v), 1000); continue; }
      if (k === 'offset') { offset = Number(v); continue; }
      if (['select', 'order', 'or', 'on_conflict'].includes(k)) continue;
      lignes = lignes.filter((l) => cond(l, k, v));
    }
    return lignes.slice(offset, offset + Math.min(limit, 1000));
  };
  return { read, lus };
}

test('propositions automatiques : un profil déjà refusé n\'est jamais reproposé, même au-delà de 1000 « non » enregistrés', async () => {
  const A = { id: 'a-1', ref: 1, prenom: 'Amel', genre: 'femme', status: 'publiee', test: false, en_match: false, pause_at: null, user_id: 'u-1', email: 'a@x.fr', pays: 'France' };
  const B = { id: 'b-2', ref: 2, prenom: 'Bilal', genre: 'homme', status: 'publiee', test: false, en_match: false, pause_at: null, user_id: 'u-2', email: 'b@x.fr', pays: 'France' };
  const passes = Array.from({ length: 1200 }, (_, i) => ({ id: String(i).padStart(5, '0'), demandeur_id: `autre-${i}`, cible_ref: 1000 + i }));
  passes.push({ id: '99999', demandeur_id: A.id, cible_ref: B.ref }); // Amel a dit « non » à Bilal, en 1201e position
  const db = { annonces: [A, B], profils_outil: [], annonce_passes: passes, annonce_interets: [], propositions: [], scores_outil: [{ a_ref: 1, b_ref: 2, score: 95, niveau: 'fort' }], platform_settings: [] };
  const { read } = baseCoupee(db);
  const envois = [];
  const call = async (u, init = {}) => { if (init.method === 'POST' && u.startsWith('/rest/v1/propositions')) envois.push(...JSON.parse(init.body)); return { ok: true, status: 200, json: async () => [] }; };
  const r = await handleAnnonces('annonce_rappels_cron', {}, { env: {}, call, read, insert: async () => ({}), patch: async () => ({ ok: true }), admin: false, now: () => new Date('2026-11-17T17:00:00Z'), formuleDe: async () => 'passion', cron: true });
  assert.equal(r.status, 200);
  assert.deepEqual(envois.filter((p) => [p.pour_ref, p.cible_ref].sort().join('-') === '1-2'), []);
});

test('liste publique : le membre connecté reçoit son genre (l\'appel « mon_genre » répondait toujours « unknown_action »)', async () => {
  const be = backend({ users: { T: { id: 'u-9', email: 'm@x.fr', email_confirmed_at: '2026-11-01T00:00:00Z' } } });
  be.db.annonces.push({ id: 'a-9', ref: 9, user_id: 'u-9', genre: 'femme', created_at: '2026-11-01T00:00:00Z' });
  const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'k', CONFIDENCES_OUVERTES: '1' };
  const req = new Request('https://lamia-femme-berbere.com/api/confidences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer T' }, body: JSON.stringify({ action: 'mon_genre' }) });
  const r = await handleConfidences(req, { env, fetcher: be.fetcher });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).genre, 'femme');
});
