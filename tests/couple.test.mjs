// « Notre couple » : créer, inviter par code, planning partagé (pour nous deux / pour moi), faire plaisir, quitter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionCouple, ouvrirCoupleDuo } from '../lib/couple.mjs';

function monde() {
  const db = { couples: [], couple_membres: [], couple_activites: [], cadeaux_demandes: [] };
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const cond = (l, c) => { const [k, op, ...v] = c.split('.'); const val = v.join('.'); if (op === 'eq') return String(l[k]) === val; return true; };
  const filtrer = (t, qs) => (db[t] || []).filter((l) => qs.split('&').every((p) => {
    const [k, v] = p.split('='); if (!v || ['select', 'order', 'limit'].includes(k)) return true;
    if (k === 'or') return v.slice(1, -1).split(',').some((c) => cond(l, c));
    return cond(l, `${k}.${v}`);
  }));
  const coupe = (u) => { const m = u.match(/^\/rest\/v1\/([a-z_]+)\??(.*)$/); return [m[1], m[2]]; };
  const read = async (u) => { const [t, qs] = coupe(u); return filtrer(t, qs); };
  const insert = async (t, row) => { const r = { id: id(), ...row }; db[t].push(r); return r; };
  const patch = async (t, f, row) => { filtrer(t, f).forEach((l) => Object.assign(l, row)); };
  const call = async (u, o) => { if (o?.method === 'DELETE') { const [t, qs] = coupe(u); const out = new Set(filtrer(t, qs)); db[t] = db[t].filter((l) => !out.has(l)); } return { ok: true }; };
  const alertes = [];
  const ctx = (user) => ({ read, insert, patch, call, now: () => new Date('2026-11-16T10:00:00Z'), user, alerter: async (x) => { alertes.push(x.titre); } });
  return { db, ctx, alertes };
}
const lire = async (r) => ({ status: r.status, ...(await r.json()) });
const AMINE = { id: 'u-amine', email: 'amine@example.com', user_metadata: { first_name: 'Amine' } };
const SARA = { id: 'u-sara', email: 'sara@example.com', user_metadata: { first_name: 'Sara' } };

test('notre couple : créer, rejoindre par code, planning partagé, faire plaisir, quitter', async () => {
  const { db, ctx, alertes } = monde();
  assert.equal((await actionCouple('couple_etat', {}, ctx(null))).status, 401);
  let r = await lire(await actionCouple('couple_creer', {}, ctx(AMINE)));
  assert.equal(r.couple.membres.length, 1);
  const code = r.couple.code;
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal((await actionCouple('couple_rejoindre', { code: 'AAAAAA' }, ctx(SARA))).status, 404);
  r = await lire(await actionCouple('couple_rejoindre', { code: code.toLowerCase() }, ctx(SARA)));
  assert.deepEqual(r.couple.membres.map((m) => [m.prenom, m.moi]), [['Amine', false], ['Sara', true]]);
  assert.equal(r.couple.code, null);
  // Le code ne sert plus : l'espace est complet.
  assert.equal((await actionCouple('couple_rejoindre', { code }, ctx({ ...SARA, id: 'u-x' }))).status, 404);
  await actionCouple('couple_activite_ajouter', { titre: 'Dîner à deux', type: 'repas', quand: '2026-11-20T19:00:00Z' }, ctx(AMINE));
  await actionCouple('couple_activite_ajouter', { titre: 'Surprise', type: 'autre', pour_nous: false }, ctx(AMINE));
  r = await lire(await actionCouple('couple_etat', {}, ctx(SARA)));
  assert.deepEqual(r.couple.activites.map((a) => a.titre), ['Dîner à deux']); // la surprise reste pour Amine
  const diner = r.couple.activites[0].id;
  assert.equal((await actionCouple('couple_activite_suppr', { id: diner }, ctx(SARA))).status, 403);
  r = await lire(await actionCouple('couple_activite_fait', { id: diner }, ctx(SARA)));
  assert.equal(r.couple.activites[0].fait, true);
  assert.equal((await actionCouple('couple_cadeau', { type: 'fleurs', note: 'Pour son anniversaire' }, ctx(SARA))).status, 200);
  assert.equal(db.cadeaux_demandes.length, 1);
  assert.equal(alertes.length, 1);
  r = await lire(await actionCouple('couple_quitter', {}, ctx(SARA)));
  assert.equal(r.couple, null);
  assert.equal(db.couples.length, 1);
  await actionCouple('couple_quitter', {}, ctx(AMINE));
  assert.equal(db.couples.length, 0);
});

