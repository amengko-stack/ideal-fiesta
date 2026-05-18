# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Athlete OS** — a React + Vite web app that generates AI-powered Sunday strength training plans for youth athletes (tennis + cheerleading). Parents/coaches manage athlete profiles; athletes log their weekly activity and wellbeing, then the app calls Claude via a backend proxy to produce a personalised training session.

## Commands

```bash
npm run dev       # Start both Express backend (port 3001) and Vite dev server concurrently
npm run server    # Start Express backend only
npm run build     # Vite production build
npm run lint      # ESLint
```

There is no test suite.

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY` — required for AI plan generation
- `ANTHROPIC_MODEL` — defaults to `claude-haiku-4-5-20251001`
- `PORT` — Express port (default 3001)
- `VITE_FIREBASE_*` — Firebase project credentials (all six values required)

## Architecture

### Two-process design
`npm run dev` runs two processes together via `concurrently`:
1. **`server.js`** — Express API on port 3001. Its single endpoint `POST /api/chat` proxies requests to the Anthropic Messages API, injecting the server-side API key. This keeps the key out of the browser bundle.
2. **Vite dev server** — serves the React SPA and proxies `/api/*` requests to `localhost:3001` (configured in `vite.config.js`).

In production the Express server must be deployed separately; Vite's proxy is dev-only.

### Single-file React app
All React code lives in **`src/App.jsx`** (~1000+ lines). Components are not split into separate files. The component hierarchy is:

```
App (auth router)
├── LoginScreen           — Google sign-in only
├── RoleSetup             — first-login role picker (athlete | parent/coach)
├── ParentDashboard       — list of athletes, create new athlete
└── AthleteMain           — loads all Firestore data, owns tabs
    ├── PlanTab           — AI plan generation UI
    ├── LogTab            — log tennis/cheer sessions
    ├── StrengthLogTab    — log completed strength exercises
    ├── ProgressTab       — historical view
    └── ProfileTab        — edit athlete profile & tennis gaps
```

`AthleteMain` is rendered for both athletes (via `AthleteView` wrapper) and parents (via `ParentDashboard → AthleteMain` with `isParent=true`).

### Firestore data model
All data lives under these Firestore paths:

| Collection/Document | Contents |
|---|---|
| `users/{uid}` | `role` ("athlete"\|"parent"), `athleteId` (athletes only) |
| `athletes/{athleteId}` | Profile: `name`, `dob`, `gaps[]`, `tennisSchedule`, `cheerSchedule`, `coachNotes` |
| `athletes/{athleteId}/weekLogs` | Activity logs: `date`, `type` ("tennis"\|"cheer"), `duration`, `intensity` (1–5), `focus` |
| `athletes/{athleteId}/sessions` | Strength sessions: `date`, `exercises[]` with sets/reps/weight/difficulty |
| `athletes/{athleteId}/wellbeing` | Daily check-ins: `date`, `sleep`, `mood` (1–5), `soreness` (1–5) |
| `plans/{athleteId}` | Latest generated plan: `briefing`, `plan[]`, `weekLoad`, `generatedAt` |

### Styling
All CSS lives in the `css` template string near the top of `App.jsx` and is injected via `<style>{css}</style>` inside each top-level screen component. The `COLORS` object holds all colour tokens. There is no CSS framework, no CSS modules, and no styled-components.

### Static exercise database
`EXERCISE_DB` (in `App.jsx`) is a static array of ~60 exercises. Each entry includes:
- `tennis` — array of tennis gap IDs this exercise addresses
- `ageFlag` — `"green"` (safe for youth) or `"yellow"` (requires care)
- `progressionChain` — ordered array of exercise IDs for progression

`TENNIS_GAPS` maps gap IDs to labels/descriptions used in the AI prompt.

### AI plan generation flow
`PlanTab.handleGenerate()` assembles a detailed prompt from: athlete profile, this week's weighted load score, tournament status, session time, last 5 wellbeing check-ins, and last 6 strength sessions. It POSTs to `/api/chat` and expects a JSON response with `{ briefing, plan[] }`. The response undergoes control-character sanitisation before `JSON.parse`.
