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
const CONTENT = require("../public/content.js");
const REWARDS = require("../public/rewards.js");
const PUSH = require("./push.js");
const NOTIFY = require("./notify.js");

const VERSION = "2.0.0";
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: blob: https://i.ytimg.com",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com", "connect-src 'self'", "frame-ancestors 'none'",
  "base-uri 'none'", "form-action 'none'"
].join("; ");

const TICK_RE = /^\d{4}-\d{2}-\d{2}_[A-Za-z0-9]{1,24}_(am|pm|ev)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A date that is the right shape and a real calendar day in this century (2026-02-30 and 2026-13-01 are not).
const realDate = (s) => { if (!DATE_RE.test(s) || s < "2000-01-01" || s > "2099-12-31") return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const KINDS = new Set(["kid", "adult"]);
const AGES = new Set(["", "5-7", "8-9", "10-11", "12-14", "15+"]);
const SKILL_IDS = new Set(CONTENT.skills.map((s) => s.id));
const TOILET_KINDS = new Set(CONTENT.toiletKinds.map((k) => k[0]));
const TOILET_BEFORE = new Set(CONTENT.toiletBefore.map((k) => k[0]));
const SOCIAL_ITEMS = new Set(CONTENT.socialGroups.flatMap((g) => g.items.map((it, i) => g.id + ":" + i)));
const SOCIAL_MOODS = new Set(CONTENT.socialMoods.map((m) => m[0]));
const HEALTH_KINDS = new Set(CONTENT.health.kinds.map((k) => k[0]));
// Browsers only hand out push endpoints on these services. Anything else is a request to POST to a stranger's server.
const PUSH_HOSTS = [".push.services.mozilla.com", "fcm.googleapis.com", "android.googleapis.com", ".notify.windows.com", "web.push.apple.com", ".push.apple.com"];
const pushHostOk = (endpoint) => { try { const h = new URL(endpoint).hostname; return PUSH_HOSTS.some((d) => (d.startsWith(".") ? h.endsWith(d) : h === d)); } catch { return false; } };
const PUSH_CAP = 40;
const UNDO_MS = 15 * 60e3;
const localToday = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

function createApp(opts = {}) {
  const pin = String(opts.pin ?? process.env.PUPPY_PIN ?? "");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Set PUPPY_PIN to 4 to 8 digits (6 or more recommended).");
  const dataDir = path.resolve(opts.dataDir ?? process.env.DATA_DIR ?? path.join(__dirname, "..", "data"));
  const sessionDays = Number(opts.sessionDays ?? process.env.SESSION_DAYS ?? 180);
  const trustProxy = String(opts.trustProxy ?? process.env.TRUST_PROXY ?? "") === "1";
  const limits = Object.assign({ perIp: 5, perIpWindowMs: 15 * 60e3, global: 20, globalWindowMs: 60 * 60e3 }, opts.limits || {});
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((...a) => console.log(new Date().toISOString(), ...a));
  const pushSubject = opts.pushSubject || process.env.PUSH_SUBJECT || "mailto:hello@growthspurt.agency";
  const adultPin = String(opts.adultPin ?? process.env.PUPPY_ADULT_PIN ?? "");
  if (adultPin && !/^\d{4,8}$/.test(adultPin)) throw new Error("PUPPY_ADULT_PIN must be 4 to 8 digits, or unset.");

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
  const makeMe = (pid) => { const p = Buffer.from(JSON.stringify({ pid, v: pinTag })).toString("base64url"); return p + "." + sign(p); };
  function validMe(tok) {
    if (!tok || typeof tok !== "string") return null;
    const [p, s] = tok.split("."); if (!p || !s) return null;
    const expect = Buffer.from(sign(p)); const got = Buffer.from(s);
    if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
    try { const j = JSON.parse(Buffer.from(p, "base64url").toString()); return j.v === pinTag && typeof j.pid === "string" ? j.pid : null; } catch { return null; }
  }
  const meCookie = (req, pid) => "pt_me=" + (pid ? makeMe(pid) : "") + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + (pid ? Math.floor(sessionDays * 86400) : 0) + (isHttps(req) ? "; Secure" : "");
  const pinHash = crypto.createHash("sha256").update(pin).digest();
  const pinMatches = (tryPin) => crypto.timingSafeEqual(pinHash, crypto.createHash("sha256").update(String(tryPin)).digest());
  const adultPinHash = adultPin ? crypto.createHash("sha256").update(adultPin).digest() : null;
  const adultPinMatches = (tryPin) => !!adultPinHash && crypto.timingSafeEqual(adultPinHash, crypto.createHash("sha256").update(String(tryPin)).digest());

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
  let db = { rev: 1, settings: null, ticks: {}, logs: {}, mastery: {}, toilet: [], push: [], sent: null, social: {}, share: null, health: [] };
  if (fs.existsSync(storeFile)) { try { db = Object.assign(db, JSON.parse(fs.readFileSync(storeFile, "utf8"))); } catch (e) { log("store.json unreadable, starting fresh:", e.message); } }
  function persist(bump = true) {
    if (bump) db.rev++;
    const tmp = storeFile + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, storeFile);
  }
  const photoFile = path.join(dataDir, "photo.jpg");
  const stateOut = () => ({ rev: db.rev, settings: db.settings, ticks: db.ticks, logs: db.logs, mastery: db.mastery, toilet: db.toilet.slice(-300), social: db.social || {}, health: (db.health || []).filter((h) => !h.void), photo: fs.existsSync(photoFile), today: localToday(),
    push: (db.push || []).map((s) => ({ id: s.id, pid: s.pid, prefs: s.prefs || {}, created: s.created, label: s.label || "" })), sms: !!smsSender, vapid: vapid.publicKey, share: db.share ? { token: db.share.token, created: db.share.created } : null });
  /* ---------- push keys, notifier ---------- */
  const vapidFile = path.join(dataDir, "vapid.json");
  let vapid;
  if (fs.existsSync(vapidFile)) vapid = JSON.parse(fs.readFileSync(vapidFile, "utf8"));
  else { vapid = PUSH.generateVapidKeys(); fs.writeFileSync(vapidFile, JSON.stringify(vapid), { mode: 0o600 }); }
  const smsSender = opts.sms === null ? null : (opts.sms || NOTIFY.makeSmsSender(process.env));
  const notifier = opts.noScheduler ? null : NOTIFY.createNotifier({ db, C: CONTENT, R: REWARDS, keys: vapid, subject: pushSubject, log, persist, sendPush: opts.sendPush || PUSH.sendPush, sendSms: smsSender || (async () => { throw new Error("no SMS gateway configured"); }), now: opts.now ? () => new Date(now()) : undefined });
  const member = (id) => (db.settings && db.settings.family.find((m) => m.id === id)) || null;

  function cleanSettings(x) {
    if (!x || typeof x !== "object") return null;
    const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const p = x.puppy || {};
    const fam = Array.isArray(x.family) ? x.family.slice(0, 6) : [];
    const family = fam.map((m) => {
      const kind = KINDS.has(m && m.kind) ? m.kind : "kid";
      const t = Number(m && m.target);
      return { id: str(m && m.id, 24), name: str(m && m.name, 20), kind, age: AGES.has(m && m.age) ? m.age : "",
        target: Number.isInteger(t) && t >= 1 && t <= 30 ? t : CONTENT.kinds[kind].target,
        phone: NOTIFY.normalisePhone(m && m.phone), sms: !!(m && m.sms) };
    }).filter((m) => /^[A-Za-z0-9]{1,24}$/.test(m.id) && m.name);
    if (!family.length) return null;
    return {
      puppy: { name: str(p.name, 24), sex: p.sex === "boy" ? "boy" : "girl", breed: str(p.breed, 80), born: DATE_RE.test(p.born) ? p.born : "" },
      start: DATE_RE.test(x.start) ? x.start : new Date().toISOString().slice(0, 10),
      family
    };
  }

  /* ---------- the visitor card: one page for grandparents and sitters, no PIN, by link only ---------- */
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function visitorHtml(st) {
    const name = st ? esc(st.puppy.name || "the puppy") : "";
    const she = st && st.puppy.sex === "boy" ? "he" : "she";
    const T = (x) => esc(st && st.puppy.sex === "boy" ? String(x).replace(/\bshe\b/g, "he").replace(/\bShe\b/g, "He").replace(/\bher\b/g, "him") : x);
    const li = (arr) => arr.map((x) => "<li>" + T(x) + "</li>").join("");
    const body = !st ? "<h1>No card here</h1><p>This link has been turned off. Ask the family for a new one.</p>" :
      "<h1>Looking after " + name + "</h1><p class=\"lead\">Thanks for helping. " + (name) + " is a puppy in training. The family use these exact words and these few rules, and it works best when everyone does. Nothing here is hard.</p>" +
      "<h2>Say it once, the same way</h2><table>" + CONTENT.cues.map(([a, b]) => "<tr><th>" + esc(a) + "</th><td>" + T(b) + "</td></tr>").join("") + "</table>" +
      "<h2>If " + she + " bites</h2><ol>" + li(CONTENT.sos.steps) + "</ol>" +
      "<h2>House rules</h2><ul>" + li(CONTENT.rules) + "</ul>" +
      "<h2>Kids and " + name + "</h2><ul>" + li(CONTENT.kids.rules) + "</ul>" +
      "<h2>Never give</h2><p>" + esc(CONTENT.treats.never) + "</p>" +
      "<p class=\"foot\">Made with Puppy School HQ, free and open source. This page is private to people with the link.</p>";
    return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>" + (st ? "Looking after " + name : "Puppy School HQ") + "</title>" +
      "<style>body{margin:0;background:#f4f3fa;color:#1c1a33;font:17px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:640px;margin:0 auto;padding:28px 18px 60px}h1{font-size:1.9rem;line-height:1.1;margin:0 0 10px}h2{font-size:1.1rem;margin:28px 0 8px;color:#5b4bf0;text-transform:uppercase;letter-spacing:.06em}.lead{font-size:1.05rem;color:#4a476a}table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #e3e1ee;vertical-align:top}th{white-space:nowrap;width:1%}ul,ol{padding-left:20px}li{margin:6px 0}.foot{margin-top:40px;color:#6e6b8a;font-size:.85rem}@media(prefers-color-scheme:dark){body{background:#131225;color:#ededf7}table{background:#1d1b33}th,td{border-color:rgba(255,255,255,.08)}.lead{color:#c9c6e4}h2{color:#8b7cff}.foot{color:#9d9bbd}}</style></head><body><main>" + body + "</main></body></html>";
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
  function readJson(req, max = 32 * 1024) {
    return new Promise((resolve, reject) => {
      if (!/application\/json/.test(String(req.headers["content-type"] || ""))) return reject(Object.assign(new Error("JSON only"), { code: 415 }));
      let size = 0; const chunks = [];
      req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too big"), { code: 413 })); req.destroy(); } else chunks.push(c); });
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
    let m;
    if (!p.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      return serveStatic(req, res, p);
    }
    if (p === "/api/health") return send(res, 200, { app: "puppy-training", version: VERSION, pin: true });
    if ((m = p.match(/^\/api\/visitor\/([a-f0-9]{24})$/)) && req.method === "GET") {
      const tok = Buffer.from(m[1]), real = Buffer.from(db.share ? db.share.token : "x".repeat(24));
      if (!db.settings || tok.length !== real.length || !crypto.timingSafeEqual(tok, real)) return send(res, 404, visitorHtml(null), { "Content-Type": "text/html; charset=utf-8" });
      return send(res, 200, visitorHtml(db.settings), { "Content-Type": "text/html; charset=utf-8" });
    }

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
    if (p === "/api/logout" && req.method === "POST") { res.setHeader("Set-Cookie", ["pt_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", "pt_me=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"]); return send(res, 200, { ok: true }); }

    const ck = cookies(req);
    if (!validToken(ck.pt_session)) return send(res, 401, { error: "PIN needed" });
    // Who is this phone? Set once with POST /api/me, signed by the server, never taken from a request body.
    const me = member(validMe(ck.pt_me));
    const isAdult = me && me.kind === "adult";
    const hasAdult = !!(db.settings && db.settings.family.some((x) => x.kind === "adult"));
    const out = (extra) => Object.assign(stateOut(), { me: me ? me.id : null, adultPin: !!adultPinHash }, extra || {});
    const needMe = () => send(res, 403, { error: "Pick yourself first", code: "pick" });

    if (p === "/api/state" && req.method === "GET") {
      const since = Number(u.searchParams.get("since"));
      if (since && since === db.rev) return send(res, 200, { unchanged: true, rev: db.rev, me: me ? me.id : null });
      return send(res, 200, out());
    }
    if (p === "/api/me" && req.method === "POST") {
      const body = await readJson(req);
      const who = member(body.pid);
      if (!who) return send(res, 400, { error: "Who?" });
      if (who.kind === "adult" && adultPinHash) {
        const ip = clientIp(req);
        const wait = lockedFor(ip);
        if (wait > 0) return send(res, 429, { error: "Too many tries", retryAfter: wait }, { "Retry-After": String(wait) });
        if (!adultPinMatches(body.adultPin ?? "")) { recordFail(ip); log("adult pin failed", ip); return send(res, 403, { error: "Grown-up PIN needed", code: "adultpin" }); }
        fails.delete(ip);
      }
      log("me", who.id, clientIp(req));
      return send(res, 200, Object.assign(stateOut(), { me: who.id, adultPin: !!adultPinHash }), { "Set-Cookie": meCookie(req, who.id) });
    }
    if (p === "/api/me" && req.method === "DELETE") return send(res, 200, out({ me: null }), { "Set-Cookie": meCookie(req, null) });
    if (p === "/api/settings" && req.method === "PUT") {
      // Once a grown-up exists, only a grown-up can change the family, goals and phone numbers.
      if (hasAdult && !isAdult) return send(res, 403, { error: "Ask a grown-up to change the family" });
      const s = cleanSettings(await readJson(req));
      if (!s) return send(res, 400, { error: "Need at least one family member" });
      db.settings = s; persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/ticks\/([^/]+)$/)) && req.method === "PUT") {
      const key = decodeURIComponent(m[1]);
      if (!TICK_RE.test(key)) return send(res, 400, { error: "Bad tick" });
      const body = await readJson(req);
      if (!me) return needMe();
      const date = key.slice(0, 10);
      if (!isAdult && date < localToday()) return send(res, 403, { error: "Ask a grown-up to log a past day" });
      const prev = db.ticks[key];
      if (!body.on && prev && !isAdult && prev.by && prev.by !== me.id && now() - (prev.at || 0) > UNDO_MS) return send(res, 403, { error: "Only " + (member(prev.by) || { name: "they" }).name + " or a grown-up can undo that" });
      if (body.on) db.ticks[key] = { at: now(), by: me.id, skill: SKILL_IDS.has(body.skill) ? body.skill : undefined };
      else delete db.ticks[key];
      (db.push || []).forEach((s) => { if (s.pid === me.id) s.unanswered = 0; });
      persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/mastery\/([a-z]+)$/)) && req.method === "PUT") {
      const skill = m[1];
      if (!SKILL_IDS.has(skill)) return send(res, 400, { error: "Unknown skill" });
      const body = await readJson(req);
      if (!me) return needMe();
      const by = me, witness = member(body.witness);
      const entry = (db.mastery[skill] = db.mastery[skill] || { done: [] });
      entry.done = entry.done.filter((d) => d.by !== by.id);
      if (body.on !== false) {
        if (!witness || witness.id === by.id) return send(res, 400, { error: "Needs a witness who isn't you" });
        entry.done.push({ by: by.id, witness: witness.id, at: now() });
      }
      persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/social\/([a-z]+:\d+)$/)) && req.method === "PUT") {
      if (!SOCIAL_ITEMS.has(m[1])) return send(res, 400, { error: "Unknown item" });
      const body = await readJson(req);
      if (!me) return needMe();
      const by = me;
      db.social = db.social || {};
      const L = (db.social[m[1]] = db.social[m[1]] || []).filter((x) => x.by !== by.id);
      if (body.on !== false) { if (!SOCIAL_MOODS.has(body.mood)) return send(res, 400, { error: "How did it go?" }); L.push({ by: by.id, mood: body.mood, at: now() }); }
      db.social[m[1]] = L;
      persist(); return send(res, 200, out());
    }
    if (p === "/api/toilet" && req.method === "POST") {
      const body = await readJson(req);
      if (!me) return needMe();
      if (!TOILET_KINDS.has(body.kind)) return send(res, 400, { error: "Bad kind" });
      const id = crypto.randomBytes(6).toString("hex");
      db.toilet.push({ id, at: now(), kind: body.kind, before: TOILET_BEFORE.has(body.before) ? body.before : "", by: me.id });
      if (db.toilet.length > 1000) db.toilet = db.toilet.slice(-1000);
      persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/toilet\/([a-f0-9]{12})$/)) && req.method === "DELETE") {
      const t = db.toilet.find((x) => x.id === m[1]);
      if (!t) return send(res, 404, { error: "Not found" });
      if (!me) return needMe();
      if (!isAdult && !(t.by === me.id && now() - t.at <= UNDO_MS)) return send(res, 403, { error: "You can undo your own entry for 15 minutes; a grown-up can undo any" });
      t.void = true; persist(); return send(res, 200, out());
    }
    if (p === "/api/push/subscribe" && req.method === "POST") {
      const body = await readJson(req);
      if (!me) return needMe();
      const sub = body.subscription;
      if (!sub || typeof sub.endpoint !== "string" || sub.endpoint.length > 2048 || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return send(res, 400, { error: "Bad subscription" });
      if (!pushHostOk(sub.endpoint)) return send(res, 400, { error: "That push service isn't one we send to" });
      const existing = (db.push || []).filter((s) => s.endpoint !== sub.endpoint);
      if (existing.length >= PUSH_CAP) return send(res, 409, { error: "Too many phones have reminders on. Turn them off on an old phone first." });
      db.push = existing;
      const id = crypto.createHash("sha256").update(sub.endpoint).digest("hex").slice(0, 12);
      const prefs = Object.assign({}, NOTIFY.DEFAULTS, body.prefs && typeof body.prefs === "object" ? body.prefs : {});
      db.push.push({ id, pid: me.id, endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, prefs, created: now(), label: String(body.label || "").slice(0, 40), unanswered: 0 });
      persist(); return send(res, 200, out({ subId: id }));
    }
    if ((m = p.match(/^\/api\/push\/([a-f0-9]{12})$/)) && req.method === "PUT") {
      const sub = (db.push || []).find((s) => s.id === m[1]);
      if (!sub) return send(res, 404, { error: "Not found" });
      const body = await readJson(req);
      if (!me) return needMe();
      if (me.id !== sub.pid && !isAdult) return send(res, 403, { error: "Only that person or a grown-up can change this" });
      const allowed = ["on", "am", "pm", "ev", "risk", "amAt", "amWeekendAt", "pmAt", "evAt", "riskAt"];
      const prefs = Object.assign({}, sub.prefs || {});
      allowed.forEach((k) => { if (body.prefs && k in body.prefs) { const v = body.prefs[k]; if (/At$/.test(k)) { if (/^\d{2}:\d{2}$/.test(v)) prefs[k] = v; } else prefs[k] = !!v; } });
      sub.prefs = prefs; if (prefs.on) sub.unanswered = 0;
      persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/push\/([a-f0-9]{12})$/)) && req.method === "DELETE") {
      const sub = (db.push || []).find((s) => s.id === m[1]);
      if (!sub) return send(res, 404, { error: "Not found" });
      if (!me) return needMe();
      if (me.id !== sub.pid && !isAdult) return send(res, 403, { error: "Only that person or a grown-up can turn this off" });
      db.push = db.push.filter((s) => s.id !== m[1]); persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/push\/([a-f0-9]{12})\/test$/)) && req.method === "POST") {
      const sub = (db.push || []).find((s) => s.id === m[1]);
      if (!sub) return send(res, 404, { error: "Not found" });
      if (!me) return needMe();
      if (me.id !== sub.pid && !isAdult) return send(res, 403, { error: "Only that person or a grown-up can test this" });
      const pup = (db.settings && db.settings.puppy.name) || "Your puppy";
      try { const r = await (opts.sendPush || PUSH.sendPush)(sub, { title: pup + " says", body: "Reminders are on for this phone. " + pup + " will nudge you when a session is empty, never during school or at night.", tag: "test", url: "/#today" }, vapid, pushSubject);
        if (r.gone) { db.push = db.push.filter((s) => s.id !== sub.id); persist(); return send(res, 410, { error: "That subscription has expired. Turn reminders on again." }); }
        return send(res, 200, { ok: true, status: r.status });
      } catch (e) { return send(res, 502, { error: "Push failed: " + e.message }); }
    }
    if (p === "/api/sms/test" && req.method === "POST") {
      const body = await readJson(req);
      const to = member(body.pid);
      if (!isAdult) return send(res, 403, { error: "Grown-ups only" });
      if (!to || !to.phone) return send(res, 400, { error: "No phone number saved for that person" });
      if (!smsSender) return send(res, 503, { error: "No SMS gateway configured on this server" });
      const pup = (db.settings && db.settings.puppy.name) || "Your puppy";
      try { await smsSender(to.phone, pup + " here. Texts are on for " + to.name + ". I'll text once a day at most, only if nothing is on the chart. puppy.appspurt.com"); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 502, { error: "SMS failed: " + e.message }); }
    }
    if (p === "/api/healthlog" && req.method === "POST") {
      if (!isAdult) return send(res, 403, { error: "Grown-ups log health" });
      const body = await readJson(req);
      if (!HEALTH_KINDS.has(body.kind)) return send(res, 400, { error: "Bad kind" });
      if (!realDate(body.date)) return send(res, 400, { error: "Bad date" });
      const kg = body.kind === "weight" ? Number(body.kg) : undefined;
      if (body.kind === "weight" && !(kg > 0 && kg < 120)) return send(res, 400, { error: "Weight in kg, please" });
      const entry = { id: crypto.randomBytes(6).toString("hex"), at: now(), date: body.date, kind: body.kind, note: typeof body.note === "string" ? body.note.trim().slice(0, 80) : "", by: me.id };
      if (kg !== undefined) entry.kg = Math.round(kg * 100) / 100;
      db.health = db.health || []; db.health.push(entry);
      if (db.health.length > 500) db.health = db.health.slice(-500);
      persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/healthlog\/([a-f0-9]{12})$/)) && req.method === "DELETE") {
      if (!isAdult) return send(res, 403, { error: "Grown-ups log health" });
      const h = (db.health || []).find((x) => x.id === m[1]);
      if (!h) return send(res, 404, { error: "Not found" });
      h.void = true; persist(); return send(res, 200, out());
    }
    if (p === "/api/share" && req.method === "POST") {
      if (!isAdult) return send(res, 403, { error: "Grown-ups only" });
      db.share = { token: crypto.randomBytes(12).toString("hex"), created: now() };
      log("visitor link created", me.id);
      persist(); return send(res, 200, out());
    }
    if (p === "/api/share" && req.method === "DELETE") {
      if (!isAdult) return send(res, 403, { error: "Grown-ups only" });
      db.share = null; persist(); return send(res, 200, out());
    }
    if (p === "/api/photo") {
      if (req.method === "GET") {
        if (!fs.existsSync(photoFile)) return send(res, 404, "No photo");
        res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" });
        return fs.createReadStream(photoFile).pipe(res);
      }
      if (req.method === "PUT") {
        if (hasAdult && !isAdult) return send(res, 403, { error: "Ask a grown-up to change the photo" });
        const body = await readJson(req, 600 * 1024);
        const mm = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ""));
        if (!mm) return send(res, 400, { error: "Send a JPEG data URL" });
        const buf = Buffer.from(mm[1], "base64");
        if (buf.length < 100 || buf.length > 400 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return send(res, 400, { error: "Not a JPEG, or too big" });
        fs.writeFileSync(photoFile, buf, { mode: 0o600 });
        persist(); return send(res, 200, out());
      }
      if (req.method === "DELETE") { if (hasAdult && !isAdult) return send(res, 403, { error: "Ask a grown-up to change the photo" }); try { fs.unlinkSync(photoFile); } catch {} persist(); return send(res, 200, out()); }
    }
    if ((m = p.match(/^\/api\/logs\/(\d{4}-\d{2}-\d{2})$/)) && req.method === "PUT") {
      const body = await readJson(req);
      const bite = Number(body.bite);
      if (!Number.isInteger(bite) || bite < 0 || bite > 5) return send(res, 400, { error: "Bad value" });
      if (!me) return needMe();
      if (bite === 0) delete db.logs[m[1]]; else db.logs[m[1]] = { bite, by: me.id };
      persist(); return send(res, 200, out());
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
  server.notifier = notifier;
  server.on("close", () => { if (notifier) notifier.stop(); });
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
