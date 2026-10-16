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
<p>{{LIVRAISON}} Remise en main propre gratuite à Rennes, sur rendez-vous. Expédition sous 3 jours ouvrés après paiement. Pour une livraison hors de France métropolitaine, écrire à lamia.brechet@outlook.fr. Détails sur la page <a href="/retours/">Livraison, retours et remboursements</a>.</p>
<h2>5. Livre numérique</h2>
<p>Le fichier est mis à disposition dans l'espace membre dès la confirmation du paiement. En demandant ce téléchargement immédiat, la cliente donne son accord exprès et renonce à son droit de rétractation, conformément à l'article L221-28 du Code de la consommation.</p>
<h2>6. Soirées</h2>
<p>Une soirée est une prestation de loisirs fournie à une date déterminée : elle n'ouvre pas de droit de rétractation (article L221-28 du Code de la consommation). Le lien de la salle vidéo est envoyé par email avant la soirée. Les soirées sont réservées aux personnes majeures. La participation suppose le respect de la <a href="/conditions-utilisation/">charte des soirées</a> et des règles de la Maison : respect, sérieux de la démarche, aucun propos ou contenu déplacé. La Maison peut exclure une personne qui ne les respecte pas, sans remboursement.</p>
<p>Une place payée n'est pas remboursable, y compris en cas d'absence. Si la Maison annule une soirée, la place est remboursée intégralement. Les soirées gratuites ne donnent lieu à aucun paiement.</p>
<h2>7. Droit de rétractation (bijoux, objets, livres papier)</h2>
<p>La cliente dispose de 14 jours à compter de la réception pour se rétracter, sans avoir à se justifier, en écrivant à lamia.brechet@outlook.fr. Le produit est retourné à ses frais, complet et dans son état d'origine. Le remboursement intervient sous 14 jours après réception du retour. La marche à suivre et le modèle de formulaire de rétractation figurent sur la page <a href="/retours/">Livraison, retours et remboursements</a>.</p>
<h2>8. Garanties</h2>
<p>Les produits bénéficient de la garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) et de la garantie des vices cachés (articles 1641 et suivants du Code civil). Les bijoux artisanaux peuvent présenter de légères variations de couleur ou de forme, qui ne constituent pas un défaut.</p>
<h2>9. Médiation</h2>
<p>En cas de litige, la cliente peut recourir gratuitement au médiateur de la consommation : ${todo('nom, site et adresse du médiateur choisi, par exemple CM2C ou Medicys (adhésion obligatoire dès les premières ventes)')}. Plateforme européenne de règlement des litiges : <a href="https://ec.europa.eu/consumers/odr" rel="noopener" target="_blank">ec.europa.eu/consumers/odr</a>.</p>
<p class="fine">Version ${'2026-10-brouillon'}.</p>`,
  },
  {
    path: '/confidentialite/',
    title: 'Politique de confidentialité',
    body: `
