"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/server.js");

let server, base, dir;
const PIN = "482913";
const json = (o) => ({ "Content-Type": "application/json", body: JSON.stringify(o) });
async function call(method, url, body, cookie) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j, cookie: r.headers.get("set-cookie") };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  server = createApp({ pin: PIN, dataDir: dir, log: () => {}, limits: { perIp: 3, global: 100 } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("refuses a bad PIN config", () => {
  assert.throws(() => createApp({ pin: "12", dataDir: dir }));
  assert.throws(() => createApp({ pin: "abcd", dataDir: dir }));
});

test("health is public, state needs the PIN", async () => {
  const h = await call("GET", "/api/health");
  assert.equal(h.status, 200);
  assert.equal(h.json.app, "puppy-training");
  assert.equal((await call("GET", "/api/state")).status, 401);
});

test("serves the app and blocks path traversal", async () => {
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Puppy School HQ/);
  const bad = await fetch(base + "/..%2fserver%2fserver.js");
  assert.equal(bad.status, 404);
});

test("wrong PIN is refused, then rate limited", async () => {
  for (let i = 0; i < 3; i++) assert.equal((await call("POST", "/api/login", { pin: "000000" })).status, 401);
  const locked = await call("POST", "/api/login", { pin: PIN });
  assert.equal(locked.status, 429, "even the right PIN waits during a lockout");
  assert.ok(locked.json.retryAfter > 0);
});

test("right PIN unlocks; ticks, logs and settings persist", async () => {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  let skew = 0;
  const s2 = createApp({ pin: PIN, dataDir: dir2, log: () => {}, now: () => Date.now() + skew });
  await new Promise((r) => s2.listen(0, "127.0.0.1", r));
  const b2 = "http://127.0.0.1:" + s2.address().port;
  const prev = base; base = b2;
  try {
    const login = await call("POST", "/api/login", { pin: PIN });
    assert.equal(login.status, 200);
    assert.match(login.cookie, /HttpOnly/);
    const cookie = login.cookie.split(";")[0];

    const st = await call("PUT", "/api/settings", { puppy: { name: "Pepper", sex: "girl", born: "2026-08-14" }, start: "2026-10-16", family: [{ id: "p1", name: "Sam", kind: "kid", target: 99 }, { id: "p2", name: "Mum", kind: "adult" }, { id: "bad id!", name: "X" }] }, cookie);
    assert.equal(st.status, 200);
    assert.equal(st.json.settings.family.length, 2, "invalid member dropped");
    assert.equal(st.json.settings.family[0].target, 21, "silly target falls back to the kid default");
    assert.equal(st.json.settings.family[1].target, 10, "adult default target");

    // identity comes from a server-signed cookie, never from the request body
    assert.equal((await call("PUT", "/api/ticks/2026-10-16_p1_am", { on: true, by: "p2" }, cookie)).status, 403, "no phone identity yet");
    assert.equal((await call("POST", "/api/me", { pid: "nobody" }, cookie)).status, 400);
    const asKid = await call("POST", "/api/me", { pid: "p1" }, cookie);
    assert.equal(asKid.status, 200); assert.equal(asKid.json.me, "p1");
    const kid = cookie + "; " + asKid.cookie.split(";")[0];
    const asMum = await call("POST", "/api/me", { pid: "p2" }, cookie);
    const mum = cookie + "; " + asMum.cookie.split(";")[0];

    const t = await call("PUT", "/api/ticks/2026-10-16_p1_am", { on: true, by: "p2", skill: "sit" }, mum);
    assert.ok(t.json.ticks["2026-10-16_p1_am"]);
    assert.equal(t.json.ticks["2026-10-16_p1_am"].by, "p2", "who logged it comes from the cookie, the body's by is ignored");
    assert.equal(t.json.ticks["2026-10-16_p1_am"].skill, "sit");
    assert.equal(t.json.me, "p2");
    assert.equal((await call("PUT", "/api/ticks/nonsense", { on: true }, mum)).status, 400);
    assert.equal((await call("PUT", "/api/ticks/2020-01-01_p1_am", { on: true }, kid)).status, 403, "kids can't log past days");
    assert.equal((await call("PUT", "/api/ticks/2020-01-01_p1_am", { on: true }, mum)).status, 200, "grown-ups can");
    // a kid can't undo someone else's tick after 15 minutes; a grown-up can
    skew = 20 * 60e3;
    assert.equal((await call("PUT", "/api/ticks/2026-10-16_p1_am", { on: false }, kid)).status, 403);
    assert.equal((await call("PUT", "/api/ticks/2026-10-16_p1_am", { on: false }, mum)).status, 200);
    await call("PUT", "/api/ticks/2026-10-16_p1_am", { on: true, skill: "sit" }, mum);

    // settings and the photo: grown-ups only once a grown-up exists
    assert.equal((await call("PUT", "/api/settings", st.json.settings, kid)).status, 403);
    assert.equal((await call("PUT", "/api/settings", st.json.settings, mum)).status, 200);

    const l = await call("PUT", "/api/logs/2026-10-16", { bite: 4 }, kid);
    assert.equal(l.json.logs["2026-10-16"].bite, 4);
    assert.equal(l.json.logs["2026-10-16"].by, "p1");

    // mastery needs a witness who isn't you; one vote per person
    assert.equal((await call("PUT", "/api/mastery/sit", { witness: "p1" }, kid)).status, 400);
    assert.equal((await call("PUT", "/api/mastery/nope", { witness: "p2" }, kid)).status, 400);
    const mv = await call("PUT", "/api/mastery/sit", { witness: "p2" }, kid);
    assert.equal(mv.json.mastery.sit.done.length, 1);
    await call("PUT", "/api/mastery/sit", { witness: "p2" }, kid);
    const mv2 = await call("PUT", "/api/mastery/sit", { witness: "p1" }, mum);
    assert.equal(mv2.json.mastery.sit.done.length, 2, "repeat vote by the same person doesn't double up");
    const un = await call("PUT", "/api/mastery/sit", { on: false }, mum);
    assert.equal(un.json.mastery.sit.done.length, 1, "a vote can be taken back");

    // toilet log: undo your own within 15 minutes, a grown-up any time
    assert.equal((await call("POST", "/api/toilet", { kind: "swim" }, kid)).status, 400);
    const tl = await call("POST", "/api/toilet", { kind: "wee", before: "woke" }, kid);
    assert.equal(tl.json.toilet.length, 1);
    assert.equal(tl.json.toilet[0].before, "woke");
    assert.equal(tl.json.toilet[0].by, "p1");
    const del = await call("DELETE", "/api/toilet/" + tl.json.toilet[0].id, undefined, kid);
    assert.equal(del.json.toilet[0].void, true);
    const tl2 = await call("POST", "/api/toilet", { kind: "poo" }, mum);
    assert.equal((await call("DELETE", "/api/toilet/" + tl2.json.toilet[1].id, undefined, kid)).status, 403, "not yours");
    assert.equal((await call("DELETE", "/api/toilet/" + tl2.json.toilet[1].id, undefined, mum)).status, 200);

    // socialisation: one entry per person per item, with a mood
    assert.equal((await call("PUT", "/api/social/people:0", { mood: "thrilled" }, kid)).status, 400);
    assert.equal((await call("PUT", "/api/social/nope:9", { mood: "happy" }, kid)).status, 400);
    const so = await call("PUT", "/api/social/people:0", { mood: "happy" }, kid);
    assert.equal(so.json.social["people:0"].length, 1);
    await call("PUT", "/api/social/people:0", { mood: "unsure" }, kid);
    const so2 = await call("GET", "/api/state", undefined, kid);
    assert.equal(so2.json.social["people:0"].length, 1, "re-logging replaces, never doubles");
    assert.equal(so2.json.social["people:0"][0].mood, "unsure");
    assert.equal(so2.json.me, "p1");

    // push: only real push services, owner-or-grown-up on changes, a hard cap
    const subFor = (n) => ({ endpoint: "https://fcm.googleapis.com/fcm/send/" + n, keys: { p256dh: "x", auth: "y" } });
    assert.equal((await call("POST", "/api/push/subscribe", { subscription: { endpoint: "https://evil.example/collect", keys: { p256dh: "x", auth: "y" } } }, kid)).status, 400, "not a push service");
    const ps = await call("POST", "/api/push/subscribe", { subscription: subFor("kid1"), label: "Android" }, kid);
    assert.equal(ps.status, 200); assert.equal(ps.json.push[0].pid, "p1", "the phone belongs to whoever the cookie says");
    const pm = await call("POST", "/api/push/subscribe", { subscription: subFor("mum1") }, mum);
    const kidSub = ps.json.subId, mumSub = pm.json.subId;
    assert.equal((await call("PUT", "/api/push/" + mumSub, { prefs: { on: false } }, kid)).status, 403, "kid can't touch mum's phone");
    assert.equal((await call("PUT", "/api/push/" + kidSub, { prefs: { on: false } }, mum)).status, 200, "grown-up can pause a kid's phone");
    assert.equal((await call("DELETE", "/api/push/" + mumSub, undefined, kid)).status, 403);
    assert.equal((await call("DELETE", "/api/push/" + kidSub, undefined, kid)).status, 200, "your own, fine");
    for (let i = 0; i < 39; i++) await call("POST", "/api/push/subscribe", { subscription: subFor("fill" + i) }, mum);
    assert.equal((await call("POST", "/api/push/subscribe", { subscription: subFor("one-too-many") }, mum)).status, 409, "cap refuses, never evicts silently");
    assert.equal((await call("POST", "/api/push/subscribe", { subscription: subFor("fill0") }, mum)).status, 200, "re-subscribing an existing phone is fine");
    assert.equal((await call("POST", "/api/sms/test", { pid: "p2" }, kid)).status, 403, "grown-ups only");

    const bye = await call("POST", "/api/logout", {}, mum);
    assert.equal(bye.status, 200);

    // puppy photo: JPEG data URL in, image out, grown-ups only
    assert.equal((await call("GET", "/api/photo", undefined, cookie)).status, 404);
    assert.equal((await call("PUT", "/api/photo", { data: "data:image/png;base64,AAAA" }, mum)).status, 400);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);
    assert.equal((await call("PUT", "/api/photo", { data: "data:image/jpeg;base64," + jpeg.toString("base64") }, kid)).status, 403);
    const ph = await call("PUT", "/api/photo", { data: "data:image/jpeg;base64," + jpeg.toString("base64") }, mum);
    assert.equal(ph.status, 200);
    assert.equal(ph.json.photo, true);
    const img = await fetch(b2 + "/api/photo", { headers: { Cookie: cookie } });
    assert.equal(img.headers.get("content-type"), "image/jpeg");
    assert.equal((await img.arrayBuffer()).byteLength, jpeg.length);
    assert.equal((await fetch(b2 + "/api/photo")).status, 401, "photo needs the PIN too");

    const rev = (await call("GET", "/api/state", undefined, cookie)).json.rev;
    const same = await call("GET", "/api/state?since=" + rev, undefined, cookie);
    assert.equal(same.json.unchanged, true);

    const saved = JSON.parse(fs.readFileSync(path.join(dir2, "store.json"), "utf8"));
    assert.equal(saved.settings.puppy.name, "Pepper");
    assert.ok(saved.ticks["2026-10-16_p1_am"]);

    // writes must be JSON (blocks simple cross-site form posts)
    const r = await fetch(b2 + "/api/ticks/2026-10-16_p1_pm", { method: "PUT", headers: { Cookie: mum, "Content-Type": "text/plain" }, body: '{"on":true}' });
    assert.equal(r.status, 415);
  } finally { s2.close(); base = prev; fs.rmSync(dir2, { recursive: true, force: true }); }
});

