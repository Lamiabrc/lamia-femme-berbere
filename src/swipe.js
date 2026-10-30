// Swipe des profils vérifiés : à droite « ça m'intéresse », à gauche « pas pour moi ».
// Personne ne sait qui a choisi qui ; quand deux personnes se choisissent, Lamia est alertée et fait la mise en relation.
import { api, esc, PUBLIC_KEY } from './confidences-commun.js';
import { lib } from './matching-options.mjs';
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const zone = document.querySelector('[data-swipe]');
const compteur = document.querySelector('[data-swipe-compteur]');
let profils = [], token = null, occupe = false;

const message = (html) => { zone.innerHTML = `<div class="swipe-message">${html}</div>`; document.querySelector('[data-swipe-boutons]').hidden = true; };

function carte(a) {
  const tags = [...(a.origine || []), ...(a.caracteristiques || [])].slice(0, 8);
  const infos = [a.pays && lib(a.pays), a.situation && lib(a.situation), a.enfants === 'Oui' ? 'avec enfant(s)' : a.enfants === 'Non' ? 'sans enfant' : '', a.etudes && `études : ${lib(a.etudes).toLowerCase()}`].filter(Boolean);
  const ages = a.age_min || a.age_max ? ` (${a.age_min || 18} à ${a.age_max || 99} ans)` : '';
  return `<article class="swipe-carte" data-ref="${a.ref}">
    <span class="swipe-tampon is-oui" aria-hidden="true">💚 Intéressé·e</span><span class="swipe-tampon is-non" aria-hidden="true">Pas pour moi</span>
    <div class="annonce-sceau" aria-hidden="true"><img src="/images/outil/${a.genre === 'femme' ? 'h_femme' : 'h_man'}.webp" alt="" width="80" height="80" draggable="false"></div>
    <div class="swipe-texte">
      <p class="annonce-ref${a.piece_identite ? ' is-piece' : ''}">Profil n° ${a.ref} · ${a.piece_identite ? '🛡 vérifié avec pièce d’identité' : '✓ profil vérifié'}</p>
      <h2>${a.genre === 'femme' ? 'Une femme' : 'Un homme'}, ${esc(a.age)} ans</h2>
      <p class="annonce-lieu">${esc([a.ville && `📍 ${a.ville}`, ...infos].filter(Boolean).join(' · '))}</p>
      ${a.village ? `<p class="annonce-lieu">🏡 Originaire de ${esc(a.village)}</p>` : ''}
      ${tags.length ? `<p class="annonce-tags">${tags.map((t) => `<span>${esc(lib(t))}</span>`).join('')}</p>` : ''}
      ${a.profil ? `<h3>Qui je suis</h3><p>${esc(a.profil)}</p>` : ''}
      ${a.recherche ? `<h3>Qui je cherche${ages}</h3><p>${esc(a.recherche)}</p>` : ''}
      ${a.secteur ? `<p class="annonce-lieu">🧭 Secteur recherché : ${esc(a.secteur)}</p>` : ''}
    </div>
  </article>`;
}

function afficher() {
  compteur.textContent = profils.length ? `${profils.length} profil${profils.length > 1 ? 's' : ''} à découvrir` : '';
  if (!profils.length) return message('<p class="swipe-coeur">💌</p><h2>Tu as vu tous les profils pour le moment</h2><p>Lamia a noté tes choix. Si une personne que tu as choisie te choisit aussi, Lamia est prévenue tout de suite et revient vers toi pour la mise en relation.</p><p>De nouveaux profils arrivent chaque semaine : reviens bientôt.</p><p><a class="po-btn" href="/mon-espace/">Suivre mes demandes</a></p>');
  zone.innerHTML = profils.slice(0, 2).reverse().map(carte).join('');
  document.querySelector('[data-swipe-boutons]').hidden = false;
  glisser(zone.lastElementChild);
}

async function choisir(choix) {
  if (occupe || !profils.length) return;
  occupe = true;
  const el = zone.querySelector(`.swipe-carte[data-ref="${profils[0].ref}"]`);
  const ref = profils[0].ref;
  if (el) { el.style.transition = 'transform .35s ease, opacity .35s ease'; el.style.transform = `translateX(${choix === 'oui' ? 130 : -130}%) rotate(${choix === 'oui' ? 18 : -18}deg)`; el.style.opacity = '0'; }
  api({ action: 'annonce_swipe', ref, choix }, token).catch((err) => { if (err.code === 'en_match') location.reload(); });
  if (choix === 'oui') window.lfbEvent?.('swipe_interesse');
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

document.querySelector('[data-swipe-non]').addEventListener('click', () => choisir('non'));
document.querySelector('[data-swipe-oui]').addEventListener('click', () => choisir('oui'));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') choisir('oui'); if (e.key === 'ArrowLeft') choisir('non'); });

(async () => {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  if (!session) return message('<h2>Connecte-toi pour swiper</h2><p>Il faut un compte et un profil confié à Lamia pour découvrir les profils et dire lesquels t’intéressent.</p><p class="po-actions"><a class="po-btn" href="/rencontres/#confier">Créer mon compte et mon profil</a><a class="po-btn-verre" href="/mon-espace/">Me connecter</a></p>');
  token = session.access_token;
  try {
    ({ profils } = await api({ action: 'annonce_swipe_liste' }, token));
    afficher();
  } catch (err) {
    if (err.code === 'pas_de_profil') return message('<h2>Confie d’abord ton profil</h2><p>Pour swiper, Lamia a besoin de connaître ton profil : c’est lui qui sera proposé aux personnes qui te correspondent.</p><p><a class="po-btn" href="/rencontres/#confier">💌 Confier mon profil</a></p>');
    if (err.code === 'en_match') return message('<h2>💞 Tu as un match en cours</h2><p>Tant qu’il dure, tu ne peux pas choisir d’autres profils. Tu peux y mettre fin depuis ton espace.</p><p><a class="po-btn" href="/mon-espace/">Mon espace</a></p>');
    message('<h2>Les profils ne s’affichent pas pour le moment</h2><p>Réessaie dans un instant.</p>');
  }
})();
