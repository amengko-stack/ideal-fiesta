import { useState } from "react";
import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { workloadTrendStatus } from "../lib/load.js";
import { nearestUpcoming, daysUntil, tournamentModeFor } from "../lib/tournaments.js";
import { toLocalDateStr } from "../lib/dates.js";
import { readWeeklyPlan, sessionProgress, OVER_TARGET_TENNIS_MESSAGE } from "../lib/weeklyPlanCore.js";
import { GROWTH_WATCH_MESSAGE } from "../lib/growth.js";

const MODES = [
  { k: "none",      label: "Normal week" },
  { k: "pre",       label: "Pre-tourney" },
  { k: "week_of",   label: "This week" },
  { k: "post_easy", label: "Post (easy)" },
  { k: "post_hard", label: "Post (heavy)" },
];
// tournamentModeFor → the tournament-select values ("normal" maps to "none")
const AUTO_MODE = { normal: "none", pre: "pre", week_of: "week_of" };

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: "16px 0 9px" };

// "3 × 8/side", "2 × 25 sec/side", "4 × 5 m"
const prescription = (ex) => {
  // Sprint entries carry the distance separately from the rep count (4 reps OF
  // 5 m, not 4 reps of 1), so the distance is what the chip has to show.
  const value = ex.unit === "m" && ex.distanceM != null ? ex.distanceM : (ex.repRange ?? ex.reps ?? "");
  const unit = ex.unit === "sec" ? " sec" : ex.unit === "m" ? " m" : "";
  const side = ex.perSide ? "/side" : "";
  return ex.sets != null ? `${ex.sets} × ${value}${unit}${side}` : `${value}${unit}${side}`;
};

const STATUS_TONE = { under: M.sub, within: M.success, over: M.streakOrange };

function TargetRow({ row }) {
  if (!row) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0" }}>
      <div style={{ flex: 1, fontSize: 12.5, color: M.ink }}>{row.label}</div>
      <div style={{ fontSize: 11.5, color: M.sub }}>target {row.targetLabel}</div>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: STATUS_TONE[row.status] || M.ink, minWidth: 58, textAlign: "right" }}>
        {row.actualLabel}
      </div>
    </div>
  );
}

// One S&C session — its own checklist, its own finish/log action, its own
// difficulty rating and its own logged flag. Completing Session A must never
// mark Session B done, which is why none of this state is shared.
function SessionCard({ session, onToggleExercise, onFinishSession }) {
  const [finishing, setFinishing] = useState(false);
  const [difficulty, setDifficulty] = useState(3);
  const [painNote, setPainNote] = useState("");

  const isRecovery = session.sessionType === "recovery" || (session.exercises || []).length === 0;
  const prog = sessionProgress(session);

  if (isRecovery) {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Session {session.id}</span>
          <span style={{ fontSize: 11.5, color: M.sub, fontWeight: 700 }}>{session.plannedDay || ""}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: M.sub, background: M.fillAlt, padding: "3px 8px", borderRadius: 20, textTransform: "uppercase" }}>
            {session.sessionType}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: M.sub, lineHeight: 1.5 }}>
          {session.omittedReason || "Recovery — no structured session scheduled this week."}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 16, color: M.ink }}>Session {session.id}</span>
        <span style={{ fontSize: 12, color: "#5c7a0a", fontWeight: 700 }}>{session.plannedDay || ""}</span>
        {session.sessionLogged && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: M.success }}>✓ logged</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: M.ink, fontWeight: 600, lineHeight: 1.35, marginBottom: 4 }}>{session.title}</div>
      <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 10 }}>
        {session.durationMin ? `${session.durationMin} min · ` : ""}{(session.exercises || []).length} exercises
        {session.plyoContacts ? ` · ${session.plyoContacts} landing contacts` : ""}
      </div>
      {session.coachFocus && (
        <div style={{ fontSize: 12, color: "#5c7a0a", fontWeight: 600, lineHeight: 1.45, marginBottom: 10 }}>→ {session.coachFocus}</div>
      )}

      <div style={{ height: 9, borderRadius: 99, background: M.fillDim, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 99, background: M.gradient, transition: "width .3s" }} />
      </div>

      {(session.exercises || []).map(ex => {
        const done = !!session.doneMap?.[ex.id];
        return (
          <div key={ex.id} onClick={() => onToggleExercise(session.id, ex.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", cursor: "pointer" }}>
            <div style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: 8, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 14, fontWeight: 700, color: M.deepGreen,
              background: done ? M.gradient : M.fillDim, border: done ? "none" : "2px solid #D6E2DB", transition: "all .12s",
            }}>{done ? "✓" : ""}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13.5, color: done ? M.muted : M.ink, textDecoration: done ? "line-through" : "none" }}>
                {ex.name}
              </div>
              {(ex.note || ex.cue) && (
                <div style={{ fontSize: 10.5, color: "#5c7a0a", fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>→ {ex.note || ex.cue}</div>
              )}
              {ex.loadNote && <div style={{ fontSize: 10.5, color: M.sub, marginTop: 1 }}>{ex.loadNote}</div>}
            </div>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: M.muted, flexShrink: 0, whiteSpace: "nowrap" }}>
              {prescription(ex)}
            </span>
          </div>
        );
      })}

      {prog.done > 0 && !session.sessionLogged && (
        !finishing ? (
          <div onClick={() => setFinishing(true)} style={{
            cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 14,
            padding: 13, textAlign: "center", fontFamily: M.display, fontWeight: 700,
            fontSize: 14.5, boxShadow: M.cta, marginTop: 12,
          }}>Finish &amp; log Session {session.id} 💪</div>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E7EFE9" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14.5, color: M.ink, marginBottom: 4 }}>How hard was Session {session.id}?</div>
            <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 10 }}>Aim is 6–7/10 — around 2–3 good reps left in the tank</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} onClick={() => setDifficulty(n)} style={{
                  cursor: "pointer", fontSize: 28, lineHeight: 1, transition: "transform .1s",
                  color: n <= difficulty ? M.streakOrange : "#D6E2DB", transform: n <= difficulty ? "scale(1.1)" : "none",
                }}>★</div>
              ))}
            </div>
            <div style={{ ...label, margin: "0 0 7px" }}>Any pain or discomfort? (optional)</div>
            <input
              type="text" value={painNote} onChange={e => setPainNote(e.target.value)}
              placeholder="e.g. right knee tight on landings"
              style={{
                width: "100%", boxSizing: "border-box", padding: "11px 13px", border: "1.5px solid #D6E2DB",
                borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
                fontSize: 13, color: M.ink, outline: "none", marginBottom: 14,
              }}
            />
            <div onClick={() => { onFinishSession(session.id, difficulty, painNote.trim()); setFinishing(false); }} style={{
              cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 14,
              padding: 13, textAlign: "center", fontFamily: M.display, fontWeight: 700,
              fontSize: 14.5, boxShadow: M.cta,
            }}>Log Session {session.id} ✓</div>
          </div>
        )
      )}
    </Card>
  );
}

