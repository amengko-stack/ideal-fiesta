import { deferredPrioritySchemaBlock, renderExistingPriorities, textAddressesPriority } from "./priorityKeys.js";
import { getWeekBounds } from "./dates.js";
import { calculateMetrics, getLoadContext, weeklyTrainingSummary, loadTrend } from "./load.js";
import { TENNIS_GAPS, approvedExerciseNames, findExercise, exerciseSlug, isApprovedExercise } from "./exerciseDb.js";
import { resolveIdentity, identityBlock } from "./athleteIdentity.js";
import { recentGrowthContext, GROWTH_WATCH_MESSAGE } from "./growth.js";
import {
  buildWeeklyFramework, buildWeeklyPlanDoc, mergeSessionAdjustments, progressionGate,
  compareToWeeklyTargets, WEEKLY_TARGETS, PLYO_CONTACT_BUDGET, EFFORT_TARGET,
  BLOCK_EQUIPMENT, BLOCK_LENGTH_WEEKS, YOUTH_STRENGTH_STATEMENT, NEUROMUSCULAR_STATEMENT,
  OVER_TARGET_TENNIS_MESSAGE, SUNDAY_RECOVERY, WEEKLY_PLAN_SCHEMA_VERSION,
} from "./weeklyPlanCore.js";

// ─── WEEKLY S&C PLAN — PURE CORE ─────────────────────────────────────────────
// Prompt construction, response→plan mapping and the plan-addresses-priority
// matcher. No Firestore and no ai.js import, so a Cloud Function can build
// byte-identical prompts and plan documents from the same inputs. planGen.js
// keeps the Firestore writes.
//
// The model no longer designs a session from scratch. weeklyPlanCore.js fixes
// what each session is for, which exercises it may contain, the volume ceiling,
// the eight-week progression shape and the tournament/growth modifications;
// this file renders that framework into a prompt and folds the model's
// adjustments back in, clamped. Anything the model names that is not in the
// approved exercise database is dropped, not prescribed.
//
// The golden files in __fixtures__/ pin the prompt bytes: any edit here that
// changes the wording for identical inputs fails planGenCore.test.js.

export const WEEKLY_PLAN_MAX_TOKENS = 6000;
// Retained name for callers that still import the old spelling.
export const SUNDAY_PLAN_MAX_TOKENS = WEEKLY_PLAN_MAX_TOKENS;

// "3 × 8/side", "2 × 25 sec/side", "4 × 5 m". Sprint entries carry the distance
// separately from the rep count (4 reps OF 5 m, not 4 reps of 1), so the
// distance is what the line has to show.
const fmtReps = (ex) => {
  const value = ex.unit === "m" && ex.distanceM != null ? ex.distanceM : (ex.repRange ?? ex.reps);
  const unit = ex.unit === "sec" ? " sec" : ex.unit === "m" ? " m" : "";
  const side = ex.perSide ? "/side" : "";
  return `${value}${unit}${side}`;
};

const renderSessionBlock = (session) => {
  const lines = [
    `SESSION ${session.id} — ${session.plannedDay} — ${session.title}`,
    `Purpose: ${session.purpose}`,
    `Target duration: ${session.durationMin} min · session type: ${session.sessionType} · working sets: ${session.workingSets} · landing contacts: ${session.plyoContacts} (cap ${session.plyoContactCap})`,
    "Prescription (this is the framework — adjust within it, never beyond it):",
  ];
  let role = null;
  for (const ex of session.exercises) {
    if (ex.role !== role) {
      role = ex.role;
      lines.push(`  [${role.toUpperCase()}]`);
    }
    const variants = [...(ex.regressions || []), ...(ex.progressions || [])]
      .map(id => findExercise(id)?.name)
      .filter(Boolean);
    lines.push(
      `    - ${ex.name} (id: ${ex.id}) — ${ex.sets} × ${fmtReps(ex)}` +
      `${ex.restSeconds ? ` · rest ~${ex.restSeconds}s` : ""}` +
      `${ex.loadKg ? ` · ${ex.loadKg}` : ""}` +
      `${ex.cue ? ` · cue: ${ex.cue}` : ""}` +
      `${variants.length ? ` · approved swaps: ${variants.join(", ")}` : ""}`
    );
  }
  return lines.join("\n");
};

