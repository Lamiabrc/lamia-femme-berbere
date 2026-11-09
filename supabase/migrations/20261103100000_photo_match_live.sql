-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Photo du match à l'unité (3 €, 1 heure) et match offert en live limité à 1 toutes les 2 semaines.
alter table public.achats_unite drop constraint if exists achats_unite_type_check;
alter table public.achats_unite add constraint achats_unite_type_check check (type in ('mise_en_relation','speed_dating','photo_match'));
alter table public.achats_unite add column if not exists photo_ref int;
alter table public.achats_unite add column if not exists photo_jusqu_a timestamptz;
alter table public.annonces add column if not exists match_live_at timestamptz;
alter table public.profils_outil add column if not exists match_live_at timestamptz;
