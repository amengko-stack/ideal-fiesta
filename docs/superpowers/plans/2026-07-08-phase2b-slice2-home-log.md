# Phase 2b Slice 2: Log Sheet + Home + Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new shell useful: FAB log-session sheet and daily check-in writing real Firestore data with XP awards, and a live Home screen (readiness ring, level card, stat tiles, recent sessions).

**Architecture:** MobileApp lifts data loading (profile, weekLogs, wellbeing, XP, streak) into one refreshable effect and passes it down. New sheet-content components (`LogSheet`, `CheckinSheet`) and `HomeScreen` under `src/screens/`. New pure lib fns (`readinessScore`, `acwrStatus`) + `srpeByType` key extension, all TDD.

**Tech Stack:** React 19 + Vite 8, Vitest, Firebase. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-phase2b-slice2-home-log-design.md`

## Global Constraints

- Flag off ⇒ old app untouched (only `src/App.jsx`'s flag block gets a try/catch hardening — additions/wrap only, verified by flag-off behavior).
- No new dependencies. Pure lib fns import nothing from Firebase/React.
- All dates via `toLocalDateStr`; never `toISOString` for calendar days.
- After every task: `npx vitest run` green, `npm run build` green. Commit per task with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Do NOT delete any files anywhere. Branch `claude/general-assistance-jpgfB`.

---

### Task 1: Lib additions — `readinessScore`, `acwrStatus`, srpeByType keys (TDD)

**Files:**
- Modify: `src/lib/load.js` (append two fns; extend `computeLoadHistory` srpeByType init)
- Test: `src/lib/load.test.js` (new cases + update two existing expectations)

**Interfaces:**
- Consumes: existing `computeLoadHistory`
- Produces: `readinessScore(mood, soreness): number|null` (0–100); `acwrStatus(acwr): { label: string, tone: "success"|"warn"|"danger"|"limeDim"|"muted" }`; `computeLoadHistory` entries now have `srpeByType: {tennis, match, strength, cheer, other}`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/load.test.js`, add `readinessScore, acwrStatus` to the `./load.js` import. Append:
```js
describe("readinessScore", () => {
  it("combines mood (60%) and inverse soreness (40%)", () => {
    expect(readinessScore(5, 1)).toBe(92);   // 60 + 32
    expect(readinessScore(3, 3)).toBe(52);   // 36 + 16
    expect(readinessScore(1, 5)).toBe(12);   // 12 + 0
  });
  it("returns null when either input is missing", () => {
    expect(readinessScore(null, 2)).toBeNull();
    expect(readinessScore(4, undefined)).toBeNull();
  });
  it("clamps to 0..100", () => {
    expect(readinessScore(5, 0)).toBe(100);  // 60 + 40 = 100
  });
});

describe("acwrStatus", () => {
  it("maps thresholds to labels/tones", () => {
    expect(acwrStatus(1.6)).toEqual({ label: "Ease up", tone: "danger" });
    expect(acwrStatus(1.4)).toEqual({ label: "Careful", tone: "warn" });
    expect(acwrStatus(0.7)).toEqual({ label: "Push more", tone: "limeDim" });
    expect(acwrStatus(1.0)).toEqual({ label: "Balanced", tone: "success" });
  });
  it("handles missing ACWR", () => {
    expect(acwrStatus(null)).toEqual({ label: "No data", tone: "muted" });
  });
});
```
Update the TWO existing `computeLoadHistory` expectations that assert srpeByType shape:
- In "buckets logs into the correct week and type": `expect(now.srpeByType).toEqual({ tennis: 300, cheer: 0, other: 360 })` → `expect(now.srpeByType).toEqual({ tennis: 300, match: 0, strength: 0, cheer: 0, other: 360 })`.
- Append a new case:
```js
  it("buckets match and strength types explicitly", () => {
    const logs = [
      { type: "match",    rpe: 8, duration: 60, date: getWeekBounds(0).start }, // 480
      { type: "strength", rpe: 6, duration: 45, date: getWeekBounds(0).start }, // 270
    ];
    const h = computeLoadHistory(logs, 1);
    expect(h[0].srpeByType.match).toBe(480);
    expect(h[0].srpeByType.strength).toBe(270);
    expect(h[0].totalSrpe).toBe(750);
  });
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/lib/load.test.js` → FAIL (missing exports + shape mismatch).

