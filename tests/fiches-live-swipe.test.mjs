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
const FICHE = (ref, user_id, genre, extra = {}) => ({ ref, outil_id: `o-${ref}`, user_id, genre, age: 35, ville: 'Lyon', pays: 'France', visible: true, retire_at: null, confirme_at: '2026-11-01T00:00:00Z', profil: 'Sérieux', recherche: 'Sérieuse', updated_at: '2026-11-01', ...extra });
const UUID_NINA = '00000000-0000-4000-8000-000000000011';
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
  assert.deepEqual([a.status, a.visible_anonyme, a.fiche_ref, a.outil_id, a.user_id, a.prenom], ['a_verifier', false, 100001, 'o-100001', 'u-rachid', 'Rachid']); // validé seulement avec ses 2 photos
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
  assert.equal(db.annonces[0].status, 'a_verifier');
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
  // 100006 cherche au Canada et il vit en France : elle ne lui est plus proposée (barrière des critères).
  // Hors de mes critères à moi (pays, âge) : à la fin, marquées.
  assert.deepEqual(r.profils.map((p) => p.ref).slice(0, 2), [100003, 100002]);
  assert.ok(!r.profils.some((p) => p.ref === 100006));
  assert.deepEqual(r.profils.slice(2).map((p) => [p.ref, p.hors_criteres]).sort(), [[100004, true], [100005, true]]);
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

test('recommandation : posée sur la fiche, visible dans la liste, retirable', async () => {
  const { badgesProfil } = await import('../content/matching-options.mjs');
  assert.match(badgesProfil({ recommande: true }), /Recommandé par Lamia/);
  assert.match(badgesProfil({ piece_identite: true }), /pièce d’identité/);
  assert.equal(badgesProfil({}), '');
  const { db, ctx } = base({ profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100002, null, 'femme', { recommande_at: '2026-11-03' })] });
  const r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.equal(r.profils[0].recommande, true);
  const admin = { ...ctx({ id: 'adm', email: 'a@x.fr' }), admin: true };
  await handleAnnonces('annonce_recommander', { ref: db.annonces[0].ref, oui: true }, admin); // le profil interne renvoie vers sa fiche
  assert.ok(db.profils_outil[0].recommande_at);
  await handleAnnonces('annonce_recommander', { ref: 100001, oui: false }, admin);
  assert.equal(db.profils_outil[0].recommande_at, null);
  assert.equal((await handleAnnonces('annonce_recommander', { ref: 100001, oui: true }, ctx(RACHID))).status, 403);
});

test('Passion : 3 matchs en cours ; finir l’un garde les autres et libère une place', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()], profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100003, 'u-karim', 'homme'), FICHE(100005, 'u-yanis', 'homme'), FICHE(100004, null, 'homme')] });
  const KARIM = { id: 'u-karim', email: 'karim@example.com', user_metadata: { first_name: 'Karim' } };
  const YANIS = { id: 'u-yanis', email: 'yanis@example.com', user_metadata: { first_name: 'Yanis' } };
  const passion = (u) => ({ ...ctx(u), formuleDe: async (mail) => (mail === NINA.email ? 'passion' : 'decouverte') });
  // Nina accepte que d'autres matchs s'ouvrent pendant sa discussion (son match le verra).
  await handleAnnonces('annonce_matchs_multiples', { choix: 'oui' }, passion(NINA));
  for (const ref of [100001, 100003, 100005]) await handleAnnonces('annonce_swipe', { ref, choix: 'oui' }, passion(NINA));
  for (const u of [RACHID, KARIM, YANIS]) { await handleAnnonces('annonce_swipe_liste', {}, passion(u)); await handleAnnonces('annonce_swipe', { ref: 11, choix: 'oui' }, passion(u)); }
  const nina = db.annonces.find((a) => a.ref === 11);
  assert.equal(db.annonce_interets.filter((i) => i.statut === 'mis_en_relation').length, 3);
  assert.equal(nina.en_match, true); // ses 3 places sont prises
  assert.equal((await lire(await handleAnnonces('annonce_swipe', { ref: 100004, choix: 'oui' }, passion(NINA)))).error, 'limite_matchs');
  const { profil } = await lire(await handleAnnonces('annonce_mon_profil', {}, passion(NINA)));
  assert.equal(profil.matchs.limite, 3);
  assert.equal(profil.matchs_lies.length, 3);
  // Discussion ouverte : le dématch passe par elle, pour se dire au revoir.
  assert.equal((await lire(await handleAnnonces('annonce_dematcher', { ref: 100001 }, passion(NINA)))).error, 'dematch_dans_discussion');
  for (const d of db.discussions) d.close_raison = 'expiree';
  await handleAnnonces('annonce_dematcher', { ref: 100001 }, passion(NINA));
  assert.equal(db.annonce_interets.filter((i) => i.statut === 'mis_en_relation').length, 2);
  assert.equal(nina.en_match, false); // une place libre, les autres matchs continuent
  assert.deepEqual(db.annonce_interets.filter((i) => i.statut === 'mis_en_relation').map((i) => i.cible_ref).sort(), [100003, 100005]);
});
test('match offert en live : retiré (matchs illimités)', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()] });
  const lamia = { ...ctx(NINA), admin: true };
  const a = db.annonces[0]; a.id = UUID_NINA;
  const r = await handleAnnonces('annonce_moderer', { annonce_id: UUID_NINA, decision: 'bonus_match' }, lamia);
  assert.equal(r.status, 410);
  assert.ok(!a.matchs_bonus);
});

