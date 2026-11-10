// Mon espace : connexion, mot de passe, soirées réservées, liens d'administration.
import { createClient } from '/vendor/supabase.mjs';
import { creerCompte, api } from './confidences-commun.js';
import { secteurLisible, origineLisible, phrasesDifference, criteresDeQuestion } from './matching-options.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc');
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const when = (iso) => new Date(iso).toLocaleString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const say = (el, msg, err = false) => { el.textContent = msg; el.classList.toggle('is-error', err); };
let recovering = false;

// render() repasse à chaque événement de connexion (ouverture, retour sur l'onglet, jeton renouvelé) :
// un écouteur ajouté à chaque passage enverrait tout en double ou en triple. Ici, le nouveau remplace l'ancien.
const ecouteurs = new WeakMap();
function ecouter(box, type, fn) {
  const m = ecouteurs.get(box) || {};
  if (m[type]) box.removeEventListener(type, m[type]);
  m[type] = fn;
  ecouteurs.set(box, m);
  box.addEventListener(type, fn);
}
let minuterieDiscussions = null;

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
  document.body.classList.toggle('espace-est-admin', u.app_metadata?.role === 'admin');
  achats(session);
  monProfil(session);
  mesFiches(session);
  interetsRecus(session);
  avisLamia(session);
  propositions(session);
  discussions(session);
  monSpeedDating(session);
  monCoaching(session);
  demasquages(session);
  mesBlocages(session);
  invitationBeta(session);
  invitationModerateur(session);
}

// Services à l'unité liés au compte (photo mise à part) : un seul chemin de paiement, depuis tous les blocs de Mon espace.
const ERR_SERVICE = { discussion_fermee: 'Cette discussion est fermée.', profil_requis: 'Il faut d’abord un profil validé.', deja_inclus: 'C’est déjà inclus dans ta formule.' };
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-service-acheter]');
  if (!b) return;
  const st = b.parentElement.querySelector('[data-service-statut]');
  const dire = (t) => { if (st) st.textContent = t; };
  if (!confirm(`${b.dataset.serviceNom} : ${b.dataset.servicePrix}.\n\nEn continuant, tu acceptes les conditions de vente (lamia-femme-berbere.com/cgv) et tu demandes que le service commence dès le paiement.`)) return;
  b.disabled = true; dire('Ouverture du paiement…');
  try {
    const { data } = await supabase.auth.getSession();
    const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ action: 'abonnement_payer', unite: b.dataset.serviceAcheter, id: b.dataset.serviceCible || undefined, cgv_accepted: true }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { location.href = d.url; return; }
    dire(ERR_SERVICE[d.error] || 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.');
  } catch { dire('Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.'); }
  b.disabled = false;
});
const boutonService = (unite, nom, prix, libelle, cible = '') => `<p><button class="btn btn-line" type="button" data-service-acheter="${esc(unite)}" data-service-nom="${esc(nom)}" data-service-prix="${esc(prix)}"${cible ? ` data-service-cible="${esc(cible)}"` : ''}>${esc(libelle)}</button> <small data-service-statut role="status"></small></p>`;

// Coaching : réserver sa visio (celle du mois en Prestige, ou une visio achetée), l'annuler, y entrer.
const ERR_COACHING = { service_requis: 'Ce créneau correspond à un autre service.', deja_ce_mois: 'Tu as déjà ta visio pour ce mois-là.', creneau_pris: 'Ce créneau vient d’être pris. Choisis-en un autre.', creneau_passe: 'Ce créneau est trop proche. Choisis-en un autre.', trop_tard: 'Moins de 24 heures avant la visio, elle ne peut plus être annulée. Écris à Lamia si besoin.', trop_tot: 'La visio s’ouvre 10 minutes avant l’heure. Reviens un peu plus tard.', terminee: 'Cette visio est terminée.', paiement_a_regulariser: 'Ton paiement est à régulariser avant de réserver.', video_indisponible: 'La visio ne s’ouvre pas pour le moment. Réessaie dans un instant.', video_not_configured: 'La visio ne s’ouvre pas pour le moment. Écris à Lamia.' };
async function monCoaching(session) {
  const bloc = $('[data-espace-coaching-bloc]'), box = $('[data-espace-coaching]');
  if (!bloc || !box) return;
  const jour = (d) => new Date(d).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { weekday: 'long', day: 'numeric', month: 'long' });
  const heure = (d) => new Date(d).toLocaleTimeString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { hour: '2-digit', minute: '2-digit' });
  const peindre = (d, note = '') => {
    // Sans visio incluse ni achetée : l'offre à l'unité, sauf là où le paiement en ligne n'existe pas.
    const offre = d.offre && !window.LFB_PLAY;
    bloc.hidden = !d.inclus && !offre;
    const intro = bloc.querySelector('[data-coaching-intro]');
    if (intro) intro.textContent = d.prestige ? 'Ta formule Prestige comprend une visio de 15 minutes par mois avec Lamia, pour ton profil et tes rencontres. Elle n’est jamais enregistrée.' : 'Du temps en visio avec Lamia, pour ton profil, tes rencontres ou ton couple. Jamais enregistré.';
    if (!d.inclus) { box.innerHTML = offre ? '<ul><li>Visio de 15 minutes · 15 € (incluse chaque mois avec Prestige)</li><li>Coaching de 30 minutes · 39 €</li><li>Sauver mon couple, 1 heure · 89 €</li></ul><p><a class="btn btn-ink" href="/abonnement/#unites">Choisir</a> <a class="text-link" href="/abonnement/?formule=prestige">Voir Prestige</a></p>' : ''; return; }
    const parJour = new Map();
    for (const c of d.creneaux || []) { const k = jour(c.debut); if (!parJour.has(k)) parJour.set(k, []); parJour.get(k).push(c); }
    box.innerHTML = `${d.prochaine ? `<img class="espace-coaching-img" src="/images/coaching/${({ 30: 'match-manuel', 60: 'couple' })[d.prochaine.duree] || 'prestige'}.webp" alt="" width="720" height="720"><h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#video"/></svg> Ta prochaine visio</h3><p><strong>${esc(jour(d.prochaine.debut))} à ${esc(heure(d.prochaine.debut))}</strong>, ${esc(d.prochaine.nom)} (${esc(d.prochaine.duree)} minutes).</p><p class="po-actions"><button class="btn btn-ink" type="button" data-coaching-entrer="${esc(d.prochaine.id)}">Entrer dans la visio</button>${d.prochaine.annulable ? `<button class="btn btn-line" type="button" data-coaching-annuler="${esc(d.prochaine.id)}">Annuler</button>` : ''}</p><p><small>La visio s’ouvre 10 minutes avant l’heure.${d.prochaine.annulable ? ' Tu peux annuler jusqu’à 24 heures avant.' : ''}</small></p>` : ''}
      ${d.prochaine?.invitation ? `<p>Vous venez à deux ? Envoie ce lien à ton conjoint ou ta conjointe : pas besoin de compte.</p><p><button class="btn btn-line" type="button" data-coaching-inviter="${esc(d.prochaine.invitation)}">Copier le lien pour mon couple</button></p>` : ''}
      ${d.impaye ? '<p>Ton paiement est à régulariser pour réserver ta visio du mois : va dans « Gérer mon abonnement ».</p>' : ''}
      ${d.credits ? `<p><svg class="ico" aria-hidden="true"><use href="/icones.svg#ticket"/></svg> À réserver : <strong>${[['15', 'visio de 15 minutes'], ['30', 'coaching de 30 minutes'], ['60', 'Sauver mon couple']].filter(([n]) => d.restant?.[n]).map(([n, nom]) => `${esc(d.restant[n])} × ${nom}`).join(', ')}</strong>.</p>${d.creneaux?.length ? '' : '<p>Lamia n’a pas de créneau ouvert pour l’instant : reviens bientôt, ou écris-lui.</p>'}` : ''}
      ${parJour.size ? `<h3>${d.prochaine ? 'Réserver une autre visio' : 'Choisir mon créneau'}</h3><p><small>Horaires à l’heure de ton téléphone.</small></p>${[...parJour].map(([k, l]) => `<p class="espace-coaching-jour"><strong>${esc(k)}</strong></p><p class="espace-coaching-heures">${l.map((c) => `<button class="btn btn-line" type="button" data-coaching-reserver="${esc(c.id)}" data-quand="${esc(`${k} à ${heure(c.debut)}, ${c.nom}`)}">${esc(heure(c.debut))}${c.duree === 15 ? '' : ` · ${c.duree === 60 ? 'Couple, 1 h' : '30 min'}`}</button>`).join('')}</p>`).join('')}` : (!d.prochaine && !d.impaye ? '<p>Lamia n’a pas encore ouvert de créneaux. Tu seras prévenu·e dès que c’est le cas.</p>' : '')}
      ${window.LFB_PLAY ? '' : '<p><small>Besoin de plus de temps ? <a class="text-link" href="/abonnement/#unites">Coaching de 30 minutes ou Sauver mon couple</a>.</small></p>'}
      <p class="form-status" role="status" data-coaching-statut>${esc(note)}</p>`;
  };
  const faire = async (corps, ok = '') => {
    const st = box.querySelector('[data-coaching-statut]');
    try { peindre(await appelProfil(corps, session), ok); }
    catch (e) { if (st) st.textContent = ERR_COACHING[e.code] || 'Ça n’a pas fonctionné. Réessaie dans un instant.'; box.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
  };
  // Une seule fois, même après une reconnexion : le gestionnaire est remplacé, avec la session du moment.
  box.onclick = async (e) => {
      const lien = e.target.closest('[data-coaching-inviter]');
      if (lien) { const st = box.querySelector('[data-coaching-statut]'); try { await navigator.clipboard.writeText(lien.dataset.coachingInviter); st.textContent = 'Lien copié : envoie-le à ton conjoint ou ta conjointe.'; } catch { window.prompt('Copie ce lien :', lien.dataset.coachingInviter); } return; }
      const r = e.target.closest('[data-coaching-reserver]'), a = e.target.closest('[data-coaching-annuler]'), v = e.target.closest('[data-coaching-entrer]');
      if (r) { if (!confirm(`Réserver ta visio du ${r.dataset.quand} ?`)) return; r.disabled = true; await faire({ action: 'annonce_coaching_reserver', id: r.dataset.coachingReserver }, 'C’est réservé. Tu reçois une confirmation par email.'); }
      if (a) { if (!confirm('Annuler ta visio ? Tu pourras choisir un autre créneau.')) return; a.disabled = true; await faire({ action: 'annonce_coaching_annuler', id: a.dataset.coachingAnnuler }, 'Ta visio est annulée.'); }
      if (v) {
        const st = box.querySelector('[data-coaching-statut]'), fen = window.open('', '_blank');
        v.disabled = true; st.textContent = 'Ouverture de la visio…';
        try { const d = await appelProfil({ action: 'annonce_coaching_rejoindre', id: v.dataset.coachingEntrer }, session); const salle = `/salle-coaching/#${encodeURIComponent(d.url)}`; if (fen) fen.location.href = salle; else location.href = salle; st.textContent = ''; }
        catch (err) { fen?.close(); st.textContent = ERR_COACHING[err.code] || 'La visio ne s’ouvre pas pour le moment. Réessaie dans un instant.'; }
        v.disabled = false;
      }
  };
  try { peindre(await appelProfil({ action: 'annonce_coaching' }, session)); } catch { bloc.hidden = true; }
}

