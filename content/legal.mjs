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
<li>des places pour des soirées de rencontre en ligne (« soirées ») ;</li>
<li>des abonnements et des achats à l’unité « Trouve ton âme sœur » (mises en relation, speed datings).</li>
</ul>
<h2>2. Prix</h2>
<p>Les prix sont indiqués en euros. {{TVA}} Les frais de livraison sont indiqués avant la validation de la commande. Le prix des livres respecte la loi sur le prix unique du livre.</p>
<h2>3. Commande et paiement</h2>
<p>Le paiement se fait par carte bancaire via Stripe, prestataire de paiement sécurisé. La Maison n'a jamais accès aux données de carte. La commande est ferme après confirmation du paiement.</p>
<h2>4. Achat et disponibilité</h2>
<p>L'achat se fait directement sur le site : la commande est ferme dès que le paiement est accepté, et la cliente reçoit un reçu par email. Les pièces uniques (notamment celles du Grenier) ne sont plus disponibles une fois achetées ; pendant qu'une cliente paie, la pièce lui est réservée 30 minutes au plus. Les bijoux des collections et les livres sont vendus dans la limite des quantités indiquées. Le livre broché en précommande est expédié dès réception des exemplaires imprimés.</p>
<h2>4 bis. Livraison des bijoux, objets et livres papier</h2>
<p>{{LIVRAISON}} Remise en main propre gratuite à Rennes, sur rendez-vous. Délais : les bijoux sont réalisés par un artisan et le délai dépend de lui, entre 2 et 6 semaines après l'achat ; les pièces du Grenier, déjà disponibles, sont expédiées après l'achat et livrées dans le délai habituel de Colissimo (2 à 3 jours ouvrés en général) ; les livres papier sont expédiés sous 3 jours ouvrés après paiement. Pour une livraison hors de France métropolitaine, écrire à lamia.brechet@outlook.fr. Détails sur la page <a href="/retours/">Livraison, retours et remboursements</a>.</p>
<h2>5. Livre numérique</h2>
<p>Le fichier est mis à disposition dans l'espace membre dès la confirmation du paiement. En demandant ce téléchargement immédiat, la cliente donne son accord exprès et renonce à son droit de rétractation, conformément à l'article L221-28 du Code de la consommation.</p>
<h2>6. Soirées</h2>
<p>Une soirée est une prestation de loisirs fournie à une date déterminée : elle n'ouvre pas de droit de rétractation (article L221-28 du Code de la consommation). Le lien de la salle vidéo est envoyé par email avant la soirée. Les soirées sont réservées aux personnes majeures. La participation suppose le respect de la <a href="/conditions-utilisation/#charte">charte des soirées</a> et des règles de la Maison : respect, sérieux de la démarche, aucun propos ou contenu déplacé. La Maison peut exclure une personne qui ne les respecte pas, sans remboursement.</p>
<p>Une place payée n'est pas remboursable, y compris en cas d'absence. Si la Maison annule une soirée, la place est remboursée intégralement. Les soirées gratuites ne donnent lieu à aucun paiement.</p>
<h2 id="abonnement">6 bis. Abonnements « Trouve ton âme sœur »</h2>
<p><strong>Les formules.</strong> Découverte (gratuite) ; Cœur (14,90 € par mois) ; Passion (29,90 € par mois) ; Prestige (59 € par mois). À l’année, le prix correspond à 10 mois (2 mois offerts). Le contenu de chaque formule est décrit sur la page <a href="/abonnement/">Abonnement</a>. Achats à l’unité : une mise en relation 9,90 € ; une place de speed dating 9 €.</p>
<p><strong>Le service.</strong> Lamia vérifie les profils, les passe dans son outil de matching et propose des mises en relation entre personnes compatibles qui sont d’accord toutes les deux. Une mise en relation consiste à transmettre à chacune des deux personnes le moyen de contacter l’autre. Lamia ne peut garantir ni une rencontre, ni un mariage : elle s’engage sur le sérieux de la vérification, du matching et du suivi. Les quantités incluses (mises en relation, speed datings) valent pour chaque mois d’abonnement et ne se reportent pas d’un mois sur l’autre. Les achats à l’unité n’expirent pas.</p>
<p><strong>Durée et résiliation.</strong> L’abonnement est sans engagement. Il se renouvelle automatiquement à chaque échéance (mois ou année) jusqu’à résiliation. La résiliation se fait à tout moment, en un clic, depuis l’espace membre (« Gérer mon abonnement ») ou en écrivant à lamia.brechet@outlook.fr ; elle prend effet à la fin de la période déjà payée, sans autre frais. Un abonnement annuel peut être résilié à tout moment pour l’échéance suivante.</p>
<p><strong>Paiement.</strong> Par carte bancaire via Stripe, prélevée à la souscription puis à chaque échéance. En cas d’échec de paiement, les mises en relation sont suspendues jusqu’à régularisation.</p>
<p><strong>Droit de rétractation.</strong> La cliente dispose de 14 jours à compter de la souscription pour se rétracter, en écrivant à lamia.brechet@outlook.fr. En cochant la case prévue, elle demande que le service commence immédiatement : si elle se rétracte, elle paie la part du service déjà fournie jusqu’à sa rétractation (article L221-25 du Code de la consommation). Une mise en relation déjà réalisée est un service pleinement exécuté et n’ouvre plus droit à rétractation (article L221-28).</p>
<p><strong>Comportement.</strong> Les règles de la Maison et la <a href="/conditions-utilisation/#charte">charte des rencontres</a> s’appliquent. En cas de manquement grave (fausse identité, propos déplacés, demande d’argent), Lamia peut mettre fin à l’abonnement sans remboursement de la période en cours.</p>
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
<li><strong>Espace membre</strong> : prénom, adresse email et mot de passe (chiffré, la Maison ne le voit jamais), pour te connecter, suivre tes soirées et tes achats, et modifier ton profil confié à Lamia. Chaque profil confié est lié à un compte.</li>
<li><strong>Soirées de rencontre</strong> : prénom, email, genre, date de naissance, ville, zone de recherche et salon choisi, pour te placer dans le bon salon et la bonne tranche d’âge ; l’état de ton inscription ; après la soirée, les personnes que tu souhaites revoir et ton avis, pour les mises en relation réciproques et l’amélioration des soirées. Base légale : ton inscription (exécution du service).</li>
<li><strong>Vidéo des soirées</strong> : l’image et le son passent en direct par Daily, notre prestataire vidéo. <strong>Les soirées ne sont jamais enregistrées</strong>, ni par la Maison ni par Daily.</li>
<li><strong>Confidences</strong> : ton prénom ou pseudonyme, ton email, ton téléphone si tu le donnes, tes messages, vocaux, images et documents, pour que Lamia puisse te lire et te répondre. Ils sont gardés dans un espace privé, accessible seulement à toi (après connexion par lien email) et à Lamia, jusqu’à ce que tu demandes leur suppression (bouton « supprimer cette conversation » ou email), et au plus 3 ans après le dernier message. Lamia reçoit une notification sans contenu et, si elle l’a activé, un email d’alerte.</li>
<li><strong>Alertes</strong> : le contenu de ton alerte et l’éventuel message audio, pour assurer ta sécurité. La personne signalée ne connaît jamais ton identité.</li>
<li><strong>Commandes et précommandes</strong> : nom, adresse de livraison, téléphone éventuel et email, pour livrer, facturer et te tenir informée. Les données de carte bancaire sont traitées uniquement par Stripe ; la Maison n’y a jamais accès.</li>
<li><strong>Abonnements et achats à l’unité</strong> : nom, email, formule choisie, statut et dates de l’abonnement, achats à l’unité et leur utilisation, pour fournir le service et le facturer (base : le contrat). La carte bancaire et la résiliation sont gérées par Stripe ; la Maison n’a jamais accès aux données de carte.</li>
</ul>
<p>Le salon que tu choisis (par exemple Algérie–France) peut laisser deviner une origine. Cette information sert uniquement à organiser les soirées : elle n’est jamais publiée, vendue ni utilisée pour de la publicité.</p>
<h2>Profils confiés à Lamia (trouver son âme sœur)</h2>
<p>Quand tu confies ton profil, nous recevons ton prénom, ton genre, ta date de naissance, ta ville et ton pays, tes réponses sur ta situation, tes études, tes valeurs et la personne que tu cherches, tes textes, tes photos ou ta vidéo, ton email (celui de ton compte, obligatoire pour confier un profil ou dire qu’un profil t’intéresse), ton lien de réseau social ou, si tu n’en as aucun, ton numéro de téléphone (jamais affiché ni transmis, il reste chez Lamia), ainsi qu’une photo de ta pièce d’identité dont le numéro est caché par ta main, si tu choisis de la donner (elle est facultative et donne au profil le badge « vérifié avec pièce d’identité »). Ces données servent uniquement à vérifier ton profil, à le passer dans l’outil de matching de Lamia et à te proposer des mises en relation (base : ton consentement).</p>
<p><strong>Ton profil n’est jamais publié avec ton identité.</strong> Seule Lamia le voit en entier. Si tu l’acceptes (case facultative), Lamia peut l’afficher <strong>anonymement</strong> dans les Rencontres du site : âge, pays, situation, textes et caractéristiques, sans prénom, photo, ville ni contact. Quand quelqu’un clique sur « Ce profil m’intéresse », seule Lamia le sait. L’outil de matching fonctionne sur son ordinateur ; tu reçois seulement le nombre de profils qui pourraient te correspondre, sans connaître leur identité, et aucune autre personne ne sait avec qui tu pourrais correspondre. <strong>La photo de la pièce d’identité est supprimée dès que Lamia valide ou refuse ton profil.</strong></p>
<p>Tu peux retirer ton profil à tout moment grâce au lien reçu par email, ou en écrivant à Lamia : tes textes, photos et vidéo sont alors effacés du site, et Lamia le retire de son outil.</p>
<p><strong>Profil créé en live.</strong> Si tu indiques avoir créé ton profil en live avec Lamia, ton pseudo TikTok sert à retrouver ta fiche. Pour cela, le site ne garde qu’une <strong>empreinte chiffrée</strong> des pseudos TikTok des fiches de Lamia, jamais les pseudos eux-mêmes, et rien n’est affiché.</p>
<p><strong>Photo transmise au match (facultatif).</strong> Si tu l’acceptes (case du formulaire ou de ton espace), Lamia peut transmettre ta photo à la seule personne avec qui elle te met en relation, après un match qui vous convient à tous les deux. Base : ton consentement, retirable à tout moment depuis ton espace ; sans ce consentement, ta photo n’est transmise à personne. Elle s’affiche alors dans l’espace personnel de ton match, pendant le match uniquement, si sa formule inclut la photo du match (Passion, Prestige).</p>
<p><strong>Match en cours.</strong> Quand Lamia vous met en relation, ton profil n’apparaît plus dans les profils anonymes et ne peut plus matcher jusqu’à ce que le match prenne fin (depuis ton espace ou par Lamia).</p>
<p><strong>Profils venus de l’outil de Lamia.</strong> Certains profils anonymes viennent des personnes que Lamia accompagne en live ou en message privé, avec leur accord. Pour eux, seuls sont affichés l’âge, la ville, le village d’origine, le pays, le secteur recherché, la situation, les caractéristiques et quelques mots-clés : jamais le prénom, la photo, le pseudo, le téléphone ni les notes de Lamia. Une personne peut demander à tout moment le retrait de sa fiche à Lamia ; elle disparaît du site à la publication suivante.</p>
<h2>Qui y a accès</h2>
<p>Seule Lamia, et les prestataires techniques ci-dessous dans la limite de leur mission. Les autres participantes et participants ne voient que ton prénom pendant la soirée. Ton email n’est communiqué à une autre personne qu’en cas de souhait réciproque, et seulement avec ton accord.</p>
<h2>Prestataires et lieux de stockage</h2>
<ul>
<li>Supabase : base de données, hébergée à Paris (Union européenne).</li>
<li>Vercel : hébergement du site (États-Unis, avec garanties contractuelles de la Commission européenne).</li>
<li>Daily : vidéo en direct des soirées (États-Unis, avec garanties contractuelles), sans enregistrement.</li>
<li>Stripe : paiement sécurisé et gestion des abonnements.</li>
<li>Resend : envoi des emails du site (confirmations, résultats, alertes).</li>
<li>Google Analytics (Google Ireland) : mesure d’audience, <strong>uniquement si tu l’acceptes</strong>.</li>
</ul>
<p>Les polices de caractères et les bibliothèques techniques sont hébergées sur le site lui-même : ta visite n’envoie aucune donnée à Google Fonts ni à un autre service tiers tant que tu n’as rien accepté.</p>
<h2>Durée de conservation</h2>
<ul>
<li>Compte membre : jusqu’à sa suppression, ou 3 ans après ta dernière connexion.</li>
<li>Inscriptions et souhaits des soirées : 1 an après la soirée.</li>
<li>Alertes : 3 ans, puis suppression.</li>
<li>Profils confiés à Lamia : jusqu’à ce que tu les retires, et au plus 2 ans sans nouvelle de ta part. La photo de pièce d’identité est supprimée dès la validation ou le refus du profil.</li>
<li>Abonnements : pendant l’abonnement, puis 3 ans après sa fin.</li>
<li>Commandes et factures : 10 ans (obligation comptable).</li>
<li>Mesure d’audience : 13 mois.</li>
</ul>
<h2>Cookies et stockage dans ton navigateur</h2>
<p>Le site n’utilise <strong>aucun cookie publicitaire</strong>. Ton navigateur garde ce qui est nécessaire au fonctionnement, sans demande d’accord : ta connexion à ton espace, ton panier, ton passage au bal (le temps de la soirée), tes réglages de musique et de flou, et ton choix concernant les cookies.</p>
<p><strong>Google Analytics</strong> : si tu cliques sur « Accepter » dans le bandeau, des cookies de mesure d’audience Google (_ga) sont déposés pour 13 mois au maximum, avec une adresse IP anonymisée, afin de savoir quelles pages sont consultées. Si tu refuses, rien n’est déposé. Tu peux changer d’avis à tout moment avec le lien « Gérer les cookies » en bas de chaque page.</p>
<p>Mesure d’audience interne, sans cookie : pour savoir quelles pages sont lues et d’où viennent les visites, le site compte les pages vues sans cookie. Il enregistre la page, la provenance (réseau social, lien direct…), le type d’appareil, l’heure, ainsi que le pays, la région et la ville approximatifs déduits du réseau internet. L’adresse IP n’est jamais enregistrée, et l’empreinte technique utilisée pour compter les visiteurs change chaque jour : elle ne permet pas de suivre une personne dans le temps.</p>
<h2>Tes droits</h2>
<p>Tu peux accéder à tes données, les corriger, les supprimer, en obtenir une copie, ou t’opposer à leur traitement en écrivant à <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a>. Réponse sous un mois. Tu peux aussi saisir la CNIL (<a href="https://www.cnil.fr" rel="noopener" target="_blank">cnil.fr</a>).</p>
<p class="fine">Version du 29 octobre 2026.</p>`,
  },
  {
    path: '/retours/',
    title: 'Livraison, retours et remboursements',
    body: `