test('swipe : les personnes qui ont un compte passent d’abord, même moins bien notées', async () => {
  const { ctx } = base({
    profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100002, null, 'femme'), FICHE(100003, 'u-sans', 'femme')],
    scores_outil: [{ a_ref: 100001, b_ref: 100002, score: 95 }, { a_ref: 100001, b_ref: 100003, score: 40 }],
  });
  const r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.deepEqual(r.profils.map((p) => p.ref), [100003, 100002]);
});


test('pendant le live : le lien d’une seule fiche, sans toucher aux autres', async () => {
  const { createHash } = await import('node:crypto');
  const cle = 'c'.repeat(40);
  const { db, ctx } = base({ profils_outil: [FICHE(100001, null, 'homme'), FICHE(100002, null, 'femme')], platform_settings: [{ key: 'outil_liaison', value: { hash: createHash('sha256').update(cle).digest('hex') } }] });
  const appel = (corps) => handleAnnonces('outil_fiche_live', { cle, ...corps }, ctx(null));
  assert.equal((await appel({ cle: 'mauvaise-cle', profil: { outil_id: 'o-100001', genre: 'homme' } })).status, 403);
  assert.equal((await appel({ profil: { outil_id: 'site-annonce-4', genre: 'homme' } })).status, 400);
  assert.equal((await appel({ profil: { outil_id: 'o-100001' } })).status, 400);
  const r = await lire(await appel({ profil: { outil_id: 'o-100001', genre: 'homme', age: 35, profil: 'Sérieux' } }));
  assert.equal(r.ref, 100001);
  assert.match(r.lien, /\/rencontres\/confirmer\/\?n=100001&t=/);
  assert.equal(r.confirmation, 'confirmee'); // la fiche de test est déjà confirmée
  assert.equal(db.profils_outil.find((f) => f.ref === 100002).visible, true); // l'autre fiche reste en ligne
});

test('tableau de bord : profil complet avec photos, jamais la pièce d’identité', async () => {
  const { db, ctx } = base({ annonces: [{ id: 'a1', ref: 7, user_id: null, prenom: 'Nina', genre: 'femme', birth_date: '1990-01-01', profil: 'Je suis douce', matching: { profession: 'Infirmière' }, phone: '+33600000000', ip_hash: 'secret' }] });
  db.annonce_files = [{ annonce_id: 'a1', kind: 'photo', storage_path: 'p1', position: 1 }, { annonce_id: 'a1', kind: 'identite', storage_path: 'id1', position: 0 }];
  const c = ctx(null);
  c.admin = true;
  const lus = [];
  const lire0 = c.read;
  c.read = async (u) => {
    if (u.includes('annonce_files?annonce_id=in.')) { lus.push(u); return db.annonce_files.filter((f) => f.kind !== 'identite'); }
    return lire0(u);
  };
  const call0 = c.call;
  c.call = async (u, o) => (u.includes('/storage/v1/object/sign/') ? new Response(JSON.stringify(JSON.parse(o.body).paths.map((path) => ({ path, signedURL: `/signe/${path}` })))) : call0(u, o));
  const r = await lire(await handleAnnonces('annonce_profil_detail', { ref: 7 }, c));
  const a = r.annonces[0];
  assert.equal(a.profil, 'Je suis douce');
  assert.equal(a.phone, '+33600000000');
  assert.equal(a.medias.length, 1);
  assert.equal(a.ip_hash, undefined);
  assert.match(lus[0], /kind=in\.\(photo,video\)/);
  assert.doesNotMatch(JSON.stringify(a), /id1/);
});


