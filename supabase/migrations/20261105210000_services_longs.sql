-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Coaching de 30 minutes et Sauver mon couple : deux services de plus, avec des créneaux de leur durée.
alter table public.achats_unite drop constraint if exists achats_unite_type_check;
alter table public.achats_unite add constraint achats_unite_type_check check (type in ('mise_en_relation','speed_dating','photo_match','coaching','coaching_30','sauver_couple','live_priorite','prolonger_discussion','profil_avant','qui_choisi'));
