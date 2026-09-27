# Veronica

Veronica is a very simple appointment book for a small residential house-cleaning business.

It is built for an owner who is not very comfortable with computers, so it works like a paper appointment book: large text, large buttons, plain English and only four screens.

- **Today:** the date, how many cleanings there are today, a large **Next Cleaning** card (Directions, Call, Text, On My Way, Complete) and the day's schedule.
- **Calendar:** month and week views. Tap a day to see its cleanings and add another one.
- **Clients:** search by name, phone or address. Each client has a profile with their upcoming and past cleanings.
- **Settings:** business name, owner, phone, usual cleaning length and the two text-message templates.

Adding a cleaning takes three fields: **Client name → Date → Time → Add to Schedule**. Everything else (address, phone, price, notes, repeat) is optional and hidden under *More options*.

Veronica is **not** a CRM, an accounting system or a marketing tool. See [AGENTS.md](AGENTS.md) for the principles that keep it simple.

---

## Technology

| Part | Choice | Why |
| --- | --- | --- |
| Web app | React 19 + TypeScript, built with Vite | One responsive app for laptop, tablet and phone |
| Data loading | TanStack Query | Every screen refreshes right after any change, with no page reloads |
| Server | Node.js 22 + Express 5 | Small, well known, easy to host |
| Database | SQLite (through `better-sqlite3`) | A single file on disk. It needs no separate database server and is easy to back up |
| Tests | Vitest + Supertest (logic and API), Playwright (real browser) | |
| Font | Atkinson Hyperlegible (bundled, no Google calls) | Designed for readability |

The server serves both the JSON API (`/api/...`) and the built web app, so production runs as **one process**.

## Project structure

```
shared/          Business logic used by both server and browser (pure TypeScript, fully unit-tested)
  dates.ts         Date/time math and plain-English formatting (no time-zone surprises)
  recurrence.ts    Repeat rules: every week / every 2 weeks / every month
  conflicts.ts     Double-booking detection
  templates.ts     Text-message templates ({client}, {date}, {time}, {business})
  validation.ts    Friendly input checking (names, dates, times, phones, prices)
  links.ts         tel:, sms: and maps links
  clients.ts       Client name matching and search
  types.ts         Data shapes shared by API and UI
server/
  index.ts         Starts the server (reads .env)
  app.ts           Express routes, security headers, friendly error handling
  db.ts            SQLite connection + schema migrations
  appointments.ts  Cleanings and repeating cleanings
  clients.ts       Clients (with safe "remove" = archive)
  settings.ts      Business settings
  auth.ts          Optional single-password protection
src/             The web app (React)
  pages/           Today, Calendar, Clients, Client profile, Cleaning details, Settings, Sign in
  components/      Quick Add form, dialogs, buttons, lists, etc.
  styles.css       All styling (large, warm, responsive)
public/          PWA manifest, service worker, icons
scripts/         backup.ts, seed-demo.ts, make-icons.mjs
tests/           Unit tests (tests/unit) and API tests (tests/api)
e2e/             Browser tests for every required workflow and screen size
```

## Local installation

You need **Node.js 22** (see `.nvmrc`). The app also runs on 20.12 or newer.

```bash
npm install
cp .env.example .env      # then edit .env if you like; the defaults work locally
```

## Development

```bash
npm run dev
```

This starts the API on http://localhost:3000 and the web app with live reload on **http://localhost:5173**. Open the second address.

To try it with made-up demo data, use a separate database file:

```bash
DATABASE_PATH=./data/demo.db npm run seed:demo
DATABASE_PATH=./data/demo.db npm run dev
```

## Production build

```bash
npm run build     # builds the web app into dist/client and the server into dist/server
npm start         # runs dist/server/server/index.js with NODE_ENV=production on PORT (default 3000)
```

## Testing

```bash
npm test            # unit + API tests (fast, in-memory database)
npm run test:e2e    # builds, starts the real server on a fresh database, and runs the browser tests
npm run lint
npm run typecheck
npm run check       # lint + typecheck + tests + build, all in one
```

The browser tests go through all 14 required workflows: new client, existing client, client details, every-2-weeks repeat, conflict, reschedule, complete, paid, text, On My Way, call, directions, persistence and business transfer. They also cover cancel and remove-client confirmations. They also check for sideways scrolling at 1440, 1024, 768, 390 and 320 px, and they check the phone layout. Playwright uses the Chromium browser that is already installed. If yours is missing, run `npx playwright install chromium`.

