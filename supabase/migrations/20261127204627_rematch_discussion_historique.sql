-- Rematcher sans écraser les messages, numéros et consentements de l'ancien échange.
-- Aucun changement de statut et aucun envoi lors de l'application de cette migration.
alter table public.discussions add column if not exists interet_origine_id uuid;
comment on column public.discussions.interet_origine_id is
  'Intérêt historique du chat archivé lors d''un rematch ; interet_id désigne uniquement sa dernière discussion.';

create or replace function public.rematcher_discussion(
  p_interet_id uuid, p_precedente_id uuid, p_ouverte_at timestamptz, p_ferme_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ancienne public.discussions%rowtype;
  nouvelle uuid;
begin
  -- Un seul rematch de cet intérêt à la fois ; ni réseau ni notification sous ce verrou.
  perform 1 from public.annonce_interets where id = p_interet_id for update;
  if not found then raise exception 'interet_absent'; end if;
  select * into ancienne from public.discussions where interet_id = p_interet_id for update;
  if not found then raise exception 'discussion_absente'; end if;
  if ancienne.signalee_at is not null then raise exception 'discussion_signalee'; end if;
  if ancienne.dematch_at is null and ancienne.close_raison is null and ancienne.ferme_at > p_ouverte_at then
    return jsonb_build_object('id', ancienne.id, 'cree', false);
  end if;
  if ancienne.id <> p_precedente_id then raise exception 'discussion_modifiee'; end if;
  if p_ouverte_at is null or p_ferme_at is null or p_ferme_at <= p_ouverte_at
     or p_ferme_at > p_ouverte_at + interval '3650 days' then raise exception 'duree_invalide'; end if;
  update public.discussions set interet_origine_id = interet_id, interet_id = null where id = ancienne.id;
  insert into public.discussions(interet_id, a_user, b_user, a_ref, b_ref, a_prenom, b_prenom, ouverte_at, ferme_at)
    values(p_interet_id, ancienne.a_user, ancienne.b_user, ancienne.a_ref, ancienne.b_ref,
      ancienne.a_prenom, ancienne.b_prenom, p_ouverte_at, p_ferme_at) returning id into nouvelle;
  update public.annonce_interets set statut = 'mis_en_relation', updated_at = p_ouverte_at where id = p_interet_id;
  return jsonb_build_object('id', nouvelle, 'cree', true);
end;
$$;
revoke all on function public.rematcher_discussion(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.rematcher_discussion(uuid, uuid, timestamptz, timestamptz) to service_role;
