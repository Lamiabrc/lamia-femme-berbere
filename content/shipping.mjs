// Frais d'envoi de la Maison (France métropolitaine), en centimes.
// Base : grille Colissimo 2026 de La Poste, livraison à domicile sans signature
// (250 g 5,49 € ; 500 g 7,59 € ; 750 g 9,29 € ; 1 kg 9,59 € ; 2 kg 11,19 € ; 5 kg 17,39 €).
// Le prix dépend du poids du colis : chaque produit a un poids emballé (metadata.poids_colis_g),
// sinon une valeur par défaut selon sa famille. Le serveur recalcule toujours ces montants.

export const SHIPPING_METHODS = {
  colissimo: { label: 'Envoi suivi Colissimo (France métropolitaine)', delay: 'Numéro de suivi par email, livraison en 2 à 3 jours ouvrés après l’expédition.' },
  lettre: { label: 'Envoi par lettre (Lettre verte, La Poste)', delay: 'Livraison en 2 à 4 jours ouvrés, sans suivi.' },
  retrait: { label: 'Remise en main propre à Rennes', delay: 'Sur rendez-vous, gratuit.' },
  email: { label: 'Envoi par email', delay: 'Le fichier t’est envoyé dès sa sortie.' },
};

// Tranches de poids Colissimo (grammes) et tarifs par défaut (centimes). Lamia les modifie
// depuis son tableau de bord (Produits → Livraison et TVA).
export const TRANCHES = [250, 500, 750, 1000, 2000, 5000];
export const DEFAULT_TARIFS = { g250: 549, g500: 759, g750: 929, g1000: 959, g2000: 1119, g5000: 1739, lettre20: 152, lettre100: 310 };
// Petits objets plats (cartes postales…) : envoi en Lettre verte (tarifs La Poste 2026 : 20 g 1,52 € ; 100 g 3,10 €).
export const parLettre = (product) => product?.metadata?.envoi === 'lettre';
export const DEFAULT_TVA = { active: false, taux: 20, mention: '' };

// Poids emballé par défaut, quand le produit n'en a pas.
export function poidsColis(product) {
  const m = product.metadata || {};
  const g = Number(m.poids_colis_g);
  if (Number.isFinite(g) && g > 0) return g;
  const cat = product.categories?.slug || product.category_slug;
  if (cat === 'bijoux') return 120;
  if (cat === 'livres') return 400;
  return 600;
}

export function shippingFor(product, qty, method, tarifs = DEFAULT_TARIFS) {
  const t = { ...DEFAULT_TARIFS, ...(tarifs || {}) };
  if (product.product_type === 'digital') return { method: 'email', cents: 0 };
  if (method === 'retrait') return { method: 'retrait', cents: 0 };
  const poids = poidsColis(product) * Math.max(1, qty);
  if (parLettre(product) && poids <= 100) return { method: 'lettre', cents: poids <= 20 ? t.lettre20 : t.lettre100, poids_g: poids };
  const tranche = TRANCHES.find((g) => poids <= g) || TRANCHES.at(-1);
  return { method: 'colissimo', cents: t[`g${tranche}`], poids_g: poids };
}

// Part de TVA comprise dans un prix TTC (0 si la TVA n'est pas activée).
export function tvaIncluse(ttcCents, tva = DEFAULT_TVA) {
  if (!tva?.active || !(tva.taux > 0)) return 0;
  return Math.round(ttcCents - ttcCents / (1 + tva.taux / 100));
}

// Nettoie les réglages envoyés par le tableau de bord.
export function reglagesPropres(r = {}) {
  const cents = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : d; };
  const t = r.tarifs || {};
  const tv = r.tva || {};
  const taux = Number(tv.taux);
  return {
    tarifs: Object.fromEntries([...TRANCHES.map((g) => `g${g}`), 'lettre20', 'lettre100'].map((k) => [k, cents(t[k], DEFAULT_TARIFS[k])])),
    tva: { active: tv.active === true, taux: Number.isFinite(taux) && taux >= 0 && taux <= 30 ? taux : DEFAULT_TVA.taux, mention: String(tv.mention || '').slice(0, 200) },
  };
}

export const MAX_QTY = (product) => (product.is_unique || product.product_type === 'digital' ? 1 : 5);

// Bagues : taille de doigt (taille française = tour de doigt en mm). Les grandes tailles
// demandent plus d'argent : un supplément s'ajoute à partir d'une taille réglée par Lamia.
export function taillesDe(product) {
  const t = product?.metadata?.tailles;
  return Array.isArray(t) ? t.map(Number).filter((n) => Number.isInteger(n) && n >= 40 && n <= 75) : [];
}
export function supplementTaille(product, taille) {
  const s = product?.metadata?.supplement_taille || {};
  const seuil = Number(s.a_partir_de), cents = Math.round(Number(s.cents));
  return Number.isFinite(seuil) && cents > 0 && Number(taille) >= seuil ? cents : 0;
}
