// « Compléter pour le matching » : Lamia ajoute elle-même toutes les infos que le moteur utilise, à la place de la personne.
import { O, lib } from '/assets/matching-options.mjs';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

// [nom, libellé, liste d'options | 'texte' | 'nombre', indispensable au matching ?]
const LUI = [
  ['ville', 'Ville', 'texte', true], ['pays', 'Pays', 'pays', true], ['villageOrigine', 'Village ou ville d’origine', 'texte'], ['profession', 'Métier', 'texte'],
  ['situation', 'Situation', 'situation', true], ['enfants', 'Enfants', 'enfants', true], ['desirEnfants', 'Désir d’enfants', 'desirEnfants'], ['niveauEtudeCategorie', 'Études', 'etudeCategorie'],
  ['religion', 'Religion', 'religion', true], ['pratique', 'Pratique', 'pratique', true], ['mobiliteGeographique', 'Mobilité', 'mobilite'],
  ['fumeur', 'Tabac', 'fumeur'], ['sport', 'Sport', 'sport'], ['alcool', 'Alcool', 'alcool'], ['chemma', 'Chemma', 'chemma'], ['tailleCm', 'Taille (cm)', 'nombre'],
  ['situationAdministrative', 'Situation administrative', 'situationAdministrative'], ['proprietaire', 'Propriétaire', 'proprietaire'], ['belleFamille', 'Belle-famille', 'belleFamille'], ['impressionEchange', 'Impression d’échange', 'impressionEchange'],
];
const LUI_LISTES = [['origineTags', 'Origine', 'origine'], ['caracteristiques', 'Caractère', 'caracteristiques'], ['gestionEmotionnelle', 'Gestion des émotions', 'gestionEmotionnelle'], ['rapportReseaux', 'Rapport aux réseaux', 'rapportReseaux']];
const CHERCHE = [
  ['age_min', 'Âge recherché, de', 'nombre', true], ['age_max', 'à', 'nombre', true], ['zoneGeo', 'Secteur recherché', 'zoneGeo', true],
  ['religionRecherche', 'Religion recherchée', 'religionRecherche'], ['pratiqueRecherche', 'Pratique recherchée', 'pratiqueRecherche'], ['etudesRecherche', 'Études recherchées', 'etudesRecherche'],
  ['fumeurRecherche', 'Tabac recherché', 'fumeur'], ['alcoolRecherche', 'Alcool recherché', 'alcool'], ['sportRecherche', 'Sport recherché', 'sport'], ['chemmaRecherche', 'Chemma recherchée', 'chemma'],
  ['tailleMinRechercheCm', 'Taille minimum (cm)', 'nombre'], ['rechercheFemmeHidjabiste', 'Hidjab', 'hidjab'],
];
const CHERCHE_LISTES = [['origineRechercheTags', 'Origine recherchée', 'origine'], ['caracteristiquesRecherche', 'Caractère recherché', 'caracteristiques']];
const CASES = [['kabyleUniquement', 'Kabyle uniquement'], ['accepteDivorce', 'Accepte une personne divorcée'], ['accepteVeuf', 'Accepte une personne veuve'], ['accepteEnfants', 'Accepte des enfants'], ['acceptePlusieursEnfants', 'Accepte plusieurs enfants']];
// Une fiche de l'outil n'a que ces colonnes : le reste demande un « ok base » (nouvelle colonne).
const FICHE_ANCIEN = new Set(['ville', 'pays', 'villageOrigine', 'profession', 'situation', 'enfants', 'religion', 'pratique', 'age_min', 'age_max', 'zoneGeo', 'religionRecherche', 'pratiqueRecherche', 'origineTags', 'caracteristiques']);

const valeursAnnonce = (a) => ({ ...(a.matching || {}), ville: a.ville, pays: a.pays, age_min: a.age_min, age_max: a.age_max, situation: a.matching?.situation || a.situation });
const valeursFiche = (f) => ({ ...(f.matching || {}), pseudo: f.pseudo, lien_reseau: f.lien_reseau, ville: f.ville, pays: f.pays, villageOrigine: f.village, profession: f.metier, situation: f.situation, enfants: f.enfants, religion: f.religion, pratique: f.pratique, age_min: f.age_min, age_max: f.age_max,
  zoneGeo: f.secteur, religionRecherche: f.religion_recherche, pratiqueRecherche: f.pratique_recherche, origineTags: f.origine || [], caracteristiques: f.caracteristiques || [] });
