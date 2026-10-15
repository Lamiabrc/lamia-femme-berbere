-- Server-only operations. No production fixtures; SECURITY INVOKER throughout.
begin;
alter table public.event_registrations drop constraint if exists event_registrations_attendance_status_check;
alter table public.event_registrations add constraint event_registrations_attendance_status_check check
 (attendance_status in ('registered','checked_in','attended','no_show','cancelled','waitlisted'));
revoke insert,update,delete on public.event_registrations from anon,authenticated;
grant select,insert,update,delete on public.event_registrations to service_role;
create table public.dating_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 genders text[] not null check(cardinality(genders)>0 and genders <@ array['femme','homme']::text[]),
 min_age int not null check(min_age>=18), max_age int not null check(max_age between min_age and 99)
);
create table public.dating_presence (
 session text not null, user_id uuid not null references auth.users(id) on delete cascade,
 last_seen timestamptz not null default now(), primary key(session,user_id)
);
create table public.dating_blocks (
 user_id uuid not null references auth.users(id) on delete cascade,
 other_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,other_id), check(user_id<>other_id)
);
create table public.dating_feedback (
 session text not null, user_id uuid not null references auth.users(id) on delete cascade,
 other_id uuid not null references auth.users(id) on delete cascade,
 choice text not null check(choice in ('yes','no','skip')),
 contact_consent boolean not null default false,
 primary key(session,user_id,other_id), check(user_id<>other_id)
);
alter table public.dating_preferences enable row level security;
alter table public.dating_presence enable row level security;
alter table public.dating_blocks enable row level security;
alter table public.dating_feedback enable row level security;
revoke all on public.dating_preferences,public.dating_presence,public.dating_blocks,public.dating_feedback from public,anon,authenticated;
grant select,insert,update,delete on public.dating_preferences,public.dating_presence,public.dating_blocks,public.dating_feedback to service_role;

-- A member cannot remove a suspension or create a suspended/active privileged profile.
create or replace function public.dating_protect_profile_status() returns trigger
language plpgsql set search_path=public as $$
begin
 if current_user not in ('service_role','postgres','supabase_admin') then
   if TG_OP='INSERT' then new.profile_status:='draft';
   else new.profile_status:=old.profile_status; end if;
 end if;
 return new;
end $$;
create trigger dating_protect_profile_status before insert or update on public.member_profiles
for each row execute function public.dating_protect_profile_status();

