-- Nouveautés de la Maison (produits, articles, actus, lives) : fil du site et notifications des membres.
create table if not exists public.nouveautes (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('boutique','article','actu','live')),
  titre text not null check (length(titre) between 1 and 140),
  texte text check (texte is null or length(texte) <= 600),
  lien text check (lien is null or length(lien) <= 300),
  image text check (image is null or length(image) <= 300),
  source text,
  created_at timestamptz not null default now(),
  envoyee_at timestamptz,
  nb_envoyes int not null default 0
);
alter table public.nouveautes enable row level security;
revoke all on public.nouveautes from anon, authenticated;
create index if not exists nouveautes_created_idx on public.nouveautes (created_at desc);
-- Choix des notifications de chaque téléphone (rencontres toujours, le reste au choix).
alter table public.push_subscriptions add column if not exists prefs jsonb not null default '{"boutique": true, "article": true, "actu": true, "live": true}';
-- Chaque produit mis en vente devient une nouveauté (envoyée en notification le soir, regroupée).
create or replace function public.nouveaute_produit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.nouveautes (type, titre, texte, lien, image, source)
    values ('boutique', left(new.name, 140), left(coalesce(new.subtitle, ''), 600), '/produit/' || new.slug || '/', new.cover_image_url, 'produit:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists produits_nouveaute on public.products;
create trigger produits_nouveaute after insert or update of status on public.products for each row execute function public.nouveaute_produit();
revoke all on function public.nouveaute_produit() from public, anon, authenticated;
