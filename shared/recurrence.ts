/**
 * Repeating cleanings.
 *
 * A repeating cleaning is stored as a "series" (start date + how often).
 * Individual cleanings are real appointment rows created from the series a
 * few months ahead at a time. Occurrence number N is always calculated from
 * the series start date (never from the previous occurrence) so monthly
 * dates never drift: Jan 31 -> Feb 28 -> Mar 31 -> Apr 30 ...
 */
import { addDays, addMonths } from './dates.js';

export const REPEAT_OPTIONS = ['none', 'weekly', 'biweekly', 'monthly'] as const;
export type Repeat = (typeof REPEAT_OPTIONS)[number];
export type RepeatFrequency = Exclude<Repeat, 'none'>;

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Doesn't repeat",
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
};

export function isRepeat(value: unknown): value is Repeat {
  return typeof value === 'string' && (REPEAT_OPTIONS as readonly string[]).includes(value);
}

/** How many days ahead repeating cleanings are created by default. */
export const SERIES_HORIZON_DAYS = 183;
/** Never create occurrences further than this many days ahead. */
export const SERIES_MAX_DAYS_AHEAD = 5 * 366;

/** Date of occurrence number `index` (0 = the first cleaning). */
export function occurrenceDate(startDate: string, frequency: RepeatFrequency, index: number): string {
  switch (frequency) {
    case 'weekly':
      return addDays(startDate, 7 * index);
    case 'biweekly':
      return addDays(startDate, 14 * index);
    case 'monthly':
      return addMonths(startDate, index);
  }
}

export interface Occurrence {
  index: number;
  date: string;
}

/**
 * Occurrences from `fromIndex` up to and including `throughDate`
 * (and not after `endsOn` when the series has been stopped).
 */
export function occurrencesThrough(
  startDate: string,
  frequency: RepeatFrequency,
  fromIndex: number,
  throughDate: string,
  endsOn: string | null = null,
): Occurrence[] {
  const limit = endsOn && endsOn < throughDate ? endsOn : throughDate;
  const result: Occurrence[] = [];
  for (let index = fromIndex; ; index++) {
    const date = occurrenceDate(startDate, frequency, index);
    if (date > limit) break;
    result.push({ index, date });
    if (result.length > 1000) break; // safety net
  }
  return result;
}
