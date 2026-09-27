/**
 * Make a safe copy of the database while Veronica is running:
 *   npm run backup                 -> ./backups/veronica-2026-09-29-1030.db
 *   npm run backup -- /some/folder -> /some/folder/veronica-2026-09-29-1030.db
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const source = process.env.DATABASE_PATH || './data/veronica.db';
if (!fs.existsSync(source)) {
  console.error(`No database found at ${path.resolve(source)}.`);
  process.exit(1);
}
const folder = process.argv[2] || './backups';
fs.mkdirSync(folder, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const target = path.join(folder, `veronica-${stamp}.db`);

const db = new Database(source, { readonly: true });
await db.backup(target);
db.close();
console.log(`Backup saved to ${path.resolve(target)}`);
