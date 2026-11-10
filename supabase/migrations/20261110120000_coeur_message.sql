-- Cœur avec message (achat à l'unité, 2 €) : la phrase qui accompagne un choix fait dans le swipe.
alter table public.annonce_interets add column if not exists message text;
alter table public.annonce_interets add column if not exists message_at timestamptz;
