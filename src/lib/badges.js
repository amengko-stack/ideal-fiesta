// ─── BADGES ──────────────────────────────────────────────────────────────────
// Definitions + pure evaluation. Earned state lives in Firestore
// (gamification/state.badges) and is never revoked — evaluateBadges only says
// which predicates are satisfied by the CURRENT data window.

export const BADGES = [
  { id: "first-session", emoji: "🎾", name: "First Steps",       desc: "Logged a first training session.",          hint: "Log any session" },
  { id: "sessions-10",   emoji: "💪", name: "Ten Strong",        desc: "Ten sessions logged. That's a habit!",      hint: "Log 10 sessions" },
  { id: "streak-5",      emoji: "🔥", name: "5-Day Streak",      desc: "Active five days in a row.",                hint: "5 days in a row" },
  { id: "streak-14",     emoji: "⚡", name: "Two-Week Fire",     desc: "Fourteen straight active days!",            hint: "14 days in a row" },
  { id: "first-win",     emoji: "🏆", name: "First Win",         desc: "Won a recorded match.",                     hint: "Win a match" },
  { id: "checkin-7",     emoji: "✨", name: "Week of Check-ins", desc: "Checked in seven different days.",          hint: "Check in 7 days" },
  { id: "level-5",       emoji: "⭐", name: "Rising Star",       desc: "Reached level 5.",                          hint: "Reach level 5" },
  { id: "plan-done",     emoji: "📋", name: "Plan Crusher",      desc: "Finished every exercise in a Sunday plan.", hint: "Tick off a full plan" },
];

const PREDICATES = {
  "first-session": s => (s.sessionCount || 0) >= 1,
  "sessions-10":   s => (s.sessionCount || 0) >= 10,
  "streak-5":      s => (s.streak || 0) >= 5,
  "streak-14":     s => (s.streak || 0) >= 14,
  "first-win":     s => (s.wins || 0) >= 1,
  "checkin-7":     s => (s.checkinDays || 0) >= 7,
  "level-5":       s => (s.level || 0) >= 5,
  "plan-done":     s => !!s.planCompleted,
};

export function evaluateBadges(stats) {
  const s = stats || {};
  return BADGES.filter(b => PREDICATES[b.id](s)).map(b => b.id);
}
