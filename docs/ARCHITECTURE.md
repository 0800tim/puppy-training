# How Puppy School HQ is built

Read from the code on 17 October 2026 (commit 800c1d2 plus the branches of that day). This describes what exists; it does not design Phase 2.

## The shape

```
public/            the whole app, plain HTML, CSS and JS, no build step
  index.html       shell, inline SVG icon sprite, tab bar, panels
  theme.js         applies the saved light/dark choice before first paint
  content.js       every word of training content, badges, levels, nudges, challenges
  rewards.js       the rewards engine: points, streaks, levels, badges, missions, challenges
  app.js           UI, stores, identity, cropper, player
  sw.js            service worker: offline shell, push and notification click
server/
  server.js        one-file HTTP server: static files, PIN, chart API, push and SMS routes
  notify.js        the nudge rules (decide) and the scheduler (createNotifier), SMS sender
  push.js          Web Push without dependencies: VAPID and aes128gcm
test/              node:test, no dependencies
scripts/           build-single.mjs (one-file app), bump.mjs (version stamps)
ops/               backup-puppy.sh
deploy/            systemd unit, env example, Caddyfile example
```

`content.js` and `rewards.js` are written so the same file runs in the browser (`window.PUPPY_CONTENT`, `window.PUPPY_REWARDS`) and in Node (`module.exports`). The server `require()`s both. That is the one architectural decision everything else leans on: **the rewards are a pure function of the chart**, computed wherever they are needed, never stored.

## Three run modes

`app.js` picks a store at boot (`pickStore`):

1. **Server** (`ServerStore`): `GET api/health` answers with `app: "puppy-training"`. The chart lives on the server, protected by the family PIN. Every write goes to the API and the response is the whole new state, so the client never diverges. The client also polls `GET api/state?since=<rev>` every 10 seconds and on visibility change; `unchanged: true` costs nothing.
2. **Local** (`LocalStore`): anything else (GitHub Pages, a file opened from disk, the single-file build). Settings, ticks, logs, mastery, toilet and social live in `localStorage` under `pt.*` keys. Rewards, missions and the skill tree work identically because `rewards.js` runs in the browser. Reminders, texts and the photo server are simply not offered.
3. The Claude-artifact mode from version 1 was removed on 16 October.

## The data model (`store.json`)

One JSON file per family, written atomically (temp file then rename) on every change, with a `rev` counter that only ever goes up.

```
rev        integer, bumped on every persisted change
settings   { puppy: { name, sex, breed, born }, start, family: [person] }
           person = { id, name, kind: "kid" | "adult", age, target, phone, sms }
ticks      { "<date>_<pid>_<am|pm|ev>": { at, by, skill } }
logs       { "<date>": { bite: 1..5, by } }
mastery    { "<skill>": { done: [{ by, witness, at, void? }] } }
toilet     [ { id, at, kind: wee|poo|accident, before, by, void? } ]   (last 1000 kept)
social     { "<group>:<index>": [{ by, mood: happy|unsure|scared, at, void? }] }
push       [ { id, pid, endpoint, keys, prefs, created, label, unanswered } ]   (max 40)
sent       { date, by: { <subId>: [kinds sent today] } }   notifier bookkeeping, not bumped
```

Conventions:

- **`by` on everything.** Who logged it is recorded on every tick, rating, toilet entry and social entry. That is the visible accountability the design relies on instead of approval queues.
- **Void, don't delete.** Toilet and social entries and mastery votes carry `void: true` rather than disappearing, so undo is reversible and the engine can ignore them. Ticks are the exception: unticking removes the key, because a tick is a single bit.
- **Keys are the index.** Tick keys encode date, person and slot; social keys encode group and item index into `content.js`. There is no separate id table.
- Alongside the store: `secret.key` (cookie signing), `vapid.json` (push key pair), `photo.jpg`. See `docs/RESTORE.md`.

## Identity

The family PIN unlocks a phone (`pt_session`, an HMAC-signed, HttpOnly, SameSite=Strict cookie bound to a hash of the PIN, so changing the PIN signs everyone out). On the `burn/security-review` branch a second signed cookie, `pt_me`, records which family member the phone belongs to, set by `POST /api/me`; every write uses it and ignores any identity a request body claims. Kid or grown-up comes from the family record. An optional `PUPPY_ADULT_PIN` gates picking a grown-up. Before that branch, identity was the client-sent `by` field.

## The rewards engine (`rewards.js`)

`compute(state, content, { today })` returns one object the whole UI renders from:

