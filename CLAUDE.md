# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Performance Tracker** is a React + Vite web application for tracking athlete performance, primarily for tennis players and cheerleaders. It supports parent oversight and athlete self-logging with AI-powered training plan generation via the Anthropic Claude API.

## Commands

```bash
# Development (runs Express server + Vite concurrently)
npm run dev

# Build for production
npm run build

# Lint
npm run lint

# Preview production build
npm run preview

# Express server only (no Vite)
npm run server
```

There is no test suite configured.

## Architecture

### Frontend/Backend Split

- **Frontend**: React (Vite) SPA — all UI lives in `src/App.jsx` (single monolithic ~5,600-line file with all components inlined)
- **Local backend**: `server.js` — Express server on port 3001; proxies `/api/chat` to the Anthropic API
- **Production backend**: `functions/index.js` — Firebase Cloud Function that does the same proxying
- Vite dev server proxies `/api` → `http://localhost:3001` (see `vite.config.js`)

### Auth & Access Control

Firebase Google Auth is used for login. Authorized users are hard-coded in the `ALLOWED_USERS` constant inside `App.jsx`. Each entry maps a Google email to a role (`parent` or `athlete`) and a list of athlete IDs they can access. **Adding new users requires editing this constant.**

Roles determine which top-level view renders:
- `parent` → `ParentDashboard` → `AthleteMain` (full training management view)
- `athlete` → `AthleteView` (self-logging and plan view)

### Firestore Data Model

All athlete data lives under `athletes/{athleteId}/`:

| Subcollection | Purpose |
|---|---|
| (root doc) | Athlete profile and biometrics |
| `weekLogs` | Weekly training/tournament summaries |
| `sessionHistory` | Individual session records |
| `wellbeing` | Mood/sleep/soreness entries |
| `deferredPriorities` | Training issues with escalation tracking |
| `dismissedAlerts` | Per-user alert dismissal state |

`deferredPriorities` requires a composite Firestore index on `(status ASC, weeksDeferredCount ASC)`.

### AI Integration

`PlanTab` generates training plans by calling `/api/chat` with a system prompt that encodes the athlete's profile, training history, and sport-specific context. The model is configurable via `ANTHROPIC_MODEL` env var (defaults to `claude-haiku-4-5-20251001`).

### Exercise & Gap Domain Model

The app has an embedded exercise database (40+ exercises) and 13 tennis performance gaps (e.g., `lateral_agility`, `serve_power`, `core_stability`). Each exercise has metadata: category, movement type, which gaps it addresses, progression chains, and default sets/reps. These are defined as constants inside `App.jsx`.

### Deferred Priorities Logic

`src/deferredPriorities.js` contains all Firestore operations for the deferred priorities feature: `saveDeferredPriorities`, `resolveDeferred`, `checkEscalations`. Escalation logic (auto-surfacing items deferred too many weeks) runs client-side on load.

### Styling

All styles are inline CSS objects inside `App.jsx`. The design system uses:
- **Accent**: `#00e5a0` (green)
- **Background**: `#0a0e14` (dark)
- **Fonts**: Bebas Neue (headings), DM Sans (body) — loaded via Google Fonts in `index.html`
- No CSS modules, Tailwind, or styled-components

## Environment Variables

Copy `.env.example` to `.env` and populate:

```
ANTHROPIC_API_KEY=          # Required for AI plan generation
ANTHROPIC_MODEL=            # Optional, defaults to claude-haiku-4-5-20251001
PORT=3001                   # Express server port
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Firebase project: `athlete-os-15c3b` (see `.firebaserc`)

## Deployment

Production deploys to Firebase Hosting via:

```bash
npm run build
firebase deploy
```

`firebase.json` routes `/api/chat` to the Cloud Function and serves everything else from `dist/`. Cloud Functions source is in `/functions/`.
