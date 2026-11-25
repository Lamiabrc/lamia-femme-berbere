// Tableau de bord de Lamia : ventes, produits, soirées, alertes, textes du site, visites.
import { cartesCompleter, carteValider, monterCompleter } from '/completer-profil.js';
import { FAMILLES } from '/assets/rubriques.mjs';
import { createClient } from '/vendor/supabase.mjs';
import { monterFichesAdmin } from '/fiches-admin.js';
import { monterMatchDirect } from '/match-direct.js';
import { rendreModerationPhotos, monterModerationPhotos } from '/moderation-photos.js';

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
const fichesAdmin = monterFichesAdmin({ appel: async (body) => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || session?.user?.app_metadata?.role !== 'admin') throw Object.assign(new Error('forbidden'), {code:'forbidden'});
  const r = await fetch('/api/confidences/', {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const d = await r.json(); if (!r.ok || !d.ok) throw Object.assign(new Error(d.error || 'erreur'), {code:d.error}); return d;
} });

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
const surTelephone = () => matchMedia('(max-width: 760px)').matches;
function ouvrir(tab) {
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  document.body.dataset.onglet = tab;
  { const plus = $('[data-menu-plus]'); if (plus) { const dedans = !!plus.querySelector(`[data-tab="${tab}"]`); plus.classList.toggle('is-actif', dedans); if (surTelephone()) plus.open = false; else if (dedans) plus.open = true; } }
  try { history.replaceState(null, '', `#${tab}`); } catch { /* */ }
  if (tab === 'produits' && !produits.length) { chargerProduits(); chargerReglages(); }
  if (tab === 'textes') chargerTextes();
  if (tab === 'bilan') chargerBilan();
  if (tab === 'application') { chargerJournal(); chargerRecommandes(); chargerModerateurs(); chargerBeta(); }
  if (tab === 'soirees') chargerSalons();
  if (tab === 'activite') chargerActivite();
  if (tab === 'coaching') chargerCoaching();
  if (tab === 'comptes' && !comptes) chargerComptes();
  if (tab === 'comptes') chargerFichesSansCompte();
  if (tab === 'creer-profil') fichesAdmin.ouvrir();
  if (tab === 'match-direct') { matchDirect.ouvrir(aller); aller = ''; }
  if (tab === 'rencontres') { const f = $('[data-rencontres]'); if (f && !f.src) f.src = `/confidences-lamia/?integre=1#${aller || 'annonces'}`; aller = ''; }
  scrollTo({ top: 0 });
}
document.addEventListener('click', (e) => {
  const md = e.target.closest('[data-md-depuis]');
  if (md) { e.preventDefault(); matchDirect.recharger(); aller = md.dataset.mdDepuis; ouvrir('match-direct'); return; }
  const vr = e.target.closest('[data-voir-ref]');
  if (vr && !vr.closest('[data-compte-detail]')) { e.preventDefault(); ouvrirParRef(vr.dataset.voirRef); return; }
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
  $('[data-k="ventes-total"]').textContent = money(v.total_cents + (v.app?.total || 0));
  // L'essentiel en haut de l'accueil : abonnés payants et argent encaissé (appli + boutique).
  if (v.app) {
    $('[data-k="abonnes"]').textContent = String(v.app.abonnes);
    $('[data-k="abonnes-detail"]').textContent = `${money(v.app.par_mois)} par mois s’ils restent`;
  }
  $('[data-k="argent"]').textContent = money((v.total_cents || 0) + (v.app?.total || 0));
  $('[data-k="argent-detail"]').textContent = v.app ? `${money(v.app.mois)} ce mois-ci` : '';
  $('[data-k="ventes-detail"]').textContent = `${v.app ? `${money(v.app.total)} dans l’appli · ${v.app.abonnes} abonné${v.app.abonnes > 1 ? 's' : ''} · ` : ''}${v.nombre} commande${v.nombre > 1 ? 's' : ''} boutique · ${v.payees} à expédier`;
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
    $('[data-genres]').innerHTML = `<div class="repartition" role="img" aria-label="${f} femmes, ${h} hommes"><i style="width:${(f / t) * 100}%;background:#D2482C"></i><i style="width:${(h / t) * 100}%;background:#6C5BA7"></i></div><div class="repartition-legende"><span style="--c:#D2482C">Femmes : ${nb(f)} (${Math.round((f / t) * 100)} %)</span><span style="--c:#6C5BA7">Hommes : ${nb(h)} (${Math.round((h / t) * 100)} %)</span></div>`;
    $('[data-pays]').innerHTML = hbarres(s.pays);
  } catch { $('[data-graphes]').innerHTML = '<p class="aide">Les graphiques ne sont pas disponibles pour le moment. Réessaie dans un instant.</p>'; }
}
document.addEventListener('pointerover', (e) => { const c = e.target.closest?.('[data-bulle]'); if (c) { montrerBulle({ currentTarget: c }, c.dataset.bulle); } else if (bulle) bulle.hidden = true; });
document.addEventListener('click', (e) => { const c = e.target.closest?.('[data-bulle]'); if (c) montrerBulle({ currentTarget: c }, c.dataset.bulle); });
// Les rubriques repliables restent comme Lamia les a laissées.
$$('details[data-repli],details[data-menu-plus]').forEach((d) => {
  if (d.hasAttribute('data-menu-plus') && surTelephone()) return; // Sur téléphone, « Plus » est un volet : toujours fermé à l'arrivée.
  const cle = `tdb-repli-${d.dataset.repli || 'menu'}`;
  try { if (localStorage.getItem(cle) === 'ouvert') d.open = true; } catch { /* */ }
  d.addEventListener('toggle', () => { try { localStorage.setItem(cle, d.open ? 'ouvert' : 'ferme'); } catch { /* */ } });
});

// Sur téléphone, toucher à côté du volet « Plus » le referme.
document.addEventListener('click', (e) => { const plus = $('[data-menu-plus]'); if (plus?.open && surTelephone() && !e.target.closest('[data-menu-plus]')) plus.open = false; });

