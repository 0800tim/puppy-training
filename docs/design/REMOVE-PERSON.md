# Design note: "Remove this person and their history"

Follow-up 4 in `docs/PRIVACY.md`. Written 20 October 2026 from
`server/server.js`, `public/rewards.js`, `public/app.js` and
`docs/ARCHITECTURE.md` at commit 9bf5d5a. Design only; no code.

## The problem

Removing a person in Settings today deletes them from `settings.family` and
nothing else. Their name is gone but every entry they made keeps their
random id, so the history is orphaned, not erased. For Tim's own family that
is fine. For a hosted family (the demo slot, a sponsor's trainer version,
Phase 2) the Privacy Act's retention and correction principles want a real
"forget this person", and a family wants it when a child's friend who was
"on the chart for a week" leaves.

## Where a person id lives

The id is a short alphanumeric string (up to 24 characters) chosen by the
client when the person is added. It appears in:

| Place | Field | What it means | Who else is affected |
| --- | --- | --- | --- |
| `settings.family[]` | `id` | The person | |
| `settings.family[]` | `buddy` on *other* members | They chose this person as buddy | The buddy's streak |
| `ticks` | key `<date>_<pid>_<slot>` | A session on this person's chart row | |
| `ticks` | `by` | Who logged it (may differ: "logged for you") | The row owner keeps the session |
| `logs[date]` | `by` | Who rated the bite meter | The rating stays useful for the puppy |
| `mastery[skill].done[]` | `by` | A confirmation vote | The skill's mastered state |
| `mastery[skill].done[]` | `witness` | Witnessed someone else's vote | The voter keeps the vote; the witness points were this person's |
| `toilet[]` | `by` | Who logged the trip | Puppy toilet points |
| `social[item][]` | `by` | Who ticked the item | Puppy "happy firsts" |
| `health[]` | `by` | Who logged the vet entry | Nothing in scoring |
| `teach[]` | `teacher` | They claimed to teach | The learner's learn points |
| `teach[]` | `learner` | They were taught | The teacher's teach points and sensei badges |
| `push[]` | `pid` | A phone subscribed as this person | That phone's reminders |
| `sent.by` | keyed by subscription id, not person | Today's nudge bookkeeping | Resets tomorrow |
| Client `localStorage` | `pt.me` | A phone remembering it is this person | That phone |
| Cookie `pt_me` | signed id | Same, server-side | That phone |
| Exports | names and ids in JSON; names in CSV and on the certificate | Files already downloaded | Out of reach |
| Server log | `me <id>` lines | Identity picks | Out of scope here; see PRIVACY.md |
| Backups | all of the above, 30 days local | | Ages out |

Nothing else: the visitor card, the puppy's photo and the challenges do not
carry person ids.

## What the engine does with an id that is no longer in the family

`rewards.compute` builds `people` from `settings.family`, so a removed person
simply has no score. Their entries still feed the shared numbers:

- **Mastery** counts distinct `by` ids among unvoided votes against
  `need = min(3, family.length)`. A removed voter still counts towards
  `mastered`, and `need` may drop because the family shrank. A skill can
  therefore stay mastered on the strength of a vote by someone no longer in
  the house, or become mastered simply because the family got smaller.
- **Witness points** go to whoever is named as `witness` on an unvoided
  vote. A remaining person keeps the points for witnessing the removed
  person's votes.
- **Pack streak** asks whether everyone *in the current family* trained
  each day, so removing someone recomputes history: past days when only the
  removed person missed become pack days, and the pack streak and the
  `pack7` badge can appear out of nowhere.
- **Puppy points** count every session, toilet success and social first by
  anyone, so they keep the removed person's contribution.
- **Teaching**: a confirmed lesson where the removed person was the learner
  still pays the teacher; where they were the teacher it pays nobody (they
  have no score) but the learner keeps the learn points.
- **Buddy**: `find(x => x.id === p.buddy)` fails for a missing id, so the
  other person's buddy becomes null silently. Their buddy streak and the
  `buddy7` badge (if earned from the best run) stay in history only if the
  badge logic reads `best`, which it does, from a now-empty pairing: the
  badge disappears.
- **Ticks** for the removed person's row are never read (the engine walks
  the family). Ticks they logged for others stay.

## Two ways to forget someone

### A. Void their entries (recommended)

Mark everything they authored with `void: true`, the convention every other
undo already uses, and delete what has no void semantics:

- Remove them from `settings.family`; clear any `buddy` that pointed at them.
- Ticks on their row: set `void: true` (the engine, the notifier and the
  CSV already skip void ticks). Ticks they logged for others: keep, with
  `by` left as the orphan id (the row owner's session is the row owner's).
