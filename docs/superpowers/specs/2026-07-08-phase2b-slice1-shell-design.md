# Phase 2b Slice 1: Foundation Shell (Design)

**Date:** 2026-07-08
**Status:** Approved (user delegated design decisions; approach A confirmed)
**Author:** Claude session with Allova

## Background

Phase 2b implements the "Marsha Tracker" product redesign (user-supplied HTML prototype +
README handoff; light theme, Fredoka type, bottom-nav mobile IA, gamification) on the
existing React + Vite + Firebase app. Decomposition (each slice = spec → plan → build →
review):

1. **Foundation shell (this spec)** — tokens, header, nav+FAB, sheet/toast primitives,
   screen router, placeholder screens, XP model, feature flag
2. Log sheet + Home screen
3. Load screen (consumes `computeLoadHistory`)
4. Matches (history/detail/import/season + tournament scheduler)
5. Plan (generate gate, auto-taper, checkable blocks)
6. Me + parent-gated sections (benchmarks, technical, maturity/PHV) + settings
7. Gamification completion (badges/trophy case; XP ships now)
8. Cutover + PWA (old UI retired; original Phases 3/4 fold in here)

**Standing decisions:** React web, no RN. `src/lib/` math is source of truth (prototype
formulas are illustrative). Profile-driven name (Valissa, not "Marsha"); Tennis +
Cross-Training (cheer retired in 2a). Rollout = flag + early cutover (family switches
after slices 1–3). XP model early, badges later. Parent mode = UX toggle available only
to `role: "parent"` logins (UID roles + Firestore rules stay authoritative).

## Slice 1 scope

### Feature flag — `src/App.jsx`

```js
const params = new URLSearchParams(window.location.search);
if (params.has("newui")) localStorage.setItem("newui", params.get("newui") === "0" ? "0" : "1");
const NEW_UI = localStorage.getItem("newui") === "1";
```
`?newui` opts a device in (sticky via localStorage), `?newui=0` opts out. When on AND the
user is authenticated+authorized, App renders lazy `<MobileApp athleteId={...}
isParent={...} user={...} onSignOut={...} />` instead of the old persona routes.
**Flag off ⇒ the current app is byte-identical in behavior.**

### Design tokens — `src/styles/mobileTheme.js`

Token object `M` + global css string `mobileCss` (injected only inside MobileApp),
values verbatim from the handoff README:
- Brand gradient `#d9f86a → #00e5a0` (ring variant `#c8f564 → #00e5a0`); brand shadow
  `#12b585`; deep green `#0a2e22`; ink `#12312a`; sub `#7a8a84`; muted `#9aa8a1`;
  dividers `#F1F6F2`/`#E4EFE8`; dark card `#12312a` (lime text `#d9f86a`/`#8fd400`);
  surfaces `#fff`, fills `#F4F8F5`/`#EFF4F1`/`#EDF3EF`; page bg
  `linear-gradient(180deg,#EDFBF3 0%,#FDFBF3 55%)`; status success `#12b585`, warn
  `#d98a1f`, danger `#e0433f`, parent blue `#2f7fd9` (bg `#E4EFFB`), streak orange
  `#f59a1f`; sport tints tennis `#a9d40f`/`#c8f564`, match `#f5c518`, strength
  `#00c88c`, cheer `#f564c8` (history), other `#4fb0e8`.
- Type: Fredoka 600/700 display+numbers, DM Sans 400–700 body (Google Fonts import in
  `mobileCss`).
- Radii: cards 20–26, sheets 28 top, tiles/chips 12–19, pills 999. Shadows: solid-drop
  `0 3–5px 0 rgba(18,49,42,0.04–0.07)`; CTA/FAB `0 5–6px 0 #12b585`.
- Keyframes: `sheetUp .3s cubic-bezier(.2,.9,.3,1)`, `scrimIn .2s`, `toastPop .35s`,
  `screenIn .25s`, `spin .7s linear infinite`. Scrollbars hidden.

### UI primitives — `src/ui/` (dumb, props-driven, no Firestore)

