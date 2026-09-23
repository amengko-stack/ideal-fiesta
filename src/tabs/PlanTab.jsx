import { useState, useRef } from "react";
import {
  BarChart2, ClipboardCheck, FileText, MessageSquare, Zap,
} from "lucide-react";
import { getWeekBounds } from "../lib/dates.js";
import { calculateMetrics, loadTrend, workloadTrendLabel } from "../lib/load.js";
import { COLORS } from "../styles/theme.js";
import { TENNIS_GAPS } from "../lib/exerciseDb.js";
import { generateWeeklyStrengthPlan } from "../lib/planGen.js";
import { readWeeklyPlan, flattenPlanExercises } from "../lib/weeklyPlanCore.js";
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
      const { planData, escalations: escalatedItems } = await generateWeeklyStrengthPlan(athleteId, {
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
  // Normalises both the weekly (schema v2) and the legacy single-session plan,
  // so a document written before the cutover still renders here.
  const weeklyPlan = readWeeklyPlan(planResult);
  const planExercises = flattenPlanExercises(weeklyPlan);
  const scheduledSessions = (weeklyPlan?.sessions || []).filter(x => x.sessionType !== "recovery");
  const { start: _thisWeekStart } = getWeekBounds(0);
  const thisWeekLogs = weekLogs.filter(l => l.date >= _thisWeekStart);
  // THE MEDICALISED ZONE GAUGE IS GONE, AND MUST NOT COME BACK.
  //
  // This used to be a four-colour dial with fixed acute:chronic ratio zones
  // labelled from "too little" through to a red danger band. Those bands are
  // not a validated statement about an individual 12-year-old: they told a
  // parent their child was at risk, or — worse — that a quiet week meant she
  // should be training more.
  //
  // What replaces it is the same arithmetic described rather than graded: the
  // rolling 7-day total against the recent weekly baseline, with the neutral
  // neutral label from workloadTrendLabel. One colour, no zones, no verdict.
  const trend = loadTrend(weekLogs);
  const trendLabel = workloadTrendLabel(metrics.acwr);
  const pctFromBaseline = trend.pctFromBaseline;
  // A single bar showing where the last 7 days sit against the baseline. The
  // baseline is the midpoint, so the bar reads "more than usual" or "less than
  // usual" and nothing else.
  const barPct = pctFromBaseline == null
    ? 50
    : Math.max(2, Math.min(98, 50 + pctFromBaseline / 4));

  // Wellbeing colour coding
  const sleepColor  = !metrics.avgSleep  ? COLORS.muted : parseFloat(metrics.avgSleep)  >= 8 ? COLORS.accent  : parseFloat(metrics.avgSleep)  >= 6 ? COLORS.yellow : COLORS.red;
  const moodColor   = !metrics.avgMood   ? COLORS.muted : parseFloat(metrics.avgMood)   >= 4 ? COLORS.accent  : parseFloat(metrics.avgMood)   >= 3 ? COLORS.yellow : COLORS.red;
  const sorenessColor = !metrics.avgSoreness ? COLORS.muted : parseFloat(metrics.avgSoreness) <= 2 ? COLORS.accent : parseFloat(metrics.avgSoreness) <= 3 ? COLORS.yellow : COLORS.red;

  return (
    <div>
      <div className="card">
        <div className="card-title"><BarChart2 size={18} /> Training Load Analysis</div>

        {/* Recent load trend — descriptive, not graded */}
        <div style={{ background: COLORS.surface, borderRadius: 12, padding: "16px 14px 12px", marginBottom: 14 }}>
          <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Recent load trend</div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: COLORS.text, lineHeight: 1 }}>
              {pctFromBaseline == null ? "—" : `${pctFromBaseline > 0 ? "+" : ""}${pctFromBaseline}%`}
            </div>
            <div style={{ fontSize: "0.82rem", color: COLORS.muted }}>
              {pctFromBaseline == null
                ? "not enough history to compare yet"
                : `vs the recent 4-week weekly baseline of ${trend.baselineWeeklySRPE} sRPE`}
            </div>
          </div>

          <div style={{ height: 8, borderRadius: 99, background: COLORS.border, position: "relative", marginBottom: 8 }}>
            <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 1, background: COLORS.muted, opacity: 0.6 }} />
            <div style={{
              position: "absolute", top: 0, bottom: 0, borderRadius: 99, background: COLORS.accent,
              left: `${Math.min(50, barPct)}%`, width: `${Math.abs(barPct - 50)}%`,
            }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: COLORS.muted, marginBottom: 10 }}>
            <span>lower than baseline</span>
            <span>baseline</span>
            <span>higher than baseline</span>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge" style={{ background: `${COLORS.muted}22`, color: COLORS.text, fontSize: "0.78rem", display: "inline-flex" }}>{trendLabel}</span>
            <span style={{ fontSize: "0.72rem", color: COLORS.muted }}>
              last 7 days {trend.last7DaySRPE} sRPE · workload ratio {metrics.acwr ?? "—"}
            </span>
          </div>

          <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 10, lineHeight: 1.55 }}>
            This describes how the last week compares with the recent ones. It is not a risk score:
            a higher figure is a prompt to review progression and recovery, and a lower one is never a reason to add training.
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
        <div className="card-title"><Zap size={18} /> Generate weekly S&amp;C plan</div>
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
            <div className="label">Session time</div>
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
            ⚡ Generate this week's S&C plan
          </button>
        </div>
      </div>

      {aiLoading && (
        <div className="card" style={{ borderColor: COLORS.accentDim }}>
          <div className="flex" style={{ gap: 10 }}>
            <div className="spinner" />
            <span style={{ color: COLORS.muted, fontSize: "0.85rem" }}>AI coach is tuning this week's framework…</span>
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
                  // Neutral description, one colour: the label says what
                  // changed, it does not grade it.
                  sub: workloadTrendLabel(planResult.metrics?.acwr ?? null),
                  color: COLORS.text,
                },
                {
                  label: "Workload ratio",
                  value: planResult.metrics?.acwr != null ? planResult.metrics.acwr.toFixed(2) : "—",
                  sub: "this week vs recent average",
                  color: COLORS.text,
                },
                {
                  label: "Week",
                  value: weeklyPlan?.block?.week ? `Block wk ${weeklyPlan.block.week}` : "—",
                  sub: scheduledSessions.map(x => `${x.id} ${x.plannedDay || ""}`.trim()).join(" · ") || "",
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
            <div className="card-title"><ClipboardCheck size={18} /> This week&apos;s S&amp;C — {planExercises.length} Exercises</div>
            {planExercises.map((ex, i) => {
              const isTime = ex.unit === "seconds";
              return (
                <div key={i} className="ex-row">
                  <div className="ex-num">{String(i + 1).padStart(2, "0")}</div>
                  <div style={{ flex: 1 }}>
                    <div className="ex-name">{ex.name}</div>
                    <div className="ex-meta">
                      {ex.sessionId && <span className="badge badge-gray">Session {ex.sessionId}{ex.plannedDay ? ` · ${ex.plannedDay}` : ""}</span>}
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