// Démasquages : souhaits réciproques du bal, à confirmer.
const ETAT_DEMASQUE = {
  a_repondre: null,
  attente: 'Tu as dit oui. On attend la réponse de l’autre personne.',
  confirme: 'Confirmé des deux côtés : Lamia va vous mettre en relation.',
  pas_cette_fois: 'Pas de démasquage cette fois.',
};
// Bloquer ou signaler un profil depuis Mon espace (demandes reçues, propositions, discussions).
const moderation = (ref) => (ref ? `<p class="profil-moderer"><button type="button" class="link-button" data-moderer-bloquer="${esc(ref)}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#flag"/></svg> Bloquer et signaler</button></p>` : '');
document.addEventListener('click', async (e) => {
  const bouton = e.target.closest('[data-moderer-bloquer]');
  if (!bouton) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const ref = bouton.dataset.modererBloquer;
  const motif = prompt(`Bloquer et signaler le profil n° ${ref} ? Vous ne vous verrez plus et Lamia est prévenue. La personne n’est pas avertie.\n\nQue s’est-il passé ? (facultatif)`);
  if (motif === null) return;
  try {
    await appelProfil({ action: 'annonce_bloquer_signaler', ref, motif }, session);
    alert('C’est fait. Lamia est prévenue.');
    render();
  } catch { alert('Ça n’a pas abouti. Réessaie dans un instant.'); }
});
// Les profils que j'ai bloqués, avec la possibilité de revenir en arrière.
// Lien d'invitation modérateur : gardé le temps de créer son accès, puis la personne confirme ou refuse.
const JETON_MOD = 'lfb-moderateur';
try { const t = new URLSearchParams(location.search).get('moderateur'); if (t) sessionStorage.setItem(JETON_MOD, t); } catch { /* */ }
const jetonModerateur = () => { try { return sessionStorage.getItem(JETON_MOD); } catch { return new URLSearchParams(location.search).get('moderateur'); } };
{ const avis = document.querySelector('[data-moderateur-avis]'); if (avis && jetonModerateur()) avis.hidden = false; }
async function invitationModerateur(session) {
  const box = document.querySelector('[data-espace-moderateur]');
  const t = jetonModerateur();
  if (!box || !t) return;
  const avis = document.querySelector('[data-moderateur-avis]'); if (avis) avis.hidden = true;
  box.hidden = false;
  try { await appelProfil({ action: 'annonce_moderateur_voir', t }, session); }
  catch { box.innerHTML = '<p>Ce lien n’est plus valable. Écris à Lamia sur TikTok.</p>'; try { sessionStorage.removeItem(JETON_MOD); } catch { /* */ } return; }
  box.innerHTML = `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#shield"/></svg> Lamia te propose un compte modérateur</h3><p>Tu as accès aux annonces et la formule Passion incluse, sans rien payer. Confirme-le si tu es d’accord.</p>
    <p><button class="btn btn-ink" type="button" data-mod-oui>Je confirme</button> <button class="link-button" type="button" data-mod-non>Non</button></p><p class="form-status" data-mod-statut role="status"></p>`;
  const repondre = async (oui) => {
    const st = box.querySelector('[data-mod-statut]');
    try {
      await appelProfil({ action: 'annonce_moderateur_accepter', t, oui }, session);
      try { sessionStorage.removeItem(JETON_MOD); } catch { /* */ }
      box.innerHTML = oui ? '<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#shield"/></svg> C’est confirmé, merci !</h3><p>Ta formule Passion est active.</p><p><a class="btn btn-ink" href="/rencontres/">Voir les annonces</a> <a class="btn btn-line" href="/rencontres/#confier">Créer une annonce</a></p>' : '<p>C’est noté, merci d’avoir répondu.</p>';
    } catch { if (st) st.textContent = 'Ça n’a pas fonctionné. Réessaie, ou écris à Lamia.'; }
  };
  ecouter(box, 'click', (e) => { if (e.target.closest('[data-mod-oui]')) repondre(true); if (e.target.closest('[data-mod-non]')) repondre(false); });
}

// Invitation au bêta-test de l'appli Google Play : seule la personne invitée voit ce bloc.
async function invitationBeta(session) {
  const box = document.querySelector('[data-espace-beta]');
  if (!box) return;
  let d;
  try { d = await appelProfil({ action: 'annonce_beta_moi' }, session); } catch { return; }
  if (!d.beta) return;
  box.hidden = false;
  const montrer = (statut, adresse) => {
    if (statut === 'accepte') { box.innerHTML = `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#smartphone"/></svg> Bêta-test de l’appli</h3><p>Merci ! Lamia t’enverra le lien d’installation à ${esc(adresse || 'ton adresse')}.</p>`; return; }
    if (statut === 'refuse') { box.innerHTML = '<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#smartphone"/></svg> Bêta-test de l’appli</h3><p>C’est noté, merci d’avoir répondu.</p>'; return; }
    const gmail = /@gmail\.com$/i.test(d.email || '') ? d.email : '';
    box.innerHTML = `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#smartphone"/></svg> L’appli arrive sur Google Play</h3><p>Lamia cherche des testeurs : il faut un téléphone Android, installer l’appli depuis un lien et rester inscrit·e 14 jours. Tu gardes ton compte et tes discussions.</p>
      <form data-beta-form><label>L’adresse Gmail de ton téléphone <input name="adresse" type="email" required value="${esc(gmail)}" autocomplete="email"></label>
      <p class="aide">Elle sert uniquement à t’inscrire au test.</p>
      <button class="btn btn-ink" type="submit">Oui, je veux bien tester</button> <button class="link-button" type="button" data-beta-non>Non</button></form><p class="form-status" data-beta-statut role="status"></p>`;
  };
  montrer(d.beta.statut, d.beta.adresse_google);
  const repondre = async (oui, adresse) => {
    const st = box.querySelector('[data-beta-statut]');
    try { const r = await appelProfil({ action: 'annonce_beta_repondre', oui, adresse }, session); montrer(r.statut, adresse); }
    catch (err) { if (st) st.textContent = err.code === 'adresse_invalide' ? 'Vérifie cette adresse.' : 'Ta réponse n’est pas passée. Réessaie.'; }
  };
  ecouter(box, 'submit', (e) => { if (!e.target.matches('[data-beta-form]')) return; e.preventDefault(); repondre(true, e.target.adresse.value); });
  ecouter(box, 'click', (e) => { if (e.target.closest('[data-beta-non]')) repondre(false); });
}

async function mesBlocages(session) {
  const box = document.querySelector('[data-espace-blocages]');
  if (!box) return;
  let liste = [];
  try { ({ blocages: liste = [] } = await appelProfil({ action: 'annonce_mes_blocages' }, session)); } catch { return; }
  box.hidden = !liste.length;
  box.querySelector('[data-blocages-liste]').innerHTML = liste.map((x) => `<li>Profil n° ${esc(x.ref)} <button type="button" class="link-button" data-debloquer="${esc(x.ref)}">Débloquer</button></li>`).join('');
  ecouter(box, 'click', async (e) => {
    const b = e.target.closest('[data-debloquer]');
    if (!b) return;
    b.disabled = true;
    try { await appelProfil({ action: 'annonce_debloquer', ref: b.dataset.debloquer }, session); mesBlocages(session); } catch { b.disabled = false; }
  });
}

