/* Puppy School HQ: app logic.
 * Storage modes, picked automatically:
 *   server : self-hosted with server/server.js (family PIN, everyone syncs)
 *   local  : anywhere else (static hosting, opened from disk), saved on this device
 * Rewards (points, streaks, levels, badges, missions) are computed by rewards.js from the
 * chart itself, so every phone agrees without extra sync.
 */
(function () {
"use strict";
const C = window.PUPPY_CONTENT;
const R = window.PUPPY_REWARDS;
const $ = (s) => document.querySelector(s);
function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  (Array.isArray(kids) ? kids : [kids]).forEach((c) => { if (c != null && c !== false) n.append(c); });
  return n;
}
function lsGet(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (e) { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400); }
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p || 12); } catch (e) {} };

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseIso = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d) => DAYS[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()];
const short = (d) => d.getDate() + " " + MON[d.getMonth()];
let today = new Date(); today.setHours(0, 0, 0, 0);
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); if (m < 1) return "just now"; if (m < 60) return m + " min ago"; const h = Math.floor(m / 60); return h < 24 ? h + " h " + (m % 60) + " min ago" : Math.floor(h / 24) + " day" + (h >= 48 ? "s" : "") + " ago"; };

/* ---------- pronouns: content is written with "she"; swap for boys ---------- */
const OBJ = new Set("a an the for to with up down in out off when while and again back on onto into away so as if until from each every before after too more less is was gets get has needs need knows know learns learn wants want can will at by over round around understand what how why where who that this these those something anything some any lots plenty time space enough just only straight first near close all both yet".split(" "));
function T(str) {
  if (!S.settings || S.settings.puppy.sex !== "boy" || typeof str !== "string") return str;
  return str
    .replace(/\bShe's\b/g, "He's").replace(/\bshe's\b/g, "he's")
    .replace(/\bShe\b/g, "He").replace(/\bshe\b/g, "he")
    .replace(/\bherself\b/g, "himself")
    .replace(/\b([Hh])er\b(\W*)(\w*)/g, (m, h, sep, next) => {
      const obj = !next || /[.,!?;:)"]/.test(sep) || /^\d/.test(next) || OBJ.has(next.toLowerCase());
      return (h === "H" ? (obj ? "Him" : "His") : (obj ? "him" : "his")) + sep + next;
    });
}

/* ---------- state ---------- */
const S = { settings: null, ticks: {}, logs: {}, mastery: {}, toilet: [], photo: false, scores: null, push: [], sms: false, vapid: "", social: {}, me: undefined, adultPin: false };
let store = null;
let viewDay = new Date(today);
let staticKey = "";
const PCOL = ["var(--p1)", "var(--p2)", "var(--p3)", "var(--p4)", "var(--p5)", "var(--p6)"];
const family = () => (S.settings ? S.settings.family : []);
const person = (id) => family().find((p) => p.id === id) || null;
const colorOf = (p) => PCOL[Math.max(0, family().indexOf(p)) % PCOL.length];
const tickKey = (date, pid, slot) => date + "_" + pid + "_" + slot;
const startDate = () => parseIso(S.settings && S.settings.start) || today;
const weekIndex = (d) => Math.floor((d - startDate()) / 864e5 / 7);
const pupName = () => (S.settings && S.settings.puppy.name) || "your puppy";
const skillById = (id) => C.skills.find((s) => s.id === id) || null;
const BITE = [["😇", "Angel"], ["🙂", "Gentle"], ["😬", "Mouthy"], ["😣", "Bitey"], ["🦈", "Shark"]];
const SLOT_ICON = { am: "sunrise", pm: "sun", ev: "moon" };
const BADGE_COLOUR = { "Showing up": "var(--sun)", Streaks: "var(--accent)", Skills: "var(--hdr2)", Biting: "var(--grass)", Toilet: "var(--p6)", Socialising: "var(--p3)", Teamwork: "var(--p5)" };
function icon(name, cls) { const n = document.createElementNS("http://www.w3.org/2000/svg", "svg"); n.setAttribute("class", "ic" + (cls ? " " + cls : "")); n.setAttribute("aria-hidden", "true"); const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#i-" + name); n.append(u); return n; }
function disc(name, colour, cls) { return el("span", { class: "disc" + (cls ? " " + cls : ""), style: "--dc:" + (colour || "var(--accent)") }, icon(name)); }

/* ---------- who is on this phone ---------- */
let meId = lsGet("pt.me", null);
const me = () => person(meId);
const isAdult = (p) => !!p && p.kind === "adult";
async function setMe(id) {
  if (store && store.mode === "server") {
    let adultPin;
    const p = person(id);
    if (p && p.kind === "adult" && S.adultPin) { adultPin = prompt("Grown-up PIN for " + p.name + ":"); if (adultPin == null) return false; }
    const r = await api("POST", "api/me", { pid: id, adultPin });
    if (r.status === 401) { location.reload(); return false; }
    if (!r.ok) { toast((r.json && r.json.error) || "Couldn't switch"); return false; }
    store.apply(r.json);
  }
  meId = id; lsSet("pt.me", id); return true;
}

/* ---------- theme ---------- */
function applyTheme() {
  const t = lsGet("pt.theme", "system");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#3a241c" : "#5b3427";
}

/* ---------- scores ---------- */
function recompute() {
  try { S.scores = S.settings ? R.compute(S, C, { today: iso(today) }) : null; } catch (e) { console.error(e); S.scores = null; }
}
const scoreOf = (pid) => (S.scores && S.scores.people[pid]) || null;

/* ---------- stores ---------- */
async function api(method, url, body) {
  const r = await fetch(url, { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, json };
}
class LocalStore {
  constructor() { this.mode = "local"; }
  async init(cb) {
    this.cb = cb;
    S.settings = lsGet("pt.settings", null);
    const t = lsGet("pt.ticks", {}); S.ticks = Array.isArray(t) ? Object.fromEntries(t.map((k) => [k, { at: 0 }])) : t;
    S.logs = lsGet("pt.logs", {}); S.mastery = lsGet("pt.mastery", {}); S.toilet = lsGet("pt.toilet", []);
    S.photo = !!lsGet("pt.photo", null); S.social = lsGet("pt.social", {});
    cb();
  }
  save() { lsSet("pt.settings", S.settings); lsSet("pt.ticks", S.ticks); lsSet("pt.logs", S.logs); lsSet("pt.mastery", S.mastery); lsSet("pt.toilet", S.toilet); lsSet("pt.social", S.social); this.cb(); }
  async setSocial(item, by, mood, on) { const L = (S.social[item] || []).filter((x) => x.by !== by); if (on !== false) L.push({ by, mood, at: Date.now() }); S.social[item] = L; this.save(); }
  async saveSettings(x) { S.settings = x; this.save(); }
  async setTick(k, on, extra) { if (on) S.ticks[k] = Object.assign({ at: Date.now() }, extra || {}); else delete S.ticks[k]; this.save(); }
  async setLog(date, v) { if (v.bite) S.logs[date] = v; else delete S.logs[date]; this.save(); }
  async setMastery(skill, by, witness, on) { const e = (S.mastery[skill] = S.mastery[skill] || { done: [] }); e.done = e.done.filter((d) => d.by !== by); if (on !== false) e.done.push({ by, witness, at: Date.now() }); this.save(); }
  async addToilet(x) { S.toilet.push(Object.assign({ id: Math.random().toString(16).slice(2, 14), at: Date.now() }, x)); if (S.toilet.length > 1000) S.toilet = S.toilet.slice(-1000); this.save(); }
  async voidToilet(id) { const t = S.toilet.find((x) => x.id === id); if (t) t.void = true; this.save(); }
  async setPhoto(data) { if (data) lsSet("pt.photo", data); else { try { localStorage.removeItem("pt.photo"); } catch (e) {} } S.photo = !!data; this.cb(); }
  photoUrl() { return lsGet("pt.photo", null); }
  exportJson() { return { settings: S.settings, ticks: S.ticks, logs: S.logs, mastery: S.mastery, toilet: S.toilet }; }
}
class ServerStore {
  constructor() { this.mode = "server"; this.rev = -1; }
  apply(j) {
    if (!j || j.rev === undefined) return;
    this.rev = j.rev;
    S.settings = j.settings || null;
    S.ticks = j.ticks || {}; S.logs = j.logs || {}; S.mastery = j.mastery || {}; S.toilet = j.toilet || [];
    S.push = j.push || []; S.sms = !!j.sms; S.vapid = j.vapid || ""; S.social = j.social || {}; S.adultPin = !!j.adultPin; S.share = j.share || null;
    if ("me" in j) { S.me = j.me; if (j.me && j.me !== meId) { meId = j.me; lsSet("pt.me", j.me); } }
    if (j.photo !== S.photo) { S.photo = !!j.photo; this.photoBust = Date.now(); }
    this.cb();
  }
  async init(cb) {
    this.cb = cb;
    const r = await api("GET", "api/state");
    if (r.status === 401) return "pin";
    if (!r.ok) throw new Error("server");
    if (r.json && r.json.settings && !r.json.me && meId && r.json.settings.family.some((p) => p.id === meId)) {
      const p = r.json.settings.family.find((x) => x.id === meId);
      if (!(p.kind === "adult" && r.json.adultPin)) { const m = await api("POST", "api/me", { pid: meId }); if (m.ok) r.json = m.json; }
    }
    if (r.json && r.json.settings && !r.json.me) { meId = null; try { localStorage.removeItem("pt.me"); } catch (e) {} }
    this.apply(r.json);
    if (!this.timer) {
      this.timer = setInterval(() => this.refresh(), 10000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.refresh(); });
    }
  }
  async refresh() {
    if (document.hidden) return;
    const r = await api("GET", "api/state?since=" + this.rev);
    if (r.status === 401) { location.reload(); return; }
    if (r.ok && r.json && !r.json.unchanged) this.apply(r.json);
  }
  async login(pin) { return api("POST", "api/login", { pin }); }
  async logout() { await api("POST", "api/logout"); location.reload(); }
  async write(method, url, body) {
    const r = await api(method, url, body);
    if (r.status === 401) { location.reload(); return; }
    if (r.status === 403 && r.json && r.json.code === "pick") { meId = null; renderWho(); throw new Error("Pick yourself first"); }
    if (!r.ok) throw new Error((r.json && r.json.error) || "save failed");
    this.apply(r.json);
  }
  saveSettings(x) { return this.write("PUT", "api/settings", x); }
  async setTick(k, on, extra) {
    const prev = S.ticks[k];
    if (on) S.ticks[k] = Object.assign({ at: Date.now() }, extra || {}); else delete S.ticks[k];
    this.cb();
    try { await this.write("PUT", "api/ticks/" + encodeURIComponent(k), Object.assign({ on }, extra || {})); }
    catch (e) { if (prev) S.ticks[k] = prev; else delete S.ticks[k]; this.cb(); throw e; }
  }
  async setLog(date, v) { if (v.bite) S.logs[date] = v; else delete S.logs[date]; this.cb(); return this.write("PUT", "api/logs/" + date, v); }
  setMastery(skill, by, witness, on) { return this.write("PUT", "api/mastery/" + skill, { by, witness, on }); }
  setSocial(item, by, mood, on) { return this.write("PUT", "api/social/" + item, { by, mood, on }); }
  makeShare() { return this.write("POST", "api/share", {}); }
  dropShare() { return this.write("DELETE", "api/share"); }
  addToilet(x) { return this.write("POST", "api/toilet", x); }
  voidToilet(id) { return this.write("DELETE", "api/toilet/" + id); }
  setPhoto(data) { return data ? this.write("PUT", "api/photo", { data }) : this.write("DELETE", "api/photo"); }
  photoUrl() { return S.photo ? "api/photo?v=" + (this.photoBust || 0) : null; }
  exportJson() { return { settings: S.settings, ticks: S.ticks, logs: S.logs, mastery: S.mastery, toilet: S.toilet }; }
  async subscribePush(subscription, pid, prefs, label) { const r = await api("POST", "api/push/subscribe", { subscription, prefs, label }); if (!r.ok) throw new Error((r.json && r.json.error) || "save failed"); this.apply(r.json); return r.json.subId; }
  setPushPrefs(id, prefs, by) { return this.write("PUT", "api/push/" + id, { prefs, by }); }
  deletePush(id) { return this.write("DELETE", "api/push/" + id); }
  async testPush(id) { const r = await api("POST", "api/push/" + id + "/test"); if (!r.ok) throw new Error((r.json && r.json.error) || "test failed"); }
  async testSms(pid, by) { const r = await api("POST", "api/sms/test", { pid, by }); if (!r.ok) throw new Error((r.json && r.json.error) || "test failed"); }
}
async function pickStore() {
  if (/^https?:/.test(location.protocol)) {
    try {
      const r = await fetch("api/health", { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { const j = await r.json(); if (j && j.app === "puppy-training") return new ServerStore(); }
    } catch (e) {}
  }
  return new LocalStore();
}
function setSync() {
  const s = $("#sync");
  if (!store) return;
  if (store.mode === "server") { s.textContent = "Family sync"; s.dataset.s = "live"; }
  else { s.textContent = "This phone"; s.dataset.s = "local"; }
  s.title = s.textContent; s.setAttribute("aria-label", s.textContent);
}
async function safe(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(e && e.message && e.message !== "save failed" ? e.message : "Couldn't save. Check your connection."); }
}

/* ---------- navigation ---------- */
const TABS = ["today", "skills", "pack", "help", "watch"];
let current = "today";
function show(tab, push) {
  if (push !== false && location.hash !== "#" + tab && S.settings) { try { history.pushState(null, "", "#" + tab); } catch (e) {} }
  document.querySelectorAll("section.panel").forEach((s) => (s.hidden = s.dataset.tab !== tab));
  const inApp = TABS.includes(tab);
  $("#tabs").hidden = !(inApp || (tab === "settings" && S.settings));
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.go === tab ? "true" : "false"));
  if (inApp) { current = tab; try { sessionStorage.setItem("pt.tab", tab); } catch (e) {} }
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.go)));
$("#gear").addEventListener("click", () => { if (!S.settings) return; renderSettings(false); show("settings"); });
$("#meChip").addEventListener("click", () => { if (S.settings) renderWho(); });
window.addEventListener("popstate", () => {
  if (!S.settings) return;
  const h = (location.hash || "").slice(1);
  if (TABS.includes(h)) show(h, false);
  else if (h === "settings") { renderSettings(false); show("settings", false); }
  else if (h === "who") renderWho(false);
  else show("today", false);
});

