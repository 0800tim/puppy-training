// HOUSEHOLDS=1 step 4 (docs/design/HOUSEHOLDS.md): the owner page, invites, pause, delete with a grace period, demo families.
const { test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/server.js");
const { makeMailer } = require("../server/mail.js");

const dirs = [], servers = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-o-")); dirs.push(d); return d; };
async function boot(opts) {
  const mailer = makeMailer({ MAIL: "console" }, { log: () => {} });
  const server = createApp(Object.assign({ log: () => {}, noScheduler: true, households: true, mailer, ownerEmails: "tim@example.nz, Other@Example.nz", limits: { perIp: 50, global: 500 } }, opts));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (method, url, body, cookie, headers) => {
    const h = Object.assign({}, headers || {});
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (cookie) h.Cookie = cookie;
    const r = await fetch(base + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    let json = null; try { json = await r.clone().json(); } catch {}
    const jar = {}; r.headers.getSetCookie().forEach((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); jar[kv.slice(0, i)] = kv.slice(i + 1); });
    return { status: r.status, json, jar, location: r.headers.get("location"), text: await r.text() };
  };
  return { server, base, call, mailer };
}
after(() => { servers.forEach((s) => s.close()); dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });
const jarCookie = (jar) => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join("; ");
const linksIn = (text) => [...text.matchAll(/https?:\/\/[^\s]+\/m\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
const ipOf = (n) => ({ "cf-connecting-ip": "203.0.113." + n });

async function ownerSignIn(app) {
  await app.call("POST", "/api/email", { email: "tim@example.nz" }, undefined, ipOf(99));
  const mail = app.mailer.outbox[app.mailer.outbox.length - 1];
  const [tok] = linksIn(mail.text);
  const go = await app.call("POST", "/m/" + tok);
  assert.equal(go.status, 302); assert.equal(go.location, "/owner.html");
  assert.ok(go.jar.pt_owner);
  return "pt_owner=" + go.jar.pt_owner;
}

test("an owner address gets an owner link by email; the owner API needs that cookie and lists names, codes and counts only", async () => {
  const dir = tmp();
  const app = await boot({ dataDir: dir, trustProxy: true });
  assert.equal((await app.call("GET", "/api/owner/households")).status, 401);
  const A = app.server.households.create({ name: "Biscuit", pin: "111111", owner: "ann@example.nz" });
  const H = app.server.households.get(A.id);
  H.db.settings = { puppy: { name: "Biscuit", sex: "girl" }, start: "2026-10-01", family: [{ id: "a1", name: "Ann", kind: "adult", target: 10, email: "ann@example.nz" }, { id: "k1", name: "Kit", kind: "kid", target: 21 }] }; H.persist();
  const ck = await ownerSignIn(app);
  assert.equal(app.mailer.outbox[0].subject, "Sign in to the owner page");
  const r = await app.call("GET", "/api/owner/households", undefined, ck);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.owners, ["tim@example.nz", "other@example.nz"]);
  assert.equal(r.json.mail, "console");
  assert.equal(r.json.households.length, 1);
  const row = r.json.households[0];
  assert.equal(row.code, A.code); assert.equal(row.people, 2); assert.equal(row.setUp, true); assert.equal(row.owner, "ann@example.nz");
  assert.ok(!JSON.stringify(r.json).includes("Kit"), "no chart data, not even names of people");
  // the same link is single use, and the cookie goes on sign-out
  const [tok] = linksIn(app.mailer.outbox[0].text);
  assert.equal((await app.call("POST", "/m/" + tok)).location, "/?link=used");
  const out = await app.call("POST", "/api/owner/logout", {}, ck);
  assert.ok(out.jar.pt_owner === "" || !out.jar.pt_owner);
  // an owner who is also a grown-up in a family gets both links in one email
  H.db.settings.family[0].email = "tim@example.nz"; H.persist();
  await app.call("POST", "/api/email", { email: "tim@example.nz" }, undefined, ipOf(98));
  const both = app.mailer.outbox[app.mailer.outbox.length - 1].text;
  assert.equal(linksIn(both).length, 2); assert.match(both, /The owner page: /); assert.match(both, /Biscuit's puppy school: /);
});

test("invites: the owner makes a family and gets a join link and a sign-in link for its grown-up; pause and resume; SMS flag", async () => {
  const app = await boot({ dataDir: tmp(), trustProxy: true, sms: async () => {} });
  const ck = await ownerSignIn(app);
  assert.equal((await app.call("POST", "/api/owner/households", { name: "Rolo", pin: "12" }, ck)).status, 400);
  assert.equal((await app.call("POST", "/api/owner/households", { name: "Rolo", pin: "123456", owner: "not-an-address" }, ck)).status, 400);
  const made = await app.call("POST", "/api/owner/households", { name: "Rolo", pin: "123456", adultPin: "4321", owner: "Bo@Example.nz" }, ck);
  assert.equal(made.status, 200);
  assert.match(made.json.links.join, /^http:\/\/127\.0\.0\.1:\d+\/j\/rolo-/);
  assert.ok(made.json.links.signin);
  assert.equal(made.json.households[0].owner, "bo@example.nz"); assert.equal(made.json.households[0].setUp, false);
  // the grown-up opens the sign-in link: in, no person yet, Settings next
  const [tok] = linksIn(made.json.links.signin);
  const go = await app.call("POST", "/m/" + tok);
  assert.equal(go.status, 302); assert.ok(go.jar.pt_session && !go.jar.pt_me);
  const st = await app.call("GET", "/api/state", undefined, jarCookie(go.jar));
  assert.equal(st.status, 200); assert.equal(st.json.settings, null); assert.equal(st.json.household.code, made.json.code);
  // a fresh sign-in link from the table while the family is not set up
  const again = await app.call("PUT", "/api/owner/households/" + made.json.id, { signin: true }, ck);
  assert.equal(again.status, 200); assert.ok(again.json.link);
  // pause: the family's phones see a 403; resume: back
  const j = await app.call("GET", "/j/" + made.json.code);
  const kid = await app.call("POST", "/api/login", { pin: "123456" }, "pt_h=" + j.jar.pt_h);
  assert.equal(kid.status, 200);
  const kidCk = jarCookie(Object.assign({}, j.jar, kid.jar));
  assert.equal((await app.call("PUT", "/api/owner/households/" + made.json.id, { suspended: true }, ck)).json.households[0].flags.suspended, true);
  const paused = await app.call("GET", "/api/state", undefined, kidCk);
  assert.equal(paused.status, 403); assert.match(paused.json.error, /paused/);
  assert.equal((await app.call("POST", "/api/email", { email: "bo@example.nz" }, undefined, ipOf(3))).status, 200);
  assert.equal(app.mailer.outbox.length, 1, "no sign-in link for a paused family");
  await app.call("PUT", "/api/owner/households/" + made.json.id, { suspended: false }, ck);
  assert.equal((await app.call("GET", "/api/state", undefined, kidCk)).status, 200);
  // SMS per family, from the owner page
  const sms = await app.call("PUT", "/api/owner/households/" + made.json.id, { sms: true }, ck);
  assert.equal(sms.json.households[0].flags.sms, true);
  assert.equal((await app.call("GET", "/api/state", undefined, kidCk)).json.sms, true);
  assert.equal((await app.call("PUT", "/api/owner/households/nope", { sms: true }, ck)).status, 404);
  assert.equal((await app.call("PUT", "/api/owner/households/h_0123456789", { sms: true }, ck)).status, 404);
});

test("delete: paused at once with an undo for seven days, then the folder goes; the grown-up who started a family can delete it in the app", async () => {
  const dir = tmp();
  let clock = Date.now();
  const app = await boot({ dataDir: dir, trustProxy: true, now: () => clock });
  const ck = await ownerSignIn(app);
  const A = app.server.households.create({ name: "Biscuit", pin: "111111", owner: "ann@example.nz" });
  const B = app.server.households.create({ name: "Rolo", pin: "222222", owner: "bo@example.nz" });
  for (const [X, who, email] of [[A, "Ann", "ann@example.nz"], [B, "Bo", "bo@example.nz"]]) {
    const H = app.server.households.get(X.id);
    H.db.settings = { puppy: { name: X.code.split("-")[0], sex: "girl" }, start: "2026-10-01", family: [{ id: "a1", name: who, kind: "adult", target: 10, email }, { id: "a2", name: "Pat", kind: "adult", target: 10, email: "pat@example.nz" }, { id: "k1", name: "Kit", kind: "kid", target: 21 }] }; H.persist();
  }
  const phone = async (X, pid) => { const l = await app.call("POST", "/api/login", { pin: X === A ? "111111" : "222222" }, "pt_h=" + X.id); const m = await app.call("POST", "/api/me", { pid }, "pt_h=" + X.id + "; pt_session=" + l.jar.pt_session); return "pt_h=" + X.id + "; pt_session=" + l.jar.pt_session + "; pt_me=" + m.jar.pt_me; };
  const annCk = await phone(A, "a1"), patCk = await phone(A, "a2"), kitCk = await phone(A, "k1");
  // state says who may delete
  assert.equal((await app.call("GET", "/api/state", undefined, annCk)).json.household.owner, true);
  assert.equal((await app.call("GET", "/api/state", undefined, patCk)).json.household.owner, false);
  assert.equal((await app.call("DELETE", "/api/household", undefined, patCk)).status, 403, "another grown-up cannot");
  assert.equal((await app.call("DELETE", "/api/household", undefined, kitCk)).status, 403);
  const del = await app.call("DELETE", "/api/household", undefined, annCk);
  assert.equal(del.status, 200); assert.equal(del.json.days, 7);
  const after1 = await app.call("GET", "/api/state", undefined, patCk);
  assert.equal(after1.status, 403); assert.match(after1.json.error, /being deleted.*7 more day/);
  assert.equal((await app.call("POST", "/api/login", { pin: "111111" }, "pt_h=" + A.id)).status, 403, "the PIN door is shut too");
  assert.equal((await app.call("GET", "/api/owner/households", undefined, ck)).json.households.find((h) => h.id === A.id).flags.wipeAt > clock, true);
  // the owner undoes it
  await app.call("PUT", "/api/owner/households/" + A.id, { wipe: false }, ck);
  assert.equal((await app.call("GET", "/api/state", undefined, patCk)).status, 200);
  // the owner deletes B from the page; six days later it is still there, eight days later it is gone
  const d = await app.call("DELETE", "/api/owner/households/" + B.id, undefined, ck);
  assert.equal(d.status, 200); assert.ok(d.json.wipeAt > clock);
  clock += 6 * 864e5;
  assert.deepEqual(app.server.households.sweep(), []);
  assert.ok(fs.existsSync(path.join(dir, "households", B.id, "store.json")));
  clock += 2 * 864e5;
  assert.equal((await app.call("GET", "/api/owner/households", undefined, ck)).status, 401, "the owner cookie itself lasts seven days");
  const ck2 = await ownerSignIn(app);
  const swept = await app.call("POST", "/api/owner/sweep", {}, ck2);
  assert.deepEqual(swept.json.removed, [B.id]);
  assert.ok(!fs.existsSync(path.join(dir, "households", B.id)), "folder removed");
  assert.ok(!JSON.parse(fs.readFileSync(path.join(dir, "households.json"), "utf8")).households.some((r) => r.id === B.id));
  assert.equal(swept.json.households.length, 1);
  assert.equal((await app.call("GET", "/j/" + B.code)).location, "/?join=unknown");
  assert.ok(fs.existsSync(path.join(dir, "households", A.id, "store.json")), "the other family untouched");
});

test("a demo family: made in one tap, seeded, signed in as the grown-up, no reminders, gone after a day; a few an hour per phone", async () => {
  const dir = tmp();
  let clock = Date.now();
  const app = await boot({ dataDir: dir, trustProxy: true, now: () => clock, noScheduler: false, sendPush: async () => {} });
  const r = await app.call("POST", "/api/demo", {}, undefined, ipOf(5));
  assert.equal(r.status, 200); assert.match(r.json.code, /^biscuit-/); assert.match(r.json.pin, /^\d{6}$/);
  assert.ok(r.jar.pt_h && r.jar.pt_session && r.jar.pt_me);
  const st = await app.call("GET", "/api/state", undefined, jarCookie(r.jar));
  assert.equal(st.status, 200);
  assert.equal(st.json.settings.puppy.name, "Biscuit"); assert.equal(st.json.settings.family.length, 2); assert.equal(st.json.me, "d1");
  assert.equal(st.json.household.demo, true); assert.equal(st.json.household.owner, true); assert.equal(st.json.sms, false);
  const H = app.server.households.get(r.jar.pt_h);
  assert.equal(H.notifier, null, "no reminder loop for a sandbox");
  assert.equal(H.rec.flags.demo, true);
  // it is a working family: a tick lands, the join link and PIN work for a second phone
  const today = st.json.today;
  assert.equal((await app.call("PUT", "/api/ticks/" + today + "_d2_am", { on: true, skill: "sit" }, jarCookie(r.jar))).status, 200);
  const j = await app.call("GET", "/j/" + r.json.code);
  assert.equal((await app.call("POST", "/api/login", { pin: r.json.pin }, "pt_h=" + j.jar.pt_h)).status, 200);
  // the owner sees it flagged; after a day the sweeper removes it
  const ck = await ownerSignIn(app);
  const list = (await app.call("GET", "/api/owner/households", undefined, ck)).json.households;
  assert.equal(list.find((h) => h.id === r.jar.pt_h).flags.demo, true);
  clock += 25 * 3600e3;
  assert.deepEqual(app.server.households.sweep(), [r.jar.pt_h]);
  assert.ok(!fs.existsSync(path.join(dir, "households", r.jar.pt_h)));
  assert.equal((await app.call("GET", "/api/state", undefined, jarCookie(r.jar))).status, 401);
  // limits
  for (let i = 0; i < 3; i++) assert.equal((await app.call("POST", "/api/demo", {}, undefined, ipOf(6))).status, 200);
  assert.equal((await app.call("POST", "/api/demo", {}, undefined, ipOf(6))).status, 429);
  // a demo made by another process is swept at boot by this one
  const b = await boot({ dataDir: dir, now: () => clock + 2 * 864e5 });
  assert.equal(b.server.households.list().length, 0, "every demo gone at boot once old enough");
});

test("the single-family server has no owner page, no demo and no delete", async () => {
  const server = createApp({ log: () => {}, noScheduler: true, dataDir: tmp(), pin: "123456", ownerEmails: "tim@example.nz" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); servers.push(server);
  const base = "http://127.0.0.1:" + server.address().port;
  assert.equal((await fetch(base + "/api/owner/households")).status, 401, "unknown API paths stop at the PIN gate");
  assert.equal((await fetch(base + "/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
  assert.deepEqual(server.households.sweep(), []);
});
