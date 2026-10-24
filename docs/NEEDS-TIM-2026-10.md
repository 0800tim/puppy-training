# Decisions for Tim, October 2026

One page, one line per open question, a recommendation and the one-word
answer you can give. Written 20 October 2026 from
`docs/OFFSITE-BACKUP-PLAN.md`, `docs/PRIVACY.md`,
`docs/HEALTH-TIMINGS-REVIEW.md`, `docs/MERGE-REVIEW-2026-10-17.md` and the
Hivemind log. Everything from rounds 4 to 6 is on main and live. Round 7
(20 October) added seven branches; they went live on 22 October with the
guided course and are listed last for the record. The 22 October update
added items 17 to 20; the 24 October update adds 21 to 24 at the end.

Answer with the number and the word, for example "1 A, 2 yes, 5 go".

## Backups (offsite plan)

| # | Question | Recommendation | Say |
| --- | --- | --- | --- |
| 1 | Which age key encrypts the offsite bundles: A (house key A, already in 1Password and tested), B (A plus key B as a second recipient), or C (a new puppy-only key)? | A, or B if you want two keys that both open it. | A, B or C |
| 2 | Put each slot's `.env` (PIN, grown-up PIN, SMS key) inside the encrypted bundle, so a restore to a new box needs nothing from memory? | Yes. It is encrypted to a key that never touches the server. | yes or no |
| 3 | Repoint `puppy-training-backup.service` at the prod checkout instead of the dev working tree, so the timer runs what is on `stable`? | Yes, when the first automated offsite run goes in. | yes or no |
| 4 | Approve the first upload to `clawdia-backups/puppy-training/` once the branch exists? | Yes. Cost is nil; the bundle is about 200 KB. | go or wait |
| 5 | Retention 14 daily plus 6 monthly (house default) or 30 days flat? | House default. | house or 30 |

Settled already: `vapid.json` is in the daily local backup; a missing one
no longer mints new keys (`fix/store-safety`, waiting to merge).

## Privacy

| # | Question | Recommendation | Say |
| --- | --- | --- | --- |
| 6 | Approve the 120-word in-app note in `docs/PRIVACY.md` for the first-run screen and Settings, and a Privacy line in the README? | Yes as written, or send back one edit. | yes or edit |
| 7 | Settled 22 October: kids' phones no longer receive phone numbers, live. | | |
| 8 | Success log lines no longer carry the address (live 22 October). Log rotation is built on `ops/logrotate` (24 October): weekly, four copies, every copy owner-only. Install and enable the timer (item 23)? | Rotate; the logs are small but grow forever. | rotate or leave |
| 9 | Settled 22 October: "remove this person and their history" is built and live (grown-up only, void not delete, 15-minute undo). | | |
| 10 | Send the My Fur Baby owner one line that the demo is on your server, visible to you, wiped on request? | Yes, next time you talk. See also item 19: they could have their own household instead. | yes or no |

## Health card

| # | Question | Recommendation | Say |
| --- | --- | --- | --- |
| 11 | Vaccine wording on the health card and the timeline is softened (both live since 22 October). Happy with it? | Yes. | yes or edit |
| 12 | Add a "course complete" tick so families at clinics that finish at 12 weeks stop seeing the 16-week line, and count the booster from the last logged dose? | Build; it is small and the nag is wrong for those families. | build or leave |
| 13 | Flea reminder: leave flea treatments as a log entry, or add "next flea due" 30 days after the last one with a product note? | Leave as a log; product intervals vary from monthly to three-monthly and a wrong nag is worse than none. | leave or add |
| 14 | Where does the health card live: bottom of Skills (now), or its own spot on Pack or Settings? | Move to Pack under the puppy meter; it is about the puppy, not the training. | skills, pack or settings |
| 15 | Leptospirosis for the puppy. | Not an app decision: ask the vet at the 12-week visit. Totally Vets now says urban dogs are at equal risk. | ask vet |

## Branches from round 7 (20 October), all live since 22 October

Merged to main with the guided course rebuild on 22 October and promoted
to stable and the demo (pt-v19, 56 tests). Kept here for the record.

