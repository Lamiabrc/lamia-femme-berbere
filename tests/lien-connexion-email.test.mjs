import test from 'node:test';
import assert from 'node:assert/strict';
import { backend } from './fake-confidences.mjs';
import { handleConfidences } from '../lib/confidences.mjs';

// 17 nov. 2026 : « Recevoir un lien de connexion par email » échouait 5 fois sur 9 (502 envoi_impossible),
// surtout le soir, quand beaucoup d'emails partent en même temps.
const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', RESEND_API_KEY: 're_test', RESEND_PAUSE_MS: '1' };

function serveur({ resend }) {
  const be = backend();
  be.db.liens_connexion = [];
  let essais = 0;
  const fetcher = async (u, init = {}) => {
    const url = new URL(u);
    const rep = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.pathname === '/rest/v1/rpc/compte_existe') return rep(true);
    if (url.pathname === '/auth/v1/admin/generate_link') return rep({ action_link: 'https://x/verify?token=t', user_metadata: { first_name: 'Nadia' } });
    if (url.hostname === 'api.resend.com') { essais += 1; const s = resend(essais); if (s !== 200) return rep({ message: 'non' }, s); }
    return be.fetcher(u, init);
  };
  const demander = async () => {
    const r = await handleConfidences(new Request('https://x/api/confidences', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' }, body: JSON.stringify({ action: 'annonce_lien_connexion', email: 'nadia@exemple.fr', retour: 'espace' }) }), { env, fetcher });
    return { status: r.status, body: await r.json() };
  };
  return { be, demander, essais: () => essais };
}

test('lien de connexion : Resend refuse une fois (429, trop d’envois à la seconde), le lien part quand même', async () => {
  const s = serveur({ resend: (n) => (n === 1 ? 429 : 200) });
  const r = await s.demander();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, existe: true });
  assert.equal(s.be.mails.length, 1);
});

test('lien de connexion : Resend en panne, trois essais puis l’erreur (pas de boucle sans fin)', async () => {
  const s = serveur({ resend: () => 503 });
  const r = await s.demander();
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'envoi_impossible');
  assert.equal(s.essais(), 3);
});

test('lien de connexion : une adresse refusée par Resend (422) n’est pas réessayée', async () => {
  const s = serveur({ resend: () => 422 });
  const r = await s.demander();
  assert.equal(r.status, 502);
  assert.equal(s.essais(), 1);
});
