-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Profils anonymes venus de l'outil : religion, pratique et mode de vie (tabac, alcool, chique, sport).
alter table public.profils_outil add column if not exists religion text;
alter table public.profils_outil add column if not exists pratique text;
alter table public.profils_outil add column if not exists mode_vie text[] not null default '{}';
