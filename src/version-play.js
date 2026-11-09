/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
// Version Google Play de l'appli : abonnements et places ne s'y achètent pas (règle de Google sur les paiements).
// Elle s'ouvre sur /?source=play ; le navigateur s'en souvient ensuite. Le site et l'appli installée depuis le site ne changent pas.
(function () {
  var cle = 'lfb-version-play', play = false;
  try {
    if (/[?&]source=play\b/.test(location.search) || document.referrer.indexOf('android-app://') === 0) localStorage.setItem(cle, '1');
    play = localStorage.getItem(cle) === '1';
  } catch (e) { /* stockage indisponible : version normale */ }
  if (!play) return;
  window.LFB_PLAY = true;
  document.documentElement.classList.add('version-play');
  if (/^\/(en\/)?abonnement(-merci)?\/?/.test(location.pathname)) { location.replace('/mon-espace/'); return; }
  // Tout lien vers les formules disparaît, avec sa phrase ou sa carte.
  var masquer = function (racine) {
    if (!racine.querySelectorAll) return;
    racine.querySelectorAll('.abo-grille').forEach(function (g) {
      [g, g.previousElementSibling, g.previousElementSibling && g.previousElementSibling.previousElementSibling].forEach(function (x) {
        if (x && (x === g || x.matches('.annonces-titre, .annonces-sous'))) x.style.display = 'none';
      });
    });
    racine.querySelectorAll('a[href*="/abonnement"]').forEach(function (a) {
      var bloc = a.closest('li, p, .po-actions') || a;
      bloc.hidden = true; bloc.style.display = 'none';
    });
  };
  var lancer = function () {
    masquer(document);
    new MutationObserver(function (l) { l.forEach(function (m) { m.addedNodes.forEach(masquer); }); }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lancer); else lancer();
})();
