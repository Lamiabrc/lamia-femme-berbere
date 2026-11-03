import test from 'node:test';
import assert from 'node:assert/strict';
import { actionAbonnement, traiterEvenementAbonnement, etatAbonnement } from '../lib/abonnements.mjs';
import { FORMULES, prixAnnuel, prixMensuel, unite } from '../content/abonnements.mjs';

const env = { CHECKOUT_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_x', SUPABASE_SERVICE_ROLE_KEY: 'srv' };
const req = new Request('https://lamia-femme-berbere.com/api/preorder', { method: 'POST' });
const base = { action: 'abonnement_payer', cgv_accepted: true, email: 'nina@example.com', nom: 'Nina' };
const fauxStripe = () => { const appels = []; return { appels, checkout: { sessions: { create: async (p) => { appels.push(p); return { url: 'https://checkout.stripe.com/x' }; } } } }; };
const vide = async () => ({ ok: true, json: async () => [] });

test('les prix suivent la formule choisie par Lamia', () => {
  assert.deepEqual(FORMULES.map((f) => [f.id, f.mois]), [['decouverte', 0], ['passion', 900], ['prestige', 4900]]);
  assert.equal(prixMensuel(FORMULES[2], 0), 2200); assert.equal(prixMensuel(FORMULES[2], 19), 2200); assert.equal(prixMensuel(FORMULES[2], 20), 4900);
  assert.equal(prixAnnuel(FORMULES[2], 0), 22000); assert.equal(prixAnnuel(FORMULES[2]), 49000); assert.equal(prixMensuel(FORMULES[1], 0), 900);
});
test('abonnement mensuel et annuel : prix relus côté serveur', async () => {
  for (const [periode, montant, intervalle] of [['mois', 900, 'month'], ['an', 9000, 'year']]) {
    const s = fauxStripe();
    const r = await actionAbonnement({ ...base, formule: 'passion', periode, prix: 1 }, req, { env, fetcher: vide, stripe: s });
    assert.equal(r.status, 200);
    const p = s.appels[0];
    assert.equal(p.mode, 'subscription');
    assert.equal(p.line_items[0].price_data.unit_amount, montant);
    assert.equal(p.line_items[0].price_data.recurring.interval, intervalle);
    assert.equal(p.metadata.kind, 'abonnement');
    assert.equal(p.subscription_data.metadata.formule, 'passion');
  }
});
test('Prestige : 22 € pour les 20 premiers, puis 49 €, et le prix vient toujours du serveur', async () => {
  const avec = (nb) => async (u) => ({ ok: true, json: async () => (String(u).includes('formule=eq.prestige') ? Array.from({ length: nb }, (_, i) => ({ id: i })) : []) });
  for (const [nb, periode, montant] of [[0, 'mois', 2200], [19, 'mois', 2200], [20, 'mois', 4900], [21, 'mois', 4900], [19, 'an', 22000], [20, 'an', 49000]]) {
    const s = fauxStripe();
    const r = await actionAbonnement({ ...base, formule: 'prestige', periode, prix: 1 }, req, { env, fetcher: avec(nb), stripe: s });
    assert.equal(r.status, 200);
    assert.equal(s.appels[0].line_items[0].price_data.unit_amount, montant);
    assert.equal(s.appels[0].metadata.prix_centimes, String(montant));
  }
  let d = await (await actionAbonnement({ action: 'abonnement_places' }, req, { env, fetcher: avec(17) })).json();
  assert.equal(d.restantes, 3); assert.equal(d.prix, 2200);
  d = await (await actionAbonnement({ action: 'abonnement_places' }, req, { env, fetcher: avec(21) })).json();
  assert.equal(d.restantes, 0); assert.equal(d.prix, 4900); assert.equal(d.prix_an, 49000);
  // Nombre de places illisible : pas de paiement, pour ne pas se tromper de prix.
  const s = fauxStripe();
  const r = await actionAbonnement({ ...base, formule: 'prestige' }, req, { env, fetcher: async (u) => (String(u).includes('formule=eq.prestige') ? { ok: false } : { ok: true, json: async () => [] }), stripe: s });
  assert.equal(r.status, 503); assert.equal(s.appels.length, 0);
});
test('formule gratuite, CGV absentes ou paiement fermé : aucun paiement', async () => {
  const s = fauxStripe();
  assert.equal((await actionAbonnement({ ...base, formule: 'decouverte' }, req, { env, fetcher: vide, stripe: s })).status, 400);
  assert.equal((await actionAbonnement({ ...base, cgv_accepted: false, formule: 'passion' }, req, { env, fetcher: vide, stripe: s })).status, 400);
  assert.equal((await actionAbonnement({ ...base, formule: 'passion' }, req, { env: { ...env, CHECKOUT_ENABLED: 'false' }, fetcher: vide, stripe: s })).status, 503);
  assert.equal(s.appels.length, 0);
});
test('déjà abonné : pas de second abonnement', async () => {
  const fetcher = async (u) => ({ ok: true, json: async () => (u.includes('abonnements?') ? [{ formule: 'passion', statut: 'actif' }] : []) });
  const r = await actionAbonnement({ ...base, formule: 'passion' }, req, { env, fetcher, stripe: fauxStripe() });
  assert.equal(r.status, 409);
});
test('achat à l’unité limité à 5', async () => {
  const s = fauxStripe();
  await actionAbonnement({ ...base, unite: 'speed_dating', quantite: 40 }, req, { env, fetcher: vide, stripe: s });
  assert.equal(s.appels[0].mode, 'payment');
  assert.equal(s.appels[0].line_items[0].quantity, 5);
  assert.equal(s.appels[0].line_items[0].price_data.unit_amount, 1200);
});
test('notification Stripe : abonnement enregistré une seule fois, puis mis à jour', async () => {
  const ecrits = [];
  const fetcher = async (u, o = {}) => { ecrits.push([u, o.method, o.body && JSON.parse(o.body)]); return { ok: true, json: async () => (u.includes('on_conflict') ? [{}] : []) }; };
  const session = { id: 'cs_1', subscription: 'sub_1', customer: 'cus_1', customer_details: { email: 'Nina@Example.com' }, metadata: { kind: 'abonnement', formule: 'prestige', periode: 'an', nom: 'Nina' } };
  const r = await traiterEvenementAbonnement({ type: 'checkout.session.completed', data: { object: session } }, { env, fetcher });
  assert.equal(r.status, 'created');
  const [url, , ligne] = ecrits.find(([u]) => u.includes('abonnements?on_conflict'));
  assert.match(url, /stripe_subscription_id/);
  assert.equal(ligne.email, 'nina@example.com'); assert.equal(ligne.formule, 'prestige'); assert.equal(ligne.periode, 'an');
  const r2 = await traiterEvenementAbonnement({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: 1800000000 }] }, metadata: { kind: 'abonnement' } } } }, { env, fetcher });
  assert.equal(r2.status, 'actif');
  const maj = ecrits.at(-1); assert.equal(maj[1], 'PATCH'); assert.equal(maj[2].resiliation_prevue, true);
});
test('état : crédits à l’unité restants', async () => {
  const fetcher = async (u) => ({ ok: true, json: async () => (u.includes('achats_unite') ? [{ type: 'mise_en_relation', quantite: 3, utilisees: 1 }, { type: 'speed_dating', quantite: 1, utilisees: 1 }] : []) });
  const e = await etatAbonnement('a@b.fr', { env, fetcher });
  assert.deepEqual(e.unites, { mise_en_relation: 2, speed_dating: 0 });
  assert.equal(e.abonnement, null);
});
test('retour de paiement : la session est relue chez Stripe puis enregistrée', async () => {
  const ecrits = [];
  const fetcher = async (u, o = {}) => { ecrits.push([u, o.method]); return { ok: true, json: async () => (u.includes('on_conflict') ? [{}] : []) }; };
  const stripe = { checkout: { sessions: { retrieve: async () => ({ id: 'cs_test_1', status: 'complete', payment_status: 'paid', livemode: false, subscription: 'sub_9', customer: 'cus_9', customer_email: 'a@b.fr', metadata: { kind: 'abonnement', formule: 'passion', periode: 'mois' } }) } }, subscriptions: { retrieve: async () => ({ id: 'sub_9', status: 'active', items: { data: [{ current_period_end: 1800000000 }] }, metadata: { kind: 'abonnement' } }) } };
  const r = await actionAbonnement({ action: 'abonnement_confirmer', session_id: 'cs_test_1' }, req, { env, fetcher, stripe });
  const d = await r.json();
  assert.equal(d.statut, 'paye'); assert.equal(d.nom, 'Passion');
  assert(ecrits.some(([u]) => u.includes('abonnements?on_conflict')));
  assert(ecrits.some(([u, m]) => u.includes('stripe_subscription_id=eq.sub_9') && m === 'PATCH'));
  const faux = await actionAbonnement({ action: 'abonnement_confirmer', session_id: 'pas_une_session' }, req, { env, fetcher, stripe });
  assert.equal(faux.status, 400);
});