<p>Responsable du traitement : Lamia Bréchet Ighil, Rennes, France, <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a>.</p>
<h2>Les données collectées et pourquoi</h2>
<ul>
<li><strong>Espace membre</strong> : prénom, adresse email et mot de passe (chiffré, la Maison ne le voit jamais), pour te connecter et suivre tes soirées et tes achats.</li>
<li><strong>Soirées de rencontre</strong> : prénom, email, genre, date de naissance, ville, zone de recherche et salon choisi, pour te placer dans le bon salon et la bonne tranche d’âge ; l’état de ton inscription ; après la soirée, les personnes que tu souhaites revoir et ton avis, pour les mises en relation réciproques et l’amélioration des soirées. Base légale : ton inscription (exécution du service).</li>
<li><strong>Vidéo des soirées</strong> : l’image et le son passent en direct par Daily, notre prestataire vidéo. <strong>Les soirées ne sont jamais enregistrées</strong>, ni par la Maison ni par Daily.</li>
<li><strong>Alertes</strong> : le contenu de ton alerte et l’éventuel message audio, pour assurer ta sécurité. La personne signalée ne connaît jamais ton identité.</li>
<li><strong>Commandes et précommandes</strong> : nom, adresse de livraison, téléphone éventuel et email, pour livrer, facturer et te tenir informée. Les données de carte bancaire sont traitées uniquement par Stripe ; la Maison n’y a jamais accès.</li>
</ul>
<p>Le salon que tu choisis (par exemple Algérie–France) peut laisser deviner une origine. Cette information sert uniquement à organiser les soirées : elle n’est jamais publiée, vendue ni utilisée pour de la publicité.</p>
<h2>Qui y a accès</h2>
<p>Seule Lamia, et les prestataires techniques ci-dessous dans la limite de leur mission. Les autres participantes et participants ne voient que ton prénom pendant la soirée. Ton email n’est communiqué à une autre personne qu’en cas de souhait réciproque, et seulement avec ton accord.</p>
<h2>Prestataires et lieux de stockage</h2>
<ul>
<li>Supabase : base de données, hébergée à Paris (Union européenne).</li>
<li>Vercel : hébergement du site (États-Unis, avec garanties contractuelles de la Commission européenne).</li>
<li>Daily : vidéo en direct des soirées (États-Unis, avec garanties contractuelles), sans enregistrement.</li>
<li>Stripe : paiement sécurisé.</li>
</ul>
<h2>Durée de conservation</h2>
<ul>
<li>Compte membre : jusqu’à sa suppression, ou 3 ans après ta dernière connexion.</li>
<li>Inscriptions et souhaits des soirées : 1 an après la soirée.</li>
<li>Alertes : 3 ans, puis suppression.</li>
<li>Commandes et factures : 10 ans (obligation comptable).</li>
<li>Mesure d’audience : 13 mois.</li>
</ul>
<h2>Cookies et stockage dans ton navigateur</h2>
<p>Le site n’utilise <strong>aucun cookie publicitaire ni de suivi</strong>, c’est pourquoi aucun bandeau ne te demande ton accord. Ton navigateur garde seulement ce qui est nécessaire au fonctionnement : ta connexion à ton espace, ton panier, ton passage au bal (le temps de la soirée) et tes réglages de musique et de flou.</p>
<p>Mesure d’audience : pour savoir quelles pages sont lues et d’où viennent les visites, le site compte les pages vues sans cookie. Il enregistre la page, la provenance (réseau social, lien direct…), le type d’appareil, l’heure, ainsi que le pays, la région et la ville approximatifs déduits du réseau internet. L’adresse IP n’est jamais enregistrée, et l’empreinte technique utilisée pour compter les visiteurs change chaque jour : elle ne permet pas de suivre une personne dans le temps.</p>
<h2>Tes droits</h2>
<p>Tu peux accéder à tes données, les corriger, les supprimer, en obtenir une copie, ou t’opposer à leur traitement en écrivant à <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a>. Réponse sous un mois. Tu peux aussi saisir la CNIL (<a href="https://www.cnil.fr" rel="noopener" target="_blank">cnil.fr</a>).</p>
<p class="fine">Version 2026-10.</p>`,
  },
  {
    path: '/retours/',
    title: 'Livraison, retours et remboursements',
    body: `
