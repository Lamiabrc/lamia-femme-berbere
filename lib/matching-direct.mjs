// « Match en direct » : le moteur de Quick Pair Pro appliqué aux profils du site (annonces + fiches de l'outil).
// Réservé à l'administratrice. N'a aucun effet sur les règles de swipe des membres.
import { versOutil } from '../content/matching-options.mjs';

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
    prenom: f.prenom || `Fiche ${f.ref}`,
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
  typer(p, modele);
  p.verificationPhoto = true;
  // Fiche d'outil : le contact est géré dans l'outil de Lamia, on le considère présent.
  p.contactAutre = 'géré dans l’outil';
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
