/**
 * Make an exact copy of the database while Veronica is running.
 *
 *   npm run backup                  -> <database folder>/backups/veronica-2026-09-29-103000.db
 *   npm run backup -- /some/folder  -> /some/folder/veronica-2026-09-29-103000.db
 *
 * The default folder sits next to the database, so on the server it is on
 * the persistent disk. Copy backups off the server too (see README).
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { backupDatabaseFile, counts, exportData } from '../server/backup.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const source = path.resolve(process.env.DATABASE_PATH?.trim() || './data/veronica.db');
if (!fs.existsSync(source)) {
  console.error(`No database found at ${source}. Is DATABASE_PATH set correctly?`);
  process.exit(1);
}
const folder = path.resolve(process.argv[2] || path.join(path.dirname(source), 'backups'));

const db = openDatabase(source);
const target = await backupDatabaseFile(db, folder);
const summary = counts(exportData(db));
db.close();
console.log(`Backup saved to ${target}`);
console.log(`It contains ${summary.clients} clients and ${summary.appointments} cleanings.`);
