# Rematch et notification d'une nouvelle discussion

Après un dématch, le bouton admin réutilisait l'intérêt existant. `ouvrirDiscussion` renvoyait l'identifiant de son ancien chat même fermé ; le serveur annonçait alors un match sans ouvrir de nouvel échange. Un email récent pouvait en plus supprimer l'email du rematch en raison de la limite de 24 heures.

## Correction

- Vérification de l'état réel du chat avant tout succès. Une erreur de lecture ou d'ouverture n'est plus présentée comme un nouveau match.
- Lors d'un rematch, transaction Postgres verrouillée par intérêt : conserver l'ancien chat, déplacer son lien dans `interet_origine_id`, créer un chat distinct puis mettre à jour le statut. Les messages, consentements et numéros de l'ancien échange restent sur son ancien identifiant. Ils ne sont pas copiés dans le nouveau.
- Contrainte unique sur `discussions.interet_id` conservée. Deux tentatives sur le même intérêt produisent une seule nouvelle discussion et un seul résultat `cree:true`.
- Une nouvelle discussion explicitement forcée par l'admin peut déclencher un email malgré un email reçu dans les dernières 24 heures, uniquement si aucun push n'a abouti. Les notifications ordinaires conservent leur limite. Le transport commun, le budget quotidien et le secours Brevo restent applicables.
- La réponse admin distingue discussion nouvelle, discussion déjà ouverte et mise en relation sans deux comptes. Elle précise le canal effectivement confirmé pour chacun ; l'acceptation par le fournisseur email n'est pas une preuve de réception.
- Le bouton est désactivé pendant la requête et efface l'ancien message de succès. Une nouvelle tentative depuis la fiche de l'autre personne retrouve aussi la discussion existante.
- Un ancien statut « mis en relation » sans chat actif ne dispense plus des contrôles de capacité lorsque la mise en relation n'est pas forcée par l'admin.
- Le passage de clôture d'un ancien au revoir ne termine pas un rematch du même intérêt, y compris si sa lecture a précédé le rematch.
- Le débit d'un match acheté intervient après la confirmation d'ouverture, plutôt qu'avant une ouverture susceptible d'échouer.

## Migration et publication

Appliquer `20261127204627_rematch_discussion_historique.sql` avant de publier le code. La migration ajoute une colonne nullable et une fonction `SECURITY INVOKER`, exécutable uniquement par `service_role`. Elle ne modifie aucun chat existant, ne crée aucun match et n'envoie aucune notification à son application. La transformation de l'ancien chat intervient seulement lors d'un rematch.

Une publication de code sans migration doit échouer avec un message explicite lors d'un rematch, sans écraser l'ancien chat. Ne pas faire de correction massive des statuts historiques.

Pour reprendre un cas affecté, utiliser ensuite le bouton Matcher une seule fois. Cette action crée effectivement un nouveau match et peut envoyer des notifications aux deux membres : ne pas la déclencher pendant le diagnostic en lecture seule. Conserver l'accord explicite avant publication et intervention en production.

## Vérification

Suite complète : 552 tests réussis, aucun échec. Vérification syntaxique du module navigateur et compilation des 143 pages réussies.

- Tests réels de la migration avec PGlite : historique préservé, numéros et consentements non hérités, répétition et concurrence, expiration naturelle, au revoir, rollback après refus d'insertion, refus des rôles publics, signalement, propriétaire différent, migration ou lecture indisponible.
- Tests du serveur admin : priorité d'un nouveau match manuel, aucun renvoi au second clic, ouverture refusée sans faux succès ni email, protection du rematch contre un ancien passage cron.
- Ces tests utilisent uniquement des membres fictifs. Aucun email réel ni accès aux messages privés n'est nécessaire.

Limite : les notifications restent des effets externes après la transaction. Une interruption après création et avant envoi peut nécessiter une reprise manuelle vérifiée dans le journal ; cette correction ne constitue pas une file d'envoi transactionnelle et ne relance pas aveuglément un fournisseur après une réponse incertaine.
