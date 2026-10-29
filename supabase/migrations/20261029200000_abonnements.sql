-- Abonnements « Trouve ton âme sœur » et achats à l'unité (mise en relation, speed dating).
-- Écrits uniquement par le serveur après confirmation de Stripe (notification signée).
create table if not exists public.abonnements (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nom text,
  formule text not null check (formule in ('coeur','passion','prestige')),
  periode text not null check (periode in ('mois','an')),
  statut text not null default 'actif',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  fin_periode timestamptz,
  resiliation_prevue boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists abonnements_email_idx on public.abonnements (lower(email));
create table if not exists public.achats_unite (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nom text,
  type text not null check (type in ('mise_en_relation','speed_dating')),
  quantite int not null default 1 check (quantite between 1 and 10),
  utilisees int not null default 0,
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists achats_unite_email_idx on public.achats_unite (lower(email));
alter table public.abonnements enable row level security;
alter table public.achats_unite enable row level security;
revoke all on public.abonnements, public.achats_unite from anon, authenticated;