async function demasquages(session) {
  const box = document.querySelector('[data-espace-demasquage]');
  if (!box) return;
  const appel = async (body) => {
    const r = await fetch('/api/bal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'erreur');
    return d;
  };
  let couples = [];
  try { ({ couples = [] } = await appel({ action: 'mes_demasquages' })); } catch { return; }
  document.querySelector('[data-espace-demasquage-section]').hidden = !couples.length;
  box.innerHTML = couples.map((c) => `<article class="espace-soiree espace-demasque"><h3>${esc(c.autre.name)} souhaite aussi te revoir</h3>
    ${c.etat === 'a_repondre'
      ? `<p class="bal-actions"><button class="btn btn-ink" type="button" data-demasque-oui="${esc(c.session)}|${esc(c.autre.uid)}">Oui, je me démasque</button><button class="btn btn-line" type="button" data-demasque-non="${esc(c.session)}|${esc(c.autre.uid)}">Pas cette fois</button></p>`
      : `<p>${esc(ETAT_DEMASQUE[c.etat] || '')}</p>`}</article>`).join('');
  box.onclick = async (e) => {
    const b = e.target.closest('[data-demasque-oui],[data-demasque-non]'); if (!b) return;
    const [s, autre] = (b.dataset.demasqueOui || b.dataset.demasqueNon).split('|');
    b.disabled = true;
    try { await appel({ action: 'demasque_repondre', session: s, autre, oui: Boolean(b.dataset.demasqueOui) }); }
    catch { b.disabled = false; return; }
    demasquages(session);
  };
  if (location.hash === '#demasquage' && couples.length) document.getElementById('demasquage')?.scrollIntoView({ behavior: 'smooth' });
}

const money = (c, cur = 'EUR') => new Intl.NumberFormat(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { style: 'currency', currency: cur || 'EUR' }).format((c || 0) / 100);
const STATUTS = { pending: 'Paiement en attente', paid: 'Payée', fulfilled: 'Expédiée', shipped: 'Expédiée', cancelled: 'Annulée', refunded: 'Remboursée' };
// L'état de l'abonnement sert aussi au suivi du profil (quotas du mois).
let aboPret; const etatAbo = new Promise((r) => { aboPret = r; });
async function achats(session) {
  const box = $('[data-espace-achats]');
  try {
    const r = await fetch('/api/mes-achats', { headers: { Authorization: `Bearer ${session.access_token}` } });
    const { orders = [], abonnement = null } = await r.json();
    aboPret(abonnement);
    monAbonnement(abonnement, session);
    box.innerHTML = orders.length
      ? orders.map((o) => `<article class="espace-achat">
          <div><p class="event-date">${esc(new Date(o.created_at).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long', year: 'numeric' }))} · n° ${esc(o.order_number)}</p>
          <h3>${(o.order_items || []).map((i) => `${esc(i.product_name)}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ') || 'Commande'}</h3>
          ${(o.order_items || []).filter((i) => i.telechargement).map((i) => `<a class="btn btn-ink btn-telecharger" href="${esc(i.telechargement)}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#download"/></svg> Télécharger mon livre numérique</a>`).join('')}</div>
          <div class="espace-achat-droite"><strong>${money(o.amount_total_cents, o.currency)}</strong><span class="statut is-${esc(o.status)}">${esc(STATUTS[o.status] || o.status)}</span></div>
        </article>`).join('')
      : '<p>Pas encore d’achat. Tes commandes apparaîtront ici. <a class="text-link" href="/boutique/">Voir la Boutique</a></p>';
  } catch { aboPret(null); box.innerHTML = '<p>Tes achats ne s’affichent pas pour le moment. Réessaie dans un instant.</p>'; }
}

// Profil confié à Lamia : état, avantages, modification, fin d'un match en cours.
const ETAT_PROFIL = { a_verifier: 'En cours de vérification par Lamia', publiee: '✓ Vérifié par Lamia', refusee: 'Non retenu pour le moment' };
async function appelProfil(body, session) {
  const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw Object.assign(new Error(d.error || 'erreur'), { code: d.error });
  return d;
}
// Mon salon de soirée : attente, place gratuite à valider, place à régler, place confirmée.
async function monSpeedDating(session) {
  const box = $('[data-espace-salon]');
  if (!box) return;
  let ins = null;
  try { ({ inscription: ins } = await appelProfil({ action: 'salon_mes' }, session)); } catch { /* la liste des soirées reste affichée */ }
  await mesSoirees(ins);
  if (location.hash === '#salons' || location.hash === '#speed-dating') $('#speed-dating')?.scrollIntoView({ behavior: 'smooth' });
  if (!ins) { box.innerHTML = '<article class="espace-salon"><p>Tu n’es inscrit·e à aucun salon pour le moment.</p><p><a class="btn btn-ink" href="/speed-dating/inscription/">M’inscrire à un salon</a></p></article>'; return; }
  const quitter = '<p><button type="button" class="link-button" data-salon-quitter>Me désinscrire</button></p>';
  const statut = '<p class="form-status" role="status" data-salon-statut></p>';
  let contenu;
  if (ins.statut === 'attente') contenu = `<h3>${esc(ins.salon)}</h3><p>Secteurs : ${esc(ins.secteurs.join(', '))}.</p><p>${ins.accepte_autre ? `Tu acceptes de rencontrer des personnes de ${ins.tranche === '40+' ? 'moins de 40 ans' : '40 ans et plus'}.` : `Tu rencontres seulement des personnes de ${ins.tranche === '40+' ? '40 ans et plus' : 'moins de 40 ans'}.`} <a class="text-link" href="/speed-dating/inscription/">Modifier mes choix</a></p><p>Tu seras prévenu·e dès que ton salon sera confirmé.</p>${quitter}`;
  else if (ins.statut === 'place') contenu = `<h3>Ta place est confirmée</h3><p><strong>${esc(ins.quand)}</strong><br>${esc(ins.salon)} · ${esc(ins.secteur)}</p><p>Tu recevras un rappel le jour même, une heure avant, puis au démarrage.</p><p><a class="text-link" href="/speed-dating/salle/">Tester ma caméra</a></p>${ins.gratuit || ins.inclus ? quitter : ''}`;
  else if (ins.gratuit) contenu = `<h3>Ton salon est confirmé</h3><p><strong>${esc(ins.quand)}</strong><br>${esc(ins.salon)} · ${esc(ins.secteur)}</p><p class="espace-salon-prix">Gratuit</p><p>Valide ta place avant le ${esc(ins.payer_avant)}.</p><button class="btn btn-ink" type="button" data-salon-valider>Valider ma place</button>${statut}${quitter}`;
  else if (ins.algerie) contenu = `<h3>Ton salon est confirmé</h3><p><strong>${esc(ins.quand)}</strong><br>${esc(ins.salon)} · ${esc(ins.secteur)}</p><p>Le paiement en ligne n’est pas possible en Algérie. <a class="text-link" href="/salon/">Viens au live de Lamia</a>, chaque soir à 21 h : elle peut t’offrir ta place. Sans validation avant le ${esc(ins.payer_avant)}, ta place passera à la personne suivante.</p>${quitter}`;
  else if (window.LFB_PLAY) contenu = `<h3>Ton salon est confirmé</h3><p><strong>${esc(ins.quand)}</strong><br>${esc(ins.salon)} · ${esc(ins.secteur)}</p><p>Le règlement de cette place ne se fait pas dans cette version de l’appli.</p>${statut}`;
  else contenu = `<h3>Ton salon est confirmé</h3><p><strong>${esc(ins.quand)}</strong><br>${esc(ins.salon)} · ${esc(ins.secteur)}</p><p class="espace-salon-prix">${esc(money(ins.prix))}</p><p>Règle ta place avant le ${esc(ins.payer_avant)}, sinon elle passera à la personne suivante.</p><label><input type="checkbox" data-salon-cgv> <span>J’accepte les <a class="text-link" href="/cgv/">conditions de vente</a>. Place non remboursable.</span></label><button class="btn btn-ink" type="button" data-salon-payer>Régler ma place</button>${statut}${quitter}`;
  box.innerHTML = `<article class="espace-salon">${contenu}</article>`;
  const dire = (t) => { const s = $('[data-salon-statut]'); if (s) { s.textContent = t; s.classList.add('is-error'); } };
  $('[data-salon-valider]', box)?.addEventListener('click', async () => { try { await appelProfil({ action: 'salon_valider' }, session); monSpeedDating(session); } catch { dire('La validation n’a pas abouti. Réessaie dans un instant.'); } });
  $('[data-salon-quitter]', box)?.addEventListener('click', async () => { if (!confirm('Te désinscrire de ce salon ?')) return; try { await appelProfil({ action: 'salon_quitter' }, session); monSpeedDating(session); } catch { dire('La désinscription n’a pas abouti. Réessaie dans un instant.'); } });
  $('[data-salon-payer]', box)?.addEventListener('click', async () => {
    if (!$('[data-salon-cgv]', box).checked) return dire('Merci d’accepter les conditions de vente.');
    try {
      const r = await fetch('/api/event-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ event_id: ins.event_id, cgv_accepted: true }) });
      const d = await r.json().catch(() => ({}));
      if (d.url) location.assign(d.url); else dire('Le paiement n’est pas disponible pour le moment. Écris à Lamia.');
    } catch { dire('Le paiement n’est pas disponible pour le moment. Écris à Lamia.'); }
  });
}
// Les soirées réservées et passées. Une place encore à valider ou à régler est dans le bloc du salon, pas ici.
async function mesSoirees(ins) {
  const { data } = await supabase.from('event_registrations')
    .select('attendance_status, payment_status, event_id, speed_dating_events(title, audience, starts_at)')
    .neq('attendance_status', 'cancelled');
  const rows = (data || []).filter((r) => r.speed_dating_events && r.payment_status !== 'pending' && r.event_id !== ins?.event_id);
  const limite = Date.now() - 6 * 3600e3;
  const date = (r) => new Date(r.speed_dating_events.starts_at).getTime();
  const carte = (r, plus = '') => `<article class="espace-soiree"><p class="event-date">${esc(when(r.speed_dating_events.starts_at))}</p><h3>${esc(r.speed_dating_events.title)}</h3>${r.speed_dating_events.audience ? `<p>${esc(r.speed_dating_events.audience)}</p>` : ''}${plus}</article>`;
  const avenir = rows.filter((r) => date(r) >= limite).sort((a, b) => date(a) - date(b));
  const passees = rows.filter((r) => date(r) < limite).sort((a, b) => date(b) - date(a));
  $('[data-espace-soirees-bloc]').hidden = !avenir.length;
  $('[data-espace-soirees]').innerHTML = avenir.map((r) => carte(r)).join('');
  $('[data-espace-passees-bloc]').hidden = !passees.length;
  $('[data-espace-passees]').innerHTML = passees.map((r) => carte(r, '<p><a class="text-link" href="/speed-dating/souhaits/">Mon carnet de bal</a></p>')).join('');
}
async function monProfil(session) {
  const box = document.querySelector('[data-espace-profil]');
  if (!box) return;
  try {
    const { profil: p } = await appelProfil({ action: 'annonce_mon_profil' }, session);
    if (!p) { box.innerHTML = '<p data-sans-profil>Tu n’as pas encore d’annonce chez Lamia. <a class="btn btn-ink" href="/rencontres/#confier">Créer une annonce</a> (la première mise en relation est offerte).</p>'; return; }
    box.innerHTML = `${p.test ? '<p class="espace-test"><svg class="ico" aria-hidden="true"><use href="/icones.svg#flask-conical"/></svg> <strong>Compte de test.</strong> Il sert uniquement à essayer l’application : il ne voit que les profils de test et ne contacte aucun vrai membre.</p>' : ''}<article class="espace-achat"><div><p class="event-date">Profil n° ${esc(p.ref)}</p><h3>${esc(ETAT_PROFIL[p.status] || p.status)}${p.status === 'publiee' && p.piece_identite ? ' · avec pièce d’identité' : ''}</h3>
      ${p.live ? `<p><svg class="ico" aria-hidden="true"><use href="/icones.svg#video"/></svg> Profil créé en live avec Lamia${p.live_retrouve ? '' : ' (Lamia vérifie ta fiche)'} : <strong>tes 3 premières mises en relation sont offertes</strong>.</p>` : '<p>Ta première mise en relation est offerte.</p>'}
      ${p.nb_compatibles !== null && p.nb_compatibles !== undefined ? `<p>D’après l’outil de Lamia, tu pourrais correspondre à ${esc(p.nb_compatibles)} personne(s).</p>` : ''}
      ${p.matchs ? `<p class="espace-match"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Matchs en cours : <strong>${esc(p.matchs.actifs)} / ${esc(p.matchs.limite)}</strong>${p.matchs.actifs >= p.matchs.limite ? (p.matchs.formule === 'prestige' ? ' · mets fin à un match pour en choisir un autre.' : ' · mets fin à un match pour en choisir un autre, ou <a class="text-link" href="/abonnement/">passe à une formule supérieure</a>.') : ''}</p>` : ''}</div>
      <div class="espace-achat-droite">${!window.LFB_PLAY && p.matchs && p.matchs.formule !== 'prestige' ? (p.algerie ? '<a class="btn btn-line" href="/salon/">Plus de matchs au live</a> ' : `<a class="btn btn-ink espace-abo-btn" href="${p.matchs.formule === 'passion' ? '/abonnement/?formule=prestige">Passer à Prestige' : '/abonnement/">S’abonner'}</a> `) : ''}${p.fiche_live ? '<a class="btn btn-ink" href="#mes-fiches">Modifier mon annonce</a>' : '<button class="btn btn-ink" type="button" data-profil-modifier>Modifier mon annonce</button>'}</div></article>
      ${(p.matchs_lies || []).length ? `<ul class="espace-matchs-liste">${p.matchs_lies.map((m) => `<li><span><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Match avec le profil n° ${esc(m.ref)}</span><button class="btn btn-line" type="button" data-profil-dematcher="${esc(m.ref)}">Mettre fin à ce match</button></li>`).join('')}</ul>` : ''}
      ${p.medias_ok === false ? `<section class="espace-photos" id="photos"><h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#camera"/></svg> Il manque tes photos</h3><p>Ajoute <strong>2 photos de toi, visage visible,</strong> pour swiper et répondre aux personnes intéressées. Elles restent privées : elles ne sont pas affichées dans les profils.</p><div data-profil-medias></div></section>` : ''}
      ${p.demander_affichage ? `<section class="espace-photos" id="affichage" data-affichage><h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> Veux-tu que ton annonce soit visible ?</h3><p>Ton annonce n° ${esc(p.ref)} est validée. Si tu es d’accord, elle apparaît sur le site de façon anonyme : sans prénom, photo, ville ni contact.</p><p><button class="btn btn-ink" type="button" data-affichage-oui>Oui, je veux qu’elle soit visible</button> <button class="link-button" type="button" data-affichage-non>Non</button></p></section>` : ''}
      ${p.en_pause
        ? '<section class="espace-photos espace-pause"><h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#pause"/></svg> Ton annonce est en pause</h3><p>Personne ne la voit et tu ne reçois plus de nouveau match. Tes discussions en cours continuent.</p><p><button class="btn btn-ink" type="button" data-annonce-pause="non"><svg class="ico" aria-hidden="true"><use href="/icones.svg#play"/></svg> Reprendre mon annonce</button></p></section>'
        : '<p class="espace-pause"><button class="btn btn-line" type="button" data-annonce-pause="oui"><svg class="ico" aria-hidden="true"><use href="/icones.svg#pause"/></svg> Mettre mon annonce en pause</button><br><small>Elle devient invisible, sans rien effacer. Tes discussions continuent et tu la reprends quand tu veux.</small></p>'}
      <div class="espace-suivi" data-profil-suivi></div>
      <label class="annonce-case espace-photo"><input type="checkbox" data-profil-photo${p.photo_partage ? ' checked' : ''}> <span>Si un match me convient, Lamia peut transmettre <strong>ma photo</strong> à la personne avec qui elle me met en relation (et à elle seule).</span></label>
      <p class="form-status" data-profil-statut></p><div data-profil-edition hidden></div>`;
    box.querySelector('[data-annonce-pause]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget, st = box.querySelector('[data-profil-statut]');
      b.disabled = true;
      try { await appelProfil({ action: 'annonce_pause', pause: b.dataset.annoncePause === 'oui' }, session); await monProfil(session); }
      catch { b.disabled = false; if (st) st.textContent = 'Ça n’a pas marché. Réessaie dans un instant.'; }
    });
    { const zm = box.querySelector('[data-profil-medias]');
      if (zm) { const { monterAjoutMedias } = await import('/assets/annonces.js'); await monterAjoutMedias(zm, { token: session.access_token, deja: p.photos || 0, apres: () => monProfil(session) }); if (location.hash === '#photos') zm.closest('section').scrollIntoView({ block: 'center' }); } }
    box.querySelector('[data-affichage]')?.addEventListener('click', async (e) => {
      const oui = e.target.closest('[data-affichage-oui]'), non = e.target.closest('[data-affichage-non]');
      if (!oui && !non) return;
      const zone = box.querySelector('[data-affichage]');
      try {
        const r = await appelProfil({ action: 'annonce_affichage_accord', oui: Boolean(oui) }, session);
        zone.innerHTML = oui ? `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#circle-check"/></svg> C’est noté</h3><p>${r.visible ? `Ton annonce n° ${esc(r.ref)} est maintenant publiée, de façon anonyme.` : 'Ton accord est bien enregistré.'}</p>` : '<p>C’est noté : ton annonce reste masquée.</p>';
      } catch { zone.insertAdjacentHTML('beforeend', '<p class="form-status">Ta réponse n’est pas passée. Réessaie.</p>'); }
    });
    suivi(box.querySelector('[data-profil-suivi]'), p);
    box.querySelector('[data-profil-photo]').addEventListener('change', async (e) => {
      const st = box.querySelector('[data-profil-statut]'); e.target.disabled = true;
      try { await appelProfil({ action: 'annonce_photo_partage', photo_partage: e.target.checked }, session); st.textContent = e.target.checked ? 'C’est noté : ta photo pourra être transmise à ton match.' : 'C’est noté : ta photo ne sera transmise à personne.'; }
      catch { e.target.checked = !e.target.checked; st.textContent = 'Ça n’a pas été enregistré. Réessaie.'; }
      e.target.disabled = false;
    });
    box.querySelector('[data-profil-modifier]')?.addEventListener('click', async () => {
      const zone = box.querySelector('[data-profil-edition]');
      zone.hidden = false;
      const { monterFormulaire } = await import('/assets/annonces.js');
      monterFormulaire(zone, { existant: p, token: session.access_token });
      zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    box.querySelectorAll('[data-profil-dematcher]').forEach((bouton) => bouton.addEventListener('click', async (e) => {
      if (!confirm(`Mettre fin à ton match avec le profil n° ${bouton.dataset.profilDematcher} ? Lamia sera prévenue, et une place se libère.`)) return;
      e.target.disabled = true;
      try { await appelProfil({ action: 'annonce_dematcher', ref: Number(bouton.dataset.profilDematcher) }, session); monProfil(session); }
      catch (err) { if (err.code === 'dematch_dans_discussion') { e.target.disabled = false; document.querySelector('[data-espace-discussion-bloc]')?.scrollIntoView({ behavior: 'smooth' }); alert('Vous avez une discussion ouverte : utilise le bouton « Dématcher » sous votre discussion, pour vous dire au revoir.'); return; } box.querySelector('[data-profil-statut]').textContent = 'Ça n’a pas fonctionné. Réessaie, ou écris à Lamia.'; e.target.disabled = false; }
    }));
  } catch { box.innerHTML = '<p>Ton profil ne s’affiche pas pour le moment. Réessaie dans un instant.</p>'; }
}

// Suivi : mises en relation offertes et du mois, speed datings inclus, demandes envoyées.
// « coeur » : ancienne formule (supprimée le 31/10/2026), gardée pour un éventuel ancien abonnement.
const QUOTAS = { coeur: { nom: 'Cœur', mises: 3, sd: 1 }, passion: { nom: 'Passion', mises: 10, sd: 1 }, prestige: { nom: 'Prestige', mises: null, sd: 2 } };
const ETAT_DEMANDE = { mis_en_relation: 'Match en cours', en_reserve: 'En réserve', pas_compatible: 'Sans suite', dematche: 'Match terminé' };
const FIN_DEMANDE = { autre: 'Non de sa part', moi: 'Non de ta part', lamia: 'Annulée par Lamia', indispo: 'Plus disponible' };
async function suivi(el, p) {
  const etat = await etatAbo;
  const a = etat?.abonnement, q = a ? QUOTAS[a.formule] : null, u = etat?.unites || {};
  const s = p.suivi || { mises_total: 0, mises_mois: 0 };
  const offertesRestantes = Math.max(0, (p.offertes || 1) - s.mises_total);
  const lignes = [
    q ? `<li><strong>Mises en relation offertes</strong> : ${offertesRestantes} sur ${p.offertes || 1} restante(s)</li>` : '<li><strong>Matchs gratuits</strong> : 1 à la fois, un nouveau dès que le précédent se termine</li>',
    q ? `<li><strong>Formule ${esc(q.nom)}</strong> : ${s.mises_mois} mise(s) en relation ce mois-ci${q.mises ? ` sur ${q.mises}` : ' (sans limite)'} · ${q.sd} speed dating inclus par mois</li>`
      : (p.algerie ? '<li><strong>Formule Découverte</strong> (gratuite)</li>' : '<li><strong>Formule Découverte</strong> (gratuite) · plusieurs matchs en même temps avec <a class="text-link" href="/abonnement/">une formule</a></li>'),
    q && q.nom !== 'Cœur' ? '<li><strong><svg class="ico" aria-hidden="true"><use href="/icones.svg#camera"/></svg> Photo de ton match</strong> : incluse dans ta formule, si ton match l’accepte</li>' : '<li><strong><svg class="ico" aria-hidden="true"><use href="/icones.svg#camera"/></svg> Photo de ton match</strong> : incluse à partir de la formule Passion, ou 3 € pour la voir 1 heure · <a class="text-link" href="/abonnement/?formule=passion">en savoir plus</a></li>',
    u.mise_en_relation || u.speed_dating ? `<li><strong>Achetés à l’unité</strong> : ${u.mise_en_relation || 0} match(s) supplémentaire(s) · ${u.speed_dating || 0} place(s) de speed dating</li>` : '',
  ].filter(Boolean).join('');
  // Demandes : les attentes regroupées en une ligne, le reste en court ; les terminées repliées.
  const date = (d) => new Date(d).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long' });
  const toutes = p.interets || [];
  const attente = toutes.filter((i) => i.statut === 'a_traiter');
  const vivantes = toutes.filter((i) => ['mis_en_relation', 'en_reserve'].includes(i.statut));
  const finies = toutes.filter((i) => !['a_traiter', 'mis_en_relation', 'en_reserve'].includes(i.statut));
  const ligne = (i) => `<li>n° ${esc(i.cible_ref)} · <strong>${esc(FIN_DEMANDE[i.fin] || ETAT_DEMANDE[i.statut] || i.statut)}</strong>${i.date ? ` <small>${esc(date(i.date))}</small>` : ''}</li>`;
  const demandes = !toutes.length ? '' : `${attente.length ? `<p class="espace-demandes-attente"><strong>En attente</strong> <span class="espace-nb">${attente.length}</span><br>Lamia regarde si vous allez ensemble.<br><small>n° ${attente.map((i) => esc(i.cible_ref)).join(', n° ')}</small></p>` : ''}${vivantes.length ? `<ul>${vivantes.map(ligne).join('')}</ul>` : ''}${finies.length ? `<details class="espace-demandes-finies"><summary>Sans suite <span class="espace-nb">${finies.length}</span></summary><p><small>Vous n’étiez pas en relation : ce ne sont pas des dématchs.</small></p><ul>${finies.map(ligne).join('')}</ul></details>` : ''}`;
  const heure = (d) => new Date(d).toLocaleTimeString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { hour: '2-digit', minute: '2-digit' });
  // Une photo par match en cours. Pas d'achat dans l'appli Play, ni depuis l'Algérie (paiement en ligne impossible).
  const peutPayer = !window.LFB_PLAY && !p.algerie;
  const unePhoto = (pm) => {
    const titre = `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#camera"/></svg> La photo de ton match (profil n° ${esc(pm.ref)})</h3>`;
    if (pm.url) return `${titre}<img class="espace-photo-match" src="${esc(pm.url)}" alt="Photo de ton match" loading="lazy"><p><small>${pm.jusqu_a ? `Visible jusqu’à ${esc(heure(pm.jusqu_a))}. ` : ''}Rien que pour toi : merci de ne pas la partager.</small></p>`;
    if (pm.accepte === false) return `${titre}<p>Ton match n’a pas (encore) accepté de transmettre sa photo.</p>`;
    if (pm.achetable && peutPayer) return `${titre}<p>Vois sa photo pendant 1 heure pour 3 €, ou tant que dure le match avec la formule <a class="text-link" href="/abonnement/?formule=passion">Passion</a>.</p><label class="annonce-case"><input type="checkbox" data-photo-cgv="${esc(pm.ref)}"> <span>J’accepte les <a href="/cgv/#abonnement" target="_blank">conditions de vente</a> et je demande que l’heure commence dès le paiement.</span></label><p><button class="btn btn-ink" type="button" data-photo-acheter="${esc(pm.ref)}">Voir la photo · 3 €</button></p><p class="form-status" data-photo-statut="${esc(pm.ref)}"></p>`;
    if (!pm.inclus) return `${titre}<p>Elle est incluse à partir de la formule <a class="text-link" href="/abonnement/?formule=passion">Passion</a>, si ton match accepte de la transmettre.</p>`;
    return `${titre}<p>Lamia te la transmet dès que possible.</p>`;
  };
  const blocPhoto = (p.matchs_lies || []).map(unePhoto).join('');
  const cp = p.choisi_par || { nombre: 0, refs: [] };
  const blocChoisi = !cp.nombre ? '' : cp.inclus
    ? `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Qui t’a choisi·e</h3><p>${cp.refs.map((r) => `<strong>n° ${esc(r)}</strong>`).join(', ')} : ${cp.nombre > 1 ? 'ces profils sont' : 'ce profil est'} en tête de ton <a class="text-link" href="/rencontres/swipe/">swipe</a>. Choisis-${cp.nombre > 1 ? 'les' : 'le'} à ton tour pour un intérêt réciproque.</p>`
    : `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> ${cp.nombre} personne${cp.nombre > 1 ? 's t’ont' : ' t’a'} choisi·e</h3><p>Découvre qui avec la formule <a class="text-link" href="/abonnement/?formule=passion">Passion</a>${peutPayer ? ', ou pour 2 € pendant 24 heures' : ''}.</p>${peutPayer ? boutonService('qui_choisi', 'Voir qui t’a choisi·e pendant 24 heures', '2 €', 'Voir qui · 2 €') : ''}`;
  const finAvant = p.en_avant_jusqu_a ? new Date(p.en_avant_jusqu_a).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long' }) : '';
  const blocAvant = finAvant ? `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#star"/></svg> Ton profil est mis en avant</h3><p>En tête du swipe jusqu’au ${esc(finAvant)}.</p>` : peutPayer ? `<h3><svg class="ico" aria-hidden="true"><use href="/icones.svg#star"/></svg> Mets ton profil en avant</h3><p>En tête du swipe pendant 7 jours, auprès des personnes qui correspondent à ses critères. Lamia ne promet pas de match, mais tu seras vu·e plus tôt.</p>${boutonService('profil_avant', 'Profil mis en avant pendant 7 jours', '5 €', 'Mettre en avant · 5 €')}` : '';
  el.innerHTML = `<h3>Mon suivi</h3><ul>${lignes}</ul>${blocChoisi}${blocAvant}${blocPhoto}
    <p><a class="po-btn" href="/rencontres/swipe/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Swiper les profils</a></p>
    <h3>Mes demandes de match</h3>${demandes ? demandes : '<p>Aucune pour l’instant. <a class="text-link" href="/rencontres/#profils-anonymes">Voir les profils</a></p>'}`;
  el.querySelectorAll('[data-photo-acheter]').forEach((b) => b.addEventListener('click', async () => {
    const ref = b.dataset.photoAcheter, st = el.querySelector(`[data-photo-statut="${ref}"]`);
    if (!el.querySelector(`[data-photo-cgv="${ref}"]`)?.checked) { st.textContent = 'Coche la case des conditions de vente pour continuer.'; return; }
    b.disabled = true; st.textContent = 'Ouverture du paiement…';
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ action: 'abonnement_payer', unite: 'photo_match', ref: Number(ref), cgv_accepted: true }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { location.href = d.url; return; }
      st.textContent = d.error === 'photo_indisponible' ? 'Cette photo n’est pas disponible : ton match l’a peut-être retirée.' : 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.';
    } catch { st.textContent = 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.'; }
    b.disabled = false;
  }));
}

