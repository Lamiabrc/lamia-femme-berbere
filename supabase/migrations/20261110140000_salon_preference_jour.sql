-- Sondage de l'inscription aux salons : quel moment la personne préfère pour la soirée.
alter table public.salon_inscriptions add column if not exists prefere_jour text
  check (prefere_jour is null or prefere_jour in ('weekend', 'semaine', 'indifferent'));