test('fin de discussion « en couple » des deux côtés : l’espace commun s’ouvre (ou l’autre rejoint l’espace déjà créé)', async () => {
  const { db, ctx } = monde();
  const c = ctx(AMINE);
  let id = await ouvrirCoupleDuo(c, [{ user_id: 'u-amine', prenom: 'Amine' }, { user_id: 'u-sara', prenom: 'Sara' }], 'd-1');
  assert.ok(id);
  assert.equal(db.couple_membres.filter((m) => m.couple_id === id).length, 2);
  assert.equal(db.couples[0].discussion_id, 'd-1');
  // Déjà ensemble : rien de nouveau.
  assert.equal(await ouvrirCoupleDuo(c, [{ user_id: 'u-amine' }, { user_id: 'u-sara' }]), id);
  assert.equal(db.couples.length, 1);
  // Karim avait créé son espace seul : Nadia le rejoint.
  const k = await lire(await actionCouple('couple_creer', {}, ctx({ id: 'u-karim', email: 'k@x.fr', user_metadata: { first_name: 'Karim' } })));
  id = await ouvrirCoupleDuo(c, [{ user_id: 'u-karim' }, { user_id: 'u-nadia', prenom: 'Nadia' }]);
  assert.equal(id, k.couple.id);
  assert.equal(db.couple_membres.filter((m) => m.couple_id === id).length, 2);
});

test('mots doux : le mot part chez l’autre (notification) et s’affiche dans le fil, pas dans le planning', async () => {
  const { ctx } = monde();
  const pousses = [];
  const avec = (u) => ({ ...ctx(u), pousser: async (uid, m) => { pousses.push([uid, m.texte]); return 1; } });
  const r0 = await lire(await actionCouple('couple_creer', {}, avec(AMINE)));
  await actionCouple('couple_rejoindre', { code: r0.couple.code }, avec(SARA));
  // « Je t'aime » et le mot libre viennent avec l'abonnement Couple ; « Je pense à toi » est gratuit.
  assert.equal((await actionCouple('couple_mot', { texte: 'Je t’aime ❤️' }, avec(SARA))).status, 402);
  assert.equal((await actionCouple('couple_mot', { texte: 'Mon soleil' }, avec(SARA))).status, 402);
  const r = await lire(await actionCouple('couple_mot', { texte: 'Je pense à toi 💭' }, avec(SARA)));
  assert.deepEqual(pousses, [['u-amine', 'Je pense à toi 💭']]);
  assert.deepEqual(r.couple.mots.map((m) => [m.texte, m.de_moi]), [['Je pense à toi 💭', true]]);
  assert.equal(r.couple.premium, false);
  assert.equal(r.couple.activites.length, 0);
});

test('on s’est mariés : photo dans le stockage privé, adresse obligatoire, Lamia prévenue', async () => {
  const { ctx, alertes } = monde();
  const r0 = await lire(await actionCouple('couple_creer', {}, ctx(AMINE)));
  await actionCouple('couple_rejoindre', { code: r0.couple.code }, ctx(SARA));
  assert.equal((await actionCouple('couple_mariage', { path: 'mariages/autre/1.jpg', adresse: '12 rue des Lilas, 35000 Rennes' }, ctx(SARA))).status, 400);
  assert.equal((await actionCouple('couple_mariage', { path: `mariages/${r0.couple.id}/1.jpg`, adresse: 'Rennes' }, ctx(SARA))).status, 400);
  assert.equal((await actionCouple('couple_mariage', { path: `mariages/${r0.couple.id}/1.jpg`, adresse: '12 rue des Lilas, 35000 Rennes', date: '2027-06-12' }, ctx(SARA))).status, 200);
  assert.ok(alertes.some((t) => t.includes('se sont mariés')));
});
