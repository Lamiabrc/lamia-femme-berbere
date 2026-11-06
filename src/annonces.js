// Annonces de rencontre : dépôt (Patio et Confidences) et affichage des annonces vérifiées par Lamia.
import { api, esc, PUBLIC_KEY, creerCompte } from './confidences-commun.js';
import { O, lib, secteurLisible, telephoneNormal, foiEtVie, badgesProfil, origineLisible } from './matching-options.mjs';
import { createClient } from '/vendor/supabase.mjs';

// Compte (le même que « Mon espace ») : chaque profil y est lié pour pouvoir être modifié.
const supabase = createClient('https://tybwvxinigahhntfeeur.supabase.co', PUBLIC_KEY);
const sessionActive = async () => { try { return (await supabase.auth.getSession()).data.session; } catch { return null; } };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const say = (el, m, err = false) => { if (!el) return; el.textContent = m; el.classList.toggle('is-error', err); };
const ERR = {
  consent_required: 'Coche les cases obligatoires en bas du formulaire pour continuer.',
  identite_trop: 'Une seule photo de pièce d’identité suffit.',
  missing_name: 'Indique ton prénom (ou un petit nom).',
  missing_genre: 'Dis-nous si tu es une femme ou un homme.',
  invalid_birth_date: 'Vérifie ta date de naissance.',
  mineur: 'Les annonces sont réservées aux personnes majeures (18 ans et plus).',
  missing_lieu: 'Indique ta ville et ton pays.',
  origine_requise: 'Indique ton origine : kabyle, chaouie, touarègue, amazighe ou autre.',
  invalid_email: 'Vérifie ton adresse email : Lamia en a besoin pour te répondre.',
  textes_courts: 'Raconte-toi un peu plus : au moins quelques phrases pour ton profil et pour la personne que tu cherches.',
  medias_requis: 'Ajoute 2 photos de toi, visage visible.',
  photos_requises: 'Ajoute d’abord 2 photos de toi, dans « Mon espace ».',
  medias_trop: 'Deux photos au maximum.',
  identite_requise: 'Ajoute la photo de ta pièce d’identité, le numéro caché par ta main.',
  file_type: 'Ce type de fichier n’est pas accepté : photos (JPG, PNG, HEIC), ou PDF pour la pièce d’identité.',
  file_size: 'Un fichier est trop lourd : 12 Mo par photo, 50 Mo pour la vidéo.',
  rate_limited: 'Tu as déjà déposé plusieurs annonces aujourd’hui : réessaie demain.',
  upload_failed: 'Tes photos ne sont pas arrivées. Vérifie ta connexion, puis appuie à nouveau sur « Envoyer » : ton profil reprend là où il s’est arrêté.',
  contact_requis: 'Indique le lien de ton TikTok, Instagram ou Facebook : Lamia en a besoin pour la mise en relation.',
  compte_requis: 'Crée d’abord ton compte (ou connecte-toi) : il faut un compte pour confier ton profil ou dire qu’un profil t’intéresse.',
  connexion: 'Email ou mot de passe incorrect.',
  trop_de_demandes: 'Trop de demandes en ce moment. Réessaie dans une heure.',
  compte_impossible: 'La création du compte n’a pas fonctionné. Réessaie dans un instant.',
  telephone_invalide: 'Ce numéro de téléphone n’est pas valide. Mets-le en entier, avec l’indicatif si tu n’es pas en France (par ex. +213 5 12 34 56 78).',
  compte_autre_email: 'Tu es connecté(e) avec une autre adresse email : utilise celle de ton compte.',
  mot_de_passe: 'Choisis un mot de passe d’au moins 8 caractères.',
  compte_existant: 'Un compte existe déjà avec cet email, mais le mot de passe ne correspond pas. Mets ton mot de passe, ou réinitialise-le dans « Mon espace ».',
  deja_profil: 'Tu as déjà un profil chez Lamia : modifie-le dans « Mon espace ».',
  deja_profil_lien: 'Un profil existe déjà avec ce lien de réseau social. Connecte-toi avec le compte qui l’a créé (« Mon espace »), ou écris à Lamia si ce n’est pas toi.',
  tiktok_live: 'Indique le pseudo ou le lien TikTok que tu avais en live, pour que Lamia retrouve ta fiche.',
  enregistrement: 'Ton profil n’a pas pu être enregistré. Vérifie que tous les champs sont remplis, puis réessaie. Si ça recommence, écris à Lamia.',
  login_required: 'Ta connexion a expiré : reconnecte-toi dans « Mon espace », puis réessaie.',
  limite_matchs: 'Tu as atteint le nombre de matchs en cours de ta formule. Termines-en un depuis ton espace, ou passe à une formule supérieure.',
  quota_matchs: 'Tu as utilisé tes matchs disponibles. Prends un match supplémentaire à 5 €, ou viens au live de Lamia, chaque soir à 21 h : 1 match offert toutes les 2 semaines.',
  en_match: 'Tu as atteint le nombre de matchs en cours de ta formule : mets fin à l’un d’eux dans « Mon espace » pour en découvrir d’autres.',
};
const opts = (list, vide = 'Choisis…') => `<option value="">${vide}</option>${list.map((v) => `<option value="${esc(v)}">${esc(lib(v))}</option>`).join('')}`;
const puces = (name, list) => `<div class="annonce-puces">${list.map((v) => `<label><input type="checkbox" name="${name}" value="${esc(v)}"><span>${esc(lib(v))}</span></label>`).join('')}</div>`;
const PAR_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf' };
const typeDe = (f) => (f.type && f.type !== 'application/octet-stream' ? f.type : PAR_EXT[String(f.name || '').split('.').pop().toLowerCase()] || 'application/octet-stream');
const maxNaissance = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };

