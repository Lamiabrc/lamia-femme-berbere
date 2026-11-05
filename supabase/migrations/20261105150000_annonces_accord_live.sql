-- Accord pour être présenté(e) en live (TikTok, Facebook, YouTube, replay compris), facultatif, daté.
-- Le métier par catégorie et la situation administrative (privée, jamais affichée) vivent dans annonces.matching.
alter table public.annonces add column if not exists live_ok boolean not null default false;
alter table public.annonces add column if not exists live_ok_at timestamptz;
