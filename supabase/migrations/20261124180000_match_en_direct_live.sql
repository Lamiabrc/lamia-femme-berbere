-- Match en direct (24 nov. 2026) : consentement des personnes « en match » et propositions faites depuis le live.
-- Ajouts seulement : rien n'est supprimé ni modifié pour l'existant.
alter table public.annonces
  add column if not exists match_live_ok boolean,            -- null = pas encore demandé, true = veut être prévenu(e), false = ne veut pas (vaut tant qu'elle est en match)
  add column if not exists match_live_reponse_at timestamptz,
  add column if not exists match_live_demande_at timestamptz;

alter table public.propositions
  add column if not exists live boolean not null default false,   -- proposition faite par Lamia pendant un live
  add column if not exists temps_jusqu_a timestamptz;             -- « laisse-moi le temps de dématcher » : jusqu'à quand

alter table public.propositions drop constraint if exists propositions_reponse_check;
alter table public.propositions add constraint propositions_reponse_check check (reponse in ('oui', 'non', 'temps'));
