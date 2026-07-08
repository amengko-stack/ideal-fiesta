# Phase 2b Slice 7: Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Badge system live — definitions + evaluation (TDD), persistence, award-on-load with toast, trophy case on Home, badge detail sheet.

**Spec:** `docs/superpowers/specs/2026-07-08-phase2b-slice7-badges-design.md`

## Global Constraints
- Flag off ⇒ classic app untouched. No new dependencies. After every task: `npx vitest run` green, `npm run build` green. Commit per task with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Do NOT delete any files.

---

### Task 1: `lib/badges.js` (TDD)

**Files:** Create `src/lib/badges.js`, `src/lib/badges.test.js`

**Interfaces:**
- `BADGES: Array<{id, emoji, name, desc, hint}>` (8 entries, spec order)
- `evaluateBadges(stats): string[]` — ids currently satisfied; `stats = { sessionCount, streak, wins, checkinDays, level, planCompleted }` (all optional, absent → falsy).

- [ ] **Step 1: Failing test** — create `src/lib/badges.test.js`:
```js
import { describe, it, expect } from "vitest";
import { BADGES, evaluateBadges } from "./badges.js";

describe("BADGES", () => {
  it("defines the 8 spec badges with required fields", () => {
    expect(BADGES.map(b => b.id)).toEqual([
      "first-session", "sessions-10", "streak-5", "streak-14",
      "first-win", "checkin-7", "level-5", "plan-done",
    ]);
    for (const b of BADGES) {
      expect(b.emoji).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.desc).toBeTruthy();
      expect(b.hint).toBeTruthy();
    }
  });
});

describe("evaluateBadges", () => {
  it("returns nothing for empty stats", () => {
    expect(evaluateBadges({})).toEqual([]);
  });
  it("awards session badges by count", () => {
    expect(evaluateBadges({ sessionCount: 1 })).toEqual(["first-session"]);
    expect(evaluateBadges({ sessionCount: 10 })).toEqual(["first-session", "sessions-10"]);
  });
  it("awards streak tiers", () => {
    expect(evaluateBadges({ streak: 5 })).toEqual(["streak-5"]);
    expect(evaluateBadges({ streak: 14 })).toEqual(["streak-5", "streak-14"]);
  });
  it("awards win, check-in, level and plan badges", () => {
    expect(evaluateBadges({ wins: 1 })).toEqual(["first-win"]);
    expect(evaluateBadges({ checkinDays: 7 })).toEqual(["checkin-7"]);
    expect(evaluateBadges({ level: 5 })).toEqual(["level-5"]);
    expect(evaluateBadges({ planCompleted: true })).toEqual(["plan-done"]);
  });
  it("combines independent badges", () => {
    expect(evaluateBadges({ sessionCount: 12, streak: 6, wins: 2, level: 5 }))
      .toEqual(["first-session", "sessions-10", "streak-5", "first-win", "level-5"]);
  });
});
```

