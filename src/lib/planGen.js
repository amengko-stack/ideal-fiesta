import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { buildAthleteContext } from "./athleteContext.js";
import { saveDeferredPriorities, refreshEscalations, resolveDeferred } from "./deferredPriorities.js";
import { calculateMetrics } from "./load.js";
import { callClaudeJSON } from "./ai.js";
import { buildSundayPlanPrompt, toPlanData, resolvedPriorityLabels } from "./planGenCore.js";

// ─── SUNDAY PLAN GENERATION ─────────────────────────────────────────────────
// Firestore + LLM wiring only. Every decision — the prompt, the response
// mapping, and which priorities today's exercises address — lives in
// planGenCore.js so a Cloud Function can reuse it unchanged.
export async function generateSundayPlan(athleteId, { profile, weekLogs, sessionHistory, wellbeing, tournament, sessionTime }) {
  // Fetch unified context (includes match analysis + deferred priorities)
  const ctx = athleteId ? await buildAthleteContext(athleteId).catch(() => null) : null;

  const metrics = calculateMetrics(weekLogs, wellbeing);

  const { system, prompt, maxTokens } = buildSundayPlanPrompt({
    profile, weekLogs, sessionHistory, wellbeing, tournament, sessionTime, ctx, metrics,
  });

  const parsed = await callClaudeJSON({ system, userContent: prompt, maxTokens });

  const planData = toPlanData(parsed, ctx, new Date().toISOString(), metrics);

  if (athleteId) {
    await setDoc(doc(db, "athletes", athleteId, "plans", "current"), planData);
  }

  // Persist deferred priorities from today's plan
  if (athleteId && parsed.deferredPriorities?.length > 0) {
    await saveDeferredPriorities(athleteId, parsed.deferredPriorities);
  }

  // Resolve deferred items addressed by today's exercises
  if (athleteId && ctx?.deferredPriorities?.length > 0 && parsed.exercises?.length > 0) {
    for (const label of resolvedPriorityLabels(parsed.exercises, ctx.deferredPriorities)) {
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
