import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBal, signPass } from '../lib/bal.mjs';
import { reciproques, etatPour, etatCouple, pairKey } from '../lib/demasque.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', DAILY_API_KEY: 'daily_fixture' };
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const req = (b, h = {}) => new Request('https://x/api/bal', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });

test('réciprocité : seulement quand les deux se sont choisis', () => {
  const w = [{ uid: A, name: 'Amel', wished: [B, C] }, { uid: B, name: 'Karim', wished: [A] }, { uid: C, name: 'Yanis', wished: [] }];
  const r = reciproques(w);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].a.uid, r[0].b.uid].sort(), [A, B].sort());
});

test('états : la réponse de l’autre n’est jamais dévoilée avant la sienne', () => {
  assert.equal(etatPour(A, {}, B), 'a_repondre');
  assert.equal(etatPour(A, { [B]: false }, B), 'a_repondre'); // l'autre a dit non : on ne le dit pas encore
  assert.equal(etatPour(A, { [B]: true }, B), 'a_repondre');
  assert.equal(etatPour(A, { [A]: true }, B), 'attente');
  assert.equal(etatPour(A, { [A]: true, [B]: false }, B), 'pas_cette_fois');
  assert.equal(etatPour(A, { [A]: true, [B]: true }, B), 'confirme');
  assert.equal(etatCouple({ [A]: true, [B]: true }, A, B), 'confirme');
  assert.equal(etatCouple({ [A]: true }, A, B), 'en_cours');
});

// Base simulée : souhaits d'une soirée passée, réponses de démasquage.
function fake(user) {
  const store = new Map([
    [`bal_wish:s1:${A}`, { uid: A, name: 'Amel', ev: 'e', wished: [B] }],
    [`bal_wish:s1:${B}`, { uid: B, name: 'Karim', ev: 'e', wished: [A] }],
    [`bal_wish:s1:${C}`, { uid: C, name: 'Yanis', ev: 'e', wished: [A] }],
  ]);
  const calls = [];
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
  const fetcher = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.includes('/auth/v1/user')) return user ? ok(user) : { ok: false, status: 401, json: async () => ({}) };
    if (url.includes('platform_settings?on_conflict')) { store.set(body.key, body.value); return ok(null); }
    if (url.includes('platform_settings?key=like.')) {
      const motif = decodeURIComponent(url.split('key=like.')[1].split('&')[0]).replace('*', '');
      return ok([...store].filter(([k]) => k.startsWith(motif)).map(([key, value]) => ({ key, value })));
    }
    if (url.includes('platform_settings?key=eq.')) {
      const k = decodeURIComponent(url.split('key=eq.')[1].split('&')[0]);
      return ok(store.has(k) ? [{ value: store.get(k) }] : []);
    }
    return ok([]); // notifications, alertes : sans effet ici
  };
  return { fetcher, calls, store };
}

test('Mon espace : chaque personne voit son couple réciproque et répond', async () => {
  const f = fake({ id: A, email: 'a@x.fr' });
  const liste = await (await handleBal(req({ action: 'mes_demasquages' }, { authorization: 'Bearer t' }), { env, fetcher: f.fetcher })).json();
  assert.equal(liste.couples.length, 1);
  assert.equal(liste.couples[0].autre.name, 'Karim');
  assert.equal(liste.couples[0].etat, 'a_repondre');

  const r1 = await (await handleBal(req({ action: 'demasque_repondre', session: 's1', autre: B, oui: true }, { authorization: 'Bearer t' }), { env, fetcher: f.fetcher })).json();
  assert.equal(r1.etat, 'attente');

  // Karim répond oui à son tour : confirmé, et Lamia est prévenue.
  const g = fake({ id: B, email: 'b@x.fr' });
  for (const [k, v] of f.store) g.store.set(k, v);
  const r2 = await (await handleBal(req({ action: 'demasque_repondre', session: 's1', autre: A, oui: true }, { authorization: 'Bearer t' }), { env, fetcher: g.fetcher })).json();
  assert.equal(r2.etat, 'confirme');
  assert.deepEqual(g.store.get(`bal_demasque:s1:${pairKey(A, B)}`).rep, { [A]: true, [B]: true });
});

test('Mon espace : pas de couple pour un souhait à sens unique, connexion obligatoire', async () => {
  const f = fake({ id: C });
  const liste = await (await handleBal(req({ action: 'mes_demasquages' }, { authorization: 'Bearer t' }), { env, fetcher: f.fetcher })).json();
  assert.equal(liste.couples.length, 0);
  const r = await handleBal(req({ action: 'demasque_repondre', session: 's1', autre: A, oui: true }, { authorization: 'Bearer t' }), { env, fetcher: f.fetcher });
  assert.equal(r.status, 404);
  const anonyme = await handleBal(req({ action: 'mes_demasquages' }), { env, fetcher: fake(null).fetcher });
  assert.equal(anonyme.status, 401);
});

test('pendant le tour du démasquage : la réponse est enregistrée depuis la salle', async () => {
  const f = fake(null);
  const ends = new Date(Date.now() + 5 * 60e3).toISOString();
  const state = { open: true, session: 's1', phase: 'tour', grand: { name: 'g' }, soiree: { events: {} }, met: {},
    assign: { [A]: { room: 'r', url: 'u', partner: 'Karim', partner_uid: B, ends_at: ends, demasque: true, reciproque: true } } };
  f.store.set('bal_state', state);
  const pass = signPass(env, { uid: A, ev: 'e', name: 'Amel', s: 's1', exp: Date.now() + 3600e3 });
  const st = await (await handleBal(req({ action: 'state', pass }), { env, fetcher: f.fetcher })).json();
  assert.equal(st.reciproque, true);
  assert.equal(st.ma_reponse, null);
  const r = await handleBal(req({ action: 'demasque', pass, oui: false }), { env, fetcher: f.fetcher });
  assert.equal(r.status, 200);
  assert.equal(f.store.get(`bal_demasque:s1:${pairKey(A, B)}`).rep[A], false);
});
