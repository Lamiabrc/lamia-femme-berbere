import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { actionDiscussion } from '../lib/discussions.mjs';
import { handleAnnonces } from '../lib/annonces.mjs';
import { creerEnvoisDiscussion } from '../src/messagerie-reseau.mjs';

const pg = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20261119144620_messagerie_envois_idempotents.sql', import.meta.url), 'utf8');
const exec = (sql, params = []) => pg.query(sql, params);
let prochainRef = 1000;
before(async () => {
  await pg.exec(`create table discussions (id uuid primary key, a_user uuid, b_user uuid, a_ref integer, b_ref integer, ouverte_at timestamptz, ferme_at timestamptz, close_raison text, notif_a_at timestamptz, notif_b_at timestamptz);
    create table discussion_messages (id bigint generated always as identity primary key, discussion_id uuid references discussions(id), auteur uuid, texte text, created_at timestamptz default now(), role text, auteur_nom text);
    create table blocages (auteur_user uuid, cible_user uuid, auteur_ref integer, cible_ref integer);
    alter table discussion_messages enable row level security;
    insert into discussion_messages (texte) values ('Historique fictif antérieur à la migration');`);
  await pg.exec(migration);
});
after(async () => { await pg.close(); });

async function contexte() {
  const A = randomUUID(), B = randomUUID(), D = randomUUID(), pushes = [];
  const RA = prochainRef++, RB = prochainRef++;
  const t = new Date('2026-11-19T12:00:00Z');
  await exec('insert into discussions(id,a_user,b_user,a_ref,b_ref,ouverte_at,ferme_at) values ($1,$2,$3,$4,$5,$6,$7)', [D,A,B,RA,RB,t.toISOString(),'2026-11-26T12:00:00Z']);
  const read = async (path) => {
    const u = new URL(path, 'https://fictif.invalid'), p = u.searchParams;
    if (u.pathname === '/rest/v1/annonces' || u.pathname === '/rest/v1/annonce_files') return [];
    if (u.pathname === '/rest/v1/blocages') return (await exec('select * from blocages')).rows;
    const table = u.pathname.endsWith('/discussion_messages') ? 'discussion_messages' : 'discussions';
    const filtre = [], params = [];
    for (const cle of ['id','discussion_id','auteur','client_message_id','created_at']) {
      const v = p.get(cle); if (!v) continue;
      const point = v.indexOf('.'), op = v.slice(0,point), valeur = v.slice(point+1);
      if (op === 'eq' || op === 'gte') { params.push(valeur); filtre.push(`${cle} ${op === 'eq' ? '=' : '>='} $${params.length}`); }
    }
    if (p.has('or') && table === 'discussions') { const uid = p.get('or').match(/a_user\.eq\.([a-f\d-]+)/)?.[1]; params.push(uid); filtre.push(`(a_user=$${params.length} or b_user=$${params.length})`); }
    const tri = p.get('order')?.startsWith('created_at') ? ' order by created_at desc,id desc' : '';
    return (await exec(`select * from ${table}${filtre.length ? ' where '+filtre.join(' and ') : ''}${tri}${p.has('limit') ? ' limit '+Number(p.get('limit')) : ''}`,params)).rows;
  };
  const insert = async (table, row) => { const cols = Object.keys(row); return (await exec(`insert into ${table} (${cols.join(',')}) values (${cols.map((_,i)=>'$'+(i+1)).join(',')}) returning *`, Object.values(row))).rows[0]; };
  const patch = async (_table, _filtre, row) => { const cols = Object.keys(row); return exec(`update discussions set ${cols.map((c,i)=>`${c}=$${i+1}`).join(',')} where id=$${cols.length+1}`, [...Object.values(row),D]); };
  const ctx = { read, insert, patch, user: { id:A }, now:()=>t, pousserMembre:async (...v)=>{pushes.push(v);}, quiEst:async()=>({genre:'femme',prenom:'Test'}) };
  const action = async (action, body = {}, options = {}) => { const r = await actionDiscussion(action, body, {...ctx,...options}); return { status:r.status, data:await r.json() }; };
  const nombre = async () => Number((await exec('select count(*) as n from discussion_messages where discussion_id=$1',[D])).rows[0].n);
  return {A,B,D,RA,RB,ctx,action,nombre,pushes};
}

test('migration additive : ancien historique intact, RLS conservée, script rejouable', async () => {
  await pg.exec(migration);
  const {rows} = await exec("select texte,client_message_id from discussion_messages where discussion_id is null");
  assert.deepEqual(rows,[{texte:'Historique fictif antérieur à la migration',client_message_id:null}]);
  assert.equal((await exec("select relrowsecurity from pg_class where relname='discussion_messages'")).rows[0].relrowsecurity,true);
});

