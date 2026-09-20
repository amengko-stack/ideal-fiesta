import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { buildAthleteContext } from "./athleteContext.js";
import { saveDeferredPriorities, refreshEscalations, resolveDeferred } from "./deferredPriorities.js";
import { calculateMetrics } from "./load.js";
import { upcomingWeekKey } from "./dates.js";
import { callClaudeJSON } from "./ai.js";
import { buildWeeklyStrengthPlanPrompt, toWeeklyPlanData, resolvedPriorityLabels } from "./planGenCore.js";
import { readWeeklyPlan } from "./weeklyPlanCore.js";
import { ensureProgramState } from "./programState.js";

// ─── WEEKLY S&C PLAN GENERATION ─────────────────────────────────────────────
// Firestore + LLM wiring only. Every decision — the deterministic framework,
// the prompt, the response mapping and which priorities this week's work
// addresses — lives in weeklyPlanCore.js / planGenCore.js so the Cloud Function
// can reuse it unchanged.
//
// One call produces the whole week: Session A (Monday), Session B (Thursday)
// and Sunday as a recovery day. It replaces the old one-Sunday-session model.
export async function generateWeeklyStrengthPlan(athleteId, {
  profile, weekLogs, sessionHistory, wellbeing, tournament, sessionTime, now = new Date(),
}) {
  // Fetch unified context (includes match analysis + deferred priorities)
  const ctx = athleteId ? await buildAthleteContext(athleteId).catch(() => null) : null;

  const metrics = calculateMetrics(weekLogs, wellbeing);

  // Where she is in the block comes from athletes/{id}/programState/strength and
  // is derived from the calendar, so regenerating a plan in the same week cannot
  // advance it and deleting plans/current cannot reset it. The previous plan is
  // read only as migration evidence the first time the state document is
  // created.
  const weekKey = upcomingWeekKey(now);
  let previousPlan = null;
  if (athleteId) {
    try {
      const snap = await getDoc(doc(db, "athletes", athleteId, "plans", "current"));
      previousPlan = snap.exists() ? readWeeklyPlan(snap.data()) : null;
    } catch { previousPlan = null; }
  }
  const { position } = await ensureProgramState(athleteId, { previousPlan, weekKey, now });
  const blockState = {
    blockWeek: position.blockWeek,
    blockNumber: position.blockNumber,
    blockId: position.blockId,
    blockStatus: position.status,
    blockStartWeekKey: position.blockStartWeekKey,
    needsNewBlock: position.needsNewBlock,
  };

  const built = buildWeeklyStrengthPlanPrompt({
    profile, weekLogs, sessionHistory, wellbeing, tournament, sessionTime, ctx, metrics, now, blockState,
  });

  const parsed = await callClaudeJSON({
    system: built.system, userContent: built.prompt, maxTokens: built.maxTokens,
  });

  const planData = toWeeklyPlanData(parsed, ctx, new Date().toISOString(), metrics, {
    framework: built.framework,
    weekKey,
    growthContext: built.growthContext,
    weekSummary: built.weekSummary,
    targetComparison: built.targetComparison,
    trend: built.trend,
    generatedBy: "app",
  });

  if (athleteId) {
    await setDoc(doc(db, "athletes", athleteId, "plans", "current"), planData);
  }

  // Persist deferred priorities from this week's plan
  if (athleteId && parsed.deferredPriorities?.length > 0) {
    await saveDeferredPriorities(athleteId, parsed.deferredPriorities);
  }

  // Resolve deferred items addressed by this week's prescribed work
  if (athleteId && ctx?.deferredPriorities?.length > 0) {
    for (const label of resolvedPriorityLabels(parsed, ctx.deferredPriorities)) {
      await resolveDeferred(athleteId, label);
    }
  }

  // Check for any escalated priorities
  let escalations = [];
  if (athleteId) {
    escalations = await refreshEscalations(athleteId);
  }

  return { planData, escalations };
}

// Retained name for callers that still import the old spelling. It now produces
// the whole week, not a single Sunday session.
export const generateSundayPlan = generateWeeklyStrengthPlan;
