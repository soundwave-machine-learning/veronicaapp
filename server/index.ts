/** Start Veronica: `npm start` (production) or `npm run dev` (development). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const { openDatabase } = await import('./db.js');
const { createApp } = await import('./app.js');
const { authConfigFromEnv } = await import('./auth.js');
const { ensureSeriesThrough } = await import('./appointments.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DATABASE_PATH || './data/veronica.db';
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const db = openDatabase(databasePath);
ensureSeriesThrough(db);

const auth = authConfigFromEnv(process.env);
if (!auth.password) {
  const message = 'APP_PASSWORD is not set: anyone who can reach this server can see your data.';
  console.warn(isProduction ? `WARNING: ${message} Set APP_PASSWORD before going live.` : `Note: ${message}`);
}

// In production the built web app lives in dist/client (next to dist/server).
const staticDir = process.env.STATIC_DIR || path.resolve(here, '../../client');
const app = createApp({ db, auth, staticDir: isProduction || process.env.STATIC_DIR ? staticDir : undefined });

const server = app.listen(port, () => {
  console.log(`Veronica is running on http://localhost:${port} (database: ${path.resolve(databasePath)})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
