import { describe, expect, it } from 'vitest';
import { findConflicts, slotsOverlap } from '../../shared/conflicts';

const maria = { id: 1, date: '2026-09-29', time: '10:00', durationMinutes: 120, status: 'scheduled' };

describe('conflict detection', () => {
  it('finds overlapping cleanings', () => {
    expect(findConflicts({ date: '2026-09-29', time: '11:00', durationMinutes: 120 }, [maria])).toEqual([maria]);
    expect(findConflicts({ date: '2026-09-29', time: '09:00', durationMinutes: 120 }, [maria])).toEqual([maria]);
    expect(findConflicts({ date: '2026-09-29', time: '10:30', durationMinutes: 30 }, [maria])).toEqual([maria]);
  });

  it('allows back-to-back cleanings', () => {
    expect(findConflicts({ date: '2026-09-29', time: '12:00', durationMinutes: 120 }, [maria])).toEqual([]);
    expect(findConflicts({ date: '2026-09-29', time: '08:00', durationMinutes: 120 }, [maria])).toEqual([]);
  });

  it('ignores other days, canceled cleanings and the cleaning being moved', () => {
    expect(findConflicts({ date: '2026-09-30', time: '10:00', durationMinutes: 120 }, [maria])).toEqual([]);
    expect(findConflicts({ date: '2026-09-29', time: '10:00', durationMinutes: 120 }, [{ ...maria, status: 'canceled' }])).toEqual([]);
    expect(findConflicts({ id: 1, date: '2026-09-29', time: '11:00', durationMinutes: 120 }, [maria])).toEqual([]);
    expect(findConflicts({ date: '2026-09-29', time: '11:00', durationMinutes: 120 }, [maria], [1])).toEqual([]);
  });

  it('handles cleanings that run past midnight', () => {
    const late = { date: '2026-09-29', time: '23:00', durationMinutes: 120 };
    expect(slotsOverlap(late, { date: '2026-09-30', time: '00:30', durationMinutes: 60 })).toBe(true);
    expect(slotsOverlap(late, { date: '2026-09-30', time: '01:00', durationMinutes: 60 })).toBe(false);
  });
});
