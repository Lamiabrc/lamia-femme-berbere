-- Optimisations additives ; ne pas bloquer les écritures en attendant un verrou.
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create index if not exists scores_outil_b_ref_score_idx on public.scores_outil (b_ref, score desc, a_ref);
create index if not exists admin_notifications_related_report_id_fkey_idx on public.admin_notifications (related_report_id);
create index if not exists blocages_cible_user_fkey_idx on public.blocages (cible_user);
create index if not exists cadeaux_demandes_couple_id_fkey_idx on public.cadeaux_demandes (couple_id);
create index if not exists coaching_creneaux_user_id_fkey_idx on public.coaching_creneaux (user_id);
create index if not exists confidence_files_message_id_fkey_idx on public.confidence_files (message_id);
create index if not exists couples_discussion_id_fkey_idx on public.couples (discussion_id);
create index if not exists event_registrations_user_id_fkey_idx on public.event_registrations (user_id);
create index if not exists matches_user_b_fkey_idx on public.matches (user_b);
create index if not exists member_subscriptions_plan_id_fkey_idx on public.member_subscriptions (plan_id);
create index if not exists member_subscriptions_user_id_fkey_idx on public.member_subscriptions (user_id);
create index if not exists order_items_product_id_fkey_idx on public.order_items (product_id);
create index if not exists report_evidence_report_id_fkey_idx on public.report_evidence (report_id);
create index if not exists report_evidence_uploader_user_id_fkey_idx on public.report_evidence (uploader_user_id);
create index if not exists safety_reports_event_id_fkey_idx on public.safety_reports (event_id);
create index if not exists safety_reports_reported_user_id_fkey_idx on public.safety_reports (reported_user_id);
create index if not exists safety_reports_reporter_user_id_fkey_idx on public.safety_reports (reporter_user_id);
create index if not exists salon_editions_event_id_fkey_idx on public.salon_editions (event_id);
create index if not exists salon_inscriptions_edition_id_fkey_idx on public.salon_inscriptions (edition_id);
create index if not exists salon_inscriptions_user_id_fkey_idx on public.salon_inscriptions (user_id);
create index if not exists signalements_auteur_user_fkey_idx on public.signalements (auteur_user);

-- Même contrat JSON, propriétaire et droits d'exécution conservés.
CREATE OR REPLACE FUNCTION public.visit_stats2(p_today date, p_days integer DEFAULT 30)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with v as (select * from public.page_views where day >= p_today - (greatest(1, least(p_days, 365)) - 1)),
       pv as (select * from v where event is null),
       ev as (select * from v where event is not null and event <> 'temps'),
       pages_vues as (select path, count(*) n from pv group by path order by n desc limit 15),
       temps_pages as (select path, round(avg(duration_s)) tps from v where event = 'temps' and duration_s between 3 and 3600 group by path)
  select json_build_object(
    'jours_periode', greatest(1, least(p_days, 365)),
    'aujourdhui', (select json_build_object('vues', count(*), 'visiteurs', count(distinct visitor)) from pv where day = p_today),
    'periode', (select json_build_object('vues', count(*), 'visiteurs', count(distinct visitor), 'pages_par_visiteur', round(count(*)::numeric / nullif(count(distinct visitor), 0), 1)) from pv),
    'temps_moyen_s', (select round(avg(duration_s)) from v where event = 'temps' and duration_s between 3 and 3600),
    'jours', (select json_agg(json_build_object('day', d::date, 'vues', coalesce(x.vues, 0), 'visiteurs', coalesce(x.visiteurs, 0)) order by d)
              from generate_series(p_today - (greatest(1, least(p_days, 365)) - 1), p_today, interval '1 day') d
              left join (select day, count(*) vues, count(distinct visitor) visiteurs from pv group by day) x on x.day = d::date),
    'heures', (select json_agg(json_build_object('h', h, 'n', coalesce(n, 0)) order by h) from generate_series(0, 23) h left join (select hour, count(*) n from pv where hour is not null group by hour) y on y.hour = h),
    'pages', (select coalesce(json_agg(json_build_array(p.path, p.n, t.tps) order by p.n desc), '[]') from pages_vues p left join temps_pages t on t.path = p.path),
    'sources', (select coalesce(json_agg(json_build_array(source, n, vis)), '[]') from (select source, count(*) n, count(distinct visitor) vis from pv where source is distinct from 'interne' group by source order by n desc limit 12) t),
    'appareils', (select coalesce(json_agg(json_build_array(device, n)), '[]') from (select device, count(distinct visitor) n from pv group by device order by n desc) t),
    'pays', (select coalesce(json_agg(json_build_array(country, n)), '[]') from (select coalesce(country, '??') country, count(distinct visitor) n from pv group by 1 order by n desc limit 20) t),
    'villes', (select coalesce(json_agg(json_build_array(city, country, n)), '[]') from (select city, country, count(distinct visitor) n from pv where city is not null group by city, country order by n desc limit 25) t),
    'regions', (select coalesce(json_agg(json_build_array(region, country, n)), '[]') from (select region, country, count(distinct visitor) n from pv where region is not null group by region, country order by n desc limit 15) t),
    'evenements', (select coalesce(json_object_agg(event, n), '{}') from (select event, count(*) n from ev group by event) t)
  );
$function$;
notify pgrst, 'reload schema';
