import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { ouvrirDiscussion } from '../lib/discussions.mjs';

const migration = await readFile(new URL('../supabase/migrations/20261127204627_rematch_discussion_historique.sql', import.meta.url), 'utf8');
async function recette(t, fermeture = { close_raison: 'dematch', dematch_at: '2026-11-27T19:00:00Z' }) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table annonce_interets(id uuid primary key, statut text default 'dematche', updated_at timestamptz);
    create table discussions(id uuid primary key default gen_random_uuid(), interet_id uuid unique,
      a_user uuid not null, b_user uuid not null, a_ref int, b_ref int, a_prenom text, b_prenom text,
      ouverte_at timestamptz not null, ferme_at timestamptz not null, dematch_at timestamptz,
      close_raison text, signalee_at timestamptz, a_numero text, b_numero text,
      a_prenom_partage_at timestamptz, parcours jsonb not null default '{}');
    create table discussion_messages(id uuid primary key default gen_random_uuid(), discussion_id uuid references discussions(id), texte text);`);
  await db.exec(migration);
  const interetId = randomUUID(), ancienId = randomUUID(), a = { user_id: randomUUID(), ref: 11 }, b = { user_id: randomUUID(), ref: 12 };
  const now = () => new Date('2026-11-27T20:36:00Z');
  await db.query('insert into annonce_interets(id) values($1)', [interetId]);
  await db.query(`insert into discussions(id,interet_id,a_user,b_user,a_ref,b_ref,ouverte_at,ferme_at,a_numero,b_numero,a_prenom_partage_at,parcours)
    values($1,$2,$3,$4,11,12,'2026-11-26','2026-11-27 20:00Z','+33111111111','+33222222222','2026-11-26','{"etape":2}')`, [ancienId, interetId, a.user_id, b.user_id]);
  for (const [k, v] of Object.entries(fermeture)) await db.query(`update discussions set ${k}=$1 where id=$2`, [v, ancienId]);
  await db.query("insert into discussion_messages(discussion_id,texte) values($1,'Historique fictif')", [ancienId]);
  const read = async path => path.includes('/discussions?') ? (await db.query('select * from discussions where interet_id=$1', [interetId])).rows : [];
  const call = async (path, opt) => {
    assert.equal(path, '/rest/v1/rpc/rematcher_discussion');
    const p = JSON.parse(opt.body);
    const { rows } = await db.query('select rematcher_discussion($1,$2,$3,$4) as resultat', [p.p_interet_id, p.p_precedente_id, p.p_ouverte_at, p.p_ferme_at]);
    return Response.json(rows[0].resultat);
  };
  return { db, ancienId, args: { interetId, a, b, jours: 14 }, ctx: { read, call, now, insert: async () => { throw Error('insertion directe inattendue'); } } };
}

test('rematch du même intérêt : nouveau chat, historique intact et aucun consentement hérité', async t => {
  const { db, ctx, args, ancienId } = await recette(t);
  const avant = (await db.query('select * from discussions where id=$1', [ancienId])).rows[0];
  const d = await ouvrirDiscussion(ctx, args);
  assert.equal(d.cree, true); assert.notEqual(d.id, ancienId);
  const apres = (await db.query('select * from discussions where id=$1', [ancienId])).rows[0];
  assert.deepEqual(apres, { ...avant, interet_id: null, interet_origine_id: args.interetId });
  const neuve = (await db.query('select * from discussions where id=$1', [d.id])).rows[0];
  assert.equal(neuve.a_numero, null); assert.equal(neuve.b_numero, null); assert.equal(neuve.a_prenom_partage_at, null);
  assert.deepEqual(neuve.parcours, {}); assert.equal(neuve.dematch_at, null); assert.equal(neuve.close_raison, null);
  assert.equal(new Date(neuve.ferme_at) - new Date(neuve.ouverte_at), 14 * 864e5);
  assert.equal((await db.query('select discussion_id from discussion_messages')).rows[0].discussion_id, ancienId);
  assert.equal((await db.query('select statut from annonce_interets')).rows[0].statut, 'mis_en_relation');
});

test('deux rematchs simultanés puis une répétition : une seule création', async t => {
  const { db, ctx, args } = await recette(t);
  const resultats = await Promise.all([ouvrirDiscussion(ctx, args), ouvrirDiscussion(ctx, args)]);
  assert.equal(resultats.filter(d => d.cree).length, 1); assert.equal(resultats[0].id, resultats[1].id);
  assert.equal((await ouvrirDiscussion(ctx, args)).cree, false);
  assert.equal((await db.query('select count(*)::int n from discussions')).rows[0].n, 2);
});

test('échéance naturelle et au revoir : nouvelle discussion, sans prolonger l’ancienne', async t => {
  for (const fermeture of [{}, { ferme_at: '2026-11-29', dematch_at: '2026-11-27T19:00:00Z' }]) {
    const { ctx, args } = await recette(t, fermeture);
    assert.equal((await ouvrirDiscussion(ctx, args)).cree, true);
  }
});

test('insertion refusée : la transaction restaure aussi le lien historique', async t => {
  const { db, ctx, args, ancienId } = await recette(t);
  await db.exec(`create function refuser_insert() returns trigger language plpgsql as $$ begin raise exception 'panne simulée'; end $$;
    create trigger panne before insert on discussions for each row execute function refuser_insert();`);
  await assert.rejects(ouvrirDiscussion(ctx, args), /panne simulée/);
  const rows = (await db.query('select id,interet_id,interet_origine_id from discussions')).rows;
  assert.deepEqual(rows, [{ id: ancienId, interet_id: args.interetId, interet_origine_id: null }]);
});

test('rematch inaccessible aux rôles publics, signalement et changement de propriétaire refusés', async t => {
  const { db, ctx, args } = await recette(t, { signalee_at: '2026-11-27T19:00:00Z' });
  for (const role of ['anon', 'authenticated']) assert.equal((await db.query("select has_function_privilege($1,'public.rematcher_discussion(uuid,uuid,timestamptz,timestamptz)','EXECUTE') ok", [role])).rows[0].ok, false);
  assert.equal(await ouvrirDiscussion(ctx, args), null);
  await db.exec('update discussions set signalee_at=null');
  assert.equal(await ouvrirDiscussion(ctx, { ...args, a: { ...args.a, user_id: randomUUID() } }), null);
});

test('migration absente et panne de lecture : aucun faux succès et aucune modification', async t => {
  const { db, ctx, args } = await recette(t);
  assert.equal(await ouvrirDiscussion({ ...ctx, call: async () => Response.json({}, { status: 503 }) }, args), null);
  await assert.rejects(ouvrirDiscussion({ ...ctx, read: async () => { throw Error('lecture indisponible'); } }, args), /lecture indisponible/);
  assert.equal((await db.query('select count(*)::int n from discussions where interet_id is not null')).rows[0].n, 1);
});
