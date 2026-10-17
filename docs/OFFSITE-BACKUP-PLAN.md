# Offsite backup plan for Puppy School HQ

Status: plan only, 17 October 2026. Nothing in this document has been built.
No key was created, no unit or timer was changed, nothing was uploaded.
`docs/RESTORE.md` describes the local backup that exists today and says, under
"Backups are not offsite", that this plan was still to be written.

## Why

The daily backup in `ops/backup-puppy.sh` writes to `/srv/backups/puppy-training`
on the same disk as the live data. The server lost a drive on 5 October 2026
(hivemind `server/incident-2026-10-05-hardware-failure.md`). If that happens
again the chart, the photo, the cookie secret and the push keys go with it,
and the family starts from zero. The data is tiny, the house already has a
pattern for this, and the cost is nothing, so the only real work is the key
decision and one careful first run.

## What to protect

Per slot, the four files the local backup already copies, plus `.env`:

| File | Size today | Why it matters | Secret? |
| --- | --- | --- | --- |
| `data/store.json` | about 1 KB | The whole chart. Grows slowly: ticks are a few hundred bytes a day. | Family names, kids' phone numbers, push endpoints, health notes |
| `data/photo.jpg` | 46 KB | The puppy's photo | No |
| `data/secret.key` | 64 bytes | Signs the session and identity cookies. Lose it and every phone re-enters the PIN. | Yes |
| `data/vapid.json` | 162 bytes | Web Push key pair. Lose it and every phone's reminders die. | Yes (private key) |
| `.env` | under 1 KB | PIN, grown-up PIN, session secret if set, Aiva-SMS gateway key, push subject | Yes |

Slots: `prod` (`/srv/projects/internal/puppy-training-prod`, the family),
`demo` (`/srv/projects/internal/puppy-training-demo`, no `store.json` yet
because nobody has set the demo up) and `dev` (`/srv/projects/internal/puppy-training`,
the working tree). A whole run for all three slots is well under 200 KB.

`.env` is not in the local backup today, by design: it holds the PIN. In an
age-encrypted bundle it is as safe as the keys next to it, and without it a
restore to a new machine means rebuilding the PIN and the SMS settings from
memory. The coffeebea bundle includes its `.env` for the same reason.
Recommendation: include it. Decision for Tim, see the end.

## The house pattern, as built for coffeebea.nz and My Shout

Read from `/srv/projects/internal/coffeebea.nz/repo/ops/{backup.sh,lib-r2.sh,restore.sh,restore-drill.sh}`
and `/srv/projects/internal/myshout/ops/lib-backup.sh`.

1. Build the bundle in a `mktemp -d` work directory: a plain tar of the
   files plus a one-line `README.txt` saying what it is and how to restore.
2. Encrypt the tar with `age -r <public key>` before anything leaves the box.
   The box holds only public keys, so it can write backups it cannot read.
3. Upload with rclone to the R2 bucket `clawdia-backups` on the NetPotential
   account, under a project prefix and a dated folder:
   `R2:clawdia-backups/<project>/<YYYY-MM-DD>/<project>-<stamp>.tar.age`.
4. No `rclone.conf` entry and no stored S3 keys. The S3 credentials are
   derived at run time from the Cloudflare API token in
   `~/.config/growthspurt/cloudflare.env`: access key is the token id from
   `/user/tokens/verify`, secret is the SHA-256 of the token. Exported as
   `RCLONE_CONFIG_R2_*` variables, nothing written to disk. That is the
   `setup_rclone` function in `lib-r2.sh`.
5. Verify the upload with `rclone lsf` on the dated folder.
6. Prune offsite with `retention_keep 14 6`: the newest 14 daily folders plus
   the newest folder from each of the latest 6 months. Prune by listing the
   remote, never from local state, so a fresh box prunes correctly.
7. Keep the last few bundles locally as well, for quick restores.
8. systemd user timer, 03:xx NZ, `Persistent=true`, a randomised delay,
   `Type=oneshot` service, output appended to `~/logs/<project>/backup.log`.

