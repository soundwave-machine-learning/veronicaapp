/**
 * SQLite database: one file on disk, opened once when the server starts.
 *
 * Schema changes are plain SQL migrations below. Each migration runs once;
 * the number of applied migrations is kept in SQLite's built-in
 * `user_version`. To change the schema later, ADD a new entry to the end of
 * MIGRATIONS — never edit one that has already shipped.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BUSINESS_NAME, DEFAULT_ON_MY_WAY_TEMPLATE, DEFAULT_REMINDER_TEMPLATE } from '../shared/templates.js';

export type DB = Database.Database;

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    business_name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    business_phone TEXT,
    default_duration_minutes INTEGER NOT NULL DEFAULT 120,
    reminder_template TEXT NOT NULL,
    on_my_way_template TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    default_price_cents INTEGER,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX clients_name_key ON clients(name_key);

  CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
    start_date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    price_cents INTEGER,
    notes TEXT,
    next_index INTEGER NOT NULL DEFAULT 0,
    ends_on TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX series_client ON series(client_id);

  CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    series_id INTEGER REFERENCES series(id) ON DELETE RESTRICT,
    series_index INTEGER,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    price_cents INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
    request_id TEXT UNIQUE,
    completed_at TEXT,
    canceled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX appointments_date ON appointments(date, time);
  CREATE INDEX appointments_client ON appointments(client_id, date);
  CREATE INDEX appointments_series ON appointments(series_id, date);
  `,
];

export function openDatabase(filename: string): DB {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new Database(filename);
  if (filename !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
  ensureSettingsRow(db);
}

function ensureSettingsRow(db: DB): void {
  db.prepare(
    `INSERT OR IGNORE INTO settings
      (id, business_name, owner_name, business_phone, default_duration_minutes, reminder_template, on_my_way_template, updated_at)
     VALUES (1, ?, '', NULL, 120, ?, ?, ?)`,
  ).run(DEFAULT_BUSINESS_NAME, DEFAULT_REMINDER_TEMPLATE, DEFAULT_ON_MY_WAY_TEMPLATE, new Date().toISOString());
}
