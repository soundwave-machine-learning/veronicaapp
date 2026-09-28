/**
 * Restore Veronica from a backup (a .json file from Settings -> Download
 * Backup, or a .db file from `npm run backup`).
 *
 *   npm run restore -- /path/to/backup.json          (check only: shows what is inside, changes nothing)
 *   npm run restore -- /path/to/backup.json --yes    (replace all current data with the backup)
 *
 * Before replacing anything, the current data is saved to
 * <database folder>/backups/before-restore-<time>.db, so a restore can be undone.
 * Safe to run while Veronica is running.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { backupDatabaseFile, counts, exportData, readBackupFile, restoreData } from '../server/backup.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const confirmed = process.argv.includes('--yes');
if (!file) {
  console.error('Usage: npm run restore -- /path/to/backup.json [--yes]');
  process.exit(1);
}

let backup;
try {
  backup = readBackupFile(path.resolve(file));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
const inBackup = counts(backup);
console.log(`Backup from ${backup.exportedAt}`);
console.log(`  ${inBackup.clients} clients, ${inBackup.appointments} cleanings, ${inBackup.series} repeating cleanings`);

const databasePath = path.resolve(process.env.DATABASE_PATH?.trim() || './data/veronica.db');
const db = openDatabase(databasePath);
const current = counts(exportData(db));
console.log(`Current database (${databasePath})`);
console.log(`  ${current.clients} clients, ${current.appointments} cleanings, ${current.series} repeating cleanings`);

if (!confirmed) {
  console.log('\nNothing was changed. To replace the current data with this backup, run the same command with --yes at the end.');
  db.close();
  process.exit(0);
}

const safety = await backupDatabaseFile(db, path.join(path.dirname(databasePath), 'backups'), 'before-restore');
console.log(`\nSaved the current data first: ${safety}`);
const after = restoreData(db, backup);
db.close();
console.log(`Restore complete: ${after.clients} clients, ${after.appointments} cleanings, ${after.series} repeating cleanings.`);
if (after.clients !== inBackup.clients || after.appointments !== inBackup.appointments) {
  console.error('WARNING: the numbers do not match the backup. Check the data before using Veronica.');
  process.exit(1);
}
