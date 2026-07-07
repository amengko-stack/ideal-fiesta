# Phase 1: Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 5,684-line `src/App.jsx` into focused modules with per-tab lazy loading and a Vitest suite pinning the load-math fixes, with zero behavior change except hoisting render-declared components.

**Architecture:** Pure logic moves to `src/lib/` (no React imports allowed there), styles to `src/styles/theme.js`, shared UI to `src/components/`, parent tabs to `src/tabs/`, athlete persona to `src/athlete/`. `App.jsx` becomes a slim auth/persona router. Extraction is mechanical and verbatim, build-green at every step, in dependency order (leaf modules first).

**Tech Stack:** React 19, Vite 8, Firebase (auth + Firestore), Vitest (new dev dependency — the only new dependency).

**Spec:** `docs/superpowers/specs/2026-07-07-improvement-roadmap-phase1-architecture-design.md`

## Global Constraints

- **Zero behavior change**, with one exception: components declared inside another component's render are hoisted to module scope (fixes all 21 `react-hooks/static-components` errors).
- `src/lib/` files must not import React or JSX.
- Only new dependency: `vitest` (dev). No TypeScript, no CSS framework, no chart libs.
- Match existing style: plain JS/JSX, inline styles + the shared `css` string, 2-space indent, `.js` extension in relative imports (the codebase writes `"./deferredPriorities.js"`).
- After every task: `npm run build` passes and `npx vitest run` passes (once tests exist).
- Commit after every task. Work stays on branch `claude/general-assistance-jpgfB`.
- This folder is OneDrive-synced: keep file operations in small batches; `git add` new files promptly. If a stray artifact like `{moved}` appears, delete it.
- Current `src/App.jsx` line anchors used below are valid as of commit-time of Task 1 and shift as tasks delete lines — always locate code by **symbol name**; line numbers are hints only.

---

### Task 1: Commit the pending review fixes

The working tree holds uncommitted bug/security fixes from the 2026-07-07 review. Commit them first so the refactor diff is pure moves.

**Files:**
- Commit (already modified): `.gitignore`, `functions/index.js`, `src/App.jsx`, `src/deferredPriorities.js`
- Commit (untracked): `archive/migrate_athlete_data.py`, `archive/migrate_weeklogs.py`

**Interfaces:**
- Consumes: nothing
- Produces: clean working tree; all later tasks diff against this commit

- [ ] **Step 1: Verify the tree contains only the expected changes**

Run: `git status --porcelain`
Expected output (exactly these entries):
```
 M .gitignore
 M functions/index.js
 M src/App.jsx
 M src/deferredPriorities.js
?? archive/
```
If `serviceAccountKey.json`, `.firebase/`, or `.env` appear, STOP — the `.gitignore` fix regressed; do not commit.

