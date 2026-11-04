-- Blocage décidé par Lamia (réversible) et cadeaux de coaching.
alter table public.annonces add column if not exists bloque_at timestamptz;
alter table public.profils_outil add column if not exists bloque_at timestamptz;
alter table public.achats_unite drop constraint if exists achats_unite_type_check;
alter table public.achats_unite add constraint achats_unite_type_check check (type = any (array['mise_en_relation','speed_dating','photo_match','coaching']));