test('prix à l’unité et matchs en cours choisis par Lamia', () => {
  assert.deepEqual(FORMULES.map((f) => f.matchs), [1, 2, 5]);
  assert.equal(unite('mise_en_relation').prix, 500);
  assert.equal(unite('speed_dating').prix, 1200);
  assert.equal(unite('photo_match').prix, 300);
});
test('la photo du match : jamais sans compte, ni sans accord du match', async () => {
  const s = fauxStripe();
  const r1 = await actionAbonnement({ action: 'abonnement_payer', cgv_accepted: true, unite: 'photo_match', ref: 12 }, req, { env, fetcher: vide, stripe: s });
  assert.equal(r1.status, 401);
  const auth = new Request('https://lamia-femme-berbere.com/api/preorder', { method: 'POST', headers: { Authorization: 'Bearer t' } });
  const monde = (cible, interet = [{ id: 'i' }]) => async (u) => {
    const url = String(u);
    if (url.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: '00000000-0000-0000-0000-000000000001', email: 'nina@example.com' }) };
    if (url.includes('annonces?ref=eq.12')) return { ok: true, json: async () => cible };
    if (url.includes('annonces?user_id')) return { ok: true, json: async () => [{ id: 'a1', ref: 5 }] };
    if (url.includes('profils_outil')) return { ok: true, json: async () => [] };
    if (url.includes('annonce_interets')) return { ok: true, json: async () => interet };
    if (url.includes('annonce_files')) return { ok: true, json: async () => [{ id: 'f' }] };
    return { ok: true, json: async () => [] };
  };
  const payer = (fetcher) => actionAbonnement({ action: 'abonnement_payer', cgv_accepted: true, unite: 'photo_match', ref: 12 }, auth, { env, fetcher, stripe: s });
  assert.equal((await payer(monde([{ id: 'c', ref: 12, photo_partage: false }]))).status, 409);
  assert.equal((await payer(monde([{ id: 'c', ref: 12, photo_partage: true }], []))).status, 409);
  assert.equal(s.appels.length, 0);
  assert.equal((await payer(monde([{ id: 'c', ref: 12, photo_partage: true }]))).status, 200);
  assert.equal(s.appels[0].line_items[0].price_data.unit_amount, 300);
  assert.equal(s.appels[0].metadata.photo_ref, '12');
  // Sans passer par Mon espace, le bouton public ne peut pas vendre la photo.
  assert.equal((await actionAbonnement({ ...base, unite: 'photo_match' }, req, { env, fetcher: vide, stripe: s })).status, 401);
});
test('l’heure de photo commence au paiement', async () => {
  const lignes = [];
  const fetcher = async (u, init) => { if (init?.method === 'POST') lignes.push(JSON.parse(init.body)); return { ok: true, json: async () => [{}] }; };
  const t = new Date('2026-11-03T10:00:00Z');
  await traiterEvenementAbonnement({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', customer_email: 'x@y.fr', metadata: { kind: 'achat_unite', type: 'photo_match', quantite: '1', photo_ref: '12', email: 'nina@example.com' } } } }, { env, fetcher, now: () => t });
  assert.equal(lignes[0].photo_ref, 12);
  assert.equal(lignes[0].email, 'nina@example.com');
  assert.equal(lignes[0].photo_jusqu_a, '2026-11-03T11:00:00.000Z');
});
