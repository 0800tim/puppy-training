#!/usr/bin/env node
/*
 * Puppy School HQ: tiny self-hosted server.
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
const net = require("node:net");
const CONTENT = require("../public/content.js");
const REWARDS = require("../public/rewards.js");
const PUSH = require("./push.js");
const NOTIFY = require("./notify.js");
const MAIL = require("./mail.js");

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
const TEACH_OPEN_CAP = 5; // unconfirmed teaching claims one person may have waiting
// Browsers only hand out push endpoints on these services. Anything else is a request to POST to a stranger's server.
const PUSH_HOSTS = [".push.services.mozilla.com", "fcm.googleapis.com", "android.googleapis.com", ".notify.windows.com", "web.push.apple.com", ".push.apple.com"];
const pushHostOk = (endpoint) => { try { const h = new URL(endpoint).hostname; return PUSH_HOSTS.some((d) => (d.startsWith(".") ? h.endsWith(d) : h === d)); } catch { return false; } };
const PUSH_CAP = 40;
const UNDO_MS = 15 * 60e3;
const localToday = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

function createApp(opts = {}) {
  // HOUSEHOLDS=1 hosts many families on one server (docs/design/HOUSEHOLDS.md): one folder per household under
  // DATA_DIR/households, PINs hashed in DATA_DIR/households.json, every cookie naming its household. Without it this
  // is the single-family server it always was: one PIN from the environment, store.json in DATA_DIR, nothing else.
  const multi = opts.households === true || String(opts.households ?? process.env.HOUSEHOLDS ?? "") === "1";
  const pin = String(opts.pin ?? process.env.PUPPY_PIN ?? "");
  if (!multi && !/^\d{4,8}$/.test(pin)) throw new Error("Set PUPPY_PIN to 4 to 8 digits (6 or more recommended).");
  if (multi && pin && !/^\d{4,8}$/.test(pin)) throw new Error("PUPPY_PIN must be 4 to 8 digits, or unset with HOUSEHOLDS=1.");
  const dataDir = path.resolve(opts.dataDir ?? process.env.DATA_DIR ?? path.join(__dirname, "..", "data"));
  const sessionDays = Number(opts.sessionDays ?? process.env.SESSION_DAYS ?? 180);
  const trustProxy = opts.trustProxy === true || String(opts.trustProxy ?? process.env.TRUST_PROXY ?? "") === "1";
  const limits = Object.assign({ perIp: 5, perIpWindowMs: 15 * 60e3, global: 20, globalWindowMs: 60 * 60e3, perHousehold: 10, mail: 3, mailWindowMs: 60 * 60e3 }, opts.limits || {});
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((...a) => console.log(new Date().toISOString(), ...a));
  const pushSubject = opts.pushSubject || process.env.PUSH_SUBJECT || "mailto:hello@growthspurt.agency";
  const adultPin = String(opts.adultPin ?? process.env.PUPPY_ADULT_PIN ?? "");
  if (adultPin && !/^\d{4,8}$/.test(adultPin)) throw new Error("PUPPY_ADULT_PIN must be 4 to 8 digits, or unset.");
  // Sign-up and sign-in by email (docs/design/HOUSEHOLDS.md, step 3) exist only on a server that hosts many families.
  const mailer = multi ? (opts.mailer || MAIL.makeMailer(process.env, { log })) : null;
  const appUrl = String(opts.appUrl ?? process.env.APP_URL ?? "").replace(/\/+$/, ""); // where links in emails point; else the request's own host
  const LINK_MS = 15 * 60e3;
  // The operator (docs/design/HOUSEHOLDS.md, step 4): addresses in OWNER_EMAILS sign in by email like any grown-up and
  // get the owner page as well, which lists families and never shows a chart. Deleting a family waits WIPE_MS so a
  // change of heart can undo it; a demo family lives DEMO_MS.
  const owners = new Set(String(opts.ownerEmails ?? process.env.OWNER_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  const OWNER_MS = 7 * 864e5, WIPE_MS = 7 * 864e5, DEMO_MS = 864e5;

  fs.mkdirSync(dataDir, { recursive: true });

  /* ---------- secret, signing, PIN hashing ---------- */
  // One secret signs every cookie on the server. A cookie carries its household inside the signed payload, so one
  // key serves every family and no family can forge another's cookie.
  let secret = opts.secret || process.env.SESSION_SECRET;
  if (!secret) {
    const kf = path.join(dataDir, "secret.key");
    if (fs.existsSync(kf)) secret = fs.readFileSync(kf, "utf8").trim();
    else { secret = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(kf, secret, { mode: 0o600 }); }
  }
  const sign = (payload) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const sha = (x) => crypto.createHash("sha256").update(String(x)).digest();
  const sameDigest = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
  // The single-family PIN lives in the environment and is compared as before. PINs in the households index are scrypt
  // hashes with their own salt, so the index file never holds a PIN.
  const hashPin = (p) => { const salt = crypto.randomBytes(16); return "scrypt$" + salt.toString("hex") + "$" + crypto.scryptSync(String(p), salt, 32).toString("hex"); };
  const pinOk = (hash, tryPin) => { const [kind, salt, h] = String(hash || "").split("$"); if (kind !== "scrypt" || !salt || !h) return false; return sameDigest(crypto.scryptSync(String(tryPin), Buffer.from(salt, "hex"), 32), Buffer.from(h, "hex")); };
  const legacyTag = (p) => crypto.createHmac("sha256", secret).update("pin:" + p).digest("hex").slice(0, 16); // the pre-households tag: phones keep their cookies across the switch
  const parsePayload = (tok) => {
    if (!tok || typeof tok !== "string") return null;
    const [p, sig] = tok.split("."); if (!p || !sig) return null;
    if (!sameDigest(Buffer.from(sign(p)), Buffer.from(sig))) return null;
    try { return JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
  };
  const peekHid = (tok) => { try { return JSON.parse(Buffer.from(String(tok || "").split(".")[0], "base64url").toString()).h || null; } catch { return null; } }; // unsigned peek; the signature is checked when the token is used

  /* ---------- brute-force protection ---------- */
  // The counters outlive a restart: a deploy or a crash must not hand a guesser a fresh budget. DATA_DIR/lockouts.json
  // keeps the failure times (addresses included, so mode 600), pruned to the live windows on every write, so an
  // address leaves the file within an hour of its last wrong guess and the file cannot grow past the lockout caps.
  const lockFile = path.join(dataDir, "lockouts.json");
  const fails = new Map(); // ip -> [timestamps]
  let globalFails = [];
  const hFails = new Map(); // household id -> [timestamps]
  const live = (a, w) => { const t = now(); return Array.isArray(a) ? a.filter((x) => Number.isFinite(x) && x <= t && t - x < w) : []; }; // a time in the future (clock set back) does not count
  try {
    const raw = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (raw && raw.v === 1) {
      for (const [k, v] of Object.entries(raw.ip || {})) { const m = live(v, limits.perIpWindowMs); if (m.length) fails.set(k, m); }
      globalFails = live(raw.global, limits.globalWindowMs);
      for (const [k, v] of Object.entries(raw.household || {})) { const m = live(v, limits.perIpWindowMs); if (m.length) hFails.set(k, m); }
    }
  } catch (e) { if (e.code !== "ENOENT") log("error", "lockouts.json unreadable, starting with none: " + e.message); }
  function saveLockouts() {
    const keep = (m, w) => { const o = {}; for (const [k, v] of m) { const a = live(v, w); if (a.length) o[k] = a; } return o; };
    const out = { v: 1, ip: keep(fails, limits.perIpWindowMs), global: live(globalFails, limits.globalWindowMs), household: keep(hFails, limits.perIpWindowMs) };
    try { const tmp = lockFile + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 }); fs.renameSync(tmp, lockFile); } catch (e) { log("error", "lockouts.json not written: " + e.message); }
  }
  function lockedFor(ip) {
    const t = now();
    const mine = (fails.get(ip) || []).filter((x) => t - x < limits.perIpWindowMs);
    fails.set(ip, mine);
    globalFails = globalFails.filter((x) => t - x < limits.globalWindowMs);
    if (mine.length >= limits.perIp) return Math.ceil((mine[0] + limits.perIpWindowMs - t) / 1000);
    if (globalFails.length >= limits.global) return Math.ceil((globalFails[0] + limits.globalWindowMs - t) / 1000);
    return 0;
  }
  function recordFail(ip, hid) { const t = now(); fails.set(ip, [...(fails.get(ip) || []), t]); globalFails.push(t); if (hid) hFails.set(hid, [...(hFails.get(hid) || []), t]); saveLockouts(); }
  // A stranger who has a family's code must not be able to grind that family's PIN from many addresses, and one
  // family's typos must not lock every family on the server: a second counter, per household.
  function lockedHousehold(hid) {
    const t = now();
    const mine = (hFails.get(hid) || []).filter((x) => t - x < limits.perIpWindowMs);
    hFails.set(hid, mine);
    return mine.length >= limits.perHousehold ? Math.ceil((mine[0] + limits.perIpWindowMs - t) / 1000) : 0;
  }
  // Emails cost money and land in someone's inbox: a few an hour per address and per phone, counted whether or not
  // one was actually sent, so the count itself says nothing about which addresses are on file.
  const mailAsks = new Map();
  function mailLimited(key) {
    const t = now();
    const mine = (mailAsks.get(key) || []).filter((x) => t - x < limits.mailWindowMs);
    if (mine.length >= limits.mail) { mailAsks.set(key, mine); return true; }
    mine.push(t); mailAsks.set(key, mine); return false;
  }


  /* ---------- files set aside ---------- */
  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
  const setAside = (file, why) => {
    const aside = file + ".corrupt-" + stamp();
    try { fs.copyFileSync(file, aside); fs.chmodSync(aside, 0o600); } catch (e2) { log("could not copy", file, "aside:", e2.message); return null; }
    log(path.basename(file), "unreadable (" + why + "). Copied to", path.basename(aside) + ". Starting fresh; see docs/RESTORE.md.");
    return aside;
  };

  const smsSender = opts.sms === null ? null : (opts.sms || NOTIFY.makeSmsSender(process.env));
  let vapid = null, pushReady = false; // decided once every household's store is loaded, below

  /* ---------- households ----------
   * One object per family: its store, its files, its PINs, its cookies and its reminder loop. The route handler
   * picks one per request and works on it alone, so nothing a family does can reach another family's chart. */
  const households = new Map();
  const indexFile = path.join(dataDir, "households.json");
  let index = { v: 1, households: [], pending: [], spent: [] }, indexMtime = 0, indexSaved = 0;
  // pending: sign-ups waiting for their email link to be opened (the family is made then, not before, so a mistyped
  // address leaves nothing behind). spent: sign-in links already used, by nonce, until they would have expired anyway.
  const pruneIndex = () => { const t = now(); index.pending = (index.pending || []).filter((p) => p.exp > t); index.spent = (index.spent || []).filter((x) => x.exp > t); };
  const hDir = (id) => path.join(dataDir, "households", id);
  const CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0, 1, i, l or o: the code gets read out across a kitchen
  const slug = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "family";
  const freshCode = (name) => { for (;;) { let c = slug(name) + "-"; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!index.households.some((r) => r.code === c)) return c; } };
  const newRec = (o) => ({ id: o.id || "h_" + crypto.randomBytes(5).toString("hex"), code: o.code || freshCode(o.name), name: String(o.name || "").trim().slice(0, 24), owner: String(o.owner || "").trim().slice(0, 120),
    pin: o.pinHash || hashPin(o.pin), adultPin: o.adultPin ? hashPin(o.adultPin) : "", pinTag: o.pinTag || crypto.randomBytes(8).toString("hex"), created: now(), lastActive: now(), flags: { sms: !!o.sms, suspended: false, demo: !!o.demo } });
  function saveIndex() {
    pruneIndex();
    const tmp = indexFile + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(index, null, 1), { mode: 0o600 }); // owner emails and PIN hashes
    fs.renameSync(tmp, indexFile);
    try { indexMtime = fs.statSync(indexFile).mtimeMs; } catch {}
    indexSaved = now();
  }
  function readIndex() {
    try { const j = JSON.parse(fs.readFileSync(indexFile, "utf8")); if (!j || !Array.isArray(j.households)) throw new Error("no households list in it"); return j; }
    catch (e) { setAside(indexFile, e.message); return null; } // the folders are all still there; see docs/RESTORE.md
  }
  function refreshIndex() { // a household added to the file by another process shows up on the next miss
    if (!multi) return;
    let mt = 0; try { mt = fs.statSync(indexFile).mtimeMs; } catch { return; }
    if (mt === indexMtime) return;
    indexMtime = mt;
    const j = readIndex(); if (!j) return;
    // Households already open keep their record object: their PIN and tag changes are saved through it, so the index
    // must point at that object, not at a fresh copy from the file. Fields the file has newer are folded in.
    index = { v: j.v || 1, households: j.households.map((r) => { const cur = households.get(r.id); if (!cur) return r; Object.assign(cur.rec, r); return cur.rec; }), pending: j.pending || [], spent: j.spent || [] };
    index.households.forEach((rec) => { if (!households.has(rec.id)) households.set(rec.id, openHousehold(rec).start()); });
  }
  const byCode = (code) => { let H = [...households.values()].find((x) => x.rec.code === code); if (!H) { refreshIndex(); H = [...households.values()].find((x) => x.rec.code === code); } return H || null; };
  function resolveHousehold(ck) {
    if (!multi) return households.get("default");
    if (ck.pt_h && households.has(ck.pt_h)) return households.get(ck.pt_h);
    const h = peekHid(ck.pt_session); if (h && households.has(h)) return households.get(h);
    refreshIndex();
    if (ck.pt_h && households.has(ck.pt_h)) return households.get(ck.pt_h);
    return households.get("default") || null; // the family that was here before HOUSEHOLDS=1: its phones carry no pt_h yet
  }
  function createHousehold(o) {
    if (!multi) throw new Error("households need HOUSEHOLDS=1");
    if (!o.pinHash && !/^\d{4,8}$/.test(String(o.pin || ""))) throw new Error("PIN must be 4 to 8 digits");
    if (o.adultPin && !/^\d{4,8}$/.test(String(o.adultPin))) throw new Error("grown-up PIN must be 4 to 8 digits");
    const rec = newRec(o);
    index.households.push(rec); saveIndex();
    const H = openHousehold(rec).start(); households.set(rec.id, H);
    log("household created", rec.id, rec.code);
    return { id: rec.id, code: rec.code };
  }

  function openHousehold(rec) {
    const env = !!rec.env; // the single-family server: PINs are plain strings from the environment
    const dir = rec.dir || hDir(rec.id);
    fs.mkdirSync(dir, { recursive: true });
    const storeFile = path.join(dir, "store.json");
    const photoFile = path.join(dir, "photo.jpg");
    let db = { rev: 1, settings: null, ticks: {}, logs: {}, mastery: {}, toilet: [], push: [], sent: null, social: {}, share: null, health: [], teach: [], removals: [] };
    // An unreadable store is copied aside before anything else happens, so the next write cannot replace the family's
    // chart with an empty one. Refusing to start would crash-loop under Restart=always, so we start fresh and shout.
    if (fs.existsSync(storeFile)) {
      try { fs.chmodSync(storeFile, 0o600); } catch {}
      try { db = Object.assign(db, JSON.parse(fs.readFileSync(storeFile, "utf8"))); } catch (e) { setAside(storeFile, e.message); }
    }
    function persist(bump = true) {
      if (purgeRemovals()) bump = true; // phones must see the purged rows
      if (bump) db.rev++;
      const tmp = storeFile + "." + process.pid + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 }); // the chart holds names and phone numbers
      fs.renameSync(tmp, storeFile);
    }

    const tag = () => rec.pinTag; // changing the PIN rotates it, which signs every phone in this household out
    const hOk = (j) => !multi || j.h === rec.id || (j.h === undefined && rec.id === "default"); // cookies from before HOUSEHOLDS=1 name no household
    const makeToken = () => { const p = Buffer.from(JSON.stringify(Object.assign({ exp: now() + sessionDays * 864e5, v: tag() }, multi ? { h: rec.id } : {}))).toString("base64url"); return p + "." + sign(p); };
    const validToken = (tok) => { const j = parsePayload(tok); return !!j && j.v === tag() && j.exp > now() && hOk(j); };
    const makeMe = (pid) => { const p = Buffer.from(JSON.stringify(Object.assign({ pid, v: tag() }, multi ? { h: rec.id } : {}))).toString("base64url"); return p + "." + sign(p); };
    const validMe = (tok) => { const j = parsePayload(tok); return j && j.v === tag() && typeof j.pid === "string" && hOk(j) ? j.pid : null; };
    const meCookie = (req, pid) => "pt_me=" + (pid ? makeMe(pid) : "") + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + (pid ? Math.floor(sessionDays * 86400) : 0) + (isHttps(req) ? "; Secure" : "");
    const pinMatches = (t) => (env ? sameDigest(sha(rec.pin), sha(t)) : pinOk(rec.pin, t));
    const adultPinMatches = (t) => !!rec.adultPin && (env ? sameDigest(sha(rec.adultPin), sha(t)) : pinOk(rec.adultPin, t));
    const H = { id: rec.id, rec, db, dir, storeFile, photoFile, persist, makeToken, validToken, validMe, meCookie, pinMatches, adultPinMatches, notifier: null,
      get hasAdultPin() { return !!rec.adultPin; },
      get sms() { return !!smsSender && (!multi || !!(rec.flags && rec.flags.sms)); },
      get suspended() { return !!(rec.flags && (rec.flags.suspended || rec.flags.wipeAt)); },
      get demo() { return !!(rec.flags && rec.flags.demo); } };
    H.setPins = (np, na) => { // null leaves one alone; "" clears the grown-up PIN
      if (np !== null) { rec.pin = hashPin(np); rec.pinTag = crypto.randomBytes(8).toString("hex"); }
      if (na !== null) rec.adultPin = na ? hashPin(na) : "";
      saveIndex();
    };
    H.touch = () => { if (multi) { rec.lastActive = now(); if (now() - indexSaved > 3600e3) saveIndex(); } };
    H.start = () => {
      if (!H.notifier && !opts.noScheduler && !H.demo) H.notifier = NOTIFY.createNotifier({ db, C: CONTENT, R: REWARDS, keys: vapid, subject: pushSubject, log, persist, sendPush: opts.sendPush || PUSH.sendPush,
        sendSms: H.sms ? smsSender : (async () => { throw new Error("no SMS gateway configured"); }), sms: H.sms, now: opts.now ? () => new Date(now()) : undefined });
      return H;
    };
    H.stop = () => { if (H.notifier) H.notifier.stop(); H.notifier = null; };
    const stateOut = () => ({ rev: db.rev, settings: db.settings, ticks: db.ticks, logs: db.logs, mastery: db.mastery, toilet: db.toilet.slice(-300), social: db.social || {}, health: (db.health || []).filter((h) => !h.void), photo: fs.existsSync(photoFile), today: localToday(),
      teach: (db.teach || []).filter((t) => !t.void).slice(-200),
      push: (db.push || []).map((s) => ({ id: s.id, pid: s.pid, prefs: s.prefs || {}, created: s.created, label: s.label || "" })), sms: H.sms, vapid: pushReady ? vapid.publicKey : "", share: db.share ? { token: db.share.token, created: db.share.created } : null,
      removals: (db.removals || []).filter((r) => now() - r.at <= UNDO_MS).map((r) => ({ id: r.person.id, name: r.person.name, at: r.at, counts: r.counts })) });
    H.stateOut = stateOut;
    const member = (id) => (db.settings && db.settings.family.find((m) => m.id === id)) || null;
    H.member = member;

    /* ---------- "remove this person and their history" (docs/design/REMOVE-PERSON.md) ----------
     * Void everything they logged with a removal stamp, drop their phones' reminders, keep an undo for UNDO_MS,
     * then purge their id from every row. Void rows stay (toilet patterns, the puppy's health record) but say nothing about who. */
    const eachEntry = (fn) => {
      for (const k in db.ticks) fn(db.ticks[k], k);
      for (const d in db.logs) fn(db.logs[d]);
      for (const sk in db.mastery) ((db.mastery[sk] && db.mastery[sk].done) || []).forEach((v) => fn(v));
      (db.toilet || []).forEach((t) => fn(t));
      for (const item in db.social || {}) (db.social[item] || []).forEach((x) => fn(x));
      (db.health || []).forEach((h) => fn(h));
      (db.teach || []).forEach((t) => fn(t));
    };
    function removePerson(who, by) {
      const pid = who.id;
      const r = { id: crypto.randomBytes(6).toString("hex"), at: now(), by, person: Object.assign({}, who), index: db.settings.family.findIndex((m) => m.id === pid), buddies: [], push: [], sent: null, counts: { sessions: 0, votes: 0, witnessed: 0, trips: 0, social: 0, health: 0, lessons: 0 } };
      db.settings.family = db.settings.family.filter((m) => m.id !== pid);
      db.settings.family.forEach((m) => { if (m.buddy === pid) { r.buddies.push(m.id); m.buddy = ""; } });
      const stamp = (x, what) => { if (x && !x.void) { x.void = true; x.removed = r.id; r.counts[what]++; } };
      eachEntry((x, key) => {
        if (key) { if (key.split("_")[1] === pid) stamp(x, "sessions"); return; } // ticks they logged on someone else's row stay with that row
        if ("bite" in x) return; // a bite rating is about the puppy; the id goes at purge time
        if ("witness" in x) { if (x.by === pid) stamp(x, "votes"); else if (x.witness === pid && !x.void) { x.witness = ""; x.removedWitness = r.id; r.counts.witnessed++; } return; }
        if ("teacher" in x) { if (x.teacher === pid || x.learner === pid) stamp(x, "lessons"); return; }
        if (x.by === pid) stamp(x, "kind" in x && "date" in x ? "health" : "mood" in x ? "social" : "trips");
      });
      r.push = (db.push || []).filter((s) => s.pid === pid);
      db.push = (db.push || []).filter((s) => s.pid !== pid);
      if (db.sent && db.sent.by && db.sent.by["sms:" + pid]) { r.sent = db.sent.by["sms:" + pid]; delete db.sent.by["sms:" + pid]; } // today's text tally is keyed by person id
      db.removals = (db.removals || []).concat(r);
      return r;
    }
    function restorePerson(r) {
      if (r.person.buddy && !db.settings.family.some((m) => m.id === r.person.buddy)) r.person.buddy = ""; // their buddy may have gone in the meantime
      db.settings.family.splice(Math.min(r.index >= 0 ? r.index : db.settings.family.length, db.settings.family.length), 0, r.person); // back in their place: chart order, colours and missions depend on it
      db.settings.family.forEach((m) => { if (r.buddies.includes(m.id) && !m.buddy) m.buddy = r.person.id; });
      eachEntry((x) => {
        if (x.removed === r.id) { delete x.void; delete x.removed; }
        if (x.removedWitness === r.id) { x.witness = r.person.id; delete x.removedWitness; }
      });
      r.push.forEach((s) => { if (!(db.push || []).some((x) => x.id === s.id)) db.push.push(s); });
      if (r.sent && db.sent && db.sent.by && !db.sent.by["sms:" + r.person.id]) db.sent.by["sms:" + r.person.id] = r.sent;
      db.removals = db.removals.filter((x) => x.id !== r.id);
    }
    function purgeRemovals() {
      const due = (db.removals || []).filter((r) => now() - r.at > UNDO_MS);
      if (!due.length) return false;
      due.forEach((r) => {
        const pid = r.person.id;
        for (const k in db.ticks) if (k.split("_")[1] === pid) delete db.ticks[k];
        for (const sk in db.mastery) if (db.mastery[sk]) db.mastery[sk].done = (db.mastery[sk].done || []).filter((v) => v.by !== pid);
        db.teach = (db.teach || []).filter((t) => t.teacher !== pid && t.learner !== pid);
        eachEntry((x) => {
          if (x.by === pid) x.by = "";
          if (x.witness === pid) x.witness = "";
          if (x.removed === r.id) delete x.removed;
          if (x.removedWitness === r.id) delete x.removedWitness;
        });
        db.settings.family.forEach((m) => { if (m.buddy === pid) m.buddy = ""; });
        db.removals.forEach((o) => { if (o.person.buddy === pid) o.person.buddy = ""; if (o.by === pid) o.by = ""; }); // a stash still open may point at them
        if (db.sent && db.sent.by) delete db.sent.by["sms:" + pid];
      });
      db.removals = db.removals.filter((r) => !due.includes(r));
      return true;
    }
    if (purgeRemovals()) persist(); // a stash left from before a restart
    H.removePerson = removePerson; H.restorePerson = restorePerson;
    return H;
  }

  if (multi) {
    const legacyStore = path.join(dataDir, "store.json");
    if (fs.existsSync(indexFile)) { const j = readIndex(); if (j) index = Object.assign({ pending: [], spent: [] }, j); try { indexMtime = fs.statSync(indexFile).mtimeMs; } catch {} }
    else if (fs.existsSync(legacyStore)) {
      // First boot with HOUSEHOLDS=1 on a single-family server: the family becomes household "default", its PINs move
      // from the environment into the index, and its phones keep their cookies (same secret, same tag, no household named).
      if (!pin) throw new Error("HOUSEHOLDS=1 found an existing store.json: set PUPPY_PIN once more so the family can be carried over.");
      const dir = hDir("default"); fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(legacyStore, path.join(dir, "store.json"));
      const legacyPhoto = path.join(dataDir, "photo.jpg"); if (fs.existsSync(legacyPhoto)) fs.renameSync(legacyPhoto, path.join(dir, "photo.jpg"));
      let name = ""; try { name = JSON.parse(fs.readFileSync(path.join(dir, "store.json"), "utf8")).settings.puppy.name || ""; } catch {}
      index.households.push(newRec({ id: "default", name, pin, adultPin, pinTag: legacyTag(pin), sms: !!smsSender }));
      saveIndex();
      log("carried the family over to households/default with code", index.households[0].code);
    } else saveIndex();
    index.households.forEach((rec) => households.set(rec.id, openHousehold(rec)));
  } else households.set("default", openHousehold({ id: "default", dir: dataDir, env: true, pin, adultPin, pinTag: legacyTag(pin), code: "default", flags: { sms: true } }));

  /* ---------- push keys, reminder loops ---------- */
  // The push key pair signs every reminder and belongs to the server, not to a family. Minting a new pair while phones
  // are subscribed to the old one kills every subscription, so with subscriptions on file and no readable vapid.json
  // we run with push paused instead: the subscriptions stay in the stores and come back to life when vapid.json is
  // restored (docs/RESTORE.md).
  const vapidFile = path.join(dataDir, "vapid.json");
  if (fs.existsSync(vapidFile)) {
    try { vapid = JSON.parse(fs.readFileSync(vapidFile, "utf8")); if (!vapid || !vapid.publicKey || !vapid.privateKey) throw new Error("no key pair in it"); }
    catch (e) { vapid = null; setAside(vapidFile, e.message); }
  }
  if (!vapid) {
    const subscribed = [...households.values()].reduce((n, H) => n + (H.db.push || []).length, 0);
    if (subscribed) log("vapid.json missing with", subscribed, "phone(s) subscribed: push is PAUSED until data/vapid.json is restored from backup (docs/RESTORE.md). No new keys were made.");
    else { vapid = PUSH.generateVapidKeys(); fs.writeFileSync(vapidFile, JSON.stringify(vapid), { mode: 0o600 }); }
  }
  pushReady = !!vapid;
  households.forEach((H) => H.start());

  // Families due to go: deleted ones after their grace period, demo ones after a day. The folder is removed; the
  // nightly backup copies still roll off after their own 30 days (docs/PRIVACY.md).
  function sweep() {
    if (!multi) return [];
    refreshIndex();
    const t = now(), gone = [];
    index.households.filter((r) => (r.flags && r.flags.wipeAt && r.flags.wipeAt <= t) || (r.flags && r.flags.demo && r.created + DEMO_MS <= t)).forEach((r) => {
      const H = households.get(r.id); if (H) H.stop(); households.delete(r.id);
      try { fs.rmSync(hDir(r.id), { recursive: true, force: true }); } catch (e) { log("could not remove", hDir(r.id), e.message); }
      gone.push(r.id); log("household removed", r.id, r.code, r.flags.demo ? "(demo)" : "(deleted)");
    });
    if (gone.length) { index.households = index.households.filter((r) => !gone.includes(r.id)); saveIndex(); }
    return gone;
  }
  sweep();
  const sweeper = multi && !opts.noScheduler ? setInterval(sweep, 10 * 60e3) : null;
  if (sweeper) sweeper.unref();

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
        phone: NOTIFY.normalisePhone(m && m.phone), sms: !!(m && m.sms), buddy: str(m && m.buddy, 24), email: kind === "adult" ? MAIL.cleanEmail(m && m.email) : "" };
    }).filter((m) => /^[A-Za-z0-9]{1,24}$/.test(m.id) && m.name);
    family.forEach((m) => { if (!m.buddy || m.buddy === m.id || !family.some((o) => o.id === m.buddy)) m.buddy = ""; });
    if (!family.length) return null;
    return {
      puppy: { name: str(p.name, 24), sex: p.sex === "boy" ? "boy" : "girl", breed: str(p.breed, 80), born: DATE_RE.test(p.born) ? p.born : "" },
      start: DATE_RE.test(x.start) ? x.start : new Date().toISOString().slice(0, 10),
      family
    };
  }

  /* ---------- the visitor card: one page for grandparents and sitters, no PIN, by link only ---------- */
  // The page carries a noindex meta tag; the header says the same to crawlers that never parse the body, on both the card and the "turned off" page.
  const VISITOR_HEADERS = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" };
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
  // Behind cloudflared (TRUST_PROXY=1) the visitor address is CF-Connecting-IP, one address, set by the edge and
  // never by the caller. X-Forwarded-For is a chain the caller can seed: Cloudflare appends the real address at the
  // END, so the first entry is whatever the phone sent. Taking the first entry let one phone dodge the PIN lockout
  // by changing the header each try (docs/SECURITY-REVIEW-2026-10.md, 20 Oct). Order: CF-Connecting-IP, then the
  // last X-Forwarded-For hop, then the socket. Anything that is not an IP address is ignored.
  const ipOf = (v) => { const s = String(v || "").trim(); return net.isIP(s) ? s : ""; };
  const clientIp = (req) => {
    if (trustProxy) {
      const cf = ipOf(req.headers["cf-connecting-ip"]); if (cf) return cf;
      const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
      const last = ipOf(xff[xff.length - 1]); if (last) return last;
    }
    return req.socket.remoteAddress || "?";
  };
  const hCookie = (req, hid) => "pt_h=" + hid + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000" + (isHttps(req) ? "; Secure" : ""); // a pointer, not a credential: Lax so a join link can set it
  const isHttps = (req) => (trustProxy ? String(req.headers["x-forwarded-proto"] || "").startsWith("https") : !!req.socket.encrypted);
  const origin = (req) => { if (appUrl) return appUrl; const h = String(req.headers.host || ""); return (isHttps(req) ? "https" : "http") + "://" + (/^[A-Za-z0-9.:[\]-]{1,253}$/.test(h) ? h : "localhost"); };
  // A link in an email: a signed payload with a nonce and a 15-minute expiry. Sign-ups name a pending record; sign-ins
  // name a household and a person, and are single use by nonce.
  const linkToken = (o) => { const p = Buffer.from(JSON.stringify(Object.assign({ n: crypto.randomBytes(12).toString("hex"), exp: now() + LINK_MS }, o))).toString("base64url"); return p + "." + sign(p); };
  const readLink = (tok) => { const j = parsePayload(tok); return j && typeof j.n === "string" && typeof j.exp === "number" && (j.k === "signup" || j.k === "in" || j.k === "owner") ? j : null; };
  const ownerCookie = (req, on) => "pt_owner=" + (on ? (() => { const p = Buffer.from(JSON.stringify({ k: "owner", exp: now() + OWNER_MS })).toString("base64url"); return p + "." + sign(p); })() : "") + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + (on ? Math.floor(OWNER_MS / 1000) : 0) + (isHttps(req) ? "; Secure" : "");
  const ownerOk = (ck) => { const j = parsePayload(ck.pt_owner); return !!j && j.k === "owner" && j.exp > now(); };
  const linkPage = (title, body, form) => "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>" + esc(title) + "</title>" +
    "<style>body{margin:0;background:#f4f3fa;color:#1c1a33;font:17px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:420px;margin:0 auto;padding:48px 18px}h1{font-size:1.6rem;line-height:1.15;margin:0 0 12px}p{color:#4a476a}button,a.btn{display:inline-block;margin-top:14px;background:#5b4bf0;color:#fff;border:0;border-radius:14px;padding:14px 22px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}@media(prefers-color-scheme:dark){body{background:#131225;color:#ededf7}p{color:#c9c6e4}}</style></head><body><main><h1>" + esc(title) + "</h1><p>" + body + "</p>" + form + "</main>" + (form ? "<script src=\"/m.js\"></script>" : "") + "</body></html>";
  const LINK_HEADERS = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": CSP.replace("form-action 'none'", "form-action 'self'") };
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

  /* ---------- sign-up and sign-in by email (docs/design/HOUSEHOLDS.md, step 3) ----------
   * The grown-up who starts a family, or signs into one on a new phone, gets a link by email. Nothing is made until
   * the link is opened, the reply is the same whether or not the address is known, and a link is good once and for
   * fifteen minutes. The link opens a small page that posts itself: a mail scanner that fetches every link in an
   * email must not spend it. */
  const SAME_REPLY = { ok: true, sent: true };
  async function askForLink(req, res, signup) {
    const ip = clientIp(req);
    const body = await readJson(req);
    const email = MAIL.cleanEmail(body.email);
    if (!email) return send(res, 400, { error: "That does not look like an email address" });
    if (mailLimited("ip:" + ip) || mailLimited("em:" + email)) { log("mail limited", ip); return send(res, 429, { error: "That is a few links in a row. Check your inbox, or wait an hour." }); }
    const base = origin(req);
    if (signup) {
      const puppy = String(body.puppy || "").trim().slice(0, 24), name = String(body.name || "").trim().slice(0, 20), pin = String(body.pin || "");
      if (!puppy || !name) return send(res, 400, { error: "Need the puppy's name and yours" });
      if (!/^\d{4,8}$/.test(pin)) return send(res, 400, { error: "Family PIN: 4 to 8 digits" });
      const tok = linkToken({ k: "signup" });
      const j = readLink(tok);
      index.pending.push({ n: j.n, exp: j.exp, email, puppy, name, pinHash: hashPin(pin) }); saveIndex();
      const mine = signInLinks(email, base);
      const text = "Hi " + name + ",\n\nTap this link on the phone you want to run " + puppy + "'s puppy school from, within 15 minutes:\n\n" + base + "/m/" + tok +
        "\n\nIt makes the family and signs you in as the grown-up. The kids join with the family PIN you chose.\n\n" +
        (mine.length ? "You already have a puppy school here. To open it instead:\n" + mine.map((x) => x.name + "'s: " + x.url).join("\n") + "\n\n" : "") +
        "If you did not ask for this, ignore this email and nothing happens.\n\nPuppy School HQ";
      log("signup link", email, ip);
      await mailer.send({ to: email, subject: "Start " + puppy + "'s puppy school", text });
      return send(res, 200, SAME_REPLY);
    }
    const mine = signInLinks(email, base);
    if (owners.has(email)) mine.push({ name: "the owner page", url: base + "/m/" + linkToken({ k: "owner" }) });
    log("sign-in link", email, ip, mine.length ? "sent" : "no match");
    const subject = mine.length !== 1 ? "Sign in to your puppy school" : mine[0].name === "the owner page" ? "Sign in to the owner page" : "Sign in to " + mine[0].name + "'s puppy school";
    if (mine.length) await mailer.send({ to: email, subject,
      text: "Hi,\n\nTap the link on the phone you want to sign in on, within 15 minutes:\n\n" + mine.map((x) => (mine.length > 1 ? (x.name === "the owner page" ? "The owner page: " : x.name + "'s puppy school: ") : "") + x.url).join("\n\n") +
        "\n\nIf you did not ask for this, ignore this email and nothing happens.\n\nPuppy School HQ" });
    return send(res, 200, SAME_REPLY);
  }
  // Every household this address is a grown-up in, as sign-in links. An address on a person's row counts; the owner
  // address in the index counts until the family's Settings are saved, when the row is what matters.
  function signInLinks(email, base) {
    refreshIndex();
    const out = [];
    households.forEach((H) => {
      if (H.suspended) return;
      const fam = (H.db.settings && H.db.settings.family) || [];
      let who = fam.find((x) => x.kind === "adult" && x.email === email);
      if (!who && !H.db.settings && H.rec.owner === email) who = { id: "" }; // a family not set up yet: the link lands in Settings
      if (!who) return;
      if (H.db.settings && !who.id) return;
      out.push({ name: H.rec.name || "your", url: base + "/m/" + linkToken({ k: "in", h: H.id, p: who.id }) });
    });
    return out;
  }
  async function openLink(req, res, tok) {
    const bounce = (why) => (req.method === "GET" ? send(res, 200, linkPage("This link has stopped working", "Links from emails work once, for 15 minutes. Open the app and ask for a new one.", "<a class=\"btn\" href=\"/\">Open Puppy School HQ</a>"), LINK_HEADERS) : send(res, 302, "", { Location: "/?link=" + why }));
    const j = readLink(tok);
    if (!j) return bounce("bad");
    if (j.exp <= now()) return bounce("expired");
    refreshIndex();
    const pending = j.k === "signup" ? index.pending.find((x) => x.n === j.n) : null;
    if (j.k === "signup" && !pending) return bounce("used");
    if (j.k !== "signup" && index.spent.some((x) => x.n === j.n)) return bounce("used");
    if (j.k === "owner") {
      if (req.method !== "POST") return send(res, 200, linkPage("Opening the owner page", "One tap and you are in on this phone.", "<form method=\"post\" action=\"/m/" + tok + "\"><button type=\"submit\">Continue</button></form>"), LINK_HEADERS);
      index.spent.push({ n: j.n, exp: j.exp }); saveIndex();
      log("owner signed in");
      return send(res, 302, "", { Location: "/owner.html", "Set-Cookie": ownerCookie(req, true) });
    }
    const T = j.k === "in" ? households.get(j.h) : null;
    if (j.k === "in" && !T) return bounce("bad");
    const who = j.k === "in" ? (j.p ? T.member(j.p) : (!T.db.settings ? { id: "" } : null)) : null;
    if (j.k === "in" && (!who || (who.id && who.kind !== "adult"))) return bounce("bad");
    if (req.method !== "POST") {
      const name = j.k === "signup" ? pending.puppy : (T.rec.name || "your");
      return send(res, 200, linkPage("Opening " + name + "'s puppy school", "One tap and you are in on this phone.", "<form method=\"post\" action=\"/m/" + tok + "\"><button type=\"submit\">Continue</button></form>"), LINK_HEADERS);
    }
    const setCookies = [];
    if (j.k === "signup") {
      index.pending = index.pending.filter((x) => x.n !== j.n); // single use: the record goes before the family is made
      const made = createHousehold({ name: pending.puppy, owner: pending.email, pinHash: pending.pinHash });
      const H = households.get(made.id);
      H.db.starter = { puppy: pending.puppy, name: pending.name, email: pending.email }; H.persist();
      log("signup done", H.id, H.rec.code);
      setCookies.push(hCookie(req, H.id), "pt_session=" + H.makeToken() + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + Math.floor(sessionDays * 86400) + (isHttps(req) ? "; Secure" : ""));
    } else {
      index.spent.push({ n: j.n, exp: j.exp }); saveIndex();
      T.touch();
      log("sign-in by email", T.id, who.id || "(no settings yet)");
      setCookies.push(hCookie(req, T.id), "pt_session=" + T.makeToken() + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + Math.floor(sessionDays * 86400) + (isHttps(req) ? "; Secure" : ""));
      if (who.id) setCookies.push(T.meCookie(req, who.id)); // the email proved who they are: no grown-up PIN on top
    }
    return send(res, 302, "", { Location: "/#today", "Set-Cookie": setCookies });
  }

  /* ---------- the owner page (docs/design/HOUSEHOLDS.md, step 4) ----------
   * Names, codes, counts and flags only: the operator never sees a chart. */
  const listOut = () => index.households.map((r) => { const H = households.get(r.id); return { id: r.id, code: r.code, name: r.name, owner: r.owner, created: r.created, lastActive: r.lastActive, flags: r.flags,
    people: H && H.db.settings ? H.db.settings.family.length : 0, setUp: !!(H && H.db.settings) }; });
  async function ownerRoutes(req, res, p, ck) {
    if (p === "/api/owner/logout" && req.method === "POST") return send(res, 200, { ok: true }, { "Set-Cookie": ownerCookie(req, false) });
    if (!ownerOk(ck)) return send(res, 401, { error: "Owner sign-in needed", code: "owner" });
    const base = origin(req);
    if (p === "/api/owner/households" && req.method === "GET") { refreshIndex(); return send(res, 200, { households: listOut(), owners: [...owners], mail: mailer.kind, base }); }
    if (p === "/api/owner/households" && req.method === "POST") {
      // an invite: the family exists now, with a join link for the kids' phones and, with an email, a sign-in link for the grown-up
      const body = await readJson(req);
      const name = String(body.name || "").trim().slice(0, 24), pin = String(body.pin || ""), adultPin = body.adultPin ? String(body.adultPin) : "", owner = MAIL.cleanEmail(body.owner);
      if (!name) return send(res, 400, { error: "Need the puppy's name" });
      if (!/^\d{4,8}$/.test(pin)) return send(res, 400, { error: "Family PIN: 4 to 8 digits" });
      if (adultPin && !/^\d{4,8}$/.test(adultPin)) return send(res, 400, { error: "Grown-up PIN: 4 to 8 digits, or empty" });
      if (body.owner && !owner) return send(res, 400, { error: "That does not look like an email address" });
      const made = createHousehold({ name, pin, adultPin, owner, sms: !!body.sms });
      const links = { join: base + "/j/" + made.code, signin: owner ? base + "/m/" + linkToken({ k: "in", h: made.id, p: "" }) : null };
      log("owner created household", made.id, made.code);
      return send(res, 200, { ok: true, id: made.id, code: made.code, links, households: listOut() });
    }
    let m;
    if ((m = p.match(/^\/api\/owner\/households\/(h_[a-f0-9]{10}|default)$/))) {
      refreshIndex();
      const H = households.get(m[1]); if (!H) return send(res, 404, { error: "No such family" });
      const f = H.rec.flags = H.rec.flags || {};
      if (req.method === "PUT") {
        const body = await readJson(req);
        if ("suspended" in body) f.suspended = !!body.suspended;
        if ("sms" in body) { f.sms = !!body.sms && !!smsSender; H.stop(); H.start(); } // the notifier is built with the flag
        if (body.wipe === false) delete f.wipeAt;
        if (body.signin === true && H.db.settings === null && H.rec.owner) { saveIndex(); return send(res, 200, { ok: true, link: base + "/m/" + linkToken({ k: "in", h: H.id, p: "" }), households: listOut() }); }
        saveIndex(); log("owner changed", H.id, JSON.stringify(body));
        return send(res, 200, { ok: true, households: listOut() });
      }
      if (req.method === "DELETE") {
        f.wipeAt = now() + WIPE_MS; saveIndex(); log("owner delete requested", H.id);
        return send(res, 200, { ok: true, wipeAt: f.wipeAt, households: listOut() });
      }
    }
    if (p === "/api/owner/sweep" && req.method === "POST") return send(res, 200, { ok: true, removed: sweep(), households: listOut() });
    return send(res, 404, { error: "Not found" });
  }

  /* ---------- a demo family: a sandbox for anyone Tim shows the app to, gone after a day ---------- */
  const DEMO_PEOPLE = [{ id: "d1", name: "Sam", kind: "adult", target: 10, age: "", phone: "", sms: false, buddy: "", email: "" }, { id: "d2", name: "Alex", kind: "kid", target: 21, age: "8-9", phone: "", sms: false, buddy: "", email: "" }];
  async function makeDemo(req, res) {
    const ip = clientIp(req);
    if (mailLimited("demo:" + ip)) return send(res, 429, { error: "That is a few demo families in a row. Wait an hour." });
    const pin = String(crypto.randomInt(100000, 1000000));
    const made = createHousehold({ name: "Biscuit", pin, demo: true });
    const H = households.get(made.id);
    H.db.settings = { puppy: { name: "Biscuit", sex: "girl", breed: "Labrador cross", born: "" }, start: localToday(), family: DEMO_PEOPLE.map((x) => Object.assign({}, x)) };
    H.persist();
    log("demo household", H.id, ip);
    const session = "pt_session=" + H.makeToken() + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + Math.floor(sessionDays * 86400) + (isHttps(req) ? "; Secure" : "");
    return send(res, 200, { ok: true, code: made.code, pin, days: 1 }, { "Set-Cookie": [hCookie(req, H.id), session, H.meCookie(req, "d1")] });
  }

  /* ---------- routes ---------- */
  async function handle(req, res) {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;
    let m;
    if (!p.startsWith("/api/")) {
      if (multi && (m = p.match(/^\/m\/([A-Za-z0-9_-]{20,400}\.[A-Za-z0-9_-]{20,100})$/))) return openLink(req, res, m[1]);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      if (multi && (m = p.match(/^\/j\/([a-z0-9-]{3,40})$/))) { // the join link: this phone belongs to that family; the PIN screen follows
        const ip = clientIp(req);
        if (lockedFor(ip) > 0) return send(res, 429, "Too many tries. Wait a few minutes.");
        const H = byCode(m[1]);
        if (!H) { recordFail(ip); return send(res, 302, "", { Location: "/?join=unknown" }); } // guessing codes costs the same as guessing PINs
        return send(res, 302, "", { Location: "/", "Set-Cookie": hCookie(req, H.id) });
      }
      return serveStatic(req, res, p);
    }
    if (p === "/api/health") return send(res, 200, { app: "puppy-training", version: VERSION, pin: true, households: multi });
    if ((m = p.match(/^\/api\/visitor\/([a-f0-9]{24})$/)) && req.method === "GET") {
      const tok = Buffer.from(m[1]);
      const hit = [...households.values()].find((H) => H.db.settings && H.db.share && sameDigest(tok, Buffer.from(H.db.share.token)));
      return hit ? send(res, 200, visitorHtml(hit.db.settings), VISITOR_HEADERS) : send(res, 404, visitorHtml(null), VISITOR_HEADERS);
    }

    if (p === "/api/logout" && req.method === "POST") { // needs no family: a lost phone must always be able to lock itself
      res.setHeader("Set-Cookie", ["pt_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", "pt_me=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"]);
      return send(res, 200, { ok: true });
    }

    // Which family is this phone? One household on the single-family server; otherwise the household cookie, or the
    // one a session cookie names, or the carried-over family for phones from before HOUSEHOLDS=1.
    const ck = cookies(req);
    const H = resolveHousehold(ck);
    // A phone with no cookies at all has never been here: it gets the welcome screen, not the carried-over family's
    // PIN screen. (A PIN typed with no cookies still lands in that family, so its phones work without a join link.)
    const bare = multi && !ck.pt_h && !ck.pt_session && !ck.pt_me;
    if (p === "/api/household" && req.method === "GET") return send(res, 200, { households: multi, signup: !!mailer, code: multi && H && !bare ? H.rec.code : null, name: multi && H && !bare ? H.rec.name : "" });
    if ((p === "/api/signup" || p === "/api/email") && req.method === "POST") return mailer ? askForLink(req, res, p === "/api/signup") : send(res, 409, { error: "This server hosts one family. Ask whoever runs it for the PIN." });
    if (multi && p.startsWith("/api/owner/")) return ownerRoutes(req, res, p, ck);
    if (multi && p === "/api/demo" && req.method === "POST") return makeDemo(req, res);
    if (H && H.rec.flags && H.rec.flags.wipeAt && p !== "/api/logout") return send(res, 403, { error: "This family's school is being deleted. Whoever runs the server can undo that for " + Math.max(1, Math.ceil((H.rec.flags.wipeAt - now()) / 864e5)) + " more day(s)." });
    if (!H || (bare && p === "/api/state")) return send(res, 401, { error: "Which family? Open your family's join link first.", code: "household" });
    if (H.suspended) return send(res, 403, { error: "This family's school is paused. Ask whoever runs the server." });
    const { db, persist, photoFile, stateOut, member, removePerson, restorePerson, adultPinMatches, hasAdultPin, makeToken, validToken, validMe, meCookie } = H;

    if (p === "/api/login" && req.method === "POST") {
      const ip = clientIp(req), hid = multi ? [H.id] : []; // the single-family log lines stay exactly as they were
      const wait = Math.max(lockedFor(ip), lockedHousehold(H.id));
      if (wait > 0) { log("login locked", ip, ...hid); return send(res, 429, { error: "Too many tries", retryAfter: wait }, { "Retry-After": String(wait) }); }
      const body = await readJson(req);
      if (!H.pinMatches(body.pin ?? "")) { recordFail(ip, H.id); log("login failed", ip, ...hid); return send(res, 401, { error: "Wrong PIN" }); }
      fails.delete(ip); hFails.delete(H.id); saveLockouts();
      H.touch();
      log("login ok", ...hid);
      const cookie = "pt_session=" + makeToken() + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + Math.floor(sessionDays * 86400) + (isHttps(req) ? "; Secure" : "");
      return send(res, 200, { ok: true }, { "Set-Cookie": multi ? [cookie, hCookie(req, H.id)] : cookie });
    }

    if (!validToken(ck.pt_session)) return send(res, 401, { error: "PIN needed" });
    // Who is this phone? Set once with POST /api/me, signed by the server, never taken from a request body.
    const me = member(validMe(ck.pt_me));
    const isAdult = me && me.kind === "adult";
    const hasAdult = !!(db.settings && db.settings.family.some((x) => x.kind === "adult"));
    // Phone numbers go only to grown-ups' phones once the family has a grown-up (kids see the family read-only anyway).
    // In an all-kids family the kids are the editors, so they keep the full record or a save would wipe the numbers.
    const forKids = (st) => (st && hasAdult && !isAdult ? Object.assign({}, st, { family: st.family.map((m) => { const c = Object.assign({}, m); delete c.phone; delete c.email; return c; }) }) : st);
    const out = (extra) => Object.assign(stateOut(), { settings: forKids(db.settings), me: me ? me.id : null, adultPin: hasAdultPin, household: multi ? { code: H.rec.code, name: H.rec.name, owner: !!(isAdult && (!H.rec.owner || (me && me.email === H.rec.owner))), demo: H.demo } : null,
      starter: !db.settings && db.starter ? db.starter : null }, extra || {}); // what the sign-up form said, to prefill the first Settings
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
      if (who.kind === "adult" && hasAdultPin) {
        const ip = clientIp(req);
        const wait = lockedFor(ip);
        if (wait > 0) return send(res, 429, { error: "Too many tries", retryAfter: wait }, { "Retry-After": String(wait) });
        if (!adultPinMatches(body.adultPin ?? "")) { recordFail(ip); log("adult pin failed", ip); return send(res, 403, { error: "Grown-up PIN needed", code: "adultpin" }); }
        fails.delete(ip);
      }
      log("me", who.id);
      return send(res, 200, Object.assign(stateOut(), { me: who.id, adultPin: hasAdultPin }), { "Set-Cookie": meCookie(req, who.id) });
    }
    if (p === "/api/me" && req.method === "DELETE") return send(res, 200, out({ me: null }), { "Set-Cookie": meCookie(req, null) });
    if (p === "/api/settings" && req.method === "PUT") {
      // Once a grown-up exists, only a grown-up can change the family, goals and phone numbers.
      if (hasAdult && !isAdult) return send(res, 403, { error: "Ask a grown-up to change the family" });
      const s = cleanSettings(await readJson(req));
      if (!s) return send(res, 400, { error: "Need at least one family member" });
      if (db.starter) delete db.starter; // the grown-up is on a row now, email and all
      const stale = s.family.find((m) => (db.removals || []).some((r) => r.person.id === m.id)); // a Settings page opened before someone was removed
      if (stale) return send(res, 409, { error: stale.name + " was just removed. Reload, then use Undo in Settings to bring them back." });
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
      if (!pushReady) return send(res, 503, { error: "Reminders are paused on the server until its push keys are restored. Ask whoever runs it." });
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
      if (!pushReady) return send(res, 503, { error: "Reminders are paused on the server until its push keys are restored." });
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
      if (!H.sms) return send(res, 503, { error: "No SMS gateway configured on this server" });
      const pup = (db.settings && db.settings.puppy.name) || "Your puppy";
      try { await smsSender(to.phone, pup + " here. Texts are on for " + to.name + ". I'll text once a day at most, only if nothing is on the chart. puppy.appspurt.com"); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 502, { error: "SMS failed: " + e.message }); }
    }
    if (p === "/api/healthlog" && req.method === "POST") {
      if (!me) return needMe();
      if (hasAdult && !isAdult) return send(res, 403, { error: "Grown-ups log health" });
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
      if (!me) return needMe();
      if (hasAdult && !isAdult) return send(res, 403, { error: "Grown-ups log health" });
      const h = (db.health || []).find((x) => x.id === m[1]);
      if (!h) return send(res, 404, { error: "Not found" });
      h.void = true; persist(); return send(res, 200, out());
    }
    // "I taught X this": the learner confirms from their own phone, then both score
    if (p === "/api/teach" && req.method === "POST") {
      if (!me) return needMe();
      const body = await readJson(req);
      const learner = member(body.learner);
      if (!SKILL_IDS.has(body.skill)) return send(res, 400, { error: "Unknown skill" });
      if (!learner || learner.id === me.id) return send(res, 400, { error: "Pick who you taught" });
      db.teach = db.teach || [];
      if (db.teach.some((t) => !t.void && t.teacher === me.id && t.learner === learner.id && t.skill === body.skill)) return send(res, 409, { error: "Already logged" });
      // the skill has to be open in the tree (the client only shows the control on open skills; the server agrees)
      const sk = REWARDS.compute(db, CONTENT, { today: localToday() }).skills[body.skill];
      if (!sk || !sk.open) return send(res, 400, { error: "That skill is not open yet" });
      // a few claims waiting is plenty: one kid should not be able to fill every phone with confirm cards
      if (db.teach.filter((t) => !t.void && !t.confirmed && t.teacher === me.id).length >= TEACH_OPEN_CAP) return send(res, 429, { error: "You have " + TEACH_OPEN_CAP + " lessons waiting to be confirmed. Wait for one of those first." });
      db.teach.push({ id: crypto.randomBytes(6).toString("hex"), skill: body.skill, teacher: me.id, learner: learner.id, at: now(), confirmed: null });
      if (db.teach.length > 500) db.teach = db.teach.slice(-500);
      persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/teach\/([a-f0-9]{12})$/)) && (req.method === "PUT" || req.method === "DELETE")) {
      if (!me) return needMe();
      const t = (db.teach || []).find((x) => x.id === m[1] && !x.void);
      if (!t) return send(res, 404, { error: "Not found" });
      if (req.method === "DELETE") {
        if (t.teacher !== me.id && t.learner !== me.id && !isAdult) return send(res, 403, { error: "Not yours" });
        t.void = true; persist(); return send(res, 200, out());
      }
      if (t.learner !== me.id) return send(res, 403, { error: "Only " + (member(t.learner) || { name: "the learner" }).name + " can confirm that" });
      if (!t.confirmed) t.confirmed = now();
      persist(); return send(res, 200, out());
    }
    // "Remove this person and their history": grown-up once one exists, never yourself, never the last grown-up while kids remain. Undo for 15 minutes.
    if ((m = p.match(/^\/api\/family\/([A-Za-z0-9]{1,24})$/)) && req.method === "DELETE") {
      if (!me) return needMe();
      if (hasAdult && !isAdult) return send(res, 403, { error: "Ask a grown-up to remove someone" });
      const who = member(m[1]);
      if (!who) return send(res, 404, { error: "Not found" });
      if (who.id === me.id) return send(res, 400, { error: "You can't remove yourself. Ask another grown-up." }); // so the last grown-up always stays
      const r = removePerson(who, me.id);
      log("removed", who.id, "by", me.id, JSON.stringify(r.counts));
      persist(); return send(res, 200, out());
    }
    if ((m = p.match(/^\/api\/family\/([A-Za-z0-9]{1,24})\/restore$/)) && req.method === "POST") {
      if (!me) return needMe();
      if (hasAdult && !isAdult) return send(res, 403, { error: "Ask a grown-up to undo that" });
      const r = (db.removals || []).find((x) => x.person.id === m[1]);
      if (!r || now() - r.at > UNDO_MS) return send(res, 404, { error: "Too late to undo. Add them again as a new person." });
      if (member(m[1])) return send(res, 409, { error: "They are already back" });
      if (db.settings.family.length >= 6) return send(res, 409, { error: "Up to 6 people. Remove someone else first." });
      restorePerson(r);
      log("restored", m[1], "by", me.id);
      persist(); return send(res, 200, out());
    }
    // A household changes its own PINs. A new family PIN rotates the tag, so every phone in the family, this one too, is signed out.
    if (p === "/api/pins" && req.method === "PUT") {
      if (!multi) return send(res, 409, { error: "This server's PINs are set in its environment (PUPPY_PIN, PUPPY_ADULT_PIN)" });
      if (!me) return needMe();
      if (hasAdult && !isAdult) return send(res, 403, { error: "Ask a grown-up to change the PINs" });
      const body = await readJson(req);
      const np = body.pin === undefined ? null : String(body.pin), na = body.adultPin === undefined ? null : String(body.adultPin);
      if (np === null && na === null) return send(res, 400, { error: "Nothing to change" });
      if (np !== null && !/^\d{4,8}$/.test(np)) return send(res, 400, { error: "Family PIN: 4 to 8 digits" });
      if (na !== null && na !== "" && !/^\d{4,8}$/.test(na)) return send(res, 400, { error: "Grown-up PIN: 4 to 8 digits, or empty to turn it off" });
      H.setPins(np, na);
      log("pins changed", H.id, "by", me.id, np !== null ? "family" : "", na !== null ? "grown-up" : "");
      if (np === null) return send(res, 200, { ok: true, signedOut: false });
      return send(res, 200, { ok: true, signedOut: true }, { "Set-Cookie": ["pt_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", "pt_me=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"] });
    }
    // The grown-up who started the family can delete it: paused at once, gone for good after the grace period.
    if (p === "/api/household" && req.method === "DELETE") {
      if (!multi) return send(res, 409, { error: "This server hosts one family" });
      if (!me) return needMe();
      if (!isAdult || (H.rec.owner && me.email !== H.rec.owner)) return send(res, 403, { error: "Only the grown-up who started the family can delete it" });
      H.rec.flags.wipeAt = now() + WIPE_MS; saveIndex();
      log("household delete requested", H.id, "by", me.id);
      return send(res, 200, { ok: true, days: Math.round(WIPE_MS / 864e5) }, { "Set-Cookie": ["pt_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", "pt_me=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"] });
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
  server.households = { multi, create: createHousehold, get: (id) => households.get(id) || null, byCode, reload: refreshIndex, sweep, list: listOut };
  server.notifier = households.has("default") ? households.get("default").notifier : null;
  server.mailer = mailer;
  server.on("close", () => { households.forEach((H) => H.stop()); if (sweeper) clearInterval(sweeper); });
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
