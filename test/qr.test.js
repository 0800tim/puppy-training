// public/qr.js against the python-qrcode reference (test/fixtures/qr.json, made by scripts/qr-fixtures.py): the same
// modules for the same text and mask, across versions 1 to 10, both block layouts, version information and UTF-8.
const { test } = require("node:test");
const assert = require("node:assert");
const QR = require("../public/qr.js");
const fixtures = require("./fixtures/qr.json");

test("every fixture matches the reference encoder module for module", () => {
  assert.ok(fixtures.length >= 30);
  const versions = new Set();
  fixtures.forEach((f) => {
    const q = QR.encode(f.text, { mask: f.mask });
    assert.equal(q.version, f.version, "version for " + JSON.stringify(f.text.slice(0, 30)));
    assert.equal(q.mask, f.mask);
    const rows = q.modules.map((r) => r.map((c) => (c ? "1" : "0")).join(""));
    assert.deepEqual(rows, f.rows, "modules for " + JSON.stringify(f.text.slice(0, 30)) + " mask " + f.mask);
    versions.add(f.version);
  });
  [1, 3, 5, 6, 8, 9, 10].forEach((v) => assert.ok(versions.has(v), "a fixture at version " + v));
});

test("the free mask choice is one of the eight and the grid is the same size as the forced one; too long says so", () => {
  const url = "https://puppy.appspurt.dev/j/biscuit-sttz";
  const q = QR.encode(url);
  assert.ok(q.mask >= 0 && q.mask < 8);
  assert.equal(q.version, 3); assert.equal(q.size, 29);
  // the three finders are where they should be whatever the mask
  const dark = (x, y) => q.modules[y][x];
  [[0, 0], [q.size - 7, 0], [0, q.size - 7]].forEach(([x0, y0]) => { assert.ok(dark(x0, y0) && dark(x0 + 6, y0 + 6) && dark(x0 + 3, y0 + 3) && !dark(x0 + 1, y0 + 1)); });
  assert.equal(QR.capacity(1), 14); assert.equal(QR.capacity(3), 42); assert.equal(QR.capacity(10), 213);
  assert.equal(QR.encode("x".repeat(213)).version, 10);
  assert.throws(() => QR.encode("x".repeat(214)), /too long/);
  assert.equal(QR.encode("x".repeat(14)).version, 1); assert.equal(QR.encode("x".repeat(15)).version, 2);
});

test("the SVG has a four-module quiet zone, black on white, and a safe label", () => {
  const s = QR.svg("https://puppy.appspurt.dev/j/biscuit-sttz", { label: "QR <code> for \"Biscuit\" & co" });
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 37 37"/);
  assert.match(s, /aria-label="QR &lt;code&gt; for &quot;Biscuit&quot; &amp; co"/);
  assert.match(s, /<rect width="37" height="37" fill="#fff"\/><path d="M4 4h1v1h-1z/); // the first dark module is the top-left finder's corner, after the quiet zone
  assert.ok(!s.includes("<script"));
});
