-- Scores de compatibilité calculés par l'outil de Lamia (son algorithme et ses poids), envoyés au site à chaque synchronisation.
-- Le site s'en sert partout : matchs demandés, propositions, réserve, ordre du swipe. Ainsi le live et le site disent la même chose.
create table if not exists public.scores_outil (
  a_ref int not null,
  b_ref int not null,
  score int not null check (score between 0 and 100),
  niveau text,
  updated_at timestamptz not null default now(),
  primary key (a_ref, b_ref)
);
alter table public.scores_outil enable row level security;
revoke all on public.scores_outil from anon, authenticated;
