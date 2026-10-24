# Households: many families on one server, with a proper sign-up

Design note, 22 October 2026. Written from the code at main 521aaaa, after
Tim asked how another family could register, whether an adult could manage
their own kids and puppy photo, and whether that means "a proper standard
login rather than just a PIN". This describes a design and a build order.
No code changes came with it.

**Where it stands, 24 October 2026.** All five steps were built on 22
October and run on the dev slot (puppy.appspurt.dev, `HOUSEHOLDS=1`, the
console mail sender, `OWNER_EMAILS` set); stable and demo stay
single-family until Tim has tested dev. The step 5 docs sweep happened
inside steps 3 and 4 rather than on its own branch. Since then, on
branches that wait for Tim: a security and correctness review of steps 3
and 4 (`sec/households-review`), fixes to the client screens
(`ui/households-client`), the join link as a QR code (`feat/join-qr`,
listed under step 2 below and built last), lockouts that survive a
restart (`feat/lockouts-persist`) and log rotation (`ops/logrotate`).
What still needs Tim is in `docs/NEEDS-TIM-2026-10.md`, items 18 to 24.

Short answer: yes to a proper login for the grown-up who sets a family up,
and no to logins for kids. The family PIN stays as the kids' door. The
rest of the app does not change.

## What exists today

One server process is one family. `PUPPY_PIN` in the environment is the
family's door, `PUPPY_ADULT_PIN` the grown-ups' second door, `store.json`
in `DATA_DIR` is the chart, `photo.jpg` is the puppy, `secret.key` signs
the cookies and `vapid.json` signs the reminders. Identity is a signed
cookie naming a person in that one family. There are no accounts, no
sign-up, and no way to be two families at once. Sharing the app with a
second family today means a second unit, env file, data folder and
hostname, which is how the demo slot was made (`docs/ARCHITECTURE.md`,
"What is kept ready for Phase 2").

The things that make the split cheap are already true: every piece of
state goes through one `db` object and one `persist()`, both cookies are
signed, and the rewards engine, the notifier's `decide()` and all content
are pure functions of a family's data.

## Words

- **Household**: one family, one puppy, one chart. What a server holds
  many of after this change. The code calls it `hid`.
- **Owner**: the grown-up who created the household. Signs in by email.
- **Grown-up**: an adult member of the household, as now. May or may not
  have an email on file.
- **Kid**: a child member, as now. Never has an account or an email.
- **Family code**: a short public handle for the household, such as
  `thomas-4k7q`, used only to say which family a phone belongs to.
- **Operator**: Tim, running the hosted service. Sees a list of
  households, never their charts.

## The three doors

### 1. The grown-up's door: email and a magic link

A grown-up starts a household, or signs into one on a new phone, with an
email address. The server emails a single-use link that is good for
fifteen minutes. Tapping it signs that phone in as that grown-up. No
password, so there is no password to forget, no reset flow and nothing to
leak. This is the same pattern as Slack, Notion and most apps that children
are not the main users of.

Why email and not a username and password: a password flow is a reset
flow, a strength rule, a "forgot it" path and a place to store hashes, all
of it for a grown-up who signs in twice a year. A magic link is one route
and one email template. Why not Google or Apple sign-in: another provider,
another console and another thing to explain to a vet clinic. It can be
added later without changing the data model.

### 2. The kids' door: the family PIN, as now

Nothing changes for a kid. They open the app, put in the family PIN, pick
their name. The PIN belongs to the household instead of the server, so
every household has its own. A grown-up sets and changes it in Settings.

To know which household a PIN belongs to, the phone needs the family code
once. A grown-up sends a **join link** from Settings:
`https://puppy.appspurt.com/j/thomas-4k7q`. Opening it remembers the
household on that phone (a long-lived cookie) and shows the PIN screen.
Settings also shows the link as a QR code for the kids' phones in the same
room. A phone that has no household cookie and lands on the home page sees
"Start a new family" and "Join with a family code" (type the code, then
the PIN).

The grown-up PIN stays too, for a grown-up acting on a kid's phone or
anyone who would rather not use email on a shared device.

### 3. The operator's door

Tim's email is in `OWNER_EMAILS`. Signing in with it opens `/owner`: a
table of households (code, puppy's name, number of people, created, last
active, sms on or off), with suspend, wipe on request and "make an invite
link". No chart data on this page, ever. The same page carries the sponsor
slot settings when those arrive (`puppy-training-commercial.md`).

## Data

