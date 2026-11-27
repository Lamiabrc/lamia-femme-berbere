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

test('console de Lamia : le nombre de messages d\'une discussion est juste au-delà de 1000 messages en tout', async () => {
  const { discussionsPourLamia } = await import('../lib/discussions.mjs');
  const d1 = { id: '11111111-1111-4111-8111-111111111111', a_ref: 1, b_ref: 2, ouverte_at: '2026-11-17T10:00:00Z' };
  const d2 = { id: '22222222-2222-4222-8222-222222222222', a_ref: 3, b_ref: 4, ouverte_at: '2026-11-16T10:00:00Z' };
  const msgs = [
    ...Array.from({ length: 1100 }, (_, i) => ({ id: `a${String(i).padStart(5, '0')}`, discussion_id: d2.id })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, discussion_id: d1.id })),
  ];
  const { read } = baseCoupee({ discussions: [d1, d2], discussion_messages: msgs });
  const r = await discussionsPourLamia({ read });
  const nb = (id) => (r.discussions || r.liste || []).find((x) => x.id === id)?.messages;
  assert.equal(nb(d1.id), 7);
  assert.equal(nb(d2.id), 1100);
});

test('carte d\'activité : un match ancien reste compté même avec plus de 1000 demandes plus récentes', async () => {
  const A = { id: 'a-1', ref: 1, prenom: 'Amel', status: 'publiee', test: false, user_id: 'u-1', en_match: true, pause_at: null };
  const recentes = Array.from({ length: 1200 }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}`, cible_ref: 5000 + i, statut: 'pas_compatible', updated_at: `2026-11-17T12:${String(i % 60).padStart(2, '0')}:00Z`, annonces: { ref: 1, prenom: 'Amel', status: 'publiee' } }));
  const ancien = { id: 'zz-match', cible_ref: 2, statut: 'mis_en_relation', updated_at: '2026-11-01T10:00:00Z', annonces: { ref: 1, prenom: 'Amel', status: 'publiee' } };
  const db = { annonces: [A], profils_outil: [], annonce_interets: [...recentes, ancien], propositions: [], discussions: [{ id: 'd-match', interet_id: 'zz-match', ferme_at: '2026-12-01T00:00:00Z' }], platform_settings: [] };
  // Comme la base : les plus récentes d'abord.
  db.annonce_interets.sort((x, y) => y.updated_at.localeCompare(x.updated_at));
  const { read } = baseCoupee(db);
  const call = async () => ({ ok: true, status: 200, json: async () => [] });
  const r = await handleAnnonces('annonce_pilote', {}, { env: {}, call, read, insert: async () => ({}), patch: async () => ({ ok: true }), admin: true, user: { id: 'lamia', email: 'l@x.fr' }, now: () => new Date('2026-11-17T22:00:00Z'), formuleDe: async () => 'passion' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).chiffres.en_relation, 1);
});