// Abonnement « Trouve ton âme sœur » : formule en cours, achats à l'unité, gestion (résiliation) chez Stripe.
const NOMS_FORMULES = { coeur: 'Cœur', passion: 'Passion', prestige: 'Prestige' };
const ETATS_ABO = { actif: 'Actif', impaye: 'Paiement à régulariser', en_attente: 'En attente', suspendu: 'Suspendu' };
function monAbonnement(etat, session) {
  const box = document.querySelector('[data-espace-abonnement]');
  if (!box) return;
  const a = etat?.abonnement, u = etat?.unites || {};
  const date = (d) => new Date(d).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long', year: 'numeric' });
  const unites = [u.mise_en_relation ? `${u.mise_en_relation} mise(s) en relation` : '', u.speed_dating ? `${u.speed_dating} place(s) de speed dating` : ''].filter(Boolean).join(' · ');
  if (a?.offert) { box.innerHTML = `<article class="espace-achat"><div><p class="event-date">Offerte par Lamia</p><h3>Formule ${esc(NOMS_FORMULES[a.formule] || a.formule)}</h3><p>${a.raison === 'moderateur' ? 'Merci pour ta modération ' : ''}Rien à payer.</p>${unites ? `<p>À l’unité : ${esc(unites)}</p>` : ''}</div></article>`; return; }
  box.innerHTML = a
    ? `<article class="espace-achat"><div><p class="event-date">Abonnement ${a.periode === 'an' ? 'annuel' : 'mensuel'}</p><h3>Formule ${esc(NOMS_FORMULES[a.formule] || a.formule)}</h3>
        <p>${esc(ETATS_ABO[a.statut] || a.statut)}${a.fin_periode ? ` · ${a.resiliation_prevue ? 'se termine le' : 'prochaine échéance le'} ${esc(date(a.fin_periode))}` : ''}</p>${unites ? `<p>À l’unité : ${esc(unites)}</p>` : ''}</div>
        <div class="espace-achat-droite"><button class="btn btn-ink" type="button" data-gerer-abo>Gérer mon abonnement</button></div></article><p class="form-status" data-gerer-statut></p>`
    : `<p>${unites ? `À l’unité : ${esc(unites)}. ` : ''}Pas d’abonnement en cours. <a class="text-link" href="/abonnement/">Voir les formules</a> (la première mise en relation est offerte).</p>`;
  box.querySelector('[data-gerer-abo]')?.addEventListener('click', async (e) => {
    const st = box.querySelector('[data-gerer-statut]'); e.target.disabled = true; st.textContent = 'Ouverture…';
    try {
      const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: 'abonnement_gerer' }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { location.href = d.url; return; }
      throw new Error();
    } catch { st.textContent = 'La gestion de l’abonnement n’a pas pu s’ouvrir. Écris à Lamia depuis les Confidences.'; e.target.disabled = false; }
  });
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
  // Connexion sans mot de passe : un lien par email (le lien connecte directement ; le mot de passe se change ensuite dans l'espace).
  // Le lien part par l'email du site (pas de limite « trop de demandes » partagée par tout le site).
  say(st, 'Un instant…');
  let rep;
  try { rep = await api({ action: 'annonce_lien_connexion', email: String(f.get('email')).trim(), retour: 'espace', langue: document.documentElement.lang, en: document.documentElement.lang === 'en' }); }
  catch (err) { return say(st, err.code === 'trop_de_demandes' ? 'Plusieurs liens sont déjà partis pour cette adresse. Regarde dans tes emails (et les courriers indésirables), ou réessaie dans une heure.' : err.code === 'email_invalide' ? 'Vérifie ton adresse email.' : 'L’envoi n’a pas fonctionné. Réessaie dans un instant.', true); }
  if (rep && rep.existe === false) return say(st, 'Aucun espace n’existe avec cet email. Crée-le juste en dessous, c’est rapide.', true);
  say(st, 'C’est parti ! Ouvre l’email que tu viens de recevoir et clique sur le lien (pense aux courriers indésirables).');
});