- [ ] **Step 3: Implement**

In `src/lib/load.js`:
1. In `computeLoadHistory`, change `const srpeByType = { tennis: 0, cheer: 0, other: 0 };` → `const srpeByType = { tennis: 0, match: 0, strength: 0, cheer: 0, other: 0 };`
2. Append:
```js
// Readiness (0–100) from today's check-in: mood weighted 60%, inverse soreness 40%.
export function readinessScore(mood, soreness) {
  if (mood == null || soreness == null) return null;
  const raw = (mood / 5) * 60 + ((5 - soreness) / 5) * 40;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

// UI status for an ACWR value (thresholds match getACWRContext guidance).
export function acwrStatus(acwr) {
  if (acwr == null) return { label: "No data", tone: "muted" };
  if (acwr > 1.5)  return { label: "Ease up", tone: "danger" };
  if (acwr > 1.3)  return { label: "Careful", tone: "warn" };
  if (acwr < 0.8)  return { label: "Push more", tone: "limeDim" };
  return { label: "Balanced", tone: "success" };
}
```

- [ ] **Step 4: Run tests and build** — `npx vitest run` → 55 pass (49 + 6 new). `npm run build` → green.

- [ ] **Step 5: Commit**
```bash
git add src/lib/load.js src/lib/load.test.js
git commit -m "Add readinessScore + acwrStatus; bucket match/strength in load history

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `src/screens/LogSheet.jsx`

**Files:**
- Create: `src/screens/LogSheet.jsx`

**Interfaces:**
- Consumes: `M`, `addDoc/collection` + `db`, `toLocalDateStr`, `sessionSRPE`, `xpForSession`, `awardXp`
- Produces: `LogSheet({ athleteId, onSaved, onClose })` — renders sheet CONTENT (host wraps it in `<BottomSheet>`); `onSaved(toastMessage)` fires after a successful write.

- [ ] **Step 1: Create the file** (complete content):

```jsx
import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";
import { sessionSRPE } from "../lib/load.js";
import { xpForSession } from "../lib/gamification.js";
import { awardXp } from "../lib/gamificationStore.js";

const TYPES = [
  { id: "tennis",   label: "Tennis",   accent: M.tennisLight },
  { id: "strength", label: "Strength", accent: M.strength },
  { id: "match",    label: "Match",    accent: M.match },
  { id: "other",    label: "Other",    accent: M.other },
];
const DURS = [30, 45, 60, 90];

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const chip = (sel, accent) => ({
  cursor: "pointer", padding: "11px 6px", borderRadius: 14, fontSize: 14, fontWeight: 700,
  fontFamily: M.display, flex: 1, textAlign: "center", transition: "all .12s",
  background: sel ? accent : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
  boxShadow: sel ? "0 4px 0 rgba(0,0,0,0.13)" : "none", transform: sel ? "translateY(-1px)" : "none",
});

