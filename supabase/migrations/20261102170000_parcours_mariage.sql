-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Parcours vers le mariage, ouvert avec la discussion du match.
-- parcours : les étapes validées par chacun, { "a": ["connaitre"], "b": [] }.
-- parcours_actif : montré seulement sur les discussions choisies tant que Lamia n'a pas validé les textes.
alter table public.discussions add column if not exists parcours jsonb not null default '{}'::jsonb;
alter table public.discussions add column if not exists parcours_actif boolean not null default false;
