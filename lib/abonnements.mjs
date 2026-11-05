// Abonnements « Trouve ton âme sœur » et achats à l'unité (mise en relation, speed dating).
// Le paiement passe par Stripe Checkout ; l'abonnement n'est enregistré qu'à la réception
// de la notification signée de Stripe (webhook), jamais sur simple retour du navigateur.
// Les prix sont relus dans content/abonnements.mjs : rien n'est repris du navigateur.

import { DATABASE_URL, json, serviceHeaders, userFromRequest, CGV_VERSION } from './event-tickets.mjs';
import { alerterLamia } from './alerte-lamia.mjs';
import { formule, unite, prixAnnuel, prixMensuel, euros } from '../content/abonnements.mjs';

export const KIND_ABONNEMENT = 'abonnement';
export const KIND_UNITE = 'achat_unite';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const ACTIFS = ['actif', 'impaye'];

const db = (env, fetcher, path, init = {}) =>
  fetcher(`${DATABASE_URL}/rest/v1/${path}`, { ...init, headers: serviceHeaders(env, { 'Content-Type': 'application/json', ...(init.headers || {}) }), signal: AbortSignal.timeout(10000) });
const lire = async (env, fetcher, path) => { const r = await db(env, fetcher, path); if (!r.ok) throw new Error('db_read'); return r.json(); };
const emailFiltre = (email) => encodeURIComponent(String(email).toLowerCase().replace(/[%_*,()]/g, ''));

/** Abonnement en cours et achats à l'unité restants pour une adresse email. */
export async function etatAbonnement(email, { env = process.env, fetcher = fetch } = {}) {
  const e = emailFiltre(email);
  const [abos, unites, offres] = await Promise.all([
    lire(env, fetcher, `abonnements?email=ilike.${e}&select=formule,periode,statut,fin_periode,resiliation_prevue,created_at&order=created_at.desc&limit=5`).catch(() => []),
    lire(env, fetcher, `achats_unite?email=ilike.${e}&select=type,quantite,utilisees&limit=50`).catch(() => []),
    lire(env, fetcher, `formules_offertes?email=ilike.${e}&select=formule,raison&limit=1`).catch(() => []),
  ]);
  // Une formule offerte (modérateurs) vaut un abonnement, sans Stripe ; un vrai abonnement reste prioritaire.
  const offre = Array.isArray(offres) ? offres[0] : null;
  const abonnement = abos.find((a) => ACTIFS.includes(a.statut)) || (offre ? { formule: offre.formule, periode: 'offert', statut: 'offert', offert: true, raison: offre.raison, fin_periode: null, resiliation_prevue: false } : null);
  const restant = (t) => unites.filter((u) => u.type === t).reduce((n, u) => n + Math.max(0, u.quantite - u.utilisees), 0);
  return { abonnement, unites: { mise_en_relation: restant('mise_en_relation'), speed_dating: restant('speed_dating'), coaching: restant('coaching'), coaching_30: restant('coaching_30'), sauver_couple: restant('sauver_couple'), live_priorite: restant('live_priorite') } };
}

