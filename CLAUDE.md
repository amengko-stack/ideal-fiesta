# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Performance Tracker** is a React + Vite PWA for tracking a tennis athlete's training (tennis + cross-training), with parent oversight, athlete self-logging, gamification (XP/levels/badges), and AI-powered plan generation and match analysis via the Anthropic Claude API.

## Commands

```bash
npm run dev        # Express AI proxy (port 3001) + Vite dev server, concurrently
npm run build      # Production build to dist/
npm test           # Vitest, single run
npx vitest run src/lib/load.test.js   # Single test file
npx vitest run -t "name"              # Single test by name
npm run lint       # ESLint
npm run preview    # Preview production build
npm run server     # Express server only
```

Tests are Vitest files colocated with their modules in `src/lib/*.test.js`. Only pure logic in `src/lib/` is tested — there are no component tests.

## Architecture

### Two UIs, one auth router

`src/App.jsx` is a slim auth router that lazy-loads one of two UIs:

- **New mobile UI** (default since the 2026-07-08 cutover): `src/screens/` (screens + bottom-sheet editors, `MobileApp.jsx` is the data shell that loads all Firestore data and passes it down), `src/ui/` (Card/Header/BottomNav/BottomSheet/Toast primitives), `src/styles/mobileTheme.js` (light theme, token object `M`, Fredoka + DM Sans)
- **Classic UI** (opt-out via `?classic` URL param, persisted in localStorage; `?newui` switches back): `src/tabs/` (parent view, `AthleteMain.jsx` hosts the tabs), `src/athlete/` (athlete self-view `AthleteView.jsx` + AV* tabs), `src/styles/theme.js` (dark theme, accent `#00e5a0`, bg `#0a0e14`, Bebas Neue + DM Sans)

`src/components/` holds shared pieces (LoginScreen, ParentDashboard, AlertsBanner). All styling is inline style objects from the theme modules — no CSS modules or Tailwind.

### Shared logic in `src/lib/`

Pure logic lives in `src/lib/` with no React imports; Firestore writers are separate modules (e.g. `gamification.js` is pure math, `gamificationStore.js` writes XP). Key modules:

- `ai.js` — the ONLY place that calls `/api/chat`; use `callClaudeJSON`/`callClaudeText` for any new AI feature
- `athleteContext.js` — assembles the unified Firestore context object fed to every AI prompt
- `planGen.js`, `matchAnalysis.js`, `seasonReport.js` — AI generators shared by both UIs
- `load.js` — sRPE/ACWR math, shared by dashboard and AI context so numbers always agree; all session types count at full weight
- `dates.js` — **date convention**: dates are local-calendar-day strings via `toLocalDateStr()`. Never use `toISOString().slice(0,10)` (causes UTC day-shift bugs for UTC+7/+8 users)
- `deferredPriorities.js` — deferred training priorities with client-side escalation logic
- `exerciseDb.js` — exercise database (40+ exercises) and 13 tennis performance gaps with progression chains
- `gamification.js`/`badges.js`/`streak.js` — XP model (`XP_PER_LEVEL = 1000`), badge evaluation, daily streaks

### Frontend/Backend split

The frontend never calls Anthropic directly. `/api/chat` is proxied by:
- **Dev**: `server.js` (Express, port 3001; Vite proxies `/api` to it)
- **Prod**: `functions/index.js` (Firebase Cloud Function, wired via `firebase.json` rewrite)

Both read `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`).

### Auth & access control

Firebase Google Auth. Authorized users are hard-coded **by Firebase UID** in the `ALLOWED_USERS` constant in `src/App.jsx` (role `parent` or `athlete` + `athleteId`). The same three UIDs are hard-coded in `firestore.rules` — **update both together**.

### Firestore data model

Top-level `matches/{matchId}` collection holds match records (imported from a plist export or logged in-app). Everything else lives under `athletes/{athleteId}/`:

| Path | Purpose |
|---|---|
| (root doc) | Profile, biometrics, gaps, focus areas |
| `weekLogs` | Session logs (per-session docs, despite the name) |
| `sessionHistory` | Generated-plan session records |
| `wellbeing` | Daily mood/sleep/soreness check-ins |
| `deferredPriorities` | Training issues with escalation tracking |
| `dismissedAlerts` | Per-user alert dismissal state |
| `gamification/state` | XP total |
| `config/tournamentStatus` | Tournament context for AI prompts |

Security rules are in `firestore.rules`, composite indexes in `firestore.indexes.json` (`deferredPriorities` needs `(status ASC, weeksDeferredCount ASC)`). Both deploy with `firebase deploy`.

### Offline / PWA

Firestore uses persistent local cache (`src/firebase.js`) so reads serve from cache and writes queue offline (courtside logging). `public/sw.js` is a minimal network-first service worker registered in production only (`src/main.jsx`); `public/manifest.webmanifest` makes it installable. Saves in the mobile UI are fire-and-forget so the UI stays responsive offline.

## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` contain the design specs and implementation plans for each phase/slice of work, marked as implemented when done. Read the relevant spec before extending a feature; add a spec + plan for substantial new work following the same convention.

## Environment Variables

Copy `.env.example` to `.env`: `ANTHROPIC_API_KEY` (required for AI features), `ANTHROPIC_MODEL` (optional), `PORT` (default 3001), and the six `VITE_FIREBASE_*` values. Firebase project: `athlete-os-15c3b` (see `.firebaserc`).

## Deployment

```bash
npm run build
firebase deploy
```

Deploys hosting (from `dist/`), the Cloud Function (`functions/`), Firestore rules, and indexes. `firebase.json` rewrites `/api/chat` to the function and everything else to `index.html`.
