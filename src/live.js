// Rubrique Live : quand Lamia est en direct, son live YouTube s'affiche ici avec la boîte à questions.
// Seule Lamia voit les questions ; à l'antenne, elle les lit sans le nom. Il faut un compte pour en poser une.
import { api, esc, PUBLIC_KEY } from './confidences-commun.js';
import { createClient } from '/vendor/supabase.mjs';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const zone = document.querySelector('[data-live-direct]');
const ERREURS = {
  login_required: 'Ta connexion a expiré : reconnecte-toi pour poser ta question.',
  live_ferme: 'Le live vient de se terminer. Reviens au prochain, du lundi au vendredi à 20 h.',
  question_vide: 'Écris ta question en quelques mots au moins.',
  trop_de_questions: 'Tu as déjà posé 3 questions ce soir : Lamia les a reçues.',
};
const STATUT = { nouvelle: 'Reçue par Lamia', choisie: 'Lamia la lit en direct !', repondue: 'Lamia y a répondu', ecartee: 'Pas lue ce soir' };
let token = null, etat = null, envoi = false;

const questionsHtml = (liste = []) => (liste.length
  ? `<div class="live-mes"><p class="live-mes-titre">Mes questions ce soir</p>${liste.map((q) => `<p class="live-mq is-${esc(q.statut)}"><span>${esc(q.texte)}</span><b>${esc(STATUT[q.statut] || '')}</b></p>`).join('')}</div>`
  : '');

function boite() {
  const z = zone.querySelector('[data-live-question]');
  if (!etat.connecte) {
    z.innerHTML = `<h3>Pose ta question à Lamia</h3><p>Elle te répond en direct, sans dire ton nom. Il te faut juste un compte : c’est gratuit et ça prend une minute.</p>
      <p class="po-actions"><a class="po-btn" href="/rencontres/#confier">Créer mon compte</a><a class="po-btn-verre" href="/mon-espace/">Me connecter</a></p>`;
    return;
  }
  const mes = etat.mes_questions || [];
  const reste = Math.max(0, (etat.max || 3) - mes.length);
  z.innerHTML = `<h3>Pose ta question à Lamia</h3>
    ${reste ? `<form class="live-form" data-live-form>
      <label for="live-texte">Ta question (couple, mariage, famille, célibat…)</label>
      <textarea id="live-texte" name="texte" rows="3" maxlength="500" required placeholder="Ex. : il veut qu’on vive chez sa mère après le mariage, je fais comment ?"></textarea>
      <button class="po-btn" type="submit">Envoyer à Lamia</button>
      <p class="live-note">Seule Lamia voit ta question. À l’antenne, elle la lit sans ton nom.${reste < 3 ? ` Encore ${reste} question${reste > 1 ? 's' : ''} possible${reste > 1 ? 's' : ''} ce soir.` : ''}</p>
      <p class="live-statut" data-live-statut role="status"></p>
    </form>` : '<p>Tu as posé tes 3 questions de ce soir : Lamia les a reçues.</p>'}
    ${questionsHtml(mes)}`;
}

function afficher() {
  if (!etat?.actif) { zone.hidden = true; return; }
  zone.hidden = false;
  zone.querySelector('[data-live-titre]').textContent = etat.titre ? ` : ${etat.titre}` : '';
  const video = zone.querySelector('[data-live-video]');
  // La vidéo n'est chargée qu'une fois (sinon elle repartirait du début à chaque mise à jour).
  if (!video.firstChild) video.innerHTML = `<iframe src="${esc(etat.youtube)}" title="Le live de Lamia sur YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
  zone.querySelector('[data-live-tiktok]').href = etat.tiktok;
  if (!zone.querySelector('[data-live-form] textarea:focus')) boite();
}

async function charger() {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  token = session?.access_token || null;
  etat = await api({ action: 'live_etat' }, token).catch(() => etat);
  afficher();
  if (etat?.actif && location.hash === '#en-direct') zone.scrollIntoView({ block: 'start' });
}

zone?.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-live-form]');
  if (!f || envoi) return;
  e.preventDefault();
  const st = f.querySelector('[data-live-statut]');
  envoi = true; st.textContent = 'Envoi…';
  try {
    await api({ action: 'live_question', texte: f.texte.value }, token);
    st.textContent = 'Envoyée ! Lamia l’a reçue.';
    etat = await api({ action: 'live_etat' }, token).catch(() => etat);
    f.texte.value = '';
    afficher();
  } catch (err) { st.textContent = ERREURS[err.code] || 'L’envoi n’a pas marché. Réessaie dans un instant.'; }
  envoi = false;
});

if (zone) {
  charger();
  // Toutes les minutes, tant que la page est ouverte : le live est-il toujours en cours, Lamia lit-elle ma question ?
  setInterval(() => { if (document.visibilityState === 'visible') charger(); }, 60000);
}
