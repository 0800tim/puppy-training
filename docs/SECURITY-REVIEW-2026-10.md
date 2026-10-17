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
