import test from 'node:test';
import assert from 'node:assert/strict';
import { actionCoaching, creneauxDe, moisParis, rappelsCoaching } from '../lib/coaching.mjs';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function monde({ formule = 'prestige', statut = 'actif', now = '2026-11-03T12:00:00Z', achetees = 0, autres = {} } = {}) {
  const credits = { n: achetees, utilises: 0, rendus: 0 };
  const lignes = [], abonnements = [{ email: 'nina@example.com', nom: 'Nina', formule: 'prestige', statut: 'actif' }];
  let n = 0;
  const filtrer = (qs) => {
    let l = [...lignes];
    for (const p of qs.split('&')) {
      const [k, v] = p.split(/=(.*)/s);
      if (!v || ['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const val = decodeURIComponent(v);
      if (val === 'is.null') l = l.filter((x) => x[k] == null);
      else if (val === 'not.is.null') l = l.filter((x) => x[k] != null);
      else if (val.startsWith('eq.')) l = l.filter((x) => String(x[k]) === val.slice(3));
      else if (val.startsWith('gte.')) l = l.filter((x) => new Date(x[k]) >= new Date(val.slice(4)));
      else if (val.startsWith('lt.')) l = l.filter((x) => new Date(x[k]) < new Date(val.slice(3)));
    }
    return l.sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  };
  const read = async (u) => {
    if (u.includes('/abonnements')) return abonnements;
    if (u.includes('/annonces')) return [];
    return filtrer(u.split('?')[1]);
  };
  const call = async (u, o = {}) => {
    const qs = u.split('?')[1] || '';
    if (o.method === 'POST') { for (const r of JSON.parse(o.body)) if (!lignes.some((x) => x.debut === r.debut)) lignes.push({ id: ID((n += 1)), user_id: null, email: null, prenom: null, rappel_at: null, ...r }); return new Response('[]'); }
    if (o.method === 'PATCH') {
      const v = JSON.parse(o.body), l = filtrer(qs);
      if (l[0] && v.source === 'inclus' && lignes.some((x) => x.user_id === v.user_id && x.mois === l[0].mois && x.source === 'inclus')) return new Response('{}', { status: 409 });
      l.forEach((x) => Object.assign(x, v)); return new Response(JSON.stringify(l));
    }
    if (o.method === 'DELETE') { for (const x of filtrer(qs)) lignes.splice(lignes.indexOf(x), 1); return new Response('[]'); }
    return new Response('[]');
  };
  const patch = async (_t, f, v) => { filtrer(f).forEach((x) => Object.assign(x, v)); return { ok: true }; };
  const prevenus = [], alertes = [];
  const t = { now: new Date(now) };
  const daily = [];
  const ctx = (user, admin = false) => ({ env: { DAILY_API_KEY: 'k' }, call, read, patch, insert: async () => ({}), admin, user, now: () => t.now, alerter: async (x) => { alertes.push(x.titre); }, prevenirMembre: async (m, x) => { prevenus.push([m.email, x.titre]); }, etat: async () => ({ abonnement: formule ? { formule, statut } : null, unites: { coaching: credits.n, ...autres } }), consommer: async (_m, type) => { if (type !== 'coaching') { if (!autres[type]) return null; autres[type] -= 1; return 'achat-2'; } if (credits.n < 1) return null; credits.n -= 1; credits.utilises += 1; return 'achat-1'; }, rendre: async () => { credits.n += 1; credits.rendus += 1; return true; }, jeton: (id) => `signe-${id}`, jetonOk: (id, x) => x === `signe-${id}`,
    fetcher: async (u, o) => { daily.push([u, o]); return new Response(JSON.stringify(u.includes('meeting-tokens') ? { token: 'jeton' } : { name: 'coaching-x', url: 'https://lfb.daily.co/coaching-x' })); } });
  return { lignes, ctx, prevenus, alertes, t, daily, credits };
}
const NINA = { id: 'u-nina', email: 'Nina@example.com', user_metadata: { first_name: 'Nina' } };
const KARIM = { id: 'u-karim', email: 'karim@example.com', user_metadata: { first_name: 'Karim' } };
const LAMIA = { id: 'u-lamia', email: 'lamia@example.com', app_metadata: { role: 'admin' } };
const go = async (w, action, b, user = NINA, admin = false) => { const r = await actionCoaching(action, b, w.ctx(user, admin)); return { status: r.status, ...(await r.json()) }; };
const ouvrir = (w, date = '2026-11-10', de = '18:00', a = '19:00') => go(w, 'annonce_coaching_ouvrir', { date, de, a }, LAMIA, true);

test('une plage devient des créneaux de 15 minutes, toutes les 20 minutes, à l’heure de Paris', () => {
  const l = creneauxDe('2026-11-10', '18:00', '19:00');
  assert.deepEqual(l.map((d) => d.toISOString()), ['2026-11-10T17:00:00.000Z', '2026-11-10T17:20:00.000Z', '2026-11-10T17:40:00.000Z']);
  assert.equal(creneauxDe('2026-11-10', '19:00', '18:00'), null);
  assert.equal(creneauxDe('n’importe quoi', '18:00', '19:00'), null);
  assert.equal(moisParis('2026-11-30T23:30:00Z'), '2026-12'); // déjà décembre à Paris
});
test('seule Lamia gère le planning', async () => {
  const w = monde();
  assert.equal((await go(w, 'annonce_coaching_ouvrir', { date: '2026-11-10', de: '18:00', a: '19:00' })).status, 403);
  assert.equal((await go(w, 'annonce_coaching_planning', {})).status, 403);
  assert.equal((await ouvrir(w, '2026-11-01')).status, 400); // passé
  const r = await ouvrir(w);
  assert.equal(r.creneaux.length, 3);
  assert.equal((await ouvrir(w, '2026-11-10', '18:05', '18:30')).creneaux.length, 3); // chevauche : rien de plus
});
test('hors Prestige : pas d’espace coaching, pas de réservation', async () => {
  const w = monde({ formule: 'passion' });
  await ouvrir(w);
  assert.equal((await go(w, 'annonce_coaching', {})).inclus, false);
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: w.lignes[0].id })).status, 403);
  const sans = monde({ formule: null });
  assert.equal((await go(sans, 'annonce_coaching', {})).inclus, false);
  assert.equal((await go(monde(), 'annonce_coaching', {}, null)).status, 401);
});
test('paiement à régulariser : pas de réservation', async () => {
  const w = monde({ statut: 'impaye' });
  await ouvrir(w);
  const v = await go(w, 'annonce_coaching', {});
  assert.equal(v.impaye, true); assert.equal(v.creneaux.length, 0);
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: w.lignes[0].id })).error, 'paiement_a_regulariser');
});
test('Prestige : une visio par mois, un créneau pour une seule personne', async () => {
  const w = monde();
  await ouvrir(w); await ouvrir(w, '2026-12-08');
  const [a, b] = w.lignes;
  let v = await go(w, 'annonce_coaching', {});
  assert.equal(v.creneaux.length, 6);
  v = await go(w, 'annonce_coaching_reserver', { id: a.id });
  assert.equal(v.prochaine.id, a.id);
  assert.equal(v.creneaux.length, 3); // plus novembre, reste décembre
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: b.id })).error, 'deja_ce_mois');
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: a.id }, KARIM)).error, 'creneau_pris');
  assert.equal(w.prevenus.length, 1); assert.equal(w.alertes.length, 1);
  assert.equal(a.email, 'nina@example.com');
  const p = await go(w, 'annonce_coaching_planning', {}, LAMIA, true);
  assert.equal(p.abonnes[0].reserve, a.debut);
});
test('annulation jusqu’à 24 heures avant : le créneau redevient libre', async () => {
  const w = monde();
  await ouvrir(w);
  const a = w.lignes[0];
  await go(w, 'annonce_coaching_reserver', { id: a.id });
  assert.equal((await go(w, 'annonce_coaching_annuler', { id: a.id }, KARIM)).status, 404);
  w.t.now = new Date(new Date(a.debut).getTime() - 3600e3);
  assert.equal((await go(w, 'annonce_coaching_annuler', { id: a.id })).error, 'trop_tard');
  w.t.now = new Date('2026-11-03T12:00:00Z');
  const v = await go(w, 'annonce_coaching_annuler', { id: a.id });
  assert.equal(v.prochaine, null); assert.equal(a.user_id, null); assert.equal(v.creneaux.length, 3);
});
test('entrer dans la visio : 10 minutes avant, seulement pour les deux personnes', async () => {
  const w = monde();
  await ouvrir(w);
  const a = w.lignes[0];
  await go(w, 'annonce_coaching_reserver', { id: a.id });
  assert.equal((await go(w, 'annonce_coaching_rejoindre', { id: a.id })).error, 'trop_tot');
  w.t.now = new Date(new Date(a.debut).getTime() - 5 * 60e3);
  assert.equal((await go(w, 'annonce_coaching_rejoindre', { id: a.id }, KARIM)).status, 404);
  // Le membre frappe à la porte : pas de jeton, seulement son prénom.
  const r = await go(w, 'annonce_coaching_rejoindre', { id: a.id });
  assert.equal(r.url, 'https://lfb.daily.co/coaching-x?n=Nina&f=prestige');
  const salle = JSON.parse(w.daily[0][1].body);
  assert.equal(salle.privacy, 'private');
  const porte = JSON.parse(w.daily[1][1].body).properties;
  assert.equal(porte.enable_knocking, true); assert.equal(porte.max_participants, 2);
  assert.equal(w.daily.some(([u]) => u.includes('meeting-tokens')), false);
  // Lamia dirige la salle : jeton de propriétaire.
  const l = await go(w, 'annonce_coaching_rejoindre', { id: a.id }, LAMIA, true);
  assert.equal(l.url, `https://lfb.daily.co/coaching-x?t=jeton&f=prestige&d=15&s=${a.id}`);
  const jeton = JSON.parse(w.daily.find(([u]) => u.includes('meeting-tokens'))[1].body).properties;
  assert.equal(jeton.is_owner, true); assert.equal(jeton.user_name, 'Lamia');
  w.t.now = new Date(new Date(a.debut).getTime() + 3600e3);
  assert.equal((await go(w, 'annonce_coaching_rejoindre', { id: a.id })).error, 'terminee');
});
test('Lamia annule une visio réservée : la personne est prévenue', async () => {
  const w = monde();
  await ouvrir(w);
  const a = w.lignes[0];
  await go(w, 'annonce_coaching_reserver', { id: a.id });
  const r = await go(w, 'annonce_coaching_fermer', { id: a.id }, LAMIA, true);
  assert.equal(r.creneaux.length, 2);
  assert.match(w.prevenus.at(-1)[1], /annulée/);
});
test('prévenir : seulement ceux qui n’ont pas réservé ; rappel envoyé une seule fois', async () => {
  const w = monde();
  await ouvrir(w);
  assert.equal((await go(w, 'annonce_coaching_prevenir', {}, LAMIA, true)).prevenus, 1);
  await go(w, 'annonce_coaching_reserver', { id: w.lignes[0].id });
  assert.equal((await go(w, 'annonce_coaching_prevenir', {}, LAMIA, true)).prevenus, 0);
  const c = w.ctx(LAMIA, true);
  assert.equal(await rappelsCoaching(c), 0); // encore loin
  w.t.now = new Date('2026-11-09T18:00:00Z');
  assert.equal(await rappelsCoaching(c), 1);
  assert.equal(await rappelsCoaching(c), 0);
});

