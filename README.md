# Puppy School HQ

**The puppy training app for families.** Free, open source, reward-based, and built around the thing no other app does: everyone in the house trains the same puppy, with the same words, and the kids actually want to.

Everyone does **5 minutes, 3 times a day**. The app walks each person through the same course of short lessons (watch a video, read the steps, train, tick it off), keeps the whole family on one shared chart, and turns showing up into streaks, levels and badges for the humans while the puppy's own progress is the number the family wins together.

Made in New Zealand for a German Shorthaired Pointer x heading dog puppy who bites a lot, and for the three kids who are training her. Works for any puppy and any family.

## Who built it, and why it's free

[Tim Thomas](https://www.netpotential.co.nz) is a developer with 25 years' experience who now works with a swarm of AI agents. When he can't find a free app that does everything he wants, he builds it. He got a puppy, looked at the apps, and built this one instead.

The first version, the research behind it (three agents read the app market, the puppy-behaviour literature and the gamification evidence) and the family rewards build you are reading about all happened in one afternoon and evening. The git log is the receipt: first commit 15:35, family rewards build 18:40, same day. If that is a couple of hours, think about what a couple of days, a couple of weeks and a couple of months will do. The aim is simple: the best puppy app there is, and free.

Why free? Because he can. There is spare AI capacity every week and it is better burned on something useful than left on the table. If you run a pet rescue and want an app built for you, ask: [netpotential.co.nz/token-burner](https://www.netpotential.co.nz/token-burner).

## Why this exists

We looked hard at the puppy apps on the market (Zigzag, Dogo, Puppr, Woofz, Hundeo, Pupford and a dozen trackers). They have all converged on the same product: a quiz, an age-based plan, three daily tasks, videos, a problem library, a clicker, and a thin free tier behind a trial. What none of them has is the family layer:

- one shared chart with **per-person sessions**, so you can see who trained and when;
- a **child mode** of any kind (one of them blocks under-13s outright);
- a **shared cue sheet**, even though every trainer says "one word per behaviour, everyone uses it" is step one;
- any answer to the steady stream of "my family keep ruining training" posts.

And the loudest complaint about all of them is billing and lock-in. So this one is free, needs no account, and exports everything.

## What's in it

**Today**
- Your **next lesson**, front and centre, with the video thumbnail and how many of its three sessions you have done. Tap it for the lesson page; the three slots underneath are for sessions you did without the timer.
- Everyone's row with a progress ring, streak and level. Tick your own slot in one tap; logging for someone else asks first and records who did it.
- The **puppy's progress** meter: ten puppy levels from Land Shark to Good Dog Graduate, fed by sessions, skills mastered, calm days and toilet wins. The dog is the team.
- A daily **bite meter** (Angel to Shark) with a week sparkline, because the bite meter dropping is what the family actually wants.
- A **toilet log**: wee, poo or accident, what came before, when the next trip is due for the puppy's age, and the pattern behind accidents.

**Lessons**
- One **course for everyone**, 25 lessons in four levels: Puppy 101 (name, the "Yes!" marker, Sit, a soft mouth, Wait, Come, Stay), Good manners, Growing up, then Tricks and games. Everyone starts at lesson one and moves at their own pace; nobody picks a track.
- Each lesson page is the same four steps: **watch** one short video chosen for that skill (every video checked live when it was added), **read** the steps with a lure animation where it helps, **train** with a 5-minute timer (warm-up, the lesson, play) that ticks the session off at the end, and, when the puppy nails it, **confirm the goal** with a witness.
- Three sessions tick a lesson and open the next. A lesson the whole pack has mastered is ticked for everyone.
- **Mastery takes three people and a witness.** That is where the big points are, so it is the one thing that needs a co-sign. It also makes every family member a generalisation step for the dog.
- Below the course: puppy preschool, the safe-socialising list, the first-year timeline and the health card.

**Pack**
- **Streaks** that one session a day keeps alive, with two automatic freezes a week. Missing a day is forgiven; coming back is celebrated.
- **Levels** (New Recruit to Puppy School Principal) and a **badge grid** with every earn condition visible.
- A **weekly podium** ranked by percent of each person's own goal, so a kid on 21 sessions and a parent on 10 race fairly. It resets Sunday night. Kids vs grown-ups runs alongside.
- A **pack streak** for days where everyone trained.

**Tips** An SOS card for "she's biting right now", twelve bite-sized biting topics, and sixteen other problems (chewing, jumping, night crying, toileting, guarding, herding nips, zoomies, barking, stealing, pulling, chasing, fear, vet handling, escaping, boredom).

**Watch**: starter playlists, every 1-minute short in one place, and the well-known YouTube trainers, each labelled reward-based, mixed or uses corrections.

**And the small stuff that matters**
- Plays videos inside the app (YouTube's privacy-enhanced embed), so kids don't end up on YouTube's home page.
- Installs like an app: *Add to Home Screen*. Opens full screen, the shell works offline.
- Light and dark mode, following the phone or set in Settings.
- The puppy's photo in the corner.
- Confetti and a buzz for a first badge or a level up, never for a routine tick.
- Export the whole chart as JSON or CSV any time, and print a certificate for the puppy's current level.
- Reminders per phone, and optional daily texts.

All the training content lives in one file: [`public/content.js`](public/content.js). The rewards engine is one file too: [`public/rewards.js`](public/rewards.js). Fork it and make it yours.

## The design, in one paragraph

Rewards for the humans are symbolic (points, streaks, levels, badges) and capped by puppy welfare: three sessions a slot is the limit, so nothing is worth farming. Nobody is ranked by raw points; comparison is always against your own weekly goal. Sessions count the moment they are ticked, because parent-approval queues are where every family chore app dies. Forgiveness beats pressure, which is the single clearest finding from Duolingo's own streak experiments. And the puppy's progress is the headline number, so siblings are on the same team by construction.

## Three ways to run it

| | Family sync | PIN | Needs a server |
|---|---|---|---|
| **1. Open the file** | No, saved on each phone | No | No |
| **2. Static hosting** (GitHub Pages, Netlify, App Engine) | No, saved on each phone | No | No |
| **3. Self-host** (`server/server.js`) | **Yes**, one shared chart | **Yes**, a family PIN | Yes |

The app works out which mode it's in by itself. Streaks, levels and badges work in all three.

### 1. Open the file

```bash
npm run build      # makes dist/puppy-school.html
```

Open `dist/puppy-school.html` on a phone or send it to someone. Everything saves on that phone.

### 2. Static hosting

Serve the `public/` folder from anywhere.

**GitHub Pages (free, 2 minutes):** fork this repo, then *Settings → Pages → Deploy from a branch → `main` / `(root)`*. Your app will be at `https://YOUR-NAME.github.io/puppy-training/`.

### 3. Self-host with a family PIN (recommended for families)

One chart the whole family shares from their own phones. Everyone unlocks it once with a number PIN, picks their name, and stays signed in for 180 days.

Needs Node 18+. No dependencies to install.

```bash
git clone https://github.com/0800tim/puppy-training.git
cd puppy-training
PUPPY_PIN=482913 npm start      # http://localhost:8080
```

Or with Docker:

```bash
echo "PUPPY_PIN=482913" > .env
docker compose up -d --build    # listens on 127.0.0.1:8080
```

Then put HTTPS in front of it (Caddy, nginx, a Cloudflare Tunnel or Tailscale Funnel). See [`deploy/`](deploy/) for a systemd unit, env file and Caddyfile.

#### Settings

| Variable | Default | |
|---|---|---|
| `PUPPY_PIN` | required | 4 to 8 digits. Use 6+ if it's on the public internet. Changing it signs every phone out. |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | |
| `DATA_DIR` | `./data` | `store.json` (the chart), `photo.jpg` and `secret.key` live here. Back it up. |
| `SESSION_DAYS` | `180` | How long a phone stays unlocked. |
| `TRUST_PROXY` | off | Set `1` behind a reverse proxy or tunnel so rate limits and secure cookies use the real client. |
| `PUPPY_ADULT_PIN` | unset | Optional second PIN, 4 to 8 digits. When set, picking a grown-up profile on a phone asks for it, so kids can't act as grown-ups. |
| `PUSH_SUBJECT` | `mailto:hello@growthspurt.agency` | Contact for push services (VAPID subject). Keys are generated into `DATA_DIR/vapid.json`. |
| `AIVA_SMS_API_URL`, `AIVA_SMS_API_KEY`, `AIVA_SMS_DEVICE_ID`, `AIVA_SMS_SIM_SUBSCRIPTION_ID` | unset | Optional SMS gateway for daily texts. Leave unset and texts are simply off. |
| `SESSION_SECRET` | generated | Signs the cookies. Generated into `DATA_DIR/secret.key` if unset. |

#### How the PIN is protected

- Wrong PINs are rate limited: 5 per device per 15 minutes, and 20 in total per hour across everyone. After that, even the right PIN waits.
- Sessions are signed, HttpOnly, SameSite=Strict cookies. Writes must be JSON, which blocks cross-site form tricks.
- Each phone picks who it belongs to; the server signs that choice into a cookie and ignores any identity a request claims. Grown-up status comes from the family record, never from the phone. Set `PUPPY_ADULT_PIN` and picking a grown-up asks for it.
- Once a grown-up exists, only grown-ups can change the family, goals, phone numbers and the puppy's photo. Kids can't log past days. You can undo your own entries for 15 minutes; a grown-up can undo anything.
- A grown-up can remove a person and everything they logged from Settings, with a 15-minute undo. After that the person's id is purged from the chart. See docs/PRIVACY.md.
- Push subscriptions are only accepted for real browser push services, and there is a hard cap of 40 phones. See [`docs/SECURITY-REVIEW-2026-10.md`](docs/SECURITY-REVIEW-2026-10.md).
- A short PIN is a family front-door lock, not bank security. It keeps strangers out of your chart. Don't store anything secret in it.

## Development

```bash
npm test     # server and rewards-engine tests (node:test, no dependencies)
npm run build
```

- `public/` is the whole app: `index.html`, `styles.css`, `content.js` (all the training content), `rewards.js` (points, streaks, levels, badges, the course), `app.js`, `theme.js`, `sw.js` (offline shell) and `manifest.webmanifest`.
- `server/server.js` is the optional PIN server, one file, no dependencies.
- Bump `VERSION` in `public/sw.js` whenever you change files in `public/`, so installed phones pick up the update.

Contributions welcome, especially new skills, better videos, translations, breed notes and fixes to `content.js`. Please keep the training advice reward-based.

**Reminders**
- Each phone can turn on reminders: a nudge before school, one after school, one in the evening, and a streak-saver at 8pm, only when that slot is empty. Two a day at most, silent during school hours and at night, and they pause themselves after six ignored nudges. Grown-ups can see and pause every phone.
- Optional daily text through an SMS gateway for anyone with a number saved, one a day, only if nothing is on the chart.

**Kids and the puppy** (on Tips): the seven safety rules, the Pat-Pet-Pause consent test, Be a Tree, a green/amber/red body-language game, and what each age can do.

**The other pets** (on Tips): introducing the puppy to the dog you already have, the first months with two dogs, a section for terrier households (Jack Russells especially: bossy, guardy, quick to tip from play into prey), how to read play against a fight with a consent test, exactly when to step in and separate, introducing the puppy to the cat over weeks, and the house rules for a home with more than one pet. Management first, nobody told off for a growl or a hiss.

**Socialising, the first year, and the breed**
- A 60-item socialisation checklist in seven groups with "happy, unsure or scared" on each; whoever was there gets the points.
- The first year as a dated timeline from the puppy's birthday: the fear period, trade games, vaccinations, teething, the soft-mouth deadline, adolescence, desexing as a vet decision.
- Breed notes matched on the breed field: gundog, herding, terrier and companion traits and what they mean for training.

**Weekly challenges**: nine puppy-voiced family challenges rotate, one a week; the whole family gets the points when one is won.

**Cue sheet and visitor card**: the cue words are pinned on Today, and grown-ups can make a visitor link, a one-page card with the cue words, the biting steps and the house rules for grandparents and sitters, with no family names and no chart.

**Health**: grown-ups log weigh-ins, vaccinations, worming, flea treatment and vet visits; the app draws the weight curve and says when the next vaccine, worming or weigh-in is due on the usual New Zealand timings.

**Buddies and teaching**: pick a buddy in Settings and share a streak (days you both train). On any open skill, log "I taught this to…"; the learner confirms from their own phone and you both score. Badges for a 7-day buddy streak, the first confirmed lesson and the fifth.

## Roadmap

- Multi-family hosting so any family can sign up with their own PIN.

## A note on training methods

The plan is reward-based, which is what the [NZ SPCA](https://www.spca.nz/advocacy/position-statements/article/training-methods-and-devices) and veterinary behaviourists ([AVSAB](https://avsab.org/wp-content/uploads/2024/12/AVSAB-Humane-Dog-Training-Position-Statement-2021.pdf)) recommend. Trainers who use corrections are listed because people ask about them, with notes on what to take and what to skip.

This app is general guidance, not a substitute for your vet or a qualified trainer. If your puppy's biting comes with stiff body language, growling over food or toys, or is getting worse after 4 months, ask a professional.

## Licence

[AGPL-3.0](LICENSE). Free for any puppy parent, trainer or rescue to use, change and share. If you change it and offer it to other people as a service, you share your changes under the same licence, so improvements flow back to every family.

Want a branded version for your puppy preschool, daycare, vet clinic or training business without publishing your changes? A commercial licence and hosted, branded versions are available: email [tim@netpotential.co.nz](mailto:tim@netpotential.co.nz).

The name Puppy School HQ and its logo are not covered by the licence.
