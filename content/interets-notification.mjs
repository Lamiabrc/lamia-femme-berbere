export function notificationInteret(i, { disponible = true } = {}) {
  if (!i || !disponible) return { etat:'indisponible', texte:'Cet intérêt n’est plus disponible. Le profil a pu être retiré ou son accès a changé.' };
  if (['pas_compatible','dematche','annule'].includes(i.statut)) return { id:i.id, etat:'termine', texte:'Cet intérêt est désormais terminé ou sans suite. Ton ancien « oui » ne correspond pas à un match en cours.' };
  if (i.statut === 'mis_en_relation') return { id:i.id, etat:'match', texte:'Cet intérêt a donné lieu à une mise en relation. Retrouve son état dans tes discussions.' };
  if (i.reponse === 'non') return { id:i.id, etat:'repondu', texte:'Tu as déjà répondu « pas pour moi » à cet intérêt.' };
  if (i.reponse === 'oui' || i.reciproque) return { id:i.id, etat:'repondu', texte:i.statut === 'en_reserve' ? 'Ton « oui » est enregistré. Cet intérêt est en attente de disponibilité, sans discussion ouverte pour le moment.' : 'Ton « oui » est enregistré. La mise en relation n’est pas encore ouverte ; Lamia peut en vérifier le suivi.' };
  return { id:i.id, etat:'a_repondre', texte:'Voici le profil concerné par ta notification. Tu peux lui répondre ci-dessous.' };
}
export const lienInteret = (id) => `/mon-espace/${id ? `?interet=${encodeURIComponent(id)}` : ''}#interets`;