export function formulaireHtml() {
  return `<form class="annonce-form" data-annonce-form novalidate>
  <div class="annonce-etape annonce-live" data-bloc-live>
    <fieldset class="annonce-choix"><legend>As-tu déjà créé ton profil en live avec Lamia ?</legend>
      <label><input type="radio" name="live" value="oui"> Oui</label>
      <label><input type="radio" name="live" value="non"> Non, c’est la première fois</label>
    </fieldset>
    <div data-si-live hidden>
      <label>Ton pseudo ou ton lien TikTok de l’époque<input name="tiktok_live" maxlength="200" placeholder="@tonpseudo"></label>
      <p class="annonce-aide">🎥 Lamia retrouve ta fiche : ton profil est déjà chez elle, tu n’as que l’essentiel à remplir ci-dessous. <strong>Tes 3 premières mises en relation sont offertes.</strong></p>
    </div>
  </div>
  <div class="annonce-etape">
    <h3><span>1</span> Qui es-tu ?</h3>
    <div class="annonce-grille">
      <label>Ton prénom <small>(ou un petit nom)</small><input name="prenom" maxlength="60" autocomplete="given-name" required></label>
      <fieldset class="annonce-choix"><legend>Tu es</legend>
        <label><input type="radio" name="genre" value="femme"> une femme</label>
        <label><input type="radio" name="genre" value="homme"> un homme</label>
      </fieldset>
      <label>Ta date de naissance <small>(seul ton âge sera affiché)</small><input name="birth_date" type="date" max="${maxNaissance()}" required></label>
      <label>Ta ville<input name="ville" maxlength="80" autocomplete="address-level2" required></label>
      <label>Ton pays de résidence<select name="pays">${opts(O.pays)}</select></label>
      <label>Ton village ou ta région d’origine <small>(facultatif)</small><input name="villageOrigine" maxlength="80"></label>
      <label>Les langues que tu parles<input name="langue" maxlength="80" placeholder="Kabyle, tamazight, français…"></label>
    </div>
    <p class="annonce-sous" id="ton-origine">Ton origine <small>(affichée sur ton profil, 3 au maximum)</small></p>${puces('origineTags', O.origine)}
  </div>
  <div class="annonce-etape" data-optionnel-live>
    <h3><span>2</span> Ta vie aujourd’hui</h3>
    <div class="annonce-grille">
      <label>Ta situation<select name="situation">${opts(O.situation)}</select></label>
      <label>As-tu des enfants ?<select name="enfants">${opts(O.enfants)}</select></label>
      <label data-si-enfants hidden>Combien ?<input name="nbEnfants" type="number" min="0" max="15" inputmode="numeric"></label>
      <label data-si-enfants hidden>Leurs âges<input name="ageEnfants" maxlength="60" placeholder="3 et 7 ans"></label>
      <label>Souhaites-tu des enfants ?<select name="desirEnfants">${opts(O.desirEnfants)}</select></label>
      <label>Ton niveau d’études<select name="niveauEtudeCategorie">${opts(O.etudeCategorie)}</select></label>
      <label>Ton diplôme<select name="niveauEtudeDetail"><option value="">Choisis d’abord ton niveau</option></select></label>
      <label>Diplôme obtenu en<select name="etudesPaysObtention">${opts(O.etudesPaysObtention)}</select></label>
      <label>Ta profession<input name="profession" maxlength="80"></label>
      <label>Ta taille <small>(en cm, facultatif)</small><input name="tailleCm" type="number" min="120" max="230" inputmode="numeric" placeholder="170"></label>
      <label>Ta religion <small>(facultatif)</small><select name="religion">${opts(O.religion, 'Je préfère ne pas dire')}</select></label>
      <label>Ta pratique <small>(facultatif)</small><select name="pratique">${opts(O.pratique, 'Je préfère ne pas dire')}</select></label>
      <label class="annonce-large">Ta foi et ta pratique en quelques mots <small>(facultatif : prière, ramadan, ce qui compte pour toi…)</small><textarea name="religionTexte" rows="2" maxlength="300"></textarea></label>
      <label>Bouger pour l’amour ?<select name="mobiliteGeographique">${opts(O.mobilite)}</select></label>
      <label data-vision>Le travail dans le couple<select name="visionFinanciere"><option value="">Choisis d’abord femme ou homme</option></select></label>
      <label>Tabac<select name="fumeur">${opts(O.fumeur)}</select></label>
      <label>Sport<select name="sport">${opts(O.sport)}</select></label>
      <label>Alcool<select name="alcool">${opts(O.alcool)}</select></label>
      <label>Chique (chemma)<select name="chemma">${opts(O.chemma)}</select></label>
      <label class="annonce-large">Autre chose sur ton mode de vie <small>(facultatif : habitudes, alimentation, sorties…)</small><textarea name="autresModeVie" rows="2" maxlength="300"></textarea></label>
    </div>
    <p class="annonce-sous">Ce qui te ressemble <small>(jusqu’à 6)</small></p>${puces('caracteristiques', O.caracteristiques)}
    <label>Parle-nous de toi avec ton cœur <small>(ton caractère, tes valeurs, ce que tu aimes)</small><textarea name="profil" rows="5" maxlength="1500" placeholder="Écris comme si tu te présentais à une amie de Lamia."></textarea></label>
  </div>
  <div class="annonce-etape" data-optionnel-live>
    <h3><span>3</span> La personne que tu cherches</h3>
    <div class="annonce-grille">
      <div class="annonce-ages"><label>Âge de</label><input name="age_min" type="number" min="18" max="99" inputmode="numeric" aria-label="Âge minimum" placeholder="25"><label>à</label><input name="age_max" type="number" min="18" max="99" inputmode="numeric" aria-label="Âge maximum" placeholder="40"><span>ans</span></div>
      <label>Où doit-elle vivre ?<select name="zoneGeo">${opts(O.zoneGeo)}</select></label>
      <label>Sa religion<select name="religionRecherche">${opts(O.religionRecherche)}</select></label>
      <label>Sa pratique<select name="pratiqueRecherche">${opts(O.pratiqueRecherche)}</select></label>
      <label>Son niveau d’études<select name="etudesRecherche">${opts(O.etudesRecherche)}</select></label>
      <label data-hidjab hidden>Qu’elle porte le hijab ?<select name="rechercheFemmeHidjabiste">${opts(O.hidjab)}</select></label>
    </div>
    <p class="annonce-sous">Ses origines <small>(laisse vide si peu importe)</small></p>${puces('origineRechercheTags', O.origine)}
    <div class="annonce-puces annonce-accepte">
      <label><input type="checkbox" name="kabyleUniquement"><span>Uniquement kabyle</span></label>
      <label><input type="checkbox" name="accepteDivorce"><span>J’accepte une personne divorcée</span></label>
      <label><input type="checkbox" name="accepteVeuf"><span>J’accepte une personne veuve</span></label>
      <label><input type="checkbox" name="accepteEnfants"><span>J’accepte une personne qui a des enfants</span></label>
    </div>
    <p class="annonce-sous">Son caractère <small>(jusqu’à 6)</small></p>${puces('caracteristiquesRecherche', O.caracteristiques)}
    <label>Dis-nous qui tu aimerais rencontrer <small>(vos projets, ce qui compte pour toi)</small><textarea name="recherche" rows="4" maxlength="1500" placeholder="Mariage, valeurs, région… dis ce qui est important pour toi."></textarea></label>
  </div>
  <div class="annonce-etape" data-etape-medias>
    <h3><span>4</span> Tes 2 photos</h3>
    <p class="annonce-aide">Deux photos récentes de toi, visage visible. Pas de paysage ni d’image trouvée sur internet : Lamia les regarde. Souris, sois toi-même : c’est ce qui touche le plus.</p>
    <label class="annonce-depot">＋ Ajouter mes 2 photos<input type="file" accept="image/*" multiple data-medias></label>
    <ul class="annonce-apercu" data-medias-liste></ul>
  </div>
  <div class="annonce-etape annonce-id">
    <h3><span>5</span> Facultatif : ta pièce d’identité, pour un profil encore plus sûr</h3>
    <p class="annonce-aide">Ce n’est pas obligatoire. Mais un profil vérifié <strong>avec pièce d’identité</strong> porte un badge renforcé dans les annonces et inspire davantage confiance. Prends en photo ta carte d’identité, ton passeport ou ton titre de séjour, <strong>en posant ta main (ou un doigt) sur le numéro du document</strong> pour le cacher. Lamia vérifie seulement que la personne de l’annonce existe vraiment et qu’elle est majeure.</p>
    <p class="annonce-aide">🔒 Cette photo n’est <strong>jamais publiée</strong>. Seule Lamia la voit, et elle est <strong>supprimée dès la vérification faite</strong>.</p>
    <label class="annonce-depot">＋ Ajouter la photo de ma pièce d’identité<input type="file" accept="image/*,.pdf,application/pdf" data-identite></label>
    <ul class="annonce-apercu" data-identite-liste></ul>
  </div>
  <div class="annonce-etape">
    <h3><span>6</span> Ton contact (jamais affiché)</h3>
    <p class="annonce-aide" data-connecte hidden></p>
    <div class="annonce-grille">
      <label data-compte-email>Ton email<input name="email" type="email" autocomplete="email" required></label>
      <label data-reseau>Ton lien TikTok, Instagram ou Facebook <small>(obligatoire)</small><input name="contactReseau" maxlength="200" placeholder="https://www.tiktok.com/@tonpseudo"></label>
    </div>
    <label class="annonce-case"><input type="checkbox" name="sans_reseau"> <span>Je n’ai aucun profil sur les réseaux sociaux : je donne mon numéro de téléphone à la place.</span></label>
    <label data-tel hidden>Ton numéro de téléphone <small>(obligatoire si tu n’as pas de réseau ; avec l’indicatif si tu n’es pas en France, par ex. +213…)</small><input name="telephone" type="tel" autocomplete="tel" maxlength="25" placeholder="06 12 34 56 78"></label>
    <p class="annonce-aide">Ton lien de réseau social (ou, à défaut, ton numéro) est obligatoire : c’est par là que Lamia te contactera. Il n’est jamais affiché sur le site ni transmis à personne. Si tu as un réseau, ton numéro ne t’est demandé que plus tard, par Lamia elle-même, si un match te convient ; il reste chez elle.</p>
    <p class="annonce-aide">Tes coordonnées ne sont jamais affichées ni transmises : c’est Lamia qui te contacte pour une mise en relation.</p>
  </div>
  <label class="annonce-case" data-consent-depot><input type="checkbox" name="majeur"> <span>J’ai 18 ans ou plus et cette annonce est sincère : je cherche une vraie rencontre.</span></label>
  <label class="annonce-case" data-consent-depot><input type="checkbox" name="publication"> <span>Je confie mon profil à Lamia : il n’est publié nulle part, seule Lamia le voit et l’utilise dans son outil de matching pour me proposer des mises en relation. Je peux le retirer et faire effacer mes données à tout moment.</span></label>
  <label class="annonce-case" data-identite-accord hidden><input type="checkbox" name="identite_ok"> <span>J’accepte que Lamia voie la photo de ma pièce d’identité pour vérifier mon profil, sachant qu’elle est supprimée juste après. <a href="/confidentialite/" target="_blank" rel="noopener">Confidentialité</a></span></label>
  <label class="annonce-case"><input type="checkbox" name="anonyme_ok"> <span>Facultatif : j’accepte que Lamia affiche mon profil <strong>anonymement</strong> dans les Rencontres du site (âge, pays, textes et caractéristiques, <strong>sans prénom, photo, ville ni contact</strong>), pour que d’autres puissent dire qu’il les intéresse.</span></label>
  <label class="annonce-case"><input type="checkbox" name="photo_partage"> <span>Facultatif : si un match me convient, j’accepte que Lamia transmette <strong>ma photo</strong> à la personne avec qui elle me met en relation, et à elle seule. Jamais sur le site, jamais à quelqu’un d’autre. Je peux changer d’avis à tout moment depuis mon espace.</span></label>
  <input type="hidden" name="interet_ref" value="">
  <p class="annonce-interet" data-interet-info hidden></p>
  <input class="hp" name="zz_site" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button class="btn btn-ink annonce-envoyer" type="submit">💌 Confier mon profil à Lamia</button>
  <p class="form-status" role="status" data-annonce-statut></p>
</form>`;
}

