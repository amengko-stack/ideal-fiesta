import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { buildAthleteContext } from "./athleteContext.js";
import { saveDeferredPriorities, refreshEscalations, resolveDeferred } from "./deferredPriorities.js";
import { getWeekBounds } from "./dates.js";
import { calculateMetrics, getACWRContext } from "./load.js";
import { EXERCISE_DB, TENNIS_GAPS } from "./exerciseDb.js";
import { callClaudeJSON } from "./ai.js";

// ─── SUNDAY PLAN GENERATION ─────────────────────────────────────────────────
export async function generateSundayPlan(athleteId, { profile, weekLogs, sessionHistory, wellbeing, tournament, sessionTime }) {
  const gaps = profile?.gaps || [];

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
          return `  - ${l.date} ${l.time}: ${typeLabel[l.type] || l.type}${l.sportName ? ` (${l.sportName})` : ""} — ${l.duration} min, RPE ${rpe}/10${l.focus ? ", focus: " + l.focus : ""}`;
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
- Primary sport: Tennis | Secondary: cross-training in other sports (she recently stopped cheerleading — older logs may include cheer sessions; treat those as historical load only)
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
- Shoulder health: monitor for impingement patterns given repeated overhead serve demands

MULTI-SPORT ATHLETE CONTEXT:
- She trains more total hours than single-sport peers her age — cumulative fatigue is a real risk
- Tennis + cross-training together create high rotational, overhead, and lower-limb demands
- Overuse injury risk is elevated: do NOT add volume just because ACWR looks low; quality > quantity
- Sunday strength session must complement the week, not compete with it

CROSS-TRAINING CONTEXT (factor into exercise selection):
- Sessions logged as "other" are cross-training in varied sports — read their focus/sport notes for specifics
- Use cross-training variety to develop general athleticism without adding tennis-specific overuse load

═══════════════════════════════════════════
THIS WEEK'S ACTIVITY (Mon–Sat logged sessions)
═══════════════════════════════════════════
${weekActivity}

═══════════════════════════════════════════
TRAINING LOAD ANALYSIS
═══════════════════════════════════════════
sRPE = RPE × duration in minutes

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
- Heavy tennis/cross-training week → reduce strength volume to prevent overtraining
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
  let escalations = [];
  if (athleteId) {
    escalations = await refreshEscalations(athleteId);
  }

  return { planData, escalations };
}
