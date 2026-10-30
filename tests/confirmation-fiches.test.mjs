import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces, jetonAnnonce } from '../lib/annonces.mjs';

// Une fiche de l'outil (n° 5020) et une petite base en mémoire.
function monde() {
  const fiches = [{ ref: 5020, outil_id: 'p-1', genre: 'femme', age: 45, pays: 'Algérie', profil: 'Je suis sérieuse.', recherche: 'Un homme doux.', visible: true, confirme_at: null, retire_at: null }];
  const alertes = [], patches = [];
  const read = async (u) => {
    if (u.startsWith('/rest/v1/profils_outil?ref=eq.')) { const r = Number(u.match(/ref=eq\.(\d+)/)[1]); return fiches.filter((f) => f.ref === r).map((f) => ({ ...f })); }
    if (u.startsWith('/rest/v1/profils_outil?visible=eq.true')) return fiches.filter((f) => f.visible && (!u.includes('confirme_at=not.is.null') || f.confirme_at) && (!u.includes('retire_at=is.null') || !f.retire_at));
    return [];
  };
  const patch = async (t, filtre, v) => { patches.push([t, filtre, v]); const m = filtre.match(/ref=eq\.(\d+)/); for (const f of fiches) if (m && f.ref === Number(m[1])) Object.assign(f, v); return { ok: true }; };
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'x' };
  const ctx = { env, call: async () => ({ ok: true, json: async () => [] }), read, insert: async () => ({}), patch, admin: false, user: null, ipHash: 'ip', now: () => new Date('2026-10-30T20:00:00Z'), email: async () => true, alerter: async (a) => alertes.push(a.titre) };
  return { fiches, alertes, patches, ctx, jeton: jetonAnnonce(env, 'outil-5020', 'confirmer') };
}

