-- Aucune ligne existante n'est modifiée. État de modération réservé au serveur.
alter table public.annonces add column if not exists photos_moderation jsonb;
comment on column public.annonces.photos_moderation is
  'Contrôle des photos : avertissement, suspension manuelle, correction vérifiée dans Storage. Écriture serveur uniquement.';
-- Les annonces ne sont pas directement accessibles depuis le navigateur.
-- Ne pas accorder de droits nouveaux à anon/authenticated avec cette migration.
revoke all (photos_moderation) on public.annonces from anon, authenticated;
notify pgrst, 'reload schema';
