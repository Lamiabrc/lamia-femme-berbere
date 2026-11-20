# Modération progressive des photos TAYRI

La fiche administratrice conserve ses photos privées et permet maintenant de les faire défiler, de sélectionner une photo ou les deux, d’ajouter un commentaire général et un commentaire pour chaque photo. La case « Supprimer cette photo » ne retire que les fichiers sélectionnés. La pièce d’identité et les vidéos sont exclues de cette action.

## Parcours retenu par Lamia

1. Premier contrôle : demande de correction et avertissement visible dans « Mon espace ». Aucun passage à la suspension. Les rencontres et discussions restent autorisées même si Lamia a retiré une ou deux photos signalées.
2. Second contrôle : décision manuelle, séparée et explicite de Lamia. Il ne suffit pas de cliquer deux fois sur le premier bouton. Le profil de rencontre est alors suspendu ; la connexion et le remplacement des photos restent possibles.
3. Déblocage automatique, selon le choix explicite de Lamia : toutes les anciennes photos signalées doivent avoir disparu et deux photos doivent être effectivement reçues dans Storage. Signer un téléversement ou ajouter une ligne en base ne suffit pas. La photo non signalée est conservée. Pause, retrait du profil et blocage du compte sont préservés.

Le commentaire et le numéro de la photo sont visibles dans l’espace membre. Un bouton permet au propriétaire de retirer une photo signalée pour envoyer sa remplaçante. Les photos conservées restent visibles dans « Mes photos » pendant la correction.

## Sécurité et reprise

- Le nouveau contrôle exige le rôle `admin` issu de `app_metadata` vérifié par le serveur, une référence entière, une requête UUID et la révision du contrôle affiché.
- Les identifiants sélectionnés doivent appartenir à ce profil et désigner des photos. Aucun chemin Storage fourni par le navigateur n’est utilisé.
- L’état `annonces.photos_moderation` est réservé au serveur, hors JSON de profil modifiable par le membre. Le membre reçoit une vue réduite sans chemins Storage, clé de requête ou empreinte interne.
- Écriture conditionnelle sur la révision et le statut : un écran périmé ne peut pas remplacer un contrôle plus récent. Une tentative rejouée reprend le même contrôle.
- Suppression par l’API Storage puis retrait des métadonnées. Une panne ne donne pas lieu à une réponse de réussite ; la même tentative reprend les retraits. Les autres photos ne sont pas incluses dans l’appel.
- Le commentaire en espace membre est durable. Push et email utilisent la notification transactionnelle existante, avec une seule revendication d’envoi par contrôle. Leur livraison n’est pas garantie : un arrêt entre revendication et envoi peut empêcher la notification externe. L’interface confirme l’enregistrement, pas la réception d’un email.
- Les deux anciennes routes de refus global renvoient une demande de sélection ; le vieux bouton redirige vers la fiche détaillée. Elles ne peuvent plus effacer toutes les photos et suspendre immédiatement.

## Validation

Les tests utilisent PostgreSQL embarqué (PGlite, version verrouillée), une base éphémère et un faux stockage. Ils couvrent notamment : autorisation, migration additive, une ou deux photos, conservation des autres médias, panne Storage/métadonnées, réponse perdue, double clic, écran périmé, suspension manuelle, remplacement partiel et réception réelle avant déblocage. La règle habituelle des deux photos reste applicable aux membres sans avertissement de Lamia.

Résultats : **17/17 tests ciblés réussis**. Suite complète : **389 tests, 379 réussis et 10 échecs préexistants**, avec exactement les mêmes noms d’échec que la référence avant ce correctif (ancien outil local, miroir et fusion). Build : **383 pages générées**. Le contrôle de remplacement teste aussi la sérialisation réelle `timestamptz` de PostgreSQL : `Z` et `+00:00` sont comparés comme un même instant.

Recette navigateur : vrai tableau de bord et vrai espace membre, sessions et illustrations entièrement fictives. Premier avertissement visible, second contrôle manuel, retrait d’une photo puis téléversement de sa remplaçante : le profil revient à l’état vérifié. Vérification mobile à 375 px CSS sans débordement horizontal.

Commande de recette : `node tests/serve-moderation-photos.mjs`, après le build. Ce serveur local n’utilise aucun service en ligne.

## Publication, après accord explicite

1. Appliquer **uniquement** `supabase/migrations/20261120101829_moderation_photos_progressive.sql` au projet Supabase prévu. Cette migration ajoute une colonne nullable, sans modifier les lignes existantes ni ouvrir les droits aux membres.
2. Vérifier la présence de la colonne et les droits de la table. Puis fusionner la branche approuvée vers `main` pour le déploiement Vercel.
3. Vérifier la version et les ressources sur le domaine de production. Ne pas supprimer de vraies photos ni avertir de vrais membres à titre d’essai ; utiliser des comptes de recette autorisés avec session disponible.

La Preview ne suffit pas à vérifier les comptes réels : la migration n’est pas encore appliquée et sa configuration serveur peut être absente. Aucun compte réel, aucune photo réelle, aucune conversation et aucun paiement n’ont été modifiés pendant la recette. La branche de fiabilisation de messagerie et sa migration restent indépendantes.

Retour arrière : rétablir le code antérieur si nécessaire et conserver la colonne additive. Ne pas supprimer les fichiers ou les états de contrôle pour annuler un déploiement.

Références techniques : [suppression par l’API Storage](https://supabase.com/docs/guides/storage/management/delete-objects), [filtres et mises à jour PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html).
