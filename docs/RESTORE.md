# Restoring Puppy School HQ from a backup

What the daily backup holds, what each file is for, and how to put a slot back. Every step below was checked against `ops/backup-puppy.sh` and `server/server.js` on 17 October 2026.

## What is backed up, and where

`ops/backup-puppy.sh` runs daily (on clawdia: `puppy-training-backup.timer`, 03:40 NZ) and writes to `/srv/backups/puppy-training/`:

| File in the backup | From | Why it matters |
|---|---|---|
| `store-<slot>-YYYY-MM-DD.json` | `data/store.json` | The whole chart: family, ticks, bite log, mastery votes, toilet and socialisation logs, push subscriptions, notifier bookkeeping. One per day, 30 kept. |
| `photo-<slot>.jpg` | `data/photo.jpg` | The puppy's photo. Overwritten each run. |
| `secret-<slot>.key` | `data/secret.key` | Signs the session and identity cookies. Copied once; it never changes. **Lose it and every phone has to enter the PIN again** (that is all: the chart is unaffected). |
| `vapid-<slot>.json` | `data/vapid.json` | The Web Push key pair. **Lose it and every phone's reminder subscription is dead**: push services reject sends signed with a different key, the server then drops the subscriptions, and each phone has to turn reminders on again. Added to the script in this change; backups before 17 October 2026 do not have it. |

Slots: `prod` (puppy.appspurt.com, `/srv/projects/internal/puppy-training-prod/data`), `demo` (puppy-demo.appspurt.com, `/srv/projects/internal/puppy-training-demo/data`), `dev` (puppy.appspurt.dev, `/srv/projects/internal/puppy-training/data`).

Not in the backup, by design: `.env` (the PIN and gateway settings; it lives only in the slot folder with mode 600) and the code (git).

**Backups are not offsite.** They sit on the same disk as the live data. An offsite copy (the house pattern is the `clawdia-backups` R2 bucket, age-encrypted, as the other projects do) is still to be set up. Until then a disk failure loses the backups too.

### With `HOUSEHOLDS=1` (branch `feat/households-store`)

A hosted slot keeps one folder per family under `data/households/<id>/`
(`store.json` and `photo.jpg`, exactly as a single family's) and the index
`data/households.json` (codes, owner emails, PIN hashes, flags). The backup
script copies the index as `households-<slot>-<date>.json` and each
family's chart as `store-<slot>-<id>-<date>.json`, photos as
`photo-<slot>-<id>.jpg`. `secret.key` and `vapid.json` stay one per server
and restore as below. To restore one family, stop the unit, put that
family's `store.json` back in its folder, start the unit. To restore the
index, put `households.json` back; the server sets an unreadable index
aside as `households.json.corrupt-<time>` and starts with no families
reachable until it is restored, the folders untouched.

## Restore a slot

Replace `prod` with the slot you are restoring. The unit names are `puppy-training-prod.service`, `puppy-training-demo.service` and `puppy-training.service` (dev).

1. Stop the unit by name, never by pattern:
   ```bash
   systemctl --user stop puppy-training-prod.service
   ```
2. Pick the day. The newest is not always the one you want (a restore after a bad edit wants the day before it):
   ```bash
   ls -la /srv/backups/puppy-training/ | grep store-prod-
   ```
3. Put the files back. The server reads `store.json` once at start, so the unit must be stopped while you copy:
   ```bash
   D=/srv/projects/internal/puppy-training-prod/data
   cp -p /srv/backups/puppy-training/store-prod-2026-10-16.json "$D/store.json"
   cp -p /srv/backups/puppy-training/photo-prod.jpg "$D/photo.jpg"        # if there was a photo
   cp -p /srv/backups/puppy-training/secret-prod.key "$D/secret.key"      # only if the original is lost
   cp -p /srv/backups/puppy-training/vapid-prod.json "$D/vapid.json"      # only if the original is lost
   chmod 600 "$D/secret.key" "$D/vapid.json"
   ```
4. Start it and check:
   ```bash
   systemctl --user start puppy-training-prod.service
   sleep 2; systemctl --user is-active puppy-training-prod.service
   curl -s https://puppy.appspurt.com/api/health
   tail -3 ~/logs/puppy-training/prod.log
   ```
5. On a phone: open the app, confirm the family and recent ticks are there. The `rev` counter in the restored `store.json` is older than the one phones last saw, so an open app may show "unchanged" until it reloads; pull to refresh once.

## What happens to phones after each kind of restore

- **`store.json` only (same secret and vapid):** nothing. Phones stay unlocked, reminders keep working. Anything ticked after the backup time is gone.
- **`secret.key` replaced:** every phone is signed out and asks for the PIN, then "pick yourself" again. Reminders keep working (subscriptions are in `store.json`, keys in `vapid.json`).
- **`vapid.json` missing, with phones subscribed:** since 20 October 2026 the server does **not** make a new key pair in that case. It starts with push paused, logs `vapid.json missing with N phone(s) subscribed: push is PAUSED`, answers 503 to "turn reminders on" and the test button, and keeps every subscription in `store.json`. Put `vapid.json` back from the backup, restart the unit by name, and reminders resume with no phone touched. Only a store with no subscriptions at all gets fresh keys.
- **`vapid.json` replaced with a different pair:** the old behaviour applies: Every existing push subscription is now signed with the wrong key; the push services reject them, the notifier removes them as they fail, and each phone has to turn reminders on again in Settings. Avoid this by restoring `vapid.json` with the store.
- **`.env` lost:** recreate it (`deploy/puppy-training.env.example` lists the variables). A different `PUPPY_PIN` signs every phone out. If `SESSION_SECRET` was set in `.env` rather than `secret.key`, it must be the same value or every phone is signed out.

## Moving a slot to another machine

Copy the slot folder's `data/` (all four files) and `.env`, clone the repo at the same commit, set up the unit and tunnel as in `deploy/`, start, and change DNS. Phones carry on; the cookies are bound to the secret and the PIN, not the host.

## If `store.json` will not parse

Since 20 October 2026 an unreadable `store.json` (half-written, disk full, hand-edited) is copied to `store.json.corrupt-<timestamp>` in the same folder, mode 600, before the server starts fresh, and the log says so. The next write replaces `store.json` but the copy stays. To recover: stop the unit, look at the copy (usually a truncated file; the daily backup in `/srv/backups/puppy-training` is the better source), put the good file back as `store.json`, start the unit. The same copy-aside happens to a `vapid.json` that will not parse. Both files are written with mode 600 and an existing `store.json` is set to 600 on start, because the chart holds names and phone numbers.

## Checking a backup without restoring

```bash
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["rev"], len(d["settings"]["family"]), "people,", len(d["ticks"]), "ticks,", len(d.get("push",[])), "phones")' /srv/backups/puppy-training/store-prod-2026-10-16.json
```

A backup that parses and shows the family is a good backup. Do this before you need it.
