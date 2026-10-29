-- Profils liés à un compte, option « créé en live avec Lamia », match actif, empreintes TikTok de l'outil.
alter table public.annonces
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists live_declare boolean not null default false,
  add column if not exists outil_id text,
  add column if not exists modifiee_at timestamptz,
  add column if not exists en_match boolean not null default false;
create index if not exists annonces_user_idx on public.annonces (user_id);
alter table public.annonce_interets drop constraint if exists annonce_interets_statut_check;
alter table public.annonce_interets add constraint annonce_interets_statut_check check (statut in ('a_traiter','mis_en_relation','pas_compatible','dematche'));
-- Empreintes (sha-256) des pseudos TikTok des fiches de l'outil : les liens eux-mêmes ne sont jamais stockés ici.
create table if not exists public.outil_tiktok (
  h text primary key,
  outil_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.outil_tiktok enable row level security;
revoke all on public.outil_tiktok from anon, authenticated;
-- Un compte existe-t-il pour cet email ? (serveur uniquement)
create or replace function public.compte_existe(p_email text) returns boolean
language sql security definer set search_path = public, auth stable as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;
revoke all on function public.compte_existe(text) from public, anon, authenticated;
grant execute on function public.compte_existe(text) to service_role;
