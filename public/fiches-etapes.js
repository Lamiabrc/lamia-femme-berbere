// « Créer un profil » en cartes (Lamia, 26 nov. 2026) : un thème par écran, Précédent / Suivant,
// l'essentiel visible et le reste dans « Plus de précisions » (fermé). Les champs sont seulement
// déplacés : leurs noms, et donc ce qui est enregistré, ne changent pas.

const ETAPES = [
  { titre: 'Qui c’est', aide: 'Pseudo et lien restent privés : jamais dans l’annonce.', voir: ['pseudo', 'lien_reseau', 'genre', 'age', 'pays', 'ville'] },
  { titre: 'Statut et enfants', aide: 'Le thème qui pèse le plus dans le matching.', voir: ['situation', 'enfants', 'm_desirEnfants'],
    plus: ['m_accepteDivorce', 'm_refuseDivorce', 'm_accepteVeuf', 'm_refuseVeuf', 'm_accepteEnfants', 'm_accepteUnEnfant', 'm_acceptePlusieursEnfants'] },
  { titre: 'Secteur et origines', aide: 'Où la personne vit, d’où elle vient, où elle cherche.', voir: ['village', 'origine', 'secteur'],
    plus: ['m_mobiliteGeographique', 'm_paysRechercheDetail', 'm_regionRechercheDetail', 'm_origineRechercheTags', 'm_kabyleUniquement'] },
  { titre: 'Valeurs et religion', aide: 'Seul le choix de la religion peut être bloquant.', voir: ['religion', 'pratique', 'religion_recherche', 'pratique_recherche'],
    plus: ['m_religionAutre', 'm_fermeDifferencePratique', 'm_religionsAcceptees', 'm_rechercheFemmeHidjabiste'] },
  { titre: 'Études et métier', aide: '', voir: ['etudes', 'metier', 'm_etudesRecherche'], plus: ['m_tailleCm', 'm_situationAdministrative', 'm_proprietaire'] },
  { titre: 'Hygiène de vie', aide: '', voir: ['m_sport', 'm_fumeur', 'm_alcool', 'm_chemma'],
    plus: ['m_mobiliteGeographique', 'm_belleFamille', 'm_gestionEmotionnelle', 'm_rapportReseaux', 'm_impressionEchange'] },
  { titre: 'Son caractère', aide: 'Comment la personne se décrit.', voir: ['caracteristiques'] },
  { titre: 'Ce qu’elle ou il cherche', aide: 'Le matching s’en sert pour écarter ce qui ne convient pas.', voir: ['age_min', 'age_max'],
    plus: ['m_caracteristiquesRecherche', 'm_tailleMinRechercheCm', 'm_sportRecherche', 'm_fumeurRecherche', 'm_alcoolRecherche', 'm_chemmaRecherche'] },
  { titre: 'Exigences absolues', aide: 'Rien de coché : ce sont des préférences souples. Coché : c’est bloquant.', voir: ['m_hardPreferences'] },
  { titre: 'Son annonce', aide: 'Pas de prénom, de photo ni de contact : les numéros, liens et emails sont masqués automatiquement. Sans « Afficher », l’annonce reste invisible jusqu’à la confirmation de la personne.', voir: ['profil', 'recherche', 'publier'], fin: true },
];
// Doublon : « Études » (liste complète) remplace « Niveau d'étude ». Un champ absent n'est pas envoyé.
const RETIRES = ['m_niveauEtudeCategorie'];
// Libellés trompeurs : la logique ne change pas, seul le texte affiché change.
const LIBELLES = { m_caracteristiquesRecherche: 'Caractère recherché chez l’autre', m_hardPreferences: 'Ce qui est bloquant' };

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };

