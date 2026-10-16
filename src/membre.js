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

// Les inscriptions et les alertes sont rattachées à un profil membre : on le crée au besoin.
let profileEnsured = null;
async function ensureProfile() {
  if (!session || profileEnsured === session.user.id) return;
  const { error } = await supabase.from('member_profiles').upsert({ user_id: session.user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (!error) profileEnsured = session.user.id;
}

async function refresh() {
  ({ data: { session } } = await supabase.auth.getSession());
  await ensureProfile();
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
    .select('id,title,description,audience,starts_at,min_age,max_age,capacity,ticket_price_cents,currency,status')
    .in('status', ['published', 'sold_out'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at');
  if (error) {
    box.innerHTML = '<p class="empty">Les soirées ne s’affichent pas pour le moment. Réessaie dans quelques minutes.</p>';
    return;
  }
  if (!data.length) {
    box.innerHTML = '<p class="empty">Aucune soirée programmée pour l’instant. Les prochaines soirées seront annoncées ici et en live.</p>';
    return;
  }
  // Une soirée = un titre et une date ; chacune peut avoir plusieurs salons dédiés.
  const soirees = [];
  for (const ev of data) {
    const key = `${ev.title}|${ev.starts_at}`;
    let s = soirees.find((x) => x.key === key);
    if (!s) soirees.push((s = { key, title: ev.title, starts_at: ev.starts_at, description: ev.description, free: !(ev.ticket_price_cents > 0), salons: [] }));
    s.salons.push(ev);
  }
  box.innerHTML = soirees.map((s) => (s.free ? freeSoiree(s) : s.salons.map(paidCard).join(''))).join('');
  $$('[data-free-form]', box).forEach((f) => f.addEventListener('submit', freeRegister));
  const prices = Object.fromEntries(data.map((ev) => [ev.id, ev.ticket_price_cents]));
  $$('[data-reserve]', box).forEach((b) => b.addEventListener('click', () => reserve(b.dataset.reserve, b, prices[b.dataset.reserve] > 0)));
}

const ages = (ev) => (ev.min_age || ev.max_age ? `${ev.min_age || 18} à ${ev.max_age || 99} ans` : 'Tous âges (18 ans et plus)');

function paidCard(ev) {
  const full = ev.status === 'sold_out';
  return `<article class="event-card">
    <p class="event-date">${esc(when(ev.starts_at))}</p>
    <h3>${esc(ev.title)}</h3>
    ${ev.audience ? `<p class="salon-name">Salon ${esc(ev.audience)}</p>` : ''}
    ${ev.description ? `<p>${esc(ev.description)}</p>` : ''}
    <div class="event-meta"><span>${esc(ages(ev))}</span><span>${money(ev.ticket_price_cents, ev.currency || 'EUR')}</span><span>${ev.capacity} places</span></div>
    ${full ? '' : `<label class="check"><input type="checkbox" data-cgv="${esc(ev.id)}"><span>J’accepte les <a href="/cgv/" target="_blank" rel="noopener">conditions de vente</a>. La place n’est pas remboursable.</span></label>`}
    <button class="btn btn-ink" type="button" ${full ? 'disabled' : `data-reserve="${esc(ev.id)}"`}>${full ? 'Complet' : 'Réserver ma place'}</button>
  </article>`;
}

// Soirée gratuite : on choisit son salon, puis on s'inscrit en une minute, sans mot de passe.
function freeSoiree(s) {
  const open = s.salons.filter((ev) => ev.status !== 'sold_out');
  const maxBirth = new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10);
  // Les salons sont rangés par zone (« France · 25-39 ans ») : on choisit sa zone, l'âge choisit la tranche.
  const zoneOf = (ev) => (ev.audience || 'Salon unique').split(' · ')[0];
  const ORDER = ['France', 'Algérie', 'Canada', 'Autres pays'];
  const rank = (z) => (ORDER.includes(z) ? ORDER.indexOf(z) : /tous/i.test(z) ? 99 : 50);
  const zones = [...new Set(s.salons.map(zoneOf))].sort((a, b) => rank(a) - rank(b));
  SALONS[s.key] = s.salons.map((ev) => ({ id: ev.id, zone: zoneOf(ev), min: ev.min_age, max: ev.max_age, full: ev.status === 'sold_out', label: ev.audience }));
  const salons = zones.map((z, i) => {
    const list = s.salons.filter((ev) => zoneOf(ev) === z);
    const tranches = list.map((ev) => (ev.audience || '').split(' · ')[1]).filter(Boolean).map((t) => t.replace(' ans', '').replace('plus de 50', '50+')).join(' · ');
    const allFull = list.every((ev) => ev.status === 'sold_out');
    return `<label class="salon-choice${allFull ? ' is-full' : ''}${/tous/i.test(z) ? ' is-tous' : ''}">
      <input type="radio" name="zone" value="${esc(z)}" ${allFull ? 'disabled' : ''} ${zones.length === 1 && i === 0 ? 'checked' : ''} required>
      <span><strong>${esc(z === 'Salon unique' ? z : /tous/i.test(z) ? 'Salon Tous âges' : `Salon ${z}`)}</strong><small>${esc(/tous/i.test(z) ? 'Toutes zones, tous âges : pour celles et ceux pour qui l’âge n’est pas important' : tranches ? `${tranches} ans` : ages(list[0]))}${allFull ? ' · complet' : ''}</small></span>
    </label>`;
  }).join('');
  const many = zones.length > 1;
  const venise = /venise/i.test(s.title);
  return `<article class="event-card soiree-card${venise ? ' is-venise' : ''}">
    ${venise ? `<figure class="venise-card-visual">
      <img src="/images/lamia/lamia-salon-1122.webp" alt="Bal masqué de Venise — soirée speed dating Halloween" loading="lazy">
      <figcaption><span>Thème de la soirée</span><strong>Carnaval de Venise</strong><em>Masque, loup ou tenue élégante : le mystère fait partie du jeu.</em></figcaption>
    </figure>` : ''}
    <p class="event-date">${esc(when(s.starts_at))}</p>
    <h3>${esc(s.title)}</h3>
    ${s.description ? `<p>${esc(s.description)}</p>` : ''}
    <div class="event-meta"><span>Gratuit</span><span>En visio</span>${many ? `<span>${zones.length} salons</span>` : ''}<span>20 personnes par salon</span></div>
    ${open.length ? `<form class="free-form" data-free-form data-soiree="${esc(s.key)}" data-starts="${esc(s.starts_at)}" novalidate>
      <fieldset class="salons"><legend>${many ? '1. Choisissez votre salon' : 'Votre salon'}</legend><p class="salon-hint">Votre tranche d’âge est choisie automatiquement d’après votre date de naissance.</p><div class="salon-grid">${salons}</div></fieldset>
      <fieldset class="about"><legend>${many ? '2. Présentez-vous' : 'Présentez-vous'}</legend>
      <div class="free-grid">
        <label>Prénom<input name="first_name" autocomplete="given-name" required maxlength="60"></label>
        <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <label>Je suis<select name="gender" required><option value="">Choisir</option><option value="femme">une femme</option><option value="homme">un homme</option></select></label>
        <label>Date de naissance<input name="birth_date" type="date" required max="${maxBirth}"></label>
        <label>Ma ville<input name="city" autocomplete="address-level2" required maxlength="80" placeholder="ex. Lyon, Tizi Ouzou, Montréal"></label>
        <label>Je cherche quelqu’un<select name="search_zone" required><option value="">Choisir</option><option value="ville">dans ma ville et alentours</option><option value="region">dans ma région</option><option value="france">dans toute la France</option><option value="europe">en France ou en Europe</option><option value="canada">au Canada</option><option value="algerie">en Algérie</option><option value="monde">peu importe où</option></select></label>
      </div></fieldset>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="check"><input type="checkbox" name="rules"><span>J’accepte les <a href="/cgv/" target="_blank" rel="noopener">règles de la soirée</a> : respect, sérieux, aucun propos déplacé. J’ai 18 ans ou plus.</span></label>
      <button class="btn btn-ink" type="submit">Je réserve ma place</button>
      <p class="form-status" role="status" data-free-status></p>
    </form>` : '<button class="btn btn-ink" type="button" disabled>Complet</button>'}
  </article>`;
}

const FREE_ERRORS = {
  bad_request: 'Choisis ton salon.',
  invalid_email: 'Vérifie ton adresse email.',
  missing_name: 'Indique ton prénom.',
  missing_gender: 'Indique si tu es une femme ou un homme.',
  missing_city: 'Indique ta ville.',
  missing_zone: 'Indique où tu cherches quelqu’un.',
  invalid_birth_date: 'Vérifie ta date de naissance.',
  rules_required: 'Coche la case des règles de la soirée pour continuer.',
  too_young: 'Les soirées sont réservées aux personnes majeures.',
  age_out_of_range: 'Ce salon est réservé à une autre tranche d’âge : choisis le salon qui correspond à ton âge.',
  event_full: 'Ce salon est complet : choisis-en un autre.',
  event_past: 'Cette soirée est passée.',
  event_unavailable: 'Ce salon n’est plus disponible.',
};

const SALONS = {};
const ageAt = (birth, at) => {
  const b = new Date(`${birth}T12:00:00Z`), d = new Date(at);
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a;
};

async function freeRegister(e) {
  e.preventDefault();
  const form = e.target, st = $('[data-free-status]', form), btn = $('[type=submit]', form);
  const f = new FormData(form);
  if (!f.get('zone')) return status(st, FREE_ERRORS.bad_request, true);
  if (!f.get('first_name') || !f.get('email') || !f.get('gender') || !f.get('birth_date') || !f.get('city') || !f.get('search_zone')) return status(st, 'Remplis tous les champs pour réserver ta place.', true);
  if (!f.get('rules')) return status(st, FREE_ERRORS.rules_required, true);
  const age = ageAt(f.get('birth_date'), form.dataset.starts);
  if (!(age >= 18)) return status(st, FREE_ERRORS.too_young, true);
  const salon = (SALONS[form.dataset.soiree] || []).find((x) => x.zone === f.get('zone') && (!x.min || age >= x.min) && (!x.max || age <= x.max));
  if (!salon) return status(st, 'Aucun salon de cette zone ne correspond à ton âge. Choisis le salon Tous âges, ouvert à tout le monde.', true);
  if (salon.full) return status(st, `Le salon ${salon.label} est complet.`, true);
  btn.disabled = true;
  btn.textContent = 'Un instant…';
  let res, data = {};
  try {
    res = await fetch('/api/event-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: salon.id, first_name: f.get('first_name'), email: f.get('email'), gender: f.get('gender'), birth_date: f.get('birth_date'), city: f.get('city'), search_zone: f.get('search_zone'), source: (() => { try { return sessionStorage.getItem('lfb-source') || ''; } catch { return ''; } })(), website: f.get('website'), rules_accepted: true }),
    });
    data = await res.json().catch(() => ({}));
  } catch { /* réseau */ }
  if (res?.ok && data.status === 'registered') {
    form.innerHTML = `<div class="free-done"><strong>Ta place est réservée, ${esc(f.get('first_name'))}${data.salon ? ` : salon ${esc(data.salon)}` : ''}.</strong><p>Lamia t’enverra le lien de la salle vidéo à <b>${esc(f.get('email'))}</b> avant la soirée. Pense à regarder tes courriers indésirables, et prépare ton masque !</p></div>`;
    return;
  }
  btn.disabled = false;
  btn.textContent = 'Réserver ma place';
  status(st, FREE_ERRORS[data.error] || 'L’inscription n’a pas abouti. Réessaie dans un instant, ou écris à Lamia sur Facebook.', true);
}

async function reserve(eventId, button, paying = true) {
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
  if (!paying) {
    const { error } = await supabase
      .from('event_registrations')
      .upsert({ event_id: eventId, user_id: session.user.id, payment_status: 'pending', attendance_status: 'registered' }, { onConflict: 'event_id,user_id', ignoreDuplicates: true });
    button.disabled = !error;
    button.textContent = error ? 'Réserver ma place' : 'Place réservée';
    return status(st, error ? 'La réservation n’a pas abouti. Réessaie dans un instant.' : 'Ta place est réservée. Tu recevras le lien de la salle par email avant la soirée.', !!error);
  }
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
      .upsert({ event_id: eventId, user_id: session.user.id, payment_status: 'pending', attendance_status: 'registered' }, { onConflict: 'event_id,user_id', ignoreDuplicates: true });
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
