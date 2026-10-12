-- Visites anonymes (sans cookie) : écrites et lues uniquement par le serveur (clé de service).
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  day date not null default ((now() at time zone 'Europe/Paris')::date),
  path text not null check (char_length(path) <= 200),
  source text check (char_length(source) <= 80),
  device text check (device in ('mobile','ordinateur','tablette')),
  visitor text check (char_length(visitor) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists page_views_day_idx on public.page_views (day);
alter table public.page_views enable row level security;