- [ ] **Step 2: Verify failure**, then **Step 3: Implement** `src/lib/badges.js`:
```js
// ─── BADGES ──────────────────────────────────────────────────────────────────
// Definitions + pure evaluation. Earned state lives in Firestore
// (gamification/state.badges) and is never revoked — evaluateBadges only says
// which predicates are satisfied by the CURRENT data window.

export const BADGES = [
  { id: "first-session", emoji: "🎾", name: "First Steps",       desc: "Logged a first training session.",          hint: "Log any session" },
  { id: "sessions-10",   emoji: "💪", name: "Ten Strong",        desc: "Ten sessions logged. That's a habit!",      hint: "Log 10 sessions" },
  { id: "streak-5",      emoji: "🔥", name: "5-Day Streak",      desc: "Active five days in a row.",                hint: "5 days in a row" },
  { id: "streak-14",     emoji: "⚡", name: "Two-Week Fire",     desc: "Fourteen straight active days!",            hint: "14 days in a row" },
  { id: "first-win",     emoji: "🏆", name: "First Win",         desc: "Won a recorded match.",                     hint: "Win a match" },
  { id: "checkin-7",     emoji: "✨", name: "Week of Check-ins", desc: "Checked in seven different days.",          hint: "Check in 7 days" },
  { id: "level-5",       emoji: "⭐", name: "Rising Star",       desc: "Reached level 5.",                          hint: "Reach level 5" },
  { id: "plan-done",     emoji: "📋", name: "Plan Crusher",      desc: "Finished every exercise in a Sunday plan.", hint: "Tick off a full plan" },
];

const PREDICATES = {
  "first-session": s => (s.sessionCount || 0) >= 1,
  "sessions-10":   s => (s.sessionCount || 0) >= 10,
  "streak-5":      s => (s.streak || 0) >= 5,
  "streak-14":     s => (s.streak || 0) >= 14,
  "first-win":     s => (s.wins || 0) >= 1,
  "checkin-7":     s => (s.checkinDays || 0) >= 7,
  "level-5":       s => (s.level || 0) >= 5,
  "plan-done":     s => !!s.planCompleted,
};

export function evaluateBadges(stats) {
  const s = stats || {};
  return BADGES.filter(b => PREDICATES[b.id](s)).map(b => b.id);
}
```

- [ ] **Step 4: Verify** — `npx vitest run` 72/72 (66+6); build green.
- [ ] **Step 5: Commit** — `"Add badge definitions and evaluation" ...trailer`

---

### Task 2: `src/screens/BadgeSheet.jsx` + trophy case in HomeScreen

**Files:** Create `src/screens/BadgeSheet.jsx`; Modify `src/screens/HomeScreen.jsx`

**Interfaces:**
- `BadgeSheet({ badge, earnedDate })` — presentational sheet content; `badge` is a BADGES entry, `earnedDate` string or undefined (locked).
- HomeScreen gains props `earnedBadges` (map id→date) and `onOpenBadge(badge)`; renders the trophy case between the level card and the tiles.

- [ ] **Step 1: Create `src/screens/BadgeSheet.jsx`**:
```jsx
import { M } from "../styles/mobileTheme.js";

export default function BadgeSheet({ badge, earnedDate }) {
  if (!badge) return null;
  const earned = !!earnedDate;
  return (
    <>
      <div style={{
        width: 92, height: 92, borderRadius: 28, margin: "0 auto 14px", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 46,
        background: earned ? "linear-gradient(150deg,#eefbdf,#e2fbf2)" : M.fillDim,
        filter: earned ? "none" : "grayscale(1)", opacity: earned ? 1 : 0.6,
      }}>{badge.emoji}</div>
      <div style={{ textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink }}>{badge.name}</div>
      <div style={{ textAlign: "center", fontSize: 13, color: M.sub, margin: "8px 0 14px", lineHeight: 1.5 }}>{badge.desc}</div>
      <div style={{ textAlign: "center" }}>
        <span style={{
          display: "inline-block", fontFamily: M.display, fontWeight: 700, fontSize: 12.5,
          padding: "5px 13px", borderRadius: 999,
          color: earned ? M.deepGreen : "#8a7420", background: earned ? M.gradient : "#FBEFDD",
        }}>{earned ? `Earned · ${earnedDate}` : `Locked · ${badge.hint}`}</span>
      </div>
    </>
  );
}
```

- [ ] **Step 2: HomeScreen trophy case** — add imports `import { BADGES } from "../lib/badges.js";`; add `earnedBadges` and `onOpenBadge` to the destructured props. Insert BETWEEN the level card and the tiles row:
```jsx
      {/* trophy case */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11, padding: "0 2px" }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Trophy case 🏆</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: M.sub }}>
            {Object.keys(earnedBadges || {}).length}/{BADGES.length} earned
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
          {BADGES.map(b => {
            const earned = !!earnedBadges?.[b.id];
            return (
              <div key={b.id} onClick={() => onOpenBadge(b)} style={{ flexShrink: 0, width: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <div style={{
                  width: 58, height: 58, borderRadius: 19, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 25,
                  background: earned ? M.fill : M.fillDim,
                  boxShadow: earned ? "0 3px 0 rgba(18,49,42,0.07)" : "none",
                  border: earned ? `1px solid ${M.dividerAlt}` : "1px dashed #CBD8CF",
                  filter: earned ? "none" : "grayscale(1)", opacity: earned ? 1 : 0.55,
                }}>{b.emoji}</div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: earned ? "#5f7168" : M.muted, textAlign: "center", lineHeight: 1.1 }}>{b.name}</span>
              </div>
            );
          })}
        </div>
      </div>
```

