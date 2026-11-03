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
    return new Response('[]');
  };
  const alertes = [];
  const ctx = (user) => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert, patch, admin: false, user, ipHash: 'h', now: () => new Date('2026-11-03T12:00:00Z'), email: async () => true, alerter: async (x) => { alertes.push(x.titre); }, formuleDe: async () => 'decouverte' });
  return { db, ctx, alertes };
}
const FICHE = (ref, user_id, genre, extra = {}) => ({ ref, outil_id: `o-${ref}`, user_id, genre, age: 35, ville: 'Lyon', pays: 'France', visible: true, retire_at: null, confirme_at: '2026-11-01T00:00:00Z', profil: 'Sérieux', recherche: 'Sérieuse', updated_at: '2026-11-01', ...extra });
const NINA = { id: 'u-nina', email: 'nina@example.com', user_metadata: { first_name: 'Nina' } };
const RACHID = { id: 'u-rachid', email: 'rachid@example.com', user_metadata: { first_name: 'Rachid' } };
const annonceNina = () => ({ id: 'a-nina', ref: 11, user_id: 'u-nina', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false, test: false, visible_anonyme: true, anonyme_ok: true, birth_date: '1990-01-01', pays: 'France', matching: {}, profil: 'p', recherche: 'r' });
const lire = async (r) => ({ status: r.status, ...(await r.json()) });

test('fiche confirmée : le swipe s’ouvre, sans refaire de profil, et sa propre fiche n’apparaît pas', async () => {
  const { db, ctx } = base({ profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100002, null, 'femme'), FICHE(100003, null, 'homme')] });
  const r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.equal(r.status, 200);
  assert.deepEqual(r.profils.map((p) => p.ref), [100002]); // que des femmes, jamais la sienne
  const a = db.annonces[0];
  assert.deepEqual([a.status, a.visible_anonyme, a.fiche_ref, a.outil_id, a.user_id, a.prenom], ['publiee', false, 100001, 'o-100001', 'u-rachid', 'Rachid']);
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  assert.equal(db.annonces.length, 1); // pas de second profil
});

test('le profil interne n’apparaît jamais dans la liste des autres', async () => {
  const { ctx } = base({ annonces: [annonceNina()], profils_outil: [FICHE(100001, 'u-rachid', 'homme')] });
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  const r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(NINA)));
  assert.deepEqual(r.profils.map((p) => p.ref), [100001]);
});

test('fiche pas confirmée : on demande de confirmer, sans rien créer', async () => {
  const { db, ctx } = base({ profils_outil: [FICHE(100001, 'u-rachid', 'homme', { confirme_at: null })] });
  const r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.equal(r.error, 'fiche_a_confirmer');
  assert.equal(db.annonces.length, 0);
});

test('fiche sans âge : message dédié, rien de créé', async () => {
  const { db, ctx } = base({ profils_outil: [FICHE(100001, 'u-rachid', 'homme', { age: null })] });
  assert.equal((await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)))).error, 'fiche_live');
  assert.equal(db.annonces.length, 0);
});

test('réciprocité : elle choisit sa fiche après qu’il l’a choisie', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()], profils_outil: [FICHE(100001, 'u-rachid', 'homme')] });
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  let r = await lire(await handleAnnonces('annonce_swipe', { ref: 11, choix: 'oui' }, ctx(RACHID)));
  assert.equal(r.match, false);
  r = await lire(await handleAnnonces('annonce_swipe', { ref: 100001, choix: 'oui' }, ctx(NINA)));
  assert.equal(r.match, true);
  assert.equal(db.annonce_interets.every((i) => i.reciproque), true);
});

test('réciprocité : il la choisit après qu’elle a choisi sa fiche', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()], profils_outil: [FICHE(100001, 'u-rachid', 'homme')] });
  await handleAnnonces('annonce_swipe', { ref: 100001, choix: 'oui' }, ctx(NINA));
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  const r = await lire(await handleAnnonces('annonce_swipe', { ref: 11, choix: 'oui' }, ctx(RACHID)));
  assert.equal(r.match, true);
  assert.equal(db.annonce_interets.filter((i) => i.reciproque).length, 2);
});

test('un seul match : engagé par sa fiche, il ne peut plus matcher ; le dématch le libère', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()], profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100002, null, 'femme')] });
  await handleAnnonces('annonce_swipe', { ref: 100001, choix: 'oui' }, ctx(NINA));
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  await handleAnnonces('annonce_swipe', { ref: 11, choix: 'oui' }, ctx(RACHID)); // réciproque : mise en relation automatique
  const profil = db.annonces.find((a) => a.fiche_ref === 100001);
  assert.equal(db.annonce_interets.filter((i) => i.statut === 'mis_en_relation').length, 1);
  assert.equal(profil.en_match, true);
  const refus = await lire(await handleAnnonces('annonce_swipe', { ref: 100002, choix: 'oui' }, ctx(RACHID)));
  assert.equal(refus.error, 'limite_matchs');
  await handleAnnonces('annonce_dematcher', {}, ctx(RACHID));
  assert.equal(profil.en_match, false);
  assert.equal(db.annonces.find((a) => a.ref === 11).en_match, false);
  assert.equal(db.annonce_interets.filter((i) => i.statut === 'mis_en_relation').length, 0);
});

test('blocage : bloquer sa fiche vaut aussi pour son profil, dans les deux sens', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()], profils_outil: [FICHE(100001, 'u-rachid', 'homme')] });
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  db.blocages.push({ auteur_user: 'u-nina', auteur_ref: 11, cible_ref: 100001, cible_user: 'u-rachid' });
  const n = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(NINA)));
  assert.deepEqual(n.profils.map((p) => p.ref), []);
  const r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.deepEqual(r.profils.map((p) => p.ref), []);
  const z = await lire(await handleAnnonces('annonce_swipe', { ref: 11, choix: 'oui' }, ctx(RACHID)));
  assert.equal(z.match, false);
  assert.equal(db.annonce_interets.length, 0);
});