/* ---------- avatars and small widgets ---------- */
function avatar(p, size) {
  return el("span", { class: "av" + (size ? " " + size : ""), style: "--c:" + colorOf(p), "aria-hidden": "true", text: p.name[0].toUpperCase() });
}
function ring(n, total, size, color) {
  const r = 15.9155, segs = [];
  for (let i = 0; i < total; i++) {
    const on = i < n;
    segs.push('<circle r="' + r + '" cx="18" cy="18" fill="none" stroke="' + (on ? color || "var(--blaze)" : "var(--sunk)") + '" stroke-width="3.6" stroke-dasharray="' + (100 / total - 4) + ' ' + (100 - 100 / total + 4) + '" stroke-dashoffset="' + (25 - (100 / total) * i) + '" stroke-linecap="round"/>');
  }
  const w = size || 44;
  return el("span", { class: "ring", role: "img", "aria-label": n + " of " + total + " sessions today", html: '<svg viewBox="0 0 36 36" width="' + w + '" height="' + w + '" aria-hidden="true">' + segs.join("") + '</svg><b aria-hidden="true">' + n + "/" + total + "</b>" });
}
function bar(pct, cls, label) { const v = Math.round(Math.max(0, Math.min(100, pct))); return el("div", { class: "bar " + (cls || ""), role: "progressbar", "aria-valuenow": String(v), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": label || "Progress" }, el("i", { style: "width:" + v + "%" })); }
function sparkline(vals) {
  const w = 7 * 12, h = 28;
  const pts = vals.map((v, i) => v ? '<rect x="' + (i * 12 + 2) + '" y="' + (h - v * 5) + '" width="8" height="' + v * 5 + '" rx="2" fill="' + (v <= 2 ? "var(--good)" : v === 3 ? "var(--warn)" : "var(--bad)") + '"/>' : '<rect x="' + (i * 12 + 2) + '" y="' + (h - 3) + '" width="8" height="3" rx="1.5" fill="currentColor" opacity=".3"/>').join("");
  return el("span", { class: "spark", html: '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-label="Bite meter this week">' + pts + "</svg>" });
}

/* ---------- header ---------- */
function renderHeader() {
  const st = S.settings;
  $("#pupTitle").textContent = st && st.puppy.name ? st.puppy.name : "Puppy School HQ";
  const born = st && parseIso(st.puppy.born);
  let line = (st && st.puppy.breed) || "Family puppy training";
  if (born) { const days = Math.round((today - born) / 864e5); if (days >= 0) line = Math.floor(days / 7) + " weeks · " + line; }
  $("#pupAge").textContent = line;
  $("#gear").hidden = !st;
  const badge = $("#badge");
  const url = store && S.photo ? store.photoUrl() : null;
  if (url) { badge.innerHTML = ""; badge.append(el("img", { src: url, alt: pupName() })); badge.classList.add("photo"); }
  else { badge.classList.remove("photo"); badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#4f3ddc"><ellipse cx="7" cy="8.5" rx="2.2" ry="3"/><ellipse cx="17" cy="8.5" rx="2.2" ry="3"/><ellipse cx="3.6" cy="13" rx="1.9" ry="2.6"/><ellipse cx="20.4" cy="13" rx="1.9" ry="2.6"/><path d="M12 11.5c-3.2 0-6 2.8-6 5.6 0 1.8 1.3 2.9 3 2.9 1 0 1.9-.5 3-.5s2 .5 3 .5c1.7 0 3-1.1 3-2.9 0-2.8-2.8-5.6-6-5.6z"/></svg>'; }
  const chip = $("#meChip"); const m = me();
  chip.hidden = !st || !m;
  if (m) { chip.replaceChildren(avatar(m, "sm"), el("span", { text: m.name })); chip.setAttribute("aria-label", "This phone is " + m.name + ". Tap to switch."); }
}

/* ---------- PIN screen ---------- */
function renderPin() {
  const P = $("#p-pin"); P.replaceChildren();
  let pin = "";
  const dots = el("div", { class: "pin-dots", "aria-hidden": "true" });
  const msg = el("div", { class: "pin-msg", role: "alert" });
  const draw = () => { dots.replaceChildren(...[...Array(Math.max(4, pin.length))].map((_, i) => el("i", { class: i < pin.length ? "on" : "" }))); };
  const submit = async () => {
    if (pin.length < 4) { msg.textContent = "PIN is at least 4 numbers"; return; }
    msg.textContent = "Checking…";
    const r = await store.login(pin);
    if (r.ok) { msg.textContent = ""; boot2(); return; }
    pin = ""; draw();
    box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
    if (r.status === 429) { const m = Math.ceil(((r.json && r.json.retryAfter) || 900) / 60); msg.textContent = "Too many tries. Wait " + m + " minute" + (m > 1 ? "s" : "") + "."; }
    else msg.textContent = "Wrong PIN. Try again.";
  };
  const press = (k) => {
    if (k === "del") pin = pin.slice(0, -1);
    else if (k === "go") return submit();
    else if (pin.length < 8) pin += k;
    msg.textContent = ""; draw();
  };
  const pad = el("div", { class: "pin-pad" });
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"].forEach((k) =>
    pad.append(el("button", { class: k === "del" || k === "go" ? "alt" : "", "aria-label": k === "del" ? "Delete" : k === "go" ? "Unlock" : k, onclick: () => press(k), text: k === "del" ? "⌫ Delete" : k === "go" ? "Unlock →" : k })));
  const box = el("div", { class: "pin" }, [el("h2", { class: "h2", text: "Enter the family PIN" }), dots, msg, pad]);
  document.addEventListener("keydown", (e) => { if ($("#p-pin").hidden) return; if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("del"); else if (e.key === "Enter") press("go"); });
  draw();
  P.append(el("div", { class: "pin-wrap" }, box));
  show("pin");
}

/* ---------- who's this phone ---------- */
function renderWho(push) {
  const P = $("#p-who"); P.replaceChildren();
  P.append(el("div", { class: "card focus" }, [el("div", { class: "eyebrow", text: "Whose phone is this?" }), el("h2", { class: "h2", text: "Pick yourself" }),
    el("p", { class: "note", style: "margin-top:6px", text: "Your ticks, streak and badges go to you. Tap your name in the top bar any time to switch." })]));
  const grid = el("div", { class: "who-grid" });
  family().forEach((p) => grid.append(el("button", { class: "who", style: "--c:" + colorOf(p), onclick: async () => { if (!(await setMe(p.id))) return; buzz(); renderHeader(); renderAll(); show(current); } }, [avatar(p, "lg"), el("b", { text: p.name }), el("small", { text: (C.kinds[p.kind] ? C.kinds[p.kind].name : "") + (p.kind === "adult" && S.adultPin ? " · PIN" : "") })])));
  P.append(grid);
  show("who", push);
}

/* ---------- settings / setup ---------- */
/* ---------- photo cropper: drag, pinch to zoom, two-finger rotate, circular crop ---------- */
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) {}
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Couldn't read that photo")); img.src = URL.createObjectURL(file); });
}
function cropPhoto(file) {
  return new Promise(async (resolve) => {
    let img; try { img = await loadBitmap(file); } catch (e) { toast(e.message); return resolve(null); }
    const iw = img.width, ih = img.height;
    const vp = Math.min(window.innerWidth - 32, 360), dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = el("canvas", { width: vp * dpr, height: vp * dpr, style: "width:" + vp + "px;height:" + vp + "px", tabindex: "0", role: "img", "aria-label": "Photo crop. Arrow keys move, plus and minus zoom, R rotates." });
    const ctx = cv.getContext("2d");
    const st = { s: vp / Math.min(iw, ih), a: 0, x: 0, y: 0 };
    const minS = vp / Math.max(iw, ih) * 0.5;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vp, vp);
      ctx.save(); ctx.translate(vp / 2 + st.x, vp / 2 + st.y); ctx.rotate(st.a); ctx.scale(st.s, st.s); ctx.drawImage(img, -iw / 2, -ih / 2); ctx.restore();
      ctx.fillStyle = "rgba(10,6,24,.62)"; ctx.beginPath(); ctx.rect(0, 0, vp, vp); ctx.arc(vp / 2, vp / 2, vp / 2 - 2, 0, Math.PI * 2, true); ctx.fill("evenodd");
      ctx.strokeStyle = "#ffc83d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(vp / 2, vp / 2, vp / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    };
    const ptrs = new Map(); let last = null;
    const geo = () => { const p = [...ptrs.values()]; if (p.length < 2) return { x: p[0].x, y: p[0].y }; const dx = p[1].x - p[0].x, dy = p[1].y - p[0].y; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) }; };
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = geo(); });
    cv.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = geo(); if (!last) { last = g; return; }
      st.x += g.x - last.x; st.y += g.y - last.y;
      if (g.d && last.d) { st.s = Math.max(minS, Math.min(st.s * (g.d / last.d), 20)); st.a += g.a - last.a; }
      last = g; draw();
    });
    const up = (e) => { ptrs.delete(e.pointerId); last = ptrs.size ? geo() : null; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => { e.preventDefault(); st.s = Math.max(minS, Math.min(st.s * (e.deltaY < 0 ? 1.08 : 0.92), 20)); draw(); }, { passive: false });
    cv.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 20 : 6;
      if (e.key === "ArrowLeft") st.x -= step; else if (e.key === "ArrowRight") st.x += step; else if (e.key === "ArrowUp") st.y -= step; else if (e.key === "ArrowDown") st.y += step;
      else if (e.key === "+" || e.key === "=") st.s = Math.min(20, st.s * 1.1); else if (e.key === "-" || e.key === "_") st.s = Math.max(minS, st.s / 1.1);
      else if (e.key === "r" || e.key === "R") st.a += Math.PI / 2; else if (e.key === "Escape") { finish(false); return; } else return;
      e.preventDefault(); draw();
    });
    const finish = (ok) => {
      ov.remove(); document.body.style.overflow = "";
      if (!ok) return resolve(null);
      const out = 320, oc = document.createElement("canvas"); oc.width = out; oc.height = out;
      const k = out / vp, c = oc.getContext("2d");
      c.fillStyle = "#fff"; c.fillRect(0, 0, out, out);
      c.translate(out / 2 + st.x * k, out / 2 + st.y * k); c.rotate(st.a); c.scale(st.s * k, st.s * k); c.drawImage(img, -iw / 2, -ih / 2);
      let q = 0.86, data = oc.toDataURL("image/jpeg", q);
      while (data.length > 300 * 1024 && q > 0.4) { q -= 0.1; data = oc.toDataURL("image/jpeg", q); }
      resolve(data);
    };
    const ov = el("div", { class: "cropper", role: "dialog", "aria-modal": "true", "aria-label": "Crop photo" }, [
      el("p", { text: "Drag to move. Pinch to zoom. Two fingers to rotate. On a keyboard: arrows, plus, minus and R." }),
      cv,
      el("div", { class: "row", style: "justify-content:center" }, [
        el("button", { class: "btn ghost", type: "button", text: "↺ Rotate", onclick: () => { st.a -= Math.PI / 2; draw(); } }),
        el("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => finish(false) }),
        el("button", { class: "btn", type: "button", text: "Use photo", onclick: () => finish(true) })])
    ]);
    document.body.style.overflow = "hidden"; document.body.append(ov); draw(); cv.focus();
  });
}
function renderSettings(firstRun) {
  const P = $("#p-settings"); P.replaceChildren();
  const st = S.settings || { puppy: { name: "", sex: "girl", breed: "", born: "" }, start: iso(today), family: [{ id: "p1", name: "", kind: "kid", target: 21, age: "" }] };
  const locked = !firstRun && store.mode === "server" && family().some(isAdult) && !isAdult(me());
  const fam = JSON.parse(JSON.stringify(st.family)).map((p) => { const kind = C.kinds[p.kind] ? p.kind : "kid"; return Object.assign({ age: "" }, p, { kind, target: Number(p.target) > 0 ? Number(p.target) : C.kinds[kind].target }); });
  const kindSel = (p) => el("select", { "aria-label": "Kid or grown-up", onchange: (e) => { p.kind = e.target.value; if (!p.touched) p.target = C.kinds[p.kind].target; drawFam(); } },
    Object.keys(C.kinds).map((k) => el("option", { value: k, selected: p.kind === k, text: C.kinds[k].name })));
  const ageSel = (p) => el("select", { "aria-label": "Age", onchange: (e) => (p.age = e.target.value) },
    ["", "5-7", "8-9", "10-11", "12-14", "15+"].map((a) => el("option", { value: a, selected: (p.age || "") === a, text: a ? "Age " + a : "Age (optional)" })));
  const famBox = el("div", { style: "display:grid;gap:8px" });
  const drawFam = () => {
    famBox.replaceChildren(...fam.map((p, i) => el("div", { class: "fam-row", style: "--c:" + PCOL[i % PCOL.length] }, [
      el("span", { class: "av", "aria-hidden": "true", text: (p.name || "?")[0].toUpperCase() }),
      el("div", { class: "fields" }, [
        el("input", { type: "text", id: "fam-" + p.id, maxlength: "20", placeholder: "Name", value: p.name, "aria-label": "Name", oninput: (e) => (p.name = e.target.value) }),
        el("div", { class: "row" }, [kindSel(p), p.kind === "kid" ? ageSel(p) : null,
          el("label", { class: "target" }, ["Goal ", el("input", { type: "number", min: "1", max: "30", value: p.target || C.kinds[p.kind].target, "aria-label": "Sessions a week", oninput: (e) => { p.target = Number(e.target.value); p.touched = true; } }), " a week"])]),
        (isAdult(me()) || !family().some(isAdult)) && store.mode === "server" ? el("div", { class: "row" }, [
          el("input", { type: "tel", placeholder: "Mobile (for texts)", value: p.phone || "", "aria-label": "Mobile number", style: "flex:1;min-width:150px", oninput: (e) => (p.phone = e.target.value) }),
          el("label", { class: "target" }, [el("input", { type: "checkbox", checked: !!p.sms, onchange: (e) => (p.sms = e.target.checked) }), " text " + (p.name || "them")])]) : null
      ]),
      fam.length > 1 ? el("button", { class: "iconbtn", type: "button", "aria-label": "Remove " + (p.name || "person"), text: "✕", onclick: () => { fam.splice(i, 1); drawFam(); } }) : null
    ])));
  };
  drawFam();
  const addBtn = el("button", { class: "btn ghost", type: "button", text: "+ Add a person", onclick: () => {
    if (fam.length >= 6) { toast("Up to 6 people"); return; }
    fam.push({ id: "p" + Date.now().toString(36), name: "", kind: "kid", target: 21, age: "" }); drawFam();
  } });
  const f = (id, label, input, extra) => el("div", { class: "field" }, [el("label", { for: id, text: label }), input, extra]);
  const name = el("input", { type: "text", id: "set-name", maxlength: "24", value: st.puppy.name, placeholder: "e.g. Pepper" });
  const sex = el("select", { id: "set-sex" }, [el("option", { value: "girl", selected: st.puppy.sex !== "boy", text: "Girl" }), el("option", { value: "boy", selected: st.puppy.sex === "boy", text: "Boy" })]);
  const breed = el("input", { type: "text", id: "set-breed", maxlength: "80", value: st.puppy.breed, placeholder: "e.g. German Shorthaired Pointer × heading dog" });
  const born = el("input", { type: "date", id: "set-born", value: st.puppy.born || "" });
  const start = el("input", { type: "date", id: "set-start", value: st.start || iso(today) });
  const dateWords = (input, empty) => {
    const out = el("small", { class: "date-words" });
    const draw = () => { const d = input.value ? new Date(input.value + "T12:00:00") : null; out.textContent = d && !isNaN(d) ? d.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : empty; };
    input.addEventListener("input", draw); draw(); return out;
  };
  const save = el("button", { class: "btn", type: "button", text: firstRun ? "Start training" : "Save", onclick: async () => {
    const famClean = fam.map((p) => ({ id: p.id, name: p.name.trim().slice(0, 20), kind: p.kind, age: p.age || "", target: Math.max(1, Math.min(30, Number(p.target) || C.kinds[p.kind].target)), phone: p.phone || "", sms: !!p.sms })).filter((p) => p.name);
    if (!famClean.length) { toast("Add at least one person"); return; }
    const next = { puppy: { name: name.value.trim().slice(0, 24), sex: sex.value, breed: breed.value.trim().slice(0, 80), born: born.value }, start: start.value || iso(today), family: famClean };
    await safe(async () => { await store.saveSettings(next); toast("Saved"); if (!me()) renderWho(); else show(firstRun ? "today" : current); });
  } });
  P.append(
    el("div", { class: "card focus" }, [el("div", { class: "eyebrow", text: firstRun ? "Welcome" : "Settings" }),
      el("h2", { class: "h2", text: firstRun ? "Set up your puppy school" : "Puppy and family" }),
      firstRun ? el("p", { class: "note", style: "margin-top:6px", text: "Takes a minute. You can change any of this later from the cog at the top." }) : null]),
    el("div", { class: "card", style: "display:grid;gap:12px" }, [
      f("set-name", "Puppy's name", name),
      el("div", { class: "row" }, [el("div", { class: "field", style: "flex:1;min-width:120px" }, [el("label", { for: "set-sex", text: "Girl or boy" }), sex]),
        el("div", { class: "field", style: "flex:2;min-width:160px" }, [el("label", { for: "set-born", text: "Birthday (roughly)" }), born, dateWords(born, "Not set")])]),
      f("set-breed", "Breed", breed),
      f("set-start", "Plan starts", start, dateWords(start, ""))
    ]));
  if (locked) [name, sex, breed, born, start].forEach((i) => (i.disabled = true));
  if (!firstRun && !locked) {
    const photoCard = el("div", { class: "card", style: "display:grid;gap:10px" }, [el("div", { class: "eyebrow", text: pupName() + "'s photo" })]);
    const prev = el("div", { class: "photo-prev" + (S.photo ? " has" : "") });
    if (S.photo) prev.append(el("img", { src: store.photoUrl(), alt: "" })); else prev.textContent = "🐶";
    const file = el("input", { type: "file", accept: "image/*", id: "set-photo", hidden: true, onchange: async (e) => {
      const fl = e.target.files && e.target.files[0]; if (!fl) return;
      e.target.value = "";
      const data = await cropPhoto(fl); if (!data) return;
      await safe(async () => { await store.setPhoto(data); renderHeader(); renderSettings(false); }, "Photo saved");
    } });
    photoCard.append(el("div", { class: "row" }, [prev, el("div", { style: "display:grid;gap:6px" }, [
      el("button", { class: "btn ghost", type: "button", text: S.photo ? "Change photo" : "Add a photo", onclick: () => file.click() }),
      S.photo ? el("button", { class: "btn ghost", type: "button", text: "Remove", onclick: () => safe(async () => { await store.setPhoto(null); renderHeader(); renderSettings(false); }) }) : null,
      el("small", { class: "note", text: "Shows in the top corner on every phone. You crop it to a circle; it is kept small." })]), file]));
    P.append(photoCard);
  }
  if (locked) {
    P.append(el("div", { class: "eyebrow", text: "Who's training" }),
      el("div", { class: "card" }, [el("ul", { class: "plain" }, family().map((p) => el("li", { text: p.name + " · " + (C.kinds[p.kind] ? C.kinds[p.kind].name : "") + " · goal " + (p.target || C.kinds[p.kind].target) + " a week" }))),
        el("p", { class: "note", style: "margin-top:8px", text: "Ask a grown-up to change names, goals or the puppy's details." })]));
  } else {
    P.append(
      el("div", { class: "eyebrow", text: "Who's training" }),
      el("div", { class: "card", style: "display:grid;gap:10px" }, [famBox, addBtn,
        el("p", { class: "note", text: "Everyone gets three 5-minute sessions a day on the chart and does every skill. The weekly goal is what your streak and progress are measured against: kids 21, grown-ups 10 by default." })]),
      el("div", { class: "row" }, [save, firstRun ? null : el("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => show(current) })])
    );
  }
  if (!firstRun) {
    const themeNow = lsGet("pt.theme", "system");
    const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Appearance" }, [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) =>
      el("button", { type: "button", role: "radio", "aria-checked": themeNow === v ? "true" : "false", text: l, onclick: (e) => { lsSet("pt.theme", v); applyTheme(); e.target.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b === e.target ? "true" : "false")); } })));
    const whoSel = el("select", { "aria-label": "This phone belongs to" }, family().map((p) => el("option", { value: p.id, selected: p.id === meId, text: p.name })));
    whoSel.addEventListener("change", async (e) => { if (!(await setMe(e.target.value))) { e.target.value = meId; return; } renderHeader(); renderAll(); toast("This phone is now " + person(meId).name + "'s"); });
    const info = el("div", { class: "card", style: "display:grid;gap:10px" }, [
      el("div", { class: "field" }, [el("label", { text: "Whose phone is this?" }), whoSel]),
      el("div", { class: "field" }, [el("label", { text: "Appearance" }), seg]),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", type: "button", text: "Export the chart (JSON)", onclick: () => {
          const blob = new Blob([JSON.stringify(store.exportJson(), null, 2)], { type: "application/json" });
          const a = el("a", { href: URL.createObjectURL(blob), download: "puppy-school-" + iso(today) + ".json" }); document.body.append(a); a.click(); a.remove();
        } }),
        store.mode === "server" ? el("button", { class: "btn ghost", type: "button", text: "Lock this phone", onclick: () => store.logout() }) : null]),
      el("p", { class: "note", text: store.mode === "server" ? "Ticks sync to everyone who has the family PIN. Changing the PIN on the server signs every phone out." : "Ticks are saved on this phone only. To share one chart with the whole family, self-host it with a family PIN (see the project README)." })]);
    P.append(el("div", { class: "eyebrow", text: "This phone" }), info);
    P.append(el("div", { class: "eyebrow", text: "Reminders" }), renderNotifCard());
    if (isAdult(me())) P.append(el("div", { class: "eyebrow", text: "Visitor card" }), renderShareCard());
  }
}

