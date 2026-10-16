/* Puppy School HQ — app logic.
 * Storage modes, picked automatically:
 *   server : self-hosted with server/server.js (family PIN, everyone syncs)
 *   claude : running as a Claude artifact (signed-in viewers sync)
 *   local  : anywhere else (static hosting, opened from disk) — saved on this device
 */
(function () {
"use strict";
const C = window.PUPPY_CONTENT;
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

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseIso = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d) => DAYS[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()];
const short = (d) => d.getDate() + " " + MON[d.getMonth()];
const today = new Date(); today.setHours(0, 0, 0, 0);

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
const S = { settings: null, ticks: new Set(), logs: {} };
let store = null;
let viewDay = new Date(today);
let staticKey = "";
const PCOL = ["var(--p1)", "var(--p2)", "var(--p3)", "var(--p4)", "var(--p5)", "var(--p6)"];
const family = () => (S.settings ? S.settings.family : []);
const colorOf = (p) => PCOL[Math.max(0, family().indexOf(p)) % PCOL.length];
const tickKey = (date, pid, slot) => date + "_" + pid + "_" + slot;
const startDate = () => parseIso(S.settings && S.settings.start) || today;
const weekIndex = (d) => Math.floor((d - startDate()) / 864e5 / 7);
const pupName = () => (S.settings && S.settings.puppy.name) || "your puppy";
const BITE = [["😇", "Angel"], ["🙂", "Gentle"], ["😬", "Mouthy"], ["😣", "Bitey"], ["🦈", "Shark"]];

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
    S.ticks = new Set(lsGet("pt.ticks", []));
    S.logs = lsGet("pt.logs", {});
    cb();
  }
  async saveSettings(x) { S.settings = x; lsSet("pt.settings", x); this.cb(); }
  async setTick(k, on) { on ? S.ticks.add(k) : S.ticks.delete(k); lsSet("pt.ticks", [...S.ticks]); this.cb(); }
  async setLog(date, v) { S.logs[date] = v; lsSet("pt.logs", S.logs); this.cb(); }
}
class ServerStore {
  constructor() { this.mode = "server"; this.rev = -1; }
  apply(j) {
    if (!j || j.rev === undefined) return;
    this.rev = j.rev;
    S.settings = j.settings || null;
    S.ticks = new Set(Object.keys(j.ticks || {}));
    S.logs = j.logs || {};
    this.cb();
  }
  async init(cb) {
    this.cb = cb;
    const r = await api("GET", "api/state");
    if (r.status === 401) return "pin";
    if (!r.ok) throw new Error("server");
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
    if (!r.ok) throw new Error((r.json && r.json.error) || "save failed");
    this.apply(r.json);
  }
  saveSettings(x) { return this.write("PUT", "api/settings", x); }
  async setTick(k, on) { on ? S.ticks.add(k) : S.ticks.delete(k); this.cb(); return this.write("PUT", "api/ticks/" + encodeURIComponent(k), { on }); }
  async setLog(date, v) { S.logs[date] = v; this.cb(); return this.write("PUT", "api/logs/" + date, v); }
}
class ClaudeStore {
  constructor(db, canWrite) { this.mode = "claude"; this.db = db; this.canWrite = canWrite; }
  init(cb) {
    this.cb = cb;
    const db = this.db;
    return new Promise((resolve) => {
      let ready = false;
      const done = () => { if (!ready) { ready = true; resolve(); } cb(); };
      db.doc("settings/family").onSnapshot((s) => { S.settings = s.exists ? s.data() : null; done(); }, () => done());
      db.collection("ticks").onSnapshot((q) => { S.ticks = new Set(q.docs.filter((d) => d.exists).map((d) => d.id)); if (ready) cb(); }, () => {});
      db.collection("logs").onSnapshot((q) => { const L = {}; q.docs.forEach((d) => { if (d.exists) L[d.id] = d.data(); }); S.logs = L; if (ready) cb(); }, () => {});
      setTimeout(done, 8000);
    });
  }
  async guard(fn) {
    if (!this.canWrite) { toast("This account can view the family chart but can't save to it."); return; }
    try { await fn(); } catch (e) {
      if (e && e.code === "invalid_argument") { this.canWrite = false; setSync(); toast("This account can view the family chart but can't save to it."); }
      else toast("Couldn't save just now. Try again in a moment.");
    }
  }
  saveSettings(x) { return this.guard(() => this.db.doc("settings/family").set(JSON.parse(JSON.stringify(x)))); }
  setTick(k, on) { return this.guard(() => on ? this.db.collection("ticks").doc(k).set({ at: Date.now() }) : this.db.collection("ticks").doc(k).delete()); }
  setLog(date, v) { return this.guard(() => this.db.collection("logs").doc(date).set(v)); }
}
async function pickStore() {
  if (/^https?:/.test(location.protocol)) {
    try {
      const r = await fetch("api/health", { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { const j = await r.json(); if (j && j.app === "puppy-training") return new ServerStore(); }
    } catch (e) {}
  }
  if (window.claude && typeof window.claude.use === "function") {
    try {
      const db = await window.claude.use("db");
      if (db) {
        let canWrite = true;
        try { const u = await window.claude.use("user"); if (u && typeof u.can === "function") { const c = await u.can("data.write"); if (c === false) canWrite = false; } } catch (e) {}
        return new ClaudeStore(db, canWrite);
      }
    } catch (e) {}
  }
  return new LocalStore();
}
function setSync() {
  const s = $("#sync");
  if (!store) return;
  if (store.mode === "server") { s.textContent = "Family sync"; s.dataset.s = "live"; }
  else if (store.mode === "claude") { s.textContent = store.canWrite ? "Family sync" : "View only"; s.dataset.s = store.canWrite ? "live" : "local"; }
  else { s.textContent = "This phone"; s.dataset.s = "local"; }
  s.title = s.textContent;
  s.setAttribute("aria-label", s.textContent);
}

/* ---------- navigation ---------- */
const TABS = ["today", "plan", "skills", "help", "watch"];
let current = "today";
function show(tab) {
  document.querySelectorAll("section.panel").forEach((s) => (s.hidden = s.dataset.tab !== tab));
  const inApp = TABS.includes(tab);
  $("#tabs").hidden = !(inApp || (tab === "settings" && S.settings));
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.go === tab ? "true" : "false"));
  if (inApp) { current = tab; try { sessionStorage.setItem("pt.tab", tab); } catch (e) {} }
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.go)));
$("#gear").addEventListener("click", () => { if (!S.settings) return; renderSettings(false); show("settings"); });

