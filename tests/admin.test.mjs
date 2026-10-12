import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin, sourceOf, slugify } from '../lib/admin.mjs';
import { applyOverrides, defaults } from '../content/editable.mjs';
import * as P from '../content/pages.mjs';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' };
const post = (b, h = {}) => new Request('https://x/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
const admin = { id: 'a', app_metadata: { role: 'admin' } };
function fake(user = admin) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
    if (url.includes('/auth/v1/user')) return user ? { ok: true, json: async () => user } : { ok: false, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => [{ id: 'p1' }], text: async () => '' };
  };
  return { fetcher, calls };
}

test('provenance des visites', () => {
  assert.equal(sourceOf('https://www.tiktok.com/@x'), 'tiktok');
  assert.equal(sourceOf('https://l.facebook.com/l.php'), 'facebook');
  assert.equal(sourceOf('https://lamia-femme-berbere.com/ecrin/'), 'interne');
  assert.equal(sourceOf(''), 'direct');
  assert.equal(sourceOf('', 'Live-TikTok'), 'live-tiktok');
  assert.equal(slugify('Collier émaillé d’Ath Yenni'), 'collier-emaille-d-ath-yenni');
});

test('visite : comptée sans cookie, robots et pages privées ignorés', async () => {
  const { fetcher, calls } = fake();
  await handleAdmin(post({ action: 'visit', path: '/ecrin/', ref: 'https://www.tiktok.com/' }, { 'user-agent': 'Mozilla iPhone Mobile' }), { env, fetcher });
  const row = calls.find((c) => c.url.includes('page_views')).body;
  assert.deepEqual([row.path, row.source, row.device], ['/ecrin/', 'tiktok', 'mobile']);
  assert.equal(row.visitor.length, 32);
  const robot = fake();
  await handleAdmin(post({ action: 'visit', path: '/' }, { 'user-agent': 'Googlebot' }), { env, fetcher: robot.fetcher });
  await handleAdmin(post({ action: 'visit', path: '/admin-bal.html' }), { env, fetcher: robot.fetcher });
  assert.equal(robot.calls.length, 0);
});

test('produits : réservé à Lamia, prix contrôlé, slug généré', async () => {
  const anon = fake(null);
  assert.equal((await handleAdmin(post({ action: 'product_save', product: { name: 'X', price_cents: 100 } }, { authorization: 'Bearer t' }), { env, fetcher: anon.fetcher })).status, 403);
  const { fetcher, calls } = fake();
  let r = await handleAdmin(post({ action: 'product_save', product: { name: 'Bague kabyle', price_cents: -5 } }, { authorization: 'Bearer t' }), { env, fetcher });
  assert.equal((await r.json()).error, 'bad_price');
  r = await handleAdmin(post({ action: 'product_save', product: { name: 'Bague kabyle émaillée', price_cents: 4900, stock_qty: 3, status: 'active', gallery: [{ url: 'https://x/a.webp' }, { url: 'javascript:alert(1)' }] } }, { authorization: 'Bearer t' }), { env, fetcher });
  assert.equal(r.status, 200);
  const row = calls.find((c) => c.url.endsWith('/rest/v1/products') && c.method === 'POST').body;
  assert.equal(row.slug, 'bague-kabyle-emaillee');
  assert.equal(row.gallery.length, 1);
  assert.equal(row.cover_image_url, 'https://x/a.webp');
});

test('textes du site : les modifications de Lamia remplacent les textes par défaut', () => {
  const before = P.hall.title;
  assert.equal(defaults()['pages.hall.title'], before);
  const img = applyOverrides({ 'pages.hall.title': 'Bienvenue à la Maison.', 'images.hall-arch': 'https://x/arche.webp', 'pages.hall.inconnu': 'x', 'images.hall-medal': 'javascript:x' });
  assert.equal(P.hall.title, 'Bienvenue à la Maison.');
  assert.deepEqual(img, { 'hall-arch': 'https://x/arche.webp' });
  P.hall.title = before;
});
