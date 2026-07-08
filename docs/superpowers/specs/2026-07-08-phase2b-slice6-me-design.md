# Phase 2b Slice 6: Me Screen + Parent Tools (Design)

**Date:** 2026-07-08
**Status:** Approved (standing mandate)

## Scope

Me tab live: profile card (name, age·sports, level pill, streak pill), **tennis focus
areas** as toggle chips writing `profile.gaps` (the plan generator reads these),
**focus priorities** (active+escalated `deferredPriorities` with Resolve →
`resolveDeferred`), progress tiles, **parent-gated read-only coach section** (latest
benchmark per test with lowerIsBetter-aware trend, latest technical assessment per
stroke with priority badge, growth mini-chart + `growthVelocity` cm/yr from
`profile.measurements`), and settings (parent-mode toggle for parent logins, persisted
in localStorage; sign out).

## Decisions

1. **Parent editors stay in the classic UI** (benchmark logging, stroke assessments,
   AVGrowth measurement entry) — quarterly/occasional flows; classic stays reachable
   at `?newui=0` after cutover. New UI shows read-only summaries. Editors can port
   post-cutover if wanted.
2. `FITNESS_TESTS` moves to `src/lib/fitnessTests.js` (exported); BenchmarksTab imports
   it (tiny Phase-1-style move) — the Me screen needs `lowerIsBetter` for trend arrows.
3. New pure `growthVelocity(measurements)` in `src/lib/growth.js` (TDD): cm/yr from the
   last two height measurements (365.25-day years, 1dp; null if <2 heights or same-day).
4. Parent-mode toggle: visible only when `isParent`; hides/shows the coach section;
   persisted at `localStorage["parentMode"]` (default on).
5. MobileApp finally destructures `isParent` + `onSignOut` (passed since slice 1).

## Out of scope
Badges (slice 7), PWA/cutover (slice 8), parent editor sheets, PHV prediction models.

## Verification
Vitest (+~5), build, lint baseline, flag-off untouched; manual: gap chips round-trip to
classic PlanTab's chips; resolve a priority → disappears + classic PrioritiesTab agrees;
parent toggle hides coach data; sign out returns to login.
