// Frais d'envoi de la Maison (France métropolitaine), en centimes.
// Base : tarifs La Poste 2026 (Colissimo 500 g 7,59 €, 750 g 9,29 €, 1 kg 9,59 € ;
// option signature avec indemnisation 200 € : 5,00 €), arrondis pour couvrir l'emballage.
// Le serveur recalcule toujours ces montants : le navigateur ne fait que les afficher.

export const SHIPPING_METHODS = {
  colissimo: { label: 'Envoi suivi Colissimo (France métropolitaine)', delay: 'Expédition sous 3 jours ouvrés après paiement, livraison en 2 à 3 jours.' },
  retrait: { label: 'Remise en main propre à Rennes', delay: 'Sur rendez-vous, gratuit.' },
  email: { label: 'Envoi par email', delay: 'Le fichier t’est envoyé dès sa sortie.' },
};

// Tarifs par défaut, en centimes. Lamia les modifie depuis son tableau de bord
// (rubrique Produits → Livraison et TVA) ; ceux-ci ne servent que si rien n'est enregistré.
export const DEFAULT_TARIFS = { colis_1: 790, colis_2_3: 990, colis_4_plus: 1290, bijou: 1090 };
export const DEFAULT_TVA = { active: false, taux: 20, mention: '' };

export function shippingFor(product, qty, method, tarifs = DEFAULT_TARIFS) {
  const t = { ...DEFAULT_TARIFS, ...(tarifs || {}) };
  if (product.product_type === 'digital') return { method: 'email', cents: 0 };
  if (method === 'retrait') return { method: 'retrait', cents: 0 };
  const cat = product.categories?.slug || product.category_slug;
  if (cat === 'bijoux') return { method: 'colissimo', cents: t.bijou }; // suivi, signature, assuré
  if (qty <= 1) return { method: 'colissimo', cents: t.colis_1 };
  if (qty <= 3) return { method: 'colissimo', cents: t.colis_2_3 };
  return { method: 'colissimo', cents: t.colis_4_plus };
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
    tarifs: { colis_1: cents(t.colis_1, DEFAULT_TARIFS.colis_1), colis_2_3: cents(t.colis_2_3, DEFAULT_TARIFS.colis_2_3), colis_4_plus: cents(t.colis_4_plus, DEFAULT_TARIFS.colis_4_plus), bijou: cents(t.bijou, DEFAULT_TARIFS.bijou) },
    tva: { active: tv.active === true, taux: Number.isFinite(taux) && taux >= 0 && taux <= 30 ? taux : DEFAULT_TVA.taux, mention: String(tv.mention || '').slice(0, 200) },
  };
}

export const MAX_QTY = (product) => (product.is_unique || product.product_type === 'digital' ? 1 : 5);
