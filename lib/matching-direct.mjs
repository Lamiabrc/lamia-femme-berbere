// « Match en direct » : le moteur de Quick Pair Pro appliqué aux profils du site (annonces + fiches de l'outil).
// Réservé à l'administratrice. N'a aucun effet sur les règles de swipe des membres.
import { versOutil, zoneAccepte, choixPropres } from '../content/matching-options.mjs';

let moteur = null;
async function charger() {
  if (moteur) return moteur;
  // Le moteur lit localStorage à l'import : on lui fournit une version vide côté serveur.
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
  }
  moteur = await import('./vendor/quickpair-engine.mjs');
  return moteur;
}

// Le moteur attend du texte là où la base peut contenir une liste, un nombre ou rien : on remet chaque champ au bon type.
function typer(p, modele) {
  for (const [k, def] of Object.entries(modele)) {
    const v = p[k];
    if (typeof def === 'string') p[k] = Array.isArray(v) ? v.filter(Boolean).join(', ') : v == null ? '' : typeof v === 'object' ? '' : String(v);
    else if (Array.isArray(def)) p[k] = Array.isArray(v) ? v.map(String) : v ? String(v).split(/[,;|]/).map((x) => x.trim()).filter(Boolean) : [];
    else if (typeof def === 'boolean') p[k] = v === true;
  }
  return p;
}
const liste = (v) => (Array.isArray(v) ? v.map(String) : String(v || '').split(/[,;|]/).map((x) => x.trim()).filter(Boolean));
const sexe = (g) => (String(g || '').toLowerCase().startsWith('f') ? 'Femme' : 'Homme');

export function statutOutil(row) {
  // « en_match » du site = plus de place dans son abonnement, pas « déjà en couple » : ça ne doit pas empêcher Lamia de chercher.
  if (row.match_live_at) return 'En match';
  if (row.bloque_at) return 'Bloque';
  if (row.pause_at) return 'En pause';
  return 'Nouveau';
}

