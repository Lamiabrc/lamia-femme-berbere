-- Sécurité des inscriptions aux soirées et du lien de salle privée.
--
-- 1. Avant : un membre pouvait modifier sa propre inscription, y compris payment_status,
--    et donc se déclarer « payé » sans payer. Désormais, seul le serveur (clé service, après
--    vérification chez Stripe) peut changer le statut de paiement.
-- 2. Avant : la colonne room_url des soirées était lisible par tout visiteur.

begin;

-- Inscription : un membre ne peut créer qu'une inscription « en attente », à son nom.
drop policy if exists "members own registrations insert" on public.event_registrations;
create policy "members own registrations insert" on public.event_registrations
  for insert to authenticated
  with check ((select auth.uid()) = user_id and payment_status = 'pending' and stripe_checkout_session_id is null);

-- Modification : seule la présence (désistement) reste modifiable par le membre.
revoke update on public.event_registrations from anon, authenticated;
grant update (attendance_status) on public.event_registrations to authenticated;

-- Lien de salle : lecture publique colonne par colonne, sans room_url.
revoke select on public.speed_dating_events from anon, authenticated;
grant select (id, slug, title, description, starts_at, ends_at, min_age, max_age, audience, capacity,
              ticket_price_cents, currency, status, created_at)
  on public.speed_dating_events to anon, authenticated;

commit;