<h2>Livraison</h2>
<p>{{LIVRAISON}} Remise en main propre gratuite à Rennes, sur rendez-vous. Un numéro de suivi t’est envoyé par email à l’expédition.</p>
<ul>
<li><strong>Bijoux (L’Écrin)</strong> : chaque bijou est réalisé par un artisan. Le délai dépend de lui : <strong>entre 2 et 6 semaines</strong> après ton achat.</li>
<li><strong>Trouvailles du Grenier</strong> : les pièces sont déjà là. Elles partent après ton achat, le temps d’une livraison Colissimo (2 à 3 jours ouvrés en général).</li>
<li><strong>Livres papier</strong> : expédiés sous 3 jours ouvrés après le paiement.</li>
</ul>
<p> Pour une livraison hors de France métropolitaine, écris à <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a> pour connaître le tarif.</p>
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
<h2>Paiement</h2>
<p>Le paiement se fait sur la page sécurisée de Stripe (carte bancaire, Apple Pay, Google Pay, avec 3D Secure). Tes coordonnées bancaires ne passent jamais par la Maison.</p>
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
    title: 'Conditions générales d’utilisation',
    body: `
<p>Ces conditions s’appliquent à tout le site lamia-femme-berbere.com (« la Maison »), édité par Lamia Bréchet Ighil. En naviguant sur le site, en créant ton espace, en passant commande ou en t’inscrivant à une soirée, tu les acceptes.</p>

<h2>1. Ce que propose la Maison</h2>
<ul>
<li>des pages de présentation et de transmission autour de la culture berbère et kabyle ;</li>
<li>une boutique : bijoux, objets, livres et brocante (les ventes sont régies par les <a href="/cgv/">conditions générales de vente</a>) ;</li>
<li>des soirées de rencontre en visio (le Boudoir des Rencontres), régies par la charte ci-dessous ;</li>
<li>un espace membre (« Mon espace ») ;</li>
<li>les Confidences avec Lamia, pour alerter Lamia en toute discrétion ;</li>
<li>des liens vers les lives et réseaux de Lamia (TikTok, Facebook…).</li>
</ul>

<h2>2. Accès au site</h2>
<p>Le site est accessible gratuitement. La Maison fait de son mieux pour qu’il fonctionne en permanence, mais il peut être interrompu pour maintenance ou en cas de panne, sans que sa responsabilité soit engagée. Les rubriques marquées « bientôt » ne sont pas encore ouvertes.</p>

<h2>3. Ton espace membre</h2>
<ul>
<li>Tu donnes des informations exactes et tu les tiens à jour.</li>
<li>Ton mot de passe est personnel : ne le partage pas. Tu peux le modifier depuis <a href="/mon-espace/">Mon espace</a>.</li>
<li>Tu peux demander la suppression de ton compte à tout moment par email.</li>
<li>La Maison peut suspendre ou supprimer un compte en cas de non-respect de ces conditions, de fausse identité ou de comportement dangereux pour les autres.</li>
</ul>

<h2>4. Bon usage du site</h2>
<p>Il est interdit d’utiliser le site pour :</p>
<ul>
<li>tenir des propos insultants, haineux, racistes, sexistes, menaçants ou à caractère sexuel ;</li>
<li>usurper l’identité d’une autre personne ;</li>
<li>harceler, démarcher, faire de la publicité ou demander de l’argent ;</li>
<li>envoyer de fausses alertes aux Confidences avec Lamia ;</li>
<li>tenter de perturber le fonctionnement du site ou d’accéder aux données d’autres personnes.</li>
</ul>

<h2>5. Les Confidences avec Lamia</h2>
<p>Les alertes sont lues par Lamia seule. L’identité de la personne qui alerte n’est jamais communiquée à la personne signalée. Le Cabinet n’est pas un service d’urgence : <strong>en cas de danger immédiat, appelle le 17 (police) ou le 112</strong>.</p>

<h2>6. Propriété intellectuelle</h2>
<p>Les textes, photographies, illustrations, vidéos, logos et la marque Lamia Femme Berbère appartiennent à leur autrice. Toute reproduction, même partielle, sans autorisation écrite est interdite. Tu peux partager les liens des pages librement.</p>

<h2>7. Liens vers d’autres sites</h2>
<p>Le site contient des liens vers TikTok, Facebook et d’autres services. La Maison n’est pas responsable de leur contenu ni de leurs pratiques ; leurs propres conditions s’appliquent.</p>

<h2>8. Responsabilité</h2>
<p>Les contenus du site sont donnés à titre d’information et de transmission culturelle. La Maison organise des rencontres mais ne vérifie pas l’identité des participants et ne peut pas garantir leurs intentions ni le résultat d’une rencontre.</p>

<h2>9. Données personnelles</h2>
<p>Voir la <a href="/confidentialite/">politique de confidentialité et cookies</a>.</p>

<h2 id="charte">10. Charte des soirées de rencontre</h2>
<h3>Qui peut participer</h3>
<ul>
<li>Les soirées sont réservées aux personnes <strong>majeures (18 ans et plus)</strong>.</li>
<li>On vient pour une rencontre sérieuse, dans le respect des valeurs de la Maison.</li>
<li>Tu donnes des informations exactes (prénom, âge, ville). Une fausse identité entraîne l’exclusion.</li>
</ul>
<h3>Pendant la soirée</h3>
<ul>
<li>Caméra allumée, dans un endroit calme, avec une tenue correcte.</li>
<li>Respect, courtoisie et bienveillance envers chacune et chacun.</li>
<li><strong>Il est interdit d’enregistrer, de filmer ou de faire des captures d’écran</strong> des autres participants, et de diffuser leur image ou leurs propos.</li>
<li>Ne communique pas tes coordonnées (téléphone, réseaux sociaux) pendant les tête-à-tête : les mises en relation se font après la soirée, uniquement si le souhait est réciproque.</li>
</ul>
<h3>Après la soirée</h3>
<p>Tes choix dans le carnet de bal sont privés. Si deux personnes souhaitent se revoir, Lamia les met en relation. Une personne qui n’a pas souhaité te revoir n’est jamais informée de ton choix, et inversement.</p>
<h3>Signaler et exclure</h3>
<p>Le bouton « Signaler à Lamia » et <a href="/confidences/">les Confidences avec Lamia</a> permettent d’alerter Lamia. Lamia peut exclure, pendant la soirée ou pour les suivantes, toute personne qui ne respecte pas cette charte, sans remboursement.</p>
<h3>Prudence</h3>
<p>Pour une première rencontre en vrai, choisis un lieu public, préviens un proche, et ne donne jamais d’argent à une personne rencontrée en ligne.</p>

<h2>11. Modification et droit applicable</h2>
<p>Ces conditions peuvent évoluer ; la version en ligne est celle qui s’applique. Elles sont soumises au droit français. Contact : <a href="mailto:lamia.brechet@outlook.fr">lamia.brechet@outlook.fr</a>.</p>
<p class="fine">Version du 29 octobre 2026.</p>`,
  },
];

// Textes qui dépendent des réglages de la boutique (tableau de bord → Livraison et TVA).
const eur = (c) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);
export function livraisonTexte(t) {
  return `Envoi suivi Colissimo en France métropolitaine, sans signature, selon le poids du colis : jusqu’à 250 g ${eur(t.g250)}, 500 g ${eur(t.g500)}, 750 g ${eur(t.g750)}, 1 kg ${eur(t.g1000)}, 2 kg ${eur(t.g2000)}, 5 kg ${eur(t.g5000)}. Les cartes postales et objets plats partent en Lettre verte : ${eur(t.lettre20)} jusqu’à 20 g, ${eur(t.lettre100)} jusqu’à 100 g. Le montant exact est affiché avant le paiement.`;
}
export function tvaTexte(tva) {
  if (tva?.active) return `Ils s’entendent toutes taxes comprises (TVA ${String(tva.taux).replace('.', ',')} % incluse).${tva.mention ? ` ${tva.mention}` : ''}`;
  return tva?.mention ? `${tva.mention}` : '';
}
