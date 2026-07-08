# Phase 2b Slice 7: Badges & Trophy Case (Design)

**Date:** 2026-07-08
**Status:** Approved (standing mandate)

## Scope

Gamification completes: 8 badge definitions + pure `evaluateBadges(stats)` (TDD) in
`src/lib/badges.js`; earned state persisted at `gamification/state.badges`
(`{id: "YYYY-MM-DD"}` map — once earned, never revoked); MobileApp awards newly earned
badges after each data load (diff vs stored, merge-write, celebratory toast); Home gains
a horizontal trophy-case card (earned vs locked-greyscale) with a badge detail sheet.

## Badges

| id | emoji | name | predicate (over loaded data) |
|---|---|---|---|
| first-session | 🎾 | First Steps | ≥1 session logged |
| sessions-10 | 💪 | Ten Strong | ≥10 sessions |
| streak-5 | 🔥 | 5-Day Streak | streak ≥ 5 |
| streak-14 | ⚡ | Two-Week Fire | streak ≥ 14 |
| first-win | 🏆 | First Win | any match won |
| checkin-7 | ✨ | Week of Check-ins | ≥7 days with wellbeing entries |
| level-5 | ⭐ | Rising Star | level ≥ 5 |
| plan-done | 📋 | Plan Crusher | a Sunday plan fully ticked off |

Predicates read the 60-day window — safe because earned badges persist in Firestore
regardless of later data.

## Out of scope
Level-ladder sheet, XP history, badge push notifications, cutover/PWA (slice 8).

## Verification
Vitest (+~8), build, lint baseline, flag-off untouched; manual: trophy case renders,
earned badges light up after qualifying actions, badge sheet opens.