- [ ] **Step 3: Verify** — tests 72; build; eslint clean. **Commit** `"Add trophy case and badge sheet" ...trailer`

---

### Task 3: Award wiring in MobileApp

**Files:** Modify `src/screens/MobileApp.jsx`

- [ ] **Step 1:** Imports: `BadgeSheet`, `BADGES, evaluateBadges` from `../lib/badges.js`, `levelFromXp` from `../lib/gamification.js`. State: `earnedBadges` ({}), `badgeSheet` (null — the tapped BADGES entry). In the load effect's `.then`, AFTER the existing setters (inside the cancelled guard), read the stored map from the SAME `xpSnap`: `const stored = xpSnap.exists() ? xpSnap.data().badges || {} : {};` then `setEarnedBadges(stored);` and compute:
```js
        const xpVal = xpSnap.exists() ? xpSnap.data().xp || 0 : 0;
        const planDoc = planSnap.exists() ? planSnap.data() : null;
        const stats = {
          sessionCount: logs.length,
          streak: computeStreak(dates, toLocalDateStr(new Date())).current,
          wins: matchesSnap.docs.filter(d => d.data().whoWonMatch === 1).length,
          checkinDays: new Set(wb.map(w => w.date)).size,
          level: levelFromXp(xpVal).level,
          planCompleted: !!(planDoc && (planDoc.plan || []).length > 0 && (planDoc.plan || []).every(ex => planDoc.doneMap?.[ex.id])),
        };
        const satisfied = evaluateBadges(stats);
        const fresh = satisfied.filter(id => !stored[id]);
        if (fresh.length > 0) {
          const today = toLocalDateStr(new Date());
          const additions = Object.fromEntries(fresh.map(id => [id, today]));
          setEarnedBadges({ ...stored, ...additions });
          setDoc(doc(db, "athletes", athleteId, "gamification", "state"),
            { badges: { ...stored, ...additions } }, { merge: true })
            .catch(err => console.error("badge save:", err));
          const first = BADGES.find(b => b.id === fresh[0]);
          showToast(fresh.length === 1 ? `Badge earned: ${first.emoji} ${first.name}!` : `🏆 ${fresh.length} new badges earned!`);
        }
```
(Reuse the already-computed `dates`; do NOT recompute streakInfo — reuse its value if in scope, else compute once into a local and use for both setStreakInfo and stats.)
- [ ] **Step 2:** Home mount gains `earnedBadges={earnedBadges}` and `onOpenBadge={(b) => setBadgeSheet(b)}`. Sheets gain:
```jsx
      <BottomSheet open={badgeSheet != null} onClose={() => setBadgeSheet(null)}>
        <BadgeSheet badge={badgeSheet} earnedDate={badgeSheet ? earnedBadges[badgeSheet.id] : null} />
      </BottomSheet>
```
- [ ] **Step 3:** Verify — tests 72; build; eslint clean. **Commit** `"Award badges on load; wire trophy case + badge sheet" ...trailer`

---

### Task 4: Review + push (controller)
- [ ] Whole-slice review (fable): predicate/stat correctness (checkinDays counts DISTINCT wellbeing dates incl. legacy AM/PM; wins from matches; planCompleted edge cases), award idempotence (no re-toast for stored badges; merge-write doesn't clobber xp), HomeScreen insert position + prop additions only, gates. Fix findings, mark spec Implemented, push.
