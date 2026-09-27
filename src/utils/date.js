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
