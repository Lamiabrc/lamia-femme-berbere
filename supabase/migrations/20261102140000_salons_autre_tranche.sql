-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Chacun choisit de rencontrer ou non l'autre tranche d'âge (moins de 40 ans / 40 ans et plus).
alter table public.salon_inscriptions add column if not exists tranche text, add column if not exists accepte_autre boolean not null default false;
alter table public.event_registrations add column if not exists tranche text, add column if not exists accepte_autre boolean not null default false;
