# Correctifs des parcours et diagnostic commercial — 27 novembre 2026

## Matchs et numéros

Le gestionnaire des choix de matchs était attaché au bloc des personnes bloquées, qui ne contient pas les boutons. Il est maintenant attaché au profil, avec désactivation pendant la sauvegarde et confirmation visible près des choix. Un refus de la base ne produit plus de fausse réussite. Le consentement, les capacités des formules et les intérêts réciproques continuent de décider des ouvertures.

Le formulaire des numéros disparaissait à l'échéance naturelle du chat, alors que l'API autorisait encore cet échange. `numero_possible` distingue maintenant l'échéance d'une fin volontaire, d'un dématch ou d'un signalement. Le chat expiré reste fermé ; le numéro de l'autre n'apparaît qu'après les deux partages. Les droits Passion/Prestige et le parcours de parrainage restent en place. Une panne de lecture des droits bloque provisoirement le partage avec un message adapté. Le lien d'invitation, auparavant remplacé par un second gestionnaire de clic, partage maintenant le même gestionnaire que les autres actions de discussion.

La présentation des formules ne promet plus l'échange des numéros dans Découverte. La fonction est explicitée dans Passion et le tableau comparatif, sans modification de prix ou de droits.

## Administration et réseaux sociaux

« Corriger ses informations » ouvrait un volet vide pour une fiche sans compte : seul le formulaire du compte existait et il était masqué. Ce volet accueille désormais le véritable éditeur de la fiche. Les actions de compte incompatibles sont masquées ou désactivées ; Contacter renvoie au contact de la fiche. Une réponse tardive d'un ancien dossier ne peut plus remplacer le dossier courant.

La recherche des membres ignorait les contacts des lives. Une recherche privée commune consulte désormais `contacts_lamia`, l'index historique `outil_tiktok`, les liens des `profils_outil` et les champs `contactReseau`/`tiktokLive` des `annonces`. Elle pagine par curseur et normalise les liens TikTok, Instagram et Facebook. Un lien explicitement corrigé sur la fiche prime sur son ancien contact. La recherche par lien est disponible dans « Retrouver une personne », dans « Chercher » pour un lien/@pseudo et dès le renseignement du lien dans la création de fiche. « Toutes les fiches » conserve sa recherche TikTok et ses filtres.

La création refuse un lien déjà associé à un profil ou une fiche, avec des boutons pour ouvrir l'existant et sans perdre le formulaire. Aucun ancien profil n'est fusionné, supprimé, réactivé ou réécrit. Les nouvelles créations avec un lien reconnu utilisent un identifiant d'outil déterministe ; la contrainte unique existante évite aussi deux créations simultanées avec des identifiants de tentative différents. Si la recherche échoue, la création attend au lieu de contourner le contrôle. Un pseudo n'est pas une preuve d'identité ; la résolution d'éventuels anciens doublons reste manuelle.

## Diagnostic des ventes et des erreurs

Le diagnostic public de paiement confirme une configuration active, la bonne connexion Stripe et l'encaissement autorisé. Le GET du webhook affichait encore `checkoutEnabled:false` en dur : il lit désormais le réglage réel. Cela corrige un diagnostic trompeur, pas un arrêt de l'encaissement.

Contrôles en lecture seule sur le compte Stripe de Lamia : les métriques Checkout disponibles montrent des pages initialisées mais aucune confirmation/réussite depuis le 20 novembre. Une requête agrégée sur les PaymentIntents créés depuis le 19 novembre à 23 h UTC ne retourne aucune ligne ; données rafraîchies le 27 novembre à 17 h UTC. Ce résultat ne prouve pas une cause commerciale, ni une panne passée ; les métriques quotidiennes ont leur propre retard de rafraîchissement. Aucun paiement réel n'a été déclenché.

Sur la fenêtre récente contrôlée : aucun groupe d'exception Vercel ; aucun avis de santé Supabase. Les réponses Supabase 409 observées concernent des écritures répétées de passes de swipe et de crédits offerts, interceptées dans le code. Elles ne suffisent pas à expliquer une ligne rouge Vercel, ni l'absence de ventes. Le code HTTP et l'heure des lignes signalées restent nécessaires pour une attribution exacte. Le champ historique `processing_status=pending` des webhooks est archivé sans mise à jour par le gestionnaire actuel : ne pas le considérer seul comme une preuve de paiement non livré.

## Vérification et reprise

525 tests réussis sur le lot fonctionnel ; 104 tests ciblés supplémentaires après les derniers ajustements, compilation de 383 pages. Recettes avec la vraie page et les vrais scripts, API/session/base fictives :

- `node tests/serve-matchs-numeros.mjs` : profil sans personne bloquée, accord enregistré une seule fois, erreur visible, échange après échéance, confidentialité avant réciprocité et absence de partage après signalement ; contrôle mobile 390 px.
- `node tests/serve-tableau-correctifs.mjs` : ouverture du volet, modification et relecture de la ville, recherche par lien TikTok de live sans compte, refus de création en doublon et conservation des textes ; zéro nouvelle fiche dans cette recette.

Aucune migration ni modification manuelle des comptes réels. Le numéro du profil cité dans les réclamations n'a pas été utilisé pour ouvrir une conversation privée. Vérifier la PR de `codex/matchs-numeros` et le SHA Vercel effectivement promu avant reprise.
