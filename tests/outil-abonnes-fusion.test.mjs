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

test('publier avec la liste de l’outil : le site est la référence, une annonce décochée dans l’outil reste affichée', async () => {
  const { patches, deps } = harnais({ 'annonces?ref=in.(99)': [{ ref: 99, outil_id: null, user_id: 'u9' }] });
  await handleAnnonces('outil_publier', { cle, retires_site: ['site-annonce-12', 'site-annonce-99', 'fiche-1'], profils: [{ outil_id: 'site-annonce-99', genre: 'femme', age: 30 }] }, deps);
  const masque = patches.filter((x) => x.table === 'annonces' && x.valeur.visible_anonyme === false);
  assert.equal(masque.length, 0);
});


test('liaison PC fermée (PR #245) : même avec la bonne clé, ni abonnés, ni fusion, ni publication', async () => {
  const { deps, patches } = harnais({ 'abonnements?statut=in': [{ email: 'a@x.fr', formule: 'prestige', periode: 'mois', statut: 'actif', created_at: '2026-11-01' }] });
  for (const action of ['outil_abonnes', 'outil_fusion', 'outil_fusion_annuler', 'outil_publier']) assert.equal((await handleAnnonces(action, { cle, profils: [] }, deps)).status, 403);
  assert.equal(patches.length, 0);
});
