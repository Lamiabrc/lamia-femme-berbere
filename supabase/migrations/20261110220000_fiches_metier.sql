-- Le métier (ou secteur d'activité) des fiches du live : envoyé par l'outil, ou ajouté par la personne elle-même.
alter table public.profils_outil add column if not exists metier text;
