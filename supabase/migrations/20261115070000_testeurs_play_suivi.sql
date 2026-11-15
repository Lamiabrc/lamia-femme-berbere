-- Testeurs Google Play : quand le membre a ouvert la version Play (donc l'a installée), et quand il a reçu l'email « Devenir testeur ».
alter table public.testeurs_play add column if not exists play_vu_at timestamptz, add column if not exists email_testeur_at timestamptz;
