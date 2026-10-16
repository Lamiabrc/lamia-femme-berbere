// Pages légales : BROUILLONS. Les champs [À COMPLÉTER] dépendent de la situation de Lamia
// et doivent être remplis avant l'ouverture du paiement. À faire relire par un professionnel.

const todo = (label) => `<mark class="todo">[À COMPLÉTER : ${label}]</mark>`;

export const legalPages = [
  {
    path: '/mentions-legales/',
    title: 'Mentions légales',
    body: `
<h2>Éditrice du site</h2>
<p>Lamia Bréchet Ighil, particulière<br>
Adresse : ${todo('numéro et rue')}, Rennes, France<br>
Email : <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a></p>
<p>Directrice de la publication : Lamia Bréchet Ighil</p>
<h2>Hébergement</h2>
<p>Site hébergé par Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis.<br>
Données stockées par Supabase, centre de données de Paris (Union européenne).</p>
<h2>Propriété intellectuelle</h2>
<p>Les textes, illustrations, photographies, logos et la marque Lamia Femme Berbère sont la propriété de leur autrice. Toute reproduction sans autorisation écrite est interdite.</p>`,
  },
  {
    path: '/cgv/',
    title: 'Conditions générales de vente',
    body: `
<p>Les présentes conditions s'appliquent aux ventes conclues sur ce site entre Lamia Bréchet Ighil, Rennes, France (« la Maison ») et toute personne agissant comme consommatrice (« la cliente »).</p>
<h2>1. Ce qui est vendu</h2>
<ul>
<li>des bijoux et objets (pièces uniques ou en petite série) ;</li>
<li>le livre <em>Werdi, ouvre les yeux !</em> en version papier et en version numérique ;</li>
<li>des places pour des soirées de rencontre en ligne (« soirées »).</li>
</ul>
<h2>2. Prix</h2>
<p>Les prix sont indiqués en euros. {{TVA}} Les frais de livraison sont indiqués avant la validation de la commande. Le prix des livres respecte la loi sur le prix unique du livre.</p>
<h2>3. Commande et paiement</h2>
<p>Le paiement se fait par carte bancaire via Stripe, prestataire de paiement sécurisé. La Maison n'a jamais accès aux données de carte. La commande est ferme après confirmation du paiement.</p>
<h2>4. Précommandes</h2>
<p>Une précommande réserve un article sans paiement immédiat. La Maison confirme la disponibilité par email et transmet le moyen de paiement. La vente est conclue à réception du paiement ; avant cela, la cliente peut annuler sa précommande par simple email, sans frais. Une pièce unique est réservée à la première précommande ; les suivantes sont inscrites en liste d'attente. Le livre broché en précommande est expédié dès réception des exemplaires imprimés.</p>
<h2>4 bis. Livraison des bijoux, objets et livres papier</h2>
<p>{{LIVRAISON}} Remise en main propre gratuite à Rennes, sur rendez-vous. Expédition sous 3 jours ouvrés après paiement. Pour une livraison hors de France métropolitaine, écrire à lamia.brechet@outlook.fr.</p>
<h2>5. Livre numérique</h2>
<p>Le fichier est mis à disposition dans l'espace membre dès la confirmation du paiement. En demandant ce téléchargement immédiat, la cliente donne son accord exprès et renonce à son droit de rétractation, conformément à l'article L221-28 du Code de la consommation.</p>
<h2>6. Soirées</h2>
<p>Une soirée est une prestation de loisirs fournie à une date déterminée : elle n'ouvre pas de droit de rétractation (article L221-28 du Code de la consommation). Le lien de la salle vidéo est envoyé par email avant la soirée. La participation suppose le respect des règles de la Maison : respect, sérieux de la démarche, aucun propos ou contenu déplacé. La Maison peut exclure une personne qui ne les respecte pas, sans remboursement.</p>
<p>Une place payée n'est pas remboursable, y compris en cas d'absence. Si la Maison annule une soirée, la place est remboursée intégralement. Les soirées gratuites ne donnent lieu à aucun paiement.</p>
<h2>7. Droit de rétractation (bijoux, objets, livres papier)</h2>
<p>La cliente dispose de 14 jours à compter de la réception pour se rétracter, sans avoir à se justifier, en écrivant à lamia.brechet@outlook.fr. Le produit est retourné à ses frais, complet et dans son état d'origine. Le remboursement intervient sous 14 jours après réception du retour.</p>
<h2>8. Garanties</h2>
<p>Les produits bénéficient de la garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) et de la garantie des vices cachés (articles 1641 et suivants du Code civil). Les bijoux artisanaux peuvent présenter de légères variations de couleur ou de forme, qui ne constituent pas un défaut.</p>
<h2>9. Médiation</h2>
<p>En cas de litige, la cliente peut recourir gratuitement au médiateur de la consommation : ${todo('nom, site et adresse du médiateur choisi')}.</p>
<p class="fine">Version ${'2026-10-brouillon'}.</p>`,
  },
  {
    path: '/confidentialite/',
    title: 'Politique de confidentialité',
    body: `
<p>Responsable du traitement : Lamia Bréchet Ighil, Rennes, France, lamia.brechet@outlook.fr.</p>
<h2>Les données collectées et pourquoi</h2>
<ul>
<li><strong>Espace membre</strong> : adresse email et mot de passe (chiffré), pour te connecter.</li>
<li><strong>Soirées</strong> : inscriptions et état du paiement, pour organiser les soirées ; les souhaits exprimés après une soirée, pour les mises en relation réciproques.</li>
<li><strong>Alertes</strong> : le contenu de ton alerte et l'éventuel message audio, pour assurer ta sécurité. La personne signalée ne connaît jamais ton identité.</li>
<li><strong>Commandes</strong> : nom, adresse de livraison et email, pour livrer et facturer. Les données de carte sont traitées par Stripe uniquement.</li>
</ul>
<h2>Où elles sont stockées</h2>
<p>Base de données Supabase hébergée à Paris. Site servi par Vercel. Paiements traités par Stripe.</p>
<h2>Durée de conservation</h2>
<p>${todo('durées choisies, par exemple : compte jusqu’à sa suppression, commandes 10 ans pour la comptabilité, alertes 3 ans')}.</p>
<h2>Tes droits</h2>
<p>Tu peux accéder à tes données, les corriger, les supprimer ou t'opposer à leur traitement en écrivant à lamia.brechet@outlook.fr. Tu peux aussi saisir la CNIL (cnil.fr).</p>
<p>Le site n'utilise pas de cookies publicitaires.</p>`,
  },
];

// Textes qui dépendent des réglages de la boutique (tableau de bord → Livraison et TVA).
const eur = (c) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);
export function livraisonTexte(t) {
  return `Envoi suivi Colissimo en France métropolitaine : livre ou objet ${eur(t.colis_1)} (2 ou 3 exemplaires : ${eur(t.colis_2_3)}, 4 et plus : ${eur(t.colis_4_plus)}), bijou ${eur(t.bijou)} (envoi contre signature, assuré).`;
}
export function tvaTexte(tva) {
  if (tva?.active) return `Ils s’entendent toutes taxes comprises (TVA ${String(tva.taux).replace('.', ',')} % incluse).${tva.mention ? ` ${tva.mention}` : ''}`;
  return tva?.mention ? `${tva.mention}` : '';
}
