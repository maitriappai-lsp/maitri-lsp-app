// Shared "latest first" ordering used by every list in the app.
import { parseTimeToMinutes } from './date';

// Trailing number of an id ('PSR-0042' -> 42). Ids without one ('GEO-ALW')
// give -1, so they sort after anything created through the app.
export function idNumber(id) {
  const m = /(\d+)\s*$/.exec(String(id || ''));
  return m ? parseInt(m[1], 10) : -1;
}

// Newest-created first (higher id number first).
export function newestFirstById(a, b) {
  const na = idNumber(a.id);
  const nb = idNumber(b.id);
  if (na !== nb) return nb - na;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

// Newest date first; within a day the later time first (records with no
// readable time go below timed ones); then newest-created first.
// Pass null as timeKey for records that only have a date.
export const latestFirst = (timeKey) => (a, b) => {
  if (a.date !== b.date) return (a.date || '') < (b.date || '') ? 1 : -1;
  const ta = timeKey ? parseTimeToMinutes(a[timeKey]) : null;
  const tb = timeKey ? parseTimeToMinutes(b[timeKey]) : null;
  if (ta != null && tb != null && ta !== tb) return tb - ta;
  if (ta == null && tb != null) return 1;
  if (ta != null && tb == null) return -1;
  return newestFirstById(a, b);
};
