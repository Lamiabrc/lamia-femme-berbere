# Validation et travaux restants — 15 octobre 2026

## Périmètre livré

Branche `codex/speed-dating-operational`, issue de `545db40`. Le logo, la Maison et les autres pages sont conservés. Aucun changement de base de production ni déploiement de cette version n’a été effectué.

La migration `20261014152407_speed_dating_operations.sql` reste à appliquer dans un environnement isolé d’abord. Elle accompagne obligatoirement le nouveau serveur et le nouveau formulaire : son application isolée interromprait les anciens parcours de réservation.

## Preuves et limites

| Partie | Preuve obtenue | Limite |
| --- | --- | --- |
| Connexion existante | Envoi Supabase accepté et réception/ouverture confirmées par la propriétaire de l’adresse test autorisée | Ne valide ni nouveau compte, ni tous les fournisseurs email |
| Réservation gratuite | Tests API d’identité, préférences, dates, règles ; exécution de la migration sur PostgreSQL isolé PGlite | Pas encore validée via PostgREST/RLS du projet de test complet |
| Capacité et concurrence | Plusieurs réservations, limite de capacité, attente, idempotence, état atomique testés | PGlite utilise une connexion ; ce n’est pas une charge concurrente PostgreSQL multiconnexion réelle |
| Modification administratrice | SQL de création/modification et refus de réduction de capacité/changement silencieux testé | Interface d’édition à tester de bout en bout avec Supabase |
| Appariement | Tests de préférences réciproques, optimisation du nombre de paires, priorité d’attente, blocages, absence de répétition | Pas de diagnostic de compatibilité amoureuse |
| Parcours navigateur | Trois onglets simultanés : administration, Nadia, Karim ; attente, admission, tour, partenaire correct visibles | Auth et Daily simulés ; pas deux navigateurs distincts ni vidéo réelle |
| Sécurité vidéo | Tests de sélection serveur des salles et permissions, refus d’entrée sans réservation/admission, interdiction d’accès admin aux salles privées | Révocation et isolation Daily encore à vérifier sur le fournisseur réel |
| Choix et consentement | Tests unilatéral privé, réciprocité et double accord avant coordonnées | Fin de session et archivage à compléter |
| Panne de révocation | Coupure enregistrée, panne simulée, nouvelle tentative après fermeture ; lots Daily limités à 100 utilisateurs | Dépend d’une nouvelle requête, pas d’un worker autonome |
| Email réservation/rappel | Non disponible | Configuration du domaine expéditeur et implémentation avec file d’envoi, reprises, déduplication nécessaires |
| Paiements | Tests existants simulés ; activation maintenue fermée | Stock de places/expirations et traitement de fulfillment par webhook à terminer avant paiement public |
| Signalements | Lien vers le contact existant | Pas encore de dossier de signalement lié à la rencontre ni de traitement complet dans l’administration |

Commandes : `npm test`, `npm run build`. Les tests n’envoient aucun email, ne débitent aucune carte et n’utilisent aucun profil réel. La construction produit 25 pages. Dernière exécution : 45 tests réussis, aucun échec. Le réglage de largeur mobile du navigateur de test n’a pas été appliqué par l’outil (largeur réelle 1265 px) : aucune validation mobile n’est revendiquée.

Répétition UI locale : construire puis lancer `node tests/rehearsal-server.mjs`. Ouvrir `http://127.0.0.1:4317/admin-bal.html?actor=admin`, et `/speed-dating/bal/?actor=a` et `?actor=b`. Le bandeau jaune distingue explicitement la simulation. Ce serveur ne doit jamais être déployé.

## Travaux indispensables avant lancement

1. Préparer une base de test Supabase isolée et une prévisualisation Vercel utilisant exclusivement ses clés. La configuration publique est maintenant centralisée : `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`, identiques à la construction et à l’exécution. Le serveur reçoit séparément la clé de service du même projet. Une construction Vercel Preview sans projet isolé est volontairement refusée, ainsi qu’une clé secrète dans la configuration navigateur. Ne pas recopier les profils de production.
2. Exécuter migration et tests des droits réels : un compte ne lit/modifie pas les inscriptions, préférences ou réponses d’un autre ; pas de contournement par accès REST direct. Vérifier aussi les droits de suppression/modification de profil préexistants.
3. Terminer annulation et promotion équitable de la liste d’attente. La liste actuelle enregistre une attente, mais ne fournit pas encore un ordre de promotion et une notification fiables.
4. Ajouter confirmations, rappels, modifications et annulations par une file d’envoi idempotente. Le domaine Lamia n’était pas configuré dans le service email connecté lors de l’audit. Ne pas utiliser le domaine d’un autre projet.
5. Terminer le signalement lié à la rencontre, son suivi administratrice, l’archivage des sessions et les choix après fermeture. Les compteurs doivent distinguer attributions et conversations réellement établies.
6. Tester Daily réellement : audio et vidéo dans les deux sens, refus de caméra, second navigateur, reconnexion, mobile physique, réseau interrompu, suspension et blocage, expiration des jetons et fermeture. Contrôler les coûts et quotas du compte existant avant un test consommant le service.
7. Vérifier le parcours payant en environnement Stripe de test si des soirées payantes sont voulues. Aucun événement annoncé gratuit ne doit changer de tarif.
8. Revoir le texte public : retirer les promesses de préférences non prises en compte, de rappels email ou de matching hors événement tant qu’elles ne sont pas réellement implémentées.
9. Après ces validations, déployer serveur, client et migration de manière coordonnée, vérifier production en lecture et avec les seuls comptes de test autorisés, puis retirer les fixtures de test selon la procédure définie pour l’environnement isolé.

## Dépendances externes à décider

- Projet Supabase de test : aucun projet Lamia de test ni branche de développement n’était présent lors de l’audit. La création d’une branche peut être facturée ; faire confirmer l’organisation, obtenir son tarif et l’accord avant création.
- Expéditeur des emails Lamia : choisir l’adresse sous le domaine de la marque et valider les enregistrements DNS fournis par le prestataire. Ne jamais demander les clés secrètes dans la conversation.
- Deux appareils ou navigateurs réels avec comptes de test autorisés sont nécessaires pour la validation audiovisuelle.

## Niveaux de disponibilité

- **Répétition locale simulée : oui.** Parcours et logique vérifiables sans effets sur production.
- **Répétition privée réelle : pas encore.** Environnement isolé, accès vidéo réel et configuration email à terminer.
- **Ouverture des inscriptions avec cette nouvelle version : pas encore.** Les tests réels et le déploiement coordonné manquent ; la liste d’attente et les notifications restent incomplètes.
- **Soirée publique : pas encore.** La simulation ne valide pas l’audiovisuel réel, les opérations de modération et le parcours complet après la soirée.

Références consultées : [révocation Daily](https://docs.daily.co/reference/rest-api/rooms/session/eject), [coûts des branches Supabase](https://supabase.com/docs/guides/platform/manage-your-usage/branching). Elles documentent les interfaces et coûts possibles ; elles ne prouvent pas la configuration effective du compte.
