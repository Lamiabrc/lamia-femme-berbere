# Lamia Femme Berbère — boutique V2

Cette version est directement reliée au projet Supabase **Lamia Femme Berbère**.

## Déjà connecté
- Catalogue public Supabase
- Catégories : Bijoux, Livres, Les Trouvailles de Lamia, Amour & communauté
- Stock et pièces uniques
- Panier local
- Identité visuelle Lamia Femme Berbère
- Univers Yemma Werdi, Live Mariage Kabyle et Matching Kabyle

## Sécurité
- Le navigateur utilise uniquement la clé Supabase publique/publishable.
- Les tables commandes et lignes de commande ne sont pas lisibles par le public.
- Aucune clé Stripe secrète ni clé Supabase service-role n'est présente dans le site.

## À raccorder
- Stripe Checkout : en attente de validation du compte Stripe dédié (le seul compte connecté actuellement se nomme Qvtbox).
- Authentification admin Supabase pour le back-office produit.

## Réception des notifications Stripe

Endpoint : `POST /api/stripe-webhook` (compte Lamia `acct_1OB0kuAiy7hcxWtQ`).

Variables serveur de production : `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(ou `SUPABASE_SECRET_KEY`), `STRIPE_WEBHOOK_SECRET`.

Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Le SDK Stripe vérifie le corps brut et la signature (tolérance 300 secondes).
Les notifications sélectionnées sont enregistrées dans `stripe_webhook_events`,
avec accès serveur uniquement. La clé primaire empêche les doublons; un échec de
stockage renvoie 503 afin que Stripe réessaie. Les données et secrets ne sont pas journalisés.

**État : réception uniquement.** Les événements restent `pending`. Aucun consommateur
ne traite encore les commandes, stocks, réservations ou abonnements. Le paiement
Checkout reste désactivé jusqu'à la mise en place et au test de ce traitement.
`GET /api/stripe-webhook` confirme le déploiement et la présence des variables,
mais ne constitue pas un test de livraison signé depuis Stripe.

Après ajout du secret de signature dans Vercel, redéployer le site, puis vérifier
une livraison depuis Stripe. Tests locaux : `npm test` (signatures fictives uniquement).
