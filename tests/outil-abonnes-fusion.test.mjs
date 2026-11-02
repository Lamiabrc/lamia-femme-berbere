import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleAnnonces } from '../lib/annonces.mjs';

const cle = 'c'.repeat(40);
const harnais = (tables) => {
  const patches = [];
  const read = async (url) => {
    if (url.includes('platform_settings')) return [{ value: { hash: createHash('sha256').update(cle).digest('hex') } }];
    for (const [motif, lignes] of Object.entries(tables)) if (url.includes(motif)) return lignes;
    return [];
  };
  const call = async () => new Response('[]', { status: 200 });
  const patch = async (table, filtre, valeur) => { patches.push({ table, filtre, valeur }); return { ok: true }; };
  return { patches, deps: { env: {}, call, read, insert: async () => ({}), patch, now: () => new Date('2026-11-02T12:00:00Z'), alerter: async () => {} } };
};
const lire = async (r) => ({ status: r.status, ...(await r.json()) });

test('sans la clé de liaison : refus', async () => {
  const { deps } = harnais({});
  for (const action of ['outil_abonnes', 'outil_fusion', 'outil_fusion_annuler']) assert.equal((await handleAnnonces(action, { cle: 'mauvaise' }, deps)).status, 403);
});

test('abonnés : reliés à leur annonce ou à la fiche liée, places Prestige déduites', async () => {
  const { deps } = harnais({
    'abonnements?statut=in': [
      { email: 'A@x.fr', formule: 'prestige', periode: 'mois', statut: 'actif', created_at: '2026-11-01' },
      { email: 'b@x.fr', formule: 'passion', periode: 'an', statut: 'impaye', created_at: '2026-11-01' },
      { email: 'sans@x.fr', formule: 'passion', periode: 'mois', statut: 'actif', created_at: '2026-11-01' },
    ],
    'abonnements?formule=eq.prestige': [{ id: 1 }, { id: 2 }],
    '/annonces?status=in': [{ ref: 7, email: 'a@x.fr', outil_id: null }, { ref: 8, email: 'b@x.fr', outil_id: 'fiche-8' }],
  });
  const r = await lire(await handleAnnonces('outil_abonnes', { cle }, deps));
  assert.equal(r.places, 18);
  assert.deepEqual(r.abonnes.map((a) => a.id_outil), ['site-annonce-7', 'fiche-8', null]);
});

test('fusion : la fiche retirée disparaît, ses demandes et son compte passent sur la fiche gardée', async () => {
  const { deps, patches } = harnais({
    'profils_outil?outil_id=eq.vieux': [{ ref: 10, user_id: 'u1' }],
    'profils_outil?outil_id=eq.neuf': [{ ref: 20, user_id: null }],
    'annonce_interets?cible_ref=eq.10': [{ id: 'i1' }, { id: 'i2' }],
    'propositions?or=': [{ id: 'p1', pour_ref: 10, cible_ref: 30 }],
  });
  const r = await lire(await handleAnnonces('outil_fusion', { cle, garde: 'neuf', retire: 'vieux' }, deps));
  assert.equal(r.demandes, 2);
  const de = (t) => patches.filter((p) => p.table === t);
  assert.deepEqual(de('annonce_interets').map((p) => p.valeur.cible_ref), [20, 20]);
  assert.deepEqual(de('propositions')[0].valeur, { pour_ref: 20 });
  assert.deepEqual(de('annonces')[0], { table: 'annonces', filtre: 'outil_id=eq.vieux', valeur: { outil_id: 'neuf' } });
  assert.ok(de('profils_outil').some((p) => p.filtre === 'ref=eq.20' && p.valeur.user_id === 'u1'));
  assert.ok(de('profils_outil').some((p) => p.filtre === 'ref=eq.10' && p.valeur.visible === false && p.valeur.user_id === null));
});

test('fusion d’une annonce du site dans une fiche live : l’annonce reste reliée, elle ne reviendra pas en doublon', async () => {
  const { deps, patches } = harnais({});
  const r = await lire(await handleAnnonces('outil_fusion', { cle, garde: 'fiche-1', retire: 'site-annonce-42' }, deps));
  assert.equal(r.ok, true);
  assert.deepEqual(patches, [{ table: 'annonces', filtre: 'ref=eq.42', valeur: { outil_id: 'fiche-1' } }]);
});

test('annuler la fusion : la fiche redevient visible', async () => {
  const { deps, patches } = harnais({});
  await handleAnnonces('outil_fusion_annuler', { cle, retire: 'vieux' }, deps);
  assert.equal(patches[0].valeur.visible, true);
});

test('empreintes : deux fiches avec le même lien ne font plus échouer tout le lot', async () => {
  const { deps } = harnais({});
  const envois = [];
  deps.call = async (u, o) => { if (o?.method === 'POST') envois.push(...JSON.parse(o.body)); return new Response('[]', { status: 200 }); };
  const h = (c) => c.repeat(64);
  const r = await handleAnnonces('outil_tiktok', { cle, empreintes: [{ h: h('a'), outil_id: 'fiche-1' }, { h: h('b'), outil_id: 'fiche-2' }, { h: h('a'), outil_id: 'fiche-3' }] }, deps);
  assert.equal(r.status, 200);
  assert.equal(envois.length, 2);
  assert.equal(envois.find((x) => x.h === h('a')).outil_id, 'fiche-1');
});
