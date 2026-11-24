// « Compléter pour le matching » : Lamia ajoute elle-même toutes les infos que le moteur utilise, à la place de la personne.
import { O, lib } from '/assets/matching-options.mjs';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

// Même découpage que le formulaire de l'outil (Quick Pair Pro) : 1 Identité, 2 Situation de vie, 3 Couple et cadre pratique,
// 4 Religion et repères culturels, 5 Conditions du partenaire recherché, 6 Exigences absolues.
// c = champ (liste de choix ou texte), l = cases à cocher multiples, b = case simple, h = exigences absolues.
const OUINON = ['Oui', 'Non'];
const HARD = { age: 'Âge', location: 'Localisation', origin: 'Origine', height: 'Taille', money: 'Travail et argent' };
const ETAPES = [
  ['1 · Identité', 'Les informations de base pour retrouver et qualifier la personne.', [
    ['c', 'ville', 'Résidence actuelle', 'texte', true], ['c', 'pays', 'Pays de résidence', 'pays', true], ['c', 'villageOrigine', 'Village d’origine (critère important)', 'texte'],
    ['l', 'origineTags', 'Communauté amazighe / origine', 'origine']]],
  ['2 · Situation de vie', 'Les éléments concrets qui influencent le projet de mariage.', [
    ['c', 'situation', 'Situation matrimoniale', 'situation', true], ['c', 'enfants', 'Enfants', 'enfants', true], ['c', 'desirEnfants', 'Désir d’enfant', 'desirEnfants'],
    ['c', 'niveauEtudeCategorie', 'Niveau d’étude', 'etudeCategorie'], ['c', 'profession', 'Profession', 'texte'], ['c', 'tailleCm', 'Taille du profil (cm)', 'nombre'],
    ['c', 'situationAdministrative', 'Situation administrative', 'situationAdministrative'], ['c', 'proprietaire', 'Propriétaire', 'proprietaire']]],
  ['3 · Couple et cadre pratique', 'Famille, mobilité, argent et hygiène de vie.', [
    ['c', 'mobiliteGeographique', 'Mobilité géographique', 'mobilite'], ['c', 'belleFamille', 'Belle-famille', 'belleFamille'], ['c', 'impressionEchange', 'Impression d’échange', 'impressionEchange'],
    ['c', 'sport', 'Sport', 'sport'], ['c', 'fumeur', 'Fumeur', 'fumeur'], ['c', 'alcool', 'Alcool', 'alcool'], ['c', 'chemma', 'Chemma', 'chemma'],
    ['l', 'gestionEmotionnelle', 'Gestion d’un désaccord', 'gestionEmotionnelle'], ['l', 'rapportReseaux', 'Place des réseaux sociaux', 'rapportReseaux']]],
  ['4 · Religion et repères culturels', 'Religion, tradition, famille et caractère utiles au matching.', [
    ['c', 'religion', 'Religion', 'religion', true], ['c', 'religionAutre', 'Précise la religion', 'texte'], ['c', 'pratique', 'Pratique religieuse', 'pratique', true],
    ['c', 'fermeDifferencePratique', 'Fermé(e) à une différence de pratique', OUINON], ['l', 'religionsAcceptees', 'Religions acceptées chez l’autre (bloquant)', 'religion'],
    ['l', 'caracteristiques', 'Caractère', 'caracteristiques']]],
  ['5 · Conditions du partenaire recherché', 'Ce que la personne attend chez l’autre.', [
    ['c', 'age_min', 'Âge min', 'nombre', true], ['c', 'age_max', 'Âge max', 'nombre', true], ['c', 'zoneGeo', 'Zone recherchée', 'zoneGeo', true],
    ['c', 'paysRechercheDetail', 'Précision pays recherché', 'texte'], ['c', 'regionRechercheDetail', 'Précision région recherchée', 'texte'],
    ['c', 'religionRecherche', 'Religion recherchée', 'religionRecherche'], ['c', 'pratiqueRecherche', 'Pratique recherchée', 'pratiqueRecherche'], ['c', 'etudesRecherche', 'Niveau d’instruction minimum recherché', 'etudesRecherche'],
    ['c', 'rechercheFemmeHidjabiste', 'Hidjab chez la femme recherchée', 'hidjab'],
    ['c', 'sportRecherche', 'Sport recherché', 'sport'], ['c', 'fumeurRecherche', 'Fumeur recherché', 'fumeur'], ['c', 'alcoolRecherche', 'Alcool recherché', 'alcool'], ['c', 'chemmaRecherche', 'Chemma recherchée', 'chemma'],
    ['l', 'origineRechercheTags', 'Origines / communautés acceptées', 'origine'],
    ['b', 'kabyleUniquement', 'Kabyle uniquement'], ['b', 'accepteDivorce', 'Accepte divorcé(e)'], ['b', 'refuseDivorce', 'Refuse divorcé(e)'], ['b', 'accepteVeuf', 'Accepte veuf/veuve'], ['b', 'refuseVeuf', 'Refuse veuf/veuve'],
    ['b', 'accepteEnfants', 'Accepte enfants'], ['b', 'accepteUnEnfant', 'Accepte 1 enfant'], ['b', 'acceptePlusieursEnfants', 'Accepte plusieurs enfants'],
    ['c', 'tailleMinRechercheCm', 'Exigence physique : taille minimum', 'nombre'], ['l', 'caracteristiquesRecherche', 'Rédhibitoire / points bloquants', 'caracteristiques']]],
  ['6 · Exigences absolues du profil', 'Sans sélection, ces critères restent des préférences souples qui influencent le score. Coché = bloquant (Âge : 0 an de marge ; Localisation : secteur strict).', [
    ['h', 'hardPreferences', 'Exigences absolues']]],
];
const ITEMS = ETAPES.flatMap((e) => e[2]);
const CHAMPS_TOP = new Set(['ville', 'pays', 'age_min', 'age_max']);
// Une fiche de l'outil garde ces infos dans des colonnes ; le reste va dans « matching » (privé).
const valeursAnnonce = (a) => ({ ...(a.matching || {}), ville: a.ville, pays: a.pays, age_min: a.age_min, age_max: a.age_max, situation: a.matching?.situation || a.situation });
const valeursFiche = (f) => ({ ...(f.matching || {}), pseudo: f.pseudo, lien_reseau: f.lien_reseau, ville: f.ville, pays: f.pays, villageOrigine: f.village, profession: f.metier, situation: f.situation, enfants: f.enfants, religion: f.religion, pratique: f.pratique, age_min: f.age_min, age_max: f.age_max,
  zoneGeo: f.secteur, religionRecherche: f.religion_recherche, pratiqueRecherche: f.pratique_recherche, origineTags: f.origine || [], caracteristiques: f.caracteristiques || [] });
