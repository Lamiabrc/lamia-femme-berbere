-- Lieux affichés sur les profils anonymes de l'outil (demande de Lamia)
alter table public.profils_outil add column if not exists ville text, add column if not exists village text, add column if not exists secteur text;
