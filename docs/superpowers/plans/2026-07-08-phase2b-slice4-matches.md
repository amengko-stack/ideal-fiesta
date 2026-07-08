# Phase 2b Slice 4: Matches Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live Matches tab — win-rate hero, form chips, history, detail sheet with existing AI coaching reports, `.matchtrack` import, season intelligence, and the new tournament scheduler.

**Architecture:** Pure math in `lib/tournaments.js` (TDD); season generation EXTRACTED from MatchesTab into `lib/seasonReport.js` (shared, Phase-1-style verbatim move); new presentational `MatchesScreen` + three sheet-content components; MobileApp wires data + sheets.

**Tech Stack:** React 19 + Vite 8, Vitest, Firebase. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-phase2b-slice4-matches-design.md`

## Global Constraints

- Flag off ⇒ old app behavior unchanged (T2 refactors MatchesTab ONLY by extracting its season-generation body into a lib call — logic byte-preserved).
- No new dependencies. Dates via lib helpers only.
- After every task: `npx vitest run` green, `npm run build` green. Commit per task with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Do NOT delete any files. Branch `claude/general-assistance-jpgfB`.

---

### Task 1: `lib/tournaments.js` (TDD)

**Files:**
- Create: `src/lib/tournaments.js`
- Test: `src/lib/tournaments.test.js`

**Interfaces:**
- Produces: `daysUntil(dateStr, todayStr): number` (calendar-day diff, negative past); `tournamentModeFor(days): "week_of"|"pre"|"normal"` (≤6, ≤13, else; null→"normal"); `nearestUpcoming(tournaments, todayStr): tournament|null` (earliest with date ≥ today).

- [ ] **Step 1: Write the failing test** — create `src/lib/tournaments.test.js`:
```js
import { describe, it, expect } from "vitest";
import { daysUntil, tournamentModeFor, nearestUpcoming } from "./tournaments.js";

describe("daysUntil", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-07-08", "2026-07-08")).toBe(0);
    expect(daysUntil("2026-07-09", "2026-07-08")).toBe(1);
    expect(daysUntil("2026-08-08", "2026-07-08")).toBe(31);
  });
  it("is negative for past dates", () => {
    expect(daysUntil("2026-07-01", "2026-07-08")).toBe(-7);
  });
});

describe("tournamentModeFor", () => {
  it("maps day ranges to plan modes", () => {
    expect(tournamentModeFor(0)).toBe("week_of");
    expect(tournamentModeFor(6)).toBe("week_of");
    expect(tournamentModeFor(7)).toBe("pre");
    expect(tournamentModeFor(13)).toBe("pre");
    expect(tournamentModeFor(14)).toBe("normal");
  });
  it("defaults to normal when no tournament", () => {
    expect(tournamentModeFor(null)).toBe("normal");
    expect(tournamentModeFor(undefined)).toBe("normal");
  });
});

