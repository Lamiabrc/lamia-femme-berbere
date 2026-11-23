-- Parrainage (23 nov. 2026) : en Algérie, l'échange de numéros se débloque en invitant 2 amis qui s'inscrivent.
create table if not exists public.parrainages (
  filleul_user_id uuid primary key,
  parrain_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists parrainages_parrain on public.parrainages (parrain_user_id);
alter table public.parrainages enable row level security;