/* ---------- the visitor card: a link for grandparents and sitters ---------- */
function renderShareCard() {
  const card = el("div", { class: "card", style: "display:grid;gap:10px" });
  const url = S.share ? location.origin + "/api/visitor/" + S.share.token : null;
  card.append(el("p", { class: "note", text: "One page with the cue words, the biting steps, the house rules and the kids' rules, for anyone minding " + pupName() + ". No PIN, no family names, no chart. Anyone with the link can read it; make a new link to cut off the old one." }));
  if (url) {
    card.append(el("input", { type: "text", readonly: true, value: url, "aria-label": "Visitor card link", onclick: (e) => e.target.select() }),
      el("div", { class: "row" }, [
        el("button", { class: "btn", type: "button", text: navigator.share ? "Share link" : "Copy link", onclick: async () => {
          try { if (navigator.share) await navigator.share({ title: "Looking after " + pupName(), url }); else { await navigator.clipboard.writeText(url); toast("Copied"); } } catch (e) {}
        } }),
        el("a", { class: "btn ghost", href: url, target: "_blank", rel: "noopener", text: "Preview" }),
        el("button", { class: "btn ghost", type: "button", text: "New link", onclick: () => safe(() => store.makeShare(), "New link made; the old one is dead") }),
        el("button", { class: "btn ghost", type: "button", text: "Turn off", onclick: () => safe(() => store.dropShare(), "Visitor card off") })]));
  } else card.append(el("button", { class: "btn", type: "button", text: "Make a visitor link", onclick: () => safe(() => store.makeShare(), "Link made") }));
  return card;
}

