# What Puppy School HQ knows, who can see it, and how to make it forget

Written from the code on 17 October 2026: `server/server.js`, `server/notify.js`,
`public/app.js`, `ops/backup-puppy.sh`, the systemd units on clawdia, and the
three feature branches (`feat/health-tracker`, `feat/buddy-and-teaching`,
`feat/export-certificate`). Companion to `docs/ARCHITECTURE.md` (the data
model) and `docs/SECURITY-REVIEW-2026-10.md` (who can change what).

This is a description for Tim and for anyone who self-hosts, not a privacy
policy. The last two sections list what Tim has to decide and propose a
plain-language note for the app, which has not been added to the UI.

## What is stored about each person

Everything lives in one file per family, `data/store.json`, in plain JSON,
plus `data/photo.jpg`. Nothing is in a database and nothing is encrypted at
rest on the box.

| Field | Where | What it reveals | Who put it there |
| --- | --- | --- | --- |
| First name (20 chars), kid or grown-up, age band (5-7, 8-9, 10-11, 12-14, 15+), weekly goal | `settings.family[]` | The household: how many children and roughly how old | A grown-up in Settings |
| Mobile number, normalised to +64, and an SMS on/off flag | `settings.family[].phone`, `.sms` | A phone number per person, children included if a grown-up enters one | A grown-up in Settings |
| Buddy (branch) | `settings.family[].buddy` | Which two people pair up | A grown-up in Settings |
| The puppy: name, sex, breed, birthday | `settings.puppy` | Little about people, but the birthday dates everything else | A grown-up |
| Every training session: date, person, slot, skill, who logged it, when | `ticks` | A per-person diary of when someone was home and active, three times a day, for as long as the chart runs | Anyone with the PIN |
| Daily bite rating and who rated | `logs` | Nothing personal beyond the rater | Anyone |
| Skill confirmations with a witness | `mastery` | Who was with whom | Anyone |
| Toilet log: time, kind, what came before, who | `toilet` (last 1000) | Household routine by the minute | Anyone |
| Socialisation ticks: item, mood, who, when | `social` | Where the family went (vet, cafe, school gate, beach) and when | Anyone |
| Health log (branch): weigh-ins, vaccines, worming, vet visits, free-text notes (80 chars), who logged | `health` (last 500) | Vet names and products in the notes; dates of vet visits | Grown-ups only |
| Teaching claims (branch): teacher, learner, skill, confirmed when | `teach` (last 500) | Which child taught which | Anyone, confirmed by the learner |
| Push subscriptions: endpoint URL, encryption keys, person, device label, prefs, unanswered count | `push` (max 40) | The endpoint identifies a browser on a phone to Google, Mozilla or Apple; the label is whatever was typed ("Mum's Pixel") | Each phone that turns reminders on |
| Notifier bookkeeping: what was sent today per subscription | `sent` | Nothing lasting; overwritten daily | The server |
| Visitor link token | `share` | A link that shows the puppy's name | A grown-up |
| The puppy's photo | `photo.jpg` | Usually a dog. Nothing stops a family uploading a child holding the dog | A grown-up |

Not stored: surnames, email addresses, street addresses, birthdays of people,
passwords (the PIN is a hash in memory, from `.env`), locations from the
phone, or anything from the phone's contacts, camera roll or sensors beyond
the one photo chosen.

The identity on every entry (`by`) is the design: accountability instead of
approval queues. It also means the chart is a fairly complete picture of each
person's days.

## Who can read it

**Anyone with the family PIN** can read everything in the table above on any
phone, including the phone numbers of every family member, children's
included. The grown-up PIN (when set) gates changing things, not reading
them. The security review lists stripping `phone` from the state sent to
kids as a follow-up; it has not been done.

**The visitor link** (`/api/visitor/<token>`) shows the puppy's name and
static training content: cue words, biting steps, house rules, the kids'
rules, the "never give" list. No family names, no chart, no photo. It needs
no PIN, so anyone who has the link has the page. Only a grown-up can make
or revoke one, a new link kills the old one, and the page is marked
noindex (meta tag; the header is added on `sec/addendum-2026-10-17`).

**The exports** are built on the phone from the state it already holds.
The CSV carries first names, skill names, health notes and timestamps; no
PIN, no phone numbers, no push endpoints. The JSON export carries
`settings` in full, so it does include the phone numbers. The printed
certificate carries first names and the puppy's name.

**Whoever runs the server** (on clawdia, Tim) can read every family's
`store.json` and photo in the clear, the logs, and the backups. There is no
encryption at rest and no admin login because there is no admin interface:
the file system is the admin interface.

