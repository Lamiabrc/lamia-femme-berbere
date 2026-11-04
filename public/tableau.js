// Tableau de bord de Lamia : ventes, produits, soirées, alertes, textes du site, visites.
import { FAMILLES } from '/assets/rubriques.mjs';
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const money = (c, cur = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur || 'EUR' }).format((c || 0) / 100);
const date = (iso, opts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...opts }) : '');
const STATUTS = { pending: 'En attente de paiement', paid: 'Payée, à expédier', fulfilled: 'Expédiée', cancelled: 'Annulée', refunded: 'Remboursée' };
const ALERTES = { new: 'Nouvelle', reviewing: 'En cours', needs_info: 'Besoin d’infos', watch: 'Sous surveillance', suspended: 'Suspendu', resolved: 'Résolue', dismissed: 'Classée' };
const GRAVITE = { red: 'Danger', orange: 'Inquiétant', yellow: 'À surveiller' };

let comptes = null;
let token = null, data = null, produits = [], categories = [], edition = null, aller = '';

function message(t, err = false) { const m = $('[data-message]'); m.textContent = t; m.classList.toggle('is-error', err); if (t && !err) setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 4000); }

async function api(body, method = 'POST') {
  const r = await fetch(method === 'GET' ? `/api/admin?action=${body.action}` : '/api/admin', {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = { forbidden: 'Ce compte n’a pas le rôle administratrice.', slug_taken: 'Un autre produit porte déjà ce nom d’adresse.', bad_price: 'Vérifie le prix.', missing_name: 'Indique un nom.', too_big: 'Photo trop lourde.', bad_type: 'Format de photo non accepté (JPG, PNG ou WEBP).', publish_not_configured: 'La publication n’est pas encore branchée (voir les explications).' }[d.error];
    throw new Error(msg || 'Une erreur est survenue. Réessaie dans un instant.');
  }
  return d;
}

// ---------------------------------------------------------------- navigation
function ouvrir(tab) {
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  { const plus = $('[data-menu-plus]'); if (plus && plus.querySelector(`[data-tab="${tab}"]`)) plus.open = true; }
  try { history.replaceState(null, '', `#${tab}`); } catch { /* */ }
  if (tab === 'produits' && !produits.length) { chargerProduits(); chargerReglages(); }
  if (tab === 'textes') chargerTextes();
  if (tab === 'bilan') chargerBilan();
  if (tab === 'application') { chargerJournal(); chargerRecommandes(); chargerModerateurs(); chargerBeta(); }
  if (tab === 'soirees') chargerSalons();
  if (tab === 'activite') chargerActivite();
  if (tab === 'coaching') chargerCoaching();
  if (tab === 'comptes' && !comptes) chargerComptes();
  if (tab === 'rencontres') { const f = $('[data-rencontres]'); if (f && !f.src) f.src = `/confidences-lamia/?integre=1#${aller || 'annonces'}`; aller = ''; }
  scrollTo({ top: 0 });
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-go]');
  if (!t) return;
  e.preventDefault();
  ouvrir(t.dataset.tab || t.dataset.go);
  if (t.hasAttribute('data-nouveau-produit')) setTimeout(() => editer(null), 50);
});

// ---------------------------------------------------------------- vue d'ensemble
async function charger() {
  try { data = await api({ action: 'dashboard' }); } catch (e) { return message(e.message, true); }
  const v = data.ventes, i = data.inscrits, a = data.alertes, vis = data.visites;
  $('[data-k="ventes-total"]').textContent = money(v.total_cents);
  $('[data-k="ventes-detail"]').textContent = `${v.nombre} commande${v.nombre > 1 ? 's' : ''} · ${v.en_attente} en attente · ${v.payees} à expédier`;
  $('[data-k="inscrits"]').textContent = i.total;
  $('[data-k="inscrits-detail"]').textContent = `+${i.nouveaux_7j} cette semaine`;
  $('[data-k="alertes"]').textContent = a.nouvelles;
  $('[data-k="visiteurs"]').textContent = vis ? vis.aujourdhui.visiteurs : '—';
  $('[data-k="visiteurs-detail"]').textContent = vis ? `${vis.periode?.visiteurs ?? 0} sur 30 jours · ${(vis.pays || []).length} pays` : 'Compteur en route';
  barres($('[data-barres-accueil]'), vis?.jours || []);
  $('[data-dernieres]').innerHTML = v.orders.slice(0, 5).map((o) => `<p class="ligne"><span>n° ${esc(o.order_number)} · ${esc(o.customer_name || o.customer_email || '')}<br><small>${esc((o.order_items || []).map((x) => x.product_name).join(', '))}</small></span><strong>${money(o.amount_total_cents, o.currency)}</strong></p>`).join('') || '<p>Pas encore de commande.</p>';
  ventes(); soirees(); alertes(); visites();
}

