# Phase 2b Slice 3: Load Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live Load screen (weekly hero, 4-week bars, per-sport breakdown, session list) plus the two slice-2 review fixes (partial-write toast, XP_PER_LEVEL constant).

**Architecture:** One new pure-presentational `src/screens/LoadScreen.jsx` consuming existing lib math; `M.tone` map added to the theme; MobileApp mounts it for the `load` tab.

**Tech Stack:** React 19 + Vite 8, Vitest, Firebase. No new dependencies, no new math.

**Spec:** `docs/superpowers/specs/2026-07-08-phase2b-slice3-load-design.md`

## Global Constraints

- Flag off ⇒ old app untouched. No new dependencies. All dates via lib helpers.
- After every task: `npx vitest run` 55/55 and `npm run build` green. Commit per task with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Do NOT delete any files. Branch `claude/general-assistance-jpgfB`.

---

### Task 1: Theme tone map + slice-2 review fixes

**Files:**
- Modify: `src/styles/mobileTheme.js` (add `tone` map to `M`)
- Modify: `src/screens/HomeScreen.jsx` (use `M.tone` + `XP_PER_LEVEL`)
- Modify: `src/screens/LogSheet.jsx`, `src/screens/CheckinSheet.jsx` (split write vs XP award)

**Interfaces:**
- Produces: `M.tone = { success, warn, danger, limeDim, muted }` (hex strings) — Task 2's LoadScreen relies on it.

- [ ] **Step 1: Add the tone map**

In `src/styles/mobileTheme.js`, after the `// status` line block (`success/warn/danger/parentBlue/streakOrange`), add:
```js
  // tone → hex, keyed by acwrStatus().tone
  tone: { success: "#12b585", warn: "#d98a1f", danger: "#e0433f", limeDim: "#8fd400", muted: "#9aa8a1" },
```

- [ ] **Step 2: HomeScreen — use the shared pieces**

In `src/screens/HomeScreen.jsx`:
1. Change `import { levelFromXp } from "../lib/gamification.js";` → `import { levelFromXp, XP_PER_LEVEL } from "../lib/gamification.js";`
2. Delete the local `const toneColor = { success: M.success, warn: M.warn, danger: M.danger, limeDim: M.limeDim, muted: M.muted };` line and replace both `toneColor[status.tone]` usages with `M.tone[status.tone]`.
3. Replace the level-bar width expression `width: `${Math.round((lv.intoLevel / 1000) * 100)}%`` with `width: `${Math.round((lv.intoLevel / XP_PER_LEVEL) * 100)}%`` and the `{lv.intoLevel} / 1000 XP` text with `{lv.intoLevel} / {XP_PER_LEVEL} XP`.

- [ ] **Step 3: LogSheet — split write from XP**

In `src/screens/LogSheet.jsx`, replace the body of `save`'s `try` block:
```js
      const now = new Date();
      const entry = {
        type, duration: dur, rpe, feel,
        date: toLocalDateStr(now), time: now.toTimeString().slice(0, 5),
        ...(type === "other" ? { sportName: sportName.trim() || "Other sport" } : {}),
        ...(type === "match" ? { result: win ? "W" : "L" } : {}),
      };
      await addDoc(collection(db, "athletes", athleteId, "weekLogs"), entry);
      let msg;
      try {
        const xp = xpForSession(sessionSRPE(entry));
        await awardXp(athleteId, xp);
        msg = `+${xp} XP · awesome! 🎾`;
      } catch {
        msg = "Saved! (XP syncs later) ✨";
      }
      onSaved(msg);
      onClose();
```
(The outer `catch` keeps its "Couldn't save — try again 🙈" — it now only fires when the session itself failed to write.)

- [ ] **Step 4: CheckinSheet — same split**

In `src/screens/CheckinSheet.jsx`, replace the `try` body:
```js
      const now = new Date();
      // XP only for the FIRST check-in of the day (updates are free — no tap-farming).
      const firstToday = initial == null;
      await addDoc(collection(db, "athletes", athleteId, "wellbeing"), {
        type: "checkin", mood, sleep, soreness,
        date: toLocalDateStr(now), time: now.toTimeString().slice(0, 5),
      });
      let msg = "Check-in updated ✨";
      if (firstToday) {
        try {
          await awardXp(athleteId, XP.CHECKIN);
          msg = `Check-in saved · +${XP.CHECKIN} XP ✨`;
        } catch {
          msg = "Check-in saved! (XP syncs later) ✨";
        }
      }
      onSaved(msg);
      onClose();
```

