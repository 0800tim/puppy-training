# How Puppy School HQ is built

Read from the code at commit 9bf5d5a (main and stable, 18 October 2026),
revised 20 October. This describes what exists; it does not design Phase 2.
The round-7 branches of 20 October (store safety, client IP, privacy
follow-ups, review nits, export gaps, timeline wording) are noted where they
change a line below, marked "on branch".

## The shape

```
public/            the whole app, plain HTML, CSS and JS, no build step
  index.html       shell, inline SVG icon sprite (33 symbols), tab bar, panels
  theme.js         applies the saved light/dark choice before first paint
  content.js       every word of training content: skills, biting plan, kids' module,
                   other-pets tips, badges, levels, nudges, challenges, timeline,
                   socialisation lists, breed notes, health timings
  rewards.js       the rewards engine: points, streaks, buddy streaks, levels, badges,
                   missions, challenges, skill tree, teaching
  qr.js            a QR encoder for the join link (byte mode, level M, versions 1 to
                   10), drawn as an inline SVG; checked against python-qrcode in tests,
                   and its SVG read back by zxing-cpp (scripts/qr-decode-check.py)
  app.js           UI, stores, identity, cropper, player, exports, certificate
  sw.js            service worker: offline shell, push and notification click
server/
  server.js        one-file HTTP server: static files, PIN, chart API, visitor card,
                   push, SMS, health log, teaching
  notify.js        the nudge rules (decide) and the scheduler (createNotifier), SMS sender
  push.js          Web Push without dependencies: VAPID and aes128gcm
test/              node:test, no dependencies: server, endpoints, rewards, notify, push, content
scripts/           build-single.mjs (one-file app), bump.mjs (version stamps),
                   smoke-static.py and smoke-features.py (Playwright, run on bigmac)
ops/               backup-puppy.sh
deploy/            systemd unit, env example, Caddyfile example
docs/              reviews, plans and this file
```

`content.js` and `rewards.js` are written so the same file runs in the browser
(`window.PUPPY_CONTENT`, `window.PUPPY_REWARDS`) and in Node
(`module.exports`). The server `require()`s both. That is the one
architectural decision everything else leans on: **the rewards are a pure
function of the chart**, computed wherever they are needed, never stored.
The server uses the engine for the notifier and (on `fix/review-nits`) to
check that a taught skill is open.

## Five tabs

Today (the next lesson, ticks, bite meter, toilet, pending teaching
confirmations), Lessons (route id `skills`: the course map, then
socialisation, timeline and the health card; a lesson opens at
`#lesson/<skill id>` as its own screen with watch, read, train and confirm),
Pack (podium by percent of own goal, pack streak, badges, buddy and teaching
chips, the certificate button), Tips (SOS biting card, kids' safety module,
the other-pets section, biting plan, other problems; the tab was Help! until
18 October and keeps the route id `help`; since 22 October it opens with
the biting starter card and its three videos, and carries the cue sheet,
treats and house rules at the bottom), Watch (videos). Settings opens
from the gear: puppy and family, buddies, this phone, reminders, visitor
link, exports.

## Three run modes

`app.js` picks a store at boot (`pickStore`):

1. **Server** (`ServerStore`): `GET api/health` answers with
   `app: "puppy-training"`. The chart lives on the server behind the family
   PIN. Every write goes to the API and the response is the whole new state,
   so the client never diverges. The client polls `GET api/state?since=<rev>`
   every 10 seconds and on visibility change; `unchanged: true` costs nothing.
2. **Local** (`LocalStore`): anything else (GitHub Pages, a file opened from
   disk, the single-file build). Settings, ticks, logs, mastery, toilet,
   social, health and teach live in `localStorage` under `pt.*` keys.
   Rewards, the course, the skill tree, the health card, teaching and the
   certificate work identically because `rewards.js` runs in the browser.
   Reminders, texts, the photo server and the visitor link are not offered.
   `scripts/smoke-features.py` proves this mode for the newer features.
3. The Claude-artifact mode from version 1 was removed on 16 October.

## The data model (`store.json`)

One JSON file per family, written atomically (temp file then rename) on every
change, with a `rev` counter that only ever goes up. On `fix/store-safety`
the file and its temp are written mode 600, an unreadable file is copied to
`store.json.corrupt-<time>` before the server starts fresh, and the same
applies to `vapid.json`.

