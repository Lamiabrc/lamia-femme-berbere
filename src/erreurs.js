// Quand l'appli montre une erreur à quelqu'un, elle prévient Lamia toute seule (14 nov. 2026).
// Envoyé : la page, l'appel au site qui a échoué, le message d'erreur, l'appareil. Jamais ce que la personne a écrit.
// Au plus 5 envois par page ouverte, jamais deux fois la même erreur, et rien si l'envoi lui-même échoue.
(function () {
  'use strict';
  if (window.__lfbErreurs) return;
  window.__lfbErreurs = true;
  var API = '/api/confidences/';
  var MAX = 5;
  var envoyees = 0;
  var vues = {};
  var vraiFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!vraiFetch) return;

  function jeton() {
    try {
      var brut = localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token');
      var v = brut ? JSON.parse(brut) : null;
      return (v && (v.access_token || (v.currentSession && v.currentSession.access_token))) || '';
    } catch (e) { return ''; }
  }
  function version() {
    var s = document.querySelector('script[src*="/assets/maison.js"]');
    var m = s && /[?&]v=([^&]+)/.exec(s.getAttribute('src') || '');
    return m ? m[1] : '';
  }
  function signaler(type, message, appel, statut) {
    message = String(message || '').slice(0, 300);
    if (!message || envoyees >= MAX) return;
    var cle = type + '|' + (appel || '') + '|' + message;
    if (vues[cle]) return;
    vues[cle] = true;
    envoyees += 1;
    var entetes = { 'Content-Type': 'application/json' };
    var t = jeton();
    if (t) entetes.Authorization = 'Bearer ' + t;
    try {
      vraiFetch(API, {
        method: 'POST', headers: entetes, keepalive: true,
        body: JSON.stringify({ action: 'live_erreur', type: type, message: message, appel: appel || '', statut: statut || 0, page: location.pathname + location.hash.slice(0, 40), appareil: navigator.userAgent, version: version() }),
      }).catch(function () {});
    } catch (e) { /* jamais d'erreur à cause du signalement */ }
  }

  // Un appel au site qui échoue. Les refus normaux (pas connecté, pas le droit, déjà fait, trop de demandes) ne sont pas des erreurs.
  var NORMAUX = { 401: 1, 403: 1, 404: 1, 409: 1, 429: 1 };
  window.fetch = function (ressource, options) {
    var url = typeof ressource === 'string' ? ressource : (ressource && ressource.url) || '';
    var chemin = '';
    try { var u = new URL(url, location.href); chemin = u.origin === location.origin ? u.pathname : ''; } catch (e) { chemin = ''; }
    var suivi = chemin.indexOf('/api/') === 0;
    var action = '';
    if (suivi && options && typeof options.body === 'string') { try { action = String(JSON.parse(options.body).action || '').slice(0, 60); } catch (e) { action = ''; } }
    if (action === 'live_erreur') return vraiFetch(ressource, options);
    return vraiFetch(ressource, options).then(function (rep) {
      if (suivi && rep.status >= 400 && !NORMAUX[rep.status]) {
        rep.clone().json().then(function (d) { signaler('appel', (d && d.error) || ('erreur ' + rep.status), chemin + (action ? ' · ' + action : ''), rep.status); })
          .catch(function () { signaler('appel', 'erreur ' + rep.status, chemin + (action ? ' · ' + action : ''), rep.status); });
      }
      return rep;
    }, function (err) {
      // Pas de réponse du tout : coupure de réseau. Rien à envoyer si on est hors ligne ; sinon on le note.
      if (suivi && navigator.onLine !== false && !(err && err.name === 'AbortError')) signaler('reseau', 'pas de réponse du site', chemin + (action ? ' · ' + action : ''), 0);
      throw err;
    });
  };

  // Une erreur dans la page elle-même (un bouton qui ne fait rien, un écran qui reste vide).
  window.addEventListener('error', function (e) {
    if (!e || !e.message || /^Script error\.?$/.test(e.message)) return;
    var ou = e.filename ? String(e.filename).replace(location.origin, '').replace(/\?.*$/, '') + (e.lineno ? ':' + e.lineno : '') : '';
    signaler('page', e.message, ou, 0);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var m = r && (r.message || (typeof r === 'string' ? r : ''));
    if (m && !/AbortError|Failed to fetch|NetworkError|Load failed/i.test(m)) signaler('page', m, '', 0);
  });
})();
