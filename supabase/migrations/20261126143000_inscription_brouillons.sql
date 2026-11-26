-- Additif : aucune modification des comptes, profils, photos ou abonnements existants.
set local lock_timeout = '2s';
create table if not exists public.inscription_brouillons (
  user_id uuid primary key references auth.users(id) on delete cascade,
  donnees jsonb not null default '{}'::jsonb check (jsonb_typeof(donnees) = 'object' and octet_length(donnees::text) <= 12000),
  etape smallint not null default 3 check (etape between 1 and 3),
  saved_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table public.inscription_brouillons enable row level security;
-- L'API serveur nettoie et borne les écritures. Aucun accès anonyme/direct au navigateur.
revoke all on public.inscription_brouillons from anon, authenticated;
grant all on public.inscription_brouillons to service_role;
create index if not exists inscription_brouillons_expiration_idx on public.inscription_brouillons(expires_at);
comment on table public.inscription_brouillons is 'Reprise privée de l’inscription pendant 7 jours ; aucun mot de passe ni photo.';
-- Retour arrière sans perte : revenir à la version précédente de l’application et conserver cette table.
-- Ne supprimer la table qu'après export et accord explicite de Lamia.
