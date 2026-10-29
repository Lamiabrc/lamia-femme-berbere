// Annonces de rencontre : dépôt (Patio et Confidences) et affichage des annonces vérifiées par Lamia.
import { api, esc, PUBLIC_KEY } from './confidences-commun.js';
import { O, lib } from './matching-options.mjs';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const say = (el, m, err = false) => { if (!el) return; el.textContent = m; el.classList.toggle('is-error', err); };
const ERR = {
  consent_required: 'Coche les trois cases en bas du formulaire pour continuer.',
  missing_name: 'Indique ton prénom (ou un petit nom).',
  missing_genre: 'Dis-nous si tu es une femme ou un homme.',
  invalid_birth_date: 'Vérifie ta date de naissance.',
  mineur: 'Les annonces sont réservées aux personnes majeures (18 ans et plus).',
  missing_lieu: 'Indique ta ville et ton pays.',
  invalid_email: 'Vérifie ton adresse email : Lamia en a besoin pour te répondre.',
  textes_courts: 'Raconte-toi un peu plus : au moins quelques phrases pour ton profil et pour la personne que tu cherches.',
  medias_requis: 'Ajoute une ou deux photos de toi, ou une courte vidéo.',
  medias_trop: 'Deux photos au maximum, ou une seule vidéo (pas les deux).',
  identite_requise: 'Ajoute la photo de ta pièce d’identité, le numéro caché par ta main.',
  file_type: 'Ce type de fichier n’est pas accepté : photos (JPG, PNG, HEIC), vidéo (MP4, MOV) ou PDF pour la pièce d’identité.',
  file_size: 'Un fichier est trop lourd : 12 Mo par photo, 50 Mo pour la vidéo.',
  rate_limited: 'Tu as déjà déposé plusieurs annonces aujourd’hui : réessaie demain.',
  upload_failed: 'Les photos ne sont pas toutes arrivées. Vérifie ta connexion et réessaie.',
  contact_requis: 'Indique le lien de ton TikTok, Instagram ou Facebook : Lamia en a besoin pour la mise en relation.',
};
const opts = (list, vide = 'Choisis…') => `<option value="">${vide}</option>${list.map((v) => `<option value="${esc(v)}">${esc(lib(v))}</option>`).join('')}`;
const puces = (name, list) => `<div class="annonce-puces">${list.map((v) => `<label><input type="checkbox" name="${name}" value="${esc(v)}"><span>${esc(lib(v))}</span></label>`).join('')}</div>`;
const PAR_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf' };
const typeDe = (f) => (f.type && f.type !== 'application/octet-stream' ? f.type : PAR_EXT[String(f.name || '').split('.').pop().toLowerCase()] || 'application/octet-stream');
const maxNaissance = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };

export function formulaireHtml() {
  return `<form class="annonce-form" data-annonce-form novalidate>
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
      <label>Les langues que tu parles<input name="langue" maxlength="80" placeholder="Kabyle, français…"></label>
    </div>
    <p class="annonce-sous">Tes origines</p>${puces('origineTags', O.origine)}
  </div>
  <div class="annonce-etape">
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
      <label>Bouger pour l’amour ?<select name="mobiliteGeographique">${opts(O.mobilite)}</select></label>
      <label data-vision>Le travail dans le couple<select name="visionFinanciere"><option value="">Choisis d’abord femme ou homme</option></select></label>
      <label>Tabac<select name="fumeur">${opts(O.fumeur)}</select></label>
      <label>Sport<select name="sport">${opts(O.sport)}</select></label>
      <label>Alcool<select name="alcool">${opts(O.alcool)}</select></label>
    </div>
    <p class="annonce-sous">Ce qui te ressemble <small>(jusqu’à 6)</small></p>${puces('caracteristiques', O.caracteristiques)}
    <label>Parle-nous de toi avec ton cœur <small>(ton caractère, tes valeurs, ce que tu aimes)</small><textarea name="profil" rows="5" maxlength="1500" placeholder="Écris comme si tu te présentais à une amie de Lamia."></textarea></label>
  </div>
  <div class="annonce-etape">
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
  <div class="annonce-etape">
    <h3><span>4</span> Tes photos ou ta vidéo</h3>
    <p class="annonce-aide">Une ou deux photos récentes de toi, ou une courte vidéo de présentation (une minute suffit). Souris, sois toi-même : c’est ce qui touche le plus.</p>
    <label class="annonce-depot">＋ Ajouter mes photos ou ma vidéo<input type="file" accept="image/*,video/*" multiple data-medias></label>
    <ul class="annonce-apercu" data-medias-liste></ul>
  </div>
  <div class="annonce-etape annonce-id">
    <h3><span>5</span> Ta pièce d’identité, pour la confiance de toutes et tous</h3>
    <p class="annonce-aide">Prends en photo ta carte d’identité, ton passeport ou ton titre de séjour, <strong>en posant ta main (ou un doigt) sur le numéro du document</strong> pour le cacher. Lamia vérifie seulement que la personne de l’annonce existe vraiment et qu’elle est majeure.</p>
    <p class="annonce-aide">🔒 Cette photo n’est <strong>jamais publiée</strong>. Seule Lamia la voit, et elle est <strong>supprimée dès la vérification faite</strong>.</p>
    <label class="annonce-depot">＋ Ajouter la photo de ma pièce d’identité<input type="file" accept="image/*,.pdf,application/pdf" data-identite></label>
    <ul class="annonce-apercu" data-identite-liste></ul>
  </div>
  <div class="annonce-etape">
    <h3><span>6</span> Pour que Lamia te réponde</h3>
    <div class="annonce-grille">
      <label>Ton email<input name="email" type="email" autocomplete="email" required></label>
      <label>Ton lien TikTok, Instagram ou Facebook <small>(obligatoire)</small><input name="contactReseau" maxlength="200" placeholder="https://www.tiktok.com/@tonpseudo" required></label>
      <label>Ton téléphone <small>(facultatif)</small><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
    </div>
    <p class="annonce-aide">Le lien vers ton réseau social est obligatoire : c’est par là que Lamia te contactera pour une mise en relation. Il n’est jamais affiché.</p>
    <p class="annonce-aide">Tes coordonnées ne sont jamais affichées ni transmises : c’est Lamia qui te contacte pour une mise en relation.</p>
  </div>
  <label class="annonce-case"><input type="checkbox" name="majeur"> <span>J’ai 18 ans ou plus et cette annonce est sincère : je cherche une vraie rencontre.</span></label>
  <label class="annonce-case"><input type="checkbox" name="publication"> <span>Je confie mon profil à Lamia : il n’est publié nulle part, seule Lamia le voit et l’utilise dans son outil de matching pour me proposer des mises en relation. Je peux le retirer et faire effacer mes données à tout moment.</span></label>
  <label class="annonce-case"><input type="checkbox" name="identite_ok"> <span>J’accepte que Lamia voie la photo de ma pièce d’identité pour vérifier mon profil, sachant qu’elle est supprimée juste après. <a href="/confidentialite/" target="_blank" rel="noopener">Confidentialité</a></span></label>
  <label class="annonce-case"><input type="checkbox" name="anonyme_ok"> <span>Facultatif : j’accepte que Lamia affiche mon profil <strong>anonymement</strong> dans le Patio (âge, pays, textes et caractéristiques, <strong>sans prénom, photo, ville ni contact</strong>), pour que d’autres puissent dire qu’il les intéresse.</span></label>
  <input type="hidden" name="interet_ref" value="">
  <p class="annonce-interet" data-interet-info hidden></p>
  <input class="hp" name="zz_site" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button class="btn btn-ink annonce-envoyer" type="submit">💌 Confier mon profil à Lamia</button>
  <p class="form-status" role="status" data-annonce-statut></p>
</form>`;
}

function apercu(ul, fichiers, retirer) {
  ul.innerHTML = fichiers.map((f, i) => `<li>${f.type.startsWith('image/') && !/heic|heif/.test(f.type) ? `<img src="${URL.createObjectURL(f)}" alt="">` : f.type.startsWith('video/') ? '<span class="annonce-ico">🎬</span>' : '<span class="annonce-ico">📄</span>'}<small>${esc(f.name || 'fichier')}</small><button type="button" data-i="${i}" aria-label="Retirer ce fichier">✕</button></li>`).join('');
  $$('button', ul).forEach((b) => b.addEventListener('click', () => retirer(Number(b.dataset.i))));
}

