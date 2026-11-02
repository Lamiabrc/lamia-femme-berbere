import test from 'node:test';
import assert from 'node:assert/strict';
import { actionSalons, selection, salonPourAge, samediPropose, parisVersUTC, gratuitParDefaut, dateLimite, SEUIL } from '../lib/salons.mjs';

test('âge → salon : 20-39, puis 40 et plus', () => {
  assert.equal(salonPourAge(19), null); assert.equal(salonPourAge(20), '20-39'); assert.equal(salonPourAge(39), '20-39'); assert.equal(salonPourAge(40), '40+');
});
test('heure de Paris et samedi proposé à 21 h', () => {
  assert.equal(parisVersUTC('2026-11-14T21:00').toISOString(), '2026-11-14T20:00:00.000Z');
  assert.equal(parisVersUTC('2026-07-04T21:00').toISOString(), '2026-07-04T19:00:00.000Z');
  assert.equal(samediPropose(new Date('2026-11-02T12:00:00Z')).toISOString(), '2026-11-07T20:00:00.000Z');
  assert.equal(samediPropose(new Date('2026-11-03T12:00:00Z')).toISOString(), '2026-11-14T20:00:00.000Z');
});
const gens = (nf, nh, sect = ['europe']) => [...Array(nf)].map((_, i) => ({ id: `f${i}`, user_id: `f${i}`, email: `f${i}@x.fr`, prenom: `F${i}`, genre: 'femme', salon: '20-39', secteurs: sect, statut: 'attente', created_at: `2026-11-01T00:${String(i).padStart(2, '0')}:00Z` })).concat([...Array(nh)].map((_, i) => ({ id: `h${i}`, user_id: `h${i}`, email: `h${i}@x.fr`, prenom: `H${i}`, genre: 'homme', salon: '20-39', secteurs: sect, statut: 'attente', created_at: `2026-11-01T00:${String(i).padStart(2, '0')}:00Z` })));
test('parité : autant de femmes que d’hommes, seuil 6 + 6, 10 + 10 au maximum', () => {
  assert.equal(selection(gens(5, 20), 'europe').pret, false);
  const s = selection(gens(6, 25), 'europe');
  assert.equal(s.pret, true); assert.equal(s.retenus.length, 12); assert.equal(s.n, SEUIL);
  assert.equal(s.retenus.filter((x) => x.genre === 'homme').length, s.retenus.filter((x) => x.genre === 'femme').length);
  assert.equal(selection(gens(30, 30), 'europe').retenus.length, 20);
  assert.equal(selection(gens(6, 6, ['canada_usa']), 'europe').pret, false);
});
test('seule la prochaine soirée est gratuite, y compris plusieurs salons le même soir', () => {
  const d = '2026-11-14T20:00:00.000Z';
  assert.equal(gratuitParDefaut([], d), true);
  assert.equal(gratuitParDefaut([{ gratuit: true, starts_at: d }], d), true);
  assert.equal(gratuitParDefaut([{ gratuit: true, starts_at: d }], '2026-11-21T20:00:00.000Z'), false);
});
test('date limite : 48 h, et jamais moins de 24 h avant la soirée', () => {
  const t = new Date('2026-11-02T12:00:00Z');
  assert.equal(dateLimite(t, '2026-11-14T20:00:00Z').toISOString(), '2026-11-04T12:00:00.000Z');
  assert.equal(dateLimite(t, '2026-11-04T20:00:00Z').toISOString(), '2026-11-03T20:00:00.000Z');
});