- [ ] **Step 2: Verify no secrets in archive/**

Run: `grep -i "private_key\|sk-ant" archive/*.py`
Expected: no matches (the scripts reference the key file by path only).

- [ ] **Step 3: Stage and commit**

```bash
git add .gitignore functions/index.js src/App.jsx src/deferredPriorities.js archive/
git commit -m "Fix load-math divergence, wellbeing merge, escalation logic; harden AI proxy; repo cleanup

- Share sessionSRPE/computeLoad between dashboard and AI context (identical ACWR)
- Merge AM+PM wellbeing docs per day so sleep survives de-dup
- Guard weeksDeferredCount to once per ISO week
- Split escalation detection (read) from promotion (write); fix PrioritiesTab race
- Surface real AI errors; only claim truncation on stop_reason=max_tokens
- Raise match-analysis max_tokens to 6000
- Cloud Fn: validate messages, clamp max_tokens<=6000, drop response-body logging
- gitignore serviceAccountKey/.firebase/.remember; archive one-off migration scripts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Verify clean tree**

Run: `git status --porcelain`
Expected: empty output.

---

### Task 2: Vitest tooling + `lib/dates.js` (TDD)

**Files:**
- Modify: `package.json` (add test script + vitest devDependency)
- Create: `src/lib/dates.js`
- Test: `src/lib/dates.test.js`
- Modify: `src/App.jsx` (delete moved functions ~lines 116–140; add import)
- Modify: `src/deferredPriorities.js` (replace inline `currentWeekKey` with import)

**Interfaces:**
- Consumes: nothing (leaf module)
- Produces (later tasks import these from `../lib/dates.js` or `./dates.js`):
  - `toLocalDateStr(d: Date): string` — `"YYYY-MM-DD"` from LOCAL date parts
  - `getWeekBounds(weeksAgo: number): { start: string, end: string }` — Monday-anchored, end-exclusive
  - `currentWeekKey(): string` — this week's Monday as `"YYYY-MM-DD"`

- [ ] **Step 1: Install Vitest and add the script**

```bash
npm install -D vitest
```
In `package.json` `"scripts"`, add: `"test": "vitest run"`

- [ ] **Step 2: Write the failing test**

Create `src/lib/dates.test.js`:
```js
import { describe, it, expect } from "vitest";
import { toLocalDateStr, getWeekBounds, currentWeekKey } from "./dates.js";

describe("toLocalDateStr", () => {
  it("formats local date parts as YYYY-MM-DD", () => {
    expect(toLocalDateStr(new Date(2026, 6, 7))).toBe("2026-07-07");
  });
  it("pads month and day", () => {
    expect(toLocalDateStr(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
  it("does not roll the day back for late-evening local times", () => {
    // toISOString() would shift this date in UTC+ timezones — the bug class fixed in review
    expect(toLocalDateStr(new Date(2026, 6, 6, 23, 30))).toBe("2026-07-06");
  });
});

describe("getWeekBounds", () => {
  it("returns a Monday-anchored 7-day window (end exclusive)", () => {
    const { start, end } = getWeekBounds(0);
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    expect(s.getDay()).toBe(1); // Monday
    expect((e - s) / 86400000).toBe(7);
  });
  it("weeksAgo=1 window ends exactly where weeksAgo=0 starts", () => {
    expect(getWeekBounds(1).end).toBe(getWeekBounds(0).start);
  });
});

describe("currentWeekKey", () => {
  it("equals this week's Monday (consistent with getWeekBounds)", () => {
    expect(currentWeekKey()).toBe(getWeekBounds(0).start);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/dates.test.js`
Expected: FAIL — cannot resolve `./dates.js`.

- [ ] **Step 4: Create `src/lib/dates.js`**

Move `toLocalDateStr` and `getWeekBounds` **verbatim** from `src/App.jsx` (the `DATE HELPERS` section ~line 116 and `getWeekBounds` ~line 127), add `currentWeekKey` (logic moved from `src/deferredPriorities.js`, rebuilt on `toLocalDateStr`):

```js
// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
// Format a Date as YYYY-MM-DD using LOCAL date parts (never toISOString, which
// shifts the calendar day for users east of UTC — this app runs in UTC+7/+8).
export function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday-anchored week window, end-exclusive. weeksAgo=0 is the current week.
export function getWeekBounds(weeksAgo) {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - daysToMonday - weeksAgo * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return {
    start: toLocalDateStr(start),
    end:   toLocalDateStr(end),
  };
}

// This week's Monday as YYYY-MM-DD. Used as the once-per-week guard key for
// deferred-priority counting.
export function currentWeekKey() {
  return getWeekBounds(0).start;
}
```

In `src/App.jsx`: delete the moved `toLocalDateStr` and `getWeekBounds` definitions and add near the top (after the firebase import):
```js
import { toLocalDateStr, getWeekBounds } from "./lib/dates.js";
```

In `src/deferredPriorities.js`: delete the local `currentWeekKey` function (lines ~10–24) and add:
```js
import { currentWeekKey } from "./lib/dates.js";
```
(Note: `deferredPriorities.js` itself moves into `lib/` in Task 4 — for now only the import changes.)

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run` → all PASS.
Run: `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/dates.js src/lib/dates.test.js src/App.jsx src/deferredPriorities.js
git commit -m "Extract lib/dates.js with tests; add Vitest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/load.js` (TDD)

**Files:**
- Create: `src/lib/load.js`
- Test: `src/lib/load.test.js`
- Modify: `src/App.jsx` (delete moved functions — symbols `sessionSRPE`, `computeLoad`, `mergeWellbeingByDate`, `calculateMetrics`, `getACWRContext`, ~lines 142–236; add import)

**Interfaces:**
- Consumes: `toLocalDateStr`, `getWeekBounds` from `./dates.js`
- Produces (exact signatures later tasks rely on):
  - `sessionSRPE(log): number` — log fields: `type, rpe?, intensity?, duration?`
  - `computeLoad(logs): { weekSRPEs: number[4], thisWeekSRPE: number, fourWeekAvg: number, acwr: number|null }`
  - `mergeWellbeingByDate(entries): Record<dateStr, entry>` — AM/PM field merge, later non-null wins
  - `calculateMetrics(logs, wellbeing): { thisWeekSRPE, weekSRPEs, fourWeekAvg, acwr, avgSleep, avgMood, avgSoreness, wellbeingDays }`
  - `getACWRContext(acwr, tournamentStatus, sessionTime): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/load.test.js`:
```js
import { describe, it, expect } from "vitest";
import { sessionSRPE, computeLoad, mergeWellbeingByDate, calculateMetrics } from "./load.js";
import { getWeekBounds, toLocalDateStr } from "./dates.js";

describe("sessionSRPE", () => {
  it("uses rpe × duration for tennis", () => {
    expect(sessionSRPE({ type: "tennis", rpe: 7, duration: 90 })).toBe(630);
  });
  it("applies the 0.6 multiplier for type 'other'", () => {
    expect(sessionSRPE({ type: "other", rpe: 5, duration: 60 })).toBe(180);
  });
  it("falls back to intensity × 2 when rpe is missing", () => {
    expect(sessionSRPE({ type: "tennis", intensity: 4, duration: 60 })).toBe(480);
  });
  it("defaults to rpe 5 and duration 60 when absent", () => {
    expect(sessionSRPE({ type: "tennis" })).toBe(300);
  });
});

describe("computeLoad", () => {
  it("returns null ACWR with no history (no division by zero)", () => {
    expect(computeLoad([]).acwr).toBeNull();
  });
  it("computes ACWR = thisWeek / mean(4 weeks)", () => {
    const logs = [
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start },
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(1).start },
    ];
    // weekly totals [300, 300, 0, 0] → avg 150 → acwr 2
    const out = computeLoad(logs);
    expect(out.thisWeekSRPE).toBe(300);
    expect(out.fourWeekAvg).toBe(150);
    expect(out.acwr).toBe(2);
  });
  it("buckets a Monday log into the week starting that Monday", () => {
    const logs = [{ type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start }];
    const { weekSRPEs } = computeLoad(logs);
    expect(weekSRPEs[0]).toBe(300);
    expect(weekSRPEs[1]).toBe(0);
  });
});

describe("mergeWellbeingByDate", () => {
  it("merges AM sleep with PM energy/notes on the same date", () => {
    const merged = mergeWellbeingByDate([
      { date: "2026-07-06", time: "07:30", type: "morning", sleep: 8, mood: 4, soreness: 2 },
      { date: "2026-07-06", time: "21:00", type: "night", energy: 3, mood: 3, soreness: 3, notes: "tired" },
    ]);
    const day = merged["2026-07-06"];
    expect(day.sleep).toBe(8);      // AM field survives — the review's B1 fix
    expect(day.energy).toBe(3);
    expect(day.notes).toBe("tired");
    expect(day.mood).toBe(3);       // later non-null wins
  });
  it("a later entry does not erase earlier fields it lacks", () => {
    const merged = mergeWellbeingByDate([
      { date: "2026-07-06", time: "07:30", sleep: 7 },
      { date: "2026-07-06", time: "21:00", energy: 4 },
    ]);
    expect(merged["2026-07-06"].sleep).toBe(7);
  });
  it("keeps different dates separate", () => {
    const merged = mergeWellbeingByDate([
      { date: "2026-07-05", time: "07:00", sleep: 6 },
      { date: "2026-07-06", time: "07:00", sleep: 9 },
    ]);
    expect(merged["2026-07-05"].sleep).toBe(6);
    expect(merged["2026-07-06"].sleep).toBe(9);
  });
});

describe("calculateMetrics", () => {
  it("computes avgSleep from merged same-day AM+PM docs", () => {
    const today = toLocalDateStr(new Date());
    const m = calculateMetrics([], [
      { date: today, time: "07:30", sleep: 8 },
      { date: today, time: "21:00", energy: 3 },
    ]);
    expect(m.avgSleep).toBe("8.0");
    expect(m.wellbeingDays).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/load.test.js`
Expected: FAIL — cannot resolve `./load.js`.

- [ ] **Step 3: Create `src/lib/load.js`**

Move **verbatim** from `src/App.jsx`: `sessionSRPE`, `computeLoad`, `mergeWellbeingByDate`, `calculateMetrics`, `getACWRContext` (the `LOAD CALCULATOR` section, ~lines 142–236). File header:
```js
import { toLocalDateStr, getWeekBounds } from "./dates.js";
```
Add `export` before each of the five function declarations. No other edits.

In `src/App.jsx`: delete the moved definitions; extend the lib import:
```js
import { toLocalDateStr, getWeekBounds } from "./lib/dates.js";
import { sessionSRPE, computeLoad, mergeWellbeingByDate, calculateMetrics, getACWRContext } from "./lib/load.js";
```
(If the build later flags `toLocalDateStr`/`getWeekBounds`/`computeLoad` as unused in App.jsx once consumers move out in Tasks 10–13, prune the import lines then — not now.)

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run` → all PASS. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/load.js src/lib/load.test.js src/App.jsx
git commit -m "Extract lib/load.js (SRPE/ACWR/wellbeing merge) with tests

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Move `deferredPriorities.js` into `lib/`

**Files:**
- Move: `src/deferredPriorities.js` → `src/lib/deferredPriorities.js`
- Modify: `src/App.jsx:16` (import path)

**Interfaces:**
- Consumes: `currentWeekKey` from `./dates.js` (same directory after the move)
- Produces (unchanged exports): `saveDeferredPriorities(athleteUid, deferredArray)`, `resolveDeferred(athleteUid, priorityLabel)`, `checkEscalations(athleteUid)`, `getEscalated(athleteUid)`, `refreshEscalations(athleteUid)`

- [ ] **Step 1: Move the file with git**

```bash
git mv src/deferredPriorities.js src/lib/deferredPriorities.js
```

- [ ] **Step 2: Fix its internal imports**

In `src/lib/deferredPriorities.js`:
- `from "./firebase.js"` → `from "../firebase.js"`
- `from "./lib/dates.js"` → `from "./dates.js"`

- [ ] **Step 3: Fix the consumer import**

In `src/App.jsx` line ~16:
```js
import { saveDeferredPriorities, refreshEscalations, resolveDeferred } from "./lib/deferredPriorities.js";
```

- [ ] **Step 4: Test and build**

Run: `npx vitest run` → PASS. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "Move deferredPriorities into lib/

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `styles/theme.js`

**Files:**
- Create: `src/styles/theme.js`
- Modify: `src/App.jsx` (delete `STYLES` section ~lines 238–325; add import)

**Interfaces:**
- Consumes: nothing
- Produces: `FONTS: string`, `COLORS: object` (keys: bg, surface, card, border, accent, accentDim, accentMuted, yellow, red, text, muted, tennis, cheer), `css: string` (global stylesheet, injected via `<style>{css}</style>`)

- [ ] **Step 1: Create `src/styles/theme.js`**

Move the `STYLES` section of `src/App.jsx` (~lines 238–325: `const FONTS`, `const COLORS`, `const css`) **verbatim**, adding `export` before each `const`. The `css` template literal interpolates `FONTS` and `COLORS` — they move together, order preserved.

- [ ] **Step 2: Import in App.jsx**

Delete the moved section; add:
```js
import { COLORS, css } from "./styles/theme.js";
```
(`FONTS` is only used inside `css` — do not import it in App.jsx.)

- [ ] **Step 3: Test and build**

Run: `npx vitest run` → PASS. Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/styles/theme.js src/App.jsx
git commit -m "Extract styles/theme.js

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `lib/exerciseDb.js`

**Files:**
- Create: `src/lib/exerciseDb.js`
- Modify: `src/App.jsx` (delete `EXERCISE_DB` ~lines 30–98 and `TENNIS_GAPS` ~lines 100–114; add import)

**Interfaces:**
- Consumes: nothing
- Produces: `EXERCISE_DB: Array` (consumed by PlanTab), `TENNIS_GAPS: Array<{id,label,desc}>` (consumed by PlanTab and AVLogSession)

Note: `STROKE_AREAS` and `FITNESS_TESTS` do NOT move here — each has a single consumer and moves with its tab (Tasks 12).

- [ ] **Step 1: Create `src/lib/exerciseDb.js`** — move both constants verbatim, add `export`.

- [ ] **Step 2: Import in App.jsx**
```js
import { EXERCISE_DB, TENNIS_GAPS } from "./lib/exerciseDb.js";
```

- [ ] **Step 3: Test and build** — `npx vitest run` PASS; `npm run build` succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/lib/exerciseDb.js src/App.jsx
git commit -m "Extract lib/exerciseDb.js

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `lib/plist.js`

**Files:**
- Create: `src/lib/plist.js`
- Modify: `src/App.jsx` (delete `PLIST PARSER` section — symbols `parsePlistNode`, `parsePlist`, `extractMatchData`, ~lines 1845–2199; add import)

**Interfaces:**
- Consumes: nothing (uses browser `DOMParser` — fine, it only runs in the browser; no tests planned for it in this phase)
- Produces: `parsePlist(xmlString): object`, `extractMatchData(plistObj): object` (`parsePlistNode` stays module-private, no export)

- [ ] **Step 1: Create `src/lib/plist.js`** — move the three functions verbatim; export only `parsePlist` and `extractMatchData`.

- [ ] **Step 2: Import in App.jsx**
```js
import { parsePlist, extractMatchData } from "./lib/plist.js";
```

- [ ] **Step 3: Test and build** — `npx vitest run` PASS; `npm run build` succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/lib/plist.js src/App.jsx
git commit -m "Extract lib/plist.js

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: `lib/ai.js` — unify the 4 duplicated AI call sites (TDD)

**Files:**
- Create: `src/lib/ai.js`
- Test: `src/lib/ai.test.js`
- Modify: `src/App.jsx` — delete `API_URL` (~lines 18–22); rewrite 4 call sites (search for `fetch(API_URL`): PlanTab (~1176), MatchDetail analysis (~2513), SeasonReportView report (~3380), AVLogSession motivation (~4922)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `callClaudeJSON({ system, userContent, maxTokens = 4000 }): Promise<object>` — POSTs, checks errors, strips fences, parses JSON (throws Error with a real message on failure)
  - `callClaudeText({ system, userContent, maxTokens = 300 }): Promise<string|null>`
  - `cleanAndParseJson(rawText, stopReason): object` (exported for tests)
  - `rawTextOf(data): string` (exported for tests)

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai.test.js`:
```js
import { describe, it, expect } from "vitest";
import { cleanAndParseJson, rawTextOf } from "./ai.js";

describe("cleanAndParseJson", () => {
  it("parses plain JSON", () => {
    expect(cleanAndParseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips markdown code fences", () => {
    expect(cleanAndParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("escapes literal control characters inside string values", () => {
    expect(cleanAndParseJson('{"a":"line1\nline2"}')).toEqual({ a: "line1\nline2" });
  });
  it("reports truncation when stop_reason is max_tokens", () => {
    expect(() => cleanAndParseJson('{"a":', "max_tokens")).toThrow(/truncated/);
  });
  it("reports invalid JSON otherwise", () => {
    expect(() => cleanAndParseJson("", "end_turn")).toThrow(/not valid JSON/);
  });
});

describe("rawTextOf", () => {
  it("reads the first content block's text", () => {
    expect(rawTextOf({ content: [{ text: "hi" }] })).toBe("hi");
  });
  it("returns empty string when content is missing", () => {
    expect(rawTextOf({})).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai.test.js` → FAIL — cannot resolve `./ai.js`.

- [ ] **Step 3: Create `src/lib/ai.js`** (complete file):

```js
// ─── AI PROXY CLIENT ─────────────────────────────────────────────────────────
// In development the Express proxy runs on localhost:3001.
// In production (Firebase Hosting) /api/chat is rewritten to the Cloud Function.
const API_URL = import.meta.env.DEV
  ? "http://localhost:3001/api/chat"
  : "/api/chat";

async function postChat({ system, userContent, maxTokens }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: userContent }],
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json();
  if (!res.ok || data?.error || data?.type === "error") {
    throw new Error(`AI request failed: ${data?.error?.message || data?.error || res.status}`);
  }
  return data;
}

export function rawTextOf(data) {
  return (data.content?.[0]?.text ?? data.content?.map(b => b.text || "").join("") ?? "").trim();
}

export function cleanAndParseJson(rawText, stopReason) {
  const cleanText = rawText
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleanText.endsWith("}")) {
    throw new Error(stopReason === "max_tokens"
      ? "AI response was truncated — max_tokens too low"
      : "AI response was not valid JSON");
  }
  // Escape literal control characters inside JSON string values
  const clean = cleanText.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_, inner) =>
    '"' + inner
      .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") + '"'
  );
  return JSON.parse(clean);
}

// POST a prompt and parse the model's JSON reply.
export async function callClaudeJSON({ system, userContent, maxTokens = 4000 }) {
  const data = await postChat({ system, userContent, maxTokens });
  return cleanAndParseJson(rawTextOf(data), data.stop_reason);
}

// POST a prompt and return the model's plain-text reply (null if empty).
export async function callClaudeText({ system, userContent, maxTokens = 300 }) {
  const data = await postChat({ system, userContent, maxTokens });
  return rawTextOf(data) || null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai.test.js` → PASS.

- [ ] **Step 5: Replace the 4 call sites in App.jsx**

Add import: `import { callClaudeJSON, callClaudeText } from "./lib/ai.js";` and delete the `API_URL` const (~lines 18–22).

**Site 1 — PlanTab (~1176).** Replace the `fetch(API_URL, …)` + `res.json()` + error-check + `rawText`/`cleanText`/`clean` + `JSON.parse` block (everything up to and including `const parsed = JSON.parse(clean);`) with:
```js
      const parsed = await callClaudeJSON({ system: systemPrompt, userContent: prompt, maxTokens: 6000 });
```

**Site 2 — MatchDetail analysis (~2513).** Same replacement shape:
```js
      const parsed = await callClaudeJSON({ system: systemPrompt, userContent: userPrompt, maxTokens: 6000 });
```

**Site 3 — SeasonReportView (~3380).** Replace the fetch + error-check + `raw`/"Empty response" check + `cleanText` + truncation check + `JSON.parse(cleanText)` block with:
```js
      const parsed = await callClaudeJSON({ system: systemPrompt, userContent: userMsg, maxTokens: 4000 });
```
(Behavior note — accepted: an empty AI reply now throws "AI response was not valid JSON" instead of "Empty response from AI". Same catch path.)

**Site 4 — AVLogSession motivation (~4922).** Replace the `fetch(API_URL…).then(r => r.json()).then(data => { const msg = … })` chain with:
```js
    callClaudeText({
      system: "You are an encouraging sports coach writing a short motivational message to a 12-year-old female tennis and cheerleading athlete named Valissa. Keep it genuine, specific, and energetic — not generic. Never use the same phrasing twice. Write like a coach who actually watched her train, not a robot. Maximum 2 sentences.",
      userContent: userMsg,
      maxTokens: 120,
    })
      .then(msg => setMotivationMsg(msg || "Great work today — every session counts! Keep showing up. 💪"))
```
Keep the existing `.catch(...)` / `.finally(...)` lines that follow, unchanged. If no `.catch` exists in the original chain, add:
```js
      .catch(() => setMotivationMsg("Great work today — every session counts! Keep showing up. 💪"))
```
(The old OpenAI-shaped `data?.choices?.[0]?.message?.content` fallback is dead code — dropped.)

- [ ] **Step 6: Full test run and build**

Run: `npx vitest run` → PASS. Run: `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai.js src/lib/ai.test.js src/App.jsx
git commit -m "Extract lib/ai.js; unify 4 duplicated Claude call sites

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: `lib/athleteContext.js`

**Files:**
- Create: `src/lib/athleteContext.js`
- Modify: `src/App.jsx` (delete `ATHLETE CONTEXT BUILDER` section — symbol `buildAthleteContext`, ~lines 2201–2399; add import)

**Interfaces:**
- Consumes: `db` from `../firebase`, Firestore fns (`collection, getDocs, query, orderBy, limit, doc, getDoc`) from `firebase/firestore`, `sessionSRPE, computeLoad` from `./load.js`
- Produces: `buildAthleteContext(athleteUid): Promise<object>` (consumed by PlanTab, MatchDetail, MatchesTab/SeasonReport)

- [ ] **Step 1: Create the file** — move `buildAthleteContext` verbatim with `export`; add the import header listed above (copy exact Firestore fn names from what the moved code references; the build will flag any missed one).

- [ ] **Step 2: Import in App.jsx**
```js
import { buildAthleteContext } from "./lib/athleteContext.js";
```

- [ ] **Step 3: Test and build** — `npx vitest run` PASS; `npm run build` succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/lib/athleteContext.js src/App.jsx
git commit -m "Extract lib/athleteContext.js

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Extract the athlete persona (`src/athlete/`, 6 files)

**Files:**
- Create: `src/athlete/AVMatchNotes.jsx` (from ~4731), `src/athlete/AVLogSession.jsx` (~4835, hoist 3), `src/athlete/AVGrowth.jsx` (~5165, hoist 3), `src/athlete/AVWellbeing.jsx` (~5380, hoist 6: incl. `EmojiRow`, `NumGrid`), `src/athlete/AVPlan.jsx` (~5629), `src/athlete/AthleteView.jsx` (~4652)
- Modify: `src/App.jsx` (delete all six component definitions; import `AthleteView`)

**Interfaces:**
- Consumes: `../styles/theme.js` (COLORS, css), `../firebase` (db, auth as needed), `../lib/ai.js` (`callClaudeText` in AVLogSession), `../lib/exerciseDb.js` (`TENNIS_GAPS` in AVLogSession), firebase/firestore fns, lucide-react icons
- Produces: default exports, one component per file. `AthleteView({ athleteId, user, onSignOut })` imports the AV* siblings via `React.lazy` (see Step 3)

**Extraction procedure for EVERY component file in Tasks 10–13** (referenced below as "the standard move"):
1. Copy the component function verbatim into the new file; make it the default export.
2. Add imports by need: react hooks used, lucide-react icons referenced, firestore fns referenced, `{ COLORS, css }` from theme, lib helpers referenced. Run `npm run build` — it names every missing identifier; resolve each from `src/App.jsx`'s original import block.
3. Delete the component from `src/App.jsx` and import the new file.
4. Run `npx eslint src/<newfile>` — if it reports `react-hooks/static-components`, cut the inner component out to module scope in the same file (above the parent). The known inner components already receive everything as props (e.g. `EmojiRow({ options, value, onChange, activeColor })`, `NumGrid({ value, onChange, color })`) — hoisting is a pure cut/paste. If one closes over a parent variable, add that variable as a new prop and pass it at each call site.
5. `npm run build` green before moving to the next component.

- [ ] **Step 1: Extract the five AV leaf components** (AVMatchNotes, AVLogSession, AVGrowth, AVWellbeing, AVPlan) using the standard move, one at a time, build-green after each. Hoist counts per file are listed in **Files** above; verify with `npx eslint src/athlete/<file> | grep static-components` → no output when done.

- [ ] **Step 2: Extract `AthleteView.jsx`** using the standard move.

- [ ] **Step 3: Lazy-load the AV tabs inside AthleteView**

In `src/athlete/AthleteView.jsx`, import the siblings like this:
```js
import { lazy, Suspense } from "react";
const AVLogSession = lazy(() => import("./AVLogSession.jsx"));
const AVWellbeing  = lazy(() => import("./AVWellbeing.jsx"));
const AVGrowth     = lazy(() => import("./AVGrowth.jsx"));
const AVMatchNotes = lazy(() => import("./AVMatchNotes.jsx"));
const AVPlan       = lazy(() => import("./AVPlan.jsx"));
```
Wrap the tab-content render area (wherever `<AVLogSession …/>` etc. are conditionally rendered) in:
```jsx
<Suspense fallback={<div className="empty">Loading…</div>}>
  {/* existing conditional tab renders, unchanged */}
