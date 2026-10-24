// HOUSEHOLDS=1 step 3 (docs/design/HOUSEHOLDS.md): sign-up and sign-in by email. The console mailer keeps an outbox,
// so every test reads the link straight out of the "email". No server here sends anything anywhere.
const { test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/server.js");
const { makeMailer, cleanEmail, parseFrom } = require("../server/mail.js");

const dirs = [], servers = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-e-")); dirs.push(d); return d; };
async function boot(opts) {
  const mailer = makeMailer({ MAIL: "console", MAIL_FROM: "Puppy School HQ <puppy@example.nz>" }, { log: () => {} });
  const server = createApp(Object.assign({ log: () => {}, noScheduler: true, households: true, mailer, limits: { perIp: 50, global: 500 } }, opts));
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
    return { status: r.status, json, cookies, jar, location: r.headers.get("location"), text: await r.text(), headers: r.headers };
  };
  return { server, base, call, mailer };
}
after(() => { servers.forEach((s) => s.close()); dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });

const jarCookie = (jar) => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join("; ");
const linksIn = (text) => [...text.matchAll(/https?:\/\/[^\s]+\/m\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
const ipOf = (n) => ({ "cf-connecting-ip": "203.0.113." + n });

test("sign-up: the link makes the family, signs the grown-up in, prefills Settings, and works once", async () => {
  const dir = tmp();
  const app = await boot({ dataDir: dir, trustProxy: true, appUrl: "https://puppy.example.nz/" });
  const r = await app.call("POST", "/api/signup", { email: "Ann@Example.NZ", puppy: "Pepper", name: "Ann", pin: "246810" });
  assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true, sent: true });
  assert.equal(app.mailer.outbox.length, 1);
  const mail = app.mailer.outbox[0];
  assert.equal(mail.to, "ann@example.nz", "address lower-cased");
  assert.equal(mail.subject, "Start Pepper's puppy school");
  assert.ok(mail.text.startsWith("Hi Ann,"));
  assert.ok(mail.text.includes("https://puppy.example.nz/m/"), "links use APP_URL, with no trailing slash doubled");
  const [tok] = linksIn(mail.text); assert.ok(tok);
  assert.ok(!mail.text.includes("246810"), "the PIN is never in the email");
  const idx = () => JSON.parse(fs.readFileSync(path.join(dir, "households.json"), "utf8"));
  assert.equal(idx().pending.length, 1); assert.equal(idx().households.length, 0, "nothing is made until the link is opened");
  assert.ok(!JSON.stringify(idx()).includes("246810"), "the pending PIN is hashed");

  // a mail scanner fetching the link gets a page, not a sign-in
  const page = await app.call("GET", "/m/" + tok);
  assert.equal(page.status, 200); assert.match(page.text, /Opening Pepper&#39;s puppy school/); assert.match(page.text, /<form method="post" action="\/m\//);
  assert.match(page.headers.get("content-security-policy"), /form-action 'self'/);
  assert.equal(page.cookies.length, 0);
  assert.equal(idx().households.length, 0);

  // the person taps Continue (or the page posts itself)
  const go = await app.call("POST", "/m/" + tok);
  assert.equal(go.status, 302); assert.equal(go.location, "/#today");
  assert.ok(go.jar.pt_h && go.jar.pt_session && !go.jar.pt_me, "family and session set, no person yet");
  assert.equal(idx().households.length, 1); assert.equal(idx().pending.length, 0);
  assert.equal(idx().households[0].owner, "ann@example.nz"); assert.equal(idx().households[0].name, "Pepper");
  const st = await app.call("GET", "/api/state", undefined, jarCookie(go.jar));
  assert.equal(st.status, 200); assert.equal(st.json.settings, null);
  assert.deepEqual(st.json.starter, { puppy: "Pepper", name: "Ann", email: "ann@example.nz" });
  assert.equal(st.json.household.name, "Pepper");

  // once only
  const again = await app.call("POST", "/m/" + tok);
  assert.equal(again.status, 302); assert.equal(again.location, "/?link=used");
  assert.match((await app.call("GET", "/m/" + tok)).text, /stopped working/);

  // first Settings keeps the grown-up's email; the starter goes
  const saved = await app.call("PUT", "/api/settings", { puppy: { name: "Pepper", sex: "girl" }, family: [{ id: "p1", name: "Ann", kind: "adult", email: "ann@example.nz" }, { id: "p2", name: "Kit", kind: "kid", email: "kit@example.nz" }] }, jarCookie(go.jar));
  assert.equal(saved.status, 200);
  assert.equal(saved.json.settings.family[0].email, "ann@example.nz");
  assert.equal(saved.json.settings.family[1].email, "", "kids never carry an email");
  assert.equal(saved.json.starter, null);

  // the kids' door: the join link and the PIN chosen on the form
  const code = idx().households[0].code;
  const j = await app.call("GET", "/j/" + code);
  assert.equal(j.status, 302);
  const login = await app.call("POST", "/api/login", { pin: "246810" }, "pt_h=" + j.jar.pt_h);
  assert.equal(login.status, 200);
  assert.equal((await app.call("POST", "/api/login", { pin: "111111" }, "pt_h=" + j.jar.pt_h)).status, 401);

  // a kid's phone sees no emails
  const kid = await app.call("POST", "/api/me", { pid: "p2" }, jarCookie(login.jar));
  const kidState = await app.call("GET", "/api/state", undefined, jarCookie(Object.assign({}, login.jar, kid.jar)));
  assert.ok(!("email" in kidState.json.settings.family[0]));
});

test("sign-in by email: a grown-up with an email on file gets in on a new phone without the grown-up PIN; unknown addresses get the same reply and no mail", async () => {
  const dir = tmp();
  let clock = Date.now();
  const app = await boot({ dataDir: dir, now: () => clock });
  const made = app.server.households.create({ name: "Rolo", pin: "333333", adultPin: "9876" });
  const H = app.server.households.get(made.id);
  H.db.settings = { puppy: { name: "Rolo", sex: "boy" }, start: "2026-10-01", family: [{ id: "a1", name: "Bo", kind: "adult", target: 10, email: "bo@example.nz" }, { id: "k1", name: "Kit", kind: "kid", target: 21 }] }; H.persist();

  const nope = await app.call("POST", "/api/email", { email: "nobody@example.nz" });
  assert.equal(nope.status, 200); assert.deepEqual(nope.json, { ok: true, sent: true }); assert.equal(app.mailer.outbox.length, 0, "nothing sent, same answer");
  assert.equal((await app.call("POST", "/api/email", { email: "not an address" })).status, 400);

  const r = await app.call("POST", "/api/email", { email: "bo@example.nz" });
  assert.equal(r.status, 200); assert.equal(app.mailer.outbox.length, 1);
  const mail = app.mailer.outbox[0];
  assert.equal(mail.subject, "Sign in to Rolo's puppy school");
  assert.ok(mail.text.includes("http://127.0.0.1:" + app.server.address().port + "/m/"), "no APP_URL: the link uses the request host");
  const [tok] = linksIn(mail.text);
  const go = await app.call("POST", "/m/" + tok);
  assert.equal(go.status, 302); assert.equal(go.location, "/#today");
  assert.ok(go.jar.pt_h === made.id && go.jar.pt_session && go.jar.pt_me, "family, session and person all set");
  const st = await app.call("GET", "/api/state", undefined, jarCookie(go.jar));
  assert.equal(st.status, 200); assert.equal(st.json.me, "a1"); assert.equal(st.json.household.code, made.code);
  assert.equal((await app.call("POST", "/m/" + tok)).location, "/?link=used");

  // expiry: a link older than fifteen minutes is refused
  await app.call("POST", "/api/email", { email: "bo@example.nz" }, undefined, ipOf(2));
  const [tok2] = linksIn(app.mailer.outbox[1].text);
  clock += 16 * 60e3;
  assert.equal((await app.call("POST", "/m/" + tok2)).location, "/?link=expired");
  // forged or mangled tokens
  assert.equal((await app.call("POST", "/m/" + tok2.slice(0, -3) + "abc")).location, "/?link=bad");
  assert.equal((await app.call("GET", "/m/" + tok2.slice(0, -3) + "abc")).status, 200);
});

test("limits: three link requests an hour per phone and per address, counted the same for known and unknown addresses", async () => {
  const app = await boot({ dataDir: tmp(), trustProxy: true });
  for (let i = 0; i < 3; i++) assert.equal((await app.call("POST", "/api/email", { email: "x" + i + "@example.nz" }, undefined, ipOf(1))).status, 200);
  const r = await app.call("POST", "/api/email", { email: "x9@example.nz" }, undefined, ipOf(1));
  assert.equal(r.status, 429); assert.match(r.json.error, /wait an hour/);
  for (let i = 0; i < 3; i++) assert.equal((await app.call("POST", "/api/signup", { email: "same@example.nz", puppy: "P", name: "N", pin: "1234" }, undefined, ipOf(10 + i))).status, 200);
  assert.equal((await app.call("POST", "/api/signup", { email: "same@example.nz", puppy: "P", name: "N", pin: "1234" }, undefined, ipOf(20))).status, 429, "one address cannot be flooded from many phones");
  assert.equal(app.mailer.outbox.length, 3, "three sign-up emails, none for the unknown sign-ins");
  const bad = await app.call("POST", "/api/signup", { email: "ok@example.nz", puppy: "P", name: "N", pin: "12" }, undefined, ipOf(30));
  assert.equal(bad.status, 400); assert.match(bad.json.error, /4 to 8 digits/);
  assert.equal((await app.call("POST", "/api/signup", { email: "ok@example.nz", puppy: "", name: "N", pin: "1234" }, undefined, ipOf(31))).status, 400);
});

test("a pending sign-up survives a restart and another process can finish it; an owner not yet set up can sign back in by email", async () => {
  const dir = tmp();
  const a = await boot({ dataDir: dir });
  await a.call("POST", "/api/signup", { email: "ann@example.nz", puppy: "Pepper", name: "Ann", pin: "246810" });
  const [tok] = linksIn(a.mailer.outbox[0].text);
  const b = await boot({ dataDir: dir }); // same DATA_DIR, same secret.key, fresh process
  const go = await b.call("POST", "/m/" + tok);
  assert.equal(go.status, 302); assert.equal(go.location, "/#today");
  assert.equal(b.server.households.list().length, 1);
  // Ann closes the app before saving Settings, then asks for a link on another phone
  const r = await b.call("POST", "/api/email", { email: "ann@example.nz" }, undefined, ipOf(5));
  assert.equal(r.status, 200); assert.equal(b.mailer.outbox.length, 1);
  const [tok2] = linksIn(b.mailer.outbox[0].text);
  const go2 = await b.call("POST", "/m/" + tok2);
  assert.equal(go2.status, 302); assert.ok(go2.jar.pt_session && !go2.jar.pt_me, "signed in, no person to be yet");
  const st = await b.call("GET", "/api/state", undefined, jarCookie(go2.jar));
  assert.equal(st.status, 200); assert.equal(st.json.starter.name, "Ann");
  // the first server, which never saw the link being spent, refuses it too after re-reading the index
  assert.equal((await a.call("POST", "/m/" + tok)).location, "/?link=used");
  assert.equal((await a.call("POST", "/m/" + tok2)).location, "/?link=used");
});

test("sign-up email mentions the families the address already runs; a suspended family gets no link", async () => {
  const app = await boot({ dataDir: tmp() });
  const made = app.server.households.create({ name: "Rolo", pin: "333333", owner: "bo@example.nz" });
  const H = app.server.households.get(made.id);
  H.db.settings = { puppy: { name: "Rolo", sex: "boy" }, start: "2026-10-01", family: [{ id: "a1", name: "Bo", kind: "adult", target: 10, email: "bo@example.nz" }] }; H.persist();
  await app.call("POST", "/api/signup", { email: "bo@example.nz", puppy: "Second", name: "Bo", pin: "1234" });
  const text = app.mailer.outbox[0].text;
  assert.match(text, /You already have a puppy school here/); assert.match(text, /Rolo's: http/);
  assert.equal(linksIn(text).length, 2);
  H.rec.flags.suspended = true;
  await app.call("POST", "/api/email", { email: "bo@example.nz" }, undefined, ipOf(7));
  assert.equal(app.mailer.outbox.length, 1, "no sign-in link for a paused family");
});

test("a sign-up with a missing field or a bad PIN spends none of the hour's links; names are one line in the email and the index", async () => {
  const dir = tmp();
  const app = await boot({ dataDir: dir, trustProxy: true });
  const ip = { "cf-connecting-ip": "203.0.113.77" };
  for (let i = 0; i < 4; i++) assert.equal((await app.call("POST", "/api/signup", { email: "sue@example.nz", puppy: "Pepper", name: "", pin: "123456" }, undefined, ip)).status, 400);
  for (let i = 0; i < 4; i++) assert.equal((await app.call("POST", "/api/signup", { email: "sue@example.nz", puppy: "Pepper", name: "Sue", pin: "12" }, undefined, ip)).status, 400);
  assert.equal(app.mailer.outbox.length, 0);
  const r = await app.call("POST", "/api/signup", { email: "sue@example.nz", puppy: "Pep\nper\r\nSubject: x", name: "Sue\u0000", pin: "123456" }, undefined, ip);
  assert.equal(r.status, 200, "the typos did not lock the address");
  const mail = app.mailer.outbox[0];
  assert.equal(mail.subject, "Start Pep per Subject: x's puppy school");
  assert.match(mail.text, /^Hi Sue,\n/);
  const [tok] = [...mail.text.matchAll(/\/m\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
  const go = await app.call("POST", "/m/" + tok);
  assert.equal(go.status, 302);
  assert.equal(app.server.households.get(go.jar.pt_h).rec.name, "Pep per Subject: x");
});

test("the single-family server has none of this", async () => {
  const dir = tmp();
  const server = createApp({ log: () => {}, noScheduler: true, dataDir: dir, pin: "123456" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); servers.push(server);
  const base = "http://127.0.0.1:" + server.address().port;
  const r = await fetch(base + "/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.nz", puppy: "P", name: "N", pin: "1234" }) });
  assert.equal(r.status, 409);
  assert.equal((await fetch(base + "/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 409);
  assert.equal((await fetch(base + "/m/" + "a".repeat(30) + "." + "b".repeat(30), { redirect: "manual" })).status, 404);
  assert.equal(server.mailer, null);
  const hh = await (await fetch(base + "/api/household")).json();
  assert.equal(hh.signup, false);
});

test("mail.js: console is the default; sendgrid builds the v3 request with tracking off and reports failures without throwing", async () => {
  const c = makeMailer({}, { log: () => {} });
  assert.equal(c.kind, "console"); assert.equal(c.from.name, "Puppy School HQ");
  assert.throws(() => makeMailer({ MAIL: "sendgrid" }), /SENDGRID_API_KEY/);
  assert.throws(() => makeMailer({ MAIL: "sendgrid", SENDGRID_API_KEY: "SG.x" }), /MAIL_FROM/);
  assert.throws(() => makeMailer({ MAIL: "pigeon" }), /console or sendgrid/);
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, init }); return { status: calls.length === 1 ? 202 : 401, text: async () => '{"errors":[{"message":"bad key"}]}' }; };
  const sg = makeMailer({ MAIL: "sendgrid", SENDGRID_API_KEY: "SG.secret", MAIL_FROM: "Puppy School HQ <puppy@example.nz>" }, { fetch: fake, log: () => {} });
  assert.equal(await sg.send({ to: "ann@example.nz", subject: "Hi", text: "Link: https://x/m/abc" }), true);
  assert.equal(calls[0].url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(calls[0].init.headers.Authorization, "Bearer SG.secret");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.from, { email: "puppy@example.nz", name: "Puppy School HQ" });
  assert.deepEqual(body.personalizations, [{ to: [{ email: "ann@example.nz" }] }]);
  assert.equal(body.content[0].type, "text/plain");
  assert.equal(body.tracking_settings.click_tracking.enable, false, "click tracking rewrites the link and breaks it");
  assert.equal(await sg.send({ to: "ann@example.nz", subject: "Hi", text: "x" }), false, "a 401 is reported, not thrown");
  assert.deepEqual(parseFrom("puppy@example.nz"), { email: "puppy@example.nz", name: "" });
  assert.deepEqual(parseFrom('"Puppy School" <puppy@example.nz>'), { email: "puppy@example.nz", name: "Puppy School" });
  assert.equal(cleanEmail("  Ann@Example.NZ "), "ann@example.nz");
  assert.equal(cleanEmail("nope"), ""); assert.equal(cleanEmail("a@b"), "");
});