- Bite ratings they made: keep (the rating is about the puppy), `by`
  orphaned.
- Mastery votes they cast: void. Votes they witnessed: keep, and replace
  `witness` with `""` so nobody is paid for a witness who is gone. Note that
  a kept vote with no witness is still a vote; the "needs a witness" rule
  applies at confirmation time, not in the engine.
- Toilet, social and health entries they logged: void (toilet and social
  feed puppy points, so the puppy loses a little; that is the honest
  result).
- Teaching claims where they are teacher or learner: void.
- Push subscriptions with their `pid`: delete outright (there is no void on
  push rows, and a subscription for a non-person is a dead letter).
- Their phone: the next `GET /api/state` returns `me: null` because
  `member()` no longer finds them; the client already handles that by
  clearing `pt.me` and showing "Whose phone is this?".

Effects: points, badges and streaks of the remaining people change only
where they depended on this person (witness points, pack days, buddy
streak, mastery counts). The chart stays reversible: an undo is "unvoid
everything stamped with this removal and put the person back".

### B. Delete their entries

Delete the keys and rows instead of voiding. Same effects on the others,
but no undo, and the daily backup is the only way back. Less code, but it
breaks the "void, don't delete" convention that `docs/ARCHITECTURE.md` and
the undo rules lean on, and it makes the 15-minute undo impossible.

### C. Leave the history, remove the name (today)

Nothing to build. The name is gone; the id, the sessions, the toilet log
and the vet notes they typed stay. Not a "forget".

**Recommendation: A.** Void with a removal stamp, grown-up only, 15-minute
undo, then purge.

## The removal stamp and the undo window

`DELETE /api/family/<pid>` (grown-up once one exists; cannot remove yourself,
cannot remove the last grown-up while kids remain):

1. Build the list of everything to change, apply it, and stamp each voided
   entry with `removed: <ts>` next to `void: true` (a kept witness cleared
   is stamped on the vote too).
2. Stash `{ at, person, buddies: [ids that pointed at them], pushRows }` in
   `db.removals[]` so the person record and their subscriptions can come
   back.
3. `persist()`. The response is the normal state; the client shows a toast
   "Removed <name>. Undo" for the window.

`POST /api/family/<pid>/restore` within `UNDO_MS` (15 minutes, the house
window): put the person back, restore `buddy` pointers and push rows, strip
`void` and `removed` from every entry stamped with that removal, drop the
stash. After the window, the next `persist()` purges the stash and, for a
true forget, rewrites every stamped entry to drop the orphan id as well
(`by: ""`, `witness: ""`, `teacher: ""`, `learner: ""`) while keeping the
`void` flag. Voided rows then say only that something was undone, not by
whom.

Why keep the void rows at all after the purge: toilet rows feed the
"accident patterns" and health rows are the puppy's record. Keeping them
voided is simpler than teaching every consumer to tolerate holes, and they
carry no name once the id is stripped. Backups age the id out in 30 days.

## Gate and safety

- Grown-up once one exists (`hasAdult && !isAdult` 403), same as settings.
- A grown-up cannot remove themselves (lock-out protection) and cannot
  remove the last grown-up while any kid remains.
- Two taps on the phone: "Remove Ava and everything she logged?" with the
  counts (sessions, votes, trips, lessons), then Undo for 15 minutes.
- Log line: `removed <id> by <grown-up id>`; no name.

## Exports and the certificate

Already-downloaded files are outside the app. From the removal on, JSON
exports carry the voided rows (with `void: true`, id stripped after the
window) and CSV skips them. The certificate names only current family
members. `docs/PRIVACY.md` should say that a removal does not reach into
files the family already saved.

## Tests to write with it

- Removal voids each entry type and deletes push rows; the state response
  no longer lists the person; `me` becomes null for that phone.
- Scores: a witness loses the witness points; the pack streak is recomputed
  from the smaller family; a skill confirmed by the removed person loses
  that vote.
- Gates: kid 403, self 400, last grown-up 400.
- Undo within 15 minutes restores everything exactly (deep-equal of the
  store before and after); undo after the window is 404.
- After the window a persist strips the ids from stamped rows.
- `rewards.compute` on a store with void ticks and cleared witnesses runs
  without error (it already skips void; add the cleared-witness case).

## Size

Server: one route pair and a purge step in `persist()`, about 60 lines.
Client: a button in the family editor, a toast with Undo, about 25 lines.
Rewards engine: no change needed; one test. Half a day with tests.
