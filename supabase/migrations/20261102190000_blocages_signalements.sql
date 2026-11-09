-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Bloquer et signaler un profil (exigé par Google Play pour les échanges entre personnes).
create table if not exists public.blocages (
  id uuid primary key default gen_random_uuid(),
  auteur_user uuid not null references auth.users(id) on delete cascade,
  auteur_ref integer,
  cible_ref integer not null,
  cible_user uuid references auth.users(id) on delete set null,
  motif text,
  created_at timestamptz not null default now(),
  unique (auteur_user, cible_ref)
);
create index if not exists blocages_auteur_ref on public.blocages (auteur_ref);
create index if not exists blocages_cible_ref on public.blocages (cible_ref);
alter table public.blocages enable row level security;

create table if not exists public.signalements (
  id uuid primary key default gen_random_uuid(),
  auteur_user uuid references auth.users(id) on delete set null,
  auteur_ref integer,
  cible_ref integer not null,
  motif text,
  traite_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists signalements_cible on public.signalements (cible_ref, created_at desc);
alter table public.signalements enable row level security;
