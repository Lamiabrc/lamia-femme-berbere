// Accueil : le swipe tout de suite, même sans compte, sans aucune fenêtre à l'arrivée. La question
// « un homme ou une femme ? » ne vient qu'au premier geste de swipe ; puis les profils défilent un par un. Le cœur demande un profil : sans profil, pas de match.
import { api, esc, PUBLIC_KEY } from './confidences-commun.js';
import { lib, secteurLisible, origineLisible, metierEtReligion } from './matching-options.mjs';
import { createClient } from '/vendor/supabase.mjs';

const bloc = document.querySelector('[data-swipe-accueil]');
const pile = bloc?.querySelector('[data-inv-pile]');
const boutons = bloc?.querySelector('[data-inv-boutons]');
const changer = bloc?.querySelector('[data-inv-changer]');
const titre = bloc?.querySelector('[data-inv-titre]');
const CLE = 'lfb-cherche';
const CLE_PROFIL = 'lfb-profil-cherche';
const formCherche = bloc?.querySelector('[data-cherche-profil]');
let tous = [], profils = [], occupe = false;

const lire = () => { try { const v = localStorage.getItem(CLE); return v === 'femme' || v === 'homme' ? v : null; } catch { return null; } };
const garder = (v) => { try { localStorage.setItem(CLE, v); } catch { /* */ } };

