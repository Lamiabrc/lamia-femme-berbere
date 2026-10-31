-- Matchs proposés par Lamia depuis son outil à un compte LFB : « Lamia te propose ce profil » (oui / non).
create table if not exists public.propositions (
  id uuid primary key default gen_random_uuid(),
  pour_ref int not null,
  cible_ref int not null,
  potentiel int,
  message text check (message is null or length(message) <= 300),
  reponse text check (reponse in ('oui','non')),
  created_at timestamptz not null default now(),
  repondu_at timestamptz,
  unique (pour_ref, cible_ref)
);
alter table public.propositions enable row level security;
revoke all on public.propositions from anon, authenticated;
