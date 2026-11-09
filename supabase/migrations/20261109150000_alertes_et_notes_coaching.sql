-- Journal des alertes envoyées aux membres (notification et email), pour que Lamia voie qui a été prévenu et qui l'a vu.
create table if not exists public.alertes_membres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  prenom text,
  titre text not null,
  lien text,
  notifications int not null default 0,
  email_envoye boolean not null default false,
  vu_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alertes_membres_user_idx on public.alertes_membres (user_id, created_at desc);
alter table public.alertes_membres enable row level security;
-- Aucune politique : seul le serveur du site (clé de service) lit et écrit.

-- Notes privées de Lamia sur une séance de coaching.
alter table public.coaching_creneaux add column if not exists notes_lamia text;