- [ ] **Step 5: Verify and commit** — `npx vitest run` 55; `npm run build` green; `npx eslint src/screens/ src/styles/` clean.
```bash
git add src/styles/mobileTheme.js src/screens/HomeScreen.jsx src/screens/LogSheet.jsx src/screens/CheckinSheet.jsx
git commit -m "Add M.tone map; report partial save/XP failures honestly; use XP_PER_LEVEL

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `src/screens/LoadScreen.jsx`

**Files:**
- Create: `src/screens/LoadScreen.jsx`

**Interfaces:**
- Consumes: `M`/`Card`, `computeLoad`, `computeLoadHistory`, `acwrStatus`, `sessionSRPE` from `../lib/load.js`, `getWeekBounds` from `../lib/dates.js`
- Produces: `LoadScreen({ weekLogs })` — pure presentational.

- [ ] **Step 1: Create the file** (complete content):

```jsx
import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { computeLoad, computeLoadHistory, acwrStatus, sessionSRPE } from "../lib/load.js";
import { getWeekBounds } from "../lib/dates.js";

const SPORT = [
  { key: "tennis",   label: "Tennis",   color: M.tennis },
  { key: "match",    label: "Match",    color: M.match },
  { key: "strength", label: "Strength", color: M.strength },
  { key: "cheer",    label: "Cheer",    color: M.cheer },
  { key: "other",    label: "Other",    color: M.other },
];

const TIP = {
  danger:  "Way high — take it easy today. Recovery is training too. 🧘",
  warn:    "Trending high — ease off intensity for a day or two.",
  limeDim: "You can handle a bit more — good week to progress.",
  success: "Nicely balanced — keep the rhythm going! 🎾",
  muted:   "Log a few sessions to see your load picture.",
};

const sportOf = (type) => SPORT.find(s => s.key === type) || SPORT[4];

const sessionName = (log) =>
  log.type === "match" ? `Match — ${log.result === "W" ? "Win 🏆" : log.result === "L" ? "Loss" : "played"}`
  : log.type === "other" ? (log.sportName || "Other sport")
  : `${sportOf(log.type).label} session`;