create or replace function public.reserve_dating_event(
 p_user uuid,p_event uuid,p_name text,p_birth date,p_gender text,p_city text,p_genders text[],p_min int,p_max int
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare ev public.speed_dating_events; prof public.member_profiles; reg public.event_registrations;
 a int; taken int; result_status text;
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'forbidden'; end if;
 select * into ev from public.speed_dating_events where id=p_event;
 if not found then return jsonb_build_object('error','event_unavailable'); end if;
 -- One lock for all salons of the same evening prevents capacity races and double salon bookings.
 perform pg_advisory_xact_lock(hashtextextended(ev.title||ev.starts_at::text,0));
 select * into ev from public.speed_dating_events where id=p_event for update;
 if ev.status not in ('published','sold_out') then return jsonb_build_object('error','event_unavailable'); end if;
 if ev.starts_at<=now() then return jsonb_build_object('error','event_past'); end if;
 if ev.ticket_price_cents<>0 then return jsonb_build_object('error','paid_event'); end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then return jsonb_build_object('error','email_not_confirmed'); end if;
 select * into prof from public.member_profiles where user_id=p_user for update;
 if prof.profile_status in ('suspended','paused') then return jsonb_build_object('error','profile_unavailable'); end if;
 -- Existing birthday is authoritative: the request cannot bypass event age rules.
 p_birth:=coalesce(prof.birth_date,p_birth);
 a:=extract(year from age((ev.starts_at at time zone 'Europe/Paris')::date,p_birth));
 if p_birth is null or extract(year from age(current_date,p_birth))<18 or a>99 then return jsonb_build_object('error','too_young'); end if;
 if a<coalesce(ev.min_age,18) or a>coalesce(ev.max_age,99) then return jsonb_build_object('error','age_out_of_range'); end if;
 if length(trim(p_name)) not between 1 and 60 or length(trim(p_city)) not between 1 and 80 or p_gender not in ('femme','homme') then return jsonb_build_object('error','profile_required'); end if;
 insert into public.member_profiles(user_id,display_name,real_first_name,birth_date,gender,city,community_rules_accepted_at)
 values(p_user,p_name,p_name,p_birth,p_gender,p_city,now())
 on conflict(user_id) do update set display_name=excluded.display_name,real_first_name=excluded.real_first_name,
 gender=excluded.gender,city=excluded.city,birth_date=coalesce(member_profiles.birth_date,excluded.birth_date),community_rules_accepted_at=now();
 insert into public.dating_preferences values(p_user,p_genders,p_min,p_max)
 on conflict(user_id) do update set genders=excluded.genders,min_age=excluded.min_age,max_age=excluded.max_age;
 select * into reg from public.event_registrations where user_id=p_user and event_id=p_event;
 if found and reg.attendance_status in ('registered','checked_in','attended') and reg.payment_status in ('paid','waived') then
   return jsonb_build_object('status','registered','title',ev.title,'salon',ev.audience,'starts_at',ev.starts_at);
 end if;
 select count(*) into taken from public.event_registrations where event_id=p_event
 and attendance_status in ('registered','checked_in','attended') and payment_status in ('paid','waived');
 result_status:=case when taken>=ev.capacity or ev.status='sold_out' then 'waitlisted' else 'registered' end;
 if result_status='registered' then
  update public.event_registrations set attendance_status='cancelled'
  where user_id=p_user and event_id<>p_event and event_id in
  (select id from public.speed_dating_events where title=ev.title and starts_at=ev.starts_at)
  and attendance_status in ('registered','waitlisted');
 end if;
 insert into public.event_registrations(event_id,user_id,payment_status,attendance_status)
 values(p_event,p_user,'waived',result_status)
 on conflict(event_id,user_id) do update set payment_status='waived',attendance_status=result_status;
 return jsonb_build_object('status',result_status,'title',ev.title,'salon',ev.audience,'starts_at',ev.starts_at);
end $$;
revoke all on function public.reserve_dating_event(uuid,uuid,text,date,text,text,text[],int,int) from public,anon,authenticated;
grant execute on function public.reserve_dating_event(uuid,uuid,text,date,text,text,text[],int,int) to service_role;

-- Compare-and-swap protects rotations against simultaneous requests, close and pause.
create or replace function public.save_dating_state(p_expected jsonb,p_next jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare n int;
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'forbidden'; end if;
 if p_expected is null then
  insert into public.platform_settings(key,value,updated_at) values('bal_state',p_next,now()) on conflict(key) do nothing;
 else
  update public.platform_settings set value=p_next,updated_at=now() where key='bal_state' and value=p_expected;
 end if;
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.save_dating_state(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_dating_state(jsonb,jsonb) to service_role;

-- Short lease prevents multiple serverless workers from creating the same automatic round.
create or replace function public.claim_dating_round(p_token text) returns boolean
language plpgsql security invoker set search_path=public as $$
declare n int;
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'forbidden'; end if;
 insert into public.platform_settings(key,value,updated_at)
 values('bal_round_lock',jsonb_build_object('token',p_token,'until',now()+interval '60 seconds'),now())
 on conflict(key) do update set value=excluded.value,updated_at=now()
 where (platform_settings.value->>'until')::timestamptz < now();
 get diagnostics n=row_count; return n=1;
end $$;
create or replace function public.release_dating_round(p_token text) returns void
language plpgsql security invoker set search_path=public as $$
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'forbidden'; end if;
 delete from public.platform_settings where key='bal_round_lock' and value->>'token'=p_token;
end $$;
revoke all on function public.claim_dating_round(text),public.release_dating_round(text) from public,anon,authenticated;
grant execute on function public.claim_dating_round(text),public.release_dating_round(text) to service_role;


-- Administrative editing is server-only. Existing bookings prohibit silent date/salon changes.
create or replace function public.manage_dating_event(p_id uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare ev public.speed_dating_events; n int; new_id uuid;
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'forbidden'; end if;
 if p_id is not null then
   select * into ev from public.speed_dating_events where id=p_id;
   if not found then return jsonb_build_object('error','not_found'); end if;
   perform pg_advisory_xact_lock(hashtextextended(ev.title||ev.starts_at::text,0));
   select * into ev from public.speed_dating_events where id=p_id for update;
   if ev.ticket_price_cents>0 then return jsonb_build_object('error','paid_event_requires_review'); end if;
   select count(*) into n from public.event_registrations where event_id=p_id and attendance_status not in ('cancelled','waitlisted');
   if (p_data->>'capacity')::int<n then return jsonb_build_object('error','capacity_below_registrations'); end if;
   select count(*) into n from public.event_registrations where event_id=p_id and attendance_status<>'cancelled';
   if n>0 and (ev.starts_at<>(p_data->>'starts_at')::timestamptz or ev.ends_at<>(p_data->>'ends_at')::timestamptz or ev.min_age is distinct from (p_data->>'min_age')::int or ev.max_age is distinct from (p_data->>'max_age')::int or ev.audience is distinct from p_data->>'audience' or ev.title is distinct from p_data->>'title') then
     return jsonb_build_object('error','registered_event_requires_notification');
   end if;
   if n>0 and p_data->>'status'='cancelled' then return jsonb_build_object('error','cancellation_requires_notification'); end if;
   update public.speed_dating_events set title=p_data->>'title',description=p_data->>'description',audience=p_data->>'audience',
    starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz,capacity=(p_data->>'capacity')::int,
    min_age=(p_data->>'min_age')::int,max_age=(p_data->>'max_age')::int,status=p_data->>'status' where id=p_id;
   new_id:=p_id;
 else
   new_id:=gen_random_uuid();
   insert into public.speed_dating_events(id,slug,title,description,audience,starts_at,ends_at,capacity,min_age,max_age,status,ticket_price_cents,currency)
    values(new_id,'soiree-'||new_id,p_data->>'title',p_data->>'description',p_data->>'audience',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,
    (p_data->>'capacity')::int,(p_data->>'min_age')::int,(p_data->>'max_age')::int,p_data->>'status',0,'EUR');
 end if;
 return jsonb_build_object('ok',true,'id',new_id);
end $$;
revoke all on function public.manage_dating_event(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manage_dating_event(uuid,jsonb) to service_role;

commit;
