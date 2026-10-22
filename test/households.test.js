// HOUSEHOLDS=1: many families on one server (docs/design/HOUSEHOLDS.md, step 1).
// Every server here runs with noScheduler so no reminder loop is left ticking.
const { test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/server.js");

const dirs = [], servers = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-h-")); dirs.push(d); return d; };
async function boot(opts) {
  const server = createApp(Object.assign({ log: () => {}, noScheduler: true, limits: { perIp: 50, global: 500 } }, opts));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (method, url, body, cookie, headers) => {
    const h = Object.assign({}, headers || {});
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (cookie) h.Cookie = cookie;
    const r = await fetch(base + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    let json = null; try { json = await r.clone().json(); } catch {}
    const cookies = r.headers.getSetCookie();
    const jar = {}; cookies.forEach((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); jar[kv.slice(0, i)] = kv.slice(i + 1); });
    return { status: r.status, json, cookies, jar, location: r.headers.get("location"), text: await r.text() };
  };
  return { server, base, call };
}
after(() => { servers.forEach((s) => s.close()); dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });

const settingsFor = (puppy, withAdult) => ({ puppy: { name: puppy, sex: "girl" }, family: [{ id: "a1", name: "Ann", kind: "adult" }, { id: "k1", name: "Kit", kind: "kid" }].slice(withAdult ? 0 : 1) });
const login = async (app, pin, hid) => { const r = await app.call("POST", "/api/login", { pin }, hid ? "pt_h=" + hid : ""); return r; };
const jarCookie = (jar) => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join("; ");

test("with HOUSEHOLDS=1 the server boots without PUPPY_PIN, writes an owner-only index, and a phone with no family gets a clear 401", async () => {
  const dir = tmp();
  const app = await boot({ households: true, dataDir: dir });
  const st = fs.statSync(path.join(dir, "households.json"));
  assert.equal(st.mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "households.json"), "utf8")).households, []);
  const r = await app.call("GET", "/api/state");
  assert.equal(r.status, 401); assert.equal(r.json.code, "household");
  assert.equal((await app.call("POST", "/api/login", { pin: "123456" })).status, 401);
  assert.equal((await app.call("GET", "/api/health")).status, 200, "health needs no family");
  assert.equal((await app.call("GET", "/")).status, 200, "the app shell needs no family");
  assert.throws(() => createApp({ households: true, dataDir: tmp(), pin: "12", noScheduler: true }), /4 to 8 digits/);
});