The one place coffeebea departs from the house runbook: its age private key
sits on clawdia at `~/.config/growthspurt/coffeebea-backup.age-key` so that
`restore.sh` can run on the box. The runbook `decrypt-age-backups.md` says
the private key must never be on clawdia, because a box that can decrypt its
own offsite backups gives an intruder the backups too. This plan follows the
runbook.

## Key custody

Three options, in order of preference.

**A. Use house key A, already in service.** Public key
`age1utkfuee6yjylasfttd84uf3rsma5qkyu0q37q5u2sf3yzwgqdsuszdv3r7`, kept in
`/etc/clawdia/backup-recipients.txt`, which already encrypts the Postgres
instance backup and the config backup. Its private key is in Tim's 1Password
and was tested on 7 October 2026 (search 1Password for `AGE-SECRET-KEY`, not
the item name). Nothing new to generate, nothing new to store, one key opens
the server's backups and the puppy's. Recommended.

**B. Key A plus key B as a second recipient.** `age` takes several `-r`
flags and either private key then opens the bundle. Key B
(`age1elxlx5aezv9c823pj9cxfmpz5s0xrpk6z7e2mnxmeqx8u963nujs9gmwez`) is the
fm-video and My Shout key, also in 1Password and also tested. Costs nothing
and survives losing one 1Password item. Worth doing if Tim is happy for both
keys to open puppy data.

**C. A new puppy-only key.** Generated on Tim's laptop with `age-keygen`,
private half into 1Password, public half committed as
`ops/backup.age-recipients`. More to look after, and the only gain is that a
leaked server key does not expose puppy backups, which is not a realistic
threat at this scale. Not recommended.

Whatever the choice, the recipients file is public keys only and is safe in
git. The private key never touches clawdia, so `restore.sh` for this project
is a two-step: decrypt on the laptop, then copy plain files to the slot.

## What the bundle looks like

```
puppy-training-2026-10-18T0345.tar.age        (age, one or two recipients)
  README.txt                                   what, when, how to restore
  prod/store.json  prod/photo.jpg  prod/secret.key  prod/vapid.json  prod/env
  demo/secret.key  demo/vapid.json  demo/env    (store.json and photo once they exist)
  dev/store.json   dev/secret.key   dev/vapid.json  dev/env
```

Offsite path: `R2:clawdia-backups/puppy-training/2026-10-18/puppy-training-2026-10-18T0345.tar.age`.
The file name says the project and the time and nothing else. Inside, each
slot's files keep their names so `docs/RESTORE.md` steps apply unchanged
after decryption.

## Proposed changes to the code, when approved

All in `ops/`, on a branch, tested by hand before the timer picks them up.

1. **`ops/lib-r2.sh`**: copy coffeebea's, rename the variables
   (`PUPPY_OFFSITE_BUCKET`, `PUPPY_OFFSITE_PREFIX=puppy-training`,
   `PUPPY_AGE_RECIPIENTS`), keep `setup_rclone` and `retention_keep` as they
   are. `load_recipients` reads every non-comment line of
   `ops/backup.age-recipients` and builds the `-r` flags.
2. **`ops/backup.age-recipients`**: the chosen public key or keys, one per
   line, with the same header comment as `/etc/clawdia/backup-recipients.txt`.