// Copie en mémoire dès le choix : sur Android, la photo prise dans la galerie ou Google Photos est une copie temporaire
// qui peut disparaître pendant qu'on remplit le formulaire (l'envoi échouait alors sans bruit). Les photos sont aussi réduites.
async function enMemoire(f, max = 1600) {
  const type = typeDe(f), nom = f.name || 'fichier';
  if (type.startsWith('image/') && !/heic|heif|gif/.test(type)) {
    try {
      const img = await createImageBitmap(f);
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); img.close?.();
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
      if (blob && blob.size) return new File([blob], nom.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch { /* on garde l'original, copié ci-dessous */ }
  }
  const buf = await f.arrayBuffer();
  return new File([buf], nom, { type });
}
async function copier(liste, max) {
  const out = [];
  for (const f of liste) {
    try { out.push(await enMemoire(f, max)); }
    catch { throw Object.assign(new Error('illisible'), { code: 'fichier_illisible' }); }
  }
  return out;
}

function apercu(ul, fichiers, retirer) {
  ul.innerHTML = fichiers.map((f, i) => `<li>${f.type.startsWith('image/') && !/heic|heif/.test(f.type) ? `<img src="${URL.createObjectURL(f)}" alt="">` : f.type.startsWith('video/') ? '<span class="annonce-ico">🎬</span>' : '<span class="annonce-ico">📄</span>'}<small>${esc(f.name || 'fichier')}</small><button type="button" data-i="${i}" aria-label="Retirer ce fichier">✕</button></li>`).join('');
  $$('button', ul).forEach((b) => b.addEventListener('click', () => retirer(Number(b.dataset.i))));
}

// Le compte d'abord : sans être connecté(e), on ne voit que la création de compte / connexion.
export async function monterFormulaire(box, { existant = null, token = null } = {}) {
  if (!box) return;
  if (!existant && !(await sessionActive())) { porteCompte(box); return; }
  monterFormulaireConnecte(box, { existant, token });
  appliquerInteret(box);
}

function porteCompte(box) {
  const ref = box.dataset.interet;
  box.innerHTML = `<div class="annonce-porte">
    <h3>Étape 1 : ton compte</h3>
    ${ref ? `<p class="annonce-interet">💌 Le profil n° ${esc(ref)} t’intéresse : crée d’abord ton compte, puis ton profil. Lamia regardera si vous pouvez correspondre.</p>` : ''}
    <p class="annonce-aide">Il faut un compte pour confier ton profil à Lamia ou dire qu’un profil t’intéresse. C’est avec lui que tu modifies ton profil et suis tes mises en relation.</p>
    <div class="annonce-onglets" role="tablist"><button type="button" role="tab" data-mode="creer" aria-selected="true">Créer mon compte</button><button type="button" role="tab" data-mode="connexion" aria-selected="false">J’ai déjà un compte</button></div>
    <form class="annonce-grille" data-porte novalidate>
      <label data-seulement-creer>Ton prénom<input name="prenom" maxlength="60" autocomplete="given-name"></label>
      <label>Ton email<input name="email" type="email" autocomplete="email" required></label>
      <label>Mot de passe <small>(8 caractères minimum)</small><input name="mdp" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn btn-ink" type="submit">Créer mon compte</button>
      <p class="form-status" role="status" data-porte-statut></p>
      <p class="annonce-aide" data-seulement-connexion hidden><a class="text-link" href="/mon-espace/">Mot de passe oublié ?</a></p>
    </form>
  </div>`;
  const f = $('[data-porte]', box), st = $('[data-porte-statut]', box);
  let mode = 'creer';
  $$('[data-mode]', box).forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    $$('[data-mode]', box).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('[data-seulement-creer]', f).hidden = mode !== 'creer'; $('[data-seulement-connexion]', f).hidden = mode === 'creer';
    f.mdp.autocomplete = mode === 'creer' ? 'new-password' : 'current-password';
    $('button[type=submit]', f).textContent = mode === 'creer' ? 'Créer mon compte' : 'Me connecter';
    say(st, '');
  }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = f.email.value.trim(), mdp = f.mdp.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say(st, ERR.invalid_email, true);
    if (mdp.length < 8) return say(st, ERR.mot_de_passe, true);
    if (mode === 'creer' && !f.prenom.value.trim()) return say(st, ERR.missing_name, true);
    const btn = $('button[type=submit]', f); btn.disabled = true; say(st, 'Un instant…');
    try {
      let session = null;
      if (mode === 'creer') {
        try { await creerCompte({ email, password: mdp, prenom: f.prenom.value.trim(), source: 'rencontres' }); }
        catch (err) { if (err.code !== 'compte_existe') throw Object.assign(new Error(), { code: ['mot_de_passe', 'trop_de_demandes'].includes(err.code) ? err.code : err.code === 'email_invalide' ? 'invalid_email' : 'compte_impossible' }); }
      }
      if (!session) {
        const co = await supabase.auth.signInWithPassword({ email, password: mdp });
        if (co.error) {
          if (/not confirmed/i.test(co.error.message)) { say(st, 'Ton compte est créé. Clique sur le lien reçu par email pour confirmer ton adresse (regarde aussi les courriers indésirables), puis reviens ici et choisis « J’ai déjà un compte ».'); btn.disabled = false; return; }
          throw Object.assign(new Error(), { code: mode === 'creer' ? 'compte_existant' : 'connexion' });
        }
        session = co.data.session;
      }
      monterFormulaire(box);
    } catch (err) {
      say(st, ERR[err.code] || 'Ça n’a pas fonctionné. Réessaie dans un instant.', true); btn.disabled = false;
      // Compte existant ou mot de passe oublié : un lien de connexion par email, en un clic.
      if (['compte_existant', 'connexion'].includes(err.code)) {
        const lien = document.createElement('button');
        lien.type = 'button'; lien.className = 'btn btn-line'; lien.textContent = '📩 Recevoir un lien de connexion par email';
        st.append(document.createElement('br'), lien);
        lien.addEventListener('click', async () => {
          lien.disabled = true;
          try {
            const r = await api({ action: 'annonce_lien_connexion', email, retour: 'rencontres' });
            say(st, r.existe === false ? 'Aucun compte n’existe avec cet email : choisis « Créer mon compte ».' : '📩 C’est parti ! Ouvre l’email que tu viens de recevoir et clique sur « Me connecter » (regarde aussi les courriers indésirables).', r.existe === false);
          } catch (e2) { say(st, e2.code === 'trop_de_demandes' ? 'Plusieurs liens sont déjà partis : regarde dans tes emails, ou réessaie dans une heure.' : 'L’envoi n’a pas fonctionné. Réessaie dans un instant.', true); lien.disabled = false; }
        });
      }
    }
  });
}

