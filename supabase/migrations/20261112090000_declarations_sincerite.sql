-- Déclaration de bonne foi : chaque membre confirme, dans sa langue, qu'il vient pour une rencontre sérieuse.
create table if not exists public.declarations_sincerite (
  user_id uuid primary key references auth.users(id) on delete cascade,
  accepte_at timestamptz not null default now(),
  langue text,
  version integer not null default 1
);
alter table public.declarations_sincerite enable row level security;
