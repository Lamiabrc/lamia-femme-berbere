# Fiabilité de la messagerie TAYRI — 19 novembre 2026

Branche : `codex/tayri-messagerie-fiable`. Livraison pour revue et Preview seulement. Aucune fusion, migration distante ou publication en production effectuée pour ce correctif.

## Diagnostic et limites

La production vérifiée au début de l'intervention était le commit `dfd930b27b06ae2120f1de5d4f54eb6e1ea14724`, après la PR #250, et non plus le déploiement de référence de la PR #249.

Les six événements techniques ont été retrouvés, sans lire le contenu des conversations :

| Action | Nombre | Version du navigateur | Heure UTC du 19 novembre |
| --- | ---: | --- | --- |
| `annonce_discussions` | 2 | `ddb73fd1` | 14:11:04 à 14:11:19 |
| `annonce_discussions` | 1 | `25f0788c` | 13:44:29 |
| `annonce_discussion_envoyer` | 2 | `25f0788c` | 13:44:24 à 13:44:28 |
| `annonce_mon_profil` | 1 | `ddb73fd1` | 14:08:57 |

Pour chacun, le statut 0 signifie que le navigateur n'a pas obtenu de réponse exploitable. L'ancien journal mélangeait interruption réseau et dépassement du délai. Il ne permet donc pas d'attribuer rétrospectivement une cause certaine à chaque événement. Les deux erreurs d'envoi proviennent d'une version antérieure à la référence de la mission.

Les journaux Vercel consultés n'ont pas montré d'erreur d'exécution sur cette route dans la fenêtre demandée. Les agrégats Supabase entre 12:42:16 et 14:30:00 UTC montrent des réponses réussies sur les routes Auth, annonces, blocages, discussions et messages : notamment 684 lectures de messages en 200 et 10 insertions en 201. Ce constat ne démontre ni une panne générale de Supabase, ni l'absence de toute interruption entre le navigateur et Vercel.

Les défauts suivants sont en revanche démontrés par le code et les reproductions :

- Des événements de connexion répétés relançaient tous les modules avec une ancienne session conservée dans leurs fonctions.
- Des erreurs de lecture essentielles étaient transformées en liste vide ou profil absent.
- Un message pouvait être enregistré avant qu'une notification lente ne termine ; une réponse perdue suivie d'une relance pouvait alors créer un doublon.
- Une lecture ancienne pouvait remplacer l'affichage d'un envoi venant d'être confirmé ; le focus sur un bouton pouvait aussi suspendre inutilement le rafraîchissement.
- Le filtrage des blocages dans la liste ne suffisait pas à interdire un appel direct d'envoi dans les deux sens.

## Correctifs

### Navigateur

`src/messagerie-reseau.mjs` centralise le transport : délai maximal de 20 secondes couvrant session, requête et décodage ; session actuelle ; un seul renouvellement partagé après un 401 ; regroupement des lectures identiques en cours ; annulation lors d'un changement de compte. Aucune relance automatique après une erreur réseau d'écriture.

`src/espace.js` évite de recharger tout l'espace à chaque événement identique de connexion, conserve l'historique affiché en cas d'échec de lecture et propose un bouton de nouvel essai. Le brouillon n'est effacé qu'après confirmation. Les doubles soumissions sont empêchées ; une nouvelle tentative du même texte garde son identifiant tant que cette page reste ouverte. Le rafraîchissement respecte la saisie, la visibilité et l'inactivité, sans se bloquer sur le simple focus d'un bouton. Une ancienne réponse de lecture ne remplace plus un envoi confirmé. Les zones profil/discussion sont vidées lors d'un changement de compte.

`src/erreurs.js` distingue désormais dépassement du délai et absence de réponse, sans journaliser le texte du message. Une annulation volontaire de session ou un départ de page ne devient pas une alerte réseau.

### Serveur

`lib/discussions.mjs` propage les échecs des lectures essentielles, contrôle explicitement l'appartenance et applique les blocages dans les deux sens, y compris à l'envoi direct. Un identifiant aléatoire de tentative permet de retrouver un message déjà enregistré et de confirmer une relance sans seconde insertion ni seconde notification. La contrainte PostgreSQL arbitre aussi les requêtes concurrentes. Une clé réutilisée pour un autre texte est refusée.

Les notifications sont détachées de l'accusé d'enregistrement sur Vercel avec [`waitUntil`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package). Les fichiers `lib/annonces.mjs`, `lib/confidences.mjs` et `api/confidences.mjs` transmettent ce mécanisme. Le chargement du profil réutilise également les résultats de formule/références et groupe les lectures indépendantes.

Les vérifications de session, d'appartenance, de blocage, de photos et les limites d'envoi restent en place. Aucune politique RLS n'est modifiée. Le déblocage et la gestion des signalements restent dans leurs parcours existants.

`build/build.mjs` publie le nouveau module navigateur. `package.json` et le verrou ajoutent `@vercel/functions` 3.11.3 en production et PGlite 0.5.17 uniquement pour les tests. `.gitignore` exclut le cache temporaire de la CLI Supabase.

## Migration préparée, non appliquée

`supabase/migrations/20261119144620_messagerie_envois_idempotents.sql` ajoute seulement :

- La colonne nullable UUID `client_message_id`.
- Un index unique partiel sur discussion, auteur et identifiant de tentative.

Les identifiants bigint et les anciens messages restent intacts, avec une valeur NULL dans la nouvelle colonne. Le script est rejouable et testé dans PostgreSQL local ; il ne réécrit ni les conversations ni les politiques d'accès.

