// Le live de Lamia dans l'appli (12 nov. 2026).
// Quand Lamia ouvre le live depuis sa console (l'outil sur son ordinateur), l'appli le montre :
// le live YouTube dans la rubrique Live, une fenêtre « Lamia est en live » et une boîte à questions.
// Les questions ne sont visibles que par Lamia ; il faut un compte pour en poser une.
import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from './event-tickets.mjs';
import { envoyerPush, genererClesVapid } from './webpush.mjs';
import { envoyerNouveautes } from './nouveautes.mjs';

export const YOUTUBE_CHAINE = 'UCw9wm85Fnv7gpzDLtgYsCfQ';
export const YOUTUBE_LIVE = `https://www.youtube.com/embed/live_stream?channel=${YOUTUBE_CHAINE}&autoplay=1&mute=1&playsinline=1`;
// Le live dans l'appli vient uniquement de YouTube (Lamia, 15 nov. 2026).
export const YOUTUBE_PAGE_LIVE = `https://www.youtube.com/channel/${YOUTUBE_CHAINE}/live`;
export const PAGE_LIVE = '/salon/#en-direct';
export const MAX_QUESTIONS = 3; // par personne et par live
export const DUREE_MAX_H = 5; // un live oublié ouvert se ferme seul au bout de 5 heures
const STATUTS = ['nouvelle', 'choisie', 'repondue', 'ecartee'];
const SITE = 'https://lamia-femme-berbere.com';
const REF_OUTIL = 5001; // en dessous : numéro d'annonce du site ; à partir de là : fiche de l'outil
const CHAMPS_ANNONCE = 'ref,prenom,genre,birth_date,ville,pays,status,email,user_id,en_match,bloque_at,pause_at';
const CHAMPS_FICHE = 'ref,genre,age,ville,pays,user_id,retire_at,bloque_at,pause_at';
// Les boutons que Lamia peut joindre à son message : toujours une page du site, jamais un lien libre.
export const FORMULES_OFFRABLES = ['passion', 'prestige'];
export const BOUTONS = {
  abonnement: { phrase: 'Pour choisir ta formule, c’est ici :', lien: `${SITE}/abonnement/` },
  profil: { phrase: 'Pour compléter ton profil, c’est ici :', lien: `${SITE}/mon-espace/` },
};
const TYPES_ERREUR = ['appel', 'page', 'reseau']; // un appel au site qui échoue, une erreur dans la page, plus de réseau
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// L'état du live tel que le voit le public : en direct ou non, depuis quand, le titre du soir.
export function etatPublic(v, now = new Date()) {
  const debut = v?.debut ? new Date(v.debut) : null;
  const actif = Boolean(v?.actif && debut && now - debut < DUREE_MAX_H * 3600e3);
  return { actif, debut: actif ? debut.toISOString() : null, titre: actif ? clean(v.titre, 140) : '', youtube: YOUTUBE_LIVE, youtube_page: YOUTUBE_PAGE_LIVE };
}

export async function lireEtat(read) {
  const [row] = await read('/rest/v1/platform_settings?key=eq.live_etat&select=value').catch(() => []);
  return row?.value || null;
}

