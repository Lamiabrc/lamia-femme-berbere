-- Résumé des visites sur 30 jours (appelé par le tableau de bord avec la clé de service).
create or replace function public.visit_stats(p_today date)
returns json language sql stable security invoker set search_path = public as $$
  with v as (select * from public.page_views where day >= p_today - 29)
  select json_build_object(
    'aujourdhui', (select json_build_object('vues', count(*), 'visiteurs', count(distinct visitor)) from v where day = p_today),
    'semaine', (select json_build_object('vues', count(*), 'visiteurs', count(distinct visitor)) from v where day >= p_today - 6),
    'mois', (select json_build_object('vues', count(*), 'visiteurs', count(distinct visitor)) from v),
    'jours', (select json_agg(json_build_object('day', d::date, 'vues', coalesce(x.vues, 0), 'visiteurs', coalesce(x.visiteurs, 0)) order by d)
              from generate_series(p_today - 29, p_today, interval '1 day') d
              left join (select day, count(*) vues, count(distinct visitor) visiteurs from v group by day) x on x.day = d::date),
    'pages', (select coalesce(json_agg(json_build_array(path, n)), '[]') from (select path, count(*) n from v group by path order by n desc limit 12) t),
    'sources', (select coalesce(json_agg(json_build_array(source, n)), '[]') from (select source, count(*) n from v where source is distinct from 'interne' group by source order by n desc limit 10) t),
    'appareils', (select coalesce(json_agg(json_build_array(device, n)), '[]') from (select device, count(*) n from v group by device order by n desc) t)
  );
$$;
revoke all on function public.visit_stats(date) from public, anon, authenticated;
grant execute on function public.visit_stats(date) to service_role;
