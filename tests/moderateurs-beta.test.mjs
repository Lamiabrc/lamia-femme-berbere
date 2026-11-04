import test from 'node:test';
import assert from 'node:assert/strict';
import { actionModeration, MESSAGE_BETA } from '../lib/moderateurs.mjs';
import { etatAbonnement } from '../lib/abonnements.mjs';
import { badgesProfil } from '../content/matching-options.mjs';

const lire = async (r) => ({ status: r.status, ...(await r.json()) });
function ctx({ user = null, admin = false, comptes = {} } = {}) {
  const db = { annonces: [{ ref: 10, fiche_ref: null }, { ref: 11, fiche_ref: null }], profils_outil: [], formules_offertes: [], beta_testeurs: [] };
  const envoyes = [];
  const filtre = (url) => { const [p, q = ''] = url.replace('/rest/v1/', '').split('?'); const conds = q.split('&').filter((c) => !c.startsWith('select') && !c.startsWith('order') && !c.startsWith('limit')).map((c) => { const [k, ...v] = c.split('='); return [k, decodeURIComponent(v.join('=')).replace(/^eq\./, '')]; }); return [p, (l) => conds.every(([k, v]) => (v === 'not.is.null' ? l[k] != null : String(l[k]) === v))]; };
  return { db, envoyes, c: {
    read: async (u) => { const [t, f] = filtre(u); return (db[t] || []).filter(f); },
    insert: async (t, r) => { db[t].push({ statut: t === 'beta_testeurs' ? 'invite' : undefined, ...r }); },
    patch: async (t, q, o) => { const [, f] = filtre(`/rest/v1/${t}?${q}`); db[t].filter(f).forEach((l) => Object.assign(l, o)); },
    call: async (u, { method }) => { if (method === 'DELETE') { const [t, f] = filtre(u); db[t] = db[t].filter((l) => !f(l)); } return { ok: true }; },
    now: () => new Date('2026-11-04T12:00:00Z'), user, admin, alerter: async () => {}, refOutil: 100000,
    compteDeRef: async (r) => comptes[r] || null,
    prevenirMembre: async (m, msg) => { envoyes.push([m.email, msg.titre]); },
  } };
}

test('modérateur : badge et formule offerte, retirés ensemble', async () => {
  const { db, c } = ctx({ admin: true, comptes: { 10: { email: 'Ana@X.fr' } } });
  const r = await lire(await actionModeration('annonce_moderateur', { ref: 10, oui: true }, c));
  assert.equal(r.formule, 'passion');
  assert.ok(db.annonces[0].moderateur_at);
  assert.deepEqual(db.formules_offertes.map((o) => [o.email, o.formule]), [['ana@x.fr', 'passion']]);
  await actionModeration('annonce_moderateur', { ref: 10, oui: false }, c);
  assert.equal(db.annonces[0].moderateur_at, null);
  assert.equal(db.formules_offertes.length, 0);
});

test('modérateur : pas de badge sans compte', async () => {
  const { db, c } = ctx({ admin: true });
  const r = await lire(await actionModeration('annonce_moderateur', { ref: 11, oui: true }, c));
  assert.equal(r.status, 409);
  assert.equal(db.annonces[1].moderateur_at, undefined);
});

test('seule Lamia gère les modérateurs et les invitations', async () => {
  const { c } = ctx({ user: { email: 'a@b.fr' } });
  for (const a of ['annonce_moderateur', 'annonce_moderateurs', 'annonce_beta_inviter', 'annonce_beta_liste']) assert.equal((await actionModeration(a, { ref: 10, refs: [10] }, c)).status, 403);
});

test('bêta : invitation unique, puis accord avec adresse', async () => {
  const { db, envoyes, c } = ctx({ admin: true, comptes: { 10: { email: 'ana@x.fr' } } });
  const r = await lire(await actionModeration('annonce_beta_inviter', { refs: [10, 10, 11] }, c));
  assert.deepEqual([r.invites, r.sansCompte], [[10], [11]]);
  assert.deepEqual(envoyes, [['ana@x.fr', MESSAGE_BETA.titre]]);
  assert.deepEqual((await lire(await actionModeration('annonce_beta_inviter', { refs: [10] }, c))).deja, [10]);
  const moi = { ...c, admin: false, user: { email: 'ANA@x.fr' } };
  assert.equal((await actionModeration('annonce_beta_repondre', { oui: true, adresse: 'pasbon' }, moi)).status, 400);
  await actionModeration('annonce_beta_repondre', { oui: true, adresse: 'Ana@gmail.com' }, moi);
  assert.deepEqual([db.beta_testeurs[0].statut, db.beta_testeurs[0].adresse_google], ['accepte', 'ana@gmail.com']);
});

test('bêta : on ne répond que si on est invité', async () => {
  const { c } = ctx({ user: { email: 'x@y.fr' } });
  assert.equal((await actionModeration('annonce_beta_repondre', { oui: false }, c)).status, 404);
});

test('formule offerte : vaut Passion, un vrai abonnement reste prioritaire', async () => {
  const env = { SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_URL_PUBLIC: 'https://x.test' };
  const f = (abos) => async (u) => ({ ok: true, json: async () => (String(u).includes('formules_offertes') ? [{ formule: 'passion', raison: 'moderateur' }] : String(u).includes('abonnements') ? abos : []) });
  const e1 = await etatAbonnement('a@b.fr', { env, fetcher: f([]) });
  assert.equal(e1.abonnement.formule, 'passion'); assert.equal(e1.abonnement.offert, true);
  const e2 = await etatAbonnement('a@b.fr', { env, fetcher: f([{ formule: 'prestige', statut: 'actif' }]) });
  assert.equal(e2.abonnement.formule, 'prestige');
});

test('badge modérateur', () => { assert.match(badgesProfil({ moderateur: true }), /Modérateur/); assert.doesNotMatch(badgesProfil({}), /Modérateur/); });
