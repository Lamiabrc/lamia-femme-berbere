# Le bal de Lamia — guide de la version en préparation

État au 15 octobre 2026 : modifications locales, non déployées. Ce guide décrit la version préparée dans `codex/speed-dating-operational`, pas une garantie de fonctionnement du site public.

## Les adresses

- Inscription : https://lamia-femme-berbere.com/speed-dating/#events-title
- Compte et réservations : https://lamia-femme-berbere.com/mon-espace/
- Test caméra/micro : https://lamia-femme-berbere.com/speed-dating/salle/
- Entrée du bal : https://lamia-femme-berbere.com/speed-dating/bal/
- Gestion des soirées : https://lamia-femme-berbere.com/admin-soirees.html
- Animation, admission et rotations : https://lamia-femme-berbere.com/admin-bal.html
- Contacter Lamia : https://lamia-femme-berbere.com/confidences/

Les deux pages d’administration demandent un compte dont le rôle administratrice est vérifié sur le serveur. Connaître leur adresse ne donne pas les droits.

## Avant la soirée

1. Créer un salon gratuit dans Gestion des soirées : titre, public, dates, capacité de 2 à 20, âges. Le formulaire d’administration utilise le fuseau horaire de ton appareil ; les horaires du site sont affichés à l’heure de Paris. Vérifier l’aperçu avant publication.
2. Pour une même soirée divisée en salons, conserver exactement le même titre et la même heure de début. Ces deux valeurs regroupent les salons lors de l’ouverture du bal. Un seul bal peut être ouvert à la fois.
3. Les participants vérifient leur adresse email, se connectent, puis remplissent leur réservation et leurs préférences. Après la première connexion par email, il faut actuellement remplir à nouveau le formulaire : le brouillon n’est pas conservé.
4. Une place confirmée se retrouve dans Mon espace. « Liste d’attente » ne permet pas d’entrer au bal. L’attribution d’une place libérée aux personnes en attente n’est pas encore automatisée.
5. Consulter les inscrits confirmés. La liste d’adresses à copier exclut les personnes en liste d’attente. Les confirmations et rappels automatiques par email restent à configurer : ne pas les annoncer comme disponibles.
6. Répéter le parcours sur deux appareils réels avec caméra et micro avant la première soirée publique. Les tests locaux actuels simulent Daily et ne prouvent pas la qualité audiovisuelle.

Les changements de date, de public ou de titre et l’annulation sont bloqués lorsqu’il existe des inscriptions, y compris en attente. Le parcours de notification doit être terminé avant de permettre ces changements. Une réduction de capacité sous les places déjà prises est refusée.

## Pendant la soirée

1. Ouvrir les portes depuis Maîtresse du bal. Entrer dans le grand salon pour accueillir les participants.
2. Chaque personne se connecte avec son compte, pousse la porte et teste caméra/micro. Elle attend ensuite ton admission.
3. Vérifier les présences et cliquer sur Admettre. Une personne non admise ne reçoit pas de droit d’accès vidéo.
4. Choisir une durée de 2 à 15 minutes et de 1 à 20 tours. Une marge technique de 15 secondes s’ajoute à chaque tour pour la connexion. Cocher l’enchaînement automatique si souhaité, puis Lancer un tour.
5. Le serveur attribue les partenaires. Après le tour, une pause de 30 secondes précède la rotation automatique. Les requêtes périodiques des participants déclenchent la rotation ; ce n’est pas encore un ordonnanceur indépendant.
6. Rappeler tout le monde au grand salon arrête les tête-à-tête et l’enchaînement. Lancer un tour permet ensuite de repartir avec de nouvelles paires.
7. Annoncer la fin ouvre la période des choix privés. Laisser aux personnes le temps d’exprimer leur intérêt et leur accord de transmission avant de Fermer les portes.

Les commandes administratrice n’offrent aucun accès aux salles privées à deux. Les compteurs actuels indiquent les tête-à-tête attribués, pas la preuve d’une conversation vidéo effectivement tenue.

## Comment sont choisis les partenaires ?

Ce mécanisme fonctionne pendant une soirée. Il ne crée pas un catalogue de profils à consulter en dehors des événements.

Le système considère uniquement les adultes inscrits et confirmés dans le même salon, présents récemment et admis. Les âges et genres recherchés doivent être compatibles dans les deux sens. Un blocage, une suspension ou une exclusion empêche une nouvelle attribution. Aucun nom, portrait ou échange ne sert à deviner une origine, une religion ou une préférence.

À chaque tour, le système cherche le plus grand nombre possible de paires compatibles. Parmi des solutions équivalentes, il favorise les personnes qui ont eu moins d’attributions. Une paire déjà attribuée n’est pas répétée dans cette session. Cela ne garantit ni le même nombre de rencontres pour tous ni un partenaire compatible à chaque tour.

Exemple fictif : Nadia, 36 ans, recherche un homme de 30 à 45 ans ; Karim, 35 ans, et Samir, 38 ans, recherchent une femme de 30 à 45 ans. Tous sont dans le même salon et admis.

| Tour | Rencontre | Attente |
| --- | --- | --- |
| 1 | Nadia et Karim | Samir |
| 2 | Nadia et Samir | Karim |
| Suite | Plus de paire nouvelle compatible | Fin des rencontres |

