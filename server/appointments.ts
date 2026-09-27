/**
 * Cleanings (appointments) and repeating cleanings (series).
 *
 * See README "Repeating cleanings" for the design. In short: a series row
 * describes the repeat rule, and real appointment rows are created from it
 * up to a horizon (about 6 months ahead, further when the calendar is
 * viewed further ahead). Every cleaning is therefore an ordinary row that
 * can be completed, paid, moved or canceled on its own.
 */
import type { DB } from './db.js';
import type {
  Appointment,
  AppointmentStatus,
  Client,
  ConflictInfo,
  CreateAppointmentResult,
  PaymentStatus,
} from '../shared/types.js';
import { APPOINTMENT_STATUSES, PAYMENT_STATUSES } from '../shared/types.js';
import { addDays, isValidDate } from '../shared/dates.js';
import { findConflicts, type TimeSlot } from '../shared/conflicts.js';
import {
  isRepeat,
  occurrencesThrough,
  SERIES_HORIZON_DAYS,
  SERIES_MAX_DAYS_AHEAD,
  type RepeatFrequency,
} from '../shared/recurrence.js';
import { nameKey } from '../shared/clients.js';
import {
  checkAddress,
  checkDate,
  checkDuration,
  checkName,
  checkNotes,
  checkPhone,
  checkPrice,
  checkTime,
} from '../shared/validation.js';
import { ConflictError, need, NotFoundError, UserError } from './errors.js';
import { findClientByName, getClient, insertClient } from './clients.js';
import { getSettings } from './settings.js';
import { serverToday } from './time.js';

interface AppointmentRow {
  id: number;
  client_id: number;
  series_id: number | null;
  series_index: number | null;
  date: string;
  time: string;
  duration_minutes: number;
  price_cents: number | null;
  notes: string | null;
  status: AppointmentStatus;
  payment_status: PaymentStatus;
  request_id: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  client_name: string;
  client_phone: string | null;
  client_address: string | null;
  client_archived_at: string | null;
  series_frequency: RepeatFrequency | null;
  series_start_date: string | null;
  series_ends_on: string | null;
}

interface SeriesRow {
  id: number;
  client_id: number;
  frequency: RepeatFrequency;
  start_date: string;
  time: string;
  duration_minutes: number;
  price_cents: number | null;
  notes: string | null;
  next_index: number;
  ends_on: string | null;
}

const SELECT = `
  SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address,
         c.archived_at AS client_archived_at, s.frequency AS series_frequency,
         s.start_date AS series_start_date, s.ends_on AS series_ends_on
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
  LEFT JOIN series s ON s.id = a.series_id`;

const ORDER = ' ORDER BY a.date, a.time, a.id';

function rowToAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    clientId: row.client_id,
    seriesId: row.series_id,
    date: row.date,
    time: row.time,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    notes: row.notes,
    status: row.status,
    paymentStatus: row.payment_status,
    completedAt: row.completed_at,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: {
      id: row.client_id,
      name: row.client_name,
      phone: row.client_phone,
      address: row.client_address,
      archivedAt: row.client_archived_at,
    },
    series:
      row.series_id && row.series_frequency && row.series_start_date
        ? {
            id: row.series_id,
            frequency: row.series_frequency,
            startDate: row.series_start_date,
            endsOn: row.series_ends_on,
          }
        : null,
  };
}

const now = () => new Date().toISOString();

function defaultHorizon(): string {
  return addDays(serverToday(), SERIES_HORIZON_DAYS);
}

/* ------------------------------------------------------------------ */
/* Repeating cleanings                                                 */
/* ------------------------------------------------------------------ */

/**
 * Make sure every active series has its cleanings created up to `through`.
 * Safe to call often: it only adds occurrences that were never created
 * before (tracked by series.next_index), so moved or canceled cleanings are
 * never re-created.
 */