// Cas du 9 nov. 2026 (n° 30 ↔ fiche n° 11556) : oui réciproque sur une fiche sortie de l'export, la personne ayant son annonce sur le site.
const casFicheMasquee = (extraRachid = {}) => base({
  annonces: [annonceNina(), { id: 'a-rachid', ref: 12, user_id: 'u-rachid', email: 'rachid@example.com', status: 'publiee', prenom: 'Rachid', genre: 'homme', en_match: false, test: false, fiche_ref: 100001, pays: 'France', matching: {}, ...extraRachid }],
  profils_outil: [FICHE(100001, 'u-rachid', 'homme', { visible: false })],
  annonce_interets: [{ id: 'i-1', demandeur_id: 'a-nina', cible_ref: 100001, statut: 'a_traiter', reciproque: true, reponse: 'oui', via: 'swipe', created_at: '2026-11-02T00:00:00Z' }],
});
const lancerPilote = (ctx) => handleAnnonces('annonce_pilote', { op: 'lancer' }, { ...ctx({ id: 'adm', email: 'a@x.fr' }), admin: true });

test('fiche masquée mais reliée à une annonce publiée : le oui réciproque est mis en relation', async () => {
  const { db, ctx } = casFicheMasquee();
  await lancerPilote(ctx);
  assert.equal(db.annonce_interets.find((i) => i.id === 'i-1').statut, 'mis_en_relation');
});

test('fiche masquée dont l’annonce est en pause : pas de mise en relation', async () => {
  const { db, ctx } = casFicheMasquee({ pause_at: '2026-11-03T10:00:00Z' });
  await lancerPilote(ctx);
  assert.equal(db.annonce_interets.find((i) => i.id === 'i-1').statut, 'a_traiter');
});

// Tableau de bord, Activité : Lamia met deux personnes en relation à la main (14 nov. 2026).
const matcherMain = (ctx, corps) => handleAnnonces('annonce_pilote', corps, { ...ctx({ id: 'adm', email: 'a@x.fr' }), admin: true });
const annonceKarim = (extra = {}) => ({ id: 'a-karim', ref: 12, user_id: 'u-karim', email: 'karim@example.com', status: 'publiee', prenom: 'Karim', genre: 'homme', en_match: false, test: false, pays: 'France', matching: {}, ...extra });

test('mise en relation à la main sans demande : la demande est créée et passe en relation', async () => {
  const { db, ctx } = base({ annonces: [annonceNina(), annonceKarim()] });
  const r = await lire(await matcherMain(ctx, { op: 'matcher', a: '11', b: '12' }));
  assert.equal(r.status, 200);
  assert.equal(r.fait, 'n° 11 ↔ n° 12');
  const i = db.annonce_interets.find((x) => x.cible_ref === 12);
  assert.equal(i.statut, 'mis_en_relation');
  assert.equal(i.via, 'lamia_main');
  assert.equal(r.statut.matchs.length, 1);
});

