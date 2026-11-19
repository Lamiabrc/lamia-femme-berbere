// Le cadre partagé de TAYRI. Les URL et les fonctions métier restent celles de la Maison.
export const NAVIGATION_TAYRI = [
  { id: 'accueil', href: '/', label: 'Accueil', icon: 'house' },
  { id: 'rencontres', href: '/rencontres/', label: 'Rencontres', icon: 'profils' },
  { id: 'couple', href: '/espace-couple/', label: 'Notre couple', icon: 'heart' },
  { id: 'boutique', href: '/boutique/', label: 'Boutique', icon: 'gem' },
  { id: 'compte', href: '/mon-espace/', label: 'Mon espace', icon: 'compte' },
];

export function rubriqueTayri(path) {
  const p = String(path || '/').replace(/^\/(en|ar|kab)(?=\/)/, '') || '/';
  if (p === '/') return 'accueil';
  if (/^\/(notre-couple|espace-couple)(\/|$)/.test(p)) return 'couple';
  if (/^\/(boutique|ecrin|bibliotheque|grenier|produit|werdi-ouvre-les-yeux)(\/|$)/.test(p)) return 'boutique';
  if (/^\/(rencontres|speed-dating|salon|abonnement)(\/|$)/.test(p)) return 'rencontres';
  return /^\/mon-espace(\/|$)/.test(p) ? 'compte' : null;
}

// L'univers dépend de l'adresse, pas de la pièce historique réutilisée par certains outils.
export function universTayri(path, room) {
  const p = String(path || '/').replace(/^\/(en|ar|kab)(?=\/)/, '') || '/';
  if (p === '/') return 'accueil';
  if (/^\/(notre-couple|espace-couple)(\/|$)/.test(p)) return 'couple';
  if (/^\/speed-dating(\/|$)/.test(p)) return 'boudoir';
  if (/^\/confidences(?:\/|$)/.test(p)) return 'confidences';
  if (/^\/mon-espace(?:\/|$)/.test(p)) return 'compte';
  if (/^\/(bibliotheque|werdi-ouvre-les-yeux)(\/|$)/.test(p)) return 'bibliotheque';
  if (/^\/(ecrin|galerie)(\/|$)/.test(p)) return 'ecrin';
  if (/^\/grenier(\/|$)/.test(p)) return 'grenier';
  if (/^\/produit(\/|$)/.test(p)) return ({ bibliotheque: 'bibliotheque', ecrin: 'ecrin', grenier: 'grenier' })[room?.slug] || 'boutique';
  if (/^\/boutique(\/|$)/.test(p)) return 'boutique';
  if (/^\/(rencontres|abonnement|salon)(\/|$)/.test(p)) return 'rencontres';
  return 'maison';
}

