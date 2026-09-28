# Veronica

Veronica is a very simple appointment book for a small residential house-cleaning business.

It is built for an owner who is not very comfortable with computers, so it works like a paper appointment book: large text, large buttons, plain English and only four screens.

- **Today:** the date, how many cleanings there are today, a large **Next Cleaning** card (Directions, Call, Text, On My Way, Complete) and the day's schedule.
- **Calendar:** month and week views. Tap a day to see its cleanings and add another one.
- **Clients:** search by name, phone or address. Each client has a profile with their upcoming and past cleanings.
- **Settings:** business name, owner, phone, usual cleaning length and the two text-message templates.

Adding a cleaning takes three fields: **Client name → Date → Time → Add to Schedule**. Everything else (address, phone, price, notes, repeat) is optional and hidden under *More options*.

Veronica is **not** a CRM, an accounting system or a marketing tool. See [AGENTS.md](AGENTS.md) for the principles that keep it simple.

**Quick links:** [Production deployment](#production-deployment-render) · [First-time setup](#first-time-setup) · [Backing up](#backing-up-veronica) · [Restoring](#restoring-veronica) · [Updating](#updating-veronica) · [Moving to a new owner](#moving-veronica-to-a-new-owner)

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
  index.ts         Starts the server; refuses unsafe production settings
  app.ts           Express routes, security headers, friendly error handling
  db.ts            SQLite connection + schema migrations
  appointments.ts  Cleanings and repeating cleanings
  clients.ts       Clients (with safe "remove" = archive)
  settings.ts      Business settings
  auth.ts          Single-password protection
  backup.ts        Backup export and restore
src/             The web app (React)
  pages/           Today, Calendar, Clients, Client profile, Cleaning details, Settings, Sign in
  components/      Quick Add form, dialogs, buttons, lists, etc.
  styles.css       All styling (large, warm, responsive)
public/          PWA manifest, service worker, icons
scripts/         backup.ts, restore.ts, seed-demo.ts, make-icons.mjs
tests/           Unit tests (tests/unit) and API tests (tests/api)
e2e/             Browser tests for every required workflow, sign-in, first run and screen size
render.yaml      Render hosting configuration (the production host)
Dockerfile       Optional: run Veronica in Docker on any other host
```

## Local installation and development

You need **Node.js 22** (see `.nvmrc`).

```bash
npm install
cp .env.example .env      # the defaults work for local use (no password needed locally)
npm run dev               # open http://localhost:5173
```

`npm run dev` starts the API on port 3000 and the web app with live reload on port 5173.

To try Veronica with made-up demo data, use a separate database file:

```bash
DATABASE_PATH=./data/demo.db npm run seed:demo
DATABASE_PATH=./data/demo.db npm run dev
```

## Production build (any server)

```bash
npm ci --include=dev
npm run build     # web app -> dist/client, server -> dist/server
DATABASE_PATH=/path/on/persistent/disk/veronica.db APP_PASSWORD='a long password' TZ=America/Chicago npm start
```

In production (`npm start` sets `NODE_ENV=production`), Veronica **refuses to start** if `DATABASE_PATH` or `APP_PASSWORD` is missing, or if the password is shorter than 8 characters. This is on purpose: it stops the database from being created somewhere that gets wiped, and it keeps customer details from ever being public.

## Testing

```bash
npm run check       # lint + type check + unit/API tests + production build
npm run test:e2e    # builds, then runs the browser tests against the real production server
```

- **Unit and API tests** (Vitest + Supertest) cover appointment creation, client matching, conflict detection, repeating dates, status, payment, message templates, validation, password protection, security headers, unsafe input, persistence across restarts, and backup/restore round trips.
- **Browser tests** (Playwright) start the production build with a password, on brand-new databases. They cover sign-in (wrong/right password, refresh, direct links, sign out), first-time setup on an empty database, and all 14 required workflows. They also check phone/text/maps links, confirmations, the phone layout, the absence of sideways scrolling at 1440/1024/768/390/320 px, and installability.

## Environment variables

| Name | Required in production | Example | Purpose |
| --- | --- | --- | --- |
| `APP_PASSWORD` | **Yes** (8+ characters) | *(your choice)* | The password to open Veronica. Never commit it. |
| `DATABASE_PATH` | **Yes** | `/var/data/veronica.db` | The SQLite file. **Must be on the persistent disk.** |
| `TZ` | Strongly recommended | `America/Chicago` | The business's time zone ([IANA name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)), e.g. `America/Phoenix`, `America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York` |
| `PORT` | No | `3000` | Set automatically by Render and Docker |
| `SESSION_SECRET` | No | *(random)* | Optional. Signs login cookies. If unset, Veronica creates a random secret and keeps it in the database. |
| `NODE_VERSION` | Render only | `22` | Tells Render which Node.js to use (already in `render.yaml`) |

On Render these are set in the dashboard: **your service → Environment**. Locally they go in `.env`, which Git ignores. Only `.env.example` (no real values) is committed.

## Database

- **SQLite** in one file (`DATABASE_PATH`), opened by the server with foreign keys on, WAL journal mode, and a 5-second busy timeout.
- **Setup is automatic.** On start, the server creates the file and folder if needed and runs any new schema migrations (`server/db.ts`). SQLite's `user_version` records which migrations have run. Each migration runs in a transaction. A database made by a *newer* version of Veronica is never opened by an older one.
- To change the schema later, **add** a new SQL string at the end of `MIGRATIONS`. Never edit one that has already shipped.
- When the host restarts or redeploys, the server finishes open requests and closes the database cleanly (it handles SIGTERM).
- Tables: `settings` (one row), `clients`, `series` (repeat rules), `appointments` (one row per cleaning, linked to its client by `client_id`), and `app_meta` (the random cookie-signing secret; not business data). Prices are stored in cents. Dates are `YYYY-MM-DD` and times are 24-hour `HH:MM` wall-clock values.

## Data persistence

All business data lives in the one SQLite file at `DATABASE_PATH`. On Render that file is on the persistent disk, so it survives page refreshes, browser restarts, server restarts and new deployments. Browsers store no business data (only the sign-in cookie), so the laptop and the phone always show the same schedule.

Business history is never thrown away:

- Completed and canceled cleanings stay in the database and in client history. "Cancel appointment" only sets the status to *Canceled*.
- "Remove client" only hides the client. Their history stays, and they can be brought back from the Clients page. The database refuses to delete a client who has cleanings.
- The only rows ever deleted are *future, still-just-planned* repeat cleanings (scheduled, unpaid) when a repeat is stopped or changed (see [Repeating cleanings](#repeating-cleanings-how-recurrence-works)).

---

## Production deployment (Render)

Veronica runs on **[Render](https://render.com)**. It was chosen because it is the simplest fit for this app:

- It deploys straight from GitHub, and redeploys by itself whenever `main` changes.
- It runs the Node.js server as is, with nothing to rewrite.
- It has **persistent disks**, so the SQLite file survives restarts and deploys. It also **snapshots the disk automatically every day**.
- It gives you a free HTTPS address (`https://<name>.onrender.com`) and optional custom domains.
- The whole setup lives in [`render.yaml`](render.yaml), so there is little to click and little to get wrong.

**Cost:** a disk needs a paid instance. The smallest (**Starter**, about $7/month) plus a 1 GB disk (about $0.25/month) is plenty for one business. Check Render's pricing page for current prices. The free plan can't be used, because it has no disk and would lose data.

What `render.yaml` sets up:

| Setting | Value |
| --- | --- |
| Service | Web service `veronica`, Node runtime, Starter plan, deploys branch `main` automatically |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Health check | `/api/health` |
| Persistent disk | `veronica-data`, 1 GB, mounted at **`/var/data`** |
| `DATABASE_PATH` | **`/var/data/veronica.db`** (on the disk) |
| `APP_PASSWORD`, `TZ` | Asked for when you create the service (never stored in Git) |

> Anything outside `/var/data` is wiped on every deploy. That is why the database, and the backups made on the server, live in `/var/data`.

### Step by step

1. **Connect GitHub.** Create an account at render.com. Choose **Sign up with GitHub** (or later: Account Settings → GitHub → Connect). Allow Render to see the `veronicaapp` repository.
2. **Create the service.** In the Render dashboard, click **New → Blueprint**. Pick the `veronicaapp` repository and the `main` branch. Render reads `render.yaml` and shows one web service, **veronica**, with a disk.
3. **Persistent storage** is created by the Blueprint: a 1 GB disk named `veronica-data`.
4. **Mounting it** is also done by the Blueprint: the disk is mounted at `/var/data`. You can see it under your service → **Disks**.
5. **`DATABASE_PATH`** is preset to `/var/data/veronica.db`. Don't change it. If it ever points outside `/var/data`, data will be lost on the next deploy.
6. **`APP_PASSWORD`**: Render asks for it before creating the service. Type a password of at least 8 characters that your mom can type on her phone, e.g. three words with spaces. Keep a copy somewhere safe, such as a password manager. To change it later: your service → **Environment** → edit `APP_PASSWORD` → **Save Changes** (Render redeploys, and every device has to sign in again).
7. **`TZ`**: Render also asks for this. Enter the business's time zone, for example `America/Phoenix` (Arizona, no daylight saving), `America/Los_Angeles`, `America/Denver`, `America/Chicago` or `America/New_York`. It can be changed later in the same Environment page.
8. **Deploy.** Click **Apply** (or **Create**). The first build takes a few minutes. Watch **Logs** until you see `Veronica is running on port 10000. Database: /var/data/veronica.db` (the port number may differ; the database path must be `/var/data/...`).
9. **Open Veronica.** The address is shown at the top of the service page, e.g. `https://veronica-abcd.onrender.com`. Open it on the laptop, sign in, and **bookmark it**. Open the same address on the phone, sign in, and (optionally) add it to the home screen:
   - **iPhone (Safari):** Share button → *Add to Home Screen*.
   - **Android (Chrome):** menu ⋮ → *Add to Home screen* / *Install app*.
10. **Verify that data persists.** Add a made-up test client (for example "Test Person", phone `555-010-0199`). Then:
    - Reload the page on the laptop and check that it's still there. Open Veronica on the phone and check that it's there too (same data).
    - In Render, click **Manual Deploy → Deploy latest commit** (this is a full redeploy). When it's live again, reload Veronica: the test client must still be there.
    - Remove the test client (Clients → Test Person → Remove Client) when done.

If the service fails to start, the **Logs** tab says why in plain words. For example, *"Veronica did not start: APP_PASSWORD is not set"* means Environment is missing a value.

*Optional: custom domain.* Your service → **Settings → Custom Domains** → add e.g. `schedule.example.com` and follow the DNS instructions. Render provides HTTPS for it automatically.

## First-time setup

After the first deploy, the owner does everything in the app. No developer or database editing is needed:

1. Open the Veronica address and sign in with the password.
2. The Today screen says *"Welcome to Veronica!"*. Click **Open Settings**.
3. Enter the **Business name**, **Owner name** and **Business phone**.
4. Choose **How long a cleaning usually takes** (2 hours to start with).
5. Read the two message templates. The *Example* under each shows exactly what customers will receive. Change the wording if you like.
6. Click **Save Settings**.
7. Go to **Clients → Add Your First Client** (only the name is required), or just use **Add Cleaning**: typing a new name creates the client automatically.
8. Schedule the first cleaning: **Add Cleaning** → client → date → time → **Add to Schedule**.

## Backing up Veronica

Customer information is important. There are three layers of protection, from easiest to most thorough:

1. **Automatic daily disk snapshots (Render).** Render snapshots the persistent disk every day and keeps recent snapshots, typically the last 7 days. Nothing to set up. See them under your service → **Disks**. These protect against mistakes and disk problems, but they live inside Render.
2. **Download Backup (in the app), which copies data off the server. Do this weekly.** In Veronica: **Settings → Download Backup**. This downloads `veronica-backup-YYYY-MM-DD.json`, a complete copy of all clients, cleanings (including repeats, prices, paid/unpaid, completed and canceled), settings and message templates. Save it somewhere outside Render, such as the laptop plus a cloud drive (Google Drive, iCloud, Dropbox). It requires being signed in, and the file contains private customer information, so keep it private.
3. **Exact database copies on the server** (optional, for technical users). Your service → **Shell**, then run:
   ```bash
   npm run backup
   ```
   This makes a consistent copy of the live SQLite file, safely, while Veronica is running. It is saved to `/var/data/backups/veronica-YYYY-MM-DD-HHMMSS.db`, on the persistent disk. To copy one to your computer, use Render's SSH access. Add your public SSH key under Render **Account Settings → SSH Public Keys**, then use the SSH address shown under your service → **Connect → SSH**:
   ```bash
   scp -s <your-service-ssh-address>:/var/data/backups/veronica-2026-09-29-103000.db .
   ```
   Old copies can be deleted from the Shell with `rm /var/data/backups/<file>`.

**Simple routine:** Render's daily snapshots run by themselves. Click *Download Backup* once a week (and before any big change) and keep the file somewhere safe.

## Restoring Veronica

A restore replaces **all** current business data with the backup. Before replacing anything, the restore tool saves the current data to `/var/data/backups/before-restore-<time>.db`, so a restore can itself be undone.

**A. Undo a recent mistake, or recover from a disk problem (service still exists).** Render dashboard → your service → **Disks** → pick a snapshot from before the problem → **Restore**. Render restores the disk and restarts Veronica.

**B. Restore from a downloaded backup file (e.g. the server or service is gone).**

1. If needed, create a fresh service by following [Production deployment](#production-deployment-render).
2. Put the backup file on the disk. Set up SSH as described in *Backing up* above, then run:
   ```bash
   scp -s veronica-backup-2026-09-29.json <your-service-ssh-address>:/var/data/
   ```
3. Open your service → **Shell** and **check** the file first. This changes nothing and shows what is inside:
   ```bash
   npm run restore -- /var/data/veronica-backup-2026-09-29.json
   ```
4. If the numbers look right, restore it:
   ```bash
   npm run restore -- /var/data/veronica-backup-2026-09-29.json --yes
   ```
   `.db` copies made by `npm run backup` work the same way. This is safe while Veronica is running, and no restart is needed.

**Verify the restore:**

- The tool prints `Restore complete: N clients, N cleanings, …`. These must match the numbers it showed for the backup (it warns if they don't).
- Open Veronica and reload. Check **Settings** (business name, templates), the **Clients** list, one client's **Past Cleanings** (paid/unpaid, completed), and a repeating client's upcoming cleanings on the **Calendar**.
- Remove the uploaded file when done: `rm /var/data/veronica-backup-2026-09-29.json`.

*Restoring on a computer instead* (e.g. to look at old data): `npm install && npm run build`, then `DATABASE_PATH=./data/restored.db npm run restore -- backup.json --yes`, then `DATABASE_PATH=./data/restored.db npm run dev`.

## Updating Veronica

1. Before a big update, click **Settings → Download Backup** (just in case).
2. Merge the change into the `main` branch on GitHub (normally through a pull request, after `npm run check` and `npm run test:e2e` pass).
3. Render deploys `main` automatically. Watch the service's **Events/Logs**. Veronica is unavailable for about a minute while the new version starts: with a disk, Render stops the old version before starting the new one.
4. Data is untouched, because it lives on the disk. Any schema changes run automatically on start. Everyone stays signed in.
5. Phones and laptops get the new version the next time Veronica is opened or reloaded. The service worker always checks the network first, so nobody is stuck on an old version, including home-screen installs.

To roll back, use Render's **Deploys** list → an earlier deploy → **Rollback**. The data stays as it is. (A rollback across a database schema change is refused on purpose. In that case, deploy a fixed newer version instead.)

## Moving Veronica to a new owner

Nothing about the owner is hard-coded. Everything that identifies the business can be changed without touching clients, cleanings, history or payments:

1. **In the app:** Settings → change **Business name**, **Owner name**, **Business phone**, and adjust both **message templates** if needed → **Save Settings**.
2. **New password:** Render → your service → **Environment** → change `APP_PASSWORD` → **Save Changes**. All old devices are signed out, and the new owner signs in with the new password.
3. **Time zone,** if the business moves: change `TZ` in the same place.
4. **Handing over the hosting.** Pick one:
   - *Keep the same service:* add the new owner to your Render workspace (Workspace settings → Members) and hand over billing, or keep paying for them.
   - *The new owner runs their own copy:* they copy or fork this GitHub repository and follow [Production deployment](#production-deployment-render) with their own Render account. You then click **Download Backup**, and they restore it with [Restoring Veronica, option B](#restoring-veronica). Everything comes across: clients, notes, cleanings, repeats, prices, paid/unpaid, completed/canceled history, settings and templates.
5. Give the new owner the backup routine (weekly **Download Backup**). Delete any old backup files you no longer need, because they contain customer information.

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

The service worker (`public/sw.js`) only makes the app installable and lets the app screen open on a poor connection. It never stores business data: everything under `/api/` always comes from the server. It fetches pages and files from the network *first*, and a new version of it takes over immediately, so a new deployment reaches every device on its next load. Installing requires HTTPS (Render provides it), except on `localhost`. If the service worker ever misbehaves, deploy a `public/sw.js` that calls `self.registration.unregister()`.

## Security and privacy

- **One password** (`APP_PASSWORD`) protects everything. Every API route with customer data returns *401* without a valid sign-in (tested). The sign-in cookie is `HttpOnly`, `Secure` (in production), `SameSite=Lax`, lasts one year, and is signed with a random secret plus the password. Changing the password signs every device out. Repeated wrong passwords are slowed down (10 tries per 15 minutes).
- **Headers:** Content-Security-Policy (no inline scripts or styles), HSTS behind HTTPS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and a minimal `Permissions-Policy`.
- **Input:** all SQL uses bound parameters. Names, addresses, notes and settings are shown as plain text by React (never as HTML). Message templates only fill in the four known words, and the result is URL-encoded into the `sms:` link. Request bodies are limited to 100 KB.
- **Privacy:** the server logs only start-up messages and unexpected errors (never request bodies or customer details). Error messages shown to the owner are plain sentences, with no stack traces, SQL or file paths.
- **Repository hygiene:** this repository is public. Never commit real client names, phone numbers, addresses, appointment data, database files, backups, `.env` files, passwords or keys. `.gitignore` excludes `.env`, `data/`, `backups/` and `*.db`. Demo and test data uses clearly fictional people, `555-010-xxxx` numbers and made-up streets.

## Other ways to host (optional)

Render is the supported host. To run Veronica elsewhere, the included `Dockerfile` works on any Docker host with a volume:

```bash
docker build -t veronica .
docker run -d --name veronica -p 3000:3000 -v veronica-data:/data \
  -e APP_PASSWORD='a long password' -e TZ='America/Chicago' --restart unless-stopped veronica
```

The image stores the database at `/data/veronica.db`, and needs HTTPS in front of it (e.g. Caddy).
