// La contrainte existante fait foi. Un doublon ne recrée pas un intérêt et ne doit pas renvoyer d'email.
export async function creerInteretUnique(call, row) {
  const r = await call('/rest/v1/annonce_interets?on_conflict=demandeur_id,cible_ref', { method:'POST', headers:{Prefer:'resolution=ignore-duplicates,return=representation'}, body:JSON.stringify(row) });
  if (!r.ok) throw new Error(`insert annonce_interets HTTP ${r.status}`);
  return (await r.json())[0] || null;
}
