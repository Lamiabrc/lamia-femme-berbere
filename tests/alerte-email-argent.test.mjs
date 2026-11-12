// Email à Lamia : seulement quand de l'argent arrive. Le reste : notification et journal dans l'appli.
import test from 'node:test';
import assert from 'node:assert/strict';
import { alerterLamia } from '../lib/alerte-lamia.mjs';

function faux() {
  const mails = []; const journal = [];
  const fetcher = async (url, init = {}) => {
    if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return { ok: true }; }
    if (url.includes('/rest/v1/journal_lamia')) { journal.push(JSON.parse(init.body)); return { ok: true, json: async () => [] }; }
    if (url.includes('key=eq.confidences_reglages')) return { ok: true, json: async () => [{ value: { email_alerte: 'alerte@exemple.fr', alertes_email: true, alertes_push: false } }] };
    return { ok: true, json: async () => [] };
  };
  return { mails, journal, fetcher, env: { SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r' } };
}

test('une vente part par email', async () => {
  const f = faux();
  const r = await alerterLamia({ titre: 'Nouvelle vente · 25,00 €', lignes: ['Werdi'], tag: 'vente', argent: true }, f);
  assert.equal(r.email, true);
  assert.deepEqual(f.mails[0].to, ['alerte@exemple.fr']);
  assert.equal(f.journal.length, 1);
});

test('une alerte sans argent reste dans l’appli : journal, pas d’email', async () => {
  for (const a of [{ titre: 'Intérêt réciproque · n° 3 ↔ n° 9', tag: 'reciproque' }, { titre: 'Nouvelle inscription · Salon', tag: 'inscription' }, { titre: 'Abonnement terminé', tag: 'abonnement' }, { titre: 'Nouveau testeur Google Play', tag: 'testeur' }]) {
    const f = faux();
    const r = await alerterLamia(a, f);
    assert.equal(r.email, false, a.titre);
    assert.equal(f.mails.length, 0, a.titre);
    assert.equal(f.journal.length, 1, a.titre);
  }
});