test("two households: own PINs, own stores, own folders, and neither can see or unlock the other", async () => {
  const dir = tmp();
  const app = await boot({ households: true, dataDir: dir, sms: async () => {} });
  const A = app.server.households.create({ name: "Biscuit", owner: "ann@example.nz", pin: "111111", adultPin: "4321" });
  const B = app.server.households.create({ name: "Rolo", pin: "222222" });
  assert.match(A.code, /^biscuit-[23456789a-z]{4}$/); assert.match(B.code, /^rolo-[23456789a-z]{4}$/);
  assert.ok(A.id !== B.id);
  const index = fs.readFileSync(path.join(dir, "households.json"), "utf8");
  assert.ok(!index.includes("111111") && !index.includes("222222") && !index.includes("4321"), "no PIN in the index file");
  assert.ok(index.includes("ann@example.nz"));

  // the join link puts a phone in a family; a wrong code says so
  const j = await app.call("GET", "/j/" + A.code);
  assert.equal(j.status, 302); assert.equal(j.location, "/"); assert.equal(j.jar.pt_h, A.id);
  assert.ok(j.cookies[0].includes("SameSite=Lax"), "a join link arrives from elsewhere, so the pointer cookie is Lax");
  assert.equal((await app.call("GET", "/j/biscuit-zzzz")).location, "/?join=unknown", "a wrong code goes back to the app with a message");

  // A's PIN opens A and not B
  const a = await login(app, "111111", A.id);
  assert.equal(a.status, 200); assert.equal(a.jar.pt_h, A.id, "login confirms the household cookie");
  assert.equal((await login(app, "111111", B.id)).status, 401);
  const b = await login(app, "222222", B.id);
  assert.equal(b.status, 200);
  const aCk = "pt_h=" + A.id + "; pt_session=" + a.jar.pt_session, bCk = "pt_h=" + B.id + "; pt_session=" + b.jar.pt_session;

  // a session cookie from A under B's household cookie is nothing
  assert.equal((await app.call("GET", "/api/state", undefined, "pt_h=" + B.id + "; pt_session=" + a.jar.pt_session)).status, 401);
  // and A's session with no household cookie at all still finds A (the session names it)
  assert.equal((await app.call("GET", "/api/state", undefined, "pt_session=" + a.jar.pt_session)).status, 200);

  // A sets up its family; B sees nothing of it
  assert.equal((await app.call("PUT", "/api/settings", settingsFor("Biscuit", true), aCk)).status, 200);
  const sb = await app.call("GET", "/api/state", undefined, bCk);
  assert.equal(sb.json.settings, null);
  assert.equal(sb.json.sms, false, "a new household cannot use the SMS gateway");
  const sa = await app.call("GET", "/api/state", undefined, aCk);
  assert.equal(sa.json.settings.puppy.name, "Biscuit");
  assert.equal(sa.json.adultPin, true);
  assert.ok(fs.existsSync(path.join(dir, "households", A.id, "store.json")));
  assert.ok(!fs.existsSync(path.join(dir, "store.json")), "nothing at the old single-family path");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "households", A.id, "store.json"), "utf8")).settings.puppy.name, "Biscuit");
  assert.ok(!fs.existsSync(path.join(dir, "households", B.id, "store.json")), "B has not written anything yet");

  // A's visitor card is found across households; B's chart is not in it
  const meA = await app.call("POST", "/api/me", { pid: "a1", adultPin: "4321" }, aCk);
  assert.equal(meA.status, 200);
  const aFull = aCk + "; pt_me=" + meA.jar.pt_me;
  const share = await app.call("POST", "/api/share", undefined, aFull);
  assert.equal(share.status, 200);
  const card = await app.call("GET", "/api/visitor/" + share.json.share.token);
  assert.equal(card.status, 200); assert.ok(card.text.includes("Biscuit") && !card.text.includes("Rolo"));
  assert.equal((await app.call("GET", "/api/visitor/" + "0".repeat(24))).status, 404);

  // the list is for an owner page: names, codes, people counts, never charts
  const list = app.server.households.list();
  assert.deepEqual(list.map((h) => [h.code, h.people]), [[A.code, 2], [B.code, 0]]);
  assert.ok(!("pin" in list[0]) && !("db" in list[0]));
});