// Une petite base en mémoire qui comprend les filtres utilisés par les salons.
function base(inscrits, t0) {
  const db = { salon_inscriptions: inscrits.map((x) => ({ inclus: false, ...x })), salon_editions: [], speed_dating_events: [], event_registrations: [], platform_settings: [{ key: 'salons_cron', value: { jeton: 'x'.repeat(40) } }] };
  let n = 0;
  const filtre = (rows, q) => rows.filter((r) => [...q.entries()].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(r[k]));
    if (v === 'is.null') return r[k] == null;
    if (v.startsWith('lt.')) return r[k] && new Date(r[k]) < new Date(v.slice(3));
    if (v.startsWith('gte.')) return r[k] && new Date(r[k]) >= new Date(v.slice(3));
    return true;
  }));
  const parse = (p) => { const u = new URL(`http://x${p}`); return [u.pathname.split('/').pop(), u.searchParams]; };
  const read = async (p) => { const [t, q] = parse(p); return filtre(db[t] || [], q); };
  const insert = async (t, row) => { const r = { id: `${t}-${n += 1}`, ...row }; db[t].push(r); return r; };
  const patch = async (t, f, row) => { const [, q] = parse(`/${t}?${f}`); for (const r of filtre(db[t], q)) Object.assign(r, row); return { ok: true }; };
  const call = async (p, init = {}) => {
    const [t, q] = parse(p), body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'PATCH') { const rows = filtre(db[t], q); rows.forEach((r) => Object.assign(r, body)); return { ok: true, json: async () => rows }; }
    if (init.method === 'POST') { const ex = db[t].find((r) => r.event_id === body.event_id && r.user_id === body.user_id); if (ex) Object.assign(ex, body); else db[t].push(body); return { ok: true }; }
    return { ok: true, json: async () => filtre(db[t], q) };
  };
  const notifs = [], alertes = [];
  let t = t0;
  const ctx = (extra = {}) => ({ env: {}, call, read, insert, patch, admin: false, user: null, ipHash: 'ip', now: () => t, alerter: async (m) => { alertes.push(m.titre); }, cron: false, prevenirMembre: async (m, msg) => { notifs.push([m.user_id, msg.titre, msg.texte]); }, etat: async () => ({}), ...extra });
  return { db, ctx, notifs, alertes, aller: (d) => { t = new Date(d); } };
}
const rep = async (r) => [r.status, await r.json()];

