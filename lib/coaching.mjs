// Espace coaching de la formule Prestige : 1 visio de 15 minutes par mois avec Lamia.
// Lamia ouvre ses créneaux depuis son tableau de bord ; l'abonné·e en réserve un depuis Mon espace.
// La visio passe par une salle Daily privée, créée au moment d'entrer, jamais enregistrée.
import { json } from './event-tickets.mjs';
import { etatAbonnement, consommerUnite, rendreUnite } from './abonnements.mjs';
import { parisVersUTC } from './salons.mjs';
import { daily, ensureRoom, meetingToken } from './bal.mjs';

export const DUREE_MIN = 15;
const PAUSE_MIN = 5; // pour souffler entre deux personnes.
// Chaque durée de créneau correspond à un service. Un créneau ne se réserve qu'avec le service de sa durée.
export const SERVICES = { 15: { unite: 'coaching', nom: 'Visio de 15 minutes' }, 30: { unite: 'coaching_30', nom: 'Coaching de 30 minutes' }, 60: { unite: 'sauver_couple', nom: 'Sauver mon couple' } };
const clean60 = (x) => String(x || '').replace(/[<>]/g, '').trim().slice(0, 60);
const dureeDe = (c) => (SERVICES[c.duree_min] ? c.duree_min : DUREE_MIN);
const MAX_CRENEAUX = 24;
const RESERVER_AVANT_MS = 2 * 3600e3, ANNULER_AVANT_MS = 24 * 3600e3, ENTRER_AVANT_MS = 10 * 60e3, ENTRER_APRES_MS = 15 * 60e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE = '/rest/v1/coaching_creneaux';
const LIEN = '/mon-espace/#coaching';
const PIED = 'Cette visio n’est jamais enregistrée.';
const CHAMPS = 'id,debut,duree_min,mois,user_id,email,prenom,reserve_at,source,achat_id';