test('mise en relation à la main : elle passe même quand la formule est déjà pleine', async () => {
  const { db, ctx } = base({
    annonces: [annonceNina(), annonceKarim(), { ...annonceKarim({ id: 'a-autre', ref: 13, user_id: 'u-autre', email: 'autre@example.com', prenom: 'Autre' }) }],
    annonce_interets: [{ id: 'i-deja', demandeur_id: 'a-nina', cible_ref: 13, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-02T00:00:00Z' }],
  });
  const r = await lire(await matcherMain(ctx, { op: 'matcher', a: '12', b: '11' }));
  assert.equal(r.status, 200);
  assert.equal(db.annonce_interets.find((x) => x.demandeur_id === 'a-karim' && x.cible_ref === 11).statut, 'mis_en_relation');
});

test('mise en relation à la main : un profil pas validé donne un message clair', async () => {
  const { ctx } = base({ annonces: [annonceNina(), annonceKarim({ status: 'a_verifier' })] });
  const r = await lire(await matcherMain(ctx, { op: 'matcher', a: '11', b: '12' }));
  assert.equal(r.status, 409);
  assert.match(r.message, /n° 12 n’est pas encore validé/);
});

test('où en est un profil : ses matchs en cours et les oui réciproques en attente', async () => {
  const { ctx } = base({
    annonces: [annonceNina(), annonceKarim()],
    annonce_interets: [
      { id: 'i-1', demandeur_id: 'a-nina', cible_ref: 12, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-02T00:00:00Z' },
      { id: 'i-2', demandeur_id: 'a-karim', cible_ref: 100009, statut: 'a_traiter', reciproque: true, created_at: '2026-11-02T00:00:00Z' },
    ],
  });
  const r = await lire(await matcherMain(ctx, { op: 'statut', ref: '12' }));
  assert.deepEqual(r.statut.matchs.map((m) => m.avec), [11]);
  assert.deepEqual(r.statut.reciproques.map((m) => m.avec), [100009]);
  assert.equal(r.statut.profil, 'validé');
});

test('mise en relation depuis la console de l’outil : la clé de liaison suffit, une mauvaise clé est refusée', async () => {
  const { createHash } = await import('node:crypto');
  const cle = 'c'.repeat(40);
  const { db, ctx } = base({ annonces: [annonceNina(), annonceKarim()], platform_settings: [{ key: 'outil_liaison', value: { hash: createHash('sha256').update(cle).digest('hex') } }] });
  const refuse = await handleAnnonces('outil_matcher', { cle: 'mauvaise-cle', a: 11, b: 12 }, { ...ctx(null), admin: false });
  assert.equal(refuse.status, 403);
  assert.equal(db.annonce_interets.length, 0);
  const r = await lire(await handleAnnonces('outil_matcher', { cle, a: 11, b: 12, op: 'dematcher' }, { ...ctx(null), admin: false }));
  assert.equal(r.status, 200);
  assert.equal(r.fait, 'n° 11 ↔ n° 12');
  assert.equal(db.annonce_interets[0].statut, 'mis_en_relation');
});

// Le profil anonyme de son match (15 nov. 2026) : visible seulement par les deux personnes en relation.
test('voir le profil de son match : oui en relation, non sinon', async () => {
  const annonceKarim2 = { id: 'a-karim', ref: 12, user_id: 'u-karim', email: 'karim@example.com', status: 'publiee', prenom: 'Karim', genre: 'homme', en_match: true, test: false, pays: 'France', matching: {}, profil: 'Je suis calme.', recherche: 'Une femme sérieuse.' };
  const { ctx } = base({ annonces: [annonceNina(), annonceKarim2], annonce_interets: [{ id: 'i-1', demandeur_id: 'a-nina', cible_ref: 12, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-02T00:00:00Z' }] });
  const vu = await lire(await handleAnnonces('annonce_fiche_match', { ref: 12 }, ctx({ id: 'u-nina', email: 'nina@example.com', email_confirmed_at: '2026' })));
  assert.equal(vu.status, 200);
  assert.equal(vu.fiche.ref, 12);
  assert.equal(vu.fiche.prenom, undefined);
  assert.equal(vu.fiche.recommande, false); // match fait par le swipe, pas par Lamia
  const autreSens = await lire(await handleAnnonces('annonce_fiche_match', { ref: 11 }, ctx({ id: 'u-karim', email: 'karim@example.com', email_confirmed_at: '2026' })));
  assert.equal(autreSens.status, 200);
  const pasLui = await lire(await handleAnnonces('annonce_fiche_match', { ref: 99 }, ctx({ id: 'u-nina', email: 'nina@example.com', email_confirmed_at: '2026' })));
  assert.equal(pasLui.status, 403);
});

// Paires bloquées (15 nov. 2026) : les deux personnes sont prévenues, une seule fois par raison.
test('paire bloquée : les deux sont prévenus une fois, avec la raison', async () => {
  const karim = { id: 'a-karim', ref: 12, user_id: 'u-karim', email: 'karim@example.com', status: 'publiee', prenom: 'Karim', genre: 'homme', en_match: false, test: false, pays: 'France', matching: {} };
  const { db, ctx } = base({
    annonces: [{ ...annonceNina(), en_match: true }, karim],
    annonce_interets: [{ id: 'i-b', demandeur_id: 'a-karim', cible_ref: 11, statut: 'a_traiter', reciproque: true, created_at: '2026-11-02T00:00:00Z' }],
    platform_settings: [{ key: 'pilote', value: { actif: true } }],
  });
  const lancer = () => handleAnnonces('annonce_pilote', { op: 'lancer' }, { ...ctx({ id: 'adm', email: 'a@x.fr' }), admin: true });
  await lancer();
  assert.equal(db.annonce_interets.find((x) => x.id === 'i-b').bloque_alerte, 'plein:11');
  const nos = () => (db.alertes_membres || []).filter((x) => /dit oui aussi|réciproque, mais/.test(x.titre));
  assert.equal(nos().length, 2);
  assert.ok(nos().some((x) => /Nina/.test(x.titre)) && nos().some((x) => /Karim/.test(x.titre)));
  await lancer();
  assert.equal(nos().length, 2);
});

// Miroir outil ↔ site (15 nov. 2026) : archivé ou supprimé dans l'outil = retiré du site (le compte reste) ; un doublon est relié.
test('miroir : fiche archivée dans l’outil → fiche et profil de rencontre retirés, compte gardé ; doublon relié ; outil vide → rien', async () => {
  const { createHash } = await import('node:crypto');
  const cle = 'k'.repeat(40);
  const monde = () => base({
    platform_settings: [{ key: 'outil_liaison', value: { hash: createHash('sha256').update(cle).digest('hex') } }],
    profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100002, 'u-sam', 'homme'), FICHE(100003, null, 'femme')],
    annonces: [
      { id: 'a-rachid', ref: 12, user_id: 'u-rachid', email: 'rachid@example.com', status: 'publiee', prenom: 'Rachid', genre: 'homme', en_match: false, test: false, fiche_ref: 100001, outil_id: 'o-100001', exportee_at: '2026-11-02T00:00:00Z' },
      { id: 'a-sam', ref: 13, user_id: 'u-sam', email: 'sam@example.com', status: 'publiee', prenom: 'Sam', genre: 'homme', en_match: false, test: false, fiche_ref: null, outil_id: null },
      { id: 'a-lea', ref: 14, user_id: 'u-lea', email: 'lea@example.com', status: 'publiee', prenom: 'Léa', genre: 'femme', en_match: false, test: false, fiche_ref: null, outil_id: null },
    ],
  });
  let { db, ctx } = monde();
  const r = await lire(await handleAnnonces('outil_synchro', { cle, actifs: ['o-100002', 'o-100003', 'site-annonce-13'], supprimes: ['o-100001', 'site-annonce-14'] }, ctx(null)));
  assert.equal(r.status, 200);
  assert.deepEqual(r.miroir, { fiches_retirees: 1, profils_retires: 2, doublons_relies: 1 });
  const f = (ref) => db.profils_outil.find((x) => x.ref === ref), a = (ref) => db.annonces.find((x) => x.ref === ref);
  assert.ok(f(100001).retire_at); assert.equal(f(100002).retire_at, null);
  assert.deepEqual([a(12).status, a(14).status, a(13).status, a(13).outil_id], ['retiree', 'retiree', 'publiee', 'o-100002']);
  assert.equal(a(12).user_id, 'u-rachid'); // le compte reste
  assert.ok(r.retires_site.includes('site-annonce-12'));
  // Outil vide ou abîmé : rien n'est touché.
  ({ db, ctx } = monde());
  const r2 = await lire(await handleAnnonces('outil_synchro', { cle, actifs: [], supprimes: ['o-100001'] }, ctx(null)));
  assert.equal(r2.miroir.refuse, true);
  assert.equal(db.profils_outil.find((x) => x.ref === 100001).retire_at, null);
});

test('profil validé sans ses 2 photos : remis en attente et prévenu, revalidable dès les photos ; les profils créés en live aussi (16 nov. 2026)', async () => {
  const { db, ctx } = base({
    annonces: [{ id: 'a-x', ref: 40, user_id: 'u-x', email: 'x@example.com', status: 'publiee', prenom: 'Xa', genre: 'femme', test: false },
      { id: 'a-y', ref: 41, user_id: 'u-y', email: 'y@example.com', status: 'publiee', prenom: 'Yo', genre: 'homme', test: false },
      { id: 'a-f', ref: 42, user_id: 'u-f', email: 'f@example.com', status: 'publiee', prenom: 'Fi', genre: 'homme', test: false, fiche_ref: 100009 }],
    annonce_files: [{ id: 'p1', annonce_id: 'a-y', kind: 'photo' }, { id: 'p2', annonce_id: 'a-y', kind: 'photo' }, { id: 'p3', annonce_id: 'a-x', kind: 'photo' }],
  });
  await lancerPilote(ctx);
  assert.deepEqual(db.annonces.map((a) => [a.ref, a.status]), [[40, 'a_verifier'], [41, 'publiee'], [42, 'a_verifier']]);
});

test('fiche du live sans compte ou sans ses 2 photos : proposée, marquée « en attente de validation du profil »', async () => {
  const { db, ctx } = base({
    profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100002, 'u-lina', 'femme'), FICHE(100003, null, 'femme')],
    annonces: [{ id: 'a-lina', ref: 20, user_id: 'u-lina', email: 'lina@example.com', status: 'publiee', prenom: 'Lina', genre: 'femme', en_match: false, test: false, fiche_ref: 100002 }],
    annonce_files: [{ id: 'p1', annonce_id: 'a-lina', kind: 'photo' }],
  });
  let r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  const att = () => Object.fromEntries(r.profils.map((p) => [p.ref, p.attente_validation]));
  assert.deepEqual(att(), { 100002: true, 100003: true });
  db.annonce_files.push({ id: 'p2', annonce_id: 'a-lina', kind: 'photo' });
  r = await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID)));
  assert.deepEqual(att(), { 100002: false, 100003: true });
});

