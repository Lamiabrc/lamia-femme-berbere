-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Prévenir une seule fois : annonce parue, ou demande d'accord pour l'affichage anonyme.
alter table public.annonces add column if not exists parue_notifiee_at timestamptz;
alter table public.annonces add column if not exists accord_demande_at timestamptz;
