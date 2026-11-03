-- Badge « Recommandé par Lamia ».
alter table public.annonces add column if not exists recommande_at timestamptz;
alter table public.profils_outil add column if not exists recommande_at timestamptz;
