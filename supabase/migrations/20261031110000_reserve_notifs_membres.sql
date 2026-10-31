-- Demandes « gardées en réserve » : reproposées quand le match en cours se termine.
alter table public.annonce_interets drop constraint if exists annonce_interets_statut_check;
alter table public.annonce_interets add constraint annonce_interets_statut_check check (statut in ('a_traiter','mis_en_relation','pas_compatible','dematche','en_reserve'));
-- Notifications : celles de Lamia (son espace) et celles des membres (Mon espace), séparées.
alter table public.push_subscriptions add column if not exists pour text not null default 'lamia';
