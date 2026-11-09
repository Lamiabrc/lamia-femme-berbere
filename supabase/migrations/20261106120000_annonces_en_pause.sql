-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- La personne peut mettre son annonce en pause : invisible, plus de nouveau match, et elle reprend quand elle veut.
alter table public.annonces add column if not exists pause_at timestamptz;
alter table public.profils_outil add column if not exists pause_at timestamptz;