```
rev        integer, bumped on every persisted change
settings   { puppy: { name, sex, breed, born }, start, family: [person] }
           person = { id, name, kind: "kid" | "adult", age, target, phone, sms, buddy }
ticks      { "<date>_<pid>_<am|pm|ev>": { at, by, skill, void? } }
logs       { "<date>": { bite: 1..5, by } }
mastery    { "<skill>": { done: [{ by, witness, at, void? }] } }
toilet     [ { id, at, kind: wee|poo|accident, before, by, void? } ]        (last 1000 kept)
social     { "<group>:<index>": [{ by, mood: happy|unsure|scared, at, void? }] }
health     [ { id, at, date, kind: vaccine|worm|flea|vet|weight, kg?, note, by, void? } ]  (last 500)
teach      [ { id, skill, teacher, learner, at, confirmed: ms|null, void? } ]   (last 500)
push       [ { id, pid, endpoint, keys, prefs, created, label, unanswered } ]   (max 40)
share      { token, created } | null        the visitor link
sent       { date, by: { <subId>: [kinds sent today] } }   notifier bookkeeping, not bumped
```

Conventions:

- **`by` on everything.** Who logged it is recorded on every tick, rating,
  toilet, social and health entry; teaching carries teacher and learner. That
  is the visible accountability the design relies on instead of approval
  queues. The identity comes from the signed cookie, never from the request.
- **Void, don't delete.** Toilet, social and health entries, mastery votes and
  teaching claims carry `void: true` rather than disappearing, so undo is
  reversible and the engine ignores them. Ticks are removed when unticked
  (a tick is a single bit), though the engine and exports skip a `void` tick
  if one appears.
- **Keys are the index.** Tick keys encode date, person and slot; social keys
  encode group and item index into `content.js`. Health, teach, toilet and
  push rows carry 12-hex ids. There is no separate id table.
- **Buddy** is a person id on another family member, validated on save to
  point at a different, existing member or cleared.
- Alongside the store: `secret.key` (cookie signing), `vapid.json` (push key
  pair), `photo.jpg`. See `docs/RESTORE.md`.

## Identity

The family PIN unlocks a phone: `pt_session`, an HMAC-signed, HttpOnly,
SameSite=Strict cookie bound to a hash of the PIN, so changing the PIN signs
everyone out. A second signed cookie, `pt_me`, records which family member
the phone belongs to, set by `POST /api/me`; every write uses it and ignores
any identity a request body claims. Kid or grown-up comes from the family
record. An optional `PUPPY_ADULT_PIN` gates picking a grown-up, with the same
rate limit as the family PIN. "Lock this phone" clears both cookies.

Three levels appear in the route table below:

- **PIN**: a valid `pt_session`. Everything under `/api/` except health,
  login, logout and the visitor card.
- **identity**: PIN plus a `pt_me` that names a current family member.
  Without it the server answers 403 with `code: "pick"` and the app shows
  "Whose phone is this?".
- **grown-up**: identity whose family record is `kind: "adult"`. Where the
  table says "grown-up once one exists", the rule is `hasAdult && !isAdult`:
  an all-kids family can do it, because nobody could be a grown-up before the
  family exists.

## Routes (`server.js`)

Every `/api/` write must be JSON (`Content-Type: application/json`, else 415)
and under 32 KB (photo 600 KB). Unknown paths under `/api/` are 404; anything
else is served from `public/` with a strict CSP.