</Suspense>
```

- [ ] **Step 4: Import AthleteView in App.jsx** (plain import for now — App.jsx goes lazy in Task 13):
```js
import AthleteView from "./athlete/AthleteView.jsx";
```

- [ ] **Step 5: Test, lint, build**

`npx vitest run` PASS; `npx eslint src/athlete/ --quiet` → no `static-components` errors; `npm run build` succeeds.

- [ ] **Step 6: Commit**
```bash
git add src/athlete/ src/App.jsx
git commit -m "Extract athlete persona to src/athlete/ with lazy AV tabs; hoist render-declared components

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Extract parent tabs, part 1

**Files:**
- Create: `src/tabs/PlanTab.jsx` (~896), `src/tabs/LogTab.jsx` (~1548), `src/tabs/StrengthLogTab.jsx` (~1700), `src/tabs/ProgressTab.jsx` (~3651, hoist 4 — note: currently unmounted anywhere; extract it regardless, Phase 2 revives it), `src/tabs/ProfileTab.jsx` (~4467)
- Modify: `src/App.jsx` (delete the five; import them)

**Interfaces:**
- Consumes: `../lib/load.js` (calculateMetrics, getWeekBounds via `../lib/dates.js`, getACWRContext), `../lib/ai.js` (callClaudeJSON in PlanTab), `../lib/exerciseDb.js` (EXERCISE_DB, TENNIS_GAPS in PlanTab; TENNIS_GAPS in LogTab), `../lib/deferredPriorities.js` (saveDeferredPriorities, resolveDeferred, refreshEscalations in PlanTab), `../lib/athleteContext.js` (buildAthleteContext in PlanTab), theme, firebase, icons
- Produces: default exports with current prop signatures:
  - `PlanTab({ athleteId, profile, weekLogs, sessionHistory, wellbeing, aiLoading, setAiLoading, planResult, setPlanResult })`
  - `LogTab({ weekLogs, addWeekLog, deleteWeekLog })`
  - `StrengthLogTab({ sessionHistory, addSession, planResult })`
  - `ProgressTab({ sessionHistory, weekLogs })`
  - `ProfileTab({ profile, saveProfile })`

