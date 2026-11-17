-- Soirée à deux à distance (Lamia, 17 nov. 2026) : vendue seule, en plus d'être incluse dans les abonnements Couple.
-- On ajoute aussi inviter_lamia, déjà enregistré par le paiement mais absent de la liste.
alter table public.achats_unite drop constraint if exists achats_unite_type_check;
alter table public.achats_unite add constraint achats_unite_type_check check (type = any (array['mise_en_relation','speed_dating','photo_match','coaching','coaching_30','sauver_couple','live_priorite','prolonger_discussion','profil_avant','qui_choisi','coeur_message','inviter_lamia','soiree_distance']));
