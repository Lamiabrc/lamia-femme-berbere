import test from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirDiscussion, actionDiscussion, finDePause } from '../lib/discussions.mjs';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', D = '33333333-3333-4333-8333-333333333333';
const json = async (r) => [r.status, await r.json()];
function base(heure = '2026-11-05T10:00:00Z') {
  const db = { discussions: [], discussion_messages: [] }, alertes = [];
  let t = new Date(heure);
  const now = () => t;
  const read = async (path) => {
    if (path.includes('discussion_messages')) return path.includes('auteur=eq.') ? [] : db.discussion_messages;
    if (path.includes('interet_id=eq.')) return db.discussions.filter((d) => path.includes(d.interet_id));
    return db.discussions;
  };
  const insert = async (tb, row) => { const r = { id: D, ...row }; db[tb].push(r); return r; };
  const patch = async (tb, f, row) => { for (const r of db[tb]) Object.assign(r, row); };
  return { db, alertes, avancer: (h) => { t = new Date(t.getTime() + h * 3600e3); },
    ctx: { read, insert, patch, now, pousserMembre: async () => {}, alerter: async (a) => { alertes.push(a.titre); } } };
}

test('pause : après 3 matchs en 3 jours, 24 heures avant le suivant', async () => {
  const t = new Date('2026-11-05T10:00:00Z');
  const lecteur = (heures) => ({ now: () => t, read: async () => heures.map((h) => ({ ouverte_at: new Date(t.getTime() - h * 3600e3).toISOString() })) });
  assert.equal(await finDePause(lecteur([1, 5]), A), null); // 2 matchs : pas de pause
  assert.equal(await finDePause(lecteur([2, 10, 20]), A), '2026-11-06T08:00:00.000Z'); // 24 h après le 3e
  assert.equal(await finDePause(lecteur([30, 40, 50]), A), null); // pause déjà finie
  assert.equal(await finDePause(lecteur([1, 2, 3]), null), null);
});

test('numéros : conseil de Lamia au premier numéro, puis avertissement si dématch rapide', async () => {
  const { db, alertes, avancer, ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 54, prenom: 'Omar' }, b: { user_id: B, ref: 96, prenom: 'Zohra' } });
  await actionDiscussion('annonce_discussion_numero', { id: D, telephone: '06 12 34 56 78' }, { ...ctx, user: { id: A } });
  assert.ok(db.discussion_messages.some((m) => m.auteur === null && /Conseil de Lamia/.test(m.texte)));
  await actionDiscussion('annonce_discussion_numero', { id: D, telephone: '06 98 76 54 32' }, { ...ctx, user: { id: B } });
  assert.ok(db.discussions[0].numeros_at);
  assert.equal(db.discussion_messages.filter((m) => /Conseil de Lamia/.test(m.texte)).length, 1); // une seule fois
  avancer(2);
  const [s1, r1] = await json(await actionDiscussion('annonce_discussion_dematcher', { id: D, raison: 'caractere' }, { ...ctx, user: { id: A } }));
  assert.equal(s1, 409); assert.equal(r1.error, 'avertissement_numero'); assert.match(r1.message, /pénalisé/);
  assert.equal(db.discussions[0].dematch_at, undefined);
  const [s2] = await json(await actionDiscussion('annonce_discussion_dematcher', { id: D, raison: 'caractere', confirme: true }, { ...ctx, user: { id: A } }));
  assert.equal(s2, 200);
  assert.ok(alertes.some((x) => /Dématch rapide après échange de numéros · n° 54/.test(x)));
});

test('vocal : lien de dépôt dans le dossier de la discussion, envoi vérifié', async () => {
  const { db, ctx } = base();
  await ouvrirDiscussion(ctx, { interetId: 'i1', a: { user_id: A, ref: 54, prenom: 'Omar' }, b: { user_id: B, ref: 96, prenom: 'Zohra' } });
  const deps = { ...ctx, user: { id: A }, lienDepotAudio: async (p) => `https://x/upload/${p}`, signerAudio: async (paths) => Object.fromEntries(paths.map((p) => [p, `https://x/lire/${p}`])) };
  const [s0, trop] = await json(await actionDiscussion('annonce_discussion_vocal_lien', { id: D, mime: 'audio/webm', taille: 1000, duree: 300 }, deps));
  assert.equal(s0, 400); assert.equal(trop.error, 'vocal_trop_long');
  const [, l] = await json(await actionDiscussion('annonce_discussion_vocal_lien', { id: D, mime: 'audio/webm;codecs=opus', taille: 50000, duree: 20 }, deps));
  assert.match(l.path, new RegExp(`^discussions/${D}/[0-9a-f-]{36}\\.webm$`));
  // Un chemin d'une autre discussion est refusé.
  const [s1] = await json(await actionDiscussion('annonce_discussion_envoyer', { id: D, audio_path: 'discussions/autre/x.webm' }, deps));
  assert.equal(s1, 400);
  const [s2] = await json(await actionDiscussion('annonce_discussion_envoyer', { id: D, audio_path: l.path, duree: 20 }, deps));
  assert.equal(s2, 200);
  const m = db.discussion_messages.find((x) => x.audio_path);
  assert.equal(m.texte, '🎤 Message vocal'); assert.equal(m.audio_duree, 20);
  const [, v] = await json(await actionDiscussion('annonce_discussions', {}, { ...deps, user: { id: B } }));
  assert.equal(v.discussions[0].messages.find((x) => x.audio).audio, `https://x/lire/${l.path}`);
});
