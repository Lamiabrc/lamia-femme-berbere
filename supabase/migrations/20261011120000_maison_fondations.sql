-- La Maison Lamia Femme Berbère — fondations du modèle de données.
--
-- STATUT : NON APPLIQUÉE. À relire puis appliquer d'abord sur un environnement de
-- préproduction, jamais directement en production.
--
-- Cette migration est strictement ADDITIVE : elle crée de nouvelles tables et ajoute
-- des colonnes facultatives. Elle ne supprime, ne renomme et ne vide aucune donnée
-- existante (products, categories, member_profiles, safety_reports, etc.).
--
-- À VÉRIFIER sur le vrai schéma avant application (non visible depuis l'audit) :
--   * la colonne qui relie products à categories est supposée s'appeler category_id ;
--   * les politiques RLS existantes de speed_dating_events (la lecture colonne par colonne
--     ci-dessous s'ajoute à elles).
-- Testée le 11/10/2026 sur PostgreSQL 16 avec une copie simulée du schéma : passe, rejouable.
--
-- Principes :
--   * la pièce (rooms) est une donnée ; le site, l'administration et la future
--     Maison 3D lisent les mêmes lignes ;
--   * un type de produit décrit ses propres champs (product_type_fields), donc une
--     nouvelle famille (trouvaille, cosmétique…) se crée sans développement ;
--   * la sécurité est écrite ici (RLS), jamais seulement dans le navigateur.

begin;

-- ------------------------------------------------------------------ rôles

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderatrice')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.user_roles enable row level security;

-- Vrai si l'utilisateur courant a le rôle demandé (ou admin).
create or replace function public.has_role(wanted text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and (role = wanted or role = 'admin')
  );
$$;
revoke all on function public.has_role(text) from public;
grant execute on function public.has_role(text) to authenticated, anon;

drop policy if exists user_roles_self_read on public.user_roles;
create policy user_roles_self_read on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));
drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- ------------------------------------------------------------------ pièces de la Maison

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  welcome text not null,
  summary text,
  status text not null default 'soon' check (status in ('open', 'soon', 'hidden')),
  accent text not null default 'rouge' check (accent in ('rouge', 'cobalt', 'vert', 'safran')),
  sort_order int not null default 100,
  plan jsonb,              -- position dans le plan 2D du Hall
  scene jsonb,             -- réservé à la future Maison 3D (salle, caméra, objets)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rooms enable row level security;
drop policy if exists rooms_public_read on public.rooms;
create policy rooms_public_read on public.rooms for select using (status <> 'hidden' or public.has_role('admin'));
drop policy if exists rooms_admin_write on public.rooms;
create policy rooms_admin_write on public.rooms for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

insert into public.rooms (slug, name, welcome, status, accent, sort_order) values
  ('hall', 'Le Hall', 'Bienvenue chez Lamia.', 'open', 'rouge', 0),
  ('salon', 'Le Salon de Lamia', 'Installe-toi, on parle vrai.', 'open', 'rouge', 10),
  ('bibliotheque', 'La Bibliothèque de Yemma', 'Ce que Yemma m’a transmis.', 'open', 'cobalt', 20),
  ('ecrin', 'L’Écrin', 'Les bijoux qui racontent d’où l’on vient.', 'open', 'vert', 30),
  ('grenier', 'Le Grenier des Trouvailles', 'Ce que j’ai déniché pour toi.', 'open', 'safran', 40),
  ('boutique', 'La Boutique', 'Tout ce que la Maison propose.', 'open', 'rouge', 50),
  ('speed-dating', 'Le Salon du Speed Dating', 'Des rencontres vraies, dans un cadre sûr.', 'open', 'rouge', 60),
  ('confidences', 'Le Cabinet des Confidences', 'Ici, tu peux tout me dire.', 'open', 'cobalt', 70),
  ('patio', 'Le Patio', 'La Maison se retrouve ici.', 'open', 'vert', 80),
  ('galerie', 'La Galerie', 'Regarder, comprendre, transmettre.', 'open', 'safran', 90),
  ('atelier', 'L’Atelier', 'Là où naissent les pièces.', 'soon', 'vert', 100),
  ('salle-de-bain', 'La Salle de bain de Lamia', 'Les rituels de la Maison.', 'soon', 'cobalt', 110),
  ('coiffeuse', 'La Coiffeuse de Lamia', 'Le rouge, les bijoux, les gestes qui nous ressemblent.', 'soon', 'rouge', 120)
on conflict (slug) do nothing;

-- ------------------------------------------------------------------ médias

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,       -- chemin dans le bucket « media », jamais une URL absolue
  kind text not null check (kind in ('image', 'video', 'audio', 'model_3d', 'document')),
  nature text not null default 'reel' check (nature in ('reel', 'ambiance')), -- photo réelle ou visuel d'ambiance
  alt_text text,
  credit text,
  width int,
  height int,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.media_assets enable row level security;