<h2>Livraison</h2>
<p>{{LIVRAISON}} Remise en main propre gratuite à Rennes, sur rendez-vous. Expédition sous 3 jours ouvrés après paiement, avec un numéro de suivi envoyé par email. Pour une livraison hors de France métropolitaine, écris à <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a> pour connaître le tarif.</p>
<p>Un colis abîmé à la réception ? Note-le auprès du livreur si possible, prends une photo et écris-nous sous 48 heures : nous trouvons une solution.</p>
<h2>Retourner un article (droit de rétractation)</h2>
<p>Pour les bijoux, objets et livres papier, tu as <strong>14 jours après la réception</strong> pour changer d’avis, sans avoir à te justifier.</p>
<ol>
<li>Écris à <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a> en indiquant ton numéro de commande (tu peux utiliser le modèle ci-dessous).</li>
<li>Renvoie l’article dans les 14 jours suivants, complet, dans son état d’origine et bien protégé. Les frais de retour sont à ta charge ; pour un bijou, un envoi suivi et assuré est conseillé.</li>
<li>Tu es remboursée sous 14 jours après réception du retour, frais d’envoi initiaux compris (sur la base de la livraison standard), avec le même moyen de paiement.</li>
</ol>
<h2>Ce qui ne peut pas être retourné</h2>
<ul>
<li><strong>Le livre numérique</strong>, une fois le téléchargement demandé (article L221-28 du Code de la consommation).</li>
<li><strong>Les places de soirée</strong>, prestation de loisirs à une date fixée (article L221-28). Si la Maison annule une soirée, elle est remboursée intégralement.</li>
<li>Les pièces réalisées sur mesure ou personnalisées à ta demande.</li>
</ul>
<h2>Un article défectueux ?</h2>
<p>Tu bénéficies de la garantie légale de conformité (2 ans) et de la garantie des vices cachés. Écris-nous avec une photo : réparation, remplacement ou remboursement, à nos frais.</p>
<h2>Précommandes</h2>
<p>Tant que tu n’as pas payé, tu peux annuler une précommande à tout moment par simple email, sans frais.</p>
<h2>Modèle de formulaire de rétractation</h2>
<div class="modele">
<p>À l’attention de Lamia Bréchet Ighil, Lamia Femme Berbère, ${todo('adresse postale')}, lamia.brechet@outlook.fr :</p>
<p>Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :<br>
Commandé le / reçu le : …<br>
Numéro de commande : …<br>
Nom : …<br>
Adresse : …<br>
Date : …<br>
Signature (si envoi papier) : …</p>
</div>`,
  },
  {
    path: '/conditions-utilisation/',
    title: 'Conditions d’utilisation et charte des soirées',
    body: `
<p>En créant ton espace ou en t’inscrivant à une soirée, tu acceptes ces règles. Elles existent pour que chacune et chacun se sente en sécurité dans la Maison.</p>
<h2>1. Qui peut participer</h2>
<ul>
<li>Les soirées sont réservées aux personnes <strong>majeures (18 ans et plus)</strong>.</li>
<li>On vient pour une rencontre sérieuse, dans le respect des valeurs de la Maison.</li>
<li>Tu donnes des informations exactes (prénom, âge, ville). Une fausse identité entraîne l’exclusion.</li>
</ul>
<h2>2. Pendant la soirée</h2>
<ul>
<li>Caméra allumée, dans un endroit calme, avec une tenue correcte.</li>
<li>Respect, courtoisie et bienveillance : aucun propos insultant, raciste, sexiste, à caractère sexuel ou menaçant.</li>
<li><strong>Il est interdit d’enregistrer, de filmer ou de faire des captures d’écran</strong> des autres participants, et de diffuser leur image ou leurs propos.</li>
<li>Pas de démarchage, de publicité ni de demande d’argent.</li>
<li>Ne communique pas tes coordonnées (téléphone, réseaux sociaux) pendant les tête-à-tête : les mises en relation se font après la soirée, uniquement si le souhait est réciproque.</li>
</ul>
<h2>3. Après la soirée</h2>
<p>Tes choix dans le carnet de bal sont privés. Si deux personnes souhaitent se revoir, Lamia les met en relation. Une personne qui n’a pas souhaité te revoir n’est jamais informée de ton choix, et inversement.</p>
<h2>4. Signaler un problème</h2>
<p>Pendant ou après une soirée, le bouton « Signaler à Lamia » et <a href="/confidences/">le Cabinet des Confidences</a> permettent d’alerter Lamia en toute discrétion. Lamia peut exclure, pendant la soirée ou pour les suivantes, toute personne qui ne respecte pas ces règles, sans remboursement.</p>
<h2>5. Prudence</h2>
<p>La Maison organise des rencontres, mais ne vérifie pas l’identité des participants et ne peut pas garantir leurs intentions. Pour une première rencontre en vrai, choisis un lieu public, préviens un proche, et ne donne jamais d’argent à une personne rencontrée en ligne.</p>
<h2>6. Ton espace</h2>
<p>Ton mot de passe est personnel. Tu peux le modifier depuis <a href="/mon-espace/">Mon espace</a>, et demander la suppression de ton compte à tout moment par email.</p>
<h2>7. Contact</h2>
<p><a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a>. Voir aussi les <a href="/cgv/">conditions de vente</a> et la <a href="/confidentialite/">politique de confidentialité</a>.</p>`,
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