test('visio à l’unité : sans Prestige, un crédit par visio, rendu si elle est annulée à temps', async () => {
  const w = monde({ formule: null, achetees: 1 });
  await ouvrir(w);
  const [a, b] = w.lignes;
  let v = await go(w, 'annonce_coaching', {});
  assert.equal(v.inclus, true); assert.equal(v.credits, 1); assert.equal(v.creneaux.length, 3);
  v = await go(w, 'annonce_coaching_reserver', { id: a.id });
  assert.equal(a.source, 'unite'); assert.equal(a.achat_id, 'achat-1'); assert.equal(w.credits.n, 0);
  assert.equal(v.prochaine.id, a.id); // plus de crédit, mais sa visio reste là pour y entrer
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: b.id })).status, 403); // plus de crédit, pas de Prestige
  await go(w, 'annonce_coaching_annuler', { id: a.id });
  assert.equal(w.credits.n, 1); assert.equal(a.achat_id, null);
});
test('sans visio : l’offre à l’unité, pas de créneau', async () => {
  const w = monde({ formule: 'passion' });
  await ouvrir(w);
  const v = await go(w, 'annonce_coaching', {});
  assert.equal(v.inclus, false); assert.equal(v.offre, true); assert.equal(v.creneaux, undefined);
});
test('Prestige : la visio du mois d’abord, puis une visio achetée dans le même mois', async () => {
  const w = monde({ achetees: 1 });
  await ouvrir(w);
  const [a, b, c] = w.lignes;
  await go(w, 'annonce_coaching_reserver', { id: a.id });
  assert.equal(a.source, 'inclus'); assert.equal(w.credits.n, 1);
  await go(w, 'annonce_coaching_reserver', { id: b.id });
  assert.equal(b.source, 'unite'); assert.equal(w.credits.n, 0);
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: c.id })).error, 'deja_ce_mois');
});
test('créneau pris entre-temps : le crédit est rendu', async () => {
  const w = monde({ formule: null, achetees: 1 });
  await ouvrir(w);
  const a = w.lignes[0];
  a.user_id = 'autre';
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: a.id })).error, 'creneau_pris');
  assert.equal(w.credits.n, 1); assert.equal(w.credits.rendus, 1);
});

