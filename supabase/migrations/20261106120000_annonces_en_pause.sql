-- La personne peut mettre son annonce en pause : invisible, plus de nouveau match, et elle reprend quand elle veut.
alter table public.annonces add column if not exists pause_at timestamptz;
alter table public.profils_outil add column if not exists pause_at timestamptz;
