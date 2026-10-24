/* Puppy School HQ: a QR code for the join link.
 * One file, no dependencies, runs in the browser and in Node (the tests check it against a reference encoder).
 * Byte mode, error correction level M, versions 1 to 10 (up to 213 bytes), the eight masks scored as the standard says.
 * The code is drawn as an inline SVG from the module grid; the join link never leaves the phone that shows it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PUPPY_QR = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Per version, error correction level M: codewords of error correction per block, then the blocks as
  // [count, data codewords] pairs (the second group may be empty).
  const EC_M = [null,
    [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
    [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
  const MAX_VERSION = 10;
  const dataCodewords = (v) => EC_M[v][1].reduce((n, b) => n + b[0] * b[1], 0);
  const capacity = (v) => Math.floor((dataCodewords(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8); // bytes that fit after the mode and count bits

  /* ---------- Reed-Solomon over GF(256), polynomial 0x11d ---------- */
  const gfMul = (a, b) => { let r = 0; for (let i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11d); r ^= ((b >>> i) & 1) * a; } return r & 0xff; };
  function rsDivisor(degree) {
    const out = new Array(degree).fill(0); out[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) { out[j] = gfMul(out[j], root); if (j + 1 < degree) out[j] ^= out[j + 1]; }
      root = gfMul(root, 2);
    }
    return out;
  }
  function rsRemainder(data, divisor) {
    const out = new Array(divisor.length).fill(0);
    data.forEach((b) => { const f = b ^ out.shift(); out.push(0); divisor.forEach((c, i) => { out[i] ^= gfMul(c, f); }); });
    return out;
  }

  /* ---------- the bit stream: mode, count, bytes, terminator, padding ---------- */
  function toBytes(text) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(text));
    return Array.from(Buffer.from(text, "utf8"));
  }
  function codewords(bytes, v) {
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => push(b, 8));
    const total = dataCodewords(v) * 8;
    push(0, Math.min(4, total - bits.length));
    while (bits.length % 8) bits.push(0);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let pad = 0xec; out.length < dataCodewords(v); pad ^= 0xec ^ 0x11) out.push(pad);
    // split into blocks, add error correction to each, then interleave
    const [ecLen, groups] = EC_M[v];
    const divisor = rsDivisor(ecLen);
    const blocks = [];
    let k = 0;
    groups.forEach(([count, len]) => { for (let i = 0; i < count; i++) { const d = out.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, divisor) }); } });
    const longest = Math.max(...blocks.map((b) => b.d.length));
    const result = [];
    for (let i = 0; i < longest; i++) blocks.forEach((b) => { if (i < b.d.length) result.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach((b) => result.push(b.e[i]));
    return result;
  }

  /* ---------- the grid ---------- */
  function alignmentCentres(v) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, size = v * 4 + 17;
    const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const out = [6];
    for (let i = 0, pos = size - 7; i < n - 1; i++, pos -= step) out.splice(1, 0, pos);
    return out;
  }
  function makeGrid(v) {
    const size = v * 4 + 17;
    const dark = [], fixed = []; // fixed: finders, timing, alignment, format and version areas; data never goes there
    for (let y = 0; y < size; y++) { dark.push(new Array(size).fill(false)); fixed.push(new Array(size).fill(false)); }
    const set = (x, y, on) => { if (x >= 0 && y >= 0 && x < size && y < size) { dark[y][x] = on; fixed[y][x] = true; } };
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const centres = alignmentCentres(v);
    centres.forEach((cx, i) => centres.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === centres.length - 1) || (i === centres.length - 1 && j === 0)) return; // under a finder
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    for (let i = 0; i < 8; i++) { set(8, i, false); set(i, 8, false); set(size - 1 - i, 8, false); set(8, size - 1 - i, false); } // format areas, filled in later
    set(8, 8, false);
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); } // timing, between the finders and over the format areas (they cross at (6, 8) and (8, 6))
    if (v >= 7) { // version information, both copies
      let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const on = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, on); set(b, a, on); }
    }
    return { size, dark, fixed };
  }
  function placeData(g, cw) {
    const { size, dark, fixed } = g;
    let i = 0, total = cw.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < total) { dark[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
  }
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  function applyMask(g, m) { const f = MASKS[m]; for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fixed[y][x] && f(x, y)) g.dark[y][x] = !g.dark[y][x]; }
  function drawFormat(g, m) {
    const data = m; // level M is 00, so the five data bits are the mask alone
    let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1, size = g.size, set = (x, y, on) => { g.dark[y][x] = on; };
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true); // the one module that is always dark
  }
  // The standard's four penalty rules: long runs, 2 by 2 blocks, finder look-alikes, dark balance.
  function penalty(g) {
    const { size, dark } = g;
    let p = 0;
    const line = (cells) => {
      let run = 1;
      for (let i = 1; i <= cells.length; i++) { if (i < cells.length && cells[i] === cells[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
      const s = cells.map((c) => (c ? "1" : "0")).join("");
      for (let i = 0; (i = s.indexOf("1011101", i)) !== -1; i++) { if (s.slice(Math.max(0, i - 4), i) === "0000" || s.slice(i + 7, i + 11) === "0000") p += 40; }
    };
    for (let y = 0; y < size; y++) line(dark[y]);
    for (let x = 0; x < size; x++) line(dark.map((row) => row[x]));
    for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) { const c = dark[y][x]; if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) p += 3; }
    let darkCount = 0; dark.forEach((row) => row.forEach((c) => { if (c) darkCount++; }));
    const pct = (darkCount * 100) / (size * size);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10; // ten for every full five percent away from half dark
    return p;
  }

  /* ---------- public ---------- */
  // encode(text, { mask }) -> { version, size, mask, modules } where modules[y][x] is true for a dark module.
  function encode(text, opts) {
    const bytes = toBytes(String(text));
    let v = 1; while (v <= MAX_VERSION && capacity(v) < bytes.length) v++;
    if (v > MAX_VERSION) throw new Error("too long for a QR code here (" + bytes.length + " bytes, " + capacity(MAX_VERSION) + " fit)");
    const cw = codewords(bytes, v);
    const forced = opts && Number.isInteger(opts.mask) ? opts.mask : -1;
    let best = null;
    for (let m = 0; m < 8; m++) {
      if (forced >= 0 && m !== forced) continue;
      const g = makeGrid(v); placeData(g, cw); applyMask(g, m); drawFormat(g, m);
      const p = penalty(g);
      if (!best || p < best.p) best = { p, m, g };
    }
    return { version: v, size: best.g.size, mask: best.m, modules: best.g.dark };
  }
  // An SVG string: a four-module quiet zone, black on white whatever the page's theme, so cameras read it.
  function svg(text, opts) {
    const q = encode(text, opts), quiet = 4, n = q.size + quiet * 2;
    let d = "";
    q.modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += "M" + (x + quiet) + " " + (y + quiet) + "h1v1h-1z"; }));
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + n + " " + n + "\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"" + (opts && opts.label ? String(opts.label).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c])) : "QR code") + "\">" +
      "<rect width=\"" + n + "\" height=\"" + n + "\" fill=\"#fff\"/><path d=\"" + d + "\" fill=\"#000\"/></svg>";
  }
  return { encode, svg, capacity, MAX_VERSION };
});
