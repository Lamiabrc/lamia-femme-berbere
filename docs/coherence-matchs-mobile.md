# Cohérence des matchs et de l'espace mobile

Branche `codex/coherence-matchs-mobile`, issue de la production après la PR #252. Corrections préparées pour revue, sans modification de données réelles ni migration.

## Anomalies démontrées

- La propriété `matchs` de la formule est temporairement réduite à zéro quand l'ouverture d'un nouveau match attend le choix du membre pendant un au revoir. L'interface réutilisait cette limite technique comme dénominateur de l'abonnement, d'où « 5 / 0 ». Une formule Passion conserve pourtant sa capacité nominale et ses éventuelles places supplémentaires.
- Le compteur affiché réutilisait un calcul de réservation qui inclut les intérêts réciproques `a_traiter`. Ces réponses en attente ne sont pas encore des matchs en cours. Les deux demandes d'une même paire pouvaient aussi se confondre avec deux relations.
- « Qui t'a choisi·e » ne filtrait ni la réponse déjà donnée ni le caractère réciproque, et invitait donc à choisir de nouveau certains profils.
- L'historique « Déjà répondu » affichait uniformément « Tu as dit oui », même pour un match terminé.
- Le bandeau générique d'une discussion ne distinguait pas clairement le temps d'au revoir d'un match actif. Un échange fermé pouvait encore annoncer un message restant comme utilisable.
- Le nouveau message système de dématch promettait une reprise immédiate, alors que l'écran du profil attendait un choix du membre. Les anciens messages enregistrés ne sont pas réécrits.

## Corrections

`content/etat-matchs.mjs` distingue les matchs actifs, les intérêts réciproques en attente et les échanges d'au revoir. Le calcul d'affichage déduplique les partenaires et prend en compte les métadonnées des discussions (dont leur fermeture), sans consulter le contenu des messages. Une nouvelle relation après un ancien dématch reste distincte de celui-ci.

`lib/annonces.mjs` conserve la limite technique d'ouverture pour le contrôle existant et fournit séparément `capacite` pour l'affichage. Les places achetées restent prises en compte. Le résumé du profil utilise les états d'affichage, et les profils déjà choisis/réciproques ou retirés ne sont plus recommandés comme réponses à donner. Les métadonnées des discussions déjà lues pour le consentement sont réutilisées.

`src/espace.js` affiche séparément le nombre de matchs, la capacité et les au revoir. L'historique précise « Match terminé », « Match en cours » ou « en attente de mise en relation ». Le résumé est rechargé après une réponse ou un dématch. Le bandeau et la date distinguent un match actif, un au revoir encore ouvert et un échange fermé ; un délai expiré n'invite plus à utiliser un message restant.

`lib/discussions.mjs` ajuste seulement le texte des futurs messages système/notifications de dématch : il renvoie au choix dans l'espace du membre. Les discussions et messages existants restent inchangés.

`src/tayri.css` harmonise les cartes de suivi/au revoir dans le cadre commun, réduit la densité des messages système et réserve deux lignes aux libellés de la navigation mobile. Les palettes des espaces femme/homme et le logo officiel restent conservés.

Le premier écran transmis montre une ancienne présentation (logo/navigation différents). Le cadre TAYRI actuel utilise déjà la même navigation sur les pages générées ; cette capture ne suffit pas à prouver une panne de cache. Aucune purge de session, de stockage du navigateur ou de conversation n'est ajoutée. Vérifier la présentation actuelle après un rechargement normal.

## Vérifications

- `tests/etat-matchs.test.mjs` : dix cas de calcul et libellés, dont cinq intérêts en attente avec un au revoir, doublons de paire, ancien au revoir et nouveau match, relation sans discussion, clôture/expiration, ancien intérêt inverse, autre membre et capacité séparée du consentement.
- `tests/fiches-live-swipe.test.mjs` : deux nouvelles régressions de l'API profil (Passion, attente/au revoir et profils déjà choisis). Les tests existants conservent leurs limites de consentement à zéro ou une place : la règle n'est pas contournée.
- `tests/discussions.test.mjs` : texte de dématch mis à jour ; conservation des contrôles de raison, messages autorisés, destinataire et fin de l'au revoir.
- `tests/serve-etats-matchs.mjs` : recette locale du frontend compilé, sessions et messages fictifs uniquement, connectivité limitée à localhost. Les outils adjacents non couverts par cette recette renvoient une erreur contrôlée ; aucune donnée de production n'est utilisée.

Les résultats chiffrés, captures de recette et liens de PR/Preview sont livrés avec le compte rendu. Les dix échecs historiques des anciennes liaisons PC désactivées sont distingués des nouveaux tests.

Résultats : 12 nouveaux tests réussis ; suite complète 362/372, les dix noms d'échecs identiques à la référence précédente. Sélection finale de calcul/discussions/pages : 28/28. Build : 383 pages. Recette navigateur validée avec profils/messages fictifs : zéro match actif et un au revoir, un match actif, historique terminé/en attente, absence de formulaire d'envoi et de message restant utilisable après fermeture, palette homme, aucune largeur excédentaire mesurée à 375 px. Les libellés de la navigation restent entièrement visibles sur deux lignes. Contrôles syntaxiques et `git diff --check` réussis.

La publication de ce correctif a ensuite été explicitement demandée par Lamia (« mets en ligne »). Le déploiement et ses contrôles sur le domaine public sont consignés dans la PR et le compte rendu de livraison.

## Limites

Cette intervention corrige les incohérences visibles ; elle ne répare ni ne réécrit les anciennes données. Les compteurs de contrôle de l'ouverture et les règles de consentement restent ceux du serveur existant. Les échanges sans compte destinataire restent des mises en relation, même sans discussion créée. En cas d'échec de lecture de métadonnées, le résumé conserve les relations connues plutôt que d'inventer un nombre de messages ou de modifier les relations.

La recette authentifiée hébergée nécessite un environnement de test configuré ; les tests fonctionnels fournis restent fictifs et locaux. La publication en production attend l'accord explicite demandé dans la mission. La PR #251 de fiabilité réseau de messagerie n'est pas intégrée à cette branche.
