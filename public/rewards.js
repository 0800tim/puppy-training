/* Puppy School HQ: the rewards engine.
 * One file, no dependencies, runs in the browser and in Node (the server uses it for
 * notifications). Everything is computed from the chart itself (ticks, bite log, mastery,
 * toilet log) so there is nothing to get out of sync.
 *
 * Design notes (from the research, 16 Oct 2026):
 * - A streak needs one session a day. Two freezes a week are applied automatically.
 * - Points are capped by puppy welfare: three sessions a slot, nothing is worth farming.
 * - Nobody is ranked by raw points. Each person is shown against their own weekly target.
 * - The puppy's progress is the shared number: the dog is the team.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PUPPY_REWARDS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const dow = (s) => parseIso(s).getDay(); // 0 Sun
  const monday = (s) => addDays(s, -((dow(s) + 6) % 7));
  const hourOf = (ms) => { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60; };
  const SLOTS = ["am", "pm", "ev"];

  function levelOf(points, table) {
    let n = 0;
    for (let i = 0; i < table.length; i++) if (points >= table[i][1]) n = i;
    const cur = table[n], next = table[n + 1] || null;
    const pct = next ? Math.min(100, Math.round(((points - cur[1]) / (next[1] - cur[1])) * 100)) : 100;
    return { n: n + 1, name: cur[0], at: cur[1], next: next ? next[1] : null, nextName: next ? next[0] : null, pct };
  }

  /* Which skills are open, practising or mastered.
     Open: every prerequisite has been practised at least once (a session logged with it) or confirmed.
     Mastered: C.masteryVotes confirmations by different people (or everyone, if the family is
     smaller than that), each witnessed. Keen families move fast; the tree only stops Stay before Sit. */
  function skillStatus(state, C) {
    const fam = (state.settings && state.settings.family) || [];
    const need = Math.min(C.masteryVotes || 3, Math.max(1, fam.length));
    const M = state.mastery || {};
    const practised = new Set();
    for (const k in state.ticks || {}) { const t = state.ticks[k]; if (t && !t.void && t.skill) practised.add(t.skill); }
    const out = {};
    C.skills.forEach((s) => {
      const votes = ((M[s.id] && M[s.id].done) || []).filter((d) => !d.void);
      const who = [...new Set(votes.map((d) => d.by))];
      const mastered = who.length >= need;
      const started = (x) => !!x && (x.mastered || x.votes > 0 || x.practising);
      const open = (s.req || []).every((r) => started(out[r]));
      out[s.id] = { mastered, open: mastered || open, votes: who.length, need, who, practising: practised.has(s.id) };
    });
    return out;
  }

  /* Deal today's missions: one skill per person per slot, rotating so everyone covers
     every open skill across a week, plus a warm-up from the mastered pool. */
  function missions(state, C, date) {
    const fam = (state.settings && state.settings.family) || [];
    const st = skillStatus(state, C);
    const open = C.skills.filter((s) => st[s.id].open && !st[s.id].mastered).map((s) => s.id);
    const done = C.skills.filter((s) => st[s.id].mastered).map((s) => s.id);
    const start = (state.settings && state.settings.start) || date;
    const dayIdx = Math.max(0, Math.round((parseIso(date) - parseIso(start)) / 864e5));
    const out = {};
    fam.forEach((p, pi) => {
      out[p.id] = {};
      // skills this person already logged today stay out of the day's remaining missions
      const used = new Set();
      SLOTS.forEach((slot) => { const t = (state.ticks || {})[date + "_" + p.id + "_" + slot]; if (t && !t.void && t.skill) used.add(t.skill); });
      SLOTS.forEach((slot, si) => {
        const n = dayIdx * 3 + si;
        let skill = done[0] || "name";
        if (open.length) {
          let i = (n + pi * 2) % open.length, tries = 0;
          while (used.has(open[i]) && tries < open.length) { i = (i + 1) % open.length; tries++; }
          skill = open[i]; used.add(skill);
        }
        const warm = done.length ? done[(n + pi) % done.length] : null;
        out[p.id][slot] = { skill, warm: warm && warm !== skill ? warm : null };
      });
    });
    return out;
  }

  function compute(state, C, opts) {
    opts = opts || {};
    const todayS = opts.today || iso(new Date());
    const settings = state.settings || { family: [], start: todayS };
    const fam = settings.family || [];
    const ticks = state.ticks || {}, logs = state.logs || {}, toilet = (state.toilet || []).filter((t) => !t.void);
    const P = C.points, PP = C.puppyPoints, W = C.slotWindows;
    const st = skillStatus(state, C);

    // Per person per day: which slots are ticked, with who logged it and whether it was in window.
    const days = {}; // date -> pid -> { slots: {am: tick}, n }
    let first = settings.start || todayS;
    for (const k in ticks) {
      const t = ticks[k]; if (!t || t.void) continue;
      const [date, pid, slot] = k.split("_");
      if (!fam.some((p) => p.id === pid)) continue;
      if (date < first) first = date;
      (days[date] = days[date] || {});
      (days[date][pid] = days[date][pid] || { slots: {}, n: 0 });
      days[date][pid].slots[slot] = t; days[date][pid].n++;
    }
    if (first > todayS) first = todayS;
    const allDays = []; for (let d = first; d <= todayS; d = addDays(d, 1)) allDays.push(d);

    const people = {};
    fam.forEach((p) => {
      const kind = C.kinds[p.kind] ? p.kind : "kid";
      const target = Number(p.target) > 0 ? Number(p.target) : C.kinds[kind].target;
      let points = 0, early = 0, owl = 0, hattricks = 0;
      const dayCount = {}; // date -> sessions
      allDays.forEach((d) => {
        const me = days[d] && days[d][p.id];
        const n = me ? me.n : 0; dayCount[d] = n;
        if (!me) return;
        SLOTS.forEach((s) => {
          const t = me.slots[s]; if (!t) return;
          const h = t.at ? hourOf(t.at) : null;
          const inWin = h == null || (h >= W[s][0] && h < W[s][1]);
          const own = !t.by || t.by === p.id;
          points += own && inWin ? P.session : P.sessionOther;
          if (s === "am" && h != null && h < 7.5) early++;
          if (s === "ev" && h != null && h >= 19) owl++;
        });
        if (n >= 3) { points += P.fullDay; hattricks++; }
      });
      // streak with two auto freezes per Mon-Sun week, counted back from today (or yesterday if today is empty)
      let streak = 0, atRisk = false, usedFreeze = false, freezesThisWeek = 0;
      const weekOf = monday(todayS);
      let d = todayS;
      if (!dayCount[d]) { atRisk = true; d = addDays(d, -1); }
      const freezesUsed = {}; // monday -> n
      while (d >= first) {
        if (dayCount[d]) { streak++; }
        else {
          const wk = monday(d);
          if ((freezesUsed[wk] || 0) < 2) { freezesUsed[wk] = (freezesUsed[wk] || 0) + 1; usedFreeze = true; }
          else break;
        }
        d = addDays(d, -1);
      }
      if (streak === 0) { usedFreeze = false; }
      freezesThisWeek = freezesUsed[weekOf] || 0;
      // best streak ever and comeback detection
      let best = 0, run = 0, lost = false, comeback = false;
      allDays.forEach((x) => { if (dayCount[x]) { run++; if (run > best) best = run; if (lost && run >= 7) comeback = true; } else { if (run >= 3) lost = true; run = 0; } });
      // weeks
      const thisMon = monday(todayS);
      let weekSessions = 0; const weekByDay = [];
      for (let i = 0; i < 7; i++) { const x = addDays(thisMon, i); const n = dayCount[x] || 0; weekByDay.push(n); if (x <= todayS) weekSessions += n; }
      let bestWeek = 0, perfectWeek = false;
      const weeks = {};
      allDays.forEach((x) => { const m = monday(x); weeks[m] = (weeks[m] || 0) + (dayCount[x] || 0); });
      for (const m in weeks) { if (weeks[m] > bestWeek) bestWeek = weeks[m]; if (weeks[m] >= 21) perfectWeek = true; }
      // mastery and witness points
      const confirmed = new Set();
      let witnessed = 0;
      C.skills.forEach((s) => { const votes = ((state.mastery && state.mastery[s.id] && state.mastery[s.id].done) || []).filter((v) => !v.void);
        votes.forEach((v) => { if (v.by === p.id) confirmed.add(s.id); if (v.witness === p.id) witnessed++; }); });
      points += confirmed.size * P.mastery + witnessed * P.witness;
      // bite meter and toilet logging
      let rated = 0; for (const x in logs) { if (logs[x] && logs[x].bite && logs[x].by === p.id) rated++; }
      points += rated * P.bite;
      const toiletByDay = {}; toilet.forEach((t) => { if (t.by === p.id) { const x = iso(new Date(t.at)); toiletByDay[x] = (toiletByDay[x] || 0) + 1; } });
      let toiletPts = 0, toiletN = 0; for (const x in toiletByDay) { toiletN += toiletByDay[x]; toiletPts += Math.min(P.toiletCap, toiletByDay[x] * P.toilet); }
      points += toiletPts;
      people[p.id] = { id: p.id, kind, target, points, streak, atRisk, usedFreeze, freezesLeft: Math.max(0, 2 - freezesThisWeek), bestStreak: best, comeback,
        weekSessions, weekByDay, weekPct: Math.min(100, Math.round((weekSessions / target) * 100)), bestWeek, perfectWeek, today: dayCount[todayS] || 0,
        early, owl, hattricks, confirmed: [...confirmed], rated, toiletN, badges: [] };
    });

    // pack: days where everyone (who had joined) trained
    let packStreak = 0, packDays = 0;
    const packDay = (d) => fam.length > 0 && fam.every((p) => days[d] && days[d][p.id] && days[d][p.id].n > 0);
    allDays.forEach((d) => { if (packDay(d)) packDays++; });
    for (let d = packDay(todayS) ? todayS : addDays(todayS, -1); d >= first && packDay(d); d = addDays(d, -1)) packStreak++;
    let packBest = 0, pr = 0; allDays.forEach((d) => { if (packDay(d)) { pr++; if (pr > packBest) packBest = pr; } else pr = 0; });
    fam.forEach((p) => { people[p.id].points += packDays * P.packDay; });

    // bite log
    const calm = (d) => logs[d] && logs[d].bite >= 1 && logs[d].bite <= 2;
    let calmDays = 0, calmRun = 0, calm3 = false, softSun = false;
    allDays.forEach((d) => { if (calm(d)) { calmDays++; calmRun++; if (calmRun >= 3) calm3 = true; if (dow(d) === 0 || dow(d) === 6) softSun = true; } else if (logs[d] && logs[d].bite) calmRun = 0; });
    const biteWeek = []; const thisMon = monday(todayS);
    for (let i = 0; i < 7; i++) { const d = addDays(thisMon, i); biteWeek.push(logs[d] && logs[d].bite ? logs[d].bite : 0); }
    const ratedWeek = biteWeek.filter((b) => b > 0);
    const sharkWeek = ratedWeek.length >= 5 && ratedWeek.reduce((a, b) => a + b, 0) / ratedWeek.length <= 2;
    // a week in the past that averaged gentle or better
    let shark = sharkWeek; const wkLog = {};
    allDays.forEach((d) => { if (logs[d] && logs[d].bite) { const m = monday(d); (wkLog[m] = wkLog[m] || []).push(logs[d].bite); } });
    for (const m in wkLog) if (wkLog[m].length >= 5 && wkLog[m].reduce((a, b) => a + b, 0) / wkLog[m].length <= 2) shark = true;

    // toilet
    const tByDay = {}; toilet.forEach((t) => { const d = iso(new Date(t.at)); (tByDay[d] = tByDay[d] || []).push(t); });
    let dryDay = false; for (const d in tByDay) { const L = tByDay[d]; if (L.some((t) => t.kind !== "accident") && !L.some((t) => t.kind === "accident")) dryDay = true; }
    const todayToilet = tByDay[todayS] || [];
    const lastOut = toilet.filter((t) => t.kind !== "accident").sort((a, b) => b.at - a.at)[0] || null;
    const accidentsAfter = {}; toilet.forEach((t) => { if (t.kind === "accident" && t.before) accidentsAfter[t.before] = (accidentsAfter[t.before] || 0) + 1; });
    const ageWeeks = settings.puppy && settings.puppy.born ? Math.floor((parseIso(todayS) - parseIso(settings.puppy.born)) / 864e5 / 7) : 12;
    let interval = 60; (C.toiletInterval || []).some(([w, m]) => { if (ageWeeks < w) { interval = m; return true; } return false; });
    const toiletPuppy = Object.values(tByDay).reduce((a, L) => a + Math.min(PP.toiletCap, L.filter((t) => t.kind !== "accident").length * PP.toilet), 0);

    // puppy meter
    const masteredN = C.skills.filter((s) => st[s.id].mastered).length;
    const sessionsAll = Object.values(people).reduce((a, p) => a + Object.values(p.weekByDay).length * 0, 0) + allDays.reduce((a, d) => a + (days[d] ? Object.values(days[d]).reduce((x, m) => x + m.n, 0) : 0), 0);
    const puppyPts = sessionsAll * PP.session + masteredN * PP.mastery + calmDays * PP.calmDay + packDays * PP.packDay + toiletPuppy;
    const puppy = { points: puppyPts, level: levelOf(puppyPts, C.puppyLevels), mastered: masteredN, total: C.skills.length, sessions: sessionsAll, calmDays };

    // badges
    const allMastered = masteredN === C.skills.length && C.skills.length > 0;
    fam.forEach((p) => {
      const me = people[p.id]; const b = [];
      if (me.points > 0 && allDays.some((d) => days[d] && days[d][p.id])) b.push("first");
      if (me.hattricks > 0) b.push("hattrick");
      if (me.early >= 5) b.push("early");
      if (me.owl >= 5) b.push("owl");
      if (me.bestStreak >= 7) b.push("s7");
      if (me.bestStreak >= 14) b.push("s14");
      if (me.bestStreak >= 30) b.push("s30");
      if (me.perfectWeek) b.push("perfect");
      if (me.usedFreeze && me.streak > 0 && !me.atRisk) b.push("frozen");
      if (me.comeback) b.push("comeback");
      ["name", "sit", "down", "stay", "come", "leaveit", "lead"].forEach((s) => { if (me.confirmed.includes(s)) b.push("sk_" + s); });
      if (me.confirmed.includes("roll") || me.confirmed.includes("bang")) b.push("sk_trick");
      if (me.confirmed.length >= Math.ceil(C.skills.length / 2)) b.push("half");
      if (allMastered) b.push("full");
      if (me.rated >= 10) b.push("reporter");
      if (softSun) b.push("softsun");
      if (calm3) b.push("calm3");
      if (shark) b.push("shark");
      if (me.toiletN >= 20) b.push("toilet20");
      if (dryDay) b.push("dryday");
      if (packBest >= 7) b.push("pack7");
      me.level = levelOf(me.points, C.levels);
      if (me.level.n >= 10) b.push("principal");
      me.badges = b;
    });

    // this week's challenge: rotates by week number; the family wins it together
    let challenge = null;
    if (C.challenges && C.challenges.length) {
      const weekNo = Math.floor((parseIso(thisMon) - parseIso("2026-01-05")) / 864e5 / 7);
      const ch = C.challenges[((weekNo % C.challenges.length) + C.challenges.length) % C.challenges.length];
      const wkDays = []; for (let i = 0; i < 7; i++) wkDays.push(addDays(thisMon, i));
      const hat = (d) => fam.filter((p) => days[d] && days[d][p.id] && days[d][p.id].n >= 3).length;
      let progress = 0, target = ch.target;
      if (ch.id === "early") wkDays.forEach((d) => fam.forEach((p) => { const t = days[d] && days[d][p.id] && days[d][p.id].slots.am; if (t && t.at && hourOf(t.at) < 8) progress++; }));
      else if (ch.id === "fullhouse") { target = fam.length; progress = fam.filter((p) => wkDays.some((d) => days[d] && days[d][p.id] && days[d][p.id].n >= 3)).length; }
      else if (ch.id === "diary") progress = wkDays.filter((d) => d <= todayS && logs[d] && logs[d].bite).length;
      else if (ch.id === "quiet") { const r = wkDays.filter((d) => logs[d] && logs[d].bite).map((d) => logs[d].bite); progress = r.length >= 1 && r.reduce((a, b) => a + b, 0) / r.length <= 2 ? r.length : 0; }
      else if (ch.id === "nofreeze") { const used = fam.reduce((a, p) => a + (2 - people[p.id].freezesLeft), 0); progress = used ? 0 : wkDays.filter((d) => d <= todayS).length; }
      else if (ch.id === "graduate") progress = C.skills.filter((sk) => { const v = ((state.mastery && state.mastery[sk.id] && state.mastery[sk.id].done) || []).filter((x) => !x.void); if (!st[sk.id].mastered) return false; const last = v.map((x) => x.at).sort((a, b) => a - b)[Math.min(v.length, st[sk.id].need) - 1]; return last && iso(new Date(last)) >= thisMon; }).length;
      else if (ch.id === "dry") progress = wkDays.filter((d) => { const L = tByDay[d] || []; return L.some((t) => t.kind !== "accident") && !L.some((t) => t.kind === "accident"); }).length;
      else if (ch.id === "pack") progress = wkDays.filter((d) => d <= todayS && packDay(d)).length;
      else if (ch.id === "hattrick") progress = wkDays.reduce((a, d) => a + hat(d), 0);
      const won = target > 0 && progress >= target;
      challenge = { id: ch.id, nm: ch.nm, e: ch.e, ask: ch.ask, progress, target, won, pct: target ? Math.min(100, Math.round((progress / target) * 100)) : 0 };
      if (won) fam.forEach((p) => { people[p.id].points += C.challengePoints || 25; people[p.id].level = levelOf(people[p.id].points, C.levels); });
    }
    return {
      today: todayS, people, skills: st, challenge,
      pack: { streak: packStreak, best: packBest, days: packDays, weekSessions: fam.reduce((a, p) => a + people[p.id].weekSessions, 0), weekTarget: fam.reduce((a, p) => a + people[p.id].target, 0) },
      puppy, biteWeek, calmDays,
      toilet: { today: todayToilet, lastOut, interval, accidentsAfter, ageWeeks },
      missions: missions(state, C, todayS)
    };
  }

  return { compute, skillStatus, missions, levelOf, iso, monday, addDays };
});
