-- Liste de cadeaux de couple élargie (Lamia, 16 nov. 2026 : parfum, et plus).
alter table public.cadeaux_demandes drop constraint if exists cadeaux_demandes_type_check;
alter table public.cadeaux_demandes add constraint cadeaux_demandes_type_check check (type in ('bijou', 'parfum', 'fleurs', 'chocolat', 'diner', 'spa', 'weekend', 'coffret', 'photo', 'autre'));