| Branch | What | Tests |
| --- | --- | --- |
| `fix/store-safety` | Unreadable store or key file copied aside, chart written mode 600, push paused instead of new keys over live subscriptions | 42 |
| `sec/client-ip` | Visitor address from CF-Connecting-IP, not a header the phone can write; lockout cannot be dodged | 41 |
| `priv/followups` | Items 7 and 8 above, plus backup copies mode 600 | 41 |
| `fix/review-nits` | Health gate matches settings, teaching needs an open skill, five open claims per teacher | 41 |
| `feat/export-gaps` | JSON export carries social, health, teach; CSV has teaching rows | 39 |
| `content/timeline-vaccines` | Item 11, timeline half | 39 |
| `docs/needs-tim`, `docs/architecture-2026-10-20`, `docs/review-2026-10-18`, `docs/design-remove-person` | This page, the architecture refresh, the Tips content review, the remove-person design | docs |

| # | Question | Recommendation | Say |
| --- | --- | --- | --- |
| 16 | Settled 22 October: merged in the rehearsed order and promoted with the course rebuild. | | |

## Added 22 October: hosting other families

Tim asked on 22 October how another family registers and whether that
means a proper login. The design is in `docs/design/HOUSEHOLDS.md`: an
email magic link for the grown-up who starts a family, the family PIN
unchanged as the kids' door, a join link or QR to put a phone in the right
family, one folder per household on the server, and an owner page for Tim.
Five branches, about three and a half days.

| # | Question | Recommendation | Say |
| --- | --- | --- | --- |
| 17 | Settled 22 October: you asked for everything on dev, so all five steps were built that day and run on puppy.appspurt.dev. | | |
| 18 | Sender address for the magic-link emails, and authenticate `appspurt.com` in SendGrid first? | A `puppy@appspurt.com` sender and yes, authenticate first, or the links land in spam. | address, and yes or later |
| 19 | Does the hosted service stay on `puppy.appspurt.com` or get its own domain before families sign up? Join links and emails carry the hostname. | Decide before step 3; staying on appspurt.com is fine for the litter families. | stay or domain |
| 20 | Remove the `AIVA_SMS_*` lines from the demo slot's env, so a demo family cannot text from your SIM? One edit and a restart of the demo unit. | Yes, before the demo PIN goes to anyone else. | yes or no |

## Added 24 October: the branches that wait on you

Six branches sit on top of main, each cut from the last, all tests green
(84), nothing merged or deployed. Merging them is one fast-forward chain.

| # | Question | Recommendation | Say |
| --- | --- | --- | --- |
| 21 | Merge, in this order: `sec/households-review`, `ui/households-client`, `feat/join-qr`, `feat/lockouts-persist`, `ops/logrotate`, `docs/households-note`, then push main (it is also four commits ahead from 22 October)? | Yes, all six; each fast-forwards onto the last. | yes or pick |
| 22 | Add `APP_URL=https://puppy.appspurt.dev` to the dev `.env` and restart `puppy-training.service`, so emailed links and QR codes carry the right host whatever header a request arrives with? | Yes; one line and a restart. | yes or no |
| 23 | Install the log rotation timer with the four commands in the header of `deploy/logrotate.conf` (copies the config, chmod 600 on the current logs, enables a Monday 04:10 timer)? The logs are world-readable and carry addresses until then. | Yes. | yes or no |
| 24 | A browser pass of the new screens (welcome, sign-up, sign-in, check your email, paused family, owner page) and a real phone camera on the QR code in Settings under Your family. No browser is allowed on the server, so none of this has been seen rendered. | Ten minutes on your phone against dev before anything is promoted. | done or notes |

## Already settled, for the record

- Open source under AGPL-3.0, commercial licensing for branded trainer versions, sponsors get a logo and a thank-you and never the data (16 October).
- Everyone trains everything, skills open by readiness, rewards for kids too (16 October decisions in the Hivemind).
- Stable on puppy.appspurt.com, demo for the My Fur Baby owner, dev on puppy.appspurt.dev (16 October).
- Help! tab renamed Tips with the other-pets section (18 October, live).
- Phase 2 multi-family: Tim asked on 22 October; design in
  `docs/design/HOUSEHOLDS.md`, built the same day and on dev since; items
  18 to 24 above are what is left.
- Guided course for everyone, no per-person tracks (22 October, live).
