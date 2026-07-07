# athlete-os Improvement Roadmap — Phase 1: Architecture Cleanup (Design)

**Date:** 2026-07-07
**Status:** Approved by user (roadmap order + Phase 1 design)
**Author:** Claude session with Allova

## Background

athlete-os is a private React 19 + Vite + Firebase performance tracker for one youth
athlete (Valissa, 12), used by a 3-person family. A security/bug review on 2026-07-07
fixed data-correctness bugs (divergent SRPE/ACWR math, dropped sleep data, false
escalations, timezone week bugs) — those fixes live uncommitted on branch
`claude/general-assistance-jpgfB` and must be committed before Phase 1 work begins.

The user asked what can be improved and upgraded, and chose **Architecture cleanup**
plus **Features & UX** (trends/charts, better AI + streaming, PWA + reminders) as
priorities. Primary devices are **iPhones** (constrains the reminders design in
Phase 4: web push requires PWA installed to home screen, iOS 16.4+).

## Roadmap (approved order)

| Phase | Scope | Own spec? |
|---|---|---|
| **1. Architecture cleanup** | Split App.jsx, lazy-load tabs, test suite for load math | **This document** |
| 2. Trends & charts | ACWR/load over time, wellbeing/sleep trends | Later |
| 3. AI upgrade + streaming | Sonnet for plans/analyses/reports (Haiku stays for motivational one-liners); streaming UI. **Risk:** prod streaming needs gen-2 Cloud Functions (Blaze plan) — checkpoint: confirm plan tier; fallback = better model + progress UI, no prod streaming | Later |
| 4. PWA + reminders | Installable app, offline logging, wellbeing prompts (iOS: push only after home-screen install) | Later |

**Why foundation-first:** every later phase builds new components; building them into
a clean module structure is cheaper than bolting onto the 5,600-line monolith and
extracting later. Tests lock in the just-fixed math before code moves.

## Phase 1 Design

### Goal

Split `src/App.jsx` (~5,600 lines, ~20 components + data + parsers + AI logic) into
focused modules, lazy-load per tab/persona, and add a test suite over the pure load
math. **Zero behavior change**, with one deliberate exception (hoisting
render-declared components, below).

### Target structure

```
src/
  App.jsx                 ← slim root: auth gate + persona routing only (~150 lines)
  firebase.js             (unchanged)
  styles/theme.js         COLORS, FONTS, global css string
  lib/
    dates.js              toLocalDateStr, getWeekBounds, week-key helpers
    load.js               sessionSRPE, computeLoad, calculateMetrics, getACWRContext,
                          mergeWellbeingByDate
    plist.js              parsePlist, parsePlistNode, extractMatchData
    athleteContext.js     buildAthleteContext
    ai.js                 API_URL + one shared callClaude() helper: fetch, res.ok /
                          data.error / stop_reason checks, code-fence stripping,
                          control-char JSON cleaning (currently duplicated at 4 call
                          sites in App.jsx)
    exerciseDb.js         EXERCISE_DB + technical-issues data
    deferredPriorities.js (moves from src/deferredPriorities.js)
  components/
    AlertsBanner.jsx
  tabs/                   parent/coach persona — one file per tab
    PlanTab.jsx, LogTab.jsx, StrengthLogTab.jsx,
    MatchesTab.jsx (incl. MatchDetail, SeasonReportView — split further only if natural),
    PrioritiesTab.jsx, TechnicalTab.jsx, BenchmarksTab.jsx, ProgressTab.jsx
  athlete/                athlete persona
    AthleteView.jsx, AVLogSession.jsx, AVWellbeing.jsx, AVGrowth.jsx,
    AVMatchNotes.jsx, AVPlan.jsx
```

Boundary rule: `lib/` is pure logic — no React imports. `tabs/`, `athlete/`,
`components/` are UI that consume `lib/`.

### Extraction method

Mechanical, verbatim moves, file by file, **build green at every step**, in this
order (each step: extract → import → `npm run build`):

1. `styles/theme.js` (COLORS/FONTS/css)
2. `lib/` pure functions (dates, load, plist, exerciseDb)
3. `lib/ai.js` — the one place duplicated fetch/parse logic is unified
4. `lib/athleteContext.js`, move `deferredPriorities.js` into `lib/`
5. `athlete/` components
6. `tabs/` components + `components/AlertsBanner.jsx`
7. Slim `App.jsx` to root shell

**One deliberate change:** components declared inside other components' render
(e.g. `EmojiRow`, `NumGrid` in AVWellbeing — the 21 `react-hooks/static-components`
lint errors) are hoisted to module level as they move. A component recreated per
render remounts its subtree and resets child state; hoisting is the fix and is free
during extraction. All other logic moves untouched.

### Lazy loading

`React.lazy()` + `<Suspense>` per parent tab and per persona view. Outcome: small
core chunk + on-demand chunks per tab; the athlete's phone loads only the athlete
view. Pre-wires Phase 2 (charts tab lazy-loads its chart code the same way).
Current single bundle: 736 KB (Vite warns at 500 KB).

### Tests

**Vitest** (Vite-native). Pure functions only — no Firestore mocks in this phase:

- `lib/load.js`: sessionSRPE (rpe fallback via intensity×2, default 5, duration
  default 60, 0.6 multiplier for type "other"); computeLoad 4-week windows; ACWR
  rounding; fourWeekAvg = 0 → acwr null
- `lib/dates.js`: Monday-anchored week bounds; no UTC day-roll for UTC+7/+8 local
  times (the timezone-bug class fixed in review)
- `mergeWellbeingByDate`: AM doc (sleep) + PM doc (energy/notes) merge per date;
  later non-null wins; sleep survives (pins the review fix)
- `deferredPriorities`: week-key guard logic (pure part)

Target ~30–40 assertions. Add `"test": "vitest run"` script.

### Verification

1. Commit the pending review fixes first (separate commit) so the refactor diff is
   clean moves.
2. `npm run build` green after every extraction step; final build emits multiple
   chunks instead of one 736 KB file.
3. `npm run lint`: error count drops from 51 (the 21 static-components errors are
   eliminated; remaining pre-existing errors are out of scope).
4. `npx vitest run` passes.
5. Dev-server smoke test: log in, both personas render, every tab opens without
   console errors.
6. `git diff --stat` review: moves dominate; non-move edits limited to imports,
   hoisted components, and the unified `callClaude()` helper.

### Out of scope for Phase 1

- Any new feature (charts, AI model change, PWA) — later phases
- Fixing the remaining non-static-component lint errors
- TypeScript migration
- Cloud Function auth (declined earlier; still a noted follow-up risk)

### Risks

- **Large mechanical diff.** Mitigated by step-wise green builds, committing the
  review fixes first, and per-step commits during extraction.
- **Hidden coupling** (shared module-scope state inside App.jsx). Mitigated by
  extraction order (pure code first) and smoke testing after UI moves.
- **`{moved}`-style OneDrive sync conflicts** during many-file operations: prefer
  git mv/adds in small batches.
