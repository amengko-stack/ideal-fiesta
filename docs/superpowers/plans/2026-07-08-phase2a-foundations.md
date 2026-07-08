# Phase 2a: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the design-agnostic foundations for the upcoming redesign: full-weight sRPE, per-week load history, streak math, and retirement of cheerleading from logging/prompts — with history preserved.

**Architecture:** All math lands in the tested `src/lib/` layer (TDD, pure functions, no Firestore). Cheer retirement is surgical edits to two logging components, one AI prompt block, and three copy strings; every rendering path for historical `type: "cheer"` data stays intact.

**Tech Stack:** React 19 + Vite 8, Vitest, Firebase (untouched this phase).

**Spec:** `docs/superpowers/specs/2026-07-08-phase2a-foundations-design.md`

## Global Constraints

- No new UI components — UI consumption of the new functions happens in Phase 2b.
- No new dependencies.
- `src/lib/` files must not import React.
- Historical cheer data keeps rendering everywhere: do NOT touch `COLORS.cheer`, `pill-cheer`, ProgressTab's cheer tile, or any `typeLabel` mapping that displays existing logs.
- The Firestore profile field key `cheerSchedule` is NOT renamed (data continuity) — only its UI label changes.
- After every task: `npx vitest run` green and `npm run build` green. Commit per task, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Work on branch `claude/general-assistance-jpgfB`. OneDrive-synced folder: delete stray artifacts (e.g. `{moved}`) before committing.

---

### Task 1: sessionSRPE full weight

**Files:**
- Modify: `src/lib/load.js` (sessionSRPE, ~line 10)
- Test: `src/lib/load.test.js` (the "applies the 0.6 multiplier" case)

**Interfaces:**
- Consumes: nothing
- Produces: `sessionSRPE(log): number` — now `rpe × duration` for ALL types (rpe fallback `intensity×2` else 5; duration fallback 60). Tasks 2's `computeLoadHistory` and all existing consumers (`computeLoad`, `calculateMetrics`, `buildAthleteContext`) inherit this automatically.

- [ ] **Step 1: Update the test to pin full weight**

In `src/lib/load.test.js`, replace:
```js
  it("applies the 0.6 multiplier for type 'other'", () => {
    expect(sessionSRPE({ type: "other", rpe: 5, duration: 60 })).toBe(180);
  });
```
with:
```js
  it("counts 'other' (cross-training) at full weight", () => {
    expect(sessionSRPE({ type: "other", rpe: 5, duration: 60 })).toBe(300);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/load.test.js`
Expected: 1 FAIL — received 180, expected 300.

- [ ] **Step 3: Update the implementation**