export function entreeTayri(path, room) {
  const univers = universTayri(path, room);
  if (univers === 'accueil') return '';
  const p = String(path).replace(/^\/(en|ar|kab)(?=\/)/, '') || '/';
  const labels = { couple: 'Notre couple', boudoir: 'Le Boudoir des Rencontres', confidences: 'Les Confidences avec Lamia', compte: 'Mon espace', bibliotheque: 'La Bibliothèque de Yemma', ecrin: 'L’Écrin', grenier: 'Le Grenier', boutique: 'La boutique de Lamia', rencontres: 'Les Rencontres', maison: 'La Maison' };
  const boutique = ['boutique', 'bibliotheque', 'ecrin', 'grenier'].includes(univers);
  const liens = boutique ? [['/boutique/', 'Toute la boutique'], ['/ecrin/', 'L’Écrin'], ['/bibliotheque/', 'La Bibliothèque'], ['/grenier/', 'Le Grenier']]
    : ['rencontres', 'boudoir'].includes(univers) ? [['/rencontres/', 'Les Rencontres'], ['/rencontres/swipe/', 'Découvrir les profils'], ['/speed-dating/', 'Le Boudoir'], ['/abonnement/', 'Les formules'], ['/salon/', 'Les lives']] : [];
  return `<div class="tayri-reperes"><nav class="tayri-fil" aria-label="Fil d’Ariane"><a href="/">La Maison</a><span aria-hidden="true">/</span><span>${labels[univers]}</span></nav>${liens.length ? `<nav class="tayri-rubriques" aria-label="${boutique ? 'Les rayons de la boutique' : 'Les parcours de rencontre'}">${liens.map(([href, label]) => `<a href="${href}"${href === p ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>` : ''}</div>`;
}

export function navigationTayri(path, { mobile = false } = {}) {
  const active = rubriqueTayri(path);
  return NAVIGATION_TAYRI.map(({ id, href, label, icon }) => {
    const current = id === active ? ' aria-current="page"' : '';
    const account = id === 'compte' ? mobile ? ' data-barre-compte data-barre-messages' : ' class="account-link" data-account-link' : '';
    const text = id === 'compte' ? mobile ? `<b>${label}</b><i data-barre-point hidden></i>` : `<span data-account-texte>${label}</span>` : `<span>${label}</span>`;
    return `<a href="${href}"${account}${current}><svg class="ico" aria-hidden="true"><use href="/icones.svg#${icon}"/></svg>${text}</a>`;
  }).join('\n');
}

export function accueilTayri() {
  return `<section class="tayri-accueil" aria-labelledby="tayri-titre">
  <picture class="tayri-paysage" aria-hidden="true">
    <source media="(max-width: 680px)" srcset="/images/tayri/accueil-paysage-640.webp">
    <img src="/images/tayri/accueil-paysage-1200.webp" srcset="/images/tayri/accueil-paysage-1200.webp 1200w, /images/tayri/accueil-paysage-1672.webp 1672w" sizes="100vw" width="1672" height="941" alt="" fetchpriority="high" decoding="async">
  </picture>
  <div class="tayri-accueil-contenu">
    <div class="tayri-bienvenue">
      <img class="tayri-embleme" src="/images/marque/tayri-coeur.webp" alt="" width="278" height="264" decoding="async">
      <h1 id="tayri-titre">TAYRI</h1>
      <p>Des rencontres sincères.<br>De beaux moments à deux.</p>
    </div>
    <div class="tayri-parcours">
      <article class="tayri-parcours-carte tayri-parcours-rencontres">
        <div class="tayri-parcours-visuel tayri-parcours-portraits" aria-hidden="true">
          <img src="/images/outil/avatar-femme.webp" width="200" height="200" alt="" decoding="async">
          <img src="/images/outil/avatar-homme.webp" width="640" height="640" alt="" decoding="async">
        </div>
        <h2>Faire une rencontre</h2>
        <p>Découvrir les profils et avancer vers une relation sérieuse, avec Lamia.</p>
        <a class="tayri-action" href="/rencontres/">Découvrir les Rencontres <span aria-hidden="true">›</span></a>
      </article>
      <article class="tayri-parcours-carte tayri-parcours-couple">
        <div class="tayri-parcours-visuel" aria-hidden="true"><img src="/images/couple/meteo.webp" width="286" height="286" alt="" decoding="async"></div>
        <h2>Prendre soin de notre couple</h2>
        <p>Partager des attentions, jouer et créer de beaux moments à deux.</p>
        <a class="tayri-action" href="/espace-couple/">Retrouver Notre couple <span aria-hidden="true">›</span></a>
      </article>
    </div>
    <div class="tayri-accueil-liens"><a href="/mon-espace/">J’ai déjà un compte</a><a href="/application/">Découvrir TAYRI</a></div>
    <section class="tayri-accueil-boutique" aria-labelledby="tayri-boutique-titre">
      <div><h2 id="tayri-boutique-titre">La boutique de Lamia</h2><p>Bijoux kabyles, livres et trouvailles.</p></div>
      <a class="tayri-action tayri-action-secondaire" href="/boutique/">Toute la boutique</a>
      <nav aria-label="Les rayons de la boutique"><a href="/ecrin/">L’Écrin · bijoux kabyles</a><a href="/bibliotheque/">La Bibliothèque</a><a href="/grenier/">Le Grenier</a></nav>
    </section>
  </div>
</section>`;
}

// Les pages autonomes gardent leurs scripts, leurs contrôles et leur ambiance de salle.
export function habillerPageStatique(html, { version = '' } = {}) {
  if (!/<html\b/i.test(html) || !/<body\b/i.test(html)) return html;
  const admin = /<title>[^<]*(Tableau de bord|Pilotage|Sécurité &|Maîtresse du bal|Soirées|Administration)/i.test(html);
  let result = html.replace(/<body([^>]*)>/i, (_, attrs) => {
    const classes = `tayri-shell tayri-autonome${admin ? ' tayri-administration' : ''}`;
    return /\bclass="/.test(attrs) ? `<body data-tayri-univers="outil"${attrs.replace(/class="([^"]*)"/, (_m, old) => `class="${old} ${classes}"`)}>` : `<body data-tayri-univers="outil" class="${classes}"${attrs}>`;
  });
  const style = `<link rel="stylesheet" href="/assets/tayri.css${version ? `?v=${version}` : ''}">`;
  if (!result.includes('/assets/tayri.css')) result = result.replace(/<\/head>/i, `${style}\n</head>`);
  const brand = `<nav class="tayri-raccourcis-outil" aria-label="Navigation TAYRI"><a class="tayri-marque-outil" href="/"><img src="/images/marque/tayri-coeur.webp" width="32" height="32" alt="">TAYRI</a><a href="/boutique/">Boutique</a><a href="/mon-espace/">Mon espace</a></nav>`;
  return result.replace(/(<body[^>]*>)/i, `$1\n${brand}`);
}
