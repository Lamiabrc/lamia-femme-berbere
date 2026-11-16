// Swipe des profils vérifiés : à droite « ça m'intéresse », à gauche « pas pour moi ».
// Anonyme : on ne voit que des numéros de profil. Quand deux personnes se choisissent, Lamia est alertée et fait la mise en relation.
// Swipe sans limite. Matchs en même temps : 1 en Découverte (Lamia en débloque d'autres en live), 3 avec une formule.
// « Qui m'a choisi·e » (Passion, Prestige) : ces profils passent en tête.
import { api, esc, PUBLIC_KEY, matchsOuverts, matchPleinHtml } from './confidences-commun.js';
import { O, lib, secteurLisible, foiEtVie, badgesProfil, origineLisible, metierEtReligion } from './matching-options.mjs';
import { SINCERITE_HTML, brancherSincerite } from './sincerite.js';
import { SIGNALEMENT_HTML, lireSignalement } from './signaler.js';
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const zone = document.querySelector('[data-swipe]');
const compteur = document.querySelector('[data-swipe-compteur]');
let infosAbo = {}, creditsCoeur = 0;
let tour = 1, tourAnnonce = false, dejaCharge = false, enRecharge = false, envoi = Promise.resolve(), tous = [], profils = [], token = null, occupe = false, quota = { limite: null, restants: null }, choisi = { nombre: 0, refs: [] }, matchs = { actifs: 0, limite: 1, formule: 'decouverte' }, coeurs = 0;
const bandeau = document.querySelector('[data-swipe-infos]');

const message = (html) => { zone.innerHTML = `<div class="swipe-message">${html}</div>`; document.querySelector('[data-swipe-boutons]').hidden = true; };