3. **`ops/backup-puppy.sh`**: keep the local stage exactly as it is (it is
   what `docs/RESTORE.md` documents), then add an offsite stage:

   ```bash
   # ---- offsite: one encrypted bundle for all slots ----
   . "$(dirname "$0")/lib-r2.sh"
   load_recipients; setup_rclone
   STAMP="$(TZ=Pacific/Auckland date +%Y-%m-%dT%H%M)"; DAY="${STAMP%%T*}"
   WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
   for slot in prod demo dev; do
     SRC=...same case statement as above...; SLOTDIR="$(dirname "$SRC")"
     [ -d "$SRC" ] || continue
     mkdir -p "$WORK/$slot"
     for f in store.json photo.jpg secret.key vapid.json; do [ -f "$SRC/$f" ] && cp -p "$SRC/$f" "$WORK/$slot/"; done
     [ -f "$SLOTDIR/.env" ] && cp -p "$SLOTDIR/.env" "$WORK/$slot/env"
   done
   printf 'puppy-training backup %s\nrestore: docs/RESTORE.md, section "Restore from offsite"\n' "$STAMP" > "$WORK/README.txt"
   NAME="puppy-training-$STAMP.tar.age"
   tar -C "$WORK" -cf - README.txt prod demo dev 2>/dev/null | age $AGE_R_FLAGS -o "$WORK/$NAME"
   [ "$(stat -c%s "$WORK/$NAME")" -gt 200 ] || die "bundle suspiciously small"
   cp "$WORK/$NAME" "$DEST/"; chmod 600 "$DEST/$NAME"; ls -1t "$DEST"/*.tar.age | tail -n +8 | xargs -r rm -f   # keep 7 local
   rclone copyto "$WORK/$NAME" "R2:$BUCKET/$PREFIX/$DAY/$NAME" --s3-no-check-bucket --retries 3
   rclone lsf "R2:$BUCKET/$PREFIX/$DAY/" | grep -qx "$NAME" || die "upload verification failed"
   all="$(rclone lsf --dirs-only "R2:$BUCKET/$PREFIX/" | sed 's#/$##')"
   keep="$(printf '%s\n' "$all" | retention_keep 14 6)"
   for d in $all; do printf '%s\n' "$keep" | grep -qx "$d" || rclone purge "R2:$BUCKET/$PREFIX/$d/"; done
   echo "$(date -Is) offsite $PREFIX/$DAY/$NAME ok"
   ```

   The local stage runs first and is never skipped: if R2 or the Cloudflare
   API is down the script still exits non-zero after the local copy is
   safe, so `systemctl --user --failed` shows it and the log says why.
4. **`ops/backup-puppy.sh`, small fixes seen while reviewing**: `chmod 600`
   the local `store-*.json` copies (they are 664 today and hold names and
   phone numbers), and remove the stray `secret.key` left in
   `/srv/backups/puppy-training` by an earlier version of the script.
5. **`docs/RESTORE.md`**: a new section "Restore from offsite" (below), and
   change the "not offsite" paragraph to say where the bundles are.
6. **No new unit.** The existing `puppy-training-backup.timer` (03:40 NZ)
   keeps running the same script. One change to the unit is worth making at
   the same time, and it needs Tim: `ExecStart` points at the dev working
   tree's copy of the script, which changes under the timer whenever a
   branch is checked out here. Point it at the prod checkout
   (`/srv/projects/internal/puppy-training-prod/ops/backup-puppy.sh`) so the
   timer runs what is on `stable`.

## Restore from offsite (to go into docs/RESTORE.md)

On Tim's laptop, never on clawdia:

```bash
# 1. Fetch the bundle. Needs R2 access on the laptop: the same derived
#    credentials (token id and sha256 of the token) or wrangler, see the
#    hivemind runbook fm-video-secrets-backup-recovery.
rclone lsf R2:clawdia-backups/puppy-training/            # pick a day
rclone copyto R2:clawdia-backups/puppy-training/2026-10-18/puppy-training-2026-10-18T0345.tar.age ./bundle.tar.age
# 2. Decrypt with the private key from 1Password (runbook decrypt-age-backups.md).
read -rs AGEKEY && printf '%s\n' "$AGEKEY" > ~/age-key.txt && unset AGEKEY && chmod 600 ~/age-key.txt
mkdir restore && age -d -i ~/age-key.txt bundle.tar.age | tar -C restore -xf -
shred -u ~/age-key.txt
cat restore/README.txt
# 3. Check the chart before trusting it (same one-liner as RESTORE.md).
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["rev"], len(d["settings"]["family"]), "people,", len(d["ticks"]), "ticks")' restore/prod/store.json
# 4. Copy the slot's files to clawdia, then follow RESTORE.md "Restore a slot" from step 1.
scp restore/prod/{store.json,photo.jpg,secret.key,vapid.json} clawdia:/tmp/puppy-restore/
scp restore/prod/env clawdia:/tmp/puppy-restore/env      # compare with the slot's .env by hand, do not overwrite blindly
```