```
DATA_DIR/
  secret.key                 one, signs every cookie and magic link
  vapid.json                 one, the push key pair for the whole server
  households.json            the index: hid, code, name, owner email, pin hashes, flags
  households/
    h_3f9a2c.../
      store.json             exactly today's store.json
      photo.jpg
      backups are per household folder, so the existing ops/backup-puppy.sh
      needs one loop added, nothing else
```

Why one VAPID pair: the pair identifies the application server to the push
services, not the family. One pair, as now, is correct and simpler to back
up. Why one secret: cookies and links carry the `hid` inside the signed
payload, so one key signs for every household without any household being
able to forge another's cookie.

`households.json`, one row per household:

```json
{ "id": "h_3f9a2c1b7e", "code": "thomas-4k7q", "name": "Biscuit",
  "owner": "tim@example.nz", "pin": "<scrypt>", "adultPin": "<scrypt>",
  "pinTag": "x7…", "created": 1760000000000, "lastActive": 1761000000000,
  "flags": { "sms": false, "suspended": false, "demo": false } }
```

Grown-up emails live on the person record in the household's own
`store.json` (`family[].email`, optional), so a second grown-up can sign in
by email too. The index holds only the owner's.

PINs move from the environment into the index, hashed with scrypt, so a
grown-up can change them in Settings. `pinTag` keeps its job: changing the
PIN still signs every phone out, per household.

### Memory and start-up

Every household's store is loaded at boot, as the single store is now,
because the reminder loop needs them all. A busy family's store is about
100 KB after a month; a thousand families is 100 MB, which this box
cannot spare but a hundred is fine. The design keeps a `loadHousehold()`
that could become lazy later; the notifier would then iterate the index and
load as it goes. Not needed before a hundred families.

### Single-family mode stays

Self-hosters and the open-source README keep the mode that exists today:
`PUPPY_PIN` set and no `HOUSEHOLDS=1` means one household called
`default`, its files exactly where they are now, no email, no join links,
no owner page. The hosted service runs with `HOUSEHOLDS=1`. The code path
is the same with `hid` pinned to `default`, which is what keeps the open
core and the hosted service one codebase.

### Migrating puppy.appspurt.com

On first boot with `HOUSEHOLDS=1` and a `store.json` in `DATA_DIR`, the
server moves it, `photo.jpg` and the env PINs into household `default`
with code taken from the puppy's name, hashes the PINs into the index and
logs what it did. Every phone keeps its cookies because the secret does
not change and `default` is the hid the old cookies are read as. Tim then
adds his email to his own person record and sets `OWNER_EMAILS`.

## Routes

Everything under `/api/` works as now and takes the household from the
cookie. The new routes:

| Route | Who | What |
| --- | --- | --- |
| `POST /api/signup` `{ email, puppy, name }` | anyone | Makes a household and emails the magic link. Per-IP limit: three an hour. Says "check your email" whether or not the address exists elsewhere. |
| `POST /api/email` `{ email }` | anyone with a household cookie or code | Sends a magic link for a grown-up of that household. Same wording either way. |
| `GET /m/<token>` | the link | Checks the token (signed, `hid`, `pid`, fifteen minutes, single use via a spent list in the index), sets `pt_session` and `pt_me`, redirects to `/#today`. |
| `GET /j/<code>` | anyone | Sets the household cookie and redirects to the PIN screen. Unknown code: the same screen with "ask for a new link". |
| `PUT /api/pins` `{ pin, adultPin }` | grown-up | Changes either PIN, rehashes, rotates `pinTag`. |
| `POST /api/household/wipe` `{ confirm }` | owner | Voids everything, sends the goodbye email, deletes the folder after seven days. The remove-person machinery already does the per-person half. |
| `GET /api/owner/households` and friends | operator | The owner page. |

`/api/login` keeps its shape: PIN only, but checked against the
household the cookie names. The per-IP lockout stays and gains a
per-household one (ten wrong PINs in fifteen minutes locks that household's
PIN door for fifteen minutes, so a stranger with a family code cannot
grind the PIN and a kid cannot lock out every family on the server).

Cookies: `pt_h` (household, one year, not signed, it is just a pointer),
`pt_session` (now `{ hid, exp, v }`), `pt_me` (now `{ hid, pid, v }`). A
`pt_session` whose `hid` does not match `pt_h` is ignored, so a phone
cannot be confused into another family by a stale cookie.

The visitor card token gains the household's code as a prefix
(`/api/visitor/thomas-4k7q/<24 hex>`) so the lookup is one index read, not
a scan.

## The client

Three new screens, all in the style of the existing PIN screen:

1. **Welcome**: puppy illustration, "Start a new family" and "I have a
   family code". The existing first-run Settings follows "Start a new
   family" after the email is confirmed, with the email already on the
   grown-up's row.
2. **Check your email**: one line, the address, "Open the link on this
   phone". A "Use the family PIN instead" link for a grown-up who has it.
3. **Family code**: one field, then the PIN screen as today.

Settings gains a "Your family" card for grown-ups: the family code, the
join link with Copy and a QR, Change family PIN, Change grown-up PIN, and
the owner-only "Delete this family". The puppy photo upload is already
there and already per household once the folder split lands. The
six-person cap stays.

Kids see none of this. Their Settings view stays read-only as now.

## Email

The server needs to send two emails: the magic link and the goodbye. One
small module, `server/mail.js`, with a sender picked by environment:
`MAIL=console` prints the link to the log (dev, tests and the first weeks
if Tim prefers to hand links out himself), `MAIL=sendgrid` uses
`SENDGRID_API_KEY`, which the house already has in
`~/.config/growthspurt/sendgrid.env`. The sender address and domain
authentication for `appspurt.com` are a Tim decision (see Needs Tim).

Until email is wired, the owner page's "make an invite link" does the
same job: Tim creates the household for a family he knows and sends them
the magic link himself. That is enough for the eight litter families.

## Reminders and SMS

The notifier loop runs once a minute as now and iterates households. Each
household keeps its own `sent` tally and caps. SMS is a per-household flag,
off by default, on only for Tim's own household, because the gateway is
Tim's SIM. The demo slot's env should lose its `AIVA_SMS_*` lines either
way.

## Privacy and the Privacy Act

`docs/PRIVACY.md` gains: the owner's email as a new data item, that the
operator can see household names, codes and emails but not charts, the
seven-day deletion window, and that magic-link emails say which household
they open. The in-app note from item 6 of `docs/NEEDS-TIM-2026-10.md`
should go live with this build, since this is the point other families'
data arrives. Kids never give an email, which keeps the app clear of the
children's-account rules that email sign-in would otherwise drag in.

## Demo

Instead of one shared demo family, "Try it" on the welcome screen makes a
throwaway household flagged `demo`: seeded with a puppy called Biscuit and
two sample people, no email needed, wiped by the operator after a day, no
reminders, no SMS. Anyone Tim shows the app to gets their own sandbox and
the My Fur Baby owner can start a real household with their email.

## Build order

Each step is a branch from main in a worktree, tests green, nothing
promoted until Tim says. The single-family mode must pass the existing 56
tests unchanged at every step.

| Step | Branch | What lands | Size |
| --- | --- | --- | --- |
| 1 | `feat/households-store` | `hid` resolver, per-household folders, `households.json`, the migration, PINs hashed in the index, `PUT /api/pins`, cookies carry `hid`. Single mode unchanged. Tests: two households cannot see or edit each other, migration of a real store, PIN change signs phones out. | 1 day |
| 2 | `feat/households-join` | `/j/<code>`, the household cookie, the welcome and family-code screens, the "Your family" Settings card with QR. Tests: join sets the cookie, wrong code, stale session from another household ignored. | half a day |
| 3 | `feat/households-email` | `server/mail.js` with console and SendGrid senders, `POST /api/signup`, `POST /api/email`, `GET /m/<token>`, single use, rate limits, the check-your-email screen. Tests: token expiry, reuse, wrong household, limits. | 1 day |
| 4 | `feat/households-owner` | `OWNER_EMAILS`, the owner page, invite links, suspend, wipe with the seven-day delay, the demo household and its reset. | half a day |
| 5 | `docs/households` | README, ARCHITECTURE, PRIVACY, RESTORE and the backup script loop. | half a day |

Steps 1 and 2 are useful on their own: with them, Tim can hand a family a
join link and a PIN he set on the owner page, which is the "eight litter
families" case with no email at all. Step 3 is what makes it
self-service.

## Needs Tim before step 3 (items 1 and 2 still open on 24 October as NEEDS-TIM 18 and 19; 3 was settled by building)

1. The sender address for magic links (`hello@appspurt.com`, or a new
   `puppy@` on the domain) and whether to authenticate the domain in
   SendGrid now. Without authentication the links land in spam.
2. Whether the hosted service stays at `puppy.appspurt.com` or gets its
   own domain before other families sign up. Join links and emails carry
   the hostname, so this is cheaper to decide first.
3. Whether to start now with steps 1 and 2 (invite links, no email), or
   wait and ship all five together.