function appliquerInteret(box) {
  const ref = box.dataset.interet, form = box.querySelector('[data-annonce-form]');
  if (!form || !ref) return;
  form.elements.interet_ref.value = ref;
  const info = form.querySelector('[data-interet-info]');
  form.prepend(info);
  info.hidden = false;
  info.textContent = `💌 Le profil n° ${ref} t’intéresse : crée ton profil ci-dessous. Lamia est prévenue et regarde si vous pouvez correspondre. Ton identité reste secrète.`;
}

function monterFormulaireConnecte(box, { existant = null, token = null } = {}) {
  box.innerHTML = formulaireHtml();
  const form = $('[data-annonce-form]', box), st = $('[data-annonce-statut]', form);
  const estLive = () => form.querySelector('[name=live]:checked')?.value === 'oui';
  const sansReseau = () => form.elements.sans_reseau.checked;
  form.elements.sans_reseau.addEventListener('change', () => { $('[data-tel]', form).hidden = !sansReseau(); $('[data-reseau]', form).hidden = sansReseau(); });
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'live') return;
    $('[data-si-live]', form).hidden = !estLive();
    form.classList.toggle('is-live', estLive());
  });
  // Déjà connecté(e) : l'email du compte est repris, pas de mot de passe à donner.
  sessionActive().then((s) => {
    if (!s || existant) return;
    form.elements.email.value = s.user.email; form.elements.email.readOnly = true;
    $('[data-mdp]', form)?.setAttribute('hidden', '');
    const c = $('[data-connecte]', form); c.hidden = false; c.textContent = `Tu es connecté(e) : ton profil sera lié à ton compte ${s.user.email}.`;
  });
  let medias = [], identite = [], envoi = null;
  const majMedias = () => apercu($('[data-medias-liste]', form), medias, (i) => { medias.splice(i, 1); majMedias(); });
  const majId = () => { apercu($('[data-identite-liste]', form), identite, (i) => { identite.splice(i, 1); majId(); }); const acc = $('[data-identite-accord]', form); if (acc) acc.hidden = !identite.length; };
  $('[data-medias]', form).addEventListener('change', async (e) => {
    const choisis = [...e.target.files]; e.target.value = '';
    if (!choisis.length) return;
    say(st, 'Préparation de tes photos…');
    let nouveaux;
    try { nouveaux = await copier(choisis, 1600); } catch { return say(st, 'Cette photo ne peut pas être lue par ton téléphone. Choisis-la à nouveau, ou prends une autre photo.', true); }
    const tous = [...medias, ...nouveaux].filter((f) => !typeDe(f).startsWith('video/'));
    if (tous.length < medias.length + nouveaux.length) say(st, 'Les vidéos ne sont pas acceptées : choisis 2 photos de toi.', true);
    else if (tous.length > 2) say(st, 'Deux photos au maximum : j’ai gardé les deux dernières.');
    else say(st, '');
    medias = tous.slice(-2);
    majMedias();
  });
  $('[data-identite]', form).addEventListener('change', async (e) => {
    const choisis = [...e.target.files].slice(0, 1); e.target.value = '';
    if (!choisis.length) return;
    try { identite = await copier(choisis, 2000); } catch { return say(st, 'Ce document ne peut pas être lu par ton téléphone. Choisis-le à nouveau.', true); }
    majId();
  });
  // Champs qui dépendent d'autres réponses (comme dans l'outil de matching).
  const F = form.elements;
  F.enfants.addEventListener('change', () => $$('[data-si-enfants]', form).forEach((l) => { l.hidden = F.enfants.value !== 'Oui'; }));
  F.niveauEtudeCategorie.addEventListener('change', () => { const d = O.etudeDetail[F.niveauEtudeCategorie.value] || []; F.niveauEtudeDetail.innerHTML = d.length ? opts(d) : '<option value="">Choisis d’abord ton niveau</option>'; });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'genre') {
      const femme = e.target.value === 'femme';
      F.visionFinanciere.innerHTML = opts(femme ? O.visionFemme : O.visionHomme);
      $('[data-hidjab]', form).hidden = femme;
    }
    if (['caracteristiques', 'caracteristiquesRecherche'].includes(e.target.name) && e.target.checked && $$(`[name=${e.target.name}]:checked`, form).length > 6) { e.target.checked = false; say(st, 'Six choix au maximum : garde ceux qui te ressemblent le plus.'); }
  });

  const corrige = (e) => e.target.closest?.('.is-manquant, label')?.classList.remove('is-manquant');
  form.addEventListener('input', corrige); form.addEventListener('change', corrige);
  if (existant) return monterEdition(form, st, existant, token);
  // Tout ce qui manque, d'un coup : la liste exacte, chaque champ entouré, et un clic emmène au champ.
  const calculerManques = () => {
    const f = form.elements;
    const manques = [];
    const manque = (texte, el) => manques.push({ texte, el });
    const live = estLive();
    if (!f.prenom.value.trim()) manque('Ton prénom (ou un petit nom)', f.prenom);
    if (!form.querySelector('[name=genre]:checked')) manque('Femme ou homme', form.querySelector('[name=genre]')?.closest('label'));
    if (!f.birth_date.value) manque('Ta date de naissance', f.birth_date);
    else if (f.birth_date.value > maxNaissance()) manque('Ta date de naissance : il faut avoir 18 ans ou plus', f.birth_date);
    if (!form.querySelector('[name=origineTags]:checked')) manque('Ton origine', form.querySelector('[name=origineTags]')?.closest('.annonce-puces'));
    if (live && !f.tiktok_live.value.trim()) manque('Ton pseudo ou lien TikTok du live', f.tiktok_live);
    if (!live) {
      if (!f.ville.value.trim()) manque('Ta ville', f.ville);
      if (!f.pays.value) manque('Ton pays', f.pays);
      const n1 = f.profil.value.trim().length, n2 = f.recherche.value.trim().length;
      if (n1 < 20) manque(`« Parle-nous de toi » : encore ${20 - n1} caractère${20 - n1 > 1 ? 's' : ''} au moins`, f.profil);
      if (n2 < 20) manque(`« La personne que tu cherches » : encore ${20 - n2} caractère${20 - n2 > 1 ? 's' : ''} au moins`, f.recherche);
      if (medias.length < 2) manque('2 photos de toi', $('[data-medias]', form).closest('label'));
    }
    if (sansReseau()) { if (!telephoneNormal(f.telephone.value)) manque(f.telephone.value.trim() ? 'Ton numéro de téléphone n’est pas valide (mets l’indicatif si tu n’es pas en France)' : 'Ton numéro de téléphone (puisque tu n’as pas de réseau social)', f.telephone); }
    else if (!f.contactReseau.value.trim()) manque('Ton lien TikTok, Instagram ou Facebook (ou coche « Je n’ai aucun profil sur les réseaux »)', f.contactReseau);
    if (!f.majeur.checked) manque('La case « J’ai 18 ans ou plus… »', f.majeur.closest('label'));
    if (!f.publication.checked) manque('La case « Je confie mon profil à Lamia… »', f.publication.closest('label'));
    if (identite.length && !f.identite_ok.checked) manque('La case d’accord pour ta pièce d’identité (ou retire la photo)', f.identite_ok.closest('label'));
    return manques;
  };
  const afficherManques = (manques, ou = st) => {
    $$('.is-manquant', form).forEach((x) => x.classList.remove('is-manquant'));
    $$('[data-manques]', form).forEach((x) => x.remove());
    if (manques.length) {
      say(st, '');
      const liste = document.createElement('div');
      liste.className = 'annonce-manques'; liste.setAttribute('data-manques', ''); liste.setAttribute('role', 'alert');
      liste.innerHTML = `<p><strong>Il manque ${manques.length > 1 ? `${manques.length} informations` : 'une information'} pour envoyer ton profil :</strong></p><ol>${manques.map((m, k) => `<li><button type="button" data-aller="${k}">${esc(m.texte)}</button></li>`).join('')}</ol>`;
      if (ou === st) st.before(liste); else ou.append(liste);
      manques.forEach((m) => (m.el?.closest('label') || m.el)?.classList.add('is-manquant'));
      liste.querySelectorAll('[data-aller]').forEach((b) => b.addEventListener('click', () => { const el = manques[b.dataset.aller].el; etapes?.allerA(el); try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ } el.focus?.(); }));
      try { liste.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ }
      return true;
    }
    return false;
  };
  // Formulaire en étapes, comme une appli : une étape à la fois, barre de progression, brouillon gardé.
  const etapes = monterEtapes(form, { calculerManques, afficherManques });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const live = estLive();
    const manques = calculerManques();
    if (manques.length) { etapes?.allerA(manques[0].el); afficherManques(manques, etapes ? etapes.courante() : st); return; }
    const session = await sessionActive();
    if (!session) { monterFormulaire(box); return; }
    const btn = $('.annonce-envoyer', form); btn.disabled = true;
    const fichiers = [...medias.map((x) => ({ blob: x, role: 'media' })), ...identite.map((x) => ({ blob: x, role: 'identite' }))];
    // Si un premier essai a échoué pendant l'envoi des photos, on reprend le même profil (pas de doublon).
    const cle = fichiers.map((x) => `${x.role}:${x.blob.size}`).join('|');
    if (envoi && envoi.cle !== cle) envoi = null;
    try {
      say(st, 'Envoi de ton annonce…');
      const res = envoi?.res || await api({
        live, tiktok_live: f.tiktok_live.value,
        action: 'annonce_deposer', prenom: f.prenom.value, genre: form.querySelector('[name=genre]:checked').value, birth_date: f.birth_date.value,
        ville: f.ville.value, pays: f.pays.value, profil: f.profil.value, recherche: f.recherche.value,
        matching: lireMatching(form),
        age_min: f.age_min.value, age_max: f.age_max.value, email: session.user.email, sans_reseau: sansReseau(), telephone: sansReseau() ? f.telephone.value : '',
        majeur: true, publication: true, identite_ok: Boolean(identite.length && f.identite_ok.checked), website: f.zz_site.value, anonyme_ok: f.anonyme_ok.checked, photo_partage: f.photo_partage.checked, interet_ref: f.interet_ref.value,
        medias: fichiers.map((x) => ({ role: x.role, type: typeDe(x.blob), size: x.blob.size })),
      }, session?.access_token);
      if (!envoi) envoi = { cle, res, faits: new Set() };
      for (const [i, up] of (res.uploads || []).entries()) {
        if (envoi.faits.has(i)) continue;
        say(st, `Envoi de tes fichiers (${i + 1}/${res.uploads.length})…`);
        let ok = false;
        for (let essai = 0; essai < 3 && !ok; essai++) {
          if (essai) { say(st, `Envoi de tes fichiers (${i + 1}/${res.uploads.length}), nouvel essai…`); await new Promise((r) => setTimeout(r, 1500 * essai)); }
          try {
            const r = await fetch(up.url, { method: 'PUT', headers: { apikey: PUBLIC_KEY, 'Content-Type': up.type, 'x-upsert': 'false' }, body: fichiers[i].blob });
            // 400/409 « existe déjà » : le fichier était arrivé lors d'un essai précédent.
            ok = r.ok || r.status === 409 || (r.status === 400 && /exist|duplicate/i.test(await r.text().catch(() => '')));
          } catch { ok = false; }
        }
        if (!ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
        envoi.faits.add(i);
      }
      const fin = res.annonce_id ? await api({ action: 'annonce_finaliser', annonce_id: res.annonce_id, token: res.token }) : {};
      envoi = null;
      window.lfbEvent?.('annonce_deposee');
      try { localStorage.removeItem(BROUILLON); } catch { /* */ }
      box.innerHTML = `<div class="annonce-merci"><p class="annonce-coeur" aria-hidden="true">💌</p><h3>Merci ${esc(f.prenom.value.trim())}, ton profil est bien arrivé chez Lamia${fin.ref ? ` (n° ${fin.ref})` : ''} !</h3><p>Il n’est publié nulle part. Lamia le vérifie, puis le passe dans son outil de matching. Tu recevras par email le nombre de personnes avec qui tu pourrais correspondre. ${live ? 'Tes 3 premières mises en relation sont offertes.' : 'Ta première mise en relation est offerte.'}</p><p>Ton profil est lié à ton compte : tu peux le modifier quand tu veux dans <a href="/mon-espace/">Mon espace</a>.</p><p>En attendant, tu peux <a href="/speed-dating/">t’inscrire à la prochaine soirée</a> ou <a href="/confidences/">écrire à Lamia</a>.</p></div>`;
    } catch (err) {
      btn.disabled = false;
      say(st, ERR[err.code] || (err.code && !/^http_/.test(err.code) ? `L’envoi n’a pas abouti (${err.code}). Réessaie, ou écris à Lamia en lui donnant ce code.` : 'L’envoi n’a pas abouti : la connexion a coupé ou le serveur n’a pas répondu. Réessaie dans un instant ; si ça recommence, écris à Lamia.'), true);
    }
  });
}

