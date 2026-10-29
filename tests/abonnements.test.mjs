import test from 'node:test';
import assert from 'node:assert/strict';
import { actionAbonnement, traiterEvenementAbonnement, etatAbonnement } from '../lib/abonnements.mjs';
import { FORMULES, prixAnnuel } from '../content/abonnements.mjs';

const env = { CHECKOUT_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_x', SUPABASE_SERVICE_ROLE_KEY: 'srv' };
const req = new Request('https://lamia-femme-berbere.com/api/preorder', { method: 'POST' });
const base = { action: 'abonnement_payer', cgv_accepted: true, email: 'nina@example.com', nom: 'Nina' };
const fauxStripe = () => { const appels = []; return { appels, checkout: { sessions: { create: async (p) => { appels.push(p); return { url: 'https://checkout.stripe.com/x' }; } } } }; };
const vide = async () => ({ ok: true, json: async () => [] });

test('les prix suivent la formule choisie par Lamia', () => {
  assert.deepEqual(FORMULES.map((f) => [f.id, f.mois]), [['decouverte', 0], ['coeur', 1490], ['passion', 2990], ['prestige', 5900]]);
  assert.equal(prixAnnuel(FORMULES[2]), 29900);
});
test('abonnement mensuel et annuel : prix relus côté serveur', async () => {
  for (const [periode, montant, intervalle] of [['mois', 2990, 'month'], ['an', 29900, 'year']]) {
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
test('formule gratuite, CGV absentes ou paiement fermé : aucun paiement', async () => {
  const s = fauxStripe();
  assert.equal((await actionAbonnement({ ...base, formule: 'decouverte' }, req, { env, fetcher: vide, stripe: s })).status, 400);
  assert.equal((await actionAbonnement({ ...base, cgv_accepted: false, formule: 'coeur' }, req, { env, fetcher: vide, stripe: s })).status, 400);
  assert.equal((await actionAbonnement({ ...base, formule: 'coeur' }, req, { env: { ...env, CHECKOUT_ENABLED: 'false' }, fetcher: vide, stripe: s })).status, 503);
  assert.equal(s.appels.length, 0);
});
test('déjà abonné : pas de second abonnement', async () => {
  const fetcher = async (u) => ({ ok: true, json: async () => (u.includes('abonnements?') ? [{ formule: 'coeur', statut: 'actif' }] : []) });
  const r = await actionAbonnement({ ...base, formule: 'passion' }, req, { env, fetcher, stripe: fauxStripe() });
  assert.equal(r.status, 409);
});
test('achat à l’unité limité à 5', async () => {
  const s = fauxStripe();
  await actionAbonnement({ ...base, unite: 'speed_dating', quantite: 40 }, req, { env, fetcher: vide, stripe: s });
  assert.equal(s.appels[0].mode, 'payment');
  assert.equal(s.appels[0].line_items[0].quantity, 5);
  assert.equal(s.appels[0].line_items[0].price_data.unit_amount, 900);
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