export function monterFormulaire(box) {
  if (!box) return;
  box.innerHTML = formulaireHtml();
  const form = $('[data-annonce-form]', box), st = $('[data-annonce-statut]', form);
  let medias = [], identite = [];
  const majMedias = () => apercu($('[data-medias-liste]', form), medias, (i) => { medias.splice(i, 1); majMedias(); });
  const majId = () => apercu($('[data-identite-liste]', form), identite, (i) => { identite.splice(i, 1); majId(); });
  $('[data-medias]', form).addEventListener('change', (e) => {
    const nouveaux = [...e.target.files]; e.target.value = '';
    const tous = [...medias, ...nouveaux];
    const videos = tous.filter((f) => typeDe(f).startsWith('video/'));
    medias = videos.length ? [videos[videos.length - 1]] : tous.slice(-2);
    if (videos.length && tous.length > 1) say(st, 'Une vidéo seule, ou deux photos : j’ai gardé ta vidéo.');
    else if (tous.length > 2) say(st, 'Deux photos au maximum : j’ai gardé les deux dernières.');
    else say(st, '');
    majMedias();
  });
  $('[data-identite]', form).addEventListener('change', (e) => { identite = [...e.target.files].slice(0, 1); e.target.value = ''; majId(); });
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const montre = (el) => { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ } el.focus?.(); };
    const stop = (code, el) => { say(st, ERR[code] || code, true); if (el) montre(el); };
    if (!f.prenom.value.trim()) return stop('missing_name', f.prenom);
    if (!form.querySelector('[name=genre]:checked')) return stop('missing_genre', form.querySelector('[name=genre]'));
    if (!f.birth_date.value) return stop('invalid_birth_date', f.birth_date);
    if (f.birth_date.value > maxNaissance()) return stop('mineur', f.birth_date);
    if (!f.ville.value.trim() || !f.pays.value) return stop('missing_lieu', f.ville.value.trim() ? f.pays : f.ville);
    if (f.profil.value.trim().length < 20) return stop('textes_courts', f.profil);
    if (f.recherche.value.trim().length < 20) return stop('textes_courts', f.recherche);
    if (!medias.length) return stop('medias_requis', $('[data-medias]', form).closest('label'));
    if (!identite.length) return stop('identite_requise', $('[data-identite]', form).closest('label'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) return stop('invalid_email', f.email);
    if (!f.contactReseau.value.trim()) return stop('contact_requis', f.contactReseau);
    if (!f.majeur.checked || !f.publication.checked || !f.identite_ok.checked) return stop('consent_required', f.majeur.closest('label'));
    const btn = $('.annonce-envoyer', form); btn.disabled = true;
    const fichiers = [...medias.map((x) => ({ blob: x, role: 'media' })), ...identite.map((x) => ({ blob: x, role: 'identite' }))];
    try {
      say(st, 'Envoi de ton annonce…');
      const res = await api({
        action: 'annonce_deposer', prenom: f.prenom.value, genre: form.querySelector('[name=genre]:checked').value, birth_date: f.birth_date.value,
        ville: f.ville.value, pays: f.pays.value, profil: f.profil.value, recherche: f.recherche.value,
        matching: (() => {
          const m = {};
          for (const n of ['villageOrigine', 'langue', 'situation', 'enfants', 'nbEnfants', 'ageEnfants', 'desirEnfants', 'niveauEtudeCategorie', 'niveauEtudeDetail', 'etudesPaysObtention', 'profession', 'tailleCm', 'religion', 'pratique', 'mobiliteGeographique', 'visionFinanciere', 'fumeur', 'sport', 'alcool', 'zoneGeo', 'religionRecherche', 'pratiqueRecherche', 'etudesRecherche', 'rechercheFemmeHidjabiste', 'contactReseau']) m[n] = f[n]?.value || '';
          for (const n of ['origineTags', 'caracteristiques', 'origineRechercheTags', 'caracteristiquesRecherche']) m[n] = $$(`[name=${n}]:checked`, form).map((x) => x.value);
          for (const n of ['kabyleUniquement', 'accepteDivorce', 'accepteVeuf', 'accepteEnfants']) m[n] = f[n].checked;
          return m;
        })(),
        age_min: f.age_min.value, age_max: f.age_max.value, email: f.email.value.trim(), phone: f.phone.value,
        majeur: true, publication: true, identite_ok: true, website: f.zz_site.value, anonyme_ok: f.anonyme_ok.checked, interet_ref: f.interet_ref.value,
        medias: fichiers.map((x) => ({ role: x.role, type: typeDe(x.blob), size: x.blob.size })),
      });
      for (const [i, up] of (res.uploads || []).entries()) {
        say(st, `Envoi de tes fichiers (${i + 1}/${res.uploads.length})…`);
        const r = await fetch(up.url, { method: 'PUT', headers: { apikey: PUBLIC_KEY, 'Content-Type': up.type, 'x-upsert': 'false' }, body: fichiers[i].blob });
        if (!r.ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
      }
      const fin = res.annonce_id ? await api({ action: 'annonce_finaliser', annonce_id: res.annonce_id, token: res.token }) : {};
      window.lfbEvent?.('annonce_deposee');
      box.innerHTML = `<div class="annonce-merci"><p class="annonce-coeur" aria-hidden="true">💌</p><h3>Merci ${esc(f.prenom.value.trim())}, ton profil est bien arrivé chez Lamia${fin.ref ? ` (n° ${fin.ref})` : ''} !</h3><p>Il n’est publié nulle part. Lamia vérifie ton identité, puis passe ton profil dans son outil de matching. Tu recevras par email le nombre de personnes avec qui tu pourrais correspondre, et tu pourras lui écrire pour les découvrir. Ta première mise en relation est offerte.</p><p>En attendant, tu peux <a href="/speed-dating/">t’inscrire à la prochaine soirée</a> ou <a href="/confidences/">écrire à Lamia</a>.</p></div>`;
    } catch (err) {
      btn.disabled = false;
      say(st, ERR[err.code] || 'L’envoi n’a pas abouti. Vérifie ta connexion et réessaie dans un instant.', true);
    }
  });
}

