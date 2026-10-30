import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces, pseudoTikTok, normLien, empreinteLien } from '../lib/annonces.mjs';

// Petite base en mémoire, juste assez pour les actions testées.
function monde({ compte = true, tiktok = {} } = {}) {
  const db = { annonces: [], annonce_interets: [], annonce_files: [], annonce_passes: [] }, alertes = [];
  const json = async (x) => ({ ok: true, json: async () => x });
  const call = async (u, o = {}) => {
    if (u.includes('/rpc/compte_existe')) return json(compte);
    if (u.startsWith('/storage/')) return json([]);
    return json([]);
  };
  const read = async (u) => {
    const h = u.match(/outil_tiktok\?h=in\.\(([0-9a-f,]+)\)/); if (h) { const f = h[1].split(',').find((x) => tiktok[x]); return f ? [{ outil_id: tiktok[f] }] : []; }
    if (u.includes('lien_h=eq.')) { const x = u.match(/lien_h=eq\.([0-9a-f]+)/)[1]; return db.annonces.filter((a) => a.lien_h === x && ['a_verifier', 'publiee'].includes(a.status)); }
    if (u.includes('/annonce_interets?id=eq.')) { const id = u.match(/id=eq\.([^&]+)/)[1]; const i = db.annonce_interets.find((x) => x.id === id); return i ? [{ cible_ref: i.cible_ref, annonces: db.annonces.find((a) => a.id === i.demandeur_id) }] : []; }
    if (u.startsWith('/rest/v1/annonces?ref=eq.')) { const r = Number(u.match(/ref=eq\.(\d+)/)[1]); return db.annonces.filter((a) => a.ref === r); }
    if (u.startsWith('/rest/v1/annonce_interets?demandeur_id=eq.') && u.includes('cible_ref=eq.')) { const [, d, c] = u.match(/demandeur_id=eq\.([^&]+)&cible_ref=eq\.(\d+)/); return db.annonce_interets.filter((i) => i.demandeur_id === d && i.cible_ref === Number(c)); }
    if (u.startsWith('/rest/v1/annonces?or=')) { const id = u.match(/user_id\.eq\.([^,]+)/)[1]; return db.annonces.filter((a) => a.user_id === id); }
    if (u.startsWith('/rest/v1/annonces?email=eq.')) return db.annonces.filter((a) => ['a_verifier', 'publiee'].includes(a.status) && u.includes(encodeURIComponent(a.email)));
    return [];
  };
  const insert = async (t, row) => { const r = { id: `00000000-0000-0000-0000-00000000000${db[t].length + 1}`, ref: db[t].length + 1, status: 'brouillon', ...row }; db[t].push(r); return r; };
  const patch = async (t, filtre, v) => { const [k, val] = filtre.split('&')[0].split('=eq.'); for (const r of db[t]) if (String(r[k]) === decodeURIComponent(val)) Object.assign(r, v); return { ok: true }; };
  const ctx = (user = null) => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert, patch, admin: false, user, ipHash: 'ip', now: () => new Date('2026-10-29T20:00:00Z'), email: async () => true, alerter: async (a) => alertes.push(a.titre) });
  return { db, alertes, ctx };
}
const base = { action: 'annonce_deposer', majeur: true, publication: true, prenom: 'Nina', genre: 'femme', birth_date: '1995-03-02', email: 'nina@example.com', matching: { contactReseau: 'https://www.tiktok.com/@nina.kab' } };
const complet = { ...base, ville: 'Lyon', pays: 'France', profil: 'Je suis souriante et sérieuse.', recherche: 'Un homme sérieux et doux.', medias: [{ role: 'media', type: 'image/jpeg', size: 1000 }] };

const NINA = { id: 'u-nina', email: 'nina@example.com' };

