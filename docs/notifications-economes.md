# Emails TAYRI : notifications économes

Demandé par Lamia le 26 novembre 2026 après réception du test envoyé à son adresse vérifiée Brevo. Sa rectification indique que cet email est arrivé hors des spams. `BREVO_FROM` est configuré en production et déployé, sur le même commit que la PR 320. Aucun autre email réel de test n’a été envoyé.

## Règles du lot

- Les notifications facultatives partagent un plafond de **80 réservations d’envoi par jour, heure de Paris**, pour l’ensemble du site et des fournisseurs. Elles sont aussi limitées à **une réservation par adresse sur 24 heures glissantes**, quels que soient l’événement, le contenu, le serveur ou la bascule Resend/Brevo.
- Une réservation échouée ou un délai incertain peut consommer une place : la priorité est de ne pas dépasser le plafond, pas de promettre 80 emails effectivement reçus. Une forte concurrence peut aussi réduire le nombre servi. Les emails ainsi limités ne sont pas placés dans une nouvelle file d’attente ; les événements restent dans les espaces concernés de l’application.
- Les liens de connexion et confirmations d’adresse ne prennent pas ce budget. Les livraisons de livres achetés et les alertes d’encaissement conservent également leur transport transactionnel. Le plafond ne garantit donc pas de rester sous tous les quotas des fournisseurs si ces transactions augmentent fortement.
- Les intérêts utilisent désormais le canal commun : un push accepté évite l’email de doublon, puis le budget partagé protège aussi les appels directs qui contournaient l’ancien journal.
- Si la lecture du budget échoue, l’email facultatif ne part pas. Un lien essentiel demandé par le membre reste indépendant de ce contrôle. Les limites normales ne produisent pas de faux avertissements de panne ; une indisponibilité du budget reste journalisée sans adresse ni contenu privé.

## Stockage et sûreté

Réservations dans la table privée existante `platform_settings`, sans migration ni nouveau droit. Schéma et politiques vérifiés : clé primaire `key`, `value jsonb`, `updated_at timestamptz`; lecture publique limitée à `social_links` et `matching`. Les clés de budget sont donc privées. Le destinataire n’est pas enregistré en clair : HMAC avec la clé serveur, et jamais le contenu de l’email.

L’insertion ignore les doublons ; la reprise après 24 heures et l’incrément du compteur sont conditionnels et atomiques en base. Une lecture suivie d’une écriture inconditionnelle ne serait pas suffisante entre deux serveurs. Les opérations sont bornées à cinq secondes ; une erreur est traitée comme un refus d’envoi facultatif. Une réservation par destinataire et une ligne par jour sont conservées ; une purge d’entretien de ces compteurs reste à organiser si le volume l’exige, sans supprimer les autres paramètres.

## Activation

Le précédent essai d’activation globale a été refusé par le contrôle automatique car un accord pour un email de test ne couvrait pas clairement les notifications aux membres et la confirmation des nouvelles inscriptions. Lamia a ensuite demandé une réactivation **avec optimisation des notifications**. Ce lot concrétise cette condition avant activation.

Après validation des tests et publication du lot : `EMAILS_TOUS=1` pour reprendre les notifications avec ces limites ; `INSCRIPTION_EMAIL_VERIFIE=1` pour demander une preuve d’adresse aux nouveaux comptes. La reprise des brouillons entre appareils reste désactivée et sa migration reste non appliquée. Aucune campagne de rattrapage n’est déclenchée manuellement dans ce lot.

Tests PostgreSQL locaux : concurrence sur une même personne, plafond global à la dernière place disponible, minuit de Paris, reprise à 24 heures, budget indisponible et indépendance des liens essentiels. Sources : [PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html), [upsert Supabase](https://supabase.com/docs/reference/javascript/upsert).

Suite complète du lot : **504 tests réussis, aucun échec**. Pas de migration hébergée requise pour ce budget.

Pour la délivrabilité durable, authentifier le domaine possédé par TAYRI dans Brevo. Gmail est un expéditeur transitoire vérifié ; Brevo le réécrit techniquement. [Documentation Brevo](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).
