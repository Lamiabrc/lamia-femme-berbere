-- Annonces : réponses au format de l'outil local de matching (mêmes listes de choix), date du dernier export vers l'outil.
alter table public.annonces add column if not exists matching jsonb not null default '{}'::jsonb;
alter table public.annonces add column if not exists exportee_at timestamptz;