describe("nearestUpcoming", () => {
  const T = (name, date) => ({ name, date, level: "Club" });
  it("picks the earliest today-or-future tournament", () => {
    const list = [T("far", "2026-09-01"), T("near", "2026-07-10"), T("past", "2026-07-01")];
    expect(nearestUpcoming(list, "2026-07-08").name).toBe("near");
  });
  it("includes a tournament happening today", () => {
    expect(nearestUpcoming([T("today", "2026-07-08")], "2026-07-08").name).toBe("today");
  });
  it("returns null when empty or all past", () => {
    expect(nearestUpcoming([], "2026-07-08")).toBeNull();
    expect(nearestUpcoming([T("past", "2026-07-01")], "2026-07-08")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/tournaments.test.js` → cannot resolve.

- [ ] **Step 3: Implement** — create `src/lib/tournaments.js`:
```js
// ─── TOURNAMENT MATH ─────────────────────────────────────────────────────────
// Pure helpers for the tournament scheduler and the plan auto-taper.

export function daysUntil(dateStr, todayStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date(`${todayStr}T00:00:00`);
  return Math.round((d - t) / 86400000);
}

// Plan week-type from days to the nearest tournament (matches the existing
// tournamentStatus semantics consumed by the plan generator).
export function tournamentModeFor(days) {
  if (days == null) return "normal";
  if (days <= 6) return "week_of";
  if (days <= 13) return "pre";
  return "normal";
}

export function nearestUpcoming(tournaments, todayStr) {
  const upcoming = (tournaments || [])
    .filter(t => t.date && daysUntil(t.date, todayStr) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] || null;
}
```

- [ ] **Step 4: Verify** — `npx vitest run` → 63 pass (55 + 8). `npm run build` green.

- [ ] **Step 5: Commit**
```bash
git add src/lib/tournaments.js src/lib/tournaments.test.js
git commit -m "Add tournament math: daysUntil, plan mode mapping, nearest upcoming

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract season generation → `lib/seasonReport.js`

**Files:**
- Create: `src/lib/seasonReport.js`
- Modify: `src/tabs/MatchesTab.jsx` (its `handleGenerateSeasonAnalysis` body delegates to the lib)

**Interfaces:**
- Produces: `generateSeasonReport(athleteId, matches): Promise<report>` — builds the season prompt (VERBATIM logic moved from MatchesTab: the matchesWithAnalysis filtering, matchLines construction, systemPrompt, userMsg, `callClaudeJSON(..., maxTokens 4000)`), writes `athletes/{id}/reports/seasonLatest` with `{...parsed, generatedAt, matchCount}`, returns the report.

- [ ] **Step 1: Locate the source** — in `src/tabs/MatchesTab.jsx`, find `handleGenerateSeasonAnalysis` (contains `matchesWithAnalysis`, `matchLines`, a long `systemPrompt`/`userMsg`, `callClaudeJSON`, and `setDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest"), report)`).

- [ ] **Step 2: Create `src/lib/seasonReport.js`** — move the function's LOGIC verbatim into:
```js
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { callClaudeJSON } from "./ai.js";
import { buildAthleteContext } from "./athleteContext.js";

// Season-report generation, shared by the classic MatchesTab and the new
// MatchesScreen. Logic moved verbatim from MatchesTab (2026-07-08).
export async function generateSeasonReport(athleteId, matches) {
  /* body: everything handleGenerateSeasonAnalysis did between its loading
     setState calls — the matchesWithAnalysis/matchLines/prompt construction,
     the callClaudeJSON call, the report assembly + setDoc — moved VERBATIM,
     with component-state reads replaced by the `matches` parameter and the
     final report RETURNED instead of setState'd. Preserve every prompt
     character. If it referenced buildAthleteContext or analyses fetching,
     move that too. */
}
```
The comment block above describes the move — the implementer performs it by reading the actual current code, exactly like the Phase 1 extractions. NO prompt-text changes.

- [ ] **Step 3: Refactor MatchesTab** — `handleGenerateSeasonAnalysis` becomes: set loading state → `const report = await generateSeasonReport(athleteId, matches)` → same setState calls with the returned report → same catch/finally. Delete the moved body + now-unused imports (verify with eslint/build).

- [ ] **Step 4: Verify** — `npx vitest run` 63; `npm run build` green; `npx eslint src/tabs/MatchesTab.jsx src/lib/seasonReport.js` no NEW problems; `git diff` on MatchesTab shows only the extraction.

- [ ] **Step 5: Commit**
```bash
git add src/lib/seasonReport.js src/tabs/MatchesTab.jsx
git commit -m "Extract season-report generation into shared lib

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/screens/MatchesScreen.jsx`

**Files:**
- Create: `src/screens/MatchesScreen.jsx`

**Interfaces:**
- Consumes: `M`, `Card`, `daysUntil` from `../lib/tournaments.js`, `toLocalDateStr`
- Produces: `MatchesScreen({ matches, tournaments, seasonReport, seasonLoading, onOpenMatch, onOpenImport, onAddTournament, onGenerateSeason })` — pure presentational.

- [ ] **Step 1: Create the file** (complete content):

```jsx
import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { daysUntil } from "../lib/tournaments.js";
import { toLocalDateStr } from "../lib/dates.js";

const LEVEL_COLOR = { Fun: M.cheer, Club: M.success, Regional: M.parentBlue, National: M.warn };

export const fmtMatchDate = (ts) => ts
  ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
  : "—";

export const fmtScore = (m) => {
  const p1 = m.setScores?.p1 || [], p2 = m.setScores?.p2 || [];
  if (!p1.length) return "score unavailable";
  return p1.map((s, i) => `${s}-${p2[i] ?? "?"}`).join(", ");
};

const sortedByRecency = (matches) => [...(matches || [])].sort((a, b) => {
  if (!a.matchStartTime) return 1;
  if (!b.matchStartTime) return -1;
  return b.matchStartTime.localeCompare(a.matchStartTime);
});

export default function MatchesScreen({ matches, tournaments, seasonReport, seasonLoading, onOpenMatch, onOpenImport, onAddTournament, onGenerateSeason }) {
  const list = sortedByRecency(matches);
  const wins = list.filter(m => m.whoWonMatch === 1).length;
  const total = list.length;
  const winRate = total ? Math.round((wins / total) * 100) : 0;
  const c = 2 * Math.PI * 46;
  const off = c * (1 - winRate / 100);

  const today = toLocalDateStr(new Date());
  const upcoming = (tournaments || [])
    .filter(t => t.date && daysUntil(t.date, today) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      {/* win-rate hero */}
      <Card style={{ borderRadius: 24, padding: 20, display: "flex", alignItems: "center", gap: 18, boxShadow: M.dropLg }}>
        <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
          <svg width="110" height="110" viewBox="0 0 110 110">
            <defs>
              <linearGradient id="wrG" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={M.lime} /><stop offset="1" stopColor={M.ringGradTo} />
              </linearGradient>
            </defs>
            <circle cx="55" cy="55" r="46" fill="none" stroke={M.dividerAlt} strokeWidth="12" />
            <circle cx="55" cy="55" r="46" fill="none" stroke="url(#wrG)" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 55 55)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 32, lineHeight: 0.8, color: M.ink }}>{winRate}%</div>
            <div style={{ fontSize: 10, color: M.sub, fontWeight: 700, letterSpacing: ".08em" }}>WINS</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 26, color: M.ink, lineHeight: 1 }}>{wins}W · {total - wins}L</div>
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 6 }}>this season</div>
          <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
            {list.slice(0, 5).map((m) => {
              const w = m.whoWonMatch === 1;
              return (
                <div key={m.id || m.matchId} style={{
                  width: 24, height: 24, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: M.display, fontWeight: 700, fontSize: 12,
                  color: w ? M.deepGreen : "#fff", background: w ? M.limeDim : "#f0736e",
                }}>{w ? "W" : "L"}</div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* upcoming tournaments */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Upcoming tournaments 🏟️</span>
          <span onClick={onAddTournament} style={{ cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: "#5c7a0a" }}>＋ Add</span>
        </div>
        {upcoming.length === 0 && (
          <div onClick={onAddTournament} style={{ cursor: "pointer", textAlign: "center", padding: "16px 0", fontSize: 13, color: M.sub }}>
            No tournaments scheduled yet.<br /><span style={{ fontWeight: 700, color: "#5c7a0a" }}>Tap ＋ Add to log one →</span>
          </div>
        )}
        {upcoming.map(t => {
          const days = daysUntil(t.date, today);
          const near = days <= 7;
          const lc = LEVEL_COLOR[t.level] || M.success;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${M.divider}` }}>
              <div style={{
                flexShrink: 0, width: 46, height: 46, borderRadius: 13, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                color: near ? M.deepGreen : "#5f7168", background: near ? M.gradient : M.fillAlt,
              }}>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 18, lineHeight: 0.9 }}>{days}</div>
                <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em" }}>{days === 1 ? "day" : "days"}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{t.name}</div>
                <div style={{ fontSize: 11, color: M.sub }}>{t.level} · {t.date}</div>
              </div>
              <span style={{
                flexShrink: 0, fontFamily: M.display, fontWeight: 700, fontSize: 12, padding: "4px 11px",
                borderRadius: 999, color: lc, background: `${lc}1f`,
              }}>{days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `in ${days}d`}</span>
            </div>
          );
        })}
      </Card>

      {/* season intelligence */}
      <Card style={{ background: M.darkCard, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.lime }}>Season intelligence</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.limeDim, background: "rgba(200,245,100,0.14)", padding: "3px 8px", borderRadius: 20 }}>AI</span>
        </div>
        {seasonLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "18px 0" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #23433a", borderTopColor: M.lime, animation: "spin .7s linear infinite" }} />
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.lime }}>Analysing the season…</div>
          </div>
        ) : seasonReport ? (
          <>
            <div style={{ fontSize: 13, color: "#eaf3ee", lineHeight: 1.55, marginBottom: 14 }}>
              {seasonReport.seasonOverview || seasonReport.overview || seasonReport.developmentalStageAssessment || "Season analysis ready."}
            </div>
            {seasonReport.parentNote && (
              <div style={{ padding: "12px 13px", background: "rgba(47,127,217,0.14)", borderRadius: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: "#7fb6f0", marginBottom: 4 }}>FOR PARENTS</div>
                <div style={{ fontSize: 12.5, color: "#dfeee6", lineHeight: 1.5 }}>{seasonReport.parentNote}</div>
              </div>
            )}
            <div onClick={onGenerateSeason} style={{ cursor: "pointer", textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: M.limeDim }}>↺ Regenerate</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "#aebfb6", lineHeight: 1.5, marginBottom: 14 }}>
              {total} match{total === 1 ? "" : "es"} recorded. Generate an AI review to spot patterns, strengths and what to work on next.
            </div>
            <div onClick={total ? onGenerateSeason : undefined} style={{
              cursor: total ? "pointer" : "default", background: total ? M.gradient : "#23433a",
              color: total ? M.deepGreen : "#688577", borderRadius: 13, padding: 13, textAlign: "center",
              fontFamily: M.display, fontWeight: 700, fontSize: 14.5,
            }}>✨ Generate season analysis</div>
          </>
        )}
      </Card>

      {/* import */}
      <div onClick={onOpenImport} style={{
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: M.card, border: "2px dashed #9bc46a", borderRadius: 16, padding: 14, marginBottom: 14,
        fontFamily: M.display, fontWeight: 700, fontSize: 14, color: "#5c7a0a", boxShadow: M.dropSm,
      }}>＋ Import .matchtrack file</div>

      {/* history */}
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 9, paddingLeft: 2 }}>Match history</div>
      {list.length === 0 && (
        <Card style={{ textAlign: "center", color: M.sub, fontSize: 13 }}>No matches yet — import a .matchtrack file to get started 🎾</Card>
      )}
      {list.map(m => {
        const w = m.whoWonMatch === 1;
        return (
          <div key={m.id || m.matchId} onClick={() => onOpenMatch(m)} style={{
            cursor: "pointer", display: "flex", alignItems: "center", gap: 13, background: M.card,
            borderRadius: 16, padding: 14, marginBottom: 9, boxShadow: M.dropSm,
          }}>
            <div style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: M.display, fontWeight: 700, fontSize: 16,
              color: w ? M.deepGreen : "#fff", background: w ? M.gradient : "#f0736e",
            }}>{w ? "W" : "L"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14.5, color: M.ink }}>{m.opponentName || "Unknown opponent"}</div>
              <div style={{ fontSize: 12, color: M.sub, marginTop: 1 }}>{fmtScore(m)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, color: M.muted, fontWeight: 700 }}>{fmtMatchDate(m.matchStartTime)}</span>
              <div style={{ fontSize: 10.5, color: "#5c7a0a", fontWeight: 700, marginTop: 2 }}>details ›</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Verify and commit** — tests 63, build green, eslint clean on the file.