| Route | Who | What it does and sends |
| --- | --- | --- |
| `GET /api/health` | anyone | `{ app, version, pin: true }`. The client uses it to pick server mode. |
| `GET /api/visitor/<24 hex>` | anyone with the link | The visitor card as HTML: puppy name plus static cue words, biting steps, rules. Constant-time token check; 404 page with the same noindex meta otherwise. |
| `POST /api/login` | anyone, rate limited | `{ pin }`. 5 wrong tries per address in 15 minutes, 20 per hour overall; a lockout makes even the right PIN wait (429 with `retryAfter`). Sets `pt_session`. |
| `POST /api/logout` | anyone | Clears both cookies. |
| `GET /api/state` | PIN | The state response (below). With `?since=<rev>` equal to the current rev, `{ unchanged: true, rev, me }`. |
| `POST /api/me` | PIN | `{ pid, adultPin? }`. Picks the phone's person; a grown-up needs the grown-up PIN when one is set. Sets `pt_me`. Resets that person's unanswered-nudge counters. `DELETE` clears it. |
| `PUT /api/settings` | grown-up once one exists | The whole settings object, cleaned by allowlist: 6 people max, names 20 chars, ids 24 alphanumerics, phone normalised to +64, buddy validated. |
| `PUT /api/ticks/<date_pid_slot>` | identity | `{ on, skill }`. Past days need a grown-up. Unticking someone else's session more than 15 minutes old needs a grown-up; your own can always be undone. |
| `PUT /api/logs/<date>` | identity | `{ bite: 0..5 }`, 0 removes. |
| `PUT /api/mastery/<skill>` | identity | `{ witness, on }`. `by` is the cookie person; witness must be another member. |
| `PUT /api/social/<group:index>` | identity | `{ mood, on }`. |
| `POST /api/toilet` | identity | `{ kind, before }`. `DELETE /api/toilet/<id>`: author within 15 minutes, or a grown-up. |
| `POST /api/healthlog` | grown-up (on `fix/review-nits`: grown-up once one exists) | `{ kind, date, kg?, note }`. Kind from the allowlist, date a real calendar day (`feat/health-tracker`), kg 0 to 120, note 80 chars. `DELETE /api/healthlog/<id>` voids, same gate. |
| `POST /api/teach` | identity | `{ skill, learner }`. Learner another member; no duplicate open claim for the same teacher, learner and skill (409). On `fix/review-nits`: the skill must be open and a teacher may have five unconfirmed claims (429). |
| `PUT /api/teach/<id>` | the learner only | Confirms. The teacher cannot confirm their own claim, nor can a grown-up on the learner's behalf. |
| `DELETE /api/teach/<id>` | teacher, learner or grown-up | Voids. |
| `POST /api/push/subscribe` | identity | `{ subscription, label }`. Endpoint must be a real browser push service; 40 phones max (409 beyond); re-subscribing an endpoint updates it. On `fix/store-safety`: 503 while push keys are missing. |
| `PUT /api/push/<id>` | owner or grown-up | Prefs (on, slots, times, quiet hours). `DELETE`: owner or grown-up, 404 if unknown. `POST .../test`: owner or grown-up, sends one real push; 410 and removal if the service says the subscription is gone. |
| `POST /api/sms/test` | grown-up | `{ pid }`. One real text through the Aiva-SMS gateway, or 502 without one. |
| `POST /api/share` | grown-up | Makes the visitor link (replaces any existing one). `DELETE`: revokes. |
| `DELETE /api/family/<pid>` | grown-up once one exists | Removes the person and voids everything they logged with a removal stamp; clears buddy pointers and witness fields; drops their push rows. Never yourself, never the last grown-up while kids remain (`feat/remove-person`). |
| `POST /api/family/<pid>/restore` | grown-up once one exists | Undo within 15 minutes: puts the person, pointers, rows and subscriptions back exactly. 404 after the window; the next save then purges the id from every row. |
| `GET /api/photo` | PIN | The JPEG. `PUT` (data URL, JPEG magic bytes, 600 KB) and `DELETE`: grown-up once one exists. |

### The state response

`GET /api/state` and every successful write return the same object:

| Key | Sent as | Trimmed |
| --- | --- | --- |
| `rev`, `today` | as stored, server's local date | |
| `settings` | as stored | On `priv/followups`: `phone` removed from every member when the caller is not a grown-up and the family has one. |
| `ticks`, `logs`, `mastery`, `social` | as stored | nothing; voided mastery and social entries are sent with their flag and the engine skips them |
| `toilet` | last 300 of the 1000 kept | |
| `health` | unvoided entries only | all of them (500 cap in the store) |
| `teach` | unvoided, last 200 | |
| `push` | `id, pid, prefs, created, label` per subscription | endpoint and keys never leave the server |
| `sms` | boolean: gateway configured | |
| `vapid` | the public key only | On `fix/store-safety`: empty while keys are missing. |
| `share` | `{ token, created }` or null | |
| `removals` | `[{ id, name, at, counts }]` still inside the 15-minute undo window | the stash itself (person record, buddy ids, push rows) stays server-side |
| `photo` | boolean | |
| `me`, `adultPin` | the caller's person id or null; whether a grown-up PIN is set | |

The client (`ServerStore.apply`) copies these into `S` and recomputes the
rewards; nothing from the response is trusted for identity beyond `me`.

