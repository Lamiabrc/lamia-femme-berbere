// Formules d'abonnement « Trouve ton âme sœur » (choisies par Lamia le 29/10/2026, ramenées à 3 le 31/10/2026 : prix de lancement).
// Prix en centimes, TTC. Partagé par le site (affichage) et le serveur (paiement) :
// le prix payé est toujours relu ici côté serveur, jamais repris du navigateur.
export const FORMULES = [
  { id: 'decouverte', nom: 'Découverte', mois: 0, accroche: 'Pour commencer, sans rien payer',
    avantages: ['Ton profil vérifié et affiché anonymement', 'Swipe sans limite, et tu peux revenir sur le dernier profil', 'Matchs gratuits, 1 à la fois : dès qu’il se termine, un autre peut commencer', '7 jours de discussion avec ton match, puis vous échangez vos numéros', 'Le nombre de personnes qui t’ont choisi·e'],
    mises: 1, speedDatings: 0, swipesJour: null, matchs: 1, discussionJours: 7, retourSwipe: 1 },
  { id: 'passion', nom: 'Passion', mois: 900, accroche: 'Le choix des cœurs sérieux', vedette: true,
    avantages: ['Matchs illimités, 3 en cours en même temps', 'Seconde chance : après un cœur refusé, tu peux renvoyer ta demande, 2 fois par profil', 'Revenir en arrière dans le swipe, jusqu’à 10 profils', 'Qui t’a choisi·e : les profils qui t’ont swipé·e, en tête de ta pile', 'La photo de ton match, s’il ou elle l’accepte', '1 speed dating par mois inclus', '14 jours de discussion avec ton match, au lieu de 7', '1 cœur avec message chaque mois', 'Tout ce que contient Découverte'],
    mises: null, speedDatings: 1, photoMatch: true, swipesJour: null, quiMaChoisi: true, relancesRefus: 2, matchs: 3, coeursMois: 1, discussionJours: 14, retourSwipe: 10 },
  { id: 'prestige', nom: 'Prestige', mois: 2900, lancement: { prix: 2200, places: 20 }, accroche: 'Le maximum de chances, en priorité',
    avantages: ['Matchs illimités, 6 en cours en même temps', 'Seconde chance : après un cœur refusé, tu peux renvoyer ta demande, 4 fois par profil', 'Revenir en arrière dans le swipe, sans limite', 'Ton profil passe en priorité dans le matching', 'Ton profil mis en avant 7 jours chaque mois', '3 cœurs avec message chaque mois', 'Des discussions sans limite de durée', '2 speed datings par mois inclus', '-20 % sur le love coaching avec Lamia', 'Tout ce que contient Passion'],
    mises: null, speedDatings: 2, prioritaire: true, avantJours: 7, coeursMois: 3, remiseCoaching: 20, photoMatch: true, swipesJour: null, quiMaChoisi: true, relancesRefus: 4, retourSwipe: null, matchs: 6, discussionJours: null },
];
// À l'année : 2 mois offerts (on paie 10 mois).
// Prix de lancement : valable pour les premiers abonnés, qui le gardent tant qu'ils restent abonnés (prix fixé chez Stripe à l'inscription).
export const prixMensuel = (f, pris = 0) => (f.lancement && pris < f.lancement.places ? f.lancement.prix : f.mois);
export const prixAnnuel = (f, pris = Infinity) => prixMensuel(f, pris) * 10;
export const UNITES = [
  { id: 'mise_en_relation', nom: 'Une place de match en plus', prix: 500, jours: 30, texte: 'Un match en cours de plus, pendant 30 jours, sans changer de formule.' },
  { id: 'speed_dating', nom: 'Une soirée de speed dating', prix: 1200, texte: 'Une place pour une soirée de speed dating en ligne, à utiliser quand tu veux.' },
  { id: 'coaching', nom: 'Une visio de coaching avec Lamia', prix: 1500, texte: '15 minutes en visio avec Lamia, sans enregistrement. Tu choisis ton créneau dans Mon espace après l’achat. -20 % avec Prestige.' },
  { id: 'coaching_30', nom: 'Coaching de 30 minutes et match manuel', prix: 3900, texte: '30 minutes en visio avec Lamia, sans enregistrement. Vous faites le point sur ta recherche, puis elle cherche avec toi, en direct, les profils qui te correspondent et lance la mise en relation tout de suite. Tu choisis ton créneau dans Mon espace après l’achat. -20 % avec Prestige.' },
  { id: 'sauver_couple', nom: 'Sauver mon couple', prix: 8900, texte: 'Une séance de love coaching : 1 heure en visio avec Lamia, à deux ou seul·e, sans enregistrement. Un accompagnement, sans garantie de résultat et sans remplacer une thérapie. Tu choisis ton créneau dans Mon espace après l’achat. -20 % avec Prestige.' },
  // Soirée à deux à distance (Lamia, 17 nov. 2026) : incluse dans les abonnements Couple, ou vendue seule.
  { id: 'soiree_distance', nom: 'Une soirée à deux à distance', prix: 990, couple: true, texte: 'Votre salle virtuelle rien qu’à vous deux, pendant 2 heures, avec le fond de soirée que vous choisissez et le programme d’amour pour vous guider. Incluse avec l’abonnement Couple. Vous réservez dans Notre couple, onglet Moments.' },
  // Plus vendu depuis le 15 nov. 2026 (Lamia ne vend rien en live) ; gardé pour lire d'anciens achats.
  { id: 'live_priorite', nom: 'Passage en priorité en live', prix: 500, horsVente: true, texte: 'Lamia présente ton annonce en priorité à son prochain live.' },
  // S'achètent seulement depuis Mon espace : ils concernent un compte, un match ou une discussion.
  { id: 'prolonger_discussion', nom: 'Prolonger la discussion', prix: 300, jours: 7, depuisEspace: true, texte: '7 jours de plus avec ton match, pour vous deux. Depuis ta discussion, dans Mon espace.' },
  { id: 'profil_avant', nom: 'Profil mis en avant', prix: 500, jours: 7, depuisEspace: true, texte: 'Ton profil passe en tête du swipe pendant 7 jours, auprès des personnes qui correspondent à ses critères.' },
  { id: 'qui_choisi', nom: 'Voir qui t’a choisi·e', prix: 200, heures: 24, depuisEspace: true, texte: 'Les numéros anonymes des profils qui t’ont choisi·e, en tête de ton swipe, pendant 24 heures.' },
  { id: 'coeur_message', nom: 'Cœur avec message', prix: 200, depuisEspace: true, lien: '/rencontres/swipe/', texte: 'Ton cœur arrive avec une phrase de toi : ton profil passe en tête de sa pile, ta phrase affichée. Anonyme, numéros et liens masqués. Depuis le swipe.' },
  // Inviter Lamia dans sa discussion de match, comme une wali (Lamia, 16 nov. 2026).
  { id: 'inviter_lamia', nom: 'Inviter Lamia dans votre discussion', prix: 2000, horsVente: true, depuisEspace: true, texte: 'Lamia rejoint votre discussion, comme une wali : elle vous lit et vous conseille, tous les deux. Depuis ta discussion, dans Mon espace.' },
  // Lamia met en relation à la main, ou un membre lui demande de le faire : 8 € payés par celui qui demande (Lamia, 26 nov. 2026).
  { id: 'match_lamia', nom: 'Lamia vous met en relation', prix: 800, depuisEspace: true, lien: '/rencontres/swipe/', texte: 'Tu choisis un profil, Lamia le regarde et vous met en relation. Depuis « Voir le profil », dans le swipe.' },
  { id: 'photo_match', nom: 'La photo de ton match', prix: 300, heures: 1, depuisEspace: true, texte: 'Visible pendant 1 heure, si ton match accepte de la transmettre. Depuis Mon espace, pendant le match.' },
];
// Visuel de chaque prestation de coaching.
export const FONDS_COACHING = { coaching: ['prestige', 'Salle de coaching, formule Prestige'], coaching_30: ['match-manuel', 'Coaching et match manuel'], sauver_couple: ['couple', 'Coaching couple'] };
// Prestige : -20 % sur le love coaching (Lamia, 15 nov. 2026).
export const COACHINGS = ['coaching', 'coaching_30', 'sauver_couple'];
export const prixCoaching = (u, f) => (COACHINGS.includes(u.id) && f?.remiseCoaching ? Math.round((u.prix * (100 - f.remiseCoaching)) / 100) : u.prix);
export const formule = (id) => FORMULES.find((f) => f.id === id) || null;
// Abonnement « Couple » (Lamia, 16 nov. 2026) : pour l'espace Notre couple, à part des formules de rencontre.
// Il débloque les mots doux les plus envoyés, avec leur petite animation, et le mot écrit soi-même. Un abonné suffit pour les deux.
export const COUPLE = { id: 'couple', nom: 'Couple Amour', mois: 1800, accroche: 'Pour vous deux',
  avantages: ['Les soirées à deux à distance, dans votre salle virtuelle à thème, sans limite', 'Tous les mots doux, avec leurs animations tendres', 'Ton mot doux écrit toi-même', 'Bientôt : le fil « Avec nos proches », 1 proche inclus', 'Bientôt : 5 € de points cadeau par mois, à offrir à l’autre', 'Pour vous deux : un seul abonnement suffit'] };
// Couple Prestige (Lamia, 16 nov. 2026) : tout Couple Amour, plus Lamia dans votre fil une fois par mois, 10 € de points cadeau, un plus beau cadeau de mariage.
export const COUPLE_PRESTIGE = { id: 'couple_prestige', nom: 'Couple Prestige', mois: 3800, accroche: 'Pour vous deux',
  avantages: ['Tout Couple Amour, avec les soirées à distance sans limite', 'Bientôt : Lamia dans votre fil, une fois par mois', 'Bientôt : 10 € de points cadeau par mois', 'Un plus beau cadeau quand vous vous mariez', 'Pour vous deux : un seul abonnement suffit'] };
export const FORMULES_COUPLE = [COUPLE, COUPLE_PRESTIGE];
export const formuleCouple = (id) => FORMULES_COUPLE.find((f) => f.id === id) || null;
export const unite = (id) => UNITES.find((u) => u.id === id) || null;
export const euros = (c) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