/* ---------- reminders (web push per phone, SMS per person) ---------- */
const urlB64ToU8 = (s) => { const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
function renderNotifCard() {
  const card = el("div", { class: "card", style: "display:grid;gap:10px" });
  const m = me();
  if (store.mode !== "server") { card.append(el("p", { class: "note", text: "Reminders need the family server (the PIN version)." })); return card; }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    card.append(el("p", { class: "note", text: "This browser can't do app notifications. On iPhone, add the app to your Home Screen first, then come back here." })); return card;
  }
  const myId = lsGet("pt.pushId", null);
  const mine = S.push.find((x) => x.id === myId);
  const draw = () => {
    card.replaceChildren();
    if (!mine) {
      card.append(el("p", { text: (m ? m.name + ", " : "") + pupName() + " can nudge this phone when a session is empty: a morning one before school, one after school, one in the evening, and a streak-saver at 8pm. Never more than two a day, never during school hours or at night." }),
        el("button", { class: "btn", type: "button", text: "Turn on reminders on this phone", onclick: async () => {
          if (!m) { renderWho(); return; }
          try {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") { toast("Notifications are blocked for this site. Allow them in the browser settings."); return; }
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(S.vapid) });
            const label = (navigator.userAgent.match(/Android|iPhone|iPad|Windows|Mac/) || ["phone"])[0];
            const id = await store.subscribePush(sub.toJSON(), m.id, {}, label);
            lsSet("pt.pushId", id); buzz(); toast("Reminders on. Sending a test…");
            try { await store.testPush(id); } catch (e) { toast(e.message); }
            renderSettings(false);
          } catch (e) { toast("Couldn't turn on reminders: " + e.message); }
        } }));
    } else {
      const who = person(mine.pid);
      const pr = Object.assign({ on: true, am: true, pm: true, ev: true, risk: true, amAt: "07:00", amWeekendAt: "08:00", pmAt: "15:30", evAt: "18:30", riskAt: "20:00" }, mine.prefs || {});
      const canEdit = m && (m.id === mine.pid || isAdult(m));
      const save = (patch) => safe(() => store.setPushPrefs(mine.id, patch, m ? m.id : undefined), "Saved");
      const tgl = (key, label, timeKey) => el("label", { class: "tgl" }, [el("input", { type: "checkbox", checked: !!pr[key], disabled: !canEdit, onchange: (e) => save({ [key]: e.target.checked }) }), el("span", { text: label }),
        timeKey ? el("input", { type: "time", value: pr[timeKey], disabled: !canEdit, onchange: (e) => { if (e.target.value) save({ [timeKey]: e.target.value }); } }) : null]);
      card.append(el("div", { class: "row", style: "justify-content:space-between" }, [el("b", { text: "This phone: " + (who ? who.name : "?") + (pr.on ? "" : " (paused)") }), el("span", { class: "pill " + (pr.on ? "good" : ""), text: pr.on ? "On" : "Off" })]),
        tgl("on", "Reminders on"), tgl("am", "Morning, school days at", "amAt"), tgl("am", "Morning, weekends at", "amWeekendAt"), tgl("pm", "After school at", "pmAt"), tgl("ev", "Evening at", "evAt"), tgl("risk", "Streak-saver at", "riskAt"),
        el("div", { class: "row" }, [el("button", { class: "btn ghost", type: "button", text: "Send a test", onclick: () => safe(() => store.testPush(mine.id), "Sent") }),
          el("button", { class: "btn ghost", type: "button", text: "Turn off on this phone", onclick: async () => { await safe(async () => { try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {} await store.deletePush(mine.id); try { localStorage.removeItem("pt.pushId"); } catch (e) {} renderSettings(false); }, "Reminders off"); } })]),
        el("small", { class: "note", text: "Quiet hours are fixed: kids 8:30pm to 6:30am, grown-ups 9:30pm to 6:30am. Six ignored nudges in a row and the reminders pause themselves." }));
    }
    // grown-ups see every phone and every text setting
    if (isAdult(m)) {
      const others = S.push.filter((x) => x.id !== myId);
      if (others.length) card.append(el("div", { class: "eyebrow", text: "Other phones" }), ...others.map((x) => { const who = person(x.pid); const on = !x.prefs || x.prefs.on !== false;
        return el("div", { class: "row", style: "justify-content:space-between" }, [el("span", { text: (who ? who.name : "?") + " · " + (x.label || "phone") }),
          el("button", { class: "chip" + (on ? " on" : ""), type: "button", text: on ? "On" : "Off", onclick: () => safe(() => store.setPushPrefs(x.id, { on: !on }, m.id)) })]); }));
      const texters = family().filter((p) => p.phone);
      if (S.sms && texters.length) card.append(el("div", { class: "eyebrow", text: "Texts" }), ...texters.map((p) => el("div", { class: "row", style: "justify-content:space-between" }, [el("span", { text: p.name + " · " + p.phone + (p.sms ? " · texts on" : " · texts off") }),
        el("button", { class: "chip", type: "button", text: "Send a test text", onclick: () => safe(() => store.testSms(p.id, m.id), "Text sent") })])), el("small", { class: "note", text: "One text a day at most, mid-afternoon on school days, only if nothing is on the chart for that person. Numbers are set in the family list above." }));
      else if (!S.sms && texters.length) card.append(el("small", { class: "note", text: "Texts: no SMS gateway is configured on this server." }));
    }
  };
  draw();
  return card;
}

