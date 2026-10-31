// Swipe des profils vérifiés : à droite « ça m'intéresse », à gauche « pas pour moi ».
// Anonyme : on ne voit que des numéros de profil. Quand deux personnes se choisissent, Lamia est alertée et fait la mise en relation.
// Swipe sans limite. Matchs en même temps : 1 en Découverte (Lamia en débloque d'autres en live), 3 avec une formule.
// « Qui m'a choisi·e » (Passion, Prestige) : ces profils passent en tête.
import { api, esc, PUBLIC_KEY } from './confidences-commun.js';
import { O, lib, foiEtVie } from './matching-options.mjs';
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const zone = document.querySelector('[data-swipe]');
const compteur = document.querySelector('[data-swipe-compteur]');
let tous = [], profils = [], token = null, occupe = false, quota = { limite: null, restants: null }, choisi = { nombre: 0, refs: [] }, matchs = { actifs: 0, limite: 1, formule: 'decouverte' }, dernier = null, coeurs = 0;
const bandeau = document.querySelector('[data-swipe-infos]');

const message = (html) => { zone.innerHTML = `<div class="swipe-message">${html}</div>`; document.querySelector('[data-swipe-boutons]').hidden = true; };

function carte(a) {
  const tags = [...(a.origine || []), ...(a.caracteristiques || [])].slice(0, 8);
  const infos = [a.pays && lib(a.pays), a.situation && lib(a.situation), a.enfants === 'Oui' ? 'avec enfant(s)' : a.enfants === 'Non' ? 'sans enfant' : '', a.etudes && `études : ${lib(a.etudes).toLowerCase()}`].filter(Boolean);
  const ages = a.age_min || a.age_max ? ` (${a.age_min || 18} à ${a.age_max || 99} ans)` : '';
  return `<article class="swipe-carte" data-ref="${a.ref}">
    <span class="swipe-tampon is-oui" aria-hidden="true">Intéressé·e</span><span class="swipe-tampon is-non" aria-hidden="true">Pas pour moi</span>
    ${a.ta_choisi ? '<span class="swipe-ta-choisi">💞 Ce profil t’a choisi·e</span>' : ''}
    <div class="annonce-sceau" aria-hidden="true"><img src="/images/outil/${a.genre === 'femme' ? 'avatar-femme' : 'avatar-homme'}.webp" alt="" width="80" height="80" draggable="false"></div>
    <div class="swipe-texte">
      <p class="annonce-ref${a.piece_identite ? ' is-piece' : ''}">Profil n° ${a.ref} · ${a.piece_identite ? 'vérifié avec pièce d’identité' : a.outil ? (a.confirme ? '✓ vérifié par Lamia · ✅ confirmé' : '✓ vérifié par Lamia · ⏳ en attente de confirmation') : '✓ profil vérifié'}</p>
      <h2>${a.genre === 'femme' ? 'Une femme' : 'Un homme'}, ${esc(a.age)} ans</h2>
      <p class="annonce-lieu"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lieu"/></svg>${esc([a.ville, ...infos].filter(Boolean).join(' · '))}</p>
      ${a.village ? `<p class="annonce-lieu"><svg class="ico" aria-hidden="true"><use href="/icones.svg#maison"/></svg> Originaire de ${esc(a.village)}</p>` : ''}
      ${tags.length ? `<p class="annonce-tags">${tags.map((t) => `<span>${esc(lib(t))}</span>`).join('')}</p>` : ''}
      ${a.profil ? `<h3>Qui je suis</h3><p>${esc(a.profil)}</p>` : ''}
      ${a.recherche ? `<h3>Qui je cherche${ages}</h3><p>${esc(a.recherche)}</p>` : ''}
      ${foiEtVie(a).replace(/<h4>/g, '<h3>').replace(/<\/h4>/g, '</h3>')}
      ${a.secteur ? `<p class="annonce-lieu"><svg class="ico" aria-hidden="true"><use href="/icones.svg#boussole"/></svg> Secteur recherché : ${esc(a.secteur)}</p>` : ''}
    </div>
  </article>`;
}

