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
        <svg class="ico" aria-hidden="true"><use href="/icones.svg#heart"/></svg>
        <h2>Faire une rencontre</h2>
        <p>Découvrir les profils et avancer vers une relation sérieuse, avec Lamia.</p>
        <a class="tayri-action" href="/rencontres/">Découvrir les Rencontres <span aria-hidden="true">›</span></a>
      </article>
      <article class="tayri-parcours-carte tayri-parcours-couple">
        <svg class="ico" aria-hidden="true"><use href="/icones.svg#handshake"/></svg>
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
    return /\bclass="/.test(attrs) ? `<body${attrs.replace(/class="([^"]*)"/, (_m, old) => `class="${old} ${classes}"`)}>` : `<body class="${classes}"${attrs}>`;
  });
  const style = `<link rel="stylesheet" href="/assets/tayri.css${version ? `?v=${version}` : ''}">`;
  if (!result.includes('/assets/tayri.css')) result = result.replace(/<\/head>/i, `${style}\n</head>`);
  const brand = `<nav class="tayri-raccourcis-outil" aria-label="Navigation TAYRI"><a class="tayri-marque-outil" href="/"><img src="/images/marque/tayri-coeur.webp" width="32" height="32" alt="">TAYRI</a><a href="/boutique/">Boutique</a><a href="/mon-espace/">Mon espace</a></nav>`;
  return result.replace(/(<body[^>]*>)/i, `$1\n${brand}`);
}