export function etapesFiche(form) {
  if (!form || form.dataset.etapes) return null;
  form.dataset.etapes = '1';
  const bloc = (nom) => {
    const champ = form.querySelector(`[name="${CSS.escape(nom)}"]`);
    if (!champ) return null;
    return champ.closest('fieldset') || champ.closest('label') || champ.closest('.cp-cases');
  };
  for (const nom of RETIRES) bloc(nom)?.remove();
  for (const [nom, texte] of Object.entries(LIBELLES)) {
    const b = bloc(nom); if (!b) continue;
    const leg = b.querySelector('legend');
    if (leg) leg.textContent = texte;
    else if (b.matches('.cp-cases')) b.before(el('p', 'fe-sous-titre', texte));
    else if (b.firstChild?.nodeType === 3) b.firstChild.textContent = texte;
  }
  const submit = form.querySelector('[type="submit"]'), statut = form.querySelector('[data-fiche-statut]');
  const tete = el('div', 'fe-tete', '<div class="fe-barre"><span></span></div><p class="fe-compte" aria-live="polite"></p><div class="fe-pastilles" role="tablist" aria-label="Les cartes du profil"></div>');
  const cartes = el('div', 'fe-cartes');
  const pris = new Set();
  const sections = ETAPES.map((e, i) => {
    const s = el('section', 'fe-carte', `<h2 tabindex="-1">${e.titre}</h2>${e.aide ? `<p class="aide">${e.aide}</p>` : ''}`);
    s.dataset.etape = i; s.hidden = i > 0;
    const grille = el('div', 'fe-champs');
    for (const n of e.voir) { const b = bloc(n); if (b && !pris.has(b)) { pris.add(b); grille.append(b); } }
    s.append(grille);
    const plus = (e.plus || []).map(bloc).filter((b) => b && !pris.has(b));
    if (plus.length) {
      const d = el('details', 'fe-plus', '<summary>Plus de précisions · facultatif</summary>'), g = el('div', 'fe-champs');
      plus.forEach((b) => { pris.add(b); g.append(b); }); d.append(g); s.append(d);
    }
    return s;
  });
  // Un champ non prévu ci-dessus n'est jamais perdu : il rejoint « Plus de précisions » de l'avant-dernière carte.
  const orphelins = [...form.elements].filter((c) => c.name && !c.closest('.fe-carte') && c !== submit && !['m_niveauEtudeCategorie'].includes(c.name))
    .map((c) => c.closest('fieldset') || c.closest('label') || c.closest('.cp-cases') || c).filter((b, k, t) => t.indexOf(b) === k && !pris.has(b));
  if (orphelins.length) {
    const cible = sections[ETAPES.length - 2], d = el('details', 'fe-plus', '<summary>Autres précisions · facultatif</summary>'), g = el('div', 'fe-champs');
    orphelins.forEach((b) => g.append(b)); d.append(g); cible.append(d);
  }
  const nav = el('div', 'fe-nav', '<button type="button" class="btn btn-line" data-fe-prec>← Précédent</button><button type="button" class="btn btn-ink" data-fe-suiv>Suivant →</button>');
  nav.append(submit);
  // L'ancien contenu (titres « … (suite) », blocs vides) est retiré ; les champs sont déjà dans les cartes.
  [...form.children].forEach((c) => { if (c !== statut) c.remove(); });
  sections.forEach((s) => cartes.append(s));
  form.prepend(tete, cartes, nav);
  if (statut) form.append(statut);

  const pastilles = tete.querySelector('.fe-pastilles');
  pastilles.innerHTML = ETAPES.map((e, i) => `<button type="button" role="tab" data-fe-aller="${i}">${i + 1}. ${e.titre}</button>`).join('');
  let i = 0;
  const valide = (k) => {
    const invalide = [...sections[k].querySelectorAll('input,select,textarea')].find((c) => !c.checkValidity());
    if (invalide) { invalide.reportValidity(); return false; }
    return true;
  };
  const montrer = (k, focus = true) => {
    i = Math.max(0, Math.min(ETAPES.length - 1, k));
    sections.forEach((s, n) => { s.hidden = n !== i; });
    tete.querySelector('.fe-barre span').style.width = `${Math.round(((i + 1) / ETAPES.length) * 100)}%`;
    tete.querySelector('.fe-compte').textContent = `Carte ${i + 1} sur ${ETAPES.length} · ${ETAPES[i].titre}`;
    pastilles.querySelectorAll('button').forEach((b, n) => { b.setAttribute('aria-selected', String(n === i)); b.classList.toggle('fe-faite', n < i); });
    nav.querySelector('[data-fe-prec]').hidden = i === 0;
    nav.querySelector('[data-fe-suiv]').hidden = Boolean(ETAPES[i].fin);
    submit.hidden = !ETAPES[i].fin;
    if (focus) { sections[i].querySelector('h2')?.focus({ preventScroll: true }); try { tete.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* */ } }
  };
  nav.querySelector('[data-fe-prec]').addEventListener('click', () => montrer(i - 1));
  nav.querySelector('[data-fe-suiv]').addEventListener('click', () => { if (valide(i)) montrer(i + 1); });
  pastilles.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fe-aller]'); if (!b) return;
    const k = Number(b.dataset.feAller);
    // On peut revenir en arrière librement ; pour avancer, la carte 1 (genre, âge, pays) doit être remplie.
    if (k > 0 && !valide(0)) return montrer(0);
    montrer(k);
  });
  // Entrée dans un champ : on passe à la carte suivante au lieu d'enregistrer trop tôt.
  form.addEventListener('submit', (e) => {
    if (ETAPES[i].fin) {
      // Un champ obligatoire d'une autre carte (genre, âge, pays) : on y retourne pour le montrer.
      const k = sections.findIndex((s) => [...s.querySelectorAll('input,select,textarea')].some((c) => !c.checkValidity()));
      if (k >= 0 && k !== i) { e.preventDefault(); e.stopImmediatePropagation(); montrer(k); valide(k); }
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    if (valide(i)) montrer(i + 1);
  }, true);
  form.addEventListener('reset', () => setTimeout(() => montrer(0, false)));
  montrer(0, false);
  return { montrer, nombre: ETAPES.length };
}
