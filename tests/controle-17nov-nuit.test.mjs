import test from 'node:test';
import assert from 'node:assert/strict';
import { backend } from './fake-confidences.mjs';
import { handleConfidences } from '../lib/confidences.mjs';
import { handleAnnonces } from '../lib/annonces.mjs';
import { discussionsPourLamia } from '../lib/discussions.mjs';

// Contrôle du 17 nov. 2026 au soir.

test('« mon_genre » arrive bien jusqu’aux annonces (avant : refusé « unknown_action » à chaque fois)', async () => {
  const nadia = { id: 'nadia', email: 'nadia@exemple.fr', email_confirmed_at: '2026', app_metadata: {} };
  const be = backend({ users: { N: nadia } });
  be.db.annonces.push({ id: 'a1', ref: 42, user_id: 'nadia', genre: 'femme', created_at: '2026-11-01' });
  const r = await handleConfidences(new Request('https://x/api/confidences', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', authorization: 'Bearer N' }, body: JSON.stringify({ action: 'mon_genre' }) }), { env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, fetcher: be.fetcher });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).genre, 'femme');
});

test('liste publique et swipe : plus de 80 profils, aucun n’est coupé', async () => {
  const annonces = Array.from({ length: 120 }, (_, i) => ({ ref: i + 1, genre: i % 2 ? 'homme' : 'femme', birth_date: '1990-01-01', pays: 'France', situation: 'Célibataire', age_min: 30, age_max: 45, published_at: new Date(Date.UTC(2026, 10, 1) + i * 3600e3).toISOString(), matching: { religion: 'Islam', niveauEtudeCategorie: 'Bac+3', situation: 'Célibataire' }, profil: 'Sérieux.', recherche: 'Sérieuse.' }));
  const read = async (u) => {
    if (u.startsWith('/rest/v1/annonces?status=eq.publiee&visible_anonyme=eq.true&anonyme_ok=eq.true')) { const m = u.match(/limit=(\d+)/); return annonces.slice(0, m ? Number(m[1]) : undefined); }
    return [];
  };
  const ctx = { env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call: async () => ({ ok: true, json: async () => [] }), read, insert: async () => ({}), patch: async () => ({ ok: true }), admin: false, user: null, ipHash: 'ip', now: () => new Date('2026-11-17T20:00:00Z'), email: async () => true, alerter: async () => {} };
  const tous = (await (await handleAnnonces('annonces_publiques', {}, ctx)).json()).annonces;
  // Le filtre « essentiel manquant » peut retirer des profils incomplets, jamais la limite de lecture.
  assert.ok(tous.length > 80, `seulement ${tous.length} profils sur ${annonces.length}`);
});

test('console de Lamia : le nombre de messages est lu pour les discussions affichées, sans limite à 5000 en tout', async () => {
  const urls = [];
  const read = async (u) => {
    urls.push(u);
    if (u.startsWith('/rest/v1/discussions?')) return [{ id: 'd1' }, { id: 'd2' }];
    if (u.startsWith('/rest/v1/discussion_messages?')) return [{ discussion_id: 'd1' }, { discussion_id: 'd1' }, { discussion_id: 'd2' }];
    return [];
  };
  await discussionsPourLamia({ read });
  const u = urls.find((x) => x.startsWith('/rest/v1/discussion_messages?'));
  assert.match(u, /discussion_id=in\.\(d1,d2\)/);
  assert.doesNotMatch(u, /limit=5000\b/);
});
