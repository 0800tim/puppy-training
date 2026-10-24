"use strict";
// Lockouts survive a restart: the failure counters are written to DATA_DIR/lockouts.json and read back on boot.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/server.js");

const PIN = "482913";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pt-lock-"));
async function boot(opts) {
  const server = createApp(Object.assign({ log: () => {}, noScheduler: true }, opts));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const login = (pin, headers) => fetch(base + "/api/login", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify({ pin }) });
  return { server, base, login, stop: () => new Promise((r) => server.close(r)) };
}

test("a lockout outlives a restart and ends on time, and a successful login clears the record", async () => {
  const dir = tmp(); let skew = 0; const now = () => 1_800_000_000_000 + skew;
  const opts = { pin: PIN, dataDir: dir, now, limits: { perIp: 2, perIpWindowMs: 60e3, global: 100, globalWindowMs: 60e3 } };
  let app = await boot(opts);
  try {
    for (let i = 0; i < 2; i++) assert.equal((await app.login("000000")).status, 401);
    assert.equal((await app.login(PIN)).status, 429, "locked before the restart");
    const file = path.join(dir, "lockouts.json");
    assert.equal(fs.statSync(file).mode & 0o777, 0o600, "addresses are in it, so owner-only");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(saved.v, 1);
    assert.deepEqual(saved.ip["127.0.0.1"], [now(), now()]);
    assert.equal(saved.global.length, 2);
  } finally { await app.stop(); }

  app = await boot(opts); // the same folder, the same clock: a deploy or a crash
  try {
    const r = await app.login(PIN);
    assert.equal(r.status, 429, "still locked after the restart");
    assert.ok((await r.json()).retryAfter > 0 && (await app.login(PIN)).status === 429);
    skew = 61e3;
    const ok = await app.login(PIN);
    assert.equal(ok.status, 200, "the window has passed");
    const after = JSON.parse(fs.readFileSync(path.join(dir, "lockouts.json"), "utf8"));
    assert.deepEqual(after.ip, {}, "the successful login cleared the address and the file follows");
    assert.deepEqual(after.global, [], "expired times are pruned on write");
  } finally { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an unreadable or hostile lockout file is ignored, and future times do not lock anyone", async () => {
  const dir = tmp(); const file = path.join(dir, "lockouts.json");
  fs.writeFileSync(file, "{not json");
  const seen = [];
  let app = await boot({ pin: PIN, dataDir: dir, log: (...a) => seen.push(a.join(" ")), limits: { perIp: 2, global: 100 } });
  try {
    assert.equal((await app.login(PIN)).status, 200, "boots and logs in with a corrupt file");
    assert.ok(seen.some((l) => /lockouts\.json unreadable/.test(l)));
  } finally { await app.stop(); }
  // a file written when the clock was ahead, or crafted: times in the future, non-numbers, wrong version
  fs.writeFileSync(file, JSON.stringify({ v: 1, ip: { "127.0.0.1": [Date.now() + 3600e3, "x", null, Date.now() + 10e3] }, global: "nope", household: 5 }));
  app = await boot({ pin: PIN, dataDir: dir, limits: { perIp: 2, global: 100 } });
  try { assert.equal((await app.login(PIN)).status, 200, "future and junk entries count for nothing"); } finally { await app.stop(); }
  fs.writeFileSync(file, JSON.stringify({ v: 9, ip: { "127.0.0.1": [Date.now(), Date.now()] } }));
  app = await boot({ pin: PIN, dataDir: dir, limits: { perIp: 2, global: 100 } });
  try { assert.equal((await app.login(PIN)).status, 200, "an unknown version is ignored"); } finally { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("households: the per-family counter survives too, from many addresses", async () => {
  const dir = tmp(); let skew = 0; const now = () => 1_800_000_000_000 + skew;
  const opts = { dataDir: dir, now, households: true, trustProxy: true, limits: { perIp: 50, perIpWindowMs: 60e3, perHousehold: 3, global: 500 } };
  let app = await boot(opts);
  const A = app.server.households.create({ name: "Biscuit", pin: "111111" });
  const from = (ip) => ({ "cf-connecting-ip": ip, Cookie: "pt_h=" + A.id });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await app.login("000000", from("203.0.113." + i))).status, 401);
    assert.equal((await app.login("111111", from("203.0.113.50"))).status, 429, "the family is locked for every address");
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "lockouts.json"), "utf8"));
    assert.deepEqual(Object.keys(saved.household), [A.id]);
    assert.equal(saved.household[A.id].length, 3);
    assert.equal(Object.keys(saved.ip).length, 3, "one entry per address, none of them locked on its own");
  } finally { await app.stop(); }
  app = await boot(opts);
  try {
    assert.equal((await app.login("111111", from("203.0.113.51"))).status, 429, "still locked after the restart");
    skew = 61e3;
    assert.equal((await app.login("111111", from("203.0.113.51"))).status, 200);
  } finally { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
