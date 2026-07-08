# Phase 2b Slice 3: Load Screen (Design)

**Date:** 2026-07-08
**Status:** Approved (user delegated design decisions)

## Scope

The Load screen goes live in the new UI, fed entirely by `computeLoadHistory` /
`computeLoad` / `acwrStatus` (no new math): hero (weekly sRPE + ACWR status badge +
coaching tip), 4-week bar chart (current week gradient-highlighted), "Where the load
comes from" per-sport breakdown bars, and this-week session list with per-session sRPE.

## Decisions

1. **4-week bars** per the prototype (not 12) — the 12-week deep-dive can join a later
   slice if wanted; MobileApp's 60-day window covers it.
2. **Per-sport breakdown = current week's `srpeByType`** (tennis, match, strength,
   cheer-historical, other), zero rows hidden, solid sport colors.
3. **Tip text keyed on `acwrStatus().tone`**: danger "Way high — take it easy today…",
   warn "Trending high — ease off intensity for a day or two.", limeDim "You can handle
   a bit more — good week to progress.", success "Nicely balanced — keep the rhythm
   going! 🎾", muted "Log a few sessions to see your load picture."
4. **`M.tone` map added to mobileTheme** (success/warn/danger/limeDim/muted hexes) —
   HomeScreen's local `toneColor` map switches to it (DRY).
5. **Slice-2 review minors fixed here:** LogSheet/CheckinSheet split the Firestore
   write from the XP award — XP failure alone now reports "Saved! (XP syncs later) ✨"
   instead of a misleading retry prompt; HomeScreen imports `XP_PER_LEVEL` instead of
   hardcoding 1000.
6. **Home alerts stay deferred** — the only meaningful ones need the tournament
   scheduler (slice 4); ACWR status is already on a Home tile and this screen.
7. ProgressTab's per-sport minute tiles (old UI) stay as-is — retired at cutover.

## Out of scope
Matches/Plan/Me screens, tournaments, badges, PWA, 12-week chart.

## Verification
Tests unchanged (55) — no new pure math; build green; lint baseline; flag-off untouched;
manual: Load tab shows real numbers matching Home's tiles; log a session → bars/list
update after refresh.
