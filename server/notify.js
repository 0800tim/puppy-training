/* Nudges: web push per phone, optional SMS per person, both driven by the same rules.
 *
 * Rules (from the research, 16 Oct 2026):
 * - One nudge per empty slot, inside school-aware windows. Never for a slot already ticked.
 * - At most two pushes per phone per day, one SMS per person per day.
 * - Streak-at-risk once, at 20:00, only if nothing was done today and the streak is 3+.
 * - Quiet hours are hard off. Kids 20:30 to 06:30, grown-ups 21:30 to 06:30.
 * - Six unanswered nudges in a row: reminders go to sleep and say so, once.
 * decide() is pure so it can be tested; tick() wires it to the clock, push and SMS.
 */
"use strict";
const SLOTS = ["am", "pm", "ev"];
const DEFAULTS = { on: true, am: true, pm: true, ev: true, risk: true, amAt: "07:00", amWeekendAt: "08:00", pmAt: "15:30", evAt: "18:30", riskAt: "20:00" };
const QUIET = { kid: ["20:30", "06:30"], adult: ["21:30", "06:30"] };

const pad = (n) => String(n).padStart(2, "0");
const hm = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes());
const isoDay = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const inQuiet = (t, [from, to]) => (from > to ? t >= from || t < to : t >= from && t < to);
const pick = (list, seed) => list[seed % list.length];

function fill(tpl, v) { return tpl.replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? m : v[k])); }

/* Which messages are due right now. subs: [{id, pid, kind, prefs, unanswered, channel:'push'|'sms'}] */
function decide(now, state, scores, subs, C, sentToday) {
  const t = hm(now), day = now.getDay(), weekend = day === 0 || day === 6, date = isoDay(now);
  const out = [];
  const fam = (state.settings && state.settings.family) || [];
  const pup = (state.settings && state.settings.puppy && state.settings.puppy.name) || "Your puppy";
  const her = state.settings && state.settings.puppy && state.settings.puppy.sex === "boy" ? "his" : "her";
  subs.forEach((sub) => {
    const p = fam.find((x) => x.id === sub.pid); if (!p) return;
    const prefs = Object.assign({}, DEFAULTS, sub.prefs || {});
    if (!prefs.on) return;
    const kind = p.kind === "adult" ? "adult" : "kid";
    if (inQuiet(t, prefs.quiet || QUIET[kind])) return;
    const sent = (sentToday[sub.id] || []);
    const cap = sub.channel === "sms" ? 1 : 2;
    if (sent.length >= cap) return;
    const sc = scores.people[p.id]; if (!sc) return;
    const ticked = (slot) => { const k = date + "_" + p.id + "_" + slot; const x = state.ticks[k]; return !!x && !x.void; };
    const mission = (slot) => { const m = scores.missions[p.id] && scores.missions[p.id][slot]; const s = m && C.skills.find((x) => x.id === m.skill); return s ? s.nm : "a quick skill"; };
    const seed = now.getDate() + p.id.length + sub.id.length;
    const vars = { pup, name: p.name, her, streak: sc.streak };
    const push = (kindKey, slot, text) => { out.push({ sub, pid: p.id, kind: kindKey, title: pup + " says", text, slot }); };
    const due = (at) => at === t;
    if (sub.channel === "sms") {
      // one a day: the afternoon check-in on school days, mid-morning at weekends, only if nothing done yet
      const at = weekend ? "10:00" : prefs.pmAt;
      if (due(at) && sc.today === 0) push("sms", "pm", fill(pick(C.nudges.sms, seed), Object.assign({ skill: mission("pm") }, vars)));
      return;
    }
    if (prefs.am && due(weekend ? prefs.amWeekendAt : prefs.amAt) && !ticked("am") && !sent.includes("am")) push("am", "am", fill(pick(C.nudges.am, seed), Object.assign({ skill: mission("am") }, vars)));
    else if (prefs.pm && due(prefs.pmAt) && !ticked("pm") && !sent.includes("pm")) push("pm", "pm", fill(pick(C.nudges.pm, seed), Object.assign({ skill: mission("pm") }, vars)));
    else if (prefs.ev && due(prefs.evAt) && !ticked("ev") && !sent.includes("ev")) push("ev", "ev", fill(pick(C.nudges.ev, seed), Object.assign({ skill: mission("ev") }, vars)));
    else if (prefs.risk && due(prefs.riskAt) && sc.today === 0 && sc.streak >= 3 && !sent.includes("risk")) push("risk", null, fill(C.nudges.risk, vars));
  });
  return out;
}

