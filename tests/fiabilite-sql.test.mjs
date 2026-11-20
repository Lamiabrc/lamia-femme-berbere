import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const fichier=new URL('../supabase/migrations/20261120173529_fiabilite_requetes_et_index.sql',import.meta.url);
const canon=(v)=>Array.isArray(v)?(v.length&&typeof v[0]==='object'?[...v].map(canon).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):v):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,canon(x)])):v;
test('migration : statistiques identiques, index ajoutés sans modification de données ni ouverture de droits',async(t)=>{
  const db=new PGlite();t.after(()=>db.close());const sql=await readFile(fichier,'utf8');
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table page_views(id integer,day date,path text,source text,device text,visitor text,hour integer,country text,city text,region text,event text,duration_s integer);
    create table scores_outil(a_ref integer,b_ref integer,score integer,primary key(a_ref,b_ref));`);
  // Les tables concernées par les index, uniquement des fixtures sans contenu réel.
  const tables=new Map();for(const m of sql.matchAll(/create index if not exists \w+ on public\.(\w+) \(([^)]+)\);/g)){
    if(['scores_outil','page_views'].includes(m[1]))continue;
    for(const c of m[2].split(',').map(x=>x.trim().split(' ')[0])){if(!tables.has(m[1]))tables.set(m[1],new Set());tables.get(m[1]).add(c);}
  }
  for(const [nom,cols] of tables)await db.exec(`create table ${nom}(id integer,${[...cols].map(c=>`${c} integer`).join(',')});`);
  await db.exec(await readFile(new URL('./fixtures/visit-stats2-original.sql',import.meta.url),'utf8'));
  await db.exec('revoke all on function public.visit_stats2(date,integer) from public,anon,authenticated;grant execute on function public.visit_stats2(date,integer) to service_role;');
  const avantVide=(await db.query("select public.visit_stats2('2026-11-20',7) as s")).rows[0].s;
  await db.exec(`insert into page_views select x,'2026-11-20'::date-(x%70),'/page-'||(x%19),case when x%5=0 then 'interne' else 'direct' end,'mobile','visiteur-'||(x%17),x%24,case when x%4=0 then null else 'FR' end,'ville-fictive','region-fictive',case when x%3=0 then 'temps' when x%7=0 then 'clic_boutique' else null end,case when x%3=0 then x%4000 else null end from generate_series(1,4000) x;
    insert into scores_outil values (1,2,85),(2,1,90);`);
  const avant=[];for(const jours of [7,30,90,365,0,999])avant.push((await db.query("select public.visit_stats2('2026-11-20',$1) as s",[jours])).rows[0].s);
  await db.exec('begin;'+sql+'commit;');
  let n=0;for(const jours of [7,30,90,365,0,999]){const apres=(await db.query("select public.visit_stats2('2026-11-20',$1) as s",[jours])).rows[0].s;assert.deepEqual(canon(apres),canon(avant[n++]));}
  assert.equal((await db.query('select count(*) as n from page_views')).rows[0].n,4000);assert.equal((await db.query('select count(*) as n from scores_outil')).rows[0].n,2);
  const droits=(await db.query("select has_function_privilege('anon','public.visit_stats2(date,integer)','EXECUTE') as anon,has_function_privilege('service_role','public.visit_stats2(date,integer)','EXECUTE') as serveur")).rows[0];assert.equal(droits.anon,false);assert.equal(droits.serveur,true);
  assert.equal((await db.query("select count(*) as n from pg_indexes where indexname='scores_outil_b_ref_score_idx'")).rows[0].n,1);
  await db.exec('delete from page_views');assert.deepEqual((await db.query("select public.visit_stats2('2026-11-20',7) as s")).rows[0].s,avantVide);
  await db.exec('begin;'+sql+'commit;');
});
