/**
 * Double-booking protection.
 *
 * Every cleaning blocks out [start, start + duration). Two cleanings conflict
 * when those ranges overlap. Back-to-back cleanings (one ends at 12:00, the
 * next starts at 12:00) do not conflict. Canceled cleanings never conflict.
 */
import { daysBetween, MINUTES_PER_DAY, timeToMinutes } from './dates.js';

export interface TimeSlot {
  id?: number;
  date: string;
  time: string;
  durationMinutes: number;
  status?: string;
}

const EPOCH = '2000-01-01';

/** Absolute minute range so ranges crossing midnight still compare correctly. */
export function slotRange(slot: TimeSlot): [number, number] {
  const start = daysBetween(EPOCH, slot.date) * MINUTES_PER_DAY + timeToMinutes(slot.time);
  return [start, start + Math.max(1, slot.durationMinutes)];
}

export function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  const [aStart, aEnd] = slotRange(a);
  const [bStart, bEnd] = slotRange(b);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Existing cleanings that overlap `candidate`. Canceled cleanings and the
 * cleanings listed in `ignoreIds` (e.g. the one being moved) are skipped.
 */
export function findConflicts<T extends TimeSlot>(
  candidate: TimeSlot,
  existing: T[],
  ignoreIds: Iterable<number> = [],
): T[] {
  const ignore = new Set(ignoreIds);
  if (candidate.id !== undefined) ignore.add(candidate.id);
  return existing
    .filter((slot) => slot.status !== 'canceled')
    .filter((slot) => slot.id === undefined || !ignore.has(slot.id))
    .filter((slot) => slotsOverlap(candidate, slot))
    .sort((a, b) => slotRange(a)[0] - slotRange(b)[0]);
}
