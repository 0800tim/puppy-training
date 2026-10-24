# Security review: server/server.js, October 2026

Scope: the self-hosted PIN server (`server/server.js`, `server/notify.js`, `server/push.js`) as of commit 800c1d2, reviewed against what the README promised under "How the PIN is protected". Threat model: a family app behind one shared PIN. Nobody is stealing money. The risks are a child's phone doing grown-up things, a stranger with the PIN doing damage, and the server being used to hit other people's machines.

## Findings and fixes

| # | Finding | Severity | Fix in this branch |
|---|---|---|---|
| 1 | **Identity was whatever the client sent.** Every write took `by` or `pid` from the request body and looked it up in the family list. A kid's phone could send `by: "<dad>"` and backfill past days, confirm skills as Dad, pause Mum's reminders, or change the family and phone numbers. | High | Identity now lives in a second cookie, `pt_me`, signed by the server (same HMAC secret and PIN tag as the session). It is set by `POST /api/me` and read on every write; `by` in a request body is ignored. Grown-up status is looked up from the family record of the cookie's person, never from the request. |
| 2 | **Anyone with the PIN could pick a grown-up profile.** Picking yourself is a tap, so finding 1 still leaves a determined child able to tap "Dad". | Medium | Optional `PUPPY_ADULT_PIN` (4 to 8 digits). When set, `POST /api/me` for a grown-up profile needs it, with the same rate limit as the family PIN. The app prompts for it when a grown-up is chosen and shows "· PIN" on those profiles. Unset, behaviour is unchanged: visible, logged, trusted. |
| 3 | **Settings, the photo and phone numbers were open to everyone.** Any phone could rename people, change goals, add or remove family members, set the SMS numbers, or replace the puppy's photo. | High | Once a grown-up exists in the family, `PUT /api/settings`, `PUT /api/photo` and `DELETE /api/photo` require a grown-up. First-time setup (no family yet) is still open, because nobody can be a grown-up before the family exists. Kids see the family read-only in Settings. |
| 4 | **Undo had no owner check and no window**, although the README promised "the person who made it, within 15 minutes". `DELETE /api/toilet/:id` voided any entry; unticking a session was open to all. | Medium | A toilet entry can be voided by its author within 15 minutes or by a grown-up any time. Unticking someone else's session after 15 minutes needs a grown-up. Your own ticks can always be undone. |
| 5 | **Push subscriptions could point anywhere.** `POST /api/push/subscribe` accepted any `https://` endpoint, and the notifier then POSTed encrypted payloads with VAPID headers to it. A phone with the PIN could make the server send to an arbitrary host (a weak SSRF, since the body is encrypted and the method fixed). | Medium | Endpoints must belong to a real browser push service: Mozilla (`*.push.services.mozilla.com`), Google (`fcm.googleapis.com`, `android.googleapis.com`), Microsoft (`*.notify.windows.com`) or Apple (`web.push.apple.com`, `*.push.apple.com`). Length capped at 2048. |
| 6 | **Push prefs, delete and test had no owner check beyond a client-sent `by`.** | Medium | Owner or grown-up, from the cookie. `DELETE` now 404s on unknown ids instead of silently succeeding. |
| 7 | **The 40-subscription cap silently evicted the oldest phone.** A child could register 40 fake subscriptions and knock every other phone off reminders without anyone noticing. | Low | Hard cap: the 41st distinct endpoint gets `409` with a message. Re-subscribing an existing endpoint always works. |
| 8 | `POST /api/sms/test` trusted a client-sent `by` to decide "grown-ups only". | Medium | Cookie identity. |
| 9 | Logout cleared the session cookie but not the identity cookie. | Low | Clears both. The identity cookie is also bound to the PIN tag, so changing the PIN invalidates it like the session. |

## What was already sound

- PIN check is constant-time; wrong PINs are rate limited per IP and globally; the right PIN waits during a lockout.
- Session cookies are HMAC-signed, HttpOnly, SameSite=Strict, Secure behind HTTPS, and bound to a hash of the PIN so a PIN change signs everyone out.
- Writes require `Content-Type: application/json`, which blocks cross-site form posts; `SameSite=Strict` blocks cross-site fetches carrying the cookie.
- Static serving normalises paths and refuses anything outside `public/`.
- Body size limits: 32 KB normally, 600 KB for the photo, with a JPEG magic-byte check.
- The CSP allows scripts only from the origin, frames only from YouTube's privacy domain, and images from the origin, data, blob and YouTube thumbnails.
- Web Push payloads are encrypted (aes128gcm) and VAPID-signed with keys kept in `DATA_DIR/vapid.json` (mode 600).
- All validation uses allowlists (skill ids, toilet kinds, social items, moods, time formats).

## Still open, by design or for later