/* ---------- today ---------- */
function slotButton(d, p, slot, big) {
  const k = tickKey(d, p.id, slot.id), t = S.ticks[k], on = !!t && !t.void;
  const m = me(); const own = m && m.id === p.id;
  const past = viewDay < today, future = viewDay > today;
  const mission = S.scores && S.scores.missions[p.id] && S.scores.missions[p.id][slot.id];
  const sk = on && t.skill ? skillById(t.skill) : mission ? skillById(mission.skill) : null;
  const disabled = future || (past && !isAdult(m));
  const label = p.name + " " + slot.t + (on ? ", done" : ", not done");
  const b = el("button", { class: "slot" + (big ? " big" : ""), "aria-pressed": on ? "true" : "false", "aria-label": label, disabled, onclick: async () => {
    if (!m) { renderWho(); return; }
    if (on) {
      const mins = (Date.now() - (t.at || 0)) / 60000;
      if (!own && !isAdult(m) && mins > 15) { toast("Only " + p.name + " or a grown-up can undo that"); return; }
      await safe(() => store.setTick(k, false)); return;
    }
    if (!own && !confirm("Log this " + slot.t.toLowerCase() + " session for " + p.name + "?")) return;
    await safe(async () => { await store.setTick(k, true, { by: m.id, skill: sk ? sk.id : undefined }); buzz(); toast(own ? "Nice one, " + p.name + "! +" + C.points.session : "Logged for " + p.name + " by " + m.name); });
  } }, [
    on ? icon("check", "sl") : icon(SLOT_ICON[slot.id], "sl"),
    el("span", { class: "t", text: slot.t }),
    big ? el("span", { class: "sk", text: sk ? T(sk.nm) : slot.s }) : el("span", { class: "sk", text: on && t.by && t.by !== p.id && person(t.by) ? "by " + person(t.by).name : slot.s })
  ]);
  if (big && mission && !on) b.title = "Mission: " + (sk ? sk.nm : "");
  if (big && on && (own || isAdult(m)) && S.scores) {
    const openSkills = C.skills.filter((x) => S.scores.skills[x.id].open);
    const sel = el("select", { class: "skillsel", "aria-label": "Which skill was this session?", onclick: (e) => e.stopPropagation(), onchange: async (e) => {
      e.stopPropagation();
      await safe(() => store.setTick(k, true, { by: t.by || m.id, skill: e.target.value }), "Changed to " + T(skillById(e.target.value).nm));
    } }, openSkills.map((x) => el("option", { value: x.id, selected: sk && sk.id === x.id, text: T(x.nm) })));
    return el("div", { class: "slotwrap" }, [b, sel]);
  }
  return b;
}
function renderToday() {
  const P = $("#p-today"); P.replaceChildren();
  const sc = S.scores; const m = me();
  const d = iso(viewDay); const isToday = d === iso(today);

  // the puppy's progress: the shared number
  if (sc) {
    const pl = sc.puppy.level;
    const photo = store && S.photo ? el("img", { src: store.photoUrl(), alt: "" }) : icon("paw");
    P.append(el("div", { class: "card hero" }, [
      el("div", { class: "hero-top" }, [
        el("div", { class: "hero-pup" }, [photo, el("span", { class: "lvl-badge", text: pl.n })]),
        el("div", { class: "hero-txt" }, [el("div", { class: "eyebrow", text: pupName() + " · level " + pl.n + " of " + C.puppyLevels.length }), el("h2", { text: pl.name }), el("small", { text: pl.next ? (pl.next - sc.puppy.points) + " points to " + pl.nextName : "Top of the tree" })])]),
      bar(pl.pct, "big", pupName() + "'s progress to the next level"),
      el("div", { class: "hero-stats" }, [
        el("div", { class: "hs" }, [el("b", { text: sc.puppy.mastered + "/" + sc.puppy.total }), el("small", { text: "skills" })]),
        el("div", { class: "hs" }, [el("b", { text: String(sc.puppy.sessions) }), el("small", { text: "sessions" })]),
        el("div", { class: "hs" }, [el("b", { text: String(sc.calmDays) }), el("small", { text: "calm days" })]),
        el("div", { class: "hs spark" }, [sparkline(sc.biteWeek), el("small", { text: "bite week" })])]),
      sc.challenge ? el("button", { class: "chal", type: "button", onclick: () => show("pack") }, [icon(sc.challenge.icon || "star"), el("span", { text: sc.challenge.nm + " · " + sc.challenge.progress + "/" + sc.challenge.target + (sc.challenge.won ? " · won" : "") }), icon("chevron")]) : null
    ]));
  }

  // day bar
  P.append(el("div", { class: "daybar" }, [
    el("button", { class: "iconbtn", "aria-label": "Previous day", text: "‹", onclick: () => { viewDay = addDays(viewDay, -1); renderToday(); } }),
    el("h2", { text: (isToday ? "Today · " : "") + fmt(viewDay) }),
    el("button", { class: "iconbtn", "aria-label": "Next day", text: "›", disabled: isToday, onclick: () => { if (viewDay < today) { viewDay = addDays(viewDay, 1); renderToday(); } } })
  ]));
  if (viewDay < today && !isAdult(m)) P.append(el("p", { class: "note", text: "Past days can only be changed by a grown-up." }));
  if (isToday) P.append(cueStrip());

  // my missions
  if (m && isToday) {
    const my = scoreOf(m.id);
    const card = el("div", { class: "card mine", style: "--c:" + colorOf(m) }, [
      el("div", { class: "row", style: "justify-content:space-between" }, [
        el("div", { class: "who" }, [avatar(m), el("div", {}, [el("b", { text: "Your missions, " + m.name }), el("small", {}, my && my.streak ? [icon("flame", "inl flame"), my.streak + "-day streak" + (my.atRisk ? ", train today to keep it" : "")] : ["Start a streak today"])])]),
        my ? ring(my.today, 3, 48, colorOf(m)) : null]),
      el("div", { class: "slots" }, C.slots.map((s) => slotButton(d, m, s, true))),
      el("p", { class: "note", text: "Warm up with something " + T("she") + " knows, two minutes on the mission, finish on a win." })
    ]);
    P.append(card);
  } else if (!m && S.settings) {
    P.append(el("div", { class: "card" }, [el("b", { text: "Whose phone is this?" }), el("p", { class: "note", text: "Pick yourself so your sessions count for you." }), el("button", { class: "btn", type: "button", text: "Pick me", onclick: renderWho })]));
  }

  // everyone
  const people = el("div", { class: "people" });
  family().forEach((p) => {
    if (m && p.id === m.id && isToday) return;
    const ps = scoreOf(p.id);
    const row = el("div", { class: "prow", style: "--c:" + colorOf(p) }, [
      el("div", { class: "who" }, [avatar(p), el("div", {}, [el("b", { text: p.name }), el("small", {}, ps ? [ps.streak ? icon("flame", "inl flame") : null, (ps.streak ? ps.streak + " · " : "") + "Lv " + ps.level.n + " " + ps.level.name] : [])])]),
      ps && isToday ? ring(ps.today, 3, 40, colorOf(p)) : el("div", { class: "mins-today", text: C.slots.filter((s) => S.ticks[tickKey(d, p.id, s.id)]).length * 5 + " min" })
    ]);
    row.append(el("div", { class: "slots" }, C.slots.map((s) => slotButton(d, p, s, false))));
    people.append(row);
  });
  P.append(el("div", { class: "eyebrow", text: m && isToday ? "The rest of the pack" : "Everyone" }), people);

  // bite meter
  const cur = S.logs[d] && S.logs[d].bite;
  P.append(el("div", { class: "card" }, [
    el("div", { class: "row", style: "justify-content:space-between" }, [el("div", { class: "eyebrow", text: T("How bitey was she today?") }),
      el("button", { class: "chip", text: "Biting plan →", onclick: () => show("help") })]),
    el("div", { class: "meter", role: "group", "aria-label": "How bitey was " + T("she") + " today, 1 to 5" }, BITE.map(([e, l], i) => el("button", { type: "button", "aria-pressed": cur === i + 1 ? "true" : "false", "aria-label": l + ", " + (i + 1) + " of 5", disabled: viewDay > today, onclick: () => safe(() => store.setLog(d, { bite: cur === i + 1 ? 0 : i + 1, by: m ? m.id : undefined })) }, [el("span", { class: "e", "aria-hidden": "true", text: e }), el("span", { text: l })]))),
    S.logs[d] && S.logs[d].by && person(S.logs[d].by) ? el("small", { class: "note", text: "Rated by " + person(S.logs[d].by).name }) : null
  ]));

  // toilet
  if (isToday && sc) renderToilet(P, sc, m);

  // the week
  const off = (viewDay.getDay() + 6) % 7, mon = addDays(viewDay, -off);
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const t = el("table", { class: "week" });
  t.append(el("thead", {}, el("tr", {}, [el("th", { text: "" }), ...days.map((x) => el("th", { class: iso(x) === iso(today) ? "today" : "", text: DAYS[x.getDay()].slice(0, 2) })), el("th", { text: "Goal" })])));
  const tb = el("tbody");
  family().forEach((p) => {
    let tot = 0;
    const tr = el("tr", { style: "--c:" + colorOf(p) }, el("td", { text: p.name }));
    days.forEach((x) => { const ds = el("span", { class: "dots" }); C.slots.forEach((s) => { const on = !!S.ticks[tickKey(iso(x), p.id, s.id)]; if (on) tot++; ds.append(el("i", { class: on ? "on" : "" })); }); tr.append(el("td", { class: iso(x) === iso(today) ? "today" : "" }, ds)); });
    const ps = scoreOf(p.id);
    tr.append(el("td", { class: "mins", text: tot + "/" + (ps ? ps.target : "") })); tb.append(tr);
  });
  const br = el("tr", {}, el("td", { text: "Biting" }));
  days.forEach((x) => { const b = S.logs[iso(x)] && S.logs[iso(x)].bite; br.append(el("td", { class: iso(x) === iso(today) ? "today" : "", title: b ? BITE[b - 1][1] : "", text: b ? BITE[b - 1][0] : "·" })); });
  br.append(el("td", { text: "" })); tb.append(br);
  t.append(tb);
  P.append(el("div", { class: "card" }, [el("div", { class: "row", style: "justify-content:space-between" }, [el("div", { class: "eyebrow", text: "This week" }), sc ? el("small", { class: "muted", text: "Pack: " + sc.pack.weekSessions + " of " + sc.pack.weekTarget + " sessions" }) : null]), el("div", { class: "tbl-wrap" }, t)]));
  P.append(el("p", { class: "note", text: store.mode === "local" ? "Saved on this phone." : "Synced with the family." }));
}
function renderToilet(P, sc, m) {
  const tl = sc.toilet;
  const card = el("div", { class: "card toilet" }, [el("div", { class: "row", style: "justify-content:space-between" }, [el("div", { class: "eyebrow", text: "Toilet" }),
    el("small", { class: "muted", text: tl.lastOut ? "Last trip out " + ago(tl.lastOut.at) : "No trips logged yet" })])]);
  if (tl.lastOut) {
    const due = Math.min(tl.lastOut.at, Date.now()) + tl.interval * 60000 - Date.now();
    const mins = Math.round(due / 60000);
    card.append(el("p", { class: "due" + (mins <= 0 ? " now" : mins <= 10 ? " soon" : ""), text: mins <= 0 ? "Due now: take " + T("her") + " out" : "Next trip in about " + mins + " min" + (tl.ageWeeks < 14 ? " (hourly at this age, plus after naps, meals and play)" : "") }));
  } else card.append(el("p", { class: "note", text: "At " + tl.ageWeeks + " weeks: out on waking, after meals, after play, and about every " + tl.interval + " minutes awake. Log each trip and the app will tell you when the next one is due." }));
  let pendingKind = null;
  const beforeRow = el("div", { class: "chips", hidden: true });
  const kinds = el("div", { class: "tbtns" }, C.toiletKinds.map(([k, l]) => el("button", { class: "tbtn " + k, type: "button", "data-k": k, onclick: () => {
    pendingKind = k; beforeRow.hidden = false; kinds.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b.dataset.k === k));
  } }, [icon(k === "wee" ? "drop" : k === "poo" ? "leaf" : "alert"), el("span", { text: l })])));
  const log = async (before) => {
    if (!pendingKind) return;
    const k = pendingKind; pendingKind = null; beforeRow.hidden = true;
    await safe(async () => { await store.addToilet({ kind: k, before, by: m ? m.id : undefined }); buzz(); }, k === "accident" ? "Logged. No fuss, just clean up and go again sooner." : "Logged. Good " + T("girl") + "!");
  };
  beforeRow.append(el("small", { text: "What came before?" }), ...C.toiletBefore.map(([k, l]) => el("button", { class: "chip", type: "button", text: l, onclick: () => log(k) })), el("button", { class: "chip", type: "button", text: "Skip", onclick: () => log("") }));
  card.append(kinds, beforeRow);
  const todayList = tl.today.slice(-6).reverse();
  if (todayList.length) card.append(el("div", { class: "tlist" }, todayList.map((t) => el("div", { class: "row small" }, [
    el("span", {}, [icon(t.kind === "wee" ? "drop" : t.kind === "poo" ? "leaf" : "alert", "inl"), " " + new Date(t.at).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" }) + (t.before ? " · " + (C.toiletBefore.find((b) => b[0] === t.before) || ["", ""])[1].toLowerCase() : "") + (t.by && person(t.by) ? " · " + person(t.by).name : "")]),
    el("button", { class: "linkbtn", type: "button", text: "undo", "aria-label": "Undo this toilet entry", onclick: () => safe(() => store.voidToilet(t.id)) })]))));
  const worst = Object.entries(tl.accidentsAfter).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 2) card.append(el("p", { class: "note", text: "Pattern: most accidents happen " + (C.toiletBefore.find((b) => b[0] === worst[0]) || ["", ""])[1].toLowerCase() + ". Take " + T("her") + " out straight after that." }));
  P.append(card);
}

/* ---------- the cue sheet, pinned ---------- */
function cueStrip() {
  const strip = el("div", { class: "cues", role: "list", "aria-label": "Cue words everyone uses" });
  C.cues.forEach(([word, means]) => strip.append(el("button", { class: "cue", role: "listitem", type: "button", title: T(means), "aria-label": word + ": " + T(means), onclick: () => openAcc("cue-sheet", "skills") }, [el("b", { text: word }), el("small", { text: T(means).split(/[.,:]/)[0] })])));
  return el("div", { class: "cuewrap" }, [el("div", { class: "row", style: "justify-content:space-between;margin-bottom:6px" }, [el("div", { class: "eyebrow", text: "Same words, everyone" }), el("button", { class: "linkbtn", type: "button", text: "Full sheet", onclick: () => openAcc("cue-sheet", "skills") })]), strip]);
}

/* ---------- celebrations ---------- */
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = el("div", { class: "confetti", "aria-hidden": "true" });
  const cols = ["var(--blaze)", "var(--p1)", "var(--p2)", "var(--p3)", "var(--p5)", "var(--good)"];
  for (let i = 0; i < 60; i++) box.append(el("i", { style: "left:" + Math.random() * 100 + "%;background:" + cols[i % cols.length] + ";animation-delay:" + Math.random() * 0.6 + "s;animation-duration:" + (1.6 + Math.random()) + "s;transform:rotate(" + Math.random() * 360 + "deg)" }));
  document.body.append(box); setTimeout(() => box.remove(), 3000);
}
function celebrate(title, sub, emoji) {
  const before = document.activeElement;
  const ok = el("button", { class: "btn", type: "button", text: "Nice!" });
  const ov = el("div", { class: "celebrate", role: "dialog", "aria-modal": "true", "aria-labelledby": "cele-h", "aria-describedby": "cele-p" }, el("div", { class: "cbox" }, [el("div", { class: "cemoji", "aria-hidden": "true", text: emoji || "🎉" }), el("h2", { id: "cele-h", text: title }), el("p", { id: "cele-p", text: sub }), ok]));
  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); if (before && before.focus) before.focus(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  ok.addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  document.addEventListener("keydown", onKey);
  document.body.append(ov); ok.focus(); confetti(); buzz([30, 40, 30]);
}
function checkCelebrations() {
  const m = me(); const sc = m && scoreOf(m.id); if (!sc) return;
  const key = "pt.seen." + m.id;
  const seen = lsGet(key, null);
  const nowSeen = { badges: sc.badges, level: sc.level.n, streak7: sc.streak >= 7 };
  if (seen) {
    const newBadge = sc.badges.find((b) => !seen.badges.includes(b));
    if (sc.level.n > seen.level) celebrate("Level " + sc.level.n + ": " + sc.level.name, m.name + ", you levelled up. " + pupName() + " approves.", "⭐");
    else if (newBadge) { const B = C.badges.find((b) => b.id === newBadge); if (B) celebrate(B.nm, B.how, B.e); }
    else if ([7, 14, 30].includes(sc.streak) && sc.streak !== seen.lastStreak) celebrate(sc.streak + "-day streak!", "That's " + sc.streak + " days in a row. " + pupName() + " is getting the idea too.", "🔥");
  }
  nowSeen.lastStreak = sc.streak;
  lsSet(key, nowSeen);
}

