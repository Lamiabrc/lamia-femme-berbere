-- Garde-fous des matchs (règle de Lamia, 5 nov. 2026) et messages vocaux dans les discussions.
-- Date de l'échange des numéros : sert à repérer un dématch moins de 24 heures après.
alter table public.discussions add column if not exists numeros_at timestamptz;
-- Message vocal : fichier privé dans le stockage « annonces », sous discussions/<id de la discussion>/.
alter table public.discussion_messages add column if not exists audio_path text;
alter table public.discussion_messages add column if not exists audio_duree integer;
