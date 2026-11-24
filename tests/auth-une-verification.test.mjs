import test from 'node:test';
import assert from 'node:assert/strict';
import { userFromRequest } from '../lib/event-tickets.mjs';

const requete = (t) => new Request('https://x.test/api/confidences', { method: 'POST', headers: { authorization: `Bearer ${t}` } });

test('vingt demandes simultanées avec le même jeton : une seule vérification chez Supabase', async () => {
  let appels = 0;
  const fetcher = async () => { appels += 1; await new Promise((r) => setTimeout(r, 30)); return Response.json({ id: 'u1', email: 'a@x.fr' }); };
  const jeton = `jeton-test-${Date.now()}`;
  const res = await Promise.all(Array.from({ length: 20 }, () => userFromRequest(requete(jeton), { fetcher })));
  assert.equal(appels, 1);
  assert.ok(res.every((u) => u?.id === 'u1'));
});
test('un échec ne reste pas en mémoire : la demande suivante réessaie', async () => {
  let appels = 0;
  const fetcher = async () => { appels += 1; if (appels <= 2) throw Object.assign(new Error('t'), { name: 'TimeoutError' }); return Response.json({ id: 'u2' }); };
  const jeton = `jeton-echec-${Date.now()}`;
  await assert.rejects(() => userFromRequest(requete(jeton), { fetcher }));
  assert.equal((await userFromRequest(requete(jeton), { fetcher }))?.id, 'u2');
});