// Annonce du site (profil de membre) → profil de l'outil.
export async function profilDepuisAnnonce(a, ageAujourdhui) {
  const m = await charger();
  const base = versOutil({ ...a, age: a.age ?? ageAujourdhui ?? null, medias: a.medias || [] });
  const modele = m.emptyProfile();
  const p = typer({ ...modele, ...base }, modele);
  // Le parcours court n'a pas encore posé ces questions : pas de refus inventé
  // dans l'adaptateur du moteur. La base garde ces réponses absentes.
  if (a.matching?.inscriptionVersion === 1) for (const k of ['accepteDivorce','accepteVeuf','accepteEnfants','accepteUnEnfant','acceptePlusieursEnfants']) {
    if (!Object.hasOwn(a.matching,k)) p[k] = null;
  }
  p.id = `a-${a.ref}`;
  p.statut = statutOutil(a);
  p.standBy = a.status === 'a_verifier' ? false : Boolean(a.pause_at);
  p.archive = ['refusee', 'supprimee', 'suspendu'].includes(a.status);
  // Règle de l'appli : l'email suffit comme contact (le moteur exige un lien ou un téléphone).
  if (!p.tiktokUrl && !p.telephone && !p.contactAutre) p.contactAutre = a.email || 'contact via le site';
  // Le moteur compare « n importe ou » sans apostrophe ; et sur le site, Lamia valide elle-même : la vérification de l'outil (photo, audio…) ne doit pas bloquer.
  p.zoneGeo = String(p.zoneGeo || '').replace(/['’]/g, ' ');
  p.verificationPhoto = true;
  p.refSite = a.ref;
  p.placesPleines = Boolean(a.en_match);
  p.origineSite = 'annonce';
  return p;
}

// Fiche créée avec l'outil (table profils_outil) → profil de l'outil.
export async function profilDepuisFiche(f) {
  const m = await charger();
  const modele = m.emptyProfile();
  const p = { ...modele };
  Object.assign(p, {
    id: `f-${f.ref}`,
    prenom: f.prenom || f.pseudo || `Fiche ${f.ref}`,
    sexe: sexe(f.genre),
    recherche: sexe(f.genre) === 'Femme' ? 'Homme' : 'Femme',
    age: f.age ?? null,
    ageMin: f.age_min ?? null,
    ageMax: f.age_max ?? null,
    ville: f.ville || '',
    pays: f.pays || '',
    situation: f.situation || '',
    enfants: /^(oui|non)$/i.test(f.enfants || '') ? (/^oui$/i.test(f.enfants) ? 'Oui' : 'Non') : '',
    etudes: f.etudes || '',
    origine: f.origine || '',
    origineTags: f.origine ? [f.origine] : [],
    villageOrigine: f.village || '',
    religion: f.religion || '',
    pratique: f.pratique || '',
    religionRecherche: f.religion_recherche || '',
    pratiqueRecherche: f.pratique_recherche || '',
    profession: f.metier || '',
    zoneGeo: String(f.secteur || '').replace(/['’]/g, ' '),
    caracteristiques: liste(f.caracteristiques),
    hygieneVie: liste(f.mode_vie),
    autresInfos: f.profil || '',
    criteresRechercheAutre: f.recherche || '',
    statut: statutOutil(f),
    archive: Boolean(f.retire_at) || f.visible === false,
  });
  // Infos de matching complètes (colonne « matching ») et lien réseau privé : mêmes conversions que pour une annonce du site.
  const mm = f.matching && typeof f.matching === 'object' ? choixPropres(f.matching) : {};
  const v = versOutil({ ref: f.ref, prenom: p.prenom, genre: f.genre, age: f.age, ville: f.ville, pays: f.pays, matching: { ...mm, contactReseau: f.lien_reseau || '' }, medias: [] });
  const SAUF = new Set(['id', 'dateAjout', 'prenom', 'sexe', 'recherche', 'statut', 'archive', 'standBy', 'age', 'ageMin', 'ageMax']);
  const plein = (x) => !(x == null || x === '' || x === false || (Array.isArray(x) && !x.length));
  for (const k of Object.keys(v)) if (!SAUF.has(k) && plein(v[k]) && !plein(p[k])) p[k] = v[k];
  typer(p, modele);
  p.verificationPhoto = true;
  // Le contact : le lien réseau s'il existe, sinon « géré dans l'outil » (le moteur exige un contact).
  p.contactAutre = p.contactAutre || p.tiktokUrl || 'géré dans l’outil';
  p.refSite = f.ref;
  p.origineSite = 'fiche';
  return p;
}

const resume = (r) => ({
  ref: r.profile.refSite,
  prenom: r.profile.prenom,
  age: r.profile.age,
  ville: r.profile.ville,
  pays: r.profile.pays,
  source: r.profile.origineSite,
  score: Math.round(r.score),
  palier: r.tierLabel,
  raisons: r.raisons.slice(0, 6),
  blocages: r.blocages,
  reserves: r.reservations || [],
});

// Pour un profil, renvoie : les compatibles, et ceux « à un critère près » (un seul blocage).
export async function compatiblesDe(cible, tous, { limite = 30, minScore = 0 } = {}) {
  const m = await charger();
  const autres = tous.filter((p) => p.id !== cible.id);
  const compatibles = m.findMatches(cible, autres, m.DEFAULT_WEIGHTS, minScore).slice(0, limite).map(resume);
  const bloques = m.findBlockedMatches(cible, autres, m.DEFAULT_WEIGHTS, 60).map(resume);
  return { compatibles, unCritere: bloques.filter((b) => b.blocages.length === 1).slice(0, 12), bloques: bloques.length };
}

// Marge d'âge du match en direct : exactement 2 ans (le moteur applique la même).
export const MARGE_AGE_DIRECT = 2;

// Infos absentes pour lesquelles le moteur prend une valeur par défaut (« pas de contrainte ») : Lamia doit les compléter.
export function manques(p) {
  const m = [];
  if (p.age == null || p.age === '') m.push('âge');
  if (p.ageMin == null || p.ageMin === '') m.push('âge minimum recherché');
  if (p.ageMax == null || p.ageMax === '') m.push('âge maximum recherché');
  if (!String(p.zoneGeo || '').trim()) m.push('secteur recherché');
  if (!String(p.pays || '').trim()) m.push('pays');
  if (!String(p.ville || '').trim()) m.push('ville');
  if (!String(p.religion || '').trim()) m.push('religion');
  if (!String(p.situation || '').trim()) m.push('situation');
  if (!String(p.enfants || '').trim()) m.push('enfants');
  return m;
}

const dansAge = (qui, age) => {
  if (age == null || age === '') return { etat: 'inconnu', texte: 'âge inconnu' };
  if ((qui.ageMin == null || qui.ageMin === '') && (qui.ageMax == null || qui.ageMax === '')) return { etat: 'inconnu', texte: 'âge recherché non renseigné' };
  const ok = (qui.ageMin == null || qui.ageMin === '' || age >= Number(qui.ageMin) - MARGE_AGE_DIRECT) && (qui.ageMax == null || qui.ageMax === '' || age <= Number(qui.ageMax) + MARGE_AGE_DIRECT);
  return { etat: ok ? 'ok' : 'hors', texte: `cherche ${qui.ageMin ?? '?'}–${qui.ageMax ?? '?'} ans, l’autre a ${age} ans` };
};
const dansSecteur = (qui, pays) => {
  const zone = String(qui.zoneGeo || '').trim();
  if (!zone) return { etat: 'inconnu', texte: 'secteur recherché non renseigné' };
  if (!String(pays || '').trim()) return { etat: 'inconnu', texte: 'pays de l’autre inconnu' };
  const ok = /importe ou|pas important/i.test(zone) || zoneAccepte(zone.replace(/ ou$/i, ' ou'), pays);
  return { etat: ok ? 'ok' : 'hors', texte: `cherche « ${zone} », l’autre vit en ${pays}` };
};
const pire = (x, y) => (x.etat === 'hors' || y.etat === 'hors' ? 'hors' : x.etat === 'inconnu' || y.etat === 'inconnu' ? 'inconnu' : 'ok');
// Contrôle des deux sens : âge (±2 ans) et secteur.
export function controlesPaire(a, b) {
  const a1 = dansAge(a, b.age), a2 = dansAge(b, a.age), s1 = dansSecteur(a, b.pays), s2 = dansSecteur(b, a.pays);
  return {
    age: { etat: pire(a1, a2), lui: a1.texte, elle: a2.texte, ici: a1.etat, la: a2.etat },
    secteur: { etat: pire(s1, s2), lui: s1.texte, elle: s2.texte, ici: s1.etat, la: s2.etat },
  };
}