// ---------------------------------------------------------------- chiffres clés et graphiques de l'accueil
const nb = (n) => Number(n || 0).toLocaleString('fr-FR');
const jourFr = (d, opts = { day: 'numeric', month: 'short' }) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', opts);
function evolution(s) {
  const d = Number(s?.sept || 0) - Number(s?.avant || 0);
  return `${d > 0 ? '+' : ''}${nb(d)} par rapport à la semaine d’avant`;
}
let bulle;
function montrerBulle(e, texte) {
  if (!bulle) { bulle = document.createElement('div'); bulle.className = 'graphe-bulle'; document.body.appendChild(bulle); }
  bulle.textContent = texte; bulle.hidden = false;
  const r = (e.currentTarget || e.target).getBoundingClientRect();
  bulle.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - bulle.offsetWidth / 2), innerWidth - bulle.offsetWidth - 8)}px`;
  bulle.style.top = `${Math.max(8, r.top - bulle.offsetHeight - 6)}px`;
}
function graphe(titre, serie, jours) {
  const v = (serie?.valeurs || []).map(Number), max = Math.max(1, ...v), total = v.reduce((a, b) => a + b, 0);
  return `<div class="tdb-carte graphe"><h2>${esc(titre)}</h2><p class="graphe-total">${nb(total)} sur 30 jours · ${nb(serie?.sept)} ces 7 derniers jours</p>
    <div class="graphe-barres" role="img" aria-label="${esc(titre)} : ${nb(total)} sur 30 jours">${v.map((n, i) => `<button type="button" class="graphe-col" tabindex="-1" data-bulle="${esc(jourFr(jours[i]))} : ${nb(n)}"><i style="height:${n ? Math.max(2, (n / max) * 100) : 0}%"></i></button>`).join('')}</div>
    <div class="graphe-axe"><span>${esc(jourFr(jours[0]))}</span><span>max ${nb(Math.max(...v, 0))}</span><span>${esc(jourFr(jours[jours.length - 1]))}</span></div>
    <details><summary>Voir les chiffres</summary><table><tbody>${v.map((n, i) => [n, i]).reverse().slice(0, 14).map(([n, i]) => `<tr><td>${esc(jourFr(jours[i], { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td style="text-align:right">${nb(n)}</td></tr>`).join('')}</tbody></table></details></div>`;
}
const hbarres = (lignes, avecPart = false) => {
  const max = Math.max(1, ...lignes.map((l) => Number(l.n))), base = Number(lignes[0]?.n) || 1;
  return `<div class="hbarres">${lignes.map((l) => `<div><div class="hbarre-tete"><span>${esc(l.nom)}</span><b>${nb(l.n)}${avecPart ? ` · ${Math.round((Number(l.n) / base) * 100)} %` : ''}</b></div><div class="hbarre-fond"><i style="width:${(Number(l.n) / max) * 100}%"></i></div></div>`).join('')}</div>`;
};
async function chargerCockpit() {
  const box = $('[data-tuiles]');
  if (!box) return;
  try {
    const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'annonce_cockpit_stats' }) });
    if (!r.ok) throw new Error('lecture');
    const { stats: s } = await r.json();
    const tuile = (nom, n, detail) => `<div class="tuile"><span>${esc(nom)}</span><strong>${nb(n)}</strong><small>${esc(detail)}</small></div>`;
    box.innerHTML = [
      tuile('Comptes', s.totaux.comptes, `+${nb(s.series.comptes?.sept)} en 7 jours`),
      tuile('Profils sur le site', s.totaux.profils, `${nb(s.totaux.fiches_confirmees)} fiches du live confirmées sur ${nb(s.totaux.fiches)}`),
      tuile('Swipes en 7 jours', s.series.swipes?.sept, evolution(s.series.swipes)),
      tuile('Matchs demandés en 7 jours', s.series.demandes?.sept, evolution(s.series.demandes)),
      tuile('Mises en relation en 7 jours', s.series.relations?.sept, evolution(s.series.relations)),
      tuile('Messages en 7 jours', s.series.messages?.sept, `${nb(s.totaux.discussions_ouvertes)} discussion(s) ouverte(s)`),
      tuile('Abonnés actifs', s.totaux.abonnes, Object.entries(s.formules || {}).map(([f, n]) => `${f} : ${n}`).join(' · ') || 'Aucun pour l’instant'),
    ].join('');
    $('[data-graphes]').innerHTML = graphe('Swipes par jour', s.series.swipes, s.jours) + graphe('Matchs demandés par jour', s.series.demandes, s.jours) + graphe('Nouveaux comptes par jour', s.series.comptes, s.jours);
    $('[data-parcours]').innerHTML = hbarres(s.parcours, true);
    const f = Number(s.genres.femmes), h = Number(s.genres.hommes), t = Math.max(1, f + h);
    $('[data-genres]').innerHTML = `<div class="repartition" role="img" aria-label="${f} femmes, ${h} hommes"><i style="width:${(f / t) * 100}%;background:#D2482C"></i><i style="width:${(h / t) * 100}%;background:#4A55C4"></i></div><div class="repartition-legende"><span style="--c:#D2482C">Femmes : ${nb(f)} (${Math.round((f / t) * 100)} %)</span><span style="--c:#4A55C4">Hommes : ${nb(h)} (${Math.round((h / t) * 100)} %)</span></div>`;
    $('[data-pays]').innerHTML = hbarres(s.pays);
  } catch { $('[data-graphes]').innerHTML = '<p class="aide">Les graphiques ne sont pas disponibles pour le moment. Réessaie dans un instant.</p>'; }
}
document.addEventListener('pointerover', (e) => { const c = e.target.closest?.('[data-bulle]'); if (c) { montrerBulle({ currentTarget: c }, c.dataset.bulle); } else if (bulle) bulle.hidden = true; });
document.addEventListener('click', (e) => { const c = e.target.closest?.('[data-bulle]'); if (c) montrerBulle({ currentTarget: c }, c.dataset.bulle); });
// Les rubriques repliables restent comme Lamia les a laissées.
$$('details[data-repli],details[data-menu-plus]').forEach((d) => {
  const cle = `tdb-repli-${d.dataset.repli || 'menu'}`;
  try { if (localStorage.getItem(cle) === 'ouvert') d.open = true; } catch { /* */ }
  d.addEventListener('toggle', () => { try { localStorage.setItem(cle, d.open ? 'ouvert' : 'ferme'); } catch { /* */ } });
});

// ---------------------------------------------------------------- « À faire aujourd'hui » : tout ce qui attend Lamia, dans l'ordre
async function aFaire() {
  const box = $('[data-afaire]');
  if (!box) return;
  try {
    const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'annonce_a_faire' }) });
    const { a_faire: f } = await r.json();
    const heure = (d) => new Date(d).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
    const lignes = [
      ...f.soirees.map((s) => [`🎭 <b>${esc(s.titre)}</b>, ${esc(heure(s.debut))} · ${esc(s.salon)} : <b>${s.inscrits} inscrit(s)</b>, ${Math.max(0, s.places - s.inscrits)} place(s) libre(s). À 20 h 45, ouvre le bal.`, '<a class="btn btn-ink" href="/admin-bal.html">Poste du bal</a>']),
      f.a_verifier.length && [`⏳ <b>${f.a_verifier.length} profil(s) incomplet(s)</b>, pas validé(s) automatiquement : ${f.a_verifier.map((r) => `n° ${r}${f.manques?.[r]?.length ? ` (manque : ${f.manques[r].join(', ')})` : ''}`).join(' · ')}. Valide-les toi-même si ça te va, ou demande-leur ce qui manque.`, '<button class="btn btn-ink" type="button" data-rencontres-aller="annonces">Vérifier</button>'],
      f.reciproques && [`💞 <b>${f.reciproques} intérêt(s) réciproque(s)</b> : les deux se sont choisis. Le site les met en relation tout seul dès que les différences éventuelles sont acceptées.`, '<button class="btn btn-ink" type="button" data-rencontres-aller="demandes">Voir</button>'],
      f.demandes && [`💌 <b>${f.demandes} match(s) demandé(s)</b> par ${f.personnes} personne(s) : en attente de la réponse de l’autre personne. Rien à faire de ton côté.`, '<button class="btn btn-line" type="button" data-rencontres-aller="demandes">Voir</button>'],
      f.propositions_oui && [`✅ <b>${f.propositions_oui} proposition(s) acceptée(s)</b> : la personne est intéressée par le profil que tu lui as proposé.`, '<button class="btn btn-line" type="button" data-rencontres-aller="demandes">Voir</button>'],
      (f.fiches_a_modifier || f.fiches_a_effacer) && [`✏️ <b>${f.fiches_a_modifier} fiche(s) à corriger</b>${f.fiches_a_effacer ? ` et <b>${f.fiches_a_effacer} à effacer</b>` : ''} dans ton outil (demandes des personnes).`, '<span class="aide">Outil › Site › Publipostage</span>'],
      f.fiches_en_attente && [`📮 <b>${f.fiches_en_attente} fiche(s) pas encore confirmée(s)</b> (${f.fiches_confirmees} confirmée(s)) : envoie les liens de confirmation.`, '<span class="aide">Outil › Site › Publipostage › « À prévenir »</span>'],
      f.nouveautes_en_attente && [`📣 <b>${f.nouveautes_en_attente} nouveauté(s)</b> partiront au prochain envoi de 18 h en notification.`, '<button class="btn btn-line" type="button" data-rencontres-aller="nouveautes">Voir</button>'],
    ].filter(Boolean);
    box.innerHTML = lignes.length ? lignes.map(([t, b]) => `<li><span>${t}</span>${b}</li>`).join('') : '<li>Rien en attente. 🌿</li>';
  } catch { box.innerHTML = '<li>La liste ne s’affiche pas pour le moment.</li>'; }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rencontres-aller]');
  if (!b) return;
  aller = 'annonces'; const f = $('[data-rencontres]'); if (f) f.removeAttribute('src');
  ouvrir('rencontres');
  const cible = b.dataset.rencontresAller;
  if (cible !== 'annonces') setTimeout(() => { try { f.contentWindow.document.querySelector(cible === 'demandes' ? '[data-demandes]' : '[data-nouv-form]')?.scrollIntoView({ behavior: 'smooth' }); } catch { /* */ } }, 2500);
});

// ---------------------------------------------------------------- Salons des soirées : confirmer une date, suivre les inscrits
async function chargerSalons() {
  const box = $('[data-salons-admin]');
  if (!box) return;
  let d;
  try { d = await conf({ action: 'salon_admin' }); } catch { box.innerHTML = '<p>Les salons ne s’affichent pas pour le moment.</p>'; return; }
  const aValider = d.a_valider.length ? d.a_valider.map((e) => `<form class="salon-valider" data-salon-confirmer="${esc(e.id)}"><h3>${esc(e.nom)}</h3><p>${e.femmes} femmes et ${e.hommes} hommes attendent : <b>${e.retenus} + ${e.retenus}</b> seront invités.</p><label>Date et heure (heure de Paris)<input type="datetime-local" name="date" value="${esc(e.date)}" required></label><label class="salon-gratuit-case"><input type="checkbox" name="gratuit"${e.gratuit ? ' checked' : ''}> Soirée gratuite</label><button class="btn btn-ink" type="submit">Confirmer le salon</button><p class="aide" data-salon-msg></p></form>`).join('') : `<p>Aucun salon à confirmer. Une proposition arrive dès ${d.seuil} femmes et ${d.seuil} hommes dans un même secteur.</p>`;
  const conf2 = d.confirmes.map((e) => `<p class="ligne"><span><b>${esc(e.nom)}</b><br><small>${esc(e.quand)}${e.gratuit ? ' · gratuite' : ''}</small></span><span>${e.femmes} F + ${e.hommes} H<br><small>en attente de validation : ${e.attente_f} F, ${e.attente_h} H</small></span></p>${(e.a_offrir || []).map((x) => `<p class="ligne"><span>${esc(x.prenom)}, en Algérie : pas de paiement en ligne</span><button type="button" class="btn btn-line" data-salon-offrir="${esc(x.id)}">Offrir sa place</button></p>`).join('')}`).join('');
  const lignes = d.options.filter((o) => o.femmes || o.hommes).map((o) => `<tr><td>${esc(o.salon)}</td><td>${esc(o.secteur)}</td><td>${o.femmes}</td><td>${o.hommes}</td></tr>`).join('');
  box.innerHTML = `<h2>Salons à confirmer</h2>${aValider}${conf2 ? `<h2>Salons confirmés</h2>${conf2}` : ''}<h2>Inscrits en attente</h2>${lignes ? `<div class="tdb-table"><table><thead><tr><th>Salon</th><th>Secteur</th><th>Femmes</th><th>Hommes</th></tr></thead><tbody>${lignes}</tbody></table></div>` : '<p>Personne pour le moment.</p>'}<p class="aide">Lien à partager, toujours actif : <b>lamia-femme-berbere.com/speed-dating/inscription/</b></p><h2>Toutes les soirées</h2>`;
}
document.addEventListener('click', async (e) => {
  const o = e.target.closest('[data-salon-offrir]');
  if (!o) return;
  o.disabled = true;
  try { await conf({ action: 'salon_offrir', id: o.dataset.salonOffrir }); chargerSalons(); } catch { o.disabled = false; o.textContent = 'Réessayer'; }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-salon-confirmer]');
  if (!f) return;
  e.preventDefault();
  const msg = f.querySelector('[data-salon-msg]'), b = f.querySelector('button');
  b.disabled = true; msg.textContent = 'Envoi des invitations…';
  try {
    const r = await conf({ action: 'salon_confirmer', id: f.dataset.salonConfirmer, date: f.elements.date.value, gratuit: f.elements.gratuit.checked });
    msg.textContent = `Salon confirmé : ${r.convoques} personnes prévenues.`;
    chargerSalons();
  } catch (err) {
    b.disabled = false;
    msg.textContent = err.message === 'date_trop_proche' ? 'Choisis une date à au moins 3 jours : chacun a besoin de temps pour valider sa place.' : err.message === 'plus_assez' ? 'Il n’y a plus assez d’inscrits dans ce secteur.' : 'La confirmation n’a pas abouti. Réessaie.';
  }
});

// ---------------------------------------------------------------- Application : journal « qui fait quoi », retraits, notifications
let filtreJournal = '';
const conf = async (body) => { const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'erreur'); return d; };
async function pastilleJournal() {
  try { const d = await conf({ action: 'annonce_journal', categorie: 'aucune' }); const p = $('[data-journal-pastille]'); p.textContent = d.non_lus; p.hidden = !d.non_lus; } catch { /* */ }
}
// ---------------------------------------------------------------- Profils recommandés par Lamia
async function chargerRecommandes() {
  const box = $('[data-reco-liste]');
  if (!box) return;
  try {
    const { profils = [] } = await conf({ action: 'annonce_recommandes' });
    box.innerHTML = profils.length ? profils.map((p) => `<li>Profil n° ${esc(p.ref)} · ${p.genre === 'femme' ? 'une femme' : 'un homme'}${p.age ? `, ${esc(p.age)} ans` : ''}${p.ville ? ` · ${esc(p.ville)}` : ''} <button type="button" data-reco-retirer="${esc(p.ref)}">Retirer</button></li>`).join('') : '<li>Aucun profil recommandé pour l’instant.</li>';
  } catch { box.innerHTML = '<li>La liste ne s’affiche pas pour le moment.</li>'; }
}
document.addEventListener('submit', async (e) => {
  if (!e.target.matches('[data-reco-form]')) return;
  e.preventDefault();
  const st = $('[data-reco-statut]');
  try { await conf({ action: 'annonce_recommander', ref: e.target.ref.value, oui: true }); st.textContent = `⭐ Profil n° ${e.target.ref.value} recommandé.`; e.target.reset(); chargerRecommandes(); }
  catch { st.textContent = 'Ce numéro de profil est introuvable.'; }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-reco-retirer]');
  if (!b) return;
  b.disabled = true;
  try { await conf({ action: 'annonce_recommander', ref: b.dataset.recoRetirer, oui: false }); chargerRecommandes(); } catch { b.disabled = false; }
});

// ---------------------------------------------------------------- Modérateurs et bêta-testeurs
const ERR_MOD = { sans_compte: 'Ce profil n’a pas de compte : impossible de lui offrir la formule.', not_found: 'Ce numéro de profil est introuvable.' };
async function chargerModerateurs() {
  const box = $('[data-mod-liste]');
  if (!box) return;
  try {
    const { moderateurs = [] } = await conf({ action: 'annonce_moderateurs' });
    box.innerHTML = moderateurs.length ? moderateurs.map((p) => `<li>🛡️ Profil n° ${esc(p.ref)}${p.ville ? ` · ${esc(p.ville)}` : ''} · ${p.formule ? 'Passion offerte' : 'formule à vérifier'} <button type="button" data-mod-retirer="${esc(p.ref)}">Retirer</button></li>`).join('') : '<li>Aucun modérateur pour l’instant.</li>';
  } catch { box.innerHTML = '<li>La liste ne s’affiche pas pour le moment.</li>'; }
}
async function chargerBeta() {
  const box = $('[data-beta-liste]');
  if (!box) return;
  try {
    const { liste = [] } = await conf({ action: 'annonce_beta_liste' });
    const oui = liste.filter((x) => x.statut === 'accepte');
    const tf = $('[data-beta-adresses]');
    if (tf) tf.value = oui.map((x) => x.adresse_google).filter(Boolean).join(', ');
    const nb = $('[data-beta-compte]');
    if (nb) nb.textContent = `${oui.length} accepté(s) · ${liste.filter((x) => x.statut === 'invite').length} en attente · ${liste.filter((x) => x.statut === 'refuse').length} refusé(s)`;
    box.innerHTML = liste.length ? liste.map((x) => `<li>Profil n° ${esc(x.ref ?? '?')} : ${x.statut === 'accepte' ? `oui, ${esc(x.adresse_google || '')}` : x.statut === 'refuse' ? 'non' : 'en attente'}</li>`).join('') : '<li>Personne n’est invité pour l’instant.</li>';
  } catch { box.innerHTML = '<li>La liste ne s’affiche pas pour le moment.</li>'; }
}
document.addEventListener('submit', async (e) => {
  if (e.target.matches('[data-mod-form]')) {
    e.preventDefault();
    const st = $('[data-mod-statut]');
    try { await conf({ action: 'annonce_moderateur', ref: e.target.ref.value, oui: true }); st.textContent = `🛡️ Profil n° ${e.target.ref.value} modérateur, Passion offerte.`; e.target.reset(); chargerModerateurs(); }
    catch (err) { st.textContent = ERR_MOD[err.code] || ERR_MOD[err.message] || 'Ça n’a pas fonctionné.'; }
  }
  if (e.target.matches('[data-beta-form]')) {
    e.preventDefault();
    const st = $('[data-beta-statut]');
    const refs = (e.target.refs.value.match(/\d+/g) || []).map(Number);
    if (!refs.length) return;
    try { const r = await conf({ action: 'annonce_beta_inviter', refs }); st.textContent = `${r.invites.length} invité(s)${r.deja.length ? `, ${r.deja.length} déjà invité(s)` : ''}${r.sansCompte.length ? `, sans compte : ${r.sansCompte.join(', ')}` : ''}.`; e.target.reset(); chargerBeta(); }
    catch { st.textContent = 'L’envoi n’a pas fonctionné.'; }
  }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mod-retirer]');
  if (!b) return;
  b.disabled = true;
  try { await conf({ action: 'annonce_moderateur', ref: b.dataset.modRetirer, oui: false }); chargerModerateurs(); } catch { b.disabled = false; }
});

async function chargerJournal() {
  const box = $('[data-journal]');
  try {
    const d = await conf({ action: 'annonce_journal', categorie: filtreJournal });
    const cats = d.categories;
    $('[data-journal-filtres]').innerHTML = [['', 'Tout', d.non_lus], ...Object.entries(cats).map(([k, c]) => [k, `${c.emoji} ${c.nom.split(' (')[0]}`, d.non_lus_par[k] || 0])]
      .map(([k, n, nb]) => `<button type="button" class="${k === filtreJournal ? 'is-on' : ''}" data-filtre-journal="${k}">${esc(n)}${nb ? ` <b>${nb}</b>` : ''}</button>`).join('');
    const jour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
    let dernier = '';
    box.innerHTML = d.journal.map((x) => {
      const j = jour(x.created_at), sep = j !== dernier ? `<li class="tdb-jour">${esc(j)}</li>` : ''; dernier = j;
      const c = cats[x.categorie] || { emoji: '•' };
      return `${sep}<li class="tdb-evt cat-${esc(x.categorie)}${x.lu ? '' : ' is-nouveau'}"><span class="tdb-evt-ico">${c.emoji}</span><div><p><b>${esc(x.titre)}</b> <small>${esc(date(x.created_at, { hour: '2-digit', minute: '2-digit' }))}${x.notifie ? '' : ' · sans notification'}</small></p>${(x.lignes || []).map((l) => `<p>${esc(l)}</p>`).join('')}</div>${x.lien ? `<button type="button" class="btn btn-line" data-journal-ouvrir="${esc(x.lien)}">Ouvrir</button>` : ''}</li>`;
    }).join('') || '<li>Rien pour le moment.</li>';
    $('[data-retraits]').innerHTML = d.retraits.map((r) => `<li><span>${r.source === 'fiche' ? 'Fiche' : 'Profil'} n° ${r.ref} · ${r.genre === 'femme' ? 'femme' : 'homme'}${r.age ? `, ${r.age} ans` : ''}${r.lieu ? `, ${esc(r.lieu)}` : ''}<br><small>${esc(date(r.quand))} · ${r.effacement ? (r.fait ? 'effacée ✓' : '<b>veut être effacée de ton outil</b>') : 'ne veut plus apparaître sur le site (reste dans ton outil)'}</small></span>${r.effacement && !r.fait ? `<button type="button" class="btn btn-ink" data-effacement-fait="${r.ref}">C’est fait</button>` : ''}</li>`).join('') || '<li>Personne pour le moment.</li>';
    $('[data-appareils]').textContent = `Tes appareils qui reçoivent les alertes : ${d.appareils.lamia}. Membres abonnés aux notifications : ${d.appareils.membres}.`;
    $('[data-notifs-lamia]').innerHTML = Object.entries(cats).map(([k, c]) => `<label><input type="checkbox" name="${k}" ${d.notifs[k] ? 'checked' : ''}> <span>${c.emoji} ${esc(c.nom)}</span></label>`).join('') + '<p class="aide">Enregistré dès que tu coches. Les « matchs demandés » restent visibles ici et dans « Aujourd’hui ».</p>';
    chargerDiscussions();
    if (d.non_lus) { await conf({ action: 'annonce_journal_lu' }).catch(() => {}); $('[data-journal-pastille]').hidden = true; }
  } catch { box.innerHTML = '<li>Le journal ne s’affiche pas pour le moment.</li>'; }
}
document.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-filtre-journal]');
  if (f) { filtreJournal = f.dataset.filtreJournal; chargerJournal(); return; }
  const o = e.target.closest('[data-journal-ouvrir]');
  if (o) { const l = o.dataset.journalOuvrir; if (l.startsWith('/confidences-lamia/#annonces')) { aller = 'annonces'; const fr = $('[data-rencontres]'); if (fr) fr.removeAttribute('src'); ouvrir('rencontres'); } else window.open(l, '_blank', 'noopener'); return; }
  const ef = e.target.closest('[data-effacement-fait]');
  if (ef) {
    if (!confirm(`Tu as bien supprimé la fiche n° ${ef.dataset.effacementFait} de ton outil ? Son contenu sera aussi effacé du site.`)) return;
    try { await conf({ action: 'annonce_effacement_fait', ref: Number(ef.dataset.effacementFait) }); message('Effacement noté.'); chargerJournal(); } catch { message('L’effacement n’a pas pu être noté.', true); }
  }
});
const ETATS_DISC = { ouverte: '🟢 en cours', numeros: '📞 numéros échangés', terminee: 'terminée sans échange', dematch: 'dématché', signalee: '🚩 signalée' };
async function chargerDiscussions(id = null) {
  const box = $('[data-discussions]');
  try {
    const d = await conf({ action: 'annonce_discussions_admin', id });
    box.innerHTML = d.discussions.map((x) => `<li><span>n° ${x.a_ref} ${esc(x.a_prenom || '')} ↔ n° ${x.b_ref} ${esc(x.b_prenom || '')}<br><small>${esc(ETATS_DISC[x.etat] || x.etat)} · ${x.messages} message(s) · depuis le ${esc(date(x.ouverte_at, { day: 'numeric', month: 'short' }))}</small></span>${x.etat === 'signalee' ? `<button type="button" class="btn btn-ink" data-lire-discussion="${esc(x.id)}">Lire</button>` : ''}</li>`).join('') || '<li>Aucune discussion pour le moment.</li>';
    const lue = $('[data-discussion-lue]');
    if (d.messages) { const x = d.discussions.find((y) => y.id === id); lue.hidden = false; lue.innerHTML = `<h3>Discussion signalée</h3>${d.messages.map((m) => `<p><small><b>${esc(m.qui)}</b> · ${esc(date(m.created_at))}</small><br>${esc(m.texte)}</p>`).join('') || '<p>Aucun message.</p>'}`; void x; }
  } catch { box.innerHTML = '<li>Les discussions ne s’affichent pas pour le moment.</li>'; }
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-lire-discussion]'); if (b) chargerDiscussions(b.dataset.lireDiscussion); });
document.addEventListener('change', async (e) => {
  const form = e.target.closest('[data-notifs-lamia]');
  if (!form) return;
  const notifs = Object.fromEntries($$('input', form).map((i) => [i.name, i.checked]));
  try { await conf({ action: 'annonce_notifs_lamia', notifs }); message('Notifications enregistrées.'); } catch { message('Pas enregistré, réessaie.', true); }
});

function barres(box, jours) {
  const max = Math.max(1, ...jours.map((j) => j.visiteurs));
  box.innerHTML = jours.map((j) => `<span class="barre" style="--h:${(j.visiteurs / max) * 100}%" title="${esc(date(j.day + 'T12:00:00Z', { day: 'numeric', month: 'short' }))} : ${j.visiteurs} visiteur${j.visiteurs > 1 ? 's' : ''}, ${j.vues} page${j.vues > 1 ? 's' : ''} vue${j.vues > 1 ? 's' : ''}"><i></i></span>`).join('')
    + `<span class="barres-legende"><span>${esc(date((jours[0]?.day || '') + 'T12:00:00Z', { day: 'numeric', month: 'short' }))}</span><span>aujourd’hui</span></span>`;
}

// ---------------------------------------------------------------- ventes
function ventes() {
  const filtre = $('[data-filtre-ventes]').value;
  const list = data.ventes.orders.filter((o) => !filtre || o.status === filtre);
  $('[data-ventes-resume]').textContent = `${list.length} commande${list.length > 1 ? 's' : ''} · ${money(list.reduce((t, o) => t + (o.amount_total_cents || 0), 0))}`;
  $('[data-ventes]').innerHTML = list.map((o) => {
    const adr = o.shipping_address ? [o.shipping_address.line1, o.shipping_address.postal_code, o.shipping_address.city].filter(Boolean).join(', ') : '';
    const livraison = /retrait/i.test(o.notes || '') ? 'Retrait en main propre' : adr || (/email/i.test(o.notes || '') ? 'Par email' : '');
    return `<tr>
      <td>${esc(o.order_number)}</td><td>${esc(date(o.created_at))}</td>
      <td><strong>${esc(o.customer_name || '')}</strong><br><a href="mailto:${esc(o.customer_email)}">${esc(o.customer_email)}</a></td>
      <td>${(o.order_items || []).map((x) => `${esc(x.product_name)}${x.quantity > 1 ? ` × ${x.quantity}` : ''}`).join('<br>')}</td>
      <td>${esc(livraison)}</td><td><strong>${money(o.amount_total_cents, o.currency)}</strong></td>
      <td>${['paid', 'fulfilled'].includes(o.status) && (o.order_items || []).some((x) => x.products?.product_type === 'digital') ? `<button class="btn btn-line" type="button" data-envoyer-ebook="${esc(o.id)}">📧 Envoyer le livre</button><br>` : ''}<select data-statut="${esc(o.id)}" class="statut-select is-${esc(o.status)}">${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">Aucune commande pour ce filtre.</td></tr>';
}
$('[data-filtre-ventes]').addEventListener('change', ventes);
$('[data-ventes]').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-envoyer-ebook]');
  if (!b) return;
  b.disabled = true; b.textContent = 'Envoi…';
  try { await api({ action: 'envoyer_ebook', id: b.dataset.envoyerEbook }); b.textContent = '✓ Livre envoyé'; message('Le lien de téléchargement est parti par email.'); }
  catch (err) { b.disabled = false; b.textContent = '📧 Envoyer le livre'; message(err.message, true); }
});
$('[data-ventes]').addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-statut]');
  if (!sel) return;
  try {
    await api({ action: 'order_status', id: sel.dataset.statut, status: sel.value });
    const o = data.ventes.orders.find((x) => x.id === sel.dataset.statut); if (o) o.status = sel.value;
    sel.className = `statut-select is-${sel.value}`;
    message('Statut mis à jour.');
  } catch (err) { message(err.message, true); }
});

