-- Profil créé en live : ville, pays et textes peuvent être complétés plus tard.
alter table public.annonces drop constraint if exists annonces_ville_check;
alter table public.annonces add constraint annonces_ville_check check (length(ville) <= 80);
alter table public.annonces drop constraint if exists annonces_pays_check;
alter table public.annonces add constraint annonces_pays_check check (length(pays) <= 60);
alter table public.annonces drop constraint if exists annonces_profil_check;
alter table public.annonces add constraint annonces_profil_check check (length(profil) <= 1500);
alter table public.annonces drop constraint if exists annonces_recherche_check;
alter table public.annonces add constraint annonces_recherche_check check (length(recherche) <= 1500);
-- Profils de test de Lamia : jamais montrés au public ni envoyés dans l'outil.
alter table public.annonces add column if not exists test boolean not null default false;