export default function LogSheet({ athleteId, onSaved, onClose }) {
  const [type, setType]           = useState("tennis");
  const [sportName, setSportName] = useState("");
  const [dur, setDur]             = useState(60);
  const [rpe, setRpe]             = useState(6);
  const [feel, setFeel]           = useState(4);
  const [win, setWin]             = useState(true);
  const [saving, setSaving]       = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date();
      const entry = {
        type, duration: dur, rpe, feel,
        date: toLocalDateStr(now), time: now.toTimeString().slice(0, 5),
        ...(type === "other" ? { sportName: sportName.trim() || "Other sport" } : {}),
        ...(type === "match" ? { result: win ? "W" : "L" } : {}),
      };
      await addDoc(collection(db, "athletes", athleteId, "weekLogs"), entry);
      const xp = xpForSession(sessionSRPE(entry));
      await awardXp(athleteId, xp);
      onSaved(`+${xp} XP · awesome! 🎾`);
      onClose();
    } catch (e) {
      console.error("LogSheet save:", e);
      onSaved("Couldn't save — try again 🙈");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Log a session 🎾</div>

      <div style={label}>Type</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {TYPES.map(t => (
          <div key={t.id} onClick={() => setType(t.id)} style={chip(type === t.id, t.accent)}>{t.label}</div>
        ))}
      </div>

      {type === "other" && (
        <>
          <div style={label}>Which sport?</div>
          <input
            type="text" value={sportName} onChange={e => setSportName(e.target.value)}
            placeholder="e.g. Swimming, Athletics, Netball"
            style={{
              width: "100%", boxSizing: "border-box", padding: "12px 14px",
              border: "1.5px solid #D6E2DB", borderRadius: 12, background: M.card,
              fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink,
              outline: "none", marginBottom: 18,
            }}
          />
        </>
      )}

      <div style={label}>Duration</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {DURS.map(d => (
          <div key={d} onClick={() => setDur(d)} style={chip(dur === d, M.strength)}>{d}m</div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span style={{ ...label, marginBottom: 0 }}>Effort</span>
        <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: M.success }}>
          {rpe}<span style={{ fontSize: 11, color: M.sub }}>/10</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <div key={n} onClick={() => setRpe(n)} style={{
            cursor: "pointer", flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10,
            fontSize: 13, fontWeight: 700, fontFamily: M.display, transition: "all .1s",
            background: rpe === n ? M.strength : M.fillAlt, color: rpe === n ? M.deepGreen : "#5f7168",
          }}>{n}</div>
        ))}
      </div>

      {type === "match" && (
        <>
          <div style={label}>Result</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <div onClick={() => setWin(true)} style={chip(win, M.strength)}>Win 🏆</div>
            <div onClick={() => setWin(false)} style={chip(!win, M.danger)}>Loss</div>
          </div>
        </>
      )}

      <div style={label}>How did it feel?</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} onClick={() => setFeel(n)} style={{
            cursor: "pointer", fontSize: 32, lineHeight: 1, transition: "transform .1s",
            color: n <= feel ? M.match : "#D6E2DB", transform: n <= feel ? "scale(1.1)" : "none",
          }}>★</div>
        ))}
      </div>

      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
        padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
        fontSize: 16, boxShadow: M.cta, opacity: saving ? 0.6 : 1,
      }}>{saving ? "Saving…" : "Save & earn XP 🎉"}</div>
    </>
  );
}
```

- [ ] **Step 2: Verify and commit** — `npx vitest run` 55 pass; `npm run build` green; `npx eslint src/screens/LogSheet.jsx` clean.
```bash
git add src/screens/LogSheet.jsx
git commit -m "Add LogSheet: quick session logging with XP award

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/screens/CheckinSheet.jsx`

**Files:**
- Create: `src/screens/CheckinSheet.jsx`

**Interfaces:**
- Consumes: `M`, firestore, `toLocalDateStr`, `XP` + `awardXp`
- Produces: `CheckinSheet({ athleteId, initial, onSaved, onClose })` — sheet CONTENT; `initial` is today's merged wellbeing (may be undefined) used to prefill; writes `{type:"checkin", mood, sleep, soreness, date, time}`.

- [ ] **Step 1: Create the file** (complete content):

```jsx
import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";
import { XP } from "../lib/gamification.js";
import { awardXp } from "../lib/gamificationStore.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };

function StarRow({ value, onChange, color }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <div key={n} onClick={() => onChange(n)} style={{
          cursor: "pointer", fontSize: 30, lineHeight: 1, transition: "transform .1s",
          color: n <= value ? color : "#D6E2DB", transform: n <= value ? "scale(1.1)" : "none",
        }}>★</div>
      ))}
    </div>
  );
}

