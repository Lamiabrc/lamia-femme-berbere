import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces, pseudoTikTok, normLien, empreinteLien, lienContact } from '../lib/annonces.mjs';

// Petite base en mémoire, juste assez pour les actions testées.
function monde({ compte = true, tiktok = {} } = {}) {
  let medias = true;
  const db = { annonces: [], annonce_interets: [], annonce_files: [], annonce_passes: [] }, alertes = [];
  const json = async (x) => ({ ok: true, json: async () => x });
  const call = async (u, o = {}) => {
    if (u.includes('/rpc/compte_existe')) return json(compte);
    if (u.startsWith('/storage/')) return json([]);
    return json([]);
  };
  const read = async (u) => {
    if (u.includes('annonce_files?annonce_id=eq.') && u.includes('kind=in.')) return medias ? [{ kind: 'photo' }, { kind: 'photo' }] : [];
    const h = u.match(/outil_tiktok\?h=in\.\(([0-9a-f,]+)\)/); if (h) { const f = h[1].split(',').find((x) => tiktok[x]); return f ? [{ outil_id: tiktok[f] }] : []; }
    if (u.includes('lien_h=eq.')) { const x = u.match(/lien_h=eq\.([0-9a-f]+)/)[1]; return db.annonces.filter((a) => a.lien_h === x && ['a_verifier', 'publiee'].includes(a.status)); }
    if (u.includes('/annonce_interets?id=eq.')) { const id = u.match(/id=eq\.([^&]+)/)[1]; const i = db.annonce_interets.find((x) => x.id === id); return i ? [{ cible_ref: i.cible_ref, annonces: db.annonces.find((a) => a.id === i.demandeur_id) }] : []; }
    if (u.startsWith('/rest/v1/annonces?ref=eq.')) { const r = Number(u.match(/ref=eq\.(\d+)/)[1]); return db.annonces.filter((a) => a.ref === r); }
    if (u.startsWith('/rest/v1/annonce_interets?demandeur_id=eq.') && u.includes('cible_ref=in.(')) { const d = u.match(/demandeur_id=eq\.([^&]+)/)[1]; const c = u.match(/cible_ref=in\.\(([^)]*)\)/)[1].split(',').map(Number); return db.annonce_interets.filter((i) => i.demandeur_id === d && c.includes(i.cible_ref)); }
    if (u.startsWith('/rest/v1/annonce_interets?demandeur_id=eq.') && u.includes('cible_ref=eq.')) { const [, d, c] = u.match(/demandeur_id=eq\.([^&]+)&cible_ref=eq\.(\d+)/); return db.annonce_interets.filter((i) => i.demandeur_id === d && i.cible_ref === Number(c)); }
    if (u.startsWith('/rest/v1/annonces?or=')) { const id = u.match(/user_id\.eq\.([^,]+)/)[1]; return db.annonces.filter((a) => a.user_id === id); }
    if (u.startsWith('/rest/v1/annonces?email=eq.')) return db.annonces.filter((a) => ['a_verifier', 'publiee'].includes(a.status) && u.includes(encodeURIComponent(a.email)));
    return [];
  };
  const insert = async (t, row) => { const r = { id: `00000000-0000-0000-0000-00000000000${db[t].length + 1}`, ref: db[t].length + 1, status: 'brouillon', ...row }; db[t].push(r); return r; };
  const patch = async (t, filtre, v) => { const [k, val] = filtre.split('&')[0].split('=eq.'); for (const r of db[t]) if (String(r[k]) === decodeURIComponent(val)) Object.assign(r, v); return { ok: true }; };
  const ctx = (user = null, formule = 'decouverte') => ({ formuleDe: async () => formule, env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert, patch, admin: false, user, ipHash: 'ip', now: () => new Date('2026-10-29T20:00:00Z'), email: async () => true, alerter: async (a) => alertes.push(a.titre) });
  return { db, alertes, ctx, sansMedias: () => { medias = false; } };
}
const base = { action: 'annonce_deposer', majeur: true, publication: true, prenom: 'Nina', genre: 'femme', birth_date: '1995-03-02', email: 'nina@example.com', matching: { contactReseau: 'https://www.tiktok.com/@nina.kab' } };
const complet = { ...base, ville: 'Lyon', pays: 'France', profil: 'Je suis souriante et sérieuse.', recherche: 'Un homme sérieux et doux.', medias: [{ role: 'media', type: 'image/jpeg', size: 1000 }, { role: 'media', type: 'image/jpeg', size: 1000 }] };

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
  const r = await handleAnnonces('annonce_deposer', { ...complet, live: true, tiktok_live: '@nina.kab' }, ctx(NINA));
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
  assert.equal((await r.json()).error, 'limite_matchs');
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

