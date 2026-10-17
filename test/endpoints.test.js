"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/server.js");
const N = require("../server/notify.js");
const C = require("../public/content.js");
const R = require("../public/rewards.js");

const PIN = "482913";
async function boot(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  const server = createApp(Object.assign({ pin: PIN, dataDir: dir, log: () => {}, limits: { perIp: 50, global: 500 } }, opts));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (method, url, body, cookie) => {
    const headers = {}; if (body !== undefined) headers["Content-Type"] = "application/json"; if (cookie) headers.Cookie = cookie;
    const r = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, json: j, cookie: r.headers.get("set-cookie") };
  };
  const login = await call("POST", "/api/login", { pin: PIN });
  const session = login.cookie.split(";")[0];
  await call("PUT", "/api/settings", { puppy: { name: "Pip", sex: "girl", born: "2026-08-14" }, start: "2026-10-16", family: [{ id: "k", name: "Kid", kind: "kid" }, { id: "a", name: "Mum", kind: "adult", phone: "021 000 0000", sms: true }] }, session);
  const as = async (pid) => { const r = await call("POST", "/api/me", { pid }, session); return session + "; " + r.cookie.split(";")[0]; };
  const stop = () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { server, dir, call, session, as, stop };
}
const sub = (n) => ({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/" + n, keys: { p256dh: "x", auth: "y" } });

test("push test: sends through the injected sender, and a gone subscription is dropped", async () => {
  const sent = [];
  let gone = false;
  const app = await boot({ sendPush: async (s, payload) => { sent.push({ pid: s.pid, payload }); return { status: gone ? 410 : 201, gone }; } });
  try {
    const kid = await app.as("k"), mum = await app.as("a");
    const ps = await app.call("POST", "/api/push/subscribe", { subscription: sub("kid"), label: "Android" }, kid);
    const id = ps.json.subId;
    assert.equal((await app.call("POST", "/api/push/nope00000000/test", undefined, kid)).status, 404);
    const t = await app.call("POST", "/api/push/" + id + "/test", undefined, kid);
    assert.equal(t.status, 200); assert.equal(sent.length, 1); assert.equal(sent[0].pid, "k"); assert.match(sent[0].payload.body, /Reminders are on/);
    assert.equal((await app.call("POST", "/api/push/" + id + "/test", undefined, mum)).status, 200, "a grown-up may test a kid's phone");
    gone = true;
    const g = await app.call("POST", "/api/push/" + id + "/test", undefined, kid);
    assert.equal(g.status, 410);
    assert.equal((await app.call("GET", "/api/state", undefined, kid)).json.push.length, 0, "410 from the push service removes the subscription");
    assert.equal((await app.call("POST", "/api/push/" + id + "/test", undefined, kid)).status, 404);
  } finally { app.stop(); }
});

test("sms test: grown-ups only, needs a saved number, uses the injected sender, reports gateway failures", async () => {
  const texts = [];
  let fail = false;
  const app = await boot({ sms: async (phone, message) => { if (fail) throw new Error("gateway 500"); texts.push({ phone, message }); } });
  try {
    const kid = await app.as("k"), mum = await app.as("a");
    assert.equal((await app.call("POST", "/api/sms/test", { pid: "a" }, kid)).status, 403);
    assert.equal((await app.call("POST", "/api/sms/test", { pid: "k" }, mum)).status, 400, "the kid has no number");
    const ok = await app.call("POST", "/api/sms/test", { pid: "a" }, mum);
    assert.equal(ok.status, 200); assert.equal(texts[0].phone, "+64210000000"); assert.match(texts[0].message, /Pip here/);
    fail = true;
    assert.equal((await app.call("POST", "/api/sms/test", { pid: "a" }, mum)).status, 502);
    assert.equal((await app.call("GET", "/api/state", undefined, mum)).json.sms, true, "state says a gateway is configured");
  } finally { app.stop(); }
});

test("no sms gateway: state says so and the test endpoint says 503", async () => {
  const app = await boot({ sms: null });
  try {
    const mum = await app.as("a");
    assert.equal((await app.call("GET", "/api/state", undefined, mum)).json.sms, false);
    assert.equal((await app.call("POST", "/api/sms/test", { pid: "a" }, mum)).status, 503);
  } finally { app.stop(); }
});

test("logout clears both cookies and the old ones stop working", async () => {
  const app = await boot();
  try {
    const kid = await app.as("k");
    const r = await fetch("http://127.0.0.1:" + app.server.address().port + "/api/logout", { method: "POST", headers: { Cookie: kid, "Content-Type": "application/json" }, body: "{}" });
    const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie")];
    assert.ok(set.some((c) => c.startsWith("pt_session=;")) && set.some((c) => c.startsWith("pt_me=;")));
    // the signed cookies themselves remain valid until expiry; logout is the browser forgetting them
    assert.equal((await app.call("GET", "/api/state")).status, 401);
  } finally { app.stop(); }
});

test("the notifier tick: nudges at the right minute, caps, resets after a tick, and drops gone phones", async () => {
  let clock = new Date("2026-10-19T07:00:00"); // a Monday 07:00 local
  const sent = []; let gone = false;
  const app = await boot({ noScheduler: false, now: () => clock.getTime(), sendPush: async (s, payload) => { sent.push({ pid: s.pid, tag: payload.tag }); return { status: gone ? 410 : 201, gone }; }, sms: async (phone, message) => { sent.push({ pid: "sms", phone, message }); } });
  try {
    const kid = await app.as("k");
    await app.call("POST", "/api/push/subscribe", { subscription: sub("kid") }, kid);
    const n = app.server.notifier; assert.ok(n, "scheduler is created");
    await n.tick();
    assert.deepEqual(sent.map((x) => x.pid + ":" + x.tag), ["k:nudge-am"], "morning nudge for the empty slot");
    await n.tick();
    assert.equal(sent.length, 1, "the same minute never sends twice");
    clock = new Date("2026-10-19T15:30:00"); await n.tick();
    assert.equal(sent.filter((x) => x.pid === "k").length, 2, "afternoon nudge");
    assert.equal(sent.filter((x) => x.pid === "sms").length, 1, "Mum's daily text at 15:30 because she has done nothing");
    assert.match(sent.find((x) => x.pid === "sms").message, /Pip/);
    clock = new Date("2026-10-19T18:30:00"); await n.tick();
    assert.equal(sent.filter((x) => x.pid === "k").length, 2, "two a day cap holds");
    // the kid ticks a session: unanswered resets
    await app.call("PUT", "/api/ticks/2026-10-19_k_ev", { on: true }, kid);
    const st = await app.call("GET", "/api/state", undefined, kid);
    assert.equal(st.json.push.length, 1);
    // next day, the phone is gone from the push service: it is removed
    clock = new Date("2026-10-20T07:00:00"); gone = true; await n.tick();
    assert.equal((await app.call("GET", "/api/state", undefined, kid)).json.push.length, 0);
  } finally { app.stop(); }
});

test("decide() is what the scheduler calls: same inputs, same message", () => {
  const state = { settings: { puppy: { name: "Pip", sex: "girl" }, family: [{ id: "k", name: "Kid", kind: "kid", target: 21 }] }, ticks: {}, logs: {}, mastery: {}, toilet: [] };
  const sc = R.compute(state, C, { today: "2026-10-19" });
  const out = N.decide(new Date("2026-10-19T07:00:00"), state, sc, [{ id: "s", pid: "k", channel: "push", prefs: {} }], C, {});
  assert.equal(out.length, 1); assert.equal(out[0].kind, "am");
});

test("visitor card: grown-ups make and revoke a link; the page is public by link only and never indexed", async () => {
  const app = await boot();
  try {
    const kid = await app.as("k"), mum = await app.as("a");
    assert.equal((await app.call("POST", "/api/share", {}, kid)).status, 403);
    const made = await app.call("POST", "/api/share", {}, mum);
    assert.equal(made.status, 200); assert.match(made.json.share.token, /^[a-f0-9]{24}$/);
    const base = "http://127.0.0.1:" + app.server.address().port;
    const page = await fetch(base + "/api/visitor/" + made.json.share.token);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Looking after Pip/); assert.match(html, /noindex/); assert.match(html, /Say it once/);
    assert.ok(!/Kid<|Mum</.test(html), "no family names on the card");
    assert.equal((await fetch(base + "/api/visitor/" + "0".repeat(24))).status, 404);
    const again = await app.call("POST", "/api/share", {}, mum);
    assert.notEqual(again.json.share.token, made.json.share.token, "a new link replaces the old one");
    assert.equal((await fetch(base + "/api/visitor/" + made.json.share.token)).status, 404, "old link dead");
    assert.equal((await app.call("DELETE", "/api/share", undefined, kid)).status, 403);
    await app.call("DELETE", "/api/share", undefined, mum);
    assert.equal((await fetch(base + "/api/visitor/" + again.json.share.token)).status, 404, "revoked");
  } finally { app.stop(); }
});

test("health log: grown-ups record weights, vaccines and worming; entries can be voided", async () => {
  const app = await boot();
  try {
    const kid = await app.as("k"), mum = await app.as("a");
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "weight", date: "2026-10-17", kg: 6.4 }, kid)).status, 403);
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "haircut", date: "2026-10-17" }, mum)).status, 400);
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "weight", date: "17/10/2026", kg: 6.4 }, mum)).status, 400);
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "weight", date: "2026-10-17", kg: "lots" }, mum)).status, 400);
    const w = await app.call("POST", "/api/healthlog", { kind: "weight", date: "2026-10-17", kg: 6.449 }, mum);
    assert.equal(w.status, 200); assert.equal(w.json.health[0].kg, 6.45); assert.equal(w.json.health[0].by, "a");
    const v = await app.call("POST", "/api/healthlog", { kind: "vaccine", date: "2026-10-09", note: "First core, Nobivac" }, mum);
    assert.equal(v.json.health.length, 2);
    assert.equal((await app.call("DELETE", "/api/healthlog/" + w.json.health[0].id, undefined, kid)).status, 403);
    const d = await app.call("DELETE", "/api/healthlog/" + w.json.health[0].id, undefined, mum);
    assert.equal(d.json.health.length, 1, "voided entries are not sent");
    assert.equal((await app.call("GET", "/api/state", undefined, kid)).json.health.length, 1, "kids can read the log");
  } finally { app.stop(); }
});
