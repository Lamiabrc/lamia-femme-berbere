// Déclaration de bonne foi : chaque membre la lit dans sa langue et s'engage, une fois, avant d'envoyer un cœur.
import { api } from './confidences-commun.js';

export const SINCERITE_HTML = `<h2>Ma déclaration de bonne foi</h2>
<p>Avant d’envoyer un cœur, chacun s’engage ici, dans sa langue.</p>
<ul class="sincerite-liste">
<li>Je viens pour une rencontre sérieuse, en vue du mariage.</li>
<li>Ce que j’ai écrit sur moi est vrai : mon âge, ma situation, le pays où je vis.</li>
<li>Je ne cherche ni papiers, ni argent, ni aucun avantage.</li>
<li>Je respecte chaque personne et sa réponse, même quand c’est non.</li>
</ul>
<p><small>Si je ne respecte pas cet engagement, Lamia peut retirer mon profil.</small></p>
<p class="po-actions"><button type="button" class="po-btn" data-sincerite-ok>Je m’engage</button></p>
<p role="status" data-sincerite-statut></p>`;

const langue = () => ({ en: 'en', ar: 'ar', kab: 'kab' }[document.documentElement.lang] || 'fr');

// Branche le bouton « Je m’engage » trouvé dans `racine`. `jeton` donne le jeton de session ; `apres` est appelé une fois l'engagement enregistré.
export function brancherSincerite(racine, jeton, apres) {
  const b = racine.querySelector('[data-sincerite-ok]'), st = racine.querySelector('[data-sincerite-statut]');
  if (!b) return;
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api({ action: 'annonce_sincerite', accepte: true, langue: langue() }, await jeton()); apres?.(); }
    catch { b.disabled = false; if (st) st.textContent = 'Ça n’a pas fonctionné. Réessaie dans un instant.'; }
  });
}
