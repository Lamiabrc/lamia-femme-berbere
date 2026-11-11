// Lien « nouveau mot de passe » envoyé par Supabase : il arrive sur l'accueil, où il n'y a pas de formulaire.
// On l'amène dans Mon espace, qui affiche « Choisis ton mot de passe » (ou « ce lien a expiré »).
// Chargé en premier sur toutes les pages, avant que la connexion ne consomme le lien.
(function () {
  var h = location.hash || '';
  if (!/[#&]type=recovery\b/.test(h) && !/[#&]error_code=otp_expired\b/.test(h)) return;
  if (/^\/((en|ar|kab)\/)?mon-espace\/?$/.test(location.pathname)) return;
  var langue = (location.pathname.match(/^\/(en|ar|kab)\//) || [])[1];
  location.replace((langue ? '/' + langue : '') + '/mon-espace/' + h);
})();
