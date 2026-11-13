// Listes de choix des annonces, identiques à celles de l'outil local de matching de Lamia
// (F:\quick-pair-pro, src/lib/store.ts) : les annonces s'importent ensuite dans l'outil sans rien retaper.
// Partagé : serveur (validation), formulaire du site (copié dans /assets) et export vers l'outil.

export const O = {
  sexe: ['Femme', 'Homme'],
  pays: ['France', 'Algerie', 'Maroc', 'Tunisie', 'Libye', 'Mauritanie', 'Mali', 'Niger', 'Egypte', 'Belgique', 'Suisse', 'Luxembourg', 'Allemagne', 'Pays-Bas', 'Royaume-Uni', 'Irlande', 'Espagne', 'Portugal', 'Italie', 'Autriche', 'Suede', 'Norvege', 'Danemark', 'Finlande', 'Pologne', 'Europe', 'Canada', 'USA', 'Mexique', 'Bresil', 'Amerique', 'Emirats arabes unis', 'Qatar', 'Arabie saoudite', 'Turquie', 'Australie', 'Autre'],
  origine: ['Kabyle (Algerie)', 'Chaoui (Algerie)', 'Touareg (Algerie / Mali / Niger / Libye / Burkina Faso)', 'Mozabite (Algerie)', 'Chenoui (Algerie)', 'Zenete (Algerie)', 'Chleuh / Soussi (Maroc)', 'Rifain (Maroc)', 'Amazigh du Moyen Atlas (Maroc)', 'Amazigh de Tunisie', 'Nefoussi (Libye)', 'Siwi (Egypte)', 'Autre Amazigh / Berbere', 'Arabophone', 'Europeen', 'Autre origine'],
  situation: ['Jamais marie(e)', 'Marie(e) sur papier uniquement', 'Divorce(e)', 'Separe(e)', 'Veuf/Veuve'],
  enfants: ['Non', 'Oui'],
  desirEnfants: ['Oui, important', 'Oui, mais a discuter', 'Peut-etre', 'Non', 'Pas important'],
  etudeCategorie: ['Primaire', 'College', 'Lycee', 'Universitaire'],
  etudeDetail: {
    Primaire: ['Primaire non termine', 'Primaire termine'],
    College: ['College non termine', 'College termine', 'Brevet'],
    Lycee: ['Lycee non termine', 'CAP', 'BEP', 'Bac professionnel', 'Bac technologique', 'Bac general'],
    Universitaire: ['Bac+1', 'Bac+2', 'Bac+3', 'Bac+4', 'Bac+5', 'Doctorat', 'Autre universitaire'],
  },
  etudesPaysObtention: ['Algerie', 'Pays de residence'],
  religion: ['Islam', 'Chretienne', 'Agnostique', 'Athee', 'Autre'],
  pratique: ['Pratiquant(e)', 'Pratique moderee', 'Non pratiquant(e)'],
  caracteristiques: ['Traditionnel(le)', 'Moderne', 'Stable', 'Calme', 'Dynamique', 'Ambitieux(se)', 'Sportif(ve)', 'Mature', 'Communicatif(ve)', 'Famille', 'Responsable', 'Simple', 'Elegant(e)', 'Pudique', 'Cultive(e)', 'Drole', 'Patient(e)', 'Hidjabiste'],
  mobilite: ['Non', 'Oui - France', 'Oui - region', 'Oui - international', 'A discuter'],
  visionHomme: ['Homme: femme ne travaille pas', 'Homme: femme travaille pour son epanouissement', 'Homme: femme travaille pour aider', 'Homme: femme travaille en 50/50'],
  visionFemme: ['Femme: ne veut pas travailler', 'Femme: veut travailler obligatoirement', 'Femme: veut travailler si necessaire', 'Femme: veut travailler pour mon epanouissement'],
  fumeur: ['Fumeur: non', 'Fumeur: occasionnel', 'Fumeur: oui'],
  sport: ['Sport: oui', 'Sport: occasionnel', 'Sport: non'],
  alcool: ['Alcool: non', 'Alcool: occasionnel', 'Alcool: oui'],
  chemma: ['Chemma: non', 'Chemma: oui'],
  // Recherche
  zoneGeo: ['France', 'Algerie', 'Autre que Algerie', 'Maghreb', 'Maroc', 'Tunisie', 'Europe', 'Canada', 'USA', 'Amerique', 'Golfe', 'Autre', "N'importe ou"],
  religionRecherche: ['Pas important', 'Islam', 'Chretienne', 'Agnostique', 'Athee', 'Autre'],
  pratiqueRecherche: ['Pas important', 'Pratiquant(e)', 'Pratique moderee', 'Non pratiquant(e)'],
  etudesRecherche: ['Pas important', 'Bac', 'Bac+', 'Bac+5', 'Plus de Bac+5'],
  hidjab: ['Pas important', 'Oui', 'Non'],
};

