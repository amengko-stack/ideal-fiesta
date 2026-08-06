// ─── TOURNAMENT MATH ─────────────────────────────────────────────────────────
// Pure helpers for the tournament scheduler and the plan auto-taper.

export function daysUntil(dateStr, todayStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date(`${todayStr}T00:00:00`);
  return Math.round((d - t) / 86400000);
}

// Plan week-type from days to the nearest tournament (matches the existing
// tournamentStatus semantics consumed by the plan generator).
export function tournamentModeFor(days) {
  if (days == null) return "normal";
  if (days <= 6) return "week_of";
  if (days <= 13) return "pre";
  return "normal";
}

export function nearestUpcoming(tournaments, todayStr) {
  const upcoming = (tournaments || [])
    .filter(t => t.date && daysUntil(t.date, todayStr) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] || null;
}
