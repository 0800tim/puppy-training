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

    const st = await call("PUT", "/api/settings", { puppy: { name: "Pepper", sex: "girl", born: "2026-08-14" }, start: "2026-10-16", family: [{ id: "p1", name: "Sam", kind: "kid", target: 99 }, { id: "p2", name: "Mum", kind: "adult" }, { id: "bad id!", name: "X" }] }, cookie);
    assert.equal(st.status, 200);
    assert.equal(st.json.settings.family.length, 2, "invalid member dropped");
    assert.equal(st.json.settings.family[0].target, 21, "silly target falls back to the kid default");
    assert.equal(st.json.settings.family[1].target, 10, "adult default target");

    const t = await call("PUT", "/api/ticks/2026-10-16_p1_am", { on: true, by: "p2", skill: "sit" }, cookie);
    assert.ok(t.json.ticks["2026-10-16_p1_am"]);
    assert.equal(t.json.ticks["2026-10-16_p1_am"].by, "p2", "who logged it is kept");
    assert.equal(t.json.ticks["2026-10-16_p1_am"].skill, "sit");
    assert.equal((await call("PUT", "/api/ticks/nonsense", { on: true }, cookie)).status, 400);
    const kidBackfill = await call("PUT", "/api/ticks/2020-01-01_p1_am", { on: true, by: "p1" }, cookie);
    assert.equal(kidBackfill.status, 403, "kids can't log past days");
    assert.equal((await call("PUT", "/api/ticks/2020-01-01_p1_am", { on: true, by: "p2" }, cookie)).status, 200, "grown-ups can");
    const l = await call("PUT", "/api/logs/2026-10-16", { bite: 4, by: "p1" }, cookie);
    assert.equal(l.json.logs["2026-10-16"].bite, 4);
    assert.equal(l.json.logs["2026-10-16"].by, "p1");

    // mastery needs a witness who isn't you; one vote per person
    assert.equal((await call("PUT", "/api/mastery/sit", { by: "p1", witness: "p1" }, cookie)).status, 400);
    assert.equal((await call("PUT", "/api/mastery/nope", { by: "p1", witness: "p2" }, cookie)).status, 400);
    const mv = await call("PUT", "/api/mastery/sit", { by: "p1", witness: "p2" }, cookie);
    assert.equal(mv.json.mastery.sit.done.length, 1);
    await call("PUT", "/api/mastery/sit", { by: "p1", witness: "p2" }, cookie);
    const mv2 = await call("PUT", "/api/mastery/sit", { by: "p2", witness: "p1" }, cookie);
    assert.equal(mv2.json.mastery.sit.done.length, 2, "repeat vote by the same person doesn't double up");
    const un = await call("PUT", "/api/mastery/sit", { by: "p2", on: false }, cookie);
    assert.equal(un.json.mastery.sit.done.length, 1, "a vote can be taken back");

    // toilet log, with undo
    assert.equal((await call("POST", "/api/toilet", { kind: "swim", by: "p1" }, cookie)).status, 400);
    const tl = await call("POST", "/api/toilet", { kind: "wee", before: "woke", by: "p1" }, cookie);
    assert.equal(tl.json.toilet.length, 1);
    assert.equal(tl.json.toilet[0].before, "woke");
    const del = await call("DELETE", "/api/toilet/" + tl.json.toilet[0].id, undefined, cookie);
    assert.equal(del.json.toilet[0].void, true);

    // puppy photo: JPEG data URL in, image out
    assert.equal((await call("GET", "/api/photo", undefined, cookie)).status, 404);
    assert.equal((await call("PUT", "/api/photo", { data: "data:image/png;base64,AAAA" }, cookie)).status, 400);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);
    const ph = await call("PUT", "/api/photo", { data: "data:image/jpeg;base64," + jpeg.toString("base64") }, cookie);
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
