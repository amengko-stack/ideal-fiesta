import { useState } from "react";
import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { acwrStatus } from "../lib/load.js";
import { nearestUpcoming, daysUntil, tournamentModeFor } from "../lib/tournaments.js";
import { toLocalDateStr } from "../lib/dates.js";

const MODES = [
  { k: "none",      label: "Normal week" },
  { k: "pre",       label: "Pre-tourney" },
  { k: "week_of",   label: "This week" },
  { k: "post_easy", label: "Post (easy)" },
  { k: "post_hard", label: "Post (heavy)" },
];
// tournamentModeFor → PlanTab's tournament-select values ("normal" maps to "none")
const AUTO_MODE = { normal: "none", pre: "pre", week_of: "week_of" };

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: "16px 0 9px" };

export default function PlanScreen({ plan, tournaments, loading, doneMap, onGenerate, onToggleExercise, onRegenerate }) {
  const [override, setOverride] = useState(null);

  const today = toLocalDateStr(new Date());
  const nearest = nearestUpcoming(tournaments, today);
  const autoMode = AUTO_MODE[tournamentModeFor(nearest ? daysUntil(nearest.date, today) : null)];
  const mode = override ?? autoMode;
  const autoNote = nearest && AUTO_MODE[tournamentModeFor(daysUntil(nearest.date, today))] !== "none"
    ? `${nearest.name} in ${daysUntil(nearest.date, today)} day${daysUntil(nearest.date, today) === 1 ? "" : "s"} — auto-set to "${MODES.find(m => m.k === autoMode)?.label}"`
    : null;

  if (!plan) {
    return (
      <Card style={{ borderRadius: 24, padding: 20, boxShadow: M.dropLg }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: M.ink }}>Let's build Sunday's plan ⚡</div>
        <div style={{ fontSize: 13, color: M.sub, marginTop: 6, lineHeight: 1.45 }}>
          A strength & power session tuned to training load, how she feels, and the latest match.
        </div>
        <div style={label}>Week type</div>
        {autoNote && !override && (
          <div style={{ fontSize: 12, color: "#5c7a0a", fontWeight: 700, marginBottom: 9 }}>⛳ {autoNote}</div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {MODES.map(m => {
            const sel = mode === m.k;
            return (
              <div key={m.k} onClick={() => setOverride(m.k)} style={{
                cursor: "pointer", padding: "9px 13px", borderRadius: 12, fontFamily: M.display,
                fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
                background: sel ? M.gradient : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
                boxShadow: sel ? `0 3px 0 ${M.brandShadow}` : "none",
              }}>{m.label}</div>
            );
          })}
        </div>
        {override != null && override !== autoMode && (
          <div onClick={() => setOverride(null)} style={{ cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 12, color: "#5c7a0a", marginBottom: 10 }}>↺ Back to auto (from the schedule)</div>
        )}
        <div onClick={loading ? undefined : () => onGenerate(mode)} style={{
          cursor: loading ? "default" : "pointer", background: M.gradient, color: M.deepGreen,
          borderRadius: 16, padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
          fontSize: 16, boxShadow: M.cta, opacity: loading ? 0.65 : 1, marginTop: 6,
        }}>{loading ? "Building the plan…" : "⚡ Generate this Sunday's plan"}</div>
      </Card>
    );
  }

  const exercises = plan.plan || [];
  const doneCount = exercises.filter(ex => doneMap?.[ex.id]).length;
  const progPct = exercises.length ? Math.round((doneCount / exercises.length) * 100) : 0;
  const progMsg = progPct === 100 ? "crushed it! 🎉" : progPct >= 50 ? "halfway there!" : "let's go!";
  const st = acwrStatus(plan.metrics?.acwr ?? null);

  return (
    <>
      {/* hero */}
      <div style={{
        background: M.gradient, borderRadius: 24, padding: 20, marginBottom: 14,
        boxShadow: `0 5px 0 ${M.brandShadow}`, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -14, top: -14, fontSize: 82, opacity: 0.18, transform: "rotate(-12deg)" }}>💪</div>
        <div style={{ fontSize: 12.5, color: "#0a3a2a", fontWeight: 700, position: "relative" }}>SUNDAY SESSION</div>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 26, color: M.deepGreen, lineHeight: 1.05, marginTop: 3, position: "relative" }}>
          {plan.sessionType || "Strength & power"}
        </div>
        <div style={{ fontSize: 13, color: "#0e4635", marginTop: 6, position: "relative" }}>
          {plan.sessionDuration ? `${plan.sessionDuration} · ` : ""}{exercises.length} exercises
        </div>
        <div style={{ height: 11, borderRadius: 99, background: "rgba(10,46,34,0.18)", overflow: "hidden", marginTop: 14, position: "relative" }}>
          <div style={{ width: `${progPct}%`, height: "100%", borderRadius: 99, background: M.deepGreen, transition: "width .3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#0a3a2a", fontWeight: 700, marginTop: 7, position: "relative" }}>
          {doneCount} / {exercises.length} done — {progMsg}
        </div>
      </div>

      {/* context tiles */}
      <div style={{ display: "flex", gap: 11, marginBottom: 12 }}>
        <Card style={{ flex: 1, borderRadius: 16, padding: 12, marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 19, color: M.ink }}>{plan.metrics?.thisWeekSRPE ?? "—"}</div>
          <div style={{ fontSize: 10, color: M.sub, fontWeight: 600 }}>week load</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 16, padding: 12, marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 19, color: M.tone[st.tone] }}>{plan.metrics?.acwr != null ? plan.metrics.acwr.toFixed(2) : "—"}</div>
          <div style={{ fontSize: 10, color: M.tone[st.tone], fontWeight: 700 }}>{st.label}</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 16, padding: 12, marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.success, lineHeight: 1.1 }}>{plan.sessionType || "Session"}</div>
          <div style={{ fontSize: 10, color: M.sub, fontWeight: 600 }}>{plan.sessionDuration || ""}</div>
        </Card>
      </div>

      {/* coach's briefing */}
      {(plan.briefing || plan.athleteNote) && (
        <Card style={{ background: M.darkCard, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🎬</span>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.lime }}>Coach's briefing</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.limeDim, background: "rgba(200,245,100,0.14)", padding: "3px 8px", borderRadius: 20 }}>AI</span>
          </div>
          {plan.briefing && <div style={{ fontSize: 13, color: "#dfeee6", lineHeight: 1.55 }}>{plan.briefing}</div>}
          {plan.athleteNote && (
            <div style={{ marginTop: 13, padding: "11px 13px", background: "rgba(217,248,106,0.12)", borderRadius: 12, fontSize: 12.5, color: "#eaf7c9", fontStyle: "italic", lineHeight: 1.5 }}>
              "{plan.athleteNote}"
            </div>
          )}
        </Card>
      )}

      {/* why today */}
      {(plan.loadRationale || plan.matchRationale || plan.techAssessmentRationale) && (
        <Card>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 12 }}>Why today looks like this</div>
          {[
            ["Training load", plan.loadRationale],
            ["Match findings", plan.matchRationale],
            ["Technical focus", plan.techAssessmentRationale],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", color: M.success, textTransform: "uppercase", marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </Card>
      )}

      {/* checklist */}
      <Card>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 12 }}>Today's session 💪</div>
        {exercises.map(ex => {
          const done = !!doneMap?.[ex.id];
          return (
            <div key={ex.id} onClick={() => onToggleExercise(ex.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", cursor: "pointer" }}>
              <div style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: 9, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 15, fontWeight: 700, color: M.deepGreen,
                background: done ? M.gradient : M.fillDim, border: done ? "none" : "2px solid #D6E2DB", transition: "all .12s",
              }}>{done ? "✓" : ""}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: done ? M.muted : M.ink, textDecoration: done ? "line-through" : "none" }}>{ex.name}</div>
                {ex.note && <div style={{ fontSize: 10.5, color: "#5c7a0a", fontWeight: 600, marginTop: 2 }}>→ {ex.note}</div>}
              </div>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.muted, flexShrink: 0 }}>
                {ex.sets != null ? `${ex.sets} × ${ex.reps ?? ""}` : ex.reps ?? ""}
              </span>
            </div>
          );
        })}
      </Card>

      <div onClick={loading ? undefined : onRegenerate} style={{
        cursor: loading ? "default" : "pointer", textAlign: "center", padding: 10,
        fontFamily: M.display, fontWeight: 700, fontSize: 13.5, color: "#5c7a0a", marginBottom: 6,
      }}>{loading ? "Building a fresh plan…" : "♻ Regenerate plan"}</div>
    </>
  );
}
