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
supabase.auth.onAuthStateChange(() => refresh().then(renderWishes));

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
        ${full ? '' : `<label class="check"><input type="checkbox" data-cgv="${esc(ev.id)}"><span>J’accepte les <a href="/cgv/" target="_blank" rel="noopener">conditions de vente</a>. La soirée ayant lieu à une date fixée, elle n’ouvre pas de droit de rétractation.</span></label>`}
        <button class="btn btn-ink" type="button" data-reserve="${esc(ev.id)}" ${full ? 'disabled' : ''}>${full ? 'Complet' : 'Réserver ma place'}</button>
      </article>`;
    })
    .join('');
  $$('[data-reserve]', box).forEach((b) => b.addEventListener('click', () => reserve(b.dataset.reserve, b)));
}

async function reserve(eventId, button) {
  const st = $('[data-member-status]');
  if (!session) {
    status(st, 'Connecte-toi ou crée ton espace pour réserver ta place.', true);
    $('#member-title')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const cgv = document.querySelector(`[data-cgv="${CSS.escape(eventId)}"]`);
  if (cgv && !cgv.checked) {
    status(st, 'Coche la case des conditions de vente pour continuer.', true);
    cgv.focus();
    return;
  }
  button.disabled = true;
  button.textContent = 'Un instant…';
  let res, data = {};
  try {
    res = await fetch('/api/event-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ event_id: eventId, cgv_accepted: true }),
    });
    data = await res.json().catch(() => ({}));
  } catch { /* réseau */ }
  if (res?.ok && data.url) { location.href = data.url; return; }

  // Paiement pas encore ouvert : on garde la pré-réservation.
  if (data.error === 'checkout_disabled' || data.error === 'not_configured' || res?.status === 404) {
    const { error } = await supabase
      .from('event_registrations')
      .upsert({ event_id: eventId, user_id: session.user.id, payment_status: 'pending', attendance_status: 'registered' }, { onConflict: 'event_id,user_id' });
    button.disabled = !error;
    button.textContent = error ? 'Réserver ma place' : 'Place pré-réservée';
    return status(st, error ? 'La pré-réservation n’a pas abouti. Réessaie dans un instant.' : 'Ta place est pré-réservée. Le paiement en ligne ouvre très bientôt pour la confirmer.', !!error);
  }
  const messages = {
    email_not_confirmed: 'Confirme d’abord ton adresse email grâce au lien reçu, puis réessaie.',
    event_full: 'Cette soirée est complète.',
    event_past: 'Cette soirée est passée.',
    event_unavailable: 'Cette soirée n’est plus disponible.',
    login_required: 'Ta session a expiré. Reconnecte-toi puis réessaie.',
  };
  button.disabled = false;
  button.textContent = 'Réserver ma place';
  status(st, messages[data.error] || 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.', true);
}

// ---------------------------------------------------------------- après le paiement

async function renderThanks() {
  const box = $('[data-merci]');
  if (!box) return;
  const id = new URLSearchParams(location.search).get('session_id');
  const title = $('h1', box), text = $('[data-merci-text]', box);
  if (!id) return;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`/api/event-fulfill?session_id=${encodeURIComponent(id)}`).then((x) => x.json()).catch(() => ({}));
    if (r.status === 'paid') {
      title.textContent = 'Ta place est confirmée.';
      text.textContent = 'Merci. Tu recevras le lien de la salle vidéo par email avant la soirée. Garde un œil sur ta boîte de réception, et sur tes courriers indésirables.';
      return;
    }
    if (r.status !== 'unpaid') break;
    await new Promise((ok) => setTimeout(ok, 2500));
  }
  title.textContent = 'Paiement en cours de vérification.';
  text.textContent = 'Ton paiement n’est pas encore confirmé de notre côté. Si tu as été débitée, ta place sera confirmée sous peu. En cas de doute, écris à Lamia.';
}

// ---------------------------------------------------------------- souhaits après la soirée

async function renderWishes() {
  const form = $('[data-wishes]');
  if (!form) return;
  const login = $('[data-wishes-login]');
  form.hidden = !session;
  if (login) login.hidden = !!session;
  const select = form.elements.event_id;
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data } = await supabase.from('speed_dating_events').select('id,title,starts_at').gte('starts_at', since).lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false });
  const wanted = new URLSearchParams(location.search).get('soiree');
  select.innerHTML = (data || []).map((e) => `<option value="${esc(e.id)}" ${e.id === wanted ? 'selected' : ''}>${esc(e.title)} · ${esc(when(e.starts_at))}</option>`).join('') || '<option value="">Aucune soirée récente</option>';
}

$('[data-wishes]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!session) return;
  const f = new FormData(e.target);
  if (!f.get('event_id')) return status($('[data-wishes-status]'), 'Choisis la soirée concernée.', true);
  const { error } = await supabase.from('speed_dating_wishes').insert({ event_id: f.get('event_id'), user_id: session.user.id, wished: f.get('wished'), message: f.get('message') || null });
  if (error) return status($('[data-wishes-status]'), 'Tes souhaits ne sont pas partis. Réessaie dans un instant.', true);
  e.target.reset();
  status($('[data-wishes-status]'), 'C’est noté. Si le souhait est réciproque, Lamia vous mettra en relation.');
});

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
await Promise.all([renderEvents(), renderThanks(), renderWishes()]);