## Database setup

There is nothing to set up by hand. When the server starts, it:

1. creates the folder and file at `DATABASE_PATH` if they don't exist, and
2. runs any schema migrations it hasn't run yet (`server/db.ts`). SQLite's `user_version` records which migrations have run.

To change the schema later, **add** a new SQL string to the end of the `MIGRATIONS` list in `server/db.ts`. Never edit a migration that has already shipped.

Main tables:

- `settings`: one row with the business name, owner name, business phone, default cleaning length and message templates.
- `clients`: name, phone, address, notes, usual price, `archived_at`, created/updated times. `name_key` is a normalized name used to prevent duplicates.
- `series`: one row per repeating cleaning (client, how often, start date, time, length, price, notes, `ends_on`).
- `appointments`: one row per cleaning. It has `client_id` (a real foreign key; client details are never copied), optional `series_id`, date, time, length, price, notes, `status` (scheduled/completed/canceled), `payment_status` (unpaid/paid) and timestamps.

Prices are stored as whole cents. Dates are stored as `YYYY-MM-DD` and times as 24-hour `HH:MM` wall-clock values, so daylight-saving changes can never move an appointment.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `DATABASE_PATH` | `./data/veronica.db` | SQLite file. **In production, put it on a persistent disk/volume.** |
| `APP_PASSWORD` | *(empty)* | The password to open Veronica. **Set this on any deployed copy.** When it is empty, the app is open to anyone who can reach it (fine for local use only). |
| `SESSION_SECRET` | *(derived from APP_PASSWORD)* | Signs the "remember this device" cookie. Changing it or `APP_PASSWORD` signs out all devices. |
| `TZ` | server default | The business's time zone, e.g. `America/Chicago` |
| `NODE_ENV` | `development` | Set to `production` when deployed (`npm start` does this) |

`.env` is git-ignored. Only `.env.example` (with no real values) is committed.

## Deployment

Veronica is one Node.js process plus one database file. Any host that gives you **a persistent disk** works. Serverless hosts (e.g. Vercel, Netlify functions) do **not**, because their disks are wiped.

### Option A: Docker (Fly.io, Railway, Render, a VPS, a home server)

```bash
docker build -t veronica .
docker run -d --name veronica -p 3000:3000 \
  -v veronica-data:/data \
  -e APP_PASSWORD='choose-a-good-password' \
  -e TZ='America/New_York' \
  --restart unless-stopped veronica
```

The image stores the database at `/data/veronica.db`, so mount a volume at `/data`.

- **Fly.io:** `fly launch` (it finds the Dockerfile), then `fly volumes create veronica_data --size 1` and mount it at `/data` in `fly.toml`. Set the password with `fly secrets set APP_PASSWORD=...`.
- **Railway:** deploy from the GitHub repo, add a Volume mounted at `/data`, and set `APP_PASSWORD` and `TZ` in Variables.
- **Render:** create a Web Service from the repo (Docker), add a Persistent Disk mounted at `/data`, and set the environment variables.

### Option B: plain Node.js on a server

```bash
npm ci
npm run build
DATABASE_PATH=/var/lib/veronica/veronica.db APP_PASSWORD=... TZ=America/New_York npm start
```

