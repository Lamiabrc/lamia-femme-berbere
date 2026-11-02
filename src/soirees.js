// Inscription permanente aux soirées : choisir un salon, ses secteurs, puis laisser ses coordonnées.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const api = async (body) => {
  const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw Object.assign(new Error(d.error || 'erreur'), { code: d.error, bon: d.bon });
  return d;
};
const ERREURS = {
  invalid_email: 'Vérifie ton adresse email.', missing_name: 'Indique ton prénom.', missing_gender: 'Indique si tu es une femme ou un homme.',
  invalid_birth_date: 'Vérifie ta date de naissance.', missing_city: 'Indique ta ville.', missing_salon: 'Choisis un salon.',
  missing_secteur: 'Choisis au moins un secteur.', rules_required: 'Merci d’accepter le cadre de la soirée.',
  age_invalide: 'Ces soirées sont réservées aux personnes de 20 ans et plus.', rate_limited: 'Trop d’inscriptions depuis cet appareil. Réessaie dans une heure.',
};

let etat = null;
const form = $('[data-salon-form]');

function afficherOptions() {
  const salon = form.elements.salon.value, box = $('[data-salon-options]');
  const s = etat?.salons.find((x) => x.id === salon);
  if (!salon || !etat) { box.innerHTML = '<p class="salons-aide">Choisis d’abord ton salon.</p>'; return; }
  box.innerHTML = s.options.map((o) => `<label class="salons-option"><input type="checkbox" name="secteurs" value="${esc(o.id)}"><span><strong>${esc(o.nom)}</strong><small>${o.femmes} femme${o.femmes > 1 ? 's' : ''} et ${o.hommes} homme${o.hommes > 1 ? 's' : ''} inscrits · ${etat.seuil} + ${etat.seuil} pour confirmer</small></span></label>`).join('');
}

async function charger() {
  try { etat = await api({ action: 'salon_etat' }); } catch { etat = null; }
  $$('[data-salons-gratuit]').forEach((x) => { x.hidden = !etat?.prochaine_gratuite; });
  if (form) afficherOptions();
  const c = $('[data-salons-confirmes]');
  if (c) {
    c.hidden = !etat?.confirmes?.length;
    if (etat?.confirmes?.length) c.innerHTML = `<h3>Soirées confirmées</h3>${etat.confirmes.map((e) => `<p><strong>${esc(e.salon)} · ${esc(e.secteur)}</strong><br>${esc(e.quand)}${e.gratuit ? ' · gratuite' : ''}</p>`).join('')}`;
  }
}

if (form) {
  const depart = new URLSearchParams(location.search).get('salon');
  if (depart && form.querySelector(`[name=salon][value="${CSS.escape(depart)}"]`)) form.querySelector(`[name=salon][value="${CSS.escape(depart)}"]`).checked = true;
  form.addEventListener('change', (e) => { if (e.target.name === 'salon') afficherOptions(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('[data-salon-status]'), btn = form.querySelector('button[type=submit]'), f = form.elements;
    st.classList.remove('is-error'); st.textContent = ''; btn.disabled = true;
    try {
      await api({ action: 'salon_inscrire', salon: f.salon.value, secteurs: $$('[name=secteurs]:checked', form).map((x) => x.value), first_name: f.first_name.value, email: f.email.value, gender: f.gender.value, birth_date: f.birth_date.value, city: f.city.value, rules_accepted: f.rules.checked, website: f.website.value });
      form.hidden = true;
      $('[data-salon-merci]').hidden = false;
      $('[data-salon-merci]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      st.classList.add('is-error');
      if (err.code === 'salon_age') {
        const bon = form.querySelector(`[name=salon][value="${CSS.escape(err.bon || '')}"]`);
        if (bon) { bon.checked = true; afficherOptions(); st.textContent = 'D’après ta date de naissance, ta place est dans l’autre salon : on l’a sélectionné, choisis tes secteurs.'; }
        else st.textContent = ERREURS.age_invalide;
      } else st.textContent = ERREURS[err.code] || 'L’inscription n’a pas abouti. Réessaie dans un instant.';
    } finally { btn.disabled = false; }
  });
}
charger();