test('parcours complet : confirmation gratuite, validation, relève, rappels sans doublon', async () => {
  const b = base(gens(6, 8), new Date('2026-11-02T12:00:00Z'));
  const [, ed] = [0, await b.ctx().insert('salon_editions', { salon: '20-39', secteur: 'europe', statut: 'a_valider', date_proposee: '2026-11-14T20:00:00Z' })];
  // Une personne non admin ne peut pas confirmer.
  assert.equal((await actionSalons('salon_confirmer', { id: '00000000-0000-4000-8000-000000000000', date: '2026-11-14T21:00' }, b.ctx())).status, 403);
  ed.id = '11111111-1111-4111-8111-111111111111';
  const [s0] = await rep(await actionSalons('salon_confirmer', { id: ed.id, date: '2026-11-03T21:00' }, b.ctx({ admin: true })));
  assert.equal(s0, 400); // moins de 3 jours
  const [s1, r1] = await rep(await actionSalons('salon_confirmer', { id: ed.id, date: '2026-11-14T21:00' }, b.ctx({ admin: true })));
  assert.equal(s1, 200); assert.equal(r1.convoques, 12); assert.equal(r1.gratuit, true);
  assert.equal(b.db.speed_dating_events[0].ticket_price_cents, 0);
  assert.equal(b.db.speed_dating_events[0].sur_invitation, true);
  assert.equal(b.db.event_registrations.length, 12);
  assert.ok(b.notifs.every((n) => n[1] === '{A}, ton salon est confirmé !' && /gratuite/.test(n[2])));
  // Ceux qui ne sont pas retenus restent en attente, dans l'ordre.
  assert.deepEqual(b.db.salon_inscriptions.filter((x) => x.statut === 'attente').map((x) => x.id), ['h6', 'h7']);

  // Valider une place gratuite.
  await actionSalons('salon_valider', {}, b.ctx({ user: { id: 'f0' } }));
  assert.equal(b.db.salon_inscriptions.find((x) => x.id === 'f0').statut, 'place');
  assert.equal(b.db.event_registrations.find((x) => x.user_id === 'f0').payment_status, 'waived');
  const [, mes] = await rep(await actionSalons('salon_mes', {}, b.ctx({ user: { id: 'h0' } })));
  assert.equal(mes.inscription.gratuit, true); assert.equal(mes.inscription.statut, 'convoque');

  // La tâche demande sa clé.
  assert.equal((await actionSalons('salon_cron', { jeton: 'faux' }, b.ctx())).status, 403);
  const jeton = 'x'.repeat(40);

  // 48 h sans validation : la place se libère et l'homme suivant la reprend.
  for (const x of b.db.salon_inscriptions.filter((y) => y.statut === 'convoque' && y.id !== 'h0')) { x.statut = 'place'; x.payer_avant = null; }
  b.aller('2026-11-04T13:00:00Z');
  const [, c1] = await rep(await actionSalons('salon_cron', { jeton }, b.ctx()));
  assert.equal(c1.liberees, 1);
  assert.equal(b.db.salon_inscriptions.find((x) => x.id === 'h0').statut, 'libere');
  assert.equal(b.db.event_registrations.find((x) => x.user_id === 'h0').attendance_status, 'cancelled');
  assert.equal(b.db.salon_inscriptions.find((x) => x.id === 'h6').statut, 'convoque');
  b.db.salon_inscriptions.find((x) => x.id === 'h6').statut = 'place';

  // Les rappels : le jour même à 9 h, une heure avant, au démarrage ; jamais deux fois.
  b.notifs.length = 0;
  const titres = async (d) => { b.aller(d); await actionSalons('salon_cron', { jeton }, b.ctx()); const u = [...new Set(b.notifs.map((n) => n[1]))]; const nb = b.notifs.length; b.notifs.length = 0; return [u, nb]; };
  assert.deepEqual(await titres('2026-11-14T07:00:00Z'), [[], 0]); // 8 h à Paris : trop tôt
  assert.deepEqual(await titres('2026-11-14T08:05:00Z'), [['{A}, c’est ce soir !'], 12]);
  assert.deepEqual(await titres('2026-11-14T08:10:00Z'), [[], 0]);
  assert.deepEqual(await titres('2026-11-14T19:02:00Z'), [['{A}, ta soirée commence dans une heure'], 12]);
  assert.deepEqual(await titres('2026-11-14T19:07:00Z'), [[], 0]);
  assert.deepEqual(await titres('2026-11-14T20:01:00Z'), [['{A}, ta soirée commence !'], 12]);
  assert.deepEqual(await titres('2026-11-14T20:06:00Z'), [[], 0]);
  await titres('2026-11-15T03:00:00Z');
  assert.equal(b.db.salon_editions[0].statut, 'terminee');
  assert.equal(b.db.speed_dating_events[0].status, 'completed');
  assert.equal(b.db.salon_inscriptions.find((x) => x.id === 'f0').statut, 'terminee');
});

test('soirée suivante : payante, et place incluse pour une formule qui la comprend', async () => {
  const b = base(gens(6, 6), new Date('2026-11-16T12:00:00Z'));
  b.db.salon_editions.push({ id: 'ancienne', salon: '20-39', secteur: 'algerie', statut: 'terminee', gratuit: true, starts_at: '2026-11-14T20:00:00.000Z' });
  const ed = await b.ctx().insert('salon_editions', { salon: '20-39', secteur: 'europe', statut: 'a_valider' });
  ed.id = '22222222-2222-4222-8222-222222222222';
  const ctx = b.ctx({ admin: true, etat: async (mail) => (mail === 'f0@x.fr' ? { abonnement: { formule: 'passion' } } : {}) });
  const [, r] = await rep(await actionSalons('salon_confirmer', { id: ed.id, date: '2026-11-28T21:00' }, ctx));
  assert.equal(r.gratuit, false);
  assert.equal(b.db.speed_dating_events[0].ticket_price_cents, 900);
  assert.equal(b.db.salon_inscriptions.find((x) => x.id === 'f0').statut, 'place');
  assert.equal(b.db.event_registrations.find((x) => x.user_id === 'f0').payment_status, 'waived');
  assert.equal(b.db.salon_inscriptions.find((x) => x.id === 'f1').statut, 'convoque');
  assert.equal((await actionSalons('salon_valider', {}, b.ctx({ user: { id: 'f1' } }))).status, 409);
});