test('revenir en arrière dans le swipe : Découverte seulement le dernier profil', async () => {
  const { db, ctx } = base({
    profils_outil: [FICHE(100001, 'u-rachid', 'homme')],
    annonce_passes: [{ demandeur_id: 'a-rachid', cible_ref: 31, created_at: '2026-11-16T09:00:00Z' }, { demandeur_id: 'a-rachid', cible_ref: 30, created_at: '2026-11-16T08:00:00Z' }], // la base les rend du plus récent au plus ancien
  });
  await lire(await handleAnnonces('annonce_swipe_liste', {}, ctx(RACHID))); // crée son profil interne
  const id = db.annonces.find((a) => a.user_id === 'u-rachid').id;
  db.annonce_passes.forEach((p) => { p.demandeur_id = id; });
  assert.equal((await handleAnnonces('annonce_swipe_annuler', { ref: 30 }, ctx(RACHID))).status, 403);
  assert.equal((await handleAnnonces('annonce_swipe_annuler', { ref: 31 }, ctx(RACHID))).status, 200);
});

test('formule prise pendant un match : pas d’autre match sans l’accord de la personne (réclamation du 16 nov. 2026)', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()], profils_outil: [FICHE(100001, 'u-rachid', 'homme'), FICHE(100003, 'u-karim', 'homme')] });
  const KARIM = { id: 'u-karim', email: 'karim@example.com', user_metadata: { first_name: 'Karim' } };
  const passion = (u) => ({ ...ctx(u), formuleDe: async (mail) => (mail === NINA.email ? 'passion' : 'decouverte') });
  for (const ref of [100001, 100003]) await handleAnnonces('annonce_swipe', { ref, choix: 'oui' }, passion(NINA));
  for (const u of [RACHID, KARIM]) { await handleAnnonces('annonce_swipe_liste', {}, passion(u)); await handleAnnonces('annonce_swipe', { ref: 11, choix: 'oui' }, passion(u)); }
  // Une seule mise en relation : la deuxième attend l'accord de Nina.
  assert.equal(db.annonce_interets.filter((i) => i.statut === 'mis_en_relation').length, 1);
  const { profil } = await lire(await handleAnnonces('annonce_mon_profil', {}, passion(NINA)));
  assert.equal(profil.matchs.places_en_attente, true);
  // « Pas pendant le premier échange » : rien avant 24 h.
  await handleAnnonces('annonce_matchs_multiples', { choix: '24h' }, passion(NINA));
  const r = await lire(await handleAnnonces('annonce_mon_profil', {}, passion(NINA)));
  assert.equal(r.profil.matchs.choix_multiples, '24h');
  assert.equal(r.profil.matchs.limite, 1);
});