// Libellés affichés sur le site (avec accents), la valeur envoyée reste celle de l'outil.
export const LIBELLE = {
  'Egypte': 'Égypte', 'Suede': 'Suède', 'Norvege': 'Norvège', 'Bresil': 'Brésil', 'Emirats arabes unis': 'Émirats arabes unis', 'Europe': 'Europe (autre pays)', 'USA': 'États-Unis', 'Golfe': 'Pays du Golfe', 'Mozabite (Algerie)': 'Mozabite (Algérie)', 'Chenoui (Algerie)': 'Chenoui (Algérie)', 'Zenete (Algerie)': 'Zénète (Algérie)', 'Chleuh / Soussi (Maroc)': 'Chleuh / Soussi (Maroc)', 'Rifain (Maroc)': 'Rifain (Maroc)', 'Amazigh du Moyen Atlas (Maroc)': 'Amazigh du Moyen Atlas (Maroc)', 'Amazigh de Tunisie': 'Amazigh de Tunisie', 'Nefoussi (Libye)': 'Nefoussi (Libye)', 'Siwi (Egypte)': 'Siwi (Égypte)', 'Autre Amazigh / Berbere': 'Amazigh (autre)',
  'Algerie': 'Algérie', 'Amerique': 'Amérique', 'Autre que Algerie': 'Ailleurs qu’en Algérie', "N'importe ou": 'Peu importe',
  'Kabyle (Algerie)': 'Kabyle (Algérie)', 'Chaoui (Algerie)': 'Chaoui (Algérie)', 'Touareg (Algerie / Mali / Niger / Libye / Burkina Faso)': 'Touareg', 'Kabyle': 'Kabyle', 'Chaoui': 'Chaoui', 'Algerien(ne)': 'Algérien(ne)', 'Europeen': 'Européen(ne)', 'Autre origine': 'Autre origine',
  'Jamais marie(e)': 'Jamais marié(e)', 'Marie(e) sur papier uniquement': 'Marié(e) sur papier uniquement', 'Divorce(e)': 'Divorcé(e)', 'Separe(e)': 'Séparé(e)', 'Veuf/Veuve': 'Veuf / veuve',
  'Oui, mais a discuter': 'Oui, mais à discuter', 'Peut-etre': 'Peut-être',
  'College': 'Collège', 'Lycee': 'Lycée', 'Primaire non termine': 'Primaire non terminé', 'Primaire termine': 'Primaire terminé', 'College non termine': 'Collège non terminé', 'College termine': 'Collège terminé', 'Lycee non termine': 'Lycée non terminé', 'Bac general': 'Bac général',
  'Pays de residence': 'Mon pays de résidence', 'Chretienne': 'Chrétienne', 'Athee': 'Athée', 'Pratique moderee': 'Pratique modérée',
  'Traditionnel(le)': 'Traditionnel(le)', 'Ambitieux(se)': 'Ambitieux(se)', 'Sportif(ve)': 'Sportif(ve)', 'Communicatif(ve)': 'Communicatif(ve)', 'Elegant(e)': 'Élégant(e)', 'Cultive(e)': 'Cultivé(e)', 'Drole': 'Drôle', 'Patient(e)': 'Patient(e)',
  'Oui - France': 'Oui, en France', 'Oui - region': 'Oui, dans ma région', 'Oui - international': 'Oui, à l’international', 'A discuter': 'À discuter',
  'Homme: femme ne travaille pas': 'Je préfère que ma femme ne travaille pas', 'Homme: femme travaille pour son epanouissement': 'Ma femme travaille pour son épanouissement', 'Homme: femme travaille pour aider': 'Ma femme travaille pour aider le foyer', 'Homme: femme travaille en 50/50': 'On partage les charges à 50/50',
  'Femme: ne veut pas travailler': 'Je ne souhaite pas travailler', 'Femme: veut travailler obligatoirement': 'Je veux absolument travailler', 'Femme: veut travailler si necessaire': 'Je travaillerai si nécessaire', 'Femme: veut travailler pour mon epanouissement': 'Je travaille pour mon épanouissement',
  'Fumeur: non': 'Non-fumeur', 'Fumeur: occasionnel': 'Fumeur occasionnel', 'Fumeur: oui': 'Fumeur', 'Sport: oui': 'Sport régulier', 'Sport: occasionnel': 'Sport de temps en temps', 'Sport: non': 'Pas de sport', 'Alcool: non': 'Pas d’alcool', 'Alcool: occasionnel': 'Alcool occasionnel', 'Alcool: oui': 'Alcool', 'Chemma: non': 'Sans chique (chemma)', 'Chemma: oui': 'Chique (chemma)',
};
export const lib = (v) => LIBELLE[v] || v;
// Secteur recherché, lisible : « Algerie · Tizi ouzou » → « Algérie · Tizi Ouzou », doublons et valeurs vides retirés.
const SECTEURS = { algerie: 'Algérie', 'autre que algerie': 'Hors Algérie', "n'importe ou": 'Partout', 'pas important': 'Partout', usa: 'États-Unis', amerique: 'Amérique', autre: 'Autre' };
export function secteurLisible(v) {
  const vus = new Set();
  return String(v || '').split('·').map((x) => x.trim()).filter((x) => x && !/^[.…]+$/.test(x)).map((x) => SECTEURS[x.toLowerCase()] || x.charAt(0).toUpperCase() + x.slice(1))
    .filter((x) => { const k = x.toLowerCase(); if (vus.has(k)) return false; vus.add(k); return true; }).join(' · ');
}

