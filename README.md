# La Maison Lamia Femme Berbère — version 2 (branche `maison-v2`)

La Maison numérique de Lamia : chaque activité est une pièce (le Hall, le Salon, la
Bibliothèque de Yemma, l'Écrin, le Grenier des Trouvailles, le Salon du Speed Dating,
le Cabinet des Confidences, le Patio, la Galerie, et trois pièces prévues : l'Atelier,
la Salle de bain, la Coiffeuse).

**Cette branche n'est pas en production.** Le site en ligne reste celui de `main` jusqu'à
la validation explicite de Lamia.

## Fonctionnement

- `content/rooms.mjs` : la liste des pièces (nom, phrase d'accueil, statut, couleur d'émail, position dans le plan).
- `content/pages.mjs` : les textes de chaque pièce.
- `build/build.mjs` : génère toutes les pages dans `dist/`, sans aucune dépendance (`npm run build`).
- `src/maison.js` : catalogue, fiche produit, panier, prochaine soirée (lecture publique Supabase).
- `src/membre.js` : espace membre, pré-réservation de soirée, alerte confidentielle.
- `public/` : images optimisées (WebP en 320, 640 et 1120 px) et pages d'administration existantes (`admin.html`, `pilotage.html`).
- `api/` et `lib/` : réception des notifications Stripe (inchangée).
- `supabase/migrations/` : schéma de la Maison, versionné. `20261011120000_maison_fondations.sql` **n'est pas encore appliquée**.

Vercel lit `vercel.json` : commande `node build/build.mjs`, dossier publié `dist/`.

## Sécurité

- Le navigateur n'utilise que la clé Supabase publique. Aucune clé secrète (Stripe, service-role) n'est dans le code.
- Les droits sont écrits dans la base (RLS) et versionnés dans `supabase/migrations/`.
- `npm test` vérifie la génération des pages et l'absence de secrets dans `dist/`.

## Paiement

Stripe : compte actuel de Lamia (`acct_1OB0…`). Le paiement en ligne reste désactivé
jusqu'à la mise en ligne des CGV, des mentions légales et du traitement des commandes.
Variables serveur attendues : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

## Outil de live

L'outil de matching utilisé pendant les lives reste sur le PC de Lamia. Il n'a aucun lien
avec ce site : ni données, ni connexion.