const vide = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

function champ([n, titre, type, cle], v, ouvrable) {
  if (!ouvrable(n)) return '';
  const manque = cle && vide(v[n]);
  const entete = `<label class="${manque ? 'cp-manque' : ''}">${esc(titre)}${manque ? ' <em>à compléter</em>' : ''}`;
  if (type === 'texte') return `${entete}<input name="${n}" maxlength="80" value="${esc(v[n] ?? '')}"></label>`;
  if (type === 'nombre') return `${entete}<input name="${n}" type="number" min="0" max="250" value="${esc(v[n] ?? '')}"></label>`;
  const opts = (O[type] || []).map((x) => `<option value="${esc(x)}"${v[n] === x ? ' selected' : ''}>${esc(lib(x))}</option>`).join('');
  return `${entete}<select name="${n}"><option value="">— non renseigné —</option>${opts}</select></label>`;
}
function liste([n, titre, type], v, ouvrable) {
  if (!ouvrable(n)) return '';
  const cochees = new Set(Array.isArray(v[n]) ? v[n] : []);
  return `<fieldset><legend>${esc(titre)}</legend><div class="cp-cases">${(O[type] || []).map((x) => `<label><input type="checkbox" name="${n}" value="${esc(x)}"${cochees.has(x) ? ' checked' : ''}> ${esc(lib(x))}</label>`).join('')}</div></fieldset>`;
}

