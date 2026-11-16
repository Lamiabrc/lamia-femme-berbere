// « Notre couple » : espace partagé à deux, à part des rencontres (Lamia, 16 nov. 2026).
// Planning d'activités de couple, faire plaisir (bijou, chocolat, fleurs), et tout ce que Lamia propose aux couples.
import { api, esc, PUBLIC_KEY } from './confidences-commun.js';
import { createClient } from '/vendor/supabase.mjs';
import { img, preparerImages } from './couple-images.js';

const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const zone = document.querySelector('[data-couple]');
let token = null, types = {}, cadeaux = {}, motsDoux = [], motsPayants = [], moiInfo = {};
// Plus riche, comme l'espace Famille de QVT Box (16 nov. 2026) : des onglets, la météo du cœur, la question du jour, un calendrier, le bocal à souvenirs.
let humeurs = {}, besoins = {}, suggestions = {}, idees = {}, jeuxDef = {}, jalonsDef = {}, prepaDef = {}, dernier = null, moisVu = null, jourChoisi = null, tirage = null;
let onglet = (() => { try { return localStorage.getItem('lfb-couple-onglet') || 'nous'; } catch { return 'nous'; } })();
if (new URLSearchParams(location.search).get('onglet')) onglet = new URLSearchParams(location.search).get('onglet');
const ONGLETS = [['nous', 'Nous'], ['douceurs', 'Douceurs'], ['jeux', 'Jeux'], ['planning', 'Planning'], ['mariage', 'Mariage'], ['aide', 'Soutien']];
const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aideQ = (texte) => `<details class="aide-q"><summary aria-label="Comprendre"><span aria-hidden="true">?</span></summary><p>${texte}</p></details>`;
const jour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + (/T00:00/.test(iso) ? '' : ` · ${new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
const appel = async (body) => { const { data: { session } } = await supabase.auth.getSession(); token = session?.access_token || token; return api(body, token); };
const ERREURS = { couple_requis: 'Ce mot doux vient avec l’abonnement Couple.', code_invalide: 'Ce code ne marche pas (ou il a expiré). Demande-lui un nouveau code.', complet: 'Cet espace a déjà ses deux membres.', deja_en_couple: 'Tu as déjà un espace de couple.', titre_requis: 'Écris ce que vous allez faire.' };

const invitation = (code) => `Rejoins notre espace de couple 💞 chez Lamia Femme Berbère : ${location.origin}/notre-couple/?code=${code} (code : ${code})`;
const AUTOUR = `<section class="couple-carte"><h2>Autour de vous</h2>
  <p class="espace-sans-liens"><a class="btn btn-ink" href="/abonnement/#unite-sauver_couple">Coaching de couple</a> <a class="btn btn-line" href="/salon/">Les lives</a> <a class="btn btn-line" href="/boutique/">La boutique</a> <a class="btn btn-line" href="/confidences/#conversation">Écrire à Lamia</a></p></section>`;

function accueil() {
  zone.innerHTML = `<section class="couple-carte couple-debut">
    <h2>Créer notre espace</h2>
    <div class="avec-aide"><button type="button" class="btn btn-ink" data-couple-creer>Créer notre espace</button>${aideQ('Un espace à vous deux, à part des rencontres : votre planning d’activités de couple, et tout ce que Lamia propose aux couples. Tu invites ton ou ta partenaire avec un code.')}</div>
    <form class="couple-rejoindre" data-couple-rejoindre><label>Tu as reçu un code ?<input name="code" maxlength="8" autocomplete="off" placeholder="Ex. K7Q2MD" required></label><button type="submit" class="btn btn-line">Rejoindre</button></form>
    <p class="form-status" role="status" data-couple-statut></p></section>${AUTOUR}`;
}

// Un titre de carte avec sa petite image.
const titre = (nom, texte) => `<h2 class="couple-titre">${img(nom, 'ci-m')}<span>${texte}</span></h2>`;
const joursAvant = (iso) => Math.ceil((new Date(`${iso}T00:00:00`) - new Date(new Date().toDateString())) / 86400e3);

// Le calendrier du mois : une image par activité prévue ; on touche un jour pour voir ou ajouter.
function calendrier(c) {
  const auj = new Date(); if (!moisVu) moisVu = new Date(auj.getFullYear(), auj.getMonth(), 1);
  const parJour = {};
  for (const a of c.activites) if (a.quand) (parJour[cleJour(new Date(a.quand))] ||= []).push(a);
  const jal = {}; for (const [k, d] of Object.entries(c.jalons || {})) jal[d] = k;
  const premier = new Date(moisVu), decalage = (premier.getDay() + 6) % 7, nb = new Date(premier.getFullYear(), premier.getMonth() + 1, 0).getDate();
  const cases = [];
  for (let i = 0; i < decalage; i += 1) cases.push('<span class="cal-vide"></span>');
  for (let d = 1; d <= nb; d += 1) {
    const k = cleJour(new Date(premier.getFullYear(), premier.getMonth(), d)), acts = parJour[k] || [];
    cases.push(`<button type="button" class="cal-jour${k === cleJour(auj) ? ' is-auj' : ''}${k === jourChoisi ? ' is-choisi' : ''}${acts.length ? ' a-quelque-chose' : ''}${jal[k] ? ' is-jalon' : ''}" data-cal-jour="${k}"><span>${d}</span>${jal[k] ? img(jal[k], 'ci-xs') : acts.length ? img(acts[0].type, 'ci-xs') : ''}</button>`);
  }
  const choisis = jourChoisi ? parJour[jourChoisi] || [] : [];
  return `<div class="cal">
    <div class="cal-tete"><button type="button" class="link-button" data-cal-mois="-1" aria-label="Mois précédent">‹</button><strong>${esc(premier.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}</strong><button type="button" class="link-button" data-cal-mois="1" aria-label="Mois suivant">›</button></div>
    <div class="cal-grille">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j) => `<span class="cal-nom">${j}</span>`).join('')}${cases.join('')}</div>
    ${jourChoisi ? `<div class="cal-detail"><p><strong>${esc(new Date(`${jourChoisi}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</strong>${jal[jourChoisi] ? ` · ${esc(jalonsDef[jal[jourChoisi]] || '')} 💍` : ''}</p>${choisis.length ? `<ul class="couple-liste">${choisis.map((a) => `<li>${img(a.type, 'ci-s')}<span><strong>${esc(a.titre)}</strong><small>${esc(a.type_nom)}${a.fait ? ' · fait ♡' : ''}</small></span></li>`).join('')}</ul>` : '<p class="aide">Rien de prévu ce jour-là.</p>'}<p><button type="button" class="btn btn-line" data-cal-ajouter="${jourChoisi}">+ Ajouter ce jour-là</button></p></div>` : ''}
  </div>`;
}