- [ ] **Step 1: Extract each of the five with the standard move** (Task 10 procedure), one at a time, build-green after each; hoist ProgressTab's 4 flagged components.

- [ ] **Step 2: Test, lint, build** — `npx vitest run` PASS; `npx eslint src/tabs/ --quiet` shows no `static-components`; `npm run build` succeeds. The pre-existing `'ProgressTab' is defined but never used` warning in App.jsx disappears (it is no longer imported there — do not import it).

- [ ] **Step 3: Commit**
```bash
git add src/tabs/ src/App.jsx
git commit -m "Extract PlanTab, LogTab, StrengthLogTab, ProgressTab, ProfileTab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Extract parent tabs, part 2 (matches cluster + remaining)

**Files:**
- Create: `src/tabs/MatchDetail.jsx` (~2401, hoist 3), `src/tabs/SeasonReportView.jsx` (~3121), `src/tabs/MatchesTab.jsx` (~3250), `src/tabs/PrioritiesTab.jsx` (~2917, hoist 2), `src/tabs/TechnicalTab.jsx` (~3802 — move `STROKE_AREAS` const ~4114 into this file), `src/tabs/BenchmarksTab.jsx` (~4138 — move `FITNESS_TESTS` const ~4123 into this file)
- Modify: `src/App.jsx` (delete all; import the four AthleteMain renders — MatchesTab, PrioritiesTab, TechnicalTab, BenchmarksTab)

**Interfaces:**
- Consumes: `../lib/plist.js` (parsePlist, extractMatchData in MatchesTab), `../lib/ai.js` (callClaudeJSON in MatchDetail + SeasonReportView), `../lib/athleteContext.js`, `../lib/deferredPriorities.js`, theme, firebase, icons
- Produces: default exports:
  - `MatchesTab({ athleteId })` — imports `MatchDetail` and `SeasonReportView` from sibling files
  - `MatchDetail({ match, onBack, onDelete, athleteId })`
  - `SeasonReportView({ report, onBack, onRegenerate, seasonLoading })`
  - `PrioritiesTab({ athleteId })`
  - `TechnicalTab({ athleteId })` (owns `STROKE_AREAS`)
  - `BenchmarksTab({ athleteId, profile })` (owns `FITNESS_TESTS`)

- [ ] **Step 1: Extract MatchDetail and SeasonReportView first** (they have no App.jsx-internal dependents besides MatchesTab), then MatchesTab importing both:
```js
import MatchDetail from "./MatchDetail.jsx";
import SeasonReportView from "./SeasonReportView.jsx";
```
Standard move otherwise; hoist MatchDetail's 3 flagged components.

- [ ] **Step 2: Extract PrioritiesTab (hoist 2), TechnicalTab (+`STROKE_AREAS`), BenchmarksTab (+`FITNESS_TESTS`)** with the standard move.

- [ ] **Step 3: Test, lint, build** — `npx vitest run` PASS; `npx eslint src/tabs/ --quiet` no `static-components`; `npm run build` succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/tabs/ src/App.jsx
git commit -m "Extract matches cluster, PrioritiesTab, TechnicalTab, BenchmarksTab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Components, AthleteMain with lazy tabs, slim App.jsx

**Files:**
- Create: `src/components/AlertsBanner.jsx` (~507), `src/components/LoginScreen.jsx` (~411), `src/components/ParentDashboard.jsx` (~449, keeps `KNOWN_ATHLETE_ID`), `src/tabs/AthleteMain.jsx` (~751)
- Modify: `src/App.jsx` — reduce to the auth router only

**Interfaces:**
- Consumes: everything extracted in Tasks 2–12
- Produces:
  - `AlertsBanner({ athleteId, wellbeing, sessionHistory, weekLogs })` (default export; uses `calculateMetrics`, `mergeWellbeingByDate`, `toLocalDateStr`, `refreshEscalations`)
  - `LoginScreen()` (default export)
  - `ParentDashboard({ user, onSelectAthlete, onSignOut })` (default export)
  - `AthleteMain({ athleteId, isParent, user, onBack, onSignOut })` (default export)

- [ ] **Step 1: Extract AlertsBanner, LoginScreen, ParentDashboard** with the standard move into `src/components/`.

- [ ] **Step 2: Extract AthleteMain into `src/tabs/AthleteMain.jsx` with lazy tab imports**

Move the component body verbatim, but the tab imports use `React.lazy`:
```js
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Target, ClipboardList, Dumbbell, History, ClipboardCheck, TrendingUp, FileText, Settings } from "lucide-react";
import { doc, getDoc, setDoc, addDoc, deleteDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { COLORS, css } from "../styles/theme.js";
import AlertsBanner from "../components/AlertsBanner.jsx";

const PlanTab        = lazy(() => import("./PlanTab.jsx"));
const LogTab         = lazy(() => import("./LogTab.jsx"));
const StrengthLogTab = lazy(() => import("./StrengthLogTab.jsx"));
const MatchesTab     = lazy(() => import("./MatchesTab.jsx"));
const PrioritiesTab  = lazy(() => import("./PrioritiesTab.jsx"));
const BenchmarksTab  = lazy(() => import("./BenchmarksTab.jsx"));
const TechnicalTab   = lazy(() => import("./TechnicalTab.jsx"));
const ProfileTab     = lazy(() => import("./ProfileTab.jsx"));
```
Wrap the tab-content conditionals (the `{tab === "plan" && <PlanTab …/>}` block) in:
```jsx
<Suspense fallback={<div className="empty">Loading…</div>}>
  {tab === "plan"     && <PlanTab athleteId={athleteId} profile={profile} weekLogs={weekLogs} sessionHistory={sessionHistory} wellbeing={wellbeing} aiLoading={aiLoading} setAiLoading={setAiLoading} planResult={planResult} setPlanResult={setPlanResult} />}
  {tab === "log"      && <LogTab weekLogs={weekLogs} addWeekLog={addWeekLog} deleteWeekLog={deleteWeekLog} />}
  {tab === "strength" && <StrengthLogTab sessionHistory={sessionHistory} addSession={addSession} planResult={planResult} />}
  {tab === "matches"     && <MatchesTab     athleteId={athleteId} />}
  {tab === "priorities"  && <PrioritiesTab  athleteId={athleteId} />}
  {tab === "benchmarks"  && isParent && <BenchmarksTab athleteId={athleteId} profile={profile} />}
  {tab === "technical"   && isParent && <TechnicalTab  athleteId={athleteId} />}
  {tab === "profile"     && <ProfileTab     profile={profile} saveProfile={saveProfile} />}
</Suspense>
```

- [ ] **Step 3: Slim App.jsx to the auth router** (complete target file):

```js
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { auth } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { COLORS, css } from "./styles/theme.js";
import LoginScreen from "./components/LoginScreen.jsx";
import ParentDashboard from "./components/ParentDashboard.jsx";

const AthleteMain = lazy(() => import("./tabs/AthleteMain.jsx"));
const AthleteView = lazy(() => import("./athlete/AthleteView.jsx"));

const ALLOWED_USERS = {
  'jFXQ9SamJ6QnIpaam5dLedKcFkA2': { role: 'parent',  athleteId: 'kDybMQH9lefwHI0dRway' },
  '2Hxj2FUJP4YQSvnsR2fkStu0uoC2': { role: 'parent',  athleteId: 'kDybMQH9lefwHI0dRway' },
  'qmj32jhoYnQ9OJCQCXM1soIhHPx2': { role: 'athlete', athleteId: 'kDybMQH9lefwHI0dRway' },
};

const FullScreenSpinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: COLORS.bg }}>
    <style>{css}</style>
    <div className="spinner" />
  </div>
);

// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
export default function App() {
  /* body unchanged from the current App() (lines ~328–408), with two edits:
     1. the "loading" branch returns <FullScreenSpinner />
     2. the AthleteMain / AthleteView returns are wrapped:
        <Suspense fallback={<FullScreenSpinner />}> …existing element… </Suspense> */
}
```
Copy the existing `App()` body verbatim apart from those two edits (the unauthorized-state JSX etc. stays byte-identical). Delete everything else left in the file — after Tasks 2–12 the only remaining code should be `App`, `LoginScreen`, `ParentDashboard`, `AthleteMain`, `AlertsBanner`, and leftover imports; all but `App` move in this task.

- [ ] **Step 4: Test, lint, build; check chunking**

Run: `npx vitest run` → PASS. Run: `npm run build` → succeeds AND the output lists **multiple JS chunks** (one per lazy tab/persona) instead of a single ~736 kB file. Record the new main-chunk size in the commit message.
Run: `npx eslint src/ --quiet | grep -c "static-components"` → `0`.

- [ ] **Step 5: Smoke test in dev**

Run: `npm run dev`. Verify: login screen renders → parent login → dashboard → each of the 8 tabs opens without console errors → athlete view (if athlete creds available) renders its 5 tabs. AI-dependent actions (plan generation) require the proxy running — clicking is optional; rendering each tab is the requirement.

- [ ] **Step 6: Commit**

```bash
git add src/ && git status   # review: App.jsx shrinks to ~120 lines; no stray files
git commit -m "Slim App.jsx to auth router; lazy-load tabs and personas (code splitting)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Final verification sweep

