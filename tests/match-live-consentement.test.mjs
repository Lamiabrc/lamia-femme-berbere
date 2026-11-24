import test from 'node:test';
import assert from 'node:assert/strict';
import { basePhotos, ADMIN, MEMBRE } from './helpers/moderation-photos-base.mjs';

// Match en direct : une personne en match choisit si Lamia peut lui proposer quelqu'un pendant le live.
async function recette(t) {
  const b = await basePhotos(); t.after(() => b.db.close());
  await b.db.exec('alter table annonces add column if not exists en_match boolean default false, add column if not exists match_live_ok boolean, add column if not exists match_live_reponse_at timestamptz, add column if not exists match_live_demande_at timestamptz');
  return b;
}

test('la personne dit non, puis change d’avis', async (t) => {
  const b = await recette(t);
  assert.equal((await b.action('annonce_match_live_choix', { choix: 'non' })).status, 200);
  assert.equal((await b.a()).match_live_ok, false);
  assert.equal((await b.action('annonce_match_live_choix', { choix: 'oui' })).status, 200);
  assert.equal((await b.a()).match_live_ok, true);
  assert.ok((await b.a()).match_live_reponse_at);
});

test('un choix invalide ou sans connexion est refusé', async (t) => {
  const b = await recette(t);
  assert.equal((await b.action('annonce_match_live_choix', { choix: 'peut-etre' })).status, 400);
  assert.equal((await b.action('annonce_match_live_choix', { choix: 'oui' }, null)).status, 401);
  assert.equal((await b.a()).match_live_ok, null);
});

test('envoyer une compatibilité est réservé à Lamia', async (t) => {
  const b = await recette(t);
  for (const u of [null, MEMBRE]) assert.equal((await b.action('match_direct_proposer', { pour: 42, cible: 43 }, u)).status, 403);
});

test('une personne en match qui a dit non ne reçoit rien ; sans match en cours, le non ne bloque plus', async (t) => {
  const b = await recette(t);
  await b.db.query("update annonces set en_match=true, match_live_ok=false where ref=42");
  const r = await b.action('match_direct_proposer', { pour: 42, cible: 43 }, ADMIN);
  assert.equal(r.status, 409);
  assert.equal(r.error, 'refuse_match_live');
  // Elle a dématché : le non ne vaut plus, la proposition peut partir (l'étape suivante n'est pas branchée dans cette recette).
  await b.db.query("update annonces set en_match=false where ref=42");
  const r2 = await b.action('match_direct_proposer', { pour: 42, cible: 43 }, ADMIN).catch((e) => ({ status: 500, error: e.message }));
  assert.notEqual(r2.error, 'refuse_match_live');
});
