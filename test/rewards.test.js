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
  const social = { "people:0": [{ by: "a", mood: "happy", at: 1 }, { by: "b", mood: "unsure", at: 1 }], "sounds:2": [{ by: "a", mood: "scared", at: 1 }] };
  const S = R.compute({ settings, ticks, logs, mastery, toilet, social }, C, { today: "2026-10-19" });

  const ava = S.people.a, ben = S.people.b, mum = S.people.m;
  // Ava: 27 sessions, one logged by Mum (8 instead of 10), 9 full days, 2 confirmations, 4 witnessings, 3 bite ratings, 1 toilet log
  assert.equal(ava.points, 26 * 10 + 8 + 9 * 5 + 2 * 30 + 4 * 10 + 3 * 2 + 2 + 2 * 5, "sessions, full days, 2 confirmations, 4 witnessings, 3 ratings, 1 toilet log, 2 social items");
  assert.equal(S.socialHappy, 1, "only happy ticks feed the puppy meter");
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
  assert.equal(ben.points, 10 * 10 + 2 * 30 + 1 * 10 + 1 * 2 + 2 * 2 + 1 * 5, "Ben: 10 sessions, 2 confirmations, 1 witnessing, 1 rating, 2 toilet logs, 1 social item");
  // skill tree: sit and yes mastered, down is open, stay open, leaveit locked (needs iyc)
  assert.equal(S.skills.sit.mastered, true);
  assert.equal(S.skills.down.open, true);
  assert.equal(S.skills.leaveit.open, false);
  assert.equal(S.skills.iyc.open, true);
  // puppy meter: 37 sessions, 2 skills mastered, 3 calm days (bite 1 or 2), toilet successes
  assert.equal(S.puppy.sessions, 37);
  assert.equal(S.puppy.mastered, 2);
  assert.equal(S.calmDays, 3);
  assert.equal(S.puppy.points, 37 * 10 + 2 * 50 + 3 * 20 + 0 + 2 * 2 + 1 * 10);
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

test("the course: everyone starts at lesson one, three sessions tick a lesson, mastery skips it, missions follow", () => {
  const order = [].concat(...C.course.levels.map((l) => l.skills));
  assert.equal(order[0], "name"); assert.ok(order.indexOf("sit") < order.indexOf("down"), "basics before the harder asks");
  let S = R.compute({ settings, ticks: {}, logs: {}, mastery: {}, toilet: [] }, C, { today: "2026-10-16" });
  assert.deepEqual(S.course.order, order);
  assert.equal(S.course.people.a.current, "name"); assert.equal(S.course.people.a.done, 0); assert.equal(S.course.people.a.total, order.length);
  assert.equal(S.course.people.a.lessons.name.status, "current"); assert.equal(S.course.people.a.lessons.yes.status, "later");
  assert.equal(S.missions.a.am.skill, "name"); assert.equal(S.missions.a.ev.skill, "name"); assert.equal(S.missions.a.am.warm, null);
  // Ava does the name game three times; Mum has done it once
  const ticks = {};
  ["2026-10-14_a_am", "2026-10-14_a_pm", "2026-10-15_a_am"].forEach((k) => { ticks[k] = { at: 1, by: "a", skill: "name" }; });
  ticks["2026-10-15_m_am"] = { at: 1, by: "m", skill: "name" };
  ticks["2026-10-15_a_pm"] = { at: 1, by: "a", skill: "name", void: true };
  S = R.compute({ settings, ticks, logs: {}, mastery: {}, toilet: [] }, C, { today: "2026-10-16" });
  assert.equal(S.course.people.a.lessons.name.status, "done"); assert.equal(S.course.people.a.lessons.name.count, 3);
  assert.equal(S.course.people.a.current, "yes"); assert.equal(S.course.people.a.done, 1);
  assert.equal(S.missions.a.pm.skill, "yes"); assert.equal(S.missions.a.pm.warm, "name", "the warm-up is the lesson before");
  assert.equal(S.course.people.m.current, "name"); assert.equal(S.course.people.m.lessons.name.count, 1, "Mum is on her own path, and the void row does not count for Ava");
  // the pack masters Sit: that lesson is done for everyone, even with no sessions
  const mastery = { sit: { done: [{ by: "a", witness: "m", at: 1 }, { by: "m", witness: "a", at: 2 }, { by: "b", witness: "a", at: 3 }] } };
  S = R.compute({ settings, ticks, logs: {}, mastery, toilet: [] }, C, { today: "2026-10-16" });
  assert.equal(S.course.people.m.lessons.sit.done, true); assert.equal(S.course.people.m.lessons.sit.mastered, true);
  assert.equal(S.course.people.m.current, "name");
  // a graduate revises: missions rotate through the whole course
  const all = {}; let d = "2026-09-01";
  order.forEach((id) => { ["am", "pm", "ev"].forEach((s) => { all[d + "_a_" + s] = { at: 1, by: "a", skill: id }; }); d = R.addDays(d, 1); });
  S = R.compute({ settings, ticks: all, logs: {}, mastery: {}, toilet: [] }, C, { today: "2026-10-16" });
  assert.equal(S.course.people.a.graduated, true); assert.equal(S.course.people.a.current, null);
  const seen = new Set(); for (let i = 0; i < 9; i++) ["am", "pm", "ev"].forEach((s) => seen.add(R.missions({ settings, ticks: all, mastery: {} }, C, R.addDays("2026-10-16", i))[ "a"][s].skill));
  assert.equal(seen.size, order.length, "nine days of revision cover every lesson");
});

