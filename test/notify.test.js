"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const C = require("../public/content.js");
const R = require("../public/rewards.js");
const N = require("../server/notify.js");

const fam = [{ id: "a", name: "Ava", kind: "kid", target: 21 }, { id: "m", name: "Mum", kind: "adult", target: 10, phone: "+64211234567", sms: true }];
const settings = { puppy: { name: "Pip", sex: "girl", born: "2026-08-14", breed: "" }, start: "2026-10-05", family: fam };
const at = (date, h, mi) => new Date(date + "T" + String(h).padStart(2, "0") + ":" + String(mi || 0).padStart(2, "0") + ":00");
const sub = (id, pid, prefs) => ({ id, pid, channel: "push", prefs: prefs || {} });
function state(ticks) { return { settings, ticks: ticks || {}, logs: {}, mastery: {}, toilet: [] }; }
function run(now, st, subs, sent) { const sc = R.compute(st, C, { today: now.toISOString().slice(0, 10) }); return N.decide(now, st, sc, subs, C, sent || {}); }

test("morning nudge fires at 07:00 on a school day only if the slot is empty", () => {
  const mon = "2026-10-19"; // Monday
  let out = run(at(mon, 7, 0), state(), [sub("s1", "a")]);
  assert.equal(out.length, 1); assert.equal(out[0].kind, "am"); assert.match(out[0].text, /Pip|Ava/);
  const ticks = {}; ticks[mon + "_a_am"] = { at: at(mon, 6, 50).getTime(), by: "a", skill: "sit" };
  out = run(at(mon, 7, 0), state(ticks), [sub("s1", "a")]);
  assert.equal(out.length, 0, "already ticked, no nudge");
  assert.equal(run(at(mon, 7, 1), state(), [sub("s1", "a")]).length, 0, "only on the minute");
});

test("weekends use the later morning time; school hours are silent; quiet hours are hard off", () => {
  const sat = "2026-10-24";
  assert.equal(run(at(sat, 7, 0), state(), [sub("s1", "a")]).length, 0);
  assert.equal(run(at(sat, 8, 0), state(), [sub("s1", "a")]).length, 1);
  assert.equal(run(at("2026-10-19", 11, 0), state(), [sub("s1", "a")]).length, 0, "nothing mid-morning");
  assert.equal(run(at("2026-10-19", 20, 45), state(), [sub("s1", "a", { evAt: "20:45" })]).length, 0, "kid quiet hours");
  assert.equal(run(at("2026-10-19", 20, 45), state(), [sub("s2", "m", { evAt: "20:45" })]).length, 1, "grown-up still awake");
});

test("two a day cap, streak-at-risk only with a streak and nothing done, prefs can switch slots off", () => {
  const mon = "2026-10-19";
  assert.equal(run(at(mon, 15, 30), state(), [sub("s1", "a")], { s1: ["am", "pm"] }).length, 0, "capped at two");
  // Ava trained Fri, Sat, Sun: streak 3, nothing today
  const ticks = {}; ["2026-10-16", "2026-10-17", "2026-10-18"].forEach((d) => { ticks[d + "_a_pm"] = { at: at(d, 16).getTime(), by: "a" }; });
  const risk = run(at(mon, 20, 0), state(ticks), [sub("s1", "a")]);
  assert.equal(risk.length, 1); assert.equal(risk[0].kind, "risk"); assert.match(risk[0].text, /3-day streak/);
  assert.equal(run(at(mon, 20, 0), state(), [sub("s1", "a")]).length, 0, "no streak, no risk message");
  assert.equal(run(at(mon, 20, 0), state(ticks), [sub("s1", "a", { risk: false })]).length, 0);
  assert.equal(run(at(mon, 7, 0), state(), [sub("s1", "a", { on: false })]).length, 0, "off is off");
});

test("SMS: one a day, afternoon on school days, only if nothing is on the chart", () => {
  const mon = "2026-10-19";
  const sms = { id: "sms:m", pid: "m", channel: "sms", prefs: { on: true }, phone: "+64211234567" };
  let out = run(at(mon, 15, 30), state(), [sms]);
  assert.equal(out.length, 1); assert.equal(out[0].kind, "sms"); assert.match(out[0].text, /puppy\.appspurt\.com/);
  const ticks = {}; ticks[mon + "_m_am"] = { at: at(mon, 7).getTime(), by: "m" };
  assert.equal(run(at(mon, 15, 30), state(ticks), [sms]).length, 0, "already trained today");
  assert.equal(run(at(mon, 15, 30), state(), [sms], { "sms:m": ["sms"] }).length, 0, "one a day");
  assert.equal(run(at("2026-10-24", 10, 0), state(), [sms]).length, 1, "weekend mid-morning");
});

test("phone numbers normalise to +64 and the gateway call has the right shape", async () => {
  assert.equal(N.normalisePhone("021 234 5678"), "+64212345678");
  assert.equal(N.normalisePhone("+61 400 000 000"), "+61400000000");
  assert.equal(N.normalisePhone("64 21 000 0000"), "+64210000000");
  assert.equal(N.normalisePhone("12"), "");
  let seen;
  const send = N.makeSmsSender({ AIVA_SMS_API_URL: "http://gw", AIVA_SMS_API_KEY: "k", AIVA_SMS_DEVICE_ID: "dev1", AIVA_SMS_SIM_SUBSCRIPTION_ID: "1" }, async (url, init) => { seen = { url, init }; return { ok: true }; });
  await send("+64211234567", "hi");
  assert.equal(seen.url, "http://gw/api/v1/gateway/devices/dev1/send-sms");
  assert.equal(seen.init.headers["x-api-key"], "k");
  assert.deepEqual(JSON.parse(seen.init.body), { message: "hi", recipients: ["+64211234567"], simSubscriptionId: 1 });
  assert.equal(N.makeSmsSender({}), null, "no gateway configured means no sender");
});

test("weekly challenge progress is computed and pays the family when won", () => {
  // find the week whose challenge is Bite Diary and rate every day
  for (let w = 0; w < C.challenges.length; w++) {
    const mon = R.addDays("2026-10-19", w * 7);
    const logs = {}; for (let i = 0; i < 7; i++) logs[R.addDays(mon, i)] = { bite: 2, by: "a" };
    const S = R.compute({ settings, ticks: {}, logs, mastery: {}, toilet: [] }, C, { today: R.addDays(mon, 6) });
    if (S.challenge.id === "diary") {
      assert.equal(S.challenge.progress, 7); assert.equal(S.challenge.won, true);
      assert.equal(S.people.a.points, 7 * 2 + 25, "7 ratings plus the challenge bonus");
      return;
    }
  }
  assert.fail("diary challenge never came up in the rotation");
});