const ouvrirService = (w, duree, date = '2026-11-12', de = '18:00', a = '20:00') => go(w, 'annonce_coaching_ouvrir', { date, de, a, duree }, LAMIA, true);
test('créneaux par service : la durée, 5 minutes de pause, pas de chevauchement', async () => {
  assert.deepEqual(creneauxDe('2026-11-10', '18:00', '19:30', 30).map((d) => d.toISOString().slice(11, 16)), ['17:00', '17:35']);
  assert.deepEqual(creneauxDe('2026-11-10', '18:00', '20:10', 60).map((d) => d.toISOString().slice(11, 16)), ['17:00', '18:05']);
  const w = monde();
  await ouvrirService(w, 60);
  assert.equal(w.lignes.length, 1);
  await go(w, 'annonce_coaching_ouvrir', { date: '2026-11-12', de: '18:30', a: '19:00', duree: 15 }, LAMIA, true); // dans l'heure déjà ouverte
  assert.equal(w.lignes.length, 1);
  await ouvrirService(w, 30, '2026-11-12', '19:05', '19:35');
  assert.equal(w.lignes.length, 2);
});
test('chacun ne voit et ne réserve que les créneaux du service acheté', async () => {
  const w = monde({ formule: null, autres: { sauver_couple: 1 } });
  await ouvrirService(w, 60); await ouvrirService(w, 15, '2026-11-13'); await ouvrirService(w, 30, '2026-11-14');
  const v = await go(w, 'annonce_coaching', {});
  assert.deepEqual([...new Set(v.creneaux.map((c) => c.duree))], [60]);
  const c15 = w.lignes.find((c) => c.duree_min === 15), c60 = w.lignes.find((c) => c.duree_min === 60);
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: w.lignes.find((c) => c.duree_min === 30).id })).error, 'service_requis');
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: c15.id })).error, 'deja_ce_mois');
  const r = await go(w, 'annonce_coaching_reserver', { id: c60.id });
  assert.equal(c60.source, 'unite'); assert.equal(r.prochaine.duree, 60);
  assert.match(r.prochaine.invitation, /\/rencontres\/visio\/\?c=/);
});
test('Prestige ne donne que la visio de 15 minutes', async () => {
  const w = monde();
  await ouvrirService(w, 60); await ouvrirService(w, 15, '2026-11-13');
  const v = await go(w, 'annonce_coaching', {});
  assert.deepEqual([...new Set(v.creneaux.map((c) => c.duree))], [15]);
  assert.equal((await go(w, 'annonce_coaching_reserver', { id: w.lignes.find((c) => c.duree_min === 60).id })).error, 'service_requis');
});
test('Sauver mon couple : le conjoint entre sans compte, 3 personnes, avec le bon lien seulement', async () => {
  const w = monde({ formule: null, autres: { sauver_couple: 1 } });
  await ouvrirService(w, 60);
  const c = w.lignes[0];
  const { prochaine } = await go(w, 'annonce_coaching_reserver', { id: c.id });
  const lien = new URL(prochaine.invitation), jeton = lien.searchParams.get('t');
  const inv = (b) => go(w, 'annonce_coaching_invite', { c: c.id, t: jeton, ...b }, null);
  assert.equal((await inv({ t: 'faux' })).status, 403);
  assert.equal((await inv({})).duree, 60);
  assert.equal((await inv({ entrer: true })).error, 'trop_tot');
  w.t.now = new Date(new Date(c.debut).getTime() - 5 * 60e3);
  const r = await inv({ entrer: true, nom: 'Rachid' });
  assert.match(r.url, /daily/);
  assert.equal(JSON.parse(w.daily[0][1].body).properties.max_participants, 3);
  // Le conjoint frappe à la porte avec son prénom, sans jeton : c'est Lamia qui le fait entrer.
  assert.equal(new URL(r.url).searchParams.get('n'), 'Rachid'); assert.equal(new URL(r.url).searchParams.get('f'), 'couple'); assert.equal(new URL(r.url).searchParams.get('t'), null);
  assert.equal(JSON.parse(w.daily[1][1].body).properties.enable_knocking, true);
  // Une heure et quart après le début, c'est encore bon ; après, c'est fini.
  w.t.now = new Date(new Date(c.debut).getTime() + 80 * 60e3);
  assert.equal((await inv({ entrer: true })).error, 'terminee');
  // Annulé : l'ancien lien ne marche plus.
  w.t.now = new Date('2026-11-03T12:00:00Z');
  await go(w, 'annonce_coaching_annuler', { id: c.id });
  assert.equal((await inv({})).status, 403);
});
test('une visio de 15 minutes n’a pas de lien d’invitation', async () => {
  const w = monde();
  await ouvrir(w);
  const c = w.lignes[0];
  const r = await go(w, 'annonce_coaching_reserver', { id: c.id });
  assert.equal(r.prochaine.invitation, undefined);
  assert.equal((await go(w, 'annonce_coaching_invite', { c: c.id, t: `signe-${c.id}.${c.reserve_at}` }, null)).status, 403);
});