test('envoi, réception puis rechargement : le même message fictif est conservé', async () => {
  const c = await contexte(), cle=randomUUID();
  assert.equal((await c.action('annonce_discussion_envoyer',{id:c.D,texte:'Salam, message fictif',client_message_id:cle})).status,200);
  for(let i=0;i<2;i++) {
    const l=await c.action('annonce_discussions',{}, {user:{id:c.B}});
    assert.equal(l.data.discussions.length,1); assert.equal(l.data.discussions[0].messages[0].texte,'Salam, message fictif');
    assert.equal(l.data.discussions[0].messages[0].moi,false); assert.equal(l.data.discussions[0].messages[0].client_message_id,cle);
  }
  assert.equal(await c.nombre(),1);
});

test('réponse perdue après enregistrement : relance du navigateur sans doublon ni seconde notification', async () => {
  const c=await contexte(), envois=creerEnvoisDiscussion(); let premier=true;
  const appel=async(body)=>{const r=await c.action(body.action,body); if(premier){premier=false;throw new TypeError('réponse perdue');}return r.data;};
  await assert.rejects(envois.envoyer(c.D,'Essai de coupure fictive',appel));
  const r=await envois.envoyer(c.D,'Essai de coupure fictive',appel);
  assert.equal(r.rejoue,true); assert.equal(await c.nombre(),1); assert.equal(c.pushes.length,1);
});

test('deux envois simultanés : la contrainte PostgreSQL garantit une seule ligne', async () => {
  const c=await contexte(), body={id:c.D,texte:'Concurrence fictive',client_message_id:randomUUID()};
  const rs=await Promise.all([c.action('annonce_discussion_envoyer',body),c.action('annonce_discussion_envoyer',body)]);
  assert.deepEqual(rs.map(r=>r.status),[200,200]); assert.equal(await c.nombre(),1); assert.equal(c.pushes.length,1);
});

test('une clé déjà utilisée ne permet pas de remplacer le texte enregistré', async () => {
  const c=await contexte(), body={id:c.D,texte:'Premier texte fictif',client_message_id:randomUUID()};
  await c.action('annonce_discussion_envoyer',body);
  assert.equal((await c.action('annonce_discussion_envoyer',{...body,texte:'Texte différent'})).status,409);
  assert.equal(await c.nombre(),1);
});

test('l’accusé peut être relu après fermeture, mais un nouvel envoi reste interdit', async () => {
  const c=await contexte(), body={id:c.D,texte:'Dernier message fictif',client_message_id:randomUUID()};
  await c.action('annonce_discussion_envoyer',body); await exec("update discussions set close_raison='dematch' where id=$1",[c.D]);
  assert.equal((await c.action('annonce_discussion_envoyer',body)).data.rejoue,true);
  assert.equal((await c.action('annonce_discussion_envoyer',{...body,client_message_id:randomUUID()})).status,409);
});

test('confidentialité : sans connexion ou hors de la discussion, aucun message accessible', async () => {
  const c=await contexte(), body={id:c.D,texte:'Interdit',client_message_id:randomUUID()};
  assert.equal((await c.action('annonce_discussion_envoyer',body,{user:null})).status,401);
  assert.equal((await c.action('annonce_discussion_envoyer',body,{user:{id:randomUUID()}})).status,404);
  assert.equal(await c.nombre(),0);
});

test('blocage dans les deux sens : liste masquée, envoi direct refusé, historique stocké intact', async () => {
  const c=await contexte(); await c.action('annonce_discussion_envoyer',{id:c.D,texte:'Historique fictif avant blocage'});
  await exec('insert into blocages(auteur_user,cible_user,auteur_ref,cible_ref) values ($1,$2,$3,$4)',[c.B,c.A,c.RB,c.RA]);
  for (const uid of [c.A,c.B]) {
    assert.deepEqual((await c.action('annonce_discussions',{}, {user:{id:uid}})).data.discussions,[]);
    assert.equal((await c.action('annonce_discussion_envoyer',{id:c.D,texte:'Refusé'}, {user:{id:uid}})).status,404);
  }
  assert.equal(await c.nombre(),1);
});

test('une panne de lecture ne devient pas une liste vide ou un profil inexistant', async () => {
  const c=await contexte();
  await assert.rejects(c.action('annonce_discussions',{}, {read:async()=>{throw new Error('panne fictive');}}),/panne fictive/);
  await assert.rejects(handleAnnonces('annonce_mon_profil',{}, {env:{},user:{id:c.A,email:'lamia@test.invalid'},patch:async()=>{},read:async()=>{throw new Error('profil indisponible');},now:()=>new Date()}),/profil indisponible/);
});

test('une notification lente ne bloque pas l’accusé d’un message déjà enregistré', async () => {
  const c=await contexte(), travaux=[]; let finir;
  const pousse=new Promise(r=>{finir=r;});
  try {
    const reponse=await Promise.race([c.action('annonce_discussion_envoyer',{id:c.D,texte:'Notification fictive'},{pousserMembre:()=>pousse,apresReponse:p=>travaux.push(p)}),new Promise(r=>setTimeout(()=>r(null),200))]);
    assert.equal(reponse?.status,200); assert.equal(await c.nombre(),1); assert.equal(travaux.length,1);
  } finally { finir(); await Promise.all(travaux); }
});