const vide = (v) => v == null || v === '' || v === false || (Array.isArray(v) && !v.length);
const liste_de = (type) => (Array.isArray(type) ? type : O[type] || []);

function rendre(it, v, pre = '') {
  const [genre, n, titre, type, cle] = it, nom = pre + n;
  if (genre === 'b') return `<label class="cp-case"><input type="checkbox" name="${nom}"${v[n] ? ' checked' : ''}> ${esc(titre)}</label>`;
  if (genre === 'h') return `<div class="cp-cases">${Object.entries(HARD).map(([k, t]) => `<label><input type="checkbox" name="${nom}" value="${k}"${(v[n] || []).includes(k) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>`;
  if (genre === 'l') return `<fieldset><legend>${esc(titre)}</legend><div class="cp-cases">${liste_de(type).map((x) => `<label><input type="checkbox" name="${nom}" value="${esc(x)}"${(Array.isArray(v[n]) ? v[n] : []).includes(x) ? ' checked' : ''}> ${esc(lib(x))}</label>`).join('')}</div></fieldset>`;
  const manque = cle && vide(v[n]);
  const entete = `<label class="${manque ? 'cp-manque' : ''}">${esc(titre)}${manque ? ' <em>à compléter</em>' : ''}`;
  if (type === 'texte') return `${entete}<input name="${nom}" maxlength="80" value="${esc(v[n] ?? '')}"></label>`;
  if (type === 'nombre') return `${entete}<input name="${nom}" type="number" min="0" max="250" value="${esc(v[n] ?? '')}"></label>`;
  return `${entete}<select name="${nom}"><option value="">— non renseigné —</option>${liste_de(type).map((x) => `<option value="${esc(x)}"${v[n] === x ? ' selected' : ''}>${esc(lib(x))}</option>`).join('')}</select></label>`;
}
// Une étape : champs, puis cases à cocher groupées.
function etape(titre, aide, items, v, pre, garde) {
  const ok = items.filter((it) => garde(it[1]));
  if (!ok.length) return '';
  const champs = ok.filter((i) => i[0] === 'c'), listes = ok.filter((i) => i[0] === 'l'), autres = ok.filter((i) => i[0] === 'b' || i[0] === 'h');
  return `<h4>${esc(titre)}</h4>${aide ? `<p class="aide">${esc(aide)}</p>` : ''}${champs.length ? `<div class="champs">${champs.map((i) => rendre(i, v, pre)).join('')}</div>` : ''}${listes.map((i) => rendre(i, v, pre)).join('')}${autres.length ? `<div class="cp-cases">${autres.map((i) => rendre(i, v, pre)).join('')}</div>` : ''}`;
}

function formulaire(ref, v, fiche) {
  const manquants = ITEMS.filter((c) => c[0] === 'c' && c[4] && vide(v[c[1]])).map((c) => c[2]);
  return `<details class="tdb-repli cp" ${manquants.length ? 'open' : ''}><summary>${fiche ? 'Fiche' : 'Profil'} n° ${esc(ref)} · compléter pour le matching${manquants.length ? ` <span class="cp-alerte">${manquants.length} info${manquants.length > 1 ? 's' : ''} manquante${manquants.length > 1 ? 's' : ''}</span>` : ''}</summary>
    <form class="reglages" data-completer data-ref="${esc(ref)}" data-fiche="${fiche ? 1 : 0}">
      ${manquants.length ? `<p class="cp-aide"><b>Manquant :</b> ${esc(manquants.join(', '))}. Sans ces infos, l’outil prend une valeur par défaut (« pas de contrainte ») et peut proposer un mauvais match.</p>` : ''}
      ${fiche ? `<h4>Privé (jamais dans l’annonce)</h4><div class="champs"><label>Pseudo<input name="pseudo" maxlength="40" value="${esc(v.pseudo ?? '')}"></label><label>Lien réseau (TikTok, Instagram, Facebook)<input name="lien_reseau" maxlength="200" value="${esc(v.lien_reseau ?? '')}"></label></div>` : ''}
      ${ETAPES.map((e) => etape(e[0], e[1], e[2], v, '', () => true)).join('')}
      ${fiche ? '' : '<div class="champs"><label>Date de naissance (seulement si manquante ou fausse)<input name="birth_date" type="date"></label></div>'}
      <p class="actions"><button class="btn btn-ink" type="submit">Enregistrer</button> <span class="aide" data-completer-statut role="status"></span></p>
    </form></details>`;
}

// Les cartes d'un détail de profil : une par annonce, et une par fiche qui n'est liée à aucune annonce.
export function cartesCompleter(d) {
  const annonces = d.annonces || [], liees = new Set(annonces.map((a) => a.fiche_ref).filter(Boolean));
  const fiches = (d.fiches || []).filter((f) => !annonces.length && !liees.has(f.ref));
  const html = [...annonces.map((a) => formulaire(a.ref, valeursAnnonce(a), false)), ...fiches.map((f) => formulaire(f.ref, valeursFiche(f), true))].join('');
  return html ? `<div class="tdb-carte"><h3 style="margin-top:0">Compléter pour le matching</h3><p class="aide">Même découpage que ton outil. Ajoute les infos qui manquent : le matching en direct s’en sert tout de suite.</p>${html}</div>` : '';
}

// Lecture d'un formulaire (préfixe « m_ » dans « Créer un profil »).
function lire(form, pre, garde) {
  const m = {}, top = {}, els = form.elements;
  for (const [g, n, , type] of ITEMS) {
    if (!garde(n)) continue;
    const nom = pre + n;
    let val;
    if (g === 'b') val = Boolean(els[nom]?.checked);
    else if (g === 'l' || g === 'h') val = [...form.querySelectorAll(`[name="${nom}"]:checked`)].map((x) => x.value);
    else if (els[nom]) val = els[nom].value; else continue;
    (CHAMPS_TOP.has(n) ? top : m)[n] = val;
  }
  return { m, top };
}

export function monterCompleter({ appel, recharger }) {
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-completer]'); if (!f) return;
    e.preventDefault();
    const st = f.querySelector('[data-completer-statut]'), btn = f.querySelector('[type="submit"]'), fiche = f.dataset.fiche === '1';
    const { m, top } = lire(f, '', () => true);
    const corps = { action: 'annonce_admin_completer', ref: Number(f.dataset.ref), matching: m, ...top };
    if (!fiche && f.elements.birth_date?.value) corps.birth_date = f.elements.birth_date.value;
    if (fiche) { corps.pseudo = f.elements.pseudo.value; corps.lien_reseau = f.elements.lien_reseau.value; }
    btn.disabled = true; st.textContent = 'Enregistrement…';
    try { await appel(corps); st.textContent = 'Enregistré ✓'; recharger?.(Number(f.dataset.ref)); }
    catch (err) { st.textContent = ({ ages_recherches: 'L’âge minimum dépasse l’âge maximum.', missing_lieu: 'Choisis un pays de la liste.', invalid_birth_date: 'Date de naissance invalide (18 ans minimum).' })[err.code] || 'L’enregistrement n’a pas abouti. Réessaie.'; }
    finally { btn.disabled = false; }
  });
}

// « Créer un profil » : ce qui n'est pas déjà dans le formulaire de fiche, découpé comme dans l'outil.
const DEJA = new Set(['ville', 'pays', 'villageOrigine', 'profession', 'situation', 'enfants', 'religion', 'pratique', 'age_min', 'age_max', 'zoneGeo', 'religionRecherche', 'pratiqueRecherche', 'origineTags', 'caracteristiques']);
export function champsCreation(partie) {
  const garde = (n) => !DEJA.has(n), v = {};
  const sel = partie === 'cherche' ? ETAPES.slice(4) : ETAPES.slice(1, 4);
  const titre = (t) => (/^[1245] ·/.test(t) ? `${t.replace(/ ·.*/, ' ·')} ${{ 2: 'Situation de vie (suite)', 4: 'Religion (suite)', 5: 'Autres conditions recherchées', 1: 'Identité (suite)' }[t[0]]}` : t);
  return sel.map((e) => etape(titre(e[0]), partie === 'cherche' && e[0][0] === '5' ? '' : e[1], e[2], v, 'm_', garde)).join('');
}
export function lireCreation(form) { return lire(form, 'm_', (n) => !DEJA.has(n)).m; }
