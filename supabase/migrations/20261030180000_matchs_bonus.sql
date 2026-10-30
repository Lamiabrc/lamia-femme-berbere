-- Matchs en même temps : 1 en Découverte, 3 avec une formule payante ; Lamia peut en offrir un de plus (en live).
alter table public.annonces add column if not exists matchs_bonus int not null default 0;