**Files:**
- Modify: none expected (fix-forward if checks fail)

**Interfaces:** consumes everything; produces the Phase-1-complete state.

- [ ] **Step 1: Full checks**

```bash
npx vitest run          # all tests pass
npm run build           # green, multi-chunk output
npx eslint src/ 2>&1 | tail -1   # total problems ≤ 37 (was 58): all 21 static-components gone;
                                 # likely lower as stale unused imports get pruned during extraction
npx eslint src/ 2>&1 | grep -c "static-components"   # must be 0
```

- [ ] **Step 2: Structural audit**

```bash
wc -l src/App.jsx        # expect ≤ ~150
ls src/lib src/tabs src/athlete src/components src/styles
git diff --stat <task1-commit>..HEAD   # moves dominate; src/App.jsx shows ~-5,500
```

- [ ] **Step 3: Confirm zero-behavior-change intent**

`git log --oneline <task1-commit>..HEAD` — every commit is an extraction; any commit mixing extraction with a logic edit (other than hoisting + the Task 8 error-message note) is a review flag.

- [ ] **Step 4: Update the spec status line**

In `docs/superpowers/specs/2026-07-07-improvement-roadmap-phase1-architecture-design.md`, change `**Status:**` to `Implemented (Phase 1) — see docs/superpowers/plans/2026-07-07-phase1-architecture-cleanup.md`. Commit:
```bash
git add docs/
git commit -m "Mark Phase 1 architecture spec as implemented

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
