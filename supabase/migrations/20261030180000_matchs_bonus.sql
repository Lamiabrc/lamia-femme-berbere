-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Matchs en même temps : 1 en Découverte, 3 avec une formule payante ; Lamia peut en offrir un de plus (en live).
alter table public.annonces add column if not exists matchs_bonus int not null default 0;
