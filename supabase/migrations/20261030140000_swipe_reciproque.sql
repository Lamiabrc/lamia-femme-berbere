-- Swipe : « pas pour moi » mémorisé (pour ne plus reproposer le profil), et intérêt réciproque repéré.
alter table public.annonce_interets add column if not exists reciproque boolean not null default false;
alter table public.annonce_interets add column if not exists via text not null default 'bouton';
create table if not exists public.annonce_passes (
  id uuid primary key default gen_random_uuid(),
  demandeur_id uuid not null references public.annonces(id) on delete cascade,
  cible_ref int not null,
  created_at timestamptz not null default now(),
  unique (demandeur_id, cible_ref)
);
alter table public.annonce_passes enable row level security;
revoke all on public.annonce_passes from anon, authenticated;
