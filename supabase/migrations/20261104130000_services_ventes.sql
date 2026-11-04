-- Services à l'unité (coaching, priorité en live, discussion prolongée, mise en avant, qui m'a choisi) et chiffres de l'onglet Ventes.
alter table public.achats_unite drop constraint if exists achats_unite_type_check;
alter table public.achats_unite add constraint achats_unite_type_check check (type in ('mise_en_relation','speed_dating','photo_match','coaching','live_priorite','prolonger_discussion','profil_avant','qui_choisi'));
alter table public.achats_unite add column if not exists montant_centimes int;
alter table public.achats_unite add column if not exists cible text;
alter table public.achats_unite add column if not exists acces_jusqu_a timestamptz;
alter table public.achats_unite add column if not exists applique_at timestamptz;
alter table public.abonnements add column if not exists prix_centimes int;
alter table public.annonces add column if not exists avant_jusqu_a timestamptz;
alter table public.profils_outil add column if not exists avant_jusqu_a timestamptz;
alter table public.coaching_creneaux add column if not exists source text not null default 'inclus';
alter table public.coaching_creneaux add column if not exists achat_id uuid;
drop index if exists public.coaching_un_par_mois;
create unique index if not exists coaching_un_par_mois on public.coaching_creneaux (user_id, mois) where user_id is not null and source = 'inclus';
create table if not exists public.encaissements (
  id uuid primary key default gen_random_uuid(),
  stripe_invoice_id text not null unique,
  stripe_subscription_id text,
  email text,
  montant_centimes int not null,
  paye_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.encaissements enable row level security;
revoke all on public.encaissements from anon, authenticated;
