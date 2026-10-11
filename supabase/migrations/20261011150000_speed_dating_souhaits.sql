-- Souhaits exprimés après une soirée speed dating (version 1, saisie libre).
-- STATUT : NON APPLIQUÉE. Indépendante de la migration des fondations : peut être appliquée seule.
-- Une membre ne voit que ses propres souhaits ; Lamia (rôle admin) les lit via son tableau.

create table if not exists public.speed_dating_wishes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.speed_dating_events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wished text not null check (char_length(wished) between 1 and 1000),
  message text check (message is null or char_length(message) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists speed_dating_wishes_event_idx on public.speed_dating_wishes(event_id);
alter table public.speed_dating_wishes enable row level security;

drop policy if exists wishes_v1_insert_own on public.speed_dating_wishes;
create policy wishes_v1_insert_own on public.speed_dating_wishes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists wishes_v1_read_own on public.speed_dating_wishes;
create policy wishes_v1_read_own on public.speed_dating_wishes
  for select to authenticated
  using (user_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

revoke update, delete on public.speed_dating_wishes from anon, authenticated;
