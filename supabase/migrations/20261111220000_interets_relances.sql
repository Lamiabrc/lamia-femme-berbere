-- Seconde chance (formules Passion et Prestige) : nombre de fois où une demande refusée a été renvoyée.
alter table public.annonce_interets add column if not exists relances integer not null default 0;