function carte(a) {
  const ages = a.age_min || a.age_max ? ` · ${a.age_min || 18} à ${a.age_max || 99} ans` : '';
  const tags = [...(a.origine || []), ...(a.caracteristiques || [])];
  const infos = [a.genre === 'femme' ? 'Une femme' : 'Un homme', `${a.age} ans`, lib(a.pays), a.situation && lib(a.situation), a.enfants === 'Oui' ? 'avec enfant(s)' : a.enfants === 'Non' ? 'sans enfant' : '', a.etudes && `études : ${lib(a.etudes).toLowerCase()}`].filter(Boolean);
  return `<article class="annonce-carte annonce-anonyme">
    <div class="annonce-sceau" aria-hidden="true"><span>${a.genre === 'femme' ? '♀' : '♂'}</span></div>
    <div class="annonce-texte">
      <p class="annonce-ref">Profil n° ${a.ref} · ✓ vérifié par Lamia · anonyme</p>
      <h3>${esc(infos.slice(0, 2).join(', '))}</h3>
      <p class="annonce-lieu">${esc(infos.slice(2).join(' · '))}</p>
      ${tags.length ? `<p class="annonce-tags">${tags.map((t) => `<span>${esc(lib(t))}</span>`).join('')}</p>` : ''}
      <h4>Qui je suis</h4><p>${esc(a.profil)}</p>
      <h4>Qui je cherche${ages}</h4><p>${esc(a.recherche)}</p>
      <button type="button" class="btn btn-ink" data-interet="${a.ref}">💌 Ce profil m’intéresse</button>
    </div>
  </article>`;
}

export async function monterListe(box) {
  if (!box) return;
  try {
    const { annonces } = await api({ action: 'annonces_publiques' });
    if (!annonces.length) { box.innerHTML = '<p class="annonce-vide">Les premiers profils anonymes arrivent très bientôt. Et si le premier, c’était le tien ?</p>'; return; }
    box.innerHTML = annonces.map(carte).join('');
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
  if (!box.dataset.monte) { monterFormulaire(box); box.dataset.monte = '1'; }
  box.hidden = false;
  const form = box.querySelector('[data-annonce-form]');
  if (form && ref) {
    form.elements.interet_ref.value = ref;
    const info = form.querySelector('[data-interet-info]');
    form.prepend(info);
    info.hidden = false;
    info.textContent = `💌 Le profil n° ${ref} t’intéresse : crée ton profil ci-dessous. Lamia est prévenue et regarde si vous pouvez correspondre. Personne d’autre ne le saura.`;
    window.lfbEvent?.('interet_profil');
  }
  document.querySelectorAll('[data-annonce-ouvrir]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelectorAll('[data-annonce-ouvrir]').forEach((b) => b.addEventListener('click', () => ouvrirFormulaire()));
document.addEventListener('click', (e) => { const b = e.target.closest('[data-interet]'); if (b) ouvrirFormulaire(b.dataset.interet); });
const liste = document.querySelector('[data-annonces-liste]');
if (liste) monterListe(liste);
