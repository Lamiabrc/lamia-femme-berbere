-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Dématch courtois : la personne donne une raison et dispose de deux messages pour dire au revoir.
alter table public.discussions add column if not exists dematch_par text check (dematch_par in ('a', 'b'));
alter table public.discussions add column if not exists dematch_raison text;
alter table public.discussions add column if not exists dematch_etape text;
alter table public.discussions add column if not exists dematch_at timestamptz;
alter table public.discussions add column if not exists dematch_rappel_at timestamptz;
create index if not exists discussions_dematch_idx on public.discussions (dematch_at) where dematch_at is not null and close_raison is null;
