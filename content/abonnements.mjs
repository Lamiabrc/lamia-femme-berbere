// Formules d'abonnement « Trouve ton âme sœur » (choisies par Lamia le 29/10/2026).
// Prix en centimes, TTC. Partagé par le site (affichage) et le serveur (paiement) :
// le prix payé est toujours relu ici côté serveur, jamais repris du navigateur.
export const FORMULES = [
  { id: 'decouverte', nom: 'Découverte', mois: 0, accroche: 'Pour commencer, sans rien payer',
    avantages: ['Ton profil confié à Lamia, vérifié et affiché anonymement', 'La première mise en relation offerte', 'Swipe sans limite, 1 match à la fois (viens en live pour matcher à nouveau)', 'Le nombre de personnes qui t’ont choisi·e'],
    mises: 1, speedDatings: 0, swipesJour: null, matchs: 1 },
  { id: 'coeur', nom: 'Cœur', mois: 1490, accroche: 'Pour avancer à ton rythme',
    avantages: ['Jusqu’à 3 mises en relation par mois', '3 matchs à la fois', '1 speed dating par mois inclus', 'Tout ce que contient Découverte'],
    mises: 3, speedDatings: 1, swipesJour: null, matchs: 3 },
  { id: 'passion', nom: 'Passion', mois: 2990, accroche: 'Le choix de la plupart des cœurs sérieux', vedette: true,
    avantages: ['Mises en relation sans limite, dès qu’il y a une vraie compatibilité', '💞 Qui t’a choisi·e : les profils qui t’ont swipé·e, en tête de ta pile', '📷 La photo de ton match, s’il ou elle l’accepte', '3 matchs à la fois', '2 speed datings par mois inclus', 'Ton profil passe en priorité dans le matching'],
    mises: null, speedDatings: 2, prioritaire: true, photoMatch: true, swipesJour: null, quiMaChoisi: true, matchs: 3 },
  { id: 'prestige', nom: 'Prestige', mois: 5900, accroche: 'L’accompagnement personnel de Lamia',
    avantages: ['Tout ce que contient Passion', '1 échange en visio par mois avec Lamia : conseils et travail de ton profil', 'Ton annonce présentée en priorité en live'],
    mises: null, speedDatings: 2, prioritaire: true, visio: 1, live: true, photoMatch: true, swipesJour: null, quiMaChoisi: true, matchs: 3 },
];
// À l'année : 2 mois offerts (on paie 10 mois).
export const prixAnnuel = (f) => f.mois * 10;
export const UNITES = [
  { id: 'mise_en_relation', nom: 'Une mise en relation', prix: 990, texte: 'Sans abonnement : Lamia vous met en contact, toi et la personne qui te correspond.' },
  { id: 'speed_dating', nom: 'Un speed dating', prix: 900, texte: 'Une place pour une soirée de speed dating en ligne, à utiliser quand tu veux.' },
];
export const formule = (id) => FORMULES.find((f) => f.id === id) || null;
export const unite = (id) => UNITES.find((u) => u.id === id) || null;
export const euros = (c) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