const CHAMPS = ['villageOrigine', 'langue', 'situation', 'enfants', 'nbEnfants', 'ageEnfants', 'desirEnfants', 'niveauEtudeCategorie', 'niveauEtudeDetail', 'etudesPaysObtention', 'profession', 'tailleCm', 'religion', 'pratique', 'mobiliteGeographique', 'visionFinanciere', 'fumeur', 'sport', 'alcool', 'chemma', 'religionTexte', 'autresModeVie', 'zoneGeo', 'religionRecherche', 'pratiqueRecherche', 'etudesRecherche', 'rechercheFemmeHidjabiste', 'contactReseau'];
const LISTES = ['origineTags', 'caracteristiques', 'origineRechercheTags', 'caracteristiquesRecherche'];
const CASES = ['kabyleUniquement', 'accepteDivorce', 'accepteVeuf', 'accepteEnfants'];
function lireMatching(form) {
  const f = form.elements, m = {};
  for (const n of CHAMPS) m[n] = f[n]?.value || '';
  for (const n of LISTES) m[n] = $$(`[name=${n}]:checked`, form).map((x) => x.value);
  for (const n of CASES) m[n] = f[n].checked;
  return m;
}

// « Mon espace » : le même formulaire, prérempli, pour modifier son profil.
function monterEdition(form, st, p, token) {
  const F = form.elements;
  for (const sel of ['[data-bloc-live]', '[data-etape-medias]', '.annonce-id', '[data-compte-email]', '[data-mdp]', '[data-consent-depot]', '[data-identite-accord]']) $$(sel, form).forEach((el) => { el.hidden = true; });
  const poser = (n, v) => { const el = F[n]; if (!el || v === undefined || v === null) return; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  poser('prenom', p.prenom); poser('ville', p.ville); poser('pays', p.pays); poser('profil', p.profil); poser('recherche', p.recherche);
  poser('age_min', p.age_min ?? ''); poser('age_max', p.age_max ?? '');
  const g = form.querySelector(`[name=genre][value="${p.genre}"]`); if (g) { g.checked = true; g.dispatchEvent(new Event('change', { bubbles: true })); }
  $$('[name=genre]', form).forEach((x) => { x.disabled = true; });
  F.birth_date.value = p.birth_date || ''; F.birth_date.disabled = true;
  const m = p.matching || {};
  poser('niveauEtudeCategorie', m.niveauEtudeCategorie);
  for (const n of CHAMPS) if (n !== 'niveauEtudeCategorie') poser(n, m[n]);
  for (const n of LISTES) for (const v of m[n] || []) { const c = form.querySelector(`[name=${n}][value="${CSS.escape(v)}"]`); if (c) c.checked = true; }
  for (const n of CASES) F[n].checked = Boolean(m[n]);
  F.anonyme_ok.checked = Boolean(p.anonyme_ok);
  if (p.sans_reseau) { F.sans_reseau.checked = true; F.telephone.value = p.telephone || ''; F.sans_reseau.dispatchEvent(new Event('change')); }
  F.photo_partage.checked = Boolean(p.photo_partage);
  const btn = $('.annonce-envoyer', form); btn.textContent = 'Enregistrer mes modifications';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (F.profil.value.trim().length < 20 || F.recherche.value.trim().length < 20) return say(st, ERR.textes_courts, true);
    if (!form.querySelector('[name=origineTags]:checked')) { form.querySelector('#ton-origine')?.scrollIntoView({ block: 'center' }); return say(st, ERR.origine_requise, true); }
    if (F.sans_reseau.checked ? !telephoneNormal(F.telephone.value) : !F.contactReseau.value.trim()) return say(st, F.sans_reseau.checked ? ERR.telephone_invalide : ERR.contact_requis, true);
    btn.disabled = true; say(st, 'Enregistrement…');
    try {
      await api({ action: 'annonce_modifier', prenom: F.prenom.value, ville: F.ville.value, pays: F.pays.value, profil: F.profil.value, recherche: F.recherche.value, age_min: F.age_min.value, age_max: F.age_max.value, anonyme_ok: F.anonyme_ok.checked, photo_partage: F.photo_partage.checked, sans_reseau: F.sans_reseau.checked, telephone: F.sans_reseau.checked ? F.telephone.value : '', matching: lireMatching(form) }, token);
      say(st, '✓ Ton profil est à jour. Lamia est prévenue.');
    } catch (err) { say(st, ERR[err.code] || 'L’enregistrement n’a pas abouti. Réessaie dans un instant.', true); }
    btn.disabled = false;
  });
}

