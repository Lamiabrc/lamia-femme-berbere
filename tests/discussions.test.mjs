import test from 'node:test';
import assert from 'node:assert/strict';
import { compterMatchs, ouvrirDiscussion, actionDiscussion, suiviDematchs } from '../lib/discussions.mjs';

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
  assert.deepEqual(pushes[0], [B, 'Ton match t’a écrit']);

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

test('parcours : il s’ouvre avec la discussion, les deux valident et l’étape suivante s’ouvre', async () => {
  const { db, ctx } = base();
  const pushes = [], alertes = [];
  const c = { ...ctx, pousserMembre: async (u, m) => { pushes.push([u, m.titre]); }, alerter: async (m) => { alertes.push(m.titre); } };
  await ouvrirDiscussion(c, { interetId: 'i1', a: { user_id: A, ref: 3, prenom: 'Melina' }, b: { user_id: B, ref: 27, prenom: 'Rachid' } });
  // Pas ouvert sur cette discussion : rien n'est montré ni validable.
  let [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...c, user: { id: A } }));
  assert.equal(l.discussions[0].parcours, null);
  const [s0] = await json(await actionDiscussion('annonce_parcours_valider', { id: D, etape: 'connaitre' }, { ...c, user: { id: A } }));
  assert.equal(s0, 404);

  Object.assign(db.discussions[0], { parcours_actif: true, parcours: {}, ferme_at: '2999-01-01T00:00:00.000Z' });
  [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...c, user: { id: A } }));
  assert.equal(l.discussions[0].parcours.courante, 0);
  assert.equal(l.discussions[0].parcours.etapes[0].etat, 'en_cours');

  // On ne saute pas d'étape.
  const [s1, r1] = await json(await actionDiscussion('annonce_parcours_valider', { id: D, etape: 'valeurs' }, { ...c, user: { id: A } }));
  assert.equal(s1, 409); assert.equal(r1.error, 'etape_non_ouverte');

  // Une seule validation ne suffit pas.
  await actionDiscussion('annonce_parcours_valider', { id: D, etape: 'connaitre' }, { ...c, user: { id: A } });
  [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...c, user: { id: B } }));
  assert.equal(l.discussions[0].parcours.courante, 0);
  assert.equal(l.discussions[0].parcours.etapes[0].lui, true); assert.equal(l.discussions[0].parcours.etapes[0].moi, false);
  assert.equal(pushes.at(-1)[0], B);

  // La seconde validation franchit l'étape, pour les deux.
  const [, r2] = await json(await actionDiscussion('annonce_parcours_valider', { id: D, etape: 'connaitre' }, { ...c, user: { id: B } }));
  assert.equal(r2.franchie, true);
  [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...c, user: { id: A } }));
  assert.equal(l.discussions[0].parcours.courante, 1);
  assert.equal(l.discussions[0].parcours.etapes[0].etat, 'faite');

  // Jusqu'au bout : Lamia est prévenue.
  for (const e of l.discussions[0].parcours.etapes.slice(1)) for (const u of [A, B]) await actionDiscussion('annonce_parcours_valider', { id: D, etape: e.id }, { ...c, user: { id: u } });
  [, l] = await json(await actionDiscussion('annonce_discussions', {}, { ...c, user: { id: B } }));
  assert.equal(l.discussions[0].parcours.fini, true);
  assert.equal(alertes.length, 1);
});

test('parcours : il survit à la fin des 7 jours si les numéros sont échangés, pas à un dématch', async () => {
  const { db, ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 3, prenom: 'Melina' }, b: { user_id: B, ref: 27, prenom: 'Rachid' } });
  Object.assign(db.discussions[0], { parcours_actif: true, parcours: {}, ferme_at: '2000-01-01T00:00:00.000Z' });
  const [s1] = await json(await actionDiscussion('annonce_parcours_valider', { id: D, etape: 'connaitre' }, { ...ctx, user: { id: A } }));
  assert.equal(s1, 409);
  Object.assign(db.discussions[0], { a_numero: '+33612345678', b_numero: '+33612345679' });
  const [s2] = await json(await actionDiscussion('annonce_parcours_valider', { id: D, etape: 'connaitre' }, { ...ctx, user: { id: A } }));
  assert.equal(s2, 200);
  db.discussions[0].close_raison = 'dematch';
  const [s3] = await json(await actionDiscussion('annonce_parcours_valider', { id: D, etape: 'connaitre' }, { ...ctx, user: { id: B } }));
  assert.equal(s3, 409);
});

