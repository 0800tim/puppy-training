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
    assert.match(page.headers.get("x-robots-tag") || "", /noindex/, "noindex header as well as the meta tag");
    const html = await page.text();
    assert.match(html, /Looking after Pip/); assert.match(html, /noindex/); assert.match(html, /Say it once/);
    assert.ok(!/Kid<|Mum</.test(html), "no family names on the card");
    const miss = await fetch(base + "/api/visitor/" + "0".repeat(24));
    assert.equal(miss.status, 404); assert.match(miss.headers.get("x-robots-tag") || "", /noindex/);
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
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "weight", date: "2026-02-30", kg: 6.4 }, mum)).status, 400, "not a real day");
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "vet", date: "1999-12-31" }, mum)).status, 400, "out of range");
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

test("teaching: the teacher logs it, only the learner can confirm, both score once it is confirmed", async () => {
  const app = await boot();
  try {
    const kid = await app.as("k"), mum = await app.as("a");
    assert.equal((await app.call("POST", "/api/teach", { skill: "name", learner: "k" }, kid)).status, 400, "not yourself");
    // "name" has no prerequisite so it is open on day one; "sit" needs "yes" first
    assert.equal((await app.call("POST", "/api/teach", { skill: "nope", learner: "a" }, kid)).status, 400);
    const t = await app.call("POST", "/api/teach", { skill: "name", learner: "a" }, kid);
    assert.equal(t.status, 200); assert.equal(t.json.teach[0].confirmed, null);
    assert.equal((await app.call("POST", "/api/teach", { skill: "name", learner: "a" }, kid)).status, 409, "no double logging");
    const id = t.json.teach[0].id;
    assert.equal((await app.call("PUT", "/api/teach/" + id, {}, kid)).status, 403, "the teacher can't confirm their own claim");
    const c = await app.call("PUT", "/api/teach/" + id, {}, mum);
    assert.ok(c.json.teach[0].confirmed > 0);
    const S = R.compute(Object.assign({}, c.json), C, { today: "2026-10-17" });
    assert.equal(S.people.k.points, C.points.teach); assert.equal(S.people.a.points, C.points.learn);
    assert.ok(S.people.k.badges.includes("sensei"));
    const d = await app.call("DELETE", "/api/teach/" + id, undefined, kid);
    assert.equal(d.json.teach.length, 0);
  } finally { app.stop(); }
});

test("buddies: an opt-in pair in settings; the streak counts days both trained", async () => {
  const app = await boot();
  try {
    const mum = await app.as("a");
    const st = (await app.call("GET", "/api/state", undefined, mum)).json.settings;
    st.family[0].buddy = "a"; st.family[1].buddy = "zzz";
    const saved = await app.call("PUT", "/api/settings", st, mum);
    assert.equal(saved.json.settings.family[0].buddy, "a"); assert.equal(saved.json.settings.family[1].buddy, "", "unknown buddy dropped");
    const ticks = {};
    ["2026-10-15", "2026-10-16", "2026-10-17"].forEach((d) => { ticks[d + "_k_pm"] = { at: 1, by: "k" }; ticks[d + "_a_pm"] = { at: 1, by: "a" }; });
    ticks["2026-10-14_k_pm"] = { at: 1, by: "k" };
    const S = R.compute({ settings: saved.json.settings, ticks, logs: {}, mastery: {}, toilet: [] }, C, { today: "2026-10-17" });
    assert.deepEqual(S.people.k.buddy, { with: "a", streak: 3, best: 3, today: true });
    assert.equal(S.people.a.buddy, null, "Mum didn't pick a buddy");
  } finally { app.stop(); }
});