// Nettoie les choix envoyés par le formulaire : ne garde que des valeurs connues de l'outil.
// Numéro de téléphone (pour qui n'a aucun réseau social) : renvoie un numéro propre au format international, ou '' s'il n'est pas valide.
export function telephoneNormal(v) {
  let t = String(v || '').replace(/[\s.\-()\/]/g, '');
  if (t.startsWith('00')) t = `+${t.slice(2)}`;
  if (/^0[1-9]\d{8}$/.test(t)) t = `+33${t.slice(1)}`;
  if (/^\+33/.test(t)) return /^\+33[1-9]\d{8}$/.test(t) ? t : '';
  if (/^\+213/.test(t)) return /^\+213[1-9]\d{8}$/.test(t) ? t : '';
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : '';
}

export function choixPropres(m = {}) {
  const un = (v, list) => (list.includes(v) ? v : '');
  const plusieurs = (v, list, max = 8) => (Array.isArray(v) ? [...new Set(v.filter((x) => list.includes(x)))].slice(0, max) : []);
  const int = (v, min, max) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
  const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const cat = un(m.niveauEtudeCategorie, O.etudeCategorie);
  return {
    origineTags: plusieurs(m.origineTags, O.origine, 3),
    villageOrigine: txt(m.villageOrigine, 80),
    langue: txt(m.langue, 80),
    situation: un(m.situation, O.situation),
    enfants: un(m.enfants, O.enfants),
    nbEnfants: m.enfants === 'Oui' ? int(m.nbEnfants, 0, 15) ?? 0 : 0,
    ageEnfants: m.enfants === 'Oui' ? txt(m.ageEnfants, 60) : '',
    desirEnfants: un(m.desirEnfants, O.desirEnfants),
    niveauEtudeCategorie: cat,
    niveauEtudeDetail: cat ? un(m.niveauEtudeDetail, O.etudeDetail[cat]) : '',
    etudesPaysObtention: un(m.etudesPaysObtention, O.etudesPaysObtention),
    profession: txt(m.profession, 80),
    tailleCm: int(m.tailleCm, 120, 230),
    religion: un(m.religion, O.religion),
    pratique: un(m.pratique, O.pratique),
    religionTexte: txt(m.religionTexte, 300),
    autresModeVie: txt(m.autresModeVie, 300),
    fumeur: un(m.fumeur, O.fumeur), sport: un(m.sport, O.sport), alcool: un(m.alcool, O.alcool), chemma: un(m.chemma, O.chemma),
    caracteristiques: plusieurs(m.caracteristiques, O.caracteristiques, 6),
    mobiliteGeographique: un(m.mobiliteGeographique, O.mobilite),
    visionFinanciere: un(m.visionFinanciere, [...O.visionHomme, ...O.visionFemme]),
    hygieneVie: [un(m.fumeur, O.fumeur), un(m.sport, O.sport), un(m.alcool, O.alcool), un(m.chemma, O.chemma)].filter(Boolean),
    zoneGeo: un(m.zoneGeo, O.zoneGeo),
    origineRechercheTags: plusieurs(m.origineRechercheTags, O.origine, 16),
    religionRecherche: un(m.religionRecherche, O.religionRecherche),
    pratiqueRecherche: un(m.pratiqueRecherche, O.pratiqueRecherche),
    etudesRecherche: un(m.etudesRecherche, O.etudesRecherche),
    rechercheFemmeHidjabiste: un(m.rechercheFemmeHidjabiste, O.hidjab),
    caracteristiquesRecherche: plusieurs(m.caracteristiquesRecherche, O.caracteristiques, 6),
    accepteDivorce: m.accepteDivorce === true,
    accepteVeuf: m.accepteVeuf === true,
    accepteEnfants: m.accepteEnfants === true,
    kabyleUniquement: m.kabyleUniquement === true,
    contactReseau: txt(m.contactReseau, 200),
  };
}

