import test from 'node:test';
import assert from 'node:assert/strict';
import { envoyerEmail, expediteur, emailPossible } from '../lib/envoi-email.mjs';

const faux = (reponses) => {
  const appels = [];
  const fetcher = async (url, opts) => { appels.push({ url, body: JSON.parse(opts.body), headers: opts.headers }); const r = reponses[url] ?? 200; return { ok: r < 300, status: r }; };
  return { appels, fetcher };
};
const mail = { from: 'Lamia Femme Berbère <contact@lamia-femme-berbere.com>', to: 'membre@exemple.fr', subject: 'Ton lien', html: '<p>Lien</p>', text: 'Lien' };

test('expéditeur lu correctement', () => {
  assert.deepEqual(expediteur('Lamia Femme Berbère <contact@lamia-femme-berbere.com>'), { name: 'Lamia Femme Berbère', email: 'contact@lamia-femme-berbere.com' });
  assert.deepEqual(expediteur('contact@lamia-femme-berbere.com'), { email: 'contact@lamia-femme-berbere.com' });
});

test('Brevo envoie : Resend n’est pas appelé', async () => {
  const { appels, fetcher } = faux({ 'https://api.brevo.com/v3/smtp/email': 201 });
  assert.equal(await envoyerEmail({ BREVO_API_KEY: 'b', RESEND_API_KEY: 'r' }, fetcher, mail), true);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].headers['api-key'], 'b');
  assert.deepEqual(appels[0].body.to, [{ email: 'membre@exemple.fr' }]);
  assert.equal(appels[0].body.sender.email, 'contact@lamia-femme-berbere.com');
});

test('Brevo refuse : le même email repart par Resend', async () => {
  const { appels, fetcher } = faux({ 'https://api.brevo.com/v3/smtp/email': 400, 'https://api.resend.com/emails': 200 });
  assert.equal(await envoyerEmail({ BREVO_API_KEY: 'b', RESEND_API_KEY: 'r' }, fetcher, mail), true);
  assert.deepEqual(appels.map((a) => a.url), ['https://api.brevo.com/v3/smtp/email', 'https://api.resend.com/emails']);
  assert.deepEqual(appels[1].body.to, ['membre@exemple.fr']);
});

test('sans clé Brevo : Resend comme avant', async () => {
  const { appels, fetcher } = faux({});
  assert.equal(await envoyerEmail({ RESEND_API_KEY: 'r' }, fetcher, mail), true);
  assert.deepEqual(appels.map((a) => a.url), ['https://api.resend.com/emails']);
});

test('adresse de test Resend : Brevo est sauté', async () => {
  const { appels, fetcher } = faux({});
  await envoyerEmail({ BREVO_API_KEY: 'b', RESEND_API_KEY: 'r' }, fetcher, { ...mail, from: 'Lamia <onboarding@resend.dev>' });
  assert.deepEqual(appels.map((a) => a.url), ['https://api.resend.com/emails']);
});

test('aucun fournisseur ou aucun destinataire : rien ne part', async () => {
  const { appels, fetcher } = faux({});
  assert.equal(await envoyerEmail({}, fetcher, mail), false);
  assert.equal(await envoyerEmail({ BREVO_API_KEY: 'b' }, fetcher, { ...mail, to: '' }), false);
  assert.equal(appels.length, 0);
  assert.equal(emailPossible({ BREVO_API_KEY: 'b' }), true);
  assert.equal(emailPossible({}), false);
});
