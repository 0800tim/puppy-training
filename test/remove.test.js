"use strict";
/* "Remove this person and their history" (docs/design/REMOVE-PERSON.md): void with a stamp, 15-minute undo, then purge the id. */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/server.js");
const C = require("../public/content.js");
const R = require("../public/rewards.js");

const PIN = "482913";
const FAMILY = [{ id: "kim", name: "Kim", kind: "kid", buddy: "dad" }, { id: "bo", name: "Bo", kind: "kid" }, { id: "mum", name: "Mum", kind: "adult" }, { id: "dad", name: "Dad", kind: "adult" }];
async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-"));
  let skew = 0;
  const server = createApp({ pin: PIN, dataDir: dir, log: () => {}, noScheduler: true, limits: { perIp: 50, global: 500 }, now: () => Date.now() + skew });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (method, url, body, cookie) => {
    const headers = {}; if (body !== undefined) headers["Content-Type"] = "application/json"; if (cookie) headers.Cookie = cookie;
    const r = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, json: j, cookie: r.headers.get("set-cookie") };
  };
  const session = (await call("POST", "/api/login", { pin: PIN })).cookie.split(";")[0];
  await call("PUT", "/api/settings", { puppy: { name: "Pip", sex: "girl", born: "2026-08-14" }, start: "2026-10-01", family: FAMILY }, session);
  const as = async (pid) => session + "; " + (await call("POST", "/api/me", { pid }, session)).cookie.split(";")[0];
  const store = () => JSON.parse(fs.readFileSync(path.join(dir, "store.json"), "utf8"));
  return { call, session, as, store, skew: (ms) => { skew = ms; }, stop: () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const sub = (n) => ({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/" + n, keys: { p256dh: "x", auth: "y" } });

/* Dad logs one of everything, then Mum removes him. */
async function fillIn(app) {
  const kim = await app.as("kim"), mum = await app.as("mum"), dad = await app.as("dad");
  const today = (await app.call("GET", "/api/state", undefined, mum)).json.today, yday = R.addDays(today, -1);
  const tick = (key, who) => app.call("PUT", "/api/ticks/" + key, { on: true, skill: "name" }, who);
  for (const p of ["kim", "bo", "mum"]) assert.equal((await tick(yday + "_" + p + "_am", mum)).status, 200, "yesterday, everyone but Dad");
  for (const p of ["kim", "bo", "mum", "dad"]) assert.equal((await tick(today + "_" + p + "_am", mum)).status, 200, "today, everyone");
  assert.equal((await tick(today + "_kim_pm", dad)).status, 200, "Dad logs a session on Kim's row");
  assert.equal((await app.call("PUT", "/api/mastery/name", { witness: "kim" }, dad)).status, 200, "Dad's vote, Kim witnesses");
  assert.equal((await app.call("PUT", "/api/mastery/name", { witness: "dad" }, kim)).status, 200, "Kim's vote, Dad witnesses");
  assert.equal((await app.call("POST", "/api/toilet", { kind: "wee" }, dad)).status, 200);
  const item = C.socialGroups[0].id + ":0";
  assert.equal((await app.call("PUT", "/api/social/" + item, { mood: "happy" }, dad)).status, 200);
  assert.equal((await app.call("POST", "/api/healthlog", { kind: "weight", date: today, kg: 6.2 }, dad)).status, 200);
  const t = await app.call("POST", "/api/teach", { skill: "name", learner: "kim" }, dad);
  assert.equal((await app.call("PUT", "/api/teach/" + t.json.teach[0].id, {}, kim)).status, 200, "Kim confirms the lesson");
  assert.equal((await app.call("POST", "/api/push/subscribe", { subscription: sub("dad") }, dad)).status, 200);
  assert.equal((await app.call("PUT", "/api/logs/" + today, { bite: 2 }, dad)).status, 200);
  return { kim, mum, dad, today, yday, item };
}

test("removal voids everything the person logged, drops their phone, and the scores of the others change only where they leaned on them", async () => {
  const app = await boot();
  try {
    const { kim, mum, dad, today, yday, item } = await fillIn(app);
    const before = (await app.call("GET", "/api/state", undefined, mum)).json;
    const scBefore = R.compute(before, C, { today });
    assert.equal(scBefore.skills.name.votes, 2); assert.equal(scBefore.pack.streak, 1, "yesterday was not a pack day: Dad missed it");
    assert.deepEqual(scBefore.people.kim.buddy && scBefore.people.kim.buddy.with, "dad");

    const r = await app.call("DELETE", "/api/family/dad", undefined, mum);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const st = r.json;
    assert.deepEqual(st.settings.family.map((m) => m.id), ["kim", "bo", "mum"]);
    assert.equal(st.settings.family[0].buddy, "", "Kim's buddy pointer is cleared");
    assert.equal(st.push.length, 0, "Dad's phone gets no more reminders");
    assert.equal(st.health.length, 0, "his vet entry is hidden"); assert.equal(st.teach.length, 0, "the lesson is hidden");
    assert.equal(st.toilet.length, 1); assert.equal(st.toilet[0].void, true, "the trip is voided, not deleted");
    assert.equal(st.ticks[today + "_dad_am"].void, true, "his own session is voided");
    assert.equal(st.ticks[today + "_kim_pm"].by, "dad"); assert.ok(!st.ticks[today + "_kim_pm"].void, "the session he logged on Kim's row stays with Kim");
    assert.equal(st.logs[today].by, "dad", "the bite rating stays, for now with his id");
    const votes = st.mastery.name.done;
    assert.equal(votes.find((v) => v.by === "dad").void, true, "his vote is voided");
    assert.equal(votes.find((v) => v.by === "kim").witness, "", "Kim's vote keeps no witness");
    assert.equal(st.social[item][0].void, true);
    assert.deepEqual(st.removals.map((x) => [x.id, x.name, x.counts]), [["dad", "Dad", { sessions: 1, votes: 1, witnessed: 1, trips: 1, social: 1, health: 1, lessons: 1 }]]);

    assert.equal((await app.call("GET", "/api/state", undefined, dad)).json.me, null, "Dad's phone no longer knows who it is");

    const sc = R.compute(st, C, { today });
    assert.equal(sc.people.kim.points, scBefore.people.kim.points - C.points.witness - (C.points.learn || 10) + C.points.packDay, "Kim loses the witness points and the lesson, gains the new pack day, nothing else");
    assert.equal(sc.skills.name.votes, 1, "the skill lost Dad's vote");
    assert.equal(sc.pack.streak, 2, "with Dad gone, yesterday becomes a pack day");
    assert.equal(sc.people.kim.buddy, null);
    assert.equal(sc.people.mum.points, scBefore.people.mum.points + C.points.packDay, "Mum gains the new pack day and nothing else");
    assert.equal((await app.call("GET", "/api/state", undefined, kim)).status, 200);
  } finally { app.stop(); }
});

test("gates: a kid cannot remove anyone, nobody removes themselves, the last grown-up stays while kids remain", async () => {
  const app = await boot();
  try {
    const kim = await app.as("kim"), mum = await app.as("mum");
    assert.equal((await app.call("DELETE", "/api/family/bo", undefined, app.session)).json.code, "pick", "pick yourself first");
    assert.equal((await app.call("DELETE", "/api/family/bo", undefined, kim)).status, 403);
    assert.equal((await app.call("DELETE", "/api/family/mum", undefined, mum)).status, 400, "not yourself");
    assert.equal((await app.call("DELETE", "/api/family/nobody", undefined, mum)).status, 404);
    assert.equal((await app.call("DELETE", "/api/family/dad", undefined, mum)).status, 200);
    assert.equal((await app.call("DELETE", "/api/family/mum", undefined, (await app.as("mum")))).status, 400, "still not yourself");
    const dadBack = await app.call("POST", "/api/family/dad/restore", {}, mum);
    assert.equal(dadBack.status, 200);
    assert.equal((await app.call("DELETE", "/api/family/mum", undefined, (await app.as("dad")))).status, 200, "another grown-up can remove Mum while Dad remains");
    assert.equal((await app.call("DELETE", "/api/family/dad", undefined, (await app.as("dad")))).status, 400, "Dad is now the last grown-up");
    assert.equal((await app.call("POST", "/api/family/mum/restore", {}, kim)).status, 403, "a kid cannot undo either");
    assert.equal((await app.call("POST", "/api/family/nobody/restore", {}, (await app.as("dad")))).status, 404);
  } finally { app.stop(); }
});

test("undo within 15 minutes puts the store back exactly; after the window it is refused and the next save purges the id", async () => {
  const app = await boot();
  try {
    const { mum, dad, today } = await fillIn(app);
    const snapshot = app.store();
    assert.equal((await app.call("DELETE", "/api/family/dad", undefined, mum)).status, 200);
    assert.notDeepEqual(app.store().settings, snapshot.settings);
    app.skew(14 * 60e3);
    const back = await app.call("POST", "/api/family/dad/restore", {}, mum);
    assert.equal(back.status, 200, JSON.stringify(back.json));
    const after = app.store();
    delete snapshot.rev; delete after.rev;
    assert.deepStrictEqual(after, snapshot, "every row, pointer and subscription is exactly as it was");
    assert.equal((await app.call("GET", "/api/state", undefined, dad)).json.me, "dad", "Dad's phone works again");
    assert.equal((await app.call("POST", "/api/family/dad/restore", {}, mum)).status, 404, "nothing left to undo");

    // remove again, let the window pass
    assert.equal((await app.call("DELETE", "/api/family/dad", undefined, mum)).status, 200);
    app.skew(14 * 60e3 + 16 * 60e3);
    assert.equal((await app.call("POST", "/api/family/dad/restore", {}, mum)).status, 404, "too late");
    assert.deepEqual((await app.call("GET", "/api/state", undefined, mum)).json.removals, [], "no undo offered");
    assert.ok(/"dad"/.test(JSON.stringify(app.store())), "until the next save the rows still carry the id");
    assert.equal((await app.call("PUT", "/api/ticks/" + today + "_kim_ev", { on: true }, (await app.as("kim")))).status, 200, "any save purges");
    const raw = JSON.stringify(app.store());
    assert.ok(!/"dad"/.test(raw), "the id is gone from every row: " + raw.slice(0, 200));
    const db = app.store();
    assert.equal(db.removals.length, 0);
    assert.ok(!Object.keys(db.ticks).some((k) => k.includes("_dad_")), "his row is gone");
    assert.equal(db.ticks[today + "_kim_pm"].by, "", "the session on Kim's row stays, author stripped");
    assert.equal(db.logs[today].by, "");
    assert.deepEqual(db.mastery.name.done.map((v) => [v.by, v.witness]), [["kim", ""]], "his vote is gone, Kim's stays unwitnessed");
    assert.equal(db.toilet.length, 1); assert.equal(db.toilet[0].by, ""); assert.equal(db.toilet[0].void, true, "the trip stays, voided and nameless");
    assert.equal(db.health[0].by, ""); assert.equal(db.health[0].void, true);
    assert.equal(db.teach.length, 0);
    assert.doesNotThrow(() => R.compute(db, C, { today }), "the engine is happy with cleared witnesses and void rows");
  } finally { app.stop(); }
});

test("undo is refused when the family is full again", async () => {
  const app = await boot();
  try {
    const mum = await app.as("mum");
    assert.equal((await app.call("DELETE", "/api/family/dad", undefined, mum)).status, 200);
    const six = FAMILY.filter((m) => m.id !== "dad").map((m) => Object.assign({}, m, { buddy: "" })).concat([{ id: "x1", name: "X", kind: "kid" }, { id: "x2", name: "Y", kind: "kid" }, { id: "x3", name: "Z", kind: "kid" }]);
    assert.equal((await app.call("PUT", "/api/settings", { puppy: { name: "Pip" }, start: "2026-10-01", family: six }, mum)).status, 200);
    const r = await app.call("POST", "/api/family/dad/restore", {}, mum);
    assert.equal(r.status, 409); assert.match(r.json.error, /Up to 6/);
  } finally { app.stop(); }
});
