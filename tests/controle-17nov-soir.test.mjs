import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';

// Une petite base en mémoire qui comprend les filtres utilisés (eq, in, is.null, not.is.null, or, and).
function base(initial = {}) {
  const db = { annonces: [], profils_outil: [], annonce_interets: [], annonce_passes: [], blocages: [], discussions: [], propositions: [], platform_settings: [], scores_outil: [], ...initial };
  let n = 1000;
  const cond = (ligne, c) => {
    const m = c.match(/^([a-z_]+)\.(not\.is|is|eq|neq|in|gte)\.(.*)$/s);
    if (!m) return true;
    const [, k, op, v0] = m; const v = decodeURIComponent(v0); const x = ligne[k];
    if (op === 'eq') return String(x) === v;
    if (op === 'neq') return String(x) !== v;
    if (op === 'is') return x === null || x === undefined;
    if (op === 'not.is') return x !== null && x !== undefined;
    if (op === 'in') return v.replace(/[()"]/g, '').split(',').includes(String(x));
    return true;
  };
  const decouper = (s) => { const out = []; let d = 0, c = ''; for (const ch of s) { if (ch === '(') d += 1; if (ch === ')') d -= 1; if (ch === ',' && d === 0) { out.push(c); c = ''; } else c += ch; } if (c) out.push(c); return out; };
  const evalue = (ligne, c) => {
    if (c.startsWith('or(')) return decouper(c.slice(3, -1)).some((y) => evalue(ligne, y));
    if (c.startsWith('and(')) return decouper(c.slice(4, -1)).every((y) => evalue(ligne, y));
    return cond(ligne, c);
  };
  const filtrer = (table, qs) => {
    let lignes = db[table] || [];
    for (const part of qs.split('&')) {
      const i = part.indexOf('='); if (i < 0) continue;
      const k = part.slice(0, i), v = part.slice(i + 1);
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      lignes = lignes.filter((l) => (k === 'or' ? evalue(l, `or${v}`) : cond(l, `${k}.${v}`)));
    }
    return lignes;
  };
  const coupe = (u) => { const m = u.match(/^\/rest\/v1\/([a-z_]+)\??(.*)$/); return m ? [m[1], m[2]] : [null, '']; };
  const read = async (u) => {
    if (u.includes('declarations_sincerite')) return [{ user_id: 'ok' }]; // bonne foi déjà déclarée, sauf test dédié
    if (u.includes('annonce_files?annonce_id=eq.') && u.includes('kind=in.')) return [{ kind: 'photo' }, { kind: 'photo' }];
    if (u.includes('annonce_files?kind=eq.photo&annonce_id=in.') && !db.annonce_files) return decodeURIComponent(u.match(/annonce_id=in\.\(([^)]*)\)/)[1]).split(',').flatMap((id) => [{ annonce_id: id }, { annonce_id: id }]); // tout le monde a ses 2 photos, sauf test dédié
    const [t, qs] = coupe(u); if (!t) return [];
    let l = filtrer(t, qs);
    if (t === 'annonce_interets') l = l.map((i) => ({ ...i, annonces: db.annonces.find((a) => a.id === i.demandeur_id) }));
    const lim = qs.match(/limit=(\d+)/); return lim ? l.slice(0, Number(lim[1])) : l;
  };
  const insert = async (t, r) => {
    if (t === 'annonces' && r.fiche_ref && db.annonces.some((a) => a.fiche_ref === r.fiche_ref)) throw new Error('unique');
    if (t === 'annonce_interets' && db.annonce_interets.some((i) => i.demandeur_id === r.demandeur_id && i.cible_ref === r.cible_ref)) throw new Error('unique');
    n += 1; const ligne = { id: `id-${n}`, ...(t === 'annonces' ? { ref: n, en_match: false, test: false } : {}), ...(t === 'annonce_interets' ? { statut: 'a_traiter', reciproque: false, created_at: '2026-11-03T00:00:00Z' } : {}), ...r };
    (db[t] ||= []).push(ligne); return ligne;
  };
  const patch = async (t, f, v) => { for (const l of filtrer(t, f)) Object.assign(l, v); return { ok: true }; };
  const call = async (u, o = {}) => {
    if (o.method === 'DELETE') { const [t, qs] = coupe(u); const sup = new Set(filtrer(t, qs)); db[t] = db[t].filter((l) => !sup.has(l)); return new Response('[]'); }
    if (u.includes('/auth/v1/admin/users/')) return new Response(JSON.stringify({ id: u.split('/').pop(), email: 'x@example.com', user_metadata: {} }));
    if (o.method === 'POST' && u.includes('/platform_settings?on_conflict=key')) { const row = JSON.parse(o.body); db.platform_settings = [...db.platform_settings.filter((x) => x.key !== row.key), row]; return new Response('[]'); }
    return new Response('[]');
  };
  const alertes = [];
  const ctx = (user) => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert, patch, admin: false, user, ipHash: 'h', now: () => new Date('2026-11-03T12:00:00Z'), email: async () => true, alerter: async (x) => { alertes.push(x.titre); }, formuleDe: async () => 'decouverte' });
  return { db, ctx, alertes };
}

