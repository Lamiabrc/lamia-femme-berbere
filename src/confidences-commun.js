// Outils partagés des Confidences : appel du serveur et envoi des fichiers vers le stockage privé.

export const PUBLIC_KEY = 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
// Texte d'un message : échappé, avec les liens https cliquables.
export const texteAvecLiens = (t) => esc(t).replace(/https:\/\/[^\s<]+[^\s<.,;:!?)»]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
export const taille = (o) => (o > 1048576 ? `${(o / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
export const quand = (iso) => new Date(iso).toLocaleString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const ERREURS = {
  consent_required: 'Coche la case pour accepter l’utilisation de tes données.',
  missing_name: 'Indique ton prénom ou un pseudonyme.',
  invalid_email: 'Vérifie ton adresse email : elle sert à te répondre.',
  empty: 'Écris un message, enregistre un vocal ou ajoute un fichier.',
  file_type: 'Ce type de fichier n’est pas accepté (images, PDF, documents Word ou texte, audio).',
  file_size: 'Un fichier est trop lourd (images 12 Mo, documents 15 Mo, audio 25 Mo, 60 Mo au total).',
  too_many_files: '6 fichiers au maximum par message.',
  rate_limited: 'Beaucoup de messages en peu de temps : réessaie dans une heure.',
  login_required: 'Ta connexion a expiré. Reçois un nouveau lien de connexion.',
  upload_failed: 'Les fichiers ne sont pas arrivés. Vérifie ta connexion et réessaie.',
  forbidden: 'Cette action n’est pas autorisée.',
  reserve_abonnes: 'Les Confidences sont réservées aux abonnés.',
};
export const erreur = (code) => ERREURS[code] || 'L’envoi n’a pas fonctionné. Réessaie dans un instant.';

// Création de compte par le site (compte déjà confirmé, pas d'email à attendre). Erreurs : compte_existe, mot_de_passe, email_invalide, trop_de_demandes.
export async function creerCompte({ email, password, prenom = '', source = 'site' }) {
  return api({ action: 'annonce_creer_compte', email, password, prenom, source });
}

export async function api(body, token) {
  const r = await fetch('/api/confidences', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  let data = {};
  try { data = await r.json(); } catch { /* */ }
  if (!r.ok || data.error) { const e = new Error(data.error || `http_${r.status}`); e.code = data.error; e.data = data; throw e; }
  return data;
}

// Envoi complet : création du message, envoi des fichiers, puis finalisation (alertes).
// fichiers : [{ blob, name, duration }]
// Certains téléphones ne donnent pas le type des fichiers : on le déduit de l'extension.
const PAR_EXTENSION = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac' };
const typeDe = (f) => (f.blob.type && f.blob.type !== 'application/octet-stream' ? f.blob.type : PAR_EXTENSION[String(f.name || f.blob.name || '').split('.').pop().toLowerCase()] || 'application/octet-stream');

export async function envoyer(premier, fichiers, token, progression = () => {}) {
  const meta = fichiers.map((f) => ({ type: typeDe(f), size: f.blob.size, name: f.name || '', duration: f.duration || 0 }));
  const res = await api({ ...premier, files: meta }, token);
  for (const [i, up] of (res.uploads || []).entries()) {
    progression(i + 1, res.uploads.length);
    const r = await fetch(up.url, { method: 'PUT', headers: { apikey: PUBLIC_KEY, 'Content-Type': up.type, 'x-upsert': 'false' }, body: fichiers[i].blob });
    if (!r.ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' });
  }
  if (!res.message_id) return res; // piège à robots
  const fin = await api({ action: 'finaliser', message_id: res.message_id, token: res.token });
  return { ...res, ...fin };
}

// Affiche les pièces jointes d'un message (vocal, image, document).
export function piecesHtml(files = []) {
  return files.map((f) => {
    if (!f.url) return '<p class="conf-piece">Fichier indisponible</p>';
    if (f.kind === 'audio') return `<audio class="conf-audio" controls preload="none" src="${esc(f.url)}"></audio>`;
    if (f.kind === 'image') return `<a class="conf-image" href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="${esc(f.original_name || 'Image')}" loading="lazy"></a>`;
    return `<a class="conf-doc" href="${esc(f.url)}" target="_blank" rel="noopener"><svg class="ico" aria-hidden="true"><use href="/icones.svg#file-text"/></svg> ${esc(f.original_name || 'Document')} <small>${taille(f.size_bytes)}</small></a>`;
  }).join('');
}

// Matchs en cours au complet : avec qui (prénom s'il est partagé, sinon numéro de profil), pour proposer de dématcher ou de s'abonner.
export async function matchsOuverts(token) {
  try { const r = await api({ action: 'annonce_discussions' }, token); return (r.discussions || []).filter((d) => d.ouverte && !d.dematch); } catch { return []; }
}
export const SECURITE_APPLI = 'Reste sur l’application tant que tu n’es pas sûr·e : ton numéro et tes réseaux restent protégés.';
export function matchPleinHtml(ouverts, { formule = '', algerie = false } = {}) {
  const noms = ouverts.map((d) => `<strong>${esc(d.avec)}</strong>`);
  const avec = noms.length ? noms.join(noms.length > 2 ? ', ' : ' et ') : '';
  const dematch = ouverts.length === 1
    ? `<a class="po-btn" href="/mon-espace/#dematcher-${encodeURIComponent(ouverts[0].id)}">Dématcher avec ${esc(ouverts[0].avec)}</a>`
    : '<a class="po-btn" href="/mon-espace/#discussion">Choisir le match à terminer</a>';
  const abo = algerie
    ? '<p>Tu vis en Algérie : pour un match de plus, <a class="text-link" href="/salon/">viens au live de Lamia</a>.</p>'
    : formule === 'prestige' ? ''
      : `<p>Tu veux garder ${ouverts.length > 1 ? 'tes matchs' : 'ce match'} <em>et</em> dire oui à ce profil ? <a class="text-link" href="/abonnement/${formule === 'passion' ? '?formule=prestige' : ''}">${formule === 'passion' ? 'Prestige : 5 matchs en même temps' : 'Avec une formule, plusieurs matchs en même temps (2 avec Passion, 5 avec Prestige)'}</a>.</p>`;
  return `<h2>Tu es déjà en match${avec ? ` avec ${avec}` : ''}</h2>
    ${ouverts.length ? `<p>${ouverts.length > 1 ? 'Ces matchs n’étaient pas assez bien pour toi ?' : 'Ce match n’était pas assez bien pour toi ?'} Pour dire oui à ce profil, dématche d’abord, avec élégance : tu choisis la raison et vous avez chacun deux messages pour vous dire au revoir.</p><p class="po-actions">${dematch}</p>` : '<p>Mets fin à un match depuis ton espace pour dire oui à ce profil.</p><p class="po-actions"><a class="po-btn" href="/mon-espace/">Mon espace</a></p>'}
    ${abo}
    <p class="swipe-securite">${SECURITE_APPLI}</p>`;
}
