-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Matchs offerts en live, aussi pour les fiches de l'outil.
alter table public.profils_outil add column if not exists matchs_bonus int not null default 0;
