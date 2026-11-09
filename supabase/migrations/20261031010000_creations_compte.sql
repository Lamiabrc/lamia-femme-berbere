-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Comptes créés par le site lui-même (déjà confirmés, sans email de confirmation, donc sans la limite d'envoi d'emails).
-- On garde seulement une empreinte de l'adresse IP, pour limiter les créations en rafale.
create table if not exists public.creations_compte (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists creations_compte_ip_idx on public.creations_compte (ip_hash, created_at);
alter table public.creations_compte enable row level security;
revoke all on public.creations_compte from anon, authenticated;
