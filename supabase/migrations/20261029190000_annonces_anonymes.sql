-- Profils affichés anonymement dans le Patio (si la personne l'accepte et si Lamia le décide)
-- et « matchs demandés » : un nouveau profil peut dire qu'un profil anonyme l'intéresse.
alter table public.annonces add column if not exists anonyme_ok boolean not null default false;
alter table public.annonces add column if not exists visible_anonyme boolean not null default false;
create table if not exists public.annonce_interets (
  id uuid primary key default gen_random_uuid(),
  demandeur_id uuid not null references public.annonces(id) on delete cascade,
  cible_ref int not null,
  statut text not null default 'a_traiter' check (statut in ('a_traiter', 'mis_en_relation', 'pas_compatible')),
  created_at timestamptz not null default now(),
  unique (demandeur_id, cible_ref)
);
alter table public.annonce_interets enable row level security;
revoke all on public.annonce_interets from anon, authenticated;
