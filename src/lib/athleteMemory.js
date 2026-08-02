import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { callClaudeJSON } from "./ai.js";
import { categoryLabel } from "./athleteIdentity.js";

// ─── ATHLETE DEVELOPMENT MEMORY ─────────────────────────────────────────────
// A bounded, persistent longitudinal store the AI reads before every analysis
// so it has a continuous understanding of the athlete rather than a single
// stateless prompt. Singleton doc, same pattern as plans/current and
// gamification/state: athletes/{athleteId}/memory/current.
//
// Caps are enforced IN CODE (capMemory), never left to the model's discretion,
// so prompt size stays flat no matter how long the season runs.

const CAPS = {
  persistentPatterns: 8,
  whatWorked: 6,
  whatDidNotWork: 6,
  milestones: 12,
  standingConstraints: 6,
  shoutouts: 5,
};

const docRef = (athleteId) => doc(db, "athletes", athleteId, "memory", "current");

export function emptyMemory() {
  return {
    updatedAt: null,
    version: 1,
    narrative: "",
    trajectory: "",
    persistentPatterns: [],
    whatWorked: [],
    whatDidNotWork: [],
    milestones: [],
    standingConstraints: [],
    divisionHistory: [],
    shoutouts: [],
  };
}

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

// ── capMemory ────────────────────────────────────────────────────────────────
// Pure. Enforces every array cap, dropping the OLDEST/weakest entries so the
// most recent (and therefore most relevant) evidence survives.
// - persistentPatterns: "active" status entries are kept over resolved ones
//   when trimming is needed; ties broken by most-recent lastSeen.
// - whatWorked / whatDidNotWork / milestones / standingConstraints / shoutouts:
//   simplest correct rule is most-recent-first, drop the tail (oldest).
export function capMemory(memory) {
  const m = { ...emptyMemory(), ...(memory || {}) };

  const byRecency = (arr, dateKey) =>
    [...arr].sort((a, b) => String(b?.[dateKey] || "").localeCompare(String(a?.[dateKey] || "")));

  // persistentPatterns: keep active/improving over resolved when over cap,
  // then most-recent lastSeen within each tier.
  const statusRank = { active: 0, improving: 1, resolved: 2 };
  const patterns = [...(m.persistentPatterns || [])]
    .sort((a, b) => {
      const r = (statusRank[a?.status] ?? 3) - (statusRank[b?.status] ?? 3);
      if (r !== 0) return r;
      return String(b?.lastSeen || "").localeCompare(String(a?.lastSeen || ""));
    })
    .slice(0, CAPS.persistentPatterns);

  const whatWorked = byRecency(m.whatWorked || [], "date").slice(0, CAPS.whatWorked);
  const whatDidNotWork = byRecency(m.whatDidNotWork || [], "date").slice(0, CAPS.whatDidNotWork);
  const milestones = byRecency(m.milestones || [], "date").slice(0, CAPS.milestones);

  const standingConstraints = [...(m.standingConstraints || [])]
    .filter(s => typeof s === "string" && s.trim())
    .slice(-CAPS.standingConstraints); // most recently appended survive

  const shoutouts = [...(m.shoutouts || [])].slice(0, CAPS.shoutouts); // already newest-first

  return {
    ...m,
    persistentPatterns: patterns,
    whatWorked,
    whatDidNotWork,
    milestones,
    standingConstraints,
    shoutouts,
    divisionHistory: [...(m.divisionHistory || [])],
  };
}

// ── memoryBlock ──────────────────────────────────────────────────────────────
// Pure. Renders the ATHLETE DEVELOPMENT MEMORY prompt block. Returns "" when
// there's no meaningful history yet, so early-season prompts stay clean.
export function memoryBlock(memory) {
  if (!memory) return "";
  const m = memory;
  const hasNarrative = !!(m.narrative && m.narrative.trim());
  const hasTrajectory = !!(m.trajectory && m.trajectory.trim());
  const hasPatterns = (m.persistentPatterns || []).length > 0;
  const hasWorked = (m.whatWorked || []).length > 0;
  const hasNotWorked = (m.whatDidNotWork || []).length > 0;
  const hasMilestones = (m.milestones || []).length > 0;
  const hasConstraints = (m.standingConstraints || []).length > 0;
  const hasDivisionHistory = (m.divisionHistory || []).length > 0;

  const anyContent = hasNarrative || hasTrajectory || hasPatterns || hasWorked ||
    hasNotWorked || hasMilestones || hasConstraints || hasDivisionHistory;
  if (!anyContent) return "";

  const lines = ["ATHLETE DEVELOPMENT MEMORY:"];

  if (hasNarrative) lines.push(`Who she is: ${m.narrative.trim()}`);
  if (hasTrajectory) lines.push(`Recent trajectory: ${m.trajectory.trim()}`);

  if (hasPatterns) {
    lines.push("Persistent patterns:");
    for (const p of m.persistentPatterns) {
      const span = p.firstSeen && p.lastSeen ? ` (${p.firstSeen} → ${p.lastSeen})` : "";
      lines.push(`  - [${p.status || "active"}] ${p.pattern}${span}${p.evidence ? ` — ${p.evidence}` : ""}`);
    }
  }

  if (hasWorked) {
    lines.push("What has worked:");
    for (const w of m.whatWorked) {
      lines.push(`  - ${w.intervention}${w.evidence ? ` — ${w.evidence}` : ""}${w.date ? ` (${w.date})` : ""}`);
    }
  }

  if (hasNotWorked) {
    lines.push("What has NOT worked:");
    for (const w of m.whatDidNotWork) {
      lines.push(`  - ${w.intervention}${w.evidence ? ` — ${w.evidence}` : ""}${w.date ? ` (${w.date})` : ""}`);
    }
  }

  if (hasMilestones) {
    lines.push("Milestones:");
    for (const ms of m.milestones) {
      lines.push(`  - ${ms.date ? `${ms.date}: ` : ""}${ms.text}`);
    }
  }

  if (hasConstraints) {
    lines.push("Standing constraints:");
    for (const c of m.standingConstraints) lines.push(`  - ${c}`);
  }

  if (hasDivisionHistory) {
    lines.push("Division history:");
    for (const d of m.divisionHistory) {
      const to    = d.to ? categoryLabel(d.to) : "current";
      const since = d.date ? ` (since ${d.date})` : "";
      // The first entry has no `from` — render it as a starting point rather
      // than an em-dash transition from nothing.
      lines.push(d.from
        ? `  - stepped up ${categoryLabel(d.from)} → ${to}${since}`
        : `  - ${to} — first recorded division${since}`);
    }
  }

  return lines.join("\n");
}

// ── recordDivisionChange ─────────────────────────────────────────────────────
// Pure. Maintained entirely in code — the model never writes divisionHistory.
// Appends an entry only when `category` differs from the most recent entry's
// `to` (or from the last-known category if there's no history yet). Closes
// out nothing to "to" retroactively; each entry's `to` is set at append time.
export function recordDivisionChange(memory, category, todayStr) {
  const m = { ...emptyMemory(), ...(memory || {}) };
  const history = [...(m.divisionHistory || [])];
  if (!category) return { ...m, divisionHistory: history };

  const last = history[history.length - 1];
  const currentKnown = last ? last.to : null;

  if (currentKnown === category) {
    // No change — no-op.
    return { ...m, divisionHistory: history };
  }

  history.push({ category, from: currentKnown ?? null, to: category, date: todayStr ?? null });
  return { ...m, divisionHistory: history };
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
