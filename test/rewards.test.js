"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const C = require("../public/content.js");
const R = require("../public/rewards.js");

const fam = [{ id: "a", name: "Ava", kind: "kid", target: 21 }, { id: "b", name: "Ben", kind: "kid", target: 21 }, { id: "m", name: "Mum", kind: "adult", target: 10 }];
const settings = { puppy: { name: "Pip", sex: "girl", born: "2026-08-14", breed: "" }, start: "2026-10-05", family: fam };
const at = (date, h) => new Date(date + "T" + String(h).padStart(2, "0") + ":00:00").getTime();
function tick(ticks, date, pid, slot, h, by, skill) { ticks[date + "_" + pid + "_" + slot] = { at: at(date, h), by: by || pid, skill }; }

test("levels and the puppy meter", () => {
  assert.equal(R.levelOf(0, C.levels).name, "New Recruit");
  assert.equal(R.levelOf(160, C.levels).n, 3);
  assert.equal(R.levelOf(160, C.levels).pct, Math.round(((160 - 150) / (300 - 150)) * 100));
  assert.equal(R.levelOf(99999, C.levels).next, null);
});

test("points, streaks, freezes and badges from a fortnight of ticks", () => {
  const ticks = {};
  // Ava: every day for 9 days, all three slots, mornings before 7:30
  for (let i = 0; i < 9; i++) { const d = R.addDays("2026-10-05", i); tick(ticks, d, "a", "am", 7); tick(ticks, d, "a", "pm", 16); tick(ticks, d, "a", "ev", 19); }
  // Ben: one a day, misses day 3 and day 4 (two freezes), misses day 7, 8, 9 (streak breaks), back day 10 to 14
  [0, 1, 2, 5, 6, 10, 11, 12, 13, 14].forEach((i) => tick(ticks, R.addDays("2026-10-05", i), "b", "pm", 16));
  // Mum logged Ava's afternoon on day 0
  ticks["2026-10-05_a_pm"].by = "m";
  const logs = { "2026-10-05": { bite: 1, by: "a" }, "2026-10-06": { bite: 2, by: "a" }, "2026-10-07": { bite: 2, by: "b" }, "2026-10-10": { bite: 5, by: "a" } };
  const mastery = { sit: { done: [{ by: "a", witness: "m", at: 1 }, { by: "b", witness: "a", at: 2 }, { by: "m", witness: "a", at: 3 }] }, yes: { done: [{ by: "a", witness: "b", at: 1 }, { by: "b", witness: "a", at: 1 }, { by: "m", witness: "a", at: 1 }] } };
  const toilet = [{ id: "1", at: at("2026-10-05", 8), kind: "wee", before: "woke", by: "b" }, { id: "2", at: at("2026-10-05", 12), kind: "poo", before: "ate", by: "b" }, { id: "3", at: at("2026-10-06", 9), kind: "accident", before: "played", by: "a" }];
  const S = R.compute({ settings, ticks, logs, mastery, toilet }, C, { today: "2026-10-19" });

  const ava = S.people.a, ben = S.people.b, mum = S.people.m;
  // Ava: 27 sessions, one logged by Mum (8 instead of 10), 9 full days, 2 confirmations, 4 witnessings, 3 bite ratings, 1 toilet log
  assert.equal(ava.points, 26 * 10 + 8 + 9 * 5 + 2 * 30 + 4 * 10 + 3 * 2 + 2, "sessions, full days, 2 confirmations, 4 witnessings, 3 ratings, 1 toilet log");
  assert.equal(ava.bestStreak, 9);
  assert.equal(ava.streak, 0, "Ava stopped 6 days ago, two freezes don't cover it");
  assert.equal(ava.hattricks, 9);
  assert.ok(ava.badges.includes("hattrick") && ava.badges.includes("early") && ava.badges.includes("s7") && ava.badges.includes("owl"));
  assert.ok(ava.badges.includes("sk_sit"));
  assert.ok(!ava.badges.includes("s14"));
  // Ben: trained days 10 to 14 (15 to 19 Oct, today included), so a live streak of 5, not at risk
  assert.equal(ben.streak, 5);
  assert.equal(ben.atRisk, false);
  assert.equal(ben.bestStreak, 5, "best streak counts real consecutive days only");
  assert.ok(ben.badges.includes("toilet20") === false);
  assert.equal(ben.toiletN, 2);
  assert.equal(mum.points, 2 * 30 + 1 * 10, "Mum confirmed sit and yes, witnessed once, never trained");
  // skill tree: sit and yes mastered, down is open, stay open, leaveit locked (needs iyc)
  assert.equal(S.skills.sit.mastered, true);
  assert.equal(S.skills.down.open, true);
  assert.equal(S.skills.leaveit.open, false);
  assert.equal(S.skills.iyc.open, true);
  // puppy meter: 37 sessions, 2 skills mastered, 3 calm days (bite 1 or 2), toilet successes
  assert.equal(S.puppy.sessions, 37);
  assert.equal(S.puppy.mastered, 2);
  assert.equal(S.calmDays, 3);
  assert.equal(S.puppy.points, 37 * 10 + 2 * 50 + 3 * 20 + 0 + 2 * 2);
  assert.ok(S.puppy.level.n >= 2);
  // pack badges
  assert.ok(ava.badges.includes("calm3"), "three calm days in a row is a pack badge");
  assert.ok(ava.badges.includes("dryday"));
  assert.equal(S.toilet.interval, 60, "9-week-old: hourly");
  assert.deepEqual(S.toilet.accidentsAfter, { played: 1 });
});

test("streak freezes: two a week keep a streak alive, a third miss breaks it", () => {
  const ticks = {};
  // trained Mon 5, Tue 6, missed Wed 7 and Thu 8, trained Fri 9, Sat 10, Sun 11, today Mon 12 not yet
  [0, 1, 4, 5, 6].forEach((i) => tick(ticks, R.addDays("2026-10-05", i), "a", "am", 7));
  let S = R.compute({ settings, ticks, logs: {}, mastery: {}, toilet: [] }, C, { today: "2026-10-12" });
  assert.equal(S.people.a.streak, 5, "two freezes bridge the gap; frozen days keep the streak but do not add to it");
  assert.equal(S.people.a.atRisk, true);
  assert.equal(S.people.a.usedFreeze, true);
  // same week, a third miss
  delete ticks["2026-10-09_a_am"];
  S = R.compute({ settings, ticks, logs: {}, mastery: {}, toilet: [] }, C, { today: "2026-10-12" });
  assert.equal(S.people.a.streak, 2);
});

test("missions rotate through open skills and cover everyone", () => {
  const S = R.compute({ settings, ticks: {}, logs: {}, mastery: {}, toilet: [] }, C, { today: "2026-10-16" });
  const open = Object.keys(S.skills).filter((k) => S.skills[k].open);
  assert.ok(open.includes("name") && open.includes("yes") && !open.includes("sit"));
  const m = S.missions;
  assert.ok(m.a && m.a.am && open.includes(m.a.am.skill));
  const seen = new Set();
  for (let i = 0; i < 7; i++) { const mm = R.missions({ settings, ticks: {}, mastery: {} }, C, R.addDays("2026-10-16", i)); ["am", "pm", "ev"].forEach((s) => seen.add(mm.a[s].skill)); }
  assert.equal(seen.size, open.length, "a week covers every open skill for one person");
});
