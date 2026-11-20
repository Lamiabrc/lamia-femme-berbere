// État réservé au serveur : un avertissement ne suspend pas les rencontres.
export const correctionPhotosEnCours = (a) => ['avertissement', 'suspendu'].includes(a?.photos_moderation?.etat);
export const gracePhotos = (a) => !a?.photos_refusees_at && a?.photos_moderation?.etat === 'avertissement';
export function avisPhotos(a, fichiers = []) {
  const m = a?.photos_moderation;
  if (!m || !correctionPhotosEnCours(a)) return null;
  return { etat: m.etat, commentaire: m.commentaire || '', date: m.controle_at,
    photos: (m.photos || []).map((p) => ({ id: p.id, position: p.position, commentaire: p.commentaire || '', retiree: Boolean(p.retiree), presente: fichiers.some((f) => f.id === p.id) })) };
}