// ---------------------------------------------------------------- soirées et alertes
function soirees() {
  const s = data.inscrits.salons;
  $('[data-soirees-resume]').textContent = `${data.inscrits.total} inscription${data.inscrits.total > 1 ? 's' : ''} au total, dont ${data.inscrits.nouveaux_7j} cette semaine.`;
  // Une soirée est « précédente » trois heures après son début.
  const limite = new Date(Date.now() - 3 * 3600e3).toISOString();
  const ligne = (e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.audience || '')}</td><td>${esc(date(e.starts_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td><strong>${e.inscrits}</strong></td><td>${e.capacity}</td></tr>`;
  const avenir = s.filter((e) => e.starts_at >= limite), passees = s.filter((e) => e.starts_at < limite).reverse();
  $('[data-soirees]').innerHTML = avenir.map(ligne).join('') || '<tr><td colspan="5">Aucune soirée à venir.</td></tr>';
  $('[data-soirees-passees]').innerHTML = passees.map(ligne).join('') || '<tr><td colspan="5">Aucune soirée passée ces trois derniers mois.</td></tr>';
}
function alertes() {
  const list = data.alertes.recentes;
  $('[data-alertes]').innerHTML = list.length
    ? list.map((r) => `<article class="tdb-carte alerte is-${esc(r.severity)}"><p><strong>${esc(GRAVITE[r.severity] || '')}</strong> · ${esc(ALERTES[r.status] || r.status)} · ${esc(date(r.created_at))}</p><p>${esc(r.reported_label || 'Personne non précisée')} — ${esc(r.reason || '')}</p></article>`).join('')
    : '<p class="tdb-carte">Aucune alerte pour le moment.</p>';
}

// ---------------------------------------------------------------- visites
function visites() {
  const v = data.visites;
  if (!v) { $('[data-visites-kpis]').innerHTML = '<p>Les statistiques arrivent dès les premières visites.</p>'; return; }
  const per = v.periode || { vues: 0, visiteurs: 0 };
  const duree = (s) => (s == null ? '—' : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`);
  const nomPer = { 7: '7 jours', 30: '30 jours', 90: '3 mois', 365: '12 mois' }[v.jours_periode] || `${v.jours_periode} jours`;
  $('[data-visites-kpis]').innerHTML = [
    ['Aujourd’hui', v.aujourdhui.visiteurs, `${v.aujourdhui.vues} page${v.aujourdhui.vues > 1 ? 's' : ''} vue${v.aujourdhui.vues > 1 ? 's' : ''}`],
    [`Visiteurs sur ${nomPer}`, per.visiteurs, `${per.vues} pages vues`],
    ['Pages par visiteur', per.pages_par_visiteur ?? '—', 'en moyenne'],
    ['Temps moyen sur une page', duree(v.temps_moyen_s), 'quand on quitte la page'],
  ].map(([l, x, d]) => `<div class="kpi"><span>${l}</span><strong>${esc(x)}</strong><small>${esc(d)}</small></div>`).join('');
  barres($('[data-barres]'), v.jours || []);
  // Heures de la journée
  const hmax = Math.max(1, ...(v.heures || []).map((h) => h.n));
  $('[data-heures]').innerHTML = (v.heures || []).map((h) => `<span class="barre" style="--h:${(h.n / hmax) * 100}%" title="${h.h} h : ${h.n} page${h.n > 1 ? 's' : ''} vue${h.n > 1 ? 's' : ''}"><i></i></span>`).join('') + '<span class="barres-legende"><span>0 h</span><span>12 h</span><span>23 h</span></span>';
  // Parcours qui rapportent
  const E = v.evenements || {};
  const vuesDe = (p) => (v.pages || []).find((x) => x[0] === p)?.[1] || 0;
  const etape = (l, n, ref) => `<li><span>${l}</span><b>${n}</b>${ref ? `<em>${ref > 0 ? Math.round((n / ref) * 100) : 0} %</em>` : ''}</li>`;
  const bal = vuesDe('/speed-dating/');
  const boutique = ['/boutique/', '/ecrin/', '/bibliotheque/', '/grenier/'].reduce((t, p) => t + vuesDe(p), 0);
  $('[data-entonnoirs]').innerHTML = `
    <div><h3>Le Bal</h3><ol class="entonnoir">${etape('Pages du Bal vues', bal)}${etape('Clics « Réserver »', E.clic_reserver || 0, bal)}${etape('Inscriptions', E.inscription_bal || 0, E.clic_reserver || 0)}${etape('Caméras testées', E.test_camera || 0)}${etape('Entrées dans la salle', E.entree_bal || 0)}</ol></div>
    <div><h3>La boutique</h3><ol class="entonnoir">${etape('Pages boutique vues', boutique)}${etape('Fiches produit ouvertes', E.clic_produit || 0, boutique)}${etape('Précommandes', E.precommande || 0, E.clic_produit || 0)}</ol></div>`;
  const NOMS = { '/': 'Le Hall (accueil)', '/speed-dating/': 'Le Bal masqué', '/speed-dating/bal/': 'La salle du bal', '/speed-dating/salle/': 'L’antichambre', '/ecrin/': 'L’Écrin', '/bibliotheque/': 'La Bibliothèque', '/boutique/': 'La Boutique', '/lamia-brechet/': 'Qui est Lamia', '/produit/': 'Fiche produit', '/grenier/': 'Le Grenier', '/confidences/': 'Le Cabinet des Confidences', '/mon-espace/': 'Mon espace', '/werdi-ouvre-les-yeux/': 'Werdi' };
  const SOURCES = { direct: 'Lien direct ou appli', tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram', google: 'Google', youtube: 'YouTube', whatsapp: 'WhatsApp', live: 'Le live', snapchat: 'Snapchat', bing: 'Bing' };
  const top = (box, rows, nom, extra = () => '') => { const max = Math.max(1, ...rows.map((r) => r[1])); box.innerHTML = rows.map((r) => `<li><span>${nom(r)}</span><b>${r[1]}${extra(r)}</b><i style="--w:${(r[1] / max) * 100}%"></i></li>`).join('') || '<li>Pas encore de données</li>'; };
  const pays = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { return null; } })();
  const drapeau = (c) => (/^[A-Z]{2}$/.test(c || '') ? String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '🌍');
  const nomPays = (c) => (/^[A-Z]{2}$/.test(c || '') ? (pays?.of(c) || c) : 'Inconnu');
  top($('[data-top-pages]'), v.pages || [], (r) => esc(NOMS[r[0]] || r[0]), (r) => (r[2] ? ` <small>· ${duree(r[2])}</small>` : ''));
  top($('[data-top-sources]'), (v.sources || []).map((r) => [r[0], r[2] ?? r[1]]), (r) => esc(SOURCES[r[0]] || r[0]), () => ' <small>visiteurs</small>');
  top($('[data-top-appareils]'), v.appareils || [], (r) => esc(({ mobile: 'Téléphone', ordinateur: 'Ordinateur', tablette: 'Tablette' })[r[0]] || r[0]));
  top($('[data-top-pays]'), v.pays || [], (r) => `${drapeau(r[0])} ${esc(nomPays(r[0]))}`);
  top($('[data-top-villes]'), (v.villes || []).map((r) => [`${r[0]}|${r[1]}`, r[2]]), (r) => { const [ville, c] = r[0].split('|'); return `${drapeau(c)} ${esc(ville)}`; });
  const REGIONS = {
    FR: { IDF: 'Île-de-France', ARA: 'Auvergne-Rhône-Alpes', BFC: 'Bourgogne-Franche-Comté', BRE: 'Bretagne', CVL: 'Centre-Val de Loire', COR: 'Corse', GES: 'Grand Est', HDF: 'Hauts-de-France', NOR: 'Normandie', NAQ: 'Nouvelle-Aquitaine', OCC: 'Occitanie', PDL: 'Pays de la Loire', PAC: 'Provence-Alpes-Côte d’Azur' },
    DZ: { '06': 'Béjaïa', '09': 'Blida', '10': 'Bouira', '15': 'Tizi Ouzou', '16': 'Alger', '19': 'Sétif', '25': 'Constantine', '31': 'Oran', '34': 'Bordj Bou Arréridj', '35': 'Boumerdès' },
    CA: { QC: 'Québec', ON: 'Ontario', BC: 'Colombie-Britannique', AB: 'Alberta' },
    BE: { BRU: 'Bruxelles', WAL: 'Wallonie', VLG: 'Flandre' },
  };
  top($('[data-top-regions]'), (v.regions || []).map((r) => [`${r[0]}|${r[1]}`, r[2]]), (r) => { const [reg, c] = r[0].split('|'); return `${drapeau(c)} ${esc(REGIONS[c]?.[reg] || (c === 'DZ' ? `Wilaya ${reg}` : reg))}`; });
}
$('[data-periode]')?.addEventListener('change', async (e) => {
  try { const d = await api({ action: 'dashboard', jours: Number(e.target.value) }); data.visites = d.visites; visites(); } catch (err) { message(err.message, true); }
});

