-- Le live de Lamia dans l'appli : les questions posées par les membres pendant le live.
-- Fermée au navigateur (aucune règle d'accès) : seul le serveur, avec la clé de service, lit et écrit.
create table if not exists public.live_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  prenom text,
  texte text not null check (char_length(texte) between 1 and 500),
  statut text not null default 'nouvelle' check (statut in ('nouvelle','choisie','repondue','ecartee')),
  live_debut timestamptz not null,
  choisie_at timestamptz
);
create index if not exists live_questions_live_idx on public.live_questions (live_debut, created_at desc);
create index if not exists live_questions_user_idx on public.live_questions (user_id, live_debut);
alter table public.live_questions enable row level security;
comment on table public.live_questions is 'Questions posées à Lamia pendant ses lives, depuis l''appli. Serveur seulement (clé de service).';