/** Ce match est-il bien en cours pour ce compte, et a-t-il accepté de transmettre une photo qui existe ? */
export async function photoVendable(user, ref, { env = process.env, fetcher = fetch } = {}) {
  const [cible] = await lire(env, fetcher, `annonces?ref=eq.${ref}&select=id,ref,photo_partage`);
  if (!cible?.photo_partage) return false;
  const [annonces, fiches] = await Promise.all([lire(env, fetcher, `annonces?user_id=eq.${user.id}&select=id,ref`), lire(env, fetcher, `profils_outil?user_id=eq.${user.id}&select=ref`)]);
  const ids = annonces.map((a) => a.id), refs = [...annonces.map((a) => a.ref), ...fiches.map((f) => f.ref)];
  const demandes = ids.length ? await lire(env, fetcher, `annonce_interets?demandeur_id=in.(${ids.join(',')})&cible_ref=eq.${ref}&statut=eq.mis_en_relation&select=id&limit=1`) : [];
  const recues = refs.length ? await lire(env, fetcher, `annonce_interets?demandeur_id=eq.${cible.id}&cible_ref=in.(${refs.join(',')})&statut=eq.mis_en_relation&select=id&limit=1`) : [];
  if (!demandes.length && !recues.length) return false;
  return (await lire(env, fetcher, `annonce_files?annonce_id=eq.${cible.id}&kind=eq.photo&select=id&limit=1`)).length > 0;
}
/** Décompte un achat à l'unité (le plus ancien d'abord). Renvoie son identifiant, ou null s'il n'en reste plus. */
export async function consommerUnite(email, type, { env = process.env, fetcher = fetch } = {}) {
  const achats = await lire(env, fetcher, `achats_unite?email=ilike.${emailFiltre(email)}&type=eq.${type}&select=id,quantite,utilisees&order=created_at.asc&limit=50`);
  const u = achats.find((x) => x.utilisees < x.quantite);
  if (!u) return null;
  const r = await db(env, fetcher, `achats_unite?id=eq.${encodeURIComponent(u.id)}&utilisees=eq.${u.utilisees}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ utilisees: u.utilisees + 1 }) });
  return r.ok && (await r.json()).length ? u.id : null;
}
/** Rend un achat à l'unité décompté (visio annulée à temps). */
export async function rendreUnite(id, { env = process.env, fetcher = fetch } = {}) {
  const [u] = await lire(env, fetcher, `achats_unite?id=eq.${encodeURIComponent(id)}&select=utilisees`);
  if (!u || u.utilisees < 1) return false;
  return (await db(env, fetcher, `achats_unite?id=eq.${encodeURIComponent(id)}&utilisees=eq.${u.utilisees}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ utilisees: u.utilisees - 1 }) })).ok;
}
/** Un match acheté à l'unité est décompté quand la mise en relation se fait. */
export async function consommerMatchAchete(email, ctx = {}) {
  return Boolean(await consommerUnite(email, 'mise_en_relation', ctx));
}
/** Avant d'ouvrir le paiement d'un service lié au compte : peut-il vraiment être rendu ? */
async function serviceVendable(u, b, user, { env, fetcher }) {
  if (u.id === 'photo_match') {
    const ref = Number.parseInt(b.ref, 10);
    if (!Number.isInteger(ref) || ref <= 0) return { error: 'bad_request', status: 400 };
    return (await photoVendable(user, ref, { env, fetcher })) ? { cible: String(ref), metadata: { photo_ref: String(ref) }, detail: `profil n° ${ref}` } : { error: 'photo_indisponible' };
  }
  if (u.id === 'prolonger_discussion') {
    const id = clean(b.id, 40);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'bad_request', status: 400 };
    const [d] = await lire(env, fetcher, `discussions?id=eq.${id}&or=(a_user.eq.${user.id},b_user.eq.${user.id})&select=id,close_raison,a_numero,b_numero`);
    if (!d || d.close_raison) return { error: 'discussion_fermee' };
    return { cible: d.id, detail: `${u.jours} jours de plus` };
  }
  if (u.id === 'profil_avant') {
    const [a, f] = await Promise.all([lire(env, fetcher, `annonces?user_id=eq.${user.id}&status=eq.publiee&select=id&limit=1`), lire(env, fetcher, `profils_outil?user_id=eq.${user.id}&visible=eq.true&select=ref&limit=1`)]);
    return a.length || f.length ? { detail: `${u.jours} jours` } : { error: 'profil_requis' };
  }
  if (u.id === 'qui_choisi') {
    const { abonnement: x } = await etatAbonnement(user.email, { env, fetcher });
    return ['passion', 'prestige'].includes(x?.formule) && ['actif', 'offert'].includes(x.statut) ? { error: 'deja_inclus' } : { detail: `${u.heures} heures` };
  }
  return { error: 'bad_request', status: 400 };
}
/** Le service payé est rendu tout de suite : discussion prolongée, profil mis en avant. */
async function rendreService(u, m, t, { env, fetcher }) {
  const plusTard = (d, jours) => new Date(Math.max(d ? new Date(d).getTime() : 0, t.getTime()) + jours * 86400e3).toISOString();
  const ecrire = async (chemin, valeur) => { const r = await db(env, fetcher, chemin, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(valeur) }); if (!r.ok) throw new Error('service_non_rendu'); };
  if (u.id === 'prolonger_discussion') {
    const [d] = await lire(env, fetcher, `discussions?id=eq.${encodeURIComponent(m.cible)}&select=id,ferme_at,close_raison`);
    if (d && !d.close_raison) await ecrire(`discussions?id=eq.${d.id}`, { ferme_at: plusTard(d.ferme_at, u.jours), rappel_at: null });
  }
  if (u.id === 'profil_avant' && m.user_id) {
    const [a, f] = await Promise.all([lire(env, fetcher, `annonces?user_id=eq.${m.user_id}&select=avant_jusqu_a`), lire(env, fetcher, `profils_outil?user_id=eq.${m.user_id}&select=avant_jusqu_a`)]);
    const fin = plusTard([...a, ...f].map((x) => x.avant_jusqu_a).filter(Boolean).sort().pop(), u.jours);
    await ecrire(`annonces?user_id=eq.${m.user_id}`, { avant_jusqu_a: fin });
    await ecrire(`profils_outil?user_id=eq.${m.user_id}`, { avant_jusqu_a: fin });
  }
}

