# Adaptive Running Plan

A Runna-style running training app where the AI reads the runner's actual
health condition — sleep, soreness, energy, HRV, WHOOP recovery — and adapts
each week's plan to their current physiological state.

This is a **standalone app**: its own Vite front-end, its own Cloud Functions
backend, and its own Firebase project (separate from the tennis tracker). Runner
data lives under `runners/{uid}/...` in that project's Firestore.

## How adaptation works

1. **Data in** — daily health check-ins (manual stars or WHOOP sync) and run
   logs (manual or Strava sync).
2. **Client-side scoring** — Recovery Score (0–100, WHOOP-weighted when
   available), running ACWR (acute:chronic workload ratio), and adaptation
   flags (`HIGH_SORENESS`, `POOR_SLEEP`, `WHOOP_LOW_RECOVERY`, `HRV_DECLINING`,
   `ACWR_DANGER`, `CONSECUTIVE_GOOD`, …).
3. **AI plan** — Claude receives the profile, scores, flags, and 14 days of raw
   data, and returns a 7-day plan with an explicit adaptation decision:
   `increase | maintain | decrease | recovery`.

## Project layout

```
running-plan/
├── src/                # React app (App.jsx monolith, store.js data layer)
├── functions/          # Cloud Functions backend
│   ├── apiApp.js       # Express app: /api/chat, /api/strava/*, /api/whoop/* (+ mocks)
│   └── index.js        # exports.api = onRequest(app)
├── dev-server.cjs      # local dev/E2E server — wraps the SAME apiApp
├── firebase.json       # hosting (dist) + rewrites /api/** → api function
├── .firebaserc         # set to your running-plan project id
└── e2e/                # Playwright end-to-end suite
```

The front-end calls `/api`; Firebase Hosting rewrites `/api/**` to the `api`
function in production, and Vite proxies `/api` to `dev-server.cjs` (port 3001)
in development.

## Offline / demo mode (no credentials needed)

```sh
npm install
# terminal 1 — API with all mocks
MOCK_AI=1 STRAVA_MOCK=1 WHOOP_MOCK=1 npm run api
# terminal 2 — front-end in demo mode (localStorage, no Firebase auth)
VITE_DEMO=1 npm run dev        # http://localhost:3002/
```

`VITE_DEMO=1` auto-signs-in a demo runner; the Sync WHOOP / Sync Strava /
Generate Plan buttons return deterministic sample data.

## End-to-end tests

```sh
npx playwright test            # starts dev-server.cjs + vite itself (demo + mock)
# In sandboxes with a preinstalled Chromium:
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
```

## Deploy to a brand-new Firebase project

1. **Create the project** (console or `firebase projects:create valissa-running`).
   In the console, add a **Web app** and copy its config.
2. **Enable Google sign-in** (Authentication) and **Firestore** (production mode).
3. **Fill env files:**
   - `running-plan/.env` ← the Web app's `VITE_FIREBASE_*` values (see `.env.example`).
   - `running-plan/functions/.env` ← `ANTHROPIC_API_KEY` and, optionally,
     `STRAVA_CLIENT_ID/SECRET` + `WHOOP_CLIENT_ID/SECRET` (see `functions/.env.example`).
4. **Point the CLI at the project:** edit `.firebaserc` (replace the placeholder
   id) or run `firebase use --add`.
5. **Add yourself to the allowlist:** in `src/App.jsx`, `ALLOWED_EMAILS` already
   has `a.mengko@gmail.com`; add Valissa's Google email there.
6. **Build & deploy:**
   ```sh
   npm install && (cd functions && npm install)
   npm run build
   firebase deploy          # hosting + functions
   ```
   Live at `https://<project-id>.web.app`.
7. **Register OAuth redirect URIs** in the Strava and WHOOP developer portals:
   set the callback to `https://<project-id>.web.app/` so the Connect buttons work.

## Integrations

- **Strava** — OAuth (server-side token exchange), imports runs, dedupes by
  activity ID.
- **WHOOP** — OAuth, fills daily check-ins with recovery %, HRV, resting HR, and
  sleep. Both verified against the providers' official API docs.