test("a grown-up changes the family PIN: the old one stops, every phone in that family is signed out, the other family is untouched", async () => {
  const dir = tmp();
  const app = await boot({ households: true, dataDir: dir });
  const A = app.server.households.create({ name: "Biscuit", pin: "111111", adultPin: "4321" });
  const B = app.server.households.create({ name: "Rolo", pin: "222222" });
  const a = await login(app, "111111", A.id), b = await login(app, "222222", B.id);
  const aCk = "pt_h=" + A.id + "; pt_session=" + a.jar.pt_session, bCk = "pt_h=" + B.id + "; pt_session=" + b.jar.pt_session;
  await app.call("PUT", "/api/settings", settingsFor("Biscuit", true), aCk);
  const kid = await app.call("POST", "/api/me", { pid: "k1" }, aCk);
  const kidCk = aCk + "; pt_me=" + kid.jar.pt_me;
  assert.equal((await app.call("PUT", "/api/pins", { pin: "999999" }, kidCk)).status, 403, "kids cannot change PINs");
  const adult = await app.call("POST", "/api/me", { pid: "a1", adultPin: "4321" }, aCk);
  const adultCk = aCk + "; pt_me=" + adult.jar.pt_me;
  assert.equal((await app.call("PUT", "/api/pins", {}, adultCk)).status, 400);
  assert.equal((await app.call("PUT", "/api/pins", { pin: "12" }, adultCk)).status, 400);
  assert.equal((await app.call("PUT", "/api/pins", { adultPin: "abc" }, adultCk)).status, 400);

  // grown-up PIN off, then on again, without signing anyone out
  let r = await app.call("PUT", "/api/pins", { adultPin: "" }, adultCk);
  assert.equal(r.status, 200); assert.equal(r.json.signedOut, false);
  assert.equal((await app.call("GET", "/api/state", undefined, adultCk)).json.adultPin, false);
  assert.equal((await app.call("POST", "/api/me", { pid: "a1" }, aCk)).status, 200, "no grown-up PIN asked for now");
  r = await app.call("PUT", "/api/pins", { adultPin: "8765" }, adultCk);
  assert.equal((await app.call("POST", "/api/me", { pid: "a1", adultPin: "4321" }, aCk)).status, 403);
  assert.equal((await app.call("POST", "/api/me", { pid: "a1", adultPin: "8765" }, aCk)).status, 200);

  // family PIN: old sessions die, old PIN fails, new PIN works, B never notices
  r = await app.call("PUT", "/api/pins", { pin: "999999" }, adultCk);
  assert.equal(r.status, 200); assert.equal(r.json.signedOut, true);
  assert.ok(r.cookies.some((c) => c.startsWith("pt_session=;")) && r.cookies.some((c) => c.startsWith("pt_me=;")));
  assert.equal((await app.call("GET", "/api/state", undefined, adultCk)).status, 401, "the phone that changed it is out too");
  assert.equal((await app.call("GET", "/api/state", undefined, kidCk)).status, 401);
  assert.equal((await login(app, "111111", A.id)).status, 401);
  assert.equal((await login(app, "999999", A.id)).status, 200);
  assert.equal((await app.call("GET", "/api/state", undefined, bCk)).status, 200);
  assert.equal((await login(app, "222222", B.id)).status, 200);
  const index = fs.readFileSync(path.join(dir, "households.json"), "utf8");
  assert.ok(!index.includes("999999") && !index.includes("8765"));

  // the single-family server keeps its PINs in the environment
  const single = await boot({ pin: "482913", dataDir: tmp() });
  const s = await single.call("POST", "/api/login", { pin: "482913" });
  await single.call("PUT", "/api/settings", settingsFor("Solo", false), "pt_session=" + s.jar.pt_session);
  const me = await single.call("POST", "/api/me", { pid: "k1" }, "pt_session=" + s.jar.pt_session);
  assert.equal((await single.call("PUT", "/api/pins", { pin: "999999" }, "pt_session=" + s.jar.pt_session + "; pt_me=" + me.jar.pt_me)).status, 409);
});

test("one family's wrong PINs lock that family's door, not the server, and not from a single address only", async () => {
  const app = await boot({ households: true, dataDir: tmp(), trustProxy: true, limits: { perIp: 50, global: 500, perHousehold: 2 } });
  const A = app.server.households.create({ name: "Biscuit", pin: "111111" });
  const B = app.server.households.create({ name: "Rolo", pin: "222222" });
  const from = (ip) => ({ "cf-connecting-ip": ip });
  assert.equal((await app.call("POST", "/api/login", { pin: "000000" }, "pt_h=" + B.id, from("203.0.113.1"))).status, 401);
  assert.equal((await app.call("POST", "/api/login", { pin: "000000" }, "pt_h=" + B.id, from("203.0.113.2"))).status, 401);
  const locked = await app.call("POST", "/api/login", { pin: "222222" }, "pt_h=" + B.id, from("203.0.113.3"));
  assert.equal(locked.status, 429, "two wrong tries from two addresses lock the household");
  assert.ok(locked.json.retryAfter > 0);
  assert.equal((await app.call("POST", "/api/login", { pin: "111111" }, "pt_h=" + A.id, from("203.0.113.4"))).status, 200, "the other family is not locked");
});