/** Actions publiques : ouvrir le paiement d'une formule ou d'un achat à l'unité, gérer son abonnement. */
export async function actionAbonnement(b, request, { env = process.env, fetcher = fetch, stripe = null, now = () => new Date() } = {}) {
  const origin = new URL(request.url).origin;

  if (b.action === 'abonnement_gerer') {
    if (!stripe) return json({ error: 'paiement_indisponible' }, 503);
    const user = await userFromRequest(request, { fetcher });
    if (!user?.email) return json({ error: 'login_required' }, 401);
    const [a] = await lire(env, fetcher, `abonnements?email=ilike.${emailFiltre(user.email)}&stripe_customer_id=not.is.null&select=stripe_customer_id&order=created_at.desc&limit=1`).catch(() => []);
    if (!a) return json({ error: 'aucun_abonnement' }, 404);
    const ouvrir = (configuration) => stripe.billingPortal.sessions.create({ customer: a.stripe_customer_id, return_url: `${origin}/mon-espace/`, locale: 'fr', ...(configuration ? { configuration } : {}) });
    let s;
    try { s = await ouvrir(); }
    catch {
      // Première fois : le portail client de Stripe n'est pas encore configuré.
      const conf = await stripe.billingPortal.configurations.create({
        business_profile: { headline: 'La Maison Lamia Femme Berbère', privacy_policy_url: `${origin}/confidentialite/`, terms_of_service_url: `${origin}/cgv/` },
        features: { subscription_cancel: { enabled: true, mode: 'at_period_end' }, payment_method_update: { enabled: true }, invoice_history: { enabled: true } },
      });
      s = await ouvrir(conf.id);
    }
    return json({ ok: true, url: s.url });
  }

  // Retour de paiement : on relit la session chez Stripe (filet de sécurité si la notification n'arrive pas).
  if (b.action === 'abonnement_confirmer') {
    if (!stripe) return json({ error: 'paiement_indisponible' }, 503);
    const id = clean(b.session_id, 200);
    if (!/^cs_(live|test)_[\w]+$/.test(id)) return json({ error: 'bad_request' }, 400);
    const session = await stripe.checkout.sessions.retrieve(id);
    const m = session?.metadata || {};
    if (![KIND_ABONNEMENT, KIND_UNITE].includes(m.kind)) return json({ error: 'not_found' }, 404);
    if (session.livemode !== /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '')) return json({ error: 'wrong_mode' }, 400);
    if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) return json({ ok: true, statut: 'en_attente' });
    await traiterEvenementAbonnement({ type: 'checkout.session.completed', data: { object: session } }, { env, fetcher, now });
    if (m.kind === KIND_ABONNEMENT && session.subscription) {
      const sub = typeof session.subscription === 'string' ? await stripe.subscriptions.retrieve(session.subscription) : session.subscription;
      await traiterEvenementAbonnement({ type: 'customer.subscription.updated', data: { object: sub } }, { env, fetcher, now });
    }
    const f = formule(m.formule), u = unite(m.type);
    return json({ ok: true, statut: 'paye', kind: m.kind, type: m.type || null, nom: f?.nom || u?.nom || '', periode: m.periode || null, quantite: m.quantite || null });
  }

  // Places restantes au prix de lancement : une place prise le reste, même après une résiliation.
  const placesPrises = async (f) => (await lire(env, fetcher, `abonnements?formule=eq.${f.id}&statut=neq.en_attente&select=id&limit=${f.lancement.places + 1}`)).length;
  if (b.action === 'abonnement_places') {
    const f = formule('prestige');
    let pris;
    try { pris = await placesPrises(f); } catch { return json({ error: 'temporary_failure' }, 502); }
    return json({ ok: true, restantes: Math.max(0, f.lancement.places - pris), places: f.lancement.places, prix: prixMensuel(f, pris), prix_an: prixAnnuel(f, pris), prix_normal: f.mois });
  }
  if (b.action !== 'abonnement_payer') return json({ error: 'bad_request' }, 400);
  if (env.CHECKOUT_ENABLED !== 'true' || !stripe || !env.STRIPE_SECRET_KEY) return json({ error: 'paiement_indisponible' }, 503);
  if (b.cgv_accepted !== true) return json({ error: 'cgv_required' }, 400);
  // Les services liés au compte : réservés au membre connecté, et vérifiés avant de faire payer.
  if (unite(b.unite)?.depuisEspace) {
    const u = unite(b.unite);
    const user = await userFromRequest(request, { fetcher });
    if (!user?.email) return json({ error: 'login_required' }, 401);
    let v;
    try { v = await serviceVendable(u, b, user, { env, fetcher }); } catch { return json({ error: 'paiement_indisponible' }, 503); }
    if (v.error) return json({ error: v.error }, v.status || 409);
    const mail = user.email.toLowerCase();
    const metadata = { cgv_version: CGV_VERSION, cgv_accepted_at: now().toISOString(), email: mail, nom: clean(b.nom, 120) || mail, kind: KIND_UNITE, type: u.id, quantite: '1', user_id: user.id, ...(v.cible ? { cible: v.cible } : {}), ...(v.metadata || {}) };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', locale: 'fr', customer_email: mail,
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: u.prix, product_data: { name: `${u.nom} · ${v.detail || ''}`.replace(/ · $/, '') } } }],
      metadata, payment_intent_data: { metadata, description: `${u.nom}${v.detail ? ` (${v.detail})` : ''}` },
      success_url: `${origin}/abonnement/merci/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/mon-espace/`,
    });
    return json({ ok: true, url: session.url });
  }

  const email = clean(b.email, 254).toLowerCase();
  const nom = clean(b.nom, 120);
  if (nom.length < 2 || !EMAIL.test(email)) return json({ error: 'invalid_contact' }, 400);
  const base = { cgv_version: CGV_VERSION, cgv_accepted_at: now().toISOString(), email, nom };

  const f = formule(b.formule);
  if (f && f.mois > 0) {
    const periode = b.periode === 'an' ? 'an' : 'mois';
    const { abonnement } = await etatAbonnement(email, { env, fetcher });
    if (abonnement) return json({ error: 'deja_abonne', formule: abonnement.formule }, 409);
    // Le prix est toujours décidé ici. Sans le nombre de places, on ne risque pas de se tromper de prix : on arrête.
    let pris = 0;
    if (f.lancement) { try { pris = await placesPrises(f); } catch { return json({ error: 'paiement_indisponible' }, 503); } }
    const montant = periode === 'an' ? prixAnnuel(f, pris) : prixMensuel(f, pris);
    const metadata = { ...base, kind: KIND_ABONNEMENT, formule: f.id, periode, prix_centimes: String(montant) };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', locale: 'fr', customer_email: email, allow_promotion_codes: true,
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: montant, recurring: { interval: periode === 'an' ? 'year' : 'month' }, product_data: { name: `Abonnement ${f.nom} · Trouve ton âme sœur`, description: f.avantages.join(' · ').slice(0, 300) } } }],
      metadata, subscription_data: { metadata, description: `Abonnement ${f.nom} (${periode === 'an' ? 'annuel' : 'mensuel'})` },
      success_url: `${origin}/abonnement/merci/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/abonnement/?paiement=annule`,
    });
    return json({ ok: true, url: session.url });
  }

  const u = unite(b.unite);
  if (u && !u.depuisEspace) {
    const quantite = Math.max(1, Math.min(Number.parseInt(b.quantite, 10) || 1, 5));
    const metadata = { ...base, kind: KIND_UNITE, type: u.id, quantite: String(quantite) };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', locale: 'fr', customer_email: email,
      line_items: [{ quantity: quantite, price_data: { currency: 'eur', unit_amount: u.prix, product_data: { name: `${u.nom} · La Maison Lamia Femme Berbère` } } }],
      metadata, payment_intent_data: { metadata, description: `${quantite} × ${u.nom}` },
      success_url: `${origin}/abonnement/merci/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/abonnement/?paiement=annule`,
    });
    return json({ ok: true, url: session.url });
  }
  return json({ error: 'formule_inconnue' }, 400);
}