- `people[pid]`: points, streak (one session a day keeps it; two automatic freezes per Monday-to-Sunday week; a frozen day keeps the streak but does not add to it), `atRisk`, `freezesLeft`, best streak, this week's sessions and percent of own target, best week, level (10 named levels on lifetime points), badges, counts the badges are built from.
- `pack`: pack streak (days when everyone trained), week totals.
- `puppy`: puppy points (sessions, skills mastered, calm days, pack days, toilet successes, happy socialisation firsts) and the puppy level.
- `skills[id]`: `open` (every prerequisite practised at least once or confirmed), `votes`, `need` (three different people, or the whole family if smaller), `mastered`, `who`.
- `missions[pid][slot]`: the skill dealt to each person and slot today. Deterministic: day index times three plus slot, offset by the person's position, over the open-and-unmastered skills, skipping skills already logged by that person today. The same inputs always deal the same missions, so every phone agrees without sync.
- `challenge`: this week's challenge (rotating by week number) with progress, target and `won`; a win adds 25 points to everyone.
- `toilet`: last trip out, interval for the puppy's age, accident patterns.

Points are capped by puppy welfare: three slots a day, five toilet points a day, one bite rating a day. Out-of-window or logged-for-you sessions earn 8 instead of 10. Nothing in the engine ranks people by raw points; the podium ranks by percent of each person's own weekly target.

Dates are handled as local `YYYY-MM-DD` strings and day counts are rounded before dividing by seven, because New Zealand daylight saving otherwise loses a week.

## The notifier (`notify.js`)

`decide(now, state, scores, subs, content, sentToday)` is pure. For each subscription it checks: reminders on, not in quiet hours (kids 20:30 to 06:30, grown-ups 21:30 to 06:30), under the daily cap (two pushes per phone, one text per person), then fires at most one message for the current minute: morning (07:00 school days, 08:00 weekends), after school (15:30), evening (18:30), each only if that slot is empty; or the streak-saver (20:00) if nothing was done today and the streak is three or more. SMS gets one afternoon check-in only if the person has done nothing all day. Copy comes from pools in `content.js`, puppy-voiced, seeded so the same line does not repeat.

`createNotifier` runs `tick()` every minute: computes the rewards, builds the subscription list (push rows plus one SMS pseudo-subscription per person with a number and `sms: true`), calls `decide`, sends, records what was sent in `store.sent`, counts unanswered nudges per phone (a tick by that person resets it) and after six in a row pauses that phone's reminders with one last message. A push service answering 404 or 410 removes the subscription.

## Web Push (`push.js`)

About 120 lines: VAPID (an ES256 JWT over the push service origin, signed with the server's P-256 key) and RFC 8291 payload encryption (ECDH with the phone's key, HKDF, AES-128-GCM, one record). Keys live in `DATA_DIR/vapid.json`. The service worker shows the notification and focuses or opens the app on click. Tests prove the encryption by decrypting as a browser would.

## The server (`server.js`)

Static files from `public/` with a strict CSP; everything under `/api/` is JSON only (a cross-site form post is refused with 415). Login is rate limited per IP and globally with constant-time PIN comparison. Validation is by allowlist everywhere: tick keys, skill ids, toilet kinds, social items, moods, time strings, push service hosts. The photo route accepts a JPEG data URL up to 600 KB, checks the magic bytes and stores it next to the chart. `GET /api/state` returns everything the client needs plus `push` (subscriptions without keys), `sms` (gateway configured), `vapid` (public key) and `today`.

## Deployment on clawdia

Three slots behind one Cloudflare tunnel, each a systemd user unit on a loopback port with its own `.env` and `data/`: stable (`puppy-training-prod`, puppy.appspurt.com, branch `stable`), demo (`puppy-training-demo`, puppy-demo.appspurt.com, own PIN) and dev (`puppy-training`, puppy.appspurt.dev, the working tree). `~/bin/update-puppy promote` tests, pushes main to stable and restarts prod and demo by unit name. Cloudflare cache rules bypass the edge for these hosts; app files carry `?v=N` stamps bumped by `scripts/bump.mjs` together with the service worker version.

## What is kept ready for Phase 2, and what is not

Phase 2 is multi-family hosting. The code is single-family by construction: one `store.json`, one PIN, one secret, one VAPID pair, one notifier loop. What makes a later split cheap:

- All state access goes through one `db` object and one `persist()`; a family id would select which object.
- Identity, PIN tag and push subscriptions are already scoped to a signed cookie, which can carry a family id.
- The rewards engine, the notifier's `decide`, and all content are family-agnostic pure functions.
- Nothing in the client assumes a single family beyond "the state I was given".

What is not there: accounts, sign-up, per-family secrets, a family id in cookies or file names, per-family rate limits, a scheduler that iterates families. Those are design work, not refactoring.