test('Lamia ouvre sa salle quand elle veut, même avant l’heure ; elle seule a un jeton', async () => {
  const w = monde();
  await ouvrir(w);
  const a = w.lignes[0];
  await go(w, 'annonce_coaching_reserver', { id: a.id });
  assert.equal((await go(w, 'annonce_coaching_rejoindre', { id: a.id })).error, 'trop_tot');
  assert.equal((await go(w, 'annonce_coaching_rejoindre', { id: a.id }, LAMIA, true)).url, `https://lfb.daily.co/coaching-x?t=jeton&f=prestige&d=15&s=${a.id}`);
  assert.equal((await go(w, 'annonce_coaching_ma_salle', {})).status, 403);
  const m = await go(w, 'annonce_coaching_ma_salle', {}, LAMIA, true);
  assert.equal(m.url, 'https://lfb.daily.co/coaching-x?t=jeton'); assert.equal(m.invitation, 'https://lfb.daily.co/coaching-x');
  assert.ok(w.daily.some(([u, o]) => u.endsWith('/rooms') && JSON.parse(o.body).name === 'lamia-salle'));
});

test('dans sa salle, Lamia a la fiche de la séance et garde ses notes privées', async () => {
  const w = monde();
  await ouvrir(w);
  const a = w.lignes[0];
  await go(w, 'annonce_coaching_reserver', { id: a.id });
  assert.equal((await go(w, 'annonce_coaching_seance', { id: a.id })).status, 403);
  assert.equal((await go(w, 'annonce_coaching_notes', { id: a.id, notes: 'x' })).status, 403);
  assert.equal((await go(w, 'annonce_coaching_notes', { id: a.id, notes: 'Veut se marier dans l’année.' }, LAMIA, true)).ok, true);
  const d = await go(w, 'annonce_coaching_seance', { id: a.id }, LAMIA, true);
  assert.equal(d.seance.duree, 15); assert.equal(d.seance.prenom, 'Nina'); assert.equal(d.seance.service, 'Visio de 15 minutes');
});
