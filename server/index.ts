/** Start Veronica: `npm start` (production) or `npm run dev` (development). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const { openDatabase, getSessionSecret } = await import('./db.js');
const { createApp } = await import('./app.js');
const { authConfigFromEnv } = await import('./auth.js');
const { ensureSeriesThrough } = await import('./appointments.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;

/** Stop with a plain explanation instead of running in an unsafe way. */
function refuseToStart(message: string): never {
  console.error(`\nVeronica did not start: ${message}\n`);
  process.exit(1);
}

// In production these protect the customer data:
// - DATABASE_PATH must be set explicitly, so the database is never silently
//   created inside the app folder (which many hosts wipe on every deploy).
// - APP_PASSWORD must be set, so client details are never public.
if (isProduction) {
  if (!process.env.DATABASE_PATH?.trim()) {
    refuseToStart('DATABASE_PATH is not set. Point it at a file on a persistent disk, for example /var/data/veronica.db.');
  }
  const password = process.env.APP_PASSWORD?.trim() ?? '';
  if (!password) refuseToStart('APP_PASSWORD is not set. Choose the password used to open Veronica.');
  if (password.length < 8) refuseToStart('APP_PASSWORD is too short. Use at least 8 characters.');
}

const databasePath = path.resolve(process.env.DATABASE_PATH?.trim() || './data/veronica.db');
let db: ReturnType<typeof openDatabase>;
try {
  db = openDatabase(databasePath);
} catch (error) {
  refuseToStart(`the database at ${databasePath} could not be opened (${(error as Error).message}).`);
}
ensureSeriesThrough(db);

const auth = authConfigFromEnv(process.env, getSessionSecret(db));
if (!auth.password) {
  console.warn('Note: APP_PASSWORD is not set, so anyone who can reach this computer can open Veronica. Fine for local use only.');
}

// In production the built web app lives in dist/client (next to dist/server).
const staticDir = process.env.STATIC_DIR || path.resolve(here, '../../client');
const app = createApp({ db, auth, staticDir: isProduction || process.env.STATIC_DIR ? staticDir : undefined });

const server = app.listen(port, () => {
  console.log(`Veronica is running on port ${port}. Database: ${databasePath}`);
});

// The host sends SIGTERM before a restart or redeploy: finish, close the database cleanly, exit.
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => {
    db.close();
    process.exit(0);
  }, 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