/* ---------- pack (rewards) ---------- */
function renderPack() {
  const P = $("#p-pack"); P.replaceChildren();
  const sc = S.scores; if (!sc) return;
  const m = me();
  P.append(el("div", { class: "card focus" }, [el("div", { class: "eyebrow", text: "The pack" }), el("h2", { class: "h2", text: "Everyone trains, " + pupName() + " wins" }),
    el("p", { class: "note", style: "margin-top:6px", text: "Points for showing up, streaks with two free passes a week, badges for the good stuff. The podium ranks by percent of your own weekly goal, so a kid on 21 and a grown-up on 10 race fairly, and it resets every Sunday." })]));
  // pack streak + week
  P.append(el("div", { class: "card" }, [
    el("div", { class: "row", style: "justify-content:space-between" }, [el("div", {}, [el("div", { class: "eyebrow", text: "Pack streak" }), el("h3", { text: sc.pack.streak + " day" + (sc.pack.streak === 1 ? "" : "s") + " where everyone trained" })]), disc(sc.pack.streak >= 7 ? "flame" : "paw", "var(--p5)", "lg")]),
    el("small", { class: "muted", text: "Best run: " + sc.pack.best + ". This week the pack has done " + sc.pack.weekSessions + " of " + sc.pack.weekTarget + " sessions." }),
    bar(sc.pack.weekTarget ? (sc.pack.weekSessions / sc.pack.weekTarget) * 100 : 0, "")
  ]));
  if (sc.challenge) {
    const ch = sc.challenge;
    P.append(el("div", { class: "card challenge" + (ch.won ? " won" : "") }, [
      el("div", { class: "row", style: "justify-content:space-between" }, [el("div", { class: "eyebrow", text: "This week's challenge" }), el("span", { class: "pill " + (ch.won ? "good" : "warm"), text: ch.won ? "Won! +" + (C.challengePoints || 25) + " each" : ch.progress + " of " + ch.target })]),
      el("div", { class: "row", style: "flex-wrap:nowrap;align-items:flex-start" }, [disc(ch.icon || "star", "var(--sun)", "lg"), el("div", {}, [el("h3", { text: ch.nm }), el("p", { class: "note", text: pupName() + " says: " + T(ch.ask) })])]),
      bar(ch.pct, "")]));
  }
  // the podium: ranked by percent of your own goal, so a kid with 21 and a parent with 10 race fairly. Resets Sunday.
  const ranked = family().map((p) => ({ p, s: scoreOf(p.id) })).filter((x) => x.s).sort((a, b) => b.s.weekPct - a.s.weekPct || b.s.weekSessions - a.s.weekSessions || a.p.name.localeCompare(b.p.name));
  const medalCol = ["#f6b73c", "#b8bcc9", "#cd7f45"];
  P.append(el("div", { class: "card", style: "display:grid;gap:8px" }, [
    el("div", { class: "row", style: "justify-content:space-between" }, [el("div", { class: "eyebrow", text: "This week's podium" }), el("small", { class: "muted", text: "Percent of your own goal. Resets Sunday night." })]),
    el("div", { class: "podium" }, ranked.map((x, i) => el("div", { class: "prow", style: "--c:" + colorOf(x.p) }, [
      el("span", { class: "rank" + (i < 3 ? " medal" : ""), style: i < 3 ? "--mc:" + medalCol[i] : "", text: String(i + 1) }),
      el("div", { class: "who" }, [avatar(x.p), el("div", {}, [el("b", { text: x.p.name }), el("small", {}, [x.s.weekSessions + " of " + x.s.target + (x.s.streak ? " · " : ""), x.s.streak ? icon("flame", "inl flame") : null, x.s.streak ? String(x.s.streak) : ""])])]),
      el("span", { class: "pct", text: x.s.weekPct + "%" })])))
  ]));
  // kids vs grown-ups
  const kids = family().filter((p) => p.kind !== "adult"), adults = family().filter((p) => p.kind === "adult");
  if (kids.length && adults.length) {
    const pct = (L) => { const t = L.reduce((a, p) => a + (scoreOf(p.id) ? scoreOf(p.id).target : 0), 0); const n = L.reduce((a, p) => a + (scoreOf(p.id) ? scoreOf(p.id).weekSessions : 0), 0); return t ? Math.round((n / t) * 100) : 0; };
    const kp = pct(kids), ap = pct(adults);
    P.append(el("div", { class: "card", style: "display:grid;gap:8px" }, [el("div", { class: "eyebrow", text: "Kids vs grown-ups" }),
      el("div", { class: "teams" }, [
        el("div", { class: "team" + (kp > ap ? " lead" : "") }, [el("b", { text: kp + "%" }), el("small", { text: "Kids" })]),
        el("span", { class: "vs", text: "vs" }),
        el("div", { class: "team" + (ap > kp ? " lead" : "") }, [el("b", { text: ap + "%" }), el("small", { text: "Grown-ups" })])]),
      el("small", { class: "muted", text: kp === ap ? "Dead heat. Someone go train the dog." : (kp > ap ? "Kids" : "Grown-ups") + " are ahead this week. Losers make the hot chocolate on Sunday." })]));
  }
  // people cards, ordered by name
  const peopleSorted = family().slice().sort((a, b) => a.name.localeCompare(b.name));
  P.append(el("div", { class: "eyebrow", text: "Everyone, against their own goal" }));
  P.append(el("div", { class: "people" }, peopleSorted.map((p) => {
    const ps = scoreOf(p.id); if (!ps) return null;
    return el("div", { class: "prow pack", style: "--c:" + colorOf(p) }, [
      el("div", { class: "who" }, [avatar(p), el("div", {}, [el("b", { text: p.name + (m && m.id === p.id ? " (you)" : "") }), el("small", { text: "Level " + ps.level.n + " · " + ps.level.name + " · " + ps.points + " pts" })])]),
      el("div", { class: "stats" }, [
        el("span", { class: "stat", title: "Streak" }, [icon("flame"), String(ps.streak)]),
        el("span", { class: "stat", title: "Freezes left this week" }, [icon("snow"), String(ps.freezesLeft)]),
        el("span", { class: "stat", title: "Badges" }, [icon("medal"), String(ps.badges.length)])]),
      el("div", { class: "wk" }, [bar(ps.weekPct, "", p.name + "'s week against goal"), el("small", { class: "muted", text: ps.weekSessions + " of " + ps.target + " this week (" + ps.weekPct + "%) · best week " + ps.bestWeek })]),
      el("div", { class: "lvl" }, [bar(ps.level.pct, "thin", p.name + "'s progress to the next level"), el("small", { class: "muted", text: ps.level.next ? (ps.level.next - ps.points) + " pts to " + ps.level.nextName : "Top level" })])
    ]);
  })));
  // badges for the chosen person
  let who = m || family()[0];
  const grid = el("div", { class: "badge-grid" });
  const drawBadges = () => {
    const ps = scoreOf(who.id); const have = new Set(ps ? ps.badges : []);
    grid.replaceChildren(...C.badges.map((b) => el("div", { class: "badge" + (have.has(b.id) ? " on" : ""), role: "img", "aria-label": b.nm + (have.has(b.id) ? ", earned. " : ", not yet. ") + b.how }, [disc(b.icon || "star", BADGE_COLOUR[b.g] || "var(--accent)", "lg"), el("b", { "aria-hidden": "true", text: b.nm }), el("small", { "aria-hidden": "true", text: b.how })])));
  };
  const chips = el("div", { class: "chips" }, family().map((p) => el("button", { class: "chip" + (p.id === who.id ? " on" : ""), type: "button", text: p.name, onclick: (e) => { who = p; chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === e.target)); drawBadges(); } })));
  drawBadges();
  P.append(el("div", { class: "eyebrow", text: "Badges" }), el("div", { class: "card", style: "display:grid;gap:10px" }, [chips, grid]));
  P.append(el("div", { class: "eyebrow", text: "How points work" }));
  P.append(el("div", { class: "card" }, el("ul", { class: "plain" }, [
    el("li", { text: "A session you tick for yourself: " + C.points.session + " points. All three in a day: +" + C.points.fullDay + "." }),
    el("li", { text: "Confirming a skill's goal (with a witness): " + C.points.mastery + ". Being the witness: " + C.points.witness + "." }),
    el("li", { text: "Rating the bite meter: " + C.points.bite + ". Logging a toilet trip: " + C.points.toilet + " (up to " + C.points.toiletCap + " a day)." }),
    el("li", { text: "A day where everyone trained: +" + C.points.packDay + " each and a pack streak day." }),
    el("li", { text: "Streaks need one session a day. Two missed days a week are frozen automatically." }),
    el("li", { text: "Three sessions a day is the cap. A tired puppy learns nothing, so a fourth session earns nothing." })
  ])));
}

