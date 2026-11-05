-- Écrire soi-même à une personne depuis le téléphone : pseudo du réseau (envoyé par l'outil pour ses fiches) et dernier message préparé.
-- Lisible seulement par le serveur : jamais public, jamais montré aux membres.
create table if not exists public.contacts_lamia (
  ref integer primary key,
  reseau text,
  pseudo text,
  dernier_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.contacts_lamia enable row level security;
