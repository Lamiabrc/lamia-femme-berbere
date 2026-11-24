// Le menu de gauche du tableau de bord, repris sur les autres pages d'administration (ordinateur seulement).
// Les liens ouvrent la rubrique correspondante du tableau de bord.
(() => {
  if (window.self !== window.top || document.body.classList.contains('cl-integre')) return;
  const ICONES = { accueil: 'house', activite: 'map', comptes: 'user', conf: 'message-circle', profils: 'mail', 'match-direct': 'heart', 'creer-profil': 'user', rencontres: 'heart', application: 'smartphone', coaching: 'video' };
  const T = '/tableau-de-bord#';
  const haut = [
    [T + 'accueil', 'Aujourd’hui', 'accueil'], [T + 'activite', 'Activité', 'activite'], [T + 'comptes', 'Membres', 'comptes'],
    ['/confidences-lamia/', 'Confidences', 'conf'], ['/confidences-lamia/#annonces', 'Profils et matchs', 'profils'],
  ];
  const plus = [
    [T + 'match-direct', 'Match en direct', 'match-direct'], [T + 'creer-profil', 'Créer un profil', 'creer-profil'], [T + 'rencontres', 'Matchs à suivre', 'rencontres'],
    [T + 'application', 'Application', 'application'], [T + 'coaching', 'Coaching', 'coaching'], [T + 'ventes', 'Ventes'], [T + 'produits', 'Produits'], [T + 'soirees', 'Soirées'],
    [T + 'bilan', 'Bilan du bal'], [T + 'alertes', 'Alertes'], [T + 'textes', 'Textes & images'], [T + 'visites', 'Visites'],
  ];
  const ici = location.pathname.replace(/\/$/, '');
  const lien = ([h, t, i]) => `<a href="${h}"${h.split('#')[0].replace(/\/$/, '') === ici && !h.includes('#') ? ' aria-current="page"' : ''}>${i ? `<svg class="ma-ico" aria-hidden="true"><use href="/icones.svg#${ICONES[i]}"/></svg>` : ''}${t}</a>`;
  const css = `
@media (min-width:1100px){
 body.ma-avec{padding-left:232px!important}
 .ma-menu{position:fixed;inset:0 auto 0 0;width:232px;box-sizing:border-box;z-index:60;display:flex;flex-direction:column;gap:12px;padding:18px 12px;background:#FDFBF8;border-right:1px solid #e8dfd0;overflow-y:auto;font:600 14px/1.3 system-ui,sans-serif}
 .ma-marque{display:flex;align-items:center;gap:8px;padding:0 6px;color:#2b2118;text-decoration:none;font:600 17px Georgia,serif}
 .ma-marque em{display:block;font-size:12px;color:#7f68b8;font-weight:400}
 .ma-menu nav{display:flex;flex-direction:column;gap:2px}
 .ma-menu nav a{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;color:#6f5f50;text-decoration:none}
 .ma-menu nav a:hover{color:#2b2118;background:#f3ecde}
 .ma-menu nav a[aria-current=page]{background:#e9dffa;color:#2F2B3D}
 .ma-ico{width:16px;height:16px;fill:none;stroke:#a07a4a;stroke-width:1.6}
 .ma-plus{margin:6px 0 2px;padding:0 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a09080}
}
@media (max-width:1099px){.ma-menu{display:none}}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const m = document.createElement('aside'); m.className = 'ma-menu'; m.setAttribute('aria-label', 'Menu du tableau de bord');
  m.innerHTML = `<a class="ma-marque" href="/tableau-de-bord"><img src="/images/marque/lamia-logo-net-160.webp" width="40" height="40" alt=""><span>La Maison<em>· tableau de bord</em></span></a>
    <nav>${haut.map(lien).join('')}<p class="ma-plus">Plus</p>${plus.map(lien).join('')}</nav>`;
  document.body.classList.add('ma-avec'); document.body.prepend(m);
})();
