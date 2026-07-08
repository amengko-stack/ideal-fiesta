# Phase 2a: Foundations — Load History, Streak, Cheer Retirement (Design)

**Date:** 2026-07-08
**Status:** Implemented — see docs/superpowers/plans/2026-07-08-phase2a-foundations.md
**Author:** Claude session with Allova

## Background & roadmap change

Phase 2 was originally "Trends & charts" (spec 2026-07-07, roadmap table). Mid-design,
the user delivered a full product redesign ("Marsha Tracker" HTML design reference +
README, stored outside the repo): light theme, Fredoka typography, bottom-nav mobile IA
(Home / Load / Matches / Plan / Me), gamification (XP/levels/badges), tournament
scheduler, maturity/PHV assessment, parent-mode toggle.

**Decision (user-approved):** the redesign supersedes Phase 2's UI. The roadmap reshapes:

| Phase | Scope |
|---|---|
| **2a (this spec)** | Design-agnostic foundations: load-history math, streak math, sRPE weight change, cheer retirement. No new UI. |
| 2b (next, own specs) | The redesign, decomposed (theme/shell/nav → Home → Load → Matches → Plan → Me). Consumes 2a's functions. Original Phase 3 (AI streaming) and Phase 4 (PWA) fold into its sequence. |

**Standing decisions for 2b (recorded now to avoid relitigating):**
- Stay on React + Vite + Firebase web (PWA later). NO React Native rewrite — the design
  README's RN suggestion applies only when no codebase exists; ours has a tested lib layer.
- The prototype's formulas (sRPE ×0.9, its ACWR) are illustrative fakes. `src/lib/` is
  the source of truth for all math.
- The design's "Marsha" name and "Tennis + Cheer" copy are stale: name comes from the
  athlete profile; sports are Tennis + Cross-Training (cheer retired, this spec).

## What 2a delivers

Valissa is stopping cheerleading and taking up other sports / cross-training. Training
load math, streak math, and the AI's understanding of her sports must be correct **now**,
in the current app, regardless of when 2b ships.

### 1. sRPE weight change — [src/lib/load.js](../../src/lib/load.js)

`sessionSRPE` currently multiplies `type === "other"` sessions by 0.6. Cross-training is
now a primary activity; undercounting it understates ACWR/injury risk.
**Change:** remove the multiplier — all types weigh 1.0. (User chose full weight, aware
it applies to the few historical "other" logs since load is computed on the fly.)
Update the 0.6 test in `load.test.js` to pin full weight; `rpe`/`intensity`/`duration`
fallbacks unchanged.

### 2. `computeLoadHistory(logs, weeks = 12)` — new, in [src/lib/load.js](../../src/lib/load.js)

Returns an array, oldest → newest, one entry per week:
```js
{ weekStart: "YYYY-MM-DD",            // Monday, from getWeekBounds
  srpeByType: { tennis, cheer, other }, // 0 when absent
  totalSrpe: number,
  acwr: number|null }                  // this week ÷ mean(this + 3 prior); null if denominator 0
```
Same `sessionSRPE`/`getWeekBounds` primitives as `computeLoad` — one source of truth,
extended over time. Weeks older than the data simply report zeros/null.
Consumers: 2b's Load screen (bars + ACWR line) and Home tiles. Fully unit-tested
(bucketing, per-type sums, rolling ACWR window, null cases, week ordering).

### 3. `computeStreak(dateStrs, today)` — new, [src/lib/streak.js](../../src/lib/streak.js)

Input: array/set of `YYYY-MM-DD` strings (dates having ANY entry — activity log,
strength session, or wellbeing check-in; check-ins keep rest days alive) plus `today`
(injected for testability). Returns `{ current, activeThisWeek }`:
- `current`: consecutive days ending today **or yesterday** (grace period — the streak
  isn't dead at breakfast).
- `activeThisWeek`: count of active days in the current Mon–Sun week.
Pure function, no Firestore. Unit-tested (empty, today-only, grace, broken chains,
week boundary). Consumers: 2b's header streak pill, Home hero, trophy-case logic.

### 4. Cheer retirement — current app

- **Selectors (stop wrong data entry now):** remove the cheer option from
  [LogTab](../../src/tabs/LogTab.jsx)'s type `<select>` and the cheer `TypeBtn` from
  [AVLogSession](../../src/athlete/AVLogSession.jsx). New logs: tennis / other.
- **AI prompts:** motivation prompt in AVLogSession ("tennis and cheerleading athlete")
  → tennis athlete who also cross-trains; sweep PlanTab / MatchDetail / SeasonReportView
  / athleteContext prompt text for cheer-as-current-sport wording. **Keep** `typeLabel`
  mappings that translate historical `type: "cheer"` logs — the AI still receives old
  cheer sessions and must label them correctly.
- **Copy:** LoginScreen tagline "Tennis · Cheerleading · Strength" → "Tennis ·
  Cross-Training · Strength"; AthleteMain "Cheer" chip → "Cross-Training" (yellow/other
  accent). (Cheap one-liners; they keep the current app truthful until 2b replaces it.)
- **History preserved everywhere:** rendering of existing cheer logs (pills, tiles,
  totals, future chart bars) and `COLORS.cheer` stay untouched.

## Explicitly out of scope (moves to 2b)

- Any chart or streak UI (LoadTrendChart, StreakCard, Trends tab revival)
- Widening AthleteMain's `limit(28)` wellbeing query (only needed by 2b UI)
- Gamification data model, tournaments, maturity — 2b design work

## Testing & verification

1. `npx vitest run` — existing 24 tests (one modified: 0.6→1.0) + new computeLoadHistory
   and computeStreak suites; expect ~35–40 total, all green.
2. `npm run build` green; `npx eslint src/` no new errors.
3. Manual: dev server — log flow shows no cheer option in either persona; historical
   cheer entries still render; generate a plan and confirm prompt copy (via dev proxy
   logs) describes tennis + cross-training.
4. ACWR spot-check: dashboard ACWR and plan-context ACWR still match (shared function).