test('dématch en cours (48 h d’au revoir) : pas de nouveau match sans l’accord, même avec l’offre gratuite (17 nov. 2026)', async () => {
  const { db, ctx } = base({ annonces: [annonceNina()] });
  db.discussions = [{ id: 'd1', a_user: NINA.id, b_user: 'u-x', ouverte_at: '2026-11-10T10:00:00Z', ferme_at: '2099-01-01T00:00:00Z', dematch_at: '2026-11-16T10:00:00Z', close_raison: null }];
  let { profil } = await lire(await handleAnnonces('annonce_mon_profil', {}, ctx(NINA)));
  assert.equal(profil.matchs.places_en_attente, true);
  assert.equal(profil.matchs.limite, 0);
  assert.equal(profil.matchs.capacite, 1); // l'offre reste à une place ; seul le consentement bloque l'ouverture
  await handleAnnonces('annonce_matchs_multiples', { choix: 'oui' }, ctx(NINA));
  ({ profil } = await lire(await handleAnnonces('annonce_mon_profil', {}, ctx(NINA))));
  assert.equal(profil.matchs.limite, 1);
});

test('affichage Passion : capacité trois, cinq intérêts en attente et un au revoir, sans changer la limite de consentement', async()=>{
  const {ctx}=base({annonces:[annonceNina()],annonce_interets:Array.from({length:5},(_,i)=>({id:'p'+i,demandeur_id:'a-nina',cible_ref:100020+i,statut:'a_traiter',reciproque:true})),
    discussions:[{id:'d1',interet_id:'ancien',a_user:NINA.id,b_user:'u-x',a_ref:11,b_ref:20,ouverte_at:'2026-11-01T00:00:00Z',ferme_at:'2026-11-05T00:00:00Z',dematch_at:'2026-11-03T00:00:00Z',close_raison:null}]});
  const {profil}=await lire(await handleAnnonces('annonce_mon_profil',{}, {...ctx(NINA),formuleDe:async()=> 'passion'}));
  assert.equal(profil.matchs.limite,0);assert.equal(profil.matchs.capacite,3);assert.equal(profil.matchs.actifs,0);assert.equal(profil.matchs.en_attente,5);assert.equal(profil.matchs.au_revoir_nombre,1);
});

