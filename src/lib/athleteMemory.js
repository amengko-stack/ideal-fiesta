import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { callClaudeJSON } from "./ai.js";
import { CAPS, emptyMemory, capMemory, recordDivisionChange } from "./athleteMemoryCore.js";

// ─── ATHLETE DEVELOPMENT MEMORY — PERSISTENCE ───────────────────────────────
// A bounded, persistent longitudinal store the AI reads before every analysis
// so it has a continuous understanding of the athlete rather than a single
// stateless prompt. Singleton doc, same pattern as plans/current and
// gamification/state: athletes/{athleteId}/memory/current.
//
// Caps are enforced IN CODE (capMemory), never left to the model's discretion,
// so prompt size stays flat no matter how long the season runs.
//
// The pure half lives in athleteMemoryCore.js and is re-exported here so
// existing importers keep working unchanged.
export { emptyMemory, capMemory, memoryBlock, recordDivisionChange } from "./athleteMemoryCore.js";

const docRef = (athleteId) => doc(db, "athletes", athleteId, "memory", "current");

// ── loadMemory ───────────────────────────────────────────────────────────────
// Never throws — a memory read failure degrades to emptyMemory() so callers
// never need their own try/catch around this.
export async function loadMemory(athleteId) {
  try {
    if (!athleteId) return emptyMemory();
    const snap = await getDoc(docRef(athleteId));
    if (!snap.exists()) return emptyMemory();
    return { ...emptyMemory(), ...snap.data() };
  } catch {
    return emptyMemory();
  }
}

// ── updateMemoryFromMatch ────────────────────────────────────────────────────
// Makes ONE small callClaudeJSON asking the model to REVISE AND MERGE the
// existing memory with new match-analysis evidence — not append blindly.
// Non-fatal by contract: callers must wrap in try/catch (matchAnalysis.js
// does). Any failure here must never break match-analysis generation.
export async function updateMemoryFromMatch(athleteId, { profile, match, analysis }) {
  if (!athleteId) return null;
  const current = await loadMemory(athleteId);

  const todayStr = new Date().toISOString().slice(0, 10);
  const division = match?.ageCategory ?? profile?.competitionCategory ?? null;
  const withDivision = recordDivisionChange(current, division, todayStr);

  const system =
    "You maintain a bounded longitudinal memory of a junior tennis athlete's development for a coaching AI. " +
    "You will be given the CURRENT memory and NEW evidence from a just-analysed match. " +
    "REVISE AND MERGE — do not simply append. Promote a persistent pattern to 'improving' or 'resolved' when the " +
    "new evidence supports it. Update the narrative and trajectory to reflect the fuller picture. When a list is " +
    "already at capacity, drop the weakest/oldest entry to make room for anything more important. " +
    "Return ONLY a raw JSON object matching the given schema. Do NOT wrap in markdown code fences. " +
    "Start your response with { and end with }.";

  const userContent = `CURRENT MEMORY:
${JSON.stringify({
    narrative: withDivision.narrative,
    trajectory: withDivision.trajectory,
    persistentPatterns: withDivision.persistentPatterns,
    whatWorked: withDivision.whatWorked,
    whatDidNotWork: withDivision.whatDidNotWork,
    milestones: withDivision.milestones,
    standingConstraints: withDivision.standingConstraints,
  }, null, 2)}

NEW MATCH EVIDENCE (${todayStr}):
Opponent: ${match?.opponentName || "Unknown"} — ${match?.whoWonMatch === 1 ? "WIN" : "LOSS"}
Match summary: ${analysis?.matchSummary || "—"}
Critical findings: ${(analysis?.criticalFindings || []).map(f => `[${f.priority}] ${f.finding}`).join(" | ") || "None"}
Strengths reinforced: ${(analysis?.strengthsToReinforce || []).join(", ") || "None"}
Deferred priorities from this match: ${(analysis?.deferredPriorities || []).map(d => d.priority).join(", ") || "None"}

Respond with exactly this JSON structure:
{
  "narrative": "4-6 sentences: who she is as a player now and how she got here",
  "trajectory": "what has changed over the last 8-12 weeks, with evidence",
  "persistentPatterns": [{ "pattern": "...", "firstSeen": "YYYY-MM-DD", "lastSeen": "YYYY-MM-DD", "status": "active|improving|resolved", "evidence": "..." }],
  "whatWorked": [{ "intervention": "...", "evidence": "...", "date": "YYYY-MM-DD" }],
  "whatDidNotWork": [{ "intervention": "...", "evidence": "...", "date": "YYYY-MM-DD" }],
  "milestones": [{ "date": "YYYY-MM-DD", "text": "..." }],
  "standingConstraints": ["..."]
}`;

  const parsed = await callClaudeJSON({ system, userContent, maxTokens: 1500 });

  const merged = capMemory({
    ...withDivision,
    ...parsed,
    divisionHistory: withDivision.divisionHistory,
    shoutouts: withDivision.shoutouts,
    updatedAt: new Date().toISOString(),
  });

  setDoc(docRef(athleteId), merged).catch(e => console.error("athleteMemory save (match):", e));
  return merged;
}

