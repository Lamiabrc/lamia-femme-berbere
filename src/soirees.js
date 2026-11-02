// Inscription permanente aux soirées : choisir un salon, ses secteurs, puis laisser ses coordonnées.
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
let jeton = null;
const api = async (body) => {
  const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw Object.assign(new Error(d.error || 'erreur'), { code: d.error, bon: d.bon });
  return d;
};
const ERREURS = {
  missing_salon: 'Choisis un salon.', missing_secteur: 'Choisis au moins un secteur.', rules_required: 'Merci d’accepter le cadre de la soirée.',
  age_invalide: 'Ces soirées sont réservées aux personnes de 20 ans et plus.', profil_requis: 'Il te faut d’abord un profil validé pour t’inscrire.', login_required: 'Connecte-toi pour t’inscrire.',
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

// L'option « autre tranche d'âge » : un choix dans son salon, automatique si on choisit l'autre salon.
let ma_tranche = null;
function afficherAutre() {
  const salon = form.elements.salon.value, bloc = $('[data-salon-autre]'), c = form.elements.accepte_autre;
  bloc.hidden = !salon || !ma_tranche;
  if (bloc.hidden) return;
  const autre = ma_tranche === '40+' ? 'moins de 40 ans' : '40 ans et plus';
  const croise = salon !== ma_tranche;
  $('[data-salon-autre-titre]').textContent = `J’accepte de rencontrer des personnes de ${autre}`;
  $('[data-salon-autre-aide]').textContent = croise ? 'Tu choisis ce salon : cette option est automatiquement activée.' : `Sans cette option, tes tête-à-tête restent avec des personnes de ${ma_tranche === '40+' ? '40 ans et plus' : 'moins de 40 ans'}.`;
  if (croise) c.checked = true;
  c.disabled = croise;
}

// L'inscription passe par le compte et le profil de la personne.
async function preparer() {
  try { const { data: { session } } = await supabase.auth.getSession(); jeton = session?.access_token || null; } catch { jeton = null; }
  const c = $('[data-salon-chargement]');
  let moi = { connecte: false };
  try { moi = await api({ action: 'salon_mon_profil' }); } catch { /* traité comme non connecté */ }
  if (c) c.hidden = true;
  if (!moi.connecte) { $('[data-salon-sans-compte]').hidden = false; return; }
  if (!moi.profil) {
    if (moi.a_verifier) { $('[data-salon-sans-profil] h2').textContent = 'Ton profil est en cours de validation'; $('[data-salon-sans-profil-texte]').textContent = 'Dès qu’il est validé, tu pourras revenir ici choisir ton salon.'; $('[data-salon-sans-profil] .btn-gold').hidden = true; }
    if (moi.brouillon) $('[data-salon-sans-profil-texte]').textContent = 'Ton profil n’est pas terminé. Termine-le, puis reviens ici choisir ton salon.';
    $('[data-salon-sans-profil]').hidden = false;
    return;
  }
  form.hidden = false;
  // Le salon de son âge est présélectionné ; chacun peut choisir l'autre.
  ma_tranche = moi.salon;
  form.elements.accepte_autre.checked = Boolean(moi.inscription?.accepte_autre);
  const depart = moi.inscription?.salon || new URLSearchParams(location.search).get('salon') || moi.salon;
  const choix = form.querySelector(`[name=salon][value="${CSS.escape(depart || '')}"]`) || form.querySelector(`[name=salon][value="${CSS.escape(moi.salon || '')}"]`);
  if (choix) choix.checked = true;
  afficherOptions();
  afficherAutre();
  for (const v of moi.inscription?.secteurs || []) { const x = form.querySelector(`[name=secteurs][value="${CSS.escape(v)}"]`); if (x) x.checked = true; }
}

if (form) {
  form.addEventListener('change', (e) => { if (e.target.name === 'salon') { afficherOptions(); afficherAutre(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('[data-salon-status]'), btn = form.querySelector('button[type=submit]'), f = form.elements;
    st.classList.remove('is-error'); st.textContent = ''; btn.disabled = true;
    try {
      await api({ action: 'salon_inscrire', salon: f.salon.value, secteurs: $$('[name=secteurs]:checked', form).map((x) => x.value), accepte_autre: f.accepte_autre.checked, rules_accepted: f.rules.checked });
      form.hidden = true;
      $('[data-salon-merci]').hidden = false;
      $('[data-salon-merci]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      st.classList.add('is-error');
      st.textContent = ERREURS[err.code] || 'L’inscription n’a pas abouti. Réessaie dans un instant.';
    } finally { btn.disabled = false; }
  });
}
(async () => { await charger(); if (form) await preparer(); })();
