-- Formules offertes par Lamia : 1, 2 ou 3 mois (17 nov. 2026). Les modérateurs n'ont pas de fin (jusqu_a null).
alter table public.formules_offertes add column if not exists jusqu_a timestamptz;
alter table public.formules_offertes add column if not exists rappel_at timestamptz;
alter table public.formules_offertes add column if not exists fin_notifiee_at timestamptz;
-- Les cadeaux déjà faits durent 2 mois à compter du jour où ils ont été offerts (choix de Lamia).
update public.formules_offertes set jusqu_a = created_at + interval '2 months' where raison = 'lamia' and jusqu_a is null;
