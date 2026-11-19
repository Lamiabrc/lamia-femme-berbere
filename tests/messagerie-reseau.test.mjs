import test from 'node:test';
import assert from 'node:assert/strict';
import { creerAppelProfil, creerEnvoisDiscussion } from '../src/messagerie-reseau.mjs';

const session = (token = 'ancien', id = 'membre-test') => ({ access_token: token, user: { id } });
const ok = () => Response.json({ ok: true, discussions: [] });
const lecture = { action: 'annonce_discussions' };
const attente = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('deux chargements simultanés partagent une seule requête, puis la lecture peut être renouvelée', async () => {
  const a = attente(); let nombre = 0;
  const appel = creerAppelProfil({ getSession: async () => session(), fetcher: async () => { nombre++; await a.promise; return ok(); } });
  const x = appel(lecture, session()), y = appel(lecture, session());
  assert.equal(x, y); a.resolve(); await x; assert.equal(nombre, 1);
  await appel(lecture, session()); assert.equal(nombre, 2);
});

test('une lecture interrompue ne reste pas mémorisée et ne vide pas une réponse précédente', async () => {
  let nombre = 0;
  const appel = creerAppelProfil({ getSession: async () => session(), fetcher: async () => { if (++nombre === 1) throw new TypeError('Failed to fetch'); return ok(); } });
  await assert.rejects(appel(lecture, session()), { code: 'reseau_indisponible' });
  assert.deepEqual((await appel(lecture, session())).discussions, []); assert.equal(nombre, 2);
});

test('le délai couvre une connexion lente, une réponse JSON bloquée et une session bloquée', async () => {
  const jamais = () => new Promise(() => {});
  for (const dep of [{ getSession: jamais, fetcher: async () => ok() }, { getSession: async () => session(), fetcher: jamais }, { getSession: async () => session(), fetcher: async () => ({ ok: true, status: 200, json: jamais }) }]) {
    const appel = creerAppelProfil({ ...dep, delai: 15 });
    await assert.rejects(appel(lecture, session()), { code: 'delai_depasse' });
  }
});

test('les appels emploient la session actuelle et un seul renouvellement après deux réponses 401', async () => {
  let courante = session(), renouvellements = 0;
  const entetes = [];
  const appel = creerAppelProfil({ getSession: async () => courante, refreshSession: async () => { renouvellements++; await new Promise((r) => setTimeout(r, 5)); courante = session('nouveau'); return courante; }, fetcher: async (_, init) => { entetes.push(init.headers.Authorization); return init.headers.Authorization === 'Bearer ancien' ? Response.json({ error: 'login_required' }, { status: 401 }) : ok(); } });
  await Promise.all([appel(lecture, session()), appel({ action: 'annonce_mon_profil' }, session())]);
  assert.equal(renouvellements, 1); assert.equal(entetes.filter((x) => x === 'Bearer nouveau').length, 2);
  await appel(lecture, session()); assert.equal(entetes.at(-1), 'Bearer nouveau');
});

test('un autre compte ou une déconnexion ne reçoit pas le résultat de la session précédente', async () => {
  let courante = session(); const a = attente();
  const appel = creerAppelProfil({ getSession: async () => courante, fetcher: async () => { await a.promise; return ok(); } });
  const p = appel(lecture, session()); courante = session('autre', 'autre-membre'); a.resolve();
  await assert.rejects(p, { code: 'login_required' });
  const bloc = creerAppelProfil({ getSession: async () => session(), fetcher: () => new Promise(() => {}) });
  const q = bloc(lecture, session()); bloc.annuler(); await assert.rejects(q, { code: 'session_changee' });
});

test('un 403 ou une réponse invalide reste une erreur et ne relance pas une écriture', async () => {
  let appels = 0;
  const appel = creerAppelProfil({ getSession: async () => session(), fetcher: async () => { appels++; return Response.json({ error: 'photos_requises' }, { status: 403 }); } });
  await assert.rejects(appel({ action: 'annonce_discussion_envoyer' }, session()), { code: 'photos_requises', status: 403 }); assert.equal(appels, 1);
  const invalide = creerAppelProfil({ getSession: async () => session(), fetcher: async () => Response.json({}) });
  await assert.rejects(invalide(lecture, session()), { code: 'reponse_invalide' });
});

test('un double clic ne soumet pas deux messages et la relance conserve la clé du texte', async () => {
  let n = 0; const corps = [], a = attente();
  const envois = creerEnvoisDiscussion({ uuid: () => `cle-${++n}` });
  const envoyer = async (body) => { corps.push(body); await a.promise; throw new TypeError('réponse perdue'); };
  const x = envois.envoyer('discussion', 'Salam', envoyer);
  await assert.rejects(envois.envoyer('discussion', 'Salam', envoyer), { code: 'envoi_en_cours' });
  a.resolve(); await assert.rejects(x); assert.equal(corps.length, 1);
  await envois.envoyer('discussion', 'Salam', async (body) => { corps.push(body); return { ok: true }; });
  assert.equal(corps[0].client_message_id, corps[1].client_message_id);
  await envois.envoyer('discussion', 'Salam', async (body) => { corps.push(body); return { ok: true }; });
  assert.notEqual(corps[1].client_message_id, corps[2].client_message_id);
});
