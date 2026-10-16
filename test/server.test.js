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
  const s2 = createApp({ pin: PIN, dataDir: dir2, log: () => {} });
  await new Promise((r) => s2.listen(0, "127.0.0.1", r));
  const b2 = "http://127.0.0.1:" + s2.address().port;
  const prev = base; base = b2;
  try {
    const login = await call("POST", "/api/login", { pin: PIN });
    assert.equal(login.status, 200);
    assert.match(login.cookie, /HttpOnly/);
    const cookie = login.cookie.split(";")[0];

    const st = await call("PUT", "/api/settings", { puppy: { name: "Pepper", sex: "girl", born: "2026-08-14" }, start: "2026-10-16", family: [{ id: "p1", name: "Sam", role: "recall" }, { id: "bad id!", name: "X" }] }, cookie);
    assert.equal(st.status, 200);
    assert.equal(st.json.settings.family.length, 1, "invalid member dropped");

    const t = await call("PUT", "/api/ticks/2026-10-16_p1_am", { on: true }, cookie);
    assert.ok(t.json.ticks["2026-10-16_p1_am"]);
    assert.equal((await call("PUT", "/api/ticks/nonsense", { on: true }, cookie)).status, 400);
    const l = await call("PUT", "/api/logs/2026-10-16", { bite: 4 }, cookie);
    assert.equal(l.json.logs["2026-10-16"].bite, 4);

    const rev = l.json.rev;
    const same = await call("GET", "/api/state?since=" + rev, undefined, cookie);
    assert.equal(same.json.unchanged, true);

    const saved = JSON.parse(fs.readFileSync(path.join(dir2, "store.json"), "utf8"));
    assert.equal(saved.settings.puppy.name, "Pepper");
    assert.ok(saved.ticks["2026-10-16_p1_am"]);

    // writes must be JSON (blocks simple cross-site form posts)
    const r = await fetch(b2 + "/api/ticks/2026-10-16_p1_pm", { method: "PUT", headers: { Cookie: cookie, "Content-Type": "text/plain" }, body: '{"on":true}' });
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
