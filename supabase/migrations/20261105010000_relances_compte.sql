-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Relance unique des comptes sans annonce, envoyée au passage quotidien.
create table if not exists public.relances_compte (
  user_id uuid primary key,
  email text not null,
  prenom text,
  created_at timestamptz not null default now(),
  envoyee_at timestamptz
);
alter table public.relances_compte enable row level security;