// Fiche au format de l'outil de matching (import « JSON » de la liste des profils, en fusion).
export function versOutil(a, { photoDataUrl = '', aujourdHui = new Date() } = {}) {
  const m = a.matching || {};
  const reseau = String(m.contactReseau || '').trim();
  // TikTok (lien ou @pseudo) dans la case TikTok de l'outil ; Instagram / Facebook dans « autre contact » ; l'email dans les notes.
  const pseudoTT = (v) => { const t = String(v || '').trim().toLowerCase(); const x = t.match(/tiktok\.com\/@([\w.]{2,30})/) || (/(instagram|facebook|fb)\.com/.test(t) ? null : t.match(/^@?([\w.]{2,30})$/)); return x ? x[1].replace(/\.+$/, '') : ''; };
  const pseudo = pseudoTT(m.tiktokLive) || pseudoTT(reseau);
  const autreReseau = pseudoTT(reseau) ? '' : reseau;
  return {
    id: `site-annonce-${a.ref}`,
    dateAjout: (a.submitted_at || aujourdHui.toISOString()).slice(0, 16).replace('T', ' '),
    prenom: a.prenom,
    tiktokUrl: pseudo ? `https://www.tiktok.com/@${pseudo}` : '',
    tiktokAccountId: pseudo,
    telephone: a.phone || '',
    contactAutre: autreReseau,
    sexe: a.genre === 'femme' ? 'Femme' : 'Homme',
    recherche: a.genre === 'femme' ? 'Homme' : 'Femme',
    age: a.age,
    ville: a.ville,
    pays: a.pays,
    origine: (m.origineTags || [])[0] || '',
    origineTags: m.origineTags || [],
    villageOrigine: m.villageOrigine || '',
    communaute: (m.origineTags || [])[0] || '',
    langue: m.langue || '',
    situation: m.situation || '',
    enfants: m.enfants || '',
    nbEnfants: m.nbEnfants || 0,
    ageEnfants: m.ageEnfants || '',
    desirEnfants: m.desirEnfants || '',
    niveauEtudeCategorie: m.niveauEtudeCategorie || '',
    niveauEtudeDetail: m.niveauEtudeDetail || '',
    etudesPaysObtention: m.etudesPaysObtention || '',
    profession: m.profession || '',
    tailleCm: m.tailleCm ?? null,
    religion: m.religion || '',
    pratique: m.pratique || '',
    caracteristiques: m.caracteristiques || [],
    mobiliteGeographique: m.mobiliteGeographique || '',
    visionFinanciere: m.visionFinanciere || '',
    hygieneVie: m.hygieneVie || [],
    ageMin: a.age_min ?? null,
    ageMax: a.age_max ?? null,
    zoneGeo: m.zoneGeo || '',
    origineRechercheTags: m.origineRechercheTags || [],
    religionRecherche: m.religionRecherche || '',
    pratiqueRecherche: m.pratiqueRecherche || '',
    etudesRecherche: m.etudesRecherche || '',
    rechercheFemmeHidjabiste: m.rechercheFemmeHidjabiste || '',
    caracteristiquesRecherche: m.caracteristiquesRecherche || [],
    accepteDivorce: Boolean(m.accepteDivorce),
    accepteVeuf: Boolean(m.accepteVeuf),
    accepteEnfants: Boolean(m.accepteEnfants),
    kabyleUniquement: Boolean(m.kabyleUniquement),
    autresInfos: a.profil || '',
    criteresRechercheAutre: a.recherche || '',
    // Profil validé par Lamia sur le site = vérifié ; la pièce d'identité (facultative) est notée à part.
    verificationPhoto: (a.status === 'publiee' || Boolean(a.identite_verifiee_at)) && (a.medias || []).some((x) => x.kind === 'photo'),
    videoEnvoyee: (a.medias || []).some((x) => x.kind === 'video'),
    plateformeSaisie: 'Autre',
    canalSaisie: 'Message privé',
    photoDataUrl,
    notes: `${a.status === 'a_verifier' ? 'À VÉRIFIER : profil pas encore validé sur le site (teste-le, puis valide-le). ' : ''}${a.email ? `Email : ${a.email}. ` : ''}${a.photo_partage ? 'Photo transmissible à son match : OUI. ' : 'Photo transmissible à son match : NON. '}${m.religionTexte ? `Foi et pratique : ${m.religionTexte}. ` : ''}${m.autresModeVie ? `Mode de vie : ${m.autresModeVie}. ` : ''}Annonce n° ${a.ref} déposée sur lamia-femme-berbere.com${a.identite_verifiee_at ? `, vérifié AVEC pièce d’identité le ${String(a.identite_verifiee_at).slice(0, 10)}` : ', vérifié sans pièce d’identité'}.${(a.interets || []).length ? ` MATCH DEMANDÉ : intéressé(e) par le profil ${a.interets.map((r) => `site-annonce-${r}`).join(', ')}.` : ''}`,
    statut: 'Nouveau',
    source_record_id: `site-annonce-${a.ref}`,
    status_import: 'site',
  };
}

