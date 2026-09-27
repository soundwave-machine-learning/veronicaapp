import { describe, expect, it } from 'vitest';
import { occurrenceDate, occurrencesThrough } from '../../shared/recurrence';

describe('repeating cleanings', () => {
  it('repeats every week', () => {
    const dates = occurrencesThrough('2026-09-29', 'weekly', 0, '2026-10-20').map((o) => o.date);
    expect(dates).toEqual(['2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20']);
  });

  it('repeats every 2 weeks', () => {
    const dates = occurrencesThrough('2026-09-29', 'biweekly', 0, '2026-11-30').map((o) => o.date);
    expect(dates).toEqual(['2026-09-29', '2026-10-13', '2026-10-27', '2026-11-10', '2026-11-24']);
  });

  it('repeats every month without drifting after short months', () => {
    const dates = occurrencesThrough('2026-01-31', 'monthly', 0, '2026-05-31').map((o) => o.date);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('continues from a given occurrence number', () => {
    const next = occurrencesThrough('2026-09-29', 'weekly', 2, '2026-10-20');
    expect(next).toEqual([
      { index: 2, date: '2026-10-13' },
      { index: 3, date: '2026-10-20' },
    ]);
    expect(occurrenceDate('2026-09-29', 'biweekly', 3)).toBe('2026-11-10');
  });

  it('stops at the end date of a stopped series', () => {
    const dates = occurrencesThrough('2026-09-29', 'weekly', 0, '2026-12-31', '2026-10-06').map((o) => o.date);
    expect(dates).toEqual(['2026-09-29', '2026-10-06']);
  });
});