```bash
git add src/screens/MatchesScreen.jsx
git commit -m "Add MatchesScreen: win-rate hero, tournaments, season AI card, history

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Sheets — MatchDetailSheet, TournamentSheet, ImportSheet

**Files:**
- Create: `src/screens/MatchDetailSheet.jsx`, `src/screens/TournamentSheet.jsx`, `src/screens/ImportSheet.jsx`

**Interfaces:**
- `MatchDetailSheet({ match, analysis, analysisLoading })` — presentational; `analysis` is the matchAnalyses doc or null.
- `TournamentSheet({ athleteId, onSaved, onClose })` — writes `athletes/{id}/tournaments` `{name, date, level, createdAt}`.
- `ImportSheet({ athleteId, onSaved, onClose })` — file input → `parsePlist`/`extractMatchData` → `setDoc(doc(db, "matches", matchData.matchId), {...matchData, importedAt})`.

- [ ] **Step 1: Create `src/screens/MatchDetailSheet.jsx`**:
```jsx
import { M } from "../styles/mobileTheme.js";
import { fmtMatchDate, fmtScore } from "./MatchesScreen.jsx";

const PRIORITY_COLOR = { critical: M.danger, important: M.warn, monitor: M.parentBlue };

export default function MatchDetailSheet({ match, analysis, analysisLoading }) {
  if (!match) return null;
  const won = match.whoWonMatch === 1;
  const v = match.valissa || {};
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink }}>{match.opponentName || "Unknown opponent"}</div>
        <span style={{
          fontFamily: M.display, fontWeight: 700, fontSize: 13, padding: "4px 12px", borderRadius: 999,
          color: won ? M.deepGreen : "#fff", background: won ? M.gradient : "#f0736e",
        }}>{won ? "Win" : "Loss"}</span>
      </div>
      <div style={{ fontSize: 12.5, color: M.sub, marginBottom: 16 }}>{fmtScore(match)} · {fmtMatchDate(match.matchStartTime)}</div>

      <div style={{ display: "flex", gap: 9, marginBottom: 16 }}>
        {[
          { label: "1st serve", val: v.firstServePct != null ? `${Number(v.firstServePct).toFixed(0)}%` : "—" },
          { label: "winners", val: v.winners ?? "—" },
          { label: "unforced", val: v.unforcedErrors ?? "—" },
          { label: "dbl faults", val: v.doubleFaults ?? "—" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: M.fill, borderRadius: 13, padding: 11, textAlign: "center" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 17, color: M.ink }}>{s.val}</div>
            <div style={{ fontSize: 9.5, color: M.sub, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {analysisLoading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "14px 0" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${M.dividerAlt}`, borderTopColor: M.strength, animation: "spin .7s linear infinite" }} />
        </div>
      )}

      {!analysisLoading && analysis && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.limeDim, background: M.darkCard, padding: "3px 9px", borderRadius: 20 }}>AI COACHING REPORT</span>
          </div>
          {analysis.matchSummary && (
            <div style={{ fontSize: 13, color: "#4a5a52", lineHeight: 1.55, marginBottom: 14 }}>{analysis.matchSummary}</div>
          )}
          {analysis.strengthsToReinforce?.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: M.success, textTransform: "uppercase", marginBottom: 8 }}>Strengths to reinforce ✅</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                {analysis.strengthsToReinforce.map((s, i) => (
                  <span key={i} style={{ fontSize: 11.5, fontWeight: 700, fontFamily: M.display, color: M.deepGreen, background: M.gradient, padding: "5px 11px", borderRadius: 20 }}>{s}</span>
                ))}
              </div>
            </>
          )}
          {analysis.criticalFindings?.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: M.warn, textTransform: "uppercase", margin: "2px 0 8px" }}>Findings 🔍</div>
              {analysis.criticalFindings.map((f, i) => (
                <div key={i} style={{ background: M.card, borderRadius: 12, padding: "11px 13px", marginBottom: 8, boxShadow: M.dropSm }}>
                  <div style={{ fontSize: 12, color: "#4a5a52", lineHeight: 1.5 }}>{f.finding}</div>
                  {f.priority && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: PRIORITY_COLOR[f.priority] || M.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>{f.priority}</span>
                  )}
                </div>
              ))}
            </>
          )}
          {analysis.athleteNote && (
            <div style={{ marginTop: 14, padding: 13, background: "linear-gradient(150deg,#eefbdf,#e2fbf2)", borderRadius: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: "#5c7a0a", marginBottom: 4 }}>FOR VALISSA 🎾</div>
              <div style={{ fontSize: 13, color: M.ink, fontStyle: "italic", lineHeight: 1.5 }}>"{analysis.athleteNote}"</div>
            </div>
          )}
          {analysis.parentNote && (
            <div style={{ marginTop: 10, padding: 13, background: "rgba(47,127,217,0.1)", borderRadius: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.parentBlue, marginBottom: 4 }}>FOR PARENTS</div>
              <div style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.5 }}>{analysis.parentNote}</div>
            </div>
          )}
        </>
      )}

      {!analysisLoading && !analysis && (
        <div style={{ textAlign: "center", color: M.sub, fontSize: 12.5, padding: "10px 0", lineHeight: 1.5 }}>
          No coaching report yet for this match.<br />Generate one from the classic app for now — it'll show up here.
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create `src/screens/TournamentSheet.jsx`**:
```jsx
import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";

const LEVELS = ["Fun", "Club", "Regional", "National"];
const LEVEL_COLOR = { Fun: M.cheer, Club: M.success, Regional: M.parentBlue, National: M.warn };
const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };

export default function TournamentSheet({ athleteId, onSaved, onClose }) {
  const [name, setName]   = useState("");
  const [date, setDate]   = useState(toLocalDateStr(new Date()));
  const [level, setLevel] = useState("Club");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "athletes", athleteId, "tournaments"), {
        name: name.trim() || "Tournament", date, level, createdAt: serverTimestamp(),
      });
      onSaved(`${name.trim() || "Tournament"} added 🏟️`);
      onClose();
    } catch (e) {
      console.error("TournamentSheet save:", e);
      onSaved("Couldn't save — try again 🙈");
    } finally {
      setSaving(false);
    }
  };

  const input = {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #D6E2DB",
    borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
    fontSize: 14, color: M.ink, outline: "none", marginBottom: 18,
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Add a tournament 🏟️</div>
      <div style={label}>Tournament name</div>
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riverside Open" style={input} />
      <div style={label}>Date</div>
      <input type="date" value={date} min={toLocalDateStr(new Date())} onChange={e => setDate(e.target.value)} style={input} />
      <div style={label}>Level</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {LEVELS.map(l => {
          const sel = level === l;
          return (
            <div key={l} onClick={() => setLevel(l)} style={{
              cursor: "pointer", padding: "11px 6px", borderRadius: 14, fontSize: 14, fontWeight: 700,
              fontFamily: M.display, flex: 1, textAlign: "center", transition: "all .12s",
              background: sel ? LEVEL_COLOR[l] : M.fillAlt, color: sel ? "#fff" : "#5f7168",
              boxShadow: sel ? "0 4px 0 rgba(0,0,0,0.13)" : "none", transform: sel ? "translateY(-1px)" : "none",
            }}>{l}</div>
          );
        })}
      </div>
      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16, padding: 16,
        textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, boxShadow: M.cta,
        opacity: saving ? 0.6 : 1,
      }}>{saving ? "Saving…" : "Save tournament ⚡"}</div>
      <div style={{ fontSize: 11.5, color: M.sub, textAlign: "center", marginTop: 12, lineHeight: 1.4 }}>
        Sunday plans automatically taper training as this date gets closer.
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create `src/screens/ImportSheet.jsx`**:
```jsx
import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { parsePlist, extractMatchData } from "../lib/plist.js";

export default function ImportSheet({ onSaved, onClose }) {
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    try {
      const text = await file.text();
      const plistObj = parsePlist(text);
      const matchData = extractMatchData(plistObj);
      await setDoc(doc(db, "matches", matchData.matchId), {
        ...matchData, importedAt: new Date().toISOString(),
      });
      onSaved(`Match vs ${matchData.opponentName || "Opponent"} imported! 🎾`);
      onClose();
    } catch (err) {
      console.error("ImportSheet:", err);
      onSaved("That doesn't look like a .matchtrack file 🙈");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 6 }}>Import a match 🎾</div>
      <div style={{ fontSize: 13, color: M.sub, marginBottom: 16, lineHeight: 1.45 }}>
        Export a <b>.matchtrack</b> file from the match-tracking app, then add it here to build the record and unlock coaching insights.
      </div>
      {busy ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 0" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", border: `3px solid ${M.dividerAlt}`, borderTopColor: M.strength, animation: "spin .7s linear infinite" }} />
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Importing the match…</div>
        </div>
      ) : (
        <label style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "#F1F8F3",
          border: "2px dashed #9bc46a", borderRadius: 18, padding: 26, cursor: "pointer",
        }}>
          <span style={{ fontSize: 30 }}>📂</span>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>Choose a .matchtrack file</span>
          <span style={{ fontSize: 11.5, color: M.sub }}>tap to browse</span>
          <input type="file" accept=".matchtrack" onChange={onFile} style={{ display: "none" }} />
        </label>
      )}
    </>
  );
}
```

