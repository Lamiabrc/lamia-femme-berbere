// Annonces de rencontre déposées par la communauté (Patio, Confidences).
// Rien n'est public tant que Lamia n'a pas vérifié l'annonce et la pièce d'identité.
// La photo de la pièce d'identité (numéro caché par la main) ne sert qu'à la vérification :
// elle n'est jamais montrée sur le site et elle est supprimée dès que Lamia publie ou refuse l'annonce.
// Passe par /api/confidences (actions « annonce_* ») pour rester dans la limite des fonctions Vercel.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { DATABASE_URL, json } from './event-tickets.mjs';

const BUCKET = 'annonces';
const SITE = 'https://lamia-femme-berbere.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,180}\.[a-z]{2,24}$/i;
const SITUATIONS = ['Célibataire', 'Divorcé(e)', 'Veuf / veuve', 'Séparé(e)'];
export const TYPES_ANNONCE = {
  'image/jpeg': ['image', 12], 'image/png': ['image', 12], 'image/webp': ['image', 12], 'image/heic': ['image', 12], 'image/heif': ['image', 12],
  'video/mp4': ['video', 50], 'video/quicktime': ['video', 50], 'video/webm': ['video', 50],
  'application/pdf': ['pdf', 12],
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf' };
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const baseType = (t) => String(t || '').split(';')[0].trim().toLowerCase();

export function ageAu(birth, today = new Date()) {
  const b = new Date(`${birth}T12:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  let a = today.getUTCFullYear() - b.getUTCFullYear();
  if (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

// Médias annoncés : 1 ou 2 photos, ou 1 vidéo ; et obligatoirement la photo de la pièce d'identité.
export function verifierMedias(list) {
  if (!Array.isArray(list)) return { error: 'medias_requis' };
  const out = [];
  for (const f of list.slice(0, 4)) {
    const role = f?.role === 'identite' ? 'identite' : 'media';
    const mime = baseType(f?.type);
    const t = TYPES_ANNONCE[mime];
    if (!t) return { error: 'file_type' };
    if (role === 'media' && t[0] === 'pdf') return { error: 'file_type' };
    if (role === 'identite' && t[0] === 'video') return { error: 'file_type' };
    const size = Math.round(Number(f?.size));
    if (!(size > 0) || size > t[1] * 1024 * 1024) return { error: 'file_size' };
    out.push({ kind: role === 'identite' ? 'identite' : t[0] === 'video' ? 'video' : 'photo', mime, size });
  }
  const photos = out.filter((f) => f.kind === 'photo').length, videos = out.filter((f) => f.kind === 'video').length, ids = out.filter((f) => f.kind === 'identite').length;
  if (ids !== 1) return { error: 'identite_requise' };
  if (!(photos + videos) ) return { error: 'medias_requis' };
  if (videos > 1 || photos > 2 || (videos && photos)) return { error: 'medias_trop' };
  return { files: out };
}

const signe = (env, id, usage) => createHmac('sha256', `${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY}|annonces|${usage}`).update(id).digest('base64url');
export const jetonAnnonce = (env, id, usage = 'retrait') => signe(env, id, usage);
export function jetonAnnonceValide(env, id, token, usage = 'retrait') {
  const a = Buffer.from(String(token || '')), b = Buffer.from(signe(env, id, usage));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleAnnonces(action, b, { env, call, read, insert, patch, admin, ipHash, now, email, alerter }) {
  async function liensLecture(files, duree = 3600) {
    if (!files.length) return {};
    const r = await call(`/storage/v1/object/sign/${BUCKET}`, { method: 'POST', body: JSON.stringify({ expiresIn: duree, paths: files.map((f) => f.storage_path) }) });
    if (!r.ok) return {};
    return Object.fromEntries((await r.json()).filter((x) => x.signedURL).map((x) => [x.path, `${DATABASE_URL}/storage/v1${x.signedURL}`]));
  }
  async function effacer(files) {
    if (!files.length) return;
    await call(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: files.map((f) => f.storage_path) }) });
    await call(`/rest/v1/annonce_files?id=in.(${files.map((f) => f.id).join(',')})`, { method: 'DELETE' });
  }
  const publique = (a, files, urls) => ({
    ref: a.ref, prenom: a.prenom, genre: a.genre, age: ageAu(a.birth_date, now()), ville: a.ville, pays: a.pays, situation: a.situation,
    profil: a.profil, recherche: a.recherche, age_min: a.age_min, age_max: a.age_max, published_at: a.published_at,
    medias: files.filter((f) => f.kind !== 'identite').sort((x, y) => x.position - y.position).map((f) => ({ kind: f.kind, mime: f.mime, url: urls[f.storage_path] || null })),
  });

  // ---------------------------------------------------------------- dépôt (sans compte)
  if (action === 'annonce_deposer') {
    if (clean(b.website, 200)) return json({ ok: true, annonce_id: null, uploads: [] });
    if (b.majeur !== true || b.publication !== true || b.identite_ok !== true) return json({ error: 'consent_required' }, 400);
    const prenom = clean(b.prenom, 60), ville = clean(b.ville, 80), pays = clean(b.pays, 60);
    const mail = clean(b.email, 254).toLowerCase();
    const profil = clean(b.profil, 1500), recherche = clean(b.recherche, 1500);
    const genre = b.genre === 'homme' ? 'homme' : b.genre === 'femme' ? 'femme' : null;
    const birth = /^\d{4}-\d{2}-\d{2}$/.test(String(b.birth_date || '')) ? b.birth_date : null;
    const age = birth ? ageAu(birth, now()) : null;
    if (!prenom) return json({ error: 'missing_name' }, 400);
    if (!genre) return json({ error: 'missing_genre' }, 400);
    if (age === null || age > 99) return json({ error: 'invalid_birth_date' }, 400);
    if (age < 18) return json({ error: 'mineur' }, 400);
    if (!ville || !pays) return json({ error: 'missing_lieu' }, 400);
    if (!EMAIL.test(mail)) return json({ error: 'invalid_email' }, 400);
    if (profil.length < 20 || recherche.length < 20) return json({ error: 'textes_courts' }, 400);
    const { files, error } = verifierMedias(b.medias);
    if (error) return json({ error }, 400);
    const since = encodeURIComponent(new Date(now().getTime() - 86400e3).toISOString());
    const recentes = await read(`/rest/v1/annonces?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id&limit=4`).catch(() => []);
    if (recentes.length >= 3) return json({ error: 'rate_limited' }, 429);
    const amin = Number.parseInt(b.age_min, 10), amax = Number.parseInt(b.age_max, 10);
    const annonce = await insert('annonces', {
      prenom, genre, birth_date: birth, ville, pays, email: mail, phone: clean(b.phone, 40) || null,
      situation: SITUATIONS.includes(b.situation) ? b.situation : null, profil, recherche,
      age_min: amin >= 18 && amin <= 99 ? amin : null, age_max: amax >= 18 && amax <= 99 ? amax : null, ip_hash: ipHash,
    });
    const uploads = [];
    let n = 0;
    for (const f of files) {
      n += 1;
      const path = `${annonce.id}/${f.kind}-${n}.${EXT[f.mime]}`;
      const r = await call(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', body: '{}' });
      if (!r.ok) throw new Error(`sign ${r.status}`);
      const { url } = await r.json();
      await insert('annonce_files', { annonce_id: annonce.id, kind: f.kind, storage_path: path, mime: f.mime, size_bytes: f.size, position: n });
      uploads.push({ url: `${DATABASE_URL}/storage/v1${url}`, type: f.mime });
    }
    return json({ ok: true, annonce_id: annonce.id, token: jetonAnnonce(env, annonce.id, 'envoi'), uploads });
  }

  if (action === 'annonce_finaliser') {
    const id = clean(b.annonce_id, 40);
    if (!UUID.test(id) || !jetonAnnonceValide(env, id, b.token, 'envoi')) return json({ error: 'forbidden' }, 403);
    const [a] = await read(`/rest/v1/annonces?id=eq.${id}&select=*`);
    if (!a) return json({ error: 'not_found' }, 404);
    if (a.status !== 'brouillon') return json({ ok: true, deja: true, ref: a.ref });
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${id}&select=id,kind,storage_path`);
    const r = await call(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix: `${id}/`, limit: 20 }) });
    const presents = new Set(r.ok ? (await r.json()).map((o) => `${id}/${o.name}`) : []);
    const manquants = files.filter((f) => !presents.has(f.storage_path));
    if (manquants.length) return json({ error: 'upload_failed' }, 400);
    await patch('annonces', `id=eq.${id}`, { status: 'a_verifier', submitted_at: now().toISOString() });
    const lienRetrait = `${SITE}/patio/?retirer=${a.id}.${jetonAnnonce(env, a.id)}#annonces`;
    await email(a.email, `Ton annonce n° ${a.ref} est bien arrivée chez Lamia`,
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Merci ${esc(a.prenom)} !</h2><p>Ton annonce n° ${a.ref} est bien arrivée. Lamia la lit elle-même et vérifie ta pièce d’identité avant de la publier dans le Patio. Tu reçois un email dès qu’elle est en ligne.</p><p>Ta pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.</p><p style="font-size:13px">Tu pourras retirer ton annonce à tout moment avec ce lien (garde-le précieusement) :<br><a href="${lienRetrait}">Retirer mon annonce</a></p></div>`,
      `Merci ${a.prenom} !\n\nTon annonce n° ${a.ref} est bien arrivée. Lamia la vérifie avant de la publier dans le Patio.\nTa pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.\n\nPour retirer ton annonce à tout moment : ${lienRetrait}`).catch(() => false);
    await alerter({ titre: `Nouvelle annonce à vérifier · n° ${a.ref}`, lignes: [`${a.prenom}, ${a.genre === 'femme' ? 'une femme' : 'un homme'} de ${ageAu(a.birth_date, now())} ans, ${a.ville} (${a.pays})`, 'À vérifier dans ton espace Confidences, onglet Annonces'], lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true, ref: a.ref });
  }

  // ---------------------------------------------------------------- annonces publiées (lecture publique)
  if (action === 'annonces_publiques') {
    const list = await read('/rest/v1/annonces?status=eq.publiee&select=*&order=published_at.desc&limit=60');
    if (!list.length) return json({ ok: true, annonces: [] });
    const files = await read(`/rest/v1/annonce_files?annonce_id=in.(${list.map((a) => a.id).join(',')})&kind=neq.identite&select=annonce_id,kind,mime,storage_path,position`);
    const urls = await liensLecture(files);
    return json({ ok: true, annonces: list.map((a) => publique(a, files.filter((f) => f.annonce_id === a.id), urls)) });
  }

  // ---------------------------------------------------------------- retrait par la personne (lien reçu par email)
  if (action === 'annonce_retirer') {
    const id = clean(b.annonce_id, 40);
    if (!UUID.test(id) || !jetonAnnonceValide(env, id, b.token)) return json({ error: 'forbidden' }, 403);
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${id}&select=id,storage_path`);
    await effacer(files);
    await patch('annonces', `id=eq.${id}`, { status: 'retiree', email: 'retiree@annonce.invalid', phone: null, profil: 'Annonce retirée par son autrice ou son auteur.', recherche: 'Annonce retirée par son autrice ou son auteur.' });
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- espace de Lamia
  if (!admin) return json({ error: 'forbidden' }, 403);
  if (action === 'annonces_admin') {
    const list = await read('/rest/v1/annonces?status=in.(a_verifier,publiee,refusee)&select=*&order=submitted_at.desc&limit=100');
    const files = list.length ? await read(`/rest/v1/annonce_files?annonce_id=in.(${list.map((a) => a.id).join(',')})&select=id,annonce_id,kind,mime,storage_path,position`) : [];
    const urls = await liensLecture(files, 1800);
    return json({ ok: true, annonces: list.map((a) => ({
      ...publique(a, files.filter((f) => f.annonce_id === a.id), urls), id: a.id, status: a.status, email: a.email, phone: a.phone, birth_date: a.birth_date,
      submitted_at: a.submitted_at, identite_verifiee_at: a.identite_verifiee_at, note_lamia: a.note_lamia,
      identite: files.filter((f) => f.annonce_id === a.id && f.kind === 'identite').map((f) => ({ mime: f.mime, url: urls[f.storage_path] || null }))[0] || null,
    })) });
  }
  if (action === 'annonce_moderer') {
    const id = clean(b.annonce_id, 40);
    if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
    const [a] = await read(`/rest/v1/annonces?id=eq.${id}&select=*`);
    if (!a) return json({ error: 'not_found' }, 404);
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${id}&select=id,kind,storage_path`);
    const note = clean(b.note, 600) || null;
    if (b.decision === 'publier') {
      await effacer(files.filter((f) => f.kind === 'identite'));
      await patch('annonces', `id=eq.${id}`, { status: 'publiee', published_at: a.published_at || now().toISOString(), identite_verifiee_at: a.identite_verifiee_at || now().toISOString(), note_lamia: note });
      if (a.status !== 'publiee') await email(a.email, `Ton annonce n° ${a.ref} est en ligne dans le Patio`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonne nouvelle ${esc(a.prenom)} !</h2><p>Lamia a vérifié ton annonce : elle est maintenant en ligne dans le Patio. Ta pièce d’identité a été supprimée.</p><p>Quand quelqu’un s’intéresse à toi, c’est Lamia qui reçoit son message et qui te met en relation. Tes coordonnées ne sont jamais affichées.</p><p><a href="${SITE}/patio/#annonces" style="display:inline-block;padding:10px 18px;background:#9c6b78;color:#fff;border-radius:999px;text-decoration:none">Voir les annonces</a></p></div>`,
        `Bonne nouvelle ${a.prenom} ! Ton annonce est en ligne dans le Patio : ${SITE}/patio/#annonces\nTa pièce d’identité a été supprimée. Tes coordonnées ne sont jamais affichées : Lamia fait le lien.`).catch(() => false);
      return json({ ok: true, status: 'publiee' });
    }
    if (b.decision === 'refuser') {
      await effacer(files);
      await patch('annonces', `id=eq.${id}`, { status: 'refusee', note_lamia: note });
      await email(a.email, `Ton annonce n° ${a.ref}`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonjour ${esc(a.prenom)},</h2><p>Lamia n’a pas pu publier ton annonce cette fois-ci.${note ? ` Son mot : « ${esc(note)} »` : ''}</p><p>Tes photos et ta pièce d’identité ont été supprimées. Tu peux déposer une nouvelle annonce quand tu veux, ou écrire à Lamia dans les Confidences.</p></div>`,
        `Bonjour ${a.prenom},\n\nLamia n’a pas pu publier ton annonce cette fois-ci.${note ? ` Son mot : « ${note} »` : ''}\nTes photos et ta pièce d’identité ont été supprimées. Tu peux déposer une nouvelle annonce quand tu veux.`).catch(() => false);
      return json({ ok: true, status: 'refusee' });
    }
    if (b.decision === 'supprimer') {
      await effacer(files);
      await call(`/rest/v1/annonces?id=eq.${id}`, { method: 'DELETE' });
      return json({ ok: true, status: 'supprimee' });
    }
    return json({ error: 'bad_request' }, 400);
  }
  return json({ error: 'bad_request' }, 400);
}
