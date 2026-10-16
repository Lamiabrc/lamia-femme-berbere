import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHmac, createDecipheriv, createPublicKey, verify, randomBytes } from 'node:crypto';
import { chiffrer, enteteVapid, genererClesVapid, b64u, fromB64u } from '../lib/webpush.mjs';

const hmac = (k, d) => createHmac('sha256', k).update(d).digest();

// Déchiffrement côté « navigateur », écrit d'après la RFC 8291, pour vérifier notre chiffrement.
function dechiffrer(body, ua, auth) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2);
  return plain.subarray(0, plain.length - 1).toString();
}

test('chiffrement aes128gcm lisible par le navigateur (RFC 8291)', () => {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const auth = randomBytes(16);
  const sub = { endpoint: 'https://push.example/x', keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };
  const msg = JSON.stringify({ title: 'Nouvelle confidence' });
  const body = chiffrer(msg, sub);
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(dechiffrer(body, ua, auth), msg);
});

test('jeton VAPID ES256 valide', () => {
  const keys = genererClesVapid();
  assert.equal(fromB64u(keys.publicKey).length, 65);
  const h = enteteVapid('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://lamia-femme-berbere.com', 1_700_000_000_000);
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [hd, pl, sig] = jwt.split('.');
  const payload = JSON.parse(fromB64u(pl).toString());
  assert.equal(payload.aud, 'https://fcm.googleapis.com');
  assert.equal(payload.exp, 1_700_000_000 + 12 * 3600);
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: keys.privateJwk.x, y: keys.privateJwk.y }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${hd}.${pl}`), { key: pub, dsaEncoding: 'ieee-p1363' }, fromB64u(sig)));
});
