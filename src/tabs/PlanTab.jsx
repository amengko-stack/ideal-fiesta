import { useState, useRef } from "react";
import {
  BarChart2, ClipboardCheck, FileText, MessageSquare, Zap,
} from "lucide-react";
import { getWeekBounds } from "../lib/dates.js";
import { calculateMetrics } from "../lib/load.js";
import { COLORS } from "../styles/theme.js";
import { TENNIS_GAPS } from "../lib/exerciseDb.js";
import { generateSundayPlan } from "../lib/planGen.js";
import { friendlyAiError } from "../lib/aiErrors.js";

// ─── PLAN TAB ─────────────────────────────────────────────────────────────────
export default function PlanTab({ athleteId, profile, weekLogs, sessionHistory, wellbeing, aiLoading, setAiLoading, planResult, setPlanResult }) {
  const [tournament, setTournament] = useState("none");
  const [sessionTime, setSessionTime] = useState("10:00");
  const [aiError, setAiError] = useState("");
  const [escalations, setEscalations] = useState([]);
  const isGenerating = useRef(false);

  const gaps = profile?.gaps || [];

  const handleGenerate = async () => {
    if (isGenerating.current) return;
    isGenerating.current = true;
    setAiLoading(true);
    setAiError("");
    setPlanResult(null);
    setEscalations([]);

    try {
      const { planData, escalations: escalatedItems } = await generateSundayPlan(athleteId, {
        profile, weekLogs, sessionHistory, wellbeing, tournament, sessionTime,
      });
      setPlanResult(planData);
      setEscalations(escalatedItems);
    } catch (e) {
      console.error("Plan generation error:", e);
      setAiError(`Could not generate plan — ${friendlyAiError(e)}`);
    } finally {
      isGenerating.current = false;
      setAiLoading(false);
    }
  };

  const metrics = calculateMetrics(weekLogs, wellbeing);
  const { start: _thisWeekStart } = getWeekBounds(0);
  const thisWeekLogs = weekLogs.filter(l => l.date >= _thisWeekStart);
  const acwrColor = metrics.acwr === null ? COLORS.muted
    : metrics.acwr > 1.5 ? COLORS.red
    : metrics.acwr > 1.3 ? COLORS.yellow
    : metrics.acwr < 0.8 ? "#6eb5ff"
    : COLORS.accent;
  const acwrLabel = metrics.acwr === null ? "No data yet"
    : metrics.acwr > 1.5 ? "Danger zone"
    : metrics.acwr > 1.3 ? "Caution"
    : metrics.acwr < 0.8 ? "Underloaded"
    : "Optimal";

  // ACWR gauge: maps 0–2+ range onto a 180° arc
  const acwrGauge = (() => {
    const pct = metrics.acwr === null ? 0 : Math.min(metrics.acwr / 2, 1);
    const angle = pct * 180 - 90; // -90° (left) to +90° (right)
    const r = 52;
    const cx = 70; const cy = 62;
    const toXY = (deg) => ({
      x: cx + r * Math.cos((deg - 90) * Math.PI / 180),
      y: cy + r * Math.sin((deg - 90) * Math.PI / 180),
    });
    // Arc segments: underload (blue) 0–72°, optimal (green) 72–117°, caution (yellow) 117–144°, danger (red) 144–180°
    const segments = [
      { from: 0,   to: 72,  color: "#6eb5ff" },
      { from: 72,  to: 117, color: COLORS.accent },
      { from: 117, to: 144, color: COLORS.yellow },
      { from: 144, to: 180, color: COLORS.red },
    ];
    const arcPath = (fromDeg, toDeg, color) => {
      const start = toXY(fromDeg); const end = toXY(toDeg);
      const large = toDeg - fromDeg > 180 ? 1 : 0;
      return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
    };
    const needle = toXY(metrics.acwr === null ? 0 : Math.min(metrics.acwr / 2, 1) * 180);
    return { segments, arcPath, needle, cx, cy };
  })();

  // Wellbeing colour coding
  const sleepColor  = !metrics.avgSleep  ? COLORS.muted : parseFloat(metrics.avgSleep)  >= 8 ? COLORS.accent  : parseFloat(metrics.avgSleep)  >= 6 ? COLORS.yellow : COLORS.red;
  const moodColor   = !metrics.avgMood   ? COLORS.muted : parseFloat(metrics.avgMood)   >= 4 ? COLORS.accent  : parseFloat(metrics.avgMood)   >= 3 ? COLORS.yellow : COLORS.red;
  const sorenessColor = !metrics.avgSoreness ? COLORS.muted : parseFloat(metrics.avgSoreness) <= 2 ? COLORS.accent : parseFloat(metrics.avgSoreness) <= 3 ? COLORS.yellow : COLORS.red;

  return (
    <div>
      <div className="card">
        <div className="card-title"><BarChart2 size={18} /> Training Load Analysis</div>

        {/* ACWR gauge — hero element */}
        <div style={{ background: COLORS.surface, borderRadius: 12, padding: "16px 14px 10px", marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Acute : Chronic Workload Ratio</div>
          <svg width="140" height="72" viewBox="0 0 140 72" style={{ overflow: "visible" }}>
            {acwrGauge.segments.map((s, i) => (
              <path key={i} d={acwrGauge.arcPath(s.from, s.to, s.color)}
                stroke={s.color} strokeWidth="10" fill="none" strokeLinecap="butt" opacity="0.35" />
            ))}
            {metrics.acwr !== null && (
              <path d={acwrGauge.arcPath(0, Math.min(metrics.acwr / 2, 1) * 180, acwrColor)}
                stroke={acwrColor} strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.9" />
            )}
            {/* Needle */}
            <line
              x1={acwrGauge.cx} y1={acwrGauge.cy}
              x2={acwrGauge.needle.x} y2={acwrGauge.needle.y}
              stroke={acwrColor} strokeWidth="2.5" strokeLinecap="round"
            />
            <circle cx={acwrGauge.cx} cy={acwrGauge.cy} r="4" fill={acwrColor} />
          </svg>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: acwrColor, lineHeight: 1, marginTop: -4 }}>
            {metrics.acwr !== null ? metrics.acwr : "—"}
          </div>
          <span className="badge" style={{ background: `${acwrColor}22`, color: acwrColor, fontSize: "0.78rem", marginTop: 6, display: "inline-flex" }}>{acwrLabel}</span>
          <div style={{ fontSize: "0.66rem", color: COLORS.muted, marginTop: 8 }}>
            <span style={{ color: "#6eb5ff" }}>■</span> Underload &lt;0.8 &nbsp;
            <span style={{ color: COLORS.accent }}>■</span> Optimal 0.8–1.3 &nbsp;
            <span style={{ color: COLORS.yellow }}>■</span> Caution &gt;1.3 &nbsp;
            <span style={{ color: COLORS.red }}>■</span> Danger &gt;1.5
          </div>
        </div>

        {/* sRPE — this week prominent, 4-week avg secondary */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: `${COLORS.accent}14`, border: `1px solid ${COLORS.accentDim}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: "0.68rem", color: COLORS.accentDim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>This week sRPE</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.accent, lineHeight: 1 }}>{metrics.thisWeekSRPE}</div>
            <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 4 }}>{thisWeekLogs.length} session{thisWeekLogs.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ background: COLORS.surface, borderRadius: 10, padding: "14px 12px" }}>
            <div style={{ fontSize: "0.68rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>4-wk avg</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.muted, lineHeight: 1 }}>{metrics.fourWeekAvg || "—"}</div>
            <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 4 }}>sRPE / wk</div>
          </div>
        </div>

        {/* Wellbeing — colour coded */}
        {(metrics.avgSleep || metrics.avgMood || metrics.avgSoreness) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Sleep",    value: metrics.avgSleep    ? `${metrics.avgSleep}h`   : "—", icon: "🌙", color: sleepColor,    hint: metrics.avgSleep ? (parseFloat(metrics.avgSleep) >= 8 ? "Good" : parseFloat(metrics.avgSleep) >= 6 ? "Low" : "Poor") : "" },
              { label: "Mood",     value: metrics.avgMood     ? `${metrics.avgMood}/5`   : "—", icon: "😊", color: moodColor,     hint: metrics.avgMood ? (parseFloat(metrics.avgMood) >= 4 ? "Good" : parseFloat(metrics.avgMood) >= 3 ? "OK" : "Low") : "" },
              { label: "Soreness", value: metrics.avgSoreness ? `${metrics.avgSoreness}/5` : "—", icon: "💪", color: sorenessColor, hint: metrics.avgSoreness ? (parseFloat(metrics.avgSoreness) <= 2 ? "Low" : parseFloat(metrics.avgSoreness) <= 3 ? "Mod" : "High") : "" },
            ].map(s => (
              <div key={s.label} style={{
                background: `${s.color}12`, border: `1px solid ${s.color}33`,
                borderRadius: 8, padding: "10px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: "1rem", marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "0.6rem", color: s.color, opacity: 0.8, marginTop: 1 }}>{s.hint}</div>
                <div style={{ fontSize: "0.6rem", color: COLORS.muted, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 10 }}>
          {metrics.wellbeingDays} days of wellbeing data (7-day avg)
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Zap size={18} /> Generate Sunday Plan</div>
        <div className="grid2">
          <div>
            <div className="label">Tournament Status</div>
            <select name="tournament" value={tournament} onChange={e => setTournament(e.target.value)}>
              <option value="none">Normal week</option>
              <option value="pre">Pre-tournament (next 7 days)</option>
              <option value="week_of">Tournament this week</option>
              <option value="post_easy">Post-tournament (easy)</option>
              <option value="post_hard">Post-tournament (heavy)</option>
            </select>
          </div>
          <div>
            <div className="label">Session Time (Sunday)</div>
            <input name="sessionTime" type="time" value={sessionTime} onChange={e => setSessionTime(e.target.value)} />
          </div>
        </div>
        <div className="mt16">
          <div className="label">Tennis Gaps Targeted (from profile)</div>
          {gaps.length === 0
            ? <div style={{ color: COLORS.muted, fontSize: "0.85rem" }}>No gaps set — go to Profile tab to add tennis weaknesses</div>
            : <div className="gap-checkbox" style={{ marginTop: 8 }}>
                {gaps.map(g => {
                  const gd = TENNIS_GAPS.find(x => x.id === g);
                  return <span key={g} className="badge badge-green">{gd?.label || g}</span>;
                })}
              </div>
          }
        </div>
        <div className="mt16">
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={aiLoading}
            style={{ width: "100%", justifyContent: "center", padding: "13px" }}
          >
            ⚡ Generate This Sunday's Plan
          </button>
        </div>
      </div>

      {aiLoading && (
        <div className="card" style={{ borderColor: COLORS.accentDim }}>
          <div className="flex" style={{ gap: 10 }}>
            <div className="spinner" />
            <span style={{ color: COLORS.muted, fontSize: "0.85rem" }}>AI coach is designing your session…</span>
          </div>
        </div>
      )}

      {aiError && <div className="note-box warn">{aiError}</div>}

      {escalations.length > 0 && (
        <div className="card" style={{ borderColor: COLORS.red, background: `${COLORS.red}10` }}>
          <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.9rem", marginBottom: 8 }}>⚠ Escalated Priorities</div>
          {escalations.map((e, i) => (
            <div key={i} style={{ fontSize: "0.83rem", color: COLORS.text, marginBottom: 4 }}>
              <strong>{e.priority}</strong> — deferred {e.weeksDeferredCount} weeks
            </div>
          ))}
        </div>
      )}

      {planResult && (
        <>
          {/* ── Context Summary Card ── */}
          <div className="card" style={{ borderColor: COLORS.accentDim, background: `${COLORS.accent}06` }}>
            <div className="card-title"><BarChart2 size={16} /> Session Context</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: planResult.loadRationale ? 14 : 0 }}>
              {[
                {
                  label: "Load",
                  value: `${planResult.metrics?.thisWeekSRPE ?? "—"} sRPE`,
                  sub: planResult.metrics?.acwr != null
                    ? (planResult.metrics.acwr > 1.5 ? "Very High" : planResult.metrics.acwr > 1.3 ? "High" : planResult.metrics.acwr < 0.8 ? "Low" : "Optimal")
                    : "No data",
                  color: planResult.metrics?.acwr == null ? COLORS.muted
                    : planResult.metrics.acwr > 1.5 ? COLORS.red
                    : planResult.metrics.acwr > 1.3 ? COLORS.yellow
                    : planResult.metrics.acwr < 0.8 ? "#6eb5ff"
                    : COLORS.accent,
                },
                {
                  label: "ACWR",
                  value: planResult.metrics?.acwr != null ? planResult.metrics.acwr.toFixed(2) : "—",
                  sub: "acute:chronic",
                  color: COLORS.text,
                },
                {
                  label: "Session",
                  value: planResult.sessionType ?? "—",
                  sub: planResult.sessionDuration ? `${planResult.sessionDuration} min` : "",
                  color: COLORS.accent,
                },
                {
                  label: "Tournament",
                  value: tournament === "none" ? "Normal week" : tournament.replace(/_/g, " "),
                  sub: "",
                  color: tournament !== "none" ? COLORS.yellow : COLORS.muted,
                },
              ].map(s => (
                <div key={s.label} style={{ background: COLORS.surface, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: "0.62rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: s.color, marginTop: 2 }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 1 }}>{s.sub}</div>}
                </div>
              ))}
            </div>
            {planResult.matchInformedBy && (
              <div style={{ fontSize: "0.78rem", color: COLORS.accentDim, marginBottom: planResult.loadRationale ? 10 : 0 }}>
                ✦ Informed by match vs {planResult.matchInformedBy.opponentName || "opponent"}{planResult.matchInformedBy.matchStartTime ? ` on ${new Date(planResult.matchInformedBy.matchStartTime).toLocaleDateString()}` : ""}
              </div>
            )}
            {planResult.loadRationale && (
              <p style={{ fontSize: "0.82rem", color: COLORS.muted, lineHeight: 1.5, margin: "6px 0 0" }}>{planResult.loadRationale}</p>
            )}
            {planResult.matchRationale && (
              <p style={{ fontSize: "0.82rem", color: COLORS.muted, lineHeight: 1.5, margin: "6px 0 0" }}>{planResult.matchRationale}</p>
            )}
          </div>

          {planResult.techAssessmentRationale && (
            <div className="card" style={{ borderColor: "#7c3aed" }}>
              <div className="card-title" style={{ color: "#7c3aed" }}><FileText size={18} /> Technical Focus</div>
              <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: COLORS.text }}>{planResult.techAssessmentRationale}</p>
            </div>
          )}

          <div className="card" style={{ borderColor: COLORS.accentDim }}>
            <div className="card-title"><MessageSquare size={18} /> Coach's Briefing</div>
            <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: COLORS.text }}>{planResult.briefing}</p>
            {planResult.athleteNote && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: `${COLORS.accent}10`, borderRadius: 8, fontSize: "0.84rem", color: COLORS.accent, fontStyle: "italic" }}>
                "{planResult.athleteNote}"
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><ClipboardCheck size={18} /> Today's Session — {planResult.plan.length} Exercises</div>
            {planResult.plan.map((ex, i) => {
              const isTime = ex.unit === "seconds";
              return (
                <div key={i} className="ex-row">
                  <div className="ex-num">{String(i + 1).padStart(2, "0")}</div>
                  <div style={{ flex: 1 }}>
                    <div className="ex-name">{ex.name}</div>
                    <div className="ex-meta">
                      <span className="badge badge-gray">{ex.category}</span>
                    </div>
                    {ex.note && <div className="ex-note mt8">→ {ex.note}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="ex-prescription">{ex.sets}×{ex.reps}{isTime ? "s" : ""}</div>
                    <div style={{ fontSize: "0.7rem", color: COLORS.muted }}>sets × {isTime ? "sec" : ex.unit || "reps"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