**Third parties that see something**, by design of the stack:

- Cloudflare terminates TLS at its edge and tunnels the traffic to the box,
  so Cloudflare handles every request in the clear and sees every phone's IP
  address. Standard for every site on this server.
- Google Fonts: each phone fetches two font files from `fonts.googleapis.com`
  and `fonts.gstatic.com`, so Google sees the IP and user agent. The
  `Referrer-Policy: same-origin` header keeps the app's URL out of it.
- YouTube: the Skills tab loads video thumbnails from `i.ytimg.com` as soon
  as a skill card is open (lazy-loaded), so Google sees the IP and which
  video ids were looked at. Playing a video uses the `youtube-nocookie.com`
  embed, which sets no cookies until play is pressed.
- Push services (Google FCM for Android, Mozilla, Apple): the reminder text
  is encrypted on the server (RFC 8291) before it is sent, so the service
  sees that a message went to that endpoint and its size, not what it said.
- The Aiva-SMS gateway (the house SMS handset) and the mobile carrier: texts
  are plain SMS. Each one carries the person's first name, the puppy's name
  and a skill name, and the mobile number it goes to.
- Cloudflare R2, once `docs/OFFSITE-BACKUP-PLAN.md` is built: the whole
  store, encrypted with `age` on the box before upload. Cloudflare holds
  ciphertext only.

No analytics, no error reporting service, no ad or tracking script. The
Content-Security-Policy allows connections to the app's own origin only.

## What the server writes to its log

`~/logs/puppy-training/{prod,demo,app}.log`, one file per slot, appended
by systemd, never rotated. There is no access log: a request is only logged
when one of these happens:

| Line | Contains |
| --- | --- |
| `login ok`, `login failed`, `login locked` | The phone's public IP address (from Cloudflare's forwarded header) |
| `adult pin failed` | IP address |
| `me <person id> <ip>` | Who a phone picked as itself, with its IP |
| `visitor link created <person id>` | Who made a link |
| `push sent`, `push subscription gone, removed`, `push reminders paused after 6 unanswered` | Person id, nudge kind, HTTP status |
| `sms sent <person id> <kind>` | Person id. Not the number, not the text |
| `notify failed`, `error`, `store.json unreadable` | Error messages |

Person ids are random short strings, not names. The IP lines are the
sensitive part: a family's public IP over months says where they were. The
tunnel log holds cloudflared's own connection events and no client data.
The backup log holds one line per run with a file count.

## How long things are kept

| Thing | Kept |
| --- | --- |
| The chart (`store.json`) | Forever. Nothing is deleted; undone entries are marked `void` and stay in the file. Ticks that are unticked are removed outright. |
| Toilet log | Last 1000 entries |
| Health log, teaching claims (branches) | Last 500 each |
| Push subscriptions | Until the phone turns reminders off, the push service says the endpoint is gone, or the 41st phone is refused |
| Visitor link | Until revoked or replaced |
| Daily local backups of `store.json` | 30 days, in `/srv/backups/puppy-training` (mode 664 today; should be 600) |
| The photo in backups | Overwritten daily, so the last one only |
| `secret.key` and `vapid.json` in backups | Indefinitely |
| Server logs, with IPs | Forever, no rotation |
| Offsite bundles (planned) | 14 daily plus 6 monthly, encrypted |
| Cookies on a phone | 180 days, or until the PIN changes or "Lock this phone" |

Removing a person in Settings takes them out of `settings.family`, which
removes their name. Their ticks, ratings and toilet entries keep their
random id and stay in the file, so the history is orphaned, not erased.
There is no "forget this person" action.

## How to wipe a family

For one slot, on clawdia, by unit name only:

```bash
systemctl --user stop puppy-training-prod.service
D=/srv/projects/internal/puppy-training-prod/data
rm -f "$D/store.json" "$D/photo.jpg"            # the chart and the photo
rm -f "$D/secret.key" "$D/vapid.json"           # also signs every phone out and voids push keys
rm -f /srv/backups/puppy-training/store-prod-*.json /srv/backups/puppy-training/photo-prod.jpg
systemctl --user start puppy-training-prod.service
```

The server starts empty and shows first-run setup. Phones are signed out
because the secret changed; their push subscriptions are dead because the
VAPID keys changed, and the browsers drop them when the next send fails.
Then, by hand: delete the IP lines from that slot's log (or the whole log),
and once offsite backups exist, `rclone purge` the project prefix or wait
out the retention. `.env` can stay; it holds the PIN, not people.

To wipe one phone only: Settings, "Lock this phone" (clears both cookies),
then clear the site's data in the browser (local storage holds the
remembered person and theme, and the service worker cache holds the app
shell, not the chart).