// ---------------------------------------------------------------- filtres (âge, religion, pratique, pays, enfants, tabac, pièce d'identité)
const CLE_FILTRES = 'lfb-swipe-filtres';
let filtres = { age_min: '', age_max: '', religion: '', pratique: '', pays: '', enfants: '', non_fumeur: false, piece: false, inclure_inconnus: true };
const lireFiltres = () => { try { return JSON.parse(localStorage.getItem(CLE_FILTRES) || 'null'); } catch { return null; } };
const garderFiltres = () => { try { localStorage.setItem(CLE_FILTRES, JSON.stringify(filtres)); } catch { /* */ } };
function correspond(p) {
  const f = filtres, inconnu = (v) => !v && f.inclure_inconnus;
  if (f.age_min && p.age < Number(f.age_min)) return false;
  if (f.age_max && p.age > Number(f.age_max)) return false;
  if (f.religion && p.religion !== f.religion && !inconnu(p.religion)) return false;
  if (f.pratique && p.pratique !== f.pratique && !inconnu(p.pratique)) return false;
  if (f.pays && p.pays !== f.pays) return false;
  if (f.enfants && p.enfants !== f.enfants && !inconnu(p.enfants)) return false;
  if (f.non_fumeur) { const t = (p.mode_vie || []).find((x) => /^Fumeur/.test(x)); if (t ? t !== 'Fumeur: non' : !f.inclure_inconnus) return false; }
  if (f.piece && !p.piece_identite) return false;
  return true;
}
const nbFiltres = () => ['age_min', 'age_max', 'religion', 'pratique', 'pays', 'enfants'].filter((k) => filtres[k]).length + (filtres.non_fumeur ? 1 : 0) + (filtres.piece ? 1 : 0);
function appliquer() { profils = tous.filter(correspond); const b = document.querySelector('[data-filtres-ouvrir] b'); if (b) b.textContent = nbFiltres() ? `(${nbFiltres()})` : ''; afficher(); }
function monterFiltres() {
  const zoneF = document.querySelector('[data-swipe-filtres]');
  if (!zoneF) return;
  const opt = (list, val) => `<option value="">Peu importe</option>${list.map((v) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(lib(v))}</option>`).join('')}`;
  const pays = [...new Set(tous.map((p) => p.pays).filter(Boolean))].sort();
  zoneF.innerHTML = `<button type="button" class="swipe-filtres-bouton" data-filtres-ouvrir aria-expanded="false"><svg class="ico" aria-hidden="true"><use href="/icones.svg#filtres"/></svg> Filtres <b></b></button>
    <form class="swipe-filtres" data-filtres hidden>
      <div class="swipe-filtres-grille">
        <label>Âge de<input name="age_min" type="number" min="18" max="99" inputmode="numeric" value="${esc(filtres.age_min)}" placeholder="18"></label>
        <label>à<input name="age_max" type="number" min="18" max="99" inputmode="numeric" value="${esc(filtres.age_max)}" placeholder="99"></label>
        <label>Religion<select name="religion">${opt(O.religion, filtres.religion)}</select></label>
        <label>Pratique<select name="pratique">${opt(O.pratique, filtres.pratique)}</select></label>
        <label>Pays<select name="pays">${opt(pays, filtres.pays)}</select></label>
        <label>Enfants<select name="enfants"><option value="">Peu importe</option><option value="Non"${filtres.enfants === 'Non' ? ' selected' : ''}>Sans enfant</option><option value="Oui"${filtres.enfants === 'Oui' ? ' selected' : ''}>Avec enfant(s)</option></select></label>
      </div>
      <label class="swipe-case"><input type="checkbox" name="non_fumeur"${filtres.non_fumeur ? ' checked' : ''}> Non-fumeur seulement</label>
      <label class="swipe-case"><input type="checkbox" name="piece"${filtres.piece ? ' checked' : ''}> Vérifiés avec pièce d’identité seulement</label>
      <label class="swipe-case"><input type="checkbox" name="inclure_inconnus"${filtres.inclure_inconnus ? ' checked' : ''}> Garder les profils qui n’ont pas répondu à ces questions</label>
      <p class="swipe-filtres-bas"><span data-filtres-nombre></span><button type="button" class="po-btn-verre" data-filtres-effacer>Tout effacer</button><button type="submit" class="po-btn">Voir les profils</button></p>
    </form>`;
  const form = zoneF.querySelector('[data-filtres]'), bouton = zoneF.querySelector('[data-filtres-ouvrir]');
  const lire = () => { const F = form.elements; filtres = { age_min: F.age_min.value, age_max: F.age_max.value, religion: F.religion.value, pratique: F.pratique.value, pays: F.pays.value, enfants: F.enfants.value, non_fumeur: F.non_fumeur.checked, piece: F.piece.checked, inclure_inconnus: F.inclure_inconnus.checked }; };
  const compter = () => { lire(); const n = tous.filter(correspond).length; zoneF.querySelector('[data-filtres-nombre]').textContent = `${n} profil${n > 1 ? 's' : ''} correspond${n > 1 ? 'ent' : ''}`; };
  bouton.addEventListener('click', () => { form.hidden = !form.hidden; bouton.setAttribute('aria-expanded', String(!form.hidden)); if (!form.hidden) compter(); });
  form.addEventListener('input', compter); form.addEventListener('change', compter);
  form.addEventListener('submit', (e) => { e.preventDefault(); lire(); garderFiltres(); form.hidden = true; bouton.setAttribute('aria-expanded', 'false'); appliquer(); });
  zoneF.querySelector('[data-filtres-effacer]').addEventListener('click', () => { filtres = { age_min: '', age_max: '', religion: '', pratique: '', pays: '', enfants: '', non_fumeur: false, piece: false, inclure_inconnus: true }; garderFiltres(); monterFiltres(); appliquer(); });
}

function infos() {
  const lignes = [];
  if (choisi.nombre) lignes.push(choisi.refs.length
    ? `<p class="swipe-info is-choisi"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur-plein"/></svg> <strong>${choisi.nombre} personne${choisi.nombre > 1 ? 's t’ont' : ' t’a'} choisi·e</strong> : ${choisi.nombre > 1 ? 'elles sont' : 'elle est'} en tête de ta pile, marquée${choisi.nombre > 1 ? 's' : ''} 💞.</p>`
    : `<p class="swipe-info is-choisi"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur-plein"/></svg> <strong>${choisi.nombre} personne${choisi.nombre > 1 ? 's t’ont' : ' t’a'} choisi·e</strong> <span class="swipe-flou" aria-hidden="true">n° ••• · n° •••</span><br><a href="/abonnement/?formule=passion">Découvre qui avec la formule Passion</a></p>`);
  if (matchs.limite) lignes.push(`<p class="swipe-info${matchs.actifs >= matchs.limite ? ' is-plein' : ''}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur-plein"/></svg> Matchs en cours : <strong>${matchs.actifs} / ${matchs.limite}</strong>${matchs.actifs >= matchs.limite ? ' · tu peux continuer à découvrir les profils, mais plus en choisir pour l’instant' : ''}</p>`);
  if (quota.limite) lignes.push(`<p class="swipe-info">Il te reste <strong>${quota.restants}</strong> profil${quota.restants > 1 ? 's' : ''} à swiper aujourd’hui (${quota.limite} par jour avec ta formule). <a href="/abonnement/">Plus de profils</a></p>`);
  bandeau.innerHTML = lignes.join('');
}
function quotaAtteint() {
  message(`<p class="swipe-coeur">⏳</p><h2>C’est tout pour aujourd’hui</h2><p>Tu as swipé tes ${quota.limite} profils du jour. Reviens demain : ton compteur repart à zéro à minuit.</p><p>Envie d’en voir plus ? Avec <strong>Cœur</strong>, 30 profils par jour ; avec <strong>Passion</strong>, sans limite, et tu découvres qui t’a choisi·e.</p><p class="po-actions"><a class="po-btn" href="/abonnement/">Voir les formules</a><a class="po-btn-verre" href="/mon-espace/">Mon espace</a></p>`);
}
function afficher() {
  infos();
  if (quota.limite && quota.restants <= 0 && profils.length) return quotaAtteint();
  compteur.textContent = profils.length ? `${profils.length} profil${profils.length > 1 ? 's' : ''} à découvrir` : '';
  if (!profils.length && tous.length) return message(`<p class="swipe-coeur">🎚</p><h2>Aucun profil avec ces filtres</h2><p>${tous.length} profil${tous.length > 1 ? 's restent' : ' reste'} à découvrir si tu élargis ta recherche : ouvre les filtres et enlève un critère.</p>`);
  if (!profils.length) return message(`<p class="swipe-coeur">💌</p><h2>Tu as vu tous les profils pour le moment</h2>${coeurs ? `<p><strong>${coeurs} coup${coeurs > 1 ? 's' : ''} de cœur</strong> envoyé${coeurs > 1 ? 's' : ''} aujourd’hui 💘</p>` : ''}<p>Lamia a noté tes choix. Si une personne que tu as choisie te choisit aussi, Lamia est prévenue tout de suite et revient vers toi pour la mise en relation. Ton identité n’est jamais révélée : les autres ne voient qu’un numéro de profil.</p><p>De nouveaux profils arrivent chaque semaine : reviens bientôt.</p><p><a class="po-btn" href="/mon-espace/">Suivre mes demandes</a></p>`);
  zone.innerHTML = profils.slice(0, 2).reverse().map(carte).join('');
  document.querySelector('[data-swipe-boutons]').hidden = false;
  glisser(zone.lastElementChild);
}

