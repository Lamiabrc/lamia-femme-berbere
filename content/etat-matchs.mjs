// État destiné à l'affichage : la limite technique d'ouverture conserve son propre calcul.
export function compterMatchsAffiches({ sortants = [], recus = [], discussions = [], moi, refs = [], maintenant = new Date() }) {
  const alias = new Map(), parInteret = new Map(), parPartenaire = new Map(), actives = new Set(), attentes = new Set(), auRevoir = new Set();
  const refCle = (r) => Number(r) > 0 ? `ref:${Number(r)}` : null;
  for (const i of recus) if (i.annonces?.user_id && i.annonces.ref) alias.set(refCle(i.annonces.ref), `user:${i.annonces.user_id}`);
  const ds = discussions.filter((d) => d.a_user === moi || d.b_user === moi || refs.includes(d.a_ref) || refs.includes(d.b_ref));
  const partenaire = (d) => {
    const a = d.a_user === moi || refs.includes(d.a_ref), uid = a ? d.b_user : d.a_user, ref = a ? d.b_ref : d.a_ref;
    const cle = uid ? `user:${uid}` : refCle(ref); if (cle && ref) alias.set(refCle(ref), cle); return cle;
  };
  for (const d of ds) partenaire(d);
  const cleRef = (r) => alias.get(refCle(r)) || refCle(r);
  const ouverte = (d) => !d.close_raison && new Date(d.ferme_at) > maintenant;
  for (const d of ds) {
    const cle = partenaire(d); if (!cle) continue;
    const p = parPartenaire.get(cle) || []; p.push(d); parPartenaire.set(cle, p);
    if (d.interet_id) { const l = parInteret.get(d.interet_id) || []; l.push(d); parInteret.set(d.interet_id, l); }
    if (!ouverte(d)) continue;
    if (d.dematch_at) auRevoir.add(d.id || d.interet_id || cle); else actives.add(cle);
  }
  const ajouter = (i, cle) => {
    if (!cle) return;
    if (i.statut === 'mis_en_relation') {
      const liees = parInteret.get(i.id);
      if (!liees && parPartenaire.has(cle)) {
        const anciennes = parPartenaire.get(cle);
        const fin = Math.max(...anciennes.map((d) => new Date(d.dematch_at || d.ferme_at).getTime()));
        const maj = new Date(i.updated_at || i.created_at || 0).getTime();
        if (!anciennes.some((d) => ouverte(d) && !d.dematch_at) && !(maj > fin)) return;
      }
      if (!liees || liees.some((d) => ouverte(d) && !d.dematch_at)) actives.add(cle);
    } else if (i.statut === 'a_traiter' && i.reciproque && i.reponse !== 'non') attentes.add(cle);
  };
  for (const i of sortants) ajouter(i, cleRef(i.cible_ref));
  for (const i of recus) ajouter(i, i.annonces?.user_id ? `user:${i.annonces.user_id}` : cleRef(i.annonces?.ref));
  return { actifs: actives.size, en_attente: [...attentes].filter((k) => !actives.has(k)).length, au_revoir_nombre: auRevoir.size };
}

export function capaciteMatchs(matchs) {
  const n = matchs?.capacite ?? (matchs?.places_en_attente ? null : matchs?.limite);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function libelleInteret(i) {
  if (i.statut === 'dematche') return 'Match terminé';
  if (i.statut === 'mis_en_relation') return 'Match en cours';
  if (i.reponse === 'non') return 'Tu as dit non';
  if (i.reponse === 'oui' && i.statut === 'a_traiter') return 'Intérêt réciproque · en attente de mise en relation';
  if (i.reponse === 'oui' && i.statut === 'en_reserve') return 'Intérêt réciproque · en attente de disponibilité';
  if (i.statut === 'pas_compatible') return 'Sans suite';
  return i.reponse === 'oui' ? 'Tu as dit oui' : 'Réponse attendue';
}

export function titreDiscussion(d) {
  if (d.dematch) return d.ouverte ? 'Au revoir en cours' : 'Échange terminé';
  return d.ouverte ? 'Discussion en cours' : 'Discussion terminée';
}