// Une salle « avec porte » : sans jeton on frappe, et seule Lamia (propriétaire) fait entrer.
export async function salleAvecPorte(api, name, { exp, max }) {
  const salle = await ensureRoom(api, name, { exp, max });
  const r = await api(`/rooms/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify({ properties: { enable_knocking: true, exp, max_participants: max } }) });
  return r.ok ? r.json().catch(() => salle) : salle;
}
export const SALLE_LAMIA = 'lamia-salle';
// Le fond de la visio suit la prestation : 15 min (Prestige), 30 min (match manuel), 1 h (couple).
const FOND = { 15: 'prestige', 30: 'match-manuel', 60: 'couple' };
const avecNom = (url, nom, duree) => `${url}?n=${encodeURIComponent(clean60(nom) || 'Invité·e')}&f=${FOND[duree] || 'prestige'}`;

export const moisParis = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(new Date(d)).slice(0, 7);
const quandParis = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Les créneaux d'une plage horaire (heure de Paris), avec 5 minutes entre deux personnes.
export function creneauxDe(date, de, a, duree = DUREE_MIN) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(de)) || !/^\d{2}:\d{2}$/.test(String(a))) return null;
  const debut = parisVersUTC(`${date}T${de}`), fin = parisVersUTC(`${date}T${a}`);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin <= debut) return null;
  const out = [];
  for (let t = debut.getTime(); t + duree * 60e3 <= fin.getTime() && out.length < MAX_CRENEAUX; t += (duree + PAUSE_MIN) * 60e3) out.push(new Date(t));
  return out;
}

export async function actionCoaching(action, b, { env, call, read, insert, patch, admin, user, now, alerter, prevenirMembre, etat = etatAbonnement, consommer = consommerUnite, rendre = rendreUnite, jeton = () => '', jetonOk = () => false, fetcher = fetch }) {
  const t = now();
  const creneau = async (id) => (UUID.test(String(id)) ? (await read(`${TABLE}?id=eq.${id}&select=${CHAMPS}`))[0] || null : null);
  const alerte = (titre, lignes) => alerter({ titre, lignes, lien: '/tableau-de-bord#coaching', tag: 'abonnement' }).catch(() => {});

  // ---------------------------------------------------------------- côté Lamia
  if (['annonce_coaching_planning', 'annonce_coaching_ouvrir', 'annonce_coaching_fermer', 'annonce_coaching_prevenir'].includes(action)) {
    if (!admin) return json({ error: 'forbidden' }, 403);
    const abonnes = () => read('/rest/v1/abonnements?formule=eq.prestige&statut=eq.actif&select=email,nom');
    const planning = async () => {
      const depuis = encodeURIComponent(new Date(t.getTime() - 7 * 86400e3).toISOString());
      const [creneaux, abos] = await Promise.all([read(`${TABLE}?debut=gte.${depuis}&select=${CHAMPS}&order=debut.asc&limit=300`), abonnes()]);
      const ce = moisParis(t);
      return json({ ok: true, duree: DUREE_MIN, creneaux, abonnes: abos.map((a) => ({ nom: a.nom, email: a.email, reserve: creneaux.find((c) => c.mois === ce && String(c.email || '').toLowerCase() === String(a.email).toLowerCase())?.debut || null })) });
    };
    if (action === 'annonce_coaching_planning') return planning();
    if (action === 'annonce_coaching_ouvrir') {
      const duree = SERVICES[b.duree] ? Number(b.duree) : DUREE_MIN;
      const liste = creneauxDe(b.date, b.de, b.a, duree);
      if (!liste?.length) return json({ error: 'plage_invalide' }, 400);
      if (liste[0] <= t) return json({ error: 'plage_passee' }, 400);
      // Pas de créneau qui en chevauche un autre déjà ouvert.
      const jour = encodeURIComponent(new Date(liste[0].getTime() - 60 * 60e3).toISOString());
      const pris = (await read(`${TABLE}?debut=gte.${jour}&select=debut,duree_min&order=debut.asc&limit=300`)).map((c) => [new Date(c.debut).getTime(), dureeDe(c) * 60e3]);
      const lignes = liste.filter((d) => !pris.some(([p, l]) => d.getTime() < p + l && p < d.getTime() + duree * 60e3)).map((d) => ({ debut: d.toISOString(), duree_min: duree, mois: moisParis(d) }));
      if (lignes.length) {
        const r = await call(`${TABLE}?on_conflict=debut`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal', 'Content-Type': 'application/json' }, body: JSON.stringify(lignes) });
        if (!r.ok) return json({ error: 'temporary_failure' }, 502);
      }
      return planning();
    }
    if (action === 'annonce_coaching_fermer') {
      const c = await creneau(b.id);
      if (!c) return json({ error: 'not_found' }, 404);
      const r = await call(`${TABLE}?id=eq.${c.id}`, { method: 'DELETE' });
      if (!r.ok) return json({ error: 'temporary_failure' }, 502);
      if (c.user_id && c.achat_id && new Date(c.debut) > t) await rendre(c.achat_id, { env }).catch(() => {});
      if (c.user_id && new Date(c.debut) > t) await prevenirMembre({ user_id: c.user_id, email: c.email, prenom: c.prenom }, { titre: '{A}, ta visio avec Lamia est annulée', texte: `Lamia ne peut pas assurer votre visio du ${quandParis(c.debut)} (heure de Paris). Choisis un autre créneau dans ton espace : ta visio du mois reste due.`, bouton: 'Choisir un créneau', lien: LIEN, pied: PIED }).catch(() => {});
      return planning();
    }
    // Sur demande de Lamia seulement : les abonnés Prestige sans visio réservée ce mois-ci apprennent que des créneaux sont ouverts.
    const ce = moisParis(t);
    const reserves = new Set((await read(`${TABLE}?mois=eq.${ce}&user_id=not.is.null&source=eq.inclus&select=email`)).map((c) => String(c.email).toLowerCase()));
    let prevenus = 0;
    for (const a of await abonnes()) {
      if (reserves.has(String(a.email).toLowerCase())) continue;
      const mail = encodeURIComponent(String(a.email).replace(/[%_*,()]/g, ''));
      const [p] = await read(`/rest/v1/annonces?email=ilike.${mail}&select=user_id,genre,prenom&limit=1`).catch(() => []);
      await prevenirMembre({ user_id: p?.user_id || null, email: a.email, genre: p?.genre, prenom: p?.prenom }, { titre: '{A}, réserve ta visio avec Lamia', texte: 'Ta formule Prestige comprend une visio de 15 minutes par mois avec Lamia. Ses créneaux sont ouverts : choisis le tien dans ton espace.', bouton: 'Choisir mon créneau', lien: LIEN, pied: PIED }).catch(() => {});
      prevenus += 1;
    }
    return json({ ok: true, prevenus });
  }

  // ---------------------------------------------------------------- la salle de Lamia, ouverte quand elle veut
  // Pour tester sa caméra et son fond, ou recevoir quelqu'un : elle y entre en propriétaire, les autres frappent.
  if (action === 'annonce_coaching_ma_salle') {
    if (!admin) return json({ error: 'forbidden' }, 403);
    if (!env.DAILY_API_KEY) return json({ error: 'video_not_configured' }, 503);
    try {
      const api = daily(env, fetcher), exp = Math.floor(t.getTime() / 1000) + 4 * 3600;
      const salle = await salleAvecPorte(api, SALLE_LAMIA, { exp, max: 13 });
      const j = await meetingToken(api, { room_name: salle.name, exp, is_owner: true, user_name: 'Lamia' });
      return json({ ok: true, url: `${salle.url}?t=${encodeURIComponent(j)}`, invitation: salle.url });
    } catch { return json({ error: 'video_indisponible' }, 502); }
  }

  // ---------------------------------------------------------------- le conjoint, avec le lien transmis, sans compte
  // Le lien change si le créneau est annulé puis repris par quelqu'un d'autre.
  const signature = (c) => `${c.id}.${c.reserve_at}`;
  if (action === 'annonce_coaching_invite') {
    const c = await creneau(b.c);
    if (!c?.user_id || dureeDe(c) !== 60 || !jetonOk(signature(c), b.t)) return json({ error: 'lien_invalide' }, 403);
    const debut = new Date(c.debut).getTime(), fin = debut + dureeDe(c) * 60e3 + ENTRER_APRES_MS;
    if (b.entrer !== true) return json({ ok: true, debut: c.debut, duree: dureeDe(c) });
    if (t.getTime() < debut - ENTRER_AVANT_MS) return json({ error: 'trop_tot', debut: c.debut }, 409);
    if (t.getTime() > fin) return json({ error: 'terminee' }, 409);
    if (!env.DAILY_API_KEY) return json({ error: 'video_not_configured' }, 503);
    try {
      const api = daily(env, fetcher), exp = Math.floor(fin / 1000);
      const salle = await salleAvecPorte(api, `coaching-${c.id}`, { exp, max: 3 });
      return json({ ok: true, url: avecNom(salle.url, b.nom, 60) });
    } catch { return json({ error: 'video_indisponible' }, 502); }
  }

  // ---------------------------------------------------------------- côté abonné·e
  if (!user?.email) return json({ error: 'login_required' }, 401);
  const droit = async () => {
    if (admin) return { inclus: true, prestige: true, credits: 0, unites: {} };
    const e = await etat(user.email, { env }).catch(() => ({}));
    const unites = e.unites || {};
    const credits = Object.values(SERVICES).reduce((n, s) => n + (unites[s.unite] || 0), 0);
    if (e.abonnement?.formule !== 'prestige') return { inclus: credits > 0, prestige: false, credits, unites };
    return { inclus: true, prestige: true, credits, unites, impaye: !['actif', 'offert'].includes(e.abonnement.statut) };
  };
  // Lamia peut réserver un créneau tout proche, pour essayer la visio elle-même.
  const miens = () => read(`${TABLE}?user_id=eq.${user.id}&select=${CHAMPS}&order=debut.desc&limit=24`);
  const vue = async () => {
    const d = await droit();
    const mes = await miens();
    const prochaine = mes.filter((c) => new Date(c.debut).getTime() + (dureeDe(c) * 60e3) + ENTRER_APRES_MS > t.getTime()).sort((x, y) => String(x.debut).localeCompare(String(y.debut)))[0] || null;
    // Le crédit est consommé à la réservation : la visio réservée doit rester visible, sinon on ne pourrait plus y entrer.
    if (!d.inclus && !prochaine) return json({ ok: true, inclus: false, offre: true });
    // La visio du mois de Prestige : une par mois. Une visio achetée à l'unité se réserve quand on veut.
    const prestigeLibre = d.prestige && !d.impaye;
    const moisPris = new Set(prestigeLibre && !d.unites.coaching ? mes.filter((c) => (c.source || 'inclus') === 'inclus').map((c) => c.mois) : []);
    const permis = (c) => { const n = dureeDe(c); return admin || (d.unites[SERVICES[n].unite] || 0) > 0 || (n === DUREE_MIN && prestigeLibre && !moisPris.has(c.mois)); };
    const peutReserver = prestigeLibre || d.credits > 0;
    const depuis = encodeURIComponent(new Date(t.getTime() + (admin ? 0 : RESERVER_AVANT_MS)).toISOString());
    const libres = !peutReserver ? [] : (await read(`${TABLE}?user_id=is.null&debut=gte.${depuis}&select=id,debut,mois,duree_min&order=debut.asc&limit=150`)).filter(permis);
    return json({ ok: true, inclus: true, prestige: Boolean(prestigeLibre), credits: d.credits, impaye: Boolean(d.impaye), duree: DUREE_MIN, restant: Object.fromEntries(Object.entries(SERVICES).map(([n, s]) => [n, d.unites[s.unite] || 0])), prochaine: prochaine && { id: prochaine.id, debut: prochaine.debut, duree: dureeDe(prochaine), nom: SERVICES[dureeDe(prochaine)].nom, invitation: dureeDe(prochaine) === 60 ? `https://lamia-femme-berbere.com/rencontres/visio/?c=${prochaine.id}&t=${jeton(signature(prochaine))}` : undefined, annulable: new Date(prochaine.debut).getTime() - t.getTime() >= ANNULER_AVANT_MS }, creneaux: libres.map((c) => ({ id: c.id, debut: c.debut, duree: dureeDe(c), nom: SERVICES[dureeDe(c)].nom })) });
  };

  if (action === 'annonce_coaching') return vue();

  if (action === 'annonce_coaching_reserver') {
    const d = await droit();
    if (!d.inclus) return json({ error: 'formule_requise' }, 403);
    if (d.impaye && !d.credits) return json({ error: 'paiement_a_regulariser' }, 409);
    const c = await creneau(b.id);
    if (!c) return json({ error: 'not_found' }, 404);
    if (new Date(c.debut).getTime() - t.getTime() < (admin ? 0 : RESERVER_AVANT_MS)) return json({ error: 'creneau_passe' }, 409);
    // D'abord la visio incluse dans Prestige ce mois-là, sinon une visio achetée.
    const duree = dureeDe(c), service = SERVICES[duree];
    const essaiLamia = admin && duree !== DUREE_MIN;
    const inclusLibre = duree === DUREE_MIN && d.prestige && !d.impaye && !(await miens()).some((x) => x.mois === c.mois && (x.source || 'inclus') === 'inclus');
    if (!inclusLibre && !essaiLamia && !d.unites[service.unite]) return json({ error: duree === DUREE_MIN ? 'deja_ce_mois' : 'service_requis' }, 409);
    const achatId = inclusLibre || essaiLamia ? null : await consommer(user.email, service.unite, { env }).catch(() => null);
    if (!inclusLibre && !essaiLamia && !achatId) return json({ error: 'deja_ce_mois' }, 409);
    const prenom = String(user.user_metadata?.first_name || '').slice(0, 60) || null;
    // Écriture conditionnelle : si deux personnes cliquent en même temps, une seule obtient le créneau.
    const r = await call(`${TABLE}?id=eq.${c.id}&user_id=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, email: user.email.toLowerCase(), prenom, reserve_at: t.toISOString(), source: inclusLibre ? 'inclus' : 'unite', achat_id: achatId }) });
    const rendreSiEchec = () => (achatId ? rendre(achatId, { env }).catch(() => {}) : null);
    if (r.status === 409) { await rendreSiEchec(); return json({ error: 'deja_ce_mois' }, 409); }
    if (!r.ok) { await rendreSiEchec(); return json({ error: 'temporary_failure' }, 502); }
    if (!(await r.json()).length) { await rendreSiEchec(); return json({ error: 'creneau_pris' }, 409); }
    await prevenirMembre({ user_id: user.id, email: user.email, prenom }, { titre: '{A}, ta visio avec Lamia est réservée', texte: `Rendez-vous le ${quandParis(c.debut)} (heure de Paris), pour ${duree} minutes. Tu entres dans la visio depuis ton espace, à partir de 10 minutes avant.`, bouton: 'Mon espace coaching', lien: LIEN, pied: PIED }).catch(() => {});
    await alerte(`${service.nom} réservé · ${quandParis(c.debut)}`, [`${prenom || ''} · ${user.email}`]);
    return vue();
  }

  if (action === 'annonce_coaching_annuler') {
    const c = await creneau(b.id);
    if (!c || c.user_id !== user.id) return json({ error: 'not_found' }, 404);
    if (new Date(c.debut).getTime() - t.getTime() < ANNULER_AVANT_MS) return json({ error: 'trop_tard' }, 409);
    const achat = c.achat_id;
    await patch('coaching_creneaux', `id=eq.${c.id}`, { user_id: null, email: null, prenom: null, reserve_at: null, rappel_at: null, source: 'inclus', achat_id: null });
    if (achat) await rendre(achat, { env }).catch(() => {});
    await alerte(`Coaching annulé · ${quandParis(c.debut)}`, [`${c.prenom || ''} · ${user.email}`, 'Le créneau est de nouveau libre.']);
    return vue();
  }

  if (action === 'annonce_coaching_rejoindre') {
    const c = await creneau(b.id);
    if (!c || (c.user_id !== user.id && !admin)) return json({ error: 'not_found' }, 404);
    const debut = new Date(c.debut).getTime();
    // Lamia peut ouvrir sa salle quand elle veut avant l'heure (pour tester) ; le membre, 10 minutes avant.
    if (!admin && t.getTime() < debut - ENTRER_AVANT_MS) return json({ error: 'trop_tot' }, 409);
    const duree = dureeDe(c);
    if (t.getTime() > debut + duree * 60e3 + ENTRER_APRES_MS) return json({ error: 'terminee' }, 409);
    if (!env.DAILY_API_KEY) return json({ error: 'video_not_configured' }, 503);
    const exp = Math.floor((debut + duree * 60e3 + ENTRER_APRES_MS) / 1000);
    const api = daily(env, fetcher);
    try {
      // Lamia dirige la salle (jeton de propriétaire) ; le membre frappe à la porte et attend qu'elle le fasse entrer.
      const salle = await salleAvecPorte(api, `coaching-${c.id}`, { exp, max: duree === 60 ? 3 : 2 });
      if (!admin) return json({ ok: true, url: avecNom(salle.url, c.prenom || 'Moi', duree) });
      const j = await meetingToken(api, { room_name: salle.name, exp, is_owner: true, user_name: 'Lamia' });
      return json({ ok: true, url: `${salle.url}?t=${encodeURIComponent(j)}&f=${FOND[duree] || 'prestige'}` });
    } catch { return json({ error: 'video_indisponible' }, 502); }
  }
  return json({ error: 'bad_request' }, 400);
}

// Chaque jour : le rappel des visios à venir dans les 30 prochaines heures.
export async function rappelsCoaching({ read, patch, now, alerter, prevenirMembre }) {
  const t = now();
  const de = encodeURIComponent(t.toISOString()), a = encodeURIComponent(new Date(t.getTime() + 30 * 3600e3).toISOString());
  const liste = await read(`${TABLE}?user_id=not.is.null&rappel_at=is.null&debut=gte.${de}&debut=lt.${a}&select=${CHAMPS}`);
  for (const c of liste) {
    await patch('coaching_creneaux', `id=eq.${c.id}`, { rappel_at: t.toISOString() });
    await prevenirMembre({ user_id: c.user_id, email: c.email, prenom: c.prenom }, { titre: '{A}, ta visio avec Lamia approche', texte: `Rendez-vous le ${quandParis(c.debut)} (heure de Paris). Tu entres dans la visio depuis ton espace, à partir de 10 minutes avant.`, bouton: 'Mon espace coaching', lien: LIEN, pied: PIED }).catch(() => {});
    await alerter({ titre: `Coaching à venir · ${quandParis(c.debut)}`, lignes: [`${c.prenom || ''} · ${c.email}`], lien: '/tableau-de-bord#coaching', tag: 'abonnement' }).catch(() => {});
  }
  return liste.length;
}
