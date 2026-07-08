// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
// Format a Date as YYYY-MM-DD using LOCAL date parts (never toISOString, which
// shifts the calendar day for users east of UTC — this app runs in UTC+7/+8).
export function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday-anchored week window, end-exclusive. weeksAgo=0 is the current week.
export function getWeekBounds(weeksAgo) {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - daysToMonday - weeksAgo * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return {
    start: toLocalDateStr(start),
    end:   toLocalDateStr(end),
  };
}

// This week's Monday as YYYY-MM-DD. Used as the once-per-week guard key for
// deferred-priority counting.
export function currentWeekKey() {
  return getWeekBounds(0).start;
}

// Monday of the week containing the given YYYY-MM-DD date string.
export function weekStartOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - daysToMonday);
  return toLocalDateStr(mon);
}