// « Ce profil m'intéresse » : si la personne a déjà un profil, la demande part directement.
async function interesse(ref) {
  const s = await sessionActive();
  if (s) {
    try {
      await api({ action: 'annonce_interet', ref }, s.access_token);
      montrerMessage(`💌 C’est noté : Lamia sait que le profil n° ${ref} t’intéresse. Elle regarde si vous pouvez correspondre. Ton identité reste secrète : seul ton numéro de profil peut apparaître.`);
      window.lfbEvent?.('interet_profil');
      return;
    } catch (err) {
      if (err.code === 'en_match') return montrerMessage(ERR.en_match, true);
      if (err.code === 'limite_matchs') return montrerMessage(ERR.limite_matchs, true);
      if (err.code === 'quota_matchs') return montrerMessage(ERR.quota_matchs, true);
      if (err.code !== 'pas_de_profil') return montrerMessage('La demande n’a pas pu partir. Réessaie dans un instant.', true);
    }
  }
  ouvrirFormulaire(ref);
}
function montrerMessage(texte, erreurMsg = false) {
  let m = document.querySelector('[data-message-interet]');
  if (!m) { m = document.createElement('div'); m.className = 'annonce-flash'; m.setAttribute('data-message-interet', ''); m.setAttribute('role', 'status'); document.body.appendChild(m); }
  m.textContent = texte; m.classList.toggle('is-error', erreurMsg); m.hidden = false;
  clearTimeout(montrerMessage.t); montrerMessage.t = setTimeout(() => { m.hidden = true; }, 7000);
}

function carte(a) {
  const ages = a.age_min || a.age_max ? ` · ${a.age_min || 18} à ${a.age_max || 99} ans` : '';
  const tags = a.caracteristiques || [];
  const infos = [a.genre === 'femme' ? 'Une femme' : 'Un homme', `${a.age} ans`, lib(a.pays), a.situation && lib(a.situation), a.enfants === 'Oui' ? 'avec enfant(s)' : a.enfants === 'Non' ? 'sans enfant' : '', a.etudes && `études : ${lib(a.etudes).toLowerCase()}`].filter(Boolean);
  return `<article class="annonce-carte annonce-anonyme">
    <div class="annonce-sceau" aria-hidden="true"><img src="/images/outil/${a.genre === 'femme' ? 'avatar-femme' : 'avatar-homme'}.webp" alt="" width="80" height="80"></div>
    <div class="annonce-texte">
      <p class="annonce-ref${a.piece_identite ? ' is-piece' : ''}">Profil n° ${a.ref} · ${a.piece_identite ? '✓ vérifié par Lamia' : a.outil ? (a.confirme ? '✓ vérifié par Lamia · ✅ confirmé' : '✓ vérifié par Lamia · ⏳ en attente de confirmation') : '✓ profil vérifié'}</p>
      ${badgesProfil(a)}
      <h3>${esc(infos.slice(0, 2).join(', '))}</h3>
      <p class="annonce-lieu"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lieu"/></svg>${esc([a.ville, ...infos.slice(2)].filter(Boolean).join(' · '))}</p>
      ${origineLisible(a.origine) ? `<p class="annonce-origine">Origine : <b>${esc(origineLisible(a.origine))}</b></p>` : ''}
      ${a.village ? `<p class="annonce-lieu"><svg class="ico" aria-hidden="true"><use href="/icones.svg#maison"/></svg> Originaire de ${esc(a.village)}</p>` : ''}
      ${secteurLisible(a.secteur) ? `<p class="annonce-lieu annonce-secteur"><svg class="ico" aria-hidden="true"><use href="/icones.svg#boussole"/></svg> Cherche en : <b>${esc(secteurLisible(a.secteur))}</b></p>` : ''}
      ${tags.length ? `<p class="annonce-tags">${tags.map((t) => `<span>${esc(lib(t))}</span>`).join('')}</p>` : ''}
      <h4>Qui je suis</h4><p>${esc(a.profil)}</p>
      <h4>Qui je cherche${ages}</h4><p>${esc(a.recherche)}</p>
      ${foiEtVie(a)}
      <button type="button" class="btn btn-ink" data-interet="${a.ref}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#coeur"/></svg> Ce profil m’intéresse</button><span class="profil-moderer"><button type="button" class="link-button" data-liste-bloquer="${a.ref}">🚩 Bloquer et signaler</button></span>
    </div>
  </article>`;
}

