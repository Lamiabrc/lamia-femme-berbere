# TAYRI — passation à Claude, 26 novembre 2026

## Lot demandé par Lamia

Publication explicitement autorisée dans le chat. Branche `codex/phase1-inscription-secours-email`, issue de `ec4dfedc4de51e3a7e2ad03c820519be0dbdf59a`. Dépôt `Lamiabrc/lamia-femme-berbere`, production https://lamia-femme-berbere.com. Vérifier la PR de cette branche et le SHA effectivement servi dans Vercel avant toute nouvelle intervention.

Charte choisie : bleu du logo vers violet, fond clair, or discret. Ne plus réintroduire crème/bordeaux. Logo officiel inchangé. `src/tayri-phase1.css` est ajouté à la fin du CSS commun par le build. Deux polices : DM Sans et Cormorant. Les maquettes Mon espace/admin dans `docs/phase1-maquettes.html` restent des propositions pour les phases suivantes, pas une refonte fonctionnelle déjà livrée.

Inscription en trois cartes, six informations sur la première avec le prénom, critères sur la deuxième, deux photos et compte sur la troisième. Retour et reprise locale sept jours, sans email ni mot de passe sauvegardés. Les critères historiques sont conservés ; non renseigné ne signifie plus refus. Le profil attend une validation humaine ; les comptes non validés ne peuvent ni être ciblés par numéro ni envoyer de cœur. Pas de suspension globale des anciens profils publiés.

## Activation différée : important

- Nouvelle table `inscription_brouillons` : migration `supabase/migrations/20261126143000_inscription_brouillons.sql` préparée et testée localement, **non appliquée à la base hébergée**. La règle de Lamia impose une sauvegarde vérifiable avant migration. Aucun outil de création de sauvegarde disponible dans ce chat. Ne pas appliquer toutes les migrations du dépôt en bloc.
- `INSCRIPTION_BROUILLON_SERVEUR=1` uniquement après cette sauvegarde et cette migration. Absent : brouillons locaux et aucun accès à la nouvelle table.
- `INSCRIPTION_EMAIL_VERIFIE=1` uniquement après test de réception des liens. Absent : comportement transitoire existant conservé à la demande de Lamia, confirmation technique Auth et `a_reconfirmer:true`. Ce marqueur ne prouve pas la possession de l’adresse. Prévoir la reconfirmation historique séparément.

## Secours email

`lib/email-transactionnel.mjs` centralise les anciens appels directs à Resend : Confidences, liens de connexion, Bal, ventes, livres numériques. Resend reste principal ; Brevo intervient après refus certain de quota ou de clé, jamais après réponse perdue/5xx ambigu. Reprises sur le même fournisseur avec idempotence. Pas d’outbox durable ni de garantie exactement une fois entre fournisseurs. Le complément demandé par Lamia limite les notifications facultatives à une réservation par adresse sur 24 heures et 80 par jour de Paris, partagées entre tous les serveurs/fournisseurs ; voir `docs/notifications-economes.md`.

Lamia a créé et branché Brevo. `BREVO_API_KEY` sensible présente en production, valeur jamais lue. `BREVO_FROM` est maintenant configuré avec l’adresse vérifiée fournie dans sa capture, puis redéployé. Un unique lien de connexion réel a été envoyé à cette adresse avec accord explicite ; réception confirmée hors des spams après rectification de Lamia. Aucun autre email de test ni campagne de rattrapage envoyé. L’expéditeur Gmail reste transitoire ; authentifier le domaine de TAYRI pour la délivrabilité durable. `EMAILS_TOUS=1` ne doit être rétabli qu’avec le lot de limites partagées, selon la demande de Lamia. Contrôler son état dans Vercel et le dernier compte rendu de publication. Offre gratuite limitée à 300/jour, aucune promesse d’envoi illimité.

## Paiements et santé

Les achats étaient déjà activés : Stripe live, bon compte, encaissements et virements autorisés, API checkout renvoyant 401 connexion nécessaire et non 503 paiement désactivé. Aucun paiement ou session Stripe réel créé pour la recette. Le diagnostic `api/payment-status.js` affichait `checkoutReady:false` en dur : corrigé pour refléter la configuration et Stripe, avec état inconnu si Stripe ne répond pas.

Il reste des délais Supabase intermittents observés avant publication : trois lectures `platform_settings` dans Bal, une `salon_inscriptions`, une `orders` dans Mes achats, sur une fenêtre d’une heure. Ne pas annoncer zéro erreur. Le helper existant `lib/supabase-lecture.mjs` a déjà des reprises bornées. Poursuivre l’étude des appels concurrents de Mon espace et des états d’erreur qui deviennent à tort « aucun salon/achat ». Ne pas masquer les erreurs ni allonger aveuglément les délais. L’advisor santé Supabase ne signalait rien au contrôle.

## Validation et continuité

Complément demandé ensuite : retrouver toutes les anciennes fiches des lives et les rechercher par TikTok. Voir `docs/fiches-retrouvees.md` et la branche `codex/fiches-lives-tiktok` / PR associée pour la publication exacte. Rubrique `/tableau-de-bord#fiches`, liste paginée, liens TikTok privés et modification du lien sans changement des autres critères ou états. Aucun ancien profil n’est republié automatiquement.

Avant : 478 tests sur le SHA de départ. Phase 1 : **501 tests réussis, aucun échec ; 383 pages générées**. Avec le complément de limites email : **504 tests réussis, aucun échec**, dont les réservations concurrentes exécutées sur PostgreSQL local. Commandes : `npm test`, `npm run build`. Les tests doivent rester isolés de la production ; ne pas injecter de secrets de production. Recette locale : `node tests/serve-inscription.mjs`, puis http://127.0.0.1:4181/rencontres/#confier. Données fictives et API locales uniquement. Maquettes : `/docs/phase1-maquettes.html` sur ce serveur.

Tests dédiés : `email-secours`, `inscription-phase1`, `inscription-verification`, `payment-status`. Recette navigateur réalisée en 375 px et sur ordinateur : étapes, validations, deux images fictives, reprise sans mot de passe, dépôt en attente de Lamia. Le temps inférieur à deux minutes reste à mesurer avec les personnes de recette. Des avertissements de traductions manquantes existaient déjà au build.

Voir `docs/phase1-inscription-et-email.md` pour le détail et les sources officielles. Les phases suivantes de réorganisation de Mon espace et administration restent à faire valider par Lamia. Reprendre sur l’état Git/Vercel réel, sans supposer qu’une maquette représente une fonction déjà publiée.
