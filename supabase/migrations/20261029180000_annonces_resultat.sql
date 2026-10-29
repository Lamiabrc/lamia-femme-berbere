-- Annonces privées : Lamia indique le nombre de profils compatibles trouvés dans son outil (sans dire lesquels).
alter table public.annonces add column if not exists nb_compatibles int check (nb_compatibles is null or nb_compatibles between 0 and 9999);
alter table public.annonces add column if not exists resultat_envoye_at timestamptz;
