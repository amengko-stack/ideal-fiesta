# Phase 2b Slice 1: Foundation Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new mobile shell (light theme, header with live streak, bottom nav + FAB, sheet/toast primitives, placeholder screens) behind a `?newui` flag, plus the tested XP model — with the flag off, the current app is untouched.

**Architecture:** New parallel tree — `src/styles/mobileTheme.js` (tokens + global css), `src/ui/` (5 dumb primitives), `src/screens/` (MobileApp shell + 5 placeholders), `src/lib/gamification.js` (pure, tested) + `src/lib/gamificationStore.js` (Firestore writer, no React). `src/App.jsx` routes authenticated users to a lazy `<MobileApp/>` when the flag is set.

**Tech Stack:** React 19 + Vite 8, Vitest, Firebase. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-phase2b-slice1-shell-design.md`

## Global Constraints

- Flag off ⇒ zero behavior change to the current app (old routes, old theme, old bundle behavior).
- No new dependencies. `src/lib/gamification.js` must import nothing from Firebase or React (testability); the Firestore writer lives separately in `gamificationStore.js`.
- All styling inline + the `mobileCss` string, values verbatim from this plan (they encode the design handoff). Fredoka for display/numbers, DM Sans for body.
- After every task: `npx vitest run` green and `npm run build` green. Commit per task with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Branch `claude/general-assistance-jpgfB`. OneDrive-synced folder: delete stray junk (e.g. `{moved}`) before committing.

---

### Task 1: XP model — `lib/gamification.js` (TDD)

**Files:**
- Create: `src/lib/gamification.js`
- Create: `src/lib/gamificationStore.js`
- Test: `src/lib/gamification.test.js`

**Interfaces:**
- Consumes: nothing (pure); store consumes `db` from `../firebase.js`
- Produces: `xpForSession(srpe): number`; `XP: {CHECKIN:10, PLAN_GENERATE:20, STROKE_UPDATE:10, BENCHMARK:15}`; `XP_PER_LEVEL = 1000`; `levelFromXp(xp): {level, title, intoLevel, toNext}`; `awardXp(athleteId, amount): Promise<void>` (from gamificationStore.js). Slices 2+ call these on every save action.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gamification.test.js`:
```js
import { describe, it, expect } from "vitest";
import { xpForSession, levelFromXp, XP, XP_PER_LEVEL } from "./gamification.js";

describe("xpForSession", () => {
  it("awards srpe/8 rounded", () => {
    expect(xpForSession(80)).toBe(10);
    expect(xpForSession(660)).toBe(83);
  });
  it("floors at 5 XP", () => {
    expect(xpForSession(0)).toBe(5);
    expect(xpForSession(24)).toBe(5);
  });
});

describe("XP constants", () => {
  it("matches the design handoff values", () => {
    expect(XP).toEqual({ CHECKIN: 10, PLAN_GENERATE: 20, STROKE_UPDATE: 10, BENCHMARK: 15 });
    expect(XP_PER_LEVEL).toBe(1000);
  });
});

describe("levelFromXp", () => {
  it("starts at level 1 Rookie", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, title: "Rookie 🌱", intoLevel: 0, toNext: 1000 });
  });
  it("tracks progress within a level", () => {
    const r = levelFromXp(640);
    expect(r.level).toBe(1);
    expect(r.intoLevel).toBe(640);
    expect(r.toNext).toBe(360);
  });
  it("levels up every 1000 XP", () => {
    expect(levelFromXp(1000).level).toBe(2);
    expect(levelFromXp(4500).level).toBe(5);
    expect(levelFromXp(4500).title).toBe("Rising Star ⭐");
  });
  it("clamps the title at Legend for level 10+", () => {
    expect(levelFromXp(9500).title).toBe("Legend 👑");
    expect(levelFromXp(25000).title).toBe("Legend 👑");
  });
  it("treats negative/undefined xp as 0", () => {
    expect(levelFromXp(-50).level).toBe(1);
    expect(levelFromXp(undefined).level).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gamification.test.js`
Expected: FAIL — cannot resolve `./gamification.js`.

- [ ] **Step 3: Implement**