// ---------------------------------------------------------------- bilan du bal
async function chargerBilan() {
  try {
    const r = await fetch('/api/bal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'bilan' }) });
    const { bilan } = await r.json();
    if (!r.ok || !bilan) { $('[data-bilan-intro]').textContent = 'Pas encore de bal ouvert : le bilan apparaîtra dès l’ouverture des portes.'; return; }
    $('[data-bilan-intro]').textContent = `${bilan.soiree || 'Le bal'} · portes ouvertes ${date(bilan.ouvert_le)}${bilan.fini_le ? ` · fin du bal ${date(bilan.fini_le)}` : ''}`;
    const k = [['Inscrits', bilan.inscrits, ''], ['Venus au bal', bilan.presents, bilan.inscrits ? `${Math.round((bilan.presents / bilan.inscrits) * 100)} % des inscrits` : ''], ['Restés jusqu’à la fin', bilan.jusqu_a_la_fin ?? '—', 'au moment de « fin du bal »'], ['Tête-à-tête', bilan.tete_a_tete, `${bilan.tours.length} tour${bilan.tours.length > 1 ? 's' : ''}`], ['Carnets envoyés', bilan.souhaits, `${bilan.reciproques} souhait${bilan.reciproques > 1 ? 's' : ''} réciproque${bilan.reciproques > 1 ? 's' : ''}`], ['Incidents signalés', bilan.incidents, 'Cabinet des Confidences']];
    $('[data-bilan-kpis]').innerHTML = k.map(([l, v, d]) => `<div class="kpi"><span>${l}</span><strong>${esc(v)}</strong><small>${esc(d)}</small></div>`).join('');
    const top = (box, obj, noms) => { const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...rows.map((x) => x[1])); box.innerHTML = rows.map(([kk, n]) => `<li><span>${esc(noms[kk] || kk)}</span><b>${n}</b><i style="--w:${(n / max) * 100}%"></i></li>`).join('') || '<li>Pas encore de réponse</li>'; };
    const R = { oui: 'Oui', moyen: 'Moyen', non: 'Non', 'peut-etre': 'Peut-être' };
    top($('[data-bilan-aime]'), bilan.avis.aime, R);
    top($('[data-bilan-revient]'), bilan.avis.reviendrait, R);
    top($('[data-bilan-paie]'), bilan.avis.paierait, R);
    top($('[data-bilan-sources]'), bilan.sources, { direct: 'Lien direct ou appli', inconnue: 'Avant le suivi', tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', google: 'Google', live: 'Le live' });
    $('[data-bilan-salons]').innerHTML = bilan.salons.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.inscrits}</td><td>${x.presents}</td><td>${x.femmes}</td><td>${x.hommes}</td></tr>`).join('') || '<tr><td colspan="5">Aucun inscrit.</td></tr>';
    $('[data-bilan-tours]').innerHTML = bilan.tours.map((x) => `<tr><td>${x.round}${x.demasque ? ' (démasquage)' : ''}</td><td>${esc(date(x.at, { hour: '2-digit', minute: '2-digit' }))}</td><td>${x.minutes} min</td><td>${x.presents}</td><td>${x.pairs}</td><td>${x.attente}</td></tr>`).join('') || '<tr><td colspan="6">Aucun tour lancé.</td></tr>';
    $('[data-bilan-mots]').innerHTML = bilan.messages.length ? bilan.messages.map((m) => `<blockquote class="mot">${esc(m)}</blockquote>`).join('') : '<p class="aide">Les petits mots laissés dans les carnets apparaîtront ici.</p>';
  } catch { message('Le bilan ne s’affiche pas pour le moment.', true); }
}
$('[data-bilan-maj]')?.addEventListener('click', chargerBilan);

// ---------------------------------------------------------------- produits
// Livraison et TVA
async function chargerReglages() {
  try {
    const r = await (await fetch('/api/admin?action=boutique', { cache: 'no-store' })).json();
    const f = $('[data-reglages]');
    for (const k of ['g250', 'g500', 'g750', 'g1000', 'g2000', 'g5000', 'lettre20', 'lettre100']) f.elements[k].value = (r.tarifs[k] / 100).toFixed(2);
    f.elements.tva_active.checked = r.tva.active; f.elements.tva_taux.value = r.tva.taux; f.elements.tva_mention.value = r.tva.mention || '';
  } catch { /* */ }
}
$('[data-reglages]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, st = $('[data-reglages-status]');
  const c = (k) => Math.round(parseFloat(String(f.elements[k].value).replace(',', '.')) * 100);
  try {
    await api({ action: 'boutique_save', reglages: { tarifs: Object.fromEntries(['g250', 'g500', 'g750', 'g1000', 'g2000', 'g5000', 'lettre20', 'lettre100'].map((k) => [k, c(k)])), tva: { active: f.elements.tva_active.checked, taux: Number(f.elements.tva_taux.value), mention: f.elements.tva_mention.value } } });
    st.textContent = 'Réglages enregistrés. Pense à « Publier » pour mettre à jour les conditions de vente.';
  } catch (err) { st.textContent = err.message; }
});
async function chargerProduits() {
  try { ({ products: produits, categories } = await api({ action: 'products' })); } catch (e) { return message(e.message, true); }
  $('[data-categories]').innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  const VIS = { active: 'En vente', draft: 'Brouillon', archived: 'Archivé' };
  $('[data-produits]').innerHTML = produits.map((p) => {
    const photo = (Array.isArray(p.gallery) && p.gallery[0] && (p.gallery[0].url || p.gallery[0])) || p.cover_image_url || (p.slug === 'collier-kabyle-argente-emaille-15g' ? '/images/collier/collier-kabyle-15g-hero-320.webp' : '');
    return `<button type="button" class="produit-carte is-${esc(p.status)}" data-produit="${esc(p.id)}">
      ${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : '<span class="sans-photo">Pas de photo</span>'}
      <span class="pc-texte"><strong>${esc(p.name)}</strong><span>${money(p.price_cents, p.currency)} · stock ${p.stock_qty}</span><em>${VIS[p.status] || p.status}${p.categories ? ` · ${esc(p.categories.name)}` : ''}</em></span>
    </button>`;
  }).join('') || '<p>Aucun produit.</p>';
}
$('[data-produits]').addEventListener('click', (e) => { const b = e.target.closest('[data-produit]'); if (b) editer(produits.find((p) => p.id === b.dataset.produit)); });
$$('[data-panel="produits"] [data-nouveau-produit]').forEach((b) => b.addEventListener('click', () => editer(null)));

function editer(p) {
  const f = $('[data-produit-form]');
  edition = { photos: [] };
  f.reset();
  f.hidden = false;
  $('[data-produit-titre]').textContent = p ? `Modifier : ${p.name}` : 'Nouveau produit';
  $('[data-produit-status]').textContent = '';
  if (p) {
    for (const k of ['id', 'slug', 'name', 'subtitle', 'description', 'stock_qty', 'category_id', 'product_type', 'status']) if (f.elements[k]) f.elements[k].value = p[k] ?? '';
    f.elements.price.value = (p.price_cents / 100).toFixed(2);
    f.elements.compare.value = p.compare_at_price_cents ? (p.compare_at_price_cents / 100).toFixed(2) : '';
    f.elements.is_unique.checked = !!p.is_unique; f.elements.featured.checked = !!p.featured;
    edition.photos = (Array.isArray(p.gallery) ? p.gallery : []).map((g) => (typeof g === 'string' ? { url: g } : g)).filter((g) => g.url);
    edition.metadata = p.metadata;
    const m = p.metadata || {};
    f.elements.poids_colis_g.value = m.poids_colis_g || '';
    f.elements.famille.value = m.famille || '';
    $('[data-ebook-actuel]').textContent = m.fichier ? `Fichier en place : ${m.fichier.split('/').pop()}` : 'Aucun fichier pour l’instant.';
    f.elements.envoi_lettre.checked = m.envoi === 'lettre';
    const t = Array.isArray(m.tailles) ? m.tailles : [];
    f.elements.tailles.value = t.length ? `${Math.min(...t)}-${Math.max(...t)}` : '';
    f.elements.supp_cents.value = m.supplement_taille?.cents ? (m.supplement_taille.cents / 100).toFixed(2) : '';
    f.elements.supp_seuil.value = m.supplement_taille?.a_partir_de || '';
    // Le collier a des photos d'origine intégrées au site : on les propose pour pouvoir les réordonner ou les remplacer.
    if (!edition.photos.length && p.slug === 'collier-kabyle-argente-emaille-15g') edition.photos = ['hero', 'porte', 'detail', 'ecrin'].map((v) => ({ url: `/images/collier/collier-kabyle-15g-${v}-1120.webp` }));
    const voir = $('[data-produit-voir]'); voir.hidden = false; voir.href = `/produit/${encodeURIComponent(p.slug)}/`;
  } else {
    f.elements.status.value = 'active'; f.elements.stock_qty.value = 1; $('[data-produit-voir]').hidden = true; $('[data-ebook-actuel]').textContent = '';
    if (categories[0]) f.elements.category_id.value = categories[0].id;
  }
  photos();
  f.scrollIntoView({ behavior: 'smooth' });
}
$('[data-produit-fermer]').addEventListener('click', () => { $('[data-produit-form]').hidden = true; });

function photos() {
  $('[data-photos]').innerHTML = edition.photos.map((g, i) => `<figure class="photo"><img src="${esc(g.url)}" alt=""><figcaption>
    ${i ? `<button type="button" data-photo-gauche="${i}" title="Mettre en premier">◀</button>` : '<span class="principale">Principale</span>'}
    <button type="button" data-photo-suppr="${i}" title="Retirer">✕</button></figcaption></figure>`).join('') || '<p class="aide">Aucune photo pour l’instant.</p>';
}
$('[data-photos]').addEventListener('click', (e) => {
  const g = e.target.closest('[data-photo-gauche]'), s = e.target.closest('[data-photo-suppr]');
  if (g) { const i = +g.dataset.photoGauche; [edition.photos[i - 1], edition.photos[i]] = [edition.photos[i], edition.photos[i - 1]]; photos(); }
  if (s) { edition.photos.splice(+s.dataset.photoSuppr, 1); photos(); }
});

// Réduit la photo (1600 px max, WEBP) avant l'envoi.
async function reduire(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.84));
  const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  return { data: b64, content_type: blob.type || 'image/webp' };
}
async function envoyer(file, folder) {
  const img = await reduire(file);
  const { url } = await api({ action: 'upload', folder, name: file.name.replace(/\.[^.]+$/, ''), ...img });
  return url;
}
$('[data-photo-input]').addEventListener('change', async (e) => {
  const st = $('[data-produit-status]');
  for (const file of e.target.files) {
    st.textContent = `Envoi de ${file.name}…`;
    try { edition.photos.push({ url: await envoyer(file, 'produits') }); photos(); } catch (err) { st.textContent = err.message; }
  }
  st.textContent = '';
  e.target.value = '';
});

// Fichier d'un livre numérique : envoyé directement dans le dossier privé, puis enregistré avec le produit.
$('[data-ebook-input]')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; const st = $('[data-produit-status]'), f = $('[data-produit-form]');
  if (!file) return;
  const type = file.type || (/\.epub$/i.test(file.name) ? 'application/epub+zip' : 'application/pdf');
  if (file.size > 50 * 1024 * 1024) { st.textContent = 'Le fichier dépasse 50 Mo.'; return; }
  try {
    st.textContent = `Envoi de ${file.name}…`;
    const { path, url } = await api({ action: 'ebook_url', slug: f.elements.slug.value || f.elements.name.value, content_type: type });
    const r = await fetch(url, { method: 'PUT', headers: { apikey: 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc', 'Content-Type': type, 'x-upsert': 'false' }, body: file });
    if (!r.ok) throw new Error('L’envoi du fichier n’a pas fonctionné.');
    edition.metadata = { ...(edition.metadata || {}), fichier: path };
    $('[data-ebook-actuel]').textContent = `Fichier prêt : ${file.name}. Clique sur « Enregistrer le produit » pour le mettre en vente.`;
    st.textContent = '';
  } catch (err) { st.textContent = err.message; }
  e.target.value = '';
});

$('[data-produit-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, st = $('[data-produit-status]');
  const val = (k) => f.elements[k].value;
  // Poids d'envoi, tailles de bague et supplément : rangés dans les informations du produit.
  const meta = { ...(edition.metadata || {}) };
  const poids = parseInt(val('poids_colis_g'), 10); if (poids > 0) meta.poids_colis_g = poids; else delete meta.poids_colis_g;
  if (f.elements.envoi_lettre.checked) meta.envoi = 'lettre'; else delete meta.envoi;
  if (val('famille')) meta.famille = val('famille'); else delete meta.famille;
  const mt = String(val('tailles')).match(/(\d{2})\s*[-–à]\s*(\d{2})/);
  if (mt) { const [a, b] = [Number(mt[1]), Number(mt[2])].sort((x, y) => x - y); meta.tailles = Array.from({ length: b - a + 1 }, (_, i) => a + i); } else delete meta.tailles;
  const sc = Math.round(parseFloat(String(val('supp_cents')).replace(',', '.')) * 100), ss = parseInt(val('supp_seuil'), 10);
  if (meta.tailles && sc > 0 && ss) meta.supplement_taille = { cents: sc, a_partir_de: ss }; else delete meta.supplement_taille;
  const product = {
    id: val('id') || undefined, slug: val('slug') || undefined, name: val('name'), subtitle: val('subtitle'), description: val('description'),
    price_cents: Math.round(parseFloat(val('price').replace(',', '.')) * 100), compare_at_price_cents: val('compare') ? Math.round(parseFloat(val('compare').replace(',', '.')) * 100) : null,
    stock_qty: Number(val('stock_qty')), category_id: val('category_id'), product_type: val('product_type'), status: val('status'),
    is_unique: f.elements.is_unique.checked, featured: f.elements.featured.checked, gallery: edition.photos, metadata: meta,
  };
  st.textContent = 'Enregistrement…';
  try {
    const { product: saved } = await api({ action: 'product_save', product });
    st.textContent = 'Produit enregistré. Il apparaît tout de suite sur le site.';
    f.elements.id.value = saved.id; f.elements.slug.value = saved.slug;
    const voir = $('[data-produit-voir]'); voir.hidden = false; voir.href = `/produit/${encodeURIComponent(saved.slug)}/`;
    await chargerProduits();
  } catch (err) { st.textContent = err.message; }
});

// ---------------------------------------------------------------- textes et images
// Mes réseaux
const NOMS_RESEAUX = { tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', snapchat: 'Snapchat', whatsapp: 'WhatsApp', twitch: 'Twitch' };
async function chargerReseaux() {
  try { const { reseaux } = await api({ action: 'reseaux' }); const f = $('[data-reseaux]'); for (const [k, v] of Object.entries(reseaux)) if (f.elements[k]) f.elements[k].value = v || ''; } catch { /* */ }
}
$('[data-reseaux]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, st = $('[data-reseaux-status]');
  const reseaux = Object.fromEntries([...Object.keys(NOMS_RESEAUX), 'youtube_chaine'].map((k) => [k, f.elements[k].value.trim()]));
  try {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'reseaux_save', reseaux }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error === 'bad_link' ? `Le lien ${NOMS_RESEAUX[d.reseau] || d.reseau} ne semble pas être une adresse ${NOMS_RESEAUX[d.reseau] || ''} valide.` : 'L’enregistrement n’a pas fonctionné.');
    for (const [k, v] of Object.entries(d.reseaux)) if (f.elements[k]) f.elements[k].value = v || '';
    st.textContent = 'Réseaux enregistrés : ils apparaissent déjà sur le site.';
  } catch (err) { st.textContent = err.message; }
});

let champs = null;
async function chargerTextes() {
  chargerReseaux();
  if (champs) return;
  try {
    const [ed, cur] = await Promise.all([fetch('/assets/editable.json').then((r) => r.json()), api({ action: 'content' })]);
    champs = ed;
    const groups = {};
    for (const f of ed.fields) (groups[f.group] ||= []).push(f);
    $('[data-textes]').innerHTML = Object.entries(groups).map(([g, fields]) => `<details class="tdb-carte groupe"${g === 'Le Hall' ? ' open' : ''}><summary>${esc(g)}</summary>${fields.map((f) => {
      const v = cur.values[f.key] ?? ed.defaults[f.key] ?? '';
      if (f.image) return `<div class="champ-image"><span>${esc(f.label)}</span><img src="${esc(v)}" alt="" data-apercu="${esc(f.key)}"><input type="hidden" data-champ="${esc(f.key)}" value="${esc(v)}"><label class="btn btn-line">Changer l’image<input type="file" accept="image/*" data-image-champ="${esc(f.key)}" hidden></label></div>`;
      return `<label class="champ">${esc(f.label)}${f.long ? `<textarea data-champ="${esc(f.key)}" rows="4">${esc(v)}</textarea>` : `<input data-champ="${esc(f.key)}" value="${esc(v)}">`}</label>`;
    }).join('')}</details>`).join('');
    etat(cur);
  } catch (e) { message(e.message, true); }
}
function etat(cur) {
  const p = cur.published_at ? `Dernière publication : ${date(cur.published_at)}.` : 'Pas encore publié depuis le tableau de bord.';
  $('[data-textes-etat]').textContent = cur.publish_ready ? `${p} Modifie, enregistre, puis publie : le site se met à jour en une minute environ.` : `${p} La publication automatique n’est pas encore branchée : enregistre tes modifications, elles seront appliquées au prochain déploiement.`;
}
$('[data-textes]').addEventListener('change', async (e) => {
  const inp = e.target.closest('[data-image-champ]');
  if (!inp?.files[0]) return;
  message('Envoi de l’image…');
  try {
    const url = await envoyer(inp.files[0], 'site');
    $(`[data-champ="${CSS.escape(inp.dataset.imageChamp)}"]`).value = url;
    $(`[data-apercu="${CSS.escape(inp.dataset.imageChamp)}"]`).src = url;
    message('Image prête. Pense à enregistrer puis publier.');
  } catch (err) { message(err.message, true); }
});
function valeurs() {
  const out = {};
  for (const el of $$('[data-champ]')) { const k = el.dataset.champ; if (el.value.trim() && el.value !== champs.defaults[k]) out[k] = el.value; }
  return out;
}
$('[data-textes-enregistrer]').addEventListener('click', async () => {
  try { await api({ action: 'content_save', values: valeurs() }); message('Modifications enregistrées.'); } catch (e) { message(e.message, true); }
});
$('[data-textes-publier]').addEventListener('click', async () => {
  try {
    await api({ action: 'content_save', values: valeurs() });
    await api({ action: 'publish' });
    message('Publication lancée : le site sera à jour dans une minute environ.');
    etat({ published_at: new Date().toISOString(), publish_ready: true });
  } catch (e) { message(e.message, true); }
});

// ---------------------------------------------------------------- comptes : toutes les personnes inscrites sur le site
const GENRE = { femme: 'Femme', homme: 'Homme' };
const PRESENCE = { registered: 'inscrit·e', checked_in: 'arrivé·e', attended: 'venu·e', no_show: 'absent·e', cancelled: 'annulée' };
const ANNONCE = { brouillon: 'brouillon', a_verifier: 'à vérifier', publiee: 'publiée', retiree: 'retirée' };
let filtreComptes = 'tous', compteOuvert = null;

const ageDe = (birth) => {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00Z`), d = new Date();
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a;
};
const nomDe = (c) => c.profil?.real_first_name || c.profil?.display_name || '(sans prénom)';
const incomplet = (c) => !c.profil || !c.profil.gender || !c.profil.birth_date || !(c.profil.real_first_name || c.profil.display_name);
const salonCourt = (s) => String(s || '').replace(/^Grand salon · /, '');

async function chargerComptes() {
  $('[data-comptes]').innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';
  try { comptes = await api({ action: 'comptes_liste' }); }
  catch (e) { $('[data-comptes]').innerHTML = `<tr><td colspan="6">${esc(e.message)}</td></tr>`; return; }
  const l = comptes.comptes;
  const kpi = (t, n, s) => `<div class="kpi"><span>${t}</span><strong>${n}</strong>${s ? `<small>${s}</small>` : ''}</div>`;
  $('[data-comptes-kpis]').innerHTML = [
    kpi('Comptes', l.length, `${l.filter((c) => c.profil?.gender === 'femme').length} femmes · ${l.filter((c) => c.profil?.gender === 'homme').length} hommes`),
    kpi('Inscrits à une soirée', l.filter((c) => c.inscriptions.some((i) => i.statut !== 'cancelled')).length),
    kpi('Avec annonce', l.filter((c) => c.annonces.length).length),
    kpi('Profil incomplet', l.filter(incomplet).length, 'genre, date de naissance ou prénom manquant'),
  ].join('');
  listeComptes();
  if (compteOuvert) ouvrirCompte(compteOuvert);
}

function listeComptes() {
  if (!comptes) return;
  const q = $('[data-comptes-cherche]').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const garde = {
    tous: () => true,
    soiree: (c) => c.inscriptions.some((i) => i.statut !== 'cancelled'),
    annonce: (c) => c.annonces.length,
    fiche: (c) => c.fiches.length,
    incomplet,
  }[filtreComptes];
  const l = comptes.comptes.filter(garde).filter((c) => !q || [nomDe(c), c.email, c.profil?.city, c.profil?.display_name, ...c.annonces.map((a) => a.ref), ...c.fiches.map((f) => f.ref)].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  $('[data-comptes]').innerHTML = l.length ? l.map((c) => {
    const age = ageDe(c.profil?.birth_date);
    const soirees = c.inscriptions.slice(0, 3).map((i) => `<span class="compte-badge ${i.statut === 'cancelled' ? 'is-annule' : 'is-bal'}">${esc(salonCourt(i.salon) || i.titre)}</span>`).join('');
    const liens = [...c.annonces.map((a) => `<span class="compte-badge">Annonce n° ${esc(a.ref)}</span>`), ...c.fiches.map((f) => `<span class="compte-badge">Fiche n° ${esc(f.ref)}</span>`)].join('');
    return `<tr class="compte-ligne" data-compte="${esc(c.id)}" tabindex="0">
      <td><strong>${esc(nomDe(c))}${c.admin ? ' <span class="compte-badge">toi (admin)</span>' : ''}</strong><small>${esc(c.email || '')}</small></td>
      <td>${c.profil?.gender ? esc(GENRE[c.profil.gender]) : '<span class="compte-badge is-alerte">genre ?</span>'} ${age != null ? `· ${age} ans` : '<span class="compte-badge is-alerte">âge ?</span>'}</td>
      <td>${esc(c.profil?.city || '')}</td>
      <td>${soirees || '—'}</td>
      <td>${liens || '—'}</td>
      <td>${esc(date(c.cree_le, { day: 'numeric', month: 'short', year: 'numeric' }))}</td></tr>`;
  }).join('') : '<tr><td colspan="6">Aucun compte ne correspond.</td></tr>';
}

function ouvrirCompte(id) {
  const c = comptes?.comptes.find((x) => x.id === id);
  if (!c) return;
  compteOuvert = id;
  const p = c.profil || {};
  $('[data-compte-email]').textContent = c.email || '';
  $('[data-compte-nom]').textContent = nomDe(c);
  $('[data-compte-infos]').textContent = [
    `Compte créé le ${date(c.cree_le, { day: 'numeric', month: 'long', year: 'numeric' })}`,
    c.vu_le ? `dernière connexion le ${date(c.vu_le, { day: 'numeric', month: 'long' })}` : 'jamais reconnecté·e',
    c.email_confirme ? 'email confirmé' : 'email non confirmé',
    c.source ? `venu·e de ${c.source}` : '',
  ].filter(Boolean).join(' · ');
  const f = $('[data-compte-form]');
  for (const k of ['real_first_name', 'display_name', 'gender', 'birth_date', 'city', 'country']) f.elements[k].value = p[k] || '';
  f.elements.profile_status.value = p.profile_status || 'active';
  $('[data-compte-statut]').textContent = c.profil ? '' : 'Ce compte n’a pas encore de profil : il sera créé à l’enregistrement.';
  $('[data-compte-soirees]').innerHTML = c.inscriptions.length ? c.inscriptions.map((i) => `<li><div><strong>${esc(i.titre)}</strong><small>${esc(i.salon || '')} · ${esc(date(i.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${esc(PRESENCE[i.statut] || i.statut)}</small></div>
    ${i.statut === 'cancelled'
      ? `<button class="btn btn-line" type="button" data-compte-presence="registered" data-event="${esc(i.event_id)}">Réinscrire</button>`
      : `<button class="btn btn-line" type="button" data-compte-presence="cancelled" data-event="${esc(i.event_id)}">Annuler l’inscription</button>`}</li>`).join('') : '<li>Aucune inscription.</li>';
  const deja = new Set(c.inscriptions.map((i) => i.event_id));
  const dispo = (comptes.soirees || []).filter((e) => !deja.has(e.id));
  $('[data-compte-soiree]').innerHTML = dispo.length
    ? dispo.map((e) => `<option value="${esc(e.id)}">${esc(e.salon || e.titre)} · ${esc(date(e.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}${e.statut === 'draft' ? ' (brouillon)' : ''}</option>`).join('')
    : '<option value="">Aucune autre soirée à venir</option>';
  $('[data-compte-inscrire]').disabled = !dispo.length;
  $('[data-compte-liens]').innerHTML = [
    ...c.annonces.map((a) => `<li><div><strong>Annonce n° ${esc(a.ref)}</strong><small>${esc(ANNONCE[a.status] || a.status)}${a.test ? ' · test' : ''}</small></div><button class="btn btn-line" type="button" data-rencontres-aller="annonces">Voir dans Rencontres</button></li>`),
    ...c.fiches.map((x) => `<li><div><strong>Fiche de l’outil n° ${esc(x.ref)}</strong><small>${x.retiree ? 'retirée' : x.confirmee ? 'confirmée' : 'en attente de confirmation'}</small></div></li>`),
  ].join('') || '<li>Ni annonce ni fiche de l’outil liée à ce compte.</li>';
  $('[data-compte-fiche]').hidden = false;
  $('[data-compte-fond]').hidden = false;
  $('[data-compte-form]').hidden = false;
  chargerDetail({ user_id: id });
}
// ---------------------------------------------------------------- la fiche : qui, son activité, pourquoi une alerte, cadeaux, blocage
const STATUT_DEMANDE = { a_traiter: 'en attente', mis_en_relation: 'en match', dematche: 'dématché', pas_compatible: 'pas compatible', en_reserve: 'en réserve' };
let nomsRefs = {};
const refBouton = (r) => `<button type="button" class="fiche-ref" data-voir-ref="${esc(r)}">${nomsRefs[r] ? `${esc(nomsRefs[r])} · ` : ''}n° ${esc(r)}</button>`;
const quand = (d) => (d ? date(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const avecRefs = (t) => esc(t).replace(/n°\s*(\d+)/g, (_, r) => refBouton(r));
function rendreDetail(d) {
  const box = $('[data-compte-detail]'), c = d.compte;
  nomsRefs = d.noms || {};
  const carte = (titre, html, ouvert = false) => `<details class="tdb-repli" ${ouvert ? 'open' : ''}><summary>${titre}</summary><div>${html}</div></details>`;
  const pourquoi = d.journal?.length ? `<div class="tdb-carte fiche-pourquoi"><h3 style="margin-top:0">Pourquoi tu as reçu une alerte</h3><ul class="fiche-liste">${d.journal.slice(0, 4).map((j) => `<li><strong>${avecRefs(j.titre)}</strong><small>${esc(quand(j.created_at))}</small>${(j.lignes || []).map((l) => `<div>${avecRefs(l)}</div>`).join('')}</li>`).join('')}</ul></div>` : '';
  const qui = [...(d.annonces || []).map((a) => `<li><strong>Profil n° ${esc(a.ref)}</strong> · ${esc(a.prenom || '')}, ${esc(a.age ?? '?')} ans · ${esc(a.genre || '')}<small>${esc([a.ville, a.pays].filter(Boolean).join(', '))} · ${esc(ANNONCE[a.status] || a.status)}${a.test ? ' · test' : ''}${a.en_match ? ' · en match' : ''}</small></li>`), ...(d.fiches || []).map((f) => `<li><strong>Fiche de l’outil n° ${esc(f.ref)}</strong> · ${esc(f.age ?? '?')} ans · ${esc(f.genre || '')}<small>${esc([f.ville, f.pays].filter(Boolean).join(', '))} · ${f.retiree ? 'retirée' : f.confirmee ? 'confirmée' : 'en attente de confirmation'}</small></li>`)].join('');
  if (d.sans_compte) {
    box.innerHTML = `${pourquoi}<div class="tdb-carte"><h3 style="margin-top:0">À qui est ce profil</h3><ul class="fiche-liste">${qui}</ul><p class="aide">Cette personne n’a pas de compte. Son prénom et ses contacts sont dans ton outil de live (cherche ce n° dans « Le site »).</p></div>${(d.choisi_par || []).length ? `<div class="tdb-carte"><h3 style="margin-top:0">Choisie par</h3><ul class="fiche-liste">${d.choisi_par.map((x) => `<li>${refBouton(x.ref)} ${esc(x.prenom || '')}<small>${esc(STATUT_DEMANDE[x.statut] || x.statut)} · ${esc(quand(x.le))}</small></li>`).join('')}</ul></div>` : ''}`;
    return;
  }
  const a = d.activite;
  const liste = (l, f, vide) => (l.length ? `<ul class="fiche-liste">${l.map(f).join('')}</ul>` : `<p class="aide">${vide}</p>`);
  box.innerHTML = `${c.bloque ? '<p class="fiche-bloque">🚫 Ce compte est bloqué.</p>' : ''}${pourquoi}
    <div class="tdb-carte"><h3 style="margin-top:0">À qui est ce profil</h3><ul class="fiche-liste">${qui || '<li>Compte sans profil.</li>'}</ul>
      <p class="aide">Formule : ${esc({ decouverte: 'Découverte', passion: 'Passion', prestige: 'Prestige' }[d.formule] || d.formule)} · Dernière activité : ${esc(quand(c.derniere_action) || 'aucune')}</p></div>
    <div class="tdb-carte"><h3 style="margin-top:0">Son activité</h3><div class="fiche-chiffres">
      ${[['Swipes oui', a.swipes_oui], ['Swipes non', a.swipes_non], ['Demandes', a.demandes], ['Choisi·e par', a.recus], ['Matchs en cours', a.en_cours.length], ['Dématchs', a.dematchs], ['Messages', a.messages], ['Photos', a.photos]].map(([n, v]) => `<div><b>${esc(v)}</b><span>${esc(n)}</span></div>`).join('')}</div>
      ${a.en_cours.length ? `<p>En match avec : ${a.en_cours.map(refBouton).join(', ')}</p>` : ''}</div>
    <div class="tdb-carte"><h3 style="margin-top:0">🎁 Offrir</h3>
      <p class="aide">Reste à utiliser : ${d.credits.match} match(s), ${d.credits.speed_dating} soirée(s), ${d.credits.coaching} coaching(s). La personne est prévenue.</p>
      <form class="fiche-offrir" data-offrir>
        <label>Quoi<select name="quoi"><option value="match">Match</option><option value="speed_dating">Speed dating</option><option value="coaching">Coaching</option><option value="produit">Produit</option></select></label>
        <label data-offrir-nombre>Combien<select name="quantite">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option>${n}</option>`).join('')}</select></label>
        <label data-offrir-produit hidden>Produit<select name="product_id">${(d.produits || []).map((p) => `<option value="${esc(p.id)}" data-numerique="${p.product_type === 'digital' ? '1' : ''}">${esc(p.name)}${Number.isInteger(p.stock_qty) ? ` (stock ${p.stock_qty})` : ''}</option>`).join('')}</select></label>
        <div data-offrir-adresse hidden><label>Adresse<input name="line1" maxlength="200"></label><label>Code postal<input name="postal_code" maxlength="20"></label><label>Ville<input name="city" maxlength="100"></label><label>Pays<input name="country" maxlength="60" value="France"></label></div>
        <button class="btn btn-ink" type="submit">Offrir</button><p class="aide" data-offrir-statut role="status" style="grid-column:1/-1;margin:0"></p>
      </form>
      ${d.cadeaux.length ? `<p class="aide">Déjà offert : ${d.cadeaux.map((x) => `${x.quantite} ${{ mise_en_relation: 'match', speed_dating: 'speed dating', coaching: 'coaching' }[x.type] || x.type} (${esc(date(x.le, { day: 'numeric', month: 'short' }))})`).join(' · ')}</p>` : ''}</div>
    ${carte(`Ses choix (${d.choix.length}) et qui l’a choisi·e (${d.choisi_par.length})`, `<h4>Ses choix</h4>${liste(d.choix, (x) => `<li>${refBouton(x.ref)}<small>${esc(STATUT_DEMANDE[x.statut] || x.statut)} · ${esc(quand(x.le))}</small></li>`, 'Aucun choix.')}<h4>L’ont choisi·e</h4>${liste(d.choisi_par, (x) => `<li>${refBouton(x.ref)} ${esc(x.prenom || '')}<small>${esc(STATUT_DEMANDE[x.statut] || x.statut)} · ${esc(quand(x.le))}</small></li>`, 'Personne pour l’instant.')}`)}
    ${carte(`Blocages et signalements (${d.blocages.fait.length + d.blocages.subi.length + d.signalements.fait.length + d.signalements.subi.length})`, `<h4>A bloqué</h4>${liste(d.blocages.fait, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}<h4>Bloqué·e par</h4>${liste(d.blocages.subi, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}<h4>A signalé</h4>${liste(d.signalements.fait, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}<h4>Signalé·e par</h4>${liste(d.signalements.subi, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}`)}
    ${carte(`Ses discussions (${d.discussions.length})`, liste(d.discussions, (x) => `<li>Avec ${refBouton(x.avec)}<small>Ouverte ${esc(quand(x.ouverte))}${x.ferme ? ` · fermée ${esc(quand(x.ferme))}` : ''}</small></li>`, 'Aucune discussion.'))}
    ${c.admin ? '' : `<p><button class="btn btn-line fiche-danger" type="button" data-bloquer-compte="${c.bloque ? 'non' : 'oui'}">${c.bloque ? 'Débloquer ce compte' : '🚫 Bloquer ce compte'}</button></p>`}`;
}
let detailCourant = null;
async function chargerDetail(cible) {
  const box = $('[data-compte-detail]');
  box.innerHTML = '<p class="aide">Chargement de sa fiche…</p>';
  try { detailCourant = await conf({ action: 'annonce_profil_detail', ...cible }); rendreDetail(detailCourant); }
  catch { box.innerHTML = '<p class="aide">Cette fiche n’a pas pu être chargée. Réessaie dans un instant.</p>'; }
}
// Depuis une notification : /tableau-de-bord#profil-48 ouvre directement la fiche du n° 48.
async function ouvrirParRef(ref) {
  if (!comptes) await chargerComptes();
  const c = comptes?.comptes.find((x) => x.annonces.some((a) => String(a.ref) === String(ref)) || x.fiches.some((f) => String(f.ref) === String(ref)));
  if (c) return ouvrirCompte(c.id);
  compteOuvert = null;
  $('[data-compte-email]').textContent = `Profil n° ${ref}`;
  $('[data-compte-nom]').textContent = 'Sans compte';
  $('[data-compte-infos]').textContent = '';
  $('[data-compte-form]').hidden = true;
  $('[data-compte-soirees]').innerHTML = '<li>Pas de compte.</li>';
  $('[data-compte-liens]').innerHTML = '';
  $('[data-compte-fiche]').hidden = false; $('[data-compte-fond]').hidden = false;
  chargerDetail({ ref });
}
function suivreHashProfil() {
  const m = location.hash.match(/^#profil-(\d+)$/);
  if (!m) return false;
  ouvrir('comptes');
  try { history.replaceState(null, '', `#profil-${m[1]}`); } catch { /* */ }
  ouvrirParRef(m[1]);
  return true;
}
addEventListener('hashchange', () => { if (token) suivreHashProfil(); });
$('[data-compte-detail]').addEventListener('click', async (e) => {
  const voir = e.target.closest('[data-voir-ref]');
  if (voir) return ouvrirParRef(voir.dataset.voirRef);
  const bl = e.target.closest('[data-bloquer-compte]');
  if (!bl) return;
  const bloquer = bl.dataset.bloquerCompte === 'oui';
  if (!confirm(bloquer ? 'Bloquer ce compte ? La personne ne pourra plus se connecter, son profil et sa fiche sont retirés, et ses matchs en cours sont terminés. Tu pourras la débloquer, mais pas rétablir ses matchs.' : 'Débloquer ce compte ? Il pourra se reconnecter et retrouver son profil.')) return;
  bl.disabled = true;
  try { await conf({ action: 'annonce_profil_bloquer', user_id: detailCourant.compte.id, bloquer }); message(bloquer ? 'Compte bloqué.' : 'Compte débloqué.'); chargerDetail({ user_id: detailCourant.compte.id }); }
  catch { message('Ça n’a pas abouti. Réessaie dans un instant.', true); bl.disabled = false; }
});
$('[data-compte-detail]').addEventListener('change', (e) => {
  const f = e.target.closest('[data-offrir]');
  if (!f) return;
  const produit = f.elements.quoi.value === 'produit';
  $('[data-offrir-nombre]', f).hidden = produit;
  $('[data-offrir-produit]', f).hidden = !produit;
  $('[data-offrir-adresse]', f).hidden = !produit || f.elements.product_id.selectedOptions[0]?.dataset.numerique === '1';
});
$('[data-compte-detail]').addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-offrir]');
  if (!f) return;
  e.preventDefault();
  const st = $('[data-offrir-statut]', f), quoi = f.elements.quoi.value;
  if (!confirm('Offrir ce cadeau ? La personne en est prévenue tout de suite.')) return;
  st.textContent = 'Un instant…';
  const ERREURS = { adresse_requise: 'Indique son adresse pour l’envoi.', stock_vide: 'Ce produit n’est plus en stock.', produit_indisponible: 'Ce produit n’est plus disponible.' };
  try {
    await conf({ action: 'annonce_offrir', user_id: detailCourant.compte.id, quoi, quantite: f.elements.quantite.value, product_id: f.elements.product_id.value, adresse: { line1: f.elements.line1.value, postal_code: f.elements.postal_code.value, city: f.elements.city.value, country: f.elements.country.value } });
    message('🎁 Cadeau offert, la personne est prévenue.');
    chargerDetail({ user_id: detailCourant.compte.id });
  } catch (err) { st.textContent = ERREURS[err.code] || ERREURS[err.message] || 'Ça n’a pas abouti. Réessaie dans un instant.'; }
});
function fermerCompte() { compteOuvert = null; $('[data-compte-fiche]').hidden = true; $('[data-compte-fond]').hidden = true; }

