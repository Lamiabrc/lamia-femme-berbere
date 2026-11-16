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
  const insert = async (t, row) => { const r = { id: id(), created_at: new Date(Date.parse('2026-11-16T10:00:00Z') + n * 1000).toISOString(), ...row }; db[t].push(r); return r; };
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
  assert.equal(r.couple.niveau, null);
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

test('météo du cœur, question du jour, bocal à souvenirs : rien ne déborde dans le planning ni dans les mots doux', async () => {
  const { db, ctx } = monde();
  const pousses = [];
  const avec = (u) => ({ ...ctx(u), pousser: async (uid, m) => { pousses.push([uid, m.titre]); return 1; } });
  const r0 = await lire(await actionCouple('couple_creer', {}, avec(AMINE)));
  await actionCouple('couple_rejoindre', { code: r0.couple.code }, avec(SARA));
  assert.equal((await actionCouple('couple_humeur', { humeur: 9 }, avec(SARA))).status, 400);
  await actionCouple('couple_humeur', { humeur: 2, besoin: 'ecoute', note: 'Grosse journée' }, avec(SARA));
  // Une seule météo par jour : la nouvelle remplace l'ancienne.
  let r = await lire(await actionCouple('couple_humeur', { humeur: 4, besoin: 'tendresse' }, avec(SARA)));
  assert.equal(db.couple_activites.filter((x) => x.type === 'humeur').length, 1);
  assert.equal(r.couple.meteo.moi.derniere.emoji, '😊');
  assert.equal(r.couple.meteo.moi.semaine.at(-1), 4);
  r = await lire(await actionCouple('couple_etat', {}, avec(AMINE)));
  assert.equal(r.couple.meteo.lui.derniere.besoin, 'tendresse');
  assert.ok(r.suggestions.tendresse.length >= 2);
  assert.ok(pousses.some(([uid]) => uid === 'u-amine'));
  // Gardée pour soi : l'autre ne la voit pas.
  await actionCouple('couple_humeur', { humeur: 1, partage: false }, avec(AMINE));
  r = await lire(await actionCouple('couple_etat', {}, avec(SARA)));
  assert.equal(r.couple.meteo.lui.derniere, null);
  // Question du jour : la réponse de l'autre se découvre après avoir répondu.
  assert.ok(r.couple.question.texte.endsWith('?'));
  await actionCouple('couple_reponse', { texte: 'Notre balade à Tichy' }, avec(AMINE));
  r = await lire(await actionCouple('couple_etat', {}, avec(SARA)));
  assert.deepEqual([r.couple.question.a_repondu, r.couple.question.sa_reponse], [true, null]);
  r = await lire(await actionCouple('couple_reponse', { texte: 'Le mariage de ma sœur' }, avec(SARA)));
  assert.equal(r.couple.question.sa_reponse, 'Notre balade à Tichy');
  await actionCouple('couple_reponse', { texte: 'Le jour où on s’est rencontrés' }, avec(SARA));
  assert.equal(db.couple_activites.filter((x) => x.type === 'question').length, 2);
  r = await lire(await actionCouple('couple_souvenir', { texte: 'Le thé à la menthe chez ta grand-mère', quand: '2026-08-02' }, avec(SARA)));
  assert.deepEqual(r.couple.souvenirs.map((x) => x.texte), ['Le thé à la menthe chez ta grand-mère']);
  assert.equal(r.couple.activites.length, 0);
  assert.equal(r.couple.mots.length, 0);
  assert.ok(r.couple.defi.length > 10);
});

test('jeux d’amour à distance et fiançailles : la carte part chez l’autre, qui seul y répond ; étapes et liste du mariage', async () => {
  const { db, ctx } = monde();
  const pousses = [];
  const avec = (u) => ({ ...ctx(u), pousser: async (uid, m) => { pousses.push([uid, m.titre]); return 1; } });
  const r0 = await lire(await actionCouple('couple_creer', {}, avec(AMINE)));
  await actionCouple('couple_rejoindre', { code: r0.couple.code }, avec(SARA));
  assert.equal((await actionCouple('couple_jeu', { jeu: 'piquant', i: 99 }, avec(AMINE))).status, 400);
  let r = await lire(await actionCouple('couple_jeu', { jeu: 'piquant', i: 0 }, avec(AMINE)));
  const carte = r.couple.jeux[0];
  assert.deepEqual([carte.jeu, carte.de_moi, carte.reponse], ['piquant', true, null]);
  assert.ok(pousses.some(([uid]) => uid === 'u-sara'));
  assert.equal((await actionCouple('couple_jeu_repondre', { id: carte.id, texte: 'Moi ?' }, avec(AMINE))).status, 403);
  r = await lire(await actionCouple('couple_jeu_repondre', { id: carte.id, texte: 'Sous la pluie, à Tizi' }, avec(SARA)));
  assert.equal(r.couple.jeux[0].reponse, 'Sous la pluie, à Tizi');
  await actionCouple('couple_jalon', { cle: 'mariage', date: '2027-07-10' }, avec(SARA));
  r = await lire(await actionCouple('couple_jalon', { cle: 'mariage', date: '2027-08-14' }, avec(AMINE)));
  assert.deepEqual(r.couple.jalons, { mariage: '2027-08-14' });
  await actionCouple('couple_prepa', { cle: 'salle' }, avec(SARA));
  r = await lire(await actionCouple('couple_etat', {}, avec(AMINE)));
  assert.deepEqual(r.couple.prepa, ['salle']);
  r = await lire(await actionCouple('couple_prepa', { cle: 'salle', fait: false }, avec(AMINE)));
  assert.deepEqual(r.couple.prepa, []);
  assert.equal(db.couple_activites.filter((x) => x.type === 'jalon').length, 1);
  assert.equal(r.couple.activites.length, 0);
});

