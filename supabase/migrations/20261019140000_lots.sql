-- Lots : un produit dont metadata.lot liste les slugs des pièces qui le composent.
-- Quand le lot est vendu, ses pièces ne sont plus disponibles à l'unité ;
-- quand une pièce est vendue seule, le lot qui la contient n'est plus disponible.
create or replace function public.finaliser_commande(p_order uuid, p_session text, p_payment_intent text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update orders
     set status = 'paid', paid_at = now(),
         stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session),
         stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id)
   where id = p_order and status = 'pending'
   returning id into v_id;
  if v_id is null then
    return false;
  end if;
  update products p
     set stock_qty = greatest(0, p.stock_qty - i.quantity), updated_at = now()
    from order_items i
   where i.order_id = v_id and i.product_id = p.id;
  -- pièces d'un lot vendu
  update products c
     set stock_qty = 0, updated_at = now()
    from order_items i join products l on l.id = i.product_id
   where i.order_id = v_id
     and jsonb_typeof(l.metadata->'lot') = 'array'
     and l.metadata->'lot' ? c.slug;
  -- lots contenant une pièce vendue seule
  update products l
     set stock_qty = 0, updated_at = now()
    from order_items i join products c on c.id = i.product_id
   where i.order_id = v_id
     and jsonb_typeof(l.metadata->'lot') = 'array'
     and l.metadata->'lot' ? c.slug
     and l.id <> c.id;
  return true;
end;
$$;

revoke all on function public.finaliser_commande(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finaliser_commande(uuid, text, text) to service_role;
