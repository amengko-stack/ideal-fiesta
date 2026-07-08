# Phase 2b Slice 8: Cutover + PWA (Design)

**Date:** 2026-07-08
**Status:** Implemented (this doc records the decisions; work done controller-level)

## Scope & decisions

1. **Cutover:** the new mobile UI is now the DEFAULT for authenticated users.
   `?classic` (or `?newui=0`) opts a device back to the classic UI (sticky);
   `?newui` returns. Storage-blocked environments default to the new UI.
2. **PWA:** `public/manifest.webmanifest` ("Valissa's Tracker", standalone,
   #EDFBF3), real PNG icons (512 + 180, generated from the brand tile),
   apple-touch-icon + iOS meta tags, page title → "Valissa's Tracker".
   Minimal network-first service worker (`public/sw.js`, registered in
   production only): fresh code when online, last-cached shell offline,
   never intercepts `/api/`.
3. **Offline data:** Firestore persistent local cache (multi-tab) in
   `src/firebase.js` — reads from cache and queued writes offline, for both UIs.
4. **Cleanup:** PlaceholderScreen.jsx deleted (dead since slice 6); MeScreen age
   derived from `profile.dob`.

## Deliberately remaining on the classic UI (one URL away: `?classic`)
- Match-analysis GENERATION (reports display in the new UI)
- Benchmark / stroke-assessment / measurement LOGGING (read-only in new UI)
- The old parent tab suite (kept intact as the fallback)

## Verification
Gates (72 tests, build, lint 34 baseline); final whole-app review; browser smoke
(default + ?classic); production deploy (user-authorized 2026-07-08).