export default function PlanScreen({ plan: rawPlan, tournaments, loading, error, onGenerate, onToggleExercise, onFinishSession, onRegenerate }) {
  const [override, setOverride] = useState(null);

  const today = toLocalDateStr(new Date());
  const nearest = nearestUpcoming(tournaments, today);
  const autoMode = AUTO_MODE[tournamentModeFor(nearest ? daysUntil(nearest.date, today) : null)];
  const mode = override ?? autoMode;
  const autoNote = nearest && AUTO_MODE[tournamentModeFor(daysUntil(nearest.date, today))] !== "none"
    ? `${nearest.name} in ${daysUntil(nearest.date, today)} day${daysUntil(nearest.date, today) === 1 ? "" : "s"} — auto-set to "${MODES.find(m => m.k === autoMode)?.label}"`
    : null;

  if (!rawPlan) {
    return (
      <Card style={{ borderRadius: 24, padding: 20, boxShadow: M.dropLg }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: M.ink }}>Let&apos;s build this week&apos;s S&amp;C plan ⚡</div>
        <div style={{ fontSize: 13, color: M.sub, marginTop: 6, lineHeight: 1.45 }}>
          Two sessions — Monday and Thursday — tuned to training load, growth, how she feels and the latest match. Sunday stays a rest day.
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
        {error && !loading && (
          <div style={{
            padding: "11px 13px", background: "#FDECEC", border: `1px solid ${M.danger}33`,
            borderRadius: 12, marginTop: 6, marginBottom: 4,
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.danger, marginBottom: 4 }}>COULDN&apos;T BUILD THE PLAN</div>
            <div style={{ fontSize: 12.5, color: M.ink, lineHeight: 1.5 }}>{error}</div>
          </div>
        )}
        <div onClick={loading ? undefined : () => onGenerate(mode)} style={{
          cursor: loading ? "default" : "pointer", background: M.gradient, color: M.deepGreen,
          borderRadius: 16, padding: 16, textAlign: "center", fontFamily: M.display, fontWeight: 700,
          fontSize: 16, boxShadow: M.cta, opacity: loading ? 0.65 : 1, marginTop: 6,
        }}>{loading ? "Building the plan…" : "⚡ Generate this week's S&C plan"}</div>
      </Card>
    );
  }

  // Normalises both the weekly (schema v2) and the legacy single-session plan,
  // so a document written before the cutover renders instead of crashing.
  const plan = readWeeklyPlan(rawPlan);
  const sessions = plan.sessions || [];
  const scheduled = sessions.filter(s => s.sessionType !== "recovery" && (s.exercises || []).length > 0);
  const loggedCount = scheduled.filter(s => s.sessionLogged).length;
  const st = workloadTrendStatus(plan.metrics?.acwr ?? null);
  const targets = plan.loadContext?.targetComparison ?? null;

  return (
    <>
      {/* hero */}
      <div style={{
        background: M.gradient, borderRadius: 24, padding: 20, marginBottom: 14,
        boxShadow: `0 5px 0 ${M.brandShadow}`, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -14, top: -14, fontSize: 82, opacity: 0.18, transform: "rotate(-12deg)" }}>💪</div>
        <div style={{ fontSize: 12.5, color: "#0a3a2a", fontWeight: 700, position: "relative" }}>WEEKLY S&amp;C PLAN</div>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 24, color: M.deepGreen, lineHeight: 1.1, marginTop: 3, position: "relative" }}>
          {plan.block ? `Block ${plan.block.number} · week ${plan.block.week} of ${plan.block.lengthWeeks}` : "This week"}
        </div>
        <div style={{ fontSize: 13, color: "#0e4635", marginTop: 6, position: "relative" }}>
          {plan.block?.phase ? `${plan.block.phase} phase · ` : ""}{scheduled.length} session{scheduled.length === 1 ? "" : "s"} · {loggedCount} logged
        </div>
        {plan.weekKey && (
          <div style={{ fontSize: 11, color: "#0a3a2a", fontWeight: 700, marginTop: 7, position: "relative" }}>
            Week of {plan.weekKey}
          </div>
        )}
      </div>

      {/* growth watch */}
      {plan.growthContext?.growthWatch && (
        <Card style={{ background: "#FFF6E5", border: "1px solid #F0D49B" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", color: "#9A6B00", textTransform: "uppercase", marginBottom: 4 }}>Growth watch</div>
          <div style={{ fontSize: 12.5, color: M.ink, lineHeight: 1.5 }}>
            {GROWTH_WATCH_MESSAGE}
            {plan.growthContext.recentGrowthVelocityCmYr != null && (
              <> ({plan.growthContext.recentGrowthVelocityCmYr} cm/year over {plan.growthContext.intervalDays} days.)</>
            )}
          </div>
        </Card>
      )}

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
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.success, lineHeight: 1.1 }}>
            {plan.tournamentMode === "normal" ? "Normal" : plan.tournamentMode}
          </div>
          <div style={{ fontSize: 10, color: M.sub, fontWeight: 600 }}>week type</div>
        </Card>
      </div>

      {/* target vs actual */}
      {targets && (
        <Card>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 2 }}>Target vs actual</div>
          <div style={{ fontSize: 11.5, color: M.sub, marginBottom: 8, lineHeight: 1.45 }}>
            A development target for this phase — not a medical ceiling, and not a pass/fail line.
          </div>
          <TargetRow row={targets.tennis} />
          <TargetRow row={targets.strength} />
          <TargetRow row={targets.crossTraining} />
          <TargetRow row={targets.restDays} />
          {targets.tennisOverTargetMessage && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: M.fillAlt, borderRadius: 12, fontSize: 12, color: M.ink, lineHeight: 1.5 }}>
              {OVER_TARGET_TENNIS_MESSAGE}
            </div>
          )}
        </Card>
      )}

      {/* coach's briefing */}
      {(plan.briefing || plan.athleteNote) && (
        <Card style={{ background: M.darkCard, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🎬</span>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.lime }}>Coach&apos;s briefing</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.limeDim, background: "rgba(200,245,100,0.14)", padding: "3px 8px", borderRadius: 20 }}>AI</span>
          </div>
          {plan.briefing && <div style={{ fontSize: 13, color: "#dfeee6", lineHeight: 1.55 }}>{plan.briefing}</div>}
          {plan.athleteNote && (
            <div style={{ marginTop: 13, padding: "11px 13px", background: "rgba(217,248,106,0.12)", borderRadius: 12, fontSize: 12.5, color: "#eaf7c9", fontStyle: "italic", lineHeight: 1.5 }}>
              &quot;{plan.athleteNote}&quot;
            </div>
          )}
        </Card>
      )}

      {/* why this week */}
      {(plan.loadRationale || plan.growthRationale || plan.matchRationale || plan.techAssessmentRationale) && (
        <Card>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 12 }}>Why this week looks like this</div>
          {[
            ["Training load", plan.loadRationale],
            ["Growth", plan.growthRationale],
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

      {/* the two sessions — each completed and logged independently */}
      {sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          onToggleExercise={onToggleExercise}
          onFinishSession={onFinishSession}
        />
      ))}

      {/* Sunday */}
      <Card style={{ background: M.fillAlt }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Sunday</span>
          <span style={{ fontSize: 11.5, color: M.success, fontWeight: 700 }}>Recovery day 🌙</span>
        </div>
        <div style={{ fontSize: 12.5, color: M.sub, lineHeight: 1.5 }}>
          {plan.sunday?.note || "Complete structured-training rest day."}
        </div>
      </Card>

      <div onClick={loading ? undefined : onRegenerate} style={{
        cursor: loading ? "default" : "pointer", textAlign: "center", padding: 10,
        fontFamily: M.display, fontWeight: 700, fontSize: 13.5, color: "#5c7a0a", marginBottom: 6,
      }}>{loading ? "Building a fresh plan…" : "♻ Regenerate plan"}</div>
    </>
  );
}