// ── updateMemoryFromSeasonReport ─────────────────────────────────────────────
// Same revise-and-merge contract as updateMemoryFromMatch, but sourced from a
// full season report rather than a single match.
export async function updateMemoryFromSeasonReport(athleteId, { profile, report }) {
  if (!athleteId) return null;
  const current = await loadMemory(athleteId);

  const todayStr = new Date().toISOString().slice(0, 10);
  const division = profile?.competitionCategory ?? null;
  const withDivision = recordDivisionChange(current, division, todayStr);

  const system =
    "You maintain a bounded longitudinal memory of a junior tennis athlete's development for a coaching AI. " +
    "You will be given the CURRENT memory and a NEW season report covering multiple matches. " +
    "REVISE AND MERGE — do not simply append. Promote a persistent pattern to 'improving' or 'resolved' when the " +
    "new evidence supports it. Update the narrative and trajectory to reflect the fuller picture. When a list is " +
    "already at capacity, drop the weakest/oldest entry to make room for anything more important. " +
    "Return ONLY a raw JSON object matching the given schema. Do NOT wrap in markdown code fences. " +
    "Start your response with { and end with }.";

  const userContent = `CURRENT MEMORY:
${JSON.stringify({
    narrative: withDivision.narrative,
    trajectory: withDivision.trajectory,
    persistentPatterns: withDivision.persistentPatterns,
    whatWorked: withDivision.whatWorked,
    whatDidNotWork: withDivision.whatDidNotWork,
    milestones: withDivision.milestones,
    standingConstraints: withDivision.standingConstraints,
  }, null, 2)}

NEW SEASON REPORT (${todayStr}, ${report?.matchCount ?? "?"} matches, record ${report?.overallRecord || "—"}):
Developmental stage: ${report?.developmentalStageAssessment || "—"}
Consistent weaknesses: ${(report?.consistentWeaknesses || []).map(w => `${w.metric}: ${w.pattern}`).join(" | ") || "None"}
Improvements: ${(report?.improvements || []).map(i => `${i.metric}: ${i.trend}`).join(" | ") || "None"}
Next month priority: ${report?.nextMonthPriority || "—"}
Long-term outlook: ${report?.longTermOutlook || "—"}

Respond with exactly this JSON structure:
{
  "narrative": "4-6 sentences: who she is as a player now and how she got here",
  "trajectory": "what has changed over the last 8-12 weeks, with evidence",
  "persistentPatterns": [{ "pattern": "...", "firstSeen": "YYYY-MM-DD", "lastSeen": "YYYY-MM-DD", "status": "active|improving|resolved", "evidence": "..." }],
  "whatWorked": [{ "intervention": "...", "evidence": "...", "date": "YYYY-MM-DD" }],
  "whatDidNotWork": [{ "intervention": "...", "evidence": "...", "date": "YYYY-MM-DD" }],
  "milestones": [{ "date": "YYYY-MM-DD", "text": "..." }],
  "standingConstraints": ["..."]
}`;

  const parsed = await callClaudeJSON({ system, userContent, maxTokens: 1500 });

  const merged = capMemory({
    ...withDivision,
    ...parsed,
    divisionHistory: withDivision.divisionHistory,
    shoutouts: withDivision.shoutouts,
    updatedAt: new Date().toISOString(),
  });

  setDoc(docRef(athleteId), merged).catch(e => console.error("athleteMemory save (season):", e));
  return merged;
}

// ── pushShoutout ─────────────────────────────────────────────────────────────
// Code-only ring buffer — NO LLM call. Newest first, capped.
export async function pushShoutout(athleteId, text) {
  if (!athleteId || !text) return;
  try {
    const current = await loadMemory(athleteId);
    const shoutouts = [text, ...(current.shoutouts || [])].slice(0, CAPS.shoutouts);
    await setDoc(docRef(athleteId), { ...current, shoutouts, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("pushShoutout:", e);
  }
}

// ── deleteMemoryPattern ───────────────────────────────────────────────────────
// Removes one persistentPatterns entry by exact `pattern` text match, so a
// parent can correct the AI's memory if it records something wrong.
export async function deleteMemoryPattern(athleteId, pattern) {
  if (!athleteId || !pattern) return;
  const current = await loadMemory(athleteId);
  const persistentPatterns = (current.persistentPatterns || []).filter(p => p.pattern !== pattern);
  await setDoc(docRef(athleteId), { ...current, persistentPatterns, updatedAt: new Date().toISOString() });
}
