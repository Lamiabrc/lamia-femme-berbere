import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces } from '../lib/annonces.mjs';

// Profils publiés sans photo : un message, 7 jours, puis mise en pause ; retour automatique quand la photo arrive.
function monde() {
  const annonces = [
    { id: 'a1', ref: 1, user_id: 'u1', genre: 'femme', prenom: 'Werda', email: 'w@x.fr', status: 'publiee', test: false, en_match: false, pause_at: null, moderateur_at: null },
    { id: 'a2', ref: 2, user_id: 'u2', genre: 'homme', prenom: 'Rachid', email: 'r@x.fr', status: 'publiee', test: false, en_match: false, pause_at: null, moderateur_at: null },
    { id: 'a3', ref: 3, user_id: 'u3', genre: 'homme', prenom: 'Said', email: 's@x.fr', status: 'publiee', test: false, en_match: true, pause_at: null, moderateur_at: null },
  ];
  const fichiers = [{ annonce_id: 'a2' }];
  const reglages = {}, mails = [], fiches = [];
  let jour = new Date('2026-11-11T17:00:00Z');
  const ok = (x) => ({ ok: true, json: async () => x });
  const read = async (u) => {
    if (u.includes('/annonces?status=eq.publiee&test=eq.false&user_id=not.is.null&moderateur_at=is.null')) return annonces.filter((a) => a.status === 'publiee' && !a.test && !a.moderateur_at);
    if (u.includes('/annonce_files?kind=in.(photo,video)&select=annonce_id')) return fichiers;
    if (u.includes('key=eq.ultimatum_photos')) return reglages.ultimatum_photos ? [{ value: reglages.ultimatum_photos }] : [];
    return [];
  };
  const call = async (u, o) => { if (u.includes('platform_settings?on_conflict') && o?.body) { const b = JSON.parse(o.body); reglages[b.key] = b.value; } return ok([]); };
  const patch = async (t, filtre, v) => { if (t === 'annonces') for (const a of annonces) if (filtre === `id=eq.${a.id}`) Object.assign(a, v); if (t === 'profils_outil') fiches.push([filtre, v]); return { ok: true }; };
  const ctx = () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert: async () => ({}), patch, admin: false, user: null, ipHash: 'ip', now: () => jour, email: async (...a) => { mails.push(a); return true; }, alerter: async () => {}, cron: true });
  const cron = async () => (await (await handleAnnonces('annonce_rappels_cron', {}, ctx())).json()).photos;
  return { annonces, fichiers, reglages, mails, fiches, cron, avancer: (j) => { jour = new Date(jour.getTime() + j * 86400e3); } };
}

test('sans photo : prévenue une seule fois, avec le message de Lamia accordé au genre', async () => {
  const w = monde();
  assert.deepEqual(await w.cron(), { prevenus: 2, retires: 0, revenus: 0 });
  const [, titre, , texte] = w.mails.find((m) => m[0] === 'w@x.fr');
  assert.equal(titre, 'A weltma Werda, il manque ta photo');
  assert.match(texte, /Ajoute une photo ou reviens quand tu seras prête à te marier\./);
  assert.match(w.mails.find((m) => m[0] === 's@x.fr')[3], /prêt à te marier/);
  assert.equal(w.mails.some((m) => m[0] === 'r@x.fr'), false);
  w.avancer(3);
  assert.deepEqual(await w.cron(), { prevenus: 0, retires: 0, revenus: 0 });
  assert.equal(w.mails.length, 2);
});

test('7 jours sans photo : mise en pause, sauf en match ; la photo fait revenir le profil', async () => {
  const w = monde();
  await w.cron();
  w.avancer(7);
  assert.deepEqual(await w.cron(), { prevenus: 0, retires: 1, revenus: 0 });
  assert.ok(w.annonces[0].pause_at); assert.equal(w.annonces[2].pause_at, null);
  assert.deepEqual(w.fiches.at(-1)[0], 'user_id=eq.u1');
  w.avancer(1);
  w.fichiers.push({ annonce_id: 'a1' });
  assert.deepEqual(await w.cron(), { prevenus: 0, retires: 0, revenus: 1 });
  assert.equal(w.annonces[0].pause_at, null);
  assert.equal(w.reglages.ultimatum_photos[1], undefined);
});

test('une pause choisie par la personne n’est pas levée, et une lecture vide ne prévient personne', async () => {
  const w = monde();
  await w.cron();
  w.avancer(2);
  w.annonces[0].pause_at = '2026-11-13T09:00:00.000Z';
  w.avancer(6);
  assert.deepEqual(await w.cron(), { prevenus: 0, retires: 0, revenus: 0 });
  w.fichiers.push({ annonce_id: 'a1' });
  await w.cron();
  assert.equal(w.annonces[0].pause_at, '2026-11-13T09:00:00.000Z');
  const v = monde(); v.fichiers.length = 0;
  assert.equal(await v.cron(), null); assert.equal(v.mails.length, 0);
});