Create `src/lib/gamification.js`:
```js
// ─── GAMIFICATION MATH ───────────────────────────────────────────────────────
// Pure XP/level math (no Firebase/React imports — tested). The Firestore
// writer lives in gamificationStore.js.

export const XP = { CHECKIN: 10, PLAN_GENERATE: 20, STROKE_UPDATE: 10, BENCHMARK: 15 };
export const XP_PER_LEVEL = 1000;

const TITLES = [
  "Rookie 🌱", "Starter 🎾", "Grinder 💪", "Contender 🔥", "Rising Star ⭐",
  "Challenger ⚡", "Competitor 🏅", "Champion 🏆", "Elite 🌟", "Legend 👑",
];

// XP earned for logging a session, scaled by its training load.
export function xpForSession(srpe) {
  return Math.max(5, Math.round((srpe || 0) / 8));
}

export function levelFromXp(xp) {
  const safe = Math.max(0, Math.floor(xp || 0));
  const level = Math.floor(safe / XP_PER_LEVEL) + 1;
  const intoLevel = safe % XP_PER_LEVEL;
  return {
    level,
    title: TITLES[Math.min(level, TITLES.length) - 1],
    intoLevel,
    toNext: XP_PER_LEVEL - intoLevel,
  };
}
```

Create `src/lib/gamificationStore.js`:
```js
import { doc, setDoc, increment } from "firebase/firestore";
import { db } from "../firebase.js";

// Adds XP to athletes/{id}/gamification/state, creating the doc on first award.
export async function awardXp(athleteId, amount) {
  if (!athleteId || !amount) return;
  await setDoc(
    doc(db, "athletes", athleteId, "gamification", "state"),
    { xp: increment(amount) },
    { merge: true }
  );
}
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run` → 49 tests pass (41 + 8 new). Run: `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification.js src/lib/gamificationStore.js src/lib/gamification.test.js
git commit -m "Add XP model: session XP, level ladder, Firestore award writer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens — `styles/mobileTheme.js`

**Files:**
- Create: `src/styles/mobileTheme.js`

**Interfaces:**
- Consumes: nothing
- Produces: `M` (token object) and `mobileCss` (global css string) — every `src/ui/` and `src/screens/` file imports from here.

- [ ] **Step 1: Create the file** (complete content):

```js
// ─── MOBILE DESIGN TOKENS ────────────────────────────────────────────────────
// Values from the product-redesign handoff. Used only by the new UI
// (src/ui, src/screens); the legacy theme stays in theme.js until cutover.

export const M = {
  // brand
  gradient:     "linear-gradient(150deg,#d9f86a,#00e5a0)",
  ringGradFrom: "#c8f564", ringGradTo: "#00e5a0",
  brandShadow:  "#12b585", deepGreen: "#0a2e22",
  // ink
  ink: "#12312a", sub: "#7a8a84", muted: "#9aa8a1",
  divider: "#F1F6F2", dividerAlt: "#E4EFE8",
  // surfaces
  card: "#fff", fill: "#F4F8F5", fillAlt: "#EFF4F1", fillDim: "#EDF3EF",
  sheetBg: "#FDFBF3",
  pageBg: "linear-gradient(180deg,#EDFBF3 0%,#FDFBF3 55%)",
  darkCard: "#12312a", lime: "#d9f86a", limeDim: "#8fd400",
  // status
  success: "#12b585", warn: "#d98a1f", danger: "#e0433f",
  parentBlue: "#2f7fd9", parentBlueBg: "#E4EFFB", streakOrange: "#f59a1f",
  // sports
  tennis: "#a9d40f", tennisLight: "#c8f564", match: "#f5c518",
  strength: "#00c88c", cheer: "#f564c8", other: "#4fb0e8",
  // type
  display: "'Fredoka', sans-serif", body: "'DM Sans', sans-serif",
  // shadows
  drop: "0 4px 0 rgba(18,49,42,0.05)", dropLg: "0 5px 0 rgba(18,49,42,0.06)",
  dropSm: "0 3px 0 rgba(18,49,42,0.04)", cta: "0 5px 0 #12b585",
};