function vue(c) {
  dernier = c;
  const lui = c.membres.find((m) => !m.moi), moi = c.membres.find((m) => m.moi);
  const sonNom = lui ? esc(lui.prenom) : 'ton ou ta partenaire';
  const avenir = c.activites.filter((a) => !a.fait), faites = c.activites.filter((a) => a.fait);
  const ligne = (a) => `<li class="${a.fait ? 'is-fait' : ''}"><label class="couple-coche"><input type="checkbox" data-act-fait="${esc(a.id)}"${a.fait ? ' checked' : ''} aria-label="Fait"></label>${img(a.type, 'ci-s')}
    <span><strong>${esc(a.titre)}</strong><small>${esc(a.type_nom)}${a.quand ? ` · ${esc(jour(a.quand))}` : ''}${a.pour_nous ? '' : ' · pour moi'}</small></span>
    ${a.de_moi ? `<button type="button" class="link-button" data-act-suppr="${esc(a.id)}" aria-label="Retirer">✕</button>` : ''}</li>`;
  const ajout = (t, type) => `<button type="button" class="couple-idee" data-ajout-titre="${esc(t)}" data-ajout-type="${esc(type)}">${img(type, 'ci-s')}<span>${esc(t)}</span><b aria-label="Ajouter au planning">+</b></button>`;
  const meteo = c.meteo || {}, mienne = meteo.moi?.derniere, sienne = meteo.lui?.derniere, q = c.question || {};
  const aJouer = (c.jeux || []).filter((j) => !j.de_moi && !j.reponse);
  const pastilles = { nous: Boolean(sienne?.aujourdhui) || (q.a_repondu && !q.ma_reponse), jeux: aJouer.length > 0 };
  const besoinDe = (m) => (m.besoin_nom && m.besoin !== 'rien' ? `<small>Besoin : ${esc(m.besoin_nom.toLowerCase())}</small>` : '');

  const formMeteo = `<form class="couple-meteo-form" data-meteo>
      <div class="couple-humeurs" role="radiogroup" aria-label="Mon humeur">${Object.entries(humeurs).map(([k, [, m]]) => `<label><input type="radio" name="humeur" value="${k}"${Number(k) === (mienne?.humeur || 0) ? ' checked' : ''} required>${img(`h${k}`, 'ci-l')}<small>${esc(m)}</small></label>`).join('')}</div>
      <p class="couple-sous">Aujourd’hui, j’aurais besoin…</p>
      <div class="couple-besoins">${Object.entries(besoins).map(([k, v]) => `<label><input type="radio" name="besoin" value="${k}"${k === mienne?.besoin ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
      <input name="note" maxlength="200" placeholder="Un mot sur ta journée (facultatif)" aria-label="Un mot sur ta journée" value="${esc(mienne?.note || '')}">
      ${lui ? `<label class="annonce-case"><input type="checkbox" name="partage" checked> <span>Partager avec ${sonNom}</span></label>` : ''}
      <button type="submit" class="btn btn-ink">${mienne?.aujourdhui ? 'Mettre à jour' : 'Partager'}</button></form>`;

  // Le tirage en cours dans les jeux (une carte au hasard, qu'on envoie ou qu'on change).
  const carteTiree = tirage && jeuxDef[tirage.jeu] ? `<div class="couple-carte-jeu is-${esc(tirage.jeu)}" data-tirage>
      <p class="couple-carte-jeu-nom">${img(tirage.jeu, 'ci-s')} ${esc(jeuxDef[tirage.jeu].nom)}</p>
      <p class="couple-carte-jeu-texte">${esc(jeuxDef[tirage.jeu].cartes[tirage.i])}</p>
      <p class="espace-sans-liens"><button type="button" class="btn btn-line" data-jeu-autre>Une autre carte</button> ${lui ? `<button type="button" class="btn btn-ink" data-jeu-envoyer>L’envoyer à ${sonNom} 💌</button>` : ''}</p></div>` : '';

  const jalons = c.jalons || {}, faits = new Set(c.prepa || []), nbPrepa = Object.keys(prepaDef).length;
  const jourJ = jalons.mariage ? joursAvant(jalons.mariage) : null;

  const panneaux = {
    nous: `<section class="couple-carte couple-meteo">
        ${titre(`h${mienne?.humeur || 4}`, 'Ma météo du cœur')}
        ${mienne?.aujourdhui ? `<p class="couple-meteo-moi">${img(`h${mienne.humeur}`, 'ci-xl')} <span><strong>${esc(mienne.mot)}</strong>${besoinDe(mienne)}</span></p>
          <details class="couple-ajout"><summary class="link-button">Changer</summary>${formMeteo}</details>` : formMeteo}
      </section>
      ${lui ? `<section class="couple-carte couple-lui">
        ${titre('nous', `Et ${sonNom} ?`)}
        ${sienne ? `<p class="couple-meteo-moi">${img(`h${sienne.humeur}`, 'ci-xl')} <span><strong>${esc(sienne.mot)}</strong>${besoinDe(sienne)}${sienne.note ? `<em>« ${esc(sienne.note)} »</em>` : ''}</span></p>
          ${sienne.besoin && suggestions[sienne.besoin] ? `<p class="couple-sous">Ce qui lui ferait du bien</p><div class="couple-idees">${suggestions[sienne.besoin].map(([t, ty]) => ajout(t, ty)).join('')}</div>` : ''}`
          : `<p class="aide">${sonNom} n’a pas encore partagé sa météo.</p><p><button type="button" class="couple-mot" data-mot="Je pense à toi 💭">Je pense à toi 💭</button></p>`}
      </section>
      <section class="couple-carte couple-semaine">${titre('planning', 'Notre semaine')}
        <div class="couple-semaine-grille">${(meteo.jours || []).map((j) => `<span class="cal-nom">${esc(new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'narrow' }))}</span>`).join('')}
          ${(meteo.moi?.semaine || []).map((h) => `<span>${h ? img(`h${h}`, 'ci-s') : '<i class="couple-vide"></i>'}</span>`).join('')}
          ${(meteo.lui?.semaine || []).map((h) => `<span>${h ? img(`h${h}`, 'ci-s') : '<i class="couple-vide"></i>'}</span>`).join('')}</div>
        <p class="aide">En haut toi, en bas ${sonNom}.</p></section>
      <section class="couple-carte couple-question">${titre('question', 'La question du jour')}
        <p class="couple-q">${esc(q.texte || '')}</p>
        ${q.ma_reponse ? `<p class="couple-rep is-moi"><small>Toi</small>${esc(q.ma_reponse)}</p>${q.sa_reponse ? `<p class="couple-rep"><small>${sonNom}</small>${esc(q.sa_reponse)}</p>` : `<p class="aide">${sonNom} n’a pas encore répondu.</p>`}`
          : `${q.a_repondu ? `<p class="couple-rep is-cache">🔒 ${sonNom} a répondu. Réponds pour découvrir sa réponse.</p>` : ''}<form class="couple-mot-libre" data-reponse><input name="texte" maxlength="400" required placeholder="Ta réponse…" aria-label="Ta réponse"><button type="submit" class="btn btn-ink">Répondre</button></form>`}
      </section>
      <section class="couple-carte couple-defi">${titre('defi', 'Le défi de la semaine')}<p>${esc(c.defi || '')}</p>
        <p><button type="button" class="btn btn-line" data-ajout-titre="Défi : ${esc(c.defi || '')}" data-ajout-type="rituel">On le relève !</button></p></section>` : ''}`,

    douceurs: `<section class="couple-carte couple-mots">
      ${titre('douceurs', 'Nos mots doux')}
      ${lui ? `<div class="couple-mots-boutons">${motsDoux.map((m) => { const payant = motsPayants.includes(m) && !Boolean(c.niveau); return `<button type="button" class="couple-mot${motsPayants.includes(m) ? ' is-premium' : ''}" ${payant ? 'data-couple-abo' : `data-mot="${esc(m)}"`}>${esc(m)}${payant ? ' <span class="couple-cadenas" aria-label="Avec l’abonnement Couple">🔒</span>' : ''}</button>`; }).join('')}</div>
      ${Boolean(c.niveau) ? `<form class="couple-mot-libre" data-mot-libre><input name="texte" maxlength="200" placeholder="Ou écris le tien…" aria-label="Ton mot doux"><button type="submit" class="btn btn-ink" aria-label="Envoyer">❤</button></form>` : `<p class="couple-mot-libre"><button type="button" class="link-button" data-couple-abo>✍️ Écrire ton propre mot doux 🔒</button></p>`}
      ${Boolean(c.niveau) ? '' : window.LFB_PLAY ? '<div class="couple-abo" data-couple-abo-box hidden><p class="aide">Ces mots doux viennent avec l’abonnement Couple, qui ne s’achète pas dans cette version de l’appli.</p></div>' : `<div class="couple-abo" data-couple-abo-box hidden>
        <div class="couple-offres">
          <label class="couple-offre"><input type="radio" name="offre" value="couple" checked><strong>Couple Amour</strong><span>18 € / mois pour vous deux</span><small>Tous les mots doux animés, ton mot à toi, et bientôt le fil avec vos proches (1 proche inclus) et 5 € de points cadeau par mois.</small></label>
          <label class="couple-offre"><input type="radio" name="offre" value="couple_prestige"><strong>Couple Prestige</strong><span>38 € / mois pour vous deux</span><small>Tout Couple Amour et un plus beau cadeau de mariage ; bientôt, Lamia dans votre fil une fois par mois et 10 € de points cadeau par mois.</small></label>
        </div>
        <label class="annonce-case"><input type="checkbox" data-couple-cgv> <span>J’accepte les <a class="text-link" href="/cgv/" target="_blank" rel="noopener">conditions de vente</a></span></label>
        <p><button type="button" class="btn btn-ink" data-couple-payer>M’abonner pour nous deux 💞</button></p></div>`}` : '<p class="aide">Dès que ton ou ta partenaire vous rejoint, vous pourrez vous envoyer des mots doux.</p>'}
      ${(c.mots || []).length ? `<ul class="couple-fil">${c.mots.map((m) => `<li class="${m.de_moi ? 'is-moi' : ''}">${m.animation ? `<span class="couple-anim anim-${esc(m.animation)}" aria-hidden="true">${{ coeur: '<i>❤</i><b>✦</b><b>✦</b><b>✦</b>', manque: '<i>💗</i><i>💗</i>', retrouver: '<i>🤍</i><i>❤</i>' }[m.animation] || ''}</span>` : ''}<span>${esc(m.texte)}</span><small>${m.de_moi ? 'Toi' : esc(lui?.prenom || '')} · ${esc(new Date(m.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}</small></li>`).join('')}</ul>` : ''}
    </section>
    <section class="couple-carte couple-bocal">
      ${titre('bocal', 'Notre bocal à souvenirs')}
      <div class="avec-aide"><p class="aide">Un beau moment à garder ? Glissez-le dans le bocal.</p>${aideQ('Vos souvenirs restent ici, rien que pour vous deux. Un jour de doute, piochez-en un au hasard.')}</div>
      <form class="couple-souvenir-form" data-souvenir><input name="texte" maxlength="300" required placeholder="Le thé chez ta grand-mère, notre première balade…" aria-label="Le souvenir"><input name="quand" type="date" aria-label="La date (facultatif)"><button type="submit" class="btn btn-ink">Dans le bocal ✨</button></form>
      ${(c.souvenirs || []).length ? `<p><button type="button" class="btn btn-line" data-piocher>Piocher un souvenir au hasard</button></p><p class="couple-pioche" data-pioche hidden></p>
        <ul class="couple-souvenirs">${c.souvenirs.map((x) => `<li><span>${esc(x.texte)}</span><small>${x.quand ? esc(new Date(x.quand).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })) : ''}${x.de_moi ? ` <button type="button" class="link-button" data-act-suppr="${esc(x.id)}" aria-label="Retirer">✕</button>` : ''}</small></li>`).join('')}</ul>` : ''}
    </section>
    <section class="couple-carte">
      ${titre('cadeau', 'Liste de cadeaux')}
      <div class="couple-cadeaux">${Object.entries(cadeaux).map(([k, v]) => `<button type="button" class="couple-cadeau" data-cadeau="${k}">${img(k === 'autre' ? 'cadeau' : k, 'ci-l')}${esc({ bijou: 'Bijou', parfum: 'Parfum', fleurs: 'Fleurs', chocolat: 'Chocolats', diner: 'Dîner', spa: 'Spa à deux', weekend: 'Week-end', coffret: 'Coffret beauté', photo: 'Séance photo', autre: 'Autre idée' }[k] || v)}</button>`).join('')}</div>
      <form class="couple-cadeau-form" data-cadeau-form hidden><input type="hidden" name="type"><label>Un mot pour Lamia (facultatif)<input name="note" maxlength="300" placeholder="Pour quand, pour quelle occasion…"></label><button type="submit" class="btn btn-ink">Envoyer ma demande</button></form>
    </section>`,

    jeux: `${aJouer.length ? `<section class="couple-carte couple-a-toi">${titre('jeux', 'À toi de jouer !')}
        ${aJouer.map((j) => `<div class="couple-carte-jeu is-${esc(j.jeu)}"><p class="couple-carte-jeu-nom">${img(j.jeu, 'ci-s')} ${esc(j.jeu_nom)} · de ${sonNom}</p><p class="couple-carte-jeu-texte">${esc(j.carte)}</p>
          <form class="couple-mot-libre" data-jeu-reponse="${esc(j.id)}"><input name="texte" maxlength="400" required placeholder="Ta réponse…" aria-label="Ta réponse"><button type="submit" class="btn btn-ink">Répondre</button></form></div>`).join('')}</section>` : ''}
      <section class="couple-carte couple-jeux">${titre('jeux', 'Jeux d’amour à distance')}
        <p class="aide">Tire une carte et envoie-la à ${sonNom}. Simple, tendre, ou un peu piquant 🌶️ : ça reste entre vous deux.</p>
        <div class="couple-paquets">${Object.entries(jeuxDef).map(([k, j]) => `<button type="button" class="couple-paquet is-${esc(k)}${tirage?.jeu === k ? ' is-choisi' : ''}" data-jeu="${esc(k)}">${img(k, 'ci-l')}<strong>${esc(j.nom)}</strong><small>${esc(j.sous)}</small></button>`).join('')}</div>
        ${carteTiree}
        ${lui ? '' : '<p class="aide">Dès que ton ou ta partenaire vous rejoint, vous pourrez jouer à deux.</p>'}
      </section>
      ${(c.jeux || []).filter((j) => j.de_moi || j.reponse).length ? `<section class="couple-carte">${titre('douceurs', 'Nos parties')}
        <ul class="couple-parties">${c.jeux.filter((j) => j.de_moi || j.reponse).map((j) => `<li>${img(j.jeu, 'ci-s')}<span><strong>${esc(j.carte)}</strong>${j.reponse ? `<em>${j.de_moi ? sonNom : 'Toi'} : « ${esc(j.reponse)} »</em>` : `<small>En attente de ${sonNom}…</small>`}</span></li>`).join('')}</ul></section>` : ''}`,

    planning: `<section class="couple-carte">
      ${titre('planning', 'Notre planning')}
      ${calendrier(c)}
      <h3 class="couple-sous">À venir</h3>
      ${avenir.length ? `<ul class="couple-liste">${avenir.map(ligne).join('')}</ul>` : '<p class="aide">Rien de prévu pour l’instant : une idée plus bas ?</p>'}
      <details class="couple-ajout" data-ajout-boite><summary class="btn btn-ink">Ajouter une activité</summary>
        <form data-act-ajouter>
          <label>Quoi ?<input name="titre" maxlength="120" required placeholder="Dîner au restaurant, balade au bord de la mer…"></label>
          <label>Type<select name="type">${Object.entries(types).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label>Quand ?<input name="quand" type="datetime-local"></label>
          <fieldset class="couple-pour"><label><input type="radio" name="pour" value="nous" checked> Pour nous deux</label><label><input type="radio" name="pour" value="moi"> Pour moi</label></fieldset>
          <button type="submit" class="btn btn-ink">Ajouter</button>
        </form></details>
      ${faites.length ? `<details class="couple-faites"><summary>Déjà fait (${faites.length}) ♡</summary><ul class="couple-liste">${faites.map(ligne).join('')}</ul></details>` : ''}
    </section>
    <section class="couple-carte couple-idees-carte">${titre('autre', 'Des idées de moments')}
      ${Object.entries(idees).map(([theme, liste], i) => `<details class="couple-theme"${i === 0 ? ' open' : ''}><summary>${esc(theme)}</summary><div class="couple-idees">${liste.map(([t, ty]) => ajout(t, ty)).join('')}</div></details>`).join('')}
    </section>`,

    mariage: `<section class="couple-carte couple-jourj">
        ${img('fiancailles', 'ci-xxl')}
        ${jourJ !== null ? (jourJ > 0 ? `<p class="couple-jourj-chiffre">J-${jourJ}</p><p>avant le grand jour, le ${esc(new Date(`${jalons.mariage}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>` : jourJ === 0 ? '<p class="couple-jourj-chiffre">C’est aujourd’hui !</p><p>Tous nos vœux de bonheur 💍</p>' : '<p class="couple-jourj-chiffre">Mariés ♡</p><p>Envoyez votre photo plus bas : Lamia vous offre un cadeau.</p>')
          : '<p class="couple-jourj-chiffre">Le grand jour</p><p>Fixez sa date ci-dessous : le compte à rebours commence.</p>'}
      </section>
      <section class="couple-carte">${titre('demande', 'Nos grandes étapes')}
        <ol class="couple-etapes">${Object.entries(jalonsDef).map(([k, v]) => { const d = jalons[k], passe = d && joursAvant(d) < 0; return `<li class="${d ? 'a-date' : ''}${passe ? ' is-passe' : ''}">${img(k, 'ci-m')}<span><strong>${esc(v)}</strong><small>${d ? `${esc(new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}${passe ? ' · c’est fait ♡' : joursAvant(d) === 0 ? ' · aujourd’hui !' : ` · dans ${joursAvant(d)} j`}` : 'Date à fixer'}</small></span><input type="date" value="${esc(d || '')}" data-jalon="${esc(k)}" aria-label="Date : ${esc(v)}"></li>`; }).join('')}</ol>
      </section>
      <section class="couple-carte couple-prepa">${titre('planning', 'Préparer notre mariage')}
        <div class="couple-jauge" role="progressbar" aria-valuemin="0" aria-valuemax="${nbPrepa}" aria-valuenow="${faits.size}"><span style="width:${Math.round((faits.size / (nbPrepa || 1)) * 100)}%"></span></div>
        <p class="aide">${faits.size} sur ${nbPrepa} · cochée par l’un, cochée pour les deux.</p>
        <ul class="couple-prepa-liste">${Object.entries(prepaDef).map(([k, v]) => `<li><label><input type="checkbox" data-prepa="${esc(k)}"${faits.has(k) ? ' checked' : ''}> <span>${esc(v)}</span></label></li>`).join('')}</ul>
      </section>
      <section class="couple-carte couple-inspi">${titre('fleurs', 'Pour vous inspirer')}
        <div class="couple-soutien-liste">
          <a href="/guides/mariage-kabyle/">${img('henne', 'ci-l')}<strong>Le mariage kabyle</strong><small>Le henné, la robe, la fête</small></a>
          <a href="/ecrin/">${img('bijou', 'ci-l')}<strong>Les bijoux d’Ath Yenni</strong><small>L’écrin de Lamia</small></a>
          <a href="/abonnement/#unite-sauver_couple">${img('coaching', 'ci-l')}<strong>Coaching avant le mariage</strong><small>Une séance avec Lamia, à deux</small></a>
          <a href="/salon/">${img('rendez_vous', 'ci-l')}<strong>Les lives</strong><small>Les thèmes mariage de Lamia</small></a>
        </div></section>
      ${lui ? `<section class="couple-carte couple-mariage">
      ${titre('fiancailles', 'On s’est mariés')}
      <div class="avec-aide"><button type="button" class="btn btn-ink" data-mariage-ouvrir>Nous nous sommes mariés !</button>${aideQ('Félicitations ! Envoie une photo de votre mariage : Lamia vous offre un cadeau. La photo reste privée, elle n’est jamais publiée.')}</div>
      <form class="couple-mariage-form" data-mariage-form hidden>
        <label>Une photo de votre mariage<input name="photo" type="file" accept="image/*" required></label>
        <label>La date du mariage<input name="date" type="date" value="${esc(jalons.mariage || '')}"></label>
        <label>Adresse pour recevoir le cadeau<textarea name="adresse" rows="3" maxlength="400" required placeholder="Prénom Nom, rue, code postal, ville, pays"></textarea></label>
        <button type="submit" class="btn btn-ink">Envoyer à Lamia 🎁</button>
      </form></section>` : ''}`,

    aide: `<section class="couple-carte couple-soutien">${titre('aide', 'Besoin d’un coup de main ?')}
      <p class="aide">Une dispute qui revient, un passage difficile, un projet à deux : Lamia vous accompagne.</p>
      <div class="couple-soutien-liste">
        <a href="/abonnement/#unite-sauver_couple">${img('coaching', 'ci-l')}<strong>Coaching de couple</strong><small>Une séance avec Lamia, à deux</small></a>
        <a href="/confidences/#conversation">${img('douceurs', 'ci-l')}<strong>Écrire à Lamia</strong><small>En toute confidence</small></a>
        <a href="/salon/">${img('rendez_vous', 'ci-l')}<strong>Les lives</strong><small>Les thèmes de couple de Lamia</small></a>
        <a href="/boutique/">${img('cadeau', 'ci-l')}<strong>La boutique</strong><small>Pour vous faire plaisir</small></a>
      </div></section>
    <p class="couple-quitter"><button type="button" class="link-button" data-couple-quitter>Quitter cet espace</button></p>`,
  };
  if (!panneaux[onglet]) onglet = 'nous';

  zone.innerHTML = `<section class="couple-carte couple-tete">
      <span class="couple-tete-coeurs" aria-hidden="true"><i>♥</i><i>♥</i><i>♥</i><i>♥</i><i>♥</i></span>
      <p class="couple-noms"><span>${esc(moi?.prenom || 'Moi')}</span> ${img('fiancailles', 'ci-l couple-bat')} <span>${lui ? esc(lui.prenom) : '<em>en attente</em>'}</span></p>
      ${lui ? `${jourJ > 0 ? `<p class="couple-tete-meteo">💍 J-${jourJ} avant le grand jour</p>` : ''}${sienne?.aujourdhui ? `<p class="couple-tete-meteo">Aujourd’hui ${esc(lui.prenom)} : ${img(`h${sienne.humeur}`, 'ci-xs')} ${esc(sienne.mot.toLowerCase())}</p>` : ''}` : `<div class="couple-code"><p>Invite ton ou ta partenaire 💌</p><p class="couple-code-valeur">${c.code ? esc(c.code) : '—'}</p>${c.code ? (() => { const t = invitation(c.code); return `<p class="couple-envois"><a class="btn btn-ink" href="sms:?&body=${encodeURIComponent(t)}">Par SMS</a><a class="btn btn-ink" href="https://wa.me/?text=${encodeURIComponent(t)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn btn-line" href="mailto:?subject=${encodeURIComponent('Rejoins notre espace de couple 💞')}&body=${encodeURIComponent(t)}">Par email</a>${navigator.share ? `<button type="button" class="btn btn-line" data-couple-partager="${esc(c.code)}">Autre…</button>` : ''}</p>`; })() : ''}<p><button type="button" class="link-button" data-couple-code>Nouveau code</button></p></div>`}
    </section>
    ${c.conversion && !window.LFB_PLAY ? `<section class="couple-carte couple-conversion">
      <h2>Ton abonnement devient « ${esc(c.conversion.vers)} » ? 💞</h2>
      <p>Tu as la formule <strong>${c.conversion.formule === 'prestige' ? 'Prestige' : 'Passion'}</strong> pour les rencontres. Maintenant que vous êtes en couple, elle peut devenir <strong>${esc(c.conversion.vers)}</strong> : mots doux avec leurs animations et ton mot à toi, pour vous deux ; bientôt le fil avec vos proches et des points cadeau${c.conversion.formule === 'prestige' ? ', et Lamia dans votre fil une fois par mois' : ''}.</p>
      ${c.conversion.annuel ? '<p class="aide">Ton abonnement est à l’année : écris à Lamia pour le transformer.</p>' : `<p class="aide">${(c.conversion.vers_prix / 100).toLocaleString('fr-FR')} € par mois pour vous deux. <strong>Le premier mois reste au prix que tu paies aujourd’hui</strong>, rien à payer de plus maintenant. Ta formule de rencontre s’arrête à ta prochaine échéance. Sans engagement.</p>
      <p class="espace-sans-liens"><button type="button" class="btn btn-ink" data-conversion-oui>Oui, je passe en Couple</button> <button type="button" class="btn btn-line" data-conversion-non>Pas maintenant</button></p>`}
    </section>` : ''}
    <nav class="couple-onglets" aria-label="Notre espace">${ONGLETS.map(([k, n]) => `<button type="button" data-onglet="${k}"${k === onglet ? ' aria-current="page"' : ''}>${img(k, 'ci-m')}${n}${pastilles[k] && onglet !== k ? '<i class="couple-pastille" aria-label="Nouveau"></i>' : ''}</button>`).join('')}</nav>
    <div class="couple-panneau">${panneaux[onglet]}</div>`;
}

async function charger() {
  try {
    const r = await appel({ action: 'couple_etat' });
    types = r.types || {}; cadeaux = r.cadeaux || {}; humeurs = r.humeurs || {}; besoins = r.besoins || {}; suggestions = r.suggestions || {}; idees = r.idees || {}; jeuxDef = r.jeux || {}; jalonsDef = r.jalons || {}; prepaDef = r.prepa || {}; motsDoux = r.mots_doux || []; motsPayants = r.mots_payants || [];
    const q = new URLSearchParams(location.search);
    if (!r.couple && q.get('code')) return faire({ action: 'couple_rejoindre', code: q.get('code') });
    if (!r.couple && q.has('inviter')) return faire({ action: 'couple_creer' });
    try { localStorage.setItem('lfb-en-couple', JSON.stringify({ v: Boolean(r.couple), lu: Date.now() })); } catch { /* */ }
    if (r.couple) vue(r.couple); else accueil();
  } catch { zone.innerHTML = '<p class="aide">L’espace ne s’affiche pas pour le moment. Réessaie dans un instant.</p>'; }
}
// Une pluie de petits cœurs quand on envoie un mot doux.
function coeurs() {
  for (let i = 0; i < 14; i += 1) {
    const c = document.createElement('span');
    c.className = 'couple-coeur-vole'; c.textContent = ['❤', '💕', '💖', '💗'][i % 4];
    c.style.left = `${10 + Math.random() * 80}vw`; c.style.animationDelay = `${Math.random() * .5}s`; c.style.fontSize = `${16 + Math.random() * 18}px`;
    document.body.appendChild(c); setTimeout(() => c.remove(), 2600);
  }
}
// Un petit message en bas de l'écran (l'espace se redessine après chaque geste).
function bulle(t) {
  document.querySelector('.couple-bulle')?.remove();
  const b = document.createElement('p'); b.className = 'couple-bulle'; b.setAttribute('role', 'status'); b.textContent = t;
  document.body.appendChild(b); setTimeout(() => b.remove(), 3200);
}
const statut = (t) => { const s = zone.querySelector('[data-couple-statut]'); if (s) s.textContent = t; else bulle(t); };
async function faire(body, apres) {
  try { const r = await appel(body); if (r.couple !== undefined) { if (r.couple) vue(r.couple); else accueil(); } apres?.(r); }
  catch (err) { statut(ERREURS[err.code] || 'Ça n’a pas fonctionné. Réessaie dans un instant.'); }
}

zone.addEventListener('click', async (e) => {
  const o = e.target.closest('[data-onglet]');
  if (o) { onglet = o.dataset.onglet; try { localStorage.setItem('lfb-couple-onglet', onglet); } catch { /* */ } vue(dernier); zone.querySelector('.couple-onglets')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const m = e.target.closest('[data-cal-mois]');
  if (m) { moisVu = new Date(moisVu.getFullYear(), moisVu.getMonth() + Number(m.dataset.calMois), 1); jourChoisi = null; vue(dernier); return; }
  const j = e.target.closest('[data-cal-jour]');
  if (j) { jourChoisi = jourChoisi === j.dataset.calJour ? null : j.dataset.calJour; vue(dernier); return; }
  const ca = e.target.closest('[data-cal-ajouter]');
  if (ca) { const boite = zone.querySelector('[data-ajout-boite]'); boite.open = true; boite.querySelector('[name=quand]').value = `${ca.dataset.calAjouter}T19:00`; boite.querySelector('[name=titre]').focus(); boite.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const idee = e.target.closest('[data-ajout-titre]');
  if (idee) { idee.disabled = true; return faire({ action: 'couple_activite_ajouter', titre: idee.dataset.ajoutTitre, type: idee.dataset.ajoutType, pour_nous: true }, () => bulle('Ajouté à votre planning ♡')); }
  const paquet = e.target.closest('[data-jeu]');
  if (paquet) { const j = jeuxDef[paquet.dataset.jeu]; tirage = { jeu: paquet.dataset.jeu, i: Math.floor(Math.random() * j.cartes.length) }; vue(dernier); zone.querySelector('[data-tirage]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (e.target.closest('[data-jeu-autre]')) { const n = jeuxDef[tirage.jeu].cartes.length; tirage = { ...tirage, i: (tirage.i + 1 + Math.floor(Math.random() * (n - 1))) % n }; vue(dernier); return; }
  if (e.target.closest('[data-jeu-envoyer]')) { const t = tirage; tirage = null; return faire({ action: 'couple_jeu', jeu: t.jeu, i: t.i }, () => { coeurs(); bulle('Carte envoyée 💌'); }); }
  if (e.target.closest('[data-piocher]')) { const l = dernier?.souvenirs || [], x = l[Math.floor(Math.random() * l.length)], p = zone.querySelector('[data-pioche]'); if (x && p) { p.hidden = false; p.textContent = `✨ ${x.texte}`; p.classList.remove('is-anim'); void p.offsetWidth; p.classList.add('is-anim'); } return; }
  if (e.target.closest('[data-couple-creer]')) return faire({ action: 'couple_creer' });
  if (e.target.closest('[data-couple-abo]')) { const box = zone.querySelector('[data-couple-abo-box]'); if (box) { box.hidden = false; box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
  if (e.target.closest('[data-couple-payer]')) {
    const box = zone.querySelector('[data-couple-abo-box]');
    if (!box.querySelector('[data-couple-cgv]').checked) { statut('Coche les conditions de vente pour continuer.'); return; }
    const b = e.target.closest('[data-couple-payer]'); b.disabled = true;
    try {
      const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'abonnement_payer', formule: box.querySelector('[name=offre]:checked')?.value || 'couple', periode: 'mois', cgv_accepted: true, nom: moiInfo.nom || moiInfo.email, email: moiInfo.email }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { location.href = d.url; return; }
      statut(d.error === 'deja_abonne' ? 'Tu as déjà l’abonnement Couple.' : 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.');
    } catch { statut('Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.'); }
    b.disabled = false; return;
  }
  if (e.target.closest('[data-mariage-ouvrir]')) { const f = zone.querySelector('[data-mariage-form]'); f.hidden = false; f.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (e.target.closest('[data-conversion-non]')) { e.target.closest('.couple-conversion').remove(); return; }
  const conv = e.target.closest('[data-conversion-oui]');
  if (conv) {
    if (!confirm('Ton abonnement de rencontre devient un abonnement Couple. Le premier mois reste au même prix, puis le prix Couple. Tu confirmes ?')) return;
    conv.disabled = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ action: 'abonnement_vers_couple', accord: true }) });
      if (!r.ok) throw new Error();
      coeurs(); await charger();
    } catch { conv.disabled = false; statut('Le changement n’a pas pu se faire. Réessaie, ou écris à Lamia.'); }
    return;
  }
  const mot = e.target.closest('[data-mot]');
  if (mot) { mot.disabled = true; return faire({ action: 'couple_mot', texte: mot.dataset.mot }, () => coeurs()); }
  if (e.target.closest('[data-couple-code]')) return faire({ action: 'couple_code' });
  const p = e.target.closest('[data-couple-partager]');
  if (p) {
    const texte = invitation(p.dataset.couplePartager);
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
  const jal = e.target.closest('[data-jalon]');
  if (jal) return faire({ action: 'couple_jalon', cle: jal.dataset.jalon, date: jal.value || null }, () => { if (jal.dataset.jalon === 'mariage' && jal.value) coeurs(); });
  const pr = e.target.closest('[data-prepa]');
  if (pr) return faire({ action: 'couple_prepa', cle: pr.dataset.prepa, fait: pr.checked });
  const c = e.target.closest('[data-act-fait]');
  if (c) faire({ action: 'couple_activite_fait', id: c.dataset.actFait, fait: c.checked });
});
zone.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.matches('[data-mariage-form]')) {
    const fichier = f.photo.files[0], btn = f.querySelector('[type=submit]'), dire = (t) => { let p = f.querySelector('.form-status'); if (!p) { p = document.createElement('p'); p.className = 'form-status'; f.append(p); } p.textContent = t; };
    if (!fichier) return dire('Choisis une photo de votre mariage.');
    btn.disabled = true; dire('Envoi de la photo…');
    (async () => {
      try {
        const { upload } = await appel({ action: 'couple_mariage_photo', mime: fichier.type || 'image/jpeg', size: fichier.size });
        const r = await fetch(upload.url, { method: 'PUT', headers: { apikey: PUBLIC_KEY, 'Content-Type': upload.type, 'x-upsert': 'false' }, body: fichier });
        if (!r.ok) throw new Error('envoi');
        await appel({ action: 'couple_mariage', path: upload.path, adresse: f.adresse.value, date: f.date.value });
        f.outerHTML = '<p class="couple-mariage-ok">💍 Félicitations à vous deux ! Lamia a bien reçu votre photo : votre cadeau arrive.</p>';
        coeurs();
      } catch (err) { btn.disabled = false; dire(err.code === 'adresse_requise' ? 'Écris l’adresse complète pour recevoir le cadeau.' : err.code === 'photo_invalide' ? 'Cette photo ne passe pas : choisis une image de moins de 15 Mo.' : 'L’envoi n’a pas marché. Réessaie dans un instant.'); }
    })();
    return;
  }
  if (f.matches('[data-meteo]')) { if (!f.humeur.value) return bulle('Choisis comment tu te sens.'); return faire({ action: 'couple_humeur', humeur: Number(f.humeur.value), besoin: f.besoin?.value || null, note: f.note.value, partage: f.partage ? f.partage.checked : true }, () => bulle(f.partage && !f.partage.checked ? 'C’est noté, rien que pour toi.' : 'C’est partagé 💞')); }
  if (f.matches('[data-jeu-reponse]')) return faire({ action: 'couple_jeu_repondre', id: f.dataset.jeuReponse, texte: f.texte.value }, () => { coeurs(); bulle('Réponse envoyée 💞'); });
  if (f.matches('[data-reponse]')) return faire({ action: 'couple_reponse', texte: f.texte.value }, () => coeurs());
  if (f.matches('[data-souvenir]')) return faire({ action: 'couple_souvenir', texte: f.texte.value, quand: f.quand.value || null }, () => bulle('Dans le bocal ✨'));
  if (f.matches('[data-mot-libre]')) return faire({ action: 'couple_mot', texte: f.texte.value }, () => coeurs());
  if (f.matches('[data-couple-rejoindre]')) return faire({ action: 'couple_rejoindre', code: f.code.value });
  if (f.matches('[data-act-ajouter]')) return faire({ action: 'couple_activite_ajouter', titre: f.titre.value, type: f.type.value, quand: f.quand.value ? new Date(f.quand.value).toISOString() : null, pour_nous: f.pour.value === 'nous' });
  if (f.matches('[data-cadeau-form]')) return faire({ action: 'couple_cadeau', type: f.type.value, note: f.note.value }, () => { f.hidden = true; zone.querySelectorAll('[data-cadeau]').forEach((x) => x.classList.remove('is-choisi')); f.reset(); f.insertAdjacentHTML('afterend', '<p class="form-status">C’est envoyé : Lamia s’en occupe et revient vers toi.</p>'); });
});

(async () => {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  if (!session) { const code = new URLSearchParams(location.search).get('code'); zone.innerHTML = `<section class="couple-carte"><p>${code ? 'Ton ou ta partenaire t’invite dans votre espace de couple 💞 Crée ton compte ou connecte-toi, puis reviens sur ce lien.' : 'Connecte-toi pour ouvrir votre espace de couple.'}</p><p><a class="btn btn-ink" href="/mon-espace/?retour=${encodeURIComponent(location.pathname + location.search)}">Me connecter</a></p></section>${AUTOUR}`; return; }
  token = session.access_token;
  preparerImages();
  moiInfo = { email: session.user?.email || '', nom: [session.user?.user_metadata?.first_name, session.user?.user_metadata?.last_name].filter(Boolean).join(' ') };
  // Profil de test de Lamia : bascule entre l'espace célibataire et l'espace en couple (16 nov. 2026).
  if (new URLSearchParams(location.search).has('test')) zone.insertAdjacentHTML('beforebegin', '<p class="espace-test-mode"><span>Voir l’espace :</span> <a class="btn btn-line" href="/mon-espace/">Célibataire</a> <a class="btn btn-ink" href="/notre-couple/?test=1" aria-current="page">En couple</a></p>');
  charger();
})();