$('[data-espace-newpass]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-newpass-status]');
  const { error } = await supabase.auth.updateUser({ password: f.get('password') });
  if (error) return say(st, /different|same/i.test(error.message) ? 'C’est déjà ton mot de passe actuel : tu es connecté·e, tu peux continuer.' : /weak|least|characters/i.test(error.message) ? 'Mot de passe trop simple : 8 caractères minimum, avec des lettres et des chiffres.' : /session|expired|jwt/i.test(error.message) ? 'Le lien a expiré. Redemande un lien de connexion.' : 'Le mot de passe n’a pas été enregistré. Réessaie.', true);
  recovering = false;
  render();
});

// Déconnexion fiable : on efface la session de ce navigateur même si le serveur ne répond pas.
$('[data-espace-logout]').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Déconnexion…';
  try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 3000))]); } catch { /* on nettoie quand même */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* stockage indisponible */ }
  location.replace(`${['en', 'ar', 'kab'].includes(document.documentElement.lang) ? `/${document.documentElement.lang}` : ''}/mon-espace/`);
});

$('[data-espace-mdp]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-mdp-status]');
  if (f.get('password') !== f.get('password2')) return say(st, 'Les deux mots de passe ne sont pas identiques.', true);
  say(st, 'Un instant…');
  const { error } = await supabase.auth.updateUser({ password: f.get('password') });
  if (error) return say(st, /different|same/i.test(error.message) ? 'Choisis un mot de passe différent de l’actuel.' : /reauth|recent/i.test(error.message) ? 'Par sécurité, déconnecte-toi puis reconnecte-toi avant de changer ton mot de passe.' : 'Le mot de passe n’a pas été enregistré (8 caractères minimum).', true);
  e.target.reset();
  say(st, 'C’est enregistré : ton nouveau mot de passe est actif.');
});

$('[data-espace-signup]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-signup-status]');
  say(st, 'Un instant…');
  try { await creerCompte({ email: String(f.get('email')).trim(), password: String(f.get('password')), prenom: String(f.get('first_name')).trim(), source: 'mon-espace' }); }
  catch (err) {
    return say(st, err.code === 'compte_existe' ? 'Un espace existe déjà avec cet email : connecte-toi, ou reçois un lien pour choisir ton mot de passe.' : err.code === 'trop_de_demandes' ? 'Plusieurs espaces viennent d’être créés depuis cette connexion. Réessaie dans une heure.' : err.code === 'mot_de_passe' ? 'Mot de passe trop court (8 caractères minimum).' : err.code === 'email_invalide' ? 'Vérifie ton adresse email.' : 'La création n’a pas fonctionné. Réessaie.', true);
  }
  const { error } = await supabase.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
  if (error) return say(st, 'Ton espace est créé : connecte-toi avec ton email et ton mot de passe.');
  say(st, ''); e.target.reset(); location.assign('/rencontres/swipe/?bienvenue=1');
});

supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') recovering = true; render(); });
render();

