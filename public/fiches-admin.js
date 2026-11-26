import { O, lib } from '/assets/matching-options.mjs';
import { champsCreation, lireCreation } from '/completer-profil.js';
import {pseudoDepuisTikTok,urlDepuisTikTok} from '/assets/liens-tiktok.mjs';
import { etapesFiche } from '/fiches-etapes.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (x) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const ETATS = { en_attente: 'En attente de confirmation', confirmee: 'Confirmée', retiree: 'Retirée' };
const ERREURS = { forbidden: 'Connecte-toi avec ton compte administratrice.', genre_requis: 'Choisis femme ou homme.', age_invalide: 'Indique un âge entre 18 et 99 ans.', ages_recherches: 'Vérifie les âges recherchés : de 18 à 99 ans, du plus petit au plus grand.', annonce_incomplete: 'Complète le pays et les deux textes de l’annonce.', requete_deja_utilisee: 'Cette tentative a déjà créé une fiche avec un autre texte. Actualise la liste pour la retrouver.', not_found: 'Aucune fiche avec ce numéro.', not_configured: 'L’environnement de test n’est pas encore configuré.' };

export function monterFichesAdmin({ appel }) {
  const panel = document.querySelector('[data-panel="creer-profil"]');
  if (!panel) return { ouvrir() {} };
  const listePanel=document.querySelector('[data-panel="fiches"]');
  const $ = (s) => panel.querySelector(s)||listePanel?.querySelector(s), form = $('[data-fiche-admin]'), st = $('[data-fiche-statut]');
  let requete = null, suite = null, charge = false, chargement = false, rechercheTikTok='';
  const direErreur = (e) => ERREURS[e.code] || 'La réponse n’est pas arrivée. Ton texte est conservé : réessaie pour retrouver la même fiche.';
  panel.querySelectorAll('[data-fiche-choix]').forEach((s) => {
    const liste = s.dataset.ficheChoix === 'etudes' ? [...O.etudeCategorie, ...Object.values(O.etudeDetail).flat()] : O[s.dataset.ficheChoix];
    s.innerHTML = '<option value="">Choisir</option>' + liste.map((x) => `<option value="${esc(x)}">${esc(lib(x))}</option>`).join('');
  });
  panel.querySelectorAll('[data-fiche-cases]').forEach((c) => { c.className = 'cp-cases'; c.innerHTML = O[c.dataset.ficheCases].map((x) => `<label><input type="checkbox" name="${c.dataset.ficheCases}" value="${esc(x)}"> ${esc(lib(x))}</label>`).join(''); });
  { const z = panel.querySelector('[data-fiche-plus]'), c = panel.querySelector('[data-fiche-plus-cherche]'); if (z) z.innerHTML = champsCreation('lui'); if (c) c.innerHTML = champsCreation('cherche'); }
  etapesFiche(form);
  const corps = () => { const f = new FormData(form), p = Object.fromEntries(f); for (const k of Object.keys(p)) if (k.startsWith('m_')) delete p[k]; p.matching = lireCreation(form); p.origine = f.get('origine') ? [f.get('origine')] : []; p.caracteristiques = f.getAll('caracteristiques'); delete p.publier; return { profil: p, publier: f.get('publier') === 'on' }; };
  const apercu = () => {
    const p = corps().profil;
    $('[data-fiche-apercu-titre]').textContent = ({femme:'Une femme',homme:'Un homme'}[p.genre] || 'Son profil') + (p.age ? ` · ${p.age} ans` : '');
    $('[data-fiche-apercu-infos]').textContent = [p.pays && lib(p.pays), p.situation && lib(p.situation)].filter(Boolean).join(' · ');
    $('[data-fiche-apercu-profil]').textContent = p.profil || 'Son portrait apparaîtra ici.';
    $('[data-fiche-apercu-recherche]').textContent = p.recherche || 'Sa recherche apparaîtra ici.';
  };
  form.addEventListener('input', apercu); form.addEventListener('change', apercu);
  const annonceEtat=f=>f.confirmation==='retiree'?'Cette fiche est retirée. Aucun lien à envoyer.':f.en_pause?'Cette fiche est en pause.':f.visible?'Son annonce est visible anonymement.':f.confirmation==='confirmee'?'Son annonce est actuellement masquée.':'Son annonce sera visible après sa confirmation.';
  const lienVue = (f) => `<h2>Fiche n° ${esc(f.ref)} · ${esc(ETATS[f.confirmation] || '')}</h2><p><button class="btn" type="button" data-md-depuis="${esc(f.ref)}">Matcher maintenant</button> <button class="btn btn-line" type="button" data-voir-ref="${esc(f.ref)}">Voir sa fiche</button></p><p>${annonceEtat(f)}</p>${f.lien ? `<label>Son lien personnel<input type="text" readonly data-fiche-lien value="${esc(f.lien)}"></label><div class="actions"><button class="btn btn-ink" type="button" data-fiche-copier>Copier le lien</button> <button class="btn btn-line" type="button" data-fiche-message>Copier le message à envoyer</button></div><p class="aide">Envoie ce lien uniquement à la personne concernée. Elle peut vérifier sa fiche, la corriger et créer elle-même son compte.</p><p role="status" data-fiche-copie></p>` : ''}`;
  const montrer = (f,dansListe=false) => {
    const r = (dansListe?listePanel:panel).querySelector('[data-fiche-resultat]'); r.innerHTML = lienVue(f)+(f.confirmation==='retiree'?'':`<p>${f.tiktok?`<a href="${esc(f.tiktok.lien)}" target="_blank" rel="noopener noreferrer">TikTok · @${esc(f.tiktok.pseudo)}</a>`:'Aucun lien TikTok affiché.'}</p><form data-fiche-tiktok><label>Lien TikTok ou @pseudo<input name="tiktok" maxlength="240" required value="${esc(f.tiktok?.lien||'')}" placeholder="https://www.tiktok.com/@pseudo"></label><button class="btn btn-line" type="submit">Enregistrer le lien TikTok</button><p role="status" data-tiktok-statut></p><p class="aide">Privé : visible uniquement dans ton administration.</p></form>`); r.hidden = false;
    r.dataset.ref = f.ref; r.scrollIntoView({behavior:'smooth',block:'start'});
  };
  for(const resultat of [panel,listePanel].filter(Boolean).map(p=>p.querySelector('[data-fiche-resultat]')))resultat.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fiche-copier],[data-fiche-message]'); if (!b) return;
    const input = resultat.querySelector('[data-fiche-lien]'), statut = resultat.querySelector('[data-fiche-copie]');
    const texte = b.hasAttribute('data-fiche-message') ? `Bonjour ! J’ai préparé ta fiche TAYRI. Vérifie tes informations, corrige-les si besoin puis confirme ta fiche et crée ton accès : ${input.value}\nÀ bientôt, Lamia` : input.value;
    try { await navigator.clipboard.writeText(texte); statut.textContent = b.hasAttribute('data-fiche-message') ? 'Message copié. Tu peux l’envoyer à la personne.' : 'Lien copié.'; }
    catch { input.focus(); input.select(); statut.textContent = 'Sélectionne et copie le lien ci-dessus.'; }
  });
  for(const resultat of [panel,listePanel].filter(Boolean).map(p=>p.querySelector('[data-fiche-resultat]')))resultat.addEventListener('submit',async e=>{
    const f=e.target.closest('[data-fiche-tiktok]');if(!f)return;e.preventDefault();const st=f.querySelector('[data-tiktok-statut]'),btn=f.querySelector('button');
    const lien=urlDepuisTikTok(f.elements.tiktok.value);if(!lien){st.textContent='Colle le lien du profil TikTok ou son @pseudo, sans lien raccourci.';return;}
    btn.disabled=true;let enregistre=false;
    try{await appel({action:'annonce_admin_completer',ref:Number(resultat.dataset.ref),lien_reseau:lien});enregistre=true;const d=await appel({action:'annonce_lien_fiche_admin',ref:Number(resultat.dataset.ref)});const dansListe=resultat.closest('[data-panel]').dataset.panel==='fiches';montrer(d.fiche,dansListe);$('[data-fiches-statut]').textContent='Lien TikTok enregistré.';charge=false;if(dansListe)charger();}
    catch{st.textContent=enregistre?'Lien enregistré. Actualise la fiche pour l’afficher.':'Le lien n’a pas été enregistré. Réessaie.';}
    finally{btn.disabled=false;}
  });
  const ligne = (f) => `<li><div><strong>n° ${esc(f.ref)} · ${f.genre === 'femme' ? 'Femme' : 'Homme'}${f.age?' · '+esc(f.age)+' ans':''}</strong><span>${esc([f.ville, f.pays && lib(f.pays)].filter(Boolean).join(' · '))}</span><small>${f.source_creation==='live'?'Fiche du live':'Fiche du site'} · ${esc(ETATS[f.confirmation])}${f.en_pause?' · en pause':''}${f.visible ? ' · annonce visible' : ' · annonce masquée'}${f.compte ? ' · compte créé' : ' · sans compte'}</small>${f.tiktok?`<a href="${esc(f.tiktok.lien)}" target="_blank" rel="noopener noreferrer">TikTok · @${esc(f.tiktok.pseudo)}</a>`:''}</div><button type="button" class="btn btn-line" data-fiche-retrouver="${esc(f.ref)}" aria-label="${f.lien?'Retrouver le lien':'Voir l’état'} de la fiche n° ${esc(f.ref)}">${f.lien ? 'Voir le lien' : 'Voir l’état'}</button></li>`;
  async function charger(plus = false) {
    if (chargement) return; chargement = true; $('[data-fiches-actualiser]').disabled = true; $('[data-fiches-suite]').disabled = true;
    $('[data-fiches-source]').disabled=true;$('[data-fiches-sans-compte-filtre]').disabled=true;
    $('[data-fiche-lien-chercher]').querySelectorAll('input,button').forEach(el=>el.disabled=true);
    try {
      const r = await appel({action:'annonce_fiches_admin',source_creation:$('[data-fiches-source]').value,sans_compte:$('[data-fiches-sans-compte-filtre]').checked,...(rechercheTikTok?{tiktok:rechercheTikTok}:{}), ...(plus && suite ? {avant:suite} : {})});
      if (!plus) $('[data-fiches-admin]').innerHTML = '';
      $('[data-fiches-admin]').insertAdjacentHTML('beforeend',r.fiches.map(ligne).join(''));
      suite = r.suivant; $('[data-fiches-suite]').hidden = !suite; charge = true;
      $('[data-fiches-statut]').textContent = r.contacts_disponibles===false?'Les fiches sont affichées, mais certains liens TikTok n’ont pas pu être chargés. Réessaie avec Actualiser.':!r.fiches.length && !plus ? 'Aucune fiche pour cette recherche et ces filtres.' : '';
    } catch(e) { $('[data-fiches-statut]').textContent = ERREURS[e.code] || 'La liste ne s’affiche pas. Réessaie avec Actualiser.'; }
    finally { chargement = false; $('[data-fiches-actualiser]').disabled = false; $('[data-fiches-suite]').disabled = false; $('[data-fiches-source]').disabled=false;$('[data-fiches-sans-compte-filtre]').disabled=false;$('[data-fiche-lien-chercher]').querySelectorAll('input,button').forEach(el=>el.disabled=false); }
  }
  form.addEventListener('submit', async(e) => {
    e.preventDefault(); const btn = form.querySelector('[type="submit"]'); if (btn.disabled || !form.reportValidity()) return;
    const body = corps(), signature = JSON.stringify(body);
    if (!requete || requete.signature !== signature) requete = {signature,id:crypto.randomUUID()};
    btn.disabled = true; st.textContent = 'Enregistrement de la fiche…';
    try {
      const r = await appel({action:'annonce_fiche_admin_creer',requete_id:requete.id,...body});
      montrer(r.fiche); form.reset(); requete = null; apercu(); st.textContent = 'Fiche enregistrée. Son lien est prêt à copier.'; charger();
    } catch(err) { st.textContent = direErreur(err); }
    finally { btn.disabled = false; }
  });
  async function retrouver(ref) {
    const statut = $('[data-fiches-statut]'); statut.textContent = 'Recherche de la fiche…';
    try { const r = await appel({action:'annonce_lien_fiche_admin',ref:Number(ref)}); montrer(r.fiche,true); statut.textContent = r.contacts_disponibles===false?'Le lien TikTok du contact privé n’a pas pu être chargé. Réessaie avec Actualiser.':''; }
    catch(e) { statut.textContent = ERREURS[e.code] || 'Le lien n’a pas pu être chargé. Réessaie.'; }
  }
  $('[data-fiche-lien-chercher]').addEventListener('submit',(e)=>{e.preventDefault();const recherche=e.target.elements.recherche.value.trim();listePanel.querySelector('[data-fiche-resultat]').hidden=true;if(/^\d+$/.test(recherche)){rechercheTikTok='';$('[data-fiches-admin]').innerHTML='';$('[data-fiches-suite]').hidden=true;return retrouver(recherche);}if(!pseudoDepuisTikTok(recherche)){$('[data-fiches-statut]').textContent='Indique un numéro de fiche, un lien de profil TikTok ou un @pseudo.';return;}rechercheTikTok=recherche;charger();});
  $('[data-fiches-reinitialiser]').addEventListener('click',()=>{rechercheTikTok='';$('[data-fiche-lien-chercher]').elements.recherche.value='';listePanel.querySelector('[data-fiche-resultat]').hidden=true;charger();});
  $('[data-fiches-admin]').addEventListener('click',(e)=>{const b=e.target.closest('[data-fiche-retrouver]');if(b)retrouver(b.dataset.ficheRetrouver);});
  $('[data-fiches-actualiser]').addEventListener('click',()=>charger()); $('[data-fiches-suite]').addEventListener('click',()=>charger(true));
  for(const selecteur of ['[data-fiches-source]','[data-fiches-sans-compte-filtre]'])$(selecteur).addEventListener('change',()=>charger());
  return {ouvrir:()=>{if(!charge)charger();}};
}
