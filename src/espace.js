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
async function achats(session) {
  const box = $('[data-espace-achats]');
  try {
    const r = await fetch('/api/mes-achats', { headers: { Authorization: `Bearer ${session.access_token}` } });
    const { orders = [], abonnement = null } = await r.json();
    monAbonnement(abonnement, session);
    box.innerHTML = orders.length
      ? orders.map((o) => `<article class="espace-achat">
          <div><p class="event-date">${esc(new Date(o.created_at).toLocaleDateString((document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR'), { day: 'numeric', month: 'long', year: 'numeric' }))} · n° ${esc(o.order_number)}</p>
          <h3>${(o.order_items || []).map((i) => `${esc(i.product_name)}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ') || 'Commande'}</h3>
          ${(o.order_items || []).filter((i) => i.telechargement).map((i) => `<a class="btn btn-ink btn-telecharger" href="${esc(i.telechargement)}">⬇ Télécharger mon livre numérique</a>`).join('')}</div>
          <div class="espace-achat-droite"><strong>${money(o.amount_total_cents, o.currency)}</strong><span class="statut is-${esc(o.status)}">${esc(STATUTS[o.status] || o.status)}</span></div>
        </article>`).join('')
      : '<p>Pas encore d’achat. Tes commandes apparaîtront ici. <a class="text-link" href="/boutique/">Voir la Boutique</a></p>';
  } catch { box.innerHTML = '<p>Tes achats ne s’affichent pas pour le moment. Réessaie dans un instant.</p>'; }
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
    if (!p) { box.innerHTML = '<p>Tu n’as pas encore de profil chez Lamia. <a class="text-link" href="/rencontres/#confier">Confier mon profil</a> (la première mise en relation est offerte).</p>'; return; }
    box.innerHTML = `<article class="espace-achat"><div><p class="event-date">Profil n° ${esc(p.ref)}</p><h3>${esc(ETAT_PROFIL[p.status] || p.status)}${p.status === 'publiee' && p.piece_identite ? ' · 🛡 avec pièce d’identité' : ''}</h3>
      ${p.live ? `<p>🎥 Profil créé en live avec Lamia${p.live_retrouve ? '' : ' (Lamia vérifie ta fiche)'} : <strong>tes 3 premières mises en relation sont offertes</strong>.</p>` : '<p>Ta première mise en relation est offerte.</p>'}
      ${p.nb_compatibles !== null && p.nb_compatibles !== undefined ? `<p>D’après l’outil de Lamia, tu pourrais correspondre à ${esc(p.nb_compatibles)} personne(s).</p>` : ''}
      ${p.en_match ? '<p class="espace-match">💞 Tu as un match en cours. Tant qu’il dure, tu ne peux pas matcher avec d’autres profils.</p>' : ''}</div>
      <div class="espace-achat-droite"><button class="btn btn-ink" type="button" data-profil-modifier>Modifier mon profil</button>${p.en_match ? '<button class="btn btn-line" type="button" data-profil-dematcher>Mettre fin à mon match</button>' : ''}</div></article>
      <p class="form-status" data-profil-statut></p><div data-profil-edition hidden></div>`;
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
