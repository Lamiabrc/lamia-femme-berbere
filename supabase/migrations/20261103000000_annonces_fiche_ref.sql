-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Fiche créée en live, reliée à un compte et confirmée : un profil interne lui permet de swiper.
-- Il n'apparaît jamais dans les profils (visible_anonyme = false) : c'est la fiche qui reste affichée.
alter table public.annonces add column if not exists fiche_ref integer;
create unique index if not exists annonces_fiche_ref_unique on public.annonces (fiche_ref) where fiche_ref is not null;
