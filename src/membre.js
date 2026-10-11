// Espace membre : compte, réservation de soirée, alerte confidentielle.
// Reprend les tables existantes (event_registrations, safety_reports, report_evidence)
// et la protection serveur (RLS) déjà en place côté Supabase.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

const SUPABASE_URL = 'https://tybwvxinigahhntfeeur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const money = (c, cur = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur }).format((c || 0) / 100);
const when = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

let session = null;

function status(el, msg, error = false) {
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', error);
}

// Messages d'erreur Supabase les plus fréquents, en clair.
function explain(error) {
  const m = error?.message || '';
  if (/Invalid login/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton adresse grâce à l’email reçu, puis connecte-toi.';
  if (/already registered/i.test(m)) return 'Un espace existe déjà avec cet email. Connecte-toi.';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (/rate limit/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return 'Une erreur est survenue. Réessaie dans un instant.';
}

async function refresh() {
  ({ data: { session } } = await supabase.auth.getSession());
  const out = $('[data-member-out]'), inn = $('[data-member-in]');
  if (out && inn) {
    out.hidden = !!session;
    inn.hidden = !session;
    if (session) $('[data-member-email]').textContent = session.user.email || '';
  }
  const report = $('[data-report]'), reportLogin = $('[data-report-login]');
  if (report && reportLogin) {
    report.hidden = !session;
    reportLogin.hidden = !!session;
  }
}
supabase.auth.onAuthStateChange(() => refresh());

// ---------------------------------------------------------------- compte

$('[data-signup]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await supabase.auth.signUp({ email: f.get('email'), password: f.get('password'), options: { emailRedirectTo: `${location.origin}/speed-dating/` } });
  if (error) return status($('[data-member-status]'), explain(error), true);
  e.target.reset();
  status($('[data-member-status]'), 'Ton espace est créé. Ouvre l’email de confirmation, puis connecte-toi.');
});

$('[data-login]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) return status($('[data-member-status]'), explain(error), true);
  e.target.reset();
  status($('[data-member-status]'), 'Bienvenue dans la Maison.');
});

$('[data-logout]')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  status($('[data-member-status]'), 'Tu es déconnectée.');
});

// ---------------------------------------------------------------- soirées

async function renderEvents() {
  const box = $('[data-events]');
  if (!box) return;
  const { data, error } = await supabase
    .from('speed_dating_events')
    .select('id,title,description,starts_at,min_age,max_age,capacity,ticket_price_cents,currency,status')
    .in('status', ['published', 'sold_out'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at');
  if (error) {
    box.innerHTML = '<p class="empty">Les soirées ne s’affichent pas pour le moment. Réessaie dans quelques minutes.</p>';
    return;
  }
  if (!data.length) {
    box.innerHTML = '<p class="empty">Aucune soirée programmée pour l’instant. Crée ton espace : les prochaines soirées seront annoncées ici et en live.</p>';
    return;
  }
  box.innerHTML = data
    .map((ev) => {
      const full = ev.status === 'sold_out';
      const ages = ev.min_age || ev.max_age ? `<span>${ev.min_age || 18} à ${ev.max_age || '…'} ans</span>` : '';
      return `<article class="event-card">
        <p class="event-date">${esc(when(ev.starts_at))}</p>
        <h3>${esc(ev.title)}</h3>
        ${ev.description ? `<p>${esc(ev.description)}</p>` : ''}
        <div class="event-meta">${ages}<span>${money(ev.ticket_price_cents, ev.currency || 'EUR')}</span><span>${ev.capacity} places</span></div>
        <button class="btn btn-ink" type="button" data-reserve="${esc(ev.id)}" ${full ? 'disabled' : ''}>${full ? 'Complet' : 'Pré-réserver ma place'}</button>
      </article>`;
    })
    .join('');
  $$('[data-reserve]', box).forEach((b) => b.addEventListener('click', () => reserve(b.dataset.reserve, b)));
}

async function reserve(eventId, button) {
  if (!session) {
    status($('[data-member-status]'), 'Connecte-toi ou crée ton espace pour réserver ta place.', true);
    $('#member-title')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  button.disabled = true;
  const { error } = await supabase
    .from('event_registrations')
    .upsert({ event_id: eventId, user_id: session.user.id, payment_status: 'pending', attendance_status: 'registered' }, { onConflict: 'event_id,user_id' });
  if (error) {
    button.disabled = false;
    return status($('[data-member-status]'), 'La pré-réservation n’a pas abouti. Réessaie dans un instant.', true);
  }
  button.textContent = 'Place pré-réservée';
  status($('[data-member-status]'), 'Ta place est pré-réservée. Le paiement en ligne sera ouvert prochainement pour la confirmer.');
}

// ---------------------------------------------------------------- alerte confidentielle

let recorder = null, chunks = [], audio = null;

$('[data-audio-start]')?.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      $('[data-audio-state]').textContent = 'Audio prêt à être envoyé.';
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    $('[data-audio-state]').textContent = 'Enregistrement en cours…';
    $('[data-audio-stop]').disabled = false;
  } catch {
    $('[data-audio-state]').textContent = 'Le micro n’est pas accessible. Autorise-le dans ton navigateur, ou écris ton message.';
  }
});
$('[data-audio-stop]')?.addEventListener('click', (e) => {
  if (recorder?.state === 'recording') recorder.stop();
  e.target.disabled = true;
});

$('[data-report]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!session) return;
  const f = new FormData(e.target);
  const reason = f.get('reason');
  const severity = reason === 'danger' ? 'red' : reason === 'not_marriage' ? 'yellow' : 'orange';
  const submit = e.target.querySelector('[type=submit]');
  submit.disabled = true;
  const { data: report, error } = await supabase
    .from('safety_reports')
    .insert({ reporter_user_id: session.user.id, reported_label: f.get('reported_label'), reason, severity, written_details: f.get('written_details'), wants_follow_up: true })
    .select('id')
    .single();
  if (error) {
    submit.disabled = false;
    return status($('[data-report-status]'), 'L’alerte n’est pas partie. Réessaie dans un instant.', true);
  }
  if (audio) {
    const ext = audio.type.includes('mp4') ? 'm4a' : 'webm';
    const path = `${session.user.id}/${report.id}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from('safety-evidence').upload(path, audio, { contentType: audio.type });
    if (!up.error) await supabase.from('report_evidence').insert({ report_id: report.id, uploader_user_id: session.user.id, evidence_type: 'audio', storage_path: path });
  }
  e.target.reset();
  audio = null;
  $('[data-audio-state]').textContent = '';
  submit.disabled = false;
  status($('[data-report-status]'), 'Ton alerte est bien arrivée. Lamia la lira en toute confidentialité.');
});

await refresh();
await renderEvents();
