import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAnnonces, pseudoTikTok, normLien, empreinteLien, lienContact, ageAu } from '../lib/annonces.mjs';

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
    if (u.includes('declarations_sincerite')) return [{ user_id: 'ok' }]; // bonne foi déjà déclarée, sauf test dédié
    if (u.includes('annonce_files?annonce_id=eq.') && u.includes('kind=in.')) return medias ? [{ kind: 'photo' }, { kind: 'photo' }] : [];
    const h = u.match(/outil_tiktok\?h=in\.\(([0-9a-f,]+)\)/); if (h) { const f = h[1].split(',').find((x) => tiktok[x]); return f ? [{ outil_id: tiktok[f] }] : []; }
    if (u.includes('lien_h=eq.')) { const x = u.match(/lien_h=eq\.([0-9a-f]+)/)[1]; return db.annonces.filter((a) => a.lien_h === x && ['a_verifier', 'publiee'].includes(a.status)); }
    if (u.includes('/annonce_interets?id=eq.')) { const id = u.match(/id=eq\.([^&]+)/)[1]; const i = db.annonce_interets.find((x) => x.id === id); return i ? [{ cible_ref: i.cible_ref, annonces: db.annonces.find((a) => a.id === i.demandeur_id) }] : []; }
    if (u.startsWith('/rest/v1/annonces?id=eq.')) { const id = u.match(/id=eq\.([^&]+)/)[1]; return db.annonces.filter((x) => x.id === id); }
    if (u.startsWith('/rest/v1/profils_outil?user_id=eq.')) { const id = u.match(/user_id=eq\.([^&]+)/)[1]; return (db.profils_outil || []).filter((x) => x.user_id === id && !x.retire_at); }
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
const base = { action: 'annonce_deposer', majeur: true, publication: true, prenom: 'Nina', genre: 'femme', birth_date: '1995-03-02', email: 'nina@example.com', matching: { origineTags: ['Kabyle (Algerie)'], contactReseau: 'https://www.tiktok.com/@nina.kab' } };
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
  const sans = { ...complet, matching: { origineTags: ['Kabyle (Algerie)'] }, sans_reseau: true };
  let r = await handleAnnonces('annonce_deposer', { ...sans, telephone: '12' }, ctx(NINA));
  assert.equal((await r.json()).error, 'telephone_invalide');
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
test('inscription courte : sans textes ni lien de réseau, le profil est accepté ; les 2 photos restent obligatoires', async () => {
  const { ctx, db } = monde();
  const court = { ...base, matching: { origineTags: ['Kabyle (Algerie)'] }, ville: 'Lyon', pays: 'France' };
  let r = await handleAnnonces('annonce_deposer', court, ctx(NINA));
  assert.equal((await r.json()).error, 'medias_requis');
  r = await handleAnnonces('annonce_deposer', { ...court, medias: complet.medias }, ctx(NINA));
  assert.equal(r.status, 200);
  assert.equal(db.annonces[0].profil, '');
  assert.ok(!db.annonces[0].matching.contactReseau);
});
test('un texte commencé doit faire 20 caractères au moins ; l’origine reste obligatoire', async () => {
  const { ctx } = monde();
  let r = await handleAnnonces('annonce_deposer', { ...complet, profil: 'Salut' }, ctx(NINA));
  assert.equal((await r.json()).error, 'textes_courts');
  r = await handleAnnonces('annonce_deposer', { ...complet, matching: {} }, ctx(NINA));
  assert.equal((await r.json()).error, 'origine_requise');
});
test('la personne corrige elle-même sa date de naissance, jamais en dessous de 18 ans', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', birth_date: '1996-10-01', matching: { contactReseau: 'https://instagram.com/nina' } });
  const nina = { id: 'u1', email: 'nina@example.com' };
  const modifier = async (birth_date) => { const r = await handleAnnonces('annonce_modifier', { prenom: 'Nina', birth_date, matching: { contactReseau: 'https://instagram.com/nina' } }, ctx(nina)); return [r.status, await r.json()]; };
  { const [st, r] = await modifier('1990-05-12'); assert.equal(st, 200, JSON.stringify(r)); }
  assert.equal(db.annonces[0].birth_date, '1990-05-12');
  const an = new Date().getUTCFullYear();
  assert.equal((await modifier(`${an - 10}-01-01`))[1].error, 'mineur');
  assert.equal((await modifier('pas une date'))[1].error, 'invalid_birth_date');
  assert.equal(db.annonces[0].birth_date, '1990-05-12');
});
test('seconde chance : Passion renvoie une demande refusée, 2 fois au plus ; pas en Découverte', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme' });
  db.annonce_interets = db.annonce_interets || [];
  db.annonce_interets.push({ id: 'i1', demandeur_id: 'a1', cible_ref: 31, statut: 'pas_compatible', reponse: 'non', relances: 0, via: 'swipe' });
  const nina = { id: 'u1', email: 'nina@example.com' };
  const relancer = async (formule) => { const r = await handleAnnonces('annonce_relancer', { ref: 31 }, ctx(nina, formule)); return [r.status, await r.json()]; };
  assert.equal((await relancer('decouverte'))[1].error, 'formule_requise');
  const refuser = () => Object.assign(db.annonce_interets[0], { statut: 'pas_compatible', reponse: 'non' });
  { const [st, r] = await relancer('passion'); assert.equal(st, 200, JSON.stringify(r)); }
  assert.equal(db.annonce_interets[0].statut, 'a_traiter'); assert.equal(db.annonce_interets[0].reponse, null); assert.equal(db.annonce_interets[0].relances, 1);
  assert.equal((await relancer('passion'))[1].error, 'not_found'); // déjà repartie : rien à renvoyer
  refuser(); assert.equal((await relancer('passion'))[0], 200);
  refuser(); assert.equal((await relancer('passion'))[1].error, 'relances_epuisees');
});
test('barrière des critères : pas de cœur vers quelqu’un qui cherche un autre âge (à 7 ans près) ou une autre zone', async () => {
  const { accepteParSesCriteres } = await import('../content/matching-options.mjs');
  const elle = { age_min: 45, age_max: 60, secteur: 'France' };
  assert.equal(accepteParSesCriteres(elle, { age: 28, pays: 'Algerie' }), false);
  assert.equal(accepteParSesCriteres(elle, { age: 28, pays: 'France' }), false);
  assert.equal(accepteParSesCriteres(elle, { age: 50, pays: 'Algerie' }), false);
  assert.equal(accepteParSesCriteres(elle, { age: 38, pays: 'France' }), true); // 7 ans de marge
  assert.equal(accepteParSesCriteres(elle, { age: 37, pays: 'France' }), false);
  assert.equal(accepteParSesCriteres(elle, { age: 67, pays: 'France' }), true);
  assert.equal(accepteParSesCriteres({}, { age: 28, pays: 'Algerie' }), true); // sans critère : tout le monde
  assert.equal(accepteParSesCriteres({ age_min: 25, age_max: 40, secteur: "N'importe ou" }, { age: 30, pays: 'Algerie' }), true);
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'yan@example.com', status: 'publiee', prenom: 'Yan', genre: 'homme', birth_date: '1998-01-01', pays: 'Algerie' });
  db.annonces.push({ id: 'a2', ref: 31, user_id: 'u2', email: 'f@example.com', status: 'publiee', prenom: 'Fa', genre: 'femme', age_min: 45, age_max: 60, matching: { zoneGeo: 'France' } });
  const yan = { id: 'u1', email: 'yan@example.com' };
  const r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui' }, ctx(yan));
  assert.equal(r.status, 409); assert.equal((await r.json()).error, 'hors_de_ses_criteres');
  assert.equal((await handleAnnonces('annonce_swipe', { ref: 31, choix: 'non' }, ctx(yan))).status, 200);
});
test('bonne foi : sans la déclaration, pas de cœur ; la déclaration s’enregistre avec la langue', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme' });
  const nina = { id: 'u1', email: 'nina@example.com' };
  const envois = [];
  const sans = { ...ctx(nina), read: async (u) => (u.includes('declarations_sincerite') ? [] : ctx(nina).read(u)), call: async (u, o) => { envois.push([u, o?.body]); return { ok: true, json: async () => [] }; } };
  const r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui' }, sans);
  assert.equal(r.status, 403); assert.equal((await r.json()).error, 'sincerite_requise');
  assert.equal((await handleAnnonces('annonce_swipe', { ref: 31, choix: 'non' }, sans)).status, 200); // passer reste libre
  assert.equal((await handleAnnonces('annonce_sincerite', {}, sans)).status, 400);
  assert.equal((await handleAnnonces('annonce_sincerite', { accepte: true, langue: 'kab' }, sans)).status, 200);
  const [u, corps] = envois.find(([x]) => x.includes('declarations_sincerite'));
  assert.ok(u.includes('on_conflict=user_id')); assert.equal(JSON.parse(corps).langue, 'kab'); assert.equal(JSON.parse(corps).user_id, 'u1');
});
test('corriger son profil dans Mon espace corrige aussi sa fiche venue de l’outil (celle que les autres voient)', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 65, user_id: 'u1', email: 'amel@example.com', status: 'publiee', prenom: 'Amel', genre: 'femme', birth_date: '1981-07-17', ville: 'Alger', pays: 'Algerie', matching: { contactReseau: 'https://instagram.com/amel' } });
  db.profils_outil = db.profils_outil || [];
  db.profils_outil.push({ ref: 5410, user_id: 'u1', genre: 'femme', age: 44, ville: 'Alger', pays: 'Algérie', profil: '', recherche: 'Ancien texte', age_min: 45, age_max: 55, corrections: null, modif_at: '2026-11-02T21:23:07Z', modif_demandee: 'j’ai 45 ans', retire_at: null });
  const amel = { id: 'u1', email: 'amel@example.com' };
  const r = await handleAnnonces('annonce_modifier', { prenom: 'Amel', ville: 'Alger centre', pays: 'Algerie', profil: 'Je suis diplômée en électronique et je travaille dans la communication.', recherche: 'Un homme sérieux, kabyle, qui respecte la femme.', matching: { contactReseau: 'https://instagram.com/amel' } }, ctx(amel));
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const f = db.profils_outil[0];
  assert.equal(f.ville, 'Alger centre'); assert.equal(f.age, 45);
  assert.equal(f.profil, 'Je suis diplômée en électronique et je travaille dans la communication.');
  assert.equal(f.modif_demandee, null); assert.ok(f.corrige_at);
  assert.equal(f.corrections.ville, 'Alger centre'); // gardé à part : remis si l'outil republie
});
test('un profil tapé au hasard est refusé, un vrai texte passe (français, kabyle, arabe)', async () => {
  const { texteCredible } = await import('../content/matching-options.mjs');
  assert.equal(texteCredible('walou bdgjfggyfeshkkhfswhfsgjrdhrdgjfdhkkhgfdsdgjkkhgfdgivf'), false);
  assert.equal(texteCredible('kgcivbhcrdshknfzaagjncvljghmvcxcbvxcxxxcxvi'), false);
  assert.equal(texteCredible('bbbbbbbbbbbbbbbbbbbbbbbbbb'), false);
  assert.equal(texteCredible('dfgh jklm qsdf wxcv bnqs dfgh jklm'), false);
  for (const ok of ['Je suis une femme simple, souriante, attachée à ma famille et à mes racines.',
    'Nekk d taqbaylit, ḥemmleɣ tamurt-iw d twacult-iw, ttnadiɣ argaz n lɛali.',
    'أبحث عن رجل جاد ومحترم يحب العائلة ويقدر القيم', 'Sérieux svp', '']) assert.equal(texteCredible(ok), true, ok);
  const { ctx } = monde();
  const r = await handleAnnonces('annonce_deposer', { ...complet, profil: 'walou bdgjfggyfeshkkhfswhfsgjrdhrdgjfdhkkhgfdsdgjkkhgfdgivf' }, ctx(NINA));
  assert.equal((await r.json()).error, 'textes_illisibles');
});
test('« en match » resté à vrai sans aucun match en cours : il se corrige tout seul au lieu de bloquer la personne', async () => {
  const { ctx, db } = monde();
  const user = { id: 'u1', email: 'nina@example.com' };
  db.annonces.push({ id: 'a1', ref: 7, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', en_match: true });
  const r = await handleAnnonces('annonce_interet', { ref: 9 }, ctx(user));
  assert.equal(r.status, 200);
  assert.equal(db.annonce_interets[0].cible_ref, 9);
});

test('lien déjà connu : relié à la fiche de l’outil, et pas de doublon sur le site', async () => {
  const { ctx, db } = monde({ tiktok: { [empreinteLien('instagram:nina.k')]: 'outil-7' } });
  const insta = { ...complet, matching: { origineTags: ['Kabyle (Algerie)'], contactReseau: 'https://instagram.com/nina.k' } };
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
test('quotas : Découverte sans total (1 match à la fois) ; Passion 10 par mois, Prestige illimité', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false, matchs_bonus: 0, pays: 'France' });
  const nina = { id: 'u1', email: 'nina@example.com' };
  const c = (formule, nb) => { const x = ctx(nina, formule), base = x.read; return { ...x, read: async (u) => (u.includes('statut=in.(mis_en_relation,dematche)') ? Array.from({ length: nb }, () => ({ cible_ref: 900, updated_at: new Date().toISOString(), annonces: { ref: 21 } })) : base(u)) }; };
  const oui = async (formule, nb) => { const r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui' }, c(formule, nb)); return [r.status, await r.json()]; };
  // Règle du 10 nov. 2026 : en gratuit, les matchs passés (terminés ou dématchés) ne bloquent plus.
  assert.equal((await oui('decouverte', 0))[0], 200);
  assert.equal((await oui('decouverte', 1))[0], 200);
  assert.equal((await oui('decouverte', 12))[0], 200);
  db.annonces[0].pays = 'Algerie';
  assert.equal((await oui('decouverte', 5))[0], 200);
  db.annonces[0].pays = 'France';
  assert.equal((await oui('passion', 9))[0], 200);
  const [s, r] = await oui('passion', 10);
  assert.equal(s, 409); assert.equal(r.error, 'quota_matchs');
  assert.equal((await oui('prestige', 50))[0], 200);
});
test('la personne choisie est prévenue par email (sans savoir qui), au plus une fois toutes les 12 h ; les deux le sont quand c’est réciproque', async () => {
  const { ctx, db } = monde();
  const mails = [];
  const c = (user) => ({ ...ctx(user), email: async (to, sujet) => { mails.push([to, sujet]); return true; } });
  await handleAnnonces('annonce_deposer', { ...complet }, c(NINA));
  const SAM = { id: 'u-sam', email: 'sam@example.com' };
  await handleAnnonces('annonce_deposer', { ...complet, prenom: 'Sam', genre: 'homme', email: 'sam@example.com', matching: { origineTags: ['Kabyle (Algerie)'], contactReseau: 'https://www.tiktok.com/@sam.kab' } }, c(SAM));
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

test('origine : obligatoire au dépôt, lisible sur les cartes', async () => {
  const { origineLisible } = await import('../content/matching-options.mjs');
  assert.equal(origineLisible(['Kabyle (Algerie)']), 'Kabyle');
  assert.equal(origineLisible(['Touareg (Algerie / Mali / Niger / Libye / Burkina Faso)', 'Autre Amazigh / Berbere']), 'Touareg · Amazigh');
  const { ctx } = monde();
  const r = await handleAnnonces('annonce_deposer', { ...complet, matching: { contactReseau: 'https://www.tiktok.com/@nina.kab' } }, ctx(NINA));
  assert.equal((await r.json()).error, 'origine_requise');
});

test('pause : plus de swipe ni de réponse oui, et reprise possible', async () => {
  const { db, ctx } = monde();
  db.annonces.push({ id: '11111111-1111-4111-8111-111111111111', ref: 11, user_id: NINA.id, email: NINA.email, prenom: 'Nina', genre: 'femme', status: 'publiee', birth_date: '1995-03-02' });
  let r = await handleAnnonces('annonce_pause', { pause: true }, ctx(NINA));
  assert.equal((await r.json()).en_pause, true);
  assert.ok(db.annonces[0].pause_at, 'la date de pause est notée');
  assert.equal(db.annonces[0].status, 'publiee', 'rien n’est effacé');
  r = await handleAnnonces('annonce_swipe_liste', {}, ctx(NINA));
  assert.equal((await r.json()).error, 'annonce_en_pause');
  r = await handleAnnonces('annonce_swipe', { ref: 12, choix: 'oui' }, ctx(NINA));
  assert.equal((await r.json()).error, 'annonce_en_pause');
  r = await handleAnnonces('annonce_pause', { pause: false }, ctx(NINA));
  assert.equal((await r.json()).en_pause, false);
  assert.equal(db.annonces[0].pause_at, null);
});

test('pause : sans annonce ni fiche, rien à mettre en pause', async () => {
  const { ctx } = monde();
  const r = await handleAnnonces('annonce_pause', { pause: true }, ctx(NINA));
  assert.equal(r.status, 404);
});
test('cœur avec message : sans crédit, rien ne part (402) ; message vide refusé', async () => {
  const { ctx, db } = monde();
  db.annonces.push({ id: 'a1', ref: 21, user_id: 'u1', email: 'nina@example.com', status: 'publiee', prenom: 'Nina', genre: 'femme', en_match: false, matchs_bonus: 0 });
  const nina = { id: 'u1', email: 'nina@example.com' };
  let r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui', message: ' ' }, ctx(nina, 'decouverte'));
  assert.equal(r.status, 400);
  r = await handleAnnonces('annonce_swipe', { ref: 31, choix: 'oui', message: 'Ta fiche m’a touchée' }, ctx(nina, 'decouverte'));
  assert.equal(r.status, 402);
  assert.equal((await r.json()).error, 'coeur_requis');
});
test('l’âge suffit à l’inscription : pas de date de naissance exigée, jamais en dessous de 18 ans', async () => {
  const { ctx, db } = monde();
  const { birth_date, ...sansDate } = complet;
  let r = await handleAnnonces('annonce_deposer', { ...sansDate, age: '17' }, ctx(NINA));
  assert.equal((await r.json()).error, 'mineur');
  r = await handleAnnonces('annonce_deposer', { ...sansDate }, ctx(NINA));
  assert.equal((await r.json()).error, 'invalid_birth_date');
  r = await handleAnnonces('annonce_deposer', { ...sansDate, age: '34' }, ctx(NINA));
  assert.equal(r.status, 200);
  assert.equal(ageAu(db.annonces[0].birth_date, new Date('2026-10-29T20:00:00Z')), 34);
  assert.equal(ageAu(db.annonces[0].birth_date, new Date('2027-10-29T20:00:00Z')), 35);
});
// ---- comptes sans profil : Lamia relance ou supprime, un par un ou plusieurs à la fois
function mondeComptes({ formule = 'decouverte' } = {}) {
  const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  const users = { [U(1)]: { id: U(1), email: 'vide@ex.fr', user_metadata: { first_name: 'Sam' } }, [U(2)]: { id: U(2), email: 'profil@ex.fr' }, [U(3)]: { id: U(3), email: 'soiree@ex.fr' }, [U(4)]: { id: U(4), email: 'lamia@ex.fr', app_metadata: { role: 'admin' } } };
  const appels = [];
  const json = async (x, ok = true) => ({ ok, json: async () => x });
  const call = async (u, o = {}) => {
    appels.push(`${o.method || 'GET'} ${u}`);
    const m = u.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
    if (m) return users[m[1]] ? json(users[m[1]]) : json({}, false);
    return json([]);
  };
  const read = async (u) => {
    if (u.startsWith('/rest/v1/annonces?or=') && u.includes('status=in.(a_verifier,publiee)')) return u.includes(U(2)) ? [{ ref: 5 }] : [];
    if (u.startsWith('/rest/v1/event_registrations?user_id=eq.')) return u.includes(U(3)) ? [{ event_id: 'e' }] : [];
    return [];
  };
  const ctx = (admin = true) => ({ formuleDe: async () => formule, env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, call, read, insert: async () => ({}), patch: async () => ({ ok: true }), admin, user: { id: U(4), email: 'lamia@ex.fr' }, ipHash: 'ip', now: () => new Date('2026-11-13T09:00:00Z'), email: async () => true, alerter: async () => {} });
  return { U, ctx, appels };
}
test('comptes sans profil : réservé à Lamia, et la suppression demande une confirmation', async () => {
  const { U, ctx } = mondeComptes();
  let r = await handleAnnonces('annonce_comptes_relancer', { user_ids: [U(1)] }, ctx(false));
  assert.equal(r.status, 403);
  r = await handleAnnonces('annonce_comptes_supprimer', { user_ids: [U(1)] }, ctx());
  assert.equal((await r.json()).error, 'confirmation_requise');
});
test('relance : seulement les comptes sans profil ; la date de relance est notée', async () => {
  const { U, ctx, appels } = mondeComptes();
  const d = await (await handleAnnonces('annonce_comptes_relancer', { user_ids: [U(1), U(2), U(4)] }, ctx())).json();
  assert.deepEqual(d.faits, [U(1)]);
  assert.deepEqual(d.ignores.map((x) => x.raison).sort(), ['a_un_profil', 'admin']);
  assert.ok(appels.some((a) => a.startsWith('POST /rest/v1/relances_compte')));
  assert.ok(!appels.some((a) => a.startsWith('DELETE /auth')));
});
test('suppression : jamais un compte avec profil, une soirée, un abonnement, ni l’admin', async () => {
  const { U, ctx, appels } = mondeComptes();
  const d = await (await handleAnnonces('annonce_comptes_supprimer', { user_ids: [U(1), U(2), U(3), U(4)], confirmation: 'supprimer' }, ctx())).json();
  assert.deepEqual(d.faits, [U(1)]);
  assert.deepEqual(d.ignores.map((x) => x.raison).sort(), ['a_un_profil', 'admin', 'soiree']);
  assert.deepEqual(appels.filter((a) => a.startsWith('DELETE /auth')), [`DELETE /auth/v1/admin/users/${U(1)}`]);
  const abo = mondeComptes({ formule: 'passion' });
  const d2 = await (await handleAnnonces('annonce_comptes_supprimer', { user_ids: [abo.U(1)], confirmation: 'SUPPRIMER' }, abo.ctx())).json();
  assert.deepEqual(d2.faits, []);
  assert.equal(d2.ignores[0].raison, 'abonnement');
});
