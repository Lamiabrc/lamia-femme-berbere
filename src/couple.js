// « Notre couple » : espace partagé à deux, à part des rencontres (Lamia, 16 nov. 2026).
// Planning d'activités de couple, faire plaisir (bijou, chocolat, fleurs), et tout ce que Lamia propose aux couples.
import { api, esc, PUBLIC_KEY } from './confidences-commun.js';
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const zone = document.querySelector('[data-couple]');
let token = null, types = {}, cadeaux = {};
const aideQ = (texte) => `<details class="aide-q"><summary aria-label="Comprendre"><span aria-hidden="true">?</span></summary><p>${texte}</p></details>`;
const jour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + (/T00:00/.test(iso) ? '' : ` · ${new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
const appel = async (body) => { const { data: { session } } = await supabase.auth.getSession(); token = session?.access_token || token; return api(body, token); };
const ERREURS = { code_invalide: 'Ce code ne marche pas (ou il a expiré). Demande-lui un nouveau code.', complet: 'Cet espace a déjà ses deux membres.', deja_en_couple: 'Tu as déjà un espace de couple.', titre_requis: 'Écris ce que vous allez faire.' };

const AUTOUR = `<section class="couple-carte"><h2>Autour de vous</h2>
  <p class="espace-sans-liens"><a class="btn btn-ink" href="/abonnement/#unite-sauver_couple">Coaching de couple</a> <a class="btn btn-line" href="/salon/">Les lives</a> <a class="btn btn-line" href="/boutique/">La boutique</a> <a class="btn btn-line" href="/confidences/#conversation">Écrire à Lamia</a></p></section>`;

function accueil() {
  zone.innerHTML = `<section class="couple-carte couple-debut">
    <h2>Créer notre espace</h2>
    <div class="avec-aide"><button type="button" class="btn btn-ink" data-couple-creer>Créer notre espace</button>${aideQ('Un espace à vous deux, à part des rencontres : votre planning d’activités de couple, et tout ce que Lamia propose aux couples. Tu invites ton ou ta partenaire avec un code.')}</div>
    <form class="couple-rejoindre" data-couple-rejoindre><label>Tu as reçu un code ?<input name="code" maxlength="8" autocomplete="off" placeholder="Ex. K7Q2MD" required></label><button type="submit" class="btn btn-line">Rejoindre</button></form>
    <p class="form-status" role="status" data-couple-statut></p></section>${AUTOUR}`;
}

function vue(c) {
  const lui = c.membres.find((m) => !m.moi), moi = c.membres.find((m) => m.moi);
  const avenir = c.activites.filter((a) => !a.fait), faites = c.activites.filter((a) => a.fait);
  const ligne = (a) => `<li class="${a.fait ? 'is-fait' : ''}"><label class="couple-coche"><input type="checkbox" data-act-fait="${esc(a.id)}"${a.fait ? ' checked' : ''} aria-label="Fait"></label>
    <span><strong>${esc(a.titre)}</strong><small>${esc(a.type_nom)}${a.quand ? ` · ${esc(jour(a.quand))}` : ''}${a.pour_nous ? '' : ' · pour moi'}</small></span>
    ${a.de_moi ? `<button type="button" class="link-button" data-act-suppr="${esc(a.id)}" aria-label="Retirer">✕</button>` : ''}</li>`;
  zone.innerHTML = `<section class="couple-carte couple-tete">
      <p class="couple-noms">${esc(moi?.prenom || 'Moi')} <span aria-hidden="true">♡</span> ${lui ? esc(lui.prenom) : '<em>en attente</em>'}</p>
      ${lui ? '' : `<div class="couple-code"><p>Envoie ce code à ton ou ta partenaire :</p><p class="couple-code-valeur">${c.code ? esc(c.code) : '—'}</p><p class="espace-sans-liens">${c.code ? `<button type="button" class="btn btn-ink" data-couple-partager="${esc(c.code)}">Envoyer le code</button>` : ''} <button type="button" class="btn btn-line" data-couple-code>Nouveau code</button></p></div>`}
    </section>
    <section class="couple-carte">
      <h2>Notre planning</h2>
      ${avenir.length ? `<ul class="couple-liste">${avenir.map(ligne).join('')}</ul>` : '<p class="aide">Rien de prévu pour l’instant.</p>'}
      <details class="couple-ajout"><summary class="btn btn-ink">Ajouter une activité</summary>
        <form data-act-ajouter>
          <label>Quoi ?<input name="titre" maxlength="120" required placeholder="Dîner au restaurant, balade au bord de la mer…"></label>
          <label>Type<select name="type">${Object.entries(types).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label>Quand ?<input name="quand" type="datetime-local"></label>
          <fieldset class="couple-pour"><label><input type="radio" name="pour" value="nous" checked> Pour nous deux</label><label><input type="radio" name="pour" value="moi"> Pour moi</label></fieldset>
          <button type="submit" class="btn btn-ink">Ajouter</button>
        </form></details>
      ${faites.length ? `<details class="couple-faites"><summary>Déjà fait (${faites.length})</summary><ul class="couple-liste">${faites.map(ligne).join('')}</ul></details>` : ''}
      <p class="form-status" role="status" data-couple-statut></p>
    </section>
    <section class="couple-carte">
      <h2>Liste de cadeaux</h2>
      <div class="couple-cadeaux">${Object.entries(cadeaux).map(([k, v]) => `<button type="button" class="couple-cadeau" data-cadeau="${k}"><span aria-hidden="true">${{ bijou: '💍', parfum: '🌸', fleurs: '💐', chocolat: '🍫', diner: '🍽️', spa: '💆', weekend: '🧳', coffret: '🎀', photo: '📸', autre: '🎁' }[k] || '🎁'}</span>${esc({ bijou: 'Bijou', parfum: 'Parfum', fleurs: 'Fleurs', chocolat: 'Chocolats', diner: 'Dîner', spa: 'Spa à deux', weekend: 'Week-end', coffret: 'Coffret beauté', photo: 'Séance photo', autre: 'Autre idée' }[k] || v)}</button>`).join('')}</div>
      <form class="couple-cadeau-form" data-cadeau-form hidden><input type="hidden" name="type"><label>Un mot pour Lamia (facultatif)<input name="note" maxlength="300" placeholder="Pour quand, pour quelle occasion…"></label><button type="submit" class="btn btn-ink">Envoyer ma demande</button></form>
    </section>
    ${AUTOUR}
    <p class="couple-quitter"><button type="button" class="link-button" data-couple-quitter>Quitter cet espace</button></p>`;
}

async function charger() {
  try {
    const r = await appel({ action: 'couple_etat' });
    types = r.types || {}; cadeaux = r.cadeaux || {};
    if (r.couple) vue(r.couple); else accueil();
  } catch { zone.innerHTML = '<p class="aide">L’espace ne s’affiche pas pour le moment. Réessaie dans un instant.</p>'; }
}
const statut = (t) => { const s = zone.querySelector('[data-couple-statut]'); if (s) s.textContent = t; };
async function faire(body, apres) {
  try { const r = await appel(body); if (r.couple !== undefined) { if (r.couple) vue(r.couple); else accueil(); } apres?.(r); }
  catch (err) { statut(ERREURS[err.code] || 'Ça n’a pas fonctionné. Réessaie dans un instant.'); }
}

zone.addEventListener('click', async (e) => {
  if (e.target.closest('[data-couple-creer]')) return faire({ action: 'couple_creer' });
  if (e.target.closest('[data-couple-code]')) return faire({ action: 'couple_code' });
  const p = e.target.closest('[data-couple-partager]');
  if (p) {
    const texte = `Rejoins notre espace de couple chez Lamia Femme Berbère avec ce code : ${p.dataset.couplePartager} — ${location.origin}/notre-couple/`;
    if (navigator.share) navigator.share({ text: texte }).catch(() => {}); else { navigator.clipboard?.writeText(texte); statut('Code copié : colle-le dans un message.'); }
    return;
  }
  const s = e.target.closest('[data-act-suppr]');
  if (s) return faire({ action: 'couple_activite_suppr', id: s.dataset.actSuppr });
  const c = e.target.closest('[data-cadeau]');
  if (c) { const f = zone.querySelector('[data-cadeau-form]'); f.hidden = false; f.type.value = c.dataset.cadeau; zone.querySelectorAll('[data-cadeau]').forEach((x) => x.classList.toggle('is-choisi', x === c)); f.note.focus(); return; }
  if (e.target.closest('[data-couple-quitter]') && confirm('Quitter votre espace de couple ? Ton planning y restera pour l’autre personne.')) return faire({ action: 'couple_quitter' });
});
zone.addEventListener('change', (e) => {
  const c = e.target.closest('[data-act-fait]');
  if (c) faire({ action: 'couple_activite_fait', id: c.dataset.actFait, fait: c.checked });
});
zone.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.matches('[data-couple-rejoindre]')) return faire({ action: 'couple_rejoindre', code: f.code.value });
  if (f.matches('[data-act-ajouter]')) return faire({ action: 'couple_activite_ajouter', titre: f.titre.value, type: f.type.value, quand: f.quand.value ? new Date(f.quand.value).toISOString() : null, pour_nous: f.pour.value === 'nous' });
  if (f.matches('[data-cadeau-form]')) return faire({ action: 'couple_cadeau', type: f.type.value, note: f.note.value }, () => { f.hidden = true; zone.querySelectorAll('[data-cadeau]').forEach((x) => x.classList.remove('is-choisi')); f.reset(); f.insertAdjacentHTML('afterend', '<p class="form-status">C’est envoyé : Lamia s’en occupe et revient vers toi.</p>'); });
});

(async () => {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  if (!session) { zone.innerHTML = `<section class="couple-carte"><p>Connecte-toi pour ouvrir votre espace de couple.</p><p><a class="btn btn-ink" href="/mon-espace/?retour=/notre-couple/">Me connecter</a></p></section>${AUTOUR}`; return; }
  token = session.access_token;
  charger();
})();
