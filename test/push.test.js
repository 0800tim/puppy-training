"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const P = require("../server/push.js");

test("aes128gcm round trip: what the server encrypts, a browser can decrypt", () => {
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { endpoint: "https://push.example/abc", keys: { p256dh: Buffer.from(ua.getPublicKey()).toString("base64url"), auth: auth.toString("base64url") } };
  const msg = JSON.stringify({ title: "Pip's awake", body: "5 minutes of Sit?" });
  const enc = P.encrypt(msg, sub);
  assert.equal(enc.subarray(20, 21)[0], 65, "key id length is the 65-byte public key");
  assert.equal(P.decrypt(enc, ua.getPrivateKey(), ua.getPublicKey(), auth), msg);
  // a second encryption uses a fresh salt and key, so bytes differ
  assert.notEqual(P.encrypt(msg, sub).toString("hex"), enc.toString("hex"));
});

test("VAPID header carries a valid ES256 JWT for the push origin", () => {
  const keys = P.generateVapidKeys();
  const h = P.vapidHeaders("https://fcm.googleapis.com/fcm/send/xyz", keys, "mailto:hello@example.com");
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.Authorization);
  assert.ok(m); assert.equal(m[2], keys.publicKey);
  const [hdr, pay, sig] = m[1].split(".");
  const claims = JSON.parse(Buffer.from(pay, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "mailto:hello@example.com");
  assert.ok(claims.exp > Date.now() / 1000);
  const pub = Buffer.from(keys.publicKey, "base64url");
  const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(hdr + "." + pay), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
});

test("sendPush posts the encrypted body with the right headers and reports gone subscriptions", async () => {
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const sub = { endpoint: "https://push.example/gone", keys: { p256dh: Buffer.from(ua.getPublicKey()).toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
  let seen;
  const fakeFetch = async (url, init) => { seen = { url, init }; return { status: 410 }; };
  const r = await P.sendPush(sub, { title: "x" }, P.generateVapidKeys(), "mailto:a@b.c", { fetch: fakeFetch, ttl: 60 });
  assert.equal(r.gone, true);
  assert.equal(seen.init.headers["Content-Encoding"], "aes128gcm");
  assert.equal(seen.init.headers.TTL, "60");
  assert.match(seen.init.headers.Authorization, /^vapid t=/);
});
