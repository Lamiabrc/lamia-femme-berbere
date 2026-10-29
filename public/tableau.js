// Tableau de bord de Lamia : ventes, produits, soirées, alertes, textes du site, visites.
import { FAMILLES } from '/assets/rubriques.mjs';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const money = (c, cur = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur || 'EUR' }).format((c || 0) / 100);
const date = (iso, opts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...opts }) : '');
const STATUTS = { pending: 'En attente de paiement', paid: 'Payée, à expédier', fulfilled: 'Expédiée', cancelled: 'Annulée', refunded: 'Remboursée' };
const ALERTES = { new: 'Nouvelle', reviewing: 'En cours', needs_info: 'Besoin d’infos', watch: 'Sous surveillance', suspended: 'Suspendu', resolved: 'Résolue', dismissed: 'Classée' };
const GRAVITE = { red: 'Danger', orange: 'Inquiétant', yellow: 'À surveiller' };

let token = null, data = null, produits = [], categories = [], edition = null;

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
  try { history.replaceState(null, '', `#${tab}`); } catch { /* */ }
  if (tab === 'produits' && !produits.length) { chargerProduits(); chargerReglages(); }
  if (tab === 'textes') chargerTextes();
  if (tab === 'bilan') chargerBilan();
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
  $('[data-soirees]').innerHTML = s.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.audience || '')}</td><td>${esc(date(e.starts_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td><strong>${e.inscrits}</strong></td><td>${e.capacity}</td></tr>`).join('') || '<tr><td colspan="5">Aucune soirée à venir.</td></tr>';
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
  const tab = location.hash.slice(1);
  ouvrir(['accueil', 'ventes', 'produits', 'soirees', 'bilan', 'alertes', 'textes', 'visites'].includes(tab) ? tab : 'accueil');
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
