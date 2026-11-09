-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Badge « Recommandé par Lamia ».
alter table public.annonces add column if not exists recommande_at timestamptz;
alter table public.profils_outil add column if not exists recommande_at timestamptz;