- **One shared family PIN** is the model. It is a front-door lock, not per-person auth. The grown-up PIN is the only second factor. Phase 2 (multi-family) will need real accounts for family owners.
- **No audit trail beyond the log file.** `log()` records logins, identity picks and notification sends; the chart itself keeps `by` on every entry, which is the visible accountability the research recommended.
- **The identity cookie is as long-lived as the session (180 days).** A lost phone that is still unlocked can act as its person until the PIN is changed. Changing the PIN remains the kill switch.
- **Rate limiting is in memory.** A restart clears lockouts. Acceptable for one family; Phase 2 should persist it.
- **`/api/photo` is readable by anyone with the PIN**, as intended.
- **SMS numbers are visible to every family member** in the state. Only grown-ups can change them. If that matters, strip `phone` from the state for kids in a follow-up.

## How to verify

```bash
npm test          # 20 tests, including every rule above
```

The relevant tests are in `test/server.test.js`: "right PIN unlocks; ticks, logs and settings persist" (identity, grown-up gates, undo windows, push allowlist and cap) and "a grown-up PIN, when set, gates picking a grown-up profile".

## Deploying this change

Phones that picked a person before this change are migrated on their next load: if the phone remembers a person and the server has no identity cookie yet, the app re-picks that person through `POST /api/me` (unless they are a grown-up and a grown-up PIN is set, in which case the pick-yourself screen appears). To turn on the grown-up PIN, add `PUPPY_ADULT_PIN=<digits>` to the slot's `.env` and restart the unit by name.

## Addendum, 17 October 2026: what shipped after this review

Scope: the visitor card (merged and live on puppy.appspurt.com), the health
log on `feat/health-tracker`, teaching and buddies on
`feat/buddy-and-teaching`, and the CSV export on `feat/export-certificate`.
Same threat model as above. Reviewed from a worktree on
`sec/addendum-2026-10-17`; nothing was promoted.

### The visitor card: `/api/visitor/<token>`, `/api/share`

What it is: one HTML page for grandparents and sitters, reachable by link
only, no PIN. It carries the puppy's name, the cue words, the biting steps,
the house rules, the kids' rules and the "never give" list, all from
`content.js`. It carries no family names, no chart, no photo, no phone
numbers and no link back into the app. The test asserts the names are
absent.

- **Only a grown-up can make or revoke a link.** `POST /api/share` and
  `DELETE /api/share` check the signed identity cookie, like every other
  grown-up gate. Making a new link replaces the old one, so there is only
  ever one live token; the old link answers 404 at once. Creation is logged
  with the grown-up's id.
- **The token is 12 random bytes as 24 hex characters** (96 bits), checked
  with `crypto.timingSafeEqual` after a length check. Guessing is not a
  realistic attack and the route needs no rate limit.
- **Nothing on the page is unescaped.** The puppy's name and every content
  string go through one `esc()` helper. Content strings are static, so the
  only user-supplied text on the page is the puppy's name (24 characters,
  grown-up set).
- **Not indexed.** The page has `<meta name="robots" content="noindex">`
  and `Cache-Control: no-store`. The live check on 17 October showed no
  `X-Robots-Tag` header, and puppy.appspurt.com is not a zone-wide noindex
  domain the way appspurt.dev is. Fixed on this branch: both the card and
  the "turned off" page now send `X-Robots-Tag: noindex, nofollow`, and the
  test checks the header on both.
- **Revoking.** Settings, grown-ups only: "turn off the visitor link" sends
  `DELETE /api/share`. The token is removed from the store and the link
  answers 404 with the same "No card here" page. Making a new link also
  kills the old one.
- Still open, by design: a link pasted into a chat app is fetched by that
  app's link preview, so the puppy's name and the page title reach that
  service. Acceptable for what is on the page. `HEAD` on the route falls
  through to the PIN wall and answers 401, which is harmless.

### The health log: `/api/healthlog` on `feat/health-tracker`

- **Grown-ups only, from the cookie.** Both `POST` and `DELETE` require
  `isAdult`, which comes from the family record of the signed `pt_me`
  identity, never from the body. `by` on each entry is that identity. A kid
  gets 403 on both. Note this is stricter than settings and the photo: a
  family with no grown-up cannot log health at all, while the client shows
  the form in that case. Harmless for a family with grown-ups; align it with
  `hasAdult && !isAdult` if an all-kids family ever matters.
- **Everything is allowlisted or bounded.** Kind must be one of the five in
  `content.health.kinds`; weight must be a number above 0 and below 120,
  rounded to two decimals; the note is a string trimmed to 80 characters;
  the log keeps the last 500 entries. Entries are soft-deleted (`void`) and
  voided entries are never sent to clients.
