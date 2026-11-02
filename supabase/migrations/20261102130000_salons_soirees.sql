-- Soirées : deux salons permanents (20-39 ans, 40 ans et plus), options de secteur, autant de femmes que d'hommes.
-- Écrit et lu uniquement par le serveur (clé de service) : aucune règle d'accès public.
alter table public.speed_dating_events add column if not exists sur_invitation boolean not null default false;

create table if not exists public.salon_editions (
  id uuid primary key default gen_random_uuid(),
  salon text not null check (salon in ('20-39', '40+')),
  secteur text not null,
  statut text not null default 'a_valider' check (statut in ('a_valider', 'confirme', 'ecartee', 'terminee')),
  date_proposee timestamptz,
  starts_at timestamptz,
  event_id uuid references public.speed_dating_events(id) on delete set null,
  gratuit boolean not null default false,
  notif_jour_at timestamptz,
  notif_heure_at timestamptz,
  notif_depart_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index if not exists salon_editions_a_valider on public.salon_editions (salon, secteur) where statut = 'a_valider';

create table if not exists public.salon_inscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  prenom text,
  genre text not null check (genre in ('femme', 'homme')),
  salon text not null check (salon in ('20-39', '40+')),
  secteurs text[] not null,
  statut text not null default 'attente' check (statut in ('attente', 'convoque', 'place', 'libere', 'annule', 'terminee')),
  edition_id uuid references public.salon_editions(id) on delete set null,
  payer_avant timestamptz,
  inclus boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists salon_inscriptions_active on public.salon_inscriptions (user_id) where statut in ('attente', 'convoque', 'place');
create index if not exists salon_inscriptions_salon on public.salon_inscriptions (salon, statut, created_at);

alter table public.salon_editions enable row level security;
alter table public.salon_inscriptions enable row level security;

-- Clé de la tâche automatique (lue seulement côté serveur : pas dans les réglages publics).
insert into public.platform_settings (key, value)
values ('salons_cron', jsonb_build_object('jeton', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')))
on conflict (key) do nothing;