## The rewards engine (`rewards.js`)

`compute(state, content, { today })` returns one object the whole UI renders from:

- `people[pid]`: points, streak (one session a day keeps it; two automatic
  freezes per Monday-to-Sunday week; a frozen day keeps the streak but does
  not add to it), `atRisk`, `freezesLeft`, best streak, this week's sessions
  and percent of own target, best week, level (10 named levels on lifetime
  points), badges (33), the counts the badges are built from, `buddy`
  (`{ with, streak, best, today }` or null), `taught` (distinct skills with a
  confirmed lesson) and `learned`.
- `pack`: pack streak (days when everyone trained), week totals.
- `puppy`: puppy points (sessions, skills mastered, calm days, pack days,
  toilet successes, happy socialisation firsts) and the puppy level, which
  the certificate prints.
- `skills[id]`: `open` (every prerequisite practised at least once or
  confirmed), `votes`, `need` (three different people, or the whole family
  if smaller), `mastered`, `who`, `practising`.
- `course`: `order` (every lesson id in course order), `reps` (3) and
  `people[pid]` with `lessons[id]` (`count`, `done`, `mastered`, `status`
  of `done`, `current` or `later`), `current`, `done`, `total`,
  `graduated`. A lesson is done after `reps` sessions on that person's own
  row with that skill, or once the pack has mastered it.
- `missions[pid][slot]`: the person's current lesson in every slot, with the
  lesson before it as the warm-up; a graduate rotates through the course.
  The notifier names it in nudges.
- `challenge`: this week's challenge (nine, rotating by week number) with
  progress, target and `won`; a win adds 25 points to everyone.
- `toilet`: last trip out, interval for the puppy's age, accident patterns.

Points: session 10 (8 out of window or logged for you), full day 5, mastery
30, witness 10, bite rating 2, toilet 2 (cap 10 a day), pack day 5, social 5,
teach 15 (once per day of confirmations per teacher), learn 10 per confirmed
lesson. Welfare caps: three slots a day, one bite rating a day. The podium
ranks by percent of each person's own weekly target, never raw points.

Dates are handled as local `YYYY-MM-DD` strings and day counts are rounded
before dividing by seven, because New Zealand daylight saving otherwise loses
a week. The engine ignores tick keys it does not recognise.

## The notifier (`notify.js`)

`decide(now, state, scores, subs, content, sentToday)` is pure. For each
subscription it checks: reminders on, not in quiet hours (kids 20:30 to
06:30, grown-ups 21:30 to 06:30), under the daily cap (two pushes per phone,
one text per person), then fires at most one message for the current minute:
morning (07:00 school days, 08:00 weekends), after school (15:30), evening
(18:30), each only if that slot is empty; or the streak-saver (20:00) if
nothing was done today and the streak is three or more. SMS gets one
afternoon check-in only if the person has done nothing all day. Copy comes
from puppy-voiced pools in `content.js`.

`createNotifier` runs `tick()` every minute: computes the rewards, builds the
subscription list (push rows plus one SMS pseudo-subscription per person with
a number and `sms: true`), calls `decide`, sends, records what was sent in
`store.sent`, counts unanswered nudges per phone and after six in a row pauses
that phone's reminders with one last message. A push service answering 404
or 410 removes the subscription. On `fix/store-safety` it sends no push while
the keys are missing.

## Web Push (`push.js`)