function createNotifier(o) {
  const { db, C, R, keys, subject, log, persist, sendPush, sendSms, now } = o;
  const clock = now || (() => new Date());
  let busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try {
      const t = clock(); const date = isoDay(t);
      db.sent = db.sent && db.sent.date === date ? db.sent : { date, by: {} };
      if (!db.settings) return;
      const scores = R.compute(db, C, { today: date });
      const subs = (db.push || []).map((s) => Object.assign({ channel: "push" }, s));
      (db.settings.family || []).forEach((p) => { if (p.phone && p.sms) subs.push({ id: "sms:" + p.id, pid: p.id, channel: "sms", prefs: { on: true }, phone: p.phone }); });
      const msgs = decide(t, db, scores, subs, C, db.sent.by);
      let changed = false;
      for (const m of msgs) {
        (db.sent.by[m.sub.id] = db.sent.by[m.sub.id] || []).push(m.kind); changed = true;
        try {
          if (m.sub.channel === "sms") { await sendSms(m.sub.phone, m.text); log("sms sent", m.pid, m.kind); }
          else {
            const r = await sendPush(m.sub, { title: m.title, body: m.text, tag: "nudge-" + m.kind, url: "/#today" }, keys, subject);
            if (r.gone) { db.push = db.push.filter((s) => s.id !== m.sub.id); log("push subscription gone, removed", m.pid); }
            else {
              const real = db.push.find((s) => s.id === m.sub.id);
              if (real) {
                real.unanswered = (real.unanswered || 0) + 1;
                if (real.unanswered >= 6 && real.prefs && real.prefs.on !== false) {
                  real.prefs = Object.assign({}, real.prefs, { on: false });
                  await sendPush(real, { title: C.nudges.exitTitle, body: fill(C.nudges.exit, { pup: db.settings.puppy.name || "Your puppy" }), tag: "exit", url: "/#settings" }, keys, subject).catch(() => {});
                  log("push reminders paused after 6 unanswered", m.pid);
                }
              }
            }
            log("push sent", m.pid, m.kind, r.status);
          }
        } catch (e) { log("notify failed", m.pid, m.kind, e.message); }
      }
      if (changed) persist(false);
    } finally { busy = false; }
  }
  const timer = setInterval(() => tick().catch((e) => log("notify tick error", e.message)), 60 * 1000);
  if (timer.unref) timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}

/* Aiva-SMS house gateway (see hivemind guides/aiva-sms-gateway-operations.md). */
function makeSmsSender(env, fetchFn) {
  const url = env.AIVA_SMS_API_URL, key = env.AIVA_SMS_API_KEY, device = env.AIVA_SMS_DEVICE_ID, sim = env.AIVA_SMS_SIM_SUBSCRIPTION_ID;
  if (!url || !key || !device) return null;
  return async (phone, message) => {
    const body = { message, recipients: [phone] };
    if (sim) body.simSubscriptionId = Number(sim);
    const r = await (fetchFn || fetch)(url.replace(/\/$/, "") + "/api/v1/gateway/devices/" + device + "/send-sms", { method: "POST", headers: { "x-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("sms gateway " + r.status);
    return true;
  };
}
// NZ numbers: 021 234 5678 -> +64212345678. Anything already international is kept.
function normalisePhone(s) {
  const d = String(s || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("+")) return d.length >= 8 ? d : "";
  if (d.startsWith("64")) return "+" + d;
  if (d.startsWith("0")) return "+64" + d.slice(1);
  return d.length >= 8 ? "+64" + d : "";
}

module.exports = { decide, createNotifier, makeSmsSender, normalisePhone, DEFAULTS, QUIET };
