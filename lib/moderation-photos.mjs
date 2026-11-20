import { createHash, randomUUID } from 'node:crypto';
import { json, isAdmin } from './event-tickets.mjs';
import { correctionPhotosEnCours } from '../content/moderation-photos.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texte = (s) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 600);
const cheminSur = (a, p) => typeof p === 'string' && p.startsWith(`${a.id}/`) && !p.includes('..') && !p.includes('%') && /^[\w./-]+$/.test(p) && p.split('/').length === 2;
const filtreEtat = (a) => `id=eq.${a.id}&status=eq.${a.status}&${a.photos_moderation ? `photos_moderation->>revision=eq.${a.photos_moderation.revision}` : 'photos_moderation=is.null'}`;

// Une écriture conditionnelle empêche un second clic ou un ancien écran de devenir un second contrôle.
export async function enregistrerModeration(a, row, call, filtre = '') {
  const r = await call(`/rest/v1/annonces?${filtreEtat(a)}${filtre}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error('moderation_ecriture');
  return (await r.json())[0] || null;
}

export async function retirerPhotos(a, photos, call) {
  if (!photos.length) return;
  if (photos.some((p) => !UUID.test(p.id) || !cheminSur(a, p.storage_path))) throw new Error('photo_invalide');
  // L'API Storage retire aussi le fichier physique. La ligne n'est retirée qu'après son succès.
  const s = await call('/storage/v1/object/annonces', { method: 'DELETE', body: JSON.stringify({ prefixes: photos.map((p) => p.storage_path) }) });
  if (!s.ok) throw new Error('photo_suppression');
  const r = await call(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&kind=eq.photo&id=in.(${photos.map((p) => p.id).join(',')})`, { method: 'DELETE' });
  if (!r.ok) throw new Error('photo_suppression');
}