export const mobileCss = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  body { margin: 0; background: #EDFBF3; font-family: 'DM Sans', system-ui, sans-serif; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  @keyframes sheetUp { from { transform: translateY(105%); } to { transform: translateY(0); } }
  @keyframes scrimIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes toastPop { 0% { transform: translate(-50%,20px) scale(.9); opacity: 0; } 60% { transform: translate(-50%,-3px) scale(1.03); } 100% { transform: translate(-50%,0) scale(1); opacity: 1; } }
  @keyframes screenIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
```

- [ ] **Step 2: Verify and commit**

Run: `npx vitest run` → 49 pass. Run: `npm run build` → green (file is not imported yet — that's fine).
```bash
git add src/styles/mobileTheme.js
git commit -m "Add mobile design tokens from redesign handoff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: UI primitives — `src/ui/` (5 files)

**Files:**
- Create: `src/ui/Card.jsx`, `src/ui/Header.jsx`, `src/ui/BottomNav.jsx`, `src/ui/BottomSheet.jsx`, `src/ui/Toast.jsx`

**Interfaces:**
- Consumes: `M` from `../styles/mobileTheme.js`
- Produces (props contracts Task 4 relies on):
  - `Card({ children, style })`
  - `Header({ kicker, title, streak, initial, onAvatar })`
  - `BottomNav({ active, onNav, onFab })` — `onNav` receives `"home"|"load"|"matches"|"plan"`
  - `BottomSheet({ open, onClose, children })`
  - `Toast({ message })` — renders nothing when `message` is falsy

- [ ] **Step 1: Create `src/ui/Card.jsx`**

```jsx
import { M } from "../styles/mobileTheme.js";

export default function Card({ children, style }) {
  return (
    <div style={{ background: M.card, borderRadius: 20, padding: 16, boxShadow: M.drop, marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/ui/Header.jsx`**

```jsx
import { M } from "../styles/mobileTheme.js";

export default function Header({ kicker, title, streak, initial, onAvatar }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 16, background: M.gradient,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 25, boxShadow: `0 4px 0 ${M.brandShadow}`,
      }}>🎾</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: M.sub, fontWeight: 600 }}>{kicker}</div>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 24, color: M.ink, lineHeight: 1 }}>{title}</div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 5, background: M.card,
        padding: "8px 13px", borderRadius: 999, boxShadow: "0 3px 0 rgba(18,49,42,0.07)",
      }}>
        <span style={{ fontSize: 15 }}>🔥</span>
        <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 16, color: M.streakOrange }}>{streak}</span>
      </div>
      <div onClick={onAvatar} style={{
        cursor: "pointer", width: 40, height: 40, borderRadius: 13, background: M.darkCard,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: M.display, fontWeight: 700, fontSize: 17, color: M.lime,
      }}>{initial}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/ui/BottomNav.jsx`**

```jsx
import { M } from "../styles/mobileTheme.js";

const TABS = [
  { id: "home",    icon: "🏠", label: "Home" },
  { id: "load",    icon: "📊", label: "Load" },
  { id: "matches", icon: "🎾", label: "Matches" },
  { id: "plan",    icon: "📋", label: "Plan" },
];

function NavItem({ tab, active, onNav }) {
  return (
    <div onClick={() => onNav(tab.id)} style={{
      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
      gap: 3, fontSize: 11, fontFamily: M.body,
      fontWeight: active ? 700 : 600, color: active ? M.success : M.muted,
    }}>
      <span style={{ fontSize: 19 }}>{tab.icon}</span>{tab.label}
    </div>
  );
}

export default function BottomNav({ active, onNav, onFab }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", justifyContent: "center" }}>
      <div style={{
        width: "100%", maxWidth: 480, height: 84, background: "rgba(253,251,243,0.94)",
        backdropFilter: "blur(10px)", borderTop: `1px solid ${M.dividerAlt}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-around",
        padding: "12px 20px 0", paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "content-box",
      }}>
        <NavItem tab={TABS[0]} active={active === "home"} onNav={onNav} />
        <NavItem tab={TABS[1]} active={active === "load"} onNav={onNav} />
        <div onClick={onFab} style={{
          cursor: "pointer", width: 56, height: 56, borderRadius: 19, background: M.gradient,
          display: "flex", alignItems: "center", justifyContent: "center", marginTop: -22,
          boxShadow: `0 6px 0 ${M.brandShadow}, 0 10px 20px rgba(0,229,160,.35)`,
        }}>
          <span style={{ fontSize: 30, color: M.deepGreen, fontWeight: 700, lineHeight: 1, marginTop: -3 }}>+</span>
        </div>
        <NavItem tab={TABS[2]} active={active === "matches"} onNav={onNav} />
        <NavItem tab={TABS[3]} active={active === "plan"} onNav={onNav} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/ui/BottomSheet.jsx`**

```jsx
import { M } from "../styles/mobileTheme.js";

export default function BottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(18,49,42,0.4)",
        zIndex: 50, animation: "scrimIn .2s ease",
      }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          pointerEvents: "auto", width: "100%", maxWidth: 480, maxHeight: "86vh", overflow: "auto",
          background: M.sheetBg, borderRadius: "28px 28px 0 0", padding: "14px 18px 30px",
          animation: "sheetUp .3s cubic-bezier(.2,.9,.3,1)", boxShadow: "0 -12px 40px rgba(18,49,42,.2)",
        }}>
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#DDE6E0", margin: "0 auto 16px" }} />
          {children}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Create `src/ui/Toast.jsx`**