Si Karim est absent avant le premier tour, seuls Nadia et Samir peuvent être associés. Si Nadia bloque Karim, cette paire ne peut plus être proposée. Aucun partenaire n’est imposé pour compléter un effectif impair.

Un retardataire est pris en compte aux tours suivants après admission. Une absence de réponse de la page pendant plus de 45 secondes retire la présence pour les prochaines attributions. Un rafraîchissement retrouve l’attribution enregistrée après reconnexion. Une panne de caméra n’est toutefois pas encore détectée comme une absence : la validation sur appareils réels reste nécessaire.

## Qui voit quoi ?

- Chaque participant voit le prénom du partenaire attribué et ses propres choix ; il ne voit pas les souhaits unilatéraux d’autrui.
- Après un tour, il peut choisir « Intéressé·e », « Pas intéressé·e » ou « Passer ».
- Un intérêt réciproque fait apparaître un choix supplémentaire : autoriser Lamia à transmettre son email.
- L’administration ne reçoit les coordonnées dans le bilan des réciprocités que si les deux personnes ont donné cet accord. L’envoi de la mise en relation n’est pas automatique.
- L’administratrice voit les inscriptions, présences et attributions pour organiser la soirée. Elle peut consulter les coordonnées nécessaires à l’organisation dans le rapport des inscrits ; le consentement de mise en relation ne remplace pas ces droits d’organisation.

## Incident technique ou comportement inapproprié

Caméra/micro : vérifier les autorisations du navigateur, fermer l’autre application utilisant la caméra, puis revenir dans le bal. Un diagnostic complet de connexion audiovisuelle reste à ajouter.

Déconnexion : revenir avec le même compte et pousser la porte. L’attribution en cours est conservée côté serveur tant qu’elle n’a pas expiré.

Blocage : le bouton du tête-à-tête arrête la rencontre et interdit les futures paires avec cette personne. Pour prévenir Lamia, le lien de contact existant reste disponible. Un véritable dossier de signalement associé à la rencontre et son traitement dans l’administration restent à développer.

Exclusion : utiliser Exclure dans Maîtresse du bal. L’accès applicatif est refusé immédiatement. La coupure chez Daily est demandée et, en cas d’échec, conservée pour être retentée à la prochaine requête. Garder l’administration ouverte et vérifier la disparition de l’erreur ; une coupure ne peut être garantie pendant une panne du fournisseur.

## Après la soirée

Consulter le bilan administratrice, y compris après fermeture. Transmettre des coordonnées uniquement lorsque les deux accords apparaissent. Ne pas publier de captures, de préférences ou de listes d’inscrits.

Limite actuelle : le prochain bal remplace le bilan de session actif. Un archivage durable des bilans, l’accès aux choix après fermeture et une politique de conservation restent à finaliser avant l’exploitation publique.

## FAQ participant

**Faut-il une carte bancaire ?** Pas pour les salons du bal actuellement annoncés gratuits. Les paiements ne sont pas activés pour cette version.

**Ai-je forcément une rencontre à chaque tour ?** Non. Les présences, préférences réciproques et blocages déterminent les possibilités.

**La liste d’attente garantit-elle une place ?** Non. Seule une réservation confirmée autorise l’entrée.

**Lamia écoute-t-elle les tête-à-tête ?** L’interface ne lui permet pas d’entrer dans ces salles privées.

**Mon email est-il donné à mon partenaire ?** Pas automatiquement. Il faut un intérêt réciproque et les accords des deux personnes pour la mise en relation par Lamia.

**Puis-je changer d’avis ?** Les choix et l’accord peuvent être modifiés tant que la session accepte les réponses. Un email déjà transmis ne peut pas être repris : signaler le changement directement à Lamia.

## Promotion — brouillons à conserver, pas à publier

Lors de l’audit, les salons publiés annonçaient le Bal masqué de Venise du **31 octobre 2026, de 21 h à 23 h, heure de Paris**, gratuit, avec 20 places par salon. Recontrôler la date, les places et le parcours avant publication. La durée et le nombre de rencontres effectives dépendent de la configuration et des participants compatibles.

**TikTok, après validation de la vraie répétition :** « Le 31 octobre, la Maison Lamia Femme Berbère ouvre son Bal masqué de Venise. De 21 h à 23 h, heure de Paris : une soirée de rencontres en ligne pour adultes, gratuite, sur inscription. Choisis ton salon et retrouve les informations sur lamia-femme-berbere.com/speed-dating/. »

**Instagram, après validation :** « Un masque, un prénom, le temps de faire connaissance. Le Bal masqué de Venise de Lamia Femme Berbère est annoncé le 31 octobre, de 21 h à 23 h, heure de Paris. Participation gratuite pour adultes, sur inscription et selon les places disponibles dans ton salon. Informations et réservation sur le site de la Maison. »

**Facebook, après validation :** « Lamia Femme Berbère prépare son Bal masqué de Venise du 31 octobre 2026, de 21 h à 23 h, heure de Paris. Une soirée de rencontres en ligne pour adultes, avec des salons par tranche d’âge et zone annoncée. Participation gratuite ; 20 places maximum par salon. Consulte les conditions et les disponibilités sur https://lamia-femme-berbere.com/speed-dating/. »

Ces textes ne promettent ni compatibilité amoureuse, ni nombre garanti de rencontres, ni rappels email automatiques. Aucun texte n’a été publié et aucune campagne n’a été envoyée.
