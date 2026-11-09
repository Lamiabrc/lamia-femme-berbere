-- LFB · Lamia Femme Berbère
-- © 2026 Lamia Bréchet Ighil. Tous droits réservés.
-- Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
-- Rappels des soirées : toutes les 5 minutes (Vercel ne lance sa tâche qu'une fois par jour).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'salons-rappels';
select cron.schedule('salons-rappels', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://lamia-femme-berbere.com/api/confidences/',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('action', 'salon_cron', 'jeton', (select value->>'jeton' from public.platform_settings where key = 'salons_cron'))
  );
$$);