// Contrôle du 17 nov. 2026 : n° 98 et n° 101 se dématchent, puis rematchent (la règle le permet).
// Le passage quotidien de 18 h « rendait les places » de l'ancien dématch et terminait aussi le NOUVEAU match :
// la discussion restait ouverte, mais le match ne comptait plus (places faussées, match affiché fini).
test('passage quotidien : un nouveau match de la même paire, avec sa propre discussion, n’est pas terminé par l’ancien dématch', async () => {
  const A = 'u-amel', B = 'u-bilal';
  const { db, ctx } = base({
    annonces: [
      { id: 'a-98', ref: 98, user_id: A, email: 'amel@example.com', status: 'publiee', prenom: 'Amel', genre: 'femme', en_match: true, test: false },
      { id: 'a-101', ref: 101, user_id: B, email: 'bilal@example.com', status: 'publiee', prenom: 'Bilal', genre: 'homme', en_match: true, test: false },
    ],
    annonce_interets: [
      { id: 'i-ancien', demandeur_id: 'a-98', cible_ref: 101, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-01T00:00:00Z' },
      { id: 'i-nouveau', demandeur_id: 'a-101', cible_ref: 98, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-02T00:00:00Z' },
    ],
    discussions: [
      // L'ancien match : dématché, encore dans ses 48 h d'au revoir.
      { id: 'd-ancien', interet_id: 'i-ancien', a_user: A, b_user: B, a_ref: 98, b_ref: 101, ouverte_at: '2026-11-01T00:00:00Z', ferme_at: '2026-11-04T09:00:00Z', dematch_at: '2026-11-02T09:00:00Z', dematch_par: 'a', dematch_rappel_at: '2026-11-02T17:00:00Z', close_raison: null },
      // Le nouveau match : ils se sont rechoisis, la discussion est ouverte.
      { id: 'd-nouveau', interet_id: 'i-nouveau', a_user: B, b_user: A, a_ref: 101, b_ref: 98, ouverte_at: '2026-11-03T04:00:00Z', ferme_at: '2026-11-10T04:00:00Z', dematch_at: null, close_raison: null },
    ],
  });
  const r = await handleAnnonces('annonce_rappels_cron', {}, { ...ctx(null), cron: true });
  assert.equal(r.status, 200);
  const st = (id) => db.annonce_interets.find((i) => i.id === id).statut;
  assert.equal(st('i-ancien'), 'dematche', 'l’ancien match rend bien les places');
  assert.equal(st('i-nouveau'), 'mis_en_relation', 'le nouveau match continue');
  assert.equal(db.discussions.find((d) => d.id === 'd-nouveau').close_raison, null);
});

// Les erreurs sans compte (user_id vide) cassaient la lecture des prénoms : « in.(…,,…) » refusé (400) à chaque minute.
test('erreurs de l’appli : les lignes sans compte ne cassent pas la recherche des prénoms', async () => {
  const { handleConfidences } = await import('../lib/confidences.mjs');
  const { backend } = await import('./fake-confidences.mjs');
  const { createHash } = await import('node:crypto');
  const CLE = 'cle-de-liaison-de-loutil-de-lamia-0123456789';
  const be = backend({ users: {} });
  be.db.platform_settings.push({ key: 'outil_liaison', value: { hash: createHash('sha256').update(CLE).digest('hex') } });
  Object.assign(be.db, { member_profiles: [{ user_id: 'nadia', display_name: 'Nadia' }], erreurs_appli: [
    { id: 'e1', created_at: new Date().toISOString(), user_id: null, type: 'page', message: 'x' },
    { id: 'e2', created_at: new Date().toISOString(), user_id: 'nadia', type: 'appel', message: 'y' },
  ] });
  be.db.annonces.push({ ref: 41, prenom: 'Nadia', status: 'publiee', user_id: 'nadia' });
  const vues = [];
  const fetcher = async (u, init) => { vues.push(String(u)); return be.fetcher(u, init); };
  const req = new Request('https://x/api/confidences', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' }, body: JSON.stringify({ action: 'live_outil_erreurs', cle: CLE }) });
  const res = await handleConfidences(req, { env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, fetcher });
  const body = await res.json();
  const listes = vues.filter((u) => u.includes('user_id=in.')).map((u) => decodeURIComponent(u.match(/user_id=in\.\(([^)]*)\)/)[1]));
  assert.ok(listes.length >= 1);
  for (const l of listes) assert.deepEqual(l.split(','), ['nadia'], `liste propre : ${l}`);
  assert.equal(body.erreurs.find((e) => e.connecte).ref, 41);
});
