---
name: project-conventions
description: Use when reading, editing, or reviewing code in this repo (athlete-os — a Firestore-backed React/Vite app with Firebase Cloud Functions) — surfaces architectural facts not visible from any single file, so changes to shared modules, date/db utilities, or Firestore-touching UI don't silently break something elsewhere.
user-invocable: false
---

# athlete-os project conventions

Facts about this repo's architecture discovered via a knowledge-graph pass over
the codebase, not derivable from reading any one file in isolation.

## Client/server shared-module sync (hard rule)

`functions/shared/*.js` is a **generated mirror** of an allowlist of pure
modules in `src/lib/` — see the `SHARED_MODULES` array in
`scripts/sync-functions-shared.mjs` (18 modules as of this writing: dates,
load, priorityKeys, priorityMetrics, practiceFocus, athleteIdentity,
athleteMemoryCore, maturity, tournaments, injuries, exerciseDb, aiJson,
athleteContextCore, planGenCore, deferredPrioritiesCore, digestCore, growth,
guardianCore).

- Never edit a file under `functions/shared/` directly — edit the `src/lib/`
  original; the mirror is regenerated from it.
- Every module on that list must stay Firebase-free and
  `import.meta.env`-free, and may only import other modules on the same list
  (transitive closure) — Cloud Functions deploys only the `functions/`
  directory (see `firebase.json`), so anything else can't resolve there.
- `src/lib/sharedSync.test.js` asserts byte-equality between the two copies
  and fails CI on drift.
- A `.claude/hooks/sync-shared-on-edit.mjs` PostToolUse hook re-runs the sync
  script automatically after any edit under `src/lib/` or `functions/shared/`,
  so drift should already be fixed by the time tests run. Adding a *new*
  shared module still requires adding it to `SHARED_MODULES` by hand first.

## God nodes — high fan-in, change with care

- `toLocalDateStr()` (`src/lib/dates.js`) — imported by 30+ files across
  `src/lib`, `src/screens`, `src/tabs`, and `src/athlete`. A signature or
  timezone-behavior change ripples everywhere date math happens.
- `db` (the Firestore instance exported from `src/firebase.js`) — imported
  directly by 35+ files, including many UI screens/tabs, not just data-layer
  modules (see next section).

## UI–Firestore coupling

Firestore reads/writes are called directly from screen/tab components
(`MobileApp.jsx`, `LogSheet.jsx`, `InjurySheet.jsx`, `GrowthSheet.jsx`,
`BenchmarksTab.jsx`, and ~30 others) rather than behind a repository/data-access
layer. Before adding a new query, check sibling screens for the same read —
there's no single place that owns a given collection's read shape yet.

## Known dead code

`archive/migrate_athlete_data.py` and `archive/migrate_weeklogs.py` were
confirmed to have no remaining callers in a prior isolated-nodes audit — safe
to delete on sight if you land on them again.

## Auth model

The app is auth-locked to three family Firebase accounts, so a live login is
impossible in CI/agent sessions — see `.claude/skills/verify/SKILL.md` for how
to drive the UI behind that gate in a headless session.
