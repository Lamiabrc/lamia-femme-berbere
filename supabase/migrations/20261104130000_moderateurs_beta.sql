-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Modérateurs : un badge sur le profil, et une formule offerte sans passer par Stripe.
alter table public.annonces add column if not exists moderateur_at timestamptz;
alter table public.profils_outil add column if not exists moderateur_at timestamptz;

create table if not exists public.formules_offertes (
  email text primary key,
  formule text not null default 'passion',
  raison text not null default 'moderateur',
  ref integer,
  created_at timestamptz not null default now()
);
alter table public.formules_offertes enable row level security;

-- Bêta-test de l'appli Google Play : la personne est invitée, puis accepte (avec son adresse Google) ou refuse.
create table if not exists public.beta_testeurs (
  compte_email text primary key,
  ref integer,
  statut text not null default 'invite' check (statut in ('invite', 'accepte', 'refuse')),
  adresse_google text,
  invite_at timestamptz not null default now(),
  repondu_at timestamptz
);
alter table public.beta_testeurs enable row level security;
