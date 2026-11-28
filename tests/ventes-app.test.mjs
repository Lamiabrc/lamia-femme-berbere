import test from 'node:test';
import assert from 'node:assert/strict';
import { ventesApp } from '../lib/ventes-app.mjs';

const tables = {
  abonnements: [
    { email: 'a@x.fr', nom: 'Asma', formule: 'prestige', periode: 'mois', statut: 'actif', prix_centimes: 2200, stripe_subscription_id: 's1' },
    { email: 'b@x.fr', nom: 'Bilal', formule: 'passion', periode: 'an', statut: 'actif', prix_centimes: 9000, stripe_subscription_id: 's2' },
    { email: 'c@x.fr', nom: 'Célia', formule: 'passion', periode: 'mois', statut: 'impaye', prix_centimes: 900, stripe_subscription_id: 's3' },
    { email: 'd@x.fr', nom: 'Dalil', formule: 'passion', periode: 'mois', statut: 'resilie', prix_centimes: 900, stripe_subscription_id: 's4' },
  ],
  encaissements: [{ stripe_subscription_id: 's1', email: 'a@x.fr', montant_centimes: 2200, paye_at: '2026-11-03T10:00:00Z' }, { stripe_subscription_id: 's2', email: 'b@x.fr', montant_centimes: 9000, paye_at: '2026-10-03T10:00:00Z' }],
  achats_unite: [
    { id: 'u1', email: 'a@x.fr', nom: 'Asma', type: 'photo_match', quantite: 1, utilisees: 1, montant_centimes: 300, created_at: '2026-11-02T10:00:00Z' },
    { id: 'u3', email: 'c@x.fr', nom: 'Cadeau', type: 'coaching', quantite: 1, utilisees: 0, stripe_session_id: 'offert-1', created_at: '2026-11-02T10:00:00Z' },
    { id: 'u2', email: 'b@x.fr', nom: null, type: 'live_priorite', quantite: 1, utilisees: 0, montant_centimes: null, created_at: '2026-11-01T10:00:00Z' },
  ],
  event_registrations: [{ event_id: 'e1', user_id: 'x', created_at: '2026-11-01T12:00:00Z' }, { event_id: 'gratuite', user_id: 'y', created_at: '2026-11-01T12:00:00Z' }],
  speed_dating_events: [{ id: 'e1', title: 'Bal masqué', ticket_price_cents: 1200 }],
};
const read = async (u) => tables[u.match(/rest\/v1\/(\w+)/)[1]];

test('l’onglet Ventes additionne abonnements, unité et soirées payantes', async () => {
  const v = await ventesApp({ read, now: () => new Date('2026-11-04T12:00:00Z') });
  assert.equal(v.total, 2200 + 9000 + 300 + 500 + 1200);
  assert.equal(v.mois, 2200 + 300 + 500 + 1200); // pas l'année payée en octobre
  assert.equal(v.abonnes, 2); assert.equal(v.a_traiter, 1);
  assert.equal(v.par_mois, 2200 + 750); // l'annuel compte pour un douzième
  assert.deepEqual(v.formules.map((f) => [f.nom, f.abonnes]), [['Passion', 1], ['Prestige', 1]]);
  assert.equal(v.lignes[0].service, 'Abonnement Prestige');
  assert.equal(v.lignes.length, 5); // la soirée gratuite ne compte pas
  assert.equal(v.services.find((s) => s.service === 'Passage en priorité en live').montant, 500); // prix du catalogue si le montant manque
  assert.deepEqual(v.a_livrer.map((x) => x.id), ['u2']);
});

test('une mise en relation payée (8 €) est à faire, avec les deux numéros pour « Matcher »', async () => {
  const achats = [...tables.achats_unite, { id: 'm1', email: 'e@x.fr', nom: 'e@x.fr', type: 'match_lamia', quantite: 1, utilisees: 0, montant_centimes: 800, cible: '8047', demandeur_ref: '359', stripe_session_id: 'cs_live_1', created_at: '2026-11-03T19:46:00Z' }, { id: 'm2', email: 'f@x.fr', type: 'match_lamia', quantite: 1, utilisees: 1, montant_centimes: 800, cible: '262', demandeur_ref: '360', stripe_session_id: 'cs_live_2', created_at: '2026-11-03T21:56:00Z' }];
  const v = await ventesApp({ read: async (u) => (u.includes('achats_unite') ? achats : read(u)), now: () => new Date('2026-11-04T12:00:00Z') });
  const rel = v.a_livrer.filter((u) => u.type === 'match_lamia');
  assert.deepEqual(rel.map((u) => [u.a, u.b]), [['359', '8047']]); // celle déjà faite n'y est plus
  assert.ok(v.lignes.some((l) => l.service === 'Lamia vous met en relation' && l.montant === 800));
});
