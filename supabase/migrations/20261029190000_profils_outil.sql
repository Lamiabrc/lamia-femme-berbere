-- Profils de l'outil de matching de Lamia affichés anonymement dans le Patio.
-- Aucune donnée identifiante : ni prénom, ni contact, ni photo, ni ville. Lecture et écriture côté serveur uniquement.
create sequence if not exists public.profils_outil_ref_seq start 5001;
create table if not exists public.profils_outil (
  ref int primary key default nextval('public.profils_outil_ref_seq'),
  outil_id text not null unique,
  genre text not null check (genre in ('femme','homme')),
  age int,
  pays text,
  situation text,
  enfants text,
  etudes text,
  origine text[] not null default '{}',
  caracteristiques text[] not null default '{}',
  profil text not null default '',
  recherche text not null default '',
  age_min int,
  age_max int,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
alter sequence public.profils_outil_ref_seq owned by public.profils_outil.ref;
alter table public.profils_outil enable row level security;
revoke all on public.profils_outil from anon, authenticated;