```jsx
import { M } from "../styles/mobileTheme.js";

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)",
      background: M.darkCard, color: M.lime, fontFamily: M.display, fontWeight: 700,
      fontSize: 14, padding: "12px 20px", borderRadius: 999,
      boxShadow: "0 8px 24px rgba(18,49,42,.25)", whiteSpace: "nowrap",
      animation: "toastPop .35s ease", zIndex: 40,
    }}>{message}</div>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run` → 49 pass. Run: `npm run build` → green. Run: `npx eslint src/ui/` → clean (no static-components errors — NavItem is module-level).
```bash
git add src/ui/
git commit -m "Add mobile UI primitives: Card, Header, BottomNav, BottomSheet, Toast

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Shell + placeholder screens — `src/screens/`

**Files:**
- Create: `src/screens/MobileApp.jsx`, `src/screens/PlaceholderScreen.jsx`
- Test: none (Firestore-coupled shell; covered by build + smoke)

**Interfaces:**
- Consumes: all Task 3 primitives; `M`, `mobileCss`; `computeStreak` from `../lib/streak.js`; `toLocalDateStr` from `../lib/dates.js`; `db` from `../firebase`
- Produces: `MobileApp({ athleteId, isParent, user, onSignOut })` default export — Task 5 lazy-imports it. `PlaceholderScreen({ emoji, title, note })` is reused by later slices until each screen lands.

- [ ] **Step 1: Create `src/screens/PlaceholderScreen.jsx`**

```jsx
import Card from "../ui/Card.jsx";
import { M } from "../styles/mobileTheme.js";

export default function PlaceholderScreen({ emoji, title, note }) {
  return (
    <Card style={{ textAlign: "center", padding: "44px 20px" }}>
      <div style={{ fontSize: 44, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: M.ink }}>{title}</div>
      <div style={{ fontSize: 13, color: M.sub, marginTop: 6, lineHeight: 1.5 }}>{note}</div>
    </Card>
  );
}
```

- [ ] **Step 2: Create `src/screens/MobileApp.jsx`** (complete content):

```jsx
import { useState, useEffect, useRef } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M, mobileCss } from "../styles/mobileTheme.js";
import { computeStreak } from "../lib/streak.js";
import { toLocalDateStr } from "../lib/dates.js";
import Header from "../ui/Header.jsx";
import BottomNav from "../ui/BottomNav.jsx";
import BottomSheet from "../ui/BottomSheet.jsx";
import Toast from "../ui/Toast.jsx";
import PlaceholderScreen from "./PlaceholderScreen.jsx";

const SCREENS = {
  home:    { kicker: null,              label: "Home",    emoji: "🏠", note: "Your energy, level and day at a glance — coming in the next update." },
  load:    { kicker: "Training load",   label: "Load",    emoji: "📊", note: "Weekly load, ACWR and where it comes from — coming soon." },
  matches: { kicker: "Season so far",   label: "Matches", emoji: "🎾", note: "Match history, win rate and season intelligence — coming soon." },
  plan:    { kicker: "Your plan",       label: "Plan",    emoji: "📋", note: "Your Sunday session, tuned to your week — coming soon." },
  me:      { kicker: "Profile & tools", label: "Profile", emoji: "⭐", note: "Profile, focus areas and coach tools — coming soon." },
};

