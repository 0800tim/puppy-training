#!/usr/bin/env node
/*
 * Puppy School HQ — tiny self-hosted server.
 * Serves the app from ../public and keeps one shared family chart behind a PIN.
 * Zero dependencies. Node 18+.
 *
 *   PUPPY_PIN=482913 node server/server.js
 *
 * Environment:
 *   PUPPY_PIN       required. 4 to 8 digits. 6+ recommended if reachable from the internet.
 *   PORT            default 8080
 *   HOST            default 0.0.0.0
 *   DATA_DIR        default ./data (relative to the repo)
 *   SESSION_DAYS    how long a phone stays unlocked, default 180
 *   TRUST_PROXY     "1" when behind a reverse proxy / tunnel (uses X-Forwarded-For / -Proto)
 *   SESSION_SECRET  optional; otherwise one is generated and stored in DATA_DIR/secret.key
 */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const VERSION = "1.0.0";
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: https://i.ytimg.com",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com", "connect-src 'self'", "frame-ancestors 'none'",
  "base-uri 'none'", "form-action 'none'"
].join("; ");

const TICK_RE = /^\d{4}-\d{2}-\d{2}_[A-Za-z0-9]{1,24}_(am|pm|ev)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES = new Set(["selfcontrol", "recall", "tricks", "manners", "helper"]);

