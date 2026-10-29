-- Consentement : la photo peut être transmise à la personne avec qui on est mis en relation (et seulement elle).
alter table public.annonces add column if not exists photo_partage boolean not null default false;
alter table public.annonces add column if not exists photo_partage_at timestamptz;
-- Date du dernier changement de statut d'une demande (compter les mises en relation du mois).
alter table public.annonce_interets add column if not exists updated_at timestamptz;
update public.annonce_interets set updated_at = created_at where updated_at is null;
