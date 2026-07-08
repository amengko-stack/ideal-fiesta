# Phase 2b Slice 6: Me Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live Me tab — profile, editable focus areas, priorities with resolve, progress tiles, read-only parent coach section, settings with parent-mode toggle + sign out.

**Spec:** `docs/superpowers/specs/2026-07-08-phase2b-slice6-me-design.md`

## Global Constraints
- Flag off ⇒ classic app unchanged (T1's FITNESS_TESTS move is import-path only).
- No new dependencies. After every task: `npx vitest run` green, `npm run build` green. Commit per task with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Do NOT delete any files.

---

### Task 1: `lib/fitnessTests.js` move + `lib/growth.js` (TDD)

**Files:**
- Create: `src/lib/fitnessTests.js`, `src/lib/growth.js`
- Test: `src/lib/growth.test.js`
- Modify: `src/tabs/BenchmarksTab.jsx` (delete local `FITNESS_TESTS`, import from lib)

**Interfaces:**
- `FITNESS_TESTS: Array<{name, unit, lowerIsBetter}>` (exported; values byte-identical to BenchmarksTab's current const)
- `growthVelocity(measurements): number|null` — cm/yr, 1dp, from last two height-bearing entries sorted by date; null if <2 heights or zero day-gap.

- [ ] **Step 1: Failing test** — create `src/lib/growth.test.js`:
```js
import { describe, it, expect } from "vitest";
import { growthVelocity } from "./growth.js";

describe("growthVelocity", () => {
  it("computes cm/yr from the last two height measurements", () => {
    const ms = [
      { date: "2025-07-08", height: 146 },
      { date: "2026-07-08", height: 152 },
    ];
    expect(growthVelocity(ms)).toBe(6);
  });
  it("uses the LAST two when more exist and sorts by date", () => {
    const ms = [
      { date: "2026-01-08", height: 149 },
      { date: "2024-07-08", height: 140 },
      { date: "2026-07-08", height: 152 },
    ];
    // Jan→Jul 2026: +3cm over ~0.4956yr ≈ 6.1
    expect(growthVelocity(ms)).toBeCloseTo(6.1, 1);
  });
  it("ignores entries without height", () => {
    const ms = [
      { date: "2025-07-08", height: 146 },
      { date: "2026-07-01", weight: 41 },
      { date: "2026-07-08", height: 152 },
    ];
    expect(growthVelocity(ms)).toBe(6);
  });
  it("returns null with fewer than two heights or a zero gap", () => {
    expect(growthVelocity([])).toBeNull();
    expect(growthVelocity([{ date: "2026-07-08", height: 152 }])).toBeNull();
    expect(growthVelocity([
      { date: "2026-07-08", height: 151 },
      { date: "2026-07-08", height: 152 },
    ])).toBeNull();
  });
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run src/lib/growth.test.js` → cannot resolve.

- [ ] **Step 3: Implement** — create `src/lib/growth.js`:
```js
// ─── GROWTH MATH ─────────────────────────────────────────────────────────────
// Height velocity (cm/year) from the athlete's measurement history.
export function growthVelocity(measurements) {
  const withHeight = (measurements || [])
    .filter(m => m.height != null && m.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (withHeight.length < 2) return null;
  const a = withHeight[withHeight.length - 2];
  const b = withHeight[withHeight.length - 1];
  const days = (new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`)) / 86400000;
  if (days <= 0) return null;
  const years = days / 365.25;
  return Math.round(((b.height - a.height) / years) * 10) / 10;
}
```
Create `src/lib/fitnessTests.js`: move BenchmarksTab's `FITNESS_TESTS` const verbatim with `export`. In `src/tabs/BenchmarksTab.jsx` delete the local const and add `import { FITNESS_TESTS } from "../lib/fitnessTests.js";`.

- [ ] **Step 4: Verify** — `npx vitest run` 66/66 (62+4); build green; eslint on touched files no new problems.

- [ ] **Step 5: Commit** — `git add src/lib/growth.js src/lib/growth.test.js src/lib/fitnessTests.js src/tabs/BenchmarksTab.jsx && git commit -m "Add growthVelocity; share FITNESS_TESTS via lib" ...trailer`

---

### Task 2: `src/screens/MeScreen.jsx`

**Interfaces:**
- Consumes: `M`/`Card`, `levelFromXp`, `TENNIS_GAPS` from `../lib/exerciseDb.js`, `FITNESS_TESTS`, `growthVelocity`
- Produces: `MeScreen({ profile, xp, streak, sessionHistory, priorities, benchmarks, technical, isParent, parentMode, onToggleParentMode, onToggleGap, onResolvePriority, onSignOut })`

- [ ] **Step 1: Create the file** (complete content):

```jsx
import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { levelFromXp } from "../lib/gamification.js";
import { TENNIS_GAPS } from "../lib/exerciseDb.js";
import { FITNESS_TESTS } from "../lib/fitnessTests.js";
import { growthVelocity } from "../lib/growth.js";

