-- Espace « Notre couple » (Lamia, 16 nov. 2026, sur le modèle de l'espace Famille de QVT Box) et invitations dans une discussion.
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  nom text,
  created_by uuid not null,
  code text unique,
  code_expire_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.couple_membres (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique,
  prenom text,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);
create table if not exists public.couple_activites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  auteur uuid not null,
  titre text not null,
  type text not null default 'rendez_vous',
  quand timestamptz,
  visibilite text not null default 'nous' check (visibilite in ('nous', 'moi')),
  fait_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists couple_activites_couple on public.couple_activites (couple_id, quand);
-- Faire plaisir (bijou, chocolat, fleurs) : demandes gardées pour les futurs partenariats de Lamia.
create table if not exists public.cadeaux_demandes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  couple_id uuid references public.couples(id) on delete set null,
  type text not null check (type in ('bijou', 'chocolat', 'fleurs')),
  note text,
  created_at timestamptz not null default now()
);
-- Inviter un proche (9 €, avec l'accord de l'autre) ou Lamia (20 €) dans une discussion.
create table if not exists public.discussion_invites (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  demandeur uuid not null,
  lien text,
  statut text not null default 'demande' check (statut in ('demande', 'acceptee', 'refusee', 'payee', 'annulee')),
  token text unique,
  repondu_at timestamptz,
  paye_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists discussion_invites_disc on public.discussion_invites (discussion_id);
alter table public.discussions add column if not exists lamia_invitee_at timestamptz;
alter table public.discussion_messages add column if not exists role text check (role in ('proche', 'lamia'));
alter table public.discussion_messages add column if not exists auteur_nom text;

alter table public.couples enable row level security;
alter table public.couple_membres enable row level security;
alter table public.couple_activites enable row level security;
alter table public.cadeaux_demandes enable row level security;
alter table public.discussion_invites enable row level security;
revoke all on public.couples, public.couple_membres, public.couple_activites, public.cadeaux_demandes, public.discussion_invites from anon, authenticated;
