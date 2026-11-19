# Créer les profils et annonces depuis le site

Branche `codex/admin-creation-profils`, indépendante du correctif de messagerie en revue. Aucune publication en production et aucune donnée réelle modifiée.

## Utilisation

1. Ouvrir le tableau de bord avec son compte administratrice.
2. Choisir **Créer un profil**, depuis l'accueil, Membres ou Plus. Lien direct : `/tableau-de-bord#creer-profil`.
3. Renseigner la fiche (genre, âge, pays, informations facultatives), le portrait et la recherche. L'aperçu se remplit pendant la saisie.
4. Par défaut, l'annonce reste invisible jusqu'à la confirmation du destinataire. L'option **Afficher l'annonce anonymement dès maintenant** permet une publication immédiate explicitement choisie par Lamia.
5. Cliquer **Créer la fiche et obtenir son lien**, puis **Copier le lien** ou **Copier le message à envoyer**. Aucun message ou email n'est envoyé automatiquement.
6. Le destinataire ouvre sa fiche, peut la corriger et crée lui-même son accès avec la confirmation d'email existante, ou se connecte à son compte. Après rattachement et confirmation, il continue vers son espace de rencontres et ses photos privées.
7. Les fiches créées sur le site restent retrouvables dans la liste, avec leur état : en attente, confirmée ou retirée. La recherche par numéro peut aussi retrouver le lien d'une ancienne fiche de live.

Lamia ne choisit aucun mot de passe pour le destinataire. La fiche initiale et son annonce sont anonymes ; le prénom et les photos du compte sont complétés par la personne. Ne transmettre son lien personnel qu'à elle.

## Implémentation

- `lib/fiches-admin.mjs` : création, liste paginée et récupération de lien, sous rôle administrateur contrôlé par les métadonnées d'application vérifiées côté serveur. Aucune ancienne clé d'outil PC n'est réactivée.
- `lib/annonces.mjs` : raccordement des actions, confirmation authentifiée par le propriétaire pour les nouvelles fiches, rattachement conditionnel évitant qu'une seconde demande concurrente écrase le propriétaire, publication à la confirmation. Les retraits ne sont pas réactivés.
- `public/tableau-de-bord.html`, `public/tableau.js`, `public/fiches-admin.js`, `public/tableau.css` : formulaire, aperçu, copie, suivi et navigation responsive.
- `src/confirmer.js` : le jeton de session accompagne aussi la confirmation ; une erreur de confirmation n'entraîne plus une redirection annonçant un succès. Le destinataire conserve la procédure de vérification d'email existante.
- `build/build.mjs` : les textes de la page de confirmation conviennent aux fiches créées depuis le site comme aux anciennes fiches de live.

Réutilisation de `profils_outil` et de ses liens signés existants, sans nouvelle table, migration ou modification de RLS. Les fiches créées sur le site ont un identifiant `site-admin-UUID`. La contrainte unique existante sur `outil_id` empêche une seconde fiche en cas de double envoi ou réponse perdue. Une relance ne réécrit jamais une fiche existante ; la clé est gardée en mémoire tant que la page reste ouverte. Après un rechargement complet suivant une réponse incertaine, retrouver d'abord la fiche dans la liste.

Les données de contact saisies dans les textes sont masquées par le filtre serveur existant. Les champs email/mot de passe éventuellement injectés dans le corps de création sont ignorés. Les autres données facultatives, notamment religion et origine, doivent provenir des indications de la personne ; aucune origine n'est inventée si elle n'est pas précisée.

## Vérifications

`tests/fiches-admin.test.mjs` vérifie les droits admin et le refus des faux rôles modifiables, les âges et données requises, le masquage des contacts, les liens signés, la publication explicite ou différée, les relances et créations concurrentes, la pagination, les retraits, l'appartenance lors de la confirmation et la concurrence lors du rattachement. La liaison PC désactivée reste refusée.

Résultat final : 12 nouveaux tests réussis. Suite complète : 350 réussites sur 360 ; les dix échecs sont exactement ceux de la référence antérieure, comparaison de noms identique. Build réussi : 383 pages. Contrôles syntaxiques et `git diff --check` réussis. Le bouton d'installation de l'application est conservé et sa présence sur la page publique `/application/` a été vérifiée.

Recette navigateur locale avec le véritable tableau de bord et les actions serveur, sessions et stockage fictifs (`tests/serve-fiches-admin.mjs`, 127.0.0.1:4175) :

- Création d'une fiche, aperçu et conservation des saisies après réponse interrompue.
- Nouvel essai retrouvant une seule fiche et le même lien.
- Copie du message à envoyer.
- Ouverture du lien depuis une seconde page avec une session membre fictive, confirmation et suivi admin devenu « Confirmée · annonce visible · compte créé ».
- Création d'une seconde fiche sur mobile et absence de dépassement horizontal (largeur mesurée : 375 px).

Les outils adjacents du tableau de bord ne sont pas simulés dans ce serveur : leur erreur de chargement dans la recette n'est pas un résultat de production. Le serveur local est arrêté après les essais. Les captures livrées montrent uniquement des données fictives.

La suite complète conserve les dix échecs préexistants des anciennes liaisons PC / miroir / fusion, volontairement désactivées. Les tests de nouvelle création et les contrôles de sécurité ciblés réussissent. Aucun paiement, abonnement, envoi de mail, compte réel ou annonce réelle n'a été créé pour les essais.

## Avant activation

Le build et les ressources de la Preview peuvent être vérifiés sans secrets serveur. La Preview du projet ne dispose pas actuellement d'une base/configuration serveur de test : la recette authentifiée hébergée reste à faire dans un environnement de test configuré. Ne pas copier de secret de production vers la Preview pour contourner cette limite.

La publication en production attend l'accord explicite demandé dans la mission. Aucun changement de schéma n'est nécessaire. Le correctif de messagerie reste dans sa propre branche et sa propre PR.
