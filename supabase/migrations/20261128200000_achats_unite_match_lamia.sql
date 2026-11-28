-- « Lamia vous met en relation » (8 €) manquait dans la liste des achats autorisés :
-- les paiements du 27 nov. étaient encaissés par Stripe mais refusés par la base.
-- Appliquée en production le 28 nov. 2026. Retour arrière : remettre la liste sans 'match_lamia' (et garder la colonne, sans perte).
alter table public.achats_unite drop constraint if exists achats_unite_type_check;
alter table public.achats_unite add constraint achats_unite_type_check check (type = any (array['mise_en_relation','speed_dating','photo_match','coaching','coaching_30','sauver_couple','live_priorite','prolonger_discussion','profil_avant','qui_choisi','coeur_message','inviter_lamia','soiree_distance','match_lamia']));
alter table public.achats_unite add column if not exists demandeur_ref text;
