// Notifications Web Push (VAPID + chiffrement aes128gcm, RFC 8291 / 8292), sans dépendance externe.
// La clé privée VAPID reste côté serveur (table platform_settings, lisible uniquement avec la clé de service).

import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign, generateKeyPairSync } from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

// Nouvelle paire de clés VAPID : la publique (format brut, pour le navigateur) et la privée (JWK, pour signer).
export function genererClesVapid() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  return { publicKey: b64u(pub), privateJwk: jwk };
}

// Jeton VAPID signé (ES256) pour le service de notification du navigateur.
export function enteteVapid(endpoint, keys, subject, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const key = createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${keys.publicKey}`;
}

// Chiffre le contenu pour un abonnement (p256dh + auth), format aes128gcm.
export function chiffrer(payload, sub, { salt = randomBytes(16), ecdh } = {}) {
  const uaPublic = fromB64u(sub.keys.p256dh);
  const authSecret = fromB64u(sub.keys.auth);
  if (!ecdh) { ecdh = createECDH('prime256v1'); ecdh.generateKeys(); }
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Envoie une notification. Renvoie { ok, gone } : « gone » signifie que l'abonnement n'existe plus.
export async function envoyerPush(sub, message, keys, { subject = 'https://lamia-femme-berbere.com', fetcher = fetch } = {}) {
  const body = chiffrer(JSON.stringify(message), sub);
  const r = await fetcher(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: enteteVapid(sub.endpoint, keys, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
    body,
    signal: AbortSignal.timeout(10000),
  });
  return { ok: r.status >= 200 && r.status < 300, gone: r.status === 404 || r.status === 410, status: r.status };
}
