import test from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirDiscussion, actionDiscussion } from '../lib/discussions.mjs';
import { JEUX, lireJeu, messageCarte } from '../content/jeux-discussion.mjs';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', D = '33333333-3333-4333-8333-333333333333';
function base() {
  const db = { discussions: [], discussion_messages: [] }, pushes = [];
  let n = 0;
  const now = () => new Date('2026-11-01T10:00:00Z');
  const read = async (path) => {
    if (path.includes('/annonces?')) return [];
    if (path.includes('annonce_files')) return [];
    if (path.includes('blocages')) return [];
    if (path.includes('discussion_messages')) return path.includes('auteur=eq.') ? [] : [...db.discussion_messages].reverse();
    return db.discussions;
  };
  const insert = async (t, row) => { n += 1; const r = { id: D, created_at: `2026-11-01T10:00:${String(n).padStart(2, '0')}Z`, ...row }; db[t].push(r); return r; };
  const patch = async (t, f, row) => { for (const r of db[t]) Object.assign(r, row); };
  const pousserMembre = async (u, m) => { pushes.push([u, m.titre]); };
  return { db, pushes, ctx: { read, insert, patch, now, pousserMembre, alerter: async () => {} } };
}
const json = async (r) => [r.status, await r.json()];
const carteDe = (l) => l.discussions[0].messages.find((m) => m.jeu)?.jeu;

test('lecture des messages de jeu', () => {
  assert.deepEqual(lireJeu(messageCarte('preferes', 0)).cle, 'preferes:0');
  assert.equal(lireJeu('Bonjour'), null);
  assert.equal(lireJeu('x ⟦jeu:inconnu:0⟧'), null);
  for (const [k, j] of Object.entries(JEUX)) assert.ok(j.nom && j.cartes.length >= 8, k);
});

test('jeu dans la bulle : carte, réponses cachées puis dévoilées ensemble', async () => {
  const { db, pushes, ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 3 }, b: { user_id: B, ref: 27 } });
  const [s1] = await json(await actionDiscussion('annonce_discussion_jeu', { id: D, jeu: 'preferes', i: 0 }, { ...ctx, user: { id: A } }));
  assert.equal(s1, 200);
  assert.match(db.discussion_messages[0].texte, /Thé à la menthe ou Café \? ⟦jeu:preferes:0⟧$/);
  assert.deepEqual(pushes.at(-1), [B, 'Ton match te propose un jeu']);
  // La même carte ne se joue qu'une fois ; une carte inventée est refusée.
  assert.equal((await actionDiscussion('annonce_discussion_jeu', { id: D, jeu: 'preferes', i: 0 }, { ...ctx, user: { id: B } })).status, 409);
  assert.equal((await actionDiscussion('annonce_discussion_jeu', { id: D, jeu: 'preferes', i: 99 }, { ...ctx, user: { id: A } })).status, 400);

  // B répond : A ne voit pas encore sa réponse.
  assert.equal((await actionDiscussion('annonce_discussion_jeu_rep', { id: D, jeu: 'preferes', i: 0, texte: 'Café' }, { ...ctx, user: { id: B } })).status, 200);
  let [, la] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: A } }));
  let c = carteDe(la);
  assert.equal(c.a_repondu, true); assert.equal(c.sa_reponse, null); assert.equal(c.ma_reponse, null);
  assert.equal(la.discussions[0].messages.length, 1, 'la réponse ne s’affiche pas comme un message à part');
  // B voit sa propre réponse, en attente de celle de A.
  const [, lb] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: B } }));
  assert.equal(carteDe(lb).ma_reponse, 'Café'); assert.equal(carteDe(lb).sa_reponse, null);

  // A répond : les deux réponses sont visibles. Une seule réponse par personne et par carte.
  await actionDiscussion('annonce_discussion_jeu_rep', { id: D, jeu: 'preferes', i: 0, texte: 'Thé à la menthe' }, { ...ctx, user: { id: A } });
  assert.equal((await actionDiscussion('annonce_discussion_jeu_rep', { id: D, jeu: 'preferes', i: 0, texte: 'Café' }, { ...ctx, user: { id: A } })).status, 409);
  [, la] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: A } }));
  c = carteDe(la);
  assert.equal(c.ma_reponse, 'Thé à la menthe'); assert.equal(c.sa_reponse, 'Café');

  // Pas de réponse à une carte qui n'a pas été envoyée, et les contacts restent masqués.
  assert.equal((await actionDiscussion('annonce_discussion_jeu_rep', { id: D, jeu: 'aime', i: 1, texte: 'x' }, { ...ctx, user: { id: A } })).status, 404);
  await actionDiscussion('annonce_discussion_jeu', { id: D, jeu: 'aime', i: 1 }, { ...ctx, user: { id: B } });
  await actionDiscussion('annonce_discussion_jeu_rep', { id: D, jeu: 'aime', i: 1, texte: 'Bejaia, au bord de la mer' }, { ...ctx, user: { id: B } });
  [, la] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: A } }));
  assert.ok(!JSON.stringify(la).includes('Bejaia'), 'la réponse de B ne part pas chez A avant la sienne');
  await actionDiscussion('annonce_discussion_jeu_rep', { id: D, jeu: 'aime', i: 1, texte: 'Écris-moi au 06 12 34 56 78' }, { ...ctx, user: { id: A } });
  assert.ok(!db.discussion_messages.at(-1).texte.includes('06 12'));
  [, la] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: A } }));
  assert.ok(JSON.stringify(la).includes('Bejaia'));
});