drop policy if exists media_public_read on public.media_assets;
create policy media_public_read on public.media_assets for select using (true);
drop policy if exists media_admin_write on public.media_assets;
create policy media_admin_write on public.media_assets for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ------------------------------------------------------------------ types de produits configurables

create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  default_room_id uuid references public.rooms(id),
  is_regulated boolean not null default false,  -- vrai pour les cosmétiques (exigences UE)
  created_at timestamptz not null default now()
);

create table if not exists public.product_type_fields (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references public.product_types(id) on delete cascade,
  key text not null,                -- ex. weight_g, inci, pao_months
  label text not null,              -- ex. « Poids », « Liste INCI »
  data_type text not null check (data_type in ('text', 'long_text', 'number', 'boolean', 'date', 'select', 'document')),
  unit text,
  options jsonb,                    -- valeurs possibles pour data_type = 'select'
  is_required boolean not null default false,
  is_public boolean not null default true,  -- visible par la cliente sur la fiche
  sort_order int not null default 100,
  unique (product_type_id, key)
);

alter table public.product_types enable row level security;
alter table public.product_type_fields enable row level security;
drop policy if exists product_types_public_read on public.product_types;
create policy product_types_public_read on public.product_types for select using (true);
drop policy if exists product_types_admin_write on public.product_types;
create policy product_types_admin_write on public.product_types for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
drop policy if exists product_type_fields_public_read on public.product_type_fields;
create policy product_type_fields_public_read on public.product_type_fields for select using (is_public or public.has_role('admin'));
drop policy if exists product_type_fields_admin_write on public.product_type_fields;
create policy product_type_fields_admin_write on public.product_type_fields for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Types de départ et leurs champs.
insert into public.product_types (slug, name, default_room_id, is_regulated)
select v.slug, v.name, r.id, v.reg
from (values
  ('bijou', 'Bijou', 'ecrin', false),
  ('livre', 'Livre', 'bibliotheque', false),
  ('trouvaille', 'Trouvaille', 'grenier', false),
  ('cosmetique', 'Cosmétique', 'salle-de-bain', true),
  ('beaute', 'Beauté', 'coiffeuse', true)
) as v(slug, name, room, reg)
join public.rooms r on r.slug = v.room
on conflict (slug) do nothing;

insert into public.product_type_fields (product_type_id, key, label, data_type, unit, options, is_required, is_public, sort_order)
select t.id, f.key, f.label, f.data_type, f.unit, f.options::jsonb, f.req, f.pub, f.ord
from (values
  ('bijou', 'metal', 'Métal', 'text', null, null, false, true, 10),
  ('bijou', 'weight_g', 'Poids', 'number', 'g', null, false, true, 20),
  ('bijou', 'main_medallion_diameter_cm', 'Médaillon central', 'number', 'cm', null, false, true, 30),
  ('bijou', 'craft', 'Technique', 'text', null, null, false, true, 40),
  ('bijou', 'origin', 'Origine', 'text', null, null, false, true, 50),
  ('livre', 'author', 'Autrice ou auteur', 'text', null, null, true, true, 10),
  ('livre', 'isbn', 'ISBN', 'text', null, null, false, true, 20),
  ('livre', 'format', 'Format', 'select', null, '["papier","numérique"]', true, true, 30),
  ('livre', 'pages', 'Nombre de pages', 'number', null, null, false, true, 40),
  ('trouvaille', 'family', 'Famille', 'select', null, '["Livre ancien","Carte postale","Bibelot et décoration","Cadre et image","Sculpture","Bijou ancien","Autre"]', true, true, 10),
  ('trouvaille', 'era', 'Époque estimée', 'text', null, null, false, true, 20),
  ('trouvaille', 'condition', 'État', 'select', null, '["Très bon","Bon","Traces d’usage"]', true, true, 30),
  ('trouvaille', 'flaws', 'Défauts visibles', 'long_text', null, null, false, true, 40),
  ('trouvaille', 'dimensions_cm', 'Dimensions', 'text', 'cm', null, true, true, 50),
  ('trouvaille', 'weight_g', 'Poids', 'number', 'g', null, true, true, 60),
  ('trouvaille', 'lamia_story', 'L’histoire de Lamia', 'long_text', null, null, false, true, 70),
  ('cosmetique', 'inci', 'Liste INCI', 'long_text', null, null, true, true, 10),
  ('cosmetique', 'volume', 'Contenance', 'text', null, null, true, true, 20),
  ('cosmetique', 'pao_months', 'PAO', 'number', 'mois', null, true, true, 30),
  ('cosmetique', 'precautions', 'Précautions d’emploi', 'long_text', null, null, true, true, 40),
  ('cosmetique', 'responsible_person', 'Personne responsable', 'text', null, null, true, true, 50),
  ('cosmetique', 'made_in', 'Pays de fabrication', 'text', null, null, true, true, 60),
  ('cosmetique', 'safety_report', 'Rapport de sécurité', 'document', null, null, true, false, 70),
  ('beaute', 'inci', 'Liste INCI', 'long_text', null, null, true, true, 10),
  ('beaute', 'pao_months', 'PAO', 'number', 'mois', null, true, true, 20),
  ('beaute', 'responsible_person', 'Personne responsable', 'text', null, null, true, true, 30),
  ('beaute', 'made_in', 'Pays de fabrication', 'text', null, null, true, true, 40)
) as f(type_slug, key, label, data_type, unit, options, req, pub, ord)
join public.product_types t on t.slug = f.type_slug
on conflict (product_type_id, key) do nothing;

