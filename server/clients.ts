import type { DB } from './db.js';
import type { Client } from '../shared/types.js';
import { nameKey, searchClients } from '../shared/clients.js';
import { addDays, isValidDate } from '../shared/dates.js';
import { checkAddress, checkName, checkNotes, checkPhone, checkPrice } from '../shared/validation.js';
import { need, NotFoundError, UserError } from './errors.js';
import { serverToday } from './time.js';

export interface ClientRow {
  id: number;
  name: string;
  name_key: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  default_price_cents: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    defaultPriceCents: row.default_price_cents,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getClient(db: DB, id: number): Client {
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRow | undefined;
  if (!row) throw new NotFoundError('We could not find that client.');
  return rowToClient(row);
}

export function listClients(db: DB, options: { search?: string; archived?: boolean } = {}): Client[] {
  const rows = db
    .prepare(`SELECT * FROM clients WHERE archived_at IS ${options.archived ? 'NOT NULL' : 'NULL'} ORDER BY name COLLATE NOCASE`)
    .all() as ClientRow[];
  const clients = rows.map(rowToClient);
  const search = options.search?.trim();
  return search ? searchClients(search, clients) : clients;
}

/** Find a client by name, preferring active clients over removed ones. */
export function findClientByName(db: DB, name: string): Client | null {
  const row = db
    .prepare('SELECT * FROM clients WHERE name_key = ? ORDER BY archived_at IS NOT NULL, id LIMIT 1')
    .get(nameKey(name)) as ClientRow | undefined;
  return row ? rowToClient(row) : null;
}

interface ClientFields {
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  defaultPriceCents: number | null;
}

function readClientInput(input: Record<string, unknown>): ClientFields {
  return {
    name: need(checkName(input.name), 'name'),
    phone: need(checkPhone(input.phone), 'phone'),
    address: need(checkAddress(input.address), 'address'),
    notes: need(checkNotes(input.notes), 'notes'),
    defaultPriceCents: need(checkPrice(input.defaultPrice), 'defaultPrice'),
  };
}

function assertNoDuplicate(db: DB, name: string, exceptId?: number): void {
  const existing = findClientByName(db, name);
  if (existing && existing.id !== exceptId) {
    const where = existing.archivedAt ? ' (in your removed clients)' : '';
    throw new UserError(`You already have a client named ${existing.name}${where}.`, 409, 'name', 'duplicate');
  }
}

export function insertClient(db: DB, fields: ClientFields): Client {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO clients (name, name_key, phone, address, notes, default_price_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(fields.name, nameKey(fields.name), fields.phone, fields.address, fields.notes, fields.defaultPriceCents, now, now);
  return getClient(db, Number(result.lastInsertRowid));
}

export function createClient(db: DB, input: Record<string, unknown>): Client {
  const fields = readClientInput(input);
  assertNoDuplicate(db, fields.name);
  return insertClient(db, fields);
}

export function updateClient(db: DB, id: number, input: Record<string, unknown>): Client {
  getClient(db, id);
  const fields = readClientInput(input);
  assertNoDuplicate(db, fields.name, id);
  db.prepare(
    `UPDATE clients SET name = ?, name_key = ?, phone = ?, address = ?, notes = ?, default_price_cents = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    fields.name,
    nameKey(fields.name),
    fields.phone,
    fields.address,
    fields.notes,
    fields.defaultPriceCents,
    new Date().toISOString(),
    id,
  );
  return getClient(db, id);
}

/**
 * "Remove" a client. Nothing is deleted: the client is hidden from lists,
 * their history stays, repeating cleanings stop, and cleanings still
 * planned from today on are taken off the schedule (one-off ones are marked
 * Canceled so the record remains).
 */
export function archiveClient(db: DB, id: number, todayInput?: unknown): Client {
  getClient(db, id);
  const today = isValidDate(todayInput) ? todayInput : serverToday();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE clients SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    db.prepare(
      `DELETE FROM appointments WHERE client_id = ? AND series_id IS NOT NULL AND status = 'scheduled'
         AND payment_status = 'unpaid' AND date >= ?`,
    ).run(id, today);
    db.prepare(
      `UPDATE appointments SET status = 'canceled', canceled_at = ?, updated_at = ?
       WHERE client_id = ? AND status = 'scheduled' AND date >= ?`,
    ).run(now, now, id, today);
    db.prepare('UPDATE series SET ends_on = ?, updated_at = ? WHERE client_id = ? AND (ends_on IS NULL OR ends_on >= ?)').run(
      addDays(today, -1),
      now,
      id,
      today,
    );
  })();
  return getClient(db, id);
}

export function restoreClient(db: DB, id: number): Client {
  const client = getClient(db, id);
  const other = findClientByName(db, client.name);
  if (other && other.id !== id && !other.archivedAt) {
    throw new UserError(`You already have a client named ${other.name}.`, 409, 'name', 'duplicate');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE clients SET archived_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
  return getClient(db, id);
}
