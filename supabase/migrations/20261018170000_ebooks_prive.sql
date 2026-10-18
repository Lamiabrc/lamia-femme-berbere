-- Fichiers des livres numériques : dossier privé, aucune lecture publique.
-- Le site ne les donne qu'à une acheteuse dont le paiement est vérifié chez Stripe,
-- par un lien signé valable quelques minutes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ebooks', 'ebooks', false, 52428800, array['application/pdf','application/epub+zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