## Privacy Act 2020: what Tim has to decide

Plain reading of the Act, not legal advice.

**Tim's own family on puppy.appspurt.com**: information collected and held
by an individual solely for personal or domestic affairs is outside the
information privacy principles. Nothing to decide, beyond being decent to
the children about what the chart records.

**Anyone else's family on Tim's server** changes that. The demo slot
(set up for the My Fur Baby owner), a sponsor-branded version for a trainer,
or the Phase 2 multi-family sign-up all make Tim an agency holding other
people's personal information, including children's. Then the principles
apply:

1. **Purpose and notice (IPP 1 and 3).** Say what is collected and why,
   before or at collection. The proposed note below does this. It belongs on
   the first-run screen and in Settings, and in the README for self-hosters.
2. **Collection from children (IPP 4).** The Act says collection must not
   be unfair or unreasonably intrusive, with particular regard to children.
   A grown-up sets up the family and enters any phone numbers; children do
   not sign up themselves. Keep it that way: a kid's number goes in only
   when a grown-up types it, and the daily text is one a day at most. Say so
   in the note.
3. **Security (IPP 5).** Reasonable safeguards: the PIN, signed cookies,
   file modes, the grown-up gate. Known gaps to close before hosting
   others: backups readable at 664, IPs in logs kept forever, no encryption
   at rest, no offsite copy yet (plan written).
4. **Access and correction (IPP 6 and 7).** Export JSON and CSV give a
   family its data in full. Correction is a grown-up editing Settings or
   undoing entries. Fine as is; the note should say that is how to ask.
5. **Retention (IPP 9).** Keep personal information no longer than needed.
   The chart keeps everything forever and cannot forget one person. A
   "remove this person and their history" action, and log rotation, are the
   two gaps. For a hosted family, "wipe a family" above is the answer today.
6. **Use and disclosure (IPP 10 and 11).** Use it for the chart and the
   reminders, nothing else. A sponsor gets a logo on the app and a thank-you
   in the README, never the data: say that in writing before the first
   sponsored family exists.
7. **Disclosure outside New Zealand (IPP 12).** Cloudflare (edge and R2),
   Google (fonts, YouTube thumbnails, FCM) and Apple or Mozilla push all
   process something offshore. R2 holds ciphertext only. The rest is
   ordinary web plumbing that every site uses, but the note should name it.
8. **Notifiable privacy breaches.** If a hosted family's PIN leaks and
   someone else reads the chart, Tim assesses whether it is likely to cause
   serious harm (children's routines and phone numbers lean towards yes)
   and, if so, notifies the Privacy Commissioner and the family. Write down
   who checks the logs and how a family reports a lost phone.

**For self-hosters** none of this is Tim's problem: the README's self-host
mode means the family runs its own server. A sentence in the README pointing
them at this file is enough.

## Proposed in-app note (not added to the UI)

For the first-run screen under the family editor, and repeated in Settings
under "This phone". Around 120 words, no legal register.

> **What this app keeps.** First names, who is a kid or a grown-up, the
> puppy's details, and every training session, rating and toilet trip with
> who logged it. If a grown-up adds a mobile number, it is used for one
> reminder text a day at most. Everyone who has the family PIN can see all
> of it; only grown-ups can change the family or the photo.
>
> **Where it lives.** On the server the family chose, in one file. Backups
> are encrypted before they leave it. Reminders go through your phone's
> push service and videos come from YouTube, which see your phone's address
> but not your chart.
>
> **Your data.** Export it any time from Settings. To remove the whole
> family, ask whoever runs the server. Questions: tim@netpotential.co.nz.

The last line is for Tim's hosted slots; a self-hoster replaces it.

## Recommended follow-ups, none done here

1. Done 20 Oct 2026 (`priv/followups`): once the family has a grown-up,
   `phone` is left out of the family record sent to a kid's phone. Grown-ups
   see and edit numbers as before; an all-kids family keeps the full record
   because the kids are its editors.
2. Done 20 Oct 2026: `login ok` and `me` lines no longer carry the
   address; `login failed`, `login locked` and `adult pin failed` keep it
   for the lockout. Log rotation is still open.
3. Done 20 Oct 2026: the backup script sets the store and photo copies to
   mode 600 and fixes older copies on each run.
4. A grown-up action "remove this person and their history" that voids or
   deletes every entry with their id, with a test.
5. A `## Privacy` section in the README linking this file, and the note
   above on first run and in Settings once Tim approves the wording.
6. For the demo slot: a line to the My Fur Baby owner that the demo is
   Tim's server, the data is visible to Tim, and it is wiped on request.
