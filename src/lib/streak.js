import { toLocalDateStr, weekStartOf } from "./dates.js";

const prevDayStr = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
};

// Streak of consecutive days with ANY entry (activity log, strength session,
// or wellbeing check-in — check-ins keep rest days alive). `today` is injected
// for testability. A streak ending yesterday still counts (grace period: the
// streak isn't dead at breakfast).
export function computeStreak(dateStrs, today) {
  const days = new Set(dateStrs || []);

  let anchor = null;
  if (days.has(today)) anchor = today;
  else if (days.has(prevDayStr(today))) anchor = prevDayStr(today);

  let current = 0;
  for (let d = anchor; d && days.has(d); d = prevDayStr(d)) current++;

  const monday = weekStartOf(today);
  let activeThisWeek = 0;
  for (const d of days) {
    if (d >= monday && d <= today) activeThisWeek++;
  }

  return { current, activeThisWeek };
}
