# Merge-readiness review: three feature branches

Date: 17 October 2026. Reviewed by the burn-round agent on clawdia, from a
separate worktree on `docs/merge-review-2026-10-17`. Nothing was merged, nothing
was promoted, nothing was deployed.

## Verdict

All three branches are ready to merge. Each is one commit on main `65de1ee`,
each has its own tests, and the whole set merges with conflicts that are all of
one kind: both sides added code at the same spot, so the fix is to keep both.
The family's live `store.json` loads through the merged code without change,
and every person's points come out identical to what main computes today.

Recommended order: `feat/health-tracker`, then `feat/buddy-and-teaching`, then
`feat/export-certificate`. Reasons below.

| Branch | Commit | Files | Tests | New server routes | New store keys |
| --- | --- | --- | --- | --- | --- |
| feat/health-tracker | 7088854 | 8 | 34 | POST, DELETE /api/healthlog | `health[]` |
| feat/export-certificate | ac0f34f | 5 | 33 | none (client only) | none |
| feat/buddy-and-teaching | fd5f7c5 | 9 | 35 | POST, PUT, DELETE /api/teach | `teach[]`, `family[].buddy` |
| merged (dry run) | | 9 | 36 | | |

Main has 33 tests. The merged tree has 36.

## Merge order and why

Health and buddy both touch `server/server.js`, `test/endpoints.test.js` and
the store and state code in `public/app.js`. Those conflicts exist whichever
order you pick. Export only conflicts on `public/styles.css` and `README.md`,
and its CSV code already reads `S.health`, so it is the natural last step.

Order A (recommended), verified by a dry run in a throwaway worktree branch:

1. `git merge origin/feat/health-tracker`: fast-forward, no conflicts.
2. `git merge origin/feat/buddy-and-teaching`: 5 files conflict, 10 hunks.
3. `git merge origin/feat/export-certificate`: 2 files conflict, 2 hunks.

Order B (health, export, buddy) gives the same conflicts in a different
sequence: step 2 conflicts on README and styles, step 3 on the five files
above. There is no order with fewer conflicts; `index.html` and `sw.js` are
identical on all three branches and merge silently.

## Expected conflicts and how to resolve each one

Every hunk is "both added". The dry run resolved them as follows and the
result passed `node --check` on every changed JavaScript file.

### Step 2: health + buddy

`public/app.js`, 4 hunks.

- The `const S = {...}` state line: keep one line ending `health: [], teach: [] };`.
- `LocalStore.load` and `save`: one `load` line that reads both `pt.health`
  and `pt.teach`, one `save` line that writes both, then keep all five
  methods (`addHealth`, `voidHealth`, `addTeach`, `confirmTeach`, `voidTeach`).
- `ServerStore.apply`: one line ending `S.health = j.health || []; S.teach = j.teach || [];`.
- `ServerStore` methods after `makeShare()`: keep both sets, any order.

`server/server.js`, 3 hunks.

- The `let db = {...}` default: one line ending `health: [], teach: [] };`.
- `stateOut`: keep health's version of the first line (it already has
  `health:`) and add buddy's `teach:` line under it.
- Routes after the SMS test block: keep both. Watch the closing brace: the
  health DELETE handler's final `}` sits outside the conflict markers, so
  after keeping both sides put a `}` between the health DELETE body and the
  `// "I taught X this"` comment, or the file will not parse.

`test/endpoints.test.js`, 1 hunk. Keep both. Same brace trap: the health
test's `} finally { app.stop(); }` and `});` live below the markers, so add
them after the health test body before the teaching test begins.

`public/styles.css`, 1 hunk. Keep both blocks.

`README.md`, 1 hunk. Keep the three feature paragraphs (Cue sheet, Health,
Buddies), one `## Roadmap` heading, and drop the three roadmap bullets each
branch removed. The roadmap list should end up as CSV export and
multi-family only.

### Step 3: + export

`public/styles.css`, 1 hunk. Keep both (health and teaching rules, then the
certificate block).

`README.md`, 1 hunk. Remove the CSV roadmap bullet. The roadmap is then one
line: multi-family hosting.

### After the merge