test('dématch courtois : raison obligatoire, deux messages, l’autre prévenu, puis fin du match', async () => {
  const { db, pushes, ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 3, prenom: 'Melina' }, b: { user_id: B, ref: 27, prenom: 'Rachid' } });
  ctx.read = async (path) => {
    if (path.includes('discussion_messages')) return [...db.discussion_messages];
    return db.discussions;
  };
  const insert0 = ctx.insert;
  ctx.insert = async (t, r) => insert0(t, { created_at: '2026-11-01T10:00:00.000Z', ...r });
  const termines = [];
  const liberes = [];
  const moi = { ...ctx, user: { id: A }, terminerDematch: async (d) => { termines.push(d.id); }, libererMatch: async (d) => { liberes.push(d.id); } };
  const lui = { ...moi, user: { id: B } };
  const [s0] = await json(await actionDiscussion('annonce_discussion_dematcher', { id: D }, moi));
  assert.equal(s0, 400);
  const [s1, r1] = await json(await actionDiscussion('annonce_discussion_dematcher', { id: D, raison: 'parcours', etape: 'valeurs' }, moi));
  assert.equal(s1, 200); assert.equal(r1.restants, 2);
  // Règle de Lamia (10 nov. 2026) : dès le dématch annoncé, les deux retrouvent une place, sans attendre la fin de l'au revoir.
  assert.deepEqual(liberes, [D]);
  assert.match(db.discussion_messages.at(-1).texte, /matcher à nouveau dès maintenant/);
  assert.match(pushes.at(-1)[1], /La personne met fin/);
  assert.equal(pushes.at(-1)[0], B);
  assert.equal(db.discussions[0].ferme_at, '2026-11-03T10:00:00.000Z');
  assert.match(db.discussion_messages.at(-1).texte, /Valeurs/);
  const [, v] = await json(await actionDiscussion('annonce_discussions', {}, lui));
  assert.equal(v.discussions[0].dematch.par_moi, false);
  assert.equal(v.discussions[0].dematch.raison, 'L’étape « Valeurs » du parcours');
  for (const u of [moi, moi, lui, lui]) assert.equal((await actionDiscussion('annonce_discussion_envoyer', { id: D, texte: 'Au revoir' }, u)).status, 200);
  assert.deepEqual(termines, [D]);
  assert.equal((await actionDiscussion('annonce_discussion_envoyer', { id: D, texte: 'Encore' }, moi)).status, 409);
});

test('dématch courtois : après 48 heures le match se termine, un rappel à qui n’a rien écrit', async () => {
  const { pushes, ctx } = base();
  const d = { id: D, dematch_par: 'a', a_user: A, b_user: B, dematch_at: '2026-11-01T09:00:00Z', ferme_at: '2026-11-03T09:00:00Z', close_raison: null };
  const termines = [];
  const lire = async (p) => (p.includes('discussion_messages') ? [] : [d]);
  const r1 = await suiviDematchs({ ...ctx, read: lire, terminerDematch: async (x) => termines.push(x.id) });
  assert.deepEqual(r1, { rappels: 1, termines: 0 });
  assert.equal(pushes.at(-1)[0], A);
  const r2 = await suiviDematchs({ ...ctx, read: lire, now: () => new Date('2026-11-03T10:00:00Z'), terminerDematch: async (x) => termines.push(x.id) });
  assert.equal(r2.termines, 1);
  assert.deepEqual(termines, [D]);
});

test('prénom : caché par défaut, demandé, partagé par choix, ou plus tard après quelques messages', async () => {
  const { db, pushes, ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 3, prenom: 'Melina' }, b: { user_id: B, ref: 27, prenom: 'Rachid' } });
  const liste = async (u) => (await json(await actionDiscussion('annonce_discussions', {}, { ...ctx, user: { id: u } })))[1].discussions[0];
  let vu = await liste(B);
  assert.equal(vu.avec, 'Profil n° 3');
  assert.ok(!JSON.stringify(vu).includes('Melina'), 'jamais envoyé avant son accord');
  assert.equal(vu.prenom.demander, true);

  await actionDiscussion('annonce_discussion_prenom', { id: D, choix: 'plus_tard' }, { ...ctx, user: { id: A } });
  assert.equal((await liste(A)).prenom.demander, false);
  assert.equal((await liste(B)).avec, 'Profil n° 3');

  const [s] = await json(await actionDiscussion('annonce_discussion_prenom', { id: D, choix: 'partager' }, { ...ctx, user: { id: A } }));
  assert.equal(s, 200);
  vu = await liste(B);
  assert.equal(vu.avec, 'Melina');
  assert.equal(vu.prenom.partage, false, 'le choix de l’un n’engage pas l’autre');
  assert.equal((await liste(A)).avec, 'Profil n° 27');
  assert.deepEqual(pushes.at(-1), [B, 'Melina t’a donné son prénom']);
  assert.ok(db.discussion_messages.some((m) => m.texte.includes('Melina')));
});

test('chaque jour, un au revoir encore ouvert rend les places (dématchs d’avant la règle compris)', async () => {
  const d = { id: D, dematch_par: 'a', a_user: A, b_user: B, dematch_at: '2026-11-01T09:00:00Z', ferme_at: '2026-11-03T09:00:00Z', dematch_rappel_at: '2026-11-01T17:00:00Z' };
  const liberes = [], termines = [];
  const base = { read: async () => [d], patch: async () => [], pousserMembre: async () => {}, terminerDematch: async (x) => termines.push(x.id), libererMatch: async (x) => liberes.push(x.id) };
  await suiviDematchs({ ...base, now: () => new Date('2026-11-02T10:00:00Z') });
  assert.deepEqual(liberes, [D]); assert.deepEqual(termines, []);
  await suiviDematchs({ ...base, now: () => new Date('2026-11-03T10:00:00Z') });
  assert.deepEqual(termines, [D]);
});