test("changing the PIN signs everyone out", async () => {
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  const a = createApp({ pin: "1111", dataDir: dir3, log: () => {} });
  await new Promise((r) => a.listen(0, "127.0.0.1", r));
  const ba = "http://127.0.0.1:" + a.address().port;
  const login = await fetch(ba + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1111" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  a.close();
  const b = createApp({ pin: "2222", dataDir: dir3, log: () => {} });
  await new Promise((r) => b.listen(0, "127.0.0.1", r));
  const bb = "http://127.0.0.1:" + b.address().port;
  const st = await fetch(bb + "/api/state", { headers: { Cookie: cookie } });
  assert.equal(st.status, 401);
  b.close(); fs.rmSync(dir3, { recursive: true, force: true });
});

test("a grown-up PIN, when set, gates picking a grown-up profile", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  assert.throws(() => createApp({ pin: PIN, dataDir: d, adultPin: "12" }));
  const a = createApp({ pin: PIN, dataDir: d, adultPin: "9999", log: () => {}, limits: { perIp: 3, global: 100 } });
  await new Promise((r) => a.listen(0, "127.0.0.1", r));
  const prev = base; base = "http://127.0.0.1:" + a.address().port;
  try {
    const login = await call("POST", "/api/login", { pin: PIN }); const cookie = login.cookie.split(";")[0];
    await call("PUT", "/api/settings", { puppy: { name: "P", sex: "girl" }, start: "2026-10-16", family: [{ id: "k", name: "Kid", kind: "kid" }, { id: "a", name: "Dad", kind: "adult" }] }, cookie);
    assert.equal((await call("POST", "/api/me", { pid: "k" }, cookie)).status, 200, "kids never need it");
    const no = await call("POST", "/api/me", { pid: "a" }, cookie);
    assert.equal(no.status, 403); assert.equal(no.json.code, "adultpin");
    assert.equal((await call("POST", "/api/me", { pid: "a", adultPin: "0000" }, cookie)).status, 403);
    const yes = await call("POST", "/api/me", { pid: "a", adultPin: "9999" }, cookie);
    assert.equal(yes.status, 200); assert.equal(yes.json.adultPin, true);
    assert.equal((await call("GET", "/api/state", undefined, cookie)).json.adultPin, true, "the app can tell a grown-up PIN exists");
  } finally { a.close(); base = prev; fs.rmSync(d, { recursive: true, force: true }); }
});

