# Phase 2b Slice 2: Log Sheet + Home Screen + Check-in (Design)

**Date:** 2026-07-08
**Status:** Implemented — see docs/superpowers/plans/2026-07-08-phase2b-slice2-home-log.md (post-review: check-in XP limited to first save of the day)
**Author:** Claude session with Allova

## Scope

The shell (slice 1) gains its first real functionality: the FAB's log-session sheet, a
daily check-in sheet, and the Home screen (readiness hero, level/XP card, stat tiles,
check-in card, recent sessions). MobileApp becomes the data shell (single load of
profile/weekLogs/wellbeing/XP, refreshed after saves).

## Decisions

1. **Quick-log writes everything to `weekLogs`** — types `tennis | strength | match |
   other` (no cheer). Strength quick-logs (duration+RPE) are training load and belong in
   the load math; the structured `sessions` collection remains for Sunday-plan exercise
   logging (slice 5). Possible double-count if the same workout is logged both ways —
   accepted for a family app.
   Entry shape: `{ type, duration, rpe (1–10), feel (1–5), sportName? (other),
   result? ("W"|"L", match only), date: toLocalDateStr(now), time: HH:MM }`.
2. **`computeLoadHistory.srpeByType` gains `match` and `strength` keys** (small TDD
   change) so slice 3's chart can color them; totals were already correct.
3. **Daily check-in replaces AM/PM split in the new UI** — one sheet: mood (1–5 stars),
   sleep (hours stepper 4–12), soreness (1–5 stars) → one `wellbeing` doc
   `{ type: "checkin", mood, sleep, soreness, date, time }`. `mergeWellbeingByDate`
   already merges it with any legacy AM/PM docs. Old UI keeps AVWellbeing until cutover.
4. **Readiness** = `clamp(0–100, mood/5×60 + (5−soreness)/5×40)` from TODAY's merged
   wellbeing — new pure `readinessScore(mood, soreness)` (TDD); null when no check-in
   yet (hero shows "Check in to see your energy").
5. **ACWR tile status** via new pure `acwrStatus(acwr)` (TDD): >1.5 "Ease up" (danger),
   >1.3 "Careful" (warn), <0.8 "Push more" (limeDim), else "Balanced" (success); null →
   "No data" (muted).
6. **Third tile = days active this week** (from `computeStreak().activeThisWeek`), not
   season record — imported matches have no W/L field; record becomes real in slice 4.
7. **XP wiring live:** session save awards `xpForSession(sessionSRPE(entry))`; check-in
   awards `XP.CHECKIN` (10). Toasts show the award. Level card reads
   `athletes/{id}/gamification/state.xp`.
8. Slice-1 review Minors fixed here: toast-timer unmount cleanup; `localStorage`
   try/catch guard in App.jsx flag block.

## Out of scope
Alerts on Home (slice 3, they're load-derived), Load/Matches/Plan/Me screens, badges,
tournament scheduler, PWA.

## Verification
Vitest (49 + new lib tests); build green (MobileApp chunk grows); lint baseline; flag-off
untouched; manual: log a session → appears in Recent + old app's LogTab list + XP toast;
check-in → readiness ring fills; streak/tiles update.
