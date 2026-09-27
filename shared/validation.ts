/**
 * Input checking shared by the browser (instant feedback) and the server
 * (the real safety net). Every message is written for a non-technical user.
 */
import { isValidDate, isValidTime } from './dates.js';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

export const LIMITS = {
  name: 100,
  address: 300,
  notes: 2000,
  template: 1000,
  maxPriceCents: 10_000_000, // $100,000
  minDuration: 15,
  maxDuration: 12 * 60,
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/** Trim and collapse repeated spaces. */
export function tidy(value: unknown): string {
  return text(value).replace(/\s+/g, ' ').trim();
}

export function checkName(value: unknown, label = 'client name'): Result<string> {
  const name = tidy(value);
  if (!name) return fail(`Please enter the ${label}.`);
  if (name.length > LIMITS.name) return fail(`That ${label} is too long. Please shorten it.`);
  return ok(name);
}

export function checkDate(value: unknown): Result<string> {
  const date = text(value).trim();
  if (!date) return fail('Please choose a date.');
  if (!isValidDate(date)) return fail('That date does not look right. Please choose a date from the calendar.');
  return ok(date);
}

export function checkTime(value: unknown): Result<string> {
  const time = text(value).trim();
  if (!time) return fail('Please choose a time.');
  if (!isValidTime(time)) return fail('That time does not look right. Please choose a time from the list.');
  return ok(time);
}

/** Optional phone. Returns a nicely formatted number, or null when empty. */
export function checkPhone(value: unknown): Result<string | null> {
  const raw = text(value).trim();
  if (!raw) return ok(null);
  if (!/^[\d\s().+-]+$/.test(raw)) {
    return fail('Please check the phone number. Use only numbers, like (555) 123-4567.');
  }
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && !raw.startsWith('+1')) {
    if (digits.length >= 8 && digits.length <= 15) return ok(`+${digits}`);
    return fail('Please check the phone number. It looks too short or too long.');
  }
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) {
    return fail('Please check the phone number. It should have 10 digits, like (555) 123-4567.');
  }
  return ok(`(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`);
}

/** Optional price in dollars ("120", "$120.50", "1,200"). Returns cents, or null when empty. */
export function checkPrice(value: unknown): Result<number | null> {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return fail('Please enter a price like 120 or 120.50.');
    return checkPrice(value.toFixed(2));
  }
  const raw = text(value).trim().replace(/^\$\s*/, '').replace(/,/g, '');
  if (!raw) return ok(null);
  if (!/^\d+(\.\d{1,2})?$/.test(raw) && !/^\.\d{1,2}$/.test(raw)) {
    return fail('Please enter a price like 120 or 120.50.');
  }
  const cents = Math.round(Number(raw) * 100);
  if (cents > LIMITS.maxPriceCents) return fail('That price looks too large. Please check it.');
  return ok(cents);
}

/** Optional price already in cents (used by the API). */
export function checkPriceCents(value: unknown): Result<number | null> {
  if (value === null || value === undefined || value === '') return ok(null);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return fail('Please enter a price like 120 or 120.50.');
  }
  if (value > LIMITS.maxPriceCents) return fail('That price looks too large. Please check it.');
  return ok(value);
}

export function checkAddress(value: unknown): Result<string | null> {
  const address = tidy(value);
  if (!address) return ok(null);
  if (address.length > LIMITS.address) return fail('That address is too long. Please shorten it.');
  return ok(address);
}

export function checkNotes(value: unknown): Result<string | null> {
  const notes = text(value).trim();
  if (!notes) return ok(null);
  if (notes.length > LIMITS.notes) return fail('Those notes are too long. Please shorten them.');
  return ok(notes);
}

export function checkDuration(value: unknown): Result<number> {
  const minutes = typeof value === 'number' ? value : Number(text(value));
  if (!Number.isInteger(minutes) || minutes < LIMITS.minDuration || minutes > LIMITS.maxDuration) {
    return fail('Please choose how long the cleaning takes (between 15 minutes and 12 hours).');
  }
  return ok(minutes);
}

export function checkTemplate(value: unknown, label: string): Result<string> {
  const template = text(value).trim();
  if (!template) return fail(`Please enter the ${label}.`);
  if (template.length > LIMITS.template) return fail(`The ${label} is too long. Please shorten it.`);
  return ok(template);
}

/** 12000 -> "$120", 12050 -> "$120.50" */
export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Cents -> value for a price input box ("120" or "120.50"). */
export function priceInputValue(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