// La fiche : l'essentiel en grand, dans un bijou rond (femme) ou triangulaire (homme). Le reste s'ouvre avec « Voir le profil ».
const statut = (a) => (a.piece_identite ? 'Vérifié avec pièce d’identité' : a.attente_validation ? 'Annonce du live · en attente de validation du profil' : a.outil && !a.confirme ? 'En attente de confirmation' : 'Profil vérifié');
function carte(a) {
  const femme = a.genre === 'femme';
  const mr = metierEtReligion(a);
  const tags = (a.caracteristiques || []).slice(0, 8);
  // Carte courte (Lamia, 15 nov.) : le pays seulement sans ville, pas de « Partout », origine et village sur une ligne.
  const infos = [!a.ville && a.pays && lib(a.pays), a.situation && lib(a.situation), a.enfants === 'Oui' ? 'avec enfant(s)' : a.enfants === 'Non' ? 'sans enfant' : '', a.etudes && lib(a.etudes).toLowerCase()].filter(Boolean);
  const secteur = /^partout$/i.test(secteurLisible(a.secteur).trim()) ? '' : secteurLisible(a.secteur);
  const ages = a.age_min || a.age_max ? ` (${a.age_min || 18} à ${a.age_max || 99} ans)` : '';
  const lieu = a.ville || (a.pays && lib(a.pays)) || '';
  return `<article class="swipe-carte ${a.genre === 'homme' ? 'est-homme' : a.genre === 'femme' ? 'est-femme' : ''}" data-ref="${a.ref}">
    <span class="swipe-tampon is-oui" aria-hidden="true">Intéressé·e</span><span class="swipe-tampon is-non" aria-hidden="true">Pas pour moi</span>
    ${a.coeur_message ? `<p class="swipe-coeur-mot"><img class="tayri-coeur-mini" src="/images/marque/tayri-coeur.webp" alt="" width="18" height="18"> « ${esc(a.coeur_message)} »</p>` : ''}
    ${a.ta_choisi ? '<span class="swipe-ta-choisi"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Ce profil t’a choisi·e</span>' : ''}
    ${a.revu ? '<span class="swipe-ta-choisi">Tu l’as déjà passé : une seconde chance ?</span>' : a.hors_criteres ? '<span class="swipe-ta-choisi"><svg class="ico" aria-hidden="true"><use href="/icones.svg#globe"/></svg> Un peu hors de tes critères</span>' : ''}
    <div class="swipe-resume">
      <svg class="swipe-bijou" viewBox="0 -22 180 276" aria-hidden="true" focusable="false"><use href="#bijou-${femme ? 'femme' : 'homme'}"/></svg>
      <h2>${femme ? 'Une femme' : 'Un homme'}, ${esc(a.age)} ans</h2>
      ${lieu ? `<p class="swipe-lieu">${esc(lieu)}</p>` : ''}
      ${origineLisible(a.origine) ? `<p class="swipe-origine">${esc(origineLisible(a.origine))}</p>` : ''}
      ${a.village ? `<p class="swipe-village">Originaire de ${esc(a.village)}</p>` : ''}
      ${mr.metier ? `<p class="swipe-metier">${esc(mr.metier)}</p>` : ''}
      ${mr.religion ? `<p class="swipe-religion">${esc(mr.religion)}</p>` : ''}
      <p class="swipe-statut${a.attente_validation ? ' is-attente' : ''}">${a.attente_validation ? '' : '<span aria-hidden="true">✓</span> '}${statut(a)}</p>
      <button type="button" class="swipe-voir" data-voir aria-expanded="false">Voir le profil</button>
    </div>
    <div class="swipe-texte" data-details hidden>
      <button type="button" class="swipe-voir" data-voir aria-expanded="true">Fermer</button>
      <p class="annonce-ref${a.piece_identite ? ' is-piece' : ''}">Profil n° ${a.ref} · ${statut(a)}</p>
      ${badgesProfil(a)}
      <h2>${femme ? 'Une femme' : 'Un homme'}, ${esc(a.age)} ans</h2>
      <p class="annonce-lieu"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lieu"/></svg>${esc([a.ville, ...infos].filter(Boolean).join(' · '))}</p>
      ${origineLisible(a.origine) || a.village ? `<p class="annonce-origine"><b>${esc([origineLisible(a.origine), a.village && `de ${a.village}`].filter(Boolean).join(' · '))}</b></p>` : ''}
      ${secteur ? `<p class="annonce-lieu annonce-secteur"><svg class="ico" aria-hidden="true"><use href="/icones.svg#boussole"/></svg> Cherche en : <b>${esc(secteur)}</b></p>` : ''}
      ${tags.length ? `<p class="annonce-tags">${tags.map((t) => `<span>${esc(lib(t))}</span>`).join('')}</p>` : ''}
      ${a.profil ? `<h3>Qui je suis</h3><p data-membre>${esc(a.profil)}</p>` : ''}
      ${a.recherche ? `<h3>Qui je cherche${ages}</h3><p data-membre>${esc(a.recherche)}</p>` : ''}
      ${foiEtVie(a).replace(/<h4>/g, '<h3>').replace(/<\/h4>/g, '</h3>')}
      <p class="profil-moderer"><button type="button" class="link-button" data-moderer="${a.ref}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#flag"/></svg> Bloquer et signaler</button></p>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- filtres (âge, religion, pratique, pays, enfants, tabac, pièce d'identité)
const CLE_FILTRES = 'lfb-swipe-filtres';
let filtres = { age_min: '', age_max: '', religion: '', pratique: '', pays: '', enfants: '', situation: '', etudes: '', non_fumeur: false, piece: false, inclure_inconnus: true };
const lireFiltres = () => { try { return JSON.parse(localStorage.getItem(CLE_FILTRES) || 'null'); } catch { return null; } };
const garderFiltres = () => { try { localStorage.setItem(CLE_FILTRES, JSON.stringify(filtres)); } catch { /* */ } };
// Statut marital et niveau d'études (demande d'une membre, 16 nov. 2026). Les valeurs varient un peu (accents, « Célibataire ») : on les ramène à une seule.
const sansAccent = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const SITUATIONS = [['jamais', 'Jamais marié(e)'], ['divorce', 'Divorcé(e)'], ['veuf', 'Veuf / veuve'], ['separe', 'Séparé(e)'], ['papier', 'Marié(e) sur papier uniquement']];
const situationDe = (v) => { const x = sansAccent(v); if (!x) return ''; if (/jamais|celibataire/.test(x)) return 'jamais'; if (/divorc/.test(x)) return 'divorce'; if (/veu/.test(x)) return 'veuf'; if (/separ/.test(x)) return 'separe'; if (/papier/.test(x)) return 'papier'; return ''; };
const NIVEAUX = [['2', 'Collège ou plus'], ['3', 'Lycée ou plus'], ['4', 'Universitaire']];
const niveauDe = (v) => { const x = sansAccent(v); if (!x) return 0; if (/univ|master|licence|doctor|bac ?\+/.test(x)) return 4; if (/lycee|bac/.test(x)) return 3; if (/college/.test(x)) return 2; if (/primaire/.test(x)) return 1; return 0; };
function correspond(p) {
  const f = filtres, inconnu = (v) => !v && f.inclure_inconnus;
  if (f.age_min && p.age < Number(f.age_min)) return false;
  if (f.age_max && p.age > Number(f.age_max)) return false;
  if (f.religion && p.religion !== f.religion && !inconnu(p.religion)) return false;
  if (f.pratique && p.pratique !== f.pratique && !inconnu(p.pratique)) return false;
  if (f.pays && p.pays !== f.pays) return false;
  if (f.enfants && p.enfants !== f.enfants && !inconnu(p.enfants)) return false;
  if (f.situation) { const s = situationDe(p.situation); if (s ? s !== f.situation : !f.inclure_inconnus) return false; }
  if (f.etudes) { const n = niveauDe(p.etudes); if (n ? n < Number(f.etudes) : !f.inclure_inconnus) return false; }
  if (f.non_fumeur) { const t = (p.mode_vie || []).find((x) => /^Fumeur/.test(x)); if (t ? t !== 'Fumeur: non' : !f.inclure_inconnus) return false; }
  if (f.piece && !p.piece_identite) return false;
  return true;
}
const nbFiltres = () => ['age_min', 'age_max', 'religion', 'pratique', 'pays', 'enfants', 'situation', 'etudes'].filter((k) => filtres[k]).length + (filtres.non_fumeur ? 1 : 0) + (filtres.piece ? 1 : 0);
function appliquer() { profils = tous.filter(correspond); const b = document.querySelector('[data-filtres-ouvrir] b'); if (b) b.textContent = nbFiltres() ? `(${nbFiltres()})` : ''; afficher(); }
// Recherche par numéro (« profil n° 123 » dit en live) : le profil passe en haut de la pile, prêt pour le cœur.
const CLE_PROFIL = 'lfb-profil-cherche';
function chercherProfil(valeur, { discret = false } = {}) {
  const st = document.querySelector('[data-cherche-statut]');
  const ref = Number.parseInt(String(valeur || '').replace(/\D/g, ''), 10);
  const dire = (t) => { if (st && !discret) st.textContent = t; };
  if (!ref) return dire('Écris le numéro du profil.');
  const p = tous.find((x) => Number(x.ref) === ref);
  if (!p) return dire(`Le profil n° ${ref} n’est pas dans tes profils : hors de tes critères, déjà choisi, ou retiré.`);
  dire('');
  window.lfbEvent?.('recherche_profil');
  profils = [p, ...profils.filter((x) => x !== p)];
  afficher();
  try { zone.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ }
}
document.querySelector('[data-cherche-profil]')?.addEventListener('submit', (e) => { e.preventDefault(); chercherProfil(e.target.elements.ref.value); });
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
        <label>Statut marital<select name="situation"><option value="">Peu importe</option>${SITUATIONS.map(([v, t]) => `<option value="${v}"${filtres.situation === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Études<select name="etudes"><option value="">Peu importe</option>${NIVEAUX.map(([v, t]) => `<option value="${v}"${filtres.etudes === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <label class="swipe-case"><input type="checkbox" name="non_fumeur"${filtres.non_fumeur ? ' checked' : ''}> Non-fumeur seulement</label>
      <label class="swipe-case"><input type="checkbox" name="piece"${filtres.piece ? ' checked' : ''}> Vérifiés avec pièce d’identité seulement</label>
      <label class="swipe-case"><input type="checkbox" name="inclure_inconnus"${filtres.inclure_inconnus ? ' checked' : ''}> Garder les profils qui n’ont pas répondu à ces questions</label>
      <p class="swipe-filtres-bas"><span data-filtres-nombre></span><button type="button" class="po-btn-verre" data-filtres-effacer>Tout effacer</button><button type="submit" class="po-btn">Voir les profils</button></p>
    </form>`;
  const form = zoneF.querySelector('[data-filtres]'), bouton = zoneF.querySelector('[data-filtres-ouvrir]');
  const lire = () => { const F = form.elements; filtres = { age_min: F.age_min.value, age_max: F.age_max.value, religion: F.religion.value, pratique: F.pratique.value, pays: F.pays.value, enfants: F.enfants.value, situation: F.situation.value, etudes: F.etudes.value, non_fumeur: F.non_fumeur.checked, piece: F.piece.checked, inclure_inconnus: F.inclure_inconnus.checked }; };
  const compter = () => { lire(); const n = tous.filter(correspond).length; zoneF.querySelector('[data-filtres-nombre]').textContent = `${n} profil${n > 1 ? 's' : ''} correspond${n > 1 ? 'ent' : ''}`; };
  bouton.addEventListener('click', () => { form.hidden = !form.hidden; bouton.setAttribute('aria-expanded', String(!form.hidden)); if (!form.hidden) compter(); });
  form.addEventListener('input', compter); form.addEventListener('change', compter);
  form.addEventListener('submit', (e) => { e.preventDefault(); lire(); garderFiltres(); form.hidden = true; bouton.setAttribute('aria-expanded', 'false'); appliquer(); });
  zoneF.querySelector('[data-filtres-effacer]').addEventListener('click', () => { filtres = { age_min: '', age_max: '', religion: '', pratique: '', pays: '', enfants: '', situation: '', etudes: '', non_fumeur: false, piece: false, inclure_inconnus: true }; garderFiltres(); monterFiltres(); appliquer(); });
}

function infos() {
  const lignes = [];
  if (choisi.nombre) lignes.push(choisi.refs.length
    ? `<p class="swipe-info is-choisi"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur-plein"/></svg> <strong>${choisi.nombre} personne${choisi.nombre > 1 ? 's t’ont' : ' t’a'} choisi·e</strong> : ${choisi.nombre > 1 ? 'elles sont' : 'elle est'} en tête de ta pile, marquée${choisi.nombre > 1 ? 's' : ''}.</p>`
    : `<p class="swipe-info is-choisi"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur-plein"/></svg> <strong>${choisi.nombre} personne${choisi.nombre > 1 ? 's t’ont' : ' t’a'} choisi·e</strong> <span class="swipe-flou" aria-hidden="true">n° ••• · n° •••</span><br><a href="/abonnement/?formule=passion">Découvre qui avec la formule Passion</a></p>`);
  if (matchs.limite) lignes.push(`<p class="swipe-info${matchs.actifs >= matchs.limite ? ' is-plein' : ''}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur-plein"/></svg> Matchs en cours : <strong>${matchs.actifs} / ${matchs.limite}</strong>${matchs.actifs >= matchs.limite ? ' · tu peux continuer à découvrir les profils, mais plus en choisir pour l’instant' : ''}</p>`);
  if (quota.limite) lignes.push(`<p class="swipe-info">Il te reste <strong>${quota.restants}</strong> profil${quota.restants > 1 ? 's' : ''} à swiper aujourd’hui (${quota.limite} par jour avec ta formule). <a href="/abonnement/">Plus de profils</a></p>`);
  if (profilInvisible) lignes.unshift('<p class="swipe-info is-plein">Ton profil n’est pas terminé : personne ne peut encore te voir. <a href="/mon-espace/#a-completer">Voir ce qu’il manque</a></p>');
  if (tous.length ? !profils.some((x) => !x.revu) : chargeFait) lignes.unshift(`<p class="swipe-info"><strong>Tu as vu tous les profils qui te correspondent et qui te cherchent aussi.</strong> De nouveaux profils arrivent chaque jour. En attendant, tu revois ceux que tu avais passés ; tu peux aussi élargir ta recherche avec « Modifier mon profil ». <a href="/mon-espace/">Mon espace</a></p>`);
  bandeau.innerHTML = lignes.join('');
}
function plusDeProfilsAujourdhui() {
  message(`<p class="swipe-coeur"><svg class="ico" aria-hidden="true"><use href="/icones.svg#hourglass"/></svg></p><h2>C’est tout pour aujourd’hui</h2><p>Tu as swipé tes ${quota.limite} profils du jour. Reviens demain : ton compteur repart à zéro à minuit.</p><p>Envie d’en voir plus ? Avec <strong>Cœur</strong>, 30 profils par jour ; avec <strong>Passion</strong>, sans limite, et tu découvres qui t’a choisi·e.</p><p class="po-actions"><a class="po-btn" href="/abonnement/">Voir les formules</a><a class="po-btn-verre" href="/mon-espace/">Mon espace</a></p>`);
}
function afficher() {
  infos();
  if (quota.limite && quota.restants <= 0 && profils.length) return plusDeProfilsAujourdhui();
  const nouveaux = profils.filter((p) => !p.revu).length;
  // On arrive aux profils déjà passés : c'est un nouveau tour, on le dit.
  if (profils[0]?.revu && !tourAnnonce) {
    tourAnnonce = true; tour += 1;
    toast(`Tour ${tour} ! Tu as tout vu : voici une seconde chance`);
    vibrer(30);
  }
  compteur.textContent = nouveaux ? `${nouveaux} profil${nouveaux > 1 ? 's' : ''} à découvrir` : profils.length ? `Tour ${tour} · encore ${profils.length} profil${profils.length > 1 ? 's' : ''}` : '';
  // Fin de la pile : on repart pour un tour, le swipe ne s'arrête jamais.
  if (!profils.length && !tous.length && dejaCharge && !enRecharge) { recharger(); return; }
  if (!profils.length && tous.length) return message(`<p class="swipe-coeur"></p><h2>Aucun profil avec ces filtres</h2><p>${tous.length} profil${tous.length > 1 ? 's restent' : ' reste'} à découvrir si tu élargis ta recherche : ouvre les filtres et enlève un critère.</p>`);
  if (!profils.length) return message(`<p class="swipe-coeur"><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg></p><h2>Tu as vu tous les profils pour le moment</h2>${coeurs ? `<p><strong>${coeurs} coup${coeurs > 1 ? 's' : ''} de cœur</strong> envoyé${coeurs > 1 ? 's' : ''} aujourd’hui</p>` : ''}<p>Tes choix sont notés. Si une personne que tu as choisie te choisit aussi, vous êtes mis en relation. Ton identité n’est jamais révélée : les autres ne voient qu’un numéro de profil.</p><p>De nouveaux profils arrivent chaque semaine : reviens bientôt.</p><p><a class="po-btn" href="/mon-espace/">Suivre mes demandes</a></p>`);
  zone.innerHTML = profils.slice(0, 2).reverse().map(carte).join('');
  document.querySelector('[data-swipe-boutons]').hidden = false;
  glisser(zone.lastElementChild);
}

// ---------------------------------------------------------------- effets : cœurs, vibration, encouragements, match
const vibrer = (m) => { try { navigator.vibrate?.(m); } catch { /* */ } };
function eclat(x, y, emojis = ['', '', '', ''], n = 14) {
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
const PALIERS = { 5: '5 coups de cœur ! Tu es lancé·e', 10: '10 coups de cœur : on adore ton énergie', 25: '25 ! Ton âme sœur est peut-être tout près', 50: '50 coups de cœur : tu es une star du swipe' };
function fenetre(html, classe = '', fermer = '<p class="po-actions"><button type="button" class="po-btn" data-fermer>Continuer</button></p>') {
  document.querySelector('.swipe-fenetre')?.remove();
  const d = document.createElement('div'); d.className = `swipe-fenetre ${classe}`; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="swipe-fenetre-boite">${html}${fermer}</div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fermer]')) d.remove(); });
  return d;
}
// Première visite (ou juste après l'inscription) : ce qu'il faut faire, en trois gestes.
function bienvenue() {
  let deja = false;
  try { deja = localStorage.getItem('lfb_swipe_bienvenue') === '1'; } catch { /* */ }
  if (deja && !new URLSearchParams(location.search).has('bienvenue')) return;
  try { localStorage.setItem('lfb_swipe_bienvenue', '1'); } catch { /* */ }
  const d = fenetre(`<h2>Bienvenue !</h2>
    <ul class="swipe-bienvenue">
      <li><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Il te plaît</li>
      <li><svg class="ico" aria-hidden="true"><use href="/icones.svg#croix"/></svg> Pas pour toi</li>
      <li>Les deux d’accord : <strong>match</strong></li>
    </ul>`, 'swipe-fenetre-bienvenue');
  const b = d.querySelector('[data-fermer]'); if (b) b.textContent = 'C’est parti';
}
function celebrerMatch(ref) {
  vibrer([40, 60, 40, 60, 120]);
  const d = fenetre(`<p class="swipe-match-coeurs" aria-hidden="true"><img class="tayri-coeur-match" src="/images/marque/tayri-coeur.webp" alt="" width="84" height="84"></p><h2>C’est réciproque !</h2><p>Le profil <strong>n° ${esc(ref)}</strong> t’a choisi·e aussi. Vous êtes mis en relation très vite : ta discussion s’ouvre dans ton espace.</p>`, 'is-match');
  const r = d.querySelector('.swipe-fenetre-boite').getBoundingClientRect();
  for (let k = 0; k < 3; k += 1) setTimeout(() => eclat(r.left + r.width / 2, r.top + 60, ['', '', '', '', ''], 22), k * 280);
}
// Matchs au complet : avec qui, l'invitation à dématcher (raisons ouvertes dans l'espace) et l'abonnement pour plusieurs matchs.
// Déclaration de bonne foi : demandée une fois, avant le premier cœur.
let sincerite = true;
let profilInvisible = false; // profil pas encore validé : personne ne le voit
let chargeFait = false; // la pile a été chargée au moins une fois (pour distinguer « vide » de « pas encore là »)
function demanderSincerite() {
  const d = fenetre(SINCERITE_HTML, 'swipe-sincerite');
  d.querySelector('[data-fermer]')?.closest('p')?.remove();
  brancherSincerite(d, async () => token, () => { sincerite = true; d.remove(); toast('Merci. Tu peux envoyer tes cœurs.'); });
  return d;
}
async function limiteAtteinte() {
  vibrer(80);
  const ouverts = token ? await matchsOuverts(token) : [];
  return fenetre(`<p class="swipe-match-coeurs" aria-hidden="true"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg></p>${matchPleinHtml(ouverts, infosAbo)}`);
}
// Toujours à portée de main pendant le swipe : s'abonner, ou monter en Prestige.
function boutonAbo(formule, algerie) {
  const z = document.querySelector('[data-swipe-abo]');
  if (!z || formule === 'prestige' || window.LFB_PLAY) return;
  z.innerHTML = algerie
    ? '<a class="swipe-abo-btn" href="/salon/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#video"/></svg> Plus de matchs : viens au live</a>'
    : formule === 'passion'
      ? '<a class="swipe-abo-btn" href="/abonnement/?formule=prestige"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Passer à Prestige</a>'
      : '<a class="swipe-abo-btn" href="/abonnement/"><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> S’abonner dès 9 €</a>';
  z.hidden = false;
}

// Plus de match disponible : le live, et les formules pour celles et ceux qui peuvent payer en ligne.
function quotaAtteint({ algerie, formule } = {}) {
  vibrer(80);
  if (algerie || window.LFB_PLAY) return fenetre(`<p class="swipe-match-coeurs" aria-hidden="true"><svg class="ico" aria-hidden="true"><use href="/icones.svg#video"/></svg></p><h2>Viens me voir en live</h2><p>Tu as utilisé ton match. Pour en avoir d’autres, <strong>viens soutenir le live de Lamia</strong>, du lundi au vendredi à 20 h : elle peut t’offrir un match, une fois toutes les 2 semaines.</p><p class="po-actions"><a class="po-btn-verre" href="/salon/">Voir le live</a></p>`);
  return fenetre(`<p class="swipe-match-coeurs" aria-hidden="true"><svg class="ico" aria-hidden="true"><use href="/icones.svg#video"/></svg></p><h2>Tes matchs disponibles sont utilisés</h2><p>Prends <strong>une place de match en plus à 5 €</strong>, viens au <strong>live de Lamia</strong>, du lundi au vendredi à 20 h (1 match offert toutes les 2 semaines), ou choisis une formule : 3 matchs en cours avec Passion, 10 avec Prestige.</p><p class="po-actions"><a class="po-btn-verre" href="/salon/">Voir le live</a><a class="po-btn-verre" href="/abonnement/">Voir les formules</a></p>`);
}
// Bloquer ou signaler le profil affiché. Bloquer le retire tout de suite, et la personne n'en sait rien.
function moderer(ref) {
  const d = fenetre(`<h2>Profil n° ${esc(ref)}</h2><p>Vous ne vous verrez plus et vous ne pourrez plus vous écrire. La modération reçoit une alerte et regarde ce profil. La personne n’est pas prévenue.</p>${SIGNALEMENT_HTML}<p class="po-actions"><button type="button" class="po-btn" data-bloquer><svg class="ico" aria-hidden="true"><use href="/icones.svg#flag"/></svg> Bloquer et signaler</button></p><p class="form-status" role="status" data-moderer-statut></p>`);
  const envoyer = async (action, fin) => {
    const sig = lireSignalement(d, d.querySelector('[data-moderer-statut]'));
    if (!sig) return;
    d.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try { await api({ action, ref, ...sig }, token); fin(); }
    catch { d.querySelectorAll('button').forEach((x) => { x.disabled = false; }); d.querySelector('[data-moderer-statut]').textContent = 'Ça n’a pas abouti. Réessaie dans un instant.'; }
  };
  d.querySelector('[data-bloquer]').addEventListener('click', () => envoyer('annonce_bloquer_signaler', () => { d.remove(); tous = tous.filter((p) => p.ref !== ref); profils = profils.filter((p) => p.ref !== ref); historique = historique.filter((x) => x.profil.ref !== ref); garderDernier(); majAnnuler(); afficher(); toast('C’est fait. Vous ne vous verrez plus, Lamia est prévenue.'); }));
}
zone.addEventListener('click', (e) => { const b = e.target.closest('[data-moderer]'); if (b) moderer(Number(b.dataset.moderer)); });
zone.addEventListener('click', (e) => {
  if (!e.target.closest('[data-voir]')) return;
  const c = e.target.closest('.swipe-carte'), d = c.querySelector('[data-details]');
  d.hidden = !d.hidden; c.classList.toggle('is-details', !d.hidden);
  if (!d.hidden) d.scrollTop = 0;
});

// Revenir en arrière (Lamia, 16 nov. 2026) : le dernier profil pour tout le monde, jusqu'à 10 en Passion, sans limite en Prestige.
// Les profils passés restent annulables même après avoir fermé l'appli (fiches anonymes gardées sur ce téléphone).
let retourMax = 1;
function annulerDernier() {
  if (!historique.length || occupe) return;
  const d = historique.pop(); garderDernier();
  api({ action: 'annonce_swipe_annuler', ref: d.profil.ref }, token).catch((err) => { if (err.code === 'retour_limite') toast('Revenir plus loin en arrière : avec la formule Passion (10 profils) ou Prestige (sans limite).'); });
  if (d.choix === 'oui') coeurs = Math.max(0, coeurs - 1);
  tous = [d.profil, ...tous.filter((p) => p.ref !== d.profil.ref)]; profils = [d.profil, ...profils.filter((p) => p.ref !== d.profil.ref)];
  majAnnuler(); afficher(); vibrer(10);
  zone.lastElementChild?.classList.add('is-retour');
}
const CLE_DERNIER = 'lfb-swipe-historique';
let historique = [];
function garderDernier() { try { localStorage.setItem(CLE_DERNIER, JSON.stringify(historique.slice(-50))); } catch { /* */ } }
function restaurerDernier() {
  try { const h = JSON.parse(localStorage.getItem(CLE_DERNIER) || '[]'); if (Array.isArray(h)) { historique = h.filter((d) => d?.profil?.ref); majAnnuler(); } } catch { /* */ }
}
function noterSwipe(d) { historique.push(d); if (retourMax && historique.length > retourMax) historique = historique.slice(-retourMax); garderDernier(); majAnnuler(); }
const majAnnuler = () => { const b = document.querySelector('[data-swipe-annuler]'); if (b) b.disabled = !historique.length; };

async function choisir(choix, message) {
  if (occupe || !profils.length) return;
  occupe = true;
  const el = zone.querySelector(`.swipe-carte[data-ref="${profils[0].ref}"]`);
  const ref = profils[0].ref;
  if (el) { el.style.transition = 'transform .35s ease, opacity .35s ease'; el.style.transform = `translateX(${choix === 'oui' ? 130 : -130}%) rotate(${choix === 'oui' ? 18 : -18}deg)`; el.style.opacity = '0'; }
  const profil = profils[0];
  if (choix === 'oui' && !sincerite) { if (el) { el.style.transform = ''; el.style.opacity = ''; el.classList.remove('vers-oui', 'vers-non'); el.classList.add('is-refus'); setTimeout(() => el.classList.remove('is-refus'), 500); } occupe = false; return demanderSincerite(); }
  if (choix === 'oui' && matchs.limite && matchs.actifs >= matchs.limite) { if (el) { el.style.transform = ''; el.style.opacity = ''; el.classList.remove('vers-oui', 'vers-non'); el.classList.add('is-refus'); setTimeout(() => el.classList.remove('is-refus'), 500); } occupe = false; return limiteAtteinte(); }
  if (choix === 'oui') {
    const btn = document.querySelector('[data-swipe-oui]').getBoundingClientRect(); eclat(btn.left + btn.width / 2, btn.top + btn.height / 2); vibrer(18);
    coeurs += 1; if (PALIERS[coeurs]) setTimeout(() => toast(PALIERS[coeurs]), 350);
    window.lfbEvent?.('swipe_interesse');
  } else vibrer(8);
  noterSwipe({ profil, choix });
  envoi = api({ action: 'annonce_swipe', ref, choix, ...(message ? { message } : {}) }, token).then((r) => {
    if (message) { creditsCoeur = Math.max(0, creditsCoeur - 1); try { localStorage.removeItem(`lfb-coeur-${ref}`); } catch { /* */ } toast('💌 Ton cœur et ton message sont partis'); }
    if (r?.matchs) { matchs = { ...matchs, ...r.matchs }; infos(); }
    if (r?.match) { historique = historique.filter((d) => d.profil.ref !== ref); garderDernier(); majAnnuler(); celebrerMatch(r.ref); }
  }).catch((err) => { if (err.code === 'sincerite_requise') { sincerite = false; return demanderSincerite(); } if (err.code === 'hors_de_ses_criteres') return toast('Ce profil cherche quelqu’un d’un autre âge ou d’une autre zone : ton cœur n’est pas parti.'); if (err.code === 'coeur_requis') { creditsCoeur = 0; return toast('Ton cœur avec message n’est pas parti : il te faut un crédit. Ton choix n’a pas été enregistré.'); } if (err.code === 'quota_matchs') return quotaAtteint(err); if (err.code === 'limite_matchs') { matchs = { ...matchs, actifs: err.actifs ?? matchs.limite }; infos(); limiteAtteinte(); } });
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
// Cœur avec message (2 €) : une phrase qui part avec le cœur. Sans crédit, on l'achète ; le brouillon est gardé sur ce téléphone.
document.querySelector('[data-swipe-mot]')?.addEventListener('click', () => {
  if (occupe || !profils.length) return;
  const ref = profils[0].ref;
  let brouillon = '';
  try { brouillon = localStorage.getItem(`lfb-coeur-${ref}`) || ''; } catch { /* */ }
  const algerie = infosAbo.algerie;
  // Plus intime (Lamia, 15 nov.) : une petite lettre, un compteur de caractères, la case bien alignée.
  // Une lettre berbère : « TAYRI » en tifinagh sur le rabat, le cœur du logo dans le sceau (Lamia, 15 nov.).
  const d = fenetre(`<svg class="lettre-illu" viewBox="0 0 220 130" aria-hidden="true" focusable="false">
      <defs><linearGradient id="lettre-env" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6EA"/><stop offset="1" stop-color="#F6E3CC"/></linearGradient></defs>
      <g fill="none" stroke="#C9A24A" stroke-width="1.4"><path d="M12 66l7-7 7 7-7 7z M194 66l7-7 7 7-7 7z"/></g>
      <g fill="#C9A24A"><circle cx="19" cy="66" r="1.6"/><circle cx="201" cy="66" r="1.6"/></g>
      <rect x="44" y="22" width="132" height="92" rx="7" fill="url(#lettre-env)" stroke="#D8B88E" stroke-width="1.5"/>
      <path d="M44 28l66 46 66-46" fill="#FBEEDD" stroke="#D8B88E" stroke-width="1.5"/>
      <path d="M50 108l40-30 M170 108l-40-30" stroke="#E6CFAE" stroke-width="1.2"/>
      <g fill="none" stroke="#2E3A6E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M78 37h10 M83 32v10"/>
        <circle cx="96.8" cy="39.2" r="2.8"/>
        <path d="M111.6 32.5h-6 l5 4.6 -5 4.6"/>
        <ellipse cx="121.4" cy="37" rx="3.8" ry="4.6"/>
        <path d="M138.4 32.5h-7 l4.4 4.5 -4.4 4.5h7"/>
      </g>
      <image href="/images/marque/tayri-coeur.webp" x="93" y="56" width="34" height="35"/>
    </svg>
    <h2>Un mot doux pour le n° ${esc(ref)}</h2>
    <p class="lettre-intro">Quelques mots sincères, rien que pour cette personne. Ils arrivent avec ton cœur, et ton profil passe en premier dans sa pile.</p>
    <label class="lettre-papier"><span class="sr-only">Ton message au profil n° ${esc(ref)}</span><textarea data-mot rows="5" maxlength="200" placeholder="Ce qui t’a touché·e dans son profil…">${esc(brouillon)}</textarea></label>
    <p class="lettre-compte"><span data-mot-compte>0</span> / 200</p>
    <p class="lettre-discret"><svg class="ico" aria-hidden="true"><use href="/icones.svg#shield"/></svg> Tu restes anonyme : numéros, liens et réseaux sont masqués.</p>
    ${creditsCoeur > 0
      ? `<p class="po-actions"><button type="button" class="po-btn" data-mot-envoyer>Envoyer mon mot doux</button></p><p class="swipe-mot-credits">${creditsCoeur} mot${creditsCoeur > 1 ? 's' : ''} doux disponible${creditsCoeur > 1 ? 's' : ''}</p>`
      : algerie ? '<p>Le paiement en ligne n’est pas possible depuis l’Algérie : envoie un cœur simple, ou viens au live.</p>'
        : '<label class="lettre-cgv"><input type="checkbox" data-mot-cgv><span>J’accepte les <a class="text-link" href="/cgv/" target="_blank">conditions de vente</a></span></label><p class="po-actions"><button type="button" class="po-btn" data-mot-acheter>Envoyer mon mot doux · 2 €</button></p><p class="swipe-mot-credits">Après le paiement, tu reviens ici : ton message t’attend.</p>'}`, 'is-lettre', '<p class="lettre-plus-tard"><button type="button" class="link-button" data-fermer>Plus tard</button></p>');
  const compte = d.querySelector('[data-mot-compte]');
  const champ = d.querySelector('[data-mot]');
  const compter = () => { compte.textContent = champ.value.length; compte.parentElement.classList.toggle('is-presque', champ.value.length >= 180); };
  compter();
  champ.addEventListener('input', () => { compter(); try { localStorage.setItem(`lfb-coeur-${ref}`, champ.value); } catch { /* */ } });
  d.querySelector('[data-mot-envoyer]')?.addEventListener('click', () => {
    const texte = champ.value.trim();
    if (texte.length < 2) { champ.focus(); return; }
    d.remove(); choisir('oui', texte);
  });
  d.querySelector('[data-mot-acheter]')?.addEventListener('click', async (e) => {
    if (!d.querySelector('[data-mot-cgv]').checked) return toast('Coche les conditions de vente pour continuer.');
    e.target.disabled = true;
    try {
      const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'abonnement_payer', unite: 'coeur_message', cgv_accepted: true }) });
      const j = await r.json().catch(() => ({}));
      if (j.url) { location.href = j.url; return; }
      toast(j.error === 'profil_requis' ? 'Il faut un profil publié pour envoyer un cœur avec message.' : 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.');
    } catch { toast('Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.'); }
    e.target.disabled = false;
  });
});
document.querySelector('[data-swipe-annuler]')?.addEventListener('click', annulerDernier);
addEventListener('keydown', (e) => { if (document.querySelector('.swipe-fenetre')) return; if (e.key === 'ArrowRight') choisir('oui'); if (e.key === 'ArrowLeft') choisir('non'); if (e.key === 'Backspace') annulerDernier(); });

(async () => {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  if (!session) return message('<h2>Connecte-toi pour swiper</h2><p>Il faut un compte et un profil pour découvrir les profils et dire lesquels t’intéressent.</p><p class="po-actions"><a class="po-btn" href="/rencontres/#confier">Créer mon compte et mon profil</a><a class="po-btn-verre" href="/mon-espace/">Me connecter</a></p>');
  token = session.access_token;
  try {
    let adresse;
    let formule, algerie;
    let liste;
    ({ profils: tous, quota, choisi, matchs = matchs, adresse, formule, algerie } = liste = await api({ action: 'annonce_swipe_liste' }, token));
    sincerite = liste.sincerite !== false; try { if (sincerite) localStorage.setItem('lfb-charte', '1'); } catch {}
    profilInvisible = Boolean(liste.invisible);
    chargeFait = true;
    if (!sincerite) setTimeout(demanderSincerite, 600); // obligatoire : demandée dès l'ouverture du swipe
    creditsCoeur = liste.coeurs_message || 0;
    retourMax = liste.retour === null ? 0 : (liste.retour || 1); // 0 = sans limite
    if (retourMax && historique.length > retourMax) { historique = historique.slice(-retourMax); garderDernier(); majAnnuler(); }
    boutonAbo(formule, algerie);
    infosAbo = { formule, algerie };
    dejaCharge = true;
    const salut = document.querySelector('[data-swipe-adresse]');
    if (salut && adresse) { salut.textContent = adresse; salut.hidden = false; }
    restaurerDernier();
    // Âge et localisation sont déjà appliqués par le serveur, dans les deux sens. Ici : les filtres choisis, gardés sur ce téléphone.
    const gardes = lireFiltres();
    if (gardes) filtres = { ...filtres, ...gardes };
    monterFiltres();
    appliquer();
    bienvenue();
    // Profil demandé par un lien (?profil=123) ou cherché avant de créer son profil : on le remet devant.
    let voulu = new URLSearchParams(location.search).get('profil');
    try { voulu = voulu || localStorage.getItem(CLE_PROFIL); localStorage.removeItem(CLE_PROFIL); } catch { /* */ }
    if (voulu) chercherProfil(voulu, { discret: !new URLSearchParams(location.search).get('profil') });
  } catch (err) {
    if (err.code === 'annonce_en_pause') return message('<h2>Ton annonce est en pause</h2><p>Reprends-la dans ton espace pour découvrir les profils.</p><p><a class="po-btn" href="/mon-espace/">Aller à mon espace</a></p>');
    if (err.code === 'photos_requises') return message('<h2>Ajoute 2 photos</h2><p>Puis les profils s’affichent ici.</p><p><a class="po-btn" href="/mon-espace/#photos">Ajouter mes photos</a></p>');
    if (err.code === 'fiche_a_confirmer') return message(`<h2>Confirme ta fiche</h2><p>Puis les profils s’affichent ici.</p><p><a class="po-btn" href="${String(err.data?.lien || '/mon-espace/').replace(/"/g, '')}">Confirmer ma fiche</a></p>`);
    if (err.code === 'fiche_live') return message('<h2>Ta fiche du live est bien là</h2><p>Il lui manque ton âge ou ton genre pour que tu puisses swiper. Écris à Lamia pour qu’elle la complète : inutile de refaire un profil.</p><p><a class="po-btn" href="/mon-espace/">Aller dans mon espace</a></p>');
    if (err.code === 'moderateur_sans_annonce') return message('<h2><svg class="ico" aria-hidden="true"><use href="/icones.svg#shield"/></svg> Ton compte modérateur</h2><p>Tu peux lire toutes les annonces anonymes. Sans annonce à toi, tu ne swipes pas et tu ne matches pas. Tu peux en créer une quand tu veux.</p><p><a class="po-btn" href="/rencontres/#confier">Créer une annonce</a> <a class="po-btn" href="/rencontres/">Voir les annonces</a></p>');
    if (err.code === 'pas_de_profil') return message('<h2>Crée d’abord ton profil</h2><p>Pour swiper, il faut ton profil : c’est lui qui sera proposé aux personnes qui te correspondent.</p><p><a class="po-btn" href="/rencontres/#confier"><svg class="ico" aria-hidden="true"><use href="/icones.svg#mail"/></svg> Créer mon profil</a></p>');
    if (err.code === 'en_match') return message('<h2><svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg> Tes matchs en cours sont au complet</h2><p>Tu peux mettre fin à l’un d’eux depuis ton espace pour choisir d’autres profils.</p><p><a class="po-btn" href="/mon-espace/">Mon espace</a></p>');
    message('<h2>Les profils ne s’affichent pas pour le moment</h2><p>Réessaie dans un instant.</p>');
  }
})();

// Un nouveau tour : attend que le dernier choix soit enregistré, puis relit la pile.
// Si elle est vraiment vide (tout a été choisi), afficher() montre le message de fin.
async function recharger() {
  enRecharge = true;
  zone.innerHTML = '<p class="annonce-vide">Les profils arrivent…</p>';
  try {
    await envoi.catch(() => {});
    tourAnnonce = false;
    ({ profils: tous, quota, choisi, matchs = matchs } = await api({ action: 'annonce_swipe_liste' }, token));
    appliquer();
  } catch { message('<h2>Les profils ne s’affichent pas pour le moment</h2><p>Réessaie dans un instant.</p>'); }
  enRecharge = false;
}
