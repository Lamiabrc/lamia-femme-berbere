import { isAdmin, json } from './event-tickets.mjs';

// La reprise est une décision explicite, indépendante de la validation et de la suspension.
export async function reprendreRencontres(b, { admin, user, read, call, journal, refOutil = 5001 }) {
  if (!admin || !isAdmin(user)) return json({ error: 'forbidden' }, 403);
  const ref = Number(b.ref);
  if (!Number.isSafeInteger(ref) || ref <= 0) return json({ error: 'bad_request' }, 400);
  try {
    const champs = 'id,ref,user_id,fiche_ref,status,pause_at,bloque_at,photos_refusees_at';
    let annonces = [], fiches = [];
    if (ref < refOutil) {
      annonces = await read(`/rest/v1/annonces?ref=eq.${ref}&select=${champs}&limit=1`);
      if (!annonces.length) return json({ error: 'not_found' }, 404);
      const a = annonces[0];
      const lien = a.fiche_ref ? `ref=eq.${a.fiche_ref}` : a.user_id ? `user_id=eq.${a.user_id}` : null;
      if (lien) fiches = await read(`/rest/v1/profils_outil?${lien}&retire_at=is.null&effacement_at=is.null&bloque_at=is.null&select=ref,pause_at&limit=100`);
    } else {
      fiches = await read(`/rest/v1/profils_outil?ref=eq.${ref}&select=ref,user_id,visible,confirme_at,retire_at,effacement_at,bloque_at,pause_at&limit=1`);
      if (!fiches.length) return json({ error: 'not_found' }, 404);
      const f = fiches[0];
      if (f.retire_at || f.effacement_at || f.bloque_at) return json({ error: 'profil_inactif' }, 409);
      if (!f.visible || !f.confirme_at) return json({ error: 'profil_non_valide' }, 409);
      annonces = await read(`/rest/v1/annonces?fiche_ref=eq.${ref}&select=${champs}&limit=100`);
    }
    // Aucun droit de validation, de déblocage ou de modération photo n'est accordé par cette action.
    if (annonces.some((a) => a.status !== 'publiee' || a.bloque_at || a.photos_refusees_at)) return json({ error: 'profil_inactif' }, 409);
    const cibles = [
      ...annonces.filter((a) => a.pause_at).map((a) => ({ table: 'annonces', filtre: `id=eq.${a.id}&status=eq.publiee&bloque_at=is.null&photos_refusees_at=is.null` })),
      ...fiches.filter((f) => f.pause_at).map((f) => ({ table: 'profils_outil', filtre: `ref=eq.${f.ref}&retire_at=is.null&effacement_at=is.null&bloque_at=is.null` })),
    ];
    for (const c of cibles) {
      const r = await call(`/rest/v1/${c.table}?${c.filtre}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ pause_at: null }) });
      if (!r.ok || !(await r.json()).length) return json({ error: 'reprise_echec' }, 502);
    }
    if (cibles.length) await journal?.(ref);
    return json({ ok: true, en_pause: false, deja: !cibles.length });
  } catch { return json({ error: 'reprise_echec' }, 502); }
}