- [ ] **Step 4: Verify and commit** — tests 63, build green, `npx eslint src/screens/` clean.
```bash
git add src/screens/MatchDetailSheet.jsx src/screens/TournamentSheet.jsx src/screens/ImportSheet.jsx
git commit -m "Add match detail, tournament and import sheets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire Matches into MobileApp

**Files:**
- Modify: `src/screens/MobileApp.jsx`

- [ ] **Step 1: Data** — add to the imports: `MatchesScreen`, `MatchDetailSheet`, `TournamentSheet`, `ImportSheet`, `generateSeasonReport` from `../lib/seasonReport.js`. Extend the load effect's `Promise.all` with:
```js
      getDocs(collection(db, "matches")),
      getDocs(collection(db, "athletes", athleteId, "tournaments")),
      getDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest")),
```
and corresponding state: `matches` (docs with id), `tournaments` (docs with id), `seasonReport` (data or null).

- [ ] **Step 2: Detail-sheet state** — add:
```js
  const [detailMatch, setDetailMatch] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [seasonLoading, setSeasonLoading] = useState(false);

  const openMatch = (m) => {
    setDetailMatch(m);
    setAnalysis(null);
    setAnalysisLoading(true);
    getDoc(doc(db, "athletes", athleteId, "matchAnalyses", String(m.matchId || m.id)))
      .then(snap => setAnalysis(snap.exists() ? snap.data() : null))
      .catch(() => setAnalysis(null))
      .finally(() => setAnalysisLoading(false));
  };

  const generateSeason = async () => {
    if (seasonLoading) return;
    setSeasonLoading(true);
    try {
      const report = await generateSeasonReport(athleteId, matches);
      setSeasonReport(report);
      showToast("Season analysis ready 🧠");
    } catch (e) {
      console.error("Season generation:", e);
      showToast("Couldn't generate — try again later 🙈");
    } finally {
      setSeasonLoading(false);
    }
  };
