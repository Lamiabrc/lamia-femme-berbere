// Frais d'envoi de la Maison (France métropolitaine), en centimes.
// Base : tarifs La Poste 2026 (Colissimo 500 g 7,59 €, 750 g 9,29 €, 1 kg 9,59 € ;
// option signature avec indemnisation 200 € : 5,00 €), arrondis pour couvrir l'emballage.
// Le serveur recalcule toujours ces montants : le navigateur ne fait que les afficher.

export const SHIPPING_METHODS = {
  colissimo: { label: 'Envoi suivi Colissimo (France métropolitaine)', delay: 'Expédition sous 3 jours ouvrés après paiement, livraison en 2 à 3 jours.' },
  retrait: { label: 'Remise en main propre à Rennes', delay: 'Sur rendez-vous, gratuit.' },
  email: { label: 'Envoi par email', delay: 'Le fichier t’est envoyé dès sa sortie.' },
};

export function shippingFor(product, qty, method) {
  if (product.product_type === 'digital') return { method: 'email', cents: 0 };
  if (method === 'retrait') return { method: 'retrait', cents: 0 };
  const cat = product.categories?.slug || product.category_slug;
  if (cat === 'bijoux') return { method: 'colissimo', cents: 1090 }; // suivi, signature, assuré 200 €
  if (qty <= 1) return { method: 'colissimo', cents: 790 };
  if (qty <= 3) return { method: 'colissimo', cents: 990 };
  return { method: 'colissimo', cents: 1290 };
}

export const MAX_QTY = (product) => (product.is_unique || product.product_type === 'digital' ? 1 : 5);