test('swipe : la liste des profils s’affiche', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 11, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false });
  const r = await handleAnnonces('annonce_swipe_liste', {}, ctx({ id: 'u1', email: 'nina@example.com' }));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(Array.isArray(d.profils));
  assert.equal(d.adresse, 'A weltma Nina');
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

test('swipe sans limite ; matchs en cours selon la formule : Découverte 1, Passion 2, Prestige 5', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false, matchs_bonus: 0 });
  const nina = { id: 'u1', email: 'nina@example.com' };
  const base = ctx().read;
  const c = (formule, enCours) => ({ ...ctx(nina, formule), read: async (u) => (u.includes('reciproque=eq.true&statut=in.') ? Array.from({ length: enCours }, (_, i) => ({ id: 'm' + i })) : base(u)) });
  let r = await handleAnnonces('annonce_swipe', { ref: 30, choix: 'non' }, c('decouverte', 1));
  assert.equal(r.status, 200);
  r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui' }, c('decouverte', 1));
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'limite_matchs');
  r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui' }, c('passion', 2));
  assert.equal(r.status, 409);
  assert.equal((await handleAnnonces('annonce_swipe', { ref: 35, choix: 'oui' }, c('passion', 1))).status, 200);
  r = await handleAnnonces('annonce_swipe', { ref: 32, choix: 'oui' }, c('prestige', 5));
  assert.equal(r.status, 409);
  assert.equal((await handleAnnonces('annonce_swipe', { ref: 36, choix: 'oui' }, c('prestige', 4))).status, 200);
  db.annonces[0].matchs_bonus = 1;
  r = await handleAnnonces('annonce_swipe', { ref: 33, choix: 'oui' }, c('decouverte', 1));
  assert.equal(r.status, 409);
  r = await handleAnnonces('annonce_swipe', { ref: 34, choix: 'oui' }, c('decouverte', 0));
  assert.equal(r.status, 200);
});
test('quotas : 1 match offert, puis le live ; Passion 10 par mois, Prestige illimité ; l’Algérie renvoie au live', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false, matchs_bonus: 0, pays: 'France' });
  const nina = { id: 'u1', email: 'nina@example.com' };
  const c = (formule, nb) => { const x = ctx(nina, formule), base = x.read; return { ...x, read: async (u) => (u.includes('statut=in.(mis_en_relation,dematche)') ? Array.from({ length: nb }, () => ({ cible_ref: 900, updated_at: new Date().toISOString(), annonces: { ref: 21 } })) : base(u)) }; };
  const oui = async (formule, nb) => { const r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui' }, c(formule, nb)); return [r.status, await r.json()]; };
  assert.equal((await oui('decouverte', 0))[0], 200);
  let [s, r] = await oui('decouverte', 1);
  assert.equal(s, 409); assert.equal(r.error, 'quota_matchs'); assert.equal(r.algerie, false);
  db.annonces[0].pays = 'Algerie';
  [, r] = await oui('decouverte', 1);
  assert.equal(r.algerie, true);
  // Un match offert en live redonne une chance.
  db.annonces[0].matchs_bonus = 1;
  assert.equal((await oui('decouverte', 1))[0], 200);
  db.annonces[0].matchs_bonus = 0;
  assert.equal((await oui('passion', 9))[0], 200);
  assert.equal((await oui('passion', 10))[0], 409);
  assert.equal((await oui('prestige', 50))[0], 200);
  // Un profil créé en live garde ses 3 offertes.
  db.annonces[0].live_declare = true;
  assert.equal((await oui('decouverte', 2))[0], 200);
  assert.equal((await oui('decouverte', 3))[0], 409);
});
test('la personne choisie est prévenue par email (sans savoir qui), au plus une fois toutes les 12 h ; les deux le sont quand c’est réciproque', async () => {
  const { ctx, db } = monde();
  const mails = [];
  const c = (user) => ({ ...ctx(user), email: async (to, sujet) => { mails.push([to, sujet]); return true; } });
  await handleAnnonces('annonce_deposer', { ...complet }, c(NINA));
  const SAM = { id: 'u-sam', email: 'sam@example.com' };
  await handleAnnonces('annonce_deposer', { ...complet, prenom: 'Sam', genre: 'homme', email: 'sam@example.com', matching: { contactReseau: 'https://www.tiktok.com/@sam.kab' } }, c(SAM));
  const [nina, sam] = db.annonces; nina.status = 'publiee'; sam.status = 'publiee';
  mails.length = 0;
  await handleAnnonces('annonce_swipe', { ref: nina.ref, choix: 'oui' }, c(SAM));
  assert.deepEqual(mails.map((m) => m[0]), ['nina@example.com']);
  assert.match(mails[0][1], /quelqu’un s’intéresse à toi/);
  assert.ok(!mails[0][1].includes('Sam'));
  mails.length = 0;
  await handleAnnonces('annonce_swipe', { ref: sam.ref, choix: 'oui' }, c(NINA));
  assert.deepEqual(mails.map((m) => m[0]).sort(), ['nina@example.com', 'sam@example.com']);
  assert.ok(mails.every((m) => /réciproque/.test(m[1])));
});
test('création de compte par le site : compte déjà confirmé, 5 au plus par heure et par connexion', async () => {
  const appels = [];
  const ctx = { env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, admin: false, user: null, ipHash: 'ip', now: () => new Date('2026-10-31T00:00:00Z'), email: async () => true, alerter: async () => {},
    call: async (u, o = {}) => { appels.push([u, o.body && JSON.parse(o.body)]); return { ok: true, status: 200, json: async () => ({ id: 'u' }) }; },
    read: async () => [], insert: async () => ({}), patch: async () => ({}) };
  let r = await handleAnnonces('annonce_creer_compte', { email: 'pas-un-email', password: '12345678' }, ctx);
  assert.equal(r.status, 400);
  r = await handleAnnonces('annonce_creer_compte', { email: 'Nina@Example.com', password: '12345678', prenom: 'Nina' }, ctx);
  assert.equal(r.status, 200);
  assert.equal(appels[0][0], '/auth/v1/admin/users');
  assert.equal(appels[0][1].email_confirm, true);
  assert.equal(appels[0][1].email, 'nina@example.com');
  assert.ok(appels.some(([u, c]) => u.startsWith('/rest/v1/member_profiles') && c?.real_first_name === 'Nina'), 'le prénom va dans la fiche du compte');
  const plein = { ...ctx, read: async () => [1, 2, 3, 4, 5] };
  r = await handleAnnonces('annonce_creer_compte', { email: 'x@example.com', password: '12345678' }, plein);
  assert.equal(r.status, 429);
  const existe = { ...ctx, call: async () => ({ ok: false, status: 422 }) };
  r = await handleAnnonces('annonce_creer_compte', { email: 'x@example.com', password: '12345678' }, existe);
  assert.equal((await r.json()).error, 'compte_existe');
});