test('pseudo TikTok lu dans un lien ou un @pseudo', () => {
  assert.equal(pseudoTikTok('https://www.tiktok.com/@Nina.Kab?lang=fr'), 'nina.kab');
  assert.equal(pseudoTikTok('@nina_75'), 'nina_75');
  assert.equal(pseudoTikTok('pas un lien tiktok'), '');
  assert.equal(normLien('https://www.instagram.com/Nina.K/'), 'instagram:nina.k');
  assert.equal(normLien('https://facebook.com/nina.kab'), 'facebook:nina.kab');
  assert.match(empreinteLien('tiktok:nina'), /^[0-9a-f]{64}$/);
});
test('sans être connecté(e), pas de profil (même si un compte existe avec cet email)', async () => {
  const { ctx } = monde({ compte: true });
  const r = await handleAnnonces('annonce_deposer', complet, ctx());
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error, 'compte_requis');
});
test('pas de réseau social : un numéro de téléphone valide est obligatoire', async () => {
  const { ctx, db } = monde();
  const sans = { ...complet, matching: {}, sans_reseau: true };
  let r = await handleAnnonces('annonce_deposer', { ...sans, telephone: '12' }, ctx(NINA));
  assert.equal((await r.json()).error, 'telephone_invalide');
  r = await handleAnnonces('annonce_deposer', { ...complet, matching: {} }, ctx(NINA));
  assert.equal((await r.json()).error, 'contact_requis');
  r = await handleAnnonces('annonce_deposer', { ...sans, telephone: '06 12 34 56 78' }, ctx(NINA));
  assert.equal(r.status, 200);
  assert.equal(db.annonces[0].phone, '+33612345678');
  assert.equal(db.annonces[0].user_id, 'u-nina');
});
test('dire qu’un profil intéresse demande un compte', async () => {
  const { ctx } = monde();
  const r = await handleAnnonces('annonce_interet', { ref: 9 }, ctx());
  assert.equal(r.status, 401);
});
test('profil créé en live : formulaire allégé, fiche retrouvée par empreinte TikTok', async () => {
  const { ctx, db } = monde({ tiktok: { [empreinteLien('tiktok:nina.kab')]: 'outil-42' } });
  const r = await handleAnnonces('annonce_deposer', { ...base, live: true, tiktok_live: '@nina.kab' }, ctx(NINA));
  assert.equal(r.status, 200);
  assert.equal(db.annonces[0].live_declare, true);
  assert.equal(db.annonces[0].outil_id, 'outil-42');
});
test('hors live, textes et photos restent obligatoires', async () => {
  const { ctx } = monde();
  const r = await handleAnnonces('annonce_deposer', { ...base, ville: 'Lyon', pays: 'France' }, ctx(NINA));
  assert.equal((await r.json()).error, 'textes_courts');
});
test('match actif : plus de nouvel intérêt jusqu’au dématch', async () => {
  const { ctx, db } = monde();
  const user = { id: 'u1', email: 'nina@example.com' };
  db.annonces.push({ id: 'a1', ref: 7, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', en_match: true });
  let r = await handleAnnonces('annonce_interet', { ref: 9 }, ctx(user));
  assert.equal((await r.json()).error, 'en_match');
  r = await handleAnnonces('annonce_dematcher', {}, ctx(user));
  assert.equal(db.annonces[0].en_match, false);
  r = await handleAnnonces('annonce_interet', { ref: 9 }, ctx(user));
  assert.equal(r.status, 200);
  assert.equal(db.annonce_interets[0].cible_ref, 9);
});

test('lien déjà connu : relié à la fiche de l’outil, et pas de doublon sur le site', async () => {
  const { ctx, db } = monde({ tiktok: { [empreinteLien('instagram:nina.k')]: 'outil-7' } });
  const insta = { ...complet, matching: { contactReseau: 'https://instagram.com/nina.k' } };
  let r = await handleAnnonces('annonce_deposer', insta, ctx(NINA));
  assert.equal(r.status, 200);
  assert.equal(db.annonces[0].outil_id, 'outil-7');
  db.annonces[0].status = 'a_verifier';
  r = await handleAnnonces('annonce_deposer', { ...insta, email: 'autre@example.com' }, ctx({ id: 'u2', email: 'autre@example.com' }));
  assert.equal((await r.json()).error, 'deja_profil_lien');
});

test('swipe : deux personnes qui se choisissent → intérêt réciproque et alerte à Lamia', async () => {
  const { ctx, db, alertes } = monde();
  db.annonces.push({ id: 'a1', ref: 11, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false });
  db.annonces.push({ id: 'a2', ref: 12, user_id: 'u2', email: 'karim@example.com', status: 'publiee', prenom: 'Karim', genre: 'homme', en_match: false });
  const nina = { id: 'u1', email: 'nina@example.com' }, karim = { id: 'u2', email: 'karim@example.com' };
  let r = await handleAnnonces('annonce_swipe', { ref: 12, choix: 'oui' }, ctx(nina));
  assert.equal(r.status, 200);
  assert.equal(alertes.length, 0);
  r = await handleAnnonces('annonce_swipe', { ref: 11, choix: 'oui' }, ctx(karim));
  assert.equal(alertes.length, 1);
  assert.match(alertes[0], /réciproque/);
  assert.equal(db.annonce_interets.every((i) => i.reciproque), true);
  r = await handleAnnonces('annonce_swipe', { ref: 99, choix: 'non' }, ctx(karim));
  assert.equal(db.annonce_passes[0].cible_ref, 99);
});