export function ensureSeriesThrough(db: DB, through: string = defaultHorizon()): number {
  const cap = addDays(serverToday(), SERIES_MAX_DAYS_AHEAD);
  const limit = through > cap ? cap : through;
  const seriesList = db.prepare('SELECT * FROM series WHERE ends_on IS NULL OR ends_on >= start_date').all() as SeriesRow[];
  const insert = db.prepare(
    `INSERT INTO appointments (client_id, series_id, series_index, date, time, duration_minutes, price_cents, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const advance = db.prepare('UPDATE series SET next_index = ?, updated_at = ? WHERE id = ?');
  let created = 0;
  db.transaction(() => {
    for (const series of seriesList) {
      const occurrences = occurrencesThrough(series.start_date, series.frequency, series.next_index, limit, series.ends_on);
      if (!occurrences.length) continue;
      const stamp = now();
      for (const occurrence of occurrences) {
        insert.run(
          series.client_id,
          series.id,
          occurrence.index,
          occurrence.date,
          series.time,
          series.duration_minutes,
          series.price_cents,
          series.notes,
          stamp,
          stamp,
        );
      }
      advance.run(occurrences[occurrences.length - 1].index + 1, stamp, series.id);
      created += occurrences.length;
    }
  })();
  return created;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export function getAppointment(db: DB, id: number): Appointment {
  const row = db.prepare(`${SELECT} WHERE a.id = ?`).get(id) as AppointmentRow | undefined;
  if (!row) throw new NotFoundError('We could not find that cleaning.');
  return rowToAppointment(row);
}

export function listAppointments(db: DB, options: { from?: string; to?: string; clientId?: number } = {}): Appointment[] {
  const { from, to, clientId } = options;
  if (from !== undefined && !isValidDate(from)) throw new UserError('That date does not look right.');
  if (to !== undefined && !isValidDate(to)) throw new UserError('That date does not look right.');
  const horizon = defaultHorizon();
  ensureSeriesThrough(db, to && to > horizon ? to : horizon);

  const where: string[] = [];
  const params: unknown[] = [];
  if (from) {
    where.push('a.date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('a.date <= ?');
    params.push(to);
  }
  if (clientId !== undefined) {
    where.push('a.client_id = ?');
    params.push(clientId);
  }
  const sql = `${SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${ORDER}`;
  return (db.prepare(sql).all(...params) as AppointmentRow[]).map(rowToAppointment);
}

/** The first scheduled cleaning after `date` (used when today's work is done). */
export function nextScheduledAfter(db: DB, date: string): Appointment | null {
  if (!isValidDate(date)) throw new UserError('That date does not look right.');
  ensureSeriesThrough(db);
  const row = db.prepare(`${SELECT} WHERE a.status = 'scheduled' AND a.date > ?${ORDER} LIMIT 1`).get(date) as
    | AppointmentRow
    | undefined;
  return row ? rowToAppointment(row) : null;
}

/** Completed cleanings that have a price and are not paid yet. */
export function listUnpaid(db: DB): Appointment[] {
  const rows = db
    .prepare(
      `${SELECT} WHERE a.status = 'completed' AND a.payment_status = 'unpaid' AND a.price_cents IS NOT NULL
       ORDER BY a.date DESC, a.time DESC LIMIT 100`,
    )
    .all() as AppointmentRow[];
  return rows.map(rowToAppointment);
}

/* ------------------------------------------------------------------ */
/* Conflicts                                                           */
/* ------------------------------------------------------------------ */

function findFirstConflict(db: DB, slots: TimeSlot[], ignoreIds: number[] = []): ConflictInfo | null {
  if (!slots.length) return null;
  const dates = slots.map((slot) => slot.date).sort();
  // One day of padding on each side catches cleanings that run past midnight.
  const rows = db
    .prepare(`${SELECT} WHERE a.status != 'canceled' AND a.date >= ? AND a.date <= ?${ORDER}`)
    .all(addDays(dates[0], -1), addDays(dates[dates.length - 1], 1)) as AppointmentRow[];
  const existing = rows.map((row) => ({ ...rowToAppointment(row) }));
  const byDate = new Map<string, Appointment[]>();
  for (const appointment of existing) {
    const list = byDate.get(appointment.date) ?? [];
    list.push(appointment);
    byDate.set(appointment.date, list);
  }
  const sortedSlots = [...slots].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  for (const slot of sortedSlots) {
    const nearby = [
      ...(byDate.get(addDays(slot.date, -1)) ?? []),
      ...(byDate.get(slot.date) ?? []),
      ...(byDate.get(addDays(slot.date, 1)) ?? []),
    ];
    const conflicts = findConflicts(slot, nearby, ignoreIds);
    if (conflicts.length) {
      return { requestedDate: slot.date, requestedTime: slot.time, appointment: conflicts[0] };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Creating                                                            */
/* ------------------------------------------------------------------ */

function readRequestId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 100);
}

/**
 * Quick add: client name + date + time are all that is required. The
 * client is matched by name (so "maria johnson" re-uses Maria Johnson) and
 * created automatically when new.
 */
export function createAppointment(db: DB, input: Record<string, unknown>): CreateAppointmentResult {
  const name = need(checkName(input.clientName), 'clientName');
  const date = need(checkDate(input.date), 'date');
  const time = need(checkTime(input.time), 'time');
  const phone = need(checkPhone(input.phone), 'phone');
  const address = need(checkAddress(input.address), 'address');
  const price = need(checkPrice(input.price), 'price');
  const notes = need(checkNotes(input.notes), 'notes');
  const repeat = input.repeat === undefined || input.repeat === null || input.repeat === '' ? 'none' : input.repeat;
  if (!isRepeat(repeat)) throw new UserError('Please choose how often this cleaning repeats.', 400, 'repeat');
  const requestId = readRequestId(input.requestId);
  const allowConflict = input.allowConflict === true;

  // Same form submitted twice (double click, flaky connection): return the first result.
  if (requestId) {
    const previous = db.prepare('SELECT id FROM appointments WHERE request_id = ?').get(requestId) as { id: number } | undefined;
    if (previous) {
      const appointment = getAppointment(db, previous.id);
      return {
        appointment,
        client: getClient(db, appointment.clientId),
        createdCount: 0,
        clientCreated: false,
        duplicate: true,
      };
    }
  }

  let client: Client | null = null;
  const clientId = Number(input.clientId);
  if (input.clientId !== undefined && input.clientId !== null && input.clientId !== '' && Number.isInteger(clientId)) {
    const chosen = getClient(db, clientId);
    // Only trust the chosen client if the name still matches what was typed.
    if (nameKey(chosen.name) === nameKey(name)) client = chosen;
  }
  client ??= findClientByName(db, name);

  const settings = getSettings(db);
  const duration = settings.defaultDurationMinutes;
  const priceCents = price ?? client?.defaultPriceCents ?? null;

  const through = addDays(serverToday(), SERIES_HORIZON_DAYS);
  const occurrences =
    repeat === 'none' ? [{ index: 0, date }] : occurrencesThrough(date, repeat, 0, date > through ? date : through);
  const slots = occurrences.map((occurrence) => ({ date: occurrence.date, time, durationMinutes: duration }));

  ensureSeriesThrough(db, occurrences[occurrences.length - 1].date);
  if (!allowConflict) {
    const conflict = findFirstConflict(db, slots);
    if (conflict) throw new ConflictError(conflict);
  }

  let clientCreated = false;
  let firstId = 0;
  db.transaction(() => {
    const stamp = now();
    if (!client) {
      client = insertClient(db, { name, phone, address, notes: null, defaultPriceCents: price });
      clientCreated = true;
    } else {
      // Extra details typed in the quick-add form are saved on the client record.
      db.prepare(
        `UPDATE clients SET phone = COALESCE(?, phone), address = COALESCE(?, address),
           default_price_cents = COALESCE(default_price_cents, ?), archived_at = NULL, updated_at = ? WHERE id = ?`,
      ).run(phone, address, price, stamp, client.id);
    }

    let seriesId: number | null = null;
    if (repeat !== 'none') {
      const result = db
        .prepare(
          `INSERT INTO series (client_id, frequency, start_date, time, duration_minutes, price_cents, notes, next_index, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(client.id, repeat, date, time, duration, priceCents, notes, occurrences.length, stamp, stamp);
      seriesId = Number(result.lastInsertRowid);
    }

    const insert = db.prepare(
      `INSERT INTO appointments (client_id, series_id, series_index, date, time, duration_minutes, price_cents, notes,
         request_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    occurrences.forEach((occurrence, i) => {
      const result = insert.run(
        client!.id,
        seriesId,
        seriesId ? occurrence.index : null,
        occurrence.date,
        time,
        duration,
        priceCents,
        notes,
        i === 0 ? requestId : null,
        stamp,
        stamp,
      );
      if (i === 0) firstId = Number(result.lastInsertRowid);
    });
  })();

  const finalClient = getClient(db, client!.id);
  return {
    appointment: getAppointment(db, firstId),
    client: finalClient,
    createdCount: occurrences.length,
    clientCreated,
    duplicate: false,
  };
}

/* ------------------------------------------------------------------ */
/* Changing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Edit or reschedule a cleaning.
 *
 * scope "one" (default): only this cleaning changes. For repeating
 * cleanings this is always safe; the rest of the series is untouched.
 *
 * scope "future": this cleaning and every later one in the series move to
 * the new day/time. The old series stops before this cleaning and a new
 * series starts from the new date. Completed, canceled and paid cleanings
 * are never touched.
 */
export function updateAppointment(db: DB, id: number, input: Record<string, unknown>): Appointment {
  const existing = getAppointment(db, id);
  const date = need(checkDate(input.date), 'date');
  const time = need(checkTime(input.time), 'time');
  const duration =
    input.durationMinutes === undefined ? existing.durationMinutes : need(checkDuration(input.durationMinutes), 'durationMinutes');
  const priceCents = input.price === undefined ? existing.priceCents : need(checkPrice(input.price), 'price');
  const notes = input.notes === undefined ? existing.notes : need(checkNotes(input.notes), 'notes');
  const allowConflict = input.allowConflict === true;
  const scope = input.scope === 'future' && existing.seriesId ? 'future' : 'one';
  const today = isValidDate(input.today) ? input.today : serverToday();

  if (scope === 'one') {
    ensureSeriesThrough(db, date);
    if (existing.status !== 'canceled' && !allowConflict) {
      const conflict = findFirstConflict(db, [{ id, date, time, durationMinutes: duration }]);
      if (conflict) throw new ConflictError(conflict);
    }
    db.prepare(
      'UPDATE appointments SET date = ?, time = ?, duration_minutes = ?, price_cents = ?, notes = ?, updated_at = ? WHERE id = ?',
    ).run(date, time, duration, priceCents, notes, now(), id);
    return getAppointment(db, id);
  }

  // scope === 'future'
  const series = db.prepare('SELECT * FROM series WHERE id = ?').get(existing.seriesId) as SeriesRow;
  const from = existing.date > today ? existing.date : today;
  ensureSeriesThrough(db);
  const replaceable = (
    db
      .prepare(
        `SELECT id FROM appointments WHERE series_id = ? AND id != ? AND status = 'scheduled'
           AND payment_status = 'unpaid' AND date >= ?`,
      )
      .all(series.id, id, from) as { id: number }[]
  ).map((row) => row.id);

  const through = addDays(serverToday(), SERIES_HORIZON_DAYS);
  const occurrences = occurrencesThrough(date, series.frequency, 0, date > through ? date : through);
  ensureSeriesThrough(db, occurrences[occurrences.length - 1].date);
  if (!allowConflict) {
    const slots = occurrences.map((occurrence) => ({ date: occurrence.date, time, durationMinutes: duration }));
    const conflict = findFirstConflict(db, slots, [id, ...replaceable, ...seriesIdsToIgnore(db, series.id, from)]);
    if (conflict) throw new ConflictError(conflict);
  }

  db.transaction(() => {
    const stamp = now();
    if (replaceable.length) {
      db.prepare(`DELETE FROM appointments WHERE id IN (${replaceable.map(() => '?').join(',')})`).run(...replaceable);
    }
    db.prepare('UPDATE series SET ends_on = ?, updated_at = ? WHERE id = ?').run(addDays(existing.date, -1), stamp, series.id);
    const result = db
      .prepare(
        `INSERT INTO series (client_id, frequency, start_date, time, duration_minutes, price_cents, notes, next_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(series.client_id, series.frequency, date, time, duration, priceCents, notes, occurrences.length, stamp, stamp);
    const newSeriesId = Number(result.lastInsertRowid);
    db.prepare(
      `UPDATE appointments SET series_id = ?, series_index = 0, date = ?, time = ?, duration_minutes = ?, price_cents = ?,
         notes = ?, updated_at = ? WHERE id = ?`,
    ).run(newSeriesId, date, time, duration, priceCents, notes, stamp, id);
    const insert = db.prepare(
      `INSERT INTO appointments (client_id, series_id, series_index, date, time, duration_minutes, price_cents, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const occurrence of occurrences.slice(1)) {
      insert.run(series.client_id, newSeriesId, occurrence.index, occurrence.date, time, duration, priceCents, notes, stamp, stamp);
    }
  })();
  return getAppointment(db, id);
}

/** Paid future cleanings of the old series stay put; don't let them block their own move. */
function seriesIdsToIgnore(db: DB, seriesId: number, from: string): number[] {
  return (
    db.prepare(`SELECT id FROM appointments WHERE series_id = ? AND status = 'scheduled' AND date >= ?`).all(seriesId, from) as {
      id: number;
    }[]
  ).map((row) => row.id);
}

export function setStatus(db: DB, id: number, statusInput: unknown, allowConflict = false): Appointment {
  if (!APPOINTMENT_STATUSES.includes(statusInput as AppointmentStatus)) {
    throw new UserError('Please choose Scheduled, Completed or Canceled.', 400, 'status');
  }
  const status = statusInput as AppointmentStatus;
  const existing = getAppointment(db, id);
  if (existing.status === status) return existing;

  if (existing.status === 'canceled' && status !== 'canceled' && !allowConflict) {
    const conflict = findFirstConflict(db, [existing]);
    if (conflict) throw new ConflictError(conflict);
  }
  const stamp = now();
  db.prepare(
    `UPDATE appointments SET status = ?, completed_at = ?, canceled_at = ?, updated_at = ? WHERE id = ?`,
  ).run(status, status === 'completed' ? stamp : null, status === 'canceled' ? stamp : null, stamp, id);
  return getAppointment(db, id);
}

export function setPaymentStatus(db: DB, id: number, value: unknown): Appointment {
  if (!PAYMENT_STATUSES.includes(value as PaymentStatus)) {
    throw new UserError('Please choose Paid or Unpaid.', 400, 'paymentStatus');
  }
  getAppointment(db, id);
  db.prepare('UPDATE appointments SET payment_status = ?, updated_at = ? WHERE id = ?').run(value, now(), id);
  return getAppointment(db, id);
}

/**
 * Stop a repeating cleaning after the given cleaning. That cleaning and
 * everything before it stays. Later cleanings that are still just planned
 * (scheduled, unpaid) are taken off the calendar; completed, canceled or
 * paid ones are kept as history.
 */
export function stopRepeating(db: DB, id: number, todayInput?: unknown): { appointment: Appointment; removed: number } {
  const existing = getAppointment(db, id);
  if (!existing.seriesId) throw new UserError('This cleaning does not repeat.', 400);
  const today = isValidDate(todayInput) ? todayInput : serverToday();
  let removed = 0;
  db.transaction(() => {
    ensureSeriesThrough(db);
    const result = db
      .prepare(
        `DELETE FROM appointments WHERE series_id = ? AND id != ? AND status = 'scheduled' AND payment_status = 'unpaid'
           AND date > ? AND date >= ?`,
      )
      .run(existing.seriesId, id, existing.date, today);
    removed = result.changes;
    db.prepare('UPDATE series SET ends_on = ?, updated_at = ? WHERE id = ?').run(existing.date, now(), existing.seriesId);
  })();
  return { appointment: getAppointment(db, id), removed };
}