const STATUTS = { active: 'actif', trialing: 'actif', past_due: 'impaye', unpaid: 'impaye', canceled: 'resilie', incomplete: 'en_attente', incomplete_expired: 'resilie', paused: 'suspendu' };
const finPeriode = (sub) => { const t = sub?.items?.data?.[0]?.current_period_end || sub?.current_period_end; return t ? new Date(t * 1000).toISOString() : undefined; };

/** Notification signée de Stripe → enregistrement de l'abonnement ou de l'achat (rejouable sans doublon). */
export async function traiterEvenementAbonnement(event, { env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  const o = event.data.object;
  const m = o.metadata || {};
  const patch = (filtre, valeur) => db(env, fetcher, `abonnements?${filtre}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...valeur, updated_at: now().toISOString() }) });

  if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && m.kind === KIND_ABONNEMENT) {
    if (!o.subscription) return { status: 'ignored' };
    const f = formule(m.formule);
    const ligne = { email: (o.customer_details?.email || o.customer_email || m.email || '').toLowerCase(), nom: m.nom || o.customer_details?.name || null, formule: f?.id || 'passion', periode: m.periode === 'an' ? 'an' : 'mois', statut: 'actif', prix_centimes: Number(m.prix_centimes) || null, stripe_customer_id: typeof o.customer === 'string' ? o.customer : o.customer?.id || null, stripe_subscription_id: typeof o.subscription === 'string' ? o.subscription : o.subscription.id, updated_at: now().toISOString() };
    const r = await db(env, fetcher, 'abonnements?on_conflict=stripe_subscription_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(ligne) });
    if (!r.ok) throw new Error('abonnement_non_enregistre');
    const nouveau = (await r.json()).length > 0;
    if (nouveau) await alerte(`Nouvel abonnement ${f?.nom || ''} · ${euros(Number(m.prix_centimes) || (ligne.periode === 'an' ? prixAnnuel(f) : f.mois))}${ligne.periode === 'an' ? ' par an' : ' par mois'}`, [`${ligne.nom || ''} · ${ligne.email}`], { env, fetcher });
    return { status: nouveau ? 'created' : 'duplicate' };
  }
  if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && m.kind === KIND_UNITE) {
    if (o.payment_status !== 'paid') return { status: 'unpaid' };
    const u = unite(m.type);
    if (!u) return { status: 'ignored' };
    const ligne = { email: (o.customer_details?.email || o.customer_email || m.email || '').toLowerCase(), nom: m.nom || null, type: u.id, quantite: Math.max(1, Math.min(Number.parseInt(m.quantite, 10) || 1, 5)), stripe_session_id: o.id };
    // La photo : l'heure commence au paiement, pour le compte qui a acheté et pour ce match seulement.
    ligne.montant_centimes = Number.isInteger(o.amount_total) ? o.amount_total : u.prix * ligne.quantite;
    if (m.cible) ligne.cible = String(m.cible);
    const finAcces = new Date(now().getTime() + (u.heures || (u.jours || 0) * 24) * 3600e3).toISOString();
    if (u.id === 'qui_choisi' || u.id === 'profil_avant') Object.assign(ligne, { email: String(m.email || ligne.email).toLowerCase(), acces_jusqu_a: finAcces, utilisees: 1 });
    if (u.id === 'prolonger_discussion') Object.assign(ligne, { email: String(m.email || ligne.email).toLowerCase(), utilisees: 1 });
    if (u.id === 'photo_match') Object.assign(ligne, { email: String(m.email || ligne.email).toLowerCase(), photo_ref: Number.parseInt(m.photo_ref, 10) || null, photo_jusqu_a: new Date(now().getTime() + u.heures * 3600e3).toISOString(), utilisees: 1 });
    const r = await db(env, fetcher, 'achats_unite?on_conflict=stripe_session_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(ligne) });
    if (!r.ok) throw new Error('achat_non_enregistre');
    const nouveau = (await r.json()).length > 0;
    // Le service n'est rendu qu'une fois, même si Stripe renvoie la notification ; s'il échoue, le prochain envoi le refera.
    if (u.id === 'prolonger_discussion' || u.id === 'profil_avant') {
      const c = await db(env, fetcher, `achats_unite?stripe_session_id=eq.${encodeURIComponent(o.id)}&applique_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ applique_at: now().toISOString() }) });
      if (!c.ok) throw new Error('achat_non_enregistre');
      if ((await c.json()).length) {
        try { await rendreService(u, m, now(), { env, fetcher }); }
        catch (e) { await db(env, fetcher, `achats_unite?stripe_session_id=eq.${encodeURIComponent(o.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ applique_at: null }) }); throw e; }
      }
    }
    if (nouveau) await alerte(`Achat · ${ligne.quantite} × ${u.nom.toLowerCase()} · ${euros(ligne.montant_centimes)}`, [`${ligne.nom || ''} · ${ligne.email}`, ...(u.id === 'live_priorite' ? ['À présenter en priorité au prochain live.'] : ['coaching', 'coaching_30', 'sauver_couple'].includes(u.id) ? ['La personne choisit son créneau dans Mon espace.', 'Pense à ouvrir un créneau de cette durée si besoin.'] : [])], { env, fetcher });
    return { status: 'recorded' };
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const statut = event.type === 'customer.subscription.deleted' ? 'resilie' : STATUTS[o.status] || 'actif';
    await patch(`stripe_subscription_id=eq.${encodeURIComponent(o.id)}`, { statut, resiliation_prevue: Boolean(o.cancel_at_period_end), ...(finPeriode(o) ? { fin_periode: finPeriode(o) } : {}) });
    if (event.type === 'customer.subscription.deleted') await alerte('Abonnement terminé', [`Abonnement ${o.id.slice(-6)} résilié`], { env, fetcher });
    return { status: statut };
  }
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const sub = o.subscription || o.parent?.subscription_details?.subscription;
    if (!sub) return { status: 'ignored' };
    const fin = o.lines?.data?.[0]?.period?.end;
    // Ce qui est réellement encaissé, échéance par échéance, pour l'onglet Ventes.
    if (event.type === 'invoice.paid' && o.amount_paid > 0) {
      const e = await db(env, fetcher, 'encaissements?on_conflict=stripe_invoice_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ stripe_invoice_id: o.id, stripe_subscription_id: typeof sub === 'string' ? sub : sub.id, email: String(o.customer_email || '').toLowerCase() || null, montant_centimes: o.amount_paid, paye_at: new Date((o.status_transitions?.paid_at || o.created || Math.floor(now().getTime() / 1000)) * 1000).toISOString() }) });
      if (!e.ok) throw new Error('encaissement_non_enregistre');
    }
    await patch(`stripe_subscription_id=eq.${encodeURIComponent(typeof sub === 'string' ? sub : sub.id)}`, { statut: event.type === 'invoice.paid' ? 'actif' : 'impaye', ...(fin ? { fin_periode: new Date(fin * 1000).toISOString() } : {}) });
    return { status: 'updated' };
  }
  return { status: 'ignored' };
}

async function alerte(titre, lignes, { env, fetcher }) {
  try { await Promise.race([alerterLamia({ titre, lignes, lien: '/confidences-lamia/#annonces', tag: 'abonnement' }, { env, fetcher }), new Promise((r) => setTimeout(r, 7000))]); } catch { /* l'alerte ne bloque jamais */ }
}

/** Pour l'espace de Lamia : abonnés et achats à l'unité. */
export async function abonnesPourLamia({ env = process.env, fetcher = fetch } = {}) {
  const [abonnes, unites] = await Promise.all([
    lire(env, fetcher, 'abonnements?select=email,nom,formule,periode,statut,fin_periode,resiliation_prevue,created_at&order=created_at.desc&limit=300').catch(() => []),
    lire(env, fetcher, 'achats_unite?select=id,email,nom,type,quantite,utilisees,created_at&order=created_at.desc&limit=300').catch(() => []),
  ]);
  return { abonnes, unites };
}
/** Lamia décompte une mise en relation ou une place de speed dating achetée à l'unité. */
export async function utiliserUnite(id, { env = process.env, fetcher = fetch } = {}) {
  const [u] = await lire(env, fetcher, `achats_unite?id=eq.${encodeURIComponent(id)}&select=quantite,utilisees`);
  if (!u || u.utilisees >= u.quantite) return false;
  const r = await db(env, fetcher, `achats_unite?id=eq.${encodeURIComponent(id)}&utilisees=eq.${u.utilisees}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ utilisees: u.utilisees + 1 }) });
  return r.ok;
}
