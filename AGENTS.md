# AGENTS.md: permanent principles for Veronica

Read this before changing anything. These rules apply to every contributor, human or AI.

## Who this is for

- **Simplicity first.** Every change should make Veronica simpler, or at least keep it just as simple.
- **The primary user is not technical.** Use large text, large buttons with real words (never an unexplained icon), plain English, few screens and minimal typing. Error messages must be friendly and never show stack traces or developer wording.
- **Do not turn Veronica into a generic CRM.** Do not add employee management, inventory, marketing, invoicing/accounting, analytics dashboards or similar features unless the owner explicitly asks.
- **Keep the four destinations:** Today, Calendar, Clients, Settings.

## The workflow to protect

- **Keep quick scheduling quick:** Client name → Date → Time → Add to Schedule. These are the only required fields. Never add a required field to this form. Optional details stay collapsed under "More options".
- Everything updates immediately after saving (no page reloads), and a clear success message is shown.
- Never silently double-book. Keep the conflict warning with Change Time.

## Platform

- **One responsive web app** serves laptop (the main admin screen), tablet and phone (used on the road).
- **No native mobile apps** (no separate iOS/Android projects) unless explicitly requested later. The PWA is optional polish and must never destabilize the core app.
- **No paid SMS dependency** (Twilio etc.) unless explicitly requested later. Texts use `sms:` links, and the user presses Send.
- Maps use normal map URLs, not paid APIs.

## Data

- **Preserve business history.** Never hard-delete completed or canceled cleanings, payment status or clients. Cancel means status = Canceled, and removing a client means archiving. The only allowed deletions are future, still-just-planned repeat cleanings when a repeat is stopped or changed (documented in README).
- Client details live on the client record and are linked by id, not copied onto appointments.
- Owner/business identity lives only in Settings and must never be hard-coded.
- **Never commit customer production data or secrets:** no real names, phone numbers, addresses, appointments, database files, backups, `.env`, passwords, tokens or keys. Demo data must be clearly fictional.
- Schema changes go in a **new** migration at the end of `MIGRATIONS` in `server/db.ts`. Never edit a migration that has already shipped.

## Production

- Production runs on Render from the `main` branch (`render.yaml`). The SQLite file must stay on the persistent disk: `DATABASE_PATH=/var/data/veronica.db`. Never point it anywhere a deploy wipes.
- Keep the production start-up checks (the server refuses to start without `DATABASE_PATH`, or with a missing or short `APP_PASSWORD`). Never weaken authentication to make something easier.
- The service worker must stay network-first and must never cache `/api/`, so new deployments always reach phones.
- Never log request bodies or customer details. Errors shown to the owner stay plain sentences.
- Keep backups restorable: if the schema changes, make sure `npm run restore` still loads older backups (it copies known columns) and extend `tests/api/backup.test.ts`.

## Engineering

- **Test before merging.** Run `npm run check` (lint, typecheck, unit/API tests, build) and `npm run test:e2e` (browser workflows and screen sizes). Do not merge with failing tests.
- Business rules belong in `shared/` with unit tests. Keep the server and UI thin.
- **Avoid unnecessary architectural rewrites.** The stack is React + Vite, Express, and SQLite. Keep it unless there is a concrete, explained reason to change.
- Accessibility is required, not optional: semantic HTML, visible labels, keyboard access, visible focus, good contrast, touch targets of at least 44px, and status shown in words, never by color alone.
- Check layouts at 1440, 1024, 768, 390 and 320 px wide. There must be no sideways page scrolling.
