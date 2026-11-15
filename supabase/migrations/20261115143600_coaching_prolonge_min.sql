-- Lamia peut prolonger une séance de coaching en cours : minutes ajoutées à la durée prévue.
alter table public.coaching_creneaux add column if not exists prolonge_min integer not null default 0;
