import { toISODate } from '../shared/dates.js';

/**
 * Today's date on the server, in the server's time zone (set TZ in .env to
 * the business's time zone). The browser sends its own "today" whenever the
 * exact day matters; the server's date is only used as a fallback and to
 * decide how far ahead repeating cleanings are created.
 */
export function serverToday(): string {
  return toISODate(new Date());
}