export default function CheckinSheet({ athleteId, initial, onSaved, onClose }) {
  const [mood, setMood]         = useState(initial?.mood ?? 4);
  const [sleep, setSleep]       = useState(initial?.sleep ?? 8);
  const [soreness, setSoreness] = useState(initial?.soreness ?? 2);
  const [saving, setSaving]     = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date();
      await addDoc(collection(db, "athletes", athleteId, "wellbeing"), {
        type: "checkin", mood, sleep, soreness,
        date: toLocalDateStr(now), time: now.toTimeString().slice(0, 5),
      });
      await awardXp(athleteId, XP.CHECKIN);
      onSaved(`Check-in saved · +${XP.CHECKIN} XP ✨`);
      onClose();
    } catch (e) {
      console.error("CheckinSheet save:", e);
      onSaved("Couldn't save — try again 🙈");
    } finally {
      setSaving(false);
    }
  };

  const stepBtn = {
    cursor: "pointer", width: 42, height: 42, borderRadius: 13, background: M.fillAlt,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: M.display, fontWeight: 700, fontSize: 22, color: "#5f7168",
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 18 }}>Daily check-in ✨</div>

      <div style={label}>Mood 😊</div>
      <StarRow value={mood} onChange={setMood} color={M.match} />

      <div style={label}>Sleep 😴</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div onClick={() => setSleep(s => Math.max(4, s - 1))} style={stepBtn}>−</div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 30, color: M.success }}>{sleep}</span>
          <span style={{ fontSize: 14, color: M.sub, fontWeight: 600 }}> hours</span>
        </div>
        <div onClick={() => setSleep(s => Math.min(12, s + 1))} style={stepBtn}>+</div>
      </div>

      <div style={label}>Soreness 💪</div>
      <StarRow value={soreness} onChange={setSoreness} color={M.streakOrange} />

      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16,
        padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
        fontSize: 16, boxShadow: M.cta, opacity: saving ? 0.6 : 1, marginTop: 4,
      }}>{saving ? "Saving…" : "Save check-in ✨"}</div>
    </>
  );
}
```

- [ ] **Step 2: Verify and commit** — tests 55, build green, eslint clean on the file.
```bash
git add src/screens/CheckinSheet.jsx
git commit -m "Add CheckinSheet: daily mood/sleep/soreness with XP award

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `src/screens/HomeScreen.jsx`

**Files:**
- Create: `src/screens/HomeScreen.jsx`

**Interfaces:**
- Consumes: `M`, `Card`, `computeLoad`/`readinessScore`/`acwrStatus` + `mergeWellbeingByDate` from `../lib/load.js`, `levelFromXp`, `toLocalDateStr`
- Produces: `HomeScreen({ weekLogs, wellbeing, xp, activeThisWeek, streak, onOpenCheckin })` — pure presentational (all data via props).

- [ ] **Step 1: Create the file** (complete content):

