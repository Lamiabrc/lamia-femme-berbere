-- Fin de discussion (Lamia, 16 nov. 2026) : « C'est fini » ou « On est en couple ». Si les deux disent « en couple »,
-- leur espace « Notre couple » s'ouvre tout seul et ne se termine jamais.
alter table public.discussions add column if not exists a_couple_at timestamptz;
alter table public.discussions add column if not exists b_couple_at timestamptz;
alter table public.discussions add column if not exists a_fini_at timestamptz;
alter table public.discussions add column if not exists b_fini_at timestamptz;
alter table public.couples add column if not exists discussion_id uuid references public.discussions(id) on delete set null;