$('[data-comptes]').addEventListener('click', (e) => { const l = e.target.closest('[data-compte]'); if (l) ouvrirCompte(l.dataset.compte); });
$('[data-comptes]').addEventListener('keydown', (e) => { const l = e.target.closest('[data-compte]'); if (l && e.key === 'Enter') ouvrirCompte(l.dataset.compte); });
$('[data-comptes-cherche]').addEventListener('input', listeComptes);
$('[data-comptes-filtres]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtre]'); if (!b) return;
  filtreComptes = b.dataset.filtre;
  $$('[data-filtre]', $('[data-comptes-filtres]')).forEach((x) => x.classList.toggle('is-on', x === b));
  listeComptes();
});
$('[data-comptes-maj]').addEventListener('click', chargerComptes);
$('[data-compte-fermer]').addEventListener('click', fermerCompte);
$('[data-compte-fond]').addEventListener('click', fermerCompte);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('[data-compte-fiche]').hidden) fermerCompte(); });
$('[data-compte-fiche]').addEventListener('click', (e) => { if (e.target.closest('[data-rencontres-aller]')) fermerCompte(); });

$('[data-compte-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, st = $('[data-compte-statut]');
  const profil = Object.fromEntries(['real_first_name', 'display_name', 'gender', 'birth_date', 'city', 'country', 'profile_status'].map((k) => [k, f.elements[k].value]));
  st.textContent = 'Enregistrement…';
  try {
    await api({ action: 'comptes_modifier', user_id: compteOuvert, profil });
    message('Profil enregistré.');
    await chargerComptes();
    $('[data-compte-statut]').textContent = 'Enregistré ✓';
  } catch (err) {
    st.textContent = { 'Une erreur est survenue. Réessaie dans un instant.': 'Vérifie la date de naissance (18 ans minimum) et réessaie.' }[err.message] || err.message;
  }
});
$('[data-compte-fiche]').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-compte-presence]'); if (!b) return;
  if (b.dataset.comptePresence === 'cancelled' && !confirm('Annuler cette inscription ? La personne ne pourra plus entrer à cette soirée (tu pourras la réinscrire).')) return;
  b.disabled = true;
  try { await api({ action: 'comptes_inscription', user_id: compteOuvert, event_id: b.dataset.event, statut: b.dataset.comptePresence }); message('Inscription mise à jour.'); await chargerComptes(); }
  catch (err) { message(err.message, true); b.disabled = false; }
});
$('[data-compte-inscrire]').addEventListener('click', async () => {
  const ev = $('[data-compte-soiree]').value; if (!ev) return;
  try { await api({ action: 'comptes_inscription', user_id: compteOuvert, event_id: ev, statut: 'registered' }); message('Personne inscrite à la soirée.'); await chargerComptes(); }
  catch (err) { message(err.message, true); }
});

