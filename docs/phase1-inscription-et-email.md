# TAYRI — Phase 1 et secours email

Travail parti de `ec4dfedc4de51e3a7e2ad03c820519be0dbdf59a`, sur `codex/phase1-inscription-secours-email`.
Ce document décrit le premier lot. La publication et son identifiant sont à vérifier dans la PR associée et le tableau de bord Vercel ; voir aussi `PASSATION-CLAUDE.md`.

## Résultat prévu

- Cadre partagé bleu du logo (`#273b80`), jusqu’au violet (`#6b43a8`), fond clair, touches dorées. Deux familles : DM Sans et Cormorant Garamond. Logos et fichiers images officiels inchangés.
- Inscription en trois cartes : « Toi » (six informations avec le prénom), « Ce que tu cherches », « Tes photos et ton compte ». Le compte est créé à la fin.
- Deux photos conservées conformément à la règle existante. Accords de partage facultatifs repliés. Pas de défilement des anciennes dizaines de champs pendant l’inscription.
- Retour arrière, sauvegarde des réponses et des photos sur le même appareil dans IndexedDB, reprise proposée explicitement, durée de sept jours. Le mot de passe et l’email ne sont pas enregistrés dans ce brouillon local.
- Par défaut, la reprise reste sur le même appareil. La reprise côté serveur est préparée mais désactivée tant que la sauvegarde préalable et la migration additive ne sont pas réalisées. Les photos restent locales jusqu’au dépôt authentifié.
- Les anciens brouillons peuvent être repris avec leurs réponses détaillées. Une édition partielle conserve les critères avancés déjà enregistrés. Les cinq choix booléens du formulaire détaillé proposent désormais « Non renseigné / Oui / Non » pour ne pas transformer une réponse absente en refus.
- Le parcours court ne demande plus situation, études et religion avant la première proposition. La refonte complète de « Compléter mon profil » reste en phase 2.
- Le profil reçu attend une validation humaine. Recevoir deux fichiers n’autorise plus les anciennes fonctions de validation automatique, y compris dans les tâches planifiées. Les profils déjà publiés ne sont pas suspendus en masse ; leur réexamen historique reste à organiser avec Lamia.
- Les demandes de rencontre de profils non validés et les tentatives vers leurs numéros sont refusées. Les fiches créées manuellement par Lamia sans compte restent des fiches de son outil ; une fiche liée à un compte attend la validation de son profil.
- Les vues des trois étapes et les dépôts terminés sont des événements distincts, sans réponses personnelles dans ces événements. Ce sont des comptages de vues, pas une reconstruction des abandons historiques ni une mesure garantie de personnes uniques.

## Brevo : activation à terminer

Le transport serveur commun couvre les Confidences, les liens de compte et connexion, le Bal, les alertes de vente et les livres numériques. La connexion par email des Confidences utilise aussi ce transport.

1. Resend reste le fournisseur principal.
2. Après un quota explicitement refusé, l’envoi passe immédiatement par Brevo lorsque les deux variables Brevo sont présentes.
3. Après une coupure ou un 5xx, les reprises restent chez Resend avec la même clé d’idempotence. Pas de bascule après un état incertain, pour limiter le risque de doublon entre fournisseurs.
4. Un rejet de contenu, un destinataire invalide ou supprimé ne déclenche pas une tentative chez un autre fournisseur.
5. Un succès signifie « accepté par le fournisseur ». La livraison en boîte de réception reste un contrôle réel distinct.

Configuration Vercel, côté serveur uniquement :

| Variable | Valeur à renseigner |
|---|---|
| `BREVO_API_KEY` | Clé **API**, stockée comme secret, jamais dans le navigateur, le dépôt ou le chat |
| `BREVO_FROM` | Expéditeur réel vérifié chez Brevo, au format `TAYRI <adresse-du-domaine>` |
| `EMAILS_TOUS` | `1` pour rétablir les notifications email actuellement mises en économie, après test et validation |
| `INSCRIPTION_EMAIL_VERIFIE` | `1` après vérification réelle de la réception des emails essentiels ; impose alors une preuve d’adresse avant connexion |
| `INSCRIPTION_BROUILLON_SERVEUR` | `1` seulement après sauvegarde vérifiable et application de la migration dédiée |

