import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { backend } from './fake-confidences.mjs';
import { handleConfidences, verifierFichiers, jeton, jetonValide, enSilence, reglagesPropres } from '../lib/confidences.mjs';
import { b64u } from '../lib/webpush.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', RESEND_API_KEY: 're_test' };

const req = (b, token, ip = '1.2.3.4') => new Request('https://x/api/confidences', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(b) });
const call = async (be, b, token, ip) => { const r = await handleConfidences(req(b, token, ip), { env, fetcher: be.fetcher }); return { status: r.status, body: await r.json() }; };
const lamia = { id: 'lamia', email: 'lamia@exemple.fr', email_confirmed_at: '2026', app_metadata: { role: 'admin' } };
const sara = { id: 'sara', email: 'sara@exemple.fr', email_confirmed_at: '2026', app_metadata: {} };

test('fichiers : types, tailles et nombre contrôlés', () => {
  assert.equal(verifierFichiers([{ type: 'application/x-msdownload', size: 10 }]).error, 'file_type');
  assert.equal(verifierFichiers([{ type: 'image/png', size: 13 * 1024 * 1024 }]).error, 'file_size');
  assert.equal(verifierFichiers(Array(7).fill({ type: 'image/png', size: 10 })).error, 'too_many_files');
  const { files } = verifierFichiers([{ type: 'audio/webm;codecs=opus', size: 5000, duration: 42 }, { type: 'application/pdf', size: 20, name: 'capture.pdf' }]);
  assert.deepEqual(files.map((f) => [f.kind, f.mime, f.duration]), [['audio', 'audio/webm', 42], ['document', 'application/pdf', null]]);
});

test('jeton de fin d’envoi signé et limité dans le temps', () => {
  const t = jeton(env, 'm1', 0);
  assert.ok(jetonValide(env, 'm1', t, 1000));
  assert.ok(!jetonValide(env, 'm2', t, 1000));
  assert.ok(!jetonValide(env, 'm1', t, 3 * 3600e3));
});

test('heures de silence (heure de Paris) et réglages nettoyés', () => {
  const r = { silence_debut: 23, silence_fin: 7 };
  assert.ok(enSilence(r, new Date('2026-10-16T22:30:00Z'))); // 00 h 30 à Paris
  assert.ok(!enSilence(r, new Date('2026-10-16T10:00:00Z')));
  assert.deepEqual(reglagesPropres({ email_alerte: 'pas un email', silence_debut: 30, alertes_push: false }).email_alerte, '');
  assert.equal(reglagesPropres({ silence_debut: 30 }).silence_debut, null);
});

