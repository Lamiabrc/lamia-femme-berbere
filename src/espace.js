// Mon espace : connexion, mot de passe, soirées réservées, liens d'administration.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const when = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const say = (el, msg, err = false) => { el.textContent = msg; el.classList.toggle('is-error', err); };
let recovering = false;

async function render() {
  const { data: { session } } = await supabase.auth.getSession();
  $('[data-espace-newpass]').hidden = !recovering;
  $('[data-espace-out]').hidden = !!session || recovering;
  $('[data-espace-in]').hidden = !session || recovering;
  if (!session || recovering) return;
  const u = session.user;
  $('[data-espace-email]').textContent = u.email || '';
  $('[data-espace-nom]').textContent = u.user_metadata?.first_name || '';
  $('[data-espace-admin]').hidden = u.app_metadata?.role !== 'admin';
  const { data } = await supabase.from('event_registrations')
    .select('attendance_status, speed_dating_events(title, audience, starts_at)')
    .neq('attendance_status', 'cancelled');
  const rows = (data || []).filter((r) => r.speed_dating_events).sort((a, b) => a.speed_dating_events.starts_at.localeCompare(b.speed_dating_events.starts_at));
  $('[data-espace-soirees]').innerHTML = rows.length
    ? rows.map((r) => `<article class="espace-soiree"><p class="event-date">${esc(when(r.speed_dating_events.starts_at))}</p><h3>${esc(r.speed_dating_events.title)}</h3>${r.speed_dating_events.audience ? `<p>Salon ${esc(r.speed_dating_events.audience)}</p>` : ''}</article>`).join('')
    : '<p>Tu n’as pas encore réservé de soirée. <a class="text-link" href="/speed-dating/#events-title">Voir le Bal masqué</a></p>';
}

$('[data-espace-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-espace-status]');
  say(st, 'Un instant…');
  const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) return say(st, /Invalid login/i.test(error.message) ? 'Email ou mot de passe incorrect.' : /not confirmed/i.test(error.message) ? 'Ton adresse n’est pas encore confirmée.' : 'La connexion n’a pas fonctionné. Réessaie.', true);
  say(st, '');
  render();
});

$('[data-espace-reset]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-reset-status]');
  const { error } = await supabase.auth.resetPasswordForEmail(f.get('email'), { redirectTo: `${location.origin}/mon-espace/` });
  if (error) return say(st, /rate limit/i.test(error.message) ? 'Trop de demandes en ce moment. Réessaie dans une heure.' : 'L’envoi n’a pas fonctionné. Réessaie plus tard.', true);
  say(st, 'Si un espace existe avec cet email, un lien vient de partir. Pense à regarder tes courriers indésirables.');
});

$('[data-espace-newpass]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-newpass-status]');
  const { error } = await supabase.auth.updateUser({ password: f.get('password') });
  if (error) return say(st, 'Le mot de passe n’a pas été enregistré (8 caractères minimum).', true);
  recovering = false;
  render();
});

$('[data-espace-logout]').addEventListener('click', async () => { await supabase.auth.signOut(); render(); });

supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') recovering = true; render(); });
render();
