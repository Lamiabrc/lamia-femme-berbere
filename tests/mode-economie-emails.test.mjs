import test from 'node:test';
import assert from 'node:assert/strict';
import { backend } from './fake-confidences.mjs';
import { handleConfidences } from '../lib/confidences.mjs';

// 24 nov. 2026 : quota Resend du mois dépassé (3 353 / 3 000). Seuls la confirmation de compte et le lien de connexion partent.
const base = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', RESEND_API_KEY: 're_test', RESEND_PAUSE_MS: '1' };

function serveur(env) {
  const be = backend();
  be.db.liens_connexion = []; be.db.creations_compte = [];
  const fetcher = async (u, init = {}) => {
    const url = new URL(u);
    const rep = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.pathname === '/rest/v1/rpc/compte_existe') return rep(true);
    if (url.pathname === '/auth/v1/admin/generate_link') return rep({ action_link: 'https://x/verify?token=t', user_metadata: {} });
    return be.fetcher(u, init);
  };
  return { be, appeler: async (body) => {
    const r = await handleConfidences(new Request('https://x/api/confidences', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' }, body: JSON.stringify(body) }), { env, fetcher });
    return { status: r.status, body: await r.json() };
  } };
}

test('mode économie : le lien de connexion part toujours', async () => {
  const s = serveur(base);
  const r = await s.appeler({ action: 'annonce_lien_connexion', email: 'nadia@exemple.fr', retour: 'espace' });
  assert.equal(r.status, 200);
  assert.equal(s.be.mails.length, 1);
});

test('mode économie : la confirmation de compte part toujours', async () => {
  const s = serveur(base);
  const r = await s.appeler({ action: 'annonce_creer_compte', email: 'nadia@exemple.fr', password: 'Motdepasse12', prenom: 'Nadia', source: 'site' });
  assert.equal(r.body.confirmation_requise, true, JSON.stringify(r));
  assert.equal(s.be.mails.length, 1);
});