function createApp(opts = {}) {
  const pin = String(opts.pin ?? process.env.PUPPY_PIN ?? "");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Set PUPPY_PIN to 4 to 8 digits (6 or more recommended).");
  const dataDir = path.resolve(opts.dataDir ?? process.env.DATA_DIR ?? path.join(__dirname, "..", "data"));
  const sessionDays = Number(opts.sessionDays ?? process.env.SESSION_DAYS ?? 180);
  const trustProxy = String(opts.trustProxy ?? process.env.TRUST_PROXY ?? "") === "1";
  const limits = Object.assign({ perIp: 5, perIpWindowMs: 15 * 60e3, global: 20, globalWindowMs: 60 * 60e3 }, opts.limits || {});
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((...a) => console.log(new Date().toISOString(), ...a));

  fs.mkdirSync(dataDir, { recursive: true });

  /* ---------- secret + session tokens ---------- */
  let secret = opts.secret || process.env.SESSION_SECRET;
  if (!secret) {
    const kf = path.join(dataDir, "secret.key");
    if (fs.existsSync(kf)) secret = fs.readFileSync(kf, "utf8").trim();
    else { secret = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(kf, secret, { mode: 0o600 }); }
  }
  const pinTag = crypto.createHmac("sha256", secret).update("pin:" + pin).digest("hex").slice(0, 16); // changing the PIN logs everyone out
  const sign = (payload) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const makeToken = () => { const p = Buffer.from(JSON.stringify({ exp: now() + sessionDays * 864e5, v: pinTag })).toString("base64url"); return p + "." + sign(p); };
  function validToken(tok) {
    if (!tok || typeof tok !== "string") return false;
    const [p, s] = tok.split(".");
    if (!p || !s) return false;
    const expect = Buffer.from(sign(p)); const got = Buffer.from(s);
    if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return false;
    try { const j = JSON.parse(Buffer.from(p, "base64url").toString()); return j.v === pinTag && j.exp > now(); } catch { return false; }
  }
  const pinHash = crypto.createHash("sha256").update(pin).digest();
  const pinMatches = (tryPin) => crypto.timingSafeEqual(pinHash, crypto.createHash("sha256").update(String(tryPin)).digest());

  /* ---------- brute-force protection ---------- */
  const fails = new Map(); // ip -> [timestamps]
  let globalFails = [];
  function lockedFor(ip) {
    const t = now();
    const mine = (fails.get(ip) || []).filter((x) => t - x < limits.perIpWindowMs);
    fails.set(ip, mine);
    globalFails = globalFails.filter((x) => t - x < limits.globalWindowMs);
    if (mine.length >= limits.perIp) return Math.ceil((mine[0] + limits.perIpWindowMs - t) / 1000);
    if (globalFails.length >= limits.global) return Math.ceil((globalFails[0] + limits.globalWindowMs - t) / 1000);
    return 0;
  }
  function recordFail(ip) { const t = now(); fails.set(ip, [...(fails.get(ip) || []), t]); globalFails.push(t); }

  /* ---------- store ---------- */
  const storeFile = path.join(dataDir, "store.json");
  let db = { rev: 1, settings: null, ticks: {}, logs: {} };
  if (fs.existsSync(storeFile)) { try { db = Object.assign(db, JSON.parse(fs.readFileSync(storeFile, "utf8"))); } catch (e) { log("store.json unreadable, starting fresh:", e.message); } }
  function persist() {
    db.rev++;
    const tmp = storeFile + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, storeFile);
  }
  const stateOut = () => ({ rev: db.rev, settings: db.settings, ticks: db.ticks, logs: db.logs });

  function cleanSettings(x) {
    if (!x || typeof x !== "object") return null;
    const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const p = x.puppy || {};
    const fam = Array.isArray(x.family) ? x.family.slice(0, 6) : [];
    const family = fam.map((m) => ({ id: str(m && m.id, 24), name: str(m && m.name, 20), role: ROLES.has(m && m.role) ? m.role : "helper" }))
      .filter((m) => /^[A-Za-z0-9]{1,24}$/.test(m.id) && m.name);
    if (!family.length) return null;
    return {
      puppy: { name: str(p.name, 24), sex: p.sex === "boy" ? "boy" : "girl", breed: str(p.breed, 80), born: DATE_RE.test(p.born) ? p.born : "" },
      start: DATE_RE.test(x.start) ? x.start : new Date().toISOString().slice(0, 10),
      family
    };
  }

  /* ---------- http helpers ---------- */
  const clientIp = (req) => (trustProxy && req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress) || "?";
  const isHttps = (req) => (trustProxy ? String(req.headers["x-forwarded-proto"] || "").startsWith("https") : !!req.socket.encrypted);
  function cookies(req) { const o = {}; String(req.headers.cookie || "").split(";").forEach((c) => { const i = c.indexOf("="); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
  function send(res, code, body, headers = {}) {
    const isObj = body !== undefined && typeof body !== "string" && !Buffer.isBuffer(body);
    res.writeHead(code, Object.assign({ "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Content-Security-Policy": CSP }, headers));
    res.end(isObj ? JSON.stringify(body) : body);
  }
  function readJson(req) {
    return new Promise((resolve, reject) => {
      if (!/application\/json/.test(String(req.headers["content-type"] || ""))) return reject(Object.assign(new Error("JSON only"), { code: 415 }));
      let size = 0; const chunks = [];
      req.on("data", (c) => { size += c.length; if (size > 32 * 1024) { reject(Object.assign(new Error("too big"), { code: 413 })); req.destroy(); } else chunks.push(c); });
      req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch { reject(Object.assign(new Error("bad JSON"), { code: 400 })); } });
      req.on("error", reject);
    });
  }
  function serveStatic(req, res, urlPath) {
    let rel = decodeURIComponent(urlPath);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, "Not found");
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Not found");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Content-Security-Policy": CSP });
      fs.createReadStream(file).pipe(res);
    });
  }

  /* ---------- routes ---------- */
  async function handle(req, res) {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;
    if (!p.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      return serveStatic(req, res, p);
    }
    if (p === "/api/health") return send(res, 200, { app: "puppy-training", version: VERSION, pin: true });

    if (p === "/api/login" && req.method === "POST") {
      const ip = clientIp(req);
      const wait = lockedFor(ip);
      if (wait > 0) { log("login locked", ip); return send(res, 429, { error: "Too many tries", retryAfter: wait }, { "Retry-After": String(wait) }); }
      const body = await readJson(req);
      if (!pinMatches(body.pin ?? "")) { recordFail(ip); log("login failed", ip); return send(res, 401, { error: "Wrong PIN" }); }
      fails.delete(ip);
      log("login ok", ip);
      const cookie = "pt_session=" + makeToken() + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + Math.floor(sessionDays * 86400) + (isHttps(req) ? "; Secure" : "");
      return send(res, 200, { ok: true }, { "Set-Cookie": cookie });
    }
    if (p === "/api/logout" && req.method === "POST") return send(res, 200, { ok: true }, { "Set-Cookie": "pt_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });

    if (!validToken(cookies(req).pt_session)) return send(res, 401, { error: "PIN needed" });

    if (p === "/api/state" && req.method === "GET") {
      const since = Number(u.searchParams.get("since"));
      if (since && since === db.rev) return send(res, 200, { unchanged: true, rev: db.rev });
      return send(res, 200, stateOut());
    }
    if (p === "/api/settings" && req.method === "PUT") {
      const s = cleanSettings(await readJson(req));
      if (!s) return send(res, 400, { error: "Need at least one family member" });
      db.settings = s; persist(); return send(res, 200, stateOut());
    }
    let m;
    if ((m = p.match(/^\/api\/ticks\/([^/]+)$/)) && req.method === "PUT") {
      const key = decodeURIComponent(m[1]);
      if (!TICK_RE.test(key)) return send(res, 400, { error: "Bad tick" });
      const body = await readJson(req);
      if (body.on) db.ticks[key] = { at: now() }; else delete db.ticks[key];
      persist(); return send(res, 200, stateOut());
    }
    if ((m = p.match(/^\/api\/logs\/(\d{4}-\d{2}-\d{2})$/)) && req.method === "PUT") {
      const body = await readJson(req);
      const bite = Number(body.bite);
      if (!Number.isInteger(bite) || bite < 0 || bite > 5) return send(res, 400, { error: "Bad value" });
      if (bite === 0) delete db.logs[m[1]]; else db.logs[m[1]] = { bite };
      persist(); return send(res, 200, stateOut());
    }
    return send(res, 404, { error: "Not found" });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      const code = [400, 413, 415].includes(e.code) ? e.code : 500;
      if (code === 500) log("error", e);
      if (!res.headersSent) send(res, code, { error: code === 500 ? "Server error" : e.message });
    });
  });
  return server;
}

module.exports = { createApp };

if (require.main === module) {
  let server;
  try { server = createApp(); } catch (e) { console.error(e.message); process.exit(1); }
  const port = Number(process.env.PORT || 8080), host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => console.log(`Puppy School HQ on http://${host}:${port}`));
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
}
