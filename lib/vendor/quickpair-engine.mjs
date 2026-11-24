// Moteur de matching de Quick Pair Pro (store.ts), compilé tel quel — ne pas modifier à la main.
// Source : F:\quick-pair-pro\src\lib\store.ts, regénéré avec esbuild (voir match-direct-moteur).
// src/domain/matching/expandedMatching.ts
function softPreference(reason, _a, _b) {
  const r = reason.toLowerCase();
  return r.includes("algerie / etranger par defaut") || r.startsWith("pratique religieuse");
}

// src/repositories/businessStorage.ts
var cache = null;
var pending = null;
function bridge() {
  return typeof window !== "undefined" ? window.lamiaVault : void 0;
}
function rawValues() {
  const values = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) values[k] = localStorage.getItem(k);
  }
  return values;
}
function initialize() {
  if (!cache && bridge()) cache = bridge().call("initialize", rawValues());
}
var businessStorage = {
  getItem(key) {
    initialize();
    return pending?.[key] ?? (cache ? cache[key] ?? null : localStorage.getItem(key));
  },
  setItem(key, value) {
    initialize();
    if (pending) {
      pending[key] = value;
      return;
    }
    if (cache) {
      bridge().call("commit", { [key]: value });
      cache[key] = value;
    } else localStorage.setItem(key, value);
  },
  get length() {
    initialize();
    return cache ? Object.keys(cache).length : localStorage.length;
  },
  key(index) {
    initialize();
    return cache ? Object.keys(cache)[index] ?? null : localStorage.key(index);
  }
};

// src/lib/studioSettings.ts
var SETTINGS_KEY = "matching-studio-settings-v1";
var EDITABLE_FIELDS = ["Profession", "Niveau d'etude", "Detail du niveau", "Bac+ obtenu ou", "Taille du profil (cm)", "Belle-famille", "Gestion d'un d\xE9saccord", "Place des r\xE9seaux sociaux", "Rep\xE8res relationnels d\xE9clar\xE9s (5 maximum, \xE0 confirmer)", "Autre critere recherche"];
var DEFAULT_STUDIO = { title: "Des rencontres, une histoire \xE0 construire.", intro: "Retrouver une personne, comprendre ses attentes et pr\xE9parer une rencontre qui a du sens.", accent: "#a52c45", animations: true, minScore: 10, promisingScore: 65, priorityScore: 75, fields: {} };
function validateStudio(value) {
  const v = value;
  if (!v || typeof v.title !== "string" || !v.title.trim() || v.title.length > 100 || typeof v.intro !== "string" || v.intro.length > 400 || !/^#[0-9a-f]{6}$/i.test(v.accent) || typeof v.animations !== "boolean") throw new Error("Contenus ou couleur invalides.");
  if (![v.minScore, v.promisingScore, v.priorityScore].every((n) => Number.isInteger(n) && n >= 10 && n <= 100) || v.minScore >= v.promisingScore || v.promisingScore >= v.priorityScore) throw new Error("Les seuils doivent respecter : minimum < prometteur < prioritaire, entre 10 et 100.");
  const fields = {};
  for (const key of EDITABLE_FIELDS) {
    const field = v.fields?.[key];
    if (field) {
      if (typeof field.label !== "string" || field.label.length > 120 || typeof field.hidden !== "boolean") throw new Error("R\xE9glage de champ invalide.");
      fields[key] = { label: field.label.trim() || key, hidden: field.hidden };
    }
  }
  return { ...v, title: v.title.trim(), fields };
}
var cachedRaw = null;
var cached = DEFAULT_STUDIO;
function loadStudio() {
  if (typeof localStorage === "undefined") return DEFAULT_STUDIO;
  try {
    const raw = businessStorage.getItem(SETTINGS_KEY);
    if (raw === cachedRaw) return cached;
    cached = raw ? validateStudio(JSON.parse(raw)) : DEFAULT_STUDIO;
    cachedRaw = raw;
    return cached;
  } catch {
    return DEFAULT_STUDIO;
  }
}

// src/domain/matching/preferenceHierarchy.ts
function isNegotiablePreference(reason, _source, _target) {
  const r = reason.toLowerCase();
  return r.includes("algerie / etranger par defaut") || r.startsWith("pratique religieuse");
}
function practiceCategory(value) {
  const text = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!text || /pas important|indifferent/.test(text)) return "";
  if (/non pratiquant/.test(text)) return "non";
  if (/modere/.test(text)) return "moderee";
  if (/pratiquant/.test(text)) return "pratiquant";
  return text;
}
var normReligion = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function acceptedReligions(profile) {
  const list = (Array.isArray(profile.religionsAcceptees) ? profile.religionsAcceptees : []).filter(Boolean);
  if (list.length) return list.filter((r) => normReligion(r) !== "pas important");
  const single = profile.religionRecherche || "";
  return single && normReligion(single) !== "pas important" ? [single] : [];
}
function religionAccepted(requester, target) {
  const accepted = acceptedReligions(requester);
  if (!accepted.length) return null;
  const actual = normReligion(target.religion || "");
  if (!actual) return "unknown";
  return accepted.some((wanted) => {
    const w = normReligion(wanted);
    if (w !== actual) return false;
    if (w !== "autre") return true;
    const wd = normReligion(requester.religionRechercheAutre || "");
    const ad = normReligion(target.religionAutre || "");
    return !wd || !ad || wd === ad;
  });
}