test("a single-family server switched to HOUSEHOLDS=1 carries its family over and its phones stay signed in", async () => {
  const dir = tmp();
  // the family as it is today: one PIN from the environment, store.json and photo.jpg at the top of DATA_DIR
  const single = await boot({ pin: "482913", adultPin: "6227", dataDir: dir });
  const s = await single.call("POST", "/api/login", { pin: "482913" });
  const ck = "pt_session=" + s.jar.pt_session;
  assert.equal((await single.call("PUT", "/api/settings", settingsFor("Biscuit", true), ck)).status, 200);
  const me = await single.call("POST", "/api/me", { pid: "a1", adultPin: "6227" }, ck);
  const full = ck + "; pt_me=" + me.jar.pt_me;
  const today = (await single.call("GET", "/api/state", undefined, full)).json.today;
  assert.equal((await single.call("PUT", "/api/ticks/" + today + "_a1_am", { on: true, skill: "sit" }, full)).status, 200);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
  assert.equal((await single.call("PUT", "/api/photo", { data: "data:image/jpeg;base64," + jpeg.toString("base64") }, full)).status, 200);
  single.server.close();

  // the switch: same DATA_DIR, HOUSEHOLDS=1, the PINs given once more
  const multi = await boot({ households: true, pin: "482913", adultPin: "6227", dataDir: dir, sms: async () => {} });
  assert.ok(!fs.existsSync(path.join(dir, "store.json")) && !fs.existsSync(path.join(dir, "photo.jpg")), "moved, not copied");
  assert.ok(fs.existsSync(path.join(dir, "households", "default", "store.json")));
  assert.ok(fs.existsSync(path.join(dir, "households", "default", "photo.jpg")));
  const [rec] = JSON.parse(fs.readFileSync(path.join(dir, "households.json"), "utf8")).households;
  assert.equal(rec.id, "default"); assert.match(rec.code, /^biscuit-/); assert.equal(rec.name, "Biscuit");
  assert.ok(rec.pin.startsWith("scrypt$") && !rec.pin.includes("482913"));
  assert.equal(rec.flags.sms, true, "the family that was here keeps its texts");

  // the phone from before: no household cookie, the old session and identity cookies
  const st = await multi.call("GET", "/api/state", undefined, full);
  assert.equal(st.status, 200);
  assert.equal(st.json.settings.puppy.name, "Biscuit"); assert.equal(st.json.me, "a1");
  assert.ok(st.json.ticks[today + "_a1_am"], "the chart came with it");
  assert.equal(st.json.photo, true); assert.equal(st.json.sms, true);
  assert.equal((await multi.call("GET", "/api/photo", undefined, full)).status, 200);
  // and a fresh login with the same PIN, no cookies at all, lands in the carried-over family
  const again = await multi.call("POST", "/api/login", { pin: "482913" });
  assert.equal(again.status, 200); assert.equal(again.jar.pt_h, "default");
  // a second family on the same server starts empty and cannot use the gateway
  const B = multi.server.households.create({ name: "Rolo", pin: "222222" });
  const b = await login(multi, "222222", B.id);
  const sb = await multi.call("GET", "/api/state", undefined, "pt_h=" + B.id + "; pt_session=" + b.jar.pt_session);
  assert.equal(sb.json.settings, null); assert.equal(sb.json.sms, false);
});

test("switching with a store present but no PUPPY_PIN refuses to start rather than strand the family", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "store.json"), JSON.stringify({ rev: 3, settings: settingsFor("Biscuit", false) }));
  assert.throws(() => createApp({ households: true, dataDir: dir, noScheduler: true, log: () => {} }), /PUPPY_PIN/);
  assert.ok(fs.existsSync(path.join(dir, "store.json")), "nothing moved");
});