- **Fixed on the branch:** the date was checked for shape only, so
  `2026-02-30` or `2026-13-01` was accepted and would have reached the
  weight chart as an invalid date. The server now requires a real calendar
  day between 2000 and 2099, with two new assertions in the endpoint test.
- Readable by the whole family, including vet notes, like the rest of the
  chart. The client renders notes as text nodes and the chart from numbers
  only, so nothing user-supplied reaches `innerHTML`.

### Teaching and buddies: `/api/teach` on `feat/buddy-and-teaching`

- **Logging a lesson needs an identity.** `POST /api/teach` uses the cookie
  identity as the teacher. The skill must be a known id and the learner must
  be another member of the family; teaching yourself is a 400. The same
  teacher, learner and skill cannot be logged twice while a claim is open
  (409). There is no free text in a claim, so nothing to escape.
- **Only the learner can confirm, from their own phone.** `PUT
  /api/teach/:id` compares the cookie identity to the learner on the record.
  The teacher cannot confirm their own claim (403, tested), and neither can
  a grown-up on the learner's behalf. So a kid cannot award themselves
  teaching points: someone else has to say it happened, and that someone is
  named on the entry.
- **One lesson a day.** The cap lives in `rewards.js`, not the server: a
  teacher scores the teaching points once per day on which a confirmation
  landed, however many lessons were confirmed; the learner scores each
  confirmed lesson. The badges count distinct skills taught. The server
  keeps the last 500 claims and sends the last 200 unvoided ones.
- **Deleting a claim**: the teacher, the learner or a grown-up. Soft delete.
- **Buddies** are a field on each family member, saved through the
  grown-up-gated settings route, validated to be another existing member or
  cleared. Nothing else in the engine trusts it.
- Still open, by design: two kids can trade confirmations. Every entry shows
  teacher and learner, the Pack chips show the counts, and the "spicier
  competition" decision accepted this. There is no server-side cap on open
  claims per teacher, only the daily points cap; a kid who logs twenty
  claims makes twenty confirm cards on other phones and nothing else.

### The CSV export on `feat/export-certificate`

- **Client-side only.** The file is built in the browser from the state the
  phone already holds; no new route, no server change. Rows: sessions, bite
  meter, toilet, confirmed skills, socialising and health, with who logged
  each and when.
- **What is not in it.** No family PIN, no grown-up PIN and no cookies or
  signing secret: none of those are ever in the state. No phone numbers:
  they live on `settings.family`, which the CSV does not read. No push
  endpoints: the state carries only id, person, prefs and label for each
  subscription. No VAPID private key: only the public key is sent to
  clients. What it does hold is the family's first names, skill names and
  health notes, which is the chart itself.
- **Fixed on the branch:** spreadsheet formula injection. A cell beginning
  with `=`, `+`, `-`, `@` or a tab is executed as a formula by Excel and
  Sheets even when quoted. Names and health notes are user-entered, so a
  name of `=HYPERLINK(...)` would have run. Cells that start that way now
  get a leading apostrophe and open as text.
- The JSON export is unchanged and includes `settings.family` with phone
  numbers and SMS flags. It always has; it is the family's own backup and
  stays in the family. Noted here so nobody is surprised.
- The certificate overlay prints names and the puppy's name only, from text
  nodes, with no secrets and no route.

### How to verify

Not run on clawdia (memory rule). On bigmac:

```bash
git checkout sec/addendum-2026-10-17 && npm test   # 33, visitor header asserted
git checkout feat/health-tracker && npm test       # 34, two new date assertions
git checkout feat/export-certificate && npm test   # 33; CSV guard is client code
```

For the CSV guard, name a test person `=1+1` in Settings, Export CSV, open
it in Sheets: the cell should read `'=1+1` as text.

### Added 20 October 2026: the visitor address behind the tunnel

| # | Finding | Severity | Fix on `sec/client-ip` |
|---|---|---|---|
| 10 | **With `TRUST_PROXY=1` the server took the first `X-Forwarded-For` entry as the visitor's address.** That entry is whatever the phone sent. Cloudflare's documented behaviour (developers.cloudflare.com, "HTTP request headers") is to *append* the connecting address to an `X-Forwarded-For` the client already sent, and cloudflared does the same (cloudflare/cloudflared issue 1426 shows `X-Forwarded-For: a,b,c,…,203.0.113.1` reaching the origin with `Cf-Connecting-Ip: 203.0.113.1`). So one phone could dodge the per-address PIN lockout by changing the header each try, and the log recorded made-up addresses. The global cap of 20 wrong PINs an hour still held. | Medium | `clientIp()` now reads `CF-Connecting-IP` first (one address, set only by the edge, which Cloudflare recommends over `X-Forwarded-For`), then the *last* `X-Forwarded-For` hop for other proxies, then the socket. Values that are not IP addresses are ignored. Without `TRUST_PROXY` both headers are ignored as before. Tests: a phone rewriting the first entry is still locked out, the log carries the edge's address, junk headers fall back to the socket, and with the flag off the headers do nothing. Also fixed: `createApp({ trustProxy: true })` was read as off (only the string "1" counted), which is why no test had exercised the proxy path. |