- `Card.jsx` — white card, radius 20, solid-drop shadow, `style` override.
- `Header.jsx` — props `{ kicker, title, streak, initial, onAvatar }`: 48px 🎾 gradient
  icon tile, kicker+title, white streak pill (🔥 + count, orange Fredoka), 40px dark
  avatar tile with initial.
- `BottomNav.jsx` — props `{ active, onNav, onFab }`: fixed 84px translucent blurred bar
  (+ iOS safe-area padding), Home 🏠 / Load 📊 / [56px raised gradient FAB ＋] /
  Matches 🎾 / Plan 📋; active tint `#12b585`.
- `BottomSheet.jsx` — props `{ open, onClose, children }`: scrim (tap closes), sheet
  radius 28 top, `#FDFBF3`, 42×5 grabber, `sheetUp`/`scrimIn` animations, inner tap
  stops propagation, max-height 86% scroll.
- `Toast.jsx` — props `{ message }`: centered pill above nav, `#12312a`/`#d9f86a`,
  `toastPop`. (Auto-dismiss timing owned by MobileApp.)

### Shell — `src/screens/MobileApp.jsx` + placeholder screens

- Owns: `screen` state (`home|load|matches|plan|me`), sheet open state, toast state
  (3s auto-dismiss), athlete profile (name → header initial/title), streak.
- Streak data: fetch `date` fields from `weekLogs`, `sessions`, `wellbeing` (last 60
  days, `where("date", ">=", cutoff)`) → `computeStreak(dates, today)` → header pill.
- Header kicker: `"{Weekday} · let's play"` on Home; per-screen labels elsewhere
  (Load "Training load", Matches "Season so far", Plan "Your plan", Me "Profile & tools").
- Layout: content column max-width 480px centered (usable on desktop for dev), padding
  clears header/nav, screens animate in with `screenIn`.
- FAB → BottomSheet with a friendly placeholder ("Session logging arrives in the next
  update") + a button that closes and fires a toast — proves sheet+toast end-to-end.
- `HomeScreen/LoadScreen/MatchesScreen/PlanScreen/MeScreen.jsx`: Card + emoji + "Coming
  soon" sub-line each (replaced slice by slice). Avatar tap → Me.

### XP model — `src/lib/gamification.js` (TDD)

- Pure, tested: `xpForSession(srpe) = Math.max(5, Math.round(srpe / 8))`;
  `XP = { CHECKIN: 10, PLAN_GENERATE: 20, STROKE_UPDATE: 10, BENCHMARK: 15 }`;
  `levelFromXp(xp)` → `{ level, title, intoLevel, toNext }` with 1000 XP per level and
  a 10-title ladder (Rookie 🌱, Starter 🎾, Grinder 💪, Contender 🔥, Rising Star ⭐,
  Challenger ⚡, Competitor 🏅, Champion 🏆, Elite 🌟, Legend 👑 — Legend for 10+).
- Firestore: `athletes/{id}/gamification/state` doc `{ xp: number }` (badges map joins
  in slice 7). `awardXp(athleteId, amount)` via `setDoc(..., { xp: increment(n) },
  { merge: true })`. Screens wire awards as they land (slice 2+); slice 1 ships the
  model + tests only.

## Out of scope (later slices)

Real screen content, the log form, check-in sheet, parent-mode toggle UI, badges,
tournaments, PHV, PWA/service worker, font self-hosting, old-UI removal.

## Verification

1. `npx vitest run` — 41 existing + gamification suite (~10), all green.
2. `npm run build` — green; MobileApp is its own lazy chunk; flag-off bundle behavior
   unchanged.
3. Flag-off regression: default URL renders the old app exactly as before.
4. Automated browser check on `?newui` reaches the (unchanged) login screen with 0
   console errors — the shell itself sits behind Google sign-in, so the authed check is
   manual: sign in on a phone/browser with `?newui`, confirm header (live streak), 5
   screens switch via nav + avatar, FAB opens sheet, button fires toast.