function formulaire(ref, v, fiche) {
  const ok = () => true;
  const tous = [...LUI, ...CHERCHE].filter((c) => ok(c[0]));
  const manquants = tous.filter((c) => c[3] && vide(v[c[0]])).map((c) => c[1]);
  return `<details class="tdb-repli cp" ${manquants.length ? 'open' : ''}><summary>${fiche ? 'Fiche' : 'Profil'} n° ${esc(ref)} · compléter pour le matching${manquants.length ? ` <span class="cp-alerte">${manquants.length} info${manquants.length > 1 ? 's' : ''} manquante${manquants.length > 1 ? 's' : ''}</span>` : ''}</summary>
    <form class="reglages" data-completer data-ref="${esc(ref)}" data-fiche="${fiche ? 1 : 0}">
      ${manquants.length ? `<p class="cp-aide"><b>Manquant :</b> ${esc(manquants.join(', '))}. Sans ces infos, l’outil prend une valeur par défaut (« pas de contrainte ») et peut proposer un mauvais match.</p>` : ''}
      ${fiche ? `<h4>Privé (jamais dans l’annonce)</h4><div class="champs"><label>Pseudo<input name="pseudo" maxlength="40" value="${esc(v.pseudo ?? '')}"></label><label>Lien réseau (TikTok, Instagram, Facebook)<input name="lien_reseau" maxlength="200" value="${esc(v.lien_reseau ?? '')}"></label></div>` : ''}
      <h4>Elle/il</h4><div class="champs">${LUI.map((c) => champ(c, v, ok)).join('')}</div>${LUI_LISTES.map((c) => liste(c, v, ok)).join('')}
      <h4>Ce qu’elle/il cherche</h4><div class="champs">${CHERCHE.map((c) => champ(c, v, ok)).join('')}</div>${CHERCHE_LISTES.map((c) => liste(c, v, ok)).join('')}
      ${`<div class="cp-cases">${CASES.map(([n, t]) => `<label><input type="checkbox" name="${n}"${v[n] ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>
      ${fiche ? '' : '<div class="champs"><label>Date de naissance (seulement si manquante ou fausse)<input name="birth_date" type="date"></label></div>'}`}
      <p class="actions"><button class="btn btn-ink" type="submit">Enregistrer</button> <span class="aide" data-completer-statut role="status"></span></p>
    </form></details>`;
}

// Les cartes d'un détail de profil : une par annonce, et une par fiche qui n'est liée à aucune annonce.
export function cartesCompleter(d) {
  const annonces = d.annonces || [], liees = new Set(annonces.map((a) => a.fiche_ref).filter(Boolean));
  const fiches = (d.fiches || []).filter((f) => !annonces.length && !liees.has(f.ref));
  const html = [...annonces.map((a) => formulaire(a.ref, valeursAnnonce(a), false)), ...fiches.map((f) => formulaire(f.ref, valeursFiche(f), true))].join('');
  return html ? `<div class="tdb-carte"><h3 style="margin-top:0">Compléter pour le matching</h3><p class="aide">Ajoute toi-même les infos qui manquent : le matching en direct s’en sert tout de suite.</p>${html}</div>` : '';
}

export function monterCompleter({ appel, recharger }) {
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-completer]'); if (!f) return;
    e.preventDefault();
    const st = f.querySelector('[data-completer-statut]'), btn = f.querySelector('[type="submit"]'), fiche = f.dataset.fiche === '1';
    const els = f.elements, matching = {}, corps = { action: 'annonce_admin_completer', ref: Number(f.dataset.ref), matching };
    for (const [n, , type] of [...LUI, ...CHERCHE]) {
      if (!els[n]) continue;
      const val = els[n].value;
      if (['ville', 'pays', 'age_min', 'age_max'].includes(n)) corps[n] = val; else matching[n] = type === 'nombre' ? val : val;
    }
    for (const [n] of [...LUI_LISTES, ...CHERCHE_LISTES]) if (els[n]) matching[n] = [...f.querySelectorAll(`[name="${n}"]:checked`)].map((x) => x.value);
    for (const [n] of CASES) if (els[n]) matching[n] = els[n].checked;
    if (!fiche && els.birth_date?.value) corps.birth_date = els.birth_date.value;
    if (fiche) { corps.pseudo = els.pseudo.value; corps.lien_reseau = els.lien_reseau.value; }
    btn.disabled = true; st.textContent = 'Enregistrement…';
    try { await appel(corps); st.textContent = 'Enregistré ✓'; recharger?.(Number(f.dataset.ref)); }
    catch (err) { st.textContent = ({ ages_recherches: 'L’âge minimum dépasse l’âge maximum.', missing_lieu: 'Choisis un pays de la liste.', invalid_birth_date: 'Date de naissance invalide (18 ans minimum).' })[err.code] || 'L’enregistrement n’a pas abouti. Réessaie.'; }
    finally { btn.disabled = false; }
  });
}

// Pour « Créer un profil » : les champs de matching qui ne sont pas déjà dans le formulaire de fiche.
const DEJA = new Set(['ville', 'pays', 'villageOrigine', 'profession', 'situation', 'enfants', 'religion', 'pratique', 'age_min', 'age_max', 'zoneGeo', 'religionRecherche', 'pratiqueRecherche', 'origineTags', 'caracteristiques']);
export function champsCreation(partie) {
  const ok = (n) => !DEJA.has(n), v = {};
  const ch = (l) => l.filter((c) => ok(c[0])).map((c) => champ([`m_${c[0]}`, c[1], c[2], false], v, () => true)).join('');
  const li = (l) => l.filter((c) => ok(c[0])).map((c) => liste([`m_${c[0]}`, c[1], c[2]], v, () => true)).join('');
  if (partie === 'cherche') return `<div class="fiche-admin-champs">${ch(CHERCHE)}</div>${li(CHERCHE_LISTES)}<div class="cp-cases">${CASES.map(([n, t]) => `<label><input type="checkbox" name="m_${n}"> ${esc(t)}</label>`).join('')}</div>`;
  return `<h3>Plus d’infos sur elle/lui <small>(facultatif)</small></h3><div class="fiche-admin-champs">${ch(LUI)}</div>${li(LUI_LISTES)}`;
}
export function lireCreation(form) {
  const m = {}, els = form.elements;
  for (const c of [...LUI, ...CHERCHE]) if (!DEJA.has(c[0]) && els[`m_${c[0]}`]) m[c[0]] = els[`m_${c[0]}`].value;
  for (const [n] of [...LUI_LISTES, ...CHERCHE_LISTES]) if (!DEJA.has(n)) m[n] = [...form.querySelectorAll(`[name="m_${n}"]:checked`)].map((x) => x.value);
  for (const [n] of CASES) if (els[`m_${n}`]) m[n] = els[`m_${n}`].checked;
  return m;
}
