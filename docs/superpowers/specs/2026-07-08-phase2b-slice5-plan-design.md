# Phase 2b Slice 5: Plan Screen (Design)

**Date:** 2026-07-08
**Status:** Approved (standing mandate)

## Scope

Plan tab live: generate gate with week-type chips **auto-selected from the tournament
scheduler** (`nearestUpcoming` + `tournamentModeFor`, manual override + back-to-auto),
generation via `lib/planGen.js` — EXTRACTED verbatim from PlanTab's `handleGenerate`
(prompt byte-preserved; PlanTab refactored to delegate, same UX) — then the generated
view: gradient hero with progress bar, context tiles, dark coach-briefing card,
why-today rationales, and a NEW tappable exercise checklist whose done-state persists to
`plans/current.doneMap` (keyed by exercise id). +`XP.PLAN_GENERATE` (20) on generate.

## Decisions

1. `generateSundayPlan(athleteId, { profile, weekLogs, sessionHistory, wellbeing,
   tournament, sessionTime })` returns `{ planData, escalations }`; writes
   `plans/current` and handles deferred priorities exactly as today.
2. Mobile passes `sessionTime: "10:00"` (no time picker — Sunday-morning default;
   the classic tab keeps its picker).
3. Mode mapping for chips: `normal`→"Normal week", `pre`→"Pre-tourney",
   `week_of`→"This week", plus manual-only `post_easy`/`post_hard`. Auto note shows
   "{name} in {n} days — auto-set to …" when a tournament drives the choice.
4. `doneMap` lives on `plans/current` (merge-write); regenerating resets it.
5. MobileApp keeps full `sessions` docs and the full profile doc in state (generation
   inputs), and loads `plans/current` into state.

## Out of scope
Me screen, badges, PWA, cutover, classic-PlanTab visual changes.

## Verification
62 tests stay green (extraction adds none); build; lint baseline; flag-off untouched;
manual: auto-chip reflects a scheduled tournament; generate produces the same plan the
classic tab would; checklist ticks persist across refresh.