function fenetre(html) {
  document.querySelector('.swipe-fenetre')?.remove();
  const d = document.createElement('div'); d.className = 'swipe-fenetre'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="swipe-fenetre-boite">${html}</div>`;
  document.body.appendChild(d);
  return d;
}

// « Tu cherches… » : la seule question avant de voir les profils.
function demander() {
  const d = fenetre(`<h2>Tu cherches…</h2><p>Les profils sont vérifiés et anonymes. Pas besoin de compte pour regarder.</p>
    <div class="swipe-choix"><button type="button" data-cherche="femme">Une femme</button><button type="button" data-cherche="homme">Un homme</button></div>`);
  d.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cherche]');
    if (!b) return;
    garder(b.dataset.cherche); d.remove(); montrer(b.dataset.cherche);
  });
}

function carte(a) {
  const femme = a.genre === 'femme';
  const mr = metierEtReligion(a);
  const infos = [a.pays && lib(a.pays), a.situation && lib(a.situation), a.enfants === 'Oui' ? 'avec enfant(s)' : a.enfants === 'Non' ? 'sans enfant' : '', a.etudes && `études : ${lib(a.etudes).toLowerCase()}`].filter(Boolean);
  const ages = a.age_min || a.age_max ? ` (${a.age_min || 18} à ${a.age_max || 99} ans)` : '';
  const lieu = a.ville || (a.pays && lib(a.pays)) || '';
  const tags = (a.caracteristiques || []).slice(0, 8);
  return `<article class="swipe-carte" data-ref="${esc(a.ref)}">
    <span class="swipe-tampon is-oui" aria-hidden="true">Intéressé·e</span><span class="swipe-tampon is-non" aria-hidden="true">Pas pour moi</span>
    <div class="swipe-resume">
      <svg class="swipe-bijou" viewBox="0 -22 180 276" aria-hidden="true" focusable="false"><use href="#bijou-${femme ? 'femme' : 'homme'}"/></svg>
      <h2>${femme ? 'Une femme' : 'Un homme'}, ${esc(a.age)} ans</h2>
      ${lieu ? `<p class="swipe-lieu">${esc(lieu)}</p>` : ''}
      ${origineLisible(a.origine) ? `<p class="swipe-origine">${esc(origineLisible(a.origine))}</p>` : ''}
      ${a.village ? `<p class="swipe-village">Originaire de ${esc(a.village)}</p>` : ''}
      ${mr.metier ? `<p class="swipe-metier">${esc(mr.metier)}</p>` : ''}
      ${mr.religion ? `<p class="swipe-religion">${esc(mr.religion)}</p>` : ''}
      <p class="swipe-statut"><span aria-hidden="true">✓</span> ${a.piece_identite ? 'Vérifié avec pièce d’identité' : 'Profil vérifié'}</p>
      <button type="button" class="swipe-voir" data-voir aria-expanded="false">Voir le profil</button>
    </div>
    <div class="swipe-texte" data-details hidden>
      <button type="button" class="swipe-voir" data-voir aria-expanded="true">Fermer</button>
      <p class="annonce-ref">Profil n° ${esc(a.ref)}</p>
      <h2>${femme ? 'Une femme' : 'Un homme'}, ${esc(a.age)} ans</h2>
      <p class="annonce-lieu">${esc([a.ville, ...infos].filter(Boolean).join(' · '))}</p>
      ${secteurLisible(a.secteur) ? `<p class="annonce-lieu annonce-secteur">Cherche en : <b>${esc(secteurLisible(a.secteur))}</b></p>` : ''}
      ${tags.length ? `<p class="annonce-tags">${tags.map((t) => `<span>${esc(lib(t))}</span>`).join('')}</p>` : ''}
      ${a.profil ? `<h3>Qui je suis</h3><p data-membre>${esc(a.profil)}</p>` : ''}
      ${a.recherche ? `<h3>Qui je cherche${esc(ages)}</h3><p data-membre>${esc(a.recherche)}</p>` : ''}
    </div>
  </article>`;
}

const CREER = '<p class="po-actions"><a class="po-btn" href="/rencontres/#confier">Créer mon profil gratuit</a></p>';
function afficher() {
  if (!profils.length) {
    boutons.hidden = true;
    pile.innerHTML = `<div class="swipe-message"><h2>${tous.length ? 'Tu as vu tous les profils' : 'Les profils ne s’affichent pas pour le moment'}</h2>${tous.length ? `<p>Crée ton profil pour recevoir tes matchs et envoyer tes cœurs.</p>${CREER}` : '<p>Réessaie dans un instant.</p>'}</div>`;
    return;
  }
  // Deux cartes : celle du dessus, et la suivante en dessous.
  pile.innerHTML = profils.slice(0, 2).reverse().map(carte).join('');
  boutons.hidden = false;
  glisser(pile.querySelector(`.swipe-carte[data-ref="${profils[0].ref}"]`));
}

function montrer(genre) {
  profils = tous.filter((p) => p.genre === genre);
  titre.textContent = genre === 'femme' ? 'Elles cherchent à se marier' : 'Ils cherchent à se marier';
  changer.hidden = false;
  afficher();
}

// Recherche par numéro : Lamia dit « profil n° 123 » en live, la personne le tape et le profil arrive en haut de la pile.
// Le numéro est gardé : après la création du profil, le swipe le remet devant pour envoyer le cœur.
function chercher(valeur) {
  const st = formCherche?.querySelector('[data-cherche-statut]');
  const ref = Number.parseInt(String(valeur || '').replace(/\D/g, ''), 10);
  if (!ref) { if (st) st.textContent = 'Écris le numéro du profil.'; return; }
  if (bloc.classList.contains('is-membre')) { location.assign(`/rencontres/swipe/?profil=${ref}`); return; }
  const p = tous.find((x) => Number(x.ref) === ref);
  if (!p) { if (st) st.textContent = `Le profil n° ${ref} n’est pas visible pour le moment.`; return; }
  if (st) st.textContent = '';
  try { localStorage.setItem(CLE_PROFIL, String(ref)); } catch { /* */ }
  window.lfbEvent?.('recherche_profil');
  garder(p.genre); montrer(p.genre);
  profils = [p, ...profils.filter((x) => x !== p)];
  afficher();
  try { pile.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ }
}

// Le cœur sans profil : on explique, on propose de créer son profil, et la carte reste.
function inviter(el) {
  if (el) { el.style.transition = 'transform .25s ease'; el.style.transform = ''; el.classList.remove('vers-oui', 'vers-non'); }
  window.lfbEvent?.('swipe_invite_coeur');
  const d = fenetre(`<h2>Ce profil te plaît ?</h2><p>Pour lui envoyer ton cœur, il te faut un profil : c’est lui que l’autre personne verra. C’est gratuit et anonyme, et les matchs sont gratuits aussi.</p>
    <div class="swipe-invite-liens"><a class="po-btn" href="/rencontres/#confier">Créer mon profil gratuit</a><a class="po-btn-verre" href="/mon-espace/">J’ai déjà un compte</a><button type="button" class="confirmer-lien" data-fermer>Continuer à regarder</button></div>`);
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fermer]')) d.remove(); });
}

async function choisir(choix) {
  if (occupe || !profils.length) return;
  const el = pile.querySelector(`.swipe-carte[data-ref="${profils[0].ref}"]`);
  // Premier geste : c'est maintenant qu'on demande qui la personne cherche.
  if (!lire()) { if (el) { el.style.transition = 'transform .25s ease'; el.style.transform = ''; el.classList.remove('vers-oui', 'vers-non'); } return demander(); }
  if (choix === 'oui') return inviter(el);
  occupe = true;
  if (el) { el.style.transition = 'transform .35s ease, opacity .35s ease'; el.style.transform = 'translateX(-130%) rotate(-18deg)'; el.style.opacity = '0'; }
  await new Promise((r) => setTimeout(r, 300));
  profils.shift();
  occupe = false;
  afficher();
}

// Glisser au doigt ou à la souris.
function glisser(el) {
  if (!el) return;
  let x0 = null, dx = 0;
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('a,button')) return; x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
  el.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    el.classList.toggle('vers-oui', dx > 40); el.classList.toggle('vers-non', dx < -40);
  });
  const fin = () => {
    if (x0 === null) return;
    x0 = null;
    if (Math.abs(dx) > 110) return choisir(dx > 0 ? 'oui' : 'non');
    el.style.transition = 'transform .25s ease'; el.style.transform = ''; el.classList.remove('vers-oui', 'vers-non');
  };
  el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
}

if (bloc && pile) {
  formCherche?.addEventListener('submit', (e) => { e.preventDefault(); chercher(formCherche.elements.ref.value); });
  const demande = new URLSearchParams(location.search).get('profil');
  bloc.addEventListener('click', (e) => {
    if (e.target.closest('[data-swipe-non]')) return choisir('non');
    if (e.target.closest('[data-swipe-oui]')) return choisir('oui');
    if (e.target.closest('[data-inv-changer]')) return demander();
    const voir = e.target.closest('[data-voir]');
    if (voir) { const c = voir.closest('.swipe-carte'), d = c.querySelector('[data-details]'); d.hidden = !d.hidden; c.classList.toggle('is-ouverte', !d.hidden); }
  });
  (async () => {
    // Déjà membre : son vrai swipe (avec ses critères et ses matchs) est à un clic.
    try {
      const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        bloc.classList.add('is-membre');
        titre.textContent = 'Tes profils t’attendent';
        if (demande) { chercher(demande); return; }
        pile.innerHTML = '<div class="swipe-message"><h2>Reprends ton swipe</h2><p>Les profils qui te correspondent, tes cœurs et tes matchs.</p><p class="po-actions"><a class="po-btn" href="/rencontres/swipe/">Swiper</a><a class="po-btn-verre" href="/mon-espace/">Mon espace</a></p></div>';
        return;
      }
    } catch { /* sans session : visiteur */ }
    try { ({ annonces: tous } = await api({ action: 'annonces_publiques' })); } catch { tous = []; }
    const v = lire();
    if (v) montrer(v); else { profils = [...tous]; afficher(); }
    if (demande) chercher(demande);
  })();
}

// Une explication ou la liste repliée s'ouvre quand un lien y mène.
const deplier = () => { try { const el = location.hash.length > 1 && document.querySelector(location.hash); const d = el?.closest('details'); if (d) d.open = true; } catch { /* */ } };
deplier(); addEventListener('hashchange', deplier);
