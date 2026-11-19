-- Un envoi conserve sa clé en cas de réponse perdue. Les anciens messages restent inchangés.
-- À appliquer avant le code qui utilise client_message_id. Aucune politique d'accès n'est modifiée.
alter table public.discussion_messages add column if not exists client_message_id uuid;
create unique index if not exists discussion_messages_envoi_unique
  on public.discussion_messages (discussion_id, auteur, client_message_id)
  where client_message_id is not null;
comment on column public.discussion_messages.client_message_id is
  'Identifiant aléatoire de tentative, stable lors des relances du même envoi. Aucun contenu utilisateur.';