test('retirer sa fiche retire aussi son profil interne', async () => {
  const { db, ctx } = base({ profils_outil: [FICHE(100001, 'u-rachid', 'homme')] });
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  assert.equal(db.annonces[0].status, 'publiee');
  await db; const { jetonAnnonce } = await import('../lib/annonces.mjs');
  const t = jetonAnnonce({ SUPABASE_SERVICE_ROLE_KEY: 'x' }, 'outil-100001', 'confirmer');
  await handleAnnonces('annonce_retirer_outil', { n: 100001, t }, ctx(RACHID));
  assert.equal(db.annonces[0].status, 'retiree');
});

test('zone et âge : dans les deux sens, en cas de doute on garde', async () => {
  const { zoneAccepte, ageEtLieuOk } = await import('../content/matching-options.mjs');
  assert.equal(zoneAccepte('France · Marseille', 'France'), true);
  assert.equal(zoneAccepte('France', 'Algérie'), false);
  assert.equal(zoneAccepte('Algerie', 'Algérie'), true);
  assert.equal(zoneAccepte('Autre que Algerie', 'Algerie'), false);
  assert.equal(zoneAccepte('Autre que Algerie', 'Canada'), true);
  assert.equal(zoneAccepte('Europe', 'France'), true);
  assert.equal(zoneAccepte('Amerique', 'USA'), true);
  assert.equal(zoneAccepte("N'importe ou", 'Algerie'), true);
  assert.equal(zoneAccepte('Pas important · Tizi Ouzou', 'Canada'), true);
  assert.equal(zoneAccepte('', 'France'), true);
  assert.equal(zoneAccepte('France', ''), true);
  const moi = { age: 45, age_min: 30, age_max: 50, pays: 'France', secteur: 'France' };
  assert.equal(ageEtLieuOk(moi, { age: 35, age_min: 30, age_max: 50, pays: 'France', secteur: 'France' }), true);
  assert.equal(ageEtLieuOk(moi, { age: 35, age_min: 25, age_max: 35, pays: 'France', secteur: 'France' }), false, 'elle ne cherche pas mon âge');
  assert.equal(ageEtLieuOk(moi, { age: 25, pays: 'France', secteur: 'France' }), false, 'hors de ma tranche');
  assert.equal(ageEtLieuOk(moi, { age: 35, pays: 'Algerie', secteur: 'France' }), false, 'pas dans ma zone');
  assert.equal(ageEtLieuOk(moi, { age: 35, pays: 'France', secteur: 'Algerie' }), false, 'je ne suis pas dans sa zone');
  assert.equal(ageEtLieuOk(moi, { age: null, pays: '', secteur: '' }), true);
});

test('liste : mes critères d’âge et de lieu, ceux qui me cherchent aussi d’abord, puis les mieux notés, score de la fiche repris', async () => {
  const { db, ctx } = base({
    profils_outil: [FICHE(100001, 'u-rachid', 'homme', { secteur: 'France', age_min: 25, age_max: 40 }),
      FICHE(100002, null, 'femme', { age: 30, secteur: 'France · Lyon', pays: 'France' }),
      FICHE(100003, null, 'femme', { age: 31, secteur: 'France', pays: 'France' }),
      FICHE(100004, null, 'femme', { age: 30, secteur: 'France', pays: 'Algerie' }),
      FICHE(100005, null, 'femme', { age: 55, secteur: 'France', pays: 'France' }),
      FICHE(100006, null, 'femme', { age: 30, secteur: 'Canada', pays: 'France' })],
    scores_outil: [{ a_ref: 100001, b_ref: 100002, score: 40 }, { a_ref: 100003, b_ref: 100001, score: 90 }],
  });
  const r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  // 100006 cherche au Canada : gardée, mais après. Hors de mes critères (pays, âge) : à la fin, marquées.
  assert.deepEqual(r.profils.map((p) => p.ref).slice(0, 3), [100003, 100002, 100006]);
  assert.deepEqual(r.profils.slice(3).map((p) => [p.ref, p.hors_criteres]).sort(), [[100004, true], [100005, true]]);
  assert.equal(db.annonces[0].matching.zoneGeo, 'France');
});

test('le swipe ne s’arrête jamais : les profils passés reviennent, jamais ceux déjà choisis ni bloqués', async () => {
  const { db, ctx } = base({ profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100002, null, 'femme'), FICHE(100003, null, 'femme'), FICHE(100004, null, 'femme')] });
  await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID));
  await handleAnnonces('annonce_swipe', { ref: 100002, choix: 'non' }, ctx(RACHID));
  await handleAnnonces('annonce_swipe', { ref: 100003, choix: 'oui' }, ctx(RACHID));
  db.blocages.push({ auteur_user: 'u-rachid', auteur_ref: db.annonces[0].ref, cible_ref: 100004 });
  let r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.deepEqual(r.profils.map((p) => [p.ref, p.revu]), [[100002, true]]);
  await handleAnnonces('annonce_swipe', { ref: 100002, choix: 'non' }, ctx(RACHID)); // repasser une seconde fois ne casse rien
  r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.equal(r.profils.length, 1);
  const oui = await lire(await handleAnnonces('annonce_swipe', { ref: 100002, choix: 'oui' }, ctx(RACHID))); // seconde chance
  assert.equal(oui.ok, true);
  r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.equal(r.profils.length, 0);
});