// ---------------------------------------------------------------- connexion
async function demarrer() {
  const { data: { session } } = await supabase.auth.getSession();
  token = session?.access_token || null;
  const admin = session?.user?.app_metadata?.role === 'admin';
  $('[data-login]').hidden = admin;
  $('[data-onglets]').hidden = !admin;
  $('[data-moi]').hidden = !session;
  if (session) $('[data-moi-email]').textContent = session.user.email;
  if (session && !admin) message('Ce compte n’a pas le rôle administratrice.', true);
  if (!admin) return;
  if (location.hash.startsWith('#profil-')) { aFaire(); pastilleJournal(); chargerCockpit(); await charger().catch(() => {}); suivreHashProfil(); return; }
  const tab = location.hash.slice(1);
  ouvrir(['accueil', 'activite', 'rencontres', 'comptes', 'application', 'coaching', 'ventes', 'produits', 'soirees', 'bilan', 'alertes', 'textes', 'visites'].includes(tab) ? tab : 'accueil');
  aFaire(); pastilleJournal(); chargerCockpit();
  await charger();
}
$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) { $('[data-login-status]').textContent = 'Email ou mot de passe incorrect.'; return; }
  demarrer();
});
$('[data-deconnexion]').addEventListener('click', async () => { try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 3000))]); } catch {} try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch {} location.reload(); });
supabase.auth.onAuthStateChange((ev, s) => { if (s?.access_token) token = s.access_token; });
demarrer();

