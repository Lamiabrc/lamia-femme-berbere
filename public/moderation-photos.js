const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
export function stylePhotos() {
  if (document.querySelector('[data-style-moderation-photos]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/moderation-photos.css'; l.dataset.styleModerationPhotos = ''; document.head.append(l);
}
export function rendreModerationPhotos(a) {
  if (a.medias_indisponibles) return `<section class="photos-controle"><h5>Photos du profil</h5><p role="status">Certaines photos ne peuvent pas être chargées. Recharge la fiche avant de les contrôler ; cela ne signifie pas qu’elles sont absentes ou refusées.</p>${Number.isInteger(a.nb_photos) ? `<p>${esc(a.nb_photos)} photo(s) enregistrée(s).</p>` : ''}</section>`;
  const m = a.photos_moderation, photos = (a.medias || []).filter((p) => p.kind === 'photo');
  const active = ['avertissement','suspendu'].includes(m?.etat);
  // Photos déjà refusées : elles restent affichées « Refusée » après l'envoi (sinon tout repasse en vert).
  const refusees = new Set(active ? (m.photos || []).map((x) => Number(x.position)) : []);
  return `<form class="photos-controle" data-photo-controle="${esc(a.ref)}" data-revision="${esc(m?.revision || '')}" data-actif="${active ? 1 : 0}">
    <h5>Photos du profil</h5><p>Fais glisser les photos : pour chacune, « Acceptée » ou « Refusée ». Le profil reste actif pendant que la personne remplace.</p>
    <div class="photos-glisseur" tabindex="0" aria-label="Photos privées du profil n° ${esc(a.ref)}">${photos.map((p) => `<fieldset class="photo-controle" data-photo-id="${esc(p.id)}">
      <legend>Photo ${esc(p.position)}</legend><a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="Photo ${esc(p.position)} du profil n° ${esc(a.ref)}" loading="lazy"></a>
      <div class="photo-remplacer"><label class="btn btn-line">Remplacer cette photo<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-photo-remplacer-fichier="${esc(p.id)}" hidden></label><small data-photo-remplacer-etat></small></div>
      <div class="photo-choix"><label><input type="radio" name="choix-${esc(p.id)}" value="ok"${refusees.has(Number(p.position)) ? '' : ' checked'}> ✓ Acceptée</label><label><input type="radio" name="choix-${esc(p.id)}" value="non" data-photo-selection${refusees.has(Number(p.position)) ? ' checked' : ''}> ✗ Refusée</label></div>
    </fieldset>`).join('') || '<p>Aucune photo disponible sur le site.</p>'}</div>
    ${photos.length > 1 ? '<p class="photos-navigation"><button type="button" class="btn btn-line" data-photo-direction="-1">Photo précédente</button><button type="button" class="btn btn-line" data-photo-direction="1">Photo suivante</button></p>' : ''}
    ${active ? `<div class="photos-avis"><strong>${m.etat === 'suspendu' ? 'Profil masqué (suspension partielle)' : 'Avertissement envoyé · aucune suspension'}</strong><p>${esc(m.commentaire)}</p><ul>${(m.photos || []).map((p) => `<li>Photo ${esc(p.position)} : ${esc(p.commentaire || 'à remplacer')}${p.retiree ? ' · retirée' : ''}</li>`).join('')}</ul><p>Le remplacement des photos signalées et la réception de deux photos lèvent automatiquement cette restriction.</p></div>` : ''}
    ${m?.etat === 'corrige' ? '<p class="photos-avis">Les photos signalées ont été remplacées. Tu peux les vérifier à nouveau.</p>' : ''}
    <p class="aide">Si tu refuses une photo, la personne reçoit un message automatique et a 24 h pour la remplacer. Passé ce délai, son profil est masqué jusqu’au remplacement.</p>
    <div class="photos-actions">${m?.etat === 'valide' ? `<p class="photos-avis">✓ Photos validées${m.valide_at ? ` le ${new Date(m.valide_at).toLocaleDateString('fr-FR')}` : ''}. Pour en refuser une, marque-la « Refusée » puis envoie.</p>` : ''}${!a.photos_refusees_at || active ? '<button class="btn btn-ink" type="submit" value="avertir">Envoyer</button>' : ''}
    ${m?.etat === 'avertissement' ? '<button class="btn btn-line" type="submit" value="suspendre">Suspendre maintenant, sans attendre les 24 h</button>' : ''}${!a.photos_refusees_at && m?.etat !== 'avertissement' ? '<button class="btn btn-line" type="submit" value="immediat">Photo choquante : suspendre tout de suite</button>' : ''}</div>
    ${a.photos_refusees_at && !active ? '<p>Ancien refus de photos : le déblocage reste automatique après réception de nouvelles photos.</p>' : ''}
    <p role="status" data-photo-statut></p>
  </form>${rendreAjoutPhotos(a)}`;
}

// Photos reçues par TikTok ou Facebook : Lamia les ajoute à la place de la personne, jusqu'à ses deux photos.
const TYPES_PHOTO = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
const typePhoto = (f) => (f.type && f.type !== 'application/octet-stream' ? f.type : TYPES_PHOTO[String(f.name || '').split('.').pop().toLowerCase()] || '');
export function rendreAjoutPhotos(a) {
  if (a.medias_indisponibles) return '';
  const manque = 2 - (a.nb_photos ?? (a.medias || []).filter((p) => p.kind === 'photo').length);
  if (manque <= 0 || a.status === 'retiree' || a.bloque_at) return '';
  return `<form class="photos-controle photos-ajout" data-photos-ajout="${esc(a.ref)}" data-manque="${manque}">
    <h5>Ajouter ${manque > 1 ? 'les 2 photos' : 'la photo manquante'} à sa place</h5>
    <p>La personne n’arrive pas à les envoyer ? Choisis ${manque > 1 ? 'ses 2 photos' : 'sa photo'}, reçue${manque > 1 ? 's' : ''} sur TikTok ou Facebook : elles seront ajoutées à son profil n° ${esc(a.ref)}.</p>
    <label>${manque > 1 ? 'Choisir 2 photos' : 'Choisir la photo'}<input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" ${manque > 1 ? 'multiple' : ''}></label>
    <p class="aide" data-ajout-choix></p>
    <div class="photos-actions"><button class="btn btn-ink" type="submit">Ajouter ${manque > 1 ? 'ces photos' : 'cette photo'} au profil</button></div>
    <p role="status" data-ajout-statut></p>
  </form>`;
}
export function monterModerationPhotos({ appel, apres, cle = '', racine = document }) {
  stylePhotos();
  // Photo qui ne s'affiche pas (format iPhone HEIC, lien expiré) : une phrase, pas une image cassée.
  racine.addEventListener('error', (e) => { const i = e.target; if (i?.tagName === 'IMG' && i.closest?.('.photo-controle')) i.replaceWith(Object.assign(document.createElement('small'), { textContent: 'Photo non affichable ici (format iPhone HEIC ?) : touche le lien pour l’ouvrir.' })); }, true);
  monterAjoutPhotos({ appel, apres, cle, racine });
  monterControlePhotos({ appel, apres, racine });
}
export function monterAjoutPhotos({ appel, apres, cle = '', racine = document }) {
  stylePhotos();
  racine.addEventListener('change', (e) => {
    const f = e.target.closest('[data-photos-ajout]'); if (!f || e.target.name !== 'photos') return;
    const l = [...e.target.files];
    f.querySelector('[data-ajout-choix]').textContent = l.length ? `${l.length} photo${l.length > 1 ? 's' : ''} choisie${l.length > 1 ? 's' : ''} : ${l.map((x) => x.name).join(', ')}` : '';
  });
  racine.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-photo-remplacer-fichier]'); if (!inp) return;
    const carte = inp.closest('[data-photo-id]'), etat = carte.querySelector('[data-photo-remplacer-etat]'), form = inp.closest('[data-photo-controle]');
    const fichier = inp.files[0]; if (!fichier) return;
    const ref = Number(form.dataset.photoControle), photo_id = inp.dataset.photoRemplacerFichier;
    if (!typePhoto(fichier)) { etat.textContent = 'Format non accepté (JPG, PNG, WebP ou HEIC).'; return; }
    if (fichier.size > 12 * 1024 * 1024) { etat.textContent = 'Photo trop lourde (12 Mo maximum).'; return; }
    form.querySelectorAll('button,input').forEach((x) => { x.disabled = true; }); etat.textContent = 'Envoi de la nouvelle photo…';
    try {
      const r = await appel({ action: 'annonce_admin_remplacer_photo', ref, photo_id, type: typePhoto(fichier), size: fichier.size });
      const u = await fetch(r.upload.url, { method: 'PUT', headers: { apikey: cle, 'Content-Type': r.upload.type, 'x-upsert': 'false' }, body: fichier });
      if (!u.ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
      await appel({ action: 'annonce_admin_remplacer_photo_finir', ref, photo_id });
      await appel({ action: 'annonce_admin_medias_verifier', ref });
      etat.textContent = '✓ Photo remplacée.'; await apres(ref);
    } catch (err) {
      etat.textContent = err.code === 'file_type' ? 'Format non accepté.' : 'Le remplacement n’a pas abouti : l’ancienne photo est conservée. Réessaie.';
      form.querySelectorAll('button,input').forEach((x) => { x.disabled = false; });
    }
  });
  racine.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-photos-ajout]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.occupe) return;
    const st = f.querySelector('[data-ajout-statut]'), manque = Number(f.dataset.manque), ref = Number(f.dataset.photosAjout);
    const choix = [...f.elements.photos.files];
    if (choix.length !== manque) { st.textContent = manque > 1 ? 'Choisis exactement 2 photos : il en faut deux au total sur le profil.' : 'Choisis la photo à ajouter.'; return; }
    if (choix.some((x) => !typePhoto(x))) { st.textContent = 'Ce format n’est pas accepté. Choisis des photos JPG, PNG, WebP ou HEIC.'; return; }
    if (choix.some((x) => x.size > 12 * 1024 * 1024)) { st.textContent = 'Une photo dépasse 12 Mo. Choisis-en une plus légère.'; return; }
    f.dataset.occupe = '1'; f.querySelectorAll('button,input').forEach((x) => { x.disabled = true; }); st.textContent = 'Envoi des photos…';
    try {
      const r = await appel({ action: 'annonce_admin_ajouter_medias', ref, medias: choix.map((x) => ({ role: 'media', type: typePhoto(x), size: x.size })) });
      if (r.deja) { st.textContent = 'Ce profil a déjà ses 2 photos.'; await apres(ref); return; }
      for (const [i, up] of (r.uploads || []).entries()) {
        const u = await fetch(up.url, { method: 'PUT', headers: { apikey: cle, 'Content-Type': up.type, 'x-upsert': 'false' }, body: choix[i] });
        if (!u.ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
      }
      const v = await appel({ action: 'annonce_admin_medias_verifier', ref });
      if (!v.medias_ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
      st.textContent = '✓ Photos ajoutées au profil.'; await apres(ref);
    } catch (err) {
      const messages = { pas_de_profil: 'Profil introuvable.', profil_inactif: 'Ce profil est retiré ou bloqué.', file_type: 'Ce format n’est pas accepté.', file_size: 'Une photo est trop lourde.', medias_requis: 'Il faut 2 photos au total sur ce profil.', forbidden: 'Action réservée à l’administratrice.' };
      st.textContent = messages[err.code] || 'L’envoi n’a pas abouti. Réessaie : rien n’est ajouté tant que les photos ne sont pas toutes reçues.';
    } finally { delete f.dataset.occupe; f.querySelectorAll('button,input').forEach((x) => { x.disabled = false; }); }
  });
}
function monterControlePhotos({ appel, apres, racine = document }) {
  const tentatives = new WeakMap();
  racine.addEventListener('click', (e) => {
    const b = e.target.closest('[data-photo-direction]'); if (!b) return;
    const g = b.closest('form').querySelector('.photos-glisseur');
    g.scrollBy({left: Number(b.dataset.photoDirection) * g.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  });
  racine.addEventListener('click', async (e) => {
    const ok = e.target.closest('[data-photo-ok]'); if (!ok) return;
    const f = ok.closest('[data-photo-controle]'), st = f.querySelector('[data-photo-statut]');
    if (f.dataset.occupe) return;
    f.dataset.occupe = '1'; ok.disabled = true; st.textContent = 'Validation…';
    try { await appel({ action: 'annonce_photos_valider', ref: Number(f.dataset.photoControle) }); st.textContent = '✓ Photos validées.'; await apres(Number(f.dataset.photoControle)); }
    catch { st.textContent = 'Pas validé. Réessaie.'; ok.disabled = false; }
    finally { delete f.dataset.occupe; }
  });
  racine.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-photo-controle]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.occupe) return;
    const st = f.querySelector('[data-photo-statut]');
    let b = tentatives.get(f);
    if (!b) {
      const cartes = [...f.querySelectorAll('[data-photo-id]')];
      const refusees = cartes.filter((c) => c.querySelector('[data-photo-selection]').checked);
      // Tout est accepté : c'est une validation (la carte « Photos à valider » disparaît).
      if (!refusees.length && e.submitter?.value === 'avertir' && f.dataset.actif !== '1') {
        f.dataset.occupe = '1'; f.querySelectorAll('button').forEach((x) => { x.disabled = true; }); st.textContent = 'Validation…';
        try { await appel({ action: 'annonce_photos_valider', ref: Number(f.dataset.photoControle) }); st.textContent = '✓ Photos validées.'; await apres(Number(f.dataset.photoControle)); }
        catch { st.textContent = 'Pas validé. Réessaie.'; }
        finally { delete f.dataset.occupe; f.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
        return;
      }
      b = {action:'annonce_photos_moderer',ref:Number(f.dataset.photoControle),revision:f.dataset.revision || null,requete_id:crypto.randomUUID(),operation:e.submitter?.value === 'immediat' ? 'suspendre' : e.submitter?.value || 'avertir',immediat:e.submitter?.value === 'immediat',commentaire:'',
        photos:refusees.map((c) => ({id:c.dataset.photoId,commentaire:'',supprimer:false}))};
      if (!b.photos.length && b.operation === 'avertir') { st.textContent = 'Marque au moins une photo « Refusée ».'; return; }
      if (b.operation === 'suspendre' && !confirm('Confirmer la suspension ? Le remplacement des photos refusées débloquera automatiquement les rencontres.')) return;
      tentatives.set(f, b);
    }
    f.dataset.occupe = '1'; f.querySelectorAll('button').forEach((x) => { x.disabled = true; }); st.textContent = 'Enregistrement du contrôle…';
    try { await appel(b); st.textContent = 'Contrôle enregistré. Le commentaire est visible dans son espace.'; await apres(b.ref); }
    catch (err) {
      const messages = {selection_requise:'Choisis au moins une photo à corriger.',photo_invalide:'Cette photo a changé. Recharge sa fiche.',commentaire_requis:'Ajoute un commentaire.',avertissement_requis:'Envoie d’abord une demande de correction, sans suspension.',controle_obsolete:'La fiche a changé. Ferme-la puis ouvre-la à nouveau.',profil_inactif:'Ce profil est retiré ou bloqué.',deja_suspendu:'Ce profil est déjà suspendu.'};
      st.textContent = messages[err.code] || 'L’opération n’est pas terminée. Réessaie : les autres photos seront conservées.';
      if (messages[err.code]) tentatives.delete(f);
      else f.querySelectorAll('input,textarea').forEach((x) => { x.disabled = true; });
    } finally { delete f.dataset.occupe; f.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
  });
}

export function rendreAvisPhotos(m) {
  if (!m) return '';
  return `<section class="espace-photos photos-avis" id="photos" aria-labelledby="titre-avis-photos"><h3 id="titre-avis-photos">${m.etat === 'suspendu' ? 'Tes photos restent à corriger' : 'Un mot de Lamia sur tes photos'}</h3>
    <p>${esc(m.commentaire)}</p><ul>${m.photos.map((p) => `<li><strong>Photo ${esc(p.position)}</strong> : ${esc(p.commentaire || 'à remplacer')}${p.presente ? ` <button class="link-button" type="button" data-photo-remplacer="${esc(p.id)}">Remplacer cette photo</button>` : ' · à ajouter ci-dessous'}</li>`).join('')}</ul>
    <p>${m.etat === 'suspendu' ? 'Ton profil n’est plus montré aux autres et tu ne peux plus répondre. Tout revient automatiquement dès que les photos signalées sont remplacées et que tes deux photos sont bien reçues.' : 'Merci de remplacer les photos signalées dans les 24 h. Ton profil reste actif pendant ce temps, puis il est masqué jusqu’au remplacement.'}</p><p role="status" data-photo-remplacer-statut></p></section>`;
}