// Fiche créée en live avec Lamia, reliée à ce compte depuis le lien personnel.
const ETAT_FICHE = { confirmee: 'Confirmée : visible sur le site, anonyme', en_attente: 'Visible sur le site, en attente de ta confirmation', a_modifier: 'À corriger par toi : clique sur « Modifier mon annonce »', retiree: 'Retirée du site' };
async function mesFiches(session) {
  const box = document.querySelector('[data-espace-fiches]');
  if (!box) return;
  try {
    const { fiches = [] } = await appelProfil({ action: 'annonce_mes_fiches_outil' }, session);
    // Fiche créée en live reliée à ce compte : pas besoin d'inviter à « confier un profil ».
    if (fiches.length) { const sans = document.querySelector('[data-sans-profil]'); if (sans) sans.remove(); else setTimeout(() => document.querySelector('[data-sans-profil]')?.remove(), 1500); }
    box.innerHTML = fiches.map((f) => `<article class="espace-achat"><div><p class="event-date">Fiche n° ${esc(f.ref)} · créée en live avec Lamia</p><h3>${esc(ETAT_FICHE[f.etat] || f.etat)}</h3>
      <p>${esc([f.age && `${f.age} ans`, f.ville, f.pays].filter(Boolean).join(' · '))}</p>
      <p><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> <strong>${esc(f.interets.total)}</strong> personne(s) intéressée(s)${f.interets.mis_en_relation ? ` · ${esc(f.interets.mis_en_relation)} mise(s) en relation` : ''}${f.interets.dernier ? ` · dernier intérêt le ${esc(new Date(f.interets.dernier).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long' }))}` : ''}</p></div>
      <div class="espace-achat-droite"><a class="btn btn-ink" href="${esc(f.lien)}">Voir ma fiche</a> <a class="btn btn-line" href="${esc(f.lien)}#modifier">Modifier mon annonce</a></div></article>`).join('');
  } catch { box.innerHTML = ''; }
}

// Profils proposés par Lamia (depuis son outil) : fiche anonyme et réponse oui / non.
async function propositions(session) {
  const box = document.querySelector('[data-espace-propositions]');
  if (!box) return;
  let liste = [];
  const carte = (x) => {
    const f = x.fiche;
    const infos = [f.genre === 'femme' ? 'Une femme' : 'Un homme', f.age && `${f.age} ans`, origineLisible(f.origine), f.ville, f.village && `originaire de ${f.village}`, f.pays, f.situation].filter(Boolean);
    const ages = f.age_min || f.age_max ? ` · ${f.age_min || 18} à ${f.age_max || 99} ans` : '';
    const rep = x.reponse === 'oui' ? '<p class="espace-match">Tu as dit oui ! Si l’autre personne dit oui aussi, vous êtes mis en relation tout de suite et une discussion s’ouvre ici.</p>'
      : x.reponse === 'non' ? '<p>Tu as répondu : pas pour moi.</p>'
      : `<p class="interet-boutons"><button type="button" class="btn btn-ink" data-proposition="oui" data-id="${esc(x.id)}">Ce profil m’intéresse</button><button type="button" class="btn btn-line" data-proposition="non" data-id="${esc(x.id)}">Pas pour moi</button></p>`;
    return `<article class="espace-achat interet-recu proposition"><div><p class="event-date">Proposé par Lamia · profil n° ${esc(f.ref)} · le ${esc(new Date(x.le).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long' }))}</p>
      <h3>${esc(infos.join(' · '))}</h3>
      ${x.message ? `<p class="proposition-mot">« ${esc(x.message)} » <small>Lamia</small></p>` : ''}
      ${f.profil ? `<p><strong>Qui je suis :</strong> <span data-membre>${esc(f.profil)}</span></p>` : ''}
      ${f.recherche ? `<p><strong>Qui je cherche${esc(ages)} :</strong> <span data-membre>${esc(f.recherche)}</span></p>` : ''}
      ${secteurLisible(f.secteur) ? `<p><strong>Cherche en :</strong> ${esc(secteurLisible(f.secteur))}</p>` : ''}
      ${rep}${moderation(f.ref)}</div></article>`;
  };
  const afficher = () => { box.innerHTML = liste.length ? enDeuxTemps(liste, carte, 'proposition') : '<p>Pas encore de proposition.</p>'; };
  try { ({ propositions: liste = [] } = await appelProfil({ action: 'annonce_propositions' }, session)); afficher(); }
  catch { box.innerHTML = '<p>Les propositions ne s’affichent pas pour le moment.</p>'; return; }
  ecouter(box, 'click', async (e) => {
    const b = e.target.closest('[data-proposition]');
    if (!b) return;
    b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try { const r = await appelProfil({ action: 'annonce_proposition_rep', id: b.dataset.id, reponse: b.dataset.proposition }, session); liste = liste.map((x) => (x.id === b.dataset.id ? { ...x, reponse: b.dataset.proposition } : x)); afficher(); if (r?.mis_en_relation) location.hash = '#discussion', location.reload(); }
    catch (err) { b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = false; }); direErreurReponse(b.parentElement, err); }
  });
}

// Les fiches auxquelles on a déjà répondu : une ligne chacune, repliées sous le titre.
const REPONDU = { proposition: { oui: 'Tu as dit oui', non: 'Tu as dit non' }, avis: { oui: 'Différence acceptée', non: 'Tu as dit non' }, interet: { oui: 'Tu as dit oui', non: 'Tu as dit non' } };
function enDeuxTemps(liste, carte, type) {
  const a = liste.filter((x) => !x.reponse), r = liste.filter((x) => x.reponse);
  const court = (x) => `<li>n° ${esc(x.fiche.ref)} · <strong>${esc(REPONDU[type][x.reponse] || '')}</strong></li>`;
  return `${a.map(carte).join('')}${r.length ? `<details class="espace-deja"><summary>Déjà répondu <span class="espace-nb">${r.length}</span></summary><ul>${r.map(court).join('')}</ul></details>` : ''}`;
}

// Une réponse refusée se dit toujours : sinon le bouton semble ne rien faire.
function direErreurReponse(boutons, err) {
  boutons.parentElement.querySelector('.interet-erreur')?.remove();
  const p = document.createElement('p');
  p.className = 'interet-erreur'; p.setAttribute('role', 'alert');
  p.innerHTML = err?.code === 'annonce_en_pause'
    ? '<strong>Ton annonce est en pause.</strong> Reprends-la pour dire oui : le bouton est dans ton profil, plus haut.'
    : err?.code === 'photos_requises'
    ? '<strong>Il te manque tes 2 photos</strong> pour dire oui. Elles restent privées. <a class="text-link" href="#photos">Ajouter mes photos</a>'
    : 'Ta réponse n’est pas passée. Vérifie ta connexion et réessaie.';
  boutons.after(p);
}

// « Lamia te demande ton avis » : un de tes critères (secteur…) n'est pas respecté par un profil ; d'accord quand même ?
async function avisLamia(session) {
  const ancre = document.querySelector('[data-espace-interets]');
  if (!ancre) return;
  let liste = [];
  try { ({ avis: liste = [] } = await appelProfil({ action: 'annonce_avis_lamia' }, session)); } catch { return; }
  if (!liste.length) return;
  // Une seule boîte, même si l'espace se recharge (sinon les avis s'affichent en double).
  document.querySelectorAll('#avis').forEach((x) => x.remove());
  const box = document.createElement('div');
  box.className = 'espace-interets espace-avis'; box.id = 'avis';
  ancre.before(box);
  const carte = (x) => {
    const f = x.fiche;
    const infos = [f.genre === 'femme' ? 'Une femme' : 'Un homme', f.age && `${f.age} ans`, f.ville, f.pays, f.situation].filter(Boolean);
    const ages = f.age_min || f.age_max ? ` · ${f.age_min || 18} à ${f.age_max || 99} ans` : '';
    const rep = x.reponse === 'oui' ? '<p class="espace-match"><svg class="ico" aria-hidden="true"><use href="/icones.svg#thumbs-up"/></svg> Tu as dit oui : c’est noté.</p><p>Pense à mettre à jour ce que tu recherches pour recevoir aussi ce genre de profils : <a class="text-link" href="#mon-profil">Modifier mon annonce</a>.</p>'
      : x.reponse === 'non' ? '<p>Tu as répondu non : c’est noté, merci.</p>'
      : `<p><strong>Tu acceptes quand même ?</strong></p><p class="interet-boutons"><button type="button" class="btn btn-ink" data-avis="oui" data-id="${esc(x.id)}">Oui</button><button type="button" class="btn btn-line" data-avis="non" data-id="${esc(x.id)}">Non</button></p>`;
    return `<article class="espace-achat interet-recu proposition"><div><p class="event-date"><svg class="ico" aria-hidden="true"><use href="/icones.svg#message-circle"/></svg> Lamia te demande ton avis · profil n° ${esc(f.ref)}</p>
      ${(() => { const d = phrasesDifference(criteresDeQuestion(x.question), f); return d.length ? `<p class="espace-diff-intro">Ce profil ne correspond pas à ce que tu as demandé :</p><ul class="espace-diff">${d.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p class="proposition-mot">${esc(x.question)}</p>`; })()}
      <h3>${esc(infos.join(' · '))}</h3>
      ${f.profil ? `<p><strong>Qui je suis :</strong> <span data-membre>${esc(f.profil)}</span></p>` : ''}
      ${f.recherche ? `<p><strong>Qui je cherche${esc(ages)} :</strong> <span data-membre>${esc(f.recherche)}</span></p>` : ''}
      ${secteurLisible(f.secteur) ? `<p><strong>Cherche en :</strong> ${esc(secteurLisible(f.secteur))}</p>` : ''}
      ${rep}${moderation(f.ref)}</div></article>`;
  };
  const afficher = () => { box.innerHTML = `<h3 class="espace-avis-titre">Un profil avec une différence</h3>${enDeuxTemps(liste, carte, 'avis')}`; };
  afficher();
  ecouter(box, 'click', async (e) => {
    const b = e.target.closest('[data-avis]');
    if (!b) return;
    b.parentElement.querySelectorAll('button').forEach((y) => { y.disabled = true; });
    try { await appelProfil({ action: 'annonce_repondre_avis', id: b.dataset.id, reponse: b.dataset.avis }, session); liste = liste.map((y) => (y.id === b.dataset.id ? { ...y, reponse: b.dataset.avis } : y)); afficher(); }
    catch (err) { b.parentElement.querySelectorAll('button').forEach((y) => { y.disabled = false; }); direErreurReponse(b.parentElement, err); }
  });
}

// Intérêts reçus : fiche anonyme de la personne intéressée, et réponse oui / non.
async function interetsRecus(session) {
  const box = document.querySelector('[data-espace-interets]');
  if (!box) return;
  let liste = [];
  const carte = (i) => {
    const f = i.fiche;
    const infos = [f.genre === 'femme' ? 'Une femme' : 'Un homme', f.age && `${f.age} ans`, f.ville, f.pays, f.situation].filter(Boolean);
    const ages = f.age_min || f.age_max ? ` · ${f.age_min || 18} à ${f.age_max || 99} ans` : '';
    const rep = i.reponse === 'oui' ? '<p class="espace-match"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Tu as dit oui : c’est réciproque, Lamia est prévenue.</p>'
      : i.reponse === 'non' ? '<p>Tu as répondu : pas pour moi.</p>'
      : `<p class="interet-boutons"><button type="button" class="btn btn-ink" data-repondre="oui" data-id="${esc(i.id)}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Ça m’intéresse aussi</button><button type="button" class="btn btn-line" data-repondre="non" data-id="${esc(i.id)}">Pas pour moi</button></p>`;
    return `<article class="espace-achat interet-recu"><div><p class="event-date">Profil n° ${esc(f.ref)} · intéressé·e par ta fiche n° ${esc(i.pour)} · le ${esc(new Date(i.le).toLocaleDateString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long' }))}</p>
      <h3>${esc(infos.join(' · '))}</h3>
      ${f.profil ? `<p><strong>Qui je suis :</strong> <span data-membre>${esc(f.profil)}</span></p>` : ''}
      ${f.recherche ? `<p><strong>Qui je cherche${esc(ages)} :</strong> <span data-membre>${esc(f.recherche)}</span></p>` : ''}
      ${secteurLisible(f.secteur) ? `<p><strong>Cherche en :</strong> ${esc(secteurLisible(f.secteur))}</p>` : ''}
      ${rep}${moderation(f.ref)}</div></article>`;
  };
  const afficher = () => { box.innerHTML = liste.length ? enDeuxTemps(liste, carte, 'interet') : '<p>Personne pour le moment.</p>'; };
  try { ({ interets: liste = [] } = await appelProfil({ action: 'annonce_interets_recus' }, session)); afficher(); }
  catch { box.innerHTML = '<p>Les intérêts reçus ne s’affichent pas pour le moment. Réessaie dans un instant.</p>'; return; }
  ecouter(box, 'click', async (e) => {
    const b = e.target.closest('[data-repondre]');
    if (!b) return;
    b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try { await appelProfil({ action: 'annonce_repondre_interet', id: b.dataset.id, reponse: b.dataset.repondre }, session); liste = liste.map((x) => (x.id === b.dataset.id ? { ...x, reponse: b.dataset.repondre } : x)); afficher(); }
    catch (err) { b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = false; }); direErreurReponse(b.parentElement, err); }
  });
}


// ---------------------------------------------------------------- notifications sur ce téléphone (intérêts, matchs, mises en relation)
(function notifications() {
  const box = document.querySelector('[data-espace-notifs]');
  if (!box) return;
  const possible = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent), installee = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const octets = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  const dire = (html) => { box.innerHTML = html; };
  async function etat() {
    if (!possible) return dire(ios && !installee ? '<p><svg class="ico" aria-hidden="true"><use href="/icones.svg#bell"/></svg> Sur iPhone, les notifications marchent avec l’application installée : <a class="text-link" href="/application/">installe-la</a>, puis reviens ici depuis l’icône.</p><p class="espace-aide">En attendant, tu es prévenu·e par email.</p>' : '<p><svg class="ico" aria-hidden="true"><use href="/icones.svg#bell"/></svg> Ce navigateur ne permet pas les notifications. Tu es prévenu·e par email.</p>');
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub && Notification.permission === 'granted') {
      let prefs = {}; try { prefs = JSON.parse(localStorage.getItem('lfb-notif-prefs') || '{}'); } catch { /* */ }
      const T = [['boutique', 'Boutique', '#C9BCE8'], ['article', 'Articles', '#6C5BA7'], ['actu', 'Actus', '#2e9d5b'], ['live', 'Lives', '#c8213f']];
      dire(`<p><svg class="ico" aria-hidden="true"><use href="/icones.svg#bell"/></svg> <strong>Notifications activées sur ce téléphone.</strong> Tu es toujours prévenu·e pour tes rencontres (intérêt, réciproque, match). En plus, je veux être prévenu·e des nouveautés :</p><div class="notif-prefs">${T.map(([k, n, c]) => `<label style="--c:${c}"><input type="checkbox" data-pref="${k}"${prefs[k] === false ? '' : ' checked'}> ${n}</label>`).join('')}</div><p><button type="button" class="btn btn-line" data-notif-off>Désactiver sur ce téléphone</button></p>`);
      box.querySelectorAll('[data-pref]').forEach((c) => c.addEventListener('change', async () => {
        const p = Object.fromEntries([...box.querySelectorAll('[data-pref]')].map((x) => [x.dataset.pref, x.checked]));
        try { localStorage.setItem('lfb-notif-prefs', JSON.stringify(p)); } catch { /* */ }
        const { data: { session } } = await supabase.auth.getSession();
        if (session) fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: 'annonce_notif_prefs', endpoint: sub.endpoint, prefs: p }) }).catch(() => {});
      }));
      return;
    }
    if (Notification.permission === 'denied') return dire('<p><svg class="ico" aria-hidden="true"><use href="/icones.svg#bell-off"/></svg> Les notifications sont bloquées pour ce site dans les réglages de ton téléphone. Autorise-les dans les réglages du navigateur, puis recharge la page.</p>');
    dire('<p><svg class="ico" aria-hidden="true"><use href="/icones.svg#bell"/></svg> Sois prévenu·e tout de suite quand quelqu’un s’intéresse à toi, quand c’est réciproque, quand Lamia te trouve un match… et des nouveautés de la boutique, des articles et des lives.</p><p><button type="button" class="btn btn-ink" data-notif-on>Activer les notifications</button></p>');
  }
  ecouter(box, 'click', async (e) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const appel = (body) => fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) }).then((r) => r.json());
    if (e.target.closest('[data-notif-on]')) {
      e.target.disabled = true;
      try {
        if ((await Notification.requestPermission()) !== 'granted') return etat();
        const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
        await navigator.serviceWorker.ready;
        const { publicKey } = await appel({ action: 'annonce_push_cle' });
        const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octets(publicKey) }));
        const r = await appel({ action: 'annonce_push_abonner', subscription: sub.toJSON(), tester: true });
      } catch { /* */ }
      etat();
    }
    if (e.target.closest('[data-notif-off]')) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) { await appel({ action: 'annonce_push_desabonner', endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
      etat();
    }
  });
  supabase.auth.getSession().then(({ data: { session } }) => { if (session) etat(); });
})();


