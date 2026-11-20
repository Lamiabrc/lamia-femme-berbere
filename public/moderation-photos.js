const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
export function stylePhotos() {
  if (document.querySelector('[data-style-moderation-photos]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/moderation-photos.css'; l.dataset.styleModerationPhotos = ''; document.head.append(l);
}
export function rendreModerationPhotos(a) {
  const m = a.photos_moderation, photos = (a.medias || []).filter((p) => p.kind === 'photo');
  const active = ['avertissement','suspendu'].includes(m?.etat);
  return `<form class="photos-controle" data-photo-controle="${esc(a.ref)}" data-revision="${esc(m?.revision || '')}">
    <h5>Photos du profil</h5><p>Fais glisser les photos, puis coche celle ou celles qui sont à corriger.</p>
    <div class="photos-glisseur" tabindex="0" aria-label="Photos privées du profil n° ${esc(a.ref)}">${photos.map((p) => `<fieldset class="photo-controle" data-photo-id="${esc(p.id)}">
      <legend>Photo ${esc(p.position)}</legend><a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="Photo ${esc(p.position)} du profil n° ${esc(a.ref)}" loading="lazy"></a>
      <label><input type="checkbox" data-photo-selection> À corriger</label>
      <label>Commentaire sur cette photo<textarea data-photo-note maxlength="600" rows="2"></textarea></label>
      <label><input type="checkbox" data-photo-supprimer> Supprimer cette photo</label>
    </fieldset>`).join('') || '<p>Aucune photo disponible sur le site.</p>'}</div>
    ${photos.length > 1 ? '<p class="photos-navigation"><button type="button" class="btn btn-line" data-photo-direction="-1">Photo précédente</button><button type="button" class="btn btn-line" data-photo-direction="1">Photo suivante</button></p>' : ''}
    ${active ? `<div class="photos-avis"><strong>${m.etat === 'suspendu' ? 'Rencontres suspendues après ton contrôle' : 'Avertissement envoyé · aucune suspension'}</strong><p>${esc(m.commentaire)}</p><ul>${(m.photos || []).map((p) => `<li>Photo ${esc(p.position)} : ${esc(p.commentaire || 'à remplacer')}${p.retiree ? ' · retirée' : ''}</li>`).join('')}</ul><p>Le remplacement des photos signalées et la réception de deux photos lèvent automatiquement cette restriction.</p></div>` : ''}
    ${m?.etat === 'corrige' ? '<p class="photos-avis">Les photos signalées ont été remplacées. Tu peux les vérifier à nouveau.</p>' : ''}
    <label>Ton commentaire sur l’ensemble des photos<textarea data-photo-commentaire maxlength="600" rows="3" placeholder="Explique ce qui doit être corrigé…"></textarea></label>
    <p class="aide">Premier contrôle : le profil reste actif, même si tu retires une photo. La suspension se décide manuellement au contrôle suivant.</p>
    <div class="photos-actions">${!a.photos_refusees_at || active ? `<button class="btn btn-ink" type="submit" value="avertir">${m?.etat === 'suspendu' ? 'Envoyer le commentaire' : 'Envoyer la demande de correction'}</button>` : ''}
    ${m?.etat === 'avertissement' ? '<button class="btn btn-line" type="submit" value="suspendre">Second contrôle : suspendre les rencontres</button>' : ''}</div>
    ${a.photos_refusees_at && !active ? '<p>Ancien refus de photos : le déblocage reste automatique après réception de nouvelles photos.</p>' : ''}
    <p role="status" data-photo-statut></p>
  </form>`;
}
export function monterModerationPhotos({ appel, apres, racine = document }) {
  stylePhotos();
  const tentatives = new WeakMap();
  racine.addEventListener('click', (e) => {
    const b = e.target.closest('[data-photo-direction]'); if (!b) return;
    const g = b.closest('form').querySelector('.photos-glisseur');
    g.scrollBy({left: Number(b.dataset.photoDirection) * g.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  });
  racine.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-photo-controle]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.occupe) return;
    const st = f.querySelector('[data-photo-statut]');
    let b = tentatives.get(f);
    if (!b) {
      const cartes = [...f.querySelectorAll('[data-photo-id]')];
      if (cartes.some((c) => c.querySelector('[data-photo-supprimer]').checked && !c.querySelector('[data-photo-selection]').checked)) { st.textContent = 'Coche aussi « À corriger » pour chaque photo à supprimer.'; return; }
      b = {action:'annonce_photos_moderer',ref:Number(f.dataset.photoControle),revision:f.dataset.revision || null,requete_id:crypto.randomUUID(),operation:e.submitter?.value || 'avertir',commentaire:f.querySelector('[data-photo-commentaire]').value,
        photos:cartes.filter((c) => c.querySelector('[data-photo-selection]').checked).map((c) => ({id:c.dataset.photoId,commentaire:c.querySelector('[data-photo-note]').value,supprimer:c.querySelector('[data-photo-supprimer]').checked}))};
      if (!b.commentaire.trim() && !b.photos.some((p) => p.commentaire.trim())) { st.textContent = 'Ajoute un commentaire pour expliquer la correction attendue.'; return; }
      if (!b.photos.length && !f.dataset.revision) { st.textContent = 'Choisis au moins une photo à corriger.'; return; }
      if ((b.photos.some((p) => p.supprimer) || b.operation === 'suspendre') && !confirm(b.operation === 'suspendre' ? 'Confirmer la suspension après ce second contrôle ? Le remplacement des photos signalées débloquera automatiquement les rencontres.' : 'Supprimer définitivement uniquement les photos cochées ? Le profil restera actif et recevra ta demande de correction.')) return;
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
    <p>${m.etat === 'suspendu' ? 'Après ce second contrôle, tes rencontres sont suspendues. Elles seront débloquées automatiquement lorsque les photos signalées auront été remplacées et que tes deux photos seront bien reçues.' : 'Merci de corriger les photos signalées. Ton profil reste actif pour le moment. Si elles ne sont pas corrigées, il pourra être suspendu au prochain contrôle de Lamia.'}</p><p role="status" data-photo-remplacer-statut></p></section>`;
}