```jsx
import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { computeLoad, readinessScore, acwrStatus, mergeWellbeingByDate } from "../lib/load.js";
import { levelFromXp } from "../lib/gamification.js";
import { toLocalDateStr } from "../lib/dates.js";

const SPORT = {
  tennis:   { label: "Tennis",   color: M.tennisLight },
  match:    { label: "Match",    color: M.match },
  strength: { label: "Strength", color: M.strength },
  cheer:    { label: "Cheer",    color: M.cheer },
  other:    { label: "Other",    color: M.other },
};

export default function HomeScreen({ weekLogs, wellbeing, xp, activeThisWeek, streak, onOpenCheckin }) {
  const today = toLocalDateStr(new Date());
  const todayWb = mergeWellbeingByDate(wellbeing || [])[today];
  const readiness = readinessScore(todayWb?.mood, todayWb?.soreness);
  const { thisWeekSRPE, acwr } = computeLoad(weekLogs || []);
  const status = acwrStatus(acwr);
  const lv = levelFromXp(xp);

  const c = 2 * Math.PI * 50;
  const off = readiness == null ? c : c * (1 - readiness / 100);
  const readyLabel = readiness == null ? "Check in to see your energy"
    : readiness >= 75 ? "Fully charged!" : readiness >= 55 ? "Good to go!" : "Recharge day";
  const energySub = todayWb
    ? `Mood ${todayWb.mood ?? "—"}/5 · slept ${todayWb.sleep ?? "—"}h · ${streak}-day streak 🔥`
    : "No check-in yet today — tap the card below ✨";

  const recent = [...(weekLogs || [])]
    .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))
    .slice(0, 4);

  const tileNum = (color) => ({ fontFamily: M.display, fontWeight: 700, fontSize: 24, color, lineHeight: 0.9 });
  const tileLabel = { fontSize: 10.5, color: M.sub, fontWeight: 600, marginTop: 4 };
  const toneColor = { success: M.success, warn: M.warn, danger: M.danger, limeDim: M.limeDim, muted: M.muted };

  return (
    <>
      {/* energy hero */}
      <Card style={{ borderRadius: 26, padding: 20, display: "flex", alignItems: "center", gap: 16, boxShadow: M.dropLg }}>
        <div style={{ position: "relative", width: 118, height: 118, flexShrink: 0 }}>
          <svg width="118" height="118" viewBox="0 0 118 118">
            <defs>
              <linearGradient id="engH" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={M.ringGradFrom} /><stop offset="1" stopColor={M.ringGradTo} />
              </linearGradient>
            </defs>
            <circle cx="59" cy="59" r="50" fill="none" stroke={M.dividerAlt} strokeWidth="13" />
            <circle cx="59" cy="59" r="50" fill="none" stroke="url(#engH)" strokeWidth="13" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 59 59)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 36, lineHeight: 0.8, color: M.ink }}>{readiness ?? "—"}</div>
            <div style={{ fontSize: 10, color: M.sub, fontWeight: 700, letterSpacing: ".1em" }}>ENERGY</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink, lineHeight: 1.05 }}>{readyLabel}</div>
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 6, lineHeight: 1.45 }}>{energySub}</div>
        </div>
      </Card>

      {/* level / xp */}
      <Card style={{ borderRadius: 22, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.deepGreen, background: M.gradient, padding: "5px 12px", borderRadius: 12 }}>Lvl {lv.level}</span>
            <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.ink }}>{lv.title}</span>
          </div>
          <span style={{ fontSize: 11, color: M.sub, fontWeight: 600 }}>{lv.toNext} to Lvl {lv.level + 1}</span>
        </div>
        <div style={{ height: 13, borderRadius: 99, background: M.dividerAlt, overflow: "hidden" }}>
          <div style={{ width: `${Math.round((lv.intoLevel / 1000) * 100)}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${M.ringGradFrom},${M.ringGradTo})` }} />
        </div>
        <div style={{ fontSize: 11, color: M.sub, fontWeight: 600, marginTop: 7 }}>{lv.intoLevel} / 1000 XP</div>
      </Card>

      {/* tiles */}
      <div style={{ display: "flex", gap: 11, marginBottom: 14 }}>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(M.ink)}>{Math.round(thisWeekSRPE).toLocaleString()}</div>
          <div style={tileLabel}>load / wk</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(toneColor[status.tone])}>{acwr == null ? "—" : acwr.toFixed(2)}</div>
          <div style={{ ...tileLabel, color: toneColor[status.tone], fontWeight: 700 }}>{status.label}</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(M.success)}>{activeThisWeek}</div>
          <div style={tileLabel}>days active</div>
        </Card>
      </div>

      {/* check-in card */}
      <Card style={{ cursor: "pointer" }} >
        <div onClick={onOpenCheckin}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>How I'm feeling</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5c7a0a" }}>tap to update →</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {[
              { emoji: "😊", val: todayWb?.mood ?? "—", label: "Mood", color: M.streakOrange },
              { emoji: "😴", val: todayWb?.sleep != null ? `${todayWb.sleep}h` : "—", label: "Sleep", color: M.success },
              { emoji: "💪", val: todayWb?.soreness ?? "—", label: "Achy", color: M.ink },
            ].map((s, i) => (
              <div key={s.label} style={{ textAlign: "center", flex: 1, borderLeft: i ? `1px solid ${M.dividerAlt}` : "none" }}>
                <div style={{ fontSize: 22 }}>{s.emoji}</div>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: s.color, marginTop: 2 }}>{s.val}</div>
                <div style={{ fontSize: 10.5, color: M.sub, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* recent */}
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 9, paddingLeft: 2 }}>Recent</div>
      {recent.length === 0 && (
        <Card style={{ textAlign: "center", color: M.sub, fontSize: 13 }}>No sessions yet — tap ＋ to log your first! 🎾</Card>
      )}
      {recent.map(log => {
        const sport = SPORT[log.type] || SPORT.other;
        const name = log.type === "match" ? `Match — ${log.result === "W" ? "Win 🏆" : log.result === "L" ? "Loss" : "played"}`
          : log.type === "other" ? (log.sportName || "Other sport")
          : `${sport.label} session`;
        return (
          <div key={log.id} style={{
            display: "flex", alignItems: "center", gap: 11, background: M.card, borderRadius: 14,
            padding: "11px 13px", marginBottom: 8, boxShadow: M.dropSm,
          }}>
            <span style={{
              flexShrink: 0, padding: "4px 11px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
              letterSpacing: ".03em", textTransform: "uppercase", fontFamily: M.display,
              background: `${sport.color}33`, color: "#173a2f",
            }}>{sport.label}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{name}</div>
              <div style={{ fontSize: 11, color: M.sub }}>{log.duration} min · {log.rpe != null ? `RPE ${log.rpe}` : `intensity ${log.intensity}/5`}</div>
            </div>
            <span style={{ fontSize: 11, color: M.muted, fontWeight: 700 }}>{log.date === today ? "Today" : log.date.slice(5)}</span>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Verify and commit** — tests 55, build green, `npx eslint src/screens/HomeScreen.jsx` clean (SPORT map + helpers are module-level).
```bash
git add src/screens/HomeScreen.jsx
git commit -m "Add HomeScreen: readiness ring, level card, tiles, check-in card, recent

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire it together — MobileApp data shell + App.jsx hardening

