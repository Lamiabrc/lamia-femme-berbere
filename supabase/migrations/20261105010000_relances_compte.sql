-- Relance unique des comptes sans annonce, envoyée au passage quotidien.
create table if not exists public.relances_compte (
  user_id uuid primary key,
  email text not null,
  prenom text,
  created_at timestamptz not null default now(),
  envoyee_at timestamptz
);
alter table public.relances_compte enable row level security;
