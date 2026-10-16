-- Les Confidences avec Lamia : conversations privées, messages, pièces jointes, abonnements aux notifications.
-- Tout passe par l'API serveur (clé de service) : aucune politique d'accès public, RLS activé sans règle = accès refusé
-- au navigateur. Les signalements existants (safety_reports, report_evidence) ne sont pas touchés.

create table if not exists public.confidence_threads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and length(email) <= 254),
  name text not null check (length(name) between 1 and 80),
  phone text check (phone is null or length(phone) <= 40),
  channel text not null default 'ecrit' check (channel in ('ecrit', 'vocal', 'conversation')),
  status text not null default 'a_lire' check (status in ('a_lire', 'en_cours', 'termine')),
  unread_lamia int not null default 0,
  unread_visitor int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists confidence_threads_email_idx on public.confidence_threads (email);
create index if not exists confidence_threads_last_idx on public.confidence_threads (last_message_at desc);

create table if not exists public.confidence_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.confidence_threads(id) on delete cascade,
  author text not null check (author in ('visiteur', 'lamia')),
  body text check (body is null or length(body) <= 8000),
  ip_hash text,
  ready boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists confidence_messages_thread_idx on public.confidence_messages (thread_id, created_at);
create index if not exists confidence_messages_ip_idx on public.confidence_messages (ip_hash, created_at);

create table if not exists public.confidence_files (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.confidence_messages(id) on delete cascade,
  thread_id uuid not null references public.confidence_threads(id) on delete cascade,
  storage_path text not null unique,
  kind text not null check (kind in ('audio', 'image', 'document')),
  mime text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 26214400),
  original_name text check (original_name is null or length(original_name) <= 200),
  duration_s int,
  created_at timestamptz not null default now()
);
create index if not exists confidence_files_thread_idx on public.confidence_files (thread_id);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);

alter table public.confidence_threads enable row level security;
alter table public.confidence_messages enable row level security;
alter table public.confidence_files enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.confidence_threads, public.confidence_messages, public.confidence_files, public.push_subscriptions from anon, authenticated;

-- Stockage privé des vocaux, images et documents (jamais public, accès par liens signés de courte durée).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('confidences', 'confidences', false, 26214400, array[
  'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/aac','audio/x-m4a','audio/m4a',
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
  'application/pdf','text/plain','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
