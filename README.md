# Puppy School HQ

A free, mobile-first puppy training plan and tick-off chart for the whole family.

Everyone does **5 minutes, 3 times a day**. Tap a box when you've done a session. The app gives you a 6-week plan, step-by-step skills with little animations showing where to move the treat, a big **Help!** section for biting and other puppy problems, and 100+ hand-picked YouTube videos (lots of 1-minute shorts).

Made in New Zealand for a German Shorthaired Pointer × heading dog puppy who bites a lot. Works for any puppy.

## What's in it

- **Today**: a chore-chart style grid (Morning / Afternoon / Evening for each person), a daily "how bitey was she?" meter, and the week's minutes.
- **Plan**: 6 weeks of skills, family roles, cue words everyone uses, treats, house rules and a safe socialising checklist.
- **Skills**: 22 skills from the name game and Sit to Roll over and Play dead, each with steps, a "done when" goal and videos.
- **Help!**: an SOS card for "she's biting right now", 12 bite-sized biting topics, and 16 other problems (chewing, jumping, crying at night, toilet, guarding, herding nips, zoomies, barking, stealing, lead pulling, chasing cats, fear, vet handling, escaping, boredom).
- **Watch**: starter playlists, every 1-minute short in one place, and the famous YouTube trainers (Kikopup, McCann, Zak George, Victoria Stilwell, Susan Garrett, Ian Dunbar, Cesar Millan and more), each labelled reward-based, mixed or uses corrections.

All the training content lives in one file: [`public/content.js`](public/content.js). Fork it and make it yours.

## Three ways to run it

| | Family sync | PIN | Needs a server |
|---|---|---|---|
| **1. Open the file** | No, saved on each phone | No | No |
| **2. Static hosting** (App Engine, GitHub Pages, Netlify) | No, saved on each phone | No | No |
| **3. Self-host** (`server/server.js`) | **Yes**, one shared chart | **Yes**, simple family PIN | Yes |

The app works out which mode it's in by itself.

### 1. Open the file

```bash
npm run build      # makes dist/puppy-school.html
```

Open `dist/puppy-school.html` on a phone or send it to someone. Ticks save on that phone.

### 2. Static hosting

Serve the `public/` folder from anywhere. For Google App Engine:

```bash
gcloud app deploy --project YOUR_PROJECT
```

### 3. Self-host with a family PIN (recommended for families)

One chart the whole family shares from their own phones. Kids unlock it once with a number PIN and stay signed in for 180 days.

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
| `DATA_DIR` | `./data` | `store.json` (the chart) and `secret.key` live here. Back it up. |
| `SESSION_DAYS` | `180` | How long a phone stays unlocked. |
| `TRUST_PROXY` | off | Set `1` behind a reverse proxy or tunnel so rate limits and secure cookies use the real client. |

#### How the PIN is protected

- Wrong PINs are rate limited: 5 per device per 15 minutes, and 20 in total per hour across everyone. After that, even the right PIN waits.
- Sessions are signed, HttpOnly, SameSite=Strict cookies. Writes must be JSON, which blocks cross-site form tricks.
- A short PIN is a family front-door lock, not bank security. It keeps strangers out of your chart. Don't store anything secret in it.

## Run it as a Claude artifact

`npm run build` also makes `dist/artifact.html`. Published as a Claude artifact, it syncs between everyone signed in to that page.

## Development

```bash
npm test     # server tests (node:test, no dependencies)
npm run build
```

- `public/` is the whole app: `index.html`, `styles.css`, `content.js` (all the training content), `app.js`.
- `server/server.js` is the optional PIN server, one file, no dependencies.

Contributions welcome, especially new skills, better videos, translations and fixes to `content.js`. Please keep the training advice reward-based.

## A note on training methods

The plan is reward-based, which is what the [NZ SPCA](https://www.spca.nz/advocacy/position-statements/article/training-methods-and-devices) and veterinary behaviourists ([AVSAB](https://avsab.org/wp-content/uploads/2024/12/AVSAB-Humane-Dog-Training-Position-Statement-2021.pdf)) recommend. Trainers who use corrections are listed because people ask about them, with notes on what to take and what to skip.

This app is general guidance, not a substitute for your vet or a qualified trainer. If your puppy's biting comes with stiff body language, growling over food or toys, or is getting worse after 4 months, ask a professional.

## Licence

MIT. Free for any puppy parent, trainer or rescue to use, change and share.