test('qui t’a choisi ne repropose ni les réponses déjà données, ni les réciproques, ni les profils retirés', async()=>{
  const autres=[30,31,32,33].map((ref)=>({...annonceNina(),id:'a-'+ref,ref,user_id:'u-'+ref,status:ref===33?'retiree':'publiee'}));
  const {ctx}=base({annonces:[annonceNina(),...autres],annonce_interets:[
    {id:'oui',demandeur_id:'a-30',cible_ref:11,statut:'a_traiter',reponse:'oui',reciproque:true},
    {id:'reciproque',demandeur_id:'a-31',cible_ref:11,statut:'a_traiter',reponse:null,reciproque:true},
    {id:'a-repondre',demandeur_id:'a-32',cible_ref:11,statut:'a_traiter',reponse:null,reciproque:false},
    {id:'retiree',demandeur_id:'a-33',cible_ref:11,statut:'a_traiter',reponse:null,reciproque:false}]});
  const {profil}=await lire(await handleAnnonces('annonce_mon_profil',{}, {...ctx(NINA),formuleDe:async()=> 'passion'}));
  assert.deepEqual(profil.choisi_par.refs,[32]);assert.equal(profil.choisi_par.nombre,1);
});

test('passage de l’heure : un « plus de place » périmé est levé, et l’action tourne sans erreur (17 nov. 2026)', async () => {
  const { db, ctx } = base({ annonces: [{ ...annonceNina(), en_match: true }] });
  const r = await handleAnnonces('annonce_matchs_cron', {}, { ...ctx(null), cron: true });
  assert.equal(r.status, 200);
  const j = await lire(r);
  assert.equal(j.ok, true);
  assert.equal(db.annonces[0].en_match, false);
  assert.equal((await handleAnnonces('annonce_matchs_cron', {}, ctx(NINA))).status, 403);
});

