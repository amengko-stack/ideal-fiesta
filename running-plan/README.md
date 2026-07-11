# Adaptive Running Plan

A Runna-style running training app where the AI reads the runner's actual
health condition — sleep, soreness, energy, HRV, WHOOP recovery — and adapts
each week's plan to their current physiological state.

## How adaptation works

1. **Data in** — daily health check-ins (manual stars or WHOOP sync), run logs
   (manual or Strava sync).
2. **Client-side scoring** — Recovery Score (0–100, WHOOP-weighted when
   available), running ACWR (acute:chronic workload ratio), and adaptation
   flags (`HIGH_SORENESS`, `POOR_SLEEP`, `WHOOP_LOW_RECOVERY`,
   `HRV_DECLINING`, `ACWR_DANGER`, `CONSECUTIVE_GOOD`, …).
3. **AI plan** — Claude receives the profile, scores, flags, and 14 days of
   raw data, and returns a 7-day plan with an explicit adaptation decision:
   `increase | maintain | decrease | recovery`.

## Development

The app shares the parent repo's Express API server (port 3001) and Firebase
project. Two terminals:

```sh
# terminal 1 — repo root (real integrations need .env; see .env.example)
node server.js

# terminal 2
cd running-plan && npm install && npm run dev   # http://localhost:3002/running/
```

### Offline / demo mode (no credentials needed)

```sh
MOCK_AI=1 STRAVA_MOCK=1 WHOOP_MOCK=1 node server.js
VITE_DEMO=1 npm run dev
```

`VITE_DEMO=1` skips Firebase auth and stores data in localStorage. The mock
flags serve deterministic AI plans, Strava activities, and WHOOP recovery data.

## Integrations

- **Strava** — OAuth (server-side token exchange), imports runs, dedupes by
  activity ID. Configure `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`.
- **WHOOP** — OAuth, fills daily check-ins with recovery %, HRV, resting HR,
  and sleep. Configure `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET`.

## End-to-end tests

```sh
cd running-plan
npx playwright test          # starts both servers itself (demo + mock mode)
# In sandboxed environments with a preinstalled Chromium:
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
```

## Deploy

Builds into the parent's `dist/` as a subfolder, served at `/running/`.
Build order matters — the parent build empties `dist/`:

```sh
npm run build                      # repo root → dist/
cd running-plan && npm run build   # → dist/running/
firebase deploy --only hosting
```