-- Rattachement facultatif des produits existants à une pièce et à un type.
alter table public.products add column if not exists room_id uuid references public.rooms(id);
alter table public.products add column if not exists product_type_id uuid references public.product_types(id);
alter table public.products add column if not exists attributes jsonb not null default '{}'::jsonb;

update public.products p set room_id = r.id
from public.categories c, public.rooms r
where p.category_id = c.id and p.room_id is null
  and r.slug = case c.slug when 'bijoux' then 'ecrin' when 'livres' then 'bibliotheque' when 'trouvailles' then 'grenier' end;

-- ------------------------------------------------------------------ collections, variantes, médias produit

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  room_id uuid references public.rooms(id),
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.product_collections (
  product_id uuid not null references public.products(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  primary key (product_id, collection_id)
);
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text unique,
  name text not null,                 -- ex. « Rouge Lamia », « Taille 54 », « Numérique »
  attributes jsonb not null default '{}'::jsonb,  -- ex. {"teinte":"#B0162E"}
  price_cents int check (price_cents >= 0),       -- prix propre à la variante, sinon celui du produit
  is_active boolean not null default true,
  sort_order int not null default 100
);
create table if not exists public.product_media (
  product_id uuid not null references public.products(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  sort_order int not null default 100,
  primary key (product_id, media_id)
);
alter table public.collections enable row level security;
alter table public.product_collections enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_media enable row level security;
drop policy if exists collections_public_read on public.collections;
create policy collections_public_read on public.collections for select using (true);
drop policy if exists product_collections_public_read on public.product_collections;
create policy product_collections_public_read on public.product_collections for select using (true);
drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants for select using (is_active or public.has_role('admin'));
drop policy if exists product_media_public_read on public.product_media;
create policy product_media_public_read on public.product_media for select using (true);
drop policy if exists collections_admin_write on public.collections;
create policy collections_admin_write on public.collections for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
drop policy if exists product_collections_admin_write on public.product_collections;
create policy product_collections_admin_write on public.product_collections for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
drop policy if exists product_variants_admin_write on public.product_variants;
create policy product_variants_admin_write on public.product_variants for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
drop policy if exists product_media_admin_write on public.product_media;
create policy product_media_admin_write on public.product_media for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- ------------------------------------------------------------------ stock et réservations

create table if not exists public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  delta int not null,                 -- +5 réassort, -1 vente, etc.
  reason text not null check (reason in ('initial', 'restock', 'sale', 'return', 'correction', 'loss')),
  order_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  qty int not null check (qty > 0),
  checkout_session_id text,           -- session Stripe Checkout
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'converted', 'released')),
  created_at timestamptz not null default now()
);
-- Serveur uniquement : aucune lecture publique.
alter table public.inventory_movements enable row level security;
alter table public.stock_reservations enable row level security;
drop policy if exists inventory_admin_read on public.inventory_movements;
create policy inventory_admin_read on public.inventory_movements for select to authenticated using (public.has_role('admin'));
drop policy if exists reservations_admin_read on public.stock_reservations;
create policy reservations_admin_read on public.stock_reservations for select to authenticated using (public.has_role('admin'));
revoke insert, update, delete on public.inventory_movements, public.stock_reservations from anon, authenticated;

-- ------------------------------------------------------------------ soirées : critères configurables et souhaits mutuels

create table if not exists public.criteria_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,           -- ex. age, education_level, sector, accepted_situations
  label text not null,
  data_type text not null check (data_type in ('range', 'select', 'multi_select', 'boolean')),
  options jsonb,
  is_active boolean not null default true,
  sort_order int not null default 100
);
insert into public.criteria_definitions (key, label, data_type, options, sort_order) values
  ('age', 'Tranche d’âge', 'range', null, 10),
  ('education_level', 'Niveau d’études', 'multi_select', '["Sans diplôme","CAP / BEP","Bac","Bac +2","Bac +3","Bac +5","Doctorat"]', 20),
  ('sector', 'Secteur d’activité', 'multi_select', '["Santé","Éducation","Commerce","Artisanat","Ingénierie et numérique","Fonction publique","Droit et finance","Entrepreneuriat","Autre"]', 30),
  ('accepted_situations', 'Situations acceptées', 'multi_select', '["Célibataire","Divorcé·e","Veuf·ve","Avec enfants"]', 40),
  ('region', 'Région ou diaspora', 'multi_select', null, 50),
  ('marriage_horizon', 'Horizon de mariage', 'multi_select', '["Dans l’année","1 à 2 ans","Quand la bonne personne se présente"]', 60)
