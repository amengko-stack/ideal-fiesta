import { textAddressesPriority } from "./priorityKeys.js";

// ─── ON-COURT FOCUS LOOP — PURE CORE ──────────────────────────────────────────
// The AI raises focus priorities from match data and the Sunday plan addresses
// them for strength training — but tennis practice itself, the bulk of her
// training time, never gets pointed at them. This module closes that gap: pick
// the one priority to put in front of her this week, turn it into a concrete
// on-court instruction, and read back whether her logged sessions actually
// worked on it. No Firestore import — same split as priorityMetrics.js.

// ── weeklyFocus ──────────────────────────────────────────────────────────────
// Pure. The single priority to surface as this week's on-court focus: escalated
// first, then longest-deferred — the same ordering MobileApp already applies to
// `priorities` before it reaches any screen. Assumes that ordering but doesn't
// require it: sorts defensively so a caller passing an unsorted list still gets
// the right answer. Null when there's nothing open.
export function weeklyFocus(priorities) {
  const open = (priorities || []).filter(p => p && (p.status === "active" || p.status === "escalated"));
  if (open.length === 0) return null;

  const sorted = [...open].sort((a, b) => {
    const esc = (b.status === "escalated") - (a.status === "escalated");
    if (esc !== 0) return esc;
    return (b.weeksDeferredCount ?? 0) - (a.weeksDeferredCount ?? 0);
  });
  return sorted[0];
}

// ── FOCUS_SUGGESTIONS ────────────────────────────────────────────────────────
// key → a short, concrete, kid-readable on-court instruction. Wording is aimed
// at a 12-year-old: a specific number, a specific action, nothing abstract.
const FOCUS_SUGGESTIONS = {
  first_serve:            "Hit 20 first serves to targets before you rally — count how many land in.",
  second_serve:           "Hit 30 second serves to targets before each practice, with full spin, no shortcuts.",
  serve_placement:        "Serve to the corners, not the middle — 10 balls to each target box.",
  return_of_serve:        "Return practice: block back 20 serves deep, focus on just getting it in play.",
  forehand_consistency:   "Rally forehand cross-court for 10 balls without missing, 5 rounds.",
  forehand_offense:       "Practice stepping in on short balls and driving the forehand deep.",
  backhand_consistency:   "Rally backhand cross-court for 10 balls without missing, 5 rounds.",
  backhand_offense:       "Practice attacking short balls on the backhand side with depth.",
  net_play:               "Do 15 approach-and-volley reps — approach, split step, put it away.",
  drop_shot:              "Hit 15 drop shots off a fed ball, then 15 more off a rally ball.",
  rally_tolerance:        "Play out points that must last 10+ shots before anyone can go for a winner.",
  short_point_conversion: "Practice closing out short points — first ball that's short, attack it.",
  movement_footwork:      "Do ladder or cone footwork for 10 minutes before every practice this week.",
  error_control:          "Play rally games where a point is lost only on an unforced error — count them.",
  tactical_patterns:      "Play out the serve-plus-one and return-plus-one patterns from the last plan.",
  physical_conditioning:  "Add 10 minutes of on-court sprint/recovery intervals at the end of practice.",
  mental_competitive:     "Play a practice set that counts — treat every point like it's a real match.",
};

// ── focusPracticeSuggestion ──────────────────────────────────────────────────
// Pure. A concrete on-court instruction for a priority. Falls back to a generic
// instruction built from the priority's own label for "other" or an unknown key
// so there's always something to show.
export function focusPracticeSuggestion(priority) {
  const key = priority?.key;
  if (key && FOCUS_SUGGESTIONS[key]) return FOCUS_SUGGESTIONS[key];
  const label = priority?.priority || "this area";
  return `Spend part of practice this week working directly on: ${label}.`;
}

// ── sessionAddressedPriority ─────────────────────────────────────────────────
// Pure. Did this logged session work on the given priority? Reuses
// textAddressesPriority against the session's own free text — its `focus`
// string plus `sportName` and any `notes`, so a reworded chip or a typed note
// both count.
export function sessionAddressedPriority(sessionLog, priority) {
  if (!sessionLog || !priority) return false;
  const text = [sessionLog.focus, sessionLog.sportName, sessionLog.notes]
    .filter(Boolean)
    .join(" ");
  if (!text) return false;
  return textAddressesPriority(text, priority);
}

// ── practiceEvidence ─────────────────────────────────────────────────────────
// Pure. How much recent practice evidence there is for a priority: how many
// sessions addressed it, the most recent date, and the distinct day count —
// all within `withinDays` (default 28, i.e. the escalation window). Sessions
// with no date are ignored rather than counted, and the result never contains
// NaN even on malformed input.
export function practiceEvidence(sessionLogs, priority, { withinDays = 28 } = {}) {
  const empty = { count: 0, lastDate: null, days: 0 };
  if (!priority) return empty;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - withinDays);
  const cutoffStr = toLocalDate(cutoff);

  const hits = (sessionLogs || []).filter(log => {
    if (!log || !log.date) return false;
    if (String(log.date) < cutoffStr) return false;
    return sessionAddressedPriority(log, priority);
  });

  if (hits.length === 0) return empty;

  const dates = hits.map(h => String(h.date));
  const lastDate = dates.reduce((a, b) => (b > a ? b : a));
  const days = new Set(dates).size;

  return { count: hits.length, lastDate, days };
}

// toLocalDate — same YYYY-MM-DD shape dates.js's toLocalDateStr produces, kept
// local so this module stays free of any other lib import.
function toLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── focusStreakText ──────────────────────────────────────────────────────────
// Pure. The one-line string for the priority card.
export function focusStreakText(evidence) {
  if (!evidence || !evidence.count) return "Not practised yet";
  const times = `${evidence.count}×`;
  return `Practised ${times} in the last 4 weeks — last on ${evidence.lastDate}`;
}