const secTitle = { fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 12 };
const PARENT_BADGE = (
  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.parentBlue, background: M.parentBlueBg, padding: "3px 8px", borderRadius: 20 }}>PARENT</span>
);
const PRIORITY_COLOR = { critical: M.danger, important: M.warn, monitor: M.parentBlue };

const latestPer = (rows, key) => {
  const map = {};
  for (const r of rows || []) {
    if (!map[r[key]] || (r.date || "") > (map[r[key]].date || "")) map[r[key]] = r;
  }
  return map;
};
const previousFor = (rows, key, latest) =>
  (rows || []).filter(r => r[key] === latest[key] && r.id !== latest.id && (r.date || "") <= (latest.date || ""))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || null;

export default function MeScreen({ profile, xp, streak, sessionHistory, priorities, benchmarks, technical, isParent, parentMode, onToggleParentMode, onToggleGap, onResolvePriority, onSignOut }) {
  const firstName = (profile?.name || "Athlete").split(" ")[0];
  const lv = levelFromXp(xp);
  const gaps = profile?.gaps || [];
  const measurements = profile?.measurements || [];
  const velocity = growthVelocity(measurements);
  const heights = measurements.filter(m => m.height != null).slice(-5);
  const maxH = Math.max(...heights.map(h => h.height), 1);
  const minH = Math.min(...heights.map(h => h.height), maxH) - 12;

  const latestBench = latestPer(benchmarks, "testName");
  const latestTech = Object.values(latestPer(technical, "strokeArea"))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <>
      {/* profile */}
      <Card style={{ borderRadius: 24, padding: 20, display: "flex", alignItems: "center", gap: 15, boxShadow: M.dropLg }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: M.gradient, display: "flex",
          alignItems: "center", justifyContent: "center", fontFamily: M.display, fontWeight: 700,
          fontSize: 28, color: M.deepGreen, boxShadow: `0 4px 0 ${M.brandShadow}`,
        }}>{firstName.charAt(0).toUpperCase() || "A"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink, lineHeight: 1 }}>{firstName}</div>
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 4 }}>Age 12 · Tennis + Cross-Training</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 11, color: M.deepGreen, background: M.gradient, padding: "3px 10px", borderRadius: 10 }}>Lvl {lv.level}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: M.streakOrange, background: "#FFF1DD", padding: "3px 10px", borderRadius: 10 }}>🔥 {streak} days</span>
          </div>
        </div>
      </Card>

      {/* focus areas */}
      <Card>
        <div style={{ ...secTitle, marginBottom: 4 }}>Tennis focus areas</div>
        <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 13 }}>Tap to choose what the Sunday plans work on</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TENNIS_GAPS.map(g => {
            const sel = gaps.includes(g.id);
            return (
              <div key={g.id} onClick={() => onToggleGap(g.id)} style={{
                cursor: "pointer", padding: "7px 13px", borderRadius: 20, fontFamily: M.display,
                fontWeight: 700, fontSize: 12,
                border: sel ? "1.5px solid transparent" : "1.5px solid #D6E2DB",
                background: sel ? M.gradient : M.card, color: sel ? M.deepGreen : M.muted,
              }}>{g.label}</div>
            );
          })}
        </div>
      </Card>

      {/* priorities */}
      <Card>
        <div style={secTitle}>Focus priorities 🎯</div>
        {(!priorities || priorities.length === 0) && (
          <div style={{ textAlign: "center", padding: "14px 0", fontSize: 13, color: M.sub }}>All caught up — great work! 🎉</div>
        )}
        {(priorities || []).map(p => (
          <div key={p.id} style={{ padding: "11px 0", borderTop: `1px solid ${M.divider}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{p.priority}</div>
              {p.status === "escalated" && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: M.danger, background: `${M.danger}18`, padding: "2px 8px", borderRadius: 20 }}>ESCALATED</span>
              )}
            </div>
            {p.reason && <div style={{ fontSize: 11.5, color: M.sub, marginTop: 1 }}>{p.reason}</div>}
            <div onClick={() => onResolvePriority(p.priority)} style={{
              cursor: "pointer", marginTop: 10, textAlign: "center", padding: 9, borderRadius: 11,
              background: M.gradient, color: M.deepGreen, fontFamily: M.display, fontWeight: 700, fontSize: 12.5,
            }}>✓ Resolved</div>
          </div>
        ))}
      </Card>

      {/* progress */}
      <Card>
        <div style={secTitle}>Progress 📈</div>
        <div style={{ display: "flex", gap: 11 }}>
          {[
            { val: (sessionHistory || []).length, label: "strength sessions", color: M.success },
            { val: streak, label: "day streak", color: M.streakOrange },
            { val: (profile?.gaps || []).length, label: "focus areas", color: M.ink },
          ].map(t => (
            <div key={t.label} style={{ flex: 1, background: M.fill, borderRadius: 14, padding: 12 }}>
              <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: t.color }}>{t.val}</div>
              <div style={{ fontSize: 10.5, color: M.sub, fontWeight: 600 }}>{t.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* parent-gated coach section */}
      {isParent && parentMode && (
        <>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Fitness benchmarks</span>
              {PARENT_BADGE}
            </div>
            {Object.keys(latestBench).length === 0 && (
              <div style={{ fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No benchmarks logged yet — use the classic app to record fitness tests.</div>
            )}
            {FITNESS_TESTS.filter(t => latestBench[t.name]).map(t => {
              const latest = latestBench[t.name];
              const prev = previousFor(benchmarks, "testName", latest);
              let trend = null;
              if (prev && prev.result !== latest.result) {
                const improved = t.lowerIsBetter ? latest.result < prev.result : latest.result > prev.result;
                trend = { txt: `${latest.result > prev.result ? "▲" : "▼"} ${Math.abs(latest.result - prev.result).toFixed(1)}`, color: improved ? M.success : M.warn };
              }
              return (
                <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: `1px solid ${M.divider}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13.5, color: M.ink }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: M.muted }}>{latest.date}</div>
                  </div>
                  <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>{latest.result} {latest.unit}</span>
                  {trend && <span style={{ fontSize: 11.5, fontWeight: 700, color: trend.color, width: 52, textAlign: "right", flexShrink: 0 }}>{trend.txt}</span>}
                </div>
              );
            })}
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Technical · strokes</span>
              {PARENT_BADGE}
            </div>
            {latestTech.length === 0 && (
              <div style={{ fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No stroke assessments yet — log them in the classic app.</div>
            )}
            {latestTech.map(a => (
              <div key={a.id} style={{ padding: "10px 0", borderTop: `1px solid ${M.divider}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13.5, color: M.ink }}>{a.strokeArea}</span>
                  {a.priority && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: PRIORITY_COLOR[a.priority] || M.muted, background: `${PRIORITY_COLOR[a.priority] || M.muted}18`, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" }}>{a.priority}</span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: M.muted }}>{a.date}</span>
                </div>
                {a.assessment && <div style={{ fontSize: 11.5, color: M.sub, marginTop: 3, lineHeight: 1.45 }}>{a.assessment.slice(0, 140)}{a.assessment.length > 140 ? "…" : ""}</div>}
              </div>
            ))}
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Growth</span>
              {PARENT_BADGE}
            </div>
            <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 14 }}>Height over time — used to tune training load during growth spurts</div>
            {heights.length === 0 ? (
              <div style={{ fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0" }}>No measurements yet — Valissa can log them in her Growth tab (classic app).</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 74 }}>
                  {heights.map((h, i) => (
                    <div key={h.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                      <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 10, color: "#5f7168" }}>{h.height}</span>
                      <div style={{
                        width: "100%", height: `${Math.max(14, Math.round(((h.height - minH) / Math.max(maxH - minH, 1)) * 100))}%`,
                        borderRadius: "7px 7px 3px 3px",
                        background: i === heights.length - 1 ? `linear-gradient(180deg,${M.match},${M.streakOrange})` : "#DCEAE0",
                      }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: M.muted }}>{h.date.slice(2, 7)}</span>
                    </div>
                  ))}
                </div>
                {velocity != null && (
                  <div style={{ fontSize: 11.5, color: M.sub, fontWeight: 600, marginTop: 10, textAlign: "center" }}>
                    Growing ~<span style={{ color: M.streakOrange, fontWeight: 700 }}>{velocity} cm/year</span>
                    {velocity >= 5.5 ? " — growth-spurt window: plans keep loads moderate 🌱" : ""}
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}

      {/* settings */}
      <Card style={{ padding: "8px 16px" }}>
        {isParent && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
            <div>
              <span style={{ fontSize: 13.5, color: M.ink, fontWeight: 600 }}>Parent mode</span>
              <div style={{ fontSize: 11, color: M.muted, marginTop: 1 }}>Shows coach data (benchmarks, strokes, growth)</div>
            </div>
            <div onClick={onToggleParentMode} style={{
              cursor: "pointer", width: 42, height: 24, borderRadius: 99, position: "relative",
              background: parentMode ? M.strength : "#D6E2DB", transition: "background .15s", flexShrink: 0,
            }}>
              <div style={{ position: "absolute", top: 2, left: parentMode ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: M.muted, padding: "13px 0", borderBottom: `1px solid ${M.divider}` }}>
          Coach tools (logging benchmarks & stroke notes) live in the classic app — add <b>?newui=0</b> to the address to open it.
        </div>
        <div onClick={onSignOut} style={{ cursor: "pointer", textAlign: "center", padding: "13px 0", fontFamily: M.display, fontWeight: 700, fontSize: 13.5, color: M.danger }}>
          Sign out
        </div>
      </Card>
    </>
  );
}
```

- [ ] **Step 2: Verify and commit** — tests 66, build green, eslint clean.
`git add src/screens/MeScreen.jsx && git commit -m "Add MeScreen: profile, focus areas, priorities, coach section, settings" ...trailer`

---

### Task 3: Wire Me into MobileApp

**Files:**
- Modify: `src/screens/MobileApp.jsx`

- [ ] **Step 1:** Destructure the full contract: `export default function MobileApp({ athleteId, isParent, onSignOut }) {` (the `user` prop remains un-destructured — still unused). Imports: `MeScreen`, `resolveDeferred` from `../lib/deferredPriorities.js`.
- [ ] **Step 2:** State: `priorities` ([]), `benchmarks` ([]), `technical` ([]), `parentMode` (init `localStorage.getItem("parentMode") !== "0"` inside a try/catch defaulting true). Extend `Promise.all`: `getDocs(collection(db, "athletes", athleteId, "deferredPriorities"))`, `getDocs(collection(db, "athletes", athleteId, "benchmarks"))`, `getDocs(collection(db, "athletes", athleteId, "technicalAssessments"))`. In the then: `setPriorities(snapDocs.filter(d => d.status === "active" || d.status === "escalated"))` (map with id first), `setBenchmarks(...)`, `setTechnical(...)` — all inside the cancelled guard.
- [ ] **Step 3:** Handlers:
```js
  const toggleGap = (gapId) => {
    setProfile(prev => {
      if (!prev) return prev;
      const cur = prev.gaps || [];
      const gaps = cur.includes(gapId) ? cur.filter(g => g !== gapId) : [...cur, gapId];
      setDoc(doc(db, "athletes", athleteId), { gaps }, { merge: true })
        .catch(err => console.error("gaps save:", err));
      return { ...prev, gaps };
    });
  };

  const resolvePriority = async (priorityLabel) => {
    try {
      await resolveDeferred(athleteId, priorityLabel);
      showToast("Nice — priority resolved! 🎉");
      refresh();
    } catch (e) {
      console.error("resolve priority:", e);
      showToast("Couldn't update — try again 🙈");
    }
  };

  const toggleParentMode = () => {
    setParentMode(p => {
      const next = !p;
      try { localStorage.setItem("parentMode", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
```
- [ ] **Step 4:** `SCREENS.me` loses `note`. Mount before the PlaceholderScreen fallback:
```jsx
          ) : screen === "me" ? (
            <MeScreen
              profile={profile}
              xp={xp}
              streak={streakInfo.current}
              sessionHistory={sessionHistory}
              priorities={priorities}
              benchmarks={benchmarks}
              technical={technical}
              isParent={isParent}
              parentMode={parentMode}
              onToggleParentMode={toggleParentMode}
              onToggleGap={toggleGap}
              onResolvePriority={resolvePriority}
              onSignOut={onSignOut}
            />
```
(The PlaceholderScreen fallback + its import can now be REMOVED if no screen uses it — all five screens are real. Check and remove the import + `note` fields if so; keep the component file on disk for future use.)
- [ ] **Step 5:** Verify — tests 66; build; eslint src/screens/ clean. Commit: `"Wire Me screen: focus areas, priorities, coach section, settings" ...trailer`

---

### Task 4: Review + push (controller)
- [ ] Whole-slice review (fable): FITNESS_TESTS move fidelity, MeScreen null-safety (empty benchmarks/technical/measurements; missing profile), gap round-trip vs classic PlanTab chips (same profile.gaps ids), resolveDeferred integration, parentMode gating (athlete login NEVER sees coach section), gates. Fix findings, mark spec Implemented, push.
