import test from 'node:test';
import assert from 'node:assert/strict';
import { adresser, adresse, accord } from '../lib/adresse.mjs';
import { actionDiscussion, rappelsDiscussions } from '../lib/discussions.mjs';

test('« A gma » pour un homme, « A weltma » pour une femme, avec le bon accord', () => {
  assert.equal(adresse('homme'), 'A gma');
  assert.equal(adresse('femme'), 'A weltma');
  assert.equal(accord('homme'), ''); assert.equal(accord('femme'), 'e');
  assert.equal(adresser('💌 {A}, quelqu’un t’a choisi{e}', { genre: 'homme', prenom: 'Rachid' }), '💌 A gma, quelqu’un t’a choisi');
  assert.equal(adresser('💌 {A}, quelqu’un t’a choisi{e}', { genre: 'femme', prenom: 'Melina' }), '💌 A weltma, quelqu’un t’a choisie');
});

test('genre inconnu : le prénom, sinon une phrase propre, jamais de {A} visible', () => {
  assert.equal(adresser('⏳ {A}, ta discussion se termine demain', { prenom: 'Sam' }), '⏳ Sam, ta discussion se termine demain');
  assert.equal(adresser('⏳ {A}, ta discussion se termine demain'), '⏳ Ta discussion se termine demain');
  assert.equal(adresser('Tu seras prévenu{e}'), 'Tu seras prévenu·e');
});

test('la discussion transmet l’adresse à l’écran et aux notifications', async () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const d = { id: 'x', a_user: A, b_user: 'b', a_prenom: 'Rachid', b_prenom: 'Melina', ouverte_at: '2026-11-01', ferme_at: '2026-11-02T20:00:00Z' };
  const read = async (p) => (p.includes('discussion_messages') ? [] : [d]);
  const r = await actionDiscussion('annonce_discussions', {}, { read, now: () => new Date('2026-11-02T10:00:00Z'), user: { id: A }, genreDe: async () => 'homme' });
  const j = await r.json();
  assert.equal(j.adresse, 'A gma'); assert.equal(j.accord, '');
  const pushes = [];
  await rappelsDiscussions({ read, patch: async () => {}, now: () => new Date('2026-11-02T10:00:00Z'), pousserMembre: async (u, m) => { pushes.push(m.titre); } });
  assert.deepEqual(pushes, ['⏳ {A}, ta discussion se termine demain', '⏳ {A}, ta discussion se termine demain']);
});