Then on clawdia: stop the unit by name, copy the four files into the slot's
`data/`, `chmod 600 secret.key vapid.json`, start, check `/api/health`, and
delete `/tmp/puppy-restore`. The "What happens to phones" table in
`docs/RESTORE.md` applies unchanged.

## Drill

Once a quarter, on the laptop: fetch the newest bundle, decrypt it, run the
one-liner on `prod/store.json`, confirm the family count and a recent tick
date, shred the key file. Ten minutes. Write the date in the hivemind project
log. The first drill happens the day after the first real run, before anyone
relies on it.

The coffeebea `restore-drill.sh` restores into a throwaway container on the
box; that needs the private key on clawdia, which this plan does not allow.
A box-side drill that stays within the rules is possible later: encrypt the
bundle to a second, throwaway recipient whose private key lives only in the
drill's memory, decrypt, check, discard. Not worth building for 200 KB.

## Retention and cost

Offsite: 14 daily plus 6 monthly bundles, the house default. That is 20
bundles of under 200 KB: about 4 MB at rest, growing by a few KB a day.

R2 pricing (October 2026): storage USD 0.015 per GB-month after 10 GB free,
Class A operations (writes, lists) USD 4.50 per million after 1 million free,
Class B (reads) USD 0.36 per million after 10 million free, no egress fee.
This backup makes about 6 Class A calls a day. Cost: USD 0.00 a month, inside
the free tier by four orders of magnitude, on the account that already pays
for the other projects' backups.

Local: the 30 daily `store-*.json` copies stay as they are, plus the last 7
encrypted bundles. Under 2 MB.

## Monitoring

- `systemctl --user list-timers | grep puppy` shows the next run; a failed
  run shows in `systemctl --user --failed`.
- `~/logs/puppy-training/backup.log` gets one line per stage. The offsite
  line includes the R2 path, so a glance confirms yesterday ran.
- `rclone lsf R2:clawdia-backups/puppy-training/` from the box lists the
  dated folders without decrypting anything.

## Rollout, when approved

1. Tim picks the key option and says yes to `.env` in the bundle.
2. Branch `ops/offsite-backup`: items 1 to 5 above. `bash -n` on the
   scripts, then a dry run with `PUPPY_OFFSITE_DRY=1` that builds and
   encrypts the bundle and lists what it would upload, without rclone.
3. First real run by hand from the branch checkout:
   `ops/backup-puppy.sh`, then `rclone lsf` to see the file in R2.
4. Same day, on the laptop: fetch, decrypt, check. If the bundle opens and
   the chart reads, the design is proven end to end.
5. Merge, promote to `stable`, and (Tim) repoint the timer's `ExecStart` to
   the prod checkout. The 03:40 run the next morning is the first automated
   one; check the log after it.
6. Update `docs/RESTORE.md`, the hivemind project note and
   `server/server-services.md` (the timer entry) to say the backups are
   offsite.

## Decisions for Tim

1. Key: option A (house key A), B (A plus B) or C (new puppy key)?
   Recommendation: A, or B if two-key redundancy appeals.
2. Include `.env` in the encrypted bundle? Recommendation: yes.
3. Retention 14 daily plus 6 monthly, or match the local 30 days?
   Recommendation: the house default.
4. Repoint `puppy-training-backup.service` at the prod checkout?
   Recommendation: yes, at the same time as the first automated run.
5. Approve the first upload to `clawdia-backups/puppy-training/`.

## Found while writing this, not fixed (plan only)

- `/srv/backups/puppy-training` has no `vapid-*.json` yet. The 03:42 run on
  17 October used the script from before `vapid.json` was added; the next
  run will copy them. Until then a disk loss still kills reminders.
- The local `store-*.json` copies are mode 664; the script should `chmod 600`.
- A stray `secret.key` (no slot suffix) sits in the backup folder from an
  earlier script version. Harmless duplicate of `secret-prod.key`; delete it
  when the script is next touched.
- The demo slot has no `store.json` yet, so nothing is lost there today.