test("content: every lesson has a live-checked hero video, every video id is in the library, no lesson is listed twice", () => {
  const order = [].concat(...C.course.levels.map((l) => l.skills));
  assert.equal(new Set(order).size, order.length);
  C.skills.forEach((s) => { assert.ok(order.includes(s.id), s.id + " is in the course"); assert.ok(C.videos[s.hero], s.id + " hero"); s.v.forEach((v) => assert.ok(C.videos[v], s.id + " " + v)); assert.ok(!s.v.includes(s.hero), s.id + " hero not repeated"); (s.req || []).forEach((r) => assert.ok(order.indexOf(r) < order.indexOf(s.id), s.id + " comes after " + r)); });
  [].concat(C.course.intro.v, C.bitingStart.v, C.bitingStart.shorts, ...C.watch.map((w) => w.v), ...C.biting.map((b) => b.v), ...C.problems.map((p) => p.v), ...C.trainers.map((t) => t.v)).forEach((v) => assert.ok(C.videos[v], v));
  Object.keys(C.videos).forEach((id) => assert.match(id, /^[A-Za-z0-9_-]{11}$/));
});

/* ---------- edge cases (burn round 5) ---------- */
const fam2 = [{ id: "a", name: "Ava", kind: "kid", target: 21 }, { id: "d", name: "Dad", kind: "adult", target: 10 }, { id: "b", name: "Ben", kind: "kid", target: 21 }];
const settings2 = { puppy: { name: "Pip", sex: "girl", born: "2026-08-14", breed: "" }, start: "2026-10-05", family: fam2 };
const fresh = (ticks, extra) => Object.assign({ settings: settings2, ticks: ticks || {}, logs: {}, mastery: {}, toilet: [] }, extra || {});

test("podium: percent of your own goal, so a grown-up on 10 can beat a kid on 21", () => {
  const ticks = {};
  // week of Mon 12 Oct: Dad does 6 of 10 (60%), Ava does 9 of 21 (43%), Ben 0
  for (let i = 0; i < 6; i++) tick(ticks, R.addDays("2026-10-12", i), "d", "pm", 16);
  for (let i = 0; i < 3; i++) ["am", "pm", "ev"].forEach((s) => tick(ticks, R.addDays("2026-10-12", i), "a", s, s === "am" ? 7 : s === "pm" ? 16 : 19));
  const S = R.compute(fresh(ticks), C, { today: "2026-10-18" }); // Sunday
  assert.equal(S.people.d.weekPct, 60); assert.equal(S.people.a.weekPct, 43); assert.equal(S.people.b.weekPct, 0);
  const order = Object.values(S.people).sort((x, y) => y.weekPct - x.weekPct).map((p) => p.id);
  assert.deepEqual(order, ["d", "a", "b"]);
  assert.equal(S.people.a.weekSessions, 9); assert.equal(S.people.a.points > S.people.d.points, true, "raw points still favour Ava, which is why the podium does not use them");
});

test("Sunday-night reset: on Monday the week starts from zero while best week and streaks carry over", () => {
  const ticks = {};
  for (let i = 0; i < 7; i++) tick(ticks, R.addDays("2026-10-12", i), "a", "pm", 16); // Mon 12 to Sun 18
  let S = R.compute(fresh(ticks), C, { today: "2026-10-18" });
  assert.equal(S.people.a.weekSessions, 7); assert.equal(S.people.a.weekPct, 33);
  S = R.compute(fresh(ticks), C, { today: "2026-10-19" }); // Monday, nothing yet
  assert.equal(S.people.a.weekSessions, 0); assert.equal(S.people.a.weekPct, 0);
  assert.equal(S.people.a.bestWeek, 7, "best week survives the reset");
  assert.equal(S.people.a.streak, 7, "streak survives: today is empty but not over");
  assert.equal(S.people.a.atRisk, true);
  assert.equal(S.pack.weekSessions, 0);
});