on conflict (key) do nothing;

create table if not exists public.event_criteria (
  event_id uuid not null references public.speed_dating_events(id) on delete cascade,
  criterion_id uuid not null references public.criteria_definitions(id),
  rule jsonb not null,                -- ex. {"min":25,"max":35} ou {"any":["Bac +3","Bac +5"]}
  primary key (event_id, criterion_id)
);

-- Profil de rencontre : privé, lisible seulement par la membre et l'équipe Lamia.
create table if not exists public.member_dating_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,   -- réponses aux criteria_definitions
  identity_verified_at timestamptz,
  verified_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_wishes (
  event_id uuid not null references public.speed_dating_events(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, from_user, to_user),
  check (from_user <> to_user)
);
-- Un souhait mutuel n'existe que si les deux personnes se sont choisies.
create or replace view public.mutual_wishes with (security_invoker = true) as
  select a.event_id, a.from_user as user_a, a.to_user as user_b
  from public.event_wishes a
  join public.event_wishes b on b.event_id = a.event_id and b.from_user = a.to_user and b.to_user = a.from_user
  where a.from_user < a.to_user;

alter table public.criteria_definitions enable row level security;
alter table public.event_criteria enable row level security;
alter table public.member_dating_profiles enable row level security;
alter table public.event_wishes enable row level security;
drop policy if exists criteria_public_read on public.criteria_definitions;
create policy criteria_public_read on public.criteria_definitions for select using (is_active or public.has_role('admin'));
drop policy if exists criteria_admin_write on public.criteria_definitions;
create policy criteria_admin_write on public.criteria_definitions for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
drop policy if exists event_criteria_public_read on public.event_criteria;
create policy event_criteria_public_read on public.event_criteria for select using (true);
drop policy if exists event_criteria_admin_write on public.event_criteria;
create policy event_criteria_admin_write on public.event_criteria for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
drop policy if exists dating_profile_self on public.member_dating_profiles;
create policy dating_profile_self on public.member_dating_profiles for select to authenticated using (user_id = auth.uid() or public.has_role('moderatrice'));
drop policy if exists dating_profile_self_write on public.member_dating_profiles;
create policy dating_profile_self_write on public.member_dating_profiles for insert to authenticated with check (user_id = auth.uid() and identity_verified_at is null);
drop policy if exists dating_profile_self_update on public.member_dating_profiles;
create policy dating_profile_self_update on public.member_dating_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dating_profile_staff_update on public.member_dating_profiles;
create policy dating_profile_staff_update on public.member_dating_profiles for update to authenticated using (public.has_role('moderatrice')) with check (public.has_role('moderatrice'));
-- On ne voit que ses propres souhaits ; jamais ceux des autres.
drop policy if exists wishes_self_read on public.event_wishes;
create policy wishes_self_read on public.event_wishes for select to authenticated using (from_user = auth.uid() or public.has_role('moderatrice'));
drop policy if exists wishes_self_write on public.event_wishes;
create policy wishes_self_write on public.event_wishes for insert to authenticated with check (from_user = auth.uid());

-- ------------------------------------------------------------------ correctif : lien de salle privée

-- Le lien room_url des soirées ne doit jamais être lisible publiquement.
-- On retire la lecture de la table entière puis on la rend colonne par colonne, sans room_url.
revoke select on public.speed_dating_events from anon, authenticated;
grant select (id, slug, title, description, starts_at, ends_at, min_age, max_age, audience, capacity,
              ticket_price_cents, currency, status, created_at)
  on public.speed_dating_events to anon, authenticated;
-- Le lien est remis le jour même par une fonction serveur, aux seules inscrites ayant payé.

-- ------------------------------------------------------------------ droits et journal d'administration

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                 -- ex. event_access, ebook, pass_rencontre
  target_id uuid,                     -- soirée, contenu, etc.
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source text not null default 'stripe' check (source in ('stripe', 'admin', 'gift')),
  created_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
drop policy if exists entitlements_self_read on public.entitlements;
create policy entitlements_self_read on public.entitlements for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));
revoke insert, update, delete on public.entitlements from anon, authenticated;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  action text not null,
  target_table text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.has_role('admin'));
revoke insert, update, delete on public.audit_log from anon, authenticated;

commit;
