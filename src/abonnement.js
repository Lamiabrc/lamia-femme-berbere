// Page Abonnement : choix mois / année, formulaire, ouverture du paiement Stripe.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let periode = 'mois', choix = null;

$$('[data-periode]').forEach((b) => b.addEventListener('click', () => {
  periode = b.dataset.periode;
  $$('[data-periode]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  $$('[data-prix-mois]').forEach((x) => { x.hidden = periode !== 'mois'; });
  $$('[data-prix-an]').forEach((x) => { x.hidden = periode !== 'an'; });
  if (choix?.formule) resume();
}));

const form = $('[data-abo-form]');
function resume() {
  const carte = $(`[data-formule="${choix.formule}"]`);
  $('[data-abo-titre]').textContent = `Formule ${carte.querySelector('h3').textContent}`;
  $('[data-abo-resume]').textContent = `${carte.querySelector(periode === 'an' ? '[data-prix-an]' : '[data-prix-mois]').textContent.replace('soit', ', soit')}. Sans engagement, résiliable à tout moment.`;
}
function ouvrir(c) {
  choix = c;
  form.hidden = false;
  $('[data-abo-qte]').hidden = !c.unite;
  if (c.formule) resume();
  else { const carte = $(`[data-unite="${c.unite}"]`).closest('.abo-carte'); $('[data-abo-titre]').textContent = carte.querySelector('h3').textContent; $('[data-abo-resume]').textContent = `${carte.querySelector('.abo-prix').textContent} l’unité.`; }
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => form.nom.focus(), 400);
}
$$('[data-choisir]').forEach((b) => b.addEventListener('click', () => ouvrir({ formule: b.dataset.choisir })));
$$('[data-unite]').forEach((b) => b.addEventListener('click', () => ouvrir({ unite: b.dataset.unite })));
$('[data-abo-annuler]').addEventListener('click', () => { form.hidden = true; choix = null; });

const ERREURS = {
  cgv_required: 'Coche la case des conditions de vente pour continuer.',
  invalid_contact: 'Vérifie ton nom et ton adresse email.',
  deja_abonne: 'Tu as déjà un abonnement en cours. Pour le changer, va dans ton espace, « Gérer mon abonnement ».',
  paiement_indisponible: 'Le paiement en ligne est momentanément indisponible. Écris à Lamia depuis les Confidences.',
};
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = $('[data-abo-statut]'), btn = form.querySelector('[type=submit]');
  st.classList.remove('is-error');
  if (!form.cgv.checked) { st.textContent = ERREURS.cgv_required; st.classList.add('is-error'); form.cgv.focus(); return; }
  btn.disabled = true; st.textContent = 'Ouverture du paiement sécurisé…';
  try {
    const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'abonnement_payer', cgv_accepted: true, nom: form.nom.value, email: form.email.value, periode, quantite: form.quantite.value, ...choix }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { location.href = d.url; return; }
    throw new Error(ERREURS[d.error] || 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.');
  } catch (err) { st.textContent = err.message; st.classList.add('is-error'); btn.disabled = false; }
});

// Venue d'une carte « Choisir … » ailleurs sur le site : le formulaire de cette formule s'ouvre.
const voulue = new URLSearchParams(location.search).get('formule');
if (voulue && document.querySelector(`[data-choisir="${CSS.escape(voulue)}"]`)) ouvrir({ formule: voulue });

if (new URLSearchParams(location.search).get('paiement') === 'annule') {
  const a = $('[data-abo-alerte]'); a.textContent = 'Le paiement a été annulé : rien n’a été débité. Tu peux choisir à nouveau quand tu veux.'; a.hidden = false;
}
