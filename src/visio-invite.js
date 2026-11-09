// Le conjoint rejoint « Sauver mon couple » : lien transmis par la personne qui a réservé, sans compte.
import { api, esc } from './confidences-commun.js';

const zone = document.querySelector('[data-visio-invite]');
const q = new URLSearchParams(location.search);
const c = q.get('c'), t = q.get('t');
const quand = (d) => new Date(d).toLocaleString({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const ERREURS = {
  lien_invalide: 'Ce lien ne fonctionne plus : la visio a peut-être été annulée. Demande un nouveau lien à la personne qui l’a réservée.',
  terminee: 'Cette visio est terminée.',
  video_indisponible: 'La visio ne s’ouvre pas pour le moment. Réessaie dans un instant.',
  video_not_configured: 'La visio ne s’ouvre pas pour le moment. Réessaie dans un instant.',
};
const erreur = (e, r) => (e.code === 'trop_tot' ? 'La visio s’ouvre 10 minutes avant l’heure. Reviens un peu plus tard.' : ERREURS[e.code] || 'Ça n’a pas fonctionné. Réessaie dans un instant.');

try {
  const d = await api({ action: 'annonce_coaching_invite', c, t });
  zone.innerHTML = `<p>Rendez-vous le <strong>${esc(quand(d.debut))}</strong>, pour ${esc(d.duree)} minutes.</p>
    <label class="annonce-champ">Ton prénom <input type="text" maxlength="60" data-visio-nom></label>
    <p><button class="btn btn-ink" type="button" data-visio-entrer>Entrer dans la visio</button></p>
    <p><small>La visio s’ouvre 10 minutes avant l’heure. Elle n’est pas enregistrée.</small></p>
    <p class="form-status" role="status" data-visio-statut></p>`;
  zone.querySelector('[data-visio-entrer]').addEventListener('click', async (ev) => {
    const st = zone.querySelector('[data-visio-statut]');
    ev.target.disabled = true; st.textContent = 'Ouverture de la visio…';
    try { const r = await api({ action: 'annonce_coaching_invite', c, t, entrer: true, nom: zone.querySelector('[data-visio-nom]').value }); location.href = `/salle-coaching/#${encodeURIComponent(r.url)}`; }
    catch (e) { st.textContent = erreur(e); ev.target.disabled = false; }
  });
} catch (e) { zone.innerHTML = `<p>${esc(erreur(e))}</p>`; }
