// Espace coaching de la formule Prestige : 1 visio de 15 minutes par mois avec Lamia.
// Lamia ouvre ses créneaux depuis son tableau de bord ; l'abonné·e en réserve un depuis Mon espace.
// La visio passe par une salle Daily privée, créée au moment d'entrer, jamais enregistrée.
import { json } from './event-tickets.mjs';
import { etatAbonnement } from './abonnements.mjs';
import { parisVersUTC } from './salons.mjs';
import { daily, ensureRoom, meetingToken } from './bal.mjs';

export const DUREE_MIN = 15;
export const PAS_MIN = 20; // 15 minutes de visio et 5 minutes pour souffler entre deux personnes.
const MAX_CRENEAUX = 24;
const RESERVER_AVANT_MS = 2 * 3600e3, ANNULER_AVANT_MS = 24 * 3600e3, ENTRER_AVANT_MS = 10 * 60e3, ENTRER_APRES_MS = 15 * 60e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE = '/rest/v1/coaching_creneaux';
const LIEN = '/mon-espace/#coaching';
const PIED = 'Cette visio n’est jamais enregistrée.';
const CHAMPS = 'id,debut,duree_min,mois,user_id,email,prenom,reserve_at';

export const moisParis = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(new Date(d)).slice(0, 7);
const quandParis = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Les créneaux d'une plage horaire (heure de Paris), espacés de 20 minutes.
export function creneauxDe(date, de, a) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(de)) || !/^\d{2}:\d{2}$/.test(String(a))) return null;
  const debut = parisVersUTC(`${date}T${de}`), fin = parisVersUTC(`${date}T${a}`);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin <= debut) return null;
  const out = [];
  for (let t = debut.getTime(); t + DUREE_MIN * 60e3 <= fin.getTime() && out.length < MAX_CRENEAUX; t += PAS_MIN * 60e3) out.push(new Date(t));
  return out;
}