test("a household added to the index by another process is found on the next miss; a paused household answers 403", async () => {
  const dir = tmp();
  const one = await boot({ households: true, dataDir: dir });
  const two = await boot({ households: true, dataDir: dir });
  const A = one.server.households.create({ name: "Biscuit", pin: "111111" });
  await new Promise((r) => setTimeout(r, 20)); // a distinct mtime
  assert.equal((await two.call("GET", "/j/" + A.code)).status, 302, "the second process picks it up from the file");
  assert.equal((await login(two, "111111", A.id)).status, 200);
  const H = one.server.households.get(A.id);
  H.rec.flags.suspended = true;
  const r = await login(one, "111111", A.id);
  assert.equal(r.status, 403); assert.match(r.json.error, /paused/);
  assert.equal((await one.call("POST", "/api/logout")).status, 200, "logging out still works");
});

test("a PIN change made after the index was re-read from disk is saved, not lost to a stale record", async () => {
  const dir = tmp();
  const one = await boot({ households: true, dataDir: dir });
  const A = one.server.households.create({ name: "Biscuit", pin: "111111" });
  const two = await boot({ households: true, dataDir: dir }); // opens A from the file at boot
  await new Promise((r) => setTimeout(r, 20));
  const B = one.server.households.create({ name: "Rolo", pin: "222222" }); // the file changes under two
  assert.equal((await two.call("GET", "/j/" + B.code)).status, 302, "two re-reads the index and finds B");
  const a = await login(two, "111111", A.id);
  const aCk = "pt_h=" + A.id + "; pt_session=" + a.jar.pt_session;
  await two.call("PUT", "/api/settings", settingsFor("Biscuit", true), aCk);
  const me = await two.call("POST", "/api/me", { pid: "a1" }, aCk);
  const r = await two.call("PUT", "/api/pins", { pin: "333333" }, aCk + "; pt_me=" + me.jar.pt_me);
  assert.equal(r.status, 200);
  assert.equal((await login(two, "333333", A.id)).status, 200);
  const three = await boot({ households: true, dataDir: dir }); // what is on disk is what counts
  assert.equal((await login(three, "111111", A.id)).status, 401);
  assert.equal((await login(three, "333333", A.id)).status, 200);
  assert.equal((await login(three, "222222", B.id)).status, 200, "B survived the save too");
});

test("before the PIN a phone can ask which family it is in; health says the server hosts households; an unknown join code bounces back to the app and counts as a failed try", async () => {
  const app = await boot({ households: true, dataDir: tmp(), limits: { perIp: 2, global: 500 } });
  const A = app.server.households.create({ name: "Biscuit", pin: "111111" });
  assert.equal((await app.call("GET", "/api/health")).json.households, true);
  assert.deepEqual((await app.call("GET", "/api/household")).json, { households: true, signup: true, code: null, name: "" });
  assert.deepEqual((await app.call("GET", "/api/household", undefined, "pt_h=" + A.id)).json, { households: true, signup: true, code: A.code, name: "Biscuit" });
  const a = await login(app, "111111", A.id);
  const st = await app.call("GET", "/api/state", undefined, "pt_h=" + A.id + "; pt_session=" + a.jar.pt_session);
  assert.deepEqual(st.json.household, { code: A.code, name: "Biscuit" });
  let r = await app.call("GET", "/j/biscuit-zzzz");
  assert.equal(r.status, 302); assert.equal(r.location, "/?join=unknown");
  r = await app.call("GET", "/j/biscuit-yyyy");
  assert.equal((await app.call("GET", "/j/" + A.code)).status, 429, "two bad guesses lock the address for join links too");

  const single = await boot({ pin: "482913", dataDir: tmp() });
  assert.equal((await single.call("GET", "/api/health")).json.households, false);
  assert.deepEqual((await single.call("GET", "/api/household")).json, { households: false, signup: false, code: null, name: "" });
  const s = await single.call("POST", "/api/login", { pin: "482913" });
  assert.equal((await single.call("GET", "/api/state", undefined, "pt_session=" + s.jar.pt_session)).json.household, null);
});