export { monterEdition };
export async function monterListe(box) {
  if (!box) return;
  try {
    const { annonces } = await api({ action: 'annonces_publiques' });
    if (!annonces.length) { box.innerHTML = '<p class="annonce-vide">Les premiers profils anonymes arrivent très bientôt. Et si le premier, c’était le tien ?</p>'; return; }
    // Deux catégories séparées, comme dans l'outil : les femmes, les hommes.
    const groupes = { femme: annonces.filter((a) => a.genre === 'femme'), homme: annonces.filter((a) => a.genre === 'homme') };
    const onglets = document.createElement('div');
    onglets.className = 'annonce-onglets'; onglets.setAttribute('role', 'tablist'); onglets.setAttribute('aria-label', 'Catégories de profils');
    onglets.innerHTML = [['femme', '👩 Les femmes'], ['homme', '👨 Les hommes']].map(([g, t]) => `<button type="button" role="tab" data-genre="${g}">${t} <b>${groupes[g].length}</b></button>`).join('');
    box.before(onglets);
    // 20 profils par page.
    const limite = Number(box.dataset.limite) || 0;
    const PAR_PAGE = limite || 20;
    const pages = document.createElement('nav');
    pages.className = 'annonce-pages'; pages.setAttribute('aria-label', 'Pages de profils');
    box.after(pages);
    let genre = 'femme';
    const montrer = (g, page = 1, defiler = false) => {
      genre = g;
      onglets.querySelectorAll('[data-genre]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.genre === g)));
      const liste = groupes[g], n = Math.ceil(liste.length / PAR_PAGE);
      box.innerHTML = liste.length ? liste.slice((page - 1) * PAR_PAGE, page * PAR_PAGE).map(carte).join('') : `<p class="annonce-vide">Pas encore de profil dans cette catégorie. Et si le premier, c’était le tien ?</p>`;
      pages.innerHTML = n > 1 && !limite ? [
        `<button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Page précédente">‹</button>`,
        ...Array.from({ length: n }, (_, i) => `<button type="button" data-page="${i + 1}" ${i + 1 === page ? 'aria-current="page"' : ''}>${i + 1}</button>`),
        `<button type="button" data-page="${page + 1}" ${page === n ? 'disabled' : ''} aria-label="Page suivante">›</button>`,
      ].join('') : '';
      if (defiler) onglets.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    pages.addEventListener('click', (e) => { const x = e.target.closest('[data-page]'); if (x && !x.disabled) montrer(genre, Number(x.dataset.page), true); });
    onglets.addEventListener('click', (e) => { const x = e.target.closest('[data-genre]'); if (x) montrer(x.dataset.genre); });
    montrer(groupes.femme.length || !groupes.homme.length ? 'femme' : 'homme');
  } catch { box.innerHTML = '<p class="annonce-vide">Les annonces n’ont pas pu s’afficher. Recharge la page dans un instant.</p>'; }
}

// Lien « Retirer mon annonce » reçu par email.
export async function retraitDepuisLien() {
  const v = new URLSearchParams(location.search).get('retirer');
  if (!v) return;
  const [id, token] = v.split('.');
  const zone = document.querySelector('[data-annonce-retrait]');
  if (!zone) return;
  zone.hidden = false;
  zone.innerHTML = '<p>Tu veux retirer ton profil ? Tes textes, tes photos et ta vidéo seront effacés.</p><p><button type="button" class="btn btn-ink" data-retirer-ok>Oui, retirer mon profil</button></p><p class="form-status" data-retrait-statut></p>';
  zone.querySelector('[data-retirer-ok]').addEventListener('click', async () => {
    try { await api({ action: 'annonce_retirer', annonce_id: id, token }); zone.innerHTML = '<p>C’est fait : ton profil est retiré et tes photos sont effacées. Lamia te souhaite le meilleur 💛</p>'; }
    catch { say(zone.querySelector('[data-retrait-statut]'), 'Ce lien ne fonctionne pas. Écris à Lamia dans les Confidences, elle retirera ton annonce.', true); }
  });
}

// Montage automatique sur les pages qui ont les emplacements (Patio).
retraitDepuisLien();
function ouvrirFormulaire(ref) {
  const box = document.querySelector('[data-annonce-box]');
  if (!box) return;
  if (ref) { box.dataset.interet = ref; window.lfbEvent?.('interet_profil'); }
  if (!box.dataset.monte || ref) { monterFormulaire(box); box.dataset.monte = '1'; }
  box.hidden = false;
  document.querySelector('.patio-etapes')?.setAttribute('hidden', '');
  document.querySelectorAll('[data-annonce-ouvrir]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelectorAll('[data-annonce-ouvrir]').forEach((b) => b.addEventListener('click', () => ouvrirFormulaire()));
document.addEventListener('click', (e) => { const b = e.target.closest('[data-interet]'); if (b) interesse(b.dataset.interet); });
// Bloquer ou signaler un profil depuis la liste (il faut être connecté).
document.addEventListener('click', async (e) => {
  const bouton = e.target.closest('[data-liste-bloquer]');
  if (!bouton) return;
  const s = await sessionActive();
  if (!s) return alert('Connecte-toi pour bloquer et signaler un profil.');
  const ref = bouton.dataset.listeBloquer;
  const motif = prompt(`Bloquer et signaler le profil n° ${ref} ? Vous ne vous verrez plus et Lamia est prévenue. La personne n’est pas avertie.\n\nQue s’est-il passé ? (facultatif)`);
  if (motif === null) return;
  try {
    await api({ action: 'annonce_bloquer_signaler', ref, motif }, s.access_token);
    bouton.closest('.annonce-carte')?.remove();
    alert('C’est fait. Lamia est prévenue.');
  } catch { alert('Ça n’a pas abouti. Réessaie dans un instant.'); }
});
const liste = document.querySelector('[data-annonces-liste]');
if (liste) monterListe(liste);
// « Confier mon profil » (bouton du haut, liens #confier) : le formulaire s'ouvre directement.
const viaAncre = () => { if (location.hash === '#confier' && document.querySelector('[data-annonce-box]')) ouvrirFormulaire(); };
viaAncre();
addEventListener('hashchange', viaAncre);


// ---------------------------------------------------------------- formulaire en étapes (création de profil)
const BROUILLON = 'lfb-brouillon-profil';
function monterEtapes(form, { calculerManques, afficherManques }) {
  // La fin du formulaire (accords + bouton d'envoi) devient la dernière étape.
  const enfants = [...form.children];
  const derniere = enfants.filter((x) => x.classList.contains('annonce-etape')).pop();
  if (!derniere) return null;
  const fin = document.createElement('div');
  fin.className = 'annonce-etape annonce-etape-fin';
  fin.innerHTML = '<h3><span>✓</span> Tes accords, et c’est parti</h3>';
  enfants.slice(enfants.indexOf(derniere) + 1).forEach((x) => { if (!x.matches('[data-interet-info]')) fin.append(x); });
  form.append(fin);
  const toutes = () => $$(':scope > .annonce-etape', form).filter((x) => !x.hidden);
  const progres = document.createElement('div');
  progres.className = 'annonce-progres';
  progres.innerHTML = '<div class="annonce-progres-barre"><span></span></div><p></p>';
  form.prepend(progres);
  const nav = document.createElement('div');
  nav.className = 'annonce-nav';
  nav.innerHTML = '<button type="button" class="btn btn-line" data-etape-prec>← Retour</button><button type="button" class="btn btn-ink" data-etape-suiv>Continuer →</button>';
  form.append(nav);
  let i = 0;
  const montrer = (n, defiler = true) => {
    const l = toutes(); i = Math.max(0, Math.min(n, l.length - 1));
    l.forEach((x, k) => x.classList.toggle('etape-off', k !== i));
    l.forEach((x, k) => { const n = x.querySelector(':scope > h3 > span'); if (n && !x.classList.contains('annonce-etape-fin')) n.textContent = String(k + 1); });
    $('span', progres).style.width = `${Math.round(((i + 1) / l.length) * 100)}%`;
    $('p', progres).textContent = `Étape ${i + 1} sur ${l.length}`;
    $('[data-etape-prec]', nav).hidden = i === 0;
    $('[data-etape-suiv]', nav).hidden = i === l.length - 1;
    sauver();
    if (defiler) try { progres.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* */ }
  };
  $('[data-etape-prec]', nav).addEventListener('click', () => montrer(i - 1));
  $('[data-etape-suiv]', nav).addEventListener('click', () => {
    const cur = toutes()[i];
    const m = calculerManques().filter((x) => x.el && cur.contains(x.el));
    if (afficherManques(m, cur)) return;
    montrer(i + 1);
  });
  // Brouillon : tout ce qui est écrit est gardé sur ce téléphone (sauf les fichiers), pour reprendre plus tard.
  const sauver = () => {
    try {
      const v = { _etape: i };
      for (const el of form.elements) {
        if (!el.name || ['file', 'hidden', 'password'].includes(el.type) || el.name === 'email' || el.name === 'zz_site') continue;
        if (el.type === 'checkbox') { if (el.checked) (v[el.name] ||= []).push(el.value); }
        else if (el.type === 'radio') { if (el.checked) v[el.name] = el.value; }
        else if (el.value) v[el.name] = el.value;
      }
      localStorage.setItem(BROUILLON, JSON.stringify(v));
    } catch { /* stockage indisponible */ }
  };
  let brouillon = null;
  try { brouillon = JSON.parse(localStorage.getItem(BROUILLON) || 'null'); } catch { /* */ }
  if (brouillon) {
    const remplir = () => {
      for (const el of form.elements) {
        if (!el.name || !(el.name in brouillon) || ['file', 'hidden', 'password'].includes(el.type) || el.name === 'email') continue;
        const val = brouillon[el.name];
        if (el.type === 'checkbox') el.checked = Array.isArray(val) && val.includes(el.value);
        else if (el.type === 'radio') el.checked = el.value === val;
        else el.value = val;
      }
    };
    remplir();
    for (const n of ['live', 'genre', 'enfants', 'niveauEtudeCategorie', 'sans_reseau']) form.querySelector(`[name=${n}]:checked, select[name=${n}], [name=${n}][type=checkbox]`)?.dispatchEvent(new Event('change', { bubbles: true }));
    remplir(); // les listes qui dépendent d'une autre réponse (diplôme, vision du couple) sont remplies maintenant
    const note = document.createElement('p');
    note.className = 'annonce-aide annonce-reprise';
    note.innerHTML = '📝 On a gardé ce que tu avais commencé. <button type="button" class="link-button">Tout effacer</button>';
    $('button', note).addEventListener('click', () => { try { localStorage.removeItem(BROUILLON); } catch { /* */ } location.reload(); });
    progres.after(note);
  }
  form.addEventListener('input', sauver); form.addEventListener('change', sauver);
  montrer(brouillon?._etape || 0, false);
  return {
    courante: () => toutes()[i],
    allerA: (el) => { const k = toutes().findIndex((x) => x.contains(el)); if (k >= 0 && k !== i) montrer(k, false); },
  };
}

// Ajouter ses photos (espace membre, fiche du live) : 2 photos de soi. Elles restent privées.
export async function monterAjoutMedias(box, { token, deja = 0, apres = () => {} }) {
  const manque = Math.max(1, 2 - deja);
  box.innerHTML = `<label class="annonce-depot">＋ ${deja ? 'Ajouter ma 2e photo' : 'Choisir mes 2 photos'}<input type="file" accept="image/*" multiple data-ajout-medias></label>
    <ul class="annonce-apercu" data-ajout-liste></ul>
    <button type="button" class="po-btn" data-ajout-envoyer disabled>Envoyer</button>
    <p class="form-status" role="status" data-ajout-statut></p>`;
  const st = $('[data-ajout-statut]', box), bouton = $('[data-ajout-envoyer]', box);
  let choix = [];
  const pret = () => choix.length >= manque;
  const maj = () => { apercu($('[data-ajout-liste]', box), choix, (i) => { choix.splice(i, 1); maj(); }); bouton.disabled = !pret(); };
  $('[data-ajout-medias]', box).addEventListener('change', async (e) => {
    const l = [...e.target.files]; e.target.value = '';
    if (!l.length) return;
    say(st, 'Préparation…');
    let nouveaux;
    try { nouveaux = await copier(l, 1600); } catch { return say(st, 'Ce fichier ne peut pas être lu par ton téléphone. Choisis-en un autre.', true); }
    const tous = [...choix, ...nouveaux], photos = tous.filter((f) => !typeDe(f).startsWith('video/'));
    choix = photos.slice(-manque);
    say(st, photos.length < tous.length ? 'Les vidéos ne sont pas acceptées : choisis des photos de toi.' : '', photos.length < tous.length); maj();
  });
  bouton.addEventListener('click', async () => {
    bouton.disabled = true; say(st, 'Envoi en cours…');
    try {
      const r = await api({ action: 'annonce_ajouter_medias', medias: choix.map((f) => ({ role: 'media', type: typeDe(f), size: f.size })) }, token);
      for (const [i, up] of (r.uploads || []).entries()) {
        const u = await fetch(up.url, { method: 'PUT', headers: { apikey: PUBLIC_KEY, 'Content-Type': up.type, 'x-upsert': 'false' }, body: choix[i] });
        if (!u.ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
      }
      const v = await api({ action: 'annonce_medias_verifier' }, token);
      if (!v.medias_ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
      say(st, '✓ Merci, c’est bon !'); apres();
    } catch (e) { say(st, ERR[e.code] || 'L’envoi n’a pas abouti. Vérifie ta connexion et réessaie.', true); bouton.disabled = !pret(); }
  });
}
