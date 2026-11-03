// Les soirées : deux salons permanents, des options de secteur, autant de femmes que d'hommes.
// 1. Le lien d'inscription reste toujours ouvert. 2. À 6 femmes + 6 hommes dans une option, Lamia reçoit une proposition de date.
// 3. Elle confirme : les 10 + 10 premiers au maximum ont 48 h pour valider leur place, sinon elle passe à la personne suivante.
// 4. Notifications : salon confirmé, le jour même, une heure avant, au démarrage.
// La soirée créée à la confirmation est une soirée normale : la salle du bal fonctionne sans changement.
import { timingSafeEqual } from 'node:crypto';
import { json } from './event-tickets.mjs';
import { ageOn, completerProfil } from './event-register.mjs';
import { etatAbonnement } from './abonnements.mjs';
import { formule } from '../content/abonnements.mjs';

export const SALONS = {
  '20-39': { nom: 'Salon 20-39 ans', min: 20, max: 39 },
  '40+': { nom: 'Salon 40 ans et plus', min: 40, max: null },
};
export const SECTEURS = { algerie: 'Algérie', algerie_france: 'Algérie et France', europe: 'Europe', canada_usa: 'Canada et USA', autres: 'Autres pays' };
export const SEUIL = 6;
export const MAX_PAR_GENRE = 10;
export const PRIX_CENTIMES = 1200;
const DELAI_MS = 48 * 3600e3, AVANT_MIN_MS = 72 * 3600e3, MARGE_MS = 24 * 3600e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