- `public/sw.js` is `pt-v15` and all five `?v=` stamps in `index.html` are
  15, from any one branch. Stable currently serves `pt-v14`, so the merged
  tree is already one version ahead and `scripts/bump.mjs` is not required
  for this promote. If anything else lands on main first, run it once.
- Nothing in `deploy/` or `ops/` changes. No new environment variables.

## Live store compatibility

Checked against a copy of the stable slot's `store.json` (968 bytes, 6
family members, keys: logs, mastery, push, rev, sent, settings, social,
ticks, toilet). It has no `health`, no `teach`, and no `buddy` on any member.

- The merged server loads with `Object.assign(defaults, file)`, so `health`
  and `teach` arrive as empty arrays. `stateOut` sends `health: []` and
  `teach: []`.
- The merged `rewards.js` computes over the live state: every person gets
  `buddy: null`, `taught: 0`, and the same points as main (18, 0, 0, 0, 0, 0).
- The client's `ServerStore.apply` defaults both fields to `[]`.
- Rollback path: an older server reading a store the new one wrote keeps the
  unknown `health` and `teach` keys through `Object.assign` and writes them
  back untouched. Nothing is lost by promoting and then reverting.
- `family[].buddy` is only validated on PUT /api/settings; members without
  it are fine, and an invalid or self-referencing buddy is cleared to "".

No migration, no data change on first boot.

## Review notes, none blocking

Health tracker

- Server gates both health routes on `isAdult` alone, like `/api/share`.
  The client shows the form to anyone when the family has no grown-up
  (`isAdult(m) || !family().some(isAdult)`). In an all-kids family the form
  would show and the server would answer 403. Tim's family has
  grown-ups, so this is a consistency nit for later. Settings and photo use
  `hasAdult && !isAdult`; health could do the same.
- Due-next picks the first vaccine week at or after the puppy's age that is
  not logged within two weeks. At 9 weeks with nothing logged it says the
  12-week shot is next and does not nag about the 8-week one. Fine for a
  puppy who came home vaccinated; worth a line in the note if families
  start late.
- The log keeps the last 500 entries including voided ones. Not a problem
  at family scale.
- `renderHealth` is appended at the bottom of the Skills tab, after the
  timeline. It will be a long scroll past the skill cards; a Pack or
  Settings home might suit it better, but that is a design call for Tim.

Buddy and teaching

- The server does not check that the skill is open before accepting a
  teach claim; the client only shows the control on open skills. Harmless,
  the learner still has to confirm.
- Points: a teacher scores once per day of confirmations, badges count
  distinct skills taught. That is what the tests assert, so it is intended,
  but the README says "taught five skills" and the code means five distinct
  skills, which matches.
- The buddy select in the family editor is built from the family list at
  render time. After "+ Add a person" the new person appears in other
  people's buddy lists only after Save. Check on the phone when it is live.

Export and certificate

- `exportJson()` still exports settings, ticks, logs, mastery and toilet
  only. It has never included `social`, and now also skips `health` and
  `teach`. The CSV covers health. Suggest a small follow-up: add the three
  keys to `exportJson` and a `teaching` row type to `exportCsv`.
- The certificate reads `sc.puppy.sessions`, `mastered`, `total` and
  `sc.calmDays`, all present in `rewards.js`. Icons used by all three
  branches (shield, leaf, target, pack, grad, crown, paw) exist in the
  sprite.
- Print CSS hides header, main, nav and toast and sets A4 landscape. The
  overlay is `position:fixed` on screen, static in print.

## What to run before promoting

This box is short on memory, so the test suite and browser checks were not
run here. On bigmac, after the three merges:

```
npm test                                   # expect 36 passing
node --check public/app.js server/server.js
python3 scripts/smoke-static.py            # static shell check
```

Then a quick phone pass as a grown-up: Skills tab bottom shows the health
card, Settings shows Export CSV and the buddy selects, Pack shows the
certificate button, and a skill card shows "I taught this to…".

## What needs Tim

- Say the word to merge in the order above and run `~/bin/update-puppy promote`.
- Decide whether the health card stays on Skills or moves.
- Optional follow-up branch for the export gaps noted above.
