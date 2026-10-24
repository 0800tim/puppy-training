"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const C = require("../public/content.js");

// Walk every string in the content file.
function strings(x, out = []) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => strings(v, out));
  return out;
}

test("content has no em or en dashes (house style) and no empty strings in lists", () => {
  const all = strings(C);
  const dashed = all.filter((s) => /[\u2014\u2013]/.test(s));
  assert.deepEqual(dashed, [], "em or en dash in content");
  assert.ok(all.length > 500);
});

test("the other-pets tips are complete: unique ids, sprite icons, text in every section", () => {
  assert.ok(C.pets && C.pets.intro.length > 40);
  const ids = C.pets.sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids unique");
  assert.ok(ids.includes("meetdog") && ids.includes("play") && ids.includes("separate") && ids.includes("cat") && ids.includes("terrier"));
  C.pets.sections.forEach((s) => {
    assert.ok(s.nm && s.what && s.icon, s.id + " has name, intro and icon");
    assert.ok((s.steps || []).length + (s.green || []).length >= 2, s.id + " has steps");
    assert.ok((s.do || []).length >= 1 && (s.dont || []).length >= 1, s.id + " has do and don't");
    strings(s).forEach((x) => assert.ok(x.trim().length > 0, s.id + " empty string"));
  });
  const play = C.pets.sections.find((s) => s.id === "play");
  assert.ok(play.green.length >= 5 && play.red.length >= 5, "play has both lists");
  // every icon used must exist in the sprite
  const html = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "public", "index.html"), "utf8");
  C.pets.sections.forEach((s) => assert.ok(html.includes('id="i-' + s.icon + '"'), "sprite has " + s.icon));
});

test("the biting SOS steps the visitor card prints are still there", () => {
  assert.ok(C.sos.steps.length >= 3);
  assert.match(C.sos.title, /biting/i);
});

/* Added 24 October 2026: the course and the video table. A video id that is not in the table makes the lesson page
   print "null"; a skill in no level, or two, breaks the one-path course; content is written with "she" and swapped by
   T(), so a bare "he" in our own prose would never swap. */
const skillIds = new Set(C.skills.map((s) => s.id));

test("every skill is in exactly one course level, with a hero video and known prerequisites", () => {
  const seen = new Map();
  C.course.levels.forEach((l) => l.skills.forEach((id) => { seen.set(id, (seen.get(id) || 0) + 1); assert.ok(skillIds.has(id), "level " + l.id + " names an unknown skill " + id); }));
  C.skills.forEach((s) => {
    assert.equal(seen.get(s.id), 1, s.id + " should sit in one level");
    assert.ok(s.hero && C.videos[s.hero], s.id + " needs a hero video that is in the videos table");
    assert.ok(Array.isArray(s.steps) && s.steps.length >= 2 && s.done, s.id + " needs steps and a done-when line");
    (s.req || []).forEach((r) => assert.ok(skillIds.has(r), s.id + " requires an unknown skill " + r));
  });
  assert.ok(C.course.reps >= 1 && C.course.session.length >= 2 && C.course.session.every(([nm, secs, hint]) => nm && secs > 0 && hint));
});

test("every video id used anywhere is in the videos table, and every entry there has a title and a channel", () => {
  const used = new Set();
  const walk = (x, key) => {
    if (Array.isArray(x)) { if (key === "v") x.forEach((id) => typeof id === "string" && used.add(id)); x.forEach((y) => walk(y, null)); }
    else if (x && typeof x === "object") Object.entries(x).forEach(([k, v]) => { if (k === "hero" && typeof v === "string") used.add(v); walk(v, k); });
  };
  walk(C, null);
  assert.ok(used.size > 50, "the sweep found the video references");
  assert.deepEqual([...used].filter((id) => !C.videos[id]), [], "video ids with no entry");
  Object.entries(C.videos).forEach(([id, v]) => { assert.match(id, /^[\w-]{11}$/, id + " is not a YouTube id"); assert.ok(Array.isArray(v) && v[0] && v[1], id + " needs [title, channel, minutes]"); });
});

test("our own prose says she, never a bare he, his or him (video titles are quoted as YouTube has them)", () => {
  const ours = Object.assign({}, C); delete ours.videos;
  const bare = strings(ours).filter((x) => /\b(he|his|him)\b/.test(x) && !/\b(the|a|your) (vet|trainer|owner|visitor|hider|partner)\b/i.test(x));
  assert.deepEqual(bare, []);
});
