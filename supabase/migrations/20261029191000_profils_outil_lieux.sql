-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Lieux affichés sur les profils anonymes de l'outil (demande de Lamia)
alter table public.profils_outil add column if not exists ville text, add column if not exists village text, add column if not exists secteur text;
