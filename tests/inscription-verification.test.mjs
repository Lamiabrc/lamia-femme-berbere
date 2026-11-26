import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleAnnonces } from '../lib/annonces.mjs';

const SIGNUP_LINK = 'https://auth.example/verify?token=secret-qui-ne-doit-pas-etre-public';
const credentials = { email: 'Nina@Example.com', password: 'motdepasse-test', prenom: '<Nina>', retour: '/confirmer/?n=12&t=fiche#suite' };
function serveur({ delivered = true, link = SIGNUP_LINK, failure = null } = {}) {
  const calls = [], mails = [], attempts = [];
  const ctx = {
    env: { SUPABASE_SERVICE_ROLE_KEY: 'test', INSCRIPTION_EMAIL_VERIFIE: '1' }, admin: false, user: null, ipHash: 'ip-test',
    now: () => new Date('2026-11-19T10:00:00Z'), alerter: async () => {},
    read: async () => { if (failure === 'read') throw new Error('database'); return []; },
    insert: async (table, value) => { if (failure === 'insert') throw new Error('database'); attempts.push({ table, value }); },
    patch: async () => ({}),
    call: async (path, options = {}) => {
      calls.push({ path, body: options.body && JSON.parse(options.body) });
      return Response.json({ user: { id: 'u-test' }, properties: { action_link: link } });
    },
    email: async (...args) => { mails.push(args); return delivered; },
  };
  return { calls, mails, attempts, send: (body = credentials) => handleAnnonces('annonce_creer_compte', body, ctx) };
}

test('compte créé : confirmation réelle par email, sans valider l’adresse côté administrateur', async () => {
  const s = serveur();
  const r = await s.send();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, confirmation_requise: true });
  assert.equal(s.calls[0].body.redirect_to, 'https://lamia-femme-berbere.com/confirmer/?n=12&t=fiche#suite');
  assert.equal(s.calls[0].body.type, 'signup');
  assert.equal(s.calls[0].body.password, credentials.password);
  assert.equal(s.calls[0].body.data.first_name, '<Nina>');
  assert.equal(s.attempts.length, 1);
  assert.equal(s.mails.length, 1);
  assert.ok(s.mails[0][2].includes(SIGNUP_LINK.replaceAll('&','&amp;')));
  assert.ok(!s.mails[0].join('').includes(credentials.password));
  assert.equal(s.mails[0][4], true);
  const maj = s.calls.find((c) => c.path.startsWith('/auth/v1/admin/users/'));
  assert.equal(maj, undefined);
});

test('une destination externe ne devient jamais la destination de confirmation', async () => {
  for (const retour of ['https://ailleurs.example/', '//ailleurs.example/', 'javascript:alert(1)']) {
    const s = serveur();
    await s.send({ ...credentials, retour });
    assert.equal(s.calls[0].body.redirect_to, 'https://lamia-femme-berbere.com/mon-espace/');
  }
});

test('sans quota lisible ou sans journalisation, aucune création et aucun email', async () => {
  for (const failure of ['read', 'insert']) {
    const s = serveur({ failure });
    assert.equal((await s.send()).status, 503);
    assert.equal(s.calls.length, 0);
    assert.equal(s.mails.length, 0);
  }
});

test('email impossible : erreur explicite, sans contourner la preuve d’adresse ; lien manquant : erreur', async () => {
  const s = serveur({ delivered: false });
  const r = await s.send();
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'envoi_impossible', confirmation_requise: true });
  const maj = s.calls.find((c) => c.path === '/auth/v1/admin/users/u-test');
  assert.equal(maj, undefined);
  const missing = serveur({ link: null });
  assert.equal((await missing.send()).status, 502);
  assert.equal(missing.mails.length, 0);
});

test('le navigateur reste en attente et conserve la route au lieu de continuer la connexion', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = globalThis.location;
  try {
    globalThis.location = { pathname: '/rencontres/', search: '?ref=12', hash: '#confier' };
    let sent;
    globalThis.fetch = async (_url, options) => { sent = JSON.parse(options.body); return Response.json({ ok: true, confirmation_requise: true }); };
    const source = await readFile(new URL('../src/confidences-commun.js', import.meta.url), 'utf8');
    const { creerCompte, CONFIRMATION_COMPTE } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    let continued = false;
    await assert.rejects(async () => { await creerCompte(credentials); continued = true; }, (e) => e.code === 'confirmation_requise' && e.message === CONFIRMATION_COMPTE);
    assert.equal(continued, false);
    assert.equal(sent.retour, '/rencontres/?ref=12#confier');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  }
});
