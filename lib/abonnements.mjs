// Abonnements « Trouve ton âme sœur » et achats à l'unité (mise en relation, speed dating).
// Le paiement passe par Stripe Checkout ; l'abonnement n'est enregistré qu'à la réception
// de la notification signée de Stripe (webhook), jamais sur simple retour du navigateur.
// Les prix sont relus dans content/abonnements.mjs : rien n'est repris du navigateur.

import { DATABASE_URL, json, serviceHeaders, userFromRequest, CGV_VERSION } from './event-tickets.mjs';
import { alerterLamia } from './alerte-lamia.mjs';
import { formule, unite, prixAnnuel, euros } from '../content/abonnements.mjs';

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
  const [abos, unites] = await Promise.all([
    lire(env, fetcher, `abonnements?email=ilike.${e}&select=formule,periode,statut,fin_periode,resiliation_prevue,created_at&order=created_at.desc&limit=5`).catch(() => []),
    lire(env, fetcher, `achats_unite?email=ilike.${e}&select=type,quantite,utilisees&limit=50`).catch(() => []),
  ]);
  const abonnement = abos.find((a) => ACTIFS.includes(a.statut)) || null;
  const restant = (t) => unites.filter((u) => u.type === t).reduce((n, u) => n + Math.max(0, u.quantite - u.utilisees), 0);
  return { abonnement, unites: { mise_en_relation: restant('mise_en_relation'), speed_dating: restant('speed_dating') } };
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

  if (b.action !== 'abonnement_payer') return json({ error: 'bad_request' }, 400);
  if (env.CHECKOUT_ENABLED !== 'true' || !stripe || !env.STRIPE_SECRET_KEY) return json({ error: 'paiement_indisponible' }, 503);
  if (b.cgv_accepted !== true) return json({ error: 'cgv_required' }, 400);
  const email = clean(b.email, 254).toLowerCase();
  const nom = clean(b.nom, 120);
  if (nom.length < 2 || !EMAIL.test(email)) return json({ error: 'invalid_contact' }, 400);
  const base = { cgv_version: CGV_VERSION, cgv_accepted_at: now().toISOString(), email, nom };

  const f = formule(b.formule);
  if (f && f.mois > 0) {
    const periode = b.periode === 'an' ? 'an' : 'mois';
    const { abonnement } = await etatAbonnement(email, { env, fetcher });
    if (abonnement) return json({ error: 'deja_abonne', formule: abonnement.formule }, 409);
    const metadata = { ...base, kind: KIND_ABONNEMENT, formule: f.id, periode };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', locale: 'fr', customer_email: email, allow_promotion_codes: true,
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: periode === 'an' ? prixAnnuel(f) : f.mois, recurring: { interval: periode === 'an' ? 'year' : 'month' }, product_data: { name: `Abonnement ${f.nom} · Trouve ton âme sœur`, description: f.avantages.join(' · ').slice(0, 300) } } }],
      metadata, subscription_data: { metadata, description: `Abonnement ${f.nom} (${periode === 'an' ? 'annuel' : 'mensuel'})` },
      success_url: `${origin}/abonnement/merci/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/abonnement/?paiement=annule`,
    });
    return json({ ok: true, url: session.url });
  }

  const u = unite(b.unite);
  if (u) {
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
    const ligne = { email: (o.customer_details?.email || o.customer_email || m.email || '').toLowerCase(), nom: m.nom || o.customer_details?.name || null, formule: f?.id || 'coeur', periode: m.periode === 'an' ? 'an' : 'mois', statut: 'actif', stripe_customer_id: typeof o.customer === 'string' ? o.customer : o.customer?.id || null, stripe_subscription_id: typeof o.subscription === 'string' ? o.subscription : o.subscription.id, updated_at: now().toISOString() };
    const r = await db(env, fetcher, 'abonnements?on_conflict=stripe_subscription_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(ligne) });
    if (!r.ok) throw new Error('abonnement_non_enregistre');
    const nouveau = (await r.json()).length > 0;
    if (nouveau) await alerte(`Nouvel abonnement ${f?.nom || ''} · ${euros(ligne.periode === 'an' ? prixAnnuel(f) : f.mois)}${ligne.periode === 'an' ? ' par an' : ' par mois'}`, [`${ligne.nom || ''} · ${ligne.email}`], { env, fetcher });
    return { status: nouveau ? 'created' : 'duplicate' };
  }
  if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && m.kind === KIND_UNITE) {
    if (o.payment_status !== 'paid') return { status: 'unpaid' };
    const u = unite(m.type);
    if (!u) return { status: 'ignored' };
    const ligne = { email: (o.customer_details?.email || o.customer_email || m.email || '').toLowerCase(), nom: m.nom || null, type: u.id, quantite: Math.max(1, Math.min(Number.parseInt(m.quantite, 10) || 1, 5)), stripe_session_id: o.id };
    const r = await db(env, fetcher, 'achats_unite?on_conflict=stripe_session_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(ligne) });
    if (!r.ok) throw new Error('achat_non_enregistre');
    if ((await r.json()).length) await alerte(`Achat · ${ligne.quantite} × ${u.nom.toLowerCase()} · ${euros(u.prix * ligne.quantite)}`, [`${ligne.nom || ''} · ${ligne.email}`], { env, fetcher });
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