test('une fiche non confirmée reste affichée, marquée « en attente de confirmation »', async () => {
  const { ctx } = monde();
  const r = await (await handleAnnonces('annonces_publiques', {}, ctx)).json();
  const f = r.annonces.find((a) => a.ref === 5020);
  assert.equal(f.confirme, false);
  assert.equal(f.outil, true);
  assert.equal('confirme_at' in f, false);
});
test('sans le bon jeton, impossible de voir ou de confirmer la fiche', async () => {
  const { ctx, fiches } = monde();
  for (const action of ['annonce_fiche_outil', 'annonce_confirmer_outil', 'annonce_retirer_outil']) {
    const r = await handleAnnonces(action, { n: '5020', t: 'faux' }, ctx);
    assert.equal(r.status, 403);
  }
  assert.equal(fiches[0].confirme_at, null);
});
test('la personne confirme : la fiche est marquée « confirmé » et Lamia est prévenue', async () => {
  const { ctx, jeton, alertes } = monde();
  let d = await (await handleAnnonces('annonce_fiche_outil', { n: '5020', t: jeton }, ctx)).json();
  assert.equal(d.confirme, false);
  assert.equal(d.fiche.outil_id, 'p-1'); // l'identifiant interne de l'outil ne contient aucune donnée personnelle
  d = await (await handleAnnonces('annonce_confirmer_outil', { n: '5020', t: jeton }, ctx)).json();
  assert.equal(d.confirme, true);
  assert.equal(alertes.length, 1);
  const r = await (await handleAnnonces('annonces_publiques', {}, ctx)).json();
  assert.equal(r.annonces.find((a) => a.ref === 5020).confirme, true);
});
test('« je ne veux plus apparaître » masque la fiche, même confirmée', async () => {
  const { ctx, jeton, fiches } = monde();
  await handleAnnonces('annonce_confirmer_outil', { n: '5020', t: jeton }, ctx);
  const d = await (await handleAnnonces('annonce_retirer_outil', { n: '5020', t: jeton }, ctx)).json();
  assert.equal(d.retire, true);
  assert.equal(fiches[0].visible, false);
  const r = await (await handleAnnonces('annonces_publiques', {}, ctx)).json();
  assert.equal(r.annonces.filter((a) => a.ref === 5020).length, 0);
});
test('« je veux la modifier avant » : la fiche reste cachée et Lamia reçoit la demande', async () => {
  const { ctx, jeton, alertes, fiches } = monde();
  let r = await handleAnnonces('annonce_modifier_outil', { n: '5020', t: jeton, texte: '' }, ctx);
  assert.equal(r.status, 400);
  const d = await (await handleAnnonces('annonce_modifier_outil', { n: '5020', t: jeton, texte: 'Je vis maintenant à Paris.' }, ctx)).json();
  assert.equal(d.modif, true);
  assert.equal(fiches[0].modif_demandee, 'Je vis maintenant à Paris.');
  assert.equal(fiches[0].confirme_at, null);
  assert.match(alertes[0], /modification demandée/);
});
test('« je ne veux plus être dans l’outil » : retirée du site et Lamia doit l’effacer', async () => {
  const { ctx, jeton, alertes, fiches } = monde();
  const d = await (await handleAnnonces('annonce_effacer_outil', { n: '5020', t: jeton }, ctx)).json();
  assert.equal(d.efface, true);
  assert.equal(fiches[0].visible, false);
  assert.ok(fiches[0].retire_at);
  assert.match(alertes[0], /effacement/);
});
test('relier sa fiche à son compte : seulement avec le bon jeton, et une seule personne par fiche', async () => {
  const { ctx, jeton, fiches } = monde();
  const moi = { ...ctx, user: { id: 'u-1', email: 'moi@example.com' } };
  assert.equal((await handleAnnonces('annonce_lier_fiche_outil', { n: '5020', t: jeton }, ctx)).status, 401);
  assert.equal((await handleAnnonces('annonce_lier_fiche_outil', { n: '5020', t: 'faux' }, moi)).status, 403);
  assert.equal((await handleAnnonces('annonce_lier_fiche_outil', { n: '5020', t: jeton }, moi)).status, 200);
  assert.equal(fiches[0].user_id, 'u-1');
  const autre = { ...ctx, user: { id: 'u-2', email: 'autre@example.com' } };
  assert.equal((await handleAnnonces('annonce_lier_fiche_outil', { n: '5020', t: jeton }, autre)).status, 409);
});
test('intérêt reçu : la personne voit la fiche anonyme (sans prénom) et répond oui → réciproque, Lamia prévenue', async () => {
  const { ctx, alertes, fiches, patches } = monde();
  fiches[0].user_id = 'u-1';
  const demandeur = { id: '11111111-1111-1111-1111-111111111111', ref: 12, prenom: 'Karim', email: 'k@example.com', genre: 'homme', birth_date: '1980-01-01', ville: 'Lyon', pays: 'France', profil: 'Sérieux.', recherche: 'Une femme douce.', status: 'publiee', matching: {} };
  const interet = { id: '22222222-2222-2222-2222-222222222222', cible_ref: 5020, demandeur_id: demandeur.id, created_at: '2026-10-30T20:00:00Z', statut: 'a_traiter', reciproque: false, annonces: demandeur };
  const read0 = ctx.read;
  const c = { ...ctx, user: { id: 'u-1', email: 'moi@example.com' }, read: async (u) => {
    if (u.startsWith('/rest/v1/profils_outil?user_id=eq.u-1')) return [{ ref: 5020 }];
    if (u.startsWith('/rest/v1/annonce_interets?cible_ref=in.(5020)')) return [interet];
    if (u.startsWith(`/rest/v1/annonce_interets?id=eq.${interet.id}`)) return [interet];
    return read0(u);
  } };
  const r = await (await handleAnnonces('annonce_interets_recus', {}, c)).json();
  assert.equal(r.interets.length, 1);
  assert.equal(r.interets[0].fiche.ref, 12);
  assert.equal('prenom' in r.interets[0].fiche, false);
  const d = await (await handleAnnonces('annonce_repondre_interet', { id: interet.id, reponse: 'oui' }, c)).json();
  assert.equal(d.reponse, 'oui');
  assert.ok(patches.some(([t, , v]) => t === 'annonce_interets' && v.reciproque === true));
  assert.match(alertes.at(-1), /réciproque/);
});
