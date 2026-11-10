import test from 'node:test';
import assert from 'node:assert/strict';
import { actionBlocage, refsCachees, blocageEntre } from '../lib/blocages.mjs';

const harnais = (tables = {}) => {
  const patches = [], inserts = [], appels = [], alertes = [];
  let fini = null;
  const deps = {
    read: async (u) => { for (const [m, l] of Object.entries(tables)) if (u.includes(m)) return l; return []; },
    insert: async (t, r) => { inserts.push({ t, r }); return r; },
    patch: async (t, f, v) => { patches.push({ t, f, v }); return { ok: true }; },
    call: async (u, o) => { appels.push({ u, o }); return { ok: true }; },
    now: () => new Date('2026-11-02T12:00:00Z'), user: { id: 'moi' },
    alerter: async (x) => { alertes.push(x); },
    monProfil: async () => ({ id: 'a1', ref: 5 }), mesRefs: async () => [5, 200001],
    compteDeRef: async () => ({ user_id: 'lui' }),
    finirMatch: async (a) => { fini = a; }, fermerDiscussion: async () => {}, REF_OUTIL: 100000,
  };
  return { deps, patches, inserts, appels, alertes, get fini() { return fini; } };
};
const lire = async (r) => ({ status: r.status, ...(await r.json()) });

test('il faut être connecté, et on ne se bloque pas soi-même', async () => {
  const h = harnais();
  assert.equal((await actionBlocage('annonce_bloquer', { ref: 9 }, { ...h.deps, user: null })).status, 401);
  assert.equal((await actionBlocage('annonce_bloquer', { ref: 5 }, h.deps)).status, 400);
  assert.equal((await actionBlocage('annonce_signaler_profil', { ref: 200001 }, h.deps)).status, 400);
  assert.equal((await actionBlocage('annonce_bloquer', { ref: 'x' }, h.deps)).status, 400);
});

test('bloquer : discussion fermée, demandes retirées, match terminé, Lamia alertée', async () => {
  const h = harnais({ 'annonce_interets?demandeur_id=eq.a1': [{ id: 'i1', statut: 'mis_en_relation' }], 'annonces?ref=in.(9)': [{ id: 'c1' }], 'annonce_interets?demandeur_id=eq.c1': [{ id: 'i2', statut: 'a_traiter' }] });
  const r = await lire(await actionBlocage('annonce_bloquer', { ref: 9, motif: 'insultes' }, h.deps));
  assert.equal(r.ok, true);
  const corps = JSON.parse(h.appels[0].o.body);
  assert.deepEqual([corps.auteur_user, corps.auteur_ref, corps.cible_ref, corps.cible_user], ['moi', 5, 9, 'lui']);
  assert.ok(h.patches.some((p) => p.t === 'discussions' && p.v.close_raison === 'bloque' && p.f.includes('b_ref.in.(9)')));
  assert.ok(h.patches.some((p) => p.t === 'annonce_interets' && p.f === 'id=eq.i2' && p.v.statut === 'pas_compatible'));
  assert.deepEqual(h.fini, { id: 'a1', ref: 5 });
  assert.match(h.alertes[0].titre, /bloqué n° 9/);
});

test('signaler : enregistré et Lamia alertée, sans fermer quoi que ce soit', async () => {
  const h = harnais();
  await actionBlocage('annonce_signaler_profil', { ref: 9, motif: 'faux profil' }, h.deps);
  assert.equal(h.inserts[0].t, 'signalements');
  assert.equal(h.inserts[0].r.cible_ref, 9);
  assert.equal(h.patches.length, 0);
  assert.match(h.alertes[0].titre, /signalé/);
});

test('signaler plus de 20 fois par jour : refusé', async () => {
  const h = harnais({ signalements: Array(20).fill({ id: 1 }) });
  assert.equal((await actionBlocage('annonce_signaler_profil', { ref: 9 }, h.deps)).status, 429);
});

test('le blocage cache dans les deux sens', async () => {
  const read = async () => [{ auteur_ref: 5, cible_ref: 9 }, { auteur_ref: 7, cible_ref: 5 }];
  assert.deepEqual([...await refsCachees({ read }, [5])].sort(), [7, 9]);
  assert.equal((await refsCachees({ read }, [])).size, 0);
  assert.equal(await blocageEntre({ read }, 5, 9), true);
  assert.equal(await blocageEntre({ read: async () => [] }, 5, 9), false);
});

test('débloquer : seulement ses propres blocages', async () => {
  const h = harnais();
  await actionBlocage('annonce_debloquer', { ref: 9 }, h.deps);
  assert.match(h.appels[0].u, /auteur_user=eq\.moi&cible_ref=eq\.9/);
  assert.equal(h.appels[0].o.method, 'DELETE');
});

test('un seul bouton : bloquer et signaler enregistre les deux, une seule alerte', async () => {
  const h = harnais();
  const r = await lire(await actionBlocage('annonce_bloquer_signaler', { ref: 9, motif: 'insultes' }, h.deps));
  assert.equal(r.status, 200);
  assert.equal(h.inserts.filter((x) => x.t === 'signalements').length, 1);
  assert.ok(h.appels.some((x) => x.u.includes('blocages')));
  assert.equal(h.alertes.length, 1);
});

test('bloquer et signaler : au-delà de 20 signalements par jour, le blocage passe quand même', async () => {
  const h = harnais({ 'signalements?auteur_user': Array(21).fill({ id: 1 }) });
  const r = await lire(await actionBlocage('annonce_bloquer_signaler', { ref: 9 }, h.deps));
  assert.equal(r.status, 200);
  assert.ok(h.appels.some((x) => x.u.includes('blocages')));
});


test('un signalement regardé par Lamia sort de la liste : l’action existe et ne touche que les non traités', async () => {
  const { readFile } = await import('node:fs/promises');
  const code = await readFile(new URL('../lib/annonces.mjs', import.meta.url), 'utf8');
  assert.match(code, /action === 'annonce_signalement_traite'/);
  assert.match(code, /patch\('signalements', `id=eq\.\$\{id\}&traite_at=is\.null`/);
  const tdb = await readFile(new URL('../public/tableau.js', import.meta.url), 'utf8');
  assert.match(tdb, /data-signalement-traite/);
  assert.match(tdb, /href=\\"#profil-\$\{esc\(s\.cible_ref\)\}\\"|href="#profil-\$\{esc\(s\.cible_ref\)\}"/);
});