test('confidence vocale sans compte : envoi signé, alerte push sans contenu et email avec lien', async () => {
  const be = backend({ users: { L: lamia } });
  const ua = createECDH('prime256v1'); ua.generateKeys();
  be.db.push_subscriptions.push({ id: 'p1', user_id: 'lamia', endpoint: 'https://push.example/abc', p256dh: b64u(ua.getPublicKey()), auth: b64u(randomBytes(16)) });
  be.db.platform_settings.push({ key: 'confidences_reglages', value: { email_alerte: 'alerte@exemple.fr' } });

  assert.equal((await call(be, { action: 'envoyer', name: 'Nadia', email: 'nadia@exemple.fr', body: 'Bonjour' })).body.error, 'consent_required');
  const r = await call(be, { action: 'envoyer', channel: 'vocal', consent: true, name: 'Nadia', email: 'Nadia@Exemple.fr', files: [{ type: 'audio/webm', size: 30000, duration: 61 }, { type: 'image/jpeg', size: 2000, name: 'photo.jpg' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.uploads.length, 2);
  assert.match(r.body.uploads[0].url, /\/storage\/v1\/object\/upload\/sign\/confidences\/.+token=/);
  assert.equal(be.db.confidence_threads[0].email, 'nadia@exemple.fr');
  // Le message n'est pas visible avant la fin de l'envoi.
  assert.equal(be.db.confidence_messages[0].ready, false);
  assert.equal((await call(be, { action: 'finaliser', message_id: r.body.message_id, token: 'faux' })).status, 403);

  be.storage.add(r.body.uploads[0].path); // seul le vocal est arrivé
  const f = await call(be, { action: 'finaliser', message_id: r.body.message_id, token: r.body.token });
  assert.equal(f.body.fichiers, 1);
  assert.equal(be.db.confidence_files.length, 1);
  assert.equal(be.db.confidence_messages[0].ready, true);
  assert.equal(be.db.confidence_threads[0].unread_lamia, 1);
  assert.equal(f.body.alerte.push, 1);
  assert.equal(be.pushes[0].headers['Content-Encoding'], 'aes128gcm');
  assert.match(be.pushes[0].headers.Authorization, /^vapid t=.+, k=.+/);
  assert.ok(be.db.platform_settings.find((s) => s.key === 'vapid').value.privateJwk.d, 'clé privée gardée côté serveur');
  const mail = be.mails[0];
  assert.deepEqual(mail.to, ['alerte@exemple.fr']);
  assert.match(mail.html, /confidences-lamia\/#/);
  assert.match(mail.text, /un message vocal/);
});

test('protection contre les envois abusifs et les robots', async () => {
  const be = backend();
  const base = { action: 'envoyer', consent: true, name: 'X', email: 'x@exemple.fr', body: 'coucou' };
  assert.equal((await call(be, { ...base, website: 'spam' })).body.thread_id, null);
  assert.equal(be.db.confidence_threads.length, 0);
  for (let i = 0; i < 6; i++) assert.equal((await call(be, base, null, '9.9.9.9')).status, 200);
  assert.equal((await call(be, base, null, '9.9.9.9')).status, 429);
  assert.equal((await call(be, base, null, '8.8.8.8')).status, 200);
});

test('conversation privée : la personne connectée par lien email retrouve ses échanges, Lamia répond', async () => {
  const be = backend({ users: { L: lamia, S: sara } });
  assert.equal((await call(be, { action: 'mes_conversations' })).status, 401);
  const w = await call(be, { action: 'ecrire', consent: true, name: 'Sara', body: 'Je voudrais te parler' }, 'S');
  await call(be, { action: 'finaliser', message_id: w.body.message_id, token: w.body.token });
  // Une confidence envoyée plus tôt sans compte avec la même adresse apparaît aussi.
  const old = await call(be, { action: 'envoyer', consent: true, name: 'Sara', email: 'sara@exemple.fr', body: 'Première confidence' });
  await call(be, { action: 'finaliser', message_id: old.body.message_id, token: old.body.token });

  assert.equal((await call(be, { action: 'lamia_liste' }, 'S')).status, 403);
  const liste = await call(be, { action: 'lamia_liste' }, 'L');
  assert.equal(liste.body.threads.length, 2);
  assert.equal(liste.body.non_lus, 2);
  const tid = w.body.thread_id;
  const rep = await call(be, { action: 'lamia_repondre', thread_id: tid, body: 'Je t’écoute', files: [{ type: 'audio/mp4', size: 900 }] }, 'L');
  be.storage.add(rep.body.uploads[0].path);
  const fin = await call(be, { action: 'finaliser', message_id: rep.body.message_id, token: rep.body.token });
  assert.equal(fin.body.alerte.visiteur, true);
  assert.deepEqual(be.mails.at(-1).to, ['sara@exemple.fr']);
  assert.doesNotMatch(be.mails.at(-1).html, /Je t’écoute/, 'la réponse n’est pas recopiée dans l’email');
  assert.equal(be.db.confidence_threads.find((t) => t.id === tid).status, 'en_cours');

  const mine = await call(be, { action: 'mes_conversations' }, 'S');
  assert.equal(mine.body.threads.length, 2);
  const fil = mine.body.threads.find((t) => t.id === tid);
  assert.deepEqual(fil.messages.map((m) => m.author), ['visiteur', 'lamia']);
  assert.match(fil.messages[1].files[0].url, /object\/sign\/confidences\/.+token=/);
  assert.equal(fil.messages[1].files[0].storage_path, undefined);

  // Une autre personne ne peut ni lire ni écrire dans ce fil.
  assert.equal((await call(be, { action: 'ecrire', thread_id: tid, body: 'intrus' }, 'L')).status, 404);

  assert.equal((await call(be, { action: 'lamia_statut', thread_id: tid, status: 'termine' }, 'L')).body.ok, true);
  assert.equal((await call(be, { action: 'supprimer_ma_conversation', thread_id: tid }, 'S')).body.ok, true);
  assert.equal(be.db.confidence_threads.length, 1);
  assert.equal(be.storage.size, 0);
});

test('alertes groupées : pas plus d’une notification par conversation toutes les 10 minutes', async () => {
  const be = backend({ users: { S: sara } });
  be.db.platform_settings.push({ key: 'confidences_reglages', value: { email_alerte: 'alerte@exemple.fr' } });
  const a = await call(be, { action: 'ecrire', consent: true, body: 'un' }, 'S');
  await call(be, { action: 'finaliser', message_id: a.body.message_id, token: a.body.token });
  const b = await call(be, { action: 'ecrire', thread_id: a.body.thread_id, body: 'deux' }, 'S');
  const r = await call(be, { action: 'finaliser', message_id: b.body.message_id, token: b.body.token });
  assert.equal(r.body.alerte.groupee, true);
  assert.equal(be.mails.length, 1);
});
