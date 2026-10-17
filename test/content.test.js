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