export async function modererPhotos(b, { admin, user, read, call, now, prevenir }) {
  if (!admin || !isAdmin(user)) return json({ error: 'forbidden' }, 403);
  const ref = Number(b.ref), requete = String(b.requete_id || ''), operation = b.operation;
  if (!Number.isSafeInteger(ref) || ref <= 0 || !UUID.test(requete) || !['avertir', 'suspendre'].includes(operation) || (b.revision != null && !UUID.test(String(b.revision)))) return json({ error: 'bad_request' }, 400);
  const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=*&limit=1`);
  if (!a) return json({ error: 'not_found' }, 404);
  if (!['publiee', 'a_verifier', 'brouillon'].includes(a.status) || a.bloque_at) return json({ error: 'profil_inactif' }, 409);
  const selections = Array.isArray(b.photos) ? b.photos : [];
  if (selections.length > 2 || selections.some((p) => !UUID.test(String(p?.id))) || new Set(selections.map((p) => p.id)).size !== selections.length) return json({ error: 'photo_invalide' }, 400);
  const commande = { operation, commentaire: texte(b.commentaire), photos: selections.map((p) => ({ id: p.id, commentaire: texte(p.commentaire), supprimer: p.supprimer === true })).sort((x, y) => x.id.localeCompare(y.id)) };
  const empreinte = createHash('sha256').update(JSON.stringify(commande)).digest('hex');
  let m = a.photos_moderation;
  if (m?.requete_id === requete) {
    if (m.empreinte !== empreinte) return json({ error: 'requete_modifiee' }, 409);
  } else {
    if ((m?.revision || null) !== (b.revision || null) || (m && !m.terminee_at)) return json({ error: 'controle_obsolete' }, 409);
    if (!commande.commentaire && !commande.photos.some((p) => p.commentaire)) return json({ error: 'commentaire_requis' }, 400);
    if (operation === 'suspendre' && m?.etat !== 'avertissement') return json({ error: 'avertissement_requis' }, 409);
    if (operation === 'avertir' && a.photos_refusees_at && m?.etat !== 'suspendu') return json({ error: 'deja_suspendu' }, 409);
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${a.id}&kind=eq.photo&select=id,kind,storage_path,position`);
    if (!commande.photos.length && operation === 'avertir' && !correctionPhotosEnCours(a)) return json({ error: 'selection_requise' }, 400);
    if (commande.photos.some((p) => !files.some((f) => f.id === p.id && f.kind === 'photo' && cheminSur(a, f.storage_path)))) return json({ error: 'photo_invalide' }, 400);
    const cibles = new Map(correctionPhotosEnCours(a) ? m.photos.map((p) => [p.id, p]) : []);
    for (const p of commande.photos) { const f = files.find((f) => f.id === p.id); cibles.set(p.id, { id: p.id, position: f.position, commentaire: p.commentaire, retiree: p.supprimer }); }
    const t = now().toISOString();
    m = { revision: randomUUID(), requete_id: requete, empreinte, etat: operation === 'suspendre' || m?.etat === 'suspendu' ? 'suspendu' : 'avertissement',
      averti_at: correctionPhotosEnCours(a) ? m.averti_at : t, controle_at: t, commentaire: commande.commentaire,
      photos: [...cibles.values()].sort((p, q) => p.position - q.position), retraits: commande.photos.filter((p) => p.supprimer).map((p) => { const f = files.find((f) => f.id === p.id); return { id: f.id, storage_path: f.storage_path }; }),
      status_avant: correctionPhotosEnCours(a) ? m.status_avant : a.status,
      suspendu_at: operation === 'suspendre' ? t : m?.suspendu_at || null, terminee_at: null, notification_at: null };
    const row = { photos_moderation: m, ...(operation === 'suspendre' ? { photos_refusees_at: t, ...(a.status === 'publiee' ? { status: 'a_verifier' } : {}) } : {}) };
    const ecrit = await enregistrerModeration(a, row, call);
    if (!ecrit) return json({ error: 'controle_obsolete' }, 409);
    Object.assign(a, row);
  }
  // Même requête après réponse perdue : reprendre seulement les retraits interrompus.
  if (!m.terminee_at) {
    try { await retirerPhotos(a, m.retraits || [], call); }
    catch { return json({ error: 'photo_suppression', message: 'Le contrôle est enregistré. Réessaie pour terminer le retrait des photos.', reprise: true }, 502); }
    const suivant = { ...m, terminee_at: now().toISOString() };
    const ecrit = await enregistrerModeration(a, { photos_moderation: suivant }, call, '&photos_moderation->>terminee_at=is.null');
    if (ecrit) { m = suivant; a.photos_moderation = m; }
    else { const [frais] = await read(`/rest/v1/annonces?ref=eq.${ref}&select=*&limit=1`); if (frais?.photos_moderation?.requete_id !== requete) return json({ error: 'controle_obsolete' }, 409); Object.assign(a, frais); m = a.photos_moderation; }
  }
  // Un seul gagnant revendique l'envoi. Le commentaire reste toujours lisible dans l'espace membre.
  if (!m.notification_at) {
    const suivant = { ...m, notification_at: now().toISOString() };
    const ecrit = await enregistrerModeration(a, { photos_moderation: suivant }, call, '&photos_moderation->>notification_at=is.null');
    if (ecrit) {
      const notes = m.photos.map((p) => `Photo ${p.position} : ${p.commentaire || 'à remplacer'}`).join('\n');
      await prevenir(a, { titre: m.etat === 'suspendu' ? 'Tes photos restent à corriger' : 'Un mot de Lamia sur tes photos',
        texte: `${m.commentaire}\n${notes}\n${m.etat === 'suspendu' ? 'Après ce second contrôle, tes rencontres sont suspendues. Elles seront débloquées automatiquement après réception des photos de remplacement.' : 'Merci de corriger les photos signalées. Ton profil reste actif pour le moment. Si elles ne sont pas corrigées, il pourra être suspendu au prochain contrôle de Lamia.'}`,
        bouton: 'Corriger mes photos', lien: '/mon-espace/#photos', pied: 'Tes photos restent privées.' }).catch(() => {});
    }
  }
  return json({ ok: true, ref, etat: m.etat, effacees: (m.retraits || []).length });
}

// Appelée seulement après lecture des objets réellement présents dans Storage.
export async function constaterRemplacement(a, files, { call, now }) {
  const m = a.photos_moderation;
  if (!correctionPhotosEnCours(a) || !m.terminee_at || files.filter((f) => f.kind === 'photo').length < 2 || m.photos.some((p) => files.some((f) => f.id === p.id))) return null;
  const row = { photos_moderation: { ...m, revision: randomUUID(), etat: 'corrige', corrige_at: now().toISOString(), retraits: [] } };
  // Lever seulement la restriction créée par ce contrôle ; préserver pause, retrait et blocage.
  if (m.etat === 'suspendu' && a.photos_refusees_at && Number.isFinite(Date.parse(m.suspendu_at)) && new Date(a.photos_refusees_at).getTime() === Date.parse(m.suspendu_at)) {
    row.photos_refusees_at = null;
    if (a.status === 'a_verifier' && m.status_avant === 'publiee' && !a.bloque_at) row.status = 'publiee';
  }
  return enregistrerModeration(a, row, call);
}