// Liste des rubriques du Grenier dans la fiche produit.
{ const sel = $('[data-familles]'); if (sel) sel.insertAdjacentHTML('beforeend', FAMILLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')); }

// ---------------------------------------------------------------- activité des matchs (pilote automatique)
const escA = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const jourA = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
function peindreActivite(d) {
  const c = d.chiffres || {};
  const tuiles = [
    ['Mises en relation en cours', c.en_relation], ['Numéros échangés', c.numeros], ['Propositions envoyées', c.propositions], ['…en attente de réponse', c.propositions_attente],
    ['Les deux ont dit oui', c.propositions_oui], ['Refusées', c.propositions_non], ['Demandes (swipe) en attente', c.demandes_attente], ['Personnes joignables', c.comptes_joignables],
    ['Profils validés', c.profils_valides], ['À vérifier', c.profils_a_verifier], ['Profils pas finis', c.profils_inacheves],
  ];
  $('[data-pilote-chiffres]').innerHTML = tuiles.map(([t, v]) => `<div class="tdb-chiffre"><b>${v ?? 0}</b><span>${escA(t)}</span></div>`).join('');
  const r = d.reglages || {};
  const f = $('[data-pilote-reglages]');
  f.actif.checked = r.actif !== false; f.parPersonne.value = r.parPersonne ?? 3; f.scoreMin.value = r.scoreMin ?? 55;
  $('[data-pilote-statut]').textContent = `${r.actif === false ? '⏸️ Pilote en pause.' : '✅ Pilote actif.'}${r.dernier ? ` Dernier passage le ${new Date(r.dernier.le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} : ${r.dernier.propositions} proposition(s) envoyée(s) à ${r.dernier.personnes} personne(s), ${r.dernier.relations} mise(s) en relation.` : ''}`;
  $('[data-pilote-relations]').innerHTML = (d.relations || []).map((x) => `<li><span><b>${escA(x.a)}</b>${x.actif && x.a_matchs > 1 ? ` <em class="tdb-plusieurs">${x.a_matchs} matchs en cours</em>` : ''} ↔ <b>${escA(x.b)}</b>${x.actif && x.b_matchs > 1 ? ` <em class="tdb-plusieurs">${x.b_matchs} matchs en cours</em>` : ''}<small>${escA(jourA(x.le))}${x.reciproque ? ' · réciproque' : ''}${x.discussion ? ' · discussion ouverte' : ''} · ${escA(x.etat)}</small></span>${x.actif ? `<button type="button" class="link-button" data-dematcher="${escA(x.id)}">Annuler ce match</button>` : ''}</li>`).join('') || '<li>Pas encore de mise en relation.</li>';
  $('[data-pilote-propositions]').innerHTML = (d.propositions || []).map((x) => `<li><span><b>${escA(x.a)}</b> ↔ <b>${escA(x.b)}</b><small>${x.score != null ? `${x.score}/100 · ` : ''}${escA(jourA(x.le))} · ${escA(x.etat)}${x.auto ? ' · auto' : ''}</small></span>${/attente/.test(x.etat) ? `<button type="button" class="link-button" data-retirer-prop="${escA(x.id)}">Retirer</button>` : ''}</li>`).join('') || '<li>Pas encore de proposition. Clique « Envoyer les matchs maintenant ».</li>';
  const att = d.en_attente || [], bv = $('[data-valider-tout]');
  bv.hidden = !att.length; bv.textContent = `✅ Profils en attente (${att.length}) : valider les complets, relancer les autres`;
  bv.title = att.map((a) => `${a.prenom || ''} n° ${a.ref}`).join(', ');
  $('[data-pilote-bloques]').innerHTML = (d.bloques || []).map((x) => `<li><span><b>${escA(x.a)}</b> ↔ <b>${escA(x.b)}</b><small>${escA(x.raison)}</small></span></li>`).join('') || '<li>Rien de bloqué.</li>';
}
async function chargerActivite(corps = { op: 'etat' }) {
  $('[data-pilote-statut]').textContent = 'Chargement…';
  try { const d = await conf({ action: 'annonce_pilote', ...corps }); peindreActivite(d); if (d.lance) $('[data-pilote-statut]').textContent += ` ➜ Envoi fait : ${d.lance.propositions || 0} proposition(s), ${d.lance.relations?.length || 0} mise(s) en relation.`; }
  catch { $('[data-pilote-statut]').textContent = 'L’activité ne se charge pas. Réessaie dans un instant.'; }
}
$('[data-pilote-reglages]')?.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; chargerActivite({ op: 'reglages', actif: f.actif.checked, parPersonne: Number(f.parPersonne.value), scoreMin: Number(f.scoreMin.value) }); });
$('[data-valider-tout]')?.addEventListener('click', async (e) => {
  if (!confirm(`Profils en attente : ${e.target.title}\n\nLes profils complets (photo, email, contact) sont validés. Aucun profil incomplet n’est validé : chacun reçoit un message avec ce qui lui manque, et il sera validé tout seul dès qu’il l’ajoute.`)) return;
  e.target.disabled = true;
  try { const d = await conf({ action: 'annonce_pilote', op: 'valider_tout' }); peindreActivite(d); $('[data-pilote-statut]').textContent = `✅ ${d.valides} profil(s) complet(s) validé(s) · 📝 ${d.relances} profil(s) incomplet(s) prévenu(s) de ce qui manque${d.relations ? ` · ${d.relations} mise(s) en relation faite(s)` : ''}.`; }
  catch { $('[data-pilote-statut]').textContent = 'Ça n’a pas fonctionné. Réessaie.'; }
  e.target.disabled = false;
});
$('[data-pilote-lancer]')?.addEventListener('click', (e) => { e.target.disabled = true; chargerActivite({ op: 'lancer' }).finally(() => { e.target.disabled = false; }); });
document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-dematcher]'), p = e.target.closest('[data-retirer-prop]');
  if (d && confirm('Annuler ce match ? La discussion se ferme et leurs autres choix reviennent.')) chargerActivite({ op: 'dematcher', id: d.dataset.dematcher });
  if (p) chargerActivite({ op: 'retirer_proposition', id: p.dataset.retirerProp });
});