**Files:**
- Modify: `src/screens/MobileApp.jsx` (data lifting, sheets, HomeScreen mount, toast cleanup)
- Modify: `src/App.jsx` (wrap the flag block's localStorage access in try/catch — behavior identical when storage works)

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces: the working slice. MobileApp keeps its external contract (`{ athleteId }` + pass-through props).

- [ ] **Step 1: Rewrite `src/screens/MobileApp.jsx`** (complete replacement content):

```jsx
import { useState, useEffect, useRef, useCallback } from "react";
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
import HomeScreen from "./HomeScreen.jsx";
import LogSheet from "./LogSheet.jsx";
import CheckinSheet from "./CheckinSheet.jsx";
import { mergeWellbeingByDate } from "../lib/load.js";

const SCREENS = {
  home:    { kicker: null,              label: "Home",    emoji: "🏠" },
  load:    { kicker: "Training load",   label: "Load",    emoji: "📊", note: "Weekly load, ACWR and where it comes from — coming soon." },
  matches: { kicker: "Season so far",   label: "Matches", emoji: "🎾", note: "Match history, win rate and season intelligence — coming soon." },
  plan:    { kicker: "Your plan",       label: "Plan",    emoji: "📋", note: "Your Sunday session, tuned to your week — coming soon." },
  me:      { kicker: "Profile & tools", label: "Profile", emoji: "⭐", note: "Profile, focus areas and coach tools — coming soon." },
};

export default function MobileApp({ athleteId }) {
  const [screen, setScreen]     = useState("home");
  const [name, setName]         = useState("");
  const [weekLogs, setWeekLogs] = useState([]);
  const [wellbeing, setWellbeing] = useState([]);
  const [xp, setXp]             = useState(0);
  const [streakInfo, setStreakInfo] = useState({ current: 0, activeThisWeek: 0 });
  const [sheet, setSheet]       = useState(null); // null | "log" | "checkin"
  const [toast, setToast]       = useState(null);
  const [tick, setTick]         = useState(0);
  const toastTimer = useRef(null);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoff = toLocalDateStr(cutoffDate);

    Promise.all([
      getDoc(doc(db, "athletes", athleteId)),
      getDocs(query(collection(db, "athletes", athleteId, "weekLogs"), where("date", ">=", cutoff))),
      getDocs(query(collection(db, "athletes", athleteId, "wellbeing"), where("date", ">=", cutoff))),
      getDocs(query(collection(db, "athletes", athleteId, "sessions"), where("date", ">=", cutoff))),
      getDoc(doc(db, "athletes", athleteId, "gamification", "state")),
    ])
      .then(([profileSnap, logsSnap, wbSnap, sessSnap, xpSnap]) => {
        if (cancelled) return;
        if (profileSnap.exists()) setName(profileSnap.data().name || "");
        const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const wb   = wbSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setWeekLogs(logs);
        setWellbeing(wb);
        setXp(xpSnap.exists() ? xpSnap.data().xp || 0 : 0);
        const dates = [
          ...logs.map(l => l.date),
          ...wb.map(w => w.date),
          ...sessSnap.docs.map(d => d.data().date),
        ].filter(Boolean);
        setStreakInfo(computeStreak(dates, toLocalDateStr(new Date())));
      })
      .catch(e => console.error("MobileApp data load:", e));

    return () => { cancelled = true; };
  }, [athleteId, tick]);

  const firstName = (name || "Athlete").split(" ")[0];
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const kicker = screen === "home" ? `${weekday} · let's play` : SCREENS[screen].kicker;
  const title = screen === "home" ? `Hi, ${firstName}!` : screen === "me" ? firstName
    : screen.charAt(0).toUpperCase() + screen.slice(1);
  const sc = SCREENS[screen];
  const todayWb = mergeWellbeingByDate(wellbeing)[toLocalDateStr(new Date())];

  const onSaved = (msg) => { showToast(msg); refresh(); };

  return (
    <div style={{ minHeight: "100vh", background: M.pageBg }}>
      <style>{mobileCss}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "22px 16px 110px" }}>
        <Header
          kicker={kicker}
          title={title}
          streak={streakInfo.current}
          initial={firstName.charAt(0).toUpperCase() || "A"}
          onAvatar={() => setScreen("me")}
        />
        <div key={screen} style={{ animation: "screenIn .25s ease" }}>
          {screen === "home" ? (
            <HomeScreen
              weekLogs={weekLogs}
              wellbeing={wellbeing}
              xp={xp}
              activeThisWeek={streakInfo.activeThisWeek}
              streak={streakInfo.current}
              onOpenCheckin={() => setSheet("checkin")}
            />
          ) : (
            <PlaceholderScreen emoji={sc.emoji} title={`${sc.label} is on its way`} note={sc.note} />
          )}
        </div>
      </div>

      <BottomNav active={screen} onNav={setScreen} onFab={() => setSheet("log")} />

      <BottomSheet open={sheet === "log"} onClose={() => setSheet(null)}>
        <LogSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "checkin"} onClose={() => setSheet(null)}>
        <CheckinSheet athleteId={athleteId} initial={todayWb} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>

      <Toast message={toast} />
    </div>
  );
}
```
Note: `SCREENS.home` no longer needs a `note` (HomeScreen is real). `LogSheet`/`CheckinSheet` remount when their `BottomSheet` reopens because `BottomSheet` returns `null` when closed — fresh form state per open, and `initial` re-reads today's wellbeing. This replaces the slice-1 FAB placeholder content entirely.

- [ ] **Step 2: Harden the App.jsx flag block**

Replace:
```js
const params = new URLSearchParams(window.location.search);
if (params.has("newui")) localStorage.setItem("newui", params.get("newui") === "0" ? "0" : "1");
const NEW_UI = localStorage.getItem("newui") === "1";
```
with:
```js
let NEW_UI = false;
try {
  const params = new URLSearchParams(window.location.search);
  if (params.has("newui")) localStorage.setItem("newui", params.get("newui") === "0" ? "0" : "1");
  NEW_UI = localStorage.getItem("newui") === "1";
} catch { /* storage blocked — stay on the classic UI */ }
```

- [ ] **Step 3: Verify** — `npx vitest run` 55; `npm run build` green; `npx eslint src/screens/ src/App.jsx` clean; `grep -c "toISOString" src/screens/*.jsx` → 0.

- [ ] **Step 4: Commit**
```bash
git add src/screens/MobileApp.jsx src/App.jsx
git commit -m "Wire Home, log sheet and check-in into MobileApp data shell

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verification sweep (controller)

- [ ] Gates: vitest 55/55; build green (MobileApp chunk grows to ~20 kB); eslint 34 baseline / 0 static-components; flag-off browser check (old login unchanged, 0 console errors).
- [ ] Whole-slice review (fresh reviewer, full diff), fix findings, mark spec Implemented, push.
