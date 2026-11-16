// « Continuer avec Google / Facebook / LinkedIn » sur la page de connexion.
// Les boutons n'apparaissent que pour les réseaux activés dans Supabase (Authentication > Sign In / Providers) :
// la liste est lue à l'ouverture de la page, donc activer un réseau suffit, sans toucher au code.
// Instagram et TikTok ne sont pas proposés : Supabase ne les gère pas, et ils ne donnent pas l'email dont le site a besoin.

export const RESEAUX = [
  { id: 'google', cle: 'google', nom: 'Google' },
  { id: 'facebook', cle: 'facebook', nom: 'Facebook' },
  { id: 'linkedin_oidc', cle: 'linkedin_oidc', nom: 'LinkedIn' },
];

// Réponse de /auth/v1/settings → réseaux activés, dans l'ordre d'affichage.
export function reseauxActifs(reglages) {
  const ext = reglages && typeof reglages === 'object' ? reglages.external || {} : {};
  return RESEAUX.filter((r) => ext[r.cle] === true);
}

// Le prénom d'un compte créé par un réseau : prénom donné, sinon premier mot du nom.
export function prenomDuReseau(meta = {}) {
  const p = String(meta.given_name || meta.first_name || '').trim() || String(meta.full_name || meta.name || '').trim().split(/\s+/)[0] || '';
  return p.replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
}

const ICONES = {
  google: '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>',
  linkedin_oidc: '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="#0A66C2" d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.5H3.5V9h3.6v11.5z"/></svg>',
};

// Affiche les boutons dans `zone` (un élément vide, caché par défaut). Ne fait rien si aucun réseau n'est activé.
export async function boutonsSociaux(supabase, { url, cle, zone, retour = location.pathname + location.search, onErreur = () => {} }) {
  if (!zone) return [];
  let actifs = [];
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: cle } });
    if (r.ok) actifs = reseauxActifs(await r.json());
  } catch { /* hors ligne : on garde le formulaire par email */ }
  if (!actifs.length) return [];
  zone.innerHTML = `<p class="connexion-sociale-titre">Ou continue avec</p><div class="connexion-sociale-liste">${actifs.map((x) => `<button class="btn btn-line connexion-sociale-bouton" type="button" data-reseau="${x.id}">${ICONES[x.id]}<span>${x.nom}</span></button>`).join('')}</div>`;
  zone.hidden = false;
  zone.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reseau]');
    if (!b) return;
    b.disabled = true;
    try { localStorage.setItem('lfb-retour-social', retour); } catch { /* */ }
    const { error } = await supabase.auth.signInWithOAuth({ provider: b.dataset.reseau, options: { redirectTo: `${location.origin}${retour}` } });
    if (error) { b.disabled = false; onErreur(error); }
  });
  return actifs;
}

// Au retour d'un réseau, le compte n'a pas encore de prénom dans le site : on le prend chez le réseau.
export async function completerPrenom(supabase, user) {
  if (!user || user.user_metadata?.first_name) return;
  const p = prenomDuReseau(user.user_metadata);
  if (p) await supabase.auth.updateUser({ data: { first_name: p } }).catch(() => {});
}