// Sur le devant d'une carte : le métier (ou secteur d'activité) et la religion, quand la personne les a donnés.
export function metierEtReligion(a) {
  const religion = a?.religion === 'Autre' ? (a.religion_texte || '') : a?.religion ? lib(a.religion) : '';
  return { metier: String(a?.metier || '').trim(), religion: String(religion || '').trim() };
}

// Religion, pratique et mode de vie (tabac, alcool, chique, sport, le reste en quelques mots).
export function foiEtVie(a) {
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const foi = [a.religion && lib(a.religion), a.pratique && lib(a.pratique).toLowerCase()].filter(Boolean).join(', ');
  const vie = (a.mode_vie || []).map((x) => lib(x));
  if (!foi && !a.religion_texte && !vie.length && !a.autres) return '';
  return `<h4>Religion et mode de vie</h4>
    ${foi ? `<p>${esc(foi.charAt(0).toUpperCase() + foi.slice(1))}</p>` : ''}${a.religion_texte ? `<p data-membre>${esc(a.religion_texte)}</p>` : ''}
    ${vie.length ? `<p class="annonce-tags">${vie.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : ''}${a.autres ? `<p data-membre>${esc(a.autres)}</p>` : ''}`;
}

// ---------------------------------------------------------------- potentiel d'un match (0 à 100)
// Pour aider Lamia à choisir LA mise en relation à faire parmi tous les matchs demandés par une personne.
// Calculé dans les deux sens (ce que A cherche chez B, et ce que B cherche chez A), puis moyenné.
// Ce n'est pas l'outil de matching complet de Lamia : un premier tri, à confirmer dans l'outil.
export function fichePotentiel(src, { outil = false, age = null } = {}) {
  if (outil) return { age: src.age ?? null, age_min: src.age_min, age_max: src.age_max, pays: src.pays || '', religion: src.religion || '', pratique: src.pratique || '', enfants: src.enfants || '', situation: src.situation || '', origine: src.origine || [], hygiene: src.mode_vie || [], etudes: src.etudes || '', prefs: { religion: src.religion_recherche || '', pratique: src.pratique_recherche || '' } };
  const m = src.matching || {};
  return { age, age_min: src.age_min, age_max: src.age_max, pays: src.pays || '', religion: m.religion || '', pratique: m.pratique || '', enfants: m.enfants || '', situation: m.situation || '', origine: m.origineTags || [], hygiene: m.hygieneVie || [], etudes: m.niveauEtudeCategorie || '',
    prefs: { religion: m.religionRecherche || '', pratique: m.pratiqueRecherche || '', origines: m.origineRechercheTags || [], kabyleUniquement: Boolean(m.kabyleUniquement), accepteEnfants: m.accepteEnfants, accepteDivorce: m.accepteDivorce, accepteVeuf: m.accepteVeuf, zone: m.zoneGeo || '', mobilite: m.mobiliteGeographique || '', fumeur: (m.hygieneVie || []).find((x) => /^Fumeur/.test(x)) || '' } };
}
function sens(A, B, forts, vigilance, quiA, quiB) {
  let pts = 0, max = 0;
  const ajoute = (p, m) => { pts += p; max += m; };
  // Âge (25)
  if (B.age && (A.age_min || A.age_max)) {
    const lo = A.age_min || 18, hi = A.age_max || 99, ecart = B.age < lo ? lo - B.age : B.age > hi ? B.age - hi : 0;
    ajoute(Math.max(0, 25 - ecart * 6), 25);
    if (!ecart) forts.push(`${quiB} a l’âge recherché par ${quiA}`); else vigilance.push(`${quiB} (${B.age} ans) hors de la tranche ${lo}-${hi} ans de ${quiA}`);
  } else ajoute(15, 25);
  // Religion (20) et pratique (15)
  const crit = (pref, val, poids, nom) => {
    if (!pref || pref === 'Pas important') return ajoute(poids * 0.7, poids);
    if (!val) return ajoute(poids * 0.5, poids);
    if (pref === val) { forts.push(`${nom} de ${quiB} : celle recherchée par ${quiA}`); return ajoute(poids, poids); }
    vigilance.push(`${nom} de ${quiB} différente de celle recherchée par ${quiA}`); return ajoute(0, poids);
  };
  crit(A.prefs.religion, B.religion, 20, 'Religion'); crit(A.prefs.pratique, B.pratique, 15, 'Pratique');
  // Enfants (10)
  if (B.enfants === 'Oui' && A.prefs.accepteEnfants === false) { vigilance.push(`${quiB} a des enfants, ${quiA} ne l’a pas accepté`); ajoute(0, 10); } else ajoute(B.enfants ? 10 : 7, 10);
  // Divorce / veuvage (10)
  const div = /^Divorce|^Separe/.test(B.situation), veuf = /^Veuf/.test(B.situation);
  if ((div && A.prefs.accepteDivorce === false) || (veuf && A.prefs.accepteVeuf === false)) { vigilance.push(`Situation de ${quiB} non acceptée par ${quiA}`); ajoute(0, 10); } else ajoute(10, 10);
  // Origine (10)
  const ori = A.prefs.origines || [];
  if (A.prefs.kabyleUniquement && !B.origine.some((o) => /^Kabyle/.test(o))) { vigilance.push(`${quiA} cherche uniquement kabyle`); ajoute(0, 10); }
  else if (ori.length && B.origine.length) { if (B.origine.some((o) => ori.includes(o))) { forts.push(`Origine de ${quiB} recherchée par ${quiA}`); ajoute(10, 10); } else { vigilance.push(`Origine de ${quiB} pas dans les souhaits de ${quiA}`); ajoute(2, 10); } }
  else ajoute(7, 10);
  // Tabac (5)
  const fB = B.hygiene.find((x) => /^Fumeur/.test(x));
  if (A.prefs.fumeur === 'Fumeur: non' && fB && fB !== 'Fumeur: non') { vigilance.push(`${quiB} fume, ${quiA} non`); ajoute(1, 5); } else ajoute(fB ? 5 : 4, 5);
  // Géographie (5)
  const zone = A.prefs.zone;
  if (zone && zone !== "N'importe ou" && B.pays) { if (zone === B.pays || (zone !== 'Autre' && zoneAccepte(zone, B.pays))) ajoute(5, 5); else if (/^Oui/.test(A.prefs.mobilite || '')) ajoute(3, 5); else { vigilance.push(`${quiB} vit hors de la zone voulue par ${quiA}`); ajoute(1, 5); } }
  else ajoute(B.pays && B.pays === A.pays ? 5 : 3.5, 5);
  return pts / max;
}
export function potentiel(A, B, { a = 'A', b = 'B' } = {}) {
  const forts = [], vigilance = [];
  const ab = sens(A, B, forts, vigilance, a, b), ba = sens(B, A, forts, vigilance, b, a);
  // Points rédhibitoires (enfants ou situation refusés, origine exclusive, religion différente) : ils pèsent plus lourd.
  const redhibitoires = vigilance.filter((v) => /ne l’a pas accepté|non acceptée|uniquement kabyle|Religion de/.test(v)).length;
  const score = Math.max(0, Math.round(((ab + ba) / 2) * 100) - redhibitoires * 8);
  if (A.religion && B.religion && A.religion === B.religion) forts.push('Même religion');
  if (A.origine.some((o) => B.origine.includes(o))) forts.push('Même origine');
  if (A.pays && A.pays === B.pays) forts.push('Même pays');
  return { score, forts: [...new Set(forts)].slice(0, 5), vigilance: [...new Set(vigilance)].slice(0, 5) };
}

// ---------------------------------------------------------------- swipe : âge et localisation, dans les deux sens
const plat = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// « France · Marseille » → « france » : seule la grande zone sert au filtre, la précision reste à lire sur la fiche.
const zoneDe = (secteur) => plat(String(secteur ?? '').split('·')[0]);
// La personne qui cherche dans cette zone accepte-t-elle quelqu'un qui vit dans ce pays ? En cas de doute : oui.
const EUROPE = ['europe', 'france', 'belgique', 'suisse', 'luxembourg', 'allemagne', 'pays-bas', 'royaume-uni', 'irlande', 'espagne', 'portugal', 'italie', 'autriche', 'suede', 'norvege', 'danemark', 'finlande', 'pologne'];
export function zoneAccepte(secteur, pays) {
  const z = zoneDe(secteur), p = plat(pays);
  if (!z || !p || ['pas important', "n'importe ou", '…'].includes(z) || p === 'pas important') return true;
  if (p === 'autre que algerie') return z !== 'algerie';
  if (z === 'autre que algerie') return p !== 'algerie';
  if (z === 'europe') return EUROPE.includes(p);
  if (z === 'amerique') return ['amerique', 'canada', 'usa', 'mexique', 'bresil'].includes(p);
  if (z === 'maghreb') return ['algerie', 'maroc', 'tunisie', 'libye', 'mauritanie'].includes(p);
  if (z === 'golfe') return ['emirats arabes unis', 'qatar', 'arabie saoudite'].includes(p);
  if (z === 'autre') return !['france', 'algerie'].includes(p);
  return z === p;
}
const ageAccepte = (qui, age) => !age || ((!qui.age_min || age >= qui.age_min) && (!qui.age_max || age <= qui.age_max));
// Barrière : ce que l'autre cherche m'accepte-t-il ? Son âge demandé à 7 ans près, et la zone où il veut que je vive.
// Sans critère ou en cas de doute : oui. Sert à ne pas montrer un profil (ni lui envoyer de cœur) à quelqu'un qu'il ne cherche pas.
export const MARGE_AGE = 7;
export const accepteParSesCriteres = (lui, moi) => (!moi?.age || ((!lui?.age_min || moi.age >= lui.age_min - MARGE_AGE) && (!lui?.age_max || moi.age <= lui.age_max + MARGE_AGE))) && zoneAccepte(lui?.secteur, moi?.pays);
// moi et lui : { age, age_min, age_max, pays, secteur }.
// Le profil entre dans ce que je cherche (filtre du swipe).
export const dansMesCriteres = (moi, lui) => ageAccepte(moi, lui.age) && zoneAccepte(moi.secteur, lui.pays);
// Chacun correspond à ce que l'autre cherche (ces profils passent en premier). Filtrer là-dessus viderait les piles :
// médiane de 3 profils pour les hommes en novembre 2026, contre 29 avec les seuls critères de la personne.
export const ageEtLieuOk = (moi, lui) => dansMesCriteres(moi, lui) && dansMesCriteres(lui, moi);

// Les badges d'un profil, sur les cartes du swipe et de la liste.
export function badgesProfil(a) {
  const b = [];
  if (a.moderateur) b.push(`<span class="profil-badge is-moderateur">${a.genre === 'femme' ? 'Modératrice' : 'Modérateur'}</span>`);
  if (a.recommande) b.push('<span class="profil-badge is-lamia">Recommandé par Lamia</span>');
  if (a.piece_identite) b.push('<span class="profil-badge is-identite">Validé avec pièce d’identité</span>');
  return b.length ? `<p class="profil-badges">${b.join('')}</p>` : '';
}

// L'origine, bien visible sur chaque carte. Sans la parenthèse des pays, pour rester courte.
export const origineLisible = (origines) => [...new Set((origines || []).map((o) => {
  const t = String(lib(o) || o);
  return /^Amazigh/.test(t) ? 'Amazigh' : t.replace(/\s*\(.*\)$/, '');
}))].join(' · ');

// ---------------------------------------------------------------- « Un profil avec une différence », en mots simples
// Critères non respectés → phrases courtes, accordées au genre de l'autre personne (« Il est divorcé. »).
const SITUATION_DIFF = {
  'Divorce(e)': ['Il est divorcé.', 'Elle est divorcée.'], 'Separe(e)': ['Il est séparé.', 'Elle est séparée.'],
  'Veuf/Veuve': ['Il est veuf.', 'Elle est veuve.'], 'Marie(e) sur papier uniquement': ['Il est marié sur papier.', 'Elle est mariée sur papier.'],
  'Jamais marie(e)': ['Il n’a jamais été marié.', 'Elle n’a jamais été mariée.'],
};
export function phrasesDifference(criteres = [], fiche = {}) {
  const f = fiche?.genre === 'femme' ? 1 : 0;
  const pron = ['il', 'elle'][f];
  // Chaque différence est dite avec l'information elle-même : « Sa situation n'est pas celle que tu cherches : il est divorcé. »
  const avec = (phrase, info) => (info ? `${phrase} : ${info}.` : `${phrase}.`);
  const minus = (x) => String(x || '').replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
  const t = [];
  if (criteres.includes('situation')) t.push(avec('Sa situation n’est pas celle que tu cherches', minus(SITUATION_DIFF[fiche?.situation]?.[f])));
  if (criteres.includes('age')) t.push(avec('Son âge n’est pas dans la tranche que tu cherches', fiche?.age ? `${pron} a ${fiche.age} ans` : ''));
  if (criteres.includes('secteur')) {
    const ou = [fiche?.ville, fiche?.pays && lib(fiche.pays)].filter(Boolean);
    t.push(avec(['Il ne vit pas là où tu cherches', 'Elle ne vit pas là où tu cherches'][f], fiche?.ville ? `${pron} vit à ${ou[0]}${ou[1] ? ` (${ou[1]})` : ''}` : ou.length ? `pays de résidence, ${ou[0]}` : ''));
  }
  if (criteres.includes('religion')) t.push(avec('Sa religion ou sa pratique n’est pas celle que tu cherches', [fiche?.religion, fiche?.pratique].filter(Boolean).map((x) => lib(x).toLowerCase()).join(', ')));
  if (criteres.includes('enfants')) t.push(avec('Pour les enfants, ce n’est pas ce que tu as demandé', fiche?.enfants === 'Oui' ? `${pron} a des enfants` : fiche?.enfants === 'Non' ? `${pron} n’a pas d’enfant` : ''));
  if (criteres.some((c) => !['secteur', 'age', 'situation', 'religion', 'enfants'].includes(c))) t.push('Un autre de tes critères n’est pas respecté.');
  return t;
}
// Les anciennes questions sont enregistrées en texte : on retrouve les critères pour les redire simplement.
export function criteresDeQuestion(q = '') {
  const c = [];
  if (/Tu cherches en/.test(q)) c.push('secteur');
  if (/Son âge/.test(q)) c.push('age');
  if (/Sa situation/.test(q)) c.push('situation');
  if (/religion/.test(q)) c.push('religion');
  if (/enfants/.test(q)) c.push('enfants');
  if (/Un (de tes|autre de tes) critères/.test(q)) c.push('autre');
  return c;
}

// Un texte « tapé au hasard » (walou bdgjfggyfesh…) : des mots interminables, presque pas de voyelles,
// ou la même lettre répétée. Volontairement prudent : au moindre doute, le texte passe.
export function texteCredible(texte) {
  const t = String(texte || '').trim();
  const lettres = t.replace(/[^\p{L}]/gu, '');
  if (lettres.length < 15) return true;
  if (/(\p{L})\1{5,}/u.test(t)) return false;
  const mots = t.split(/[^\p{L}]+/u).filter(Boolean);
  const longs = mots.filter((m) => m.length > 20).reduce((n, m) => n + m.length, 0);
  if (longs >= lettres.length / 3) return false;
  const latin = lettres.replace(/[^a-zà-öø-ÿɛɣǧḍḥṛṣṭẓčž]/giu, '');
  if (latin.length >= lettres.length * 0.8) {
    const voyelles = latin.replace(/[^aeiouyà-æè-ïò-öù-üÿœɛ]/giu, '').length;
    if (voyelles / latin.length < 0.2) return false;
  }
  return true;
}
