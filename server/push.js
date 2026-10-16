/* Web Push without dependencies: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291).
 * Node 18+ only (node:crypto and global fetch). About 120 lines, so you can read all of it.
 */
"use strict";
const crypto = require("node:crypto");

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");

/* ---------- VAPID keys ---------- */
function generateVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
// Build a JWK from raw P-256 keys so node:crypto can sign with them.
function privateJwk(publicKey, privateKey) {
  const pub = unb64u(publicKey); // 65 bytes: 0x04 || x || y
  return { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(unb64u(privateKey)) };
}
function vapidHeaders(endpoint, keys, subject, ttl = 12 * 3600) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + ttl, sub: subject }));
  const key = crypto.createPrivateKey({ key: privateJwk(keys.publicKey, keys.privateKey), format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(header + "." + payload), { key, dsaEncoding: "ieee-p1363" });
  const jwt = header + "." + payload + "." + b64u(sig);
  return { Authorization: "vapid t=" + jwt + ", k=" + keys.publicKey };
}

/* ---------- payload encryption (aes128gcm) ---------- */
function hkdf(salt, ikm, info, len) { return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len)); }
function encrypt(payload, sub) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const salt = crypto.randomBytes(16);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const data = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // one record, final delimiter 0x02
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(data.length + 16 + 1024);
  const header = Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub]);
  return Buffer.concat([header, body]);
}
// Used by the tests: the browser side of RFC 8291, so we can prove the server encrypts correctly.
function decrypt(buf, uaPrivateKey, uaPublicKey, auth) {
  const salt = buf.subarray(0, 16), idlen = buf[20], asPub = buf.subarray(21, 21 + idlen), body = buf.subarray(21 + idlen);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.setPrivateKey(uaPrivateKey);
  const shared = ecdh.computeSecret(asPub);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublicKey, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(body.subarray(body.length - 16));
  const plain = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
  return plain.subarray(0, plain.length - 1).toString();
}

/* ---------- send ---------- */
async function sendPush(sub, payload, keys, subject, opts = {}) {
  const body = encrypt(typeof payload === "string" ? payload : JSON.stringify(payload), sub);
  const headers = Object.assign({ "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", TTL: String(opts.ttl || 3600), Urgency: opts.urgency || "normal" }, vapidHeaders(sub.endpoint, keys, subject));
  const fetchFn = opts.fetch || fetch;
  const r = await fetchFn(sub.endpoint, { method: "POST", headers, body });
  return { status: r.status, gone: r.status === 404 || r.status === 410 };
}

module.exports = { generateVapidKeys, vapidHeaders, encrypt, decrypt, sendPush };
