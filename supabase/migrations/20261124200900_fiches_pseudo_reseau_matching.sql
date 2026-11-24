-- Fiches de l'outil : infos privées de Lamia (jamais dans l'annonce anonyme) et infos de matching complètes.
-- La table reste protégée : RLS active, aucune règle pour anon/authenticated (seul le serveur y accède).
alter table public.profils_outil
  add column if not exists prenom text,
  add column if not exists pseudo text,
  add column if not exists lien_reseau text,
  add column if not exists matching jsonb not null default '{}'::jsonb;
comment on column public.profils_outil.pseudo is 'Pseudo donné à la création par Lamia ; la personne ajoute son prénom à sa confirmation. Privé.';
comment on column public.profils_outil.lien_reseau is 'Lien TikTok / Instagram / Facebook, pour valider le compte. Privé.';
comment on column public.profils_outil.matching is 'Infos de matching au-delà des colonnes (belle-famille, émotions, réseaux, mode de vie, taille, cases accepte…). Privé.';