/* ---------- video link ---------- */
const canEmbed = () => true;
const ytUrl = (id, shortV) => (shortV ? "https://www.youtube.com/shorts/" + id : "https://www.youtube.com/watch?v=" + id);
function vidLink(id) {
  const v = C.videos[id]; if (!v) return null;
  const [title, by, min, kind] = v;
  const shortV = kind === "shorts";
  const meta = by + (shortV ? " · 1-min short" : min ? " · " + min + " min" : "");
  const txt = el("span", { class: "txt" }, [el("b", { text: title }), el("small", { text: meta })]);
  const thumb = el("span", { class: "thumb" + (shortV ? " short" : ""), "aria-hidden": "true" }, [el("img", { src: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg", alt: "", loading: "lazy" }), el("span", { class: "play" })]);
  return el("button", { class: "vid", type: "button", "aria-label": "Play: " + title, onclick: () => playVideo(id) }, [thumb, txt]);
}
function playVideo(id) {
  const v = C.videos[id]; if (!v) return;
  const [title, by, , kind] = v; const shortV = kind === "shorts";
  const before = document.activeElement;
  const src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&playsinline=1";
  const frame = el("iframe", { src, title, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin" });
  const closeBtn = el("button", { class: "player-close", type: "button", "aria-label": "Close video", text: "✕" });
  const box = el("div", { class: "player-box" + (shortV ? " short" : "") }, [
    el("div", { class: "player-frame" }, frame),
    el("div", { class: "player-meta" }, [el("div", { style: "min-width:0" }, [el("b", { text: title }), el("small", { text: by })])])
  ]);
  const ov = el("div", { class: "player", role: "dialog", "aria-modal": "true", "aria-label": title }, [closeBtn, box]);
  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; if (before && before.focus) before.focus(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  closeBtn.addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
  document.body.append(ov);
  closeBtn.focus();
}
const vids = (ids) => (ids && ids.length ? el("div", { class: "vids" }, ids.map(vidLink)) : null);
const list = (cls, title, items) => (items && items.length ? el("div", { class: cls }, [el("b", { text: title }), el("ul", {}, items.map((x) => el("li", { text: T(x) })))]) : null);
function openAcc(id, tab) { show(tab); const d = document.getElementById(id); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: "smooth", block: "start" }), 60); } }

/* ---------- lure animations ---------- */
function lureSVG(kind) {
  const paths = { sit: "M150 62 C 150 40, 132 30, 112 36", down: "M150 70 L 150 118 L 112 118", spin: "M150 66 C 200 40, 230 100, 190 122 C 150 140, 90 120, 100 82 C 108 56, 135 58, 150 66", roll: "M150 104 C 128 92, 112 92, 100 104 C 90 116, 100 126, 116 124" };
  const caps = { sit: "Up and back over the head: the bottom drops.", down: "Straight down to the floor, then slide it out.", spin: "A wide circle at nose height.", roll: "From the nose to the shoulder and over." };
  const p = paths[kind];
  return '<figure class="lure"><svg viewBox="0 0 300 140" role="img" aria-label="Treat path for ' + kind + '">' +
    '<line x1="10" y1="128" x2="290" y2="128" stroke="var(--line)" stroke-width="2"/>' +
    '<ellipse cx="96" cy="100" rx="52" ry="20" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>' +
    '<ellipse cx="86" cy="96" rx="20" ry="13" fill="var(--liver)"/>' +
    '<circle cx="150" cy="74" r="20" fill="var(--liver)" stroke="var(--ink)" stroke-width="2"/>' +
    '<ellipse cx="140" cy="84" rx="7" ry="15" fill="var(--liver)" stroke="var(--ink)" stroke-width="1.5" transform="rotate(18 140 84)"/>' +
    '<circle cx="163" cy="76" r="4" fill="var(--ink)"/>' +
    '<rect x="70" y="112" width="8" height="16" rx="3" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/>' +
    '<rect x="120" y="112" width="8" height="16" rx="3" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/>' +
    '<path d="' + p + '" fill="none" stroke="var(--blaze)" stroke-width="2" stroke-dasharray="5 5"/>' +
    '<circle r="7" fill="var(--blaze)" stroke="var(--surface)" stroke-width="2"><animateMotion dur="2.6s" repeatCount="indefinite" path="' + p + '" keyPoints="0;1;1" keyTimes="0;0.75;1" calcMode="linear"/></circle>' +
    '</svg><figcaption>' + caps[kind] + '</figcaption></figure>';
}

/* ---------- skills (the tree) ---------- */
function skillCard(s) {
  const st = S.scores ? S.scores.skills[s.id] : { open: true, mastered: false, votes: 0, need: 3, who: [], practising: false };
  const m = me();
  const body = el("div", { class: "acc-body" });
  if (!st.open) body.append(el("p", { class: "note locked", text: "Unlocks as soon as someone has practised " + (s.req || []).map((r) => skillById(r) ? T(skillById(r).nm) : r).join(" and ") + " in a session. You can read ahead now." }));
  if (s.lure) body.append(el("div", { html: lureSVG(s.lure) }));
  body.append(el("ol", { class: "steps" }, s.steps.map((x) => el("li", { text: T(x) }))));
  body.append(el("div", { class: "done" }, [el("b", { text: "Done when: " }), T(s.done)]));
  body.append(el("p", { class: "note", text: "Raise one thing at a time: time, then distance, then distractions. New room or new person? Drop back a step and rebuild." }));
  // mastery votes
  const voters = st.who.map((id) => person(id)).filter(Boolean);
  const votesRow = el("div", { class: "votes" }, [
    el("span", { class: "vdots", "aria-label": st.votes + " of " + st.need + " confirmations" }, [...Array(st.need)].map((_, i) => el("i", { class: i < st.votes ? "on" : "" }))),
    el("small", { text: st.mastered ? "Mastered by the whole pack" : voters.length ? "Confirmed by " + voters.map((p) => p.name).join(", ") + ". " + (st.need - st.votes) + " more to master." : "Nobody has confirmed the goal yet. " + st.need + " different people need to, each with a witness." })
  ]);
  body.append(votesRow);
  if (m && st.open) {
    const mine = st.who.includes(m.id);
    if (mine) body.append(el("button", { class: "btn ghost", type: "button", text: "Take back my confirmation", onclick: () => safe(() => store.setMastery(s.id, m.id, null, false)) }));
    else {
      const others = family().filter((p) => p.id !== m.id);
      const wit = el("select", { "aria-label": "Who saw it?" }, [el("option", { value: "", text: "Who saw it?" }), ...others.map((p) => el("option", { value: p.id, text: p.name }))]);
      body.append(el("div", { class: "row" }, [wit, el("button", { class: "btn", type: "button", text: T("She") + " did it!", onclick: async () => {
        if (!wit.value) { toast("Pick who watched"); return; }
        await safe(async () => { await store.setMastery(s.id, m.id, wit.value, true); buzz([20, 30, 20]); toast("+" + C.points.mastery + " for you, +" + C.points.witness + " for " + person(wit.value).name); });
      } })]));
      body.append(el("small", { class: "note", text: "Confirm when " + T("she") + " hits the goal above with you, and someone else saw it. Big points, so it needs a witness." }));
    }
  }
  if (s.help) body.append(el("button", { class: "chip", text: "Full biting plan →", onclick: () => show("help") }));
  body.append(vids(s.v));
  const pill = st.mastered ? el("span", { class: "pill good", text: "Mastered" }) : !st.open ? el("span", { class: "pill", text: "🔒 Locked" }) : st.votes ? el("span", { class: "pill warm", text: st.votes + "/" + st.need }) : st.practising ? el("span", { class: "pill warm", text: "Practising" }) : el("span", { class: "pill open", text: "Open" });
  return el("details", { class: "acc skill" + (st.mastered ? " mastered" : !st.open ? " locked" : ""), id: "sk-" + s.id }, [el("summary", {}, [el("div", { class: "nm" }, [el("h3", { text: T(s.nm) }), el("small", { text: (s.req && s.req.length ? "Needs " + s.req.map((r) => skillById(r) ? T(skillById(r).nm) : r).join(", ") : "No prerequisites") })]), pill]), body]);
}
function renderSkills() {
  const P = $("#p-skills"); P.replaceChildren();
  const sc = S.scores;
  P.append(el("div", { class: "card focus" }, [el("div", { class: "eyebrow", text: "Skills" }), el("h2", { class: "h2", text: "Pick anything that's open" }),
    el("p", { class: "note", style: "margin-top:6px", text: "A skill opens as soon as someone has practised the one it builds on: one Sit session opens Down and Stay, one Come session opens Hide and seek. Mastering takes three people and a witness. Everyone does everything: the missions on Today make sure the week covers the lot." })]));
  const groups = [["Open now", (st) => st.open && !st.mastered], ["Mastered", (st) => st.mastered], ["Locked for now", (st) => !st.open]];
  groups.forEach(([title, fn]) => {
    const items = C.skills.filter((s) => fn(sc ? sc.skills[s.id] : { open: true }));
    if (!items.length) return;
    P.append(el("div", { class: "eyebrow", text: title + " (" + items.length + ")" }));
    items.forEach((s) => P.append(skillCard(s)));
  });
  // suggested path and the plan material
  P.append(el("div", { class: "eyebrow", text: "A suggested path" }));
  const ci = weekIndex(today);
  const born = S.settings && parseIso(S.settings.puppy.born);
  P.append(el("details", { class: "acc" }, [el("summary", {}, el("div", { class: "nm" }, [el("h3", { text: "The 6-week plan" }), el("small", { text: "If you like a map. Nothing here is a gate." })])),
    el("div", { class: "acc-body" }, C.weeks.map((w, i) => {
      const s = addDays(startDate(), i * 7), e = addDays(s, 6);
      const age = born ? " · " + Math.floor(Math.round((s - born) / 864e5) / 7) + " weeks old" : "";
      return el("article", { class: "card wk" + (i === ci ? " current" : "") }, [
        el("header", {}, [el("h3", { text: "Week " + (i + 1) + ": " + w.title }), el("span", { class: "dates", text: short(s) + " – " + short(e) + age })]),
        el("div", { class: "chips" }, w.skills.map((id) => { const sk = skillById(id); return sk ? el("button", { class: "chip", text: T(sk.nm), onclick: () => openAcc("sk-" + id, "skills") }) : null; })),
        el("p", { class: "note", text: T(w.note) })]);
    }))]));
  P.append(el("div", { class: "eyebrow", text: "The plan: how a session goes" }));
  P.append(el("div", { class: "card" }, [el("h2", { class: "h2", text: "5 minutes, 3 times a day, each" }),
    el("ol", { class: "steps", style: "margin-top:8px" }, [
      el("li", { html: "<b>1 minute warm-up</b> with something " + T("she") + " already knows." }),
      el("li", { html: "<b>2 to 3 minutes</b> on the mission: 5 to 10 quick reps, lots of treats, then a sniff break." }),
      el("li", { html: "<b>1 minute</b> of play, and finish on an easy win." })]),
    el("p", { class: "note", style: "margin-top:8px", text: T("Short sessions beat long ones. If she starts biting, zooming or ignoring you, she's tired: stop, toilet break, nap.") })]));
  P.append(el("div", { class: "callout" }, [el("b", { text: "Puppy preschool: book early" }), el("p", { text: T(C.preschool) })]));
  P.append(el("div", { class: "eyebrow", text: "Same words, everyone" }));
  P.append(el("details", { class: "acc", id: "cue-sheet", open: true }, [el("summary", {}, el("div", { class: "nm" }, [el("h3", { text: "The cue sheet" }), el("small", { text: "One word per behaviour. Say it once." })])),
    el("div", { class: "acc-body" }, [el("p", { class: "note", text: T("She learns fastest when everyone says exactly the same thing. Say a cue once. If she doesn't do it, make it easier rather than repeating louder.") }),
      el("table", { class: "cue-tbl" }, C.cues.map(([a, b]) => el("tr", {}, [el("td", { text: a }), el("td", { text: T(b) })])))])]));
  P.append(el("div", { class: "eyebrow", text: "Treats" }));
  P.append(el("div", { class: "card focus" }, [el("h2", { class: "h2", text: "Pea-sized, soft and smelly" }), el("p", { class: "note", style: "margin-top:6px", text: T(C.treats.intro) })]));
  P.append(el("div", { class: "ladder" }, C.treats.ladder.map((x) => el("div", { class: "rung " + x.c }, [el("div", { class: "lvl", text: x.l }), el("div", {}, [el("b", { text: x.t }), el("p", { text: T(x.d) })])]))));
  const td = (today.getDay() + 6) % 7;
  P.append(el("div", { class: "eyebrow", text: "Treat of the day" }));
  P.append(el("div", { class: "rota" }, C.treats.rota.map(([d, t], i) => el("div", { class: i === td ? "today" : "" }, [el("b", { text: d }), t]))));
  P.append(el("div", { class: "card" }, [el("div", { class: "eyebrow", text: "The morning treat pot" }), el("p", { style: "margin:6px 0 0", text: T(C.treats.pot) })]));
  P.append(el("div", { class: "callout danger" }, [el("b", { text: "Never give these" }), el("p", { text: C.treats.never })]));
  P.append(el("div", { class: "eyebrow", text: "House rules" }));
  P.append(el("div", { class: "card" }, el("ul", { class: "plain" }, C.rules.map((x) => el("li", { text: T(x) })))));
  renderSocial(P);
  renderTimeline(P);
}

/* ---------- socialisation checklist ---------- */
function renderSocial(P) {
  const m = me();
  const total = C.socialGroups.reduce((a, g) => a + g.items.length, 0);
  const happy = S.scores ? S.scores.socialHappy : 0;
  P.append(el("div", { class: "eyebrow", text: "Socialising: " + happy + " of " + total + " met happily" }));
  P.append(el("div", { class: "card focus" }, [el("h2", { class: "h2", text: T("Everything she meets before 14 weeks becomes normal") }),
    el("p", { class: "note", style: "margin-top:6px", text: T("Keep her paws off public ground until the vet says so, but carry her into the world: one new thing a day, always with food. Tap an item, say how she took it. Whoever was there gets the points; a happy first meeting feeds her progress.") }),
    bar(total ? (happy / total) * 100 : 0, "")]));
  C.socialGroups.forEach((g) => {
    const doneN = g.items.filter((it, i) => (S.social[g.id + ":" + i] || []).some((x) => !x.void)).length;
    const body = el("div", { class: "acc-body social" });
    g.items.forEach((it, i) => {
      const key = g.id + ":" + i; const L = (S.social[key] || []).filter((x) => !x.void);
      const mine = m && L.find((x) => x.by === m.id);
      const best = L.some((x) => x.mood === "happy") ? "happy" : L.some((x) => x.mood === "unsure") ? "unsure" : L.length ? "scared" : "";
      const row = el("div", { class: "srow " + best });
      const label = el("button", { class: "sname", type: "button", "aria-expanded": "false", text: (best === "happy" ? "😊 " : best === "unsure" ? "😐 " : best === "scared" ? "😟 " : "○ ") + T(it) });
      const who = L.length ? el("small", { class: "muted", text: L.map((x) => (person(x.by) ? person(x.by).name : "?") + " " + (C.socialMoods.find((mm) => mm[0] === x.mood) || ["", ""])[1].slice(0, 2)).join(" · ") }) : null;
      const moods = el("div", { class: "chips", hidden: true }, C.socialMoods.map(([k, l]) => el("button", { class: "chip" + (mine && mine.mood === k ? " on" : ""), type: "button", text: l, onclick: () => {
        if (!m) { renderWho(); return; }
        safe(() => store.setSocial(key, m.id, k, !(mine && mine.mood === k)), mine && mine.mood === k ? "Removed" : k === "happy" ? "Logged. Good " + T("girl") + "!" : k === "unsure" ? "Logged. Try again another day, from further away." : "Logged. No pushing: distance and food next time.");
      } })));
      label.addEventListener("click", () => { moods.hidden = !moods.hidden; label.setAttribute("aria-expanded", String(!moods.hidden)); });
      row.append(label); if (who) row.append(who); row.append(moods); body.append(row);
    });
    P.append(el("details", { class: "acc", id: "soc-" + g.id }, [el("summary", {}, [el("span", { class: "ico", "aria-hidden": "true", text: g.e }), el("div", { class: "nm" }, [el("h3", { text: g.nm }), el("small", { text: doneN + " of " + g.items.length + " met" })])]), body]));
  });
  P.append(el("p", { class: "note", text: T(C.socialNote) }));
}

/* ---------- the first year, dated from her birthday, and breed notes ---------- */
function renderTimeline(P) {
  const born = S.settings && parseIso(S.settings.puppy.born);
  const ageWk = born ? Math.floor(Math.round((today - born) / 864e5) / 7) : null;
  P.append(el("div", { class: "eyebrow", text: pupName() + "'s first year" }));
  const cur = ageWk == null ? -1 : C.timeline.reduce((best, t, i) => (t.wk <= ageWk ? i : best), -1);
  P.append(el("div", { class: "tl" }, C.timeline.map((t, i) => {
    const d = born ? addDays(born, t.wk * 7) : null;
    const state = i === cur ? "now" : i < cur ? "past" : "";
    return el("div", { class: "tli " + state }, [el("div", { class: "tlw" }, [el("b", { text: t.wk + " wk" }), d ? el("small", { text: short(d) }) : null]), el("div", { class: "tlb" }, [el("b", { text: t.nm + (i === cur ? " (now)" : "") }), el("p", { class: "note", text: T(t.body) })])]);
  })));
  if (!born) P.append(el("p", { class: "note", text: "Add " + T("her") + " birthday in Settings and this becomes a dated plan." }));
  const breed = ((S.settings && S.settings.puppy.breed) || "").toLowerCase();
  const notes = C.breedNotes.filter((n) => new RegExp(n.match, "i").test(breed));
  if (notes.length) {
    P.append(el("div", { class: "eyebrow", text: "About " + T("her") + " mix" }));
    notes.forEach((n) => P.append(el("div", { class: "card" }, [el("b", { text: n.nm }), el("p", { class: "note", style: "margin-top:4px", text: T(n.body) })])));
  }
}

/* ---------- help ---------- */
function renderHelp() {
  const P = $("#p-help"); P.replaceChildren();
  P.append(el("div", { class: "sos" }, [el("div", { class: "eyebrow", style: "color:inherit;opacity:.85", text: "SOS" }), el("h2", { text: T(C.sos.title) }),
    el("ol", {}, C.sos.steps.map((x) => el("li", { text: T(x) })))]));
  if (C.kids) {
    const K = C.kids;
    P.append(el("div", { class: "eyebrow", text: "Kids and " + pupName() }));
    P.append(el("div", { class: "card focus" }, [el("h2", { class: "h2", text: "The rules that keep everyone safe" }), el("p", { class: "note", style: "margin-top:6px", text: T(K.intro) })]));
    P.append(el("details", { class: "acc", id: "kids-rules" }, [el("summary", {}, el("div", { class: "nm" }, [el("h3", { text: "Our seven rules" }), el("small", { text: "Food, sleeping dogs, hugs, running, and when to call a grown-up" })])), el("div", { class: "acc-body" }, [el("ol", { class: "steps" }, K.rules.map((x) => el("li", { text: T(x) }))), el("div", { class: "dont" }, [el("b", { text: "If she bites you: " }), T(K.bite)])])]));
    [K.consent, K.tree].forEach((g, i) => P.append(el("details", { class: "acc", id: "kids-" + i }, [el("summary", {}, el("div", { class: "nm" }, [el("h3", { text: T(g.nm) })])), el("div", { class: "acc-body" }, [el("ol", { class: "steps" }, g.steps.map((x) => el("li", { text: T(x) }))), el("p", { class: "note", text: T(g.why) })])])));
    P.append(el("details", { class: "acc", id: "kids-signals" }, [el("summary", {}, el("div", { class: "nm" }, [el("h3", { text: "Read her: green, amber, red" }), el("small", { text: "Spot an amber signal and give her space: that's a point" })])), el("div", { class: "acc-body" }, [
      el("div", { class: "do" }, [el("b", { text: "🟢 Green, keep going" }), el("ul", {}, K.signals.green.map((x) => el("li", { text: T(x) })))]),
      el("div", { class: "callout" }, [el("b", { text: "🟡 Amber, she's unsure, give space" }), el("ul", { class: "plain", style: "margin-top:4px" }, K.signals.amber.map((x) => el("li", { text: T(x) })))]),
      el("div", { class: "dont" }, [el("b", { text: "🔴 Red, stop now, grown-up takes over" }), el("ul", {}, K.signals.red.map((x) => el("li", { text: T(x) })))]),
      el("p", { class: "note", text: T(K.signalsNote) })])]));
    P.append(el("details", { class: "acc", id: "kids-ages" }, [el("summary", {}, el("div", { class: "nm" }, [el("h3", { text: "What each age can do" }), el("small", { text: "With a grown-up in the room, always" })])), el("div", { class: "acc-body" }, K.ages.map(([age, can, not]) => el("div", { class: "card", style: "display:grid;gap:6px;padding:12px" }, [el("b", { text: "Age " + age }), el("div", { class: "do" }, [el("b", { text: "Can: " }), T(can)]), el("div", { class: "dont" }, [el("b", { text: "Not yet: " }), T(not)])])))]));
  }
  P.append(el("div", { class: "eyebrow", text: "Stop the biting, in bite-sized pieces" }));
  C.biting.forEach((b) => {
    const body = el("div", { class: "acc-body" }, b.body.map((x) => el("p", { text: T(x) })));
    if (b.do) body.append(list("do", "Do", b.do));
    if (b.dont) body.append(list("dont", "Don't", b.dont));
    body.append(vids(b.v));
    P.append(el("details", { class: "acc", id: "bite-" + b.id }, [el("summary", {}, [el("div", { class: "nm" }, el("h3", { text: T(b.nm) })), b.tag ? el("span", { class: "pill" + (b.tag === "Biggest cause" || b.tag === "Important" ? " hot" : ""), text: b.tag }) : null]), body]));
  });
  P.append(el("div", { class: "eyebrow", text: "Other puppy problems" }));
  C.problems.forEach((p) => {
    const body = el("div", { class: "acc-body" }, [el("p", { text: T(p.what) }), list("do", "Do", p.do), list("dont", "Don't", p.dont), vids(p.v)]);
    P.append(el("details", { class: "acc", id: "pr-" + p.id }, [el("summary", {}, [el("span", { class: "ico", "aria-hidden": "true", text: p.icon }), el("div", { class: "nm" }, el("h3", { text: T(p.nm) }))]), body]));
  });
}

/* ---------- watch ---------- */
const STYLE = { reward: "Reward-based", mixed: "Mixed methods", aversive: "Uses corrections" };
function renderWatch() {
  const P = $("#p-watch"); P.replaceChildren();
  P.append(el("div", { class: "card focus" }, [el("div", { class: "eyebrow", text: "Watch and read" }), el("h2", { class: "h2", text: "Bite-sized videos first" }),
    el("p", { class: "note", style: "margin-top:6px", text: "Tap a video to play it right here. Every video was checked when it was added. Some creators' videos show YouTube ads." })]));
  const shorts = Object.keys(C.videos).filter((id) => C.videos[id][3] === "shorts");
  P.append(el("div", { class: "eyebrow", text: "1-minute shorts (" + shorts.length + ")" }));
  P.append(el("details", { class: "acc" }, [el("summary", {}, el("div", { class: "nm" }, [el("h3", { text: "Quick wins" }), el("small", { text: "Biting, crates, zoomies, leave it, drop it…" })])), el("div", { class: "acc-body" }, vids(shorts))]));
  C.watch.forEach((g) => { P.append(el("div", { class: "eyebrow", text: g.h })); P.append(vids(g.v)); });
  P.append(el("div", { class: "eyebrow", text: "Famous trainers on YouTube" }));
  P.append(el("div", { class: "card", style: "display:grid;gap:8px" }, [
    el("div", { class: "legend" }, [el("span", { class: "style reward", text: STYLE.reward }), el("span", { class: "style mixed", text: STYLE.mixed }), el("span", { class: "style aversive", text: STYLE.aversive })]),
    el("p", { class: "note", text: "This app's plan is reward-based, which is what the NZ SPCA and veterinary behaviourists recommend. Trainers who use corrections are included because people ask about them, with notes on what to take and what to skip." })]));
  C.trainers.forEach((t, i) => {
    const body = el("div", { class: "acc-body" }, [el("p", { text: t.line }), t.note ? el("div", { class: "dont" }, [el("b", { text: "Our take: " }), t.note]) : null, vids(t.v),
      el("a", { href: t.url, target: "_blank", rel: "noopener", text: "Open the channel →" })]);
    P.append(el("details", { class: "acc", id: "tr-" + i }, [el("summary", {}, [el("div", { class: "nm" }, el("h3", { text: t.name })), el("span", { class: "style " + t.style, text: STYLE[t.style] })]), body]));
  });
  P.append(el("div", { class: "eyebrow", text: "Reading" }));
  P.append(el("div", { class: "card" }, el("ul", { class: "plain" }, C.reading.map(([t, u]) => el("li", {}, el("a", { href: u, target: "_blank", rel: "noopener", text: t }))))));
  P.append(el("p", { class: "note", style: "text-align:center", html: 'Free and open source · <a href="https://github.com/0800tim/puppy-training" target="_blank" rel="noopener">github.com/0800tim/puppy-training</a>' }));
}

/* ---------- render ---------- */
function renderAll() {
  [["today", renderToday], ["skills", renderSkills], ["pack", renderPack]].forEach(([name, fn]) => {
    const open = [...document.querySelectorAll("#p-" + name + " details[open][id]")].map((d) => d.id);
    const y = window.scrollY;
    try { fn(); open.forEach((id) => { const d = document.getElementById(id); if (d) d.open = true; }); if (current === name) window.scrollTo(0, y); } catch (e) { console.error(name, e); $("#p-" + name).replaceChildren(el("p", { class: "note", text: "This section hit a snag: " + (e && e.message) + ". Pull to refresh; if it stays, tell Tim." })); }
  });
}
function onState() {
  const t = new Date(); t.setHours(0, 0, 0, 0); if (iso(t) !== iso(today)) { today = t; viewDay = new Date(today); }
  recompute();
  setSync();
  renderHeader();
  if (!S.settings) { if ($("#p-settings").hidden || !$("#set-name")) { renderSettings(true); show("settings"); } return; }
  if (meId && !me()) { meId = null; }
  const key = JSON.stringify(S.settings);
  if (key !== staticKey) { staticKey = key; renderHelp(); renderWatch(); }
  renderAll();
  if (!$("#p-settings").hidden && S.settings) renderSettings(false);
  if (!$("#p-loading").hidden || !$("#p-pin").hidden) {
    let start = "today";
    const h = (location.hash || "").slice(1);
    if (TABS.includes(h)) start = h; else { try { const t2 = sessionStorage.getItem("pt.tab"); if (TABS.includes(t2)) start = t2; } catch (e) {} }
    if (!me()) renderWho(); else show(start);
  }
  checkCelebrations();
}
async function boot2() {
  try {
    const r = await store.init(onState);
    if (r === "pin") renderPin();
  } catch (e) {
    console.error(e);
    const net = !e || e.message === "server" || /fetch/i.test(String(e.message));
    $("#p-loading").replaceChildren(el("p", { class: "note", text: net ? "Couldn't reach the server. Check your connection and refresh." : "Something went wrong loading the chart: " + e.message + ". Refresh; if it stays, tell Tim." }));
  }
}
(async function boot() {
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  store = await pickStore();
  setSync();
  if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) { try { navigator.serviceWorker.register("sw.js"); } catch (e) {} }
  // keep "due now" fresh without a server round-trip
  setInterval(() => { if (S.settings && current === "today" && !$("#p-today").hidden && iso(viewDay) === iso(today)) { recompute(); renderToday(); } }, 60000);
  boot2();
})();
})();
