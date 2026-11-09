-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Les chiffres du tableau de bord de Lamia : calculés dans la base, sans les profils de test. Lecture réservée au serveur.
create or replace function public.cockpit_stats()
returns jsonb language sql stable security definer set search_path = public, auth as $$
with
  debut as (select (date_trunc('day', now() at time zone 'Europe/Paris') - interval '29 days') as d),
  jours as (select g.i, (select d from debut) + make_interval(days => g.i) as jour from generate_series(0, 29) as g(i)),
  vrais as (select id, ref, user_id, genre, pays from annonces where test = false and status in ('a_verifier', 'publiee')),
  refs_test as (select ref from annonces where test = true),
  ev as (
    select 'comptes' as k, created_at as t from auth.users
    union all select 'swipes', p.created_at from annonce_passes p join vrais v on v.id = p.demandeur_id
    union all select 'swipes', i.created_at from annonce_interets i join vrais v on v.id = i.demandeur_id
    union all select 'demandes', i.created_at from annonce_interets i join vrais v on v.id = i.demandeur_id
    union all select 'relations', i.updated_at from annonce_interets i join vrais v on v.id = i.demandeur_id where i.statut in ('mis_en_relation', 'dematche')
    union all select 'messages', m.created_at from discussion_messages m join discussions d on d.id = m.discussion_id
      where d.a_ref not in (select ref from refs_test) and d.b_ref not in (select ref from refs_test)
  ),
  avec_photos as (select v.id from vrais v join annonce_files f on f.annonce_id = v.id and f.kind = 'photo' group by v.id having count(*) >= 2),
  series as (
    select k, jsonb_agg(n order by i) as valeurs, sum(n) filter (where i >= 23) as sept, sum(n) filter (where i between 16 and 22) as avant
    from (select x.k, j.i, count(e.t) as n from (select distinct k from ev) x cross join jours j
      left join ev e on e.k = x.k and (e.t at time zone 'Europe/Paris') >= j.jour and (e.t at time zone 'Europe/Paris') < j.jour + interval '1 day' group by x.k, j.i) c
    group by k
  )
select jsonb_build_object(
  'jours', (select jsonb_agg(to_char(jour, 'YYYY-MM-DD') order by i) from jours),
  'series', (select jsonb_object_agg(k, jsonb_build_object('valeurs', valeurs, 'sept', sept, 'avant', avant)) from series),
  'totaux', jsonb_build_object('comptes', (select count(*) from auth.users), 'profils', (select count(*) from vrais), 'fiches', (select count(*) from profils_outil where retire_at is null), 'fiches_confirmees', (select count(*) from profils_outil where retire_at is null and confirme_at is not null), 'abonnes', (select count(*) from abonnements where statut = 'actif'), 'discussions_ouvertes', (select count(*) from discussions where ferme_at is null or ferme_at > now())),
  'parcours', jsonb_build_array(
    jsonb_build_object('nom', 'Comptes créés', 'n', (select count(*) from auth.users)),
    jsonb_build_object('nom', 'Avec un profil', 'n', (select count(*) from vrais)),
    jsonb_build_object('nom', 'Avec 2 photos', 'n', (select count(*) from avec_photos)),
    jsonb_build_object('nom', 'Ont demandé un match', 'n', (select count(distinct i.demandeur_id) from annonce_interets i join vrais v on v.id = i.demandeur_id)),
    jsonb_build_object('nom', 'Mis en relation', 'n', (select count(distinct i.demandeur_id) from annonce_interets i join vrais v on v.id = i.demandeur_id where i.statut in ('mis_en_relation', 'dematche')))
  ),
  'genres', (select jsonb_build_object('femmes', count(*) filter (where genre = 'femme'), 'hommes', count(*) filter (where genre = 'homme')) from vrais),
  'pays', (select coalesce(jsonb_agg(jsonb_build_object('nom', pays, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(nullif(pays, ''), 'Non indiqué') as pays, count(*) as n from vrais group by 1 order by 2 desc limit 6) p),
  'formules', (select coalesce(jsonb_object_agg(formule, n), '{}'::jsonb) from (select formule, count(*) as n from abonnements where statut = 'actif' group by 1) f)
);
$$;
revoke all on function public.cockpit_stats() from public, anon, authenticated;
grant execute on function public.cockpit_stats() to service_role;
