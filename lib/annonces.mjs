// Annonces de rencontre déposées par la communauté (Patio, Confidences).
// Les annonces ne sont JAMAIS publiées : elles arrivent chez Lamia, qui les vérifie et les passe dans son outil
// de matching. La personne reçoit seulement le nombre de profils compatibles, sans savoir lesquels.
// La photo de la pièce d'identité (numéro caché par la main) ne sert qu'à la vérification :
// elle n'est jamais montrée sur le site et elle est supprimée dès que Lamia publie ou refuse l'annonce.
// Passe par /api/confidences (actions « annonce_* ») pour rester dans la limite des fonctions Vercel.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DATABASE_URL, json } from './event-tickets.mjs';
import { O, choixPropres, versOutil } from '../content/matching-options.mjs';

const BUCKET = 'annonces';
const SITE = 'https://lamia-femme-berbere.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,180}\.[a-z]{2,24}$/i;
export const TYPES_ANNONCE = {
  'image/jpeg': ['image', 12], 'image/png': ['image', 12], 'image/webp': ['image', 12], 'image/heic': ['image', 12], 'image/heif': ['image', 12],
  'video/mp4': ['video', 50], 'video/quicktime': ['video', 50], 'video/webm': ['video', 50],
  'application/pdf': ['pdf', 12],
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf' };
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const baseType = (t) => String(t || '').split(';')[0].trim().toLowerCase();

// Retire d'un texte public tout moyen de contact : liens, @pseudos, emails, numéros de téléphone.
export function sansContact(t) {
  return String(t || '')
    .replace(/https?:\/\/\S+|www\.\S+|\b[\w.-]+\.(com|fr|net|org|dz|be|ca|me|io|tv|app|link)\b\S*/gi, '…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '…')
    .replace(/@[\w.]{2,}/g, '…')
    .replace(/(\+|00)?\d[\d\s.\-()]{7,}\d/g, '…')
    .replace(/\b(snap(chat)?|insta(gram)?|tiktok|facebook|fb|whats ?app|telegram|messenger|t[ée]l[ée]phone|num[ée]ro|appelle[sz]?-moi)\b\s*:?\s*\S*/gi, '…');
}

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

// Profils de l'outil de matching publiés anonymement par Lamia (n° 5001 et plus).
const REF_OUTIL = 5001;
const tableau = (v, n = 12) => (Array.isArray(v) ? v : []).map((x) => clean(x, 60)).filter(Boolean).slice(0, n);
const entier = (v, min, max) => { const n = Number.parseInt(v, 10); return n >= min && n <= max ? n : null; };

export async function handleAnnonces(action, b, { env, call, read, insert, patch, admin, ipHash, now, email, alerter }) {
  const profilsOutilPublics = async () => (await read('/rest/v1/profils_outil?visible=eq.true&select=ref,genre,age,pays,situation,enfants,etudes,origine,caracteristiques,profil,recherche,age_min,age_max&order=updated_at.desc&limit=300').catch(() => []))
    .map((p) => ({ ...p, profil: sansContact(p.profil), recherche: sansContact(p.recherche) }));
  const outilParRef = async (refs) => { const r = [...new Set(refs.filter((x) => x >= REF_OUTIL))]; return r.length ? read(`/rest/v1/profils_outil?ref=in.(${r.join(',')})&select=ref,outil_id,genre,age,pays`).catch(() => []) : []; };
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
    origine: a.matching?.origineTags || [], caracteristiques: a.matching?.caracteristiques || [],
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
    if (!ville || !O.pays.includes(pays)) return json({ error: 'missing_lieu' }, 400);
    const matching = choixPropres(b.matching || {});
    if (!matching.contactReseau) return json({ error: 'contact_requis' }, 400);
    if (!EMAIL.test(mail)) return json({ error: 'invalid_email' }, 400);
    if (profil.length < 20 || recherche.length < 20) return json({ error: 'textes_courts' }, 400);
    const { files, error } = verifierMedias(b.medias);
    if (error) return json({ error }, 400);
    const since = encodeURIComponent(new Date(now().getTime() - 86400e3).toISOString());
    const recentes = await read(`/rest/v1/annonces?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id&limit=4`).catch(() => []);
    if (recentes.length >= 3) return json({ error: 'rate_limited' }, 429);
    const amin = Number.parseInt(b.age_min, 10), amax = Number.parseInt(b.age_max, 10);
    const annonce = await insert('annonces', {
      prenom, genre, birth_date: birth, ville, pays, email: mail, phone: null,
      situation: matching.situation || null, matching, profil, recherche,
      age_min: amin >= 18 && amin <= 99 ? amin : null, age_max: amax >= 18 && amax <= 99 ? amax : null, ip_hash: ipHash,
      anonyme_ok: b.anonyme_ok === true,
    });
    const interet = Number.parseInt(b.interet_ref, 10);
    if (interet > 0) await insert('annonce_interets', { demandeur_id: annonce.id, cible_ref: interet }).catch(() => {});
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
      `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Merci ${esc(a.prenom)} !</h2><p>Ton annonce n° ${a.ref} est bien arrivée. Lamia la lit elle-même et vérifie ta pièce d’identité. Ton annonce n’est publiée nulle part : elle reste chez Lamia, qui la passe dans son outil de matching.</p><p>Ta pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.</p><p style="font-size:13px">Tu pourras retirer ton annonce et effacer tes données à tout moment avec ce lien (garde-le précieusement) :<br><a href="${lienRetrait}">Retirer mon annonce</a></p></div>`,
      `Merci ${a.prenom} !\n\nTon annonce n° ${a.ref} est bien arrivée. Lamia la vérifie ; elle n’est publiée nulle part.\nTa pièce d’identité n’est jamais publiée : elle est supprimée dès la vérification faite.\n\nPour retirer ton annonce à tout moment : ${lienRetrait}`).catch(() => false);
    const demandes = await read(`/rest/v1/annonce_interets?demandeur_id=eq.${id}&select=cible_ref`).catch(() => []);
    await alerter({ titre: demandes.length ? `Match demandé · n° ${a.ref} → n° ${demandes.map((d) => d.cible_ref).join(', ')}` : `Nouveau profil à vérifier · n° ${a.ref}`, lignes: [`${a.prenom}, ${a.genre === 'femme' ? 'une femme' : 'un homme'} de ${ageAu(a.birth_date, now())} ans, ${a.ville} (${a.pays})`, demandes.length ? `Intéressé(e) par le profil n° ${demandes.map((d) => d.cible_ref).join(', ')}` : '', 'Dans ton espace Confidences, onglet Annonces'].filter(Boolean), lien: '/confidences-lamia/#annonces', tag: 'annonce' }).catch(() => {});
    return json({ ok: true, ref: a.ref });
  }

  // ---------------------------------------------------------------- annonces publiées (lecture publique)
  // Profils anonymes du Patio : ni prénom, ni photo, ni ville, ni contact. Seulement ceux que Lamia a choisi d'afficher.
  if (action === 'annonces_publiques') {
    const list = await read('/rest/v1/annonces?status=eq.publiee&visible_anonyme=eq.true&anonyme_ok=eq.true&select=ref,genre,birth_date,pays,situation,matching,profil,recherche,age_min,age_max,published_at&order=published_at.desc&limit=80');
    return json({ ok: true, annonces: list.map((a) => ({
      ref: a.ref, genre: a.genre, age: ageAu(a.birth_date, now()), pays: a.pays, situation: a.situation,
      enfants: a.matching?.enfants || '', etudes: a.matching?.niveauEtudeCategorie || '', origine: a.matching?.origineTags || [],
      caracteristiques: a.matching?.caracteristiques || [], profil: sansContact(a.profil), recherche: sansContact(a.recherche), age_min: a.age_min, age_max: a.age_max,
    })).concat(await profilsOutilPublics()) });
  }

  // ---------------------------------------------------------------- retrait par la personne (lien reçu par email)
  if (action === 'annonce_retirer') {
    const id = clean(b.annonce_id, 40);
    if (!UUID.test(id) || !jetonAnnonceValide(env, id, b.token)) return json({ error: 'forbidden' }, 403);
    const files = await read(`/rest/v1/annonce_files?annonce_id=eq.${id}&select=id,storage_path`);
    await effacer(files);
    await patch('annonces', `id=eq.${id}`, { status: 'retiree', visible_anonyme: false, email: 'retiree@annonce.invalid', phone: null, profil: 'Annonce retirée par son autrice ou son auteur.', recherche: 'Annonce retirée par son autrice ou son auteur.' });
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- liaison avec l'outil de matching (sur l'ordinateur de Lamia)
  // L'outil s'identifie avec une clé secrète générée par Lamia dans son espace ; seule son empreinte est gardée ici.
  const cleOk = async () => {
    const cle = clean(b.cle, 120);
    if (cle.length < 30) return false;
    const [row] = await read('/rest/v1/platform_settings?key=eq.outil_liaison&select=value').catch(() => []);
    const h = row?.value?.hash;
    if (!h) return false;
    const x = Buffer.from(createHash('sha256').update(cle).digest('hex')), y = Buffer.from(String(h));
    return x.length === y.length && timingSafeEqual(x, y);
  };
  if (action === 'outil_synchro') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const list = await read('/rest/v1/annonces?status=eq.publiee&select=*&order=submitted_at.desc&limit=500');
    const ids = list.map((a) => a.id);
    const files = ids.length ? await read(`/rest/v1/annonce_files?annonce_id=in.(${ids.join(',')})&kind=neq.identite&select=annonce_id,kind,mime,storage_path,position`) : [];
    const urls = await liensLecture(files, 3600);
    const interets = ids.length ? await read(`/rest/v1/annonce_interets?select=id,demandeur_id,cible_ref,statut,created_at&order=created_at.desc&limit=500`) : [];
    const profiles = list.map((a) => {
      const f = files.filter((x) => x.annonce_id === a.id).sort((x, y) => x.position - y.position);
      const photo = f.find((x) => x.kind === 'photo');
      return { ...versOutil({ ...a, age: ageAu(a.birth_date, now()), medias: f.map((x) => ({ kind: x.kind })), interets: interets.filter((i) => i.demandeur_id === a.id).map((i) => i.cible_ref) }), photoUrl: photo ? urls[photo.storage_path] || '' : '' };
    });
    const refDe = Object.fromEntries(list.map((a) => [a.id, a.ref]));
    const outil = Object.fromEntries((await outilParRef(interets.map((i) => i.cible_ref))).map((p) => [p.ref, p.outil_id]));
    const demandes = interets.filter((i) => refDe[i.demandeur_id]).map((i) => ({ id: i.id, demandeur: `site-annonce-${refDe[i.demandeur_id]}`, cible: outil[i.cible_ref] || `site-annonce-${i.cible_ref}`, statut: i.statut, created_at: i.created_at }));
    if (ids.length) await patch('annonces', `id=in.(${ids.join(',')})&exportee_at=is.null`, { exportee_at: now().toISOString() });
    return json({ ok: true, profiles, demandes });
  }
  if (action === 'outil_publier') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    if (!Array.isArray(b.profils)) return json({ error: 'bad_request' }, 400);
    const t = now().toISOString();
    const rows = b.profils.slice(0, 600).map((p) => ({
      outil_id: clean(p?.outil_id, 80), genre: p?.genre === 'femme' || p?.genre === 'homme' ? p.genre : '', age: entier(p?.age, 18, 99),
      pays: clean(p?.pays, 60) || null, situation: clean(p?.situation, 60) || null, enfants: clean(p?.enfants, 10) || null, etudes: clean(p?.etudes, 80) || null,
      origine: tableau(p?.origine, 6), caracteristiques: tableau(p?.caracteristiques), profil: sansContact(clean(p?.profil, 700)), recherche: sansContact(clean(p?.recherche, 700)),
      age_min: entier(p?.age_min, 18, 99), age_max: entier(p?.age_max, 18, 99), visible: true, updated_at: t,
    })).filter((r) => r.outil_id && r.genre);
    if (rows.length) await call('/rest/v1/profils_outil?on_conflict=outil_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    const tous = await read('/rest/v1/profils_outil?select=ref,outil_id,visible');
    const garde = new Set(rows.map((r) => r.outil_id));
    const masques = tous.filter((x) => x.visible && !garde.has(x.outil_id)).map((x) => x.ref);
    if (masques.length) await patch('profils_outil', `ref=in.(${masques.join(',')})`, { visible: false });
    return json({ ok: true, publies: rows.length, masques: masques.length, refs: Object.fromEntries(tous.filter((x) => garde.has(x.outil_id)).map((x) => [x.outil_id, x.ref])) });
  }
  if (action === 'outil_demande_statut') {
    if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['a_traiter', 'mis_en_relation', 'pas_compatible'].includes(b.statut)) return json({ error: 'bad_request' }, 400);
    await patch('annonce_interets', `id=eq.${id}`, { statut: b.statut });
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- espace de Lamia
  if (!admin) return json({ error: 'forbidden' }, 403);
  if (action === 'outil_cle') {
    const cle = randomBytes(32).toString('base64url');
    await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'outil_liaison', value: { hash: createHash('sha256').update(cle).digest('hex'), created_at: now().toISOString() }, updated_at: now().toISOString() }) });
    return json({ ok: true, cle });
  }
  if (action === 'annonces_admin') {
    const list = await read('/rest/v1/annonces?status=in.(a_verifier,publiee,refusee)&select=*&order=submitted_at.desc&limit=100');
    const files = list.length ? await read(`/rest/v1/annonce_files?annonce_id=in.(${list.map((a) => a.id).join(',')})&select=id,annonce_id,kind,mime,storage_path,position`) : [];
    const urls = await liensLecture(files, 1800);
    const interets = list.length ? await read(`/rest/v1/annonce_interets?demandeur_id=in.(${list.map((a) => a.id).join(',')})&select=demandeur_id,cible_ref`).catch(() => []) : [];
    return json({ ok: true, annonces: list.map((a) => ({
      interets: interets.filter((x) => x.demandeur_id === a.id).map((x) => x.cible_ref),
      ...publique(a, files.filter((f) => f.annonce_id === a.id), urls), id: a.id, status: a.status, email: a.email, phone: a.phone, birth_date: a.birth_date,
      submitted_at: a.submitted_at, identite_verifiee_at: a.identite_verifiee_at, note_lamia: a.note_lamia, matching: a.matching || {}, exportee_at: a.exportee_at, nb_compatibles: a.nb_compatibles, resultat_envoye_at: a.resultat_envoye_at, anonyme_ok: a.anonyme_ok, visible_anonyme: a.visible_anonyme,
      identite: files.filter((f) => f.annonce_id === a.id && f.kind === 'identite').map((f) => ({ mime: f.mime, url: urls[f.storage_path] || null }))[0] || null,
    })) });
  }
  if (action === 'matchs_demandes') {
    const list = await read('/rest/v1/annonce_interets?select=id,cible_ref,statut,created_at,annonces!inner(id,ref,prenom,genre,birth_date,ville,pays,status,matching)&order=created_at.desc&limit=200');
    const refs = [...new Set(list.map((x) => x.cible_ref))];
    const cibles = refs.length ? await read(`/rest/v1/annonces?ref=in.(${refs.join(',')})&select=ref,prenom,genre,birth_date,ville,pays,status`) : [];
    const resume = (a) => a && ({ ref: a.ref, prenom: a.prenom, genre: a.genre, age: ageAu(a.birth_date, now()), ville: a.ville, pays: a.pays, status: a.status, contact: a.matching?.contactReseau || '' });
    const outils = await outilParRef(refs);
    const resumeOutil = (o) => o && ({ ref: o.ref, prenom: 'profil de ton outil', genre: o.genre, age: o.age, ville: 'fiche dans le logiciel', pays: o.pays || '' });
    return json({ ok: true, demandes: list.map((x) => ({ id: x.id, statut: x.statut, created_at: x.created_at, demandeur: resume(x.annonces), cible: resume(cibles.find((c) => c.ref === x.cible_ref)) || resumeOutil(outils.find((o) => o.ref === x.cible_ref)) || { ref: x.cible_ref } })) });
  }
  if (action === 'match_demande_statut') {
    const id = clean(b.id, 40);
    if (!UUID.test(id) || !['a_traiter', 'mis_en_relation', 'pas_compatible'].includes(b.statut)) return json({ error: 'bad_request' }, 400);
    await patch('annonce_interets', `id=eq.${id}`, { statut: b.statut });
    return json({ ok: true });
  }
  if (action === 'annonces_exportees') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => UUID.test(String(x))).slice(0, 100);
    if (ids.length) await patch('annonces', `id=in.(${ids.join(',')})`, { exportee_at: now().toISOString() });
    return json({ ok: true });
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
      if (a.status !== 'publiee') await email(a.email, `Ton profil n° ${a.ref} est validé par Lamia`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonne nouvelle ${esc(a.prenom)} !</h2><p>Lamia a vérifié ton profil et ton identité. Ta pièce d’identité a été supprimée.</p><p>Ton profil n’est publié nulle part : il reste chez Lamia, qui le passe dans son outil de matching. Elle te dira bientôt avec combien de personnes tu pourrais correspondre.</p></div>`,
        `Bonne nouvelle ${a.prenom} ! Lamia a vérifié ton profil et ton identité (ta pièce d’identité a été supprimée). Ton profil n’est publié nulle part : Lamia le passe dans son outil de matching et te dira bientôt avec combien de personnes tu pourrais correspondre.`).catch(() => false);
      return json({ ok: true, status: 'publiee' });
    }
    if (b.decision === 'refuser') {
      await effacer(files);
      await patch('annonces', `id=eq.${id}`, { status: 'refusee', visible_anonyme: false, note_lamia: note });
      await email(a.email, `Ton annonce n° ${a.ref}`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonjour ${esc(a.prenom)},</h2><p>Lamia n’a pas pu retenir ton profil cette fois-ci.${note ? ` Son mot : « ${esc(note)} »` : ''}</p><p>Tes photos et ta pièce d’identité ont été supprimées. Tu peux déposer une nouvelle annonce quand tu veux, ou écrire à Lamia dans les Confidences.</p></div>`,
        `Bonjour ${a.prenom},\n\nLamia n’a pas pu retenir ton profil cette fois-ci.${note ? ` Son mot : « ${note} »` : ''}\nTes photos et ta pièce d’identité ont été supprimées. Tu peux déposer une nouvelle annonce quand tu veux.`).catch(() => false);
      return json({ ok: true, status: 'refusee' });
    }
    if (b.decision === 'resultat') {
      const nb = Number.parseInt(b.nb, 10);
      if (!(nb >= 0 && nb <= 9999)) return json({ error: 'bad_request' }, 400);
      if (a.status !== 'publiee') return json({ error: 'a_valider' }, 409);
      await patch('annonces', `id=eq.${id}`, { nb_compatibles: nb, resultat_envoye_at: now().toISOString(), note_lamia: note });
      const lien = `${SITE}/confidences/?profil=${a.ref}#ecrire`;
      const corps = nb > 0
        ? `D’après l’outil de matching de Lamia, ton profil pourrait correspondre à <strong>${nb} personne${nb > 1 ? 's' : ''}</strong>. Pour discrétion, personne ne sait qui correspond à qui : seule Lamia le sait.</p><p>Écris-lui pour en prendre connaissance. <strong>Ta première mise en relation est offerte.</strong> Pour aller plus loin et rencontrer d’autres profils, Lamia te proposera son abonnement.`
        : `Pour le moment, l’outil de matching de Lamia ne trouve pas encore de profil qui te corresponde, mais de nouvelles personnes arrivent chaque semaine. Lamia garde ton profil et te prévient dès qu’une belle correspondance apparaît.`;
      const txt = corps.replace(/<[^>]+>/g, '');
      await email(a.email, nb > 0 ? `${a.prenom}, ${nb} profil${nb > 1 ? 's' : ''} pourrai${nb > 1 ? 'ent' : 't'} te correspondre` : `${a.prenom}, ton profil est bien chez Lamia`,
        `<div style="font-family:Georgia,serif;color:#3b2f33;max-width:560px"><h2 style="font-weight:normal;color:#9c6b78">Bonjour ${esc(a.prenom)},</h2><p>${corps}</p>${note ? `<p>Le mot de Lamia : « ${esc(note)} »</p>` : ''}${nb > 0 ? `<p><a href="${lien}" style="display:inline-block;padding:10px 18px;background:#7d1530;color:#fff;border-radius:999px;text-decoration:none">💌 Écrire à Lamia</a></p>` : ''}</div>`,
        `Bonjour ${a.prenom},\n\n${txt}${note ? `\n\nLe mot de Lamia : « ${note} »` : ''}${nb > 0 ? `\n\nÉcrire à Lamia : ${lien}` : ''}`).catch(() => false);
      return json({ ok: true, status: 'resultat_envoye' });
    }
    if (b.decision === 'afficher' || b.decision === 'masquer') {
      if (b.decision === 'afficher' && (!a.anonyme_ok || a.status !== 'publiee')) return json({ error: 'pas_consenti' }, 409);
      await patch('annonces', `id=eq.${id}`, { visible_anonyme: b.decision === 'afficher' });
      return json({ ok: true });
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
