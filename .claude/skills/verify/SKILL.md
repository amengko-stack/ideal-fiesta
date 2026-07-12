---
name: verify
description: Build, launch and drive this app headlessly to verify UI changes end-to-end.
---

# Verifying Valissa's Tracker

The app is auth-locked to three family Firebase accounts, so a live login is
impossible in CI/agent sessions. Verify UI changes by mounting the component
tree behind the auth gate in a temporary harness and driving it with
Playwright + the preinstalled Chromium.

## Recipe

1. `npm ci` — then Firebase needs *any* syntactically-valid config or
   `firebase.js` throws `auth/invalid-api-key` at import. Write a `.env.local`
   with dummy `VITE_FIREBASE_*` values (see `.env.example` for the names).
   Reads fail via `Promise.allSettled` and writes are fire-and-forget, so the
   UI is fully drivable; writes even round-trip through the local Firestore
   cache (offline-first), so saved data appears in the UI.
2. Temp harness (delete before committing): a root `verify-harness.html`
   plus `src/verifyHarness.jsx` that `createRoot(...).render(<MobileApp
   athleteId="verify-athlete" isParent={true} onSignOut={() => {}} />)`.
   Vite serves any root-level .html.
3. `npx vite --port 5199 --strictPort` in the background.
4. Drive with `playwright-core` (npm-install it in a scratch dir) and
   `executablePath: "/opt/pw-browsers/chromium"`, viewport 390×844,
   `permissions: ["clipboard-read", "clipboard-write"]` if testing share.

## Gotchas

- Buttons are plain divs. Playwright's default text matching is
  case-insensitive substring — stat-chip headers like "1ST SERVE" collide
  with button labels like "1st serve in". Use `getByText(label, { exact:
  true })` and `.last()` (buttons render after the scoreboard, which repeats
  player names).
- The bottom-nav item text includes its emoji ("🎾Matches"), so exact-match
  on "Matches" fails; substring + `.last()` works.
- With no profile doc the athlete renders as "Athlete" — winner buttons are
  "Athlete 🎾".
- Live scoring follows real serve rotation: after a tiebreak the *other*
  player opens the next set — aces/double-faults credit whoever is serving.
- Dismiss a BottomSheet by clicking the scrim near the top (e.g. `page.mouse
  .click(195, 40)`).