Ordre impératif avant toute future publication autorisée : appliquer la migration dans l'environnement de test isolé, y vérifier les parcours authentifiés, puis appliquer la migration autorisée avant de publier le code qui sélectionne cette colonne. Ne pas publier ce serveur sur une base n'ayant pas reçu la migration.

Retour arrière recommandé : remettre le code précédent et conserver la colonne et l'index additifs. Ils sont compatibles avec l'ancien code et préservent toutes les traces d'idempotence. Ne pas supprimer de données pour revenir en arrière. La création de l'index standard peut brièvement verrouiller les écritures : prévoir sa vérification et une fenêtre adaptée avant l'exécution distante.

## Validation automatisée

20 nouveaux tests, tous réussis :

- `tests/messagerie-reseau.test.mjs` : lectures simultanées, échec puis récupération, délais sur session/réseau/JSON, renouvellement partagé, changement de compte, refus sans relance, doubles soumissions et clé stable.
- `tests/messagerie-fiabilite.test.mjs` : véritable PostgreSQL embarqué PGlite, migration réelle, ancien historique et RLS conservés, envoi/réception/rechargement, réponse perdue, insertions concurrentes, clé non réutilisable pour modifier un texte, accusé après fermeture, appartenance, blocages symétriques, lectures en panne et notification lente.
- `tests/messagerie-erreurs.test.mjs` : classification des erreurs, absence de contenu privé et annulations silencieuses.

La sélection ciblée messagerie/confidentialité a passé 48 tests. La suite complète finale passe 358 tests sur 368. Les dix échecs restants sont exactement les mêmes que dans la référence antérieure, dans les tests de fiches live/miroir/fusion de l'outil externe ; la comparaison de leurs noms est identique. Ils ne sont pas présentés comme corrigés.

La suite existante couvre notamment Rencontres, Swipe, Couple, comptes, administration et webhooks Stripe. Aucun achat réel ou modification d'abonnement n'a été exécuté. Ces validations automatisées ne constituent pas une recette manuelle de tous les parcours adjacents en production.

Build hors ligne réussi : 383 pages générées. Vérifications syntaxiques des modules modifiés et `git diff --check` réussies. Les tests/build locaux utilisaient un garde réseau et un catalogue public figé, sans secret de production. Exécuter le build après la suite complète : certains tests reconstruisent `dist`.

## Recette dans le navigateur

`tests/serve-messagerie.mjs` sert le véritable frontend compilé sur deux origines localhost, avec deux sessions fictives distinctes « Lamia (fictif) » et « Karim (fictif) », le serveur de discussion réel et PostgreSQL en mémoire. Le serveur est lié à 127.0.0.1 et les connexions sortantes de la page sont limitées à son origine. Aucune authentification Supabase réelle, conversation réelle ou donnée de paiement n'est utilisée.

| Parcours | Résultat |
| --- | --- |
| Profil, liste et ouverture | Réussis avec les données fictives |
| Envoi et réception entre les deux origines | Réussis |
| Réception automatique sans recharger | Réussie |
| Historique après rechargement | Conservé |
| Réponse interrompue après insertion, nouvel essai | Brouillon conservé, confirmation ensuite, une seule ligne |
| Réponse retardée de 25 s | Erreur à 20 s, texte conservé, nouvel essai sans doublon |
| Lecture en 503 | Message explicite, bouton Réessayer, historique retrouvé |
| Événements de connexion identiques | Pas de nouveau chargement global du profil |
| Mobile | Envoi/réception réussis, aucune largeur excédentaire mesurée |
| Blocages et appels hors discussion | Validés automatiquement dans PostgreSQL, sans modifier de compte réel |

Le compteur final de la recette contient cinq messages : le message initial et quatre textes distincts, malgré six requêtes d'envoi. Les captures de recette ordinateur/mobile sont livrées séparément avec le compte rendu. Le serveur local a été arrêté après les essais.

## Limites et validation avant production

Les profils de test autorisés Lamia et Karim ont été identifiés par leurs seules métadonnées techniques (références 15 et 16, drapeau test). Leurs conversations et identifiants de connexion n'ont pas été lus. Les essais ci-dessus utilisent leurs équivalents fictifs locaux : ils ne sont pas présentés comme des essais authentifiés des comptes Supabase réels.

La Preview de branche est destinée à vérifier le build et les ressources publiées. Au contrôle de configuration, aucune variable serveur Preview n'était disponible pour cette branche. Sans base de test isolée migrée et configuration serveur correspondante, elle ne peut pas valider l'échange authentifié complet. Ne pas copier les secrets de production vers une Preview pour contourner cette limite.

L'identifiant de tentative est conservé dans la mémoire de la page : une relance depuis le même écran est protégée. Une fermeture/recharge complète de la page perd cette tentative locale ; après une réponse incertaine, consulter l'historique avant de ressaisir volontairement le même texte. Aucun brouillon privé n'est ajouté au stockage persistant du navigateur.

Une notification reste un traitement de meilleur effort soumis aux limites de durée de la fonction Vercel ; il n'y a pas de nouvelle file durable. La finalisation particulière des messages d'au revoir conserve son traitement existant. La liste conserve les limites existantes de dix discussions et trois cents messages récents, sans supprimer l'historique stocké.

Les causes individuelles exactes des six événements historiques restent indéterminables avec l'ancien journal. La journalisation améliorée permettra de distinguer les prochains délais dépassés des coupures réseau.

Avant production : configuration de test isolée, migration de test, recette authentifiée Lamia/Karim et accord explicite pour migration distante/fusion/publication. Aucun compte, profil, paiement, abonnement, discussion ou message réel n'a été supprimé ou modifié pendant cette intervention.
