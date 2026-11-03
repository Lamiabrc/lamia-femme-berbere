// Formules d'abonnement « Trouve ton âme sœur » (choisies par Lamia le 29/10/2026, ramenées à 3 le 31/10/2026 : prix de lancement).
// Prix en centimes, TTC. Partagé par le site (affichage) et le serveur (paiement) :
// le prix payé est toujours relu ici côté serveur, jamais repris du navigateur.
export const FORMULES = [
  { id: 'decouverte', nom: 'Découverte', mois: 0, accroche: 'Pour commencer, sans rien payer',
    avantages: ['Ton profil confié à Lamia, vérifié et affiché anonymement', 'Swipe sans limite', '1 match offert, 1 match en cours', 'En live : 1 match supplémentaire toutes les 2 semaines', '💬 7 jours de discussion avec ton match, puis vous échangez vos numéros', 'Le nombre de personnes qui t’ont choisi·e'],
    mises: 1, speedDatings: 0, swipesJour: null, matchs: 1 },
  { id: 'passion', nom: 'Passion', mois: 900, accroche: 'Le choix des cœurs sérieux', vedette: true,
    avantages: ['10 matchs par mois, 2 en cours en même temps', '💞 Qui t’a choisi·e : les profils qui t’ont swipé·e, en tête de ta pile', '📷 La photo de ton match, s’il ou elle l’accepte', '1 speed dating par mois inclus', 'Tes questions à Lamia pour améliorer ton profil', 'Tout ce que contient Découverte'],
    mises: 10, speedDatings: 1, photoMatch: true, swipesJour: null, quiMaChoisi: true, matchs: 2 },
  { id: 'prestige', nom: 'Prestige', mois: 4900, lancement: { prix: 2200, places: 20 }, accroche: 'L’accompagnement personnel de Lamia, jusqu’au mariage',
    avantages: ['Matchs illimités, 5 en cours en même temps', 'Ton profil passe en priorité dans le matching', '2 speed datings par mois inclus', 'Coaching : 1 visio de 15 minutes par mois avec Lamia, pour ton profil et tes rencontres', 'Option mariage : Lamia t’accompagne dans ton projet, de la rencontre aux familles', 'Ton annonce présentée en priorité en live', 'Tout ce que contient Passion'],
    mises: null, speedDatings: 2, prioritaire: true, visio: 1, live: true, coaching: true, mariage: true, photoMatch: true, swipesJour: null, quiMaChoisi: true, matchs: 5 },
];
// À l'année : 2 mois offerts (on paie 10 mois).
// Prix de lancement : valable pour les premiers abonnés, qui le gardent tant qu'ils restent abonnés (prix fixé chez Stripe à l'inscription).
export const prixMensuel = (f, pris = 0) => (f.lancement && pris < f.lancement.places ? f.lancement.prix : f.mois);
export const prixAnnuel = (f, pris = Infinity) => prixMensuel(f, pris) * 10;
export const UNITES = [
  { id: 'mise_en_relation', nom: 'Un match supplémentaire', prix: 500, texte: 'Un match de plus, sans abonnement. Il n’expire pas.' },
  { id: 'speed_dating', nom: 'Une soirée de speed dating', prix: 1200, texte: 'Une place pour une soirée de speed dating en ligne, à utiliser quand tu veux.' },
  // S'achète seulement depuis Mon espace, pour un match en cours qui a accepté de transmettre sa photo.
  { id: 'photo_match', nom: 'La photo de ton match', prix: 300, heures: 1, depuisEspace: true, texte: 'Visible pendant 1 heure, si ton match accepte de la transmettre. Depuis Mon espace, pendant le match.' },
];
export const formule = (id) => FORMULES.find((f) => f.id === id) || null;
export const unite = (id) => UNITES.find((u) => u.id === id) || null;
export const euros = (c) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