// ---------------------------------------------------------------- effets : cœurs, vibration, encouragements, match
const vibrer = (m) => { try { navigator.vibrate?.(m); } catch { /* */ } };
function eclat(x, y, emojis = ['💚', '💖', '✨', '💘'], n = 14) {
  for (let i = 0; i < n; i += 1) {
    const s = document.createElement('span');
    s.className = 'swipe-eclat'; s.textContent = emojis[i % emojis.length];
    const ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 120;
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`); s.style.setProperty('--dy', `${Math.sin(ang) * dist - 60}px`);
    s.style.fontSize = `${16 + Math.random() * 18}px`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 1100);
  }
}
function toast(texte) {
  const t = document.createElement('div'); t.className = 'swipe-toast'; t.textContent = texte;
  document.body.appendChild(t); setTimeout(() => t.classList.add('is-sortie'), 1600); setTimeout(() => t.remove(), 2100);
}
const PALIERS = { 5: '🔥 5 coups de cœur ! Tu es lancé·e', 10: '💘 10 coups de cœur : Lamia adore ton énergie', 25: '🌟 25 ! Ton âme sœur est peut-être tout près', 50: '👑 50 coups de cœur : tu es une star du swipe' };
function fenetre(html, classe = '') {
  document.querySelector('.swipe-fenetre')?.remove();
  const d = document.createElement('div'); d.className = `swipe-fenetre ${classe}`; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="swipe-fenetre-boite">${html}<p class="po-actions"><button type="button" class="po-btn" data-fermer>Continuer</button></p></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fermer]')) d.remove(); });
  return d;
}
function celebrerMatch(ref) {
  vibrer([40, 60, 40, 60, 120]);
  const d = fenetre(`<p class="swipe-match-coeurs" aria-hidden="true">💞</p><h2>C’est réciproque !</h2><p>Le profil <strong>n° ${esc(ref)}</strong> t’a choisi·e aussi. Lamia est prévenue à l’instant : elle regarde votre compatibilité et revient vers toi pour la mise en relation.</p>`, 'is-match');
  const r = d.querySelector('.swipe-fenetre-boite').getBoundingClientRect();
  for (let k = 0; k < 3; k += 1) setTimeout(() => eclat(r.left + r.width / 2, r.top + 60, ['💞', '💖', '💘', '✨', '🌹'], 22), k * 280);
}
function limiteAtteinte() {
  vibrer(80);
  if (matchs.formule === 'decouverte') return fenetre(`<p class="swipe-match-coeurs" aria-hidden="true">🎥</p><h2>Tu as déjà ton match</h2><p>Avec la formule gratuite, c’est <strong>un match à la fois</strong>. Pour matcher à nouveau, <strong>viens voir Lamia en live</strong>, chaque soir à 21 h : elle peut débloquer un nouveau match pour toi.</p><p>Ou passe à une formule : jusqu’à <strong>3 matchs à la fois</strong>.</p><p class="po-actions"><a class="po-btn-verre" href="/salon/">Voir le live</a><a class="po-btn-verre" href="/abonnement/">Les formules</a></p>`);
  return fenetre(`<p class="swipe-match-coeurs" aria-hidden="true">💞</p><h2>${matchs.actifs} matchs en cours</h2><p>C’est le maximum en même temps. Lamia s’occupe de tes matchs : dès que l’un d’eux est traité ou terminé, tu peux de nouveau choisir des profils. Tu peux continuer à les découvrir en attendant.</p><p class="po-actions"><a class="po-btn-verre" href="/mon-espace/">Mon espace</a></p>`);
}
function annulerDernier() {
  if (!dernier || occupe) return;
  const d = dernier; dernier = null;
  api({ action: 'annonce_swipe_annuler', ref: d.profil.ref }, token).catch(() => {});
  if (d.choix === 'oui') coeurs = Math.max(0, coeurs - 1);
  tous = [d.profil, ...tous]; profils = [d.profil, ...profils];
  majAnnuler(); afficher(); vibrer(10);
  zone.lastElementChild?.classList.add('is-retour');
}
const majAnnuler = () => { const b = document.querySelector('[data-swipe-annuler]'); if (b) b.disabled = !dernier; };

async function choisir(choix) {
  if (occupe || !profils.length) return;
  occupe = true;
  const el = zone.querySelector(`.swipe-carte[data-ref="${profils[0].ref}"]`);
  const ref = profils[0].ref;
  if (el) { el.style.transition = 'transform .35s ease, opacity .35s ease'; el.style.transform = `translateX(${choix === 'oui' ? 130 : -130}%) rotate(${choix === 'oui' ? 18 : -18}deg)`; el.style.opacity = '0'; }
  const profil = profils[0];
  if (choix === 'oui' && matchs.limite && matchs.actifs >= matchs.limite) { if (el) { el.style.transform = ''; el.style.opacity = ''; el.classList.remove('vers-oui', 'vers-non'); el.classList.add('is-refus'); setTimeout(() => el.classList.remove('is-refus'), 500); } occupe = false; return limiteAtteinte(); }
  if (choix === 'oui') {
    const btn = document.querySelector('[data-swipe-oui]').getBoundingClientRect(); eclat(btn.left + btn.width / 2, btn.top + btn.height / 2); vibrer(18);
    coeurs += 1; if (PALIERS[coeurs]) setTimeout(() => toast(PALIERS[coeurs]), 350);
    window.lfbEvent?.('swipe_interesse');
  } else vibrer(8);
  dernier = { profil, choix }; majAnnuler();
  api({ action: 'annonce_swipe', ref, choix }, token).then((r) => {
    if (r?.matchs) { matchs = { ...matchs, ...r.matchs }; infos(); }
    if (r?.match) { dernier = null; majAnnuler(); celebrerMatch(r.ref); }
  }).catch((err) => { if (err.code === 'limite_matchs') { matchs = { ...matchs, actifs: err.actifs ?? matchs.limite }; infos(); limiteAtteinte(); } });
  await new Promise((r) => setTimeout(r, 300));
  profils.shift();
  tous = tous.filter((p) => p.ref !== ref);
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
    const dessous = el.previousElementSibling; if (dessous) dessous.style.transform = `scale(${0.95 + Math.min(Math.abs(dx), 150) / 3000}) translateY(${12 - Math.min(Math.abs(dx), 150) / 12.5}px)`;
    const bo = document.querySelector(dx > 0 ? '[data-swipe-oui]' : '[data-swipe-non]'); document.querySelectorAll('.swipe-boutons button').forEach((x) => x.classList.toggle('is-actif', x === bo && Math.abs(dx) > 40));
  });
  const fin = () => {
    if (x0 === null) return;
    x0 = null;
    document.querySelectorAll('.swipe-boutons button').forEach((x) => x.classList.remove('is-actif'));
    if (Math.abs(dx) > 110) return choisir(dx > 0 ? 'oui' : 'non');
    el.style.transition = 'transform .25s ease'; el.style.transform = ''; el.classList.remove('vers-oui', 'vers-non');
    const dessous = el.previousElementSibling; if (dessous) dessous.style.transform = '';
    document.querySelectorAll('.swipe-boutons button').forEach((x) => x.classList.remove('is-actif'));
  };
  el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
}

document.querySelector('[data-swipe-non]').addEventListener('click', () => choisir('non'));
document.querySelector('[data-swipe-oui]').addEventListener('click', () => choisir('oui'));
document.querySelector('[data-swipe-annuler]')?.addEventListener('click', annulerDernier);
addEventListener('keydown', (e) => { if (document.querySelector('.swipe-fenetre')) return; if (e.key === 'ArrowRight') choisir('oui'); if (e.key === 'ArrowLeft') choisir('non'); if (e.key === 'Backspace') annulerDernier(); });

(async () => {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  if (!session) return message('<h2>Connecte-toi pour swiper</h2><p>Il faut un compte et un profil confié à Lamia pour découvrir les profils et dire lesquels t’intéressent.</p><p class="po-actions"><a class="po-btn" href="/rencontres/#confier">Créer mon compte et mon profil</a><a class="po-btn-verre" href="/mon-espace/">Me connecter</a></p>');
  token = session.access_token;
  try {
    let criteres;
    ({ profils: tous, quota, choisi, criteres, matchs = matchs } = await api({ action: 'annonce_swipe_liste' }, token));
    // Filtres gardés sur ce téléphone ; la première fois, ceux de ton profil (âge, religion, pratique recherchés).
    const gardes = lireFiltres();
    if (gardes) filtres = { ...filtres, ...gardes };
    else if (criteres) { filtres = { ...filtres, age_min: criteres.age_min || '', age_max: criteres.age_max || '', religion: criteres.religion || '', pratique: criteres.pratique || '' }; }
    monterFiltres();
    appliquer();
  } catch (err) {
    if (err.code === 'pas_de_profil') return message('<h2>Confie d’abord ton profil</h2><p>Pour swiper, Lamia a besoin de connaître ton profil : c’est lui qui sera proposé aux personnes qui te correspondent.</p><p><a class="po-btn" href="/rencontres/#confier">💌 Confier mon profil</a></p>');
    if (err.code === 'en_match') return message('<h2>💞 Tu as un match en cours</h2><p>Tant qu’il dure, tu ne peux pas choisir d’autres profils. Tu peux y mettre fin depuis ton espace.</p><p><a class="po-btn" href="/mon-espace/">Mon espace</a></p>');
    message('<h2>Les profils ne s’affichent pas pour le moment</h2><p>Réessaie dans un instant.</p>');
  }
})();
