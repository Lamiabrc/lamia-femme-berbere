-- Lien d'invitation modérateur : à usage unique. Seule une empreinte du lien est gardée.
create table if not exists public.moderateur_invitations (
  token_h text primary key,
  ref integer,
  pseudo text,
  statut text,
  email text,
  created_at timestamptz not null default now(),
  utilise_at timestamptz
);
alter table public.moderateur_invitations enable row level security;