test('au revoir en cours puis nouveau match de la même paire : le passage ne défait pas le nouveau match (17 nov. 2026)', async () => {
  const A = { id: 'a-101', ref: 101, user_id: 'u-a', email: 'a@example.com', status: 'publiee', prenom: 'A', genre: 'homme', en_match: true, test: false };
  const B = { id: 'a-98', ref: 98, user_id: 'u-b', email: 'b@example.com', status: 'publiee', prenom: 'B', genre: 'femme', en_match: true, test: false };
  const { db, ctx } = base({
    annonces: [A, B],
    annonce_interets: [
      { id: 'i-ancien', demandeur_id: 'a-98', cible_ref: 101, statut: 'dematche', reciproque: true, created_at: '2026-11-10T00:00:00Z' },
      { id: 'i-nouveau', demandeur_id: 'a-101', cible_ref: 98, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-02T00:00:00Z' },
    ],
    discussions: [
      { id: 'd-ancienne', interet_id: 'i-ancien', a_user: 'u-b', b_user: 'u-a', a_ref: 98, b_ref: 101, ouverte_at: '2026-11-01T00:00:00Z', ferme_at: '2026-11-04T00:00:00Z', dematch_at: '2026-11-02T00:00:00Z', dematch_par: 'b', dematch_rappel_at: '2026-11-02T10:00:00Z', close_raison: null },
      { id: 'd-nouvelle', interet_id: 'i-nouveau', a_user: 'u-a', b_user: 'u-b', a_ref: 101, b_ref: 98, ouverte_at: '2026-11-03T04:00:00Z', ferme_at: '2026-11-10T04:00:00Z', dematch_at: null, close_raison: null },
    ],
  });
  const r = await handleAnnonces('annonce_matchs_cron', {}, { ...ctx(null), cron: true });
  assert.equal(r.status, 200);
  assert.equal(db.annonce_interets.find((i) => i.id === 'i-nouveau').statut, 'mis_en_relation', 'le nouveau match continue');
  assert.equal(db.discussions.find((d) => d.id === 'd-nouvelle').close_raison, null, 'la nouvelle discussion reste ouverte');
});

test('au revoir en cours : une demande restée « en relation » sans nouvelle discussion est bien terminée', async () => {
  const A = { id: 'a-101', ref: 101, user_id: 'u-a', email: 'a@example.com', status: 'publiee', prenom: 'A', genre: 'homme', en_match: true, test: false };
  const B = { id: 'a-98', ref: 98, user_id: 'u-b', email: 'b@example.com', status: 'publiee', prenom: 'B', genre: 'femme', en_match: true, test: false };
  const { db, ctx } = base({
    annonces: [A, B],
    annonce_interets: [
      { id: 'i-1', demandeur_id: 'a-98', cible_ref: 101, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-01T00:00:00Z' },
      { id: 'i-2', demandeur_id: 'a-101', cible_ref: 98, statut: 'mis_en_relation', reciproque: true, created_at: '2026-11-01T00:00:00Z' },
    ],
    discussions: [{ id: 'd-1', interet_id: 'i-1', a_user: 'u-b', b_user: 'u-a', a_ref: 98, b_ref: 101, ouverte_at: '2026-11-01T00:00:00Z', ferme_at: '2026-11-04T00:00:00Z', dematch_at: '2026-11-02T00:00:00Z', dematch_par: 'b', dematch_rappel_at: '2026-11-02T10:00:00Z', close_raison: null }],
  });
  await handleAnnonces('annonce_matchs_cron', {}, { ...ctx(null), cron: true });
  assert.deepEqual(db.annonce_interets.map((i) => i.statut), ['dematche', 'dematche']);
});