/* ---------- header ---------- */
function renderHeader() {
  const st = S.settings;
  $("#pupTitle").textContent = st && st.puppy.name ? st.puppy.name + "'s Puppy School" : "Puppy School HQ";
  const born = st && parseIso(st.puppy.born);
  let line = (st && st.puppy.breed) || "Family puppy training";
  if (born) { const days = Math.round((today - born) / 864e5); if (days >= 0) line += " · " + Math.floor(days / 7) + " weeks old"; }
  $("#pupAge").textContent = line;
  $("#gear").hidden = !st;
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

/* ---------- settings / setup ---------- */
function renderSettings(firstRun) {
  const P = $("#p-settings"); P.replaceChildren();
  const st = S.settings || { puppy: { name: "", sex: "girl", breed: "", born: "" }, start: iso(today), family: [{ id: "p1", name: "", role: "manners" }] };
  const fam = JSON.parse(JSON.stringify(st.family));
  const roleSel = (p) => el("select", { "aria-label": "Role", onchange: (e) => (p.role = e.target.value) },
    Object.keys(C.roles).map((r) => el("option", { value: r, selected: p.role === r, text: C.roles[r].name })));
  const famBox = el("div", { style: "display:grid;gap:8px" });
  const drawFam = () => {
    famBox.replaceChildren(...fam.map((p, i) => el("div", { class: "fam-row" }, [
      el("div", { class: "av", style: "--c:" + PCOL[i % PCOL.length], text: (p.name || "?")[0].toUpperCase() }),
      el("div", { class: "fields" }, [
        el("input", { type: "text", id: "fam-" + p.id, maxlength: "20", placeholder: "Name", value: p.name, "aria-label": "Name", oninput: (e) => (p.name = e.target.value) }),
        el("div", { class: "row2" }, [roleSel(p), fam.length > 1 ? el("button", { class: "btn ghost small", type: "button", onclick: () => { fam.splice(i, 1); drawFam(); }, text: "Remove" }) : null])
      ])
    ])));
  };
  drawFam();
  const addBtn = el("button", { class: "btn ghost", type: "button", text: "+ Add a person", onclick: () => {
    if (fam.length >= 6) { toast("Up to 6 people"); return; }
    fam.push({ id: "p" + Date.now().toString(36), name: "", role: "helper" }); drawFam();
  } });
  const f = (id, label, input) => el("div", { class: "field" }, [el("label", { for: id, text: label }), input]);
  const name = el("input", { type: "text", id: "set-name", maxlength: "24", value: st.puppy.name, placeholder: "e.g. Pepper" });
  const sex = el("select", { id: "set-sex" }, [el("option", { value: "girl", selected: st.puppy.sex !== "boy", text: "Girl" }), el("option", { value: "boy", selected: st.puppy.sex === "boy", text: "Boy" })]);
  const breed = el("input", { type: "text", id: "set-breed", maxlength: "40", value: st.puppy.breed, placeholder: "e.g. German Shorthaired Pointer × heading dog" });
  const born = el("input", { type: "date", id: "set-born", value: st.puppy.born || "" });
  const start = el("input", { type: "date", id: "set-start", value: st.start || iso(today) });
  const save = el("button", { class: "btn", type: "button", text: firstRun ? "Start training" : "Save", onclick: async () => {
    const famClean = fam.map((p) => ({ id: p.id, name: p.name.trim().slice(0, 20), role: p.role })).filter((p) => p.name);
    if (!famClean.length) { toast("Add at least one person"); return; }
    const next = { puppy: { name: name.value.trim().slice(0, 24), sex: sex.value, breed: breed.value.trim().slice(0, 40), born: born.value }, start: start.value || iso(today), family: famClean };
    try { await store.saveSettings(next); toast("Saved"); show(firstRun ? "today" : current); } catch (e) { toast("Couldn't save. Check your connection."); }
  } });
  P.append(
    el("div", { class: "card focus" }, [el("div", { class: "eyebrow", text: firstRun ? "Welcome" : "Settings" }),
      el("h2", { class: "h2", text: firstRun ? "Set up your puppy school" : "Puppy and family" }),
      firstRun ? el("p", { class: "note", style: "margin-top:6px", text: "Takes a minute. You can change any of this later from the cog at the top." }) : null]),
    el("div", { class: "card", style: "display:grid;gap:12px" }, [
      f("set-name", "Puppy's name", name),
      el("div", { class: "row" }, [el("div", { class: "field", style: "flex:1;min-width:120px" }, [el("label", { for: "set-sex", text: "Girl or boy" }), sex]),
        el("div", { class: "field", style: "flex:2;min-width:160px" }, [el("label", { for: "set-born", text: "Birthday (roughly)" }), born])]),
      f("set-breed", "Breed", breed),
      f("set-start", "Plan starts", start)
    ]),
    el("div", { class: "eyebrow", text: "Who's training" }),
    el("div", { class: "card", style: "display:grid;gap:10px" }, [famBox, addBtn,
      el("p", { class: "note", text: "Each person gets three 5-minute sessions a day on the chart. Roles decide who leads which skills." })]),
    el("div", { class: "row" }, [save, firstRun ? null : el("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => show(current) })])
  );
  if (!firstRun) {
    const info = el("div", { class: "card", style: "display:grid;gap:8px" }, [el("div", { class: "eyebrow", text: "Saving" })]);
    if (store.mode === "server") info.append(el("p", { text: "Ticks sync to everyone who has the family PIN." }), el("div", {}, el("button", { class: "btn ghost", type: "button", text: "Lock this phone", onclick: () => store.logout() })));
    else if (store.mode === "claude") info.append(el("p", { text: store.canWrite ? "Ticks sync to everyone signed in to this page." : "You can see the family chart but this account can't save to it." }));
    else info.append(el("p", { text: "Ticks are saved on this phone only. To share one chart with the whole family, self-host it with a family PIN (see the project README)." }));
    P.append(info);
  }
}

/* ---------- today ---------- */
function renderToday() {
  const P = $("#p-today"); P.replaceChildren();
  let wi = weekIndex(viewDay); const before = wi < 0; wi = Math.max(0, Math.min(C.weeks.length - 1, wi));
  const w = C.weeks[wi];
  const chips = el("div", { class: "chips" }, w.skills.map((id) => { const sk = C.skills.find((s) => s.id === id); return sk ? el("button", { class: "chip", text: T(sk.nm), onclick: () => openAcc("sk-" + id, "skills") }) : null; }));
  P.append(el("div", { class: "card focus" }, [
    el("div", { class: "eyebrow", text: before ? "Plan starts " + fmt(startDate()) : "Week " + (wi + 1) + " of " + C.weeks.length }),
    el("h2", { text: w.title }), chips]));

  const isToday = iso(viewDay) === iso(today);
  P.append(el("div", { class: "daybar" }, [
    el("button", { class: "iconbtn", "aria-label": "Previous day", text: "‹", onclick: () => { viewDay = addDays(viewDay, -1); renderToday(); } }),
    el("h2", { text: (isToday ? "Today · " : "") + fmt(viewDay) }),
    el("button", { class: "iconbtn", "aria-label": "Next day", text: "›", disabled: isToday, onclick: () => { if (viewDay < today) { viewDay = addDays(viewDay, 1); renderToday(); } } })
  ]));
  P.append(el("p", { class: "note", text: "Tap a box after each 5-minute session. Tap again to undo." }));

  const d = iso(viewDay);
  const people = el("div", { class: "people" });
  family().forEach((p) => {
    const c = colorOf(p);
    const n = C.slots.filter((s) => S.ticks.has(tickKey(d, p.id, s.id))).length;
    const row = el("div", { class: "prow", style: "--c:" + c }, [
      el("div", { class: "who", style: "grid-column:1/3" }, [el("div", { class: "av", text: p.name[0].toUpperCase() }), el("div", {}, [el("b", { text: p.name }), el("small", { text: (C.roles[p.role] || C.roles.helper).name })])]),
      el("div", { class: "mins-today", text: n * 5 + " min" })
    ]);
    const slots = el("div", { class: "slots" });
    C.slots.forEach((s) => {
      const k = tickKey(d, p.id, s.id), on = S.ticks.has(k);
      slots.append(el("button", { class: "slot", "aria-pressed": on ? "true" : "false", "aria-label": p.name + " " + s.t + (on ? ", done" : ", not done"), disabled: viewDay > today,
        onclick: async () => { await store.setTick(k, !on); if (!on) toast("Nice one, " + p.name + "! +5 min"); } },
        [el("span", { class: "t", text: (on ? "✓ " : "") + s.t }), el("span", { text: s.s })]));
    });
    row.append(slots); people.append(row);
  });
  P.append(people);

  const cur = S.logs[d] && S.logs[d].bite;
  P.append(el("div", { class: "card" }, [
    el("div", { class: "row", style: "justify-content:space-between" }, [el("div", { class: "eyebrow", text: T("How bitey was she today?") }),
      el("button", { class: "chip", text: "Biting plan →", onclick: () => show("help") })]),
    el("div", { class: "meter" }, BITE.map(([e, l], i) => el("button", { "aria-pressed": cur === i + 1 ? "true" : "false", disabled: viewDay > today, onclick: () => store.setLog(d, { bite: cur === i + 1 ? 0 : i + 1 }) }, [el("span", { class: "e", text: e }), el("span", { text: l })])))
  ]));

  // week table (Mon start)
  const off = (viewDay.getDay() + 6) % 7, mon = addDays(viewDay, -off);
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const t = el("table", { class: "week" });
  t.append(el("thead", {}, el("tr", {}, [el("th", { text: "" }), ...days.map((x) => el("th", { class: iso(x) === iso(today) ? "today" : "", text: DAYS[x.getDay()].slice(0, 2) })), el("th", { text: "Min" })])));
  const tb = el("tbody");
  family().forEach((p) => {
    let tot = 0;
    const tr = el("tr", { style: "--c:" + colorOf(p) }, el("td", { text: p.name }));
    days.forEach((x) => { const ds = el("span", { class: "dots" }); C.slots.forEach((s) => { const on = S.ticks.has(tickKey(iso(x), p.id, s.id)); if (on) tot++; ds.append(el("i", { class: on ? "on" : "" })); }); tr.append(el("td", { class: iso(x) === iso(today) ? "today" : "" }, ds)); });
    tr.append(el("td", { class: "mins", text: String(tot * 5) })); tb.append(tr);
  });
  const br = el("tr", {}, el("td", { text: "Biting" }));
  days.forEach((x) => { const b = S.logs[iso(x)] && S.logs[iso(x)].bite; br.append(el("td", { class: iso(x) === iso(today) ? "today" : "", title: b ? BITE[b - 1][1] : "", text: b ? BITE[b - 1][0] : "·" })); });
  br.append(el("td", { text: "" })); tb.append(br);
  t.append(tb);
  P.append(el("div", { class: "card" }, [el("div", { class: "eyebrow", text: "This week" }), el("div", { class: "tbl-wrap" }, t)]));
  const note = store.mode === "local" ? "Saved on this phone." : store.mode === "server" ? "Synced with the family." : store.canWrite ? "Synced with everyone signed in." : "View only on this account.";
  P.append(el("p", { class: "note", text: note }));
}

/* ---------- video link ---------- */
function vidLink(id) {
  const v = C.videos[id]; if (!v) return null;
  const [title, by, min, kind] = v;
  const shortV = kind === "shorts";
  const url = shortV ? "https://www.youtube.com/shorts/" + id : "https://www.youtube.com/watch?v=" + id;
  const meta = by + (shortV ? " · 1-min short" : min ? " · " + min + " min" : "") + " · YouTube";
  return el("a", { class: "vid" + (shortV ? " short" : ""), href: url, target: "_blank", rel: "noopener" }, [el("span", { class: "play", "aria-hidden": "true" }), el("span", { class: "txt" }, [el("b", { text: title }), el("small", { text: meta })])]);
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

/* ---------- plan ---------- */
function renderPlan() {
  const P = $("#p-plan"); P.replaceChildren();
  P.append(el("div", { class: "card" }, [el("div", { class: "eyebrow", text: "How it works" }), el("h2", { class: "h2", text: "5 minutes, 3 times a day, each" }),
    el("ol", { class: "steps", style: "margin-top:8px" }, [
      el("li", { html: "<b>1 minute warm-up</b> with something she already knows.".replace("she", T("she")) }),
      el("li", { html: "<b>3 minutes</b> on this week's new skill: 5 to 10 quick reps, then a sniff break." }),
      el("li", { html: "<b>1 minute</b> of play, and finish on an easy win." })]),
    el("p", { class: "note", style: "margin-top:8px", text: T("Short sessions beat long ones at this age. If she starts biting, zooming or ignoring you, she's tired: stop, toilet break, nap.") })]));
  P.append(el("div", { class: "callout" }, [el("b", { text: "Puppy preschool: book early" }), el("p", { text: T(C.preschool) })]));

  P.append(el("div", { class: "eyebrow", text: "Who leads what" }));
  P.append(el("div", { class: "card roles" }, family().map((p) => { const r = C.roles[p.role] || C.roles.helper;
    return el("div", { class: "role", style: "--c:" + colorOf(p) }, [el("div", { class: "av", text: p.name[0].toUpperCase() }), el("div", {}, [el("b", { text: p.name + ": " + r.name }), el("p", { text: T(r.lead) })])]); })));

  P.append(el("div", { class: "eyebrow", text: "The " + C.weeks.length + "-week plan" }));
  const ci = weekIndex(today);
  const born = S.settings && parseIso(S.settings.puppy.born);
  C.weeks.forEach((w, i) => {
    const s = addDays(startDate(), i * 7), e = addDays(s, 6);
    const age = born ? " · " + Math.floor((s - born) / 864e5 / 7) + " weeks old" : "";
    P.append(el("article", { class: "card wk" + (i === ci ? " current" : "") }, [
      i === ci ? el("div", { class: "eyebrow", style: "color:var(--blaze)", text: "This week" }) : null,
      el("header", {}, [el("h3", { text: "Week " + (i + 1) + ": " + w.title }), el("span", { class: "dates", text: short(s) + " – " + short(e) + age })]),
      el("ul", {}, w.goals.map((g) => el("li", { text: T(g) }))), el("p", { class: "note", text: T(w.note) })]));
  });

  P.append(el("div", { class: "eyebrow", text: "Same words, everyone" }));
  P.append(el("div", { class: "card" }, [el("p", { class: "note", style: "margin-bottom:8px", text: T("She learns fastest when everyone says exactly the same thing. Say a cue once. If she doesn't do it, make it easier rather than repeating louder.") }),
    el("table", { class: "cue-tbl" }, C.cues.map(([a, b]) => el("tr", {}, [el("td", { text: a }), el("td", { text: b })])))]));

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
  P.append(el("div", { class: "eyebrow", text: "Safe socialising before vaccinations finish" }));
  P.append(el("div", { class: "card" }, [el("p", { class: "note", style: "margin-bottom:8px", text: T("Ages 8 to 16 weeks are when she decides what's normal. Keep her paws off public ground until the vet says so, but carry her into the world. One new thing a day.") }),
    el("ul", { class: "plain" }, C.social.map((x) => el("li", { text: x })))]));
}

/* ---------- skills ---------- */
function leadsFor(role) {
  if (role === "all") return "Everyone";
  const who = family().filter((p) => p.role === role).map((p) => p.name);
  return who.length ? who.join(" & ") : "Anyone";
}
function renderSkills() {
  const P = $("#p-skills"); P.replaceChildren();
  P.append(el("div", { class: "card focus" }, [el("div", { class: "eyebrow", text: "Skills" }), el("h2", { class: "h2", text: "How to teach each one" }),
    el("p", { class: "note", style: "margin-top:6px", text: "Tap a skill for the steps, a goal and short videos. The animations show where to move the treat." })]));
  C.weeks.forEach((w, wi) => {
    const items = C.skills.filter((s) => s.wk === wi + 1);
    if (!items.length) return;
    P.append(el("div", { class: "eyebrow", text: "Week " + (wi + 1) + " · " + w.title }));
    items.forEach((s) => {
      const body = el("div", { class: "acc-body" });
      if (s.lure) body.append(el("div", { html: lureSVG(s.lure) }));
      body.append(el("ol", { class: "steps" }, s.steps.map((x) => el("li", { text: T(x) }))));
      body.append(el("div", { class: "done" }, [el("b", { text: "Done when: " }), T(s.done)]));
      if (s.help) body.append(el("button", { class: "chip", text: "Full biting plan →", onclick: () => show("help") }));
      body.append(vids(s.v));
      P.append(el("details", { class: "acc", id: "sk-" + s.id }, [el("summary", {}, [el("div", { class: "nm" }, [el("h3", { text: T(s.nm) }), el("small", { text: "Lead: " + leadsFor(s.role) })])]), body]));
    });
  });
}

/* ---------- help ---------- */
function renderHelp() {
  const P = $("#p-help"); P.replaceChildren();
  P.append(el("div", { class: "sos" }, [el("div", { class: "eyebrow", style: "color:inherit;opacity:.85", text: "SOS" }), el("h2", { text: T(C.sos.title) }),
    el("ol", {}, C.sos.steps.map((x) => el("li", { text: T(x) })))]));
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
    el("p", { class: "note", style: "margin-top:6px", text: "Everything opens in YouTube. Every video in the app was checked when it was added." })]));
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
function onState() {
  setSync();
  renderHeader();
  if (!S.settings) { if ($("#p-settings").hidden || !$("#set-name")) { renderSettings(true); show("settings"); } return; }
  const key = JSON.stringify(S.settings);
  if (key !== staticKey) { staticKey = key; renderPlan(); renderSkills(); renderHelp(); renderWatch(); }
  renderToday();
  if (!$("#p-loading").hidden || !$("#p-pin").hidden) {
    let start = "today";
    const h = (location.hash || "").slice(1);
    if (TABS.includes(h)) start = h; else { try { const t = sessionStorage.getItem("pt.tab"); if (TABS.includes(t)) start = t; } catch (e) {} }
    show(start);
  }
}
async function boot2() {
  try {
    const r = await store.init(onState);
    if (r === "pin") renderPin();
  } catch (e) {
    $("#p-loading").replaceChildren(el("p", { class: "note", text: "Couldn't reach the server. Check your connection and refresh." }));
  }
}
(async function boot() { store = await pickStore(); setSync(); boot2(); })();
})();
