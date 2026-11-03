-- Espace coaching Prestige : créneaux ouverts par Lamia, 1 visio de 15 minutes par mois et par personne.
create table if not exists public.coaching_creneaux (
  id uuid primary key default gen_random_uuid(),
  debut timestamptz not null unique,
  duree_min int not null default 15,
  mois text not null,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  prenom text,
  reserve_at timestamptz,
  rappel_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists coaching_un_par_mois on public.coaching_creneaux (user_id, mois) where user_id is not null;
alter table public.coaching_creneaux enable row level security;
revoke all on public.coaching_creneaux from anon, authenticated;