// ── buildWeeklyStrengthPlanPrompt ────────────────────────────────────────────
// Pure. Returns { system, prompt, maxTokens, framework, growthContext,
// weekSummary, targetComparison, progression } — the derived objects come back
// with the prompt so a caller (planGen.js, weeklyReview.js) builds the plan
// document from exactly what the model was shown.
export function buildWeeklyStrengthPlanPrompt({
  profile,
  weekLogs = [],
  sessionHistory = [],
  wellbeing = [],
  tournament = "none",
  sessionTime,
  ctx = null,
  now = new Date(),
  metrics = calculateMetrics(weekLogs, wellbeing),
  loadNotes = getLoadContext(metrics.acwr, tournament, sessionTime),
  thisWeekStart = getWeekBounds(0).start,
  growthContext = recentGrowthContext(profile?.measurements),
  weekSummary = weeklyTrainingSummary(weekLogs, 0, now),
  trend = loadTrend(weekLogs, now),
  weeklyTargets = WEEKLY_TARGETS,
  blockState = null,
  progression = null,
  framework = null,
}) {
  const gaps = profile?.gaps || [];
  const identity = resolveIdentity(profile, now);
  const athleteName = profile?.name || "the athlete";

  const orderedHistory = [...(sessionHistory || [])]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Progression is earned, not granted by the calendar: an open injury, an
  // unfinished prescription, a maximally hard last session or a pain note all
  // hold the prescription where it is.
  const openInjuries = (ctx?.injuries?.open || []).length;
  const gate = progression ?? progressionGate({
    lastSession: orderedHistory[0] ?? null,
    painReported: openInjuries > 0,
    movementQualityConcern: false,
  });

  // Block position comes from the persistent programState/strength document
  // (see weeklyPlanCore.resolveProgramState); this file never derives it.
  const block = blockState ?? { blockWeek: 1, blockNumber: 1 };
  const fw = framework ?? buildWeeklyFramework({
    blockWeek: block.blockWeek,
    blockNumber: block.blockNumber,
    blockId: block.blockId ?? null,
    blockStatus: block.blockStatus ?? "active",
    blockStartWeekKey: block.blockStartWeekKey ?? null,
    needsNewBlock: !!block.needsNewBlock,
    tournamentMode: tournament,
    growthWatch: !!growthContext?.growthWatch,
    progressionAllowed: gate.allowed,
    progressionHold: gate.reasons,
  });

  const targetComparison = compareToWeeklyTargets(weekSummary, weeklyTargets);

  const thisWeekLogs = (weekLogs || []).filter(l => l.date >= thisWeekStart);
  const typeLabel = { tennis: "Tennis", match: "Match", strength: "Strength", cheer: "Cross-training (historical cheer log)", other: "Cross-training" };
  const weekActivity = thisWeekLogs.length === 0
    ? "No activity sessions logged this week."
    : [...thisWeekLogs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(l => {
          const rpe = l.rpe ?? (l.intensity ? l.intensity * 2 : "?");
          return `  - ${l.date} ${l.time}: ${typeLabel[l.type] || l.type}${l.sportName ? ` (${l.sportName})` : ""} — ${l.duration} min, RPE ${rpe}/10${l.focus ? ", focus: " + l.focus : ""}`;
        })
        .join("\n");

  const recentSessions = orderedHistory.slice(0, 6).map(s => ({
    date: s.date,
    sessionId: s.plannedSessionId ?? null,
    exercises: (s.exercises || []).map(e => ({
      name: e.name, sets: e.sets, reps: e.reps,
      weight: e.weight || null, difficulty: e.difficulty, completed: e.completed,
    })),
    painNote: s.painNote ?? null,
  }));

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

  const growthText = (() => {
    if (!growthContext) return "No height measurements recorded yet — measure monthly.";
    const lines = [`- Current height: ${growthContext.latestHeight} cm (measured ${growthContext.latestDate})`];
    if (growthContext.velocityCmYr != null) {
      const months = Math.round(growthContext.intervalDays / 30.44);
      lines.push(`- Recent growth: ${growthContext.velocityCmYr} cm/year, measured over ${growthContext.intervalDays} days (~${months} month${months === 1 ? "" : "s"}) against ${growthContext.priorHeight} cm on ${growthContext.priorDate}`);
    } else {
      lines.push("- Only one height measurement on file — no velocity yet.");
    }
    if (!growthContext.sufficientInterval && growthContext.velocityCmYr != null) {
      lines.push("- The measurement interval is too short to classify growth confidently — treat the velocity as provisional.");
    }
    lines.push(growthContext.growthWatch
      ? `- GROWTH WATCH: ${GROWTH_WATCH_MESSAGE}`
      : "- No growth watch this week.");
    lines.push("- This is a coaching flag derived from measured height only. Do NOT infer a puberty stage, do NOT state or imply that she is at, near or past peak height velocity, and do NOT use it to prohibit a movement outright.");
    return lines.join("\n");
  })();

  const targetText = targetComparison
    ? [
        `- Tennis incl. matches: target ${targetComparison.tennis.targetLabel} · actual ${targetComparison.tennis.actualLabel} (${targetComparison.tennis.status})`,
        `- S&C sessions: target ${targetComparison.strength.targetLabel} · actual ${targetComparison.strength.actualLabel} (${targetComparison.strength.status})`,
        `- Swim / cross-training: target ${targetComparison.crossTraining.targetLabel} · actual ${targetComparison.crossTraining.actualLabel} (${targetComparison.crossTraining.status})`,
        `- Complete rest days: target ${targetComparison.restDays.targetLabel} · actual ${targetComparison.restDays.actualLabel} (${targetComparison.restDays.status})`,
        targetComparison.tennisOverTargetMessage ? `- ${OVER_TARGET_TENNIS_MESSAGE}` : null,
      ].filter(Boolean).join("\n")
    : "No logged activity this week.";

  const prompt = `You are an expert youth strength and conditioning coach working with a competitive junior tennis player. A fixed weekly S&C framework has already been built for the coming week. Your job is to ADJUST it within its limits — not to design a session.

═══════════════════════════════════════════
ATHLETE PROFILE
═══════════════════════════════════════════
- Name: ${athleteName}
- Age: ${identity.age ?? "unknown"} · Female · competitive junior tennis player
- Primary sport: Tennis. Current cross-training: swimming and yoga/mobility. (Older logs may include cheerleading — treat those as historical load only; cheerleading is not current cross-training.)
- Competition: ${identity.categoryLabel ?? "junior"}
- Tennis areas to develop: ${gapLabels.join(", ") || "general athletic development"}

${identityBlock(profile, now)}
${identity.isPlayingUp ? `- Physical preparation should help close the gap to opponents up to ${identity.yearsOlderOpponents} year${identity.yearsOlderOpponents === 1 ? "" : "s"} older — through movement quality and progressive training, never by exceeding the framework's limits.` : ""}
${ctx?.memoryText ? `\n${ctx.memoryText}\n` : ""}
${ctx?.injuryText ? `\n${ctx.injuryText}\n` : ""}
${ctx?.standingSeasonPriority ? `STANDING SEASON PRIORITY:\n${ctx.standingSeasonPriority.nextMonthPriority ? `- Next month priority: ${ctx.standingSeasonPriority.nextMonthPriority}\n` : ""}${ctx.standingSeasonPriority.longTermOutlook ? `- Long-term outlook: ${ctx.standingSeasonPriority.longTermOutlook}\n` : ""}` : ""}

COACH / PARENT NOTES:
${profile?.coachNotes?.trim() || "None"}
⚠ Treat any mentioned injuries or pain areas as HARD restrictions — do not include exercises that stress those areas.
${ctx?.injuries?.flag ? `⚠ INJURY LOAD FLAG (${ctx.injuries.flag.tone}): ${ctx.injuries.flag.headline}. ${ctx.injuries.flag.guidance} Do NOT prescribe exercises that load an injured area.` : ""}

═══════════════════════════════════════════
GROWTH CONTEXT
═══════════════════════════════════════════
${growthText}

═══════════════════════════════════════════
TRAINING PRINCIPLES FOR THIS BLOCK
═══════════════════════════════════════════
- ${YOUTH_STRENGTH_STATEMENT}
- Equipment for this block: ${BLOCK_EQUIPMENT.join(", ")}.
- ${NEUROMUSCULAR_STATEMENT}
- Target effort is RPE ${EFFORT_TARGET.rpeMin}–${EFFORT_TARGET.rpeMax}/10, usually leaving ${EFFORT_TARGET.repsInReserveMin}–${EFFORT_TARGET.repsInReserveMax} good repetitions in reserve.
- Load may rise by up to ${fw.maxLoadIncrementPct}% where justified${fw.maxLoadIncrementPct > EFFORT_TARGET.loadIncrementPctMin ? ` (usual increment ${EFFORT_TARGET.loadIncrementPctMin}–${fw.maxLoadIncrementPct}%)` : ""}. Load increases are never required.
- Movement quality overrides rep count. Progress only when the prescribed reps were technically sound, no pain was reported, session effort was manageable and movement quality held.
- Landing/plyometric volume is capped at ${PLYO_CONTACT_BUDGET.min}–${PLYO_CONTACT_BUDGET.max} purposeful contacts per session or fewer, taking the week's tennis load into account. Never add jump volume because a workload number looks low.
- Acceleration work is speed work, not conditioning: full recovery between reps, stop the set when quality drops.

═══════════════════════════════════════════
WEEKLY TARGET vs ACTUAL (coaching target, not a medical ceiling)
═══════════════════════════════════════════
${targetText}
Exceeding the target is information, not a failure. Never tell the family to add S&C to "catch up", and never treat a week over target as the athlete's fault.

═══════════════════════════════════════════
EIGHT-WEEK BLOCK POSITION
═══════════════════════════════════════════
- Block ${fw.blockNumber}, week ${fw.blockWeek} of ${BLOCK_LENGTH_WEEKS} — phase: ${fw.blockPhase}
- Intent: ${fw.blockIntent}${fw.needsNewBlock ? `
- This block has run its ${BLOCK_LENGTH_WEEKS} weeks and is awaiting a coach review before the next one starts. Keep prescribing the week-8 consolidation shape; do NOT invent a new block or a new progression.` : ""}
- Third set on key movements: ${fw.allowThirdSet ? "allowed this week" : "NOT allowed this week"}
- Load increase: ${fw.allowLoadIncrease ? `allowed, up to ${fw.maxLoadIncrementPct}%` : "NOT allowed this week"}
- Progression gate: ${gate.allowed ? "open — the last session met the quality bar" : `HELD — ${gate.reasons.join("; ")}`}
A week of the calendar passing is not a reason to progress.

═══════════════════════════════════════════
THIS WEEK'S FRAMEWORK
═══════════════════════════════════════════
Tournament mode: ${fw.tournamentMode}
${fw.tournamentNotes.length ? fw.tournamentNotes.map(n => `- ${n}`).join("\n") : "- Normal week."}

${fw.sessions.map(renderSessionBlock).join("\n\n")}
${fw.omittedSessions.length ? `\nNOT SCHEDULED THIS WEEK:\n${fw.omittedSessions.map(s => `- Session ${s.id} (${s.plannedDay}) — ${s.sessionType}: ${s.omittedReason}`).join("\n")}` : ""}

SUNDAY: ${SUNDAY_RECOVERY.note}
Do not propose a make-up session for a missed Session A or B, and never move missed work to Sunday.

═══════════════════════════════════════════
THIS WEEK'S ACTIVITY (logged sessions)
═══════════════════════════════════════════
${weekActivity}

Minutes by category this week: tennis ${weekSummary.tennisMinutes}, matches ${weekSummary.matchMinutes}, strength ${weekSummary.strengthMinutes}, swim/cross-training ${weekSummary.crossTrainingMinutes} · total organised training ${weekSummary.totalMinutes} min over ${weekSummary.trainingDays} day(s), ${weekSummary.restDays} complete rest day(s).

═══════════════════════════════════════════
TRAINING LOAD (descriptive — not an injury prediction)
═══════════════════════════════════════════
sRPE = RPE × duration in minutes. It is a single global internal-load figure; the per-category minutes above are the context that stops two very different weeks reading as the same week.

- Rolling 7-day sRPE: ${trend.last7DaySRPE}
- Recent 28-day weekly-equivalent average: ${trend.baselineWeeklySRPE}
- Difference from that baseline: ${trend.pctFromBaseline == null ? "no baseline yet" : `${trend.pctFromBaseline > 0 ? "+" : ""}${trend.pctFromBaseline}%`} — ${trend.label}
- This week sRPE: ${metrics.thisWeekSRPE}
- Weekly sRPE last 4 weeks (oldest → newest): ${[...metrics.weekSRPEs].reverse().join(" → ")}
- 4-week average sRPE: ${metrics.fourWeekAvg}
- Load notes: ${loadNotes.join(" | ")}

A large difference from the recent baseline is a prompt to review progression and recovery. It does not classify injury risk, and a low figure is never an instruction to train more.

7-DAY WELLBEING AVERAGES (${metrics.wellbeingDays} days logged):
- Average sleep: ${metrics.avgSleep !== null ? metrics.avgSleep + "h" : "no data"}
- Average mood: ${metrics.avgMood !== null ? metrics.avgMood + "/5" : "no data"}
- Average soreness: ${metrics.avgSoreness !== null ? metrics.avgSoreness + "/5" : "no data"}

═══════════════════════════════════════════
ATHLETE WELLBEING (last ${recentWellbeing.length} check-ins, most recent first)
═══════════════════════════════════════════
${wellbeingText}

Wellbeing rules:
- Soreness 3+: reduce landing volume, prioritise mobility and recovery
- Sleep under 7h: avoid max-effort work, keep intensity moderate
- Energy 1–2 (night before): scale back volume
- Mood 1–2: keep the session positive and simple, no new variants
- Any noted pain or tightness: avoid exercises that load that area

═══════════════════════════════════════════
PAST STRENGTH TRAINING HISTORY (last ${recentSessions.length} sessions)
═══════════════════════════════════════════
${recentSessions.length === 0
  ? "No strength history yet — this is the first block. Start at the framework's starting volume and focus on form."
  : recentSessions.map(s =>
      `${s.date}${s.sessionId ? ` (Session ${s.sessionId})` : ""}:\n${s.exercises.map(e =>
        `  - ${e.name}: ${e.sets}×${e.reps}${e.weight ? " @ " + e.weight : ""} | difficulty ${e.difficulty}/5 | ${e.completed ? "completed" : "did NOT complete"}`
      ).join("\n")}${s.painNote ? `\n  ⚠ pain note: ${s.painNote}` : ""}`
    ).join("\n\n")}

═══════════════════════════════════════════
APPROVED EXERCISE DATABASE
═══════════════════════════════════════════
Select exercises only from the approved exercise database and approved regressions/progressions. Do not invent exercises, and do not substitute a movement that is not listed as an approved swap on the framework entry you are adjusting. Anything outside this list is discarded, not prescribed.

${approvedExerciseNames().join(", ")}

Suppressed for this block (do not prescribe): depth jumps, box jumping, single-leg maximal bounding, continuous hop/pogo circuits, Nordic curls, kettlebell swings, slam balls, and running conditioning.

═══════════════════════════════════════════
RECENT MATCH FINDINGS
═══════════════════════════════════════════
${(() => {
      const rm = ctx?.recentMatch;
      const ma = ctx?.matchAnalysis;
      if (!rm || !ma) return "No recent match within the last 14 days.";
      const matchDate = rm.matchStartTime ? new Date(rm.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "unknown date";
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
${renderExistingPriorities(ctx?.deferredPriorities)}

${deferredPrioritySchemaBlock()}

═══════════════════════════════════════════
RECENT TECHNICAL ASSESSMENTS (High priority only)
═══════════════════════════════════════════
${(ctx?.technicalAssessments || []).length > 0
      ? ctx.technicalAssessments.map(a =>
          `- ${a.strokeArea} (${a.category}) — assessed ${a.date} via ${a.source}:\n  ${a.assessment}`
        ).join('\n\n')
      : 'None recorded.'}

INSTRUCTION: Use the technical assessments above to choose WHICH approved variant and WHICH cue to emphasise within the framework — never to add an exercise the framework does not contain:
- Kinetic chain issues → the rotational power and hip hinge entries
- Drive consistency → the core/anti-rotation and deceleration entries
- Serve mechanics → the shoulder/scapular entries
- Movement/footwork → the acceleration, landing and lateral entries
If a technical assessment cannot be addressed inside the framework, defer it explicitly rather than expanding the session.

═══════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════
Return an adjustment to the framework above. For each scheduled session you may:
- hold an exercise at its prescribed sets/reps (the default — say nothing about it);
- REDUCE sets or reps where load, wellbeing, growth or competition warrants;
- swap to one of the approved swaps listed on that entry (regression or progression);
- add a load note (hold / small increase within the allowed percentage / reduce);
- add a short coaching note and the tennis connection for that exercise;
- mark Session B as reduced or recovery when competition or recovery demands it.

You may NOT: add an exercise, raise sets or reps above the framework, grant a third set the block has not allowed, exceed the landing-contact cap, or prescribe anything outside the approved exercise database. Those limits are deterministic safety rules and always win over anything else in this prompt.

Respond with ONLY valid JSON, no other text:
{
  "sessions": [
    {
      "id": "A",
      "sessionType": "full | reduced | maintenance | recovery",
      "coachFocus": "one sentence on what this session is really about this week",
      "adjustments": [
        {
          "id": "goblet_squat",
          "sets": 2,
          "reps": 8,
          "variant": "approved swap id, or null to keep the prescribed movement",
          "loadNote": "hold / +5% / reduce — and why",
          "note": "what changed from last week and why",
          "tennisConnection": "which match finding or tennis gap this addresses"
        }
      ]
    }
  ],
  "loadRationale": "2-3 sentences on how this week's load shaped the adjustments",
  "growthRationale": "1-2 sentences on how recent growth shaped the adjustments — or null",
  "matchRationale": "2-3 sentences on which match findings are addressed and which are deferred — or null if no recent match",
  "techAssessmentRationale": "1-2 sentences on which technical assessments influenced variant or cue selection — or null if none recorded",
  "overallRationale": "one paragraph integrating load + growth + match + competition into a coherent week",
  "deferredPriorities": [
    {
      "priority": "what was identified but not trained this week",
      "key": "one of the keys listed in the deferred priority rules",
      "reason": "why deferred",
      "resolveCondition": "condition for when to address",
      "metricTarget": { "metric": "secondServePointsWonPct", "comparator": ">=", "value": 45 }
    }
  ],
  "coachNote": "short paragraph for the parent — plain language, no jargon",
  "athleteNote": "one encouraging sentence written directly to ${athleteName}"
}`;

  const system =
`You are an elite junior tennis strength and conditioning coach. You work inside a fixed, pre-built weekly framework: you adjust it for the athlete in front of you, you never redesign it.

PRIORITY HIERARCHY — apply strictly in this order:
0. Injury override: if any open injury has severity 4-5 ("cannot train" / medical-clearance-gated) → recovery work only for the affected area. This OUTRANKS every rule below and can never be outranked by a progression or load rule.
1. Deterministic framework limits: the session list, the exercise list, the set/rep ceilings, the landing-contact cap and the approved exercise database. You may move within them and never past them.
2. Injury severity 3 → avoid loading the affected area and cut overall volume until it settles. Severity 1-2 → monitor and avoid movements that aggravate the area. Never prescribe exercises that load an injured area, at any severity.
3. Competition: a tournament week gets ONE shortened maintenance session early in the week; the second session becomes recovery rather than being forced in. Matches count as training load.
4. Growth and wellbeing: on a growth-watch week, or with soreness 3+, poor sleep or low mood, bias towards fewer sets, simpler variants and lower landing volume.
5. Weekly load: a large jump from the recent baseline is a reason to review progression and recovery — reduce where warranted. A low figure is never a reason to add volume.
6. Match findings and deferred priorities: within the room rules 0-5 leave, prioritise the exercises and cues that address critical findings and the longest-deferred priorities.
7. Progression: apply progressive overload only when rules 0-6 leave room AND the progression gate is open — never sacrifice recovery or movement quality for progression.

Never state or imply a puberty stage, a peak-height-velocity classification, a single dominant predictor of injury, or a probability of injury. Never claim that barbell or resistance training is inherently unsafe for children — this block is submaximal by design, which is a different statement.

Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` anywhere in your response. Start your response with { and end with }.`;

  return {
    system,
    prompt,
    maxTokens: WEEKLY_PLAN_MAX_TOKENS,
    framework: fw,
    growthContext,
    weekSummary,
    targetComparison,
    progression: gate,
    trend,
  };
}

// Retained name for callers that still import the old spelling.
export const buildSundayPlanPrompt = buildWeeklyStrengthPlanPrompt;

// ── toWeeklyPlanData ─────────────────────────────────────────────────────────
// Pure. Folds the model's per-session adjustments onto the deterministic
// framework and assembles the schema-v2 plans/current document.
//
// Every exercise in the result comes from the framework, so nothing the model
// invented can reach the athlete. `metrics` is the calculateMetrics result —
// the Plan and Load screens render plan.metrics.
export function toWeeklyPlanData(parsed, ctx, generatedAt, metrics = null, {
  framework,
  weekKey = null,
  growthContext = null,
  weeklyTargets = WEEKLY_TARGETS,
  weekSummary = null,
  targetComparison = null,
  trend = null,
  generatedBy = "app",
} = {}) {
  const p = parsed || {};
  const byId = new Map((p.sessions || []).map(s => [s.id, s]));

  const adjusted = {
    ...framework,
    sessions: (framework?.sessions || []).map((session) => {
      const fromModel = byId.get(session.id);
      const merged = mergeSessionAdjustments(session, fromModel?.adjustments);
      const requestedType = fromModel?.sessionType;
      // The model may only make a session EASIER than the framework planned.
      const softer = ["full", "reduced", "maintenance", "recovery"];
      const canSoften = softer.indexOf(requestedType) > softer.indexOf(session.sessionType);
      return {
        ...merged,
        sessionType: canSoften ? requestedType : session.sessionType,
        coachFocus: fromModel?.coachFocus ?? null,
      };
    }),
  };

  const rm = ctx?.recentMatch;
  return buildWeeklyPlanDoc({
    weekKey,
    framework: adjusted,
    generatedAt,
    generatedBy,
    growthContext,
    weeklyTargets,
    loadContext: {
      weekSummary,
      targetComparison,
      trend,
    },
    metrics,
    matchInformedBy: rm ? { opponentName: rm.opponentName, matchStartTime: rm.matchStartTime } : null,
    coachNote: p.coachNote ?? "",
    athleteNote: p.athleteNote ?? "",
    rationales: {
      briefing: p.overallRationale || p.coachNote || "",
      loadRationale: p.loadRationale ?? null,
      growthRationale: p.growthRationale ?? null,
      matchRationale: p.matchRationale ?? null,
      techAssessmentRationale: p.techAssessmentRationale ?? null,
    },
  });
}

// Retained name for callers that still import the old spelling. NOTE: this now
// produces the schema-v2 weekly document, not the pre-v2 single-session one.
export const toPlanData = toWeeklyPlanData;

// ── adjustmentConnections ────────────────────────────────────────────────────
// Pure. Flattens the model's per-session adjustments into the flat
// {name, tennisConnection} list resolvedPriorityLabels matches against, so the
// deferred-priority applier is unchanged by the weekly restructure.
export function adjustmentConnections(parsed) {
  const out = [];
  for (const session of parsed?.sessions || []) {
    for (const adj of session?.adjustments || []) {
      if (!adj) continue;
      out.push({
        name: adj.name ?? adj.id ?? "",
        tennisConnection: adj.tennisConnection ?? null,
      });
    }
  }
  return out;
}

// ── resolvedPriorityLabels ───────────────────────────────────────────────────
// Pure. The deferred-priority labels this week's prescribed work actually
// addresses, in the order the original loop produced them (repeats included —
// the second resolve of an already-resolved area is a no-op on the applier
// side). Accepts either the flat exercise list or a parsed weekly response.
export function resolvedPriorityLabels(parsedExercises, openPriorities) {
  const list = Array.isArray(parsedExercises)
    ? parsedExercises
    : adjustmentConnections(parsedExercises);
  const labels = [];
  for (const ex of list || []) {
    if (!ex?.tennisConnection) continue;
    const matched = (openPriorities || []).find(d =>
      d.priority && textAddressesPriority(ex.tennisConnection, d)
    );
    if (matched) labels.push(matched.priority);
  }
  return labels;
}

// Re-exported so callers that only import planGenCore can still check an
// exercise name against the approved database (the gate the UI and the plan
// applier both rely on).
export { isApprovedExercise, exerciseSlug, WEEKLY_PLAN_SCHEMA_VERSION };
