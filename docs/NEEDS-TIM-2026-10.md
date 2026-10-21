# Decisions for Tim, October 2026

One page, one line per open question, a recommendation and the one-word
answer you can give. Written 20 October 2026 from
`docs/OFFSITE-BACKUP-PLAN.md`, `docs/PRIVACY.md`,
`docs/HEALTH-TIMINGS-REVIEW.md`, `docs/MERGE-REVIEW-2026-10-17.md` and the
Hivemind log. Everything from rounds 4 to 6 is on main and live. Round 7
(20 October) added seven branches that wait on you; they are listed last.

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
| 7 | Kids' phones no longer receive phone numbers (`priv/followups`). Merge it? | Yes. | yes or no |
| 8 | Success log lines no longer carry the address; failures keep it (same branch). Log rotation is still open: add a weekly rotate timer, or leave the logs as they are? | Rotate; the logs are small but grow forever. | rotate or leave |
| 9 | Build "remove this person and their history" as designed in `docs/design/REMOVE-PERSON.md` (grown-up only, void not delete, 15-minute undo)? | Build before any other family is hosted; not urgent for yours. | build or later |
| 10 | Send the My Fur Baby owner one line that the demo is on your server, visible to you, wiped on request? | Yes, next time you talk. | yes or no |

Item 9 is built on `feat/remove-person` (21 October, four tests, on `rehearsal/2026-10-21-plus`): "build" is a merge, "later" leaves the branch where it is.

## Health card

| # | Question | Recommendation | Say |
| --- | --- | --- | --- |
| 11 | Vaccine wording on the health card and the timeline is softened (health card live; timeline on `content/timeline-vaccines`). Happy with it? | Yes. | yes or edit |
| 12 | Add a "course complete" tick so families at clinics that finish at 12 weeks stop seeing the 16-week line, and count the booster from the last logged dose? | Build; it is small and the nag is wrong for those families. | build or leave |
| 13 | Flea reminder: leave flea treatments as a log entry, or add "next flea due" 30 days after the last one with a product note? | Leave as a log; product intervals vary from monthly to three-monthly and a wrong nag is worse than none. | leave or add |
| 14 | Where does the health card live: bottom of Skills (now), or its own spot on Pack or Settings? | Move to Pack under the puppy meter; it is about the puppy, not the training. | skills, pack or settings |
| 15 | Leptospirosis for the puppy. | Not an app decision: ask the vet at the 12-week visit. Totally Vets now says urban dogs are at equal risk. | ask vet |

## Branches from round 7 waiting to merge (20 October)

All cut from main 9bf5d5a, all tests green in their worktrees, none deployed.
The four code branches each bump to pt-v18; identical bumps merge silently.

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
| 16 | Merge all of the above and promote, as on the 18th? Order: store-safety, client-ip, priv, nits, export-gaps, timeline, then the docs. | Yes; one bump after merging if anything else lands first. | merge or hold |

Rehearsed 21 October on branch `rehearsal/2026-10-21`: the ten branches merged in that order, the two test-file conflicts resolved (both appended tests, both sides kept), stamps at pt-v18, 48 tests green. If nothing else has landed on main, `git merge --ff-only origin/rehearsal/2026-10-21` on main is the whole merge; then `update-puppy promote`.

## Already settled, for the record

- Open source under AGPL-3.0, commercial licensing for branded trainer versions, sponsors get a logo and a thank-you and never the data (16 October).
- Everyone trains everything, skills open by readiness, rewards for kids too (16 October decisions in the Hivemind).
- Stable on puppy.appspurt.com, demo for the My Fur Baby owner, dev on puppy.appspurt.dev (16 October).
- Help! tab renamed Tips with the other-pets section (18 October, live).
- Phase 2 multi-family: only when Tim asks.