test("pack streak counts only days when every single person trained", () => {
  const ticks = {};
  ["2026-10-14", "2026-10-15", "2026-10-16"].forEach((d) => fam2.forEach((p) => tick(ticks, d, p.id, "pm", 16)));
  tick(ticks, "2026-10-17", "a", "pm", 16); tick(ticks, "2026-10-17", "d", "pm", 16); // Ben misses Saturday
  let S = R.compute(fresh(ticks), C, { today: "2026-10-17" });
  assert.equal(S.pack.streak, 3, "Saturday is not over, so the run up to Friday still counts");
  assert.equal(S.pack.days, 3);
  S = R.compute(fresh(ticks), C, { today: "2026-10-18" });
  assert.equal(S.pack.streak, 0, "by Sunday the broken Saturday ends the run");
  assert.equal(S.pack.best, 3);
  assert.equal(S.people.a.points, 4 * 10 + 3 * C.points.packDay, "pack days pay everyone");
});

test("mastery: three different people with witnesses, never the same person twice, never self-witnessed", () => {
  const votes = (L) => ({ sit: { done: L }, yes: { done: [{ by: "a", witness: "d", at: 1 }, { by: "d", witness: "a", at: 1 }, { by: "b", witness: "a", at: 1 }] } });
  let S = R.compute(fresh({}, { mastery: votes([{ by: "a", witness: "d", at: 1 }, { by: "a", witness: "b", at: 2 }]) }), C, { today: "2026-10-18" });
  assert.equal(S.skills.sit.votes, 1, "two votes from Ava count once");
  assert.equal(S.skills.sit.mastered, false);
  S = R.compute(fresh({}, { mastery: votes([{ by: "a", witness: "d", at: 1 }, { by: "d", witness: "a", at: 2 }, { by: "b", witness: "a", at: 3 }]) }), C, { today: "2026-10-18" });
  assert.equal(S.skills.sit.mastered, true);
  assert.equal(S.skills.down.open, true, "mastered Sit opens Down");
  const two = { settings: Object.assign({}, settings2, { family: fam2.slice(0, 2) }), ticks: {}, logs: {}, toilet: [], mastery: votes([{ by: "a", witness: "d", at: 1 }, { by: "d", witness: "a", at: 2 }]) };
  assert.equal(R.compute(two, C, { today: "2026-10-18" }).skills.sit.mastered, true, "a family of two needs two");
  // the server refuses self-witness; the engine ignores nothing, so a voided vote must not count
  S = R.compute(fresh({}, { mastery: votes([{ by: "a", witness: "d", at: 1, void: true }]) }), C, { today: "2026-10-18" });
  assert.equal(S.skills.sit.votes, 0);
});

test("welfare cap: three slots a day is the ceiling, so points cannot be farmed", () => {
  const ticks = {};
  tick(ticks, "2026-10-16", "a", "am", 7); tick(ticks, "2026-10-16", "a", "pm", 16); tick(ticks, "2026-10-16", "a", "ev", 19);
  ticks["2026-10-16_a_xx"] = { at: at("2026-10-16", 12), by: "a" }; // not a real slot: the server refuses it, the engine ignores it
  const S = R.compute(fresh(ticks), C, { today: "2026-10-16" });
  assert.equal(S.people.a.today, 3);
  assert.equal(S.people.a.points, 3 * C.points.session + C.points.fullDay);
  assert.equal(S.puppy.sessions, 3);
});

test("regression: the puppy's age in weeks does not lose a week across daylight saving", () => {
  // NZ clocks went forward on 27 Sep 2026; 14 Aug to 16 Oct is 63 days exactly, so 9 weeks, not 8
  const S = R.compute(fresh({}), C, { today: "2026-10-16" });
  assert.equal(S.toilet.ageWeeks, 9);
  const S2 = R.compute(fresh({}), C, { today: "2026-10-17" });
  assert.equal(S2.toilet.ageWeeks, 9);
  const S3 = R.compute(fresh({}), C, { today: "2026-10-23" });
  assert.equal(S3.toilet.ageWeeks, 10);
});