In `src/lib/load.js`, replace the `sessionSRPE` body:
```js
export function sessionSRPE(log) {
  const rpe        = log.rpe ?? (log.intensity ? log.intensity * 2 : 5);
  const duration   = log.duration || 60;
  const multiplier = log.type === "other" ? 0.6 : 1.0;
  return rpe * duration * multiplier;
}
```
with:
```js
// All session types count at full weight. (The former 0.6 discount for
// "other" was retired when cross-training became a primary activity.)
export function sessionSRPE(log) {
  const rpe      = log.rpe ?? (log.intensity ? log.intensity * 2 : 5);
  const duration = log.duration || 60;
  return rpe * duration;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run` → all pass (24). Run: `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/load.js src/lib/load.test.js
git commit -m "Count cross-training sessions at full sRPE weight

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: computeLoadHistory (TDD)

**Files:**
- Modify: `src/lib/load.js` (append new export)
- Test: `src/lib/load.test.js` (new describe block)

**Interfaces:**
- Consumes: `getWeekBounds` from `./dates.js`, `sessionSRPE` (Task 1 semantics), `computeLoad` (for the consistency test)
- Produces: `computeLoadHistory(logs, weeks = 12): Array<{ weekStart: string, srpeByType: {tennis:number, cheer:number, other:number}, totalSrpe: number, acwr: number|null }>` — oldest → newest, length exactly `weeks`. Phase 2b's Load screen consumes this.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/load.test.js` (add `computeLoadHistory` to the import from `./load.js`):
```js
describe("computeLoadHistory", () => {
  it("returns exactly `weeks` entries, oldest → newest, Monday-keyed", () => {
    const h = computeLoadHistory([], 12);
    expect(h).toHaveLength(12);
    expect(h[11].weekStart).toBe(getWeekBounds(0).start);
    expect(h[0].weekStart).toBe(getWeekBounds(11).start);
  });
  it("gives null ACWR and zero totals with no data", () => {
    const h = computeLoadHistory([], 4);
    expect(h.every(w => w.totalSrpe === 0 && w.acwr === null)).toBe(true);
  });
  it("buckets logs into the correct week and type", () => {
    const logs = [
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start }, // 300
      { type: "cheer",  rpe: 4, duration: 30, date: getWeekBounds(1).start }, // 120
      { type: "other",  rpe: 6, duration: 60, date: getWeekBounds(0).start }, // 360 (full weight)
    ];
    const h = computeLoadHistory(logs, 4);
    const now = h[3], prev = h[2];
    expect(now.srpeByType).toEqual({ tennis: 300, cheer: 0, other: 360 });
    expect(now.totalSrpe).toBe(660);
    expect(prev.srpeByType.cheer).toBe(120);
    expect(prev.totalSrpe).toBe(120);
  });
  it("computes each week's ACWR from that week + 3 prior", () => {
    const logs = [
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start }, // this wk: 300
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(1).start }, // prev wk: 300
    ];
    const h = computeLoadHistory(logs, 2);
    // newest week: window = [0,0,300,300] → avg 150 → acwr 2
    expect(h[1].acwr).toBe(2);
    // previous week: window = [0,0,0,300] → avg 75 → acwr 4
    expect(h[0].acwr).toBe(4);
  });
  it("matches computeLoad for the current week (shared source of truth)", () => {
    const logs = [
      { type: "tennis", rpe: 7, duration: 90, date: getWeekBounds(0).start },
      { type: "other",  rpe: 4, duration: 45, date: getWeekBounds(2).start },
    ];
    const current = computeLoadHistory(logs, 12).at(-1);
    const snapshot = computeLoad(logs);
    expect(current.totalSrpe).toBe(snapshot.thisWeekSRPE);
    expect(current.acwr).toBe(snapshot.acwr);
  });
  it("folds unknown types into 'other'", () => {
    const h = computeLoadHistory([{ type: "swimming", rpe: 5, duration: 60, date: getWeekBounds(0).start }], 1);
    expect(h[0].srpeByType.other).toBe(300);
  });
});
```
(`computeLoad` and `getWeekBounds` are already imported at the top of the test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/load.test.js`
Expected: FAIL — `computeLoadHistory` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/load.js`:
```js
// Per-week load history, oldest → newest, for trend charts. Each entry carries
// that week's sRPE split by type and its ACWR (that week ÷ mean of that week +
// 3 prior — the same window semantics as computeLoad). Three extra weeks are
// computed before the visible window so the oldest visible week still has a
// full ACWR denominator.
export function computeLoadHistory(logs, weeks = 12) {
  const totalWeeks = weeks + 3;
  const buckets = [];
  for (let weeksAgo = totalWeeks - 1; weeksAgo >= 0; weeksAgo--) {
    const { start, end } = getWeekBounds(weeksAgo);
    const srpeByType = { tennis: 0, cheer: 0, other: 0 };
    let totalSrpe = 0;
    for (const l of logs || []) {
      if (l.date >= start && l.date < end) {
        const srpe = sessionSRPE(l);
        const key = srpeByType[l.type] != null ? l.type : "other";
        srpeByType[key] += srpe;
        totalSrpe += srpe;
      }
    }
    buckets.push({ weekStart: start, srpeByType, totalSrpe });
  }
  return buckets.slice(3).map((b, i) => {
    const window = buckets.slice(i, i + 4); // 3 prior weeks + this one
    const avg = window.reduce((s, w) => s + w.totalSrpe, 0) / 4;
    const acwr = avg > 0 ? Math.round((b.totalSrpe / avg) * 100) / 100 : null;
    return { ...b, acwr };
  });
}
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run` → all pass (30). Run: `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/load.js src/lib/load.test.js
git commit -m "Add computeLoadHistory: per-week sRPE by type with rolling ACWR

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: weekStartOf + computeStreak (TDD)

**Files:**
- Modify: `src/lib/dates.js` (append `weekStartOf`)
- Create: `src/lib/streak.js`
- Test: `src/lib/dates.test.js` (weekStartOf cases), Create: `src/lib/streak.test.js`

**Interfaces:**
- Consumes: `toLocalDateStr` from `./dates.js`
- Produces:
  - `weekStartOf(dateStr: "YYYY-MM-DD"): "YYYY-MM-DD"` — Monday of that date's week
  - `computeStreak(dateStrs: Iterable<string>, today: "YYYY-MM-DD"): { current: number, activeThisWeek: number }` — Phase 2b's streak pill / Home hero consume this.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/dates.test.js` (add `weekStartOf` to the import):
```js
describe("weekStartOf", () => {
  it("maps a mid-week date to its Monday", () => {
    expect(weekStartOf("2026-07-08")).toBe("2026-07-06"); // Wed → Mon
  });
  it("maps Sunday to the preceding Monday", () => {
    expect(weekStartOf("2026-07-12")).toBe("2026-07-06");
  });
  it("maps Monday to itself", () => {
    expect(weekStartOf("2026-07-06")).toBe("2026-07-06");
  });
});
```

Create `src/lib/streak.test.js`:
```js
import { describe, it, expect } from "vitest";
import { computeStreak } from "./streak.js";

const TODAY = "2026-07-08"; // a Wednesday

describe("computeStreak", () => {
  it("returns zeros for no entries", () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, activeThisWeek: 0 });
  });
  it("counts a single entry today", () => {
    expect(computeStreak(["2026-07-08"], TODAY)).toEqual({ current: 1, activeThisWeek: 1 });
  });
  it("keeps the streak alive on yesterday's entry (grace period)", () => {
    expect(computeStreak(["2026-07-07"], TODAY).current).toBe(1);
  });
  it("is dead when the last entry was two days ago", () => {
    expect(computeStreak(["2026-07-06"], TODAY).current).toBe(0);
  });
  it("counts consecutive chains through today", () => {
    const r = computeStreak(["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08"], TODAY);
    expect(r.current).toBe(4);
  });
  it("stops the chain at a gap", () => {
    const r = computeStreak(["2026-07-04", "2026-07-06", "2026-07-07", "2026-07-08"], TODAY);
    expect(r.current).toBe(3); // 06,07,08 — the 04 is across a gap
  });
  it("counts activeThisWeek only within the current Mon–Sun week up to today", () => {
    const r = computeStreak(["2026-07-05", "2026-07-06", "2026-07-08"], TODAY);
    expect(r.activeThisWeek).toBe(2); // Jul 5 is the previous week (Sunday)
  });
  it("deduplicates repeated dates", () => {
    const r = computeStreak(["2026-07-08", "2026-07-08"], TODAY);
    expect(r).toEqual({ current: 1, activeThisWeek: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/dates.test.js src/lib/streak.test.js`
Expected: FAIL — `weekStartOf` not exported; cannot resolve `./streak.js`.

- [ ] **Step 3: Implement**

Append to `src/lib/dates.js`:
```js
// Monday of the week containing the given YYYY-MM-DD date string.
export function weekStartOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - daysToMonday);
  return toLocalDateStr(mon);
}
```

Create `src/lib/streak.js`:
```js
import { toLocalDateStr, weekStartOf } from "./dates.js";

const prevDayStr = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
};

// Streak of consecutive days with ANY entry (activity log, strength session,
// or wellbeing check-in — check-ins keep rest days alive). `today` is injected
// for testability. A streak ending yesterday still counts (grace period: the
// streak isn't dead at breakfast).
export function computeStreak(dateStrs, today) {
  const days = new Set(dateStrs || []);

  let anchor = null;
  if (days.has(today)) anchor = today;
  else if (days.has(prevDayStr(today))) anchor = prevDayStr(today);

  let current = 0;
  for (let d = anchor; d && days.has(d); d = prevDayStr(d)) current++;

  const monday = weekStartOf(today);
  let activeThisWeek = 0;
  for (const d of days) {
    if (d >= monday && d <= today) activeThisWeek++;
  }

  return { current, activeThisWeek };
}
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run` → all pass (41). Run: `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.js src/lib/dates.test.js src/lib/streak.js src/lib/streak.test.js
git commit -m "Add weekStartOf and computeStreak (any-entry daily streak with grace)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Retire cheer from the two loggers

**Files:**
- Modify: `src/athlete/AVLogSession.jsx` (lines ~79, ~115, ~118, ~182, ~267)
- Modify: `src/tabs/LogTab.jsx` (lines ~19, ~46, ~117)

**Interfaces:**
- Consumes: nothing new
- Produces: no API change — `type: "cheer"` simply becomes unselectable for NEW logs. Display branches for historical cheer logs (AVLogSession ~127 `overlayEmoji`, ~292 `typeLabel`; LogTab ~139 `typeLabel`) are explicitly KEPT.

- [ ] **Step 1: AVLogSession — remove the cheer input path**

1. Delete line ~182: `<TypeBtn t="cheer" icon="📣" label="Cheerleading" color={COLORS.cheer} type={type} setType={setType} setFocus={setFocus} setSportName={setSportName} />`
2. Delete the `CHEER_FOCUS` const (line ~79).
3. Line ~267: change `(type === "tennis" ? TENNIS_FOCUS : type === "cheer" ? CHEER_FOCUS : OTHER_FOCUS)` → `(type === "tennis" ? TENNIS_FOCUS : OTHER_FOCUS)`.
4. Line ~115: change
   `const activityLabel = type === "tennis" ? "Tennis" : type === "cheer" ? "Cheerleading" : entry.sportName || "Other Sport";`
   → `const activityLabel = type === "tennis" ? "Tennis" : entry.sportName || "Other Sport";`
   (a just-saved entry can no longer be cheer).
5. DO NOT touch lines ~127 (`overlayEmoji`) or ~292 (history `typeLabel`) — wait: line 127 reads `savedEntry?.type` which after this change can never be "cheer"; leave it as-is anyway (harmless, minimal diff).

- [ ] **Step 2: AVLogSession — update the motivation prompt**

Line ~118, replace the system string:
```js
      system: "You are an encouraging sports coach writing a short motivational message to a 12-year-old female tennis and cheerleading athlete named Valissa. Keep it genuine, specific, and energetic — not generic. Never use the same phrasing twice. Write like a coach who actually watched her train, not a robot. Maximum 2 sentences.",
```
with:
```js
      system: "You are an encouraging sports coach writing a short motivational message to a 12-year-old female tennis athlete named Valissa who also cross-trains in other sports. Keep it genuine, specific, and energetic — not generic. Never use the same phrasing twice. Write like a coach who actually watched her train, not a robot. Maximum 2 sentences.",
```

- [ ] **Step 3: LogTab — remove the cheer input path**

1. Delete line ~46: `<option value="cheer">📣 Cheerleading</option>`
2. Delete the `CHEER_FOCUS` const (line ~19).
3. Line ~117: change `(type === "tennis" ? TENNIS_FOCUS : type === "cheer" ? CHEER_FOCUS : OTHER_FOCUS)` → `(type === "tennis" ? TENNIS_FOCUS : OTHER_FOCUS)`.
4. DO NOT touch line ~139 (history `typeLabel`).

- [ ] **Step 4: Verify**

Run: `npx vitest run` → all pass. Run: `npm run build` → green.
Run: `npx eslint src/athlete/AVLogSession.jsx src/tabs/LogTab.jsx` → no NEW errors (pre-existing ones unchanged); in particular no `no-unused-vars` for a leftover `CHEER_FOCUS`.

- [ ] **Step 5: Commit**

```bash
git add src/athlete/AVLogSession.jsx src/tabs/LogTab.jsx
git commit -m "Remove cheerleading from logging inputs; history rendering untouched

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Retire cheer from prompts and copy

**Files:**
- Modify: `src/tabs/PlanTab.jsx` (prompt text: lines ~100, ~126, ~130, ~134–138, ~240; KEEP ~41 typeLabel)
- Modify: `src/components/LoginScreen.jsx` (line ~27)
- Modify: `src/tabs/AthleteMain.jsx` (line ~109)
- Modify: `src/tabs/ProfileTab.jsx` (lines ~81–82; KEEP the `cheerSchedule` field key)

**Interfaces:**
- Consumes: nothing
- Produces: no API change — prompt/copy text only. `typeLabel` mappings and the `cheerSchedule` Firestore key stay.

- [ ] **Step 1: PlanTab prompt surgery** (all inside the plan-generation prompt template)

1. Line ~100: replace
   `- Primary sport: Tennis | Secondary sport: Cheerleading`
   with
   `- Primary sport: Tennis | Secondary: cross-training in other sports (she recently stopped cheerleading — older logs may include cheer sessions; treat those as historical load only)`
2. Line ~126: replace
   `- Shoulder health: monitor for impingement patterns given overhead cheerleading demands`
   with
   `- Shoulder health: monitor for impingement patterns given repeated overhead serve demands`
3. Line ~130: replace
   `- Tennis + cheerleading together create high rotational, overhead, and lower-limb demands`
   with
   `- Tennis + cross-training together create high rotational, overhead, and lower-limb demands`
4. Lines ~134–138: replace the whole block
   ```
   CHEERLEADING-SPECIFIC DEMANDS (factor into exercise selection):
   - Stunting: requires full-body tension, core stability, wrist and shoulder strength (basing or flying)
   - Tumbling (back handsprings, round-offs): explosive hip extension, shoulder stability, wrist loading
   - Basing: high ground-reaction forces through wrists — include wrist mobility/prehab when cheer was heavy
   - Cheerleading overlaps with tennis on: rotational power, core anti-rotation, shoulder health, landing mechanics
   ```
   with
   ```
   CROSS-TRAINING CONTEXT (factor into exercise selection):
   - Sessions logged as "other" are cross-training in varied sports — read their focus/sport notes for specifics
   - Use cross-training variety to develop general athleticism without adding tennis-specific overuse load
   ```
5. Line ~240: replace `- Heavy tennis/cheer week → reduce strength volume to prevent overtraining` with `- Heavy tennis/cross-training week → reduce strength volume to prevent overtraining`
6. Verify line ~41 `typeLabel = { tennis: "Tennis", cheer: "Cheerleading", other: "Other sport" }` is UNCHANGED (labels historical logs in the prompt).

- [ ] **Step 2: Copy strings**

1. `src/components/LoginScreen.jsx` line ~27: `Tennis · Cheerleading · Strength` → `Tennis · Cross-Training · Strength`
2. `src/tabs/AthleteMain.jsx` line ~109: replace
   `{ label: "Cheer",                      color: COLORS.cheer,   bg: "rgba(245,100,200,0.1)" },`
   with
   `{ label: "Cross-Training",             color: COLORS.yellow,  bg: "rgba(245,197,24,0.1)" },`
3. `src/tabs/ProfileTab.jsx` lines ~81–82: label `Cheerleading Schedule` → `Cross-Training Schedule`; placeholder stays; `name="cheerSchedule"` and the `form.cheerSchedule` key stay (Firestore continuity).

- [ ] **Step 3: Sweep check**

Run: `grep -rni "cheerlead" src/ --include="*.jsx" --include="*.js"`
Expected remaining matches ONLY: AVLogSession ~292 & LogTab ~139 history `typeLabel`s ("📣 Cheer"), PlanTab ~41 typeLabel ("Cheerleading"), ProfileTab `cheerSchedule` key references — nothing describing cheer as a CURRENT sport. (theme.js `cheer` color key and ProgressTab cheer totals are expected too — they're history rendering.)

- [ ] **Step 4: Verify**

Run: `npx vitest run` → all pass. Run: `npm run build` → green. Run: `npx eslint src/tabs/PlanTab.jsx src/components/LoginScreen.jsx src/tabs/AthleteMain.jsx src/tabs/ProfileTab.jsx` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/tabs/PlanTab.jsx src/components/LoginScreen.jsx src/tabs/AthleteMain.jsx src/tabs/ProfileTab.jsx
git commit -m "Update AI prompts and copy: tennis + cross-training replaces cheerleading

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-08-phase2a-foundations-design.md` (Status line)

- [ ] **Step 1: Full gates**

```bash
npx vitest run    # expect 41 tests, all green (24 prior − 0 removed + 6 history + 3 weekStartOf + 8 streak)
npm run build     # green, chunk layout unchanged from Phase 1
npx eslint src/ 2>&1 | tail -1   # total problems ≤ the Phase 1 baseline (34); 0 static-components
```

- [ ] **Step 2: Manual smoke (dev server)**

`npm run dev`, then verify: LoginScreen tagline reads "Tennis · Cross-Training · Strength". If parent login is available: LogTab type dropdown shows Tennis/Other-Sport only (no 📣), historical cheer entries still render with their pink pills, header chip reads "Cross-Training". (Full click-through can be the user's; the tagline check needs no login.)

- [ ] **Step 3: ACWR parity spot-check**

The dashboard and AI context must still agree (both call `computeLoad`): confirmed structurally — `grep -n "computeLoad(" src/` shows exactly `lib/load.js` (definition + calculateMetrics + computeLoadHistory... note: computeLoadHistory does NOT call computeLoad, it shares primitives) and `lib/athleteContext.js`. No further action unless grep shows a new consumer.

- [ ] **Step 4: Update spec status and commit**

In the spec, change `**Status:** Approved pending user spec review` → `**Status:** Implemented — see docs/superpowers/plans/2026-07-08-phase2a-foundations.md`.
```bash
git add docs/
git commit -m "Mark Phase 2a foundations spec as implemented

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