```

- [ ] **Step 3: Mount** — `SCREENS.matches` loses its `note`. Screen conditional gains:
```jsx
          ) : screen === "matches" ? (
            <MatchesScreen
              matches={matches}
              tournaments={tournaments}
              seasonReport={seasonReport}
              seasonLoading={seasonLoading}
              onOpenMatch={openMatch}
              onOpenImport={() => setSheet("import")}
              onAddTournament={() => setSheet("tournament")}
              onGenerateSeason={generateSeason}
            />
```
Sheets section gains:
```jsx
      <BottomSheet open={detailMatch != null} onClose={() => setDetailMatch(null)}>
        <MatchDetailSheet match={detailMatch} analysis={analysis} analysisLoading={analysisLoading} />
      </BottomSheet>
      <BottomSheet open={sheet === "tournament"} onClose={() => setSheet(null)}>
        <TournamentSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "import"} onClose={() => setSheet(null)}>
        <ImportSheet onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
```
(`onSaved` already toasts + refreshes; the tournaments/matches lists update via the refresh.)

- [ ] **Step 4: Verify** — tests 63; build green; eslint src/screens/ clean.

- [ ] **Step 5: Commit**
```bash
git add src/screens/MobileApp.jsx
git commit -m "Wire Matches screen, detail/tournament/import sheets, season AI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Firestore rules for tournaments + verification (controller)

- [ ] Confirm `firestore.rules` already covers `athletes/{athleteId}/{document=**}` (it does — tournaments inherit family access). No rules change needed; verify by reading the file.
- [ ] Gates: vitest 63/63; build; eslint baseline; flag-off browser check.
- [ ] Whole-slice review (fable), fix findings, mark spec Implemented, push.