### Added 24 October 2026: households steps 3 and 4 (links by email, the owner page, demo families)

A fresh-eyes pass over `feat/households-email` and `feat/households-owner`
(main c8a7195): the signed links, the pending and spent lists in
`households.json`, the owner cookie and routes, demo creation, deletion and
the sweeper, `public/owner.js` and `public/m.js`. Fixes on
`sec/households-review`, 80 tests.

| # | Finding | Severity | Fix |
|---|---|---|---|
| 11 | **A phone whose family is gone fell through to the carried-over family.** `resolveHousehold` falls back to household `default` when no cookie names a live family, which is right for phones from before `HOUSEHOLDS=1` (their cookies name no household). But a phone whose `pt_h` or session named a family the sweeper has removed (a demo past its day, or a deleted family after the grace period) took the same path, and the welcome-screen rule only looked for phones with no cookies at all. On dev, anyone shown a sample family saw the real family's PIN screen the next day, with its name and code. The PIN still protected the chart; the lockout counters applied. | Medium | A cookie that names a family not on the server now counts as no family: `GET /api/household` answers with no code or name, `GET /api/state` says 401 "Which family?", and the dead `pt_h` is cleared on both so a join link or sign-up starts clean. Cookies from before `HOUSEHOLDS=1` still land in `default`, and so does a PIN typed with no cookies. Test in `test/owner.test.js`. |
| 12 | **No cap on live sample families.** `POST /api/demo` was limited to three an hour per address, but each demo is a folder, an open store and an entry in memory, and addresses are cheap. | Low | At most `limits.demoMax` (20) demo families alive at once; beyond that the button gets 503 "try again tomorrow". Pending sign-ups are capped the same way at `limits.pendingMax` (500); each is a few hundred bytes and a scrypt hash. Test. |
| 13 | **A sign-up typo spent one of the hour's three links.** The per-address and per-phone counters were taken before the puppy's name, the grown-up's name and the PIN were checked, so three mistakes locked the address for an hour with no email sent. | Low | Fields are checked first; only a request that will send mail counts. Test. |
| 14 | **Names reached email subjects and page titles with control characters in them.** The puppy's name and the grown-up's name are user text; a newline in the puppy's name put a second line into the "Start X's puppy school" subject and the greeting. SendGrid takes JSON, so no header could be injected, and the link page escapes HTML, but a crafted subject still looks wrong in an inbox. | Low | `plain()` folds control characters to a space on every name that enters the index or an email (sign-up, the owner's make-a-family form, `createHousehold`). Test. |
| 15 | **Links take the request's Host header when `APP_URL` is unset.** Behind the Cloudflare tunnel the edge only forwards requests whose Host matches the zone, so a forged Host cannot reach the origin that way, but a server reached directly, or behind a plainer proxy, would put an attacker's address into a sign-in email. | Low here, Medium elsewhere | README and the env example now say to set `APP_URL` on any public server, and the server logs a warning at boot in households mode without it. Needs Tim: add `APP_URL=https://puppy.appspurt.dev` to the dev `.env` (and the matching value to prod when it goes multi) and restart the unit. |

Accepted, by design, noted so nobody rediscovers them:

- `pt_h` is a pointer, not a credential, and `default` is a guessable id.
  Setting `pt_h=default` by hand returns the carried-over family's name and
  code from `GET /api/household`. The code only leads to that family's PIN
  screen, which a cookieless phone reaches anyway (a PIN typed with no
  cookies lands in `default`), and the name is the puppy's. Other ids are 40
  random bits.
- The link page posts itself after 300 ms. A mail scanner that runs scripts
  could spend a link; the person then asks for another. Scanners that only
  fetch do not.
- A grown-up can put any address on their own row, so that address's next
  sign-in email lists their family too. The address owner is not harmed
  beyond an extra link; the family named is the grown-up's own.
- A sign-in link stays good for its 15 minutes even if the row's email is
  changed or the person removed in between; opening it with a removed person
  bounces, a changed email does not.
- `DELETE /api/household` by any grown-up when the family has no owner
  address (families the owner page made without one). The owner page can undo
  for seven days.
- The sweeper removes a folder while a request on that family could still be
  in flight; that request fails with a 500 once, and the phone's next request
  gets the welcome screen.

Not fixed, not Tim-free: the visual pass of the welcome, sign-up, sign-in,
check-your-email and owner screens needs a browser.
