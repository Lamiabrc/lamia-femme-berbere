-- « Cœur avec message » (2 €) est vendu depuis le 10 nov. mais la base refusait ce type d'achat.
alter table public.achats_unite drop constraint if exists achats_unite_type_check;
alter table public.achats_unite add constraint achats_unite_type_check check (type = any (array['mise_en_relation','speed_dating','photo_match','coaching','coaching_30','sauver_couple','live_priorite','prolonger_discussion','profil_avant','qui_choisi','coeur_message']));