export async function actionCoaching(action, b, { env, call, read, insert, patch, admin, user, now, alerter, prevenirMembre, etat = etatAbonnement, fetcher = fetch }) {
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
      const liste = creneauxDe(b.date, b.de, b.a);
      if (!liste?.length) return json({ error: 'plage_invalide' }, 400);
      if (liste[0] <= t) return json({ error: 'plage_passee' }, 400);
      // Pas de créneau qui en chevauche un autre déjà ouvert.
      const jour = encodeURIComponent(new Date(liste[0].getTime() - DUREE_MIN * 60e3).toISOString());
      const pris = (await read(`${TABLE}?debut=gte.${jour}&select=debut&order=debut.asc&limit=300`)).map((c) => new Date(c.debut).getTime());
      const lignes = liste.filter((d) => !pris.some((p) => Math.abs(p - d.getTime()) < DUREE_MIN * 60e3)).map((d) => ({ debut: d.toISOString(), duree_min: DUREE_MIN, mois: moisParis(d) }));
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
      if (c.user_id && new Date(c.debut) > t) await prevenirMembre({ user_id: c.user_id, email: c.email, prenom: c.prenom }, { titre: '{A}, ta visio avec Lamia est annulée', texte: `Lamia ne peut pas assurer votre visio du ${quandParis(c.debut)} (heure de Paris). Choisis un autre créneau dans ton espace : ta visio du mois reste due.`, bouton: 'Choisir un créneau', lien: LIEN, pied: PIED }).catch(() => {});
      return planning();
    }
    // Sur demande de Lamia seulement : les abonnés Prestige sans visio réservée ce mois-ci apprennent que des créneaux sont ouverts.
    const ce = moisParis(t);
    const reserves = new Set((await read(`${TABLE}?mois=eq.${ce}&user_id=not.is.null&select=email`)).map((c) => String(c.email).toLowerCase()));
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

  // ---------------------------------------------------------------- côté abonné·e
  if (!user?.email) return json({ error: 'login_required' }, 401);
  const offertes = () => read(`/rest/v1/achats_unite?email=ilike.${encodeURIComponent(String(user.email).toLowerCase().replace(/[%*,()]/g, ''))}&type=eq.coaching&select=id,quantite,utilisees&order=created_at.asc`).catch(() => []);
  const droit = async () => {
    if (admin) return { inclus: true };
    const a = (await etat(user.email, { env }).catch(() => ({}))).abonnement;
    if (a?.formule === 'prestige') return { inclus: true, impaye: a.statut !== 'actif' };
    // Une visio offerte par Lamia.
    const offerte = (await offertes()).find((x) => x.utilisees < x.quantite);
    return offerte ? { inclus: true, offerte } : { inclus: false };
  };
  // Lamia peut réserver un créneau tout proche, pour essayer la visio elle-même.
  const miens = () => read(`${TABLE}?user_id=eq.${user.id}&select=${CHAMPS}&order=debut.desc&limit=24`);
  const vue = async () => {
    const d = await droit();
    if (!d.inclus) return json({ ok: true, inclus: false });
    const mes = await miens();
    const prochaine = mes.filter((c) => new Date(c.debut).getTime() + ENTRER_APRES_MS > t.getTime()).sort((x, y) => String(x.debut).localeCompare(String(y.debut)))[0] || null;
    const moisPris = new Set(mes.map((c) => c.mois));
    const depuis = encodeURIComponent(new Date(t.getTime() + (admin ? 0 : RESERVER_AVANT_MS)).toISOString());
    const libres = d.impaye ? [] : (await read(`${TABLE}?user_id=is.null&debut=gte.${depuis}&select=id,debut,mois&order=debut.asc&limit=80`)).filter((c) => !moisPris.has(c.mois));
    return json({ ok: true, inclus: true, impaye: Boolean(d.impaye), duree: DUREE_MIN, prochaine: prochaine && { id: prochaine.id, debut: prochaine.debut, annulable: new Date(prochaine.debut).getTime() - t.getTime() >= ANNULER_AVANT_MS }, creneaux: libres.map(({ id, debut }) => ({ id, debut })) });
  };

  if (action === 'annonce_coaching') return vue();

  if (action === 'annonce_coaching_reserver') {
    const d = await droit();
    if (!d.inclus) return json({ error: 'formule_requise' }, 403);
    if (d.impaye) return json({ error: 'paiement_a_regulariser' }, 409);
    const c = await creneau(b.id);
    if (!c) return json({ error: 'not_found' }, 404);
    if (new Date(c.debut).getTime() - t.getTime() < (admin ? 0 : RESERVER_AVANT_MS)) return json({ error: 'creneau_passe' }, 409);
    if ((await miens()).some((x) => x.mois === c.mois)) return json({ error: 'deja_ce_mois' }, 409);
    const prenom = String(user.user_metadata?.first_name || '').slice(0, 60) || null;
    // Écriture conditionnelle : si deux personnes cliquent en même temps, une seule obtient le créneau.
    const r = await call(`${TABLE}?id=eq.${c.id}&user_id=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, email: user.email.toLowerCase(), prenom, reserve_at: t.toISOString() }) });
    if (r.status === 409) return json({ error: 'deja_ce_mois' }, 409);
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    if (!(await r.json()).length) return json({ error: 'creneau_pris' }, 409);
    if (d.offerte) await patch('achats_unite', `id=eq.${d.offerte.id}`, { utilisees: d.offerte.utilisees + 1 }).catch(() => {});
    await prevenirMembre({ user_id: user.id, email: user.email, prenom }, { titre: '{A}, ta visio avec Lamia est réservée', texte: `Rendez-vous le ${quandParis(c.debut)} (heure de Paris), pour 15 minutes. Tu entres dans la visio depuis ton espace, à partir de 10 minutes avant.`, bouton: 'Mon espace coaching', lien: LIEN, pied: PIED }).catch(() => {});
    await alerte(`🎥 Coaching réservé · ${quandParis(c.debut)}`, [`${prenom || ''} · ${user.email}`]);
    return vue();
  }

  if (action === 'annonce_coaching_annuler') {
    const c = await creneau(b.id);
    if (!c || c.user_id !== user.id) return json({ error: 'not_found' }, 404);
    if (new Date(c.debut).getTime() - t.getTime() < ANNULER_AVANT_MS) return json({ error: 'trop_tard' }, 409);
    if ((await etat(user.email, { env }).catch(() => ({}))).abonnement?.formule !== 'prestige') { const u = (await offertes()).filter((x) => x.utilisees > 0).pop(); if (u) await patch('achats_unite', `id=eq.${u.id}`, { utilisees: u.utilisees - 1 }).catch(() => {}); }
    await patch('coaching_creneaux', `id=eq.${c.id}`, { user_id: null, email: null, prenom: null, reserve_at: null, rappel_at: null });
    await alerte(`🎥 Coaching annulé · ${quandParis(c.debut)}`, [`${c.prenom || ''} · ${user.email}`, 'Le créneau est de nouveau libre.']);
    return vue();
  }

  if (action === 'annonce_coaching_rejoindre') {
    const c = await creneau(b.id);
    if (!c || (c.user_id !== user.id && !admin)) return json({ error: 'not_found' }, 404);
    const debut = new Date(c.debut).getTime();
    if (t.getTime() < debut - ENTRER_AVANT_MS) return json({ error: 'trop_tot' }, 409);
    if (t.getTime() > debut + DUREE_MIN * 60e3 + ENTRER_APRES_MS) return json({ error: 'terminee' }, 409);
    if (!env.DAILY_API_KEY) return json({ error: 'video_not_configured' }, 503);
    const exp = Math.floor((debut + DUREE_MIN * 60e3 + ENTRER_APRES_MS) / 1000);
    const api = daily(env, fetcher);
    try {
      const salle = await ensureRoom(api, `coaching-${c.id}`, { exp, max: 2 });
      const jeton = await meetingToken(api, { room_name: salle.name, exp, is_owner: Boolean(admin), user_name: admin ? 'Lamia' : (c.prenom || 'Moi') });
      return json({ ok: true, url: `${salle.url}?t=${encodeURIComponent(jeton)}` });
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
    await alerter({ titre: `🎥 Coaching à venir · ${quandParis(c.debut)}`, lignes: [`${c.prenom || ''} · ${c.email}`], lien: '/tableau-de-bord#coaching', tag: 'abonnement' }).catch(() => {});
  }
  return liste.length;
}
