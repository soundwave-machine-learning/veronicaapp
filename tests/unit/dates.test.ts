import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  formatDateLong,
  formatTime,
  formatTimeRange,
  isValidDate,
  isValidTime,
  monthGrid,
  startOfWeek,
  timeOptions,
} from '../../shared/dates';

describe('dates', () => {
  it('validates dates', () => {
    expect(isValidDate('2026-09-29')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('09/29/2026')).toBe(false);
    expect(isValidDate('')).toBe(false);
    expect(isValidDate(null)).toBe(false);
  });

  it('validates times', () => {
    expect(isValidTime('10:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('10:00 AM')).toBe(false);
  });

  it('adds days across months, years and daylight-saving changes', () => {
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-11-01', 7)).toBe('2026-11-08');
  });

  it('adds months and clamps to the end of short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });

  it('formats times and dates in plain English', () => {
    expect(formatTime('10:00')).toBe('10:00 AM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('16:45')).toBe('4:45 PM');
    expect(formatTimeRange('10:00', 120)).toBe('10:00 AM – 12:00 PM');
    expect(formatDateLong('2026-09-27')).toBe('Sunday, September 27, 2026');
  });

  it('builds month grids that start on Sunday', () => {
    const grid = monthGrid('2026-09-15');
    expect(grid[0][0]).toBe('2026-08-30');
    expect(grid.flat()).toContain('2026-09-30');
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(startOfWeek('2026-10-01')).toBe('2026-09-27');
  });

  it('offers quarter-hour time choices', () => {
    const options = timeOptions();
    expect(options[0]).toBe('06:00');
    expect(options).toContain('10:00');
    expect(options).toContain('12:30');
    expect(options[options.length - 1]).toBe('21:00');
  });
});
