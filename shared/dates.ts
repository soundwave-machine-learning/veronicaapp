/**
 * Date and time helpers.
 *
 * Veronica stores appointment dates as plain calendar dates ("2026-09-29")
 * and times as 24-hour wall-clock times ("14:30"). There are no time zones
 * involved: 10:00 AM means 10:00 AM wherever the business is. All date math
 * below is done in UTC purely as a calculator so that daylight-saving
 * changes can never shift a date.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MINUTES_PER_DAY = 24 * 60;

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (y < 1900 || y > 2200) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The local calendar date of a JS Date (defaults to now). */
export function toISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Current local time as "HH:MM". */
export function nowTime(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const date = toUTC(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUTC(date);
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Add whole months. If the target month is shorter (e.g. Jan 31 + 1 month)
 * the date is clamped to the last day of that month (Feb 28/29).
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const totalMonths = y * 12 + (m - 1) + months;
  const ny = Math.floor(totalMonths / 12);
  const nm = (totalMonths % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return toUTC(iso).getUTCDay();
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -dayOfWeek(iso));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

/** Weeks (Sunday first) covering the month that contains `iso`. */
export function monthGrid(iso: string): string[][] {
  const first = startOfWeek(startOfMonth(iso));
  const last = endOfMonth(iso);
  const weeks: string[][] = [];
  let cursor = first;
  while (cursor <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function weekDays(iso: string): string[] {
  const first = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "14:30" -> "2:30 PM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "10:00 AM – 12:00 PM" */
export function formatTimeRange(time: string, durationMinutes: number): string {
  return `${formatTime(time)} – ${formatTime(minutesToTime(timeToMinutes(time) + durationMinutes))}`;
}

function fmt(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(toUTC(iso));
}

/** "Tuesday, September 29, 2026" */
export function formatDateLong(iso: string): string {
  return fmt(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Tuesday, September 29" */
export function formatDateFriendly(iso: string): string {
  return fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Tue, Sep 29" */
export function formatDateShort(iso: string): string {
  return fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Tue, Sep 29, 2026" */
export function formatDateShortWithYear(iso: string): string {
  return fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Sep 29" */
export function formatMonthDay(iso: string): string {
  return fmt(iso, { month: 'short', day: 'numeric' });
}

/** "September 2026" */
export function formatMonthYear(iso: string): string {
  return fmt(iso, { month: 'long', year: 'numeric' });
}

/** "Sunday" */
export function formatWeekday(iso: string): string {
  return fmt(iso, { weekday: 'long' });
}

/** "Sep 27 – Oct 3, 2026" */
export function formatWeekRange(iso: string): string {
  const days = weekDays(iso);
  const first = days[0];
  const last = days[6];
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const start = fmt(first, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  const end = fmt(last, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
}

/** Time options for the time picker: every 15 minutes, 6:00 AM – 9:00 PM. */
export function timeOptions(stepMinutes = 15, startHour = 6, endHour = 21): string[] {
  const options: string[] = [];
  for (let minutes = startHour * 60; minutes <= endHour * 60; minutes += stepMinutes) {
    options.push(minutesToTime(minutes));
  }
  return options;
}

/** "2 hours", "1 hour 30 minutes", "45 minutes" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m) parts.push(`${m} minutes`);
  return parts.join(' ') || '0 minutes';
}