// ---------------------------------------------------------------- coaching Prestige : créneaux et réservations
const ERR_COACHING = { plage_invalide: 'Vérifie le jour et les heures : il faut au moins 15 minutes.', plage_passee: 'Cette plage horaire est déjà passée.', trop_tot: 'La visio s’ouvre 10 minutes avant l’heure.', terminee: 'Cette visio est terminée.', video_indisponible: 'La visio ne s’ouvre pas pour le moment. Réessaie dans un instant.', video_not_configured: 'La clé vidéo Daily manque sur le site.' };
function peindreCoaching(d) {
  const parJour = new Map();
  for (const c of d.creneaux || []) { const k = date(c.debut, { weekday: 'long', day: 'numeric', month: 'long' }); if (!parJour.has(k)) parJour.set(k, []); parJour.get(k).push(c); }
  const passe = (c) => new Date(c.debut).getTime() + 30 * 60e3 < Date.now();
  $('[data-coaching-planning]').innerHTML = [...parJour].map(([k, l]) => `<h3>${esc(k)}</h3><ul class="tdb-retraits">${l.map((c) => `<li><span><b>${esc(date(c.debut, { hour: '2-digit', minute: '2-digit' }))}</b> · ${c.user_id ? `${esc(c.prenom || '')} <small>${esc(c.email || '')}</small>` : '<small>Libre</small>'}</span>${passe(c) ? '' : `<span>${c.user_id ? `<button class="btn btn-ink" type="button" data-coaching-entrer="${esc(c.id)}">Entrer</button> ` : ''}<button class="link-button" type="button" data-coaching-fermer="${esc(c.id)}" data-reserve="${c.user_id ? '1' : ''}">${c.user_id ? 'Annuler' : 'Retirer'}</button></span>`}</li>`).join('')}</ul>`).join('') || '<p>Aucun créneau ouvert pour l’instant.</p>';
  $('[data-coaching-abonnes]').innerHTML = (d.abonnes || []).map((a) => `<li><span><b>${esc(a.nom || a.email)}</b> <small>${a.reserve ? `Visio du mois : ${esc(date(a.reserve))}` : 'Pas encore de visio ce mois-ci'}</small></span></li>`).join('') || '<li>Pas encore d’abonné Prestige actif.</li>';
}
async function chargerCoaching(corps = { action: 'annonce_coaching_planning' }) {
  const st = $('[data-coaching-statut]');
  try { peindreCoaching(await conf(corps)); st.textContent = ''; }
  catch (e) { st.textContent = ERR_COACHING[e.message] || 'Ça n’a pas fonctionné. Réessaie dans un instant.'; }
}
$('[data-coaching-form]')?.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; chargerCoaching({ action: 'annonce_coaching_ouvrir', date: f.date.value, de: f.de.value, a: f.a.value }); });
$('[data-coaching-prevenir]')?.addEventListener('click', async (e) => {
  if (!confirm('Envoyer une notification et un email aux abonnés Prestige qui n’ont pas encore réservé ce mois-ci ?')) return;
  e.target.disabled = true;
  try { const d = await conf({ action: 'annonce_coaching_prevenir' }); $('[data-coaching-statut]').textContent = `${d.prevenus} abonné(s) prévenu(s).`; }
  catch { $('[data-coaching-statut]').textContent = 'L’envoi n’a pas fonctionné. Réessaie.'; }
  e.target.disabled = false;
});
document.addEventListener('click', async (e) => {
  const x = e.target.closest('[data-coaching-fermer]'), v = e.target.closest('[data-coaching-entrer]');
  if (x) { if (x.dataset.reserve && !confirm('Annuler cette visio ? La personne est prévenue et pourra choisir un autre créneau.')) return; chargerCoaching({ action: 'annonce_coaching_fermer', id: x.dataset.coachingFermer }); }
  if (v) {
    const fen = window.open('', '_blank');
    try { const d = await conf({ action: 'annonce_coaching_rejoindre', id: v.dataset.coachingEntrer }); if (fen) fen.location.href = d.url; else location.href = d.url; }
    catch (err) { fen?.close(); $('[data-coaching-statut]').textContent = ERR_COACHING[err.message] || 'La visio ne s’ouvre pas pour le moment.'; }
  }
});