// src/lib/profileIntelligence.ts
var DIMENSIONS = [
  {
    key: "famille",
    label: "Valeurs familiales",
    words: [
      "famille",
      "familial",
      "parents",
      "enfant",
      "foyer",
      "maison",
      "valeur",
      "tradition",
      "familiale",
      "valeurs",
      "respect parents",
      "fonder",
      "mekthoub"
    ]
  },
  {
    key: "calme",
    label: "Calme emotionnel",
    words: [
      "calme",
      "pose",
      "patient",
      "douce",
      "doux",
      "tranquille",
      "discret",
      "timide",
      "reserve",
      "apaisant",
      "gentil",
      "gentille",
      "paix"
    ]
  },
  {
    key: "ambition",
    label: "Projet / ambition",
    words: [
      "ambitieux",
      "ambition",
      "travail",
      "travaille",
      "projet",
      "business",
      "independant",
      "entrepreneur",
      "compte",
      "carriere",
      "objectif",
      "motive",
      "serieux dans le travail",
      "proprietaire"
    ]
  },
  {
    key: "culture",
    label: "Culture / niveau",
    words: [
      "cultive",
      "culture",
      "diplome",
      "doctorat",
      "bac",
      "etude",
      "instruction",
      "intelligent",
      "intellectuel",
      "lecture",
      "instruit",
      "reflechi",
      "parle bien",
      "niveau"
    ]
  },
  {
    key: "elegance",
    label: "Presentation / elegance",
    words: [
      "elegant",
      "classe",
      "soigne",
      "charme",
      "beau",
      "belle",
      "physique",
      "presentable",
      "ferrari",
      "lamborghini",
      "golden",
      "premium",
      "style"
    ]
  },
  {
    key: "tradition",
    label: "Tradition kabyle",
    words: [
      "kabyle",
      "kabylie",
      "village",
      "aarch",
      "tradition",
      "religion",
      "pratiquant",
      "hidjab",
      "valeurs",
      "berbere"
    ]
  },
  {
    key: "sociabilite",
    label: "Communication / social",
    words: [
      "sociable",
      "discussion",
      "communication",
      "ouvert",
      "ouverte",
      "dynamique",
      "humour",
      "live",
      "parle",
      "dialogue",
      "echange",
      "communicatif"
    ]
  }
];
var RISK_WORDS = [
  {
    label: "papier a verifier",
    words: ["papier", "papiers", "sans papier", "situation administrative"]
  },
  { label: "urgence forte", words: ["urgent", "vite", "rapidement", "presse"] },
  {
    label: "exigence forte",
    words: ["exige", "obligatoire", "absolument", "refuse tout", "jamais", "pas de compromis"]
  },
  {
    label: "temperament a verifier",
    words: ["jaloux", "jalouse", "nerveux", "nerveuse", "colerique", "complique", "dominant"]
  },
  {
    label: "fiche peu lisible",
    words: ["a verifier", "pas clair", "incomplet", "to_review", "low"]
  }
];
function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9@+\s'-]/g, " ").replace(/\s+/g, " ").trim();
}
function safeList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
function textFor(profile) {
  return normalizeText(
    [
      profile.prenom,
      profile.profession,
      profile.visionFinanciere,
      profile.mobiliteGeographique,
      profile.belleFamille,
      profile.preferencePhysique,
      profile.physiqueProfil,
      profile.etudes,
      profile.etudesRecherche,
      profile.categorieProfil,
      profile.pratique,
      profile.pratiqueRecherche,
      profile.situation,
      profile.communaute,
      profile.villageOrigine,
      safeList(profile.caracteristiques).join(" "),
      safeList(profile.caracteristiquesRecherche).join(" "),
      safeList(profile.gestionEmotionnelle).join(" "),
      safeList(profile.rapportReseaux).join(" "),
      safeList(profile.hygieneVie).join(" "),
      profile.criteresRechercheAutre,
      profile.impressionEchange,
      profile.notes,
      profile.import_confidence,
      profile.status_import
    ].filter(Boolean).join(" ")
  );
}
function explicitCharacterText(profile) {
  return normalizeText(
    [
      safeList(profile.caracteristiques).join(" "),
      safeList(profile.caracteristiquesRecherche).join(" "),
      safeList(profile.gestionEmotionnelle).join(" "),
      safeList(profile.rapportReseaux).join(" "),
      profile.criteresRechercheAutre,
      profile.impressionEchange,
      profile.notes
    ].filter(Boolean).join(" ")
  );
}
function includesToken(text, word) {
  const clean = normalizeText(word);
  if (!clean) return false;
  return text.includes(clean);
}
function scoreWords(text, words, base = 26) {
  const hits = words.reduce((sum, word) => sum + (includesToken(text, word) ? 1 : 0), 0);
  return Math.max(14, Math.min(100, base + hits * 15));
}
function unique(values) {
  return Array.from(new Set(safeList(values)));
}
function detectDesireChildren(profile, text) {
  if (profile.desirEnfants) return profile.desirEnfants;
  if (/(ne veut pas|pas d enfant|pas denfant|sans enfant definitif|refuse enfant)/.test(text))
    return "Non";
  if (/(veut des enfants|souhaite des enfants|desir enfant|desire enfant|avoir des enfants|fonder une famille)/.test(
    text
  ))
    return "Oui";
  if (/(peut etre enfant|a voir enfant|selon profil enfant|pas ferme enfant)/.test(text))
    return "Peut-etre";
  return "";
}
function confidenceFor(profile, text) {
  const evidence = [
    safeList(profile.caracteristiques).length > 0,
    String(profile.notes || "").trim().length >= 20,
    String(profile.criteresRechercheAutre || "").trim().length >= 12,
    String(profile.profession || "").trim().length > 0,
    String(profile.visionFinanciere || "").trim().length > 0,
    String(profile.mobiliteGeographique || "").trim().length > 0,
    safeList(profile.gestionEmotionnelle).length > 0,
    String(profile.etudes || "").trim().length > 0,
    String(profile.pratique || "").trim().length > 0,
    text.split(" ").length >= 14
  ].filter(Boolean).length;
  if (evidence >= 5) return "bonne";
  if (evidence >= 3) return "moyenne";
  return "faible";
}
function analyzeProfileIntelligence(profile) {
  const text = textFor(profile);
  const explicitText = explicitCharacterText(profile);
  const confidence = confidenceFor(profile, explicitText || text);
  const metrics = DIMENSIONS.map((dimension) => {
    const base = explicitText ? 30 : 22;
    let value = scoreWords(text, dimension.words, base);
    if (dimension.key === "culture" && [
      "Universitaire Bac+3",
      "Universitaire Bac+4",
      "Universitaire Bac+5",
      "Universitaire > Bac+5",
      "Autodidacte"
    ].includes(profile.etudes))
      value = Math.max(value, 76);
    if (dimension.key === "elegance" && ["Golden profil", "Ferrari", "Lamborghini", "Premium jamais marie(e)"].includes(
      profile.categorieProfil
    ))
      value = Math.max(value, 76);
    if (dimension.key === "ambition" && profile.proprietaire === "Oui") value = Math.max(value, 68);
    return {
      key: dimension.key,
      label: dimension.label,
      value,
      color: value >= 74 ? "bg-success" : value >= 52 ? "bg-warning" : "bg-muted-foreground"
    };
  });
  const traits = unique([
    ...safeList(profile.caracteristiques),
    ...metrics.filter((metric) => metric.value >= 72).map((metric) => metric.label),
    profile.categorieProfil || ""
  ]).slice(0, 8);
  const risks = RISK_WORDS.filter(
    (risk) => risk.words.some((word) => includesToken(text, word))
  ).map((risk) => risk.label);
  if (!profile.verificationPhoto || !profile.verificationAudio) risks.push("identite a verifier");
  if (profile.needs_manual_review || profile.import_confidence === "low")
    risks.push("relecture conseillee");
  const top = [...metrics].sort((a, b) => b.value - a.value).slice(0, 3).map((metric) => metric.label.toLowerCase());
  const desireChildren = detectDesireChildren(profile, text);
  const prefix = confidence === "faible" ? "Lecture estimee automatiquement" : "Lecture automatique";
  const summary = top.length ? `${prefix}: profil plutot ${top.join(", ")}${desireChildren ? `, desir enfant: ${desireChildren}` : ""}.` : "Profil a completer pour analyser le caractere.";
  const basis = unique([
    safeList(profile.caracteristiques).length ? "caracteristiques saisies" : "",
    String(profile.notes || "").trim() ? "notes" : "",
    profile.categorieProfil ? "categorie profil" : "",
    profile.etudes ? "niveau d instruction" : "",
    profile.pratique ? "pratique religieuse" : "",
    profile.desirEnfants ? "desir enfant" : ""
  ]);
  return {
    metrics,
    traits,
    risks: unique(risks),
    summary,
    signature: top,
    desireChildren,
    confidence,
    basis
  };
}
function intelligenceAffinity(left, right) {
  const rightByKey = new Map(right.metrics.map((metric) => [metric.key, metric.value]));
  const similarity = left.metrics.reduce((sum, metric) => {
    const other = rightByKey.get(metric.key) ?? 45;
    return sum + Math.max(0, 1 - Math.abs(metric.value - other) / 100);
  }, 0) / Math.max(1, left.metrics.length);
  const leftTraits = new Set(left.traits.map(normalizeText));
  const rightTraits = right.traits.map(normalizeText);
  const overlap = rightTraits.length ? rightTraits.filter((trait) => leftTraits.has(trait)).length / rightTraits.length : 0.35;
  const riskPenalty = Math.min(0.18, (left.risks.length + right.risks.length) * 0.03);
  return Math.max(0.15, Math.min(1, similarity * 0.72 + overlap * 0.28 - riskPenalty));
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function metricValue(intelligence, key) {
  return intelligence.metrics.find((metric) => metric.key === key)?.value ?? 45;
}
function educationRank(value) {
  return educationRankFromValue(value) ?? null;
}
function educationSimilarity(left, right, leftIntel, rightIntel) {
  const leftRank = educationRank(left.etudes);
  const rightRank = educationRank(right.etudes);
  if (leftRank !== null && rightRank !== null) {
    const gap = Math.abs(leftRank - rightRank);
    if (gap === 0) return 1;
    if (gap === 1) return 0.86;
    if (gap === 2) return 0.68;
    if (gap === 3) return 0.46;
    return 0.28;
  }
  const cultureGap = Math.abs(
    metricValue(leftIntel, "culture") - metricValue(rightIntel, "culture")
  );
  const ambitionGap = Math.abs(
    metricValue(leftIntel, "ambition") - metricValue(rightIntel, "ambition")
  );
  return clamp01(0.78 - cultureGap / 135 - ambitionGap / 220);
}
function dimensionSimilarity(left, right, keys) {
  const average = keys.reduce((sum, key) => {
    const gap = Math.abs(metricValue(left, key) - metricValue(right, key));
    return sum + clamp01(1 - gap / 100);
  }, 0) / Math.max(1, keys.length);
  return clamp01(average);
}
function tokenList(values) {
  return unique(
    values.flatMap((value) => normalizeText(value).split(/[,;/ ]+/)).filter((token) => token.length >= 4)
  );
}
function traitOverlap(wanted, actual) {
  const wantedTokens = tokenList(wanted);
  const actualText = normalizeText(safeList(actual).join(" "));
  if (!wantedTokens.length) return 0.62;
  if (!actualText) return 0.28;
  const hits = wantedTokens.filter((token) => actualText.includes(token)).length;
  return clamp01(hits / wantedTokens.length);
}
function noteKeywordOverlap(leftProfile, rightProfile) {
  const leftText = normalizeText(
    [
      leftProfile.notes,
      leftProfile.criteresRechercheAutre,
      leftProfile.impressionEchange,
      leftProfile.profession,
      leftProfile.visionFinanciere,
      leftProfile.mobiliteGeographique,
      leftProfile.belleFamille,
      leftProfile.preferencePhysique,
      leftProfile.physiqueProfil,
      safeList(leftProfile.hygieneVie).join(" "),
      safeList(leftProfile.gestionEmotionnelle).join(" "),
      safeList(leftProfile.rapportReseaux).join(" ")
    ].join(" ")
  );
  const rightText = normalizeText(
    [
      rightProfile.notes,
      rightProfile.criteresRechercheAutre,
      rightProfile.impressionEchange,
      rightProfile.profession,
      rightProfile.visionFinanciere,
      rightProfile.mobiliteGeographique,
      rightProfile.belleFamille,
      rightProfile.preferencePhysique,
      rightProfile.physiqueProfil,
      safeList(rightProfile.hygieneVie).join(" "),
      safeList(rightProfile.gestionEmotionnelle).join(" "),
      safeList(rightProfile.rapportReseaux).join(" ")
    ].join(" ")
  );
  const leftTokens = tokenList([leftText]).filter(
    (token) => !["avec", "pour", "dans", "cherche", "recherche", "profil", "mariage"].includes(token)
  );
  const rightTokens = tokenList([rightText]);
  if (!leftTokens.length || !rightTokens.length) return 0.5;
  const rightSet = new Set(rightTokens);
  const hits = leftTokens.filter(
    (token) => rightSet.has(token) || rightTokens.some((other) => other.includes(token) || token.includes(other))
  ).length;
  return clamp01(0.35 + hits / Math.max(1, leftTokens.length) * 0.65);
}
function humanCompatibility(leftProfile, rightProfile) {
  const left = analyzeProfileIntelligence(leftProfile);
  const right = analyzeProfileIntelligence(rightProfile);
  const education = educationSimilarity(leftProfile, rightProfile, left, right);
  const culture = dimensionSimilarity(left, right, ["culture", "ambition", "elegance"]);
  const character = intelligenceAffinity(left, right);
  const values = dimensionSimilarity(left, right, ["famille", "tradition", "calme", "sociabilite"]);
  const wantedTraits = (traitOverlap(leftProfile.caracteristiquesRecherche, rightProfile.caracteristiques) + traitOverlap(rightProfile.caracteristiquesRecherche, leftProfile.caracteristiques)) / 2;
  const noteOverlap = (noteKeywordOverlap(leftProfile, rightProfile) + noteKeywordOverlap(rightProfile, leftProfile)) / 2;
  const risks = [];
  const strengths = [];
  const traditionGap = Math.abs(metricValue(left, "tradition") - metricValue(right, "tradition"));
  const socialGap = Math.abs(metricValue(left, "sociabilite") - metricValue(right, "sociabilite"));
  const ambitionGap = Math.abs(metricValue(left, "ambition") - metricValue(right, "ambition"));
  const cultureGap = Math.abs(metricValue(left, "culture") - metricValue(right, "culture"));
  if (education >= 0.82) strengths.push("Niveau d instruction proche");
  if (culture >= 0.78) strengths.push("Niveau culturel/intellectuel proche");
  if (values >= 0.8) strengths.push("Valeurs et vision familiale proches");
  if (character >= 0.78) strengths.push("Temperament et personnalite compatibles");
  if (wantedTraits >= 0.78) strengths.push("Traits demandes retrouves dans les deux sens");
  if (noteOverlap >= 0.72) strengths.push("Notes et vocabulaire proches");
  if (dimensionSimilarity(left, right, ["elegance"]) >= 0.78)
    strengths.push("Elegance / presentation dans le meme esprit");
  if (education <= 0.38) risks.push("Ecart de niveau d instruction a verifier");
  if (cultureGap >= 42) risks.push("Ecart culturel ou intellectuel possible");
  if (traditionGap >= 46) risks.push("Difference tradition / modernite a clarifier");
  if (socialGap >= 48) risks.push("Rythme social different a verifier");
  if (ambitionGap >= 50) risks.push("Ambition / projet de vie different a verifier");
  if (wantedTraits <= 0.32) risks.push("Traits recherches peu retrouves");
  if (noteOverlap <= 0.35) risks.push("Notes peu similaires ou trop pauvres");
  if (left.risks.length + right.risks.length >= 3)
    risks.push("Plusieurs points de prudence dans les fiches");
  const penalty = Math.min(0.18, risks.length * 0.035);
  const score = clamp01(
    education * 0.24 + culture * 0.17 + character * 0.25 + values * 0.16 + wantedTraits * 0.1 + noteOverlap * 0.08 - penalty
  );
  const summary = score >= 0.75 ? "Compatibilite humaine forte: niveau, valeurs et temperament proches." : score >= 0.55 ? "Compatibilite humaine possible: bon potentiel mais certains points doivent etre confirmes." : "Compatibilite humaine fragile: a presenter seulement si les criteres stricts sont tres bons.";
  return {
    score,
    education,
    culture,
    character,
    values,
    strengths: unique(strengths).slice(0, 5),
    risks: unique(risks).slice(0, 5),
    summary
  };
}

// src/domain/matching/matchClassification.ts
var TIER_META = {
  match_probant: {
    tierLabel: "1 \xB7 Prioritaire",
    tierTone: "success",
    tierRank: 4
  },
  match_prometteur: {
    tierLabel: "2 \xB7 Prometteur",
    tierTone: "gold",
    tierRank: 3
  },
  match_alternatif: {
    tierLabel: "3 \xB7 \xC0 explorer",
    tierTone: "copper",
    tierRank: 2
  }
};
function pct(match, weights, key) {
  const max = weights[key] || 0;
  if (!max) return 1;
  if (!(key in match.details)) return 1;
  return Math.max(0, Math.min(1, (match.details[key] || 0) / max));
}
function acceptableAge(match, weights) {
  return pct(match, weights, "age") >= 0.72;
}
function acceptableLocation(match, weights) {
  return pct(match, weights, "zoneGeo") >= 0.65;
}
function severeWeaknesses(match, weights) {
  return [
    pct(match, weights, "enfants") < 0.45 && "projet enfants fragile",
    pct(match, weights, "pratique") < 0.45 && "religion/pratique fragile",
    pct(match, weights, "humanite") < 0.45 && "compatibilite humaine fragile",
    pct(match, weights, "etudes") < 0.42 && "niveau d'echange fragile",
    pct(match, weights, "descriptif") < 0.4 && "profil a clarifier"
  ].filter(Boolean);
}
function reserveCount(match, weights) {
  return Object.keys(weights).filter(
    (key) => pct(match, weights, key) < 0.55
  ).length;
}
function getMatchTier(match, source, target, weights) {
  const blockers = match.blocages.length;
  const ageOk = acceptableAge(match, weights);
  const locationOk = acceptableLocation(match, weights);
  const severe = severeWeaknesses(match, weights);
  const reserves = reserveCount(match, weights);
  const opening = ageOk && locationOk;
  let tier = "match_alternatif";
  let reason = "\xC0 explorer : plusieurs points restent \xE0 discuter avant une proposition.";
  if (blockers > 0) {
    tier = "match_alternatif";
    reason = `Blocage dur: ${match.blocages[0]}.`;
  } else if (match.score >= loadStudio().priorityScore && severe.length === 0 && opening && !match.reservations?.length) {
    tier = "match_probant";
    reason = "Compatibilite forte, age et localisation ouvrent une base serieuse.";
  } else if (match.score >= loadStudio().promisingScore && severe.length <= 1 && !match.reservations?.length) {
    tier = "match_prometteur";
    reason = severe.length > 0 ? `Bon potentiel, a clarifier: ${severe.slice(0, 2).join(", ")}.` : "Bon potentiel, points principaux assez coherents.";
  } else if (opening && match.score >= 38 && severe.length <= 4) {
    tier = "match_alternatif";
    reason = reserves >= 3 ? "Age et localisation compatibles: rencontre possible malgre plusieurs reserves." : "Age et localisation compatibles: duo a explorer sans le bloquer trop tot.";
  } else if (match.score >= 45 && blockers === 0 && severe.length <= 3) {
    tier = "match_alternatif";
    reason = "Duo imparfait mais non bloque: peut rester visible en option.";
  }
  const meta = TIER_META[tier];
  const names = [source.prenom, target.prenom].filter(Boolean).join(" + ");
  return {
    tier,
    ...meta,
    tierReason: names ? `${names}: ${reason}` : reason
  };
}

// src/domain/matching/relationshipTracking.ts
var DAY_MS = 24 * 60 * 60 * 1e3;

// src/lib/store.ts
var DEFAULT_WEIGHTS = {
  sexeRecherche: 0,
  age: 12,
  zoneGeo: 20,
  communaute: 5,
  situation: 8,
  enfants: 25,
  etudes: 20,
  pratique: 10,
  tags: 7,
  descriptif: 10,
  humanite: 18,
  qualiteProfil: 2
};
var SUSPICIOUS_STATUS = "Bloqu\xE9";
var RELIGION_OPTIONS = [
  "Islam",
  "Chretienne",
  "Judaisme",
  "Bouddhisme",
  "Hindouisme",
  "Spirituel(le) sans religion",
  "Laique",
  "Agnostique",
  "Athee",
  "Autre"
];
var RELIGION_RECHERCHE_OPTIONS = ["Pas important", ...RELIGION_OPTIONS];
function isProfileBanned(profile) {
  return profile.statut === "Bloque" || profile.statut === "Bloqu\xE9" || profile.statut === SUSPICIOUS_STATUS;
}
function isProfileVerificationComplete(profile) {
  if (profile.sexe !== "Homme" && profile.sexe !== "Femme") return false;
  return Boolean(
    profile.cameraGuestOk || profile.videoEnvoyee || profile.verificationPhoto || profile.verificationAudio
  );
}
function hasContactChannel(profile) {
  const phoneDigits = (profile.telephone || "").replace(/\D/g, "");
  return Boolean(
    (profile.tiktokUrl || "").trim() || (profile.contactAutre || "").trim() || phoneDigits.length >= 6
  );
}
var CURRENT_PROFILE_SCHEMA_VERSION = 4;
function pairKey(aId, bId) {
  return [aId, bId].sort().join("::");
}
function hasRejectedPair(a, b) {
  const key = pairKey(a.id, b.id);
  return a.rejectedPairIds.includes(key) || b.rejectedPairIds.includes(key);
}
var DAY_MS2 = 24 * 60 * 60 * 1e3;
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function emptyProfile() {
  return {
    id: generateId(),
    dateAjout: (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " "),
    prenom: "",
    tiktokUrl: "",
    tiktokAccountId: "",
    tiktokPhotoUrl: "",
    telephone: "",
    contactAutre: "",
    religion: "",
    religionAutre: "",
    religionRecherche: "",
    religionRechercheAutre: "",
    religionsAcceptees: [],
    fermeDifferencePratique: "",
    verificationPhoto: false,
    verificationAudio: false,
    cameraGuestOk: false,
    cameraGuestIssue: "",
    videoEnvoyee: false,
    consentementLive: false,
    consentementYoutube: false,
    consentementLiveAt: "",
    consentementYoutubeAt: "",
    otherLiveViews: [],
    otherLiveViewCount: 0,
    otherLiveStandByUntil: "",
    otherLiveStandByReleasedAt: "",
    tiktokNotFoundAt: "",
    tiktokNotFoundRecordedAt: "",
    plateformeSaisie: "",
    canalSaisie: "",
    sexe: "",
    age: null,
    ville: "",
    pays: "",
    situation: "",
    enfants: "",
    nbEnfants: 0,
    ageEnfants: "",
    desirEnfants: "",
    etudes: "",
    etudesPaysObtention: "",
    etudesRecherche: "Pas important",
    regleNiveauInstruction: "Pas important",
    niveauInstructionBloquant: false,
    niveauEtudeCategorie: "",
    niveauEtudeDetail: "",
    niveauEtudeFiliere: "",
    niveauEtudeFiliereAutre: "",
    profession: "",
    visionFinanciere: "",
    categorieProfil: "",
    notePhysique: null,
    tailleCm: null,
    tailleMinRechercheCm: null,
    hygieneVie: [],
    hygieneVieRecherche: [],
    preferencePhysique: "",
    physiqueProfil: "",
    proprietaire: "",
    situationAdministrative: "",
    origine: "",
    origineTags: [],
    villageOrigine: "",
    communaute: "",
    langue: "",
    pratique: "",
    pratiqueRecherche: "",
    recherche: "",
    ageMin: null,
    ageMax: null,
    zoneGeo: "",
    secteursADefaut: [],
    secteursRefuses: [],
    paysRechercheDetail: "",
    regionRechercheDetail: "",
    origineRechercheTags: [],
    caracteristiques: [],
    caracteristiquesRecherche: [],
    criteresRechercheAutre: "",
    autresInfos: "",
    rechercheFemmeHidjabiste: "",
    accepteDivorce: false,
    accepteVeuf: false,
    refuseDivorce: false,
    refuseVeuf: false,
    accepteEnfants: false,
    accepteUnEnfant: false,
    acceptePlusieursEnfants: false,
    kabyleUniquement: false,
    accepteSansPapiers: false,
    accepteSituationEnCours: false,
    accepteDuBled: false,
    cherchePapiers: false,
    fournisseurs: "",
    impressionEchange: "",
    mobiliteGeographique: "",
    belleFamille: "",
    gestionEmotionnelle: [],
    rapportReseaux: [],
    suiviRelation: "",
    notes: "",
    statut: "Nouveau",
    photoDataUrl: "",
    import_confidence: "",
    status_import: "",
    needs_manual_review: false,
    source_image: "",
    source_record_id: "",
    archive: false,
    archiveRestoredAt: "",
    archiveRestoreMode: "",
    standBy: false,
    rejectedPairIds: [],
    matchedPairId: "",
    matchedWithId: "",
    matchingSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION
  };
}
function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function containsKabyle(value) {
  const n = normalize(value);
  return n.includes("kabyle") || n.includes("kabylie");
}
function tagSet(values) {
  const set = /* @__PURE__ */ new Set();
  values.map(normalize).filter(Boolean).forEach((value) => {
    set.add(value);
    if (value.includes("kabyle")) set.add("kabyle");
    if (value.includes("chaoui")) set.add("chaoui");
    if (value.includes("touareg")) set.add("touareg");
    if (value.includes("amazigh") || value.includes("berbere")) {
      set.add("amazigh");
      set.add("berbere");
    }
  });
  return set;
}
function overlapScore(wanted, actual) {
  const wantedSet = tagSet(wanted);
  if (wantedSet.size === 0) return 0.5;
  const actualSet = tagSet(actual);
  let hits = 0;
  wantedSet.forEach((tag) => {
    if (actualSet.has(tag)) hits++;
  });
  return hits / wantedSet.size;
}
function safeProfileList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
function textTokens(value) {
  return normalize(value).split(/[^a-z0-9]+/).filter(
    (word) => word.length >= 4 && !["avec", "pour", "dans", "elle", "homme", "femme", "cherche", "profil"].includes(word)
  );
}
function textAffinity(a, b) {
  const aTokens = textTokens(
    [
      a.criteresRechercheAutre,
      safeProfileList(a.caracteristiquesRecherche).join(" "),
      safeProfileList(a.hygieneVieRecherche).join(" ")
    ].join(" ")
  );
  if (aTokens.length === 0) return 0.5;
  const target = normalize(
    [
      b.profession,
      b.visionFinanciere,
      b.mobiliteGeographique,
      b.belleFamille,
      b.ville,
      b.pays,
      b.communaute,
      b.villageOrigine,
      safeProfileList(b.hygieneVie).join(" "),
      safeProfileList(b.hygieneVieRecherche).join(" "),
      safeProfileList(b.gestionEmotionnelle).join(" "),
      safeProfileList(b.rapportReseaux).join(" "),
      safeProfileList(b.caracteristiques).join(" "),
      safeProfileList(b.caracteristiquesRecherche).join(" "),
      b.criteresRechercheAutre,
      b.autresInfos,
      b.etudes,
      safeProfileList(b.origineTags).join(" ")
    ].join(" ")
  );
  const hits = aTokens.filter((token) => target.includes(token)).length;
  return Math.min(1, hits / Math.min(aTokens.length, 8));
}
function sectorMatchesValue(sector, target) {
  const zone = normalize(sector);
  const targetPays = normalize(target.pays);
  const targetVille = normalize(target.ville);
  const targetText = actualLocationText(target);
  if (isFlexibleSectorText(zone)) return true;
  if (zone === "france") return targetPays === "france" || targetText.includes("france");
  if (zone === "algerie")
    return targetPays.includes("alger") || targetVille.includes("alger") || targetPays.includes("bled");
  if (zone === "autre que algerie") return !isAlgeriaProfile(target);
  if (zone === "canada") return targetPays === "canada";
  if (zone === "usa")
    return targetPays === "usa" || targetPays.includes("etat") || targetPays.includes("united");
  if (zone === "europe")
    return ["france", "espagne", "italie", "allemagne", "belgique", "suisse", "europe"].some(
      (x) => targetPays.includes(x)
    );
  if (zone === "amerique")
    return ["usa", "canada", "mexique", "amerique", "amer"].some((x) => targetPays.includes(x));
  if (zone === "autre") return true;
  return targetPays.includes(zone) || targetVille.includes(zone);
}
function hasRefusedSector(requester, target) {
  return safeProfileList(requester.secteursRefuses).some(
    (sector) => sectorMatchesValue(sector, target)
  );
}
function hasFallbackSector(requester, target) {
  return safeProfileList(requester.secteursADefaut).some(
    (sector) => sectorMatchesValue(sector, target)
  );
}
function locationDetailMatches(requester, target) {
  const country = normalize(requester.paysRechercheDetail);
  const region = normalize(requester.regionRechercheDetail);
  const targetCountry = normalize(target.pays);
  const targetText = actualLocationText(target);
  const countryOk = !country || targetCountry.includes(country) || targetText.includes(country);
  const regionOk = !region || targetText.includes(region);
  return countryOk && regionOk;
}
function hasLocationDetailPreference(profile) {
  return Boolean(
    normalize(profile.paysRechercheDetail) || normalize(profile.regionRechercheDetail)
  );
}
function primarySectorMatches(requester, target) {
  if (hasLocationDetailPreference(requester)) return locationDetailMatches(requester, target);
  return sectorMatchesValue(requester.zoneGeo, target);
}
function hasKnownLocation(profile) {
  return Boolean(actualLocationText(profile));
}
function hasExplicitSectorPreference(profile) {
  const zone = normalize(profile.zoneGeo);
  const hasZone = Boolean(zone && !isFlexibleSectorText(zone));
  return Boolean(
    hasZone || safeProfileList(profile.secteursADefaut).length || safeProfileList(profile.secteursRefuses).length || hasLocationDetailPreference(profile)
  );
}
function isFlexibleSectorText(value) {
  const text = normalize(value);
  if (!text) return true;
  return [
    "pas important",
    "n importe ou",
    "nimporte ou",
    "peu importe",
    "indifferent",
    "partout",
    "toute localisation",
    "toutes zones",
    "anywhere"
  ].some((label) => text.includes(label));
}
function regionMatches(requester, target) {
  const zone = normalize(requester.zoneGeo);
  const hasDetail = hasLocationDetailPreference(requester);
  if (hasRefusedSector(requester, target)) return false;
  if (isFlexibleSectorText(zone) && !hasDetail) return true;
  if (!hasKnownLocation(target)) return true;
  if (primarySectorMatches(requester, target)) return true;
  return hasFallbackSector(requester, target);
}
function actualLocationText(profile) {
  const residence = normalize([profile.pays, profile.ville].filter(Boolean).join(" "));
  if (residence) return residence;
  return normalize(
    [profile.villageOrigine, profile.origine].filter(Boolean).join(" ")
  );
}
function isAlgeriaProfile(profile) {
  const text = actualLocationText(profile);
  return text.includes("alger") || text.includes("bled");
}
function isAbroadProfile(profile) {
  const text = actualLocationText(profile);
  return [
    "autre que algerie",
    "hors algerie",
    "france",
    "europe",
    "amer",
    "canada",
    "usa",
    "etat",
    "united",
    "allemagne",
    "espagne",
    "italie",
    "belgique",
    "suisse"
  ].some((word) => text.includes(word));
}
function hasFlexibleSector(profile) {
  if (hasLocationDetailPreference(profile)) return false;
  return isFlexibleSectorText(profile.zoneGeo);
}
function searchesAbroad(profile) {
  if (hasFlexibleSector(profile)) return false;
  const text = normalize(
    [profile.zoneGeo, profile.paysRechercheDetail, profile.regionRechercheDetail].filter(Boolean).join(" ")
  );
  return [
    "france",
    "europe",
    "amer",
    "canada",
    "usa",
    "etat",
    "united",
    "allemagne",
    "espagne",
    "italie",
    "belgique",
    "suisse"
  ].some((word) => text.includes(word));
}
function requestedAbroadButTargetAlgeria(requester, target) {
  return hasExplicitSectorPreference(requester) && searchesAbroad(requester) && hasKnownLocation(target) && isAlgeriaProfile(target);
}
function defaultForeignAlgeriaBlock(a, b) {
  if (!hasKnownLocation(a) || !hasKnownLocation(b)) return false;
  if (hasFlexibleSector(a) || hasFlexibleSector(b)) return false;
  if (primarySectorMatches(a, b) && primarySectorMatches(b, a)) return false;
  const abroadVsAlgeria = isAbroadProfile(a) && isAlgeriaProfile(b) || isAbroadProfile(b) && isAlgeriaProfile(a);
  return abroadVsAlgeria && hasExplicitSectorPreference(a) && hasExplicitSectorPreference(b);
}
var AGE_TOLERANCE_YEARS = 2;
function hasHardPreference(profile, key) {
  return (profile.hardPreferences || []).includes(key);
}
function closedToPracticeDifference(profile) {
  return profile.fermeDifferencePratique === "Oui" || hasHardPreference(profile, "practice");
}
function ageToleranceFor(profile) {
  return hasHardPreference(profile, "age") ? 0 : AGE_TOLERANCE_YEARS;
}
function agePreferenceMatches(requester, target, tolerance = 0) {
  const hasMin = typeof requester.ageMin === "number";
  const hasMax = typeof requester.ageMax === "number";
  if (!hasMin && !hasMax) return true;
  if (typeof target.age !== "number") return true;
  if (hasMin && target.age < requester.ageMin - tolerance) return false;
  if (hasMax && target.age > requester.ageMax + tolerance) return false;
  return true;
}
function ageToleranceNotice(requester, target) {
  if (agePreferenceMatches(requester, target) || !agePreferenceMatches(requester, target, ageToleranceFor(requester)))
    return "";
  return `${requester.prenom || "Profil"} demande ${requester.ageMin ?? "?"}\u2013${requester.ageMax ?? "?"} ans, ${target.prenom || "l'autre"} a ${target.age} ans : \xE9cart tol\xE9r\xE9 \xE0 confirmer`;
}
function isNeverMarried(profile) {
  const situation = normalize(profile.situation);
  return situation.includes("jamais") || situation.includes("celib");
}
function acceptsTargetMaritalStatus(requester, target) {
  if (isNeverMarried(target)) return true;
  const targetSituation = normalize(target.situation);
  if (!targetSituation) return true;
  const divorcedLike = targetSituation.includes("divorce") || targetSituation.includes("separe") || targetSituation.includes("papier");
  const widowed = targetSituation.includes("veuf") || targetSituation.includes("veuve");
  if (divorcedLike && requester.refuseDivorce) return false;
  if (widowed && requester.refuseVeuf) return false;
  if (!isNeverMarried(requester)) return true;
  if (divorcedLike) return requester.accepteDivorce;
  if (widowed) return requester.accepteVeuf;
  return true;
}
function educationRankFromValue(value) {
  const text = normalize(value);
  if (!text || text === "pas important") return void 0;
  if (text.includes("doctorat") || text.includes("plus de bac+5")) return 8;
  if (text.includes("bac+5") || text.includes("bac 5") || text.includes("master")) return 7;
  if (text.includes("bac+4") || text.includes("bac 4")) return 6;
  if (text.includes("bac+3") || text.includes("bac 3")) return 5;
  if (text.includes("bac+2") || text.includes("bac 2") || text.includes("bac+")) return 4;
  if (text.includes("bac+1") || text.includes("bac 1")) return 3.5;
  if (text.includes("universitaire")) return 4;
  if (text.includes("bac")) return 3;
  if (text.includes("cap") || text.includes("bep") || text.includes("lycee")) return 2.5;
  if (text.includes("brevet") || text.includes("college")) return 2;
  if (text.includes("primaire termine")) return 1;
  if (text.includes("primaire")) return 0.5;
  if (text.includes("sans diplome")) return 0;
  if (text.includes("autodidacte") || text.includes("formation professionnelle")) return 3;
  return void 0;
}
function educationRankValue(value) {
  return educationRankFromValue(value);
}
function educationPreferenceActive(profile) {
  const wanted = normalize(profile.etudesRecherche);
  const rule = normalize(profile.regleNiveauInstruction);
  return Boolean(wanted && wanted !== "pas important" || rule && rule !== "pas important");
}
function educationMinimumStatus(requester, target) {
  if (!educationPreferenceActive(requester)) return "ok";
  const rule = normalize(requester.regleNiveauInstruction);
  if (rule.includes("meme categorie")) {
    if (!requester.niveauEtudeCategorie || !target.niveauEtudeCategorie) return "unknown";
    return requester.niveauEtudeCategorie === target.niveauEtudeCategorie ? "ok" : "below";
  }
  if (rule.includes("meme detail")) {
    if (!requester.niveauEtudeDetail || !target.niveauEtudeDetail) return "unknown";
    return requester.niveauEtudeCategorie === target.niveauEtudeCategorie && requester.niveauEtudeDetail === target.niveauEtudeDetail ? "ok" : "below";
  }
  const wantedRank = educationRankValue(requester.etudesRecherche);
  const actualRank = educationRankValue(target.etudes);
  if (rule.includes("proche")) {
    const requesterRank = educationRankValue(requester.etudes);
    if (typeof requesterRank !== "number" || typeof actualRank !== "number") return "unknown";
    return Math.abs(requesterRank - actualRank) <= 1 ? "ok" : "below";
  }
  if (typeof wantedRank !== "number" || typeof actualRank !== "number") return "unknown";
  return actualRank >= wantedRank ? "ok" : "below";
}
function educationBlockReason(requester, target, suffix = "") {
  if (!requester.niveauInstructionBloquant) return "";
  const status = educationMinimumStatus(requester, target);
  const rule = requester.regleNiveauInstruction || "Minimum demande";
  if (status === "below") return `Niveau d instruction incompatible (${rule})${suffix}`;
  if (status === "unknown")
    return `Niveau d instruction demande mais non renseigne/comparable (${rule})${suffix}`;
  return "";
}
function educationPreferenceScore(requester, target) {
  if (!educationPreferenceActive(requester)) return 1;
  const wanted = normalize(requester.etudesRecherche);
  const rule = normalize(requester.regleNiveauInstruction);
  if (rule.includes("meme categorie")) {
    if (!requester.niveauEtudeCategorie || !target.niveauEtudeCategorie) return 0.45;
    return requester.niveauEtudeCategorie === target.niveauEtudeCategorie ? 1 : 0.2;
  }
  if (rule.includes("meme detail")) {
    if (!requester.niveauEtudeDetail || !target.niveauEtudeDetail) return 0.35;
    if (requester.niveauEtudeCategorie === target.niveauEtudeCategorie && requester.niveauEtudeDetail === target.niveauEtudeDetail)
      return 1;
    return requester.niveauEtudeCategorie === target.niveauEtudeCategorie ? 0.45 : 0.15;
  }
  if (rule.includes("proche")) {
    const requesterRank = educationRankValue(requester.etudes);
    const actualRank2 = educationRankValue(target.etudes);
    if (typeof requesterRank !== "number" || typeof actualRank2 !== "number") return 0.45;
    const gap = Math.abs(requesterRank - actualRank2);
    if (gap === 0) return 1;
    if (gap <= 1) return 0.82;
    if (gap <= 2) return 0.52;
    return 0.22;
  }
  if (!wanted || wanted === "pas important") return 1;
  const actual = normalize(target.etudes);
  if (!actual) return 0.25;
  if (actual === wanted) return 1;
  const wantedRank = educationRankValue(wanted);
  const actualRank = educationRankValue(actual);
  if (typeof wantedRank === "number" && typeof actualRank === "number") {
    const gap = Math.abs(wantedRank - actualRank);
    if (actualRank >= wantedRank) return 0.9;
    if (gap <= 1) return 0.65;
    if (gap <= 2) return 0.4;
  }
  return 0.2;
}
function wantsChildren(value) {
  return normalize(value).startsWith("oui");
}
function refusesChildrenProject(value) {
  return normalize(value) === "non";
}
function acceptsTargetChildren(requester, target) {
  if (target.enfants !== "Oui") return true;
  if (target.nbEnfants > 1) return requester.acceptePlusieursEnfants;
  return requester.accepteEnfants || requester.accepteUnEnfant || requester.acceptePlusieursEnfants;
}
function childProjectConflict(a, b) {
  return wantsChildren(a.desirEnfants) && refusesChildrenProject(b.desirEnfants) || wantsChildren(b.desirEnfants) && refusesChildrenProject(a.desirEnfants);
}
function practicePreferenceScore(requester, target) {
  const wanted = practiceCategory(requester.pratiqueRecherche);
  if (!wanted) return 0.7;
  const actual = practiceCategory(target.pratique);
  if (!actual) return 0.25;
  return actual === wanted ? 1 : 0.2;
}
function religionPreferenceMatches(requester, target) {
  const accepted = religionAccepted(requester, target);
  return accepted === null || accepted === true;
}
function religionPreferenceScore(requester, target) {
  const accepted = religionAccepted(requester, target);
  if (accepted === null) return 0.72;
  if (accepted === "unknown") return 0.18;
  return accepted ? 1 : 0;
}
function agePreferenceScore(requester, target) {
  const hasMin = typeof requester.ageMin === "number";
  const hasMax = typeof requester.ageMax === "number";
  if (!hasMin && !hasMax) return 0.7;
  if (typeof target.age !== "number") return 0.35;
  if (agePreferenceMatches(requester, target)) return 1;
  const under = hasMin ? Math.max(0, requester.ageMin - target.age) : 0;
  const over = hasMax ? Math.max(0, target.age - requester.ageMax) : 0;
  const gap = Math.max(under, over);
  if (gap <= 2) return 0.75;
  if (gap <= 5) return 0.45;
  return 0.15;
}
function heightMinimumStatus(requester, target) {
  if (!requester.tailleMinRechercheCm) return "unknown";
  if (!target.tailleCm) return "unknown";
  return target.tailleCm >= requester.tailleMinRechercheCm ? "ok" : "below";
}
function regionPreferenceScore(requester, target) {
  const zone = normalize(requester.zoneGeo);
  const hasDetail = hasLocationDetailPreference(requester);
  if (isFlexibleSectorText(zone) && !hasDetail) return 1;
  if (!hasKnownLocation(target)) return 0.52;
  return regionMatches(requester, target) ? 1 : 0.2;
}
function hygieneGroupValue(values, label) {
  const prefix = `${label}: `;
  const found = values.find((item) => item.startsWith(prefix));
  return normalize(found ? found.slice(prefix.length) : "");
}
function hygienePreferenceScore(requester, target) {
  const wanted = safeProfileList(requester.hygieneVieRecherche);
  const actual = safeProfileList(target.hygieneVie);
  const groups = ["Fumeur", "Sport", "Alcool", "Chemma"];
  const activeGroups = groups.filter((group) => {
    if (group !== "Sport" && target.sexe !== "Homme") return false;
    const value = hygieneGroupValue(wanted, group);
    return value && value !== "indifferent";
  });
  if (activeGroups.length === 0) return 0.72;
  const scores = activeGroups.map((group) => {
    const expected = hygieneGroupValue(wanted, group);
    const current = hygieneGroupValue(actual, group);
    if (!current) return 0.45;
    if (current === expected) return 1;
    if (expected === "non" && current === "oui") return 0.08;
    if (expected === "non" && current === "occasionnel") return 0.45;
    if (expected === "oui" && current === "occasionnel") return 0.65;
    if (expected === "occasionnel" && current === "non") return 0.72;
    return 0.25;
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}
function hygieneHardBlockReasons(requester, target, suffix = "") {
  const wanted = safeProfileList(requester.hygieneVieRecherche);
  const actual = safeProfileList(target.hygieneVie);
  const groups = ["Fumeur", "Sport", "Alcool", "Chemma"];
  const reasons = [];
  groups.forEach((group) => {
    const expected = hygieneGroupValue(wanted, group);
    if (!expected || expected === "indifferent") return;
    if (group !== "Sport" && target.sexe !== "Homme") return;
    const current = hygieneGroupValue(actual, group);
    if (!current) return;
    if (expected === "non" && (current === "oui" || current === "occasionnel")) {
      reasons.push(`Hygiene de vie incompatible: ${group.toLowerCase()} refuse${suffix}`);
      return;
    }
    if (expected === "oui" && current === "non") {
      reasons.push(`Hygiene de vie incompatible: ${group.toLowerCase()} demande${suffix}`);
    }
  });
  return reasons;
}
function hardBlocks(a, b) {
  const blocages = [];
  const aHasSearch = Boolean(a.recherche);
  const bHasSearch = Boolean(b.recherche);
  if (a.sexe && b.sexe && a.sexe === b.sexe)
    blocages.push("Duo invalide: il faut un homme et une femme");
  if (aHasSearch && b.sexe && a.recherche !== b.sexe) blocages.push("Sexe recherche incompatible");
  if (bHasSearch && a.sexe && b.recherche !== a.sexe)
    blocages.push("Sexe recherche incompatible en retour");
  if (!agePreferenceMatches(a, b, ageToleranceFor(a))) blocages.push("Age demande non respecte");
  if (!agePreferenceMatches(b, a, ageToleranceFor(b)))
    blocages.push("Age demande non respecte en retour");
  for (const [requester, target, suffix] of [
    [a, b, ""],
    [b, a, " en retour"]
  ]) {
    if ((typeof requester.ageMin === "number" || typeof requester.ageMax === "number") && typeof target.age !== "number")
      blocages.push("Age demande non verifiable : age a renseigner" + suffix);
    if ((!isFlexibleSectorText(requester.zoneGeo) || hasLocationDetailPreference(requester)) && !hasKnownLocation(target))
      blocages.push("Secteur demande non verifiable : lieu de vie a renseigner" + suffix);
    if (!normalize(target.situation) && (requester.refuseDivorce || requester.refuseVeuf || isNeverMarried(requester) && !(requester.accepteDivorce && requester.accepteVeuf)))
      blocages.push("Situation matrimoniale a renseigner (exigence non verifiable)" + suffix);
    if (requester.tailleMinRechercheCm && !target.tailleCm)
      blocages.push("Taille minimum demandee non verifiable : taille a renseigner" + suffix);
  }
  if (!acceptsTargetMaritalStatus(a, b))
    blocages.push(
      "Situation matrimoniale refusee: jamais marie(e) demande sauf acceptation explicite"
    );
  if (!acceptsTargetMaritalStatus(b, a))
    blocages.push(
      "Situation matrimoniale refusee en retour: jamais marie(e) demande sauf acceptation explicite"
    );
  if (!acceptsTargetChildren(a, b)) blocages.push("Enfants du profil refuse(s)");
  if (!acceptsTargetChildren(b, a)) blocages.push("Enfants du profil refuse(s) en retour");
  if (childProjectConflict(a, b)) blocages.push("Desir d enfant incompatible");
  const educationBlockA = educationBlockReason(a, b);
  const educationBlockB = educationBlockReason(b, a, " en retour");
  if (educationBlockA) blocages.push(educationBlockA);
  if (educationBlockB) blocages.push(educationBlockB);
  blocages.push(...hygieneHardBlockReasons(a, b));
  blocages.push(...hygieneHardBlockReasons(b, a, " en retour"));
  if (heightMinimumStatus(a, b) === "below") blocages.push("Taille sous le minimum demande");
  if (heightMinimumStatus(b, a) === "below")
    blocages.push("Taille sous le minimum demande en retour");
  if (!regionMatches(a, b)) blocages.push("Secteur demande non respecte");
  if (!regionMatches(b, a)) blocages.push("Secteur demande non respecte en retour");
  if (requestedAbroadButTargetAlgeria(a, b))
    blocages.push(
      "Incompatibilite majeure secteur: profil demande a l etranger, personne en Algerie"
    );
  if (requestedAbroadButTargetAlgeria(b, a))
    blocages.push(
      "Incompatibilite majeure secteur en retour: profil demande a l etranger, personne en Algerie"
    );
  if (defaultForeignAlgeriaBlock(a, b))
    blocages.push("Incompatibilite majeure secteur: Algerie / etranger par defaut");
  if (!a.accepteSansPapiers && b.situationAdministrative === "Pas OK")
    blocages.push("Situation administrative refusee");
  if (!b.accepteSansPapiers && a.situationAdministrative === "Pas OK")
    blocages.push("Situation administrative refusee en retour");
  if (!a.accepteSituationEnCours && b.situationAdministrative === "Situation en cours")
    blocages.push("Situation administrative en cours refusee");
  if (!b.accepteSituationEnCours && a.situationAdministrative === "Situation en cours")
    blocages.push("Situation administrative en cours refusee en retour");
  if (!religionPreferenceMatches(a, b)) blocages.push("Religion recherchee incompatible");
  if (!religionPreferenceMatches(b, a)) blocages.push("Religion recherchee incompatible en retour");
  if (a.recherche === "Femme" && a.rechercheFemmeHidjabiste === "Oui" && b.sexe === "Femme" && !safeProfileList(b.caracteristiques).includes("Hidjabiste"))
    blocages.push("Femme hidjabiste demandee");
  if (b.recherche === "Femme" && b.rechercheFemmeHidjabiste === "Oui" && a.sexe === "Femme" && !safeProfileList(a.caracteristiques).includes("Hidjabiste"))
    blocages.push("Femme hidjabiste demandee en retour");
  if (a.recherche === "Femme" && a.rechercheFemmeHidjabiste === "Non" && b.sexe === "Femme" && safeProfileList(b.caracteristiques).includes("Hidjabiste"))
    blocages.push("Femme non hidjabiste demandee");
  if (b.recherche === "Femme" && b.rechercheFemmeHidjabiste === "Non" && a.sexe === "Femme" && safeProfileList(a.caracteristiques).includes("Hidjabiste"))
    blocages.push("Femme non hidjabiste demandee en retour");
  for (const [requester, target, suffix] of [
    [a, b, ""],
    [b, a, " en retour"]
  ]) {
    const origins = safeProfileList(requester.origineRechercheTags);
    const actualOrigins = [
      target.communaute,
      target.origine,
      ...safeProfileList(target.origineTags)
    ].filter(Boolean);
    const canonical = (value) => normalize(value).replace(/\s*\([^)]*\)/g, "").trim();
    if (origins.length && !origins.some((want) => actualOrigins.some((actual) => canonical(want) === canonical(actual))))
      blocages.push("Origine / communaut\xE9 recherch\xE9e non confirm\xE9e" + suffix);
    const wanted = practiceCategory(requester.pratiqueRecherche);
    if (wanted && practiceCategory(target.pratique) !== wanted)
      blocages.push(
        closedToPracticeDifference(requester) ? `Ferm\xE9(e) \xE0 une diff\xE9rence de pratique : ${requester.prenom || "l'un"} exige \xAB ${requester.pratiqueRecherche} \xBB, ${target.prenom || "l'autre"} : \xAB ${target.pratique || "non renseign\xE9e"} \xBB` : `Pratique religieuse diff\xE9rente : ${requester.prenom || "l'un"} souhaite \xAB ${requester.pratiqueRecherche} \xBB, ${target.prenom || "l'autre"} : \xAB ${target.pratique || "non renseign\xE9e"} \xBB (\xE0 \xE9voquer, non bloquant)`
      );
  }
  const moneyWork = workMoneyCompatibility(a, b);
  if (moneyWork.score <= 0.2 && moneyWork.reason) blocages.push(moneyWork.reason);
  return blocages;
}
function profileCreatedTimestamp(profile) {
  const parsed = Date.parse(profile.dateAjout || "");
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
function desireChildrenScore(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right || left === "pas important" || right === "pas important") return 0.72;
  if (left === right) return 1;
  if (left.startsWith("oui") && right === "non" || left === "non" && right.startsWith("oui"))
    return 0.05;
  if (left === "peut-etre" || right === "peut-etre") return 0.58;
  return 0.45;
}
function womanWorkProfile(profile) {
  const value = normalize(profile.visionFinanciere);
  const hasEducation = Boolean(profile.etudes && profile.etudes !== "Pas important");
  const hasProfession = Boolean(profile.profession.trim());
  if (!value || value === "pas indique") return "unknown";
  if (value.includes("ne veut pas travailler")) return "no";
  if (value.includes("obligatoirement")) return "required";
  if (value.includes("si necessaire")) return "if_needed";
  if (value.includes("epanouissement"))
    return hasEducation || hasProfession ? "fulfillment" : "fulfillment_unclear";
  return "legacy";
}
function manWorkPreference(profile) {
  const value = normalize(profile.visionFinanciere);
  if (!value || value === "pas indique") return "unknown";
  if (value.includes("ne travaille pas")) return "no";
  if (value.includes("50/50")) return "fifty";
  if (value.includes("aider")) return "help";
  if (value.includes("epanouissement")) return "fulfillment";
  return "legacy";
}
function workMoneyCompatibility(a, b) {
  const man = a.sexe === "Homme" ? a : b.sexe === "Homme" ? b : null;
  const woman = a.sexe === "Femme" ? a : b.sexe === "Femme" ? b : null;
  if (!man || !woman) return { score: 0.58, reason: "" };
  const manPreference = manWorkPreference(man);
  const womanProfile = womanWorkProfile(woman);
  if (manPreference === "unknown" || womanProfile === "unknown")
    return { score: 0.58, reason: "Travail de la femme a clarifier" };
  if (manPreference === "legacy" || womanProfile === "legacy")
    return { score: 0.62, reason: "Ancienne vision financiere a requalifier" };
  if (manPreference === "no") {
    if (womanProfile === "no")
      return { score: 1, reason: "Accord: femme ne souhaite pas travailler" };
    return { score: 0.18, reason: "Incompatibilite argent/travail: femme souhaite travailler" };
  }
  if (womanProfile === "no") {
    return manPreference === "fulfillment" ? { score: 0.48, reason: "Travail non prioritaire, a confirmer" } : { score: 0.28, reason: "Incompatibilite argent/travail: homme attend une contribution" };
  }
  if (manPreference === "fifty" && womanProfile === "required")
    return { score: 1, reason: "Accord: femme veut travailler et 50/50 possible" };
  if (manPreference === "fifty") return { score: 0.78, reason: "50/50 possible mais a confirmer" };
  if (manPreference === "help" && (womanProfile === "if_needed" || womanProfile === "required"))
    return { score: 0.9, reason: "Accord: travail possible pour aider le foyer" };
  if (manPreference === "help")
    return { score: 0.7, reason: "Aide financiere possible mais motivation differente" };
  if (manPreference === "fulfillment" && womanProfile === "fulfillment")
    return { score: 1, reason: "Accord: travail pour epanouissement" };
  if (manPreference === "fulfillment" && womanProfile === "fulfillment_unclear")
    return {
      score: 0.72,
      reason: "Epanouissement souhaite, coherence etudes/profession a verifier"
    };
  return { score: 0.76, reason: "Travail de la femme compatible a confirmer" };
}
function sharedFreeWords(a, b) {
  const pool = (p) => normalize(
    [p.autresInfos, p.profession, p.etudes, safeProfileList(p.caracteristiques).join(" ")].join(" ")
  );
  const found = /* @__PURE__ */ new Set();
  textTokens(a.criteresRechercheAutre || "").forEach((t) => {
    if (pool(b).includes(t)) found.add(t);
  });
  textTokens(b.criteresRechercheAutre || "").forEach((t) => {
    if (pool(a).includes(t)) found.add(t);
  });
  return Array.from(found).slice(0, 5);
}
function installationFit(a, b) {
  const out = { delta: 0, reasons: [], risks: [] };
  const moves = (p) => normalize(p.mobiliteGeographique || "").startsWith("oui");
  const stays = (p) => normalize(p.mobiliteGeographique || "") === "non";
  const crossBorder = hasKnownLocation(a) && hasKnownLocation(b) && (isAbroadProfile(a) && isAlgeriaProfile(b) || isAbroadProfile(b) && isAlgeriaProfile(a));
  if (crossBorder) {
    const abroad = isAbroadProfile(a) ? a : b;
    const home = abroad === a ? b : a;
    if (moves(home)) {
      out.delta += 3;
      out.reasons.push("La personne vivant au pays est prete a s installer a l etranger");
    } else if (stays(home) && !moves(abroad)) {
      out.delta -= 8;
      out.risks.push("Installation : aucun des deux n est pret a changer de pays, a clarifier avant tout echange");
    }
    if (a.situationAdministrative === "Situation en cours" || b.situationAdministrative === "Situation en cours")
      out.risks.push("Demarches administratives en cours : prevoir un delai avant de se projeter");
  }
  for (const [asker, other] of [[a, b], [b, a]]) {
    const who = asker.prenom || "Profil";
    if (other.situationAdministrative === "Pas OK" && asker.accepteSansPapiers) {
      out.delta += 2;
      out.reasons.push(who + " accepte une personne sans papiers");
    } else if (!other.situationAdministrative && !asker.accepteSansPapiers) {
      out.delta -= 4;
      out.risks.push(
        "Installation / papiers : situation administrative de " + (other.prenom || "l autre") + " non renseignee, " + who + " refuse les personnes sans papiers : a verifier"
      );
    }
  }
  const fa = normalize(a.belleFamille || "");
  const fb = normalize(b.belleFamille || "");
  if (fa && fb && fa !== "pas indique" && fb !== "pas indique") {
    if (fa === fb && !fa.includes("intrusive") && !fa.includes("clarifier")) {
      out.delta += 2;
      out.reasons.push("Meme vision de la place de la belle-famille");
    } else if (fa.includes("intrusive") !== fb.includes("intrusive") || fa.includes("proche") !== fb.includes("proche")) {
      out.delta -= 3;
      out.risks.push("Place de la belle-famille a clarifier ensemble");
    }
  }
  out.delta = Math.max(-10, Math.min(5, out.delta));
  return out;
}
function computeMatch(a, b, weights, mode = "expanded") {
  const raisons = [];
  const preferences = hardBlocks(a, b);
  const reservations = preferences.filter(
    (reason) => mode === "expanded" ? softPreference(reason, a, b) : isNegotiablePreference(reason, a, b)
  );
  for (const notice of [ageToleranceNotice(a, b), ageToleranceNotice(b, a)])
    if (notice) reservations.push(notice);
  for (const person of [a, b]) {
    const missing = [
      !person.situation && "situation matrimoniale",
      !person.enfants && "enfants actuels",
      !person.desirEnfants && "projet d\u2019enfants",
      !person.religion && "religion",
      !person.pratique && "pratique",
      !person.zoneGeo && "secteur souhait\xE9"
    ].filter(Boolean);
    if (missing.length)
      reservations.push((person.prenom || "Profil") + " : \xE0 renseigner \u2014 " + missing.join(", "));
  }
  const blocages = preferences.filter(
    (reason) => !(mode === "expanded" ? softPreference(reason, a, b) : isNegotiablePreference(reason, a, b))
  );
  if (hasRefusedSector(a, b)) blocages.push("Secteur explicitement refus\xE9");
  if (hasRefusedSector(b, a)) blocages.push("Secteur explicitement refus\xE9 en retour");
  if (isProfileBanned(a)) blocages.push("Profil source dans la ban profils: matching interdit");
  if (isProfileBanned(b)) blocages.push("Profil propose dans la ban profils: matching interdit");
  if (a.standBy) blocages.push("Profil source en stand by: matching bloque");
  if (b.standBy) blocages.push("Profil propose en stand by: matching bloque");
  if (hasRejectedPair(a, b)) blocages.push("Duo deja dematche/refuse: rematching interdit");
  if (a.matchedPairId)
    blocages.push("Profil source deja matche: dematch obligatoire avant nouveau matching");
  if (b.matchedPairId)
    blocages.push("Profil propose deja matche: dematch obligatoire avant nouveau matching");
  if (a.statut === "En match" || a.statut === "En couple")
    blocages.push("Profil source indisponible: deja en match ou en couple");
  if (b.statut === "En match" || b.statut === "En couple")
    blocages.push("Profil propose indisponible: deja en match ou en couple");
  if (a.archive || a.statut === "Clos")
    blocages.push("Profil source clos/archive: matching bloque");
  if (b.archive || b.statut === "Clos")
    blocages.push("Profil propose clos/archive: matching bloque");
  const sourceIdentityMissing = identityMissingLabels(a);
  const targetIdentityMissing = identityMissingLabels(b);
  if (!hasMatchingIdentity(a))
    blocages.push(`Profil source identite incomplete: ${sourceIdentityMissing.join(", ")}`);
  if (!hasMatchingIdentity(b))
    blocages.push(`Profil propose identite incomplete: ${targetIdentityMissing.join(", ")}`);
  for (const [person, label] of [
    [a, "source"],
    [b, "propose"]
  ]) {
    if (!hasContactChannel(person))
      blocages.push(`Profil ${label} sans contact (lien ou telephone) : matching bloque`);
    if (!isProfileVerificationComplete(person))
      blocages.push(`Profil ${label} non valide (photo, audio, video ou camera guest) : matching bloque`);
  }
  const details = {};
  const educationWanted = educationPreferenceActive(a) || educationPreferenceActive(b);
  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0) - weights.sexeRecherche - (educationWanted ? 0 : weights.etudes) || 1;
  if (blocages.length > 0) {
    const blockedResult = {
      profile: b,
      score: 0,
      raisons,
      blocages,
      details,
      propositions: ["Match nul: un critere bloquant n'est pas respecte."]
    };
    return { ...blockedResult, ...getMatchTier(blockedResult, a, b, weights) };
  }
  const ageScore = (agePreferenceScore(a, b) + agePreferenceScore(b, a)) / 2;
  details.age = weights.age * ageScore;
  if (ageScore >= 0.75) raisons.push("Ages compatibles ou proches");
  const geoScore = (regionPreferenceScore(a, b) + regionPreferenceScore(b, a)) / 2;
  details.zoneGeo = weights.zoneGeo * geoScore;
  if (geoScore >= 0.75) raisons.push("Region compatible ou flexible");
  const originA = [a.communaute, a.origine, ...safeProfileList(a.origineTags)].filter(Boolean);
  const originB = [b.communaute, b.origine, ...safeProfileList(b.origineTags)].filter(Boolean);
  const originScore = Math.min(
    overlapScore(a.origineRechercheTags, originB),
    overlapScore(b.origineRechercheTags, originA)
  );
  const villageA = normalize(a.villageOrigine || "");
  const villageB = normalize(b.villageOrigine || "");
  const villagesKnown = Boolean(villageA && villageB);
  const sameVillage = villagesKnown && villageA === villageB;
  const villageScore = !villagesKnown ? 0.5 : sameVillage ? 1 : 0.2;
  const communityScore = Math.max(
    originScore,
    containsKabyle(originA.join(" ")) && containsKabyle(originB.join(" ")) ? 0.8 : 0.35
  );
  const cultureScore = villagesKnown ? communityScore * 0.6 + villageScore * 0.4 : communityScore;
  details.communaute = weights.communaute * cultureScore;
  if (sameVillage) raisons.push(`M\xEAme village d'origine : ${a.villageOrigine}`);
  else if (villagesKnown) raisons.push("Villages d'origine diff\xE9rents, \xE0 consid\xE9rer");
  if (details.communaute >= weights.communaute * 0.75)
    raisons.push("Origine/communaute compatible");
  const situationSame = a.situation && b.situation && a.situation === b.situation;
  details.situation = situationSame ? weights.situation : a.situation && b.situation ? weights.situation * 0.45 : weights.situation * 0.25;
  if (situationSame) raisons.push("Situation matrimoniale identique");
  const childStatusScore = a.enfants && b.enfants ? a.enfants === b.enfants ? 1 : 0.25 : 0.45;
  const childDesireScore = desireChildrenScore(a.desirEnfants, b.desirEnfants);
  details.enfants = weights.enfants * ((childStatusScore + childDesireScore) / 2);
  if (details.enfants >= weights.enfants * 0.72)
    raisons.push("Situation enfants et desir d enfant compatibles");
  const human = humanCompatibility(a, b);
  const educationFitScore = educationWanted ? (educationPreferenceScore(a, b) + educationPreferenceScore(b, a)) / 2 : 1;
  if (educationWanted) {
    details.etudes = weights.etudes * Math.max(educationFitScore, human.education * 0.92);
    if (educationFitScore >= 0.75 || human.education >= 0.82)
      raisons.push("Niveau d'instruction minimum respecte");
  }
  const religionScore = (religionPreferenceScore(a, b) + religionPreferenceScore(b, a)) / 2;
  if (religionScore >= 0.95 && (acceptedReligions(a).length || acceptedReligions(b).length))
    raisons.push("Religion recherchee compatible");
  const practiceWanted = Boolean(a.pratiqueRecherche || b.pratiqueRecherche);
  if (practiceWanted) {
    const practiceScore = (practicePreferenceScore(a, b) + practicePreferenceScore(b, a)) / 2;
    details.pratique = weights.pratique * (practiceScore * 0.75 + religionScore * 0.25);
    if (practiceScore >= 0.75) raisons.push("Pratique religieuse recherchee compatible");
  } else {
    const prA = normalize(a.pratique), prB = normalize(b.pratique);
    details.pratique = (prA && prB && prA === prB ? weights.pratique : prA && prB ? weights.pratique * 0.35 : weights.pratique * 0.2) * (0.75 + religionScore * 0.25);
    if (details.pratique >= weights.pratique * 0.8) raisons.push("Pratique religieuse proche");
  }
  const wantedByA = overlapScore(
    safeProfileList(a.caracteristiquesRecherche),
    safeProfileList(b.caracteristiques)
  );
  const wantedByB = overlapScore(
    safeProfileList(b.caracteristiquesRecherche),
    safeProfileList(a.caracteristiques)
  );
  details.tags = (wantedByA + wantedByB) / 2 * weights.tags;
  if (details.tags >= weights.tags * 0.7) raisons.push("Caracteristiques recherchees presentes");
  const noteScore = (textAffinity(a, b) + textAffinity(b, a)) / 2;
  const intelligenceScore = intelligenceAffinity(
    analyzeProfileIntelligence(a),
    analyzeProfileIntelligence(b)
  );
  const hygieneScore = (hygienePreferenceScore(a, b) + hygienePreferenceScore(b, a)) / 2;
  const moneyWork = workMoneyCompatibility(a, b);
  details.descriptif = (noteScore * 0.25 + intelligenceScore * 0.45 + hygieneScore * 0.15 + moneyWork.score * 0.15) * weights.descriptif;
  details.humanite = weights.humanite * human.score;
  if (details.descriptif >= weights.descriptif * 0.6)
    raisons.push("Caractere, notes et style compatibles");
  if (hygieneScore >= 0.82 && (safeProfileList(a.hygieneVieRecherche).length || safeProfileList(b.hygieneVieRecherche).length))
    raisons.push("Hygiene de vie recherchee compatible");
  if (human.score >= 0.75) raisons.push(human.summary);
  if (moneyWork.score >= 0.75 && moneyWork.reason) raisons.push(moneyWork.reason);
  human.strengths.slice(0, 3).forEach((reason) => raisons.push(reason));
  const quality = (assessProfileQuality(a).score + assessProfileQuality(b).score) / 200;
  details.qualiteProfil = quality * weights.qualiteProfil;
  const rawScore = Object.values(details).reduce((s, v) => s + v, 0);
  let score = Math.round(rawScore / totalWeight * 100);
  const essentialFit = educationWanted ? childDesireScore * 0.34 + educationFitScore * 0.28 + geoScore * 0.2 + religionScore * 0.18 : childDesireScore * 0.45 + geoScore * 0.3 + religionScore * 0.25;
  score = Math.round(score * (0.68 + essentialFit * 0.32));
  const install = installationFit(a, b);
  score = Math.max(0, Math.min(100, score + install.delta));
  raisons.unshift(...install.reasons);
  const freeWords = sharedFreeWords(a, b);
  if (freeWords.length) {
    score = Math.max(0, Math.min(100, score + Math.min(3, freeWords.length)));
    raisons.unshift(`Critere libre retrouve : ${freeWords.join(", ")}`);
  }
  if (human.score < 0.35) score = Math.min(score, 58);
  if (human.score < 0.25) score = Math.min(score, 45);
  if (childDesireScore < 0.4) score = Math.min(score, 42);
  if (geoScore < 0.45) score = Math.min(score, 55);
  if (hygieneScore < 0.35) score = Math.min(score, 62);
  if (moneyWork.score < 0.35) score = Math.min(score, 60);
  if (religionScore < 0.65) score = Math.min(score, 58);
  if (religionScore < 0.35) score = Math.min(score, 42);
  if (human.education < 0.32 && educationWanted && (a.niveauInstructionBloquant || b.niveauInstructionBloquant))
    score = Math.min(score, 54);
  install.risks.filter((risk) => risk.startsWith("Installation")).forEach((risk) => reservations.push(risk));
  const propositions = reservations.map((reason) => `\xC0 discuter : ${reason}`);
  if (score >= 70) propositions.push("Proposition forte: presenter ce profil en priorite.");
  else if (score >= 50)
    propositions.push("Proposition prudente: verifier les points faibles avant mise en relation.");
  else propositions.push("Proposition faible: garder en reserve seulement.");
  if (details.tags < weights.tags * 0.4)
    propositions.push("Demander plus d'informations sur le style/personnalite.");
  if (details.descriptif < weights.descriptif * 0.4)
    propositions.push("Completer la note descriptive pour ameliorer l'analyse.");
  if (educationWanted && details.etudes < weights.etudes * 0.45)
    propositions.push("Verifier le niveau d'instruction ou le niveau culturel attendu.");
  if (details.humanite < weights.humanite * 0.45)
    propositions.push(
      "Compatibilite humaine fragile: ne pas presenter sans echange supplementaire."
    );
  if (!villagesKnown)
    propositions.push("Compl\xE9ter le village d'origine des deux profils avant la d\xE9cision.");
  else if (!sameVillage)
    propositions.push(
      "V\xE9rifier si la diff\xE9rence de village d'origine est accept\xE9e par les deux profils."
    );
  human.risks.slice(0, 3).forEach((risk) => propositions.push(risk));
  install.risks.filter((risk) => !risk.startsWith("Installation")).forEach((risk) => propositions.push(risk));
  const result = {
    profile: b,
    score: Math.min(score, 100),
    reservations,
    acceptanceSource: directionalCompatibility(a, b, weights),
    acceptanceTarget: directionalCompatibility(b, a, weights),
    raisons,
    blocages,
    details,
    propositions
  };
  return { ...result, ...getMatchTier(result, a, b, weights) };
}
function findMatches(profile, all, weights, minScore = loadStudio().minScore) {
  if (profile.standBy || profile.archive || profile.statut === "Clos" || profile.statut === SUSPICIOUS_STATUS || profile.statut === "Bloque" || profile.statut === "En match" || profile.statut === "En couple" || profile.matchedPairId || !hasMatchingIdentity(profile))
    return [];
  return all.filter(
    (p) => p.id !== profile.id && !p.archive && p.statut !== "Clos" && p.statut !== SUSPICIOUS_STATUS && p.statut !== "Bloque" && p.statut !== "En match" && p.statut !== "En couple" && !p.standBy && !p.matchedPairId && hasMatchingIdentity(p) && !hasRejectedPair(profile, p)
  ).map((p) => computeMatch(profile, p, weights)).filter((m) => m.blocages.length === 0 && m.score >= minScore).sort(
    (a, b) => b.score - a.score || profileCreatedTimestamp(a.profile) - profileCreatedTimestamp(b.profile)
  );
}
function findBlockedMatches(profile, all, weights, limit = 12) {
  if (profile.standBy || profile.archive || profile.statut === "Clos" || profile.statut === SUSPICIOUS_STATUS || profile.statut === "Bloque" || profile.matchedPairId || !hasMatchingIdentity(profile))
    return [];
  return all.filter(
    (p) => p.id !== profile.id && !p.archive && p.statut !== "Clos" && p.statut !== SUSPICIOUS_STATUS && p.statut !== "Bloque" && !p.standBy && !p.matchedPairId && hasMatchingIdentity(p) && !hasRejectedPair(profile, p)
  ).map((p) => computeMatch(profile, p, weights)).filter((m) => m.score === 0 && m.blocages.length > 0).sort(
    (a, b) => a.blocages.length - b.blocages.length || (a.profile.prenom || "").localeCompare(b.profile.prenom || "")
  ).slice(0, limit);
}
function filledInfo(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "boolean") return value;
  return String(value ?? "").trim().length > 0;
}
function identityMissingLabels(profile) {
  const identity = [
    ["prenom / pseudo", profile.prenom],
    ["sexe", profile.sexe],
    ["age", profile.age],
    ["residence actuelle", profile.ville],
    ["pays de residence", profile.pays]
  ];
  return identity.filter(([, value]) => !filledInfo(value)).map(([label]) => label);
}
function assessProfileQuality(profile) {
  const required = [
    ["prenom", profile.prenom],
    ["sexe", profile.sexe],
    ["age", profile.age],
    ["ville", profile.ville],
    ["pays", profile.pays],
    ["village d'origine", profile.villageOrigine],
    ["situation", profile.situation],
    ["enfants", profile.enfants],
    ["desir enfant", profile.desirEnfants],
    ["recherche", profile.recherche],
    ["age min", profile.ageMin],
    ["age max", profile.ageMax],
    ["zone recherchee", profile.zoneGeo],
    ["mobilite", profile.mobiliteGeographique]
  ];
  const useful = [
    ["TikTok", profile.tiktokUrl],
    ["religion", profile.religion],
    ["niveau instruction", profile.etudes],
    ["profession", profile.profession],
    ["travail / argent couple", profile.visionFinanciere],
    ["categorie", profile.categorieProfil],
    ["situation administrative", profile.situationAdministrative],
    ["description profil", profile.caracteristiques],
    ["pratique recherchee", profile.pratiqueRecherche],
    ["niveau etudes recherche", profile.etudesRecherche],
    ["description recherche", profile.caracteristiquesRecherche],
    ["autre critere recherche", profile.criteresRechercheAutre],
    ["situation en cours acceptee", profile.accepteSituationEnCours],
    ["verification profil", isProfileVerificationComplete(profile)],
    ["plateforme saisie", profile.plateformeSaisie],
    ["impression echange", profile.impressionEchange],
    ["belle famille", profile.belleFamille],
    ["gestion emotionnelle", profile.gestionEmotionnelle],
    ["reseaux sociaux", profile.rapportReseaux],
    ["hygiene de vie", profile.hygieneVie],
    ["hygiene recherchee", profile.hygieneVieRecherche],
    ["taille", profile.tailleCm],
    ["taille minimum recherchee", profile.tailleMinRechercheCm],
    ["notes", profile.notes]
  ];
  const missing = required.filter(([, value]) => !filledInfo(value)).map(([label]) => label);
  const usefulMissing = useful.filter(([, value]) => !filledInfo(value)).map(([label]) => label);
  const requiredScore = required.filter(([, value]) => filledInfo(value)).length / required.length;
  const usefulScore = useful.filter(([, value]) => filledInfo(value)).length / useful.length;
  const score = Math.round(requiredScore * 75 + usefulScore * 25);
  const warnings = [];
  const suggestions = [];
  if (!profile.tiktokUrl) warnings.push("TikTok manquant");
  if (!isProfileVerificationComplete(profile)) warnings.push("verification incomplete");
  if (profile.standBy) warnings.push("profil en stand by");
  if (!profile.notes && safeProfileList(profile.caracteristiques).length === 0)
    warnings.push("profil peu descriptif");
  if (!profile.zoneGeo || profile.zoneGeo === "Pas important")
    suggestions.push("preciser la zone recherchee");
  if (!profile.ageMin || !profile.ageMax) suggestions.push("preciser la tranche d age recherchee");
  if (usefulMissing.length) suggestions.push(`completer: ${usefulMissing.slice(0, 3).join(", ")}`);
  return {
    score,
    level: score >= 80 && warnings.length === 0 ? "Pret a matcher" : score >= 55 ? "A completer" : "Risque",
    missing,
    warnings,
    suggestions: suggestions.slice(0, 4)
  };
}
function hasMatchingIdentity(profile) {
  return Boolean(profile.id && profile.prenom && profile.sexe);
}
function directionalCompatibility(a, b, w) {
  const factors = [
    [w.age, agePreferenceScore(a, b)],
    [w.zoneGeo, regionPreferenceScore(a, b)],
    [
      w.enfants,
      (desireChildrenScore(a.desirEnfants, b.desirEnfants) + (acceptsTargetChildren(a, b) ? 1 : 0)) / 2
    ],
    [w.pratique, (practicePreferenceScore(a, b) + religionPreferenceScore(a, b)) / 2],
    [w.tags, overlapScore(a.caracteristiquesRecherche, b.caracteristiques)],
    [w.humanite, humanCompatibility(a, b).score],
    [w.descriptif, textAffinity(a, b)]
  ];
  if (educationPreferenceActive(a)) factors.push([w.etudes, educationPreferenceScore(a, b)]);
  const total = factors.reduce((sum, [weight]) => sum + weight, 0);
  return total ? Math.round(100 * factors.reduce((sum, [weight, value]) => sum + weight * value, 0) / total) : 0;
}
export {
  DEFAULT_WEIGHTS,
  computeMatch,
  emptyProfile,
  findBlockedMatches,
  findMatches,
  hasMatchingIdentity
};
/*!
 * Quick Pair Pro · outil de matching LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
/*!
* Quick Pair Pro · outil de matching LFB · Lamia Femme Berbère
* © 2026 Lamia Bréchet Ighil. Tous droits réservés.
* Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
*/