// NOTE: the call site also passes { isParent, user, onSignOut } (contractual for later
// slices); destructure them here only when a slice starts consuming them.
export default function MobileApp({ athleteId }) {
  const [screen, setScreen]   = useState("home");
  const [name, setName]       = useState("");
  const [streak, setStreak]   = useState(0);
  const [sheetOpen, setSheet] = useState(false);
  const [toast, setToast]     = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Profile name for the header
    getDoc(doc(db, "athletes", athleteId))
      .then((snap) => { if (snap.exists()) setName(snap.data().name || ""); })
      .catch((e) => console.error("MobileApp profile load:", e));

    // Streak: any entry (activity, strength, check-in) in the last 60 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoff = toLocalDateStr(cutoffDate);
    Promise.all(["weekLogs", "sessions", "wellbeing"].map((col) =>
      getDocs(query(collection(db, "athletes", athleteId, col), where("date", ">=", cutoff)))
    ))
      .then((snaps) => {
        const dates = snaps.flatMap((s) => s.docs.map((d) => d.data().date)).filter(Boolean);
        setStreak(computeStreak(dates, toLocalDateStr(new Date())).current);
      })
      .catch((e) => console.error("MobileApp streak load:", e));
  }, [athleteId]);

  const firstName = (name || "Athlete").split(" ")[0];
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const kicker = screen === "home" ? `${weekday} · let's play` : SCREENS[screen].kicker;
  const title = screen === "home" ? `Hi, ${firstName}!` : screen === "me" ? firstName
    : screen.charAt(0).toUpperCase() + screen.slice(1);
  const sc = SCREENS[screen];

  return (
    <div style={{ minHeight: "100vh", background: M.pageBg }}>
      <style>{mobileCss}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "22px 16px 110px" }}>
        <Header
          kicker={kicker}
          title={title}
          streak={streak}
          initial={firstName.charAt(0).toUpperCase() || "A"}
          onAvatar={() => setScreen("me")}
        />
        <div key={screen} style={{ animation: "screenIn .25s ease" }}>
          <PlaceholderScreen emoji={sc.emoji} title={`${sc.label} is on its way`} note={sc.note} />
        </div>
      </div>

      <BottomNav active={screen} onNav={setScreen} onFab={() => setSheet(true)} />

      <BottomSheet open={sheetOpen} onClose={() => setSheet(false)}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 6 }}>Log a session 🎾</div>
        <div style={{ fontSize: 13, color: M.sub, marginBottom: 18, lineHeight: 1.5 }}>
          Session logging lands here in the next update. Until then, keep using the classic logger — every session still counts!
        </div>
        <div
          onClick={() => { setSheet(false); showToast("Logging arrives soon ✨"); }}
          style={{
            cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
            padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
            fontSize: 16, boxShadow: M.cta,
          }}
        >Got it ⚡</div>
      </BottomSheet>

      <Toast message={toast} />
    </div>
  );
}
```
(The call site passes the full `{ athleteId, isParent, user, onSignOut }` contract; MobileApp destructures only `athleteId` for now to keep lint clean — later slices add the rest as they consume them.)

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run` → 49 pass. Run: `npm run build` → green. Run: `npx eslint src/screens/` → no static-components errors, no no-undef.
```bash
git add src/screens/
git commit -m "Add MobileApp shell: header with live streak, nav, sheet, toast, placeholders

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Feature flag route — `src/App.jsx`

**Files:**
- Modify: `src/App.jsx` (~104 lines — add flag + lazy route)

**Interfaces:**
- Consumes: `MobileApp` (Task 4)
- Produces: `?newui` opt-in routing. Flag OFF ⇒ App.jsx behaves byte-identically to before this task.

- [ ] **Step 1: Add the flag and lazy import**

After the existing `const AthleteView = lazy(...)` line, add:
```js
const MobileApp = lazy(() => import("./screens/MobileApp.jsx"));

// New-UI feature flag: visit ?newui once to opt this device in, ?newui=0 to opt out.
const params = new URLSearchParams(window.location.search);
if (params.has("newui")) localStorage.setItem("newui", params.get("newui") === "0" ? "0" : "1");
const NEW_UI = localStorage.getItem("newui") === "1";
```

- [ ] **Step 2: Add the route**

In `App()`, immediately AFTER the `authState === "unauthorized"` branch and BEFORE the `authState === "parent" && viewingAthleteId` branch, add:
```jsx
  if (NEW_UI && (authState === "parent" || authState === "athlete")) {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <MobileApp athleteId={athleteId} isParent={authState === "parent"} user={user} onSignOut={handleSignOut} />
      </Suspense>
    );
  }
```
(Unauthenticated/unauthorized users still see the unchanged LoginScreen/lock screen regardless of the flag.)

- [ ] **Step 3: Verify flag-off regression + flag-on chunk**

Run: `npx vitest run` → 49 pass. Run: `npm run build` → green AND the output now lists a `MobileApp-*.js` chunk. Run: `npx eslint src/App.jsx` → clean.
Flag-off check: `git diff` shows App.jsx only gained the flag block and the conditional branch — no existing line modified.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Route authenticated users to MobileApp behind ?newui flag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verification sweep (controller)

- [ ] **Step 1: Gates** — `npx vitest run` (49), `npm run build` (green, MobileApp chunk), `npx eslint src/ | tail -1` (≤ 34 baseline, 0 static-components).
- [ ] **Step 2: Browser checks** — dev server: default URL renders old login unchanged, 0 console errors; `?newui` URL (unauthenticated) also renders old login (flag only affects authed users), 0 console errors.
- [ ] **Step 3: Spec status** — mark the slice-1 spec `Implemented`; commit docs.
- [ ] **Step 4: Hand the manual smoke to the user** — sign in with `?newui` on a phone/desktop: header + streak, nav switching, FAB sheet, toast.