export async function handleLive(action, b, { env = process.env, fetcher = fetch, call, read, insert, patch, user = null, admin = false, now = () => new Date(), ecrire = null } = {}) {
  const saveEtat = (value) => call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'live_etat', value, updated_at: now().toISOString() }) });
  // La console de Lamia s'identifie avec la clé de liaison de l'outil (comme la synchronisation des profils).
  const cleOk = async () => {
    if (admin) return true;
    const cle = clean(b.cle, 120);
    if (cle.length < 30) return false;
    const [row] = await read('/rest/v1/platform_settings?key=eq.outil_liaison&select=value').catch(() => []);
    const h = row?.value?.hash;
    if (!h) return false;
    const x = Buffer.from(createHash('sha256').update(cle).digest('hex')), y = Buffer.from(String(h));
    return x.length === y.length && timingSafeEqual(x, y);
  };
  const brut = await lireEtat(read);
  const etat = etatPublic(brut, now());
  const email = user && (user.email_confirmed_at || user.confirmed_at) ? String(user.email || '').toLowerCase() : '';

  // ---------------------------------------------------------------- public : le live est-il ouvert ? (et mes questions si je suis connecté)
  if (action === 'live_etat') {
    let mes = [];
    if (email && etat.actif) mes = await read(`/rest/v1/live_questions?user_id=eq.${user.id}&live_debut=eq.${encodeURIComponent(etat.debut)}&select=id,texte,statut,created_at&order=created_at.desc`).catch(() => []);
    return json({ ok: true, ...etat, connecte: Boolean(email), mes_questions: mes, max: MAX_QUESTIONS });
  }

  // ---------------------------------------------------------------- un membre pose sa question (compte obligatoire, live ouvert)
  if (action === 'live_question') {
    if (!email) return json({ error: 'login_required' }, 401);
    if (!etat.actif) return json({ error: 'live_ferme' }, 409);
    const texte = clean(b.texte, 500);
    if (texte.length < 5) return json({ error: 'question_vide' }, 400);
    const deja = await read(`/rest/v1/live_questions?user_id=eq.${user.id}&live_debut=eq.${encodeURIComponent(etat.debut)}&select=id`).catch(() => []);
    if (deja.length >= MAX_QUESTIONS) return json({ error: 'trop_de_questions' }, 429);
    const [p] = await read(`/rest/v1/member_profiles?user_id=eq.${user.id}&select=display_name`).catch(() => []);
    const prenom = clean(p?.display_name, 40) || clean(user.user_metadata?.prenom || user.user_metadata?.first_name, 40) || 'Membre';
    const q = await insert('live_questions', { user_id: user.id, prenom, texte, statut: 'nouvelle', live_debut: etat.debut });
    return json({ ok: true, question: { id: q.id, texte: q.texte, statut: q.statut, created_at: q.created_at } });
  }

  // ---------------------------------------------------------------- l'appli signale toute seule une erreur vue par un membre (14 nov. 2026)
  // Pendant le live, quelqu'un dit « ça marche pas » : Lamia voit l'erreur dans sa console, sans que la personne ait rien à faire.
  // Jamais de contenu saisi par le membre : seulement la page, l'appel qui a échoué, le message d'erreur et l'appareil.
  if (action === 'live_erreur') {
    const message = clean(b.message, 300);
    if (!message) return json({ error: 'bad_request' }, 400);
    // Garde-fou : au plus 60 erreurs par minute, tous membres confondus (un appareil qui boucle ne remplit pas la table).
    const recentes = await read(`/rest/v1/erreurs_appli?created_at=gte.${encodeURIComponent(new Date(now().getTime() - 60e3).toISOString())}&select=id&limit=61`).catch(() => []);
    if (recentes.length > 60) return json({ ok: true, ignore: true });
    const statut = Number(b.statut);
    await insert('erreurs_appli', {
      user_id: user?.id || null, type: TYPES_ERREUR.includes(b.type) ? b.type : 'page', message,
      page: clean(b.page, 160), appel: clean(b.appel, 120), statut: Number.isInteger(statut) && statut >= 0 && statut < 1000 ? statut : null,
      appareil: clean(b.appareil, 200), version: clean(b.version, 40),
    }).catch(() => null);
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- console de Lamia
  if (!action.startsWith('live_outil_')) return json({ error: 'unknown_action' }, 400);
  if (!(await cleOk())) return json({ error: 'cle_invalide' }, 403);

  if (action === 'live_outil_ouvrir') {
    // Déjà ouvert : on garde le même live (et on ne renvoie pas la notification).
    if (etat.actif) return json({ ok: true, ...etat, deja: true, envoyes: 0 });
    const titre = clean(b.titre, 140);
    const debut = now().toISOString();
    const r = await saveEtat({ actif: true, debut, titre });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    let envoyes = 0;
    if (b.notifier !== false) {
      const n = await insert('nouveautes', { type: 'live', titre: (titre ? `Lamia est en live : ${titre}` : 'Lamia est en live').slice(0, 140), texte: 'Pose-lui ta question dans l’appli : elle te répond en direct.', lien: PAGE_LIVE, source: 'live' }).catch(() => null);
      if (n) envoyes = (await envoyerNouveautes({ env, fetcher, now, ids: [n.id] }).catch(() => ({ envoyes: 0 }))).envoyes || 0;
    }
    return json({ ok: true, ...etatPublic({ actif: true, debut, titre }, now()), envoyes });
  }
  if (action === 'live_outil_fermer') {
    await saveEtat({ ...(brut || {}), actif: false, fin: now().toISOString() });
    return json({ ok: true, actif: false });
  }
  if (action === 'live_outil_questions') {
    const debut = etat.debut || brut?.debut;
    const questions = debut ? await read(`/rest/v1/live_questions?live_debut=eq.${encodeURIComponent(new Date(debut).toISOString())}&select=id,created_at,prenom,texte,statut&order=created_at.desc&limit=300`) : [];
    return json({ ok: true, ...etat, questions });
  }
  if (action === 'live_outil_statut') {
    const id = clean(b.id, 40), statut = clean(b.statut, 20);
    if (!UUID.test(id) || !STATUTS.includes(statut)) return json({ error: 'bad_request' }, 400);
    const [q] = await read(`/rest/v1/live_questions?id=eq.${id}&select=id,user_id,statut`);
    if (!q) return json({ error: 'not_found' }, 404);
    const avant = q.statut;
    await patch('live_questions', `id=eq.${id}`, { statut, ...(statut === 'choisie' ? { choisie_at: now().toISOString() } : {}) });
    // La personne est prévenue sur son téléphone quand Lamia lit sa question : elle vient écouter la réponse.
    let prevenu = 0;
    if (statut === 'choisie' && avant !== 'choisie' && q.user_id) {
      const subs = await read(`/rest/v1/push_subscriptions?user_id=eq.${q.user_id}&select=id,endpoint,p256dh,auth`).catch(() => []);
      if (subs.length) {
        const [k] = await read('/rest/v1/platform_settings?key=eq.vapid&select=value').catch(() => []);
        const keys = k?.value?.publicKey ? k.value : genererClesVapid();
        for (const s of subs) {
          const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: 'Lamia lit ta question en direct', body: 'Viens vite : elle te répond maintenant.', url: PAGE_LIVE, tag: `live-question-${id}`, icon: '/images/marque/notif-live.png' }, keys, { fetcher }).catch(() => ({ ok: false }));
          if (r.ok) prevenu += 1;
          if (r.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    }
    return json({ ok: true, prevenu });
  }

  // ---------------------------------------------------------------- les erreurs remontées par l'appli, avec la personne concernée
  if (action === 'live_outil_erreurs') {
    const depuis = new Date(now().getTime() - 3 * 86400e3).toISOString();
    const lignes = await read(`/rest/v1/erreurs_appli?created_at=gte.${encodeURIComponent(depuis)}&select=id,created_at,user_id,type,message,page,appel,statut,appareil,version,vue_at&order=created_at.desc&limit=150`).catch(() => []);
    const ids = [...new Set(lignes.map((l) => l.user_id).filter((x) => /^[\w-]{1,64}$/.test(String(x))))];
    const [annonces, profils] = ids.length ? await Promise.all([
      read(`/rest/v1/annonces?user_id=in.(${ids.join(',')})&select=user_id,ref,prenom,status`).catch(() => []),
      read(`/rest/v1/member_profiles?user_id=in.(${ids.join(',')})&select=user_id,display_name`).catch(() => []),
    ]) : [[], []];
    const qui = new Map();
    for (const p of profils) qui.set(p.user_id, { prenom: clean(p.display_name, 40), ref: null });
    for (const a of annonces) qui.set(a.user_id, { prenom: clean(a.prenom, 40) || qui.get(a.user_id)?.prenom || '', ref: a.ref ?? null });
    const erreurs = lignes.map((l) => ({ id: l.id, at: l.created_at, type: l.type, message: l.message, page: l.page, appel: l.appel, statut: l.statut, appareil: l.appareil, version: l.version, vue: Boolean(l.vue_at), connecte: Boolean(l.user_id), prenom: qui.get(l.user_id)?.prenom || '', ref: qui.get(l.user_id)?.ref ?? null }));
    return json({ ok: true, erreurs, non_vues: erreurs.filter((e) => !e.vue).length });
  }
  if (action === 'live_outil_erreurs_vues') {
    const r = await patch('erreurs_appli', 'vue_at=is.null', { vue_at: now().toISOString() });
    return r.ok ? json({ ok: true }) : json({ error: 'temporary_failure' }, 502);
  }

  // ---------------------------------------------------------------- l'annonce du soir (12 nov. 2026)
  // Lamia prend une annonce, la retravaille en direct et la met en avant. Tout se lit dans sa console.
  const reglage = async (key) => (await read(`/rest/v1/platform_settings?key=eq.${key}&select=value`).catch(() => []))[0]?.value ?? null;
  const sauver = (key, value) => call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_at: now().toISOString() }) });

  if (action === 'live_outil_annonces') {
    const [{ candidats, aCompleter }, choisie, claude] = await Promise.all([candidatsAnnonce(read, now()), reglage('live_annonce'), reglage('live_claude')]);
    let annonce = null;
    if (choisie?.ref) {
      const fiche = [...candidats, ...aCompleter].find((c) => c.ref === choisie.ref) || null;
      annonce = { ref: choisie.ref, titre: choisie.titre || '', texte: choisie.texte || '', at: choisie.at || null, par: choisie.par || '', fiche };
    }
    const notes = (Array.isArray(claude?.notes) ? claude.notes : []).filter((n) => n && n.texte).slice(-12).map((n) => ({ at: n.at || null, texte: clean(n.texte, 700) }));
    return json({ ok: true, actif: etat.actif, annonce, candidats: candidats.slice(0, 30), a_completer: aCompleter, notes });
  }
  if (action === 'live_outil_annonce_choisir') {
    if (b.ref === null) {
      const r = await sauver('live_annonce', {});
      return r.ok ? json({ ok: true, annonce: null }) : json({ error: 'temporary_failure' }, 502);
    }
    const ref = Number(b.ref);
    if (!Number.isInteger(ref) || ref < 1) return json({ error: 'bad_request' }, 400);
    const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&status=eq.publiee&select=ref,test,bloque_at,anonyme_ok`).catch(() => []);
    // Jamais un profil bloqué, de test, ou qui a refusé l'affichage anonyme.
    if (!a || a.test || a.bloque_at || a.anonyme_ok === false) return json({ error: 'annonce_indisponible' }, 409);
    const avant = await reglage('live_annonce');
    const meme = avant?.ref === ref ? avant : {};
    const valeur = { ref, titre: b.titre === undefined ? meme.titre || '' : clean(b.titre, 90), texte: b.texte === undefined ? meme.texte || '' : clean(b.texte, 600), at: now().toISOString(), par: 'lamia' };
    const r = await sauver('live_annonce', valeur);
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    // Montrée à l'écran : elle compte comme passée (une fois par jour), pour que la suivante remonte.
    if (b.ecran === true) {
      const jour = now().toISOString().slice(0, 10);
      const liste = (await reglage('live_annonces_passees'))?.liste || [];
      if (!liste.some((p) => p.ref === ref && String(p.at).slice(0, 10) === jour)) await sauver('live_annonces_passees', { liste: [...liste, { ref, at: now().toISOString() }].slice(-400) });
    }
    return json({ ok: true, annonce: valeur });
  }
  if (action === 'live_outil_annonce_avant') {
    const ref = Number(b.ref);
    if (!Number.isInteger(ref) || ref < 1) return json({ error: 'bad_request' }, 400);
    const [a] = await read(`/rest/v1/annonces?ref=eq.${ref}&status=eq.publiee&select=ref,user_id,avant_jusqu_a`).catch(() => []);
    if (!a) return json({ error: 'not_found' }, 404);
    const t = now().getTime();
    const deja = a.avant_jusqu_a ? new Date(a.avant_jusqu_a).getTime() : 0;
    // Un second clic le même soir ne rallonge pas : le profil est déjà en tête pour la semaine.
    if (deja > t + (JOURS_EN_AVANT - 1) * 86400e3) return json({ ok: true, jusqu_a: a.avant_jusqu_a, deja: true });
    const fin = new Date(Math.max(deja, t) + JOURS_EN_AVANT * 86400e3).toISOString();
    const r = await patch('annonces', `ref=eq.${ref}`, { avant_jusqu_a: fin });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    if (a.user_id) await patch('profils_outil', `user_id=eq.${a.user_id}`, { avant_jusqu_a: fin }).catch(() => null);
    return json({ ok: true, jusqu_a: fin });
  }

  // ---------------------------------------------------------------- « L'appli et moi » (15 nov. 2026)
  // Lamia tape un numéro dans sa console : elle voit où en est la personne et peut lui écrire.
  // Un seul numéro par personne : le plus court. Le numéro long de la fiche du live mène à la même personne.
  // Jamais de téléphone, d'email ni de photo renvoyés à la console (elle peut être visible pendant le live).
  const trouverMembre = async (num) => {
    let a = null, f = null;
    if (num < REF_OUTIL) [a] = await read(`/rest/v1/annonces?ref=eq.${num}&select=${CHAMPS_ANNONCE}`).catch(() => []);
    else {
      [f] = await read(`/rest/v1/profils_outil?ref=eq.${num}&select=${CHAMPS_FICHE}`).catch(() => []);
      if (f?.user_id) [a] = await read(`/rest/v1/annonces?user_id=eq.${f.user_id}&select=${CHAMPS_ANNONCE}&order=ref.asc&limit=1`).catch(() => []);
    }
    if (a?.user_id && !f) [f] = await read(`/rest/v1/profils_outil?user_id=eq.${a.user_id}&select=${CHAMPS_FICHE}&order=ref.asc&limit=1`).catch(() => []);
    return a || f ? { a: a || null, f: f || null } : null;
  };
  if (action === 'live_outil_membre' || action === 'live_outil_membre_ecrire' || action === 'live_outil_membre_formule') {
    const num = Number(b.ref);
    if (!Number.isInteger(num) || num < 1 || num > 9999999) return json({ error: 'bad_request' }, 400);
    const m = await trouverMembre(num);
    if (!m) return json({ error: 'not_found' }, 404);
    const { a, f } = m;
    const mail = a?.email ? String(a.email).toLowerCase() : '';
    const userId = a?.user_id || f?.user_id || null;

    if (action === 'live_outil_membre_ecrire') {
      const texte = clean(b.texte, 1500);
      const bouton = b.bouton ? BOUTONS[String(b.bouton)] : null;
      if (b.bouton && !bouton) return json({ error: 'bad_request' }, 400);
      if (!texte && !bouton) return json({ error: 'empty' }, 400);
      if (!mail || !ecrire) return json({ error: 'injoignable' }, 409);
      const corps = [texte, bouton ? `${bouton.phrase} ${bouton.lien}` : ''].filter(Boolean).join('\n\n');
      const r = await ecrire(mail, corps, a.prenom || '').catch(() => null);
      if (!r) return json({ error: 'temporary_failure' }, 502);
      return json({ ok: true, ref: a.ref, telephones: Number(r.notification) || 0, email: Boolean(r.visiteur) });
    }

    // Lamia offre une formule à qui elle veut (ou la reprend). Un abonnement payé reste prioritaire et n'est jamais touché.
    if (action === 'live_outil_membre_formule') {
      const formule = String(b.formule || '');
      if (!['', ...FORMULES_OFFRABLES].includes(formule)) return json({ error: 'bad_request' }, 400);
      if (!mail) return json({ error: 'injoignable' }, 409);
      const [avant] = await read(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(mail)}&select=formule,raison`).catch(() => []);
      // La formule offerte aux modérateurs se gère dans « Modérateurs » : on ne la retire pas d'ici.
      if (!formule && avant && avant.raison !== 'lamia') return json({ error: 'offre_moderateur' }, 409);
      const del = await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(mail)}`, { method: 'DELETE' }).catch(() => null);
      if (!del?.ok) return json({ error: 'temporary_failure' }, 502);
      if (formule) {
        // Un modérateur reste modérateur : seule sa formule change.
        const ins = await insert('formules_offertes', { email: mail, formule, raison: avant?.raison === 'moderateur' ? 'moderateur' : 'lamia', ref: a.ref }).catch(() => null);
        if (!ins) return json({ error: 'temporary_failure' }, 502);
      }
      return json({ ok: true, ref: a.ref, formule });
    }

    const depuis = new Date(now().getTime() - 3 * 86400e3).toISOString();
    const e = mail ? encodeURIComponent(mail.replace(/[%_\\*(),]/g, '')) : '';
    const [abos, offres, subs, erreurs, fils] = await Promise.all([
      mail ? read(`/rest/v1/abonnements?email=ilike.${e}&statut=in.(actif,impaye)&select=formule,resiliation_prevue,fin_periode&order=created_at.desc&limit=1`).catch(() => []) : [],
      mail ? read(`/rest/v1/formules_offertes?email=ilike.${e}&select=formule&limit=1`).catch(() => []) : [],
      userId ? read(`/rest/v1/push_subscriptions?user_id=eq.${userId}&pour=eq.membre&select=id`).catch(() => []) : [],
      userId ? read(`/rest/v1/erreurs_appli?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(depuis)}&select=created_at,type,message,page,statut&order=created_at.desc&limit=5`).catch(() => []) : [],
      mail ? read(`/rest/v1/confidence_threads?email=eq.${encodeURIComponent(mail)}&channel=eq.conversation&select=last_message_at,unread_lamia&order=last_message_at.desc&limit=1`).catch(() => []) : [],
    ]);
    const abo = abos[0] || null, offre = offres[0] || null;
    const age = a?.birth_date ? Math.floor((now() - new Date(a.birth_date)) / (365.25 * 86400e3)) : f?.age ?? null;
    const src = a || f;
    const etatProfil = a ? ({ publiee: 'validé', a_verifier: 'à valider', brouillon: 'pas fini', refusee: 'à corriger', retiree: 'retiré' })[a.status] || a.status : f.retire_at ? 'fiche retirée' : 'fiche du live, sans annonce sur le site';
    return json({ ok: true, membre: {
      ref: a?.ref ?? f.ref, autre_ref: a && f ? f.ref : null,
      prenom: clean(a?.prenom, 40), genre: src.genre || '', age: Number.isFinite(age) ? age : null, ville: clean(src.ville, 60), pays: clean(src.pays, 60),
      profil: etatProfil, bloque: Boolean(src.bloque_at), pause: Boolean(src.pause_at), en_match: Boolean(a?.en_match),
      compte: Boolean(userId), joignable: Boolean(mail),
      formule: abo ? abo.formule : offre ? offre.formule : '', formule_offerte: !abo && Boolean(offre), resiliation_prevue: Boolean(abo?.resiliation_prevue),
      telephones: subs.length,
      erreurs: erreurs.map((x) => ({ at: x.created_at, type: x.type, message: clean(x.message, 160), page: x.page, statut: x.statut })),
      conversation: fils[0] ? { dernier: fils[0].last_message_at, non_lus: fils[0].unread_lamia || 0 } : null,
    } });
  }
  return json({ error: 'unknown_action' }, 400);
}

export const JOURS_EN_AVANT = 7; // même durée que l'option « Profil mis en avant »
const RANG_FORMULE = { prestige: 0, passion: 1, priorite: 2, '': 3 };

/**
 * Les profils qui peuvent passer en « annonce du soir » : publiés, d'accord pour l'affichage anonyme,
 * ni en pause, ni bloqués, ni déjà en match, avec au moins une photo et un vrai texte.
 * Ordre : ceux qui ne sont pas encore passés, puis Prestige, Passion, passage prioritaire acheté, les autres ;
 * à égalité, le plus ancien d'abord. `aCompleter` : ceux qui ont une formule mais pas de photo ou pas de texte.
 */
export async function candidatsAnnonce(read, now = new Date()) {
  const { sansContact, ageAu } = await import('./annonces.mjs');
  const [annonces, photos, abos, offertes, unites, passees] = await Promise.all([
    read('/rest/v1/annonces?status=eq.publiee&select=id,ref,genre,birth_date,pays,situation,profil,recherche,email,published_at,avant_jusqu_a,test,bloque_at,pause_at,anonyme_ok,en_match&order=published_at.asc&limit=1000'),
    read('/rest/v1/annonce_files?kind=eq.photo&select=annonce_id&limit=5000').catch(() => []),
    read('/rest/v1/abonnements?statut=eq.actif&select=email,formule').catch(() => []),
    read('/rest/v1/formules_offertes?select=email,formule').catch(() => []),
    read('/rest/v1/achats_unite?type=eq.live_priorite&select=email,quantite,utilisees').catch(() => []),
    read('/rest/v1/platform_settings?key=eq.live_annonces_passees&select=value').catch(() => []),
  ]);
  const nbPhotos = new Map();
  for (const p of photos) nbPhotos.set(p.annonce_id, (nbPhotos.get(p.annonce_id) || 0) + 1);
  const formuleDe = new Map();
  const noter = (email, f) => {
    const e = String(email || '').toLowerCase();
    if (!e || !(f in RANG_FORMULE)) return;
    if (!formuleDe.has(e) || RANG_FORMULE[f] < RANG_FORMULE[formuleDe.get(e)]) formuleDe.set(e, f);
  };
  for (const x of [...abos, ...offertes]) noter(x.email, x.formule);
  for (const u of unites) if ((Number(u.quantite) || 0) > (Number(u.utilisees) || 0)) noter(u.email, 'priorite');
  const vu = new Map();
  for (const p of passees[0]?.value?.liste || []) vu.set(p.ref, p.at);

  const tous = annonces
    .filter((a) => !a.test && !a.bloque_at && !a.pause_at && a.anonyme_ok !== false && !a.en_match)
    .map((a) => {
      const profil = sansContact(a.profil).trim();
      const photosNb = nbPhotos.get(a.id) || 0;
      return {
        ref: a.ref, genre: a.genre, age: ageAu(a.birth_date, now), pays: a.pays || '', situation: a.situation || '',
        formule: formuleDe.get(String(a.email || '').toLowerCase()) || '', photos: photosNb, profil, recherche: sansContact(a.recherche).trim(),
        complet: photosNb >= 1 && profil.length >= 40, passe_le: vu.get(a.ref) || null,
        en_avant: Boolean(a.avant_jusqu_a && new Date(a.avant_jusqu_a) > now), publie_le: a.published_at || '',
      };
    });
  const candidats = tous.filter((c) => c.complet).sort((x, y) => Number(Boolean(x.passe_le)) - Number(Boolean(y.passe_le)) || RANG_FORMULE[x.formule] - RANG_FORMULE[y.formule] || String(x.publie_le).localeCompare(String(y.publie_le)));
  const aCompleter = tous.filter((c) => !c.complet && c.formule).sort((x, y) => RANG_FORMULE[x.formule] - RANG_FORMULE[y.formule] || x.ref - y.ref);
  return { candidats, aCompleter };
}
