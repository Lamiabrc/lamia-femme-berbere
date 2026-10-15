import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('isolated PostgreSQL: reservation, capacity, permissions, waitlist and state concurrency',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; grant usage on schema auth,public to service_role,authenticated,anon;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 grant select on auth.users to service_role;
 create table public.member_profiles(user_id uuid primary key references auth.users,display_name text,real_first_name text,birth_date date,gender text,city text,community_rules_accepted_at timestamptz,profile_status text default 'draft');
 create table public.speed_dating_events(id uuid primary key,title text,audience text,starts_at timestamptz,ends_at timestamptz,capacity int,ticket_price_cents int,status text,min_age int,max_age int,slug text,description text,currency text);
 create table public.event_registrations(id uuid default gen_random_uuid(),event_id uuid references speed_dating_events,user_id uuid references member_profiles,payment_status text,attendance_status text,unique(event_id,user_id));
 create table public.platform_settings(key text primary key,value jsonb,updated_at timestamptz);
 grant all on all tables in schema public to service_role;
 grant select,insert,update on public.event_registrations,public.member_profiles to authenticated;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261014152407_speed_dating_operations.sql',import.meta.url),'utf8'));
 const ev='00000000-0000-0000-0000-000000000001';
 const users=[1,2,3,4].map(n=>'11111111-1111-1111-1111-'+String(n).padStart(12,'0'));
 for(const id of users) await db.query('insert into auth.users values($1,now())',[id]);
 await db.query("insert into speed_dating_events(id,title,audience,starts_at,ends_at,capacity,ticket_price_cents,status,min_age,max_age) values($1,'Fiction locale','France',now()+interval '10 days',now()+interval '10 days 2 hours',2,0,'published',18,99)",[ev]);
 await db.exec('set role service_role');
 const reserve=(uid,birth='1990-01-01')=>db.query("select reserve_dating_event($1,$2,'Test',$3,'femme','Ville',array['homme'],18,99) as r",[uid,ev,birth]).then(r=>r.rows[0].r);
 const result=await Promise.all(users.slice(0,3).map(uid=>reserve(uid)));
 assert.deepEqual(result.map(r=>r.status),['registered','registered','waitlisted']);
 assert.equal((await reserve(users[0])).status,'registered');
 assert.equal((await db.query("select count(*)::int as n from event_registrations where attendance_status='registered'")).rows[0].n,2);
 assert.equal((await reserve(users[3],'2015-01-01')).error,'too_young');
 const event=(await db.query('select * from speed_dating_events where id=$1',[ev])).rows[0];
 const edit=data=>db.query('select manage_dating_event($1,$2) as r',[ev,{...event,...data}]).then(r=>r.rows[0].r);
 assert.equal((await edit({capacity:1})).error,'capacity_below_registrations');
 assert.equal((await edit({title:'Changed without notifying'})).error,'registered_event_requires_notification');
 assert.equal((await edit({status:'cancelled'})).error,'cancellation_requires_notification');
 assert.equal((await edit({description:'Updated practical details'})).ok,true);
 const created=(await db.query('select manage_dating_event(null,$1) as r',[{...event,title:'Second rehearsal',status:'draft'}])).rows[0].r;
 assert.equal(created.ok,true);
 assert.notEqual(created.id,ev);

 await db.exec('reset role; set role authenticated');
 await assert.rejects(db.query("update event_registrations set payment_status='paid'"),/permission denied/);
 await assert.rejects(db.query("insert into event_registrations(event_id,user_id) values($1,$2)",[ev,users[3]]),/permission denied/);
 await assert.rejects(reserve(users[3]),/permission denied/);
 await assert.rejects(db.query('select * from dating_feedback'),/permission denied/);
 await db.exec('reset role');
 await db.query("update member_profiles set profile_status='suspended' where user_id=$1",[users[0]]);
 await db.exec('set role authenticated');
 await db.query("update member_profiles set profile_status='active' where user_id=$1",[users[0]]);
 await db.exec('reset role');
 assert.equal((await db.query('select profile_status from member_profiles where user_id=$1',[users[0]])).rows[0].profile_status,'suspended');
 await db.exec('set role service_role');
 assert.equal((await reserve(users[0])).error,'profile_unavailable');
 assert.equal((await db.query("select save_dating_state(null,'{\"round\":0}') as ok")).rows[0].ok,true);
 const racers=await Promise.all([1,2].map(n=>db.query('select save_dating_state($1,$2) as ok',[{round:0},{round:n}])));
 assert.equal(racers.filter(r=>r.rows[0].ok).length,1);
 assert.equal((await db.query("select claim_dating_round('a') as ok")).rows[0].ok,true);
 assert.equal((await db.query("select claim_dating_round('b') as ok")).rows[0].ok,false);
 await db.query("select release_dating_round('b')");
 assert.equal((await db.query("select claim_dating_round('c') as ok")).rows[0].ok,false);
 await db.query("select release_dating_round('a')");
 assert.equal((await db.query("select claim_dating_round('c') as ok")).rows[0].ok,true);
 } finally {await db.close();}
});