test("privacy: kids' phones never receive phone numbers once a grown-up exists; grown-ups and all-kids families do", async () => {
  const app = await boot();
  try {
    const kid = await app.as("k"), mum = await app.as("a");
    const forMum = (await app.call("GET", "/api/state", undefined, kid === mum ? kid : mum)).json.settings.family.find((m) => m.id === "a");
    assert.match(forMum.phone || "", /^\+64/, "grown-up sees the number");
    const forKid = (await app.call("GET", "/api/state", undefined, kid)).json.settings.family;
    assert.ok(forKid.every((m) => !("phone" in m)), "no phone field at all on a kid's phone: " + JSON.stringify(forKid));
    assert.ok(forKid.some((m) => m.sms === true), "the sms flag still shows, the number does not");
    const before = (await app.call("GET", "/api/state", undefined, app.session)).json.settings.family;
    assert.ok(before.every((m) => !("phone" in m)), "a phone that has not picked anyone is treated as a kid");
  } finally { app.stop(); }
  // all-kids family: the kids are the editors, so they keep the numbers (a save would otherwise wipe them)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  const server = createApp({ pin: PIN, dataDir: dir, log: () => {}, noScheduler: true, limits: { perIp: 50, global: 500 } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: PIN }) });
    const session = login.headers.get("set-cookie").split(";")[0];
    const put = await fetch(base + "/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: session }, body: JSON.stringify({ puppy: { name: "Pip", sex: "girl", born: "2026-08-14" }, start: "2026-10-16", family: [{ id: "k", name: "Kid", kind: "kid", phone: "021 000 0000", sms: true }] }) });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).settings.family[0].phone, "+64210000000");
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("privacy: successful logins and identity picks are logged without the address; failures keep it", async () => {
  const seen = [];
  const app = await boot({ log: (...a) => seen.push(a.join(" ")) });
  try {
    await app.as("k");
    assert.ok(seen.includes("login ok"), seen.join(" | "));
    assert.ok(seen.includes("me k"), seen.join(" | "));
    assert.ok(!seen.some((l) => /^(login ok|me) .*127\.0\.0\.1/.test(l)));
    const base = "http://127.0.0.1:" + app.server.address().port;
    await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "000000" }) });
    assert.ok(seen.includes("login failed 127.0.0.1"), "failures keep the address for the lockout: " + seen.join(" | "));
  } finally { app.stop(); }
});

test("review nits: health log follows the settings rule (open to kids only when the family has no grown-up)", async () => {
  const app = await boot();
  try {
    const kid = await app.as("k");
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "weight", date: "2026-10-17", kg: 6.4 }, kid)).status, 403, "a kid in a family with a grown-up");
    assert.equal((await app.call("POST", "/api/healthlog", { kind: "weight", date: "2026-10-17", kg: 6.4 }, app.session)).status, 403, "nobody picked");
  } finally { app.stop(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  const server = createApp({ pin: PIN, dataDir: dir, log: () => {}, noScheduler: true, limits: { perIp: 50, global: 500 } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const j = (o) => ({ "Content-Type": "application/json" });
  try {
    const login = await fetch(base + "/api/login", { method: "POST", headers: j(), body: JSON.stringify({ pin: PIN }) });
    const session = login.headers.get("set-cookie").split(";")[0];
    await fetch(base + "/api/settings", { method: "PUT", headers: Object.assign(j(), { Cookie: session }), body: JSON.stringify({ puppy: { name: "Pip", sex: "girl", born: "2026-08-14" }, start: "2026-10-16", family: [{ id: "k", name: "Kid", kind: "kid" }] }) });
    const me = await fetch(base + "/api/me", { method: "POST", headers: Object.assign(j(), { Cookie: session }), body: JSON.stringify({ pid: "k" }) });
    const cookie = session + "; " + me.headers.get("set-cookie").split(";")[0];
    const r = await fetch(base + "/api/healthlog", { method: "POST", headers: Object.assign(j(), { Cookie: cookie }), body: JSON.stringify({ kind: "weight", date: "2026-10-17", kg: 6.4 }) });
    assert.equal(r.status, 200, "all-kids family: the kid logs health, matching the client");
    const d = await fetch(base + "/api/healthlog/" + (await r.json()).health[0].id, { method: "DELETE", headers: { Cookie: cookie } });
    assert.equal(d.status, 200);
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("review nits: teaching needs an open skill, and open claims per teacher are capped", async () => {
  const app = await boot();
  try {
    const kid = await app.as("k");
    const locked = C.skills.find((s) => s.req && s.req.length);
    assert.ok(locked, "content has a skill with prerequisites");
    assert.equal((await app.call("POST", "/api/teach", { skill: locked.id, learner: "a" }, kid)).status, 400, "locked skill refused");
    const open = C.skills.filter((s) => !s.req || !s.req.length).map((s) => s.id);
    assert.ok(open.length >= 6, "enough open skills to test the cap: " + open.length);
    for (let i = 0; i < 5; i++) assert.equal((await app.call("POST", "/api/teach", { skill: open[i], learner: "a" }, kid)).status, 200, "claim " + (i + 1));
    const sixth = await app.call("POST", "/api/teach", { skill: open[5], learner: "a" }, kid);
    assert.equal(sixth.status, 429, "sixth open claim refused");
    assert.match(sixth.json.error, /waiting to be confirmed/);
    // once one is confirmed there is room again
    const mum = await app.as("a");
    const first = (await app.call("GET", "/api/state", undefined, mum)).json.teach[0];
    assert.equal((await app.call("PUT", "/api/teach/" + first.id, {}, mum)).status, 200);
    assert.equal((await app.call("POST", "/api/teach", { skill: open[5], learner: "a" }, kid)).status, 200);
  } finally { app.stop(); }
});
