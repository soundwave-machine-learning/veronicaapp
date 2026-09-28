/**
 * Backups and restores.
 *
 * Two backup formats, both complete:
 * - JSON  (Settings -> Download Backup): easy to download and keep anywhere.
 * - .db   (npm run backup / host disk snapshots): an exact SQLite copy.
 *
 * Restoring replaces all business data (settings, clients, repeating
 * cleanings, cleanings) in one transaction, so it either fully works or
 * changes nothing. It runs safely while Veronica is running.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';

export const BACKUP_TABLES = ['settings', 'clients', 'series', 'appointments'] as const;
type Table = (typeof BACKUP_TABLES)[number];
type Row = Record<string, unknown>;

export interface BackupData {
  app: 'veronica';
  exportedAt: string;
  schemaVersion?: number;
  settings: Row[];
  clients: Row[];
  series: Row[];
  appointments: Row[];
}

export function exportData(db: DB): BackupData {
  return {
    app: 'veronica',
    exportedAt: new Date().toISOString(),
    schemaVersion: db.pragma('user_version', { simple: true }) as number,
    settings: db.prepare('SELECT * FROM settings').all() as Row[],
    clients: db.prepare('SELECT * FROM clients ORDER BY id').all() as Row[],
    series: db.prepare('SELECT * FROM series ORDER BY id').all() as Row[],
    appointments: db.prepare('SELECT * FROM appointments ORDER BY id').all() as Row[],
  };
}

export function counts(data: Pick<BackupData, Table>): Record<Table, number> {
  return {
    settings: data.settings.length,
    clients: data.clients.length,
    series: data.series.length,
    appointments: data.appointments.length,
  };
}

/** Local date and time (the server's TZ), e.g. 2026-09-29-103000 */
function timestamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Exact, consistent copy of the live database file (safe while the app is running). */
export async function backupDatabaseFile(db: DB, folder: string, label = 'veronica'): Promise<string> {
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, `${label}-${timestamp()}.db`);
  await db.backup(target);
  return target;
}

/** Read a backup made either way (.json from the app, or a .db copy). */
export function readBackupFile(file: string): BackupData {
  if (!fs.existsSync(file)) throw new Error(`There is no file at ${file}.`);
  if (file.toLowerCase().endsWith('.json')) {
    return validate(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  const source = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const data: BackupData = {
      app: 'veronica',
      exportedAt: fs.statSync(file).mtime.toISOString(),
      schemaVersion: source.pragma('user_version', { simple: true }) as number,
      settings: [],
      clients: [],
      series: [],
      appointments: [],
    };
    for (const table of BACKUP_TABLES) {
      data[table] = source.prepare(`SELECT * FROM ${table}`).all() as Row[];
    }
    return validate(data);
  } catch (error) {
    throw new Error(`That file is not a Veronica backup (${(error as Error).message}).`, { cause: error });
  } finally {
    source.close();
  }
}

function validate(value: unknown): BackupData {
  const data = value as Partial<BackupData>;
  if (!data || data.app !== 'veronica') throw new Error('That file is not a Veronica backup.');
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(data[table])) throw new Error(`The backup is missing its ${table}.`);
  }
  if (data.settings!.length !== 1) throw new Error('The backup has no business settings.');
  return data as BackupData;
}

/** Replace all business data with the backup's data. All or nothing. */
export function restoreData(db: DB, data: BackupData): Record<Table, number> {
  validate(data);
  const columnsOf = (table: Table) =>
    new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));

  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    db.prepare('DELETE FROM appointments').run();
    db.prepare('DELETE FROM series').run();
    db.prepare('DELETE FROM clients').run();
    db.prepare('DELETE FROM settings').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('clients', 'series', 'appointments')").run();

    for (const table of BACKUP_TABLES) {
      const known = columnsOf(table);
      for (const row of data[table]) {
        // Only copy columns this version knows about (older/newer backups still load).
        const columns = Object.keys(row).filter((column) => known.has(column));
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
        db.prepare(sql).run(...columns.map((column) => row[column] as never));
      }
    }
    const problems = db.pragma('foreign_key_check') as unknown[];
    if (problems.length) throw new Error('The backup is incomplete (some cleanings point to missing clients).');
  })();
  return counts(exportData(db));
}
