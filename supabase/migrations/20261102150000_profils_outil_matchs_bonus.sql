-- Matchs offerts en live, aussi pour les fiches de l'outil.
alter table public.profils_outil add column if not exists matchs_bonus int not null default 0;
