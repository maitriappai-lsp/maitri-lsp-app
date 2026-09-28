// ---------------------------------------------------------------------------
// `date.toISOString().slice(0, 10)` looks like a harmless way to get
// 'YYYY-MM-DD', but toISOString() first converts to UTC. In a timezone
// ahead of UTC (e.g. IST, UTC+5:30), local midnight for day D is still
// (D-1) 18:30 UTC, so slicing that gives D-1 -- a full day off. This
// shows up as "today" reading as yesterday in the small hours, or a
// date picker's selection landing one day earlier than what was tapped.
// Use these helpers anywhere a plain 'YYYY-MM-DD' is needed from a Date,
// instead of toISOString().
// ---------------------------------------------------------------------------
export function toLocalYMD(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function todayLocalYMD() {
  return toLocalYMD(new Date());
}

// Parses a time string into minutes since midnight, or null if it isn't a
// recognisable time. Handles what the app itself writes -- '4:05:12 PM'
// (toLocaleTimeString) and '16:05' (the time picker) -- plus '10:02 AM'.
export function parseTimeToMinutes(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3] ? m[3].toLowerCase() : null;
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

// True if `timeStr` on `dateYMD` hasn't happened yet (a later date, or
// later today than the current time). Unparseable times return false --
// callers check parseTimeToMinutes() separately for format errors.
export function isFutureTime(dateYMD, timeStr) {
  const today = todayLocalYMD();
  if (dateYMD > today) return true;
  if (dateYMD < today) return false;
  const mins = parseTimeToMinutes(timeStr);
  if (mins == null) return false;
  const now = new Date();
  return mins > now.getHours() * 60 + now.getMinutes();
}
