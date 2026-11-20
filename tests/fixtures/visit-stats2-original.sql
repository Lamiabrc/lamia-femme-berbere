CREATE OR REPLACE FUNCTION public.visit_stats2(p_today date, p_days integer DEFAULT 30)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with v as (select * from public.page_views where day >= p_today - (greatest(1, least(p_days, 365)) - 1)),
       pv as (select * from v where event is null),
       ev as (select * from v where event is not null and event <> 'temps')
  select json_build_object(
    'jours_periode', greatest(1, least(p_days, 365)),
    'aujourdhui', (select json_build_object('vues', count(*), 'visiteurs', count(distinct visitor)) from pv where day = p_today),
    'periode', (select json_build_object('vues', count(*), 'visiteurs', count(distinct visitor), 'pages_par_visiteur', round(count(*)::numeric / nullif(count(distinct visitor), 0), 1)) from pv),
    'temps_moyen_s', (select round(avg(duration_s)) from v where event = 'temps' and duration_s between 3 and 3600),
    'jours', (select json_agg(json_build_object('day', d::date, 'vues', coalesce(x.vues, 0), 'visiteurs', coalesce(x.visiteurs, 0)) order by d)
              from generate_series(p_today - (greatest(1, least(p_days, 365)) - 1), p_today, interval '1 day') d
              left join (select day, count(*) vues, count(distinct visitor) visiteurs from pv group by day) x on x.day = d::date),
    'heures', (select json_agg(json_build_object('h', h, 'n', coalesce(n, 0)) order by h) from generate_series(0, 23) h left join (select hour, count(*) n from pv where hour is not null group by hour) y on y.hour = h),
    'pages', (select coalesce(json_agg(json_build_array(path, n, tps)), '[]') from (select p.path, count(*) n, (select round(avg(duration_s)) from v t where t.event = 'temps' and t.path = p.path and t.duration_s between 3 and 3600) tps from pv p group by p.path order by n desc limit 15) t),
    'sources', (select coalesce(json_agg(json_build_array(source, n, vis)), '[]') from (select source, count(*) n, count(distinct visitor) vis from pv where source is distinct from 'interne' group by source order by n desc limit 12) t),
    'appareils', (select coalesce(json_agg(json_build_array(device, n)), '[]') from (select device, count(distinct visitor) n from pv group by device order by n desc) t),
    'pays', (select coalesce(json_agg(json_build_array(country, n)), '[]') from (select coalesce(country, '??') country, count(distinct visitor) n from pv group by 1 order by n desc limit 20) t),
    'villes', (select coalesce(json_agg(json_build_array(city, country, n)), '[]') from (select city, country, count(distinct visitor) n from pv where city is not null group by city, country order by n desc limit 25) t),
    'regions', (select coalesce(json_agg(json_build_array(region, country, n)), '[]') from (select region, country, count(distinct visitor) n from pv where region is not null group by region, country order by n desc limit 15) t),
    'evenements', (select coalesce(json_object_agg(event, n), '{}') from (select event, count(*) n from ev group by event) t)
  );
$function$