Keep it running with systemd or pm2. Put it behind HTTPS (Caddy, nginx or your host's proxy). HTTPS is needed for the secure login cookie and for installing the app on a phone.

Health check endpoint: `GET /api/health`.

## Data persistence

All data lives in the single SQLite file at `DATABASE_PATH`. It survives page refreshes, browser restarts and server restarts. The browser does not store business data; it only keeps the sign-in cookie.

Business history is never thrown away:

- Completed and canceled cleanings stay in the database and in client history.
- "Cancel appointment" only sets the status to *Canceled*.
- "Remove client" only hides the client (`archived_at`). Their history stays, and they can be brought back from the Clients page. Clients are never deleted. The database refuses to delete a client who has cleanings.
- The only rows ever deleted are *future, still-just-planned* repeat cleanings (scheduled, unpaid) when a repeat is stopped or changed. See below.

## Backups

- **In the app:** Settings → **Download Backup** downloads a JSON file with every client, cleaning and setting.
- **On the server:** `npm run backup` (or `npm run backup -- /path/to/folder`) makes a consistent copy of the SQLite file while the app is running (`backups/veronica-YYYY-MM-DD-HHMM.db`).
- **Recommended:** schedule `npm run backup` daily (cron) and copy the backups off the server, or use your host's volume snapshots. To restore, stop the app, replace the database file with a backup copy, and start the app again.
- Never commit database files or backups to git. `.gitignore` already excludes them.

## Repeating cleanings (how recurrence works)

- A repeating cleaning creates one row in `series` (start date, time, how often: `weekly`, `biweekly` or `monthly`).
- Real `appointments` rows are created from it about **6 months ahead**. When someone looks further ahead in the calendar, more are created on demand, up to 5 years. `series.next_index` remembers which occurrence comes next, so a cleaning is never created twice. Nothing is ever re-created after it was moved or canceled.
- Occurrence *N* is always calculated from the start date, never from the previous one. Monthly repeats therefore don't drift: a repeat that starts Jan 31 goes Feb 28 → Mar 31 → Apr 30.
- Because every cleaning is an ordinary row, each one can be completed, paid, moved or canceled **on its own** without affecting the others. That is the default whenever a repeating cleaning is edited or rescheduled.
- **"This and all later cleanings"** (in Edit/Reschedule, with a confirmation) ends the old series just before this cleaning and starts a new series from the new date and time. Later cleanings that are still just planned (scheduled and unpaid) are replaced. Completed, canceled and paid ones are never touched.
- **"Stop Repeating After This"** (with a confirmation) ends the series at that cleaning and removes the later planned (scheduled, unpaid) ones from the calendar.
- New repeats are checked for double bookings on **every** date that is created, not just the first.

## Double-booking protection

Each cleaning blocks out its length. The length defaults to Settings → *How long a cleaning usually takes* (initially 2 hours) and can be changed per cleaning in Edit. If a new or moved cleaning overlaps another one, Veronica shows *"You already have a cleaning scheduled around this time."* along with the other cleaning, and offers **Change Time**. It never double-books silently. The owner can still choose **Book It Anyway** on purpose. Canceled cleanings never count, and back-to-back cleanings (one ends at 12:00, the next starts at 12:00) are fine.

## How phone calls, texts and directions work

Veronica does **not** send texts or place calls itself, and it uses no paid SMS or maps service. It opens the phone's own apps with everything filled in, and the user presses **Send** or **Call**.

- **Call:** a `tel:` link with the client's number (for example `tel:+15550100101`).
- **Text Customer:** an `sms:` link with the client's number and the reminder template filled in. **On My Way** works the same way with the On My Way template. iPhones and iPads get `sms:NUMBER&body=MESSAGE`, and Android and other devices get `sms:NUMBER?body=MESSAGE`. The message is URL-encoded. The placeholders `{client}` (the client's first name), `{date}` (e.g. "Tuesday, September 29"), `{time}` (e.g. "10:00 AM") and `{business}` are filled in before the link opens.
- **Directions:** iPhones open Apple Maps (`https://maps.apple.com/?daddr=ADDRESS`). Everything else opens Google Maps (`https://www.google.com/maps/dir/?api=1&destination=ADDRESS`), which opens the Maps app on Android and the website on a computer. The address is URL-encoded, and no API key is needed.
- If a client has no phone number or address, those buttons are hidden, and a short note with an "Add" link appears instead.

On a laptop, the Call and Text links open whatever the computer uses for calls and messages (for example FaceTime/Messages on a Mac, or Phone Link on Windows), or they may do nothing. That is expected. These actions are mainly for the phone.

## Installing on a phone or computer (PWA)

Veronica works fine in a normal browser tab. It can also be added to the home screen so it opens like an app:

- **iPhone/iPad (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*.
- **Computer (Chrome/Edge):** the install icon in the address bar.

The service worker (`public/sw.js`) only makes the app installable and lets the app screen open on a poor connection. It never stores business data: everything under `/api/` always comes from the server. Installing requires HTTPS, except on `localhost`.

## Changing the owner or business details

Everything that identifies the business is in **Settings**: business name, owner name, business phone and both message templates. Nothing about the owner is hard-coded. A new owner can change these at any time, and clients, cleanings, history and payment statuses stay exactly as they were. To change the app password, change `APP_PASSWORD` on the server and restart. All devices then need the new password.

## Repository hygiene

This repository may be public. Never commit real client names, phone numbers, addresses, appointment data, database files, backups, `.env` files, passwords or keys. Demo and test data uses clearly fictional people, `555-010-xxxx` numbers and made-up streets.
