-- Annonces de rencontre déposées par la communauté (Patio, Confidences), vérifiées par Lamia avant publication.
-- Tout passe par l'API serveur (clé de service) : RLS activé sans règle = aucun accès direct du navigateur.
-- La photo de la pièce d'identité (numéro caché par la main) sert uniquement à la vérification :
-- elle est supprimée du stockage dès que Lamia publie ou refuse l'annonce.

create table if not exists public.annonces (
  id uuid primary key default gen_random_uuid(),
  ref serial unique,
  status text not null default 'brouillon' check (status in ('brouillon', 'a_verifier', 'publiee', 'refusee', 'retiree')),
  prenom text not null check (length(prenom) between 1 and 60),
  genre text not null check (genre in ('femme', 'homme')),
  birth_date date not null,
  ville text not null check (length(ville) between 1 and 80),
  pays text not null check (length(pays) between 1 and 60),
  situation text check (situation is null or length(situation) <= 40),
  profil text not null check (length(profil) between 20 and 1500),
  recherche text not null check (length(recherche) between 20 and 1500),
  age_min int check (age_min is null or age_min between 18 and 99),
  age_max int check (age_max is null or age_max between 18 and 99),
  email text not null check (email = lower(email) and length(email) <= 254),
  phone text check (phone is null or length(phone) <= 40),
  ip_hash text,
  identite_verifiee_at timestamptz,
  note_lamia text check (note_lamia is null or length(note_lamia) <= 600),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz
);
create index if not exists annonces_status_idx on public.annonces (status, published_at desc);
create index if not exists annonces_ip_idx on public.annonces (ip_hash, created_at);

create table if not exists public.annonce_files (
  id uuid primary key default gen_random_uuid(),
  annonce_id uuid not null references public.annonces(id) on delete cascade,
  kind text not null check (kind in ('photo', 'video', 'identite')),
  storage_path text not null unique,
  mime text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 52428800),
  position int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists annonce_files_annonce_idx on public.annonce_files (annonce_id);

alter table public.annonces enable row level security;
alter table public.annonce_files enable row level security;
revoke all on public.annonces, public.annonce_files from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('annonces', 'annonces', false, 52428800, array[
  'image/jpeg','image/png','image/webp','image/heic','image/heif',
  'video/mp4','video/quicktime','video/webm','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
