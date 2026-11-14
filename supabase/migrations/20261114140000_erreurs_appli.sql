-- Les erreurs que l'appli montre à un membre, remontées toutes seules (14 nov. 2026).
-- Lamia les lit dans sa console pendant le live. Aucun contenu saisi par le membre : la page, l'appel qui a échoué,
-- le message d'erreur, l'appareil. Fermée au navigateur (aucune règle d'accès) : seul le serveur lit et écrit.
create table if not exists public.erreurs_appli (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null default 'page' check (type in ('appel','page','reseau')),
  message text not null check (char_length(message) between 1 and 300),
  page text,
  appel text,
  statut integer,
  appareil text,
  version text,
  vue_at timestamptz
);
create index if not exists erreurs_appli_date_idx on public.erreurs_appli (created_at desc);
create index if not exists erreurs_appli_user_idx on public.erreurs_appli (user_id, created_at desc);
alter table public.erreurs_appli enable row level security;
comment on table public.erreurs_appli is 'Erreurs vues par les membres dans l''appli, remontées automatiquement. Serveur seulement (clé de service).';