test("behind a proxy the lockout keys on CF-Connecting-IP or the last X-Forwarded-For hop, never on a header the phone wrote", async () => {
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  const seen = [];
  const s3 = createApp({ pin: PIN, dataDir: dir3, trustProxy: true, log: (...a) => seen.push(a.join(" ")), limits: { perIp: 2, global: 100 }, noScheduler: true });
  await new Promise((r) => s3.listen(0, "127.0.0.1", r));
  const b3 = "http://127.0.0.1:" + s3.address().port;
  const login = (pin, headers) => fetch(b3 + "/api/login", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify({ pin }) });
  try {
    // one phone, Cloudflare in front: it rewrites the first X-Forwarded-For entry every try, but CF-Connecting-IP stays put
    for (let i = 0; i < 2; i++) assert.equal((await login("000000", { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0." + i + ", 203.0.113.9" })).status, 401);
    assert.equal((await login(PIN, { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.99, 203.0.113.9" })).status, 429, "locked out despite a fresh first entry");
    assert.ok(seen.some((l) => l === "login failed 203.0.113.9"), "the log carries the edge's address, not the phone's header: " + seen.join(" | "));
    assert.ok(!seen.some((l) => /10\.0\.0\./.test(l)), "no made-up address in the log");
    // a different real visitor is not caught by that lockout
    assert.equal((await login(PIN, { "cf-connecting-ip": "198.51.100.4" })).status, 200);
    // no CF header (another proxy): the LAST hop counts, and the caller-seeded entries do not help
    const s4dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
    const s4 = createApp({ pin: PIN, dataDir: s4dir, trustProxy: true, log: () => {}, limits: { perIp: 2, global: 100 }, noScheduler: true });
    await new Promise((r) => s4.listen(0, "127.0.0.1", r));
    const b4 = "http://127.0.0.1:" + s4.address().port;
    const login4 = (pin, xff) => fetch(b4 + "/api/login", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": xff }, body: JSON.stringify({ pin }) });
    try {
      assert.equal((await login4("000000", "1.1.1.1, 192.0.2.7")).status, 401);
      assert.equal((await login4("000000", "2.2.2.2, 192.0.2.7")).status, 401);
      assert.equal((await login4(PIN, "3.3.3.3, 192.0.2.7")).status, 429, "last hop is the identity");
      assert.equal((await login4(PIN, "garbage, not-an-ip")).status, 200, "junk headers fall back to the socket, which is a different identity");
    } finally { s4.close(); fs.rmSync(s4dir, { recursive: true, force: true }); }
  } finally { s3.close(); fs.rmSync(dir3, { recursive: true, force: true }); }
});

test("without TRUST_PROXY the headers are ignored entirely", async () => {
  const seen = [];
  const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  const s5 = createApp({ pin: PIN, dataDir: dir5, log: (...a) => seen.push(a.join(" ")), noScheduler: true });
  await new Promise((r) => s5.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch("http://127.0.0.1:" + s5.address().port + "/api/login", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ pin: "000000" }) });
    assert.equal(r.status, 401);
    assert.ok(seen.some((l) => l === "login failed 127.0.0.1"), seen.join(" | "));
  } finally { s5.close(); fs.rmSync(dir5, { recursive: true, force: true }); }
});
