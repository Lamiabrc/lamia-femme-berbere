-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Le prénom reste caché dans la discussion tant que la personne n'a pas choisi de le partager.
alter table public.discussions
  add column if not exists a_prenom_partage_at timestamptz,
  add column if not exists b_prenom_partage_at timestamptz,
  add column if not exists a_prenom_plus_tard_at timestamptz,
  add column if not exists b_prenom_plus_tard_at timestamptz;
