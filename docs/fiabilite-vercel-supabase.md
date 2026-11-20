# Fiabilité Vercel / Supabase et notifications d’intérêt

Les journaux analysés le 20 novembre comptaient 253 erreurs serveur sur 24 heures, principalement des délais dépassés sur `/api/confidences`, `/api/bal` et `/api/mes-achats`. Les lectures Supabase ont également ralenti au même moment. Cela justifie de rapprocher le calcul de la base, réduire les lectures répétées et absorber une panne passagère ; cela ne démontre pas une cause unique à tous les incidents.

## Correctif préparé

- Fonctions Vercel dans `cdg1`, au même emplacement Paris/eu-west-3 que la base. La région réelle doit être contrôlée sur la Preview puis en production.
- Lectures GET/HEAD : au plus deux tentatives dans le budget de temps initial. Respect du signal d’annulation et de `Retry-After`. Aucune reprise sur 400/401/403/409/500, aucune répétition automatique de POST/PATCH/PUT/DELETE. Les contrôles de compte Auth restent effectués côté serveur.
- Mémo des lectures identiques dans une seule invocation des Confidences, avec résultats indépendants et invalidation avant/après toute écriture. Aucun cache partagé de conversations ou d’autorisations.
- Historique d’achats et état d’abonnement lus en parallèle, sans changer les paiements ni leur validation.
- Diagnostic d’échec précisant la route et l’action, sans paramètres, email, jeton ni contenu privé.
- Migration additive : index inverse sur `scores_outil`, 20 index de clés étrangères réellement absents au relevé de catalogue et agrégation des durées de visite par page une seule fois. Aucun changement de ligne métier ou de droit. Délai de verrou limité à deux secondes : annuler et réessayer en période calme plutôt que bloquer les membres.

## Emails et intérêts reçus

Une tentative de création d’un intérêt en doublon pouvait continuer jusqu’à l’email, et l’ancien lien ouvrait uniquement la rubrique générale. Les nouveaux liens portent l’identifiant de l’intérêt ; le serveur en vérifie le destinataire. L’espace affiche soit la fiche active, soit un état explicite : déjà répondu, en attente, terminé ou indisponible. Une lecture en panne ne devient plus une liste vide réussie. Le défilement vers cette rubrique attend le chargement du profil placé au-dessus.

La contrainte unique `(demandeur_id,cible_ref)` existante sert à ignorer les doublons sans erreur 409. Seule une véritable création déclenche la notification. Une réponse répétée ne renvoie pas de notification ; une mise à jour conditionnelle empêche deux réponses concurrentes d’être traitées deux fois. Un intérêt terminé ne peut pas être réactivé par un ancien écran. Les anciennes demandes de profils de test ne sont plus affichées à un membre réel.

Le cas privé montré par Lamia a été consulté **après son autorisation explicite**, uniquement sur les statuts et dates/liens nécessaires. Aucun intérêt réel n’a été réactivé, aucun match créé et aucun email réel envoyé pendant la recette.

## Protection des photos

Le passage automatique du pilote ne doit pas contredire la modération progressive déjà publiée. Un avertissement en cours est exclu des suspensions et rappels « photos absentes ». Surtout, une panne de lecture du stockage ne doit jamais être interprétée comme l’absence de photos de tous les membres.

## Sécurité : état réel

La protection contre les mots de passe divulgués a été **activée dans Supabase et vérifiée après rechargement**, avec la session ouverte par Lamia. Aucun mot de passe ni autre réglage Auth n’a été changé.

L’avertissement `pg_net` reste distinct : cette extension est non déplaçable par `ALTER EXTENSION`. La procédure officielle impose suppression/réinstallation de ses objets et détruit les réponses conservées. Au relevé, la file était vide mais **72 réponses techniques existaient**. Ce correctif ne les supprime pas et ne réinstalle pas l’extension. Cette maintenance exige une procédure séparée de conservation/restauration et un contrôle des droits et dépendances. [Procédure officielle et effets](https://supabase.com/docs/guides/database/extensions/pg_net#troubleshooting).

Les politiques RLS signalées par l’Advisor contiennent déjà les sous-requêtes `select auth.uid()` et `select auth.jwt()` dans le catalogue actuel : elles ne sont pas réécrites aveuglément à partir d’un diagnostic possiblement ancien. Les tables de sauvegarde sans clé primaire ne sont pas des tables métier à reconstruire.

## Validation et publication

Tests dédiés : pannes/reprises de lecture, absence de répétition des écritures, isolation des autorisations, doublons d’intérêt, états terminés, profils retirés/de test, panne affichée explicitement, et absence de suspension automatique injustifiée. Test PostgreSQL embarqué : statistiques identiques sur plusieurs périodes et base vide, lignes et droits conservés, migration réexécutable. Les fixtures historiques simulent maintenant l’insertion avec conflit ignoré et la réponse conditionnelle, avec leurs assertions métier conservées.

Résultats : **20 nouveaux tests ciblés réussis** ; suite complète **409 tests, 399 réussis, exactement les dix échecs préexistants** de l’ancien outil local/mirroir/fusion. Build de **383 pages** réussi. Recette mobile à **375 px CSS**, sans débordement : intérêt actif, ancien oui terminé, profil indisponible et panne avec bouton Réessayer. Les statistiques et journaux SQL sont des agrégats ; les tests de panne utilisent des données fictives, jamais les conversations ou photos réelles.

Après validation de la version consultable, appliquer `20261120173529_fiabilite_requetes_et_index.sql`, puis publier le commit approuvé. La migration `moderation_photos_progressive` est déjà publiée et ne doit pas être réappliquée. La PR de fiabilisation de messagerie #251 demeure indépendante.

Après déploiement : contrôler `READY`, `cdg1`, les ressources du domaine réel et les erreurs sur une fenêtre comparable. L’absence d’erreur pendant quelques minutes ne constitue pas une preuve de stabilité sur 24 heures. Si nécessaire, revenir au code précédent en conservant les index et la fonction compatible.
