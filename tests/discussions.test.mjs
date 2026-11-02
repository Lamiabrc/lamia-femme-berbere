import test from 'node:test';
import assert from 'node:assert/strict';
import { compterMatchs, ouvrirDiscussion, actionDiscussion } from '../lib/discussions.mjs';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', D = '33333333-3333-4333-8333-333333333333';
function base() {
  const db = { discussions: [], discussion_messages: [] }, pushes = [];
  const now = () => new Date('2026-11-01T10:00:00Z');
  const read = async (path) => {
    if (path.includes('discussion_messages')) return path.includes('auteur=eq.') ? [] : db.discussion_messages;
    if (path.includes('interet_id=eq.')) return db.discussions.filter((d) => path.includes(d.interet_id));
    return db.discussions;
  };
  const insert = async (t, row) => { const r = { id: D, ...row }; db[t].push(r); return r; };
  const patch = async (t, f, row) => { for (const r of db[t]) Object.assign(r, row); };
  const pousserMembre = async (u, m) => { pushes.push([u, m.titre]); };
  return { db, pushes, ctx: { read, insert, patch, now, pousserMembre, alerter: async () => {} } };
}
const json = async (r) => [r.status, await r.json()];

test('discussion : ouverte 7 jours, contacts masqués, numéros montrés quand les deux les ont donnés', async () => {
  const { db, pushes, ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 3, prenom: 'Melina' }, b: { user_id: B, ref: 27, prenom: 'Rachid' } });
  assert.equal(db.discussions.length, 1);
  assert.equal(db.discussions[0].ferme_at, '2026-11-08T10:00:00.000Z');
  // Pas de discussion si l'un n'a pas de compte.
  assert.equal(await ouvrirDiscussion(ctx, { interetId: 'i2', a: { user_id: A }, b: {} }), null);

  const [s1, r1] = await json(await actionDiscussion('annonce_discussion_envoyer', { id: D, texte: 'Salam ! mon 06 12 34 56 78' }, { ...ctx, user: { id: A } }));
  assert.equal(s1, 200); assert.equal(r1.masque, true);
  assert.ok(!db.discussion_messages[0].texte.includes('06 12'));
  assert.deepEqual(pushes[0], [B, '💬 Melina t’a écrit']);

  const [, v] = await json(await actionDiscussion('annonce_discussion_numero', { id: D, telephone: '06 12 34 56 78' }, { ...ctx, user: { id: A } }));
  assert.equal(v.echange, false);
  let [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: B } }));
  assert.equal(l.discussions[0].son_numero, null); assert.equal(l.discussions[0].il_a_partage, true);
  await actionDiscussion('annonce_discussion_numero', { id: D, telephone: '+213 551 23 45 67' }, { ...ctx, user: { id: B } });
  [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: B } }));
  assert.equal(l.discussions[0].son_numero, '+33612345678'); assert.equal(l.discussions[0].echange, true);

  // Un inconnu ne voit rien.
  const [s3] = await json(await actionDiscussion('annonce_discussion_envoyer', { id: D, texte: 'x' }, { ...ctx, user: null }));
  assert.equal(s3, 401);
});

test('matchs en cours : compté par personne, même avec un profil et une fiche', () => {
  const compteDe = new Map([[3, 'u1'], [5001, 'u1'], [27, 'u2'], [28, 'u3']]);
  const m = compterMatchs([{ id: 'i1', a: 3, b: 27 }, { id: 'i2', a: 28, b: 5001 }, { id: 'i3', a: 40, b: 28 }], compteDe);
  assert.equal(m.deCompte('u1'), 2); assert.equal(m.deRef(5001), 2); assert.equal(m.deCompte('u2'), 1);
  assert.equal(m.deCompte('u3'), 2); assert.equal(m.deRef(40), 1); assert.equal(m.deCompte('inconnu'), 0);
});

test('discussion : les autres matchs en cours sont affichés en nombre, sans dire qui', async () => {
  const { ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 3, prenom: 'Melina' }, b: { user_id: B, ref: 27, prenom: 'Rachid' } });
  const matchs = compterMatchs([{ id: 'i1', a: 3, b: 27 }, { id: 'i2', a: 27, b: 40 }, { id: 'i3', a: 27, b: 41 }], new Map([[3, A], [27, B]]));
  const [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: A }, matchsEnCoursParPersonne: async () => matchs }));
  assert.equal(l.discussions[0].ses_autres_matchs, 2); assert.equal(l.discussions[0].mes_autres_matchs, 0);
  const [, l2] = await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: B }, matchsEnCoursParPersonne: async () => matchs }));
  assert.equal(l2.discussions[0].ses_autres_matchs, 0); assert.equal(l2.discussions[0].mes_autres_matchs, 2);
  assert.ok(!JSON.stringify(l.discussions[0]).includes('"40"'));
});
