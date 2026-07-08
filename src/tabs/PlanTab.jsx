import { useState, useRef } from "react";
import {
  BarChart2, ClipboardCheck, FileText, MessageSquare, Zap,
} from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { buildAthleteContext } from "../lib/athleteContext.js";
import { saveDeferredPriorities, refreshEscalations, resolveDeferred } from "../lib/deferredPriorities.js";
import { getWeekBounds } from "../lib/dates.js";
import { calculateMetrics, getACWRContext } from "../lib/load.js";
import { COLORS } from "../styles/theme.js";
import { EXERCISE_DB, TENNIS_GAPS } from "../lib/exerciseDb.js";
import { callClaudeJSON } from "../lib/ai.js";

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

    // Fetch unified context (includes match analysis + deferred priorities)
    const ctx = athleteId ? await buildAthleteContext(athleteId).catch(() => null) : null;

    const metrics   = calculateMetrics(weekLogs, wellbeing);
    const loadNotes = getACWRContext(metrics.acwr, tournament, sessionTime);

    const { start: thisWeekStart } = getWeekBounds(0);
    const thisWeekLogs = weekLogs.filter(l => l.date >= thisWeekStart);
    const typeLabel = { tennis: "Tennis", cheer: "Cheerleading", other: "Other sport" };
    const weekActivity = thisWeekLogs.length === 0
      ? "No activity sessions logged this week."
      : [...thisWeekLogs]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(l => {
            const rpe = l.rpe ?? (l.intensity ? l.intensity * 2 : "?");
            return `  - ${l.date} ${l.time}: ${typeLabel[l.type] || l.type}${l.sportName ? ` (${l.sportName})` : ""} — ${l.duration} min, RPE ${rpe}/10${l.focus ? ", focus: " + l.focus : ""}${l.type === "other" ? " [0.6× load multiplier]" : ""}`;
          })
          .join("\n");

    const recentSessions = [...(sessionHistory || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6)
      .map(s => ({
        date: s.date,
        exercises: (s.exercises || []).map(e => ({
          name: e.name, sets: e.sets, reps: e.reps,
          weight: e.weight || null, difficulty: e.difficulty, completed: e.completed,
        }))
      }));

    const familiarExercises = EXERCISE_DB.map(e => e.name).join(", ");
    const gapLabels = gaps.map(g => TENNIS_GAPS.find(x => x.id === g)?.label || g);

    const moodLabel     = ["","Rough","Meh","OK","Good","Great"];
    const sorenessLabel = ["","None","Mild","Moderate","Sore","Very sore"];
    const energyLabel   = ["","Empty","Low","OK","Good","Great"];
    const recentWellbeing = [...(wellbeing || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
    const wellbeingText = recentWellbeing.length === 0
      ? "No wellbeing check-ins logged yet."
      : recentWellbeing.map(w => {
          const parts = [];
          const label = w.type === "night" ? "🌙 Tonight" : w.type === "morning" ? "☀️ Morning" : "Check-in";
          if (w.sleep)    parts.push(`Sleep ${w.sleep}h`);
          if (w.energy)   parts.push(`Energy ${w.energy}/5 (${energyLabel[w.energy]})`);
          if (w.mood)     parts.push(`Mood ${w.mood}/5 (${moodLabel[w.mood]})`);
          if (w.soreness) parts.push(`Soreness ${w.soreness}/5 (${sorenessLabel[w.soreness]})`);
          if (w.notes)    parts.push(`Note: "${w.notes}"`);
          return `  - ${w.date} [${label}]: ${parts.join(" · ")}`;
        }).join("\n");

    const measurementText = (() => {
      const hist = profile?.measurements || [];
      if (hist.length === 0) return "Not yet recorded.";
      return hist.slice(0, 2).map(m =>
        `  ${m.date}: ${m.weight ? m.weight + " kg" : ""}${m.weight && m.height ? " · " : ""}${m.height ? m.height + " cm" : ""}`
      ).join("\n");
    })();

    const prompt = `You are an expert youth sports conditioning coach specialising in adolescent female multi-sport athletes. Design a complete Sunday strength training session for this athlete.

═══════════════════════════════════════════
ATHLETE PROFILE
═══════════════════════════════════════════
- Name: ${profile?.name || "Athlete"}
- Age: 12 · Female · Growth phase (growth plates NOT yet fused)
- Primary sport: Tennis | Secondary sport: Cheerleading
- Training age: youth athlete, still developing fundamental movement patterns
- Tennis areas to develop: ${gapLabels.join(", ") || "general athletic development"}

PHYSICAL MEASUREMENTS (last 2 recorded):
${measurementText}
Note: Use for loading context only. Do NOT comment on body composition.

COACH / PARENT NOTES:
${profile?.coachNotes?.trim() || "None"}
⚠ Treat any mentioned injuries or pain areas as HARD restrictions — do not include exercises that stress those areas.

═══════════════════════════════════════════
AGE & DEVELOPMENT RULES — APPLY TO EVERY SESSION
═══════════════════════════════════════════
- Growth plates are open: NO heavy axial loading (no barbell squats/deadlifts, no heavy overhead pressing)
- Equipment allowed: bodyweight, light dumbbells, resistance bands, medicine ball, kettlebell ONLY
- Prioritise movement quality and body control over load — technique always beats weight
- Plyometrics are appropriate but capped: max 2 plyometric exercises per session
- This is a critical motor-pattern window; every session should reinforce correct mechanics

FEMALE ATHLETE MANDATORY INCLUSIONS:
- ACL injury risk is significantly elevated in 12-year-old female athletes (growth, hormones, biomechanics)
- EVERY session must include at least one landing-mechanics or single-leg stability exercise
- Emphasise hip abductors and glute strength — weakness here is the #1 predictor of knee injury in female athletes
- Watch for and cue against valgus collapse (knees caving in) on all landings and single-leg work
- Shoulder health: monitor for impingement patterns given overhead cheerleading demands

MULTI-SPORT ATHLETE CONTEXT:
- She trains more total hours than single-sport peers her age — cumulative fatigue is a real risk
- Tennis + cheerleading together create high rotational, overhead, and lower-limb demands
- Overuse injury risk is elevated: do NOT add volume just because ACWR looks low; quality > quantity
- Sunday strength session must complement the week, not compete with it

CHEERLEADING-SPECIFIC DEMANDS (factor into exercise selection):
- Stunting: requires full-body tension, core stability, wrist and shoulder strength (basing or flying)
- Tumbling (back handsprings, round-offs): explosive hip extension, shoulder stability, wrist loading
- Basing: high ground-reaction forces through wrists — include wrist mobility/prehab when cheer was heavy
- Cheerleading overlaps with tennis on: rotational power, core anti-rotation, shoulder health, landing mechanics

═══════════════════════════════════════════
THIS WEEK'S ACTIVITY (Mon–Sat logged sessions)
═══════════════════════════════════════════
${weekActivity}

═══════════════════════════════════════════
TRAINING LOAD ANALYSIS
═══════════════════════════════════════════
sRPE = RPE × duration in minutes | Other sports weighted 0.6×

- This week sRPE: ${metrics.thisWeekSRPE}
- Weekly sRPE last 4 weeks (oldest → newest): ${[...metrics.weekSRPEs].reverse().join(" → ")}
- 4-week average sRPE: ${metrics.fourWeekAvg}
- Acute:Chronic Workload Ratio (ACWR): ${metrics.acwr !== null ? metrics.acwr : "insufficient data — less than 4 weeks of history"}
  Optimal 0.8–1.3 | Caution >1.3 | Danger >1.5 | Underload <0.8

7-DAY WELLBEING AVERAGES (${metrics.wellbeingDays} days logged):
- Average sleep: ${metrics.avgSleep !== null ? metrics.avgSleep + "h" : "no data"}
- Average mood: ${metrics.avgMood !== null ? metrics.avgMood + "/5" : "no data"}
- Average soreness: ${metrics.avgSoreness !== null ? metrics.avgSoreness + "/5" : "no data"}

SESSION CONTEXT:
- Tournament status: ${tournament === "none" ? "Normal week" : tournament}
- Session time today: ${sessionTime}
- Load guidance: ${loadNotes.join(" | ")}

═══════════════════════════════════════════
ATHLETE WELLBEING (last ${recentWellbeing.length} check-ins, most recent first)
═══════════════════════════════════════════
${wellbeingText}

Wellbeing rules:
- Soreness 3+: reduce impact and plyometrics, prioritise mobility and recovery
- Sleep under 7h: avoid max-effort work, keep intensity moderate
- Energy 1–2 (night before): scale back volume
- Mood 1–2: keep session positive and light, no new hard exercises
- Any noted pain or tightness: avoid exercises that load that area

═══════════════════════════════════════════
PAST STRENGTH TRAINING HISTORY (last ${recentSessions.length} sessions)
═══════════════════════════════════════════
${recentSessions.length === 0
  ? "No strength history yet — this is the first session. Start conservative, focus on form."
  : recentSessions.map(s =>
      `${s.date}:\n${s.exercises.map(e =>
        `  - ${e.name}: ${e.sets}×${e.reps}${e.weight ? " @ " + e.weight : ""} | difficulty ${e.difficulty}/5 | ${e.completed ? "completed" : "did NOT complete"}`
      ).join("\n")}`
    ).join("\n\n")}

FAMILIAR EXERCISES (athlete knows these — use as base, not a ceiling):
${familiarExercises}

═══════════════════════════════════════════
RECENT MATCH FINDINGS
═══════════════════════════════════════════
${(() => {
      const rm = ctx?.recentMatch;
      const ma = ctx?.matchAnalysis;
      if (!rm || !ma) return "No recent match within the last 14 days.";
      const matchDate = rm.matchStartTime ? new Date(rm.matchStartTime).toLocaleDateString() : "unknown date";
      const findingsText = (ma.criticalFindings || []).length > 0
        ? ma.criticalFindings.map(f => `  - [${f.priority}] ${f.finding}`).join("\n")
        : "  None recorded.";
      const matchDeferredText = (ma.deferredPriorities || []).length > 0
        ? ma.deferredPriorities.map(d => `  - ${d.priority}${d.resolveCondition ? ` — resolve when: ${d.resolveCondition}` : ""}`).join("\n")
        : "  None.";
      return `Match vs ${rm.opponentName || "Unknown"} on ${matchDate} (${rm.whoWonMatch === 1 ? "WIN" : "LOSS"}):
Critical findings:
${findingsText}
Deferred from match analysis:
${matchDeferredText}`;
    })()}

═══════════════════════════════════════════
ACTIVE DEFERRED PRIORITIES (all previous weeks)
═══════════════════════════════════════════
${(ctx?.deferredPriorities || []).length > 0
      ? (ctx.deferredPriorities).map(d => `  - ${d.priority} (deferred ${d.weeksDeferredCount} wk${d.weeksDeferredCount !== 1 ? "s" : ""})${d.resolveCondition ? ` — resolve when: ${d.resolveCondition}` : ""}`).join("\n")
      : "  None."}

═══════════════════════════════════════════
RECENT TECHNICAL ASSESSMENTS (High priority only)
═══════════════════════════════════════════
${(ctx?.technicalAssessments || []).length > 0
      ? ctx.technicalAssessments.map(a =>
          `- ${a.strokeArea} (${a.category}) — assessed ${a.date} via ${a.source}:\n  ${a.assessment}`
        ).join('\n\n')
      : 'None recorded.'}

INSTRUCTION: Use the technical assessments above to inform exercise selection. Map each assessment to the most relevant physical training component:
- Kinetic chain issues → rotational power, hip hinge, med ball rotational throws
- Drive consistency → core stability, lateral movement, deceleration
- Serve mechanics → shoulder stability, overhead pressing, trunk rotation
- Movement/footwork → agility, plyometrics, lateral hops
If a technical assessment conflicts with load constraints, acknowledge it and defer the physical component — do not ignore it entirely.

═══════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════
Design the best possible Sunday session using ALL context above:
- Heavy tennis/cheer week → reduce strength volume to prevent overtraining
- Light week → can handle more volume and harder progressions
- Progress exercises from history: easy last time → increase; hard → hold or reduce
- Prioritise exercises that address critical match findings and longest-deferred priorities
- Always include ACL-risk mitigation (hip/glute work + landing mechanics)
- You may introduce new exercises beyond the familiar list when appropriate

SESSION STRUCTURE:
- Order: Warmup → Mobility → Plyometrics → Power → Strength → Core → Agility → Conditioning → Recovery
- Total exercises: 8–12 | At least 2 warmup/mobility to open
- Tournament week: max 6 exercises, activation only, nothing that causes soreness next day

Respond with ONLY valid JSON, no other text:
{
  "sessionType": "full | reduced | activation | recovery",
  "sessionDuration": 60,
  "loadRationale": "2-3 sentences on how this week's load shaped the prescription",
  "matchRationale": "2-3 sentences on which match findings are addressed today and which are deferred — or null if no recent match",
  "techAssessmentRationale": "1-2 sentences on which technical assessments influenced today's exercise selection and how — or null if none recorded",
  "overallRationale": "one paragraph integrating load + match + tournament into a coherent session explanation",
  "exercises": [
    {
      "name": "Exercise Name",
      "category": "Warmup|Mobility|Plyometrics|Power|Strength|Core|Agility|Conditioning|Recovery",
      "sets": 2,
      "reps": 10,
      "restSeconds": 60,
      "progressionNote": "what changed from last session and why",
      "tennisConnection": "which match finding or tennis gap this addresses",
      "ageFlag": "safe | formCheck | advanced"
    }
  ],
  "deferredPriorities": [
    {
      "priority": "what was identified but not trained today",
      "reason": "why deferred",
      "resolveCondition": "condition for when to address"
    }
  ],
  "coachNote": "short paragraph for the parent — plain language, no jargon",
  "athleteNote": "one encouraging sentence written directly to Valissa"
}`;

    const systemPrompt =
`You are an elite junior tennis strength and conditioning coach for adolescent athletes. You make integrated decisions balancing training load, match findings, tournament proximity, and long-term athletic development.

PRIORITY HIERARCHY — apply strictly in this order:
1. Safety: if acute:chronic ratio > 1.3 OR average mood < 2 for 3+ consecutive days OR athlete within 48 hours post-tournament → prescribe recovery session only, override everything else
2. Tournament proximity: if tournament within 7 days → reduce all volume 35%, familiar exercises only, no new movements, keep agility and movement quality intact
3. Weekly load: if sRPE > 2000 → reduce weighted sets by 1, shorten session by 15 minutes. ALWAYS protect regardless of load: at least one agility movement, at least one plyometric, one core exercise — non-negotiable for age 12 athletic development window
4. Match findings: within constraints set by rules 1-3, prioritise exercises addressing critical findings and active deferred priorities — longest deferred first
5. Progression: apply progressive overload only if rules 1-4 leave room — never sacrifice recovery for progression

Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` anywhere in your response. Start your response with { and end with }.`;

    try {
      const parsed = await callClaudeJSON({ system: systemPrompt, userContent: prompt, maxTokens: 6000 });

      // Map new exercises schema → existing plan format so all display logic is unchanged
      const plan = (parsed.exercises || []).map(ex => ({
        ...ex,
        id:   ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        unit: "reps",
        note: [ex.progressionNote, ex.tennisConnection ? `Tennis: ${ex.tennisConnection}` : null]
          .filter(Boolean).join(" · "),
      }));

      const rm = ctx?.recentMatch;
      const planData = {
        plan,
        briefing:        parsed.overallRationale || parsed.coachNote || "",
        sessionType:     parsed.sessionType     ?? null,
        sessionDuration: parsed.sessionDuration ?? null,
        loadRationale:   parsed.loadRationale   ?? null,
        matchRationale:          parsed.matchRationale          ?? null,
        techAssessmentRationale: parsed.techAssessmentRationale ?? null,
        coachNote:       parsed.coachNote       ?? null,
        athleteNote:     parsed.athleteNote     ?? null,
        matchInformedBy: rm ? { opponentName: rm.opponentName, matchStartTime: rm.matchStartTime } : null,
        metrics,
        generatedAt: new Date().toISOString(),
      };
      setPlanResult(planData);
      if (athleteId) {
        await setDoc(doc(db, "athletes", athleteId, "plans", "current"), planData);
      }

      // Persist deferred priorities from today's plan
      if (athleteId && parsed.deferredPriorities?.length > 0) {
        await saveDeferredPriorities(athleteId, parsed.deferredPriorities);
      }

      // Resolve deferred items addressed by today's exercises
      if (athleteId && ctx?.deferredPriorities?.length > 0 && parsed.exercises?.length > 0) {
        for (const ex of parsed.exercises) {
          if (!ex.tennisConnection) continue;
          const matched = ctx.deferredPriorities.find(d =>
            d.priority && ex.tennisConnection.toLowerCase().includes(d.priority.toLowerCase())
          );
          if (matched) await resolveDeferred(athleteId, matched.priority);
        }
      }

      // Check for any escalated priorities
      if (athleteId) {
        const escalatedItems = await refreshEscalations(athleteId);
        setEscalations(escalatedItems);
      }
    } catch (e) {
      console.error("Plan generation error:", e);
      setAiError(`Could not generate plan — ${e.message}`);
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
