-- Sécurité des inscriptions aux soirées.
--
-- Avant : un membre pouvait modifier sa propre inscription, y compris payment_status,
-- et donc se déclarer « payé » sans payer.
-- Désormais :
--   * un membre ne peut créer qu'une inscription « en attente », à son nom ;
--   * le statut de paiement et la session Stripe ne peuvent être changés que par le
--     serveur (rôle service_role, après vérification chez Stripe) : toute tentative
--     d'un membre est ignorée, le reste de la modification passe.
-- Compatible avec le site actuel (réservation par upsert) et la nouvelle Maison.
-- Le lien de salle (room_url) n'est volontairement pas renseigné : il est envoyé par email.

begin;

drop policy if exists "members own registrations insert" on public.event_registrations;
create policy "members own registrations insert" on public.event_registrations
  for insert to authenticated
  with check ((select auth.uid()) = user_id and payment_status = 'pending' and stripe_checkout_session_id is null);

create or replace function public.protect_registration_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.payment_status := old.payment_status;
    new.stripe_checkout_session_id := old.stripe_checkout_session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_registration_payment on public.event_registrations;
create trigger protect_registration_payment
  before update on public.event_registrations
  for each row execute function public.protect_registration_payment();

commit;
