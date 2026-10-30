// Mon espace : connexion, mot de passe, soirées réservées, liens d'administration.
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const when = (iso) => new Date(iso).toLocaleString((document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR'), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const say = (el, msg, err = false) => { el.textContent = msg; el.classList.toggle('is-error', err); };
let recovering = false;

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
  achats(session);
  monProfil(session);
  mesFiches(session);
  interetsRecus(session);
  const { data } = await supabase.from('event_registrations')
    .select('attendance_status, speed_dating_events(title, audience, starts_at)')
    .neq('attendance_status', 'cancelled');
  const rows = (data || []).filter((r) => r.speed_dating_events).sort((a, b) => a.speed_dating_events.starts_at.localeCompare(b.speed_dating_events.starts_at));
  $('[data-espace-soirees]').innerHTML = rows.length
    ? rows.map((r) => `<article class="espace-soiree"><p class="event-date">${esc(when(r.speed_dating_events.starts_at))}</p><h3>${esc(r.speed_dating_events.title)}</h3>${r.speed_dating_events.audience ? `<p>${/^grand salon/i.test(r.speed_dating_events.audience) ? '' : 'Salon '}${esc(r.speed_dating_events.audience)}</p>` : ''}</article>`).join('')
    : '<p>Tu n’as pas encore réservé de soirée. <a class="text-link" href="/speed-dating/#events-title">Voir le Bal masqué</a></p>';
}

const money = (c, cur = 'EUR') => new Intl.NumberFormat((document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR'), { style: 'currency', currency: cur || 'EUR' }).format((c || 0) / 100);
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
          <div><p class="event-date">${esc(new Date(o.created_at).toLocaleDateString((document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR'), { day: 'numeric', month: 'long', year: 'numeric' }))} · n° ${esc(o.order_number)}</p>
          <h3>${(o.order_items || []).map((i) => `${esc(i.product_name)}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ') || 'Commande'}</h3>
          ${(o.order_items || []).filter((i) => i.telechargement).map((i) => `<a class="btn btn-ink btn-telecharger" href="${esc(i.telechargement)}">⬇ Télécharger mon livre numérique</a>`).join('')}</div>
          <div class="espace-achat-droite"><strong>${money(o.amount_total_cents, o.currency)}</strong><span class="statut is-${esc(o.status)}">${esc(STATUTS[o.status] || o.status)}</span></div>
        </article>`).join('')
      : '<p>Pas encore d’achat. Tes commandes apparaîtront ici. <a class="text-link" href="/boutique/">Voir la Boutique</a></p>';
  } catch { aboPret(null); box.innerHTML = '<p>Tes achats ne s’affichent pas pour le moment. Réessaie dans un instant.</p>'; }
}

// Profil confié à Lamia : état, avantages, modification, fin d'un match en cours.
const ETAT_PROFIL = { a_verifier: '⏳ En cours de vérification par Lamia', publiee: '✓ Vérifié par Lamia', refusee: 'Non retenu pour le moment' };
async function appelProfil(body, session) {
  const r = await fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw Object.assign(new Error(d.error || 'erreur'), { code: d.error });
  return d;
}
async function monProfil(session) {
  const box = document.querySelector('[data-espace-profil]');
  if (!box) return;
  try {
    const { profil: p } = await appelProfil({ action: 'annonce_mon_profil' }, session);
    if (!p) { box.innerHTML = '<p data-sans-profil>Tu n’as pas encore de profil chez Lamia. <a class="text-link" href="/rencontres/#confier">Confier mon profil</a> (la première mise en relation est offerte).</p>'; return; }
    box.innerHTML = `<article class="espace-achat"><div><p class="event-date">Profil n° ${esc(p.ref)}</p><h3>${esc(ETAT_PROFIL[p.status] || p.status)}${p.status === 'publiee' && p.piece_identite ? ' · 🛡 avec pièce d’identité' : ''}</h3>
      ${p.live ? `<p>🎥 Profil créé en live avec Lamia${p.live_retrouve ? '' : ' (Lamia vérifie ta fiche)'} : <strong>tes 3 premières mises en relation sont offertes</strong>.</p>` : '<p>Ta première mise en relation est offerte.</p>'}
      ${p.nb_compatibles !== null && p.nb_compatibles !== undefined ? `<p>D’après l’outil de Lamia, tu pourrais correspondre à ${esc(p.nb_compatibles)} personne(s).</p>` : ''}
      ${p.matchs ? `<p class="espace-match">💞 Matchs en cours : <strong>${esc(p.matchs.actifs)} / ${esc(p.matchs.limite)}</strong>${p.matchs.actifs >= p.matchs.limite ? (p.matchs.formule === 'decouverte' ? ' · pour matcher à nouveau, viens voir Lamia en live (chaque soir à 21 h) ou passe à une formule.' : ' · dès que Lamia a traité un match, tu peux en choisir d’autres.') : ''}</p>` : ''}</div>
      <div class="espace-achat-droite"><button class="btn btn-ink" type="button" data-profil-modifier>Modifier mon profil</button>${p.en_match ? '<button class="btn btn-line" type="button" data-profil-dematcher>Mettre fin à mon match</button>' : ''}</div></article>
      <div class="espace-suivi" data-profil-suivi></div>
      <label class="annonce-case espace-photo"><input type="checkbox" data-profil-photo${p.photo_partage ? ' checked' : ''}> <span>Si un match me convient, Lamia peut transmettre <strong>ma photo</strong> à la personne avec qui elle me met en relation (et à elle seule).</span></label>
      <p class="form-status" data-profil-statut></p><div data-profil-edition hidden></div>`;
    suivi(box.querySelector('[data-profil-suivi]'), p);
    box.querySelector('[data-profil-photo]').addEventListener('change', async (e) => {
      const st = box.querySelector('[data-profil-statut]'); e.target.disabled = true;
      try { await appelProfil({ action: 'annonce_photo_partage', photo_partage: e.target.checked }, session); st.textContent = e.target.checked ? 'C’est noté : ta photo pourra être transmise à ton match.' : 'C’est noté : ta photo ne sera transmise à personne.'; }
      catch { e.target.checked = !e.target.checked; st.textContent = 'Ça n’a pas été enregistré. Réessaie.'; }
      e.target.disabled = false;
    });
    box.querySelector('[data-profil-modifier]').addEventListener('click', async () => {
      const zone = box.querySelector('[data-profil-edition]');
      zone.hidden = false;
      const { monterFormulaire } = await import('/assets/annonces.js');
      monterFormulaire(zone, { existant: p, token: session.access_token });
      zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    box.querySelector('[data-profil-dematcher]')?.addEventListener('click', async (e) => {
      if (!confirm('Mettre fin à ton match en cours ? Lamia sera prévenue, et ton profil pourra de nouveau matcher.')) return;
      e.target.disabled = true;
      try { await appelProfil({ action: 'annonce_dematcher' }, session); monProfil(session); }
      catch { box.querySelector('[data-profil-statut]').textContent = 'Ça n’a pas fonctionné. Réessaie, ou écris à Lamia.'; e.target.disabled = false; }
    });
  } catch { box.innerHTML = '<p>Ton profil ne s’affiche pas pour le moment. Réessaie dans un instant.</p>'; }
}

// Suivi : mises en relation offertes et du mois, speed datings inclus, demandes envoyées.
const QUOTAS = { coeur: { nom: 'Cœur', mises: 3, sd: 1 }, passion: { nom: 'Passion', mises: null, sd: 2 }, prestige: { nom: 'Prestige', mises: null, sd: 2 } };
const ETAT_DEMANDE = { a_traiter: '⏳ Lamia étudie la compatibilité', mis_en_relation: '💞 Mise en relation faite', pas_compatible: 'Pas compatible, désolée', dematche: 'Match terminé' };
async function suivi(el, p) {
  const etat = await etatAbo;
  const a = etat?.abonnement, q = a ? QUOTAS[a.formule] : null, u = etat?.unites || {};
  const s = p.suivi || { mises_total: 0, mises_mois: 0 };
  const offertesRestantes = Math.max(0, (p.offertes || 1) - s.mises_total);
  const lignes = [
    `<li><strong>Mises en relation offertes</strong> : ${offertesRestantes} sur ${p.offertes || 1} restante(s)</li>`,
    q ? `<li><strong>Formule ${esc(q.nom)}</strong> : ${s.mises_mois} mise(s) en relation ce mois-ci${q.mises ? ` sur ${q.mises}` : ' (sans limite)'} · ${q.sd} speed dating inclus par mois</li>`
      : `<li><strong>Formule Découverte</strong> (gratuite) · <a class="text-link" href="/abonnement/">voir les formules</a></li>`,
    q && q.nom !== 'Cœur' ? '<li><strong>📷 Photo de ton match</strong> : incluse dans ta formule, si ton match l’accepte</li>' : '<li><strong>📷 Photo de ton match</strong> : incluse à partir de la formule Passion · <a class="text-link" href="/abonnement/?formule=passion">en savoir plus</a></li>',
    u.mise_en_relation || u.speed_dating ? `<li><strong>Achetés à l’unité</strong> : ${u.mise_en_relation || 0} mise(s) en relation · ${u.speed_dating || 0} place(s) de speed dating</li>` : '',
  ].filter(Boolean).join('');
  const demandes = (p.interets || []).map((i) => `<li>Profil n° ${esc(i.cible_ref)} · ${esc(ETAT_DEMANDE[i.statut] || i.statut)}${i.date ? ` <small>(${esc(new Date(i.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))})</small>` : ''}</li>`).join('');
  const pm = p.photo_match;
  const blocPhoto = !pm ? '' : pm.url ? `<h3>📷 La photo de ton match (profil n° ${esc(pm.ref)})</h3><img class="espace-photo-match" src="${esc(pm.url)}" alt="Photo de ton match" loading="lazy"><p><small>Pour toi seule : merci de ne pas la partager.</small></p>`
    : !pm.inclus ? '<h3>📷 La photo de ton match</h3><p>Elle est incluse à partir de la formule <a class="text-link" href="/abonnement/?formule=passion">Passion</a>, si ton match accepte de la transmettre.</p>'
    : pm.accepte === false ? '<h3>📷 La photo de ton match</h3><p>Ton match n’a pas (encore) accepté de transmettre sa photo.</p>'
    : '<h3>📷 La photo de ton match</h3><p>Lamia te la transmet dès que possible.</p>';
  const cp = p.choisi_par || { nombre: 0, refs: [] };
  const blocChoisi = !cp.nombre ? '' : cp.inclus
    ? `<h3>💞 Qui t’a choisi·e</h3><p>${cp.refs.map((r) => `<strong>n° ${esc(r)}</strong>`).join(', ')} : ${cp.nombre > 1 ? 'ces profils sont' : 'ce profil est'} en tête de ton <a class="text-link" href="/rencontres/swipe/">swipe</a>. Choisis-${cp.nombre > 1 ? 'les' : 'le'} à ton tour pour un intérêt réciproque.</p>`
    : `<h3>💞 ${cp.nombre} personne${cp.nombre > 1 ? 's t’ont' : ' t’a'} choisi·e</h3><p>Découvre qui avec la formule <a class="text-link" href="/abonnement/?formule=passion">Passion</a>.</p>`;
  el.innerHTML = `<h3>Mon suivi</h3><ul>${lignes}</ul>${blocChoisi}${blocPhoto}
    <p><a class="po-btn" href="/rencontres/swipe/">💘 Swiper les profils</a></p>
    <h3>Mes demandes de match</h3>${demandes ? `<ul>${demandes}</ul>` : '<p>Aucune pour l’instant. <a class="text-link" href="/rencontres/#profils-anonymes">Voir les profils</a></p>'}`;
}

// Abonnement « Trouve ton âme sœur » : formule en cours, achats à l'unité, gestion (résiliation) chez Stripe.
const NOMS_FORMULES = { coeur: 'Cœur', passion: 'Passion', prestige: 'Prestige' };
const ETATS_ABO = { actif: 'Actif', impaye: 'Paiement à régulariser', en_attente: 'En attente', suspendu: 'Suspendu' };
function monAbonnement(etat, session) {
  const box = document.querySelector('[data-espace-abonnement]');
  if (!box) return;
  const a = etat?.abonnement, u = etat?.unites || {};
  const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const unites = [u.mise_en_relation ? `${u.mise_en_relation} mise(s) en relation` : '', u.speed_dating ? `${u.speed_dating} place(s) de speed dating` : ''].filter(Boolean).join(' · ');
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
  const { error } = await supabase.auth.resetPasswordForEmail(f.get('email'), { redirectTo: `${location.origin}${document.documentElement.lang === 'en' ? '/en' : ''}/mon-espace/` });
  if (error) return say(st, /rate limit/i.test(error.message) ? 'Trop de demandes en ce moment. Réessaie dans une heure.' : 'L’envoi n’a pas fonctionné. Réessaie plus tard.', true);
  say(st, 'Si un espace existe avec cet email, un lien vient de partir. Pense à regarder tes courriers indésirables.');
});

$('[data-espace-newpass]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), st = $('[data-newpass-status]');
  const { error } = await supabase.auth.updateUser({ password: f.get('password') });
  if (error) return say(st, 'Le mot de passe n’a pas été enregistré (8 caractères minimum).', true);
  recovering = false;
  render();
});

// Déconnexion fiable : on efface la session de ce navigateur même si le serveur ne répond pas.
$('[data-espace-logout]').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Déconnexion…';
  try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 3000))]); } catch { /* on nettoie quand même */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* stockage indisponible */ }
  location.replace(`${document.documentElement.lang === 'en' ? '/en' : ''}/mon-espace/`);
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
  const { data, error } = await supabase.auth.signUp({ email: f.get('email'), password: f.get('password'), options: { data: { first_name: String(f.get('first_name')).trim() }, emailRedirectTo: `${location.origin}/mon-espace/` } });
  if (error) return say(st, /already registered|already exists/i.test(error.message) ? 'Un espace existe déjà avec cet email : connecte-toi, ou reçois un lien pour choisir ton mot de passe.' : /rate limit/i.test(error.message) ? 'Trop de demandes en ce moment. Réessaie dans une heure.' : /password/i.test(error.message) ? 'Mot de passe trop court (8 caractères minimum).' : 'La création n’a pas fonctionné. Réessaie.', true);
  if (data.session) { say(st, ''); return render(); }
  say(st, 'Ton espace est créé. Clique sur le lien reçu par email pour le confirmer (regarde aussi les courriers indésirables).');
  e.target.reset();
});

supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') recovering = true; render(); });
render();

// Fiche créée en live avec Lamia, reliée à ce compte depuis le lien personnel.
const ETAT_FICHE = { confirmee: '✅ Confirmée : visible sur le site, anonyme', en_attente: '⏳ Visible sur le site, en attente de ta confirmation', a_modifier: '✏️ Lamia corrige ta fiche', retiree: 'Retirée du site' };
async function mesFiches(session) {
  const box = document.querySelector('[data-espace-fiches]');
  if (!box) return;
  try {
    const { fiches = [] } = await appelProfil({ action: 'annonce_mes_fiches_outil' }, session);
    // Fiche créée en live reliée à ce compte : pas besoin d'inviter à « confier un profil ».
    if (fiches.length) { const sans = document.querySelector('[data-sans-profil]'); if (sans) sans.remove(); else setTimeout(() => document.querySelector('[data-sans-profil]')?.remove(), 1500); }
    box.innerHTML = fiches.map((f) => `<article class="espace-achat"><div><p class="event-date">Fiche n° ${esc(f.ref)} · créée en live avec Lamia</p><h3>${esc(ETAT_FICHE[f.etat] || f.etat)}</h3>
      <p>${esc([f.age && `${f.age} ans`, f.ville, f.pays].filter(Boolean).join(' · '))}</p>
      <p>💌 <strong>${esc(f.interets.total)}</strong> personne(s) intéressée(s)${f.interets.mis_en_relation ? ` · 💞 ${esc(f.interets.mis_en_relation)} mise(s) en relation` : ''}${f.interets.dernier ? ` · dernier intérêt le ${esc(new Date(f.interets.dernier).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}` : ''}</p></div>
      <div class="espace-achat-droite"><a class="btn btn-ink" href="${esc(f.lien)}">Voir ma fiche</a></div></article>`).join('');
  } catch { box.innerHTML = ''; }
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
    const rep = i.reponse === 'oui' ? '<p class="espace-match">💞 Tu as dit oui : c’est réciproque, Lamia est prévenue.</p>'
      : i.reponse === 'non' ? '<p>Tu as répondu : pas pour moi.</p>'
      : `<p class="interet-boutons"><button type="button" class="btn btn-ink" data-repondre="oui" data-id="${esc(i.id)}">💞 Ça m’intéresse aussi</button><button type="button" class="btn btn-line" data-repondre="non" data-id="${esc(i.id)}">Pas pour moi</button></p>`;
    return `<article class="espace-achat interet-recu"><div><p class="event-date">Profil n° ${esc(f.ref)} · intéressé·e par ta fiche n° ${esc(i.pour)} · le ${esc(new Date(i.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}</p>
      <h3>${esc(infos.join(' · '))}</h3>
      ${f.profil ? `<p><strong>Qui je suis :</strong> ${esc(f.profil)}</p>` : ''}
      ${f.recherche ? `<p><strong>Qui je cherche${esc(ages)} :</strong> ${esc(f.recherche)}</p>` : ''}
      ${rep}</div></article>`;
  };
  const afficher = () => { box.innerHTML = liste.length ? liste.map(carte).join('') : '<p>Personne pour le moment. Dès qu’une personne s’intéresse à ton profil, sa fiche apparaît ici et tu reçois un email.</p>'; };
  try { ({ interets: liste = [] } = await appelProfil({ action: 'annonce_interets_recus' }, session)); afficher(); }
  catch { box.innerHTML = '<p>Les intérêts reçus ne s’affichent pas pour le moment. Réessaie dans un instant.</p>'; return; }
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-repondre]');
    if (!b) return;
    b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try { await appelProfil({ action: 'annonce_repondre_interet', id: b.dataset.id, reponse: b.dataset.repondre }, session); liste = liste.map((x) => (x.id === b.dataset.id ? { ...x, reponse: b.dataset.repondre } : x)); afficher(); }
    catch { b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
  });
}
