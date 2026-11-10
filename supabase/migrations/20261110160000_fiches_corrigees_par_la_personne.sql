-- La personne corrige elle-même sa fiche depuis son lien : ses corrections sont gardées à part,
-- pour être remises par-dessus quand l'outil de matching republie la fiche.
alter table public.profils_outil add column if not exists corrections jsonb;
alter table public.profils_outil add column if not exists corrige_at timestamptz;
