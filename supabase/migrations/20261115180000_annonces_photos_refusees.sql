-- Photos refusées par Lamia (15 nov. 2026) : le profil est suspendu jusqu'à l'envoi de 2 nouvelles photos valides.
alter table public.annonces add column if not exists photos_refusees_at timestamptz;