Lamia a branché Brevo : la présence de `BREVO_API_KEY` en production a été constatée sans lire sa valeur. À ce contrôle, `BREVO_FROM` manque encore. La vérification du domaine et une réception réelle restent à constater. Le domaine utilise les DNS Vercel. Ajouter les seuls enregistrements demandés par Brevo, après comparaison avec les enregistrements existants : ne pas remplacer les MX ni ajouter un second SPF ou DMARC. Ne pas affaiblir un DMARC existant.

L’offre gratuite annonce [300 envois par jour](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), sans report des crédits non utilisés. Au-delà, des emails transactionnels peuvent être mis en attente par Brevo : ce secours n’est pas un service illimité. L’[idempotence Brevo](https://developers.brevo.com/changelog/2021/11/10) dure quinze minutes ; celle de Resend dure vingt-quatre heures. Aucune garantie d’envoi exactement une fois entre deux fournisseurs n’est annoncée.

## Mise en ligne et retour arrière

Lamia a explicitement demandé la mise en ligne. Aucun email de relance réel ni aucune campagne de rattrapage n’a été lancé pendant les tests. Le code est compatible avec l’absence de la nouvelle table et de Brevo : aucun accès à cette table sans activation du réglage.

Tant que `INSCRIPTION_EMAIL_VERIFIE` est absent, le fonctionnement de compte déjà décidé par Lamia le 25 novembre est conservé : confirmation technique Auth, connexion immédiate, marqueur `a_reconfirmer:true`. **Ce n’est pas une preuve de propriété de l’adresse email.** La vérification humaine des profils avant rencontres reste obligatoire. Après test de délivrabilité, activer le mode strict avec le réglage indiqué ci-dessus et redéployer ; organiser séparément la reconfirmation des comptes historiques.

La migration `20261126143000_inscription_brouillons.sql` ajoute une table privée, un index d’expiration et ses permissions. Elle ne modifie ni comptes ni profils ni abonnements. Les rôles anonyme et membre n’ont aucun accès SQL direct ; l’API authentifiée impose le propriétaire à partir de la session. Les brouillons expirés sont purgés par la tâche quotidienne ; le brouillon en ligne est retiré après dépôt terminé.

Avant application hébergée : sauvegarde/restauration vérifiables selon la règle de Lamia, puis application de cette migration seule. Ne pas utiliser un envoi global de toutes les migrations locales. Un retour au déploiement précédent laisse la nouvelle table en place pour préserver ses données. Toute suppression de table demanderait un export et un nouvel accord.

## Validation et limites

- Référence avant modifications : 478 tests réussis sur la version de départ, avec réseau de production bloqué.
- Lot actuel : 501 tests réussis, aucun échec ; 383 pages générées. Le parcours compatible de création, connexion puis dépôt a également été vérifié dans le navigateur local avec données fictives.
- La suite actuelle vérifie les modes compatible et strict des comptes, le secours email, les permissions PostgreSQL du brouillon, son propriétaire, la conservation des critères, l’absence de publication automatique et le diagnostic Stripe.
- Recette navigateur locale à 375 px et sur ordinateur, avec données fictives : étapes, validation des champs, retour, rechargement avec deux photos, mot de passe vide à la reprise, confirmation simulée et arrivée en attente de Lamia.
- Le temps inférieur à deux minutes et la délivrabilité réelle restent à mesurer avec les cinq membres de recette prévus au plan. Les traductions manquantes déjà signalées par le build restent hors de ce lot.
- Les maquettes « Mon espace » et administration illustrent la même charte. Leur réorganisation fonctionnelle reste dans les phases suivantes, soumises à l’accord de Lamia.

Recette locale : `npm run build`, puis `node tests/serve-inscription.mjs` ; ouvrir `http://127.0.0.1:4181/rencontres/#confier`. Ce serveur ne contacte pas la production. Maquettes : `http://127.0.0.1:4181/docs/phase1-maquettes.html`.