test('« Et si on se mariait ? » : la demande part chez l’autre ; oui = parcours ouvert, Lamia prévenue ; « déjà fiancés » ouvre tout de suite', async () => {
  const { ctx, alertes } = monde();
  const pousses = [];
  const avec = (u) => ({ ...ctx(u), pousser: async (uid, m) => { pousses.push([uid, m.titre]); return 1; } });
  const r0 = await lire(await actionCouple('couple_creer', {}, avec(AMINE)));
  assert.equal((await actionCouple('couple_demande', {}, avec(AMINE))).status, 409); // seul : pas encore de demande possible
  await actionCouple('couple_rejoindre', { code: r0.couple.code }, avec(SARA));
  let r = await lire(await actionCouple('couple_demande', { message: 'Veux-tu marcher à mes côtés toute la vie ?' }, avec(AMINE)));
  assert.deepEqual([r.couple.demande.de_moi, r.couple.demande.statut], [true, 'attente']);
  assert.ok(pousses.some(([uid, t]) => uid === 'u-sara' && t.includes('question')));
  assert.equal((await actionCouple('couple_demande_repondre', { oui: true }, avec(AMINE))).status, 404); // on ne répond pas à sa propre demande
  r = await lire(await actionCouple('couple_demande_repondre', { oui: false }, avec(SARA)));
  assert.equal(r.couple.demande.statut, 'reflexion');
  r = await lire(await actionCouple('couple_demande_repondre', { oui: true }, avec(SARA)));
  assert.equal(r.couple.demande.statut, 'oui');
  assert.equal(r.couple.demande.message, 'Veux-tu marcher à mes côtés toute la vie ?');
  assert.deepEqual(Object.keys(r.couple.jalons), ['demande']);
  assert.ok(alertes.some((t) => t.includes('se fiancent')));
  assert.ok(pousses.some(([uid, t]) => uid === 'u-amine' && t.includes('a dit oui')));

  const autre = monde();
  const a0 = await lire(await actionCouple('couple_creer', {}, autre.ctx(AMINE)));
  await actionCouple('couple_rejoindre', { code: a0.couple.code }, autre.ctx(SARA));
  r = await lire(await actionCouple('couple_demande', { deja: true }, autre.ctx(SARA)));
  assert.equal(r.couple.demande.statut, 'oui');
});

test('humeur gardée pour soi : elle reste « pour moi » quand on la modifie', async () => {
  const { ctx } = monde();
  const r0 = await lire(await actionCouple('couple_creer', {}, ctx(AMINE)));
  await actionCouple('couple_rejoindre', { code: r0.couple.code }, ctx(SARA));
  const r = await lire(await actionCouple('couple_humeur', { humeur: 2, partage: false }, ctx(SARA)));
  assert.equal(r.couple.meteo.moi.derniere.partage, false);
});

test('jeux dorés : « Un peu piquant » et « Coquin » avec l’abonnement Couple (la première carte est offerte) ; les autres jeux sont gratuits', async () => {
  const { ctx } = monde();
  const r0 = await lire(await actionCouple('couple_creer', {}, ctx(AMINE)));
  await actionCouple('couple_rejoindre', { code: r0.couple.code }, ctx(SARA));
  assert.equal((await actionCouple('couple_jeu', { jeu: 'coquin', i: 3 }, ctx(AMINE))).status, 402);
  assert.equal((await actionCouple('couple_jeu', { jeu: 'piquant', i: 5 }, ctx(AMINE))).status, 402);
  assert.equal((await actionCouple('couple_jeu', { jeu: 'coquin', i: 0 }, ctx(AMINE))).status, 200);
  assert.equal((await actionCouple('couple_jeu', { jeu: 'preferes', i: 2 }, ctx(AMINE))).status, 200);
  const r = await lire(await actionCouple('couple_etat', {}, ctx(AMINE)));
  assert.deepEqual(r.jeux_dores, ['piquant', 'coquin']);
});