// ---------------------------------------------------------------- Accueil : la carte (15 nov. 2026, Lamia : plus de « À faire aujourd'hui »).
// Cinq branches : signalements, membres, personnes sous formule, matchs en cours, confidences. Un bouton pour chacune.
let dernierAFaire = null;
async function aFaire() {
  const box = $('[data-carte-actions]');
  if (!box) return;
  try {
    const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'annonce_a_faire' }) });
    const { a_faire: f } = await r.json();
    dernierAFaire = f;
    peindreCarte(f);
    peindreSignalements(f.signalements || [], f.securite || []);
    chargerPhotosAValider();
  } catch { box.innerHTML = '<p class="aide">La carte ne s’affiche pas pour le moment.</p>'; }
}
// La liste des signalements à traiter, sous la carte, ouverte par « Traiter ».
const SECU_GRAVITE = { red: 'Urgent', orange: 'À regarder', yellow: 'Léger' };
// Un signalement envoyé depuis la page « sécurité » : Lamia le lit ici, sans quitter le tableau de bord.
function carteSecurite(r) {
  const ref = r.reported_label ? `<a class="fiche-ref" href="#profil-${esc(r.reported_label)}">n° ${esc(r.reported_label)}</a>` : 'Personne non précisée';
  const etat = r.status === 'reviewing' ? ' · <em>je regarde</em>' : r.status === 'watch' ? ' · <em>à surveiller</em>' : '';
  return `<li data-securite="${esc(r.id)}"><span><strong>${esc(SECU_GRAVITE[r.severity] || '')}</strong> · ${ref} signalé le ${esc(new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}${etat}<br>${r.reason ? `« ${esc(r.reason)} »` : ''}${r.written_details ? `<br>${esc(r.written_details)}` : ''}</span> <span>${r.status === 'reviewing' ? '' : `<button type="button" class="btn btn-line" data-securite-statut="reviewing" data-id="${esc(r.id)}">Je regarde</button> `}<button type="button" class="btn btn-ink" data-securite-statut="resolved" data-id="${esc(r.id)}">C’est traité</button></span></li>`;
}
function peindreSignalements(liste, securite = []) {
  const box = $('[data-carte-signalements]');
  if (!box) return;
  const VOIR = (r) => (r ? `<a class="fiche-ref" href="#profil-${esc(r)}">n° ${esc(r)}</a>` : 'n° ?');
  box.innerHTML = liste.length || securite.length ? `<h2>Signalements à traiter</h2><ul class="fiche-liste">${securite.map(carteSecurite).join('')}${liste.map((s) => `<li data-signalement><span>${VOIR(s.cible_ref)} signalé par ${VOIR(s.auteur_ref)}${s.created_at ? ` le ${esc(new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}` : ''} · ${s.motif ? `« ${esc(s.motif)} »` : '<em>raison non demandée à l’époque (signalement d’avant le 12 nov.)</em>'}</span> <span><a class="btn btn-line" href="#profil-${esc(s.cible_ref)}">Ouvrir</a> <button type="button" class="btn btn-line" data-signalement-traite="${esc(s.id)}">C’est traité</button></span></li>`).join('')}</ul>` : '<p class="aide">Aucun signalement à traiter.</p>';
  if (!liste.length && !securite.length) box.hidden = true;
}
// Photos à valider (23 nov. 2026) : le membre swipe déjà, Lamia regarde ses 2 photos puis « Photos OK » ou « À corriger ».
async function chargerPhotosAValider() {
  const box = $('[data-carte-photos]');
  if (!box) return;
  try { const d = await conf({ action: 'annonce_photos_a_valider' }); peindrePhotosAValider(d.profils || []); }
  catch { box.hidden = true; }
}
// Photo iPhone (HEIC) ou image qui ne s'affiche pas : un message clair et le lien pour l'ouvrir, jamais une image cassée.
const photoNonAffichable = (url) => `<span class="photo-illisible"><strong>Photo iPhone (HEIC)</strong><br>Ton navigateur ne peut pas l’afficher ici.<br><a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir / télécharger</a><br><small>Si tu la juges bonne, « Photos OK ». Sinon « À corriger » pour qu’elle en envoie une autre.</small></span>`;
document.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.dataset?.photoCasse) img.closest('a').outerHTML = photoNonAffichable(img.dataset.photoCasse); }, true);
function peindrePhotosAValider(profils) {
  const box = $('[data-carte-photos]');
  if (!box) return;
  if (!profils.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<h2>Photos à valider (${profils.length})</h2><p class="aide">Le membre peut déjà swiper. Si tu corriges une photo, il a 24 h pour la remplacer, sinon son profil est masqué.</p>
    <ul class="photos-valider">${profils.map((p) => `<li data-photos-valider="${esc(p.ref)}"><div class="photos-valider-tete"><strong>n° ${esc(p.ref)}${p.prenom ? ` · ${esc(p.prenom)}` : ''}</strong><span>${esc([p.genre, p.ville].filter(Boolean).join(' · '))}</span></div>
      <div class="photos-valider-vues">${p.photos.map((f) => (/hei[cf]/i.test(f.mime || '') ? photoNonAffichable(f.url) : `<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="Photo ${esc(f.position)} du profil n° ${esc(p.ref)}" loading="lazy" data-photo-casse="${esc(f.url)}"></a>`)).join('')}</div>
      <div class="photos-valider-actions"><button class="btn btn-ink" type="button" data-photos-ok="${esc(p.ref)}">Photos OK</button><a class="btn btn-line" href="#profil-${esc(p.ref)}">À corriger</a></div><p role="status" data-photos-valider-statut></p></li>`).join('')}</ul>`;
}
// Photos validées depuis une fiche : la carte « Photos à valider » et la liste des membres se mettent à jour tout de suite.
function retirerPhotosAValider(ref) {
  document.querySelector(`[data-photos-valider="${ref}"]`)?.remove();
  const reste = document.querySelectorAll('[data-photos-valider]').length, box = $('[data-carte-photos]');
  if (box && !reste) { box.hidden = true; box.innerHTML = ''; } else if (box) box.querySelector('h2').textContent = `Photos à valider (${reste})`;
  comptes = null;
  chargerComptes().catch(() => {});
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-photos-ok]');
  if (!b || b.disabled) return;
  const li = b.closest('[data-photos-valider]'), st = li.querySelector('[data-photos-valider-statut]');
  b.disabled = true; st.textContent = 'Validation…';
  try {
    await conf({ action: 'annonce_photos_valider', ref: Number(b.dataset.photosOk) });
    retirerPhotosAValider(b.dataset.photosOk);
  } catch { st.textContent = 'Pas validé. Réessaie.'; b.disabled = false; }
});
function peindreCarte(f) {
  const box = $('[data-carte-actions]');
  if (!box) return;
  const s = (n) => (n > 1 ? 's' : '');
  const sig = (f.signalements || []).length + (f.securite || []).length, conf = f.confidences || 0, mc = f.matchs_en_cours || 0, sf = f.sous_formule || 0;
  const nbMembres = comptes ? comptes.comptes.length : null;
  const d = f.sous_formule_detail || {};
  const branches = [
    ['Signalements', sig ? `${sig} signalement${s(sig)} à traiter` : 'Aucun à traiter', sig ? '<button class="btn btn-ink" type="button" data-carte-signalements-ouvrir>Traiter</button>' : ''],
    ['Membres', nbMembres === null ? 'Calcul en cours…' : `${nbMembres} compte${s(nbMembres)}`, '<button class="btn btn-ink" type="button" data-go="comptes">Voir les membres</button>'],
    ['Sous formule', sf ? `${sf} personne${s(sf)}${d.passion || d.prestige ? ` · ${d.passion || 0} Passion, ${d.prestige || 0} Prestige` : ''}` : 'Personne pour l’instant', '<button class="btn btn-ink" type="button" data-rencontres-aller="abonnes">Voir les abonnés</button>'],
    ['Matchs en cours', mc ? `${mc} match${s(mc)} en cours` : 'Aucun match en cours', '<button class="btn btn-ink" type="button" data-rencontres-aller="demandes">Voir, dématcher, matcher</button>'],
    ['Confidences', conf ? `${conf} confidence${s(conf)} attend${conf > 1 ? 'ent' : ''} ta réponse` : 'Aucun message en attente', `<a class="btn ${conf ? 'btn-ink' : 'btn-line'}" href="/confidences-lamia/">${conf ? 'Répondre' : 'Ouvrir'}</a>`],
  ];
  const place = ['1 / 1', '1 / 3', '2 / 3', '3 / 3', '3 / 1'];
  box.innerHTML = `<svg viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true"><g stroke="#cfc4b2" stroke-width=".6" fill="none"><path d="M150 150 L50 40"/><path d="M150 150 L250 40"/><path d="M150 150 L250 150"/><path d="M150 150 L250 260"/><path d="M150 150 L50 260"/></g></svg>
    <div class="carte-noeud"><strong>TAYRI</strong><span>${nbMembres === null ? '' : `${nbMembres} membre${s(nbMembres)}`}</span></div>
    ${branches.map(([t, txt, b], i) => `<div class="carte-branche${(i === 0 && !sig) || (i === 4 && !conf) ? ' is-calme' : ''}" style="grid-area:${place[i]}"><h3>${esc(t)}</h3><p>${esc(txt)}</p>${b}</div>`).join('')}`;
  if (nbMembres === null) (comptes ? Promise.resolve() : chargerComptes()).then(() => { if (dernierAFaire) peindreCarte(dernierAFaire); }).catch(() => {});
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-ouvrir-signalements]')) { e.preventDefault(); ouvrir('accueil'); setTimeout(() => { const b = $('[data-carte-signalements]'); if (b) { b.hidden = false; b.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 300); return; }
  if (e.target.closest('[data-carte-signalements-ouvrir]')) { const b = $('[data-carte-signalements]'); if (b) { b.hidden = false; b.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rencontres-aller]');
  if (!b) return;
  aller = 'annonces'; const f = $('[data-rencontres]'); if (f) f.removeAttribute('src');
  ouvrir('rencontres');
  const cible = b.dataset.rencontresAller;
  if (cible !== 'annonces') setTimeout(() => { try { const el = f.contentWindow.document.querySelector(cible === 'demandes' ? '[data-demandes]' : cible === 'abonnes' ? '[data-abonnes]' : '[data-nouv-form]'); const pli = el?.closest('details'); if (pli) pli.open = true; el?.scrollIntoView({ behavior: 'smooth' }); } catch { /* */ } }, 2500);
});

// ---------------------------------------------------------------- Salons des soirées : confirmer une date, suivre les inscrits
async function chargerSalons() {
  const box = $('[data-salons-admin]');
  if (!box) return;
  let d;
  try { d = await conf({ action: 'salon_admin' }); } catch { box.innerHTML = '<p>Les salons ne s’affichent pas pour le moment.</p>'; return; }
  const aValider = d.a_valider.length ? d.a_valider.map((e) => `<form class="salon-valider" data-salon-confirmer="${esc(e.id)}"><h3>${esc(e.nom)}</h3><p>${e.femmes} femmes et ${e.hommes} hommes attendent : <b>${e.retenus} + ${e.retenus}</b> seront invités.</p>${e.sondage ? `<p class="aide">Sondage : <b>${e.sondage.weekend}</b> week-end · <b>${e.sondage.semaine}</b> semaine · <b>${e.sondage.indifferent}</b> peu importe</p>` : ''}<label>Date et heure (heure de Paris)<input type="datetime-local" name="date" value="${esc(e.date)}" required></label><label class="salon-gratuit-case"><input type="checkbox" name="gratuit"${e.gratuit ? ' checked' : ''}> Soirée gratuite</label><button class="btn btn-ink" type="submit">Confirmer le salon</button><p class="aide" data-salon-msg></p></form>`).join('') : `<p>Aucun salon à confirmer. Une proposition arrive dès ${d.seuil} femmes et ${d.seuil} hommes dans un même secteur.</p>`;
  const conf2 = d.confirmes.map((e) => `<p class="ligne"><span><b>${esc(e.nom)}</b><br><small>${esc(e.quand)}${e.gratuit ? ' · gratuite' : ''}</small></span><span>${e.femmes} F + ${e.hommes} H<br><small>en attente de validation : ${e.attente_f} F, ${e.attente_h} H</small></span></p>${(e.a_offrir || []).map((x) => `<p class="ligne"><span>${esc(x.prenom)}, en Algérie : pas de paiement en ligne</span><button type="button" class="btn btn-line" data-salon-offrir="${esc(x.id)}">Offrir sa place</button></p>`).join('')}`).join('');
  const lignes = d.options.filter((o) => o.femmes || o.hommes).map((o) => `<tr><td>${esc(o.salon)}</td><td>${esc(o.secteur)}</td><td>${o.femmes}</td><td>${o.hommes}</td></tr>`).join('');
  const parSalon = (d.salons || []).map((x) => `<p class="ligne"><span><b>${esc(x.nom)}</b><br><small>Places restantes : ${x.places.femmes} femmes · ${x.places.hommes} hommes</small></span><span>Sondage<br><small>${x.sondage.weekend} week-end · ${x.sondage.semaine} semaine · ${x.sondage.indifferent} peu importe</small></span></p>`).join('');
  box.innerHTML = `${parSalon ? `<h2>Places et sondage</h2>${parSalon}` : ''}<h2>Salons à confirmer</h2>${aValider}${conf2 ? `<h2>Salons confirmés</h2>${conf2}` : ''}<h2>Inscrits en attente</h2>${lignes ? `<div class="tdb-table"><table><thead><tr><th>Salon</th><th>Secteur</th><th>Femmes</th><th>Hommes</th></tr></thead><tbody>${lignes}</tbody></table></div>` : '<p>Personne pour le moment.</p>'}<p class="aide">Lien à partager, toujours actif : <b>lamia-femme-berbere.com/speed-dating/inscription/</b></p><h2>Toutes les soirées</h2>`;
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
monterCompleter({ appel: (body) => conf(body), recharger: (ref) => ouvrirParRef(ref) });
const matchDirect = monterMatchDirect({ appel: (body) => conf(body), voirProfil: (ref) => ouvrirParRef(ref) });
const conf = async (body) => { const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || 'erreur'), { code: d.error, texte: d.message, manques: d.manques }); return d; };

// Les fiches créées par Lamia (« Créer un profil ») n'ont pas de compte : elles sont listées ici pour les retrouver.
const ETAT_FICHE = { en_attente: 'attend sa confirmation', confirmee: 'confirmée', retiree: 'retirée' };
async function chargerFichesSansCompte() {
  const zone = $('[data-fiches-sans-compte]'); if (!zone) return;
  try {
    const r = await conf({ action: 'annonce_fiches_admin' });
    const l = (r.fiches || []).filter((f) => f.confirmation !== 'retiree' && !f.compte);
    if (!l.length) { zone.hidden = true; return; }
    zone.hidden = false;
    zone.innerHTML = `<h2 style="margin-top:0">Fiches créées par toi, sans compte (${l.length}${r.suivant ? '+' : ''})</h2><p class="aide">Clique sur une fiche pour l’ouvrir : compléter ses infos, la matcher.</p>
      <div class="membres-grille">${l.map((f) => `<button type="button" class="membre-carte" data-voir-ref="${esc(f.ref)}"><strong>${esc(f.pseudo || `Fiche ${f.ref}`)}</strong> <span>n° ${esc(f.ref)}</span><br><small>${esc(f.genre === 'femme' ? 'Femme' : 'Homme')} · ${esc(f.age ?? '?')} ans · ${esc([f.ville, f.pays].filter(Boolean).join(', '))}</small><br><small>${esc(ETAT_FICHE[f.confirmation] || '')}</small></button>`).join('')}</div>`;
  } catch { zone.hidden = true; }
}
async function pastilleJournal() {
  try { const d = await conf({ action: 'annonce_journal', categorie: 'aucune' }); $$('[data-journal-pastille]').forEach((p) => { p.textContent = d.non_lus; p.hidden = !d.non_lus; }); } catch { /* */ }
}
// ---------------------------------------------------------------- Un membre par son numéro (les mêmes gestes que dans l'outil)
const NOM_FORMULE = { passion: 'Passion', prestige: 'Prestige', coeur: 'Cœur' };
const ERR_MEMBRE = { not_found: 'Aucun profil avec ce numéro.', injoignable: 'Cette personne n’a pas de compte sur le site : impossible d’ici.', offre_moderateur: 'Sa formule vient de son rôle de modérateur : elle se gère dans « Mes modérateurs » (page Application).', empty: 'Écris un message ou choisis un bouton.' };
let membreVu = null;
function dessinerMembre() {
  const box = $('[data-membre-fiche]'), m = membreVu;
  if (!box) return;
  if (!m) { box.innerHTML = ''; return; }
  const lignes = [
    [m.genre, m.age ? `${m.age} ans` : '', [m.ville, m.pays].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    `Profil : ${m.profil}${m.pause ? ' · en pause' : ''}${m.bloque ? ' · bloqué' : ''}${m.en_match ? ' · en match' : ''}`,
    `Formule : ${m.formule ? `${NOM_FORMULE[m.formule] || m.formule}${m.formule_offerte ? ' (offerte)' : ''}${m.resiliation_prevue ? ' · résiliation prévue' : ''}` : 'aucune'}`,
    m.compte ? (m.telephones ? 'Notifications activées sur son téléphone' : 'Notifications pas activées') : 'Pas de compte sur le site',
    m.erreurs.length ? `${m.erreurs.length} problème(s) rencontré(s) sur le site en 3 jours` : '',
  ].filter(Boolean);
  const offre = (f) => `<button type="button" data-membre-offrir="${f}"${m.formule_offerte && m.formule === f ? ' class="is-on"' : ''}>${NOM_FORMULE[f]}</button>`;
  box.innerHTML = `<div class="tdb-membre-fiche">
    <h3>${esc(m.prenom || 'Sans prénom')} · <a class="fiche-ref" href="#profil-${esc(m.ref)}">n° ${esc(m.ref)}</a>${m.autre_ref ? ` <span class="aide">(aussi n° ${esc(m.autre_ref)} dans l’outil)</span>` : ''}</h3>
    <ul>${lignes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    ${m.joignable ? `<label>Lui écrire<textarea data-membre-texte rows="3" placeholder="Ton message (il arrive dans sa conversation privée avec toi)"></textarea></label>
    <div class="tdb-filtres-journal"><button type="button" data-membre-envoyer="">Envoyer le message</button><button type="button" data-membre-envoyer="abonnement">Envoyer avec le bouton « Abonnement »</button><button type="button" data-membre-envoyer="profil">Envoyer avec le bouton « Compléter mon profil »</button></div>
    <div class="tdb-filtres-journal"><span>Offrir une formule :</span>${offre('passion')}${offre('prestige')}${m.formule_offerte ? '<button type="button" data-membre-offrir="">Reprendre</button>' : ''}${m.formule && !m.formule_offerte ? `<span class="aide">il paie déjà ${esc(NOM_FORMULE[m.formule] || m.formule)} : son abonnement reste prioritaire</span>` : ''}</div>` : '<p class="aide">Cette personne n’a pas de compte sur le site : on ne peut ni lui écrire ni lui offrir une formule d’ici.</p>'}
    <form data-membre-matcher class="tdb-filtres-journal"><span>Mettre en relation avec le n°</span><input name="b" inputmode="numeric" pattern="[0-9]+" required aria-label="Numéro de l’autre personne"> <button type="submit">Matcher</button></form>
  </div>`;
}
async function voirMembre(ref) {
  membreVu = (await conf({ action: 'live_outil_membre', ref: Number(ref) })).membre;
  dessinerMembre();
}
const ditMembre = (t) => { const st = $('[data-membre-statut]'); if (st) st.textContent = t; };
const erreurMembre = (err) => ditMembre(err.texte || ERR_MEMBRE[err.code] || 'Ça n’a pas fonctionné. Réessaie dans un instant.');
document.addEventListener('submit', async (e) => {
  if (e.target.matches('[data-membre-chercher]')) {
    e.preventDefault();
    ditMembre(''); membreVu = null; dessinerMembre();
    try { await voirMembre(e.target.ref.value); } catch (err) { erreurMembre(err); }
  }
  if (e.target.matches('[data-membre-matcher]')) {
    e.preventDefault();
    if (!membreVu) return;
    try { const d = await conf({ action: 'outil_matcher', a: membreVu.ref, b: Number(e.target.b.value) }); ditMembre(`Mis en relation : ${d.fait || ''}.`); e.target.reset(); }
    catch (err) { erreurMembre(err); }
  }
});
document.addEventListener('click', async (e) => {
  const env = e.target.closest('[data-membre-envoyer]'), off = e.target.closest('[data-membre-offrir]');
  if ((!env && !off) || !membreVu) return;
  const m = membreVu, b = env || off;
  b.disabled = true;
  try {
    if (env) {
      const zone = $('[data-membre-texte]'), bouton = env.dataset.membreEnvoyer;
      const d = await conf({ action: 'live_outil_membre_ecrire', ref: m.ref, texte: zone.value, ...(bouton ? { bouton } : {}) });
      zone.value = '';
      ditMembre(`Envoyé à ${m.prenom || `n° ${m.ref}`}. ${d.telephones ? 'Notification envoyée sur son téléphone.' : 'Pas de notification sur son téléphone (elles ne sont pas activées) : il le verra dans sa conversation.'}`);
    } else {
      const f = off.dataset.membreOffrir;
      await conf({ action: 'live_outil_membre_formule', ref: m.ref, formule: f });
      await voirMembre(m.ref);
      ditMembre(f ? `Formule ${NOM_FORMULE[f]} offerte à ${m.prenom || `n° ${m.ref}`}. Il ne le sait pas encore : un message est prêt, à toi de l’envoyer.` : 'Formule offerte reprise.');
      const zone = $('[data-membre-texte]');
      if (f && zone && !zone.value) zone.value = `Bonne nouvelle : je t’offre la formule ${NOM_FORMULE[f]}. Elle est déjà active sur ton compte.`;
    }
  } catch (err) { erreurMembre(err); }
  b.disabled = false;
});

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
  try { await conf({ action: 'annonce_recommander', ref: e.target.ref.value, oui: true }); st.textContent = `Profil n° ${e.target.ref.value} recommandé.`; e.target.reset(); chargerRecommandes(); }
  catch { st.textContent = 'Ce numéro de profil est introuvable.'; }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-reco-retirer]');
  if (!b) return;
  b.disabled = true;
  try { await conf({ action: 'annonce_recommander', ref: b.dataset.recoRetirer, oui: false }); chargerRecommandes(); } catch { b.disabled = false; }
});

// ---------------------------------------------------------------- Modérateurs et bêta-testeurs
// Un profil par son numéro : où il en est, puis « Modérateur ? » et « Formule offerte », enregistrés ensemble (15 nov. 2026).
const NOMS_F = { passion: 'Passion', prestige: 'Prestige', coeur: 'Cœur' };
function dessinerModFiche(p) {
  const box = $('[data-mod-fiche]');
  if (!box) return;
  const radio = (name, v, label, on) => `<label class="tdb-choix"><input type="radio" name="${name}" value="${v}"${on ? ' checked' : ''}> ${label}</label>`;
  box.innerHTML = `<form class="tdb-membre-fiche" data-mod-definir="${esc(p.num)}">
    <h3>${esc(p.prenom || 'Sans prénom')} · <a class="fiche-ref" href="#profil-${esc(p.num)}">n° ${esc(p.num)}</a>${p.fiche ? ` <span class="aide">(fiche du live n° ${esc(p.fiche)})</span>` : ''}</h3>
    <ul>
      <li>${esc([p.genre, p.age ? `${p.age} ans` : '', [p.ville, p.pays].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</li>
      <li>Profil : <b>${esc(p.etat)}</b>${p.pause ? ' · en pause' : ''}</li>
      <li>Compte sur le site : <b>${p.compte ? 'oui' : 'non (la formule ne pourra pas être offerte)'}</b></li>
      <li>Modérateur : <b>${p.moderateur ? 'oui' : 'non'}</b></li>
      <li>Formule : <b>${p.abonnement ? `${esc(NOMS_F[p.abonnement] || p.abonnement)} (payée)` : p.formule_offerte ? `${esc(NOMS_F[p.formule_offerte] || p.formule_offerte)} (offerte)` : 'Découverte (gratuite)'}</b></li>
    </ul>
    <p><strong>Est-ce un modérateur ?</strong> ${radio('moderateur', 'oui', 'Oui', p.moderateur)} ${radio('moderateur', 'non', 'Non', !p.moderateur)}</p>
    <p><strong>Formule offerte :</strong> ${radio('formule', '', 'Aucune', !p.formule_offerte)} ${radio('formule', 'passion', 'Passion', p.formule_offerte === 'passion')} ${radio('formule', 'prestige', 'Prestige', p.formule_offerte === 'prestige')}</p>
    ${p.abonnement ? '<p class="aide">Elle a un abonnement payé : il reste prioritaire, rien n’est touché.</p>' : ''}
    <p><button type="submit" class="btn btn-ink">Enregistrer</button></p></form>`;
}
async function ouvrirModFiche(ref) {
  const st = $('[data-mod-statut]'); if (st) st.textContent = '';
  try { const { profil } = await conf({ action: 'annonce_moderateur_etat', ref: Number(ref) }); dessinerModFiche(profil); $('[data-mod-fiche]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  catch (err) { const box = $('[data-mod-fiche]'); if (box) box.innerHTML = ''; if (st) st.textContent = err.texte || 'Aucun profil avec ce numéro.'; }
}
document.addEventListener('submit', async (e) => {
  if (e.target.matches('[data-mod-chercher]')) { e.preventDefault(); ouvrirModFiche(e.target.ref.value); }
  if (e.target.matches('[data-mod-definir]')) {
    e.preventDefault();
    const f = e.target, st = $('[data-mod-statut]'), btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { profil } = await conf({ action: 'annonce_moderateur_definir', ref: Number(f.dataset.modDefinir), moderateur: f.moderateur.value === 'oui', formule: f.formule.value });
      dessinerModFiche(profil); chargerModerateurs();
      if (st) st.textContent = `Enregistré : n° ${profil.num} ${profil.moderateur ? 'est modérateur' : 'n’est pas modérateur'}${profil.formule_offerte ? `, formule ${NOMS_F[profil.formule_offerte]} offerte` : ', sans formule offerte'}.`;
    } catch (err) { btn.disabled = false; if (st) st.textContent = err.texte || 'Ça n’a pas fonctionné. Réessaie.'; }
  }
});
document.addEventListener('click', (e) => { const b = e.target.closest('[data-mod-ouvrir]'); if (b) ouvrirModFiche(b.dataset.modOuvrir); });
async function chargerModerateurs() {
  const box = $('[data-mod-liste]');
  if (!box) return;
  try {
    const { moderateurs = [] } = await conf({ action: 'annonce_moderateurs' });
    const lignes = [
      ...moderateurs.map((p) => `<tr><td>${p.prenom ? `<b>${esc(p.prenom)}</b>` : '<span class="aide">sans prénom</span>'}</td><td><a class="fiche-ref" href="#profil-${esc(p.num)}">n° ${esc(p.num)}</a></td><td>${esc(p.ville || '')}</td><td>${p.formule ? esc(p.formule === 'prestige' ? 'Prestige' : 'Passion') : '<span class="aide">aucune</span>'}</td><td><button type="button" data-mod-ouvrir="${esc(p.num)}">Modifier</button></td></tr>`),
    ];
    box.innerHTML = lignes.join('') || '<tr><td colspan="5">Aucun modérateur pour l’instant.</td></tr>';
  } catch { box.innerHTML = '<tr><td colspan="5">La liste ne s’affiche pas pour le moment.</td></tr>'; }
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
  if (e.target.matches('[data-beta-form]')) {
    e.preventDefault();
    const st = $('[data-beta-statut]');
    const refs = (e.target.refs.value.match(/\d+/g) || []).map(Number);
    if (!refs.length) return;
    try { const r = await conf({ action: 'annonce_beta_inviter', refs }); st.textContent = `${r.invites.length} invité(s)${r.deja.length ? `, ${r.deja.length} déjà invité(s)` : ''}${r.sansCompte.length ? `, sans compte : ${r.sansCompte.join(', ')}` : ''}.`; e.target.reset(); chargerBeta(); }
    catch { st.textContent = 'L’envoi n’a pas fonctionné.'; }
  }
});

// Journal : pas de liste sans fin. 12 lignes, puis « Afficher plus ».
function replierJournal(box, max = 12) {
  const l = [...box.querySelectorAll('li.tdb-evt')];
  if (l.length <= max) return;
  const cachees = [...box.children].slice([...box.children].indexOf(l[max]));
  cachees.forEach((x) => { x.hidden = true; });
  const li = document.createElement('li');
  li.className = 'tdb-plus-ligne';
  li.innerHTML = `<button type="button" class="btn btn-line">Afficher plus (${l.length - max})</button>`;
  li.firstChild.addEventListener('click', () => { cachees.forEach((x) => { x.hidden = false; }); li.remove(); });
  box.append(li);
}
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
    replierJournal(box);
    // Seulement ce qui demande une action (Lamia, 17 nov. 2026 : « pourquoi j'ai plein de notifications effacées ? »).
    const aFaire = d.retraits.filter((r) => r.effacement && !r.fait), faits = d.retraits.length - aFaire.length;
    $('[data-retraits]').innerHTML = aFaire.map((r) => `<li><span>${r.source === 'fiche' ? 'Fiche' : 'Profil'} n° ${r.ref} · ${r.genre === 'femme' ? 'femme' : 'homme'}${r.age ? `, ${r.age} ans` : ''}${r.lieu ? `, ${esc(r.lieu)}` : ''}<br><small>${esc(date(r.quand))} · ${r.effacement ? (r.fait ? 'effacée ✓' : '<b>veut être effacée de ton outil</b>') : 'ne veut plus apparaître sur le site (reste dans ton outil)'}</small></span>${r.effacement && !r.fait ? `<button type="button" class="btn btn-ink" data-effacement-fait="${r.ref}">C’est fait</button>` : ''}</li>`).join('') + (faits ? `<li><small>${faits} déjà traité${faits > 1 ? 's' : ''} : rien à faire.</small></li>` : '') || '<li>Rien à faire.</li>';
    $('[data-appareils]').textContent = `Tes appareils qui reçoivent les alertes : ${d.appareils.lamia}. Membres abonnés aux notifications : ${d.appareils.membres}.`;
    $('[data-notifs-lamia]').innerHTML = Object.entries(cats).map(([k, c]) => `<label><input type="checkbox" name="${k}" ${d.notifs[k] ? 'checked' : ''}> <span>${c.emoji} ${esc(c.nom)}</span></label>`).join('') + '<p class="aide">Enregistré dès que tu coches. Les « matchs demandés » restent visibles ici et dans « Aujourd’hui ».</p>';
    chargerDiscussions();
    if (d.non_lus) { await conf({ action: 'annonce_journal_lu' }).catch(() => {}); $$('[data-journal-pastille]').forEach((p) => { p.hidden = true; }); }
  } catch { box.innerHTML = '<li>Le journal ne s’affiche pas pour le moment.</li>'; }
}
document.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-filtre-journal]');
  if (f) { filtreJournal = f.dataset.filtreJournal; chargerJournal(); return; }
  const o = e.target.closest('[data-journal-ouvrir]');
  if (o) { const l = o.dataset.journalOuvrir; if (/^\/confidences-lamia\/#(annonces|testeurs)/.test(l)) { aller = l.split('#')[1].startsWith('testeurs') ? 'testeurs' : 'annonces'; const fr = $('[data-rencontres]'); if (fr) fr.removeAttribute('src'); ouvrir('rencontres'); } else if (/^\/tableau-de-bord\/?#/.test(l)) { const h = l.slice(l.indexOf('#')); if (location.hash === h) suivreHashProfil(); else location.hash = h; } else window.open(l, '_blank', 'noopener'); return; }
  const sec = e.target.closest('[data-securite-statut]');
  if (sec) { sec.disabled = true; try { await conf({ action: 'annonce_securite_statut', id: sec.dataset.id, statut: sec.dataset.securiteStatut }); message(sec.dataset.securiteStatut === 'resolved' ? 'Signalement noté comme traité.' : 'Noté : tu regardes ce signalement.'); aFaire(); } catch { sec.disabled = false; message('Le changement n’a pas pu être noté.', true); } return; }
  const st = e.target.closest('[data-signalement-traite]');
  if (st) { const ligne = st.closest('[data-signalement]'); st.disabled = true; try { await conf({ action: 'annonce_signalement_traite', id: st.dataset.signalementTraite }); if (ligne) ligne.remove(); message('Signalement noté comme traité.'); aFaire(); } catch { st.disabled = false; message('Le signalement n’a pas pu être noté.', true); } return; }
  const ef = e.target.closest('[data-effacement-fait]');
  if (ef) {
    if (!confirm(`Tu as bien supprimé la fiche n° ${ef.dataset.effacementFait} de ton outil ? Son contenu sera aussi effacé du site.`)) return;
    try { await conf({ action: 'annonce_effacement_fait', ref: Number(ef.dataset.effacementFait) }); message('Effacement noté.'); chargerJournal(); } catch { message('L’effacement n’a pas pu être noté.', true); }
  }
});
const ETATS_DISC = { ouverte: 'en cours', numeros: 'numéros échangés', terminee: 'terminée sans échange', dematch: 'dématché', signalee: 'signalée' };
async function chargerDiscussions(id = null) {
  const box = $('[data-discussions]');
  try {
    const d = await conf({ action: 'annonce_discussions_admin', id });
    box.innerHTML = d.discussions.map((x) => `<li><span>n° ${x.a_ref} ${esc(x.a_prenom || '')} ↔ n° ${x.b_ref} ${esc(x.b_prenom || '')}<br><span class="etat-pastel is-${esc(x.etat)}">${esc(ETATS_DISC[x.etat] || x.etat)}</span> <small>${x.messages} message(s) · depuis le ${esc(date(x.ouverte_at, { day: 'numeric', month: 'short' }))}</small></span>${x.lamia_invitee ? ' <span class="etat-pastel is-invitee">tu es invitée</span>' : ''}${x.etat === 'signalee' || x.lamia_invitee ? `<button type="button" class="btn btn-ink" data-lire-discussion="${esc(x.id)}">${x.lamia_invitee ? 'Lire et répondre' : 'Lire'}</button>` : ''}</li>`).join('') || '<li>Aucune discussion pour le moment.</li>';
    const lue = $('[data-discussion-lue]');
    if (d.messages) { const x = d.discussions.find((y) => y.id === id); lue.hidden = false; lue.innerHTML = `<h3>${x?.lamia_invitee ? 'Discussion où tu es invitée' : 'Discussion signalée'}</h3>${d.messages.map((m) => `<p><small><b>${esc(m.qui)}</b> · ${esc(date(m.created_at))}</small><br>${esc(m.texte)}</p>`).join('') || '<p>Aucun message.</p>'}${x?.lamia_invitee ? `<form class="tdb-filtres-journal" data-lamia-ecrire="${esc(x.id)}"><textarea name="texte" rows="3" maxlength="2000" required placeholder="Ton message, comme une wali…" style="width:100%"></textarea><button type="submit" class="btn btn-ink">Envoyer</button></form>` : ''}`; void x; }
  } catch { box.innerHTML = '<li>Les discussions ne s’affichent pas pour le moment.</li>'; }
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-lire-discussion]'); if (b) chargerDiscussions(b.dataset.lireDiscussion); });
// Lamia répond dans une discussion où elle a été invitée (20 €) : les deux sont prévenus.
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-lamia-ecrire]');
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('button'); btn.disabled = true;
  try { await conf({ action: 'annonce_discussion_lamia_ecrire', id: f.dataset.lamiaEcrire, texte: f.texte.value }); message('Ton message est parti, les deux sont prévenus.'); chargerDiscussions(f.dataset.lamiaEcrire); }
  catch { btn.disabled = false; message('Le message n’est pas parti. Réessaie.', true); }
});
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
function ventesAppli() {
  const a = data.ventes.app;
  const k = (t, v, d, go = '') => `<div class="kpi"><span>${esc(t)}</span><strong>${esc(v)}</strong><small>${esc(d)}</small></div>`;
  if (!a) { $('[data-app-kpis]').innerHTML = k('Ventes de l’appli', '—', 'Les chiffres ne se chargent pas. Réessaie dans un instant.'); return; }
  $('[data-app-kpis]').innerHTML = k('Encaissé dans l’appli', money(a.total), 'Abonnements, unité, soirées') + k('Ce mois-ci', money(a.mois), 'Dans l’appli') + k('Abonnés actifs', String(a.abonnes), a.a_traiter ? `${a.a_traiter} paiement(s) à régulariser` : 'Aucun paiement en retard') + k('Revenu mensuel', money(a.par_mois), 'Si tous les abonnés restent') + k('Boutique', money(data.ventes.total_cents), `${data.ventes.nombre} commande(s)`);
  $('[data-app-formules]').innerHTML = a.formules.map((f) => `<tr><td>${esc(f.nom)}</td><td>${esc(f.abonnes)}</td><td>${money(f.par_mois)}</td></tr>`).join('');
  $('[data-app-services]').innerHTML = a.services.map((s) => `<tr><td>${esc(s.service)}</td><td>${esc(s.ventes)}</td><td>${money(s.mois)}</td><td>${money(s.montant)}</td></tr>`).join('') || '<tr><td colspan="4">Pas encore de vente.</td></tr>';
  const f = $('[data-app-filtre]').value;
  $('[data-app-lignes]').innerHTML = a.lignes.filter((l) => !f || l.famille === f).map((l) => `<tr><td>${esc(date(l.date))}</td><td>${esc(l.service)}${l.detail ? `<br><small>${esc(l.detail)}</small>` : ''}${l.quantite > 1 ? ` × ${esc(l.quantite)}` : ''}</td><td>${esc(l.client)}</td><td>${money(l.montant)}</td></tr>`).join('') || '<tr><td colspan="4">Rien pour l’instant.</td></tr>';
  $('[data-app-livrer]').hidden = !a.a_livrer.length;
  $('[data-app-livrer-liste]').innerHTML = a.a_livrer.map((u) => `<li><span><b>${esc(u.service)}</b>${u.reste > 1 ? ` × ${esc(u.reste)}` : ''} <small>${esc(u.client)} · ${esc(date(u.date))}</small></span><button class="btn btn-line" type="button" data-app-fait="${esc(u.id)}">Fait</button></li>`).join('');
}
$('[data-app-filtre]')?.addEventListener('change', ventesAppli);
$('[data-app-livrer-liste]')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-app-fait]');
  if (!b) return;
  b.disabled = true;
  try { await conf({ action: 'annonce_unite_utiliser', id: b.dataset.appFait }); await charger(); }
  catch { message('Ça n’a pas été enregistré. Réessaie.', true); b.disabled = false; }
});
function ventes() {
  ventesAppli();
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
      <td>${['paid', 'fulfilled'].includes(o.status) && (o.order_items || []).some((x) => x.products?.product_type === 'digital') ? `<button class="btn btn-line" type="button" data-envoyer-ebook="${esc(o.id)}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> Envoyer le livre</button><br>` : ''}<select data-statut="${esc(o.id)}" class="statut-select is-${esc(o.status)}">${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">Aucune commande pour ce filtre.</td></tr>';
}
$('[data-filtre-ventes]').addEventListener('change', ventes);
$('[data-ventes]').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-envoyer-ebook]');
  if (!b) return;
  b.disabled = true; b.textContent = 'Envoi…';
  try { await api({ action: 'envoyer_ebook', id: b.dataset.envoyerEbook }); b.textContent = '✓ Livre envoyé'; message('Le lien de téléchargement est parti par email.'); }
  catch (err) { b.disabled = false; b.textContent = 'Envoyer le livre'; message(err.message, true); }
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
  const drapeau = (c) => (/^[A-Z]{2}$/.test(c || '') ? String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '');
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
// Un seul état par compte (calculé par le serveur) : validé, en cours, ou en attente d'une action précise du membre.
const LIBELLE_ETAT = { valide: 'Validé', photos_a_valider: 'Photo à valider par toi', att_email: 'Attend : confirmer son e-mail', att_profil: 'Attend : créer son profil', att_photos: 'Attend : ses 2 photos', att_fiche: 'Attend : confirmer sa fiche du live', att_corriger_photos: 'Attend : corriger ses photos', suspendu_photos: 'Suspendu (photos)', en_cours: 'En cours : profil à vérifier', pause: 'En pause', retire: 'Retiré ou bloqué', admin: 'Toi (admin)' };
// Couleur de la carte : vert tout est bon, jaune photo à valider (la personne peut swiper), bleu attend le membre, rouge suspendu ou bloqué, gris en pause.
const COULEUR_ETAT = { valide: 'vert', photos_a_valider: 'jaune', att_email: 'bleu', att_profil: 'bleu', att_photos: 'bleu', att_fiche: 'bleu', att_corriger_photos: 'bleu', en_cours: 'bleu', suspendu_photos: 'rouge', retire: 'rouge', pause: 'gris', admin: 'gris' };
const GROUPES_ETAT = { 'e:valide': (c) => c.etat === 'valide', 'e:avalider': (c) => c.etat === 'photos_a_valider', 'e:attente': (c) => /^att_/.test(c.etat), 'e:suspendu': (c) => c.etat === 'suspendu_photos', 'e:encours': (c) => c.etat === 'en_cours', 'e:autre': (c) => ['pause', 'retire'].includes(c.etat) };
let filtreComptes = 'tous', compteOuvert = null, limiteComptes = 24;

const ageDe = (birth) => {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00Z`), d = new Date();
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a;
};
const nomDe = (c) => c.prenom || '(sans prénom)';
const incomplet = (c) => !c.profil || !c.profil.gender || (!c.profil.birth_date && c.age_fiche == null) || !(c.profil.real_first_name || c.profil.display_name || c.prenom);
const salonCourt = (s) => String(s || '').replace(/^Grand salon · /, '');

async function chargerComptes() {
  $('[data-comptes]').innerHTML = '<p class="aide">Chargement…</p>';
  try { comptes = await api({ action: 'comptes_liste' }); }
  catch (e) { $('[data-comptes]').innerHTML = `<p class="aide">${esc(e.message)}</p>`; return; }
  const l = comptes.comptes;
  const kpi = (t, n, s) => `<div class="kpi"><span>${t}</span><strong>${n}</strong>${s ? `<small>${s}</small>` : ''}</div>`;
  $('[data-comptes-kpis]').innerHTML = [
    kpi('Comptes', l.length, `${l.filter((c) => c.profil?.gender === 'femme').length} femmes · ${l.filter((c) => c.profil?.gender === 'homme').length} hommes`),
    kpi('Inscrits à une soirée', l.filter((c) => c.inscriptions.some((i) => i.statut !== 'cancelled')).length),
    kpi('Avec annonce', l.filter((c) => c.annonces.length).length),
    kpi('Email non confirmé', l.filter((c) => c.etat === 'att_email').length, 'à relancer quand les emails repartent'),
    kpi('Testeurs Google Play', l.filter((c) => c.testeur_play).length, `${l.filter((c) => c.testeur_play && !c.testeur_play.ajoute_at).length} à ajouter à la liste`),
    kpi('Sans profil', l.filter((c) => c.sans_profil).length, 'à relancer ou à supprimer'),
  ].join('');
  for (const [k, f] of Object.entries(GROUPES_ETAT)) { const b = $(`[data-filtre="${k}"]`); if (b) b.dataset.n = String(l.filter(f).length); if (b) b.textContent = `${b.dataset.nom || b.textContent.replace(/ \(\d+\)$/, '')} (${b.dataset.n})`; }
  encartSansProfil();
  listeComptes();
  if (compteOuvert) ouvrirCompte(compteOuvert);
}

// L'ordre de la liste affichée : « Suivant » ouvre la fiche d'après sans revenir à la liste (Lamia, 15 nov. 2026).
let ordreComptes = [];
function boutonsSuivant() {
  const k = ordreComptes.indexOf(compteOuvert);
  const prec = $('[data-compte-prec]'), suiv = $('[data-compte-suiv]');
  if (prec) prec.hidden = k <= 0;
  if (suiv) { suiv.hidden = k < 0 || k >= ordreComptes.length - 1; suiv.textContent = k >= 0 ? `Suivant (${k + 2}/${ordreComptes.length}) →` : 'Suivant →'; }
}
function listeComptes() {
  if (!comptes) return;
  const q = $('[data-comptes-cherche]').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const garde = {
    tous: () => true,
    ...GROUPES_ETAT,
    soiree: (c) => c.inscriptions.some((i) => i.statut !== 'cancelled'),
    annonce: (c) => c.annonces.length,
    fiche: (c) => c.fiches.length,
    testeur: (c) => c.testeur_play,
    incomplet,
    sansprofil: (c) => c.sans_profil,
  }[filtreComptes];
  const l = comptes.comptes.filter(garde).filter((c) => !q || [nomDe(c), c.email, c.profil?.city, c.profil?.display_name, ...c.annonces.map((a) => a.ref), ...c.annonces.map((a) => a.prenom), ...c.fiches.map((f) => f.ref), ...c.fiches.map((f) => f.pseudo)].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  ordreComptes = l.map((c) => c.id);
  // Des cartes, pas une liste sans fin : 24 à la fois, puis « Afficher plus ».
  const ETAT = { publiee: ['Profil validé', 'is-ok'], a_verifier: ['À vérifier', 'is-alerte'], brouillon: ['Profil pas terminé', 'is-alerte'] };
  $('[data-comptes]').innerHTML = l.length ? l.slice(0, limiteComptes).map((c) => {
    const age = ageDe(c.profil?.birth_date) ?? c.age_fiche ?? null;
    const vraie = c.annonces.find((a) => !a.test && a.status === 'publiee') || c.annonces.find((a) => !a.test && ETAT[a.status]);
    const num = vraie?.ref || c.fiches[0]?.ref || null;
    const etat = [LIBELLE_ETAT[c.etat] || '—', c.etat === 'valide' ? 'is-ok' : /^(att_|suspendu|en_cours|photos_a|retire)/.test(c.etat) ? 'is-alerte' : ''];
    const qui = [c.profil?.gender ? GENRE[c.profil.gender] : '', age != null ? `${age} ans` : '', c.profil?.city || ''].filter(Boolean).join(' · ');
    const soirees = c.inscriptions.filter((i) => i.statut !== 'cancelled').length;
    return `<article class="membre-carte couleur-${COULEUR_ETAT[c.etat] || 'gris'}" data-compte="${esc(c.id)}" tabindex="0" role="button">
      <header><strong>${esc(nomDe(c))}</strong>${(() => { const autre = [...c.annonces.map((a) => a.prenom), ...c.fiches.map((f) => f.pseudo)].find((x) => x && x.toLowerCase() !== String(nomDe(c)).toLowerCase()); return autre ? ` <small class="membre-autre">(annonce : ${esc(autre)})</small>` : ''; })()}${num ? `<span class="membre-num">n° ${esc(num)}</span>` : ''}</header>
      <p class="membre-qui">${esc(qui) || '<span class="compte-badge is-alerte">genre et âge ?</span>'}</p>
      <p class="membre-badges"><span class="compte-badge ${etat[1]}">${etat[0]}</span>${soirees ? `<span class="compte-badge is-bal">${soirees} soirée${soirees > 1 ? 's' : ''}</span>` : ''}${c.admin ? '<span class="compte-badge">toi (admin)</span>' : ''}${c.testeur_play ? '<span class="compte-badge is-bal">Testeur Play</span>' : ''}${c.sans_profil && c.relance_le ? `<span class="compte-badge is-alerte">Relancé·e le ${esc(date(c.relance_le, { day: 'numeric', month: 'short' }))}</span>` : ''}</p>
      <small>${c.vu_le ? `Vu·e le ${esc(date(c.vu_le, { day: 'numeric', month: 'short' }))}` : 'Jamais reconnecté·e'} · inscrit·e le ${esc(date(c.cree_le, { day: 'numeric', month: 'short' }))}</small>
    </article>`;
  }).join('') : '<p class="aide">Aucun membre ne correspond.</p>';
  const plus = $('[data-comptes-plus]');
  plus.hidden = l.length <= limiteComptes;
  plus.textContent = `Afficher plus (${Math.max(0, l.length - limiteComptes)} restants)`;
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
    c.testeur_play ? `testeur Google Play depuis le ${date(c.testeur_play.demande_at, { day: 'numeric', month: 'long' })}${c.testeur_play.ajoute_at ? ' (sur la liste)' : ' (pas encore sur la liste)'}` : '',
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
  $$('[data-sp-un]').forEach((x) => { x.hidden = !c.sans_profil; x.disabled = false; });
  $('[data-sp-un-statut]').textContent = c.sans_profil ? (c.relance_le ? `Sans profil · relancé·e le ${date(c.relance_le, { day: 'numeric', month: 'long' })}` : 'Sans profil · jamais relancé·e') : '';
  $('[data-compte-fiche]').hidden = false;
  $('[data-compte-fond]').hidden = false;
  $('[data-compte-form]').hidden = false;
  boutonsSuivant();
  $('[data-compte-fiche]').scrollTop = 0;
  chargerDetail({ user_id: id });
}
// ---------------------------------------------------------------- la fiche : qui, son activité, pourquoi une alerte, cadeaux, blocage
const STATUT_DEMANDE = { a_traiter: 'en attente', mis_en_relation: 'en match', dematche: 'dématché', pas_compatible: 'pas compatible', en_reserve: 'en réserve' };
let nomsRefs = {};
const refBouton = (r) => `<button type="button" class="fiche-ref" data-voir-ref="${esc(r)}">${nomsRefs[r] ? `${esc(nomsRefs[r])} · ` : ''}n° ${esc(r)}</button>`;
const quand = (d) => (d ? date(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const avecRefs = (t) => esc(t).replace(/n°\s*(\d+)/g, (_, r) => refBouton(r));
// Le profil complet : tout ce que la personne a rempli, ses photos et ses vidéos. La pièce d'identité n'est jamais affichée.
const LIBELLES = { situationAdministrative: 'Situation administrative', proprietaire: 'Propriétaire', fumeurRecherche: 'Tabac recherché', alcoolRecherche: 'Alcool recherché', sportRecherche: 'Sport recherché', chemmaRecherche: 'Chemma recherchée', belleFamille: 'Belle-famille', impressionEchange: 'Échanges', gestionEmotionnelle: 'Émotions', rapportReseaux: 'Réseaux sociaux', tailleMinRechercheCm: 'Taille minimum recherchée', acceptePlusieursEnfants: 'Accepte plusieurs enfants', situation: 'Situation', origineTags: 'Origine', villageOrigine: 'Village d’origine', langue: 'Langues', enfants: 'Enfants', nbEnfants: 'Nombre d’enfants', ageEnfants: 'Âge des enfants', desirEnfants: 'Désir d’enfants', niveauEtudeCategorie: 'Études', niveauEtudeDetail: 'Détail des études', etudesPaysObtention: 'Pays du diplôme', profession: 'Profession', tailleCm: 'Taille (cm)', religion: 'Religion', pratique: 'Pratique', religionTexte: 'Sur la religion', autresModeVie: 'Mode de vie', fumeur: 'Tabac', sport: 'Sport', alcool: 'Alcool', chemma: 'Chemma', caracteristiques: 'Caractéristiques', mobiliteGeographique: 'Mobilité', visionFinanciere: 'Vision financière', zoneGeo: 'Zone recherchée', paysRechercheDetail: 'Pays recherché', regionRechercheDetail: 'Région recherchée', origineRechercheTags: 'Origine recherchée', religionRecherche: 'Religion recherchée', pratiqueRecherche: 'Pratique recherchée', etudesRecherche: 'Études recherchées', rechercheFemmeHidjabiste: 'Hidjab recherché', caracteristiquesRecherche: 'Caractéristiques recherchées', accepteDivorce: 'Accepte divorcé·e', accepteEnfants: 'Accepte des enfants', accepteVeuf: 'Accepte veuf·ve', kabyleUniquement: 'Kabyle uniquement', contactReseau: 'Réseau social', tiktokLive: 'TikTok du live' };
const CACHES = new Set(['hygieneVie', 'situation']);
const lignesProfil = (paires) => paires.filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
  .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(Array.isArray(v) ? v.join(' · ') : v === true ? 'Oui' : v === false ? 'Non' : v)}</dd></div>`).join('');
function profilComplet(a) {
  const m = a.matching && typeof a.matching === 'object' ? a.matching : {};
  const videos = (a.medias || []).filter((x) => x.kind === 'video').map((x) => `<video controls preload="none" src="${esc(x.url)}"></video>`).join('');
  const reponses = Object.entries(m).filter(([k]) => !CACHES.has(k)).map(([k, v]) => [LIBELLES[k] || k, v]);
  const badges = [a.identite_verifiee_at ? 'pièce d’identité validée' : '', a.recommande_at ? 'recommandé' : '', a.moderateur_at ? 'modérateur' : '', a.visible_anonyme === false ? 'masqué dans les profils' : '', a.outil_id || a.exportee_at ? 'importé dans l’outil' : 'pas encore importé dans l’outil'].filter(Boolean).join(' · ');
  return `<article class="profil-complet"><h4>Profil n° ${esc(a.ref)}</h4><p class="aide">${esc(badges)}</p>
    ${rendreModerationPhotos(a)}
    ${videos ? `<div class="profil-medias">${videos}</div>` : ''}
    ${a.profil ? `<h5>Qui je suis</h5><p>${esc(a.profil)}</p>` : ''}${a.recherche ? `<h5>Qui je cherche${a.age_min || a.age_max ? ` · ${esc(a.age_min || 18)} à ${esc(a.age_max || 99)} ans` : ''}</h5><p>${esc(a.recherche)}</p>` : ''}
    <dl class="profil-champs">${lignesProfil([['Prénom', a.prenom], ['Âge', a.age], ['Genre', a.genre], ['Ville', a.ville], ['Pays', a.pays], ['Situation', a.situation], ['Email', a.email], ['Téléphone', a.phone], ...reponses, ['Ma note', a.note_lamia]])}</dl></article>`;
}
// Le site ne reçoit jamais les photos de l'outil : on dit ce qu'il sait vraiment (15 nov. 2026, fiche 5026).
function ficheComplete(f, photosSite) {
  return `<article class="profil-complet"><h4>Fiche de l’outil n° ${esc(f.ref)}</h4>
    <p class="aide">${photosSite ? `${photosSite} photo${photosSite > 1 ? 's' : ''} envoyée${photosSite > 1 ? 's' : ''} sur le site (voir son profil ci-dessus).` : 'Aucune photo sur le site.'} Les photos de ton outil, s’il y en a, ne sont jamais envoyées au site.</p>
    ${f.profil ? `<h5>Qui je suis</h5><p>${esc(f.profil)}</p>` : ''}${f.recherche ? `<h5>Qui je cherche${f.age_min || f.age_max ? ` · ${esc(f.age_min || 18)} à ${esc(f.age_max || 99)} ans` : ''}</h5><p>${esc(f.recherche)}</p>` : ''}
    <dl class="profil-champs">${lignesProfil([['Âge', f.age], ['Genre', f.genre], ['Ville', f.ville], ['Village', f.village], ['Pays', f.pays], ['Secteur', f.secteur], ['Situation', f.situation], ['Enfants', f.enfants], ['Études', f.etudes], ['Origine', f.origine], ['Religion', f.religion], ['Pratique', f.pratique], ['Mode de vie', f.mode_vie], ['Caractéristiques', f.caracteristiques], ['Pseudo (privé)', f.pseudo], ['Lien réseau (privé)', f.lien_reseau], ['Modification demandée', f.modif_demandee]])}</dl></article>`;
}
function rendreDetail(d) {
  const box = $('[data-compte-detail]'), c = d.compte;
  nomsRefs = d.noms || {};
  const carte = (titre, html, ouvert = false) => `<details class="tdb-repli" ${ouvert ? 'open' : ''}><summary>${titre}</summary><div>${html}</div></details>`;
  const pourquoi = d.journal?.length ? `<div class="tdb-carte fiche-pourquoi"><h3 style="margin-top:0">Pourquoi tu as reçu une alerte</h3><ul class="fiche-liste">${d.journal.slice(0, 4).map((j) => `<li><strong>${avecRefs(j.titre)}</strong><small>${esc(quand(j.created_at))}</small>${(j.lignes || []).map((l) => `<div>${avecRefs(l)}</div>`).join('')}</li>`).join('')}</ul></div>` : '';
  const qui = [...(d.annonces || []).map((a) => `<li><strong>Profil n° ${esc(a.ref)}</strong> · ${esc(a.prenom || '')}, ${esc(a.age ?? '?')} ans · ${esc(a.genre || '')}<small>${esc([a.ville, a.pays].filter(Boolean).join(', '))} · ${esc(ANNONCE[a.status] || a.status)}${a.test ? ' · test' : ''}${a.en_match ? ' · en match' : ''}</small></li>`), ...(d.fiches || []).map((f) => `<li><strong>Fiche de l’outil n° ${esc(f.ref)}</strong> · ${esc(f.age ?? '?')} ans · ${esc(f.genre || '')}<small>${esc([f.ville, f.pays].filter(Boolean).join(', '))} · ${f.retiree ? 'retirée' : f.confirmee ? 'confirmée' : 'en attente de confirmation'}</small></li>`)].join('');
  const complet = [...(d.annonces || []).map(profilComplet), ...(d.fiches || []).map((f) => ficheComplete(f, (d.annonces || []).reduce((n, a) => n + (a.medias || []).filter((m) => m.kind === 'photo').length, 0)))].join('');
  const blocComplet = complet ? `<div class="tdb-carte"><h3 style="margin-top:0">Son profil complet</h3>${complet}</div>` : '';
  if (d.sans_compte) {
    box.innerHTML = `${pourquoi}${carteValider(d)}${cartesCompleter(d)}<div class="tdb-carte"><h3 style="margin-top:0">À qui est ce profil</h3><ul class="fiche-liste">${qui}</ul><p class="aide">Cette personne n’a pas de compte.${(d.fiches || []).some((f) => f.pseudo || f.lien_reseau) ? ` Pseudo : ${esc((d.fiches || []).map((f) => f.pseudo).filter(Boolean).join(', ') || '—')} · Lien réseau : ${esc((d.fiches || []).map((f) => f.lien_reseau).filter(Boolean).join(', ') || '—')}.` : ' Son prénom et ses contacts sont dans ton outil de live (cherche ce n° dans « Le site »).'}</p></div>${blocComplet}${(d.choisi_par || []).length ? `<div class="tdb-carte"><h3 style="margin-top:0">Choisie par</h3><ul class="fiche-liste">${d.choisi_par.map((x) => `<li>${refBouton(x.ref)} ${esc(x.prenom || '')}<small>${esc(STATUT_DEMANDE[x.statut] || x.statut)} · ${esc(quand(x.le))}</small></li>`).join('')}</ul></div>` : ''}`;
    return;
  }
  const a = d.activite;
  const liste = (l, f, vide) => (l.length ? `<ul class="fiche-liste">${l.map(f).join('')}</ul>` : `<p class="aide">${vide}</p>`);
  box.innerHTML = `${c.bloque ? '<p class="fiche-bloque"><svg class="ico" aria-hidden="true"><use href="/icones.svg#ban"/></svg> Ce compte est bloqué.</p>' : ''}${pourquoi}
    <div class="tdb-carte"><h3 style="margin-top:0">À qui est ce profil</h3><ul class="fiche-liste">${qui || '<li>Compte sans profil.</li>'}</ul>
      <p class="aide">Formule : ${esc({ decouverte: 'Découverte', passion: 'Passion', prestige: 'Prestige', couple: 'Couple Amour', couple_prestige: 'Couple Prestige' }[d.formule] || d.formule)}${d.formule_offerte ? ' (offerte)' : ''} · Dernière activité : ${esc(quand(c.derniere_action) || 'aucune')}</p></div>
    ${carteValider(d)}${cartesCompleter(d)}${blocComplet}
    <div class="tdb-carte"><h3 style="margin-top:0">Son activité</h3><div class="fiche-chiffres">
      ${[['Swipes oui', a.swipes_oui], ['Swipes non', a.swipes_non], ['Demandes', a.demandes], ['Choisi·e par', a.recus], ['Matchs en cours', a.en_cours.length], ['Dématchs', a.dematchs], ['Messages', a.messages], ['Photos', a.photos]].map(([n, v]) => `<div><b>${esc(v)}</b><span>${esc(n)}</span></div>`).join('')}</div>
      ${a.en_cours.length ? `<p>En match avec : ${a.en_cours.map(refBouton).join(', ')}</p>` : ''}</div>
    <div class="tdb-carte"><h3 style="margin-top:0"><svg class="ico" aria-hidden="true"><use href="/icones.svg#gift"/></svg> Offrir</h3>
      <p class="aide">Reste à utiliser : ${d.credits.match} match(s), ${d.credits.speed_dating} soirée(s), ${d.credits.coaching} coaching(s). La personne est prévenue.</p>
      <form class="fiche-offrir" data-offrir>
        <label>Quoi<select name="quoi"><option value="match">Match</option><option value="speed_dating">Speed dating</option><option value="coaching">Coaching</option><option value="produit">Produit</option>${(d.annonces || []).length ? `<option value="formule_passion">Formule Passion</option><option value="formule_prestige">Formule Prestige</option>${d.formule_offerte ? '<option value="formule_">Reprendre la formule offerte</option>' : ''}` : ''}</select></label>
        <label data-offrir-nombre>Combien<select name="quantite">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option>${n}</option>`).join('')}</select></label>
        <label data-offrir-produit hidden>Produit<select name="product_id">${(d.produits || []).map((p) => `<option value="${esc(p.id)}" data-numerique="${p.product_type === 'digital' ? '1' : ''}">${esc(p.name)}${Number.isInteger(p.stock_qty) ? ` (stock ${p.stock_qty})` : ''}</option>`).join('')}</select></label>
        <div data-offrir-adresse hidden><label>Adresse<input name="line1" maxlength="200"></label><label>Code postal<input name="postal_code" maxlength="20"></label><label>Ville<input name="city" maxlength="100"></label><label>Pays<input name="country" maxlength="60" value="France"></label></div>
        <button class="btn btn-ink" type="submit">Offrir</button><p class="aide" data-offrir-statut role="status" style="grid-column:1/-1;margin:0"></p>
      </form>
      ${d.cadeaux.length ? `<p class="aide">Déjà offert : ${d.cadeaux.map((x) => `${x.quantite} ${{ mise_en_relation: 'match', speed_dating: 'speed dating', coaching: 'coaching' }[x.type] || x.type} (${esc(date(x.le, { day: 'numeric', month: 'short' }))})`).join(' · ')}</p>` : ''}</div>
    ${carte(`Ses choix (${d.choix.length}) et qui l’a choisi·e (${d.choisi_par.length})`, `<h4>Ses choix</h4>${liste(d.choix, (x) => `<li>${refBouton(x.ref)}<small>${esc(STATUT_DEMANDE[x.statut] || x.statut)} · ${esc(quand(x.le))}</small></li>`, 'Aucun choix.')}<h4>L’ont choisi·e</h4>${liste(d.choisi_par, (x) => `<li>${refBouton(x.ref)} ${esc(x.prenom || '')}<small>${esc(STATUT_DEMANDE[x.statut] || x.statut)} · ${esc(quand(x.le))}</small></li>`, 'Personne pour l’instant.')}`)}
    ${carte(`Blocages et signalements (${d.blocages.fait.length + d.blocages.subi.length + d.signalements.fait.length + d.signalements.subi.length})`, `<h4>A bloqué</h4>${liste(d.blocages.fait, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}<h4>Bloqué·e par</h4>${liste(d.blocages.subi, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}<h4>A signalé</h4>${liste(d.signalements.fait, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}<h4>Signalé·e par</h4>${liste(d.signalements.subi, (x) => `<li>${refBouton(x.ref)}<small>${esc(x.motif || 'Sans motif')} · ${esc(quand(x.le))}</small></li>`, 'Personne.')}`)}
    ${carte(`Ses discussions (${d.discussions.length})`, liste(d.discussions, (x) => `<li>Avec ${refBouton(x.avec)}<small>Ouverte ${esc(quand(x.ouverte))}${x.ferme ? ` · fermée ${esc(quand(x.ferme))}` : ''}</small></li>`, 'Aucune discussion.'))}
    ${c.admin ? '' : `<div class="tdb-carte"><h3 style="margin-top:0">Modérer</h3>
      ${(d.annonces || []).filter((x) => x.ref && ['publiee', 'a_verifier'].includes(x.status)).map((x) => `<p><button class="btn btn-line" type="button" data-suspendre="${esc(x.ref)}" data-etat="${x.status === 'publiee' ? 'suspendre' : 'remettre'}">${x.status === 'publiee' ? `Suspendre le profil n° ${esc(x.ref)}` : `Remettre en ligne le profil n° ${esc(x.ref)}`}</button></p>`).join('')}
      <p><button class="btn btn-line fiche-danger" type="button" data-bloquer-compte="${c.bloque ? 'non' : 'oui'}">${c.bloque ? 'Débloquer ce compte' : 'Bloquer ce compte'}</button></p>
      <p><button class="btn btn-line fiche-danger" type="button" data-supprimer-compte>Supprimer ce compte</button></p></div>`}`;
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
  $('[data-compte-nom]').textContent = 'Fiche créée par toi (pas de compte)';
  $('[data-compte-infos]').textContent = '';
  $('[data-compte-form]').hidden = true;
  $('[data-compte-soirees]').innerHTML = '<li>Fiche sans compte : pas d’inscription aux soirées.</li>';
  $('[data-compte-liens]').innerHTML = '';
  $('[data-compte-fiche]').hidden = false; $('[data-compte-fond]').hidden = false;
  boutonsSuivant();
  chargerDetail({ ref });
}
function suivreHashProfil() {
  // Depuis une conversation : le compte d'une personne qui n'a ni annonce ni fiche.
  const compte = location.hash.match(/^#compte-([0-9a-f-]{36})$/i);
  if (compte) { ouvrir('comptes'); (comptes ? Promise.resolve() : chargerComptes()).then(() => ouvrirCompte(compte[1])); return true; }
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
  const su = e.target.closest('[data-suspendre]');
  if (su) {
    const suspendre = su.dataset.etat === 'suspendre';
    let motif = '';
    if (suspendre) { motif = prompt('Pourquoi ? (la personne le lira, tu peux laisser vide)', '') ; if (motif === null) return; }
    su.disabled = true;
    try { await conf({ action: 'annonce_profil_suspendre', ref: su.dataset.suspendre, suspendre, motif }); message(suspendre ? 'Profil suspendu, la personne est prévenue.' : 'Profil remis en ligne.'); chargerDetail({ user_id: detailCourant.compte.id }); }
    catch (err) { message(err?.code === 'photos_manquantes' || err?.message === 'photos_manquantes' ? 'Il lui manque ses 2 photos : impossible de le remettre en ligne.' : 'Ça n’a pas abouti. Réessaie dans un instant.', true); su.disabled = false; }
    return;
  }
  const sc = e.target.closest('[data-supprimer-compte]');
  if (sc) {
    if (prompt('Tu vas supprimer définitivement ce compte : profil, photos, demandes et discussions. Écris SUPPRIMER pour confirmer.') !== 'SUPPRIMER') return;
    sc.disabled = true;
    try { await conf({ action: 'annonce_compte_supprimer', user_id: detailCourant.compte.id, confirmation: 'SUPPRIMER' }); message('Compte supprimé.'); fermerCompte(); await chargerComptes(); }
    catch (err) { message(err?.code === 'abonnement_actif' || err?.message === 'abonnement_actif' ? 'Cette personne a un abonnement payant en cours : résilie-le d’abord.' : 'Ça n’a pas abouti. Réessaie dans un instant.', true); sc.disabled = false; }
    return;
  }
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
  const produit = f.elements.quoi.value === 'produit', formule = f.elements.quoi.value.startsWith('formule_');
  $('[data-offrir-nombre]', f).hidden = produit || formule;
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
  // Offrir une formule depuis la fiche (16 nov. 2026 : « dans la fiche, on ne peut pas donner des formules »).
  // Même chemin que la fiche membre de l'outil, puis la personne est prévenue par un message.
  if (quoi.startsWith('formule_')) {
    const formule = quoi.slice(8), ref = detailCourant.annonces?.[0]?.ref, nom = { passion: 'Passion', prestige: 'Prestige' }[formule];
    try {
      await conf({ action: 'live_outil_membre_formule', ref, formule });
      if (formule) await conf({ action: 'live_outil_membre_ecrire', ref, texte: `Bonne nouvelle : je t’offre la formule ${nom}. Elle est déjà active sur ton compte. Lamia` }).catch(() => null);
      message(formule ? `Formule ${nom} offerte, la personne est prévenue.` : 'Formule offerte reprise.');
      chargerDetail({ user_id: detailCourant.compte.id });
    } catch (err) { st.textContent = { injoignable: 'Cette personne n’a pas d’email : impossible de lui offrir une formule.', not_found: 'Profil introuvable.', offre_moderateur: 'C’est un modérateur : sa formule se gère dans « Modérateurs ».' }[err.code] || 'Ça n’a pas abouti. Réessaie dans un instant.'; }
    return;
  }
  try {
    await conf({ action: 'annonce_offrir', user_id: detailCourant.compte.id, quoi, quantite: f.elements.quantite.value, product_id: f.elements.product_id.value, adresse: { line1: f.elements.line1.value, postal_code: f.elements.postal_code.value, city: f.elements.city.value, country: f.elements.country.value } });
    message('Cadeau offert, la personne est prévenue.');
    chargerDetail({ user_id: detailCourant.compte.id });
  } catch (err) { st.textContent = ERREURS[err.code] || ERREURS[err.message] || 'Ça n’a pas abouti. Réessaie dans un instant.'; }
});
function fermerCompte() { compteOuvert = null; $('[data-compte-fiche]').hidden = true; $('[data-compte-fond]').hidden = true; }

$('[data-comptes]').addEventListener('click', (e) => { const l = e.target.closest('[data-compte]'); if (l) ouvrirCompte(l.dataset.compte); });
$('[data-comptes]').addEventListener('keydown', (e) => { const l = e.target.closest('[data-compte]'); if (l && e.key === 'Enter') ouvrirCompte(l.dataset.compte); });
$('[data-comptes-cherche]').addEventListener('input', () => { limiteComptes = 24; listeComptes(); });
$('[data-comptes-plus]').addEventListener('click', () => { limiteComptes += 24; listeComptes(); });
// ---- Comptes sans profil : un compte sans profil ne sert à rien. Relancer ou supprimer, un par un ou tous ensemble.
const SEPT_JOURS = 7 * 864e5;
const aSoiree = (c) => c.inscriptions.some((i) => i.statut !== 'cancelled');
const sansProfil = () => (comptes?.comptes || []).filter((c) => c.sans_profil);
const aRelancer = () => sansProfil().filter((c) => !c.relance_le);
// Suppression en masse : seulement ceux déjà relancés depuis plus de 7 jours, et jamais un inscrit à une soirée.
const aSupprimer = () => sansProfil().filter((c) => c.relance_le && Date.now() - new Date(c.relance_le).getTime() > SEPT_JOURS && !aSoiree(c));
function encartSansProfil() {
  const box = $('[data-sans-profil]'), n = sansProfil().length;
  box.hidden = !n;
  if (!n) return;
  const r = aRelancer().length, s = aSupprimer().length;
  box.innerHTML = `<h2>${n} compte${n > 1 ? 's' : ''} sans profil</h2>
    <p class="aide">Sans profil, personne ne les voit. Relance-les ; ceux qui n’ont rien fait 7 jours après la relance peuvent être supprimés.</p>
    <p class="actions"><button class="btn btn-ink" type="button" data-sp-masse="relancer" ${r ? '' : 'disabled'}>Relancer les ${r} pas encore relancés</button>
    <button class="btn btn-line fiche-danger" type="button" data-sp-masse="supprimer" ${s ? '' : 'disabled'}>Supprimer les ${s} relancés depuis plus de 7 jours</button>
    <button class="btn btn-line" type="button" data-sp-voir>Voir les ${n}</button> <span class="aide" data-sp-statut role="status"></span></p>`;
}
// Par paquets de 15 : chaque envoi reste court, et la progression s'affiche.
async function traiterSansProfil(quoi, ids, dire) {
  let faits = 0, ignores = 0;
  for (let i = 0; i < ids.length; i += 15) {
    dire(`${quoi === 'supprimer' ? 'Suppression' : 'Envoi'}… ${Math.min(i + 15, ids.length)} / ${ids.length}`);
    const d = await conf({ action: quoi === 'supprimer' ? 'annonce_comptes_supprimer' : 'annonce_comptes_relancer', user_ids: ids.slice(i, i + 15), ...(quoi === 'supprimer' ? { confirmation: 'SUPPRIMER' } : {}) });
    faits += (d.faits || []).length; ignores += (d.ignores || []).length;
  }
  return { faits, ignores };
}
const bilanSansProfil = (quoi, { faits, ignores }) => `${faits} ${quoi === 'supprimer' ? `compte${faits > 1 ? 's' : ''} supprimé${faits > 1 ? 's' : ''}` : `message${faits > 1 ? 's' : ''} envoyé${faits > 1 ? 's' : ''}`}${ignores ? ` · ${ignores} laissé${ignores > 1 ? 's' : ''} (profil, soirée, abonnement ou achat)` : ''}.`;
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-sp-voir]')) { const b = $('[data-filtre="sansprofil"]'); if (b) b.click(); return; }
  const masse = e.target.closest('[data-sp-masse]');
  if (masse) {
    const quoi = masse.dataset.spMasse, ids = (quoi === 'supprimer' ? aSupprimer() : aRelancer()).map((c) => c.id);
    if (!ids.length) return;
    if (quoi === 'supprimer' && prompt(`Tu vas supprimer définitivement ${ids.length} compte(s) sans profil. Écris SUPPRIMER pour confirmer.`) !== 'SUPPRIMER') return;
    if (quoi === 'relancer' && !confirm(`Envoyer le message « crée ton profil » à ${ids.length} personne(s) ?`)) return;
    $$('[data-sp-masse]').forEach((x) => { x.disabled = true; });
    let bilan = '';
    try { bilan = bilanSansProfil(quoi, await traiterSansProfil(quoi, ids, (t) => { $('[data-sp-statut]').textContent = t; })); }
    catch { bilan = 'Ça s’est arrêté en route. Actualise et relance ce qu’il reste.'; }
    await chargerComptes();
    const st = $('[data-sp-statut]'); if (st) st.textContent = bilan;
    return;
  }
  const un = e.target.closest('[data-sp-un]');
  if (un && compteOuvert) {
    const quoi = un.dataset.spUn, st = $('[data-sp-un-statut]');
    if (quoi === 'supprimer' && !confirm('Supprimer définitivement ce compte sans profil ?')) return;
    un.disabled = true;
    try {
      const d = await traiterSansProfil(quoi, [compteOuvert], (t) => { st.textContent = t; });
      if (quoi === 'supprimer' && d.faits) { fermerCompte(); await chargerComptes(); return; }
      st.textContent = d.faits ? 'Message envoyé.' : 'Rien n’a été fait : ce compte a un profil, une soirée, un abonnement ou un achat.';
      if (d.faits) await chargerComptes();
    } catch { st.textContent = 'Ça n’a pas fonctionné. Réessaie dans un instant.'; un.disabled = false; }
  }
});
// Fiche en pleine page : Modifier, Contacter, Bloquer en haut.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fiche-aller]');
  if (!b) return;
  const cible = { modifier: '[data-compte-modifier]', contacter: '[data-compte-contacter]', bloquer: '[data-bloquer-compte]' }[b.dataset.ficheAller];
  const el = $(cible);
  if (!el) return;
  if (el.tagName === 'DETAILS') el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('[data-compte-ecrire]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, st = $('[data-compte-ecrire-statut]');
  const c = comptes?.comptes.find((x) => x.id === compteOuvert);
  if (!c?.email) { st.textContent = 'Cette personne n’a pas de compte : écris-lui depuis ton outil.'; return; }
  f.querySelector('button').disabled = true; st.textContent = 'Envoi…';
  try { await conf({ action: 'lamia_ecrire_a', email: c.email, body: f.elements.body.value, name: nomDe(c) }); f.reset(); st.textContent = 'Message envoyé. Sa réponse arrivera dans tes Confidences.'; }
  catch { st.textContent = 'Le message n’est pas parti. Réessaie dans un instant.'; }
  f.querySelector('button').disabled = false;
});
$('[data-comptes-filtres]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtre]'); if (!b) return;
  filtreComptes = b.dataset.filtre; limiteComptes = 24;
  $$('[data-filtre]', $('[data-comptes-filtres]')).forEach((x) => x.classList.toggle('is-on', x === b));
  listeComptes();
});
$('[data-comptes-maj]').addEventListener('click', chargerComptes);
$('[data-compte-fermer]').addEventListener('click', fermerCompte);
monterModerationPhotos({ appel: conf, apres: (ref) => { retirerPhotosAValider(ref); return chargerDetail({ ref }); }, cle: 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc' });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-compte-suiv], [data-compte-prec]');
  if (!b) return;
  const k = ordreComptes.indexOf(compteOuvert) + (b.matches('[data-compte-suiv]') ? 1 : -1);
  if (ordreComptes[k]) ouvrirCompte(ordreComptes[k]);
});
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
  if (location.hash.startsWith('#profil-') || location.hash.startsWith('#compte-')) { aFaire(); pastilleJournal(); chargerCockpit(); await charger().catch(() => {}); suivreHashProfil(); return; }
  const tab = location.hash.slice(1);
  ouvrir(['accueil', 'activite', 'rencontres', 'comptes', 'match-direct', 'creer-profil', 'application', 'coaching', 'ventes', 'produits', 'soirees', 'bilan', 'alertes', 'textes', 'visites'].includes(tab) ? tab : 'accueil');
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
  $('[data-pilote-statut]').textContent = `${r.actif === false ? 'Pilote en pause.' : 'Pilote actif.'}${r.dernier ? ` Dernier passage le ${new Date(r.dernier.le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} : ${r.dernier.propositions} proposition(s) envoyée(s) à ${r.dernier.personnes} personne(s), ${r.dernier.relations} mise(s) en relation.` : ''}`;
  $('[data-pilote-relations]').innerHTML = (d.relations || []).map((x) => `<li><span><b>${escA(x.a)}</b>${x.actif && x.a_matchs > 1 ? ` <em class="tdb-plusieurs">${x.a_matchs} matchs en cours</em>` : ''} ↔ <b>${escA(x.b)}</b>${x.actif && x.b_matchs > 1 ? ` <em class="tdb-plusieurs">${x.b_matchs} matchs en cours</em>` : ''}<small>${escA(jourA(x.le))}${x.reciproque ? ' · réciproque' : ''}${x.discussion ? ' · discussion ouverte' : ''} · ${escA(x.etat)}</small></span>${x.actif ? `<button type="button" class="link-button" data-dematcher="${escA(x.id)}">Annuler ce match</button>` : ''}</li>`).join('') || '<li>Pas encore de mise en relation.</li>';
  $('[data-pilote-propositions]').innerHTML = (d.propositions || []).map((x) => `<li><span><b>${escA(x.a)}</b> ↔ <b>${escA(x.b)}</b><small>${x.score != null ? `${x.score}/100 · ` : ''}${escA(jourA(x.le))} · ${escA(x.etat)}${x.auto ? ' · auto' : ''}</small></span>${/attente/.test(x.etat) ? `<button type="button" class="link-button" data-retirer-prop="${escA(x.id)}">Retirer</button>` : ''}</li>`).join('') || '<li>Pas encore de proposition. Clique « Envoyer les matchs maintenant ».</li>';
  const att = d.en_attente || [], bv = $('[data-valider-tout]');
  bv.hidden = !att.length; bv.textContent = `Profils en attente (${att.length}) : valider les complets, relancer les autres`;
  bv.title = att.map((a) => `${a.prenom || ''} n° ${a.ref}`).join(', ');
  $('[data-pilote-bloques]').innerHTML = (d.bloques || []).map((x) => `<li><span><b>${escA(x.a)}</b> ↔ <b>${escA(x.b)}</b><small>${escA(x.raison)}</small></span><button type="button" class="link-button" data-forcer="${escA(x.id)}">Les mettre en relation</button></li>`).join('') || '<li>Rien de bloqué.</li>';
  if (d.statut) peindreStatut(d.statut);
}
// Où en est une personne, en clair : ses matchs en cours et ce qui l'attend.
function peindreStatut(s) {
  const box = $('[data-statut-profil]');
  if (!box) return;
  if (!s.existe) { box.innerHTML = `<p class="aide is-erreur">Aucun profil n° ${escA(s.ref)}.</p>`; return; }
  const quand = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
  box.innerHTML = `<p><b>${escA(s.prenom || (s.fiche ? 'Fiche' : 'Profil'))} n° ${escA(s.ref)}</b> · ${escA(s.profil)}${s.compte ? '' : ' · pas de compte'}${s.pause ? ' · <b>en pause</b>' : ''}</p>
    ${s.matchs.length ? `<p><b>${s.matchs.length} match(s) en cours :</b></p><ul class="tdb-liste-activite">${s.matchs.map((m) => `<li><span>avec n° ${escA(m.avec)}<small>depuis le ${escA(quand(m.depuis))} · ${escA(m.etat)}</small></span><button type="button" class="link-button" data-dematcher="${escA(m.id)}">Annuler ce match</button></li>`).join('')}</ul>` : '<p>Aucun match en cours : cette personne est libre.</p>'}
    ${s.reciproques.length ? `<p><b>Les deux ont dit oui, en attente :</b></p><ul class="tdb-liste-activite">${s.reciproques.map((r) => `<li><span>avec n° ${escA(r.avec)}</span><button type="button" class="link-button" data-forcer="${escA(r.id)}">Les mettre en relation</button></li>`).join('')}</ul>` : ''}
    <p class="aide">${s.demandes} demande(s) en attente · ${s.reserve} gardée(s) en réserve · ${s.propositions} proposition(s) sans réponse · ${s.termines} match(s) terminé(s)</p>`;
}
async function chargerActivite(corps = { op: 'etat' }) {
  $('[data-pilote-statut]').textContent = 'Chargement…';
  try { const d = await conf({ action: 'annonce_pilote', ...corps }); peindreActivite(d); if (d.lance) $('[data-pilote-statut]').textContent += ` ➜ Envoi fait : ${d.lance.propositions || 0} proposition(s), ${d.lance.relations?.length || 0} mise(s) en relation.`; }
  catch (err) { $('[data-pilote-statut]').textContent = err.texte || 'L’activité ne se charge pas. Réessaie dans un instant.'; }
}
// Le numéro affiché dans « Où en est… », pour le rafraîchir après une action.
const refStatut = () => { const v = $('[data-statut-cherche]')?.ref.value.trim(); return v ? { ref: v } : {}; };
// Mettre deux personnes en relation à la main, et voir où en est quelqu'un.
$('[data-matcher-main]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, st = $('[data-matcher-statut]'), a = f.a.value.trim(), b = f.b.value.trim();
  if (!confirm(`Mettre en relation n° ${a} et n° ${b} ?\n\nLes deux sont prévenus et une discussion de 7 jours s’ouvre (si les deux ont un compte). Cela passe avant la limite de leur formule.`)) return;
  f.querySelector('button').disabled = true; st.textContent = 'Mise en relation…'; st.classList.remove('is-erreur');
  try {
    const d = await conf({ action: 'annonce_pilote', op: 'matcher', a, b });
    peindreActivite(d); st.textContent = `C’est fait : ${d.fait}. Les deux sont prévenus.`; f.reset();
  } catch (err) { st.textContent = err.texte || 'Ça n’a pas fonctionné. Réessaie dans un instant.'; st.classList.add('is-erreur'); }
  f.querySelector('button').disabled = false;
});
$('[data-statut-cherche]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = $('[data-statut-profil]');
  box.innerHTML = '<p class="aide">Chargement…</p>';
  try { const d = await conf({ action: 'annonce_pilote', op: 'statut', ref: e.target.ref.value.trim() }); peindreActivite(d); }
  catch (err) { box.innerHTML = `<p class="aide is-erreur">${escA(err.texte || 'Ça ne se charge pas. Réessaie.')}</p>`; }
});
$('[data-pilote-reglages]')?.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; chargerActivite({ op: 'reglages', actif: f.actif.checked, parPersonne: Number(f.parPersonne.value), scoreMin: Number(f.scoreMin.value) }); });
$('[data-valider-tout]')?.addEventListener('click', async (e) => {
  if (!confirm(`Profils en attente : ${e.target.title}\n\nLes profils complets (photo, email, contact) sont validés. Aucun profil incomplet n’est validé : chacun reçoit un message avec ce qui lui manque, et il sera validé tout seul dès qu’il l’ajoute.`)) return;
  e.target.disabled = true;
  try { const d = await conf({ action: 'annonce_pilote', op: 'valider_tout' }); peindreActivite(d); $('[data-pilote-statut]').textContent = `${d.valides} profil(s) complet(s) validé(s) · ${d.relances} profil(s) incomplet(s) prévenu(s) de ce qui manque${d.relations ? ` · ${d.relations} mise(s) en relation faite(s)` : ''}.`; }
  catch { $('[data-pilote-statut]').textContent = 'Ça n’a pas fonctionné. Réessaie.'; }
  e.target.disabled = false;
});
$('[data-pilote-lancer]')?.addEventListener('click', (e) => { e.target.disabled = true; chargerActivite({ op: 'lancer' }).finally(() => { e.target.disabled = false; }); });
document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-dematcher]'), p = e.target.closest('[data-retirer-prop]');
  if (d && confirm('Annuler ce match ? La discussion se ferme, leurs autres choix reviennent, et ce match ne sera pas compté.')) chargerActivite({ op: 'dematcher', id: d.dataset.dematcher, ...refStatut() });
  if (p) chargerActivite({ op: 'retirer_proposition', id: p.dataset.retirerProp });
  const fo = e.target.closest('[data-forcer]');
  if (fo && confirm('Les mettre en relation maintenant ? Les deux sont prévenus et la discussion s’ouvre. Cela passe avant la limite de leur formule.')) chargerActivite({ op: 'forcer', id: fo.dataset.forcer, ...refStatut() });
});

// ---------------------------------------------------------------- coaching Prestige : créneaux et réservations
const ERR_COACHING = { plage_invalide: 'Vérifie le jour et les heures : il faut au moins 15 minutes.', plage_passee: 'Cette plage horaire est déjà passée.', trop_tot: 'La visio s’ouvre 10 minutes avant l’heure.', terminee: 'Cette visio est terminée.', video_indisponible: 'La visio ne s’ouvre pas pour le moment. Réessaie dans un instant.', video_not_configured: 'La clé vidéo Daily manque sur le site.' };
function peindreCoaching(d) {
  const parJour = new Map();
  for (const c of d.creneaux || []) { const k = date(c.debut, { weekday: 'long', day: 'numeric', month: 'long' }); if (!parJour.has(k)) parJour.set(k, []); parJour.get(k).push(c); }
  const passe = (c) => new Date(c.debut).getTime() + ((c.duree_min || 15) + 15) * 60e3 < Date.now();
  const typeDe = (c) => ({ 30: ' · 30 min', 60: ' · Couple, 1 h' })[c.duree_min] || '';
  const cellule = (c) => `<li class="${c.user_id ? 'is-pris' : ''}${passe(c) ? ' is-passe' : ''}"><b>${esc(date(c.debut, { hour: '2-digit', minute: '2-digit' }))}${typeDe(c)}</b>${c.user_id ? `<span>${esc(c.prenom || c.email || '')}</span>` : '<small>Libre</small>'}${passe(c) ? '' : `<span class="planning-actions">${c.user_id ? `<button class="btn btn-ink" type="button" data-coaching-entrer="${esc(c.id)}">Entrer</button><button class="btn btn-line" type="button" data-coaching-attend="${esc(c.id)}">Lamia t’attend</button>` : ''}<button class="link-button" type="button" data-coaching-fermer="${esc(c.id)}" data-reserve="${c.user_id ? '1' : ''}">${c.user_id ? 'Annuler' : 'Retirer'}</button></span>`}</li>`;
  const aVenir = [...parJour].filter(([, l]) => l.some((c) => !passe(c)));
  // Séance en cours ou dans moins d'une heure : en haut, en grand, avec Entrer et « Lamia t'attend ».
  const proche = (d.creneaux || []).filter((c) => c.user_id && !passe(c) && new Date(c.debut).getTime() - Date.now() < 3600e3);
  const bandeau = proche.map((c) => `<div class="tdb-carte" style="border:2px solid #7a1f2b"><h2>${new Date(c.debut) <= Date.now() ? 'Séance en cours' : 'Prochaine séance'} · ${esc(date(c.debut, { hour: '2-digit', minute: '2-digit' }))}${typeDe(c)}</h2><p><b>${esc(c.prenom || c.email || '')}</b></p><p><button class="btn btn-ink" type="button" data-coaching-entrer="${esc(c.id)}">Entrer dans la salle</button> <button class="btn btn-line" type="button" data-coaching-attend="${esc(c.id)}">Prévenir : Lamia t’attend</button></p></div>`).join('');
  $('[data-coaching-planning]').innerHTML = bandeau + (aVenir.length ? `<div class="planning-grille">${aVenir.map(([k, l]) => `<section><h3>${esc(k)}</h3><ul>${l.map(cellule).join('')}</ul></section>`).join('')}</div>` : '<p>Aucun créneau ouvert à venir.</p>');
  $('[data-coaching-abonnes]').innerHTML = (d.abonnes || []).map((a) => `<li><span><b>${esc(a.nom || a.email)}</b> <small>${a.reserve ? `Visio du mois : ${esc(date(a.reserve))}` : 'Pas encore de visio ce mois-ci'}</small></span></li>`).join('') || '<li>Pas encore d’abonné Prestige actif.</li>';
}
async function chargerAlertes() {
  const z = $('[data-alertes-membres]');
  if (!z) return;
  try {
    const d = await conf({ action: 'annonce_alertes' });
    const dons = (d.cadeaux || []).length ? `<h3>Cadeaux pas encore utilisés</h3><ul class="tdb-retraits">${d.cadeaux.map((c) => `<li><span><b>${esc(c.prenom || c.email)}</b> · ${esc(c.quoi)}<br><small>offert ${esc(date(c.le))}</small></span><span><button class="btn btn-line" type="button" data-cadeau-relancer="${esc(c.id)}">Relancer</button></span></li>`).join('')}</ul>` : '';
    if (!d.actif) { z.innerHTML = `${dons}<p class="aide">Le journal des alertes n’est pas encore activé.</p>`; return; }
    if (!d.alertes.length) { z.innerHTML = `${dons}<p class="aide">Aucune alerte envoyée pour l’instant.</p>`; return; }
    const canal = (a) => [a.notifications ? 'notification' : '', a.email_envoye ? 'email' : ''].filter(Boolean).join(' + ') || 'non reçue (ni notification ni email)';
    z.innerHTML = `${dons}<h3>Dernières alertes</h3><ul class="tdb-retraits">${d.alertes.map((a) => `<li><span><b>${esc(a.prenom || a.email || 'Membre')}</b> · ${esc(date(a.created_at))}<br><small>${esc(a.titre)}</small><br><small>Envoyée par ${esc(canal(a))}</small></span><span>${a.vu_at ? `<b>Vue</b><br><small>${esc(date(a.vu_at))}</small>` : '<small>Pas encore vue</small>'}</span></li>`).join('')}</ul>`;
  } catch { z.innerHTML = '<p class="aide">Les alertes ne se chargent pas pour le moment.</p>'; }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-coaching-attend]');
  if (!b) return;
  b.disabled = true;
  try { await conf({ action: 'annonce_coaching_attend', id: b.dataset.coachingAttend }); b.textContent = 'Prévenu·e ✓'; }
  catch (err) { b.disabled = false; b.textContent = err.message === 'terminee' ? 'Séance terminée' : 'Réessayer'; }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cadeau-relancer]');
  if (!b || !confirm('Renvoyer à cette personne un rappel de son cadeau (notification et email) ?')) return;
  b.disabled = true;
  try { await conf({ action: 'annonce_cadeau_relancer', id: b.dataset.cadeauRelancer }); b.textContent = 'Relancé'; chargerAlertes(); }
  catch { b.disabled = false; b.textContent = 'Réessayer'; }
});
async function chargerCoaching(corps = { action: 'annonce_coaching_planning' }) {
  if (corps.action === 'annonce_coaching_planning') chargerAlertes();
  const st = $('[data-coaching-statut]');
  try { peindreCoaching(await conf(corps)); st.textContent = ''; }
  catch (e) { st.textContent = ERR_COACHING[e.message] || 'Ça n’a pas fonctionné. Réessaie dans un instant.'; }
}
$('[data-coaching-form]')?.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; chargerCoaching({ action: 'annonce_coaching_ouvrir', duree: Number(f.duree.value), date: f.date.value, de: f.de.value, a: f.a.value }); });
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
  if (e.target.closest('[data-ma-salle]')) {
    const fen = window.open('', '_blank');
    try { const d = await conf({ action: 'annonce_coaching_ma_salle' }); const salle = `/salle-coaching/#${encodeURIComponent(d.url)}`; if (fen) fen.location.href = salle; else location.href = salle; }
    catch (err) { fen?.close(); $('[data-coaching-statut]').textContent = ERR_COACHING[err.message] || 'Ta salle ne s’ouvre pas pour le moment.'; }
  }
  if (v) {
    const fen = window.open('', '_blank');
    try { const d = await conf({ action: 'annonce_coaching_rejoindre', id: v.dataset.coachingEntrer }); const salle = `/salle-coaching/#${encodeURIComponent(d.url)}`; if (fen) fen.location.href = salle; else location.href = salle; }
    catch (err) { fen?.close(); $('[data-coaching-statut]').textContent = ERR_COACHING[err.message] || 'La visio ne s’ouvre pas pour le moment.'; }
  }
});

// Un bouton de la liste « À faire » qui ouvre directement un onglet.
document.addEventListener('click', (e) => { const b = e.target.closest('[data-tab-aller]'); if (b) ouvrir(b.dataset.tabAller); });

// Un numéro de profil déjà ouvert une fois se rouvre au clic (l'adresse ne change pas, donc pas de « hashchange »).
document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#profil-"]'); if (a && token && location.hash === a.getAttribute('href')) { e.preventDefault(); suivreHashProfil(); } });