export default function LoadScreen({ weekLogs }) {
  const logs = weekLogs || [];
  const { thisWeekSRPE, acwr } = computeLoad(logs);
  const status = acwrStatus(acwr);
  const tone = M.tone[status.tone];

  const history = computeLoadHistory(logs, 4);
  const labels = ["3w", "2w", "1w", "Now"];
  const maxWeek = Math.max(...history.map(w => w.totalSrpe), 1);

  const current = history[3].srpeByType;
  const breakdown = SPORT.filter(s => current[s.key] > 0);
  const maxSport = Math.max(...breakdown.map(s => current[s.key]), 1);

  const { start: weekStart } = getWeekBounds(0);
  const thisWeek = logs
    .filter(l => l.date >= weekStart)
    .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));

  return (
    <>
      {/* hero */}
      <Card style={{ borderRadius: 24, padding: 20, boxShadow: M.dropLg }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 46, lineHeight: 0.85, color: M.ink }}>
              {Math.round(thisWeekSRPE).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: M.sub, fontWeight: 600, marginTop: 4 }}>sRPE this week</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-block", fontFamily: M.display, fontWeight: 700, fontSize: 13,
              padding: "5px 12px", borderRadius: 999, background: `${tone}22`, color: tone,
            }}>{status.label}</div>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginTop: 6 }}>
              ACWR {acwr == null ? "—" : acwr.toFixed(2)}
            </div>
          </div>
        </div>
        <div style={{
          background: "#F1F8F3", borderLeft: `3px solid ${tone}`, borderRadius: "0 10px 10px 0",
          padding: "11px 13px", fontSize: 12.5, color: "#4a5a52", marginTop: 16, lineHeight: 1.45, fontWeight: 500,
        }}>{TIP[status.tone]}</div>
      </Card>

      {/* 4-week bars */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 16 }}>4-week load</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 96 }}>
          {history.map((w, i) => (
            <div key={w.weekStart} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 12, color: "#5f7168" }}>
                {Math.round(w.totalSrpe).toLocaleString()}
              </span>
              <div style={{
                width: "100%",
                height: `${Math.max(10, Math.round((w.totalSrpe / maxWeek) * 100))}%`,
                borderRadius: "8px 8px 4px 4px",
                background: i === 3 ? `linear-gradient(180deg,${M.ringGradFrom},${M.ringGradTo})` : "#DCEAE0",
              }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: M.muted }}>{labels[i]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* breakdown */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 16 }}>Where the load comes from</div>
        {breakdown.length === 0 && (
          <div style={{ textAlign: "center", color: M.sub, fontSize: 13, padding: "8px 0" }}>Nothing logged this week yet — tap ＋ to get started 🎾</div>
        )}
        {breakdown.map(s => (
          <div key={s.key} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13, color: M.ink }}>{s.label}</span>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: "#5f7168" }}>{Math.round(current[s.key]).toLocaleString()}</span>
            </div>
            <div style={{ height: 12, borderRadius: 99, background: M.fillDim, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((current[s.key] / maxSport) * 100)}%`, height: "100%", borderRadius: 99, background: s.color }} />
            </div>
          </div>
        ))}
      </Card>

      {/* this week's sessions */}
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 9, paddingLeft: 2 }}>This week's sessions</div>
      {thisWeek.length === 0 && (
        <Card style={{ textAlign: "center", color: M.sub, fontSize: 13 }}>No sessions this week yet.</Card>
      )}
      {thisWeek.map(log => {
        const sport = sportOf(log.type);
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
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{sessionName(log)}</div>
              <div style={{ fontSize: 11, color: M.sub }}>{log.duration} min · {log.rpe != null ? `RPE ${log.rpe}` : `intensity ${log.intensity}/5`}</div>
            </div>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.success }}>{Math.round(sessionSRPE(log))}</span>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Verify and commit** — tests 55, build green, `npx eslint src/screens/LoadScreen.jsx` clean.
```bash
git add src/screens/LoadScreen.jsx
git commit -m "Add LoadScreen: weekly hero, 4-week bars, sport breakdown, session list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Mount LoadScreen in MobileApp

**Files:**
- Modify: `src/screens/MobileApp.jsx`

- [ ] **Step 1: Import and mount**

1. Add `import LoadScreen from "./LoadScreen.jsx";` next to the HomeScreen import.
2. In `SCREENS`, the `load` entry no longer needs its `note` — change to `load: { kicker: "Training load", label: "Load", emoji: "📊" },`
3. Replace the screen-mount conditional:
```jsx
          {screen === "home" ? (
            <HomeScreen ... />
          ) : (
            <PlaceholderScreen ... />
          )}
```
with:
```jsx
          {screen === "home" ? (
            <HomeScreen
              weekLogs={weekLogs}
              wellbeing={wellbeing}
              xp={xp}
              activeThisWeek={streakInfo.activeThisWeek}
              streak={streakInfo.current}
              onOpenCheckin={() => setSheet("checkin")}
            />
          ) : screen === "load" ? (
            <LoadScreen weekLogs={weekLogs} />
          ) : (
            <PlaceholderScreen emoji={sc.emoji} title={`${sc.label} is on its way`} note={sc.note} />
          )}
```
(The HomeScreen props are unchanged — keep them exactly as they are.)

- [ ] **Step 2: Verify** — tests 55; build green; `npx eslint src/screens/` clean.

- [ ] **Step 3: Commit**
```bash
git add src/screens/MobileApp.jsx
git commit -m "Mount LoadScreen on the Load tab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Verification sweep (controller)

- [ ] Gates: vitest 55/55; build green; eslint 34 baseline / 0 static-components; flag-off browser check.
- [ ] Whole-slice review (full diff), fix findings, mark spec Implemented, push.