const decalageParis = (d) => new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' })) - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
export function parisVersUTC(local) { const n = new Date(`${local}:00Z`); return new Date(n.getTime() - decalageParis(n)); }
const jourParis = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const heureParis = (d) => Number(d.toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' }));
export const dateFr = (d) => new Date(d).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h ');
const salonLabel = (e) => `${SALONS[e.salon]?.nom || e.salon} · ${SECTEURS[e.secteur] || e.secteur}`;

export function salonPourAge(age) { return age >= 40 ? '40+' : age >= 20 ? '20-39' : null; }
// À partir de 20 ans, chacun peut choisir l'un ou l'autre salon.
export const salonAutorise = (age, salon) => age >= 20 && Boolean(SALONS[salon]);
// Deux tranches d'âge différentes ne se rencontrent que si les deux l'ont accepté.
export const compatibles = (a, b) => !a.tranche || !b.tranche || a.tranche === b.tranche || Boolean(a.accepte_autre && b.accepte_autre);
// Le premier samedi à 21 h, au moins 5 jours plus tard.
export function samediPropose(now) {
  for (let i = 5; i < 13; i += 1) {
    const d = new Date(now.getTime() + i * 86400e3);
    if (d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Paris' }) === 'Sat') return parisVersUTC(`${jourParis(d)}T21:00`);
  }
  return new Date(now.getTime() + 7 * 86400e3);
}
// Qui entre dans une option de secteur : autant de femmes que d'hommes, les premiers inscrits d'abord.
export function selection(inscrits, secteur) {
  const ici = inscrits.filter((x) => x.statut === 'attente' && x.secteurs?.includes(secteur)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const f0 = ici.filter((x) => x.genre === 'femme'), h0 = ici.filter((x) => x.genre === 'homme');
  // On ne compte que les personnes qui auraient au moins une rencontre possible dans cette option.
  const f = f0.filter((a) => h0.some((b) => compatibles(a, b))), h = h0.filter((a) => f0.some((b) => compatibles(a, b)));
  const n = Math.min(f.length, h.length, MAX_PAR_GENRE);
  return { femmes: f.length, hommes: h.length, n, pret: n >= SEUIL, retenus: [...f.slice(0, n), ...h.slice(0, n)] };
}
// Seule la prochaine soirée est offerte : la première date confirmée (plusieurs salons possibles le même soir).
export function gratuitParDefaut(editions, startsAt) {
  const faites = editions.filter((e) => e.starts_at);
  if (!faites.length) return true;
  return faites.some((e) => e.gratuit && new Date(e.starts_at).getTime() === new Date(startsAt).getTime());
}
export function dateLimite(now, startsAt) { return new Date(Math.min(now.getTime() + DELAI_MS, new Date(startsAt).getTime() - MARGE_MS)); }

export async function actionSalons(action, b, ctx) {
  const { env, call, read, insert, patch, admin, user, ipHash, now, alerter, cron, prevenirMembre, etat = etatAbonnement } = ctx;
  const t = now();
  const inscrits = (salon) => read(`/rest/v1/salon_inscriptions?statut=eq.attente${salon ? `&salon=eq.${encodeURIComponent(salon)}` : ''}&select=id,user_id,email,prenom,genre,salon,secteurs,statut,tranche,accepte_autre,created_at&order=created_at.asc&limit=2000`);
  const lesEditions = () => read('/rest/v1/salon_editions?statut=in.(confirme,terminee)&select=id,salon,secteur,gratuit,starts_at&order=starts_at.asc&limit=200');
  const lien = '/mon-espace/#salons';
  const pied = 'À très vite au Boudoir des Rencontres.';

  // Une proposition de date part vers Lamia dès qu'une option atteint le seuil ; elle disparaît si l'option repasse en dessous.
  async function verifierSeuils(salon) {
    const liste = await inscrits(salon);
    const ouvertes = await read(`/rest/v1/salon_editions?statut=eq.a_valider&salon=eq.${encodeURIComponent(salon)}&select=id,secteur`);
    for (const secteur of Object.keys(SECTEURS)) {
      const s = selection(liste, secteur), deja = ouvertes.find((e) => e.secteur === secteur);
      if (s.pret && !deja) {
        const proposee = samediPropose(t);
        const e = await insert('salon_editions', { salon, secteur, date_proposee: proposee.toISOString() }).catch(() => null);
        if (e) await alerter({ titre: `Salon prêt · ${salonLabel(e)}`, lignes: [`${s.femmes} femmes et ${s.hommes} hommes attendent.`, `Date proposée : ${dateFr(proposee)}. Valide-la dans ton tableau de bord.`], lien: '/tableau-de-bord#soirees', tag: 'inscription' }).catch(() => {});
      } else if (!s.pret && deja) await patch('salon_editions', `id=eq.${deja.id}`, { statut: 'ecartee' }).catch(() => {});
    }
  }
  async function placeIncluse(ins) {
    try {
      const e = await etat(ins.email, { env });
      const f = formule(e.abonnement?.formule);
      if (f?.speedDatings > 0) {
        const debut = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)).toISOString();
        const deja = await read(`/rest/v1/salon_inscriptions?user_id=eq.${ins.user_id}&inclus=eq.true&updated_at=gte.${encodeURIComponent(debut)}&select=id`);
        if (deja.length < f.speedDatings) return true;
      }
      if (e.unites?.speed_dating > 0) {
        const achats = await read(`/rest/v1/achats_unite?email=ilike.${encodeURIComponent(ins.email)}&type=eq.speed_dating&select=id,quantite,utilisees`);
        const a = achats.find((x) => x.quantite > x.utilisees);
        if (a) { await patch('achats_unite', `id=eq.${a.id}`, { utilisees: a.utilisees + 1 }); return true; }
      }
    } catch { /* en cas de doute, la personne garde le parcours normal */ }
    return false;
  }
  async function convoquer(ins, ed) {
    const inclus = !ed.gratuit && await placeIncluse(ins);
    const limite = dateLimite(t, ed.starts_at);
    const r = await call('/rest/v1/event_registrations?on_conflict=event_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ event_id: ed.event_id, user_id: ins.user_id, payment_status: inclus ? 'waived' : 'pending', attendance_status: 'registered', tranche: ins.tranche || null, accepte_autre: Boolean(ins.accepte_autre) }) });
    if (!r.ok) throw new Error('registration_failed');
    await patch('salon_inscriptions', `id=eq.${ins.id}`, { statut: inclus ? 'place' : 'convoque', edition_id: ed.id, payer_avant: inclus ? null : limite.toISOString(), inclus, updated_at: t.toISOString() });
    const quand = dateFr(ed.starts_at);
    await prevenirMembre({ user_id: ins.user_id, email: ins.email, genre: ins.genre, prenom: ins.prenom }, {
      titre: '{A}, ton salon est confirmé !',
      texte: inclus ? `Rendez-vous ${quand} : ${salonLabel(ed)}. Ta place est incluse dans ta formule.`
        : ed.gratuit ? `Rendez-vous ${quand} : ${salonLabel(ed)}. Cette soirée est gratuite : valide simplement ta place avant le ${dateFr(limite)}.`
          : `Rendez-vous ${quand} : ${salonLabel(ed)}. Règle ta place avant le ${dateFr(limite)}, sinon elle passera à la personne suivante.`,
      bouton: inclus ? 'Voir mon espace' : ed.gratuit ? 'Valider ma place' : 'Régler ma place', lien: inclus ? '/mon-espace/' : lien, pied,
    }).catch(() => {});
  }
  // Une place se libère : la personne suivante du même genre et de la même option la reprend, s'il reste le temps.
  async function remplacer(ed, genre) {
    if (new Date(ed.starts_at).getTime() - t.getTime() <= MARGE_MS) return false;
    const suivant = (await inscrits(ed.salon)).find((x) => x.genre === genre && x.secteurs?.includes(ed.secteur));
    if (!suivant) return false;
    await convoquer(suivant, ed);
    return true;
  }
  async function libererPlace(ins, statut) {
    const [ed] = await read(`/rest/v1/salon_editions?id=eq.${ins.edition_id}&select=*`);
    if (ed?.event_id) await patch('event_registrations', `event_id=eq.${ed.event_id}&user_id=eq.${ins.user_id}`, { attendance_status: 'cancelled' });
    await patch('salon_inscriptions', `id=eq.${ins.id}`, { statut, payer_avant: null, updated_at: t.toISOString() });
    if (ed) await remplacer(ed, ins.genre).catch(() => {});
  }
  const paiementDe = async (ins, ed) => { const [r] = await read(`/rest/v1/event_registrations?event_id=eq.${ed.event_id}&user_id=eq.${ins.user_id}&select=payment_status`); return r?.payment_status || null; };

  // ---------------------------------------------------------------- public
  if (action === 'salon_etat') {
    const [liste, conf, faites] = await Promise.all([inscrits(), read(`/rest/v1/salon_editions?statut=eq.confirme&starts_at=gte.${encodeURIComponent(t.toISOString())}&select=salon,secteur,starts_at,gratuit&order=starts_at.asc`), lesEditions()]);
    const salons = Object.entries(SALONS).map(([id, s]) => ({ id, nom: s.nom, options: Object.entries(SECTEURS).map(([k, nom]) => { const x = selection(liste.filter((y) => y.salon === id), k); return { id: k, nom, femmes: x.femmes, hommes: x.hommes }; }) }));
    return json({ ok: true, seuil: SEUIL, salons, confirmes: conf.map((e) => ({ salon: SALONS[e.salon]?.nom, secteur: SECTEURS[e.secteur], quand: dateFr(e.starts_at), gratuit: e.gratuit })), prochaine_gratuite: !faites.some((e) => !e.gratuit) && (!faites.length || faites.some((e) => new Date(e.starts_at) > t)), prix: PRIX_CENTIMES });
  }
  // Le profil de la personne connectée : obligatoire pour s'inscrire. Son âge et son genre viennent de là, pas d'un formulaire.
  async function profilDe() {
    const annonces = await read(`/rest/v1/annonces?user_id=eq.${user.id}&select=ref,status,prenom,genre,birth_date,ville,pays&order=created_at.desc&limit=5`);
    const a = annonces.find((x) => x.status === 'publiee'); // seuls les profils validés peuvent s'inscrire
    if (a) return { pret: true, prenom: a.prenom, genre: a.genre, age: ageOn(a.birth_date, t), birth: a.birth_date, ville: a.ville, pays: a.pays || null };
    const [f] = await read(`/rest/v1/profils_outil?user_id=eq.${user.id}&retire_at=is.null&visible=eq.true&select=ref,genre,age,ville,pays&limit=1`);
    if (f?.genre && f.age) return { pret: true, prenom: user.user_metadata?.first_name || '', genre: f.genre, age: f.age, birth: null, ville: f.ville, pays: f.pays || null };
    return { pret: false, brouillon: annonces.some((x) => x.status === 'brouillon'), a_verifier: annonces.some((x) => x.status === 'a_verifier') };
  }
  if (action === 'salon_mon_profil') {
    if (!user) return json({ ok: true, connecte: false });
    const p = await profilDe();
    const [actif] = p.pret ? await read(`/rest/v1/salon_inscriptions?user_id=eq.${user.id}&statut=in.(attente,convoque,place)&select=salon,secteurs,statut,accepte_autre`) : [];
    return json({ ok: true, connecte: true, profil: p.pret, brouillon: Boolean(p.brouillon), a_verifier: Boolean(p.a_verifier), prenom: p.prenom || '', salon: p.pret ? salonPourAge(p.age) : null, inscription: actif ? { salon: actif.salon, secteurs: actif.secteurs, statut: actif.statut, accepte_autre: actif.accepte_autre } : null });
  }
  if (action === 'salon_inscrire') {
    if (!user) return json({ error: 'login_required' }, 401);
    const salon = clean(b.salon, 8);
    const secteurs = [...new Set((Array.isArray(b.secteurs) ? b.secteurs : []).map((x) => clean(x, 20)).filter((x) => SECTEURS[x]))];
    if (!SALONS[salon]) return json({ error: 'missing_salon' }, 400);
    if (!secteurs.length) return json({ error: 'missing_secteur' }, 400);
    if (b.rules_accepted !== true) return json({ error: 'rules_required' }, 400);
    const p = await profilDe();
    if (!p.pret) return json({ error: 'profil_requis' }, 409);
    if (!salonAutorise(p.age, salon)) return json({ error: 'age_invalide' }, 400);
    const tranche = salonPourAge(p.age);
    // Choisir l'autre salon, c'est accepter de rencontrer l'autre tranche d'âge.
    const accepteAutre = salon !== tranche || b.accepte_autre === true;
    // La salle du bal lit le profil membre : on le complète sans jamais l'écraser.
    await completerProfil(call, user.id, { firstName: p.prenom || 'Masque', gender: p.genre, birth: p.birth, city: p.ville || '' }, t);
    const [actif] = await read(`/rest/v1/salon_inscriptions?user_id=eq.${user.id}&statut=in.(attente,convoque,place)&select=id,statut`);
    if (actif?.statut === 'attente') await patch('salon_inscriptions', `id=eq.${actif.id}`, { secteurs, salon, tranche, accepte_autre: accepteAutre, pays: p.pays, updated_at: t.toISOString() });
    else if (!actif) await insert('salon_inscriptions', { user_id: user.id, email: String(user.email || '').toLowerCase(), prenom: p.prenom || null, genre: p.genre, salon, secteurs, tranche, accepte_autre: accepteAutre, pays: p.pays, ip_hash: ipHash });
    await verifierSeuils(salon).catch((e) => console.error('salons seuil', e?.message));
    return json({ ok: true, deja: actif && actif.statut !== 'attente' ? actif.statut : null });
  }

  // ---------------------------------------------------------------- la tâche automatique
  if (action === 'salon_cron') {
    let autorise = cron;
    if (!autorise) {
      const [s] = await read('/rest/v1/platform_settings?key=eq.salons_cron&select=value').catch(() => []);
      const a = Buffer.from(String(b.jeton || '')), c = Buffer.from(String(s?.value?.jeton || ''));
      autorise = c.length >= 32 && a.length === c.length && timingSafeEqual(a, c);
    }
    if (!autorise) return json({ error: 'forbidden' }, 403);
    const res = { liberees: 0, rappels: 0 };
    const echues = await read(`/rest/v1/salon_inscriptions?statut=eq.convoque&payer_avant=lt.${encodeURIComponent(t.toISOString())}&select=*&limit=100`);
    for (const ins of echues) {
      const [ed] = await read(`/rest/v1/salon_editions?id=eq.${ins.edition_id}&select=*`);
      if (ed && await paiementDe(ins, ed) === 'paid') { await patch('salon_inscriptions', `id=eq.${ins.id}`, { statut: 'place', payer_avant: null, updated_at: t.toISOString() }); continue; }
      await libererPlace(ins, 'libere');
      await prevenirMembre({ user_id: ins.user_id, email: ins.email, genre: ins.genre, prenom: ins.prenom }, { titre: '{A}, ta place a été libérée', texte: 'Elle n’a pas été validée à temps. Tu peux te réinscrire quand tu veux pour une prochaine soirée.', bouton: 'Me réinscrire', lien: '/speed-dating/inscription/', pied }).catch(() => {});
      res.liberees += 1;
    }
    // Chaque rappel est « réservé » en base avant l'envoi : il ne part jamais deux fois.
    const reserver = async (id, champ) => {
      const r = await call(`/rest/v1/salon_editions?id=eq.${id}&${champ}=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ [champ]: t.toISOString() }) });
      return r.ok ? (await r.json()).length > 0 : false;
    };
    const conf = await read('/rest/v1/salon_editions?statut=eq.confirme&select=*&limit=50');
    for (const ed of conf) {
      const debut = new Date(ed.starts_at), avant = debut.getTime() - t.getTime();
      if (avant < -6 * 3600e3) {
        await patch('salon_editions', `id=eq.${ed.id}`, { statut: 'terminee' });
        await patch('salon_inscriptions', `edition_id=eq.${ed.id}&statut=eq.place`, { statut: 'terminee', updated_at: t.toISOString() });
        if (ed.event_id) await patch('speed_dating_events', `id=eq.${ed.event_id}`, { status: 'completed' }).catch(() => {});
        continue;
      }
      let message = null;
      if (avant <= 0 && avant > -45 * 60e3) { if (await reserver(ed.id, 'notif_depart_at')) message = { titre: '{A}, ta soirée commence !', texte: `${salonLabel(ed)} : entre maintenant avec ton email et ta date de naissance.`, bouton: 'Entrer dans la salle', lien: '/speed-dating/bal/' }; }
      else if (avant > 0 && avant <= 3600e3) { if (await reserver(ed.id, 'notif_heure_at')) message = { titre: '{A}, ta soirée commence dans une heure', texte: `${salonLabel(ed)} : prépare ta caméra, ton micro et un endroit calme.`, bouton: 'Tester ma caméra', lien: '/speed-dating/salle/' }; }
      else if (avant > 3600e3 && jourParis(debut) === jourParis(t) && heureParis(t) >= 9) { if (await reserver(ed.id, 'notif_jour_at')) message = { titre: '{A}, c’est ce soir !', texte: `Ta soirée a lieu ${dateFr(debut)} : ${salonLabel(ed)}.`, bouton: 'Tester ma caméra', lien: '/speed-dating/salle/' }; }
      if (!message) continue;
      const places = await read(`/rest/v1/salon_inscriptions?edition_id=eq.${ed.id}&statut=eq.place&select=user_id,email,genre,prenom&limit=40`);
      for (const p of places) { await prevenirMembre(p, { ...message, pied }).catch(() => {}); res.rappels += 1; }
      if (message.titre.includes('une heure')) await alerter({ titre: `Dans une heure · ${salonLabel(ed)}`, lignes: [`${places.filter((p) => p.genre === 'femme').length} femmes et ${places.filter((p) => p.genre === 'homme').length} hommes ont une place. Pense à ouvrir le bal.`], lien: '/admin-bal/', tag: 'inscription' }).catch(() => {});
    }
    return json({ ok: true, ...res });
  }

  // ---------------------------------------------------------------- la personne connectée
  if (action === 'salon_mes' || action === 'salon_valider' || action === 'salon_quitter') {
    if (!user) return json({ error: 'login_required' }, 401);
    const [ins] = await read(`/rest/v1/salon_inscriptions?user_id=eq.${user.id}&statut=in.(attente,convoque,place)&select=*`);
    if (action === 'salon_mes') {
      if (!ins) return json({ ok: true, inscription: null });
      const [ed] = ins.edition_id ? await read(`/rest/v1/salon_editions?id=eq.${ins.edition_id}&select=*`) : [];
      let statut = ins.statut;
      if (statut === 'convoque' && ed && await paiementDe(ins, ed) === 'paid') { statut = 'place'; await patch('salon_inscriptions', `id=eq.${ins.id}`, { statut, payer_avant: null, updated_at: t.toISOString() }); }
      return json({ ok: true, inscription: { salon: SALONS[ins.salon]?.nom, secteurs: ins.secteurs.map((x) => SECTEURS[x] || x), tranche: ins.tranche, accepte_autre: ins.accepte_autre, statut, inclus: ins.inclus, payer_avant: ins.payer_avant ? dateFr(ins.payer_avant) : null, quand: ed?.starts_at ? dateFr(ed.starts_at) : null, secteur: ed ? SECTEURS[ed.secteur] : null, gratuit: Boolean(ed?.gratuit), algerie: /alg/i.test(String(ins.pays || '')), prix: PRIX_CENTIMES, event_id: ed?.event_id || null } });
    }
    if (!ins) return json({ error: 'not_found' }, 404);
    if (action === 'salon_valider') {
      if (ins.statut !== 'convoque') return json({ ok: true });
      const [ed] = await read(`/rest/v1/salon_editions?id=eq.${ins.edition_id}&select=*`);
      if (!ed?.gratuit) return json({ error: 'paiement_requis' }, 409);
      await patch('event_registrations', `event_id=eq.${ed.event_id}&user_id=eq.${user.id}`, { payment_status: 'waived' });
      await patch('salon_inscriptions', `id=eq.${ins.id}`, { statut: 'place', payer_avant: null, updated_at: t.toISOString() });
      return json({ ok: true });
    }
    if (ins.statut === 'attente') { await patch('salon_inscriptions', `id=eq.${ins.id}`, { statut: 'annule', updated_at: t.toISOString() }); await verifierSeuils(ins.salon).catch(() => {}); return json({ ok: true }); }
    const [ed] = await read(`/rest/v1/salon_editions?id=eq.${ins.edition_id}&select=*`);
    if (ed && await paiementDe(ins, ed) === 'paid') return json({ error: 'place_payee' }, 409);
    await libererPlace(ins, 'annule');
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- Lamia
  if (action === 'salon_admin' || action === 'salon_confirmer' || action === 'salon_offrir') {
    if (!admin) return json({ error: 'forbidden' }, 403);
    if (action === 'salon_admin') {
      const [liste, aValider, conf, faites] = await Promise.all([inscrits(), read('/rest/v1/salon_editions?statut=eq.a_valider&select=*&order=created_at.asc'), read('/rest/v1/salon_editions?statut=eq.confirme&select=*&order=starts_at.asc'), lesEditions()]);
      const options = Object.keys(SALONS).flatMap((salon) => Object.entries(SECTEURS).map(([k, nom]) => { const x = selection(liste.filter((y) => y.salon === salon), k); return { salon: SALONS[salon].nom, secteur: nom, femmes: x.femmes, hommes: x.hommes, pret: x.pret }; }));
      const places = conf.length ? await read(`/rest/v1/salon_inscriptions?edition_id=in.(${conf.map((e) => e.id).join(',')})&statut=in.(convoque,place)&select=id,edition_id,statut,genre,prenom,pays`) : [];
      return json({ ok: true, seuil: SEUIL, options,
        a_valider: aValider.map((e) => { const x = selection(liste.filter((y) => y.salon === e.salon), e.secteur); const iso = e.date_proposee || samediPropose(t).toISOString(); return { id: e.id, nom: salonLabel(e), femmes: x.femmes, hommes: x.hommes, retenus: x.n, date: new Date(new Date(iso).getTime() + decalageParis(new Date(iso))).toISOString().slice(0, 16), gratuit: gratuitParDefaut(faites, iso) }; }),
        confirmes: conf.map((e) => { const p = places.filter((x) => x.edition_id === e.id); const c = (g, s) => p.filter((x) => x.genre === g && x.statut === s).length; return { nom: salonLabel(e), quand: dateFr(e.starts_at), gratuit: e.gratuit, femmes: c('femme', 'place'), hommes: c('homme', 'place'), attente_f: c('femme', 'convoque'), attente_h: c('homme', 'convoque'), a_offrir: e.gratuit ? [] : p.filter((x) => x.statut === 'convoque' && /alg/i.test(String(x.pays || ''))).map((x) => ({ id: x.id, prenom: x.prenom || 'Sans prénom' })) }; }) });
    }
    // En Algérie, pas de paiement en ligne : Lamia valide la place et l'offre (par exemple après un soutien au live).
    if (action === 'salon_offrir') {
      const idI = clean(b.id, 40);
      if (!UUID.test(idI)) return json({ error: 'bad_request' }, 400);
      const [ins] = await read(`/rest/v1/salon_inscriptions?id=eq.${idI}&statut=eq.convoque&select=*`);
      if (!ins) return json({ error: 'not_found' }, 404);
      const [ed] = await read(`/rest/v1/salon_editions?id=eq.${ins.edition_id}&select=*`);
      if (!ed?.event_id) return json({ error: 'not_found' }, 404);
      await patch('event_registrations', `event_id=eq.${ed.event_id}&user_id=eq.${ins.user_id}`, { payment_status: 'waived' });
      await patch('salon_inscriptions', `id=eq.${ins.id}`, { statut: 'place', payer_avant: null, updated_at: t.toISOString() });
      await prevenirMembre({ user_id: ins.user_id, email: ins.email, genre: ins.genre, prenom: ins.prenom }, { titre: '{A}, Lamia t’offre ta place !', texte: `Ta place est confirmée : ${dateFr(ed.starts_at)}, ${salonLabel(ed)}.`, lien: '/mon-espace/#salons', pied }).catch(() => {});
      return json({ ok: true });
    }
    const id = clean(b.id, 40), local = clean(b.date, 16);
    if (!UUID.test(id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return json({ error: 'bad_request' }, 400);
    const debut = parisVersUTC(local);
    if (Number.isNaN(debut.getTime()) || debut.getTime() - t.getTime() < AVANT_MIN_MS) return json({ error: 'date_trop_proche' }, 400);
    const [ed] = await read(`/rest/v1/salon_editions?id=eq.${id}&statut=eq.a_valider&select=*`);
    if (!ed) return json({ error: 'not_found' }, 404);
    const s = selection(await inscrits(ed.salon), ed.secteur);
    if (!s.pret) { await patch('salon_editions', `id=eq.${id}`, { statut: 'ecartee' }); return json({ error: 'plus_assez' }, 409); }
    const gratuit = typeof b.gratuit === 'boolean' ? b.gratuit : gratuitParDefaut(await lesEditions(), debut);
    const event = await insert('speed_dating_events', {
      slug: `boudoir-${local.replace(/[^0-9]/g, '')}-${ed.salon === '40+' ? '40plus' : ed.salon}-${ed.secteur}-${t.getTime().toString(36)}`.replace(/_/g, '-'),
      title: 'Le Boudoir des Rencontres', description: gratuit ? 'Soirée offerte.' : null, starts_at: debut.toISOString(), ends_at: new Date(debut.getTime() + 2 * 3600e3).toISOString(),
      min_age: 20, max_age: null, audience: salonLabel(ed), capacity: MAX_PAR_GENRE * 2, ticket_price_cents: gratuit ? 0 : PRIX_CENTIMES, currency: 'EUR', status: 'published', sur_invitation: true,
    });
    const confirmee = { ...ed, statut: 'confirme', starts_at: debut.toISOString(), event_id: event.id, gratuit };
    await patch('salon_editions', `id=eq.${id}`, { statut: 'confirme', starts_at: confirmee.starts_at, event_id: event.id, gratuit, confirmed_at: t.toISOString() });
    let convoques = 0;
    for (const ins of s.retenus) { await convoquer(ins, confirmee); convoques += 1; }
    await verifierSeuils(ed.salon).catch(() => {});
    return json({ ok: true, convoques, quand: dateFr(debut), gratuit });
  }
  return json({ error: 'unknown_action' }, 400);
}