test('photos obligatoires : sans 2 photos ni vidéo, ni swipe ni choix', async () => {
  const { ctx, db, sansMedias } = monde();
  db.annonces.push({ id: 'a1', ref: 11, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false });
  sansMedias();
  const u = { id: 'u1', email: 'nina@example.com' };
  const l = await handleAnnonces('annonce_swipe_liste', {}, ctx(u));
  assert.equal(l.status, 403);
  assert.equal((await l.json()).error, 'photos_requises');
  assert.equal((await handleAnnonces('annonce_swipe', { ref: 12, choix: 'oui' }, ctx(u))).status, 403);
  assert.equal((await handleAnnonces('annonce_swipe', { ref: 12, choix: 'non' }, ctx(u))).status, 200);
});

test('compte de test : un choix vers un vrai membre n’est jamais enregistré', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 15, user_id: 'u1', email: 't@example.com', status: 'publiee', prenom: 'Test', genre: 'femme', en_match: false, test: true });
  db.annonces.push({ id: 'a2', ref: 40, user_id: 'u2', email: 'vrai@example.com', status: 'publiee', prenom: 'Vrai', genre: 'homme', en_match: false, test: false });
  await handleAnnonces('annonce_swipe', { ref: 40, choix: 'oui' }, ctx({ id: 'u1', email: 't@example.com' }));
  assert.equal(db.annonce_interets.length, 0);
});

test('alerte sur un profil : le lien ouvre directement sa fiche', async () => {
  const { lienAlerte } = await import('../lib/alerte-lamia.mjs');
  assert.equal(lienAlerte('💞 Intérêt réciproque · n° 77 ↔ n° 5038', '/confidences-lamia/#annonces'), '/tableau-de-bord#profil-77');
  assert.equal(lienAlerte('Nouvelle confidence', '/confidences-lamia/'), '/confidences-lamia/');
});

test('écrire à quelqu’un : le lien ouvre le bon réseau', () => {
  assert.deepEqual(lienContact('https://www.tiktok.com/@Nina.Kab', '', 'x'), { reseau: 'TikTok', lien: 'https://www.tiktok.com/@nina.kab' });
  assert.equal(lienContact('https://instagram.com/nina', '', 'x').lien, 'https://www.instagram.com/nina/');
  assert.equal(lienContact('facebook.com/profile.php?id=123', '', 'x').lien, 'https://www.facebook.com/profile.php?id=123');
  assert.equal(lienContact('', '+33 6 12 34 56 78', 'Salam !').lien, 'https://wa.me/33612345678?text=Salam%20!');
  assert.deepEqual(lienContact('', '', 'x'), { reseau: '', lien: '' });
});
