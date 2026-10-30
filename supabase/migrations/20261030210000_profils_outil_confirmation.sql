-- Confirmation des fiches de l'outil par les personnes elles-mêmes (lien personnel envoyé par Lamia).
-- Une fiche n'apparaît dans les profils anonymes qu'une fois confirmée ; « ne plus apparaître » la masque définitivement.
alter table public.profils_outil
  add column if not exists confirme_at timestamptz,
  add column if not exists retire_at timestamptz;
create index if not exists profils_outil_confirme_idx on public.profils_outil (confirme_at) where confirme_at is not null;
-- Quand un profil du site reçoit un intérêt, la personne est prévenue par email (au plus une fois toutes les 12 h).
alter table public.annonces add column if not exists interet_notifie_at timestamptz;
-- Depuis son lien personnel, la personne peut demander une modification de sa fiche ou son effacement complet de l'outil de Lamia.
alter table public.profils_outil
  add column if not exists modif_demandee text,
  add column if not exists modif_at timestamptz,
  add column if not exists effacement_at timestamptz;