// ---------------------------------------------------------------- discussion après une mise en relation (7 jours, puis échange des numéros)
async function discussions(session) {
  const bloc = document.querySelector('[data-espace-discussion-bloc]'), box = document.querySelector('[data-espace-discussion]');
  if (!bloc || !box) return;
  let liste = [], ouverte = null, salut = '', e = '·e';
  clearInterval(minuterieDiscussions);
  const heure = (d) => new Date(d).toLocaleString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const reste = (d) => { const ms = new Date(d.ferme_at) - Date.now(); if (ms <= 0) return 'terminée'; const j = Math.floor(ms / 86400e3), h = Math.floor((ms % 86400e3) / 3600e3); return j ? `encore ${j} jour${j > 1 ? 's' : ''}${h ? ` et ${h} h` : ''}` : `encore ${h} h`; };
  // Parcours vers le mariage : ouvert avec la discussion, les deux valident chaque étape.
  const vueParcours = (d) => {
    const p = d.parcours;
    if (!p) return '';
    // La frise : chaque étape en un mot, celle en cours bien visible. Le détail n'est donné que pour l'étape en cours.
    const frise = p.etapes.map((x) => `<li class="parcours-mot is-${esc(x.etat)}"${x.etat === 'en_cours' ? ' aria-current="step"' : ''}><span>${x.etat === 'faite' ? '✓' : esc(x.numero)}</span>${esc(x.mot)}</li>`).join('');
    const x = p.etapes.find((y) => y.etat === 'en_cours');
    const questions = x && p.actif && d.ouverte && x.questions.length ? `<div class="parcours-questions"><small>Une question pour commencer :</small>${x.questions.map((q) => `<button type="button" class="parcours-question" data-parcours-question="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '';
    const etat = !x || !p.actif ? '' : x.moi
      ? `<p class="parcours-attente">✓ Tu as validé. On attend ${esc(d.avec)}.</p>`
      : `<p class="parcours-valider">${x.lui ? `<span>${esc(d.avec)} a déjà validé.</span> ` : ''}<button type="button" class="btn btn-ink" data-parcours-valider="${esc(x.id)}">Nous avons vécu cette étape</button></p>`;
    const detail = x ? `<div class="parcours-detail"><strong>${esc(x.titre)}</strong><p>${esc(x.texte)}</p>${questions}${etat}</div>` : '';
    return `<details class="parcours" ${p.fini ? '' : 'open'}><summary><svg class="ico" aria-hidden="true"><use href="/icones.svg#gem"/></svg> Votre parcours vers le mariage <span>${p.fini ? 'Terminé, félicitations !' : `Étape ${esc(p.courante + 1)} sur ${esc(p.total)} : ${esc(x.mot)}`}</span></summary><p class="parcours-livre">Le parcours de mariage de Lamia, détaillé dans l’ebook <a class="text-link" href="/werdi-ouvre-les-yeux/"><em>Werdi, ouvre les yeux !</em></a></p><ol class="parcours-frise">${frise}</ol>${detail}</details>`;
  };
  const raisonsDematch = [['physique', 'Physique'], ['enfants', 'Enfants'], ['localisation', 'Localisation'], ['caractere', 'Caractère'], ['valeurs', 'Valeurs'], ['parcours', 'Une étape du parcours'], ['autre', 'Autre raison']]
    .map(([v, t]) => `<label><input type="radio" name="raison" value="${v}" required> ${t}</label>`).join('');
  let dematchOuvert = null;
  const vue = (d) => {
    const msgs = d.messages.map((m) => `<p class="disc-msg ${m.moi ? 'is-moi' : ''}${m.lamia ? ' is-systeme' : ''}"><span>${esc(m.texte)}</span><small>${esc(heure(m.le))}</small></p>`).join('') || `<p class="disc-vide">${salut ? `${esc(salut)}, dis` : 'Dis'} bonjour à ${esc(d.avec)}</p>`;
    const numeros = d.echange
      ? `<div class="disc-numeros is-ok"><svg class="ico" aria-hidden="true"><use href="/icones.svg#phone"/></svg> Vous avez échangé vos numéros. Celui de ${esc(d.avec)} : <a href="tel:${esc(d.son_numero)}"><strong>${esc(d.son_numero)}</strong></a></div>`
      : d.mon_numero
        ? `<div class="disc-numeros"><svg class="ico" aria-hidden="true"><use href="/icones.svg#phone"/></svg> Tu as donné ton numéro. ${esc(d.avec)} le verra dès qu’il ou elle aura donné le sien${d.il_a_partage ? '' : ' (on l’a prévenu·e)'}.</div>`
        : d.ouverte ? `<form class="disc-numeros" data-disc-numero><label><svg class="ico" aria-hidden="true"><use href="/icones.svg#phone"/></svg> ${d.il_a_partage ? `<strong>${esc(d.avec)} a donné son numéro</strong> : donne le tien pour le voir` : `${salut ? `${esc(salut)}, prêt${e}` : `Prêt${e}`} à passer au téléphone ? Donne ton numéro`} <input name="telephone" type="tel" autocomplete="tel" placeholder="06 12 34 56 78" required></label><button class="btn btn-ink" type="submit">Échanger nos numéros</button><small>Ton numéro n’est montré que quand vous l’avez donné tous les deux.</small></form>` : '';
    return `<article class="disc" data-disc="${esc(d.id)}">
      <header class="disc-tete"><strong>Avec ${esc(d.avec)}</strong><span>${d.ouverte ? `${esc(reste(d))}` : d.close_raison === 'signalee' ? 'fermée (signalée)' : d.close_raison ? 'fermée' : 'terminée'}</span></header>
      ${d.ses_autres_matchs > 0 ? `<p class="disc-honnete">Par honnêteté : ${esc(d.avec)} a aussi ${d.ses_autres_matchs} autre${d.ses_autres_matchs > 1 ? 's' : ''} match${d.ses_autres_matchs > 1 ? 's' : ''} en cours.</p>` : ''}
      ${d.mes_autres_matchs > 0 ? `<p class="disc-honnete">De ton côté, tu as ${d.mes_autres_matchs} autre${d.mes_autres_matchs > 1 ? 's' : ''} match${d.mes_autres_matchs > 1 ? 's' : ''} en cours : ${esc(d.avec)} le voit aussi.</p>` : ''}
      ${vueParcours(d)}
      <div class="disc-fil" data-disc-fil>${msgs}</div>
      ${d.dematch ? `<div class="disc-dematch-etat">${d.dematch.par_moi
        ? `<strong><svg class="ico" aria-hidden="true"><use href="/icones.svg#handshake"/></svg> Tu as mis fin à ce match.</strong> ${d.dematch.restants ? `Il te reste <strong>${esc(d.dematch.restants)} message${d.dematch.restants > 1 ? 's' : ''}</strong> pour dire au revoir.` : `Merci d’être resté${e} courtois${e === 'e' ? 'e' : e ? '·e' : ''}.`}`
        : `<strong><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> ${esc(d.avec)} a mis fin à ce match.</strong> Raison : ${esc(d.dematch.raison)}. ${d.dematch.restants ? `Tu peux répondre, il te reste ${esc(d.dematch.restants)} message${d.dematch.restants > 1 ? 's' : ''}.` : ''}`}
        ${d.ouverte ? `<small>La discussion se ferme le ${esc(new Date(d.dematch.fin).toLocaleString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.</small>` : ''}</div>` : ''}
      ${d.ouverte && (!d.dematch || d.dematch.restants) ? `<form class="disc-saisie" data-disc-envoi><textarea name="texte" rows="2" maxlength="1000" placeholder="Ton message…" required></textarea><button class="btn btn-ink" type="submit">Envoyer</button></form>
      <p class="disc-aide">Pour ta sécurité, les numéros, liens et emails écrits dans les messages sont masqués : utilise le bouton ci-dessous pour échanger vos numéros. Reste sur l’application tant que tu n’es pas sûr·e : ton numéro et tes réseaux restent protégés.</p>` : ''}
      ${d.ouverte && !d.dematch && !d.prenom?.partage ? (d.prenom?.demander
        ? `<div class="disc-prenom"><p><svg class="ico" aria-hidden="true"><use href="/icones.svg#hand"/></svg> <strong>Veux-tu partager ton prénom${d.prenom.mien ? ` (${esc(d.prenom.mien)})` : ''} avec ton match ?</strong> Rien ne presse : tu peux aussi le faire plus tard, après vos premiers échanges.</p><p><button type="button" class="btn btn-ink" data-disc-prenom="partager">Oui, partager</button> <button type="button" class="btn btn-line" data-disc-prenom="plus_tard">Plus tard</button></p></div>`
        : '<p class="disc-prenom-lien"><button type="button" class="link-button" data-disc-prenom="partager"><svg class="ico" aria-hidden="true"><use href="/icones.svg#hand"/></svg> Partager mon prénom</button></p>') : ''}
      ${d.dematch ? '' : numeros}
      ${d.prolongeable && !window.LFB_PLAY && new Date(d.ferme_at) - Date.now() < 72 * 3600e3 ? `<div class="disc-prolonger">${d.ouverte ? '' : '<p>Votre discussion est terminée, mais vous pouvez la rouvrir.</p>'}${boutonService('prolonger_discussion', 'Prolonger la discussion de 7 jours', '3 €', '7 jours de plus · 3 €', d.id)}</div>` : ''}
      ${d.ouverte && !d.dematch ? (dematchOuvert === d.id ? `<form class="disc-dematch" data-disc-dematch-form>
        <h4><svg class="ico" aria-hidden="true"><use href="/icones.svg#handshake"/></svg> Tu peux dématcher, avec élégance</h4>
        <p>Tu as encore <strong>deux messages</strong> à écrire pour rester ${e === '' ? 'courtois et gentleman' : e === 'e' ? 'courtoise et élégante' : 'courtois·e et élégant·e'}. Si tu confirmes, ton match sera informé de ton dématch et attendra un au revoir, voire une raison.</p>
        <fieldset><legend>Pourquoi tu dématches ?</legend>${raisonsDematch}</fieldset>
        <label class="disc-dematch-etape" data-dematch-etape hidden>Quelle étape ? <select name="etape">${(d.parcours?.etapes || []).map((x) => `<option value="${esc(x.id)}">${esc(x.mot)}</option>`).join('')}</select></label>
        <p class="disc-dematch-actions"><button class="btn btn-ink" type="submit">Confirmer le dématch</button> <button type="button" class="link-button" data-disc-dematch-annuler>Je reste</button></p></form>`
        : `<p class="disc-dematch-lien"><button type="button" class="btn btn-line" data-disc-dematch>Dématcher</button></p>`) : ''}
      ${d.ouverte ? `<p><button type="button" class="link-button" data-disc-signaler><svg class="ico" aria-hidden="true"><use href="/icones.svg#flag"/></svg> Bloquer et signaler</button></p>` : ''}
    </article>`;
  };
  const afficher = () => {
    bloc.hidden = !liste.length;
    if (!liste.length) return;
    const brouillons = Object.fromEntries([...box.querySelectorAll('[data-disc]')].map((a) => [a.dataset.disc, a.querySelector('textarea')?.value || '']));
    box.innerHTML = liste.map(vue).join('');
    box.querySelectorAll('[data-disc]').forEach((a) => { const t = a.querySelector('textarea'); if (t && brouillons[a.dataset.disc]) t.value = brouillons[a.dataset.disc]; const f = a.querySelector('[data-disc-fil]'); f.scrollTop = f.scrollHeight; });
  };
  const charger = async () => { try { const r = await appelProfil({ action: 'annonce_discussions' }, session); liste = r.discussions || []; if (document.documentElement.lang !== 'en') { salut = r.adresse || ''; e = r.accord ?? e; const h1 = $('[data-espace-nom]')?.closest('h1'); if (salut && h1) h1.textContent = salut; } afficher(); } catch { /* */ } };
  { const h = location.hash.match(/^#dematcher-(.+)$/); if (h) dematchOuvert = decodeURIComponent(h[1]); }
  await charger();
  if (dematchOuvert && liste.length) box.querySelector(`[data-disc="${CSS.escape(dematchOuvert)}"] [data-disc-dematch-form]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  else if (location.hash === '#discussion' && liste.length) bloc.scrollIntoView({ behavior: 'smooth' });
  // Les nouveaux messages arrivent toutes les 10 secondes tant que la page est ouverte.
  if (liste.some((d) => d.ouverte)) minuterieDiscussions = setInterval(() => { if (!document.hidden && !dematchOuvert && !box.contains(document.activeElement)) charger(); }, 10000);
  ecouter(box, 'submit', async (e) => {
    e.preventDefault();
    const a = e.target.closest('[data-disc]'), id = a?.dataset.disc;
    const bouton = e.target.querySelector('button'); bouton.disabled = true;
    try {
      if (e.target.matches('[data-disc-dematch-form]')) {
        await appelProfil({ action: 'annonce_discussion_dematcher', id, raison: e.target.raison.value, etape: e.target.etape?.value }, session);
        dematchOuvert = null;
        await charger();
        return;
      }
      if (e.target.matches('[data-disc-envoi]')) {
        const texte = e.target.texte.value.trim();
        const r = await appelProfil({ action: 'annonce_discussion_envoyer', id, texte }, session);
        e.target.texte.value = '';
        if (r.masque) alert('Un numéro, un lien ou un email a été masqué dans ton message. Pour passer au téléphone, utilise « Échanger nos numéros ».');
      } else if (e.target.matches('[data-disc-numero]')) {
        await appelProfil({ action: 'annonce_discussion_numero', id, telephone: e.target.telephone.value }, session);
      }
      await charger();
    } catch (err) {
      alert(err.code === 'telephone_invalide' ? 'Ce numéro ne semble pas valide. Exemple : 06 12 34 56 78 ou +213 5 12 34 56 78.' : err.code === 'au_revoir_fini' ? 'Tu as écrit tes deux messages d’au revoir.' : err.code === 'raison_requise' ? 'Choisis une raison.' : err.code === 'discussion_fermee' ? 'Cette discussion est terminée.' : err.code === 'rate_limited' ? 'Doucement Réessaie dans quelques minutes.' : 'Le message n’est pas parti. Réessaie.');
    }
    bouton.disabled = false;
  });
  ecouter(box, 'change', (e) => {
    if (e.target.name !== 'raison') return;
    const champ = e.target.closest('form').querySelector('[data-dematch-etape]');
    if (champ) champ.hidden = e.target.value !== 'parcours';
  });
  ecouter(box, 'click', async (e) => {
    const choixPrenom = e.target.closest('[data-disc-prenom]');
    if (choixPrenom) {
      choixPrenom.disabled = true;
      try { await appelProfil({ action: 'annonce_discussion_prenom', id: choixPrenom.closest('[data-disc]').dataset.disc, choix: choixPrenom.dataset.discPrenom }, session); await charger(); }
      catch (err) { choixPrenom.disabled = false; alert(err.code === 'prenom_absent' ? 'Ajoute d’abord ton prénom dans ton annonce.' : 'Ça n’a pas marché. Réessaie dans un instant.'); }
      return;
    }
    const ouvrir = e.target.closest('[data-disc-dematch]');
    if (ouvrir) { dematchOuvert = ouvrir.closest('[data-disc]').dataset.disc; afficher(); return; }
    if (e.target.closest('[data-disc-dematch-annuler]')) { dematchOuvert = null; afficher(); return; }
    const question = e.target.closest('[data-parcours-question]');
    if (question) { const t = question.closest('[data-disc]').querySelector('textarea'); if (t) { t.value = question.textContent.trim(); t.focus(); } return; }
    const valider = e.target.closest('[data-parcours-valider]');
    if (valider) {
      valider.disabled = true;
      try { await appelProfil({ action: 'annonce_parcours_valider', id: valider.closest('[data-disc]').dataset.disc, etape: valider.dataset.parcoursValider }, session); await charger(); } catch { valider.disabled = false; alert('La validation n’est pas passée. Réessaie.'); }
      return;
    }
    if (!e.target.closest('[data-disc-signaler]')) return;
    const id = e.target.closest('[data-disc]').dataset.disc;
    const motif = prompt('Bloquer et signaler ? La discussion sera fermée, vous ne vous reverrez plus, et Lamia la lira.\n\nQue s’est-il passé ? (facultatif)');
    if (motif === null) return;
    try {
      await appelProfil({ action: 'annonce_discussion_signaler', id, motif }, session);
      // Un signalement protège aussi : les deux personnes ne se revoient plus, et le match s'arrête.
      const avec = liste.find((x) => x.id === id)?.avec_ref;
      if (avec) await appelProfil({ action: 'annonce_bloquer', ref: avec, motif: 'Discussion signalée' }, session).catch(() => {});
      clearInterval(minuterieDiscussions); await charger(); alert('Merci. Lamia est prévenue.'); } catch { alert('Le signalement n’est pas parti. Réessaie.'); }
  });
  ecouter(box, 'keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches('textarea')) { e.preventDefault(); e.target.form.requestSubmit(); } });
}


// ---------------------------------------------------------------- supprimer mon compte
document.querySelector('[data-espace-supprimer]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = document.querySelector('[data-supprimer-status]'), bouton = e.target.querySelector('button');
  const confirmation = String(new FormData(e.target).get('confirmation') || '').trim();
  if (confirmation.toUpperCase() !== 'SUPPRIMER') return say(st, 'Écris SUPPRIMER pour confirmer.', true);
  if (!confirm('Supprimer définitivement ton compte ? Ce n’est pas réversible.')) return;
  bouton.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await appelProfil({ action: 'annonce_supprimer_compte', confirmation }, session);
    await supabase.auth.signOut().catch(() => {});
    say(st, 'Ton compte est supprimé. Merci d’être passé·e chez Lamia, prends soin de toi.');
    setTimeout(() => { location.href = '/'; }, 2500);
  } catch (err) {
    bouton.disabled = false;
    say(st, err.code === 'abonnement_actif' ? 'Tu as un abonnement en cours : résilie-le d’abord dans « Mon abonnement », puis reviens ici.' : 'La suppression n’a pas fonctionné. Réessaie, ou écris à Lamia.', true);
  }
});