About 120 lines: VAPID (an ES256 JWT over the push service origin, signed
with the server's P-256 key) and RFC 8291 payload encryption (ECDH with the
phone's key, HKDF, AES-128-GCM, one record). Keys live in
`DATA_DIR/vapid.json`, mode 600. The service worker shows the notification
and focuses or opens the app on click. Tests prove the encryption by
decrypting as a browser would.

## The client's bigger pieces (`app.js`)

- **Stores**: `LocalStore` and `ServerStore` expose the same methods
  (`setTick`, `setMastery`, `addToilet`, `addHealth`, `addTeach`,
  `confirmTeach`, `makeShare`, `exportJson` and so on), so the UI never knows
  which it has.
- **Exports**: `exportJson()` (settings, ticks, logs, mastery, toilet; on
  `feat/export-gaps` also social, health, teach) and `exportCsv()` (one flat
  file: sessions, bite meter, toilet, confirmed skills, socialising, health,
  and on that branch teaching), with cells that look like formulas written as
  text.
- **Certificate**: an overlay built from the puppy level with a print
  stylesheet (A4 landscape), saved as PDF from the phone.
- **Visitor link**: Settings, grown-ups only, with the system share sheet.
- **Cropper**: pinch, zoom and rotate on a circular mask; the result is a
  JPEG data URL sent to `PUT /api/photo`.
- **Routing**: the hash names the tab (`#today`, `#skills`, `#pack`, `#help`,
  `#watch`, `#settings`) or a lesson (`#lesson/<skill id>`) so Back works
  and reminders can deep-link.
- **Per-phone preferences** in `localStorage`: `pt.me` (remembered person),
  `pt.theme`, and on `burn/a11y-followups` `pt.haptics`.

## The server (`server.js`)

Static files from `public/` with a strict CSP; everything under `/api/` is
JSON only. Login is rate limited per address and globally with constant-time
PIN comparison; behind a proxy (`TRUST_PROXY=1`) the address comes from
`CF-Connecting-IP`, then the last `X-Forwarded-For` hop (`sec/client-ip`;
before that branch, the first entry, which the caller could write).
Validation is by allowlist everywhere: tick keys, skill ids, toilet kinds,
social items, moods, health kinds, time strings, push service hosts. Logging
is one line per login, identity pick, visitor link, push send and failure;
there is no access log.

## Deployment on clawdia

Three slots behind one Cloudflare tunnel, each a systemd user unit on a
loopback port with its own `.env` and `data/`: stable (`puppy-training-prod`,
puppy.appspurt.com, branch `stable`), demo (`puppy-training-demo`,
puppy-demo.appspurt.com, own PIN) and dev (`puppy-training`,
puppy.appspurt.dev, the working tree). `~/bin/update-puppy promote` tests,
pushes main to stable and restarts prod and demo by unit name. Cloudflare
cache rules bypass the edge for these hosts; app files carry `?v=N` stamps
bumped by `scripts/bump.mjs` together with the service worker version
(pt-v17 live on 20 October). A daily timer copies each slot's data to
`/srv/backups/puppy-training` (`docs/RESTORE.md`); offsite copies are
planned in `docs/OFFSITE-BACKUP-PLAN.md`.

## What is kept ready for Phase 2, and what is not

Phase 2 is multi-family hosting. The code is single-family by construction:
one `store.json`, one PIN, one secret, one VAPID pair, one notifier loop.
What makes a later split cheap:

- All state access goes through one `db` object and one `persist()`; a
  family id would select which object.
- Identity, PIN tag and push subscriptions are already scoped to a signed
  cookie, which can carry a family id.
- The rewards engine, the notifier's `decide`, and all content are
  family-agnostic pure functions.
- Nothing in the client assumes a single family beyond "the state I was
  given".

What is not there: accounts, sign-up, per-family secrets, a family id in
cookies or file names, per-family rate limits, a scheduler that iterates
families, a "forget this person" action (`docs/design/REMOVE-PERSON.md`).
Those are design work, not refactoring.

Revised 22 October: "forget this person" shipped (`DELETE /api/family/<pid>`,
void with a 15-minute undo). The split itself is designed in
`docs/design/HOUSEHOLDS.md` and step 1 of it is on branch
`feat/households-store`:

- `createApp` builds one **household** object per family (`openHousehold`):
  its `db`, `persist`, files, PIN matchers, cookie makers, `stateOut`,
  `member`, the remove-person helpers and its own notifier. The route
  handler resolves one household per request from the `pt_h` cookie, the
  household named inside the session cookie, or the carried-over family,
  then destructures that household's functions, so the route bodies are
  unchanged and cannot reach another family's chart.
- Without `HOUSEHOLDS=1` there is exactly one household, `default`, with
  its files where they always were, PINs from the environment, and cookies
  byte-identical to before (no household field, same tag), which is why the
  existing suite passes unchanged.
- `DATA_DIR/lockouts.json` keeps the wrong-guess times (per address, global,
  per household) across restarts, mode 600, pruned to the live windows on
  each write; the email link budget stays in memory.
- With `HOUSEHOLDS=1`: `DATA_DIR/households.json` is the index (id, code,
  name, owner email, scrypt PIN hashes, tag, flags), each family lives in
  `DATA_DIR/households/<id>/`, one `secret.key` and one `vapid.json` serve
  the server. First boot with a legacy `store.json` moves it into household
  `default`, hashes the env PINs into the index and keeps the old cookies
  valid. `GET /j/<code>` sets `pt_h`; `PUT /api/pins` lets a grown-up change
  either PIN (a new family PIN rotates the tag and signs the family out);
  a per-household PIN lockout sits beside the per-IP one; SMS is a
  per-household flag, on only for the carried-over family.
- Step 2 is on `feat/households-join` (stacked on step 1): `/api/health`
  says `households: true`, `GET /api/household` tells a phone which family
  it is in before the PIN (code and puppy's name, or nothing), the state
  carries `household: { code, name }`, an unknown join code bounces to
  `/?join=unknown` and counts toward the per-IP lockout. The client gets a
  welcome screen (`renderWelcome`, shown on the 401 with `code: "household"`),
  a family-code screen (`renderJoin`, which navigates to `/j/<code>`), a
  holding screen for "Start a new family" until sign-up exists, the family
  name and code on the PIN screen with a way out of the wrong family, and a
  "Your family" card in Settings for grown-ups (code, join link with Share or
  Copy, change the family PIN, turn the grown-up PIN on, off or change it).
  The card also shows the join link as a QR code (`qr.js`, added 24 October on
  `feat/join-qr`), and the owner page shows one under a newly made family's
  join link, so a phone in the same room joins by camera. The tests prove the
  module grid matches python-qrcode; `scripts/qr-decode-check.py` rasterises
  the SVG the page draws and reads it back with zxing-cpp, every size and
  mask, so the drawn symbol is known to decode. No real camera has read it yet.
- Step 3 is on `feat/households-email`: `server/mail.js` (`MAIL=console`
  prints each email to the log with its link; `MAIL=sendgrid` posts to
  SendGrid's v3 mail/send with click tracking off, because a rewritten link
  is a broken sign-in link). `POST /api/signup { email, puppy, name, pin }`
  stores a pending record in `households.json` (PIN hashed) and emails a
  signed link; nothing is made until `POST /m/<token>` opens it, which
  creates the household, keeps the form's answers as `db.starter` to prefill
  the first Settings, and sets `pt_h` and `pt_session`. `POST /api/email
  { email }` finds every household where that address is on a grown-up's row
  (or is the owner of a family not yet set up) and emails one link per
  family; opening one sets `pt_me` too, since the email proved who they are,
  so no grown-up PIN is asked. `GET /m/<token>` only shows a page that posts
  itself (`public/m.js`), so a mail scanner fetching the link cannot spend it.
  Links are signed with the server secret, carry a nonce and a 15-minute
  expiry, and are single use: sign-ups by removing the pending record,
  sign-ins by a `spent` list in the index, both pruned on every index save
  and shared with any other process that reads the file. The reply to both
  routes is the same whether or not the address is known, and link requests
  are capped at three an hour per visitor address and per email address.
  Grown-ups' rows gain an optional `email` (kids' rows never carry one, and
  kids' phones do not receive them).
- Step 4 is on `feat/households-owner`: `OWNER_EMAILS` names the operator;
  asking for a sign-in link with one of those addresses adds an owner link
  to the email, which sets a signed `pt_owner` cookie (seven days) and opens
  `public/owner.html` (plain HTML plus `owner.js`, outside the app shell).
  `GET /api/owner/households` lists id, code, name, owner, dates, flags,
  people count and whether Settings exist, never chart data; `POST` makes a
  family (an invite: join link, plus a sign-in link when an email is given);
  `PUT /api/owner/households/<id>` sets `suspended` or `sms`, clears a
  pending delete with `wipe: false`, or mints a fresh sign-in link with
  `signin: true` for a family not yet set up; `DELETE` sets
  `flags.wipeAt` seven days out. `DELETE /api/household` does the same from
  the app for the grown-up whose email is the family's owner (or any grown-up
  of the carried-over family, which has none). A family with `wipeAt` answers
  403 "being deleted" on every route but logout; `H.suspended` covers both
  flags. `sweep()` runs at boot and every ten minutes: it removes the folder
  and index row of families past `wipeAt` and of demo families older than a
  day. `POST /api/demo` makes a household flagged `demo` (puppy Biscuit, a
  grown-up Sam and a kid Alex, random PIN, no notifier, SMS off) and signs
  the phone in as Sam; three an hour per visitor address. The state's
  `household` carries `owner` (may this person delete it) and `demo`.
