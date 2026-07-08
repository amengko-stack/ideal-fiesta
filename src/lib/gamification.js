// ─── GAMIFICATION MATH ───────────────────────────────────────────────────────
// Pure XP/level math (no Firebase/React imports — tested). The Firestore
// writer lives in gamificationStore.js.

export const XP = { CHECKIN: 10, PLAN_GENERATE: 20, STROKE_UPDATE: 10, BENCHMARK: 15 };
export const XP_PER_LEVEL = 1000;

const TITLES = [
  "Rookie 🌱", "Starter 🎾", "Grinder 💪", "Contender 🔥", "Rising Star ⭐",
  "Challenger ⚡", "Competitor 🏅", "Champion 🏆", "Elite 🌟", "Legend 👑",
];

// XP earned for logging a session, scaled by its training load.
export function xpForSession(srpe) {
  return Math.max(5, Math.round((srpe || 0) / 8));
}

export function levelFromXp(xp) {
  const safe = Math.max(0, Math.floor(xp || 0));
  const level = Math.floor(safe / XP_PER_LEVEL) + 1;
  const intoLevel = safe % XP_PER_LEVEL;
  return {
    level,
    title: TITLES[Math.min(level, TITLES.length) - 1],
    intoLevel,
    toNext: XP_PER_LEVEL - intoLevel,
  };
}
