# Phase 2b Slice 4: Matches Screen (Design)

**Date:** 2026-07-08
**Status:** Implemented — see docs/superpowers/plans/2026-07-08-phase2b-slice4-matches.md

## Scope

Matches tab goes live: win-rate ring hero (from `whoWonMatch === 1` over the top-level
`matches` collection), last-5 form chips, match history list, match detail sheet
(set scores, key stats, and the existing AI coaching report from
`athletes/{id}/matchAnalyses/{matchId}` when present), `.matchtrack` import sheet
(reusing `parsePlist`/`extractMatchData`, `setDoc matches/{matchId}`), season
intelligence card (reads `reports/seasonLatest`; regenerate via a ported lib function),
and NEW tournament scheduler (`athletes/{id}/tournaments` docs `{name, date
"YYYY-MM-DD", level}` + Add sheet) with `lib/tournaments.js` math (TDD) that slice 5's
auto-taper consumes.

## Decisions

1. **Match-analysis GENERATION stays in the old UI until cutover** — the new detail
   sheet displays existing reports (matchSummary, strengths chips, criticalFindings,
   athleteNote, parentNote). Valissa consumes reports; you generate them (classic UI
   still one URL away). Ported at slice 8.
2. **Season regeneration ported now** into `src/lib/seasonReport.js` (prompt copied
   verbatim from MatchesTab; old copy remains until cutover — accepted temporary
   duplication, old UI dies in slice 8).
3. **Tournaments are a new subcollection**; `lib/tournaments.js` (pure, TDD):
   `daysUntil(dateStr, todayStr)`, `tournamentModeFor(days)` (≤6 `week_of`, ≤13 `pre`,
   else `normal`), `nearestUpcoming(tournaments, todayStr)`. Slice 5 maps mode →
   existing `tournamentStatus` semantics.
4. Import writes the match doc only (no auto-analysis) + success toast.
5. MobileApp adds `matches` + `tournaments` to the shared load; detail analysis is
   fetched on demand when a match row opens.

## Out of scope
Plan/Me screens, badges, PWA, analysis generation in new UI, cutover.

## Verification
Vitest (+~8 tournaments tests); build; lint baseline; flag-off untouched; browser smoke
unauthenticated; manual: matches list mirrors old MatchesTab, detail shows an existing
report, add a tournament → appears with countdown.
