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

// The Monday before the one at `weekKey` (YYYY-MM-DD), or null if unparseable.
export function previousWeekKey(weekKey) {
  if (!weekKey) return null;
  const d = new Date(`${weekKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - 7);
  return toLocalDateStr(d);
}

// Is a weekly digest still worth showing? The orchestrator runs on Sunday
// evening, so for most of Monday–Sunday the newest digest is last week's — the
// card would blink out of existence every Monday morning if only the current
// week counted. Anything older than that is stale history, not news.
export function isDigestFresh(weekKey, now = new Date()) {
  if (!weekKey) return false;
  const current = weekStartOf(toLocalDateStr(now));
  return weekKey === current || weekKey === previousWeekKey(current);
}
