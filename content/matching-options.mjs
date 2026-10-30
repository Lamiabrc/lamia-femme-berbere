// Listes de choix des annonces, identiques à celles de l'outil local de matching de Lamia
// (F:\quick-pair-pro, src/lib/store.ts) : les annonces s'importent ensuite dans l'outil sans rien retaper.
// Partagé : serveur (validation), formulaire du site (copié dans /assets) et export vers l'outil.

export const O = {
  sexe: ['Femme', 'Homme'],
  pays: ['France', 'Algerie', 'Europe', 'Canada', 'USA', 'Amerique', 'Autre'],
  origine: ['Kabyle (Algerie)', 'Chaoui (Algerie)', 'Touareg (Algerie / Mali / Niger / Libye / Burkina Faso)', 'Autre Amazigh / Berbere', 'Arabophone', 'Europeen', 'Autre origine'],
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
  // Recherche
  zoneGeo: ['France', 'Algerie', 'Autre que Algerie', 'Europe', 'Canada', 'USA', 'Amerique', 'Autre', "N'importe ou"],
  religionRecherche: ['Pas important', 'Islam', 'Chretienne', 'Agnostique', 'Athee', 'Autre'],
  pratiqueRecherche: ['Pas important', 'Pratiquant(e)', 'Pratique moderee', 'Non pratiquant(e)'],
  etudesRecherche: ['Pas important', 'Bac', 'Bac+', 'Bac+5', 'Plus de Bac+5'],
  hidjab: ['Pas important', 'Oui', 'Non'],
};

// Libellés affichés sur le site (avec accents), la valeur envoyée reste celle de l'outil.
export const LIBELLE = {
  'Algerie': 'Algérie', 'Amerique': 'Amérique', 'Autre que Algerie': 'Ailleurs qu’en Algérie', "N'importe ou": 'Peu importe',
  'Kabyle (Algerie)': 'Kabyle (Algérie)', 'Chaoui (Algerie)': 'Chaoui (Algérie)', 'Touareg (Algerie / Mali / Niger / Libye / Burkina Faso)': 'Touareg', 'Autre Amazigh / Berbere': 'Autre amazigh / berbère', 'Europeen': 'Européen(ne)', 'Autre origine': 'Autre origine',
  'Jamais marie(e)': 'Jamais marié(e)', 'Marie(e) sur papier uniquement': 'Marié(e) sur papier uniquement', 'Divorce(e)': 'Divorcé(e)', 'Separe(e)': 'Séparé(e)', 'Veuf/Veuve': 'Veuf / veuve',
  'Oui, mais a discuter': 'Oui, mais à discuter', 'Peut-etre': 'Peut-être',
  'College': 'Collège', 'Lycee': 'Lycée', 'Primaire non termine': 'Primaire non terminé', 'Primaire termine': 'Primaire terminé', 'College non termine': 'Collège non terminé', 'College termine': 'Collège terminé', 'Lycee non termine': 'Lycée non terminé', 'Bac general': 'Bac général',
  'Pays de residence': 'Mon pays de résidence', 'Chretienne': 'Chrétienne', 'Athee': 'Athée', 'Pratique moderee': 'Pratique modérée',
  'Traditionnel(le)': 'Traditionnel(le)', 'Ambitieux(se)': 'Ambitieux(se)', 'Sportif(ve)': 'Sportif(ve)', 'Communicatif(ve)': 'Communicatif(ve)', 'Elegant(e)': 'Élégant(e)', 'Cultive(e)': 'Cultivé(e)', 'Drole': 'Drôle', 'Patient(e)': 'Patient(e)',
  'Oui - France': 'Oui, en France', 'Oui - region': 'Oui, dans ma région', 'Oui - international': 'Oui, à l’international', 'A discuter': 'À discuter',
  'Homme: femme ne travaille pas': 'Je préfère que ma femme ne travaille pas', 'Homme: femme travaille pour son epanouissement': 'Ma femme travaille pour son épanouissement', 'Homme: femme travaille pour aider': 'Ma femme travaille pour aider le foyer', 'Homme: femme travaille en 50/50': 'On partage les charges à 50/50',
  'Femme: ne veut pas travailler': 'Je ne souhaite pas travailler', 'Femme: veut travailler obligatoirement': 'Je veux absolument travailler', 'Femme: veut travailler si necessaire': 'Je travaillerai si nécessaire', 'Femme: veut travailler pour mon epanouissement': 'Je travaille pour mon épanouissement',
  'Fumeur: non': 'Non-fumeur', 'Fumeur: occasionnel': 'Fumeur occasionnel', 'Fumeur: oui': 'Fumeur', 'Sport: oui': 'Sport régulier', 'Sport: occasionnel': 'Sport de temps en temps', 'Sport: non': 'Pas de sport', 'Alcool: non': 'Pas d’alcool', 'Alcool: occasionnel': 'Alcool occasionnel', 'Alcool: oui': 'Alcool',
};
export const lib = (v) => LIBELLE[v] || v;

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
    caracteristiques: plusieurs(m.caracteristiques, O.caracteristiques, 6),
    mobiliteGeographique: un(m.mobiliteGeographique, O.mobilite),
    visionFinanciere: un(m.visionFinanciere, [...O.visionHomme, ...O.visionFemme]),
    hygieneVie: [un(m.fumeur, O.fumeur), un(m.sport, O.sport), un(m.alcool, O.alcool)].filter(Boolean),
    zoneGeo: un(m.zoneGeo, O.zoneGeo),
    origineRechercheTags: plusieurs(m.origineRechercheTags, O.origine, 7),
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
    notes: `${a.status === 'a_verifier' ? '⏳ À VÉRIFIER : profil pas encore validé sur le site (teste-le, puis valide-le). ' : ''}${a.email ? `Email : ${a.email}. ` : ''}${a.photo_partage ? '📷 Photo transmissible à son match : OUI. ' : '📷 Photo transmissible à son match : NON. '}Annonce n° ${a.ref} déposée sur lamia-femme-berbere.com${a.identite_verifiee_at ? `, vérifié AVEC pièce d’identité le ${String(a.identite_verifiee_at).slice(0, 10)}` : ', vérifié sans pièce d’identité'}.${(a.interets || []).length ? ` MATCH DEMANDÉ : intéressé(e) par le profil ${a.interets.map((r) => `site-annonce-${r}`).join(', ')}.` : ''}`,
    statut: 'Nouveau',
    source_record_id: `site-annonce-${a.ref}`,
    status_import: 'site',
  };
}
