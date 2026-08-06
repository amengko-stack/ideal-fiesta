import { categoryLabel } from "./athleteIdentity.js";

// ─── ATHLETE DEVELOPMENT MEMORY — PURE CORE ─────────────────────────────────
// The shape, the caps and the prompt rendering. Deliberately free of any
// Firestore or network import so it can be unit tested in the default node
// environment, the same way load.js / plist.js / liveScoring.js are.
// Firestore and LLM access live in athleteMemory.js, which re-exports these.

export const CAPS = {
  persistentPatterns: 8,
  whatWorked: 6,
  whatDidNotWork: 6,
  milestones: 12,
  standingConstraints: 6,
  shoutouts: 5,
};

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

// ── MEMORY UPDATE PROMPTS ────────────────────────────────────────────────────
// The match and season prompt bodies moved here verbatim from athleteMemory.js,
// joined by a third `weeklyReview` variant for the scheduled orchestrator. All
// three share the same head (the current memory as JSON), the same schema
// footer and the same revise-and-merge system prompt — only the evidence block
// and one clause of the system prompt differ, which is exactly what kept the
// two originals from drifting apart.

const MEMORY_MAX_TOKENS = 1500;

// The subset of the memory the model is allowed to revise. divisionHistory and
// shoutouts are maintained in code and deliberately withheld.
const memoryForPrompt = (m) => ({
  narrative: m.narrative,
  trajectory: m.trajectory,
  persistentPatterns: m.persistentPatterns,
  whatWorked: m.whatWorked,
  whatDidNotWork: m.whatDidNotWork,
  milestones: m.milestones,
  standingConstraints: m.standingConstraints,
});

const MEMORY_SCHEMA_BLOCK = `Respond with exactly this JSON structure:
{
  "narrative": "4-6 sentences: who she is as a player now and how she got here",
  "trajectory": "what has changed over the last 8-12 weeks, with evidence",
  "persistentPatterns": [{ "pattern": "...", "firstSeen": "YYYY-MM-DD", "lastSeen": "YYYY-MM-DD", "status": "active|improving|resolved", "evidence": "..." }],
  "whatWorked": [{ "intervention": "...", "evidence": "...", "date": "YYYY-MM-DD" }],
  "whatDidNotWork": [{ "intervention": "...", "evidence": "...", "date": "YYYY-MM-DD" }],
  "milestones": [{ "date": "YYYY-MM-DD", "text": "..." }],
  "standingConstraints": ["..."]
}`;

const SOURCE_CLAUSE = {
  match:        "NEW evidence from a just-analysed match",
  season:       "a NEW season report covering multiple matches",
  weeklyReview: "a NEW weekly review covering the week's training load, wellbeing, plan and focus priorities",
};

const memorySystemPrompt = (kind) =>
  "You maintain a bounded longitudinal memory of a junior tennis athlete's development for a coaching AI. " +
  `You will be given the CURRENT memory and ${SOURCE_CLAUSE[kind] ?? SOURCE_CLAUSE.match}. ` +
  "REVISE AND MERGE — do not simply append. Promote a persistent pattern to 'improving' or 'resolved' when the " +
  "new evidence supports it. Update the narrative and trajectory to reflect the fuller picture. When a list is " +
  "already at capacity, drop the weakest/oldest entry to make room for anything more important. " +
  "Return ONLY a raw JSON object matching the given schema. Do NOT wrap in markdown code fences. " +
  "Start your response with { and end with }.";

const list = (arr, render, empty = "None") => {
  const parts = (arr || []).map(render).filter(Boolean);
  return parts.length ? parts.join(" | ") : empty;
};

function evidenceBlock(evidence, todayStr) {
  const kind = evidence?.kind;

  if (kind === "season") {
    const report = evidence.report;
    return `NEW SEASON REPORT (${todayStr}, ${report?.matchCount ?? "?"} matches, record ${report?.overallRecord || "—"}):
Developmental stage: ${report?.developmentalStageAssessment || "—"}
Consistent weaknesses: ${(report?.consistentWeaknesses || []).map(w => `${w.metric}: ${w.pattern}`).join(" | ") || "None"}
Improvements: ${(report?.improvements || []).map(i => `${i.metric}: ${i.trend}`).join(" | ") || "None"}
Next month priority: ${report?.nextMonthPriority || "—"}
Long-term outlook: ${report?.longTermOutlook || "—"}`;
  }

  if (kind === "weeklyReview") {
    // `week` is the deterministic digest built by digestCore.buildDigestData,
    // so the orchestrator can hand the same object to the digest and to memory.
    const w = evidence.week || {};
    const load = w.load || {};
    const well = w.wellbeing || {};
    const prio = w.priorities || {};
    const plan = w.plan || {};
    const num = (x, suffix = "") => (x == null ? "—" : `${x}${suffix}`);

    return `NEW WEEKLY REVIEW (${todayStr}, week of ${w.weekKey || "—"}):
Training load: sRPE ${num(load.thisWeekSRPE)} vs 4-week average ${num(load.fourWeekAvg)}, ACWR ${num(load.acwr)} (${load.acwrStatus?.label || "—"}), ${num(load.sessionCount)} sessions
Wellbeing: ${num(well.checkinCount)} check-ins — sleep ${num(well.avgSleep, "h")}, mood ${num(well.avgMood, "/5")}, soreness ${num(well.avgSoreness, "/5")}${well.lowMoodFlag ? " — LOW MOOD 3+ consecutive days" : ""}${well.lowSleepFlag ? " — persistent short sleep" : ""}
Matches played: ${list(w.matches, m => `${m.won ? "WIN" : "LOSS"} vs ${m.opponentName || "Unknown"}${m.date ? ` (${m.date})` : ""}`)}
Plan prescribed: ${plan.sessionType || "—"}${plan.sessionDuration ? `, ${plan.sessionDuration} min` : ""}${plan.exerciseCount != null ? `, ${plan.exerciseCount} exercises` : ""}
Plan rationale: ${plan.coachNote || "—"}
This week's focus priority: ${prio.weeklyFocus || "None"}
Priorities resolved this week: ${list(prio.resolvedThisRun, p => p)}
Priorities escalated this week: ${list(prio.escalatedThisRun, p => p)}
Open priorities remaining: ${prio.open ?? "—"}
Open injuries: ${w.injuries?.openCount ? `${w.injuries.openCount} — ${w.injuries.flagHeadline || "no guidance recorded"}` : "None"}`;
  }

  // Default: match evidence.
  const { match, analysis } = evidence || {};
  return `NEW MATCH EVIDENCE (${todayStr}):
Opponent: ${match?.opponentName || "Unknown"} — ${match?.whoWonMatch === 1 ? "WIN" : "LOSS"}
Match summary: ${analysis?.matchSummary || "—"}
Critical findings: ${(analysis?.criticalFindings || []).map(f => `[${f.priority}] ${f.finding}`).join(" | ") || "None"}
Strengths reinforced: ${(analysis?.strengthsToReinforce || []).join(", ") || "None"}
Deferred priorities from this match: ${(analysis?.deferredPriorities || []).map(d => d.priority).join(", ") || "None"}`;
}

// ── buildMemoryUpdatePrompt ──────────────────────────────────────────────────
// Pure. Returns { system, userContent, maxTokens }.
//
// `currentMemory` is the memory AFTER recordDivisionChange has run (that is what
// athleteMemory.js passes), so the JSON the model sees is the one the merge will
// be applied on top of.
//
// `evidence` is a tagged union:
//   { kind: 'match',        todayStr?, match, analysis }
//   { kind: 'season',       todayStr?, report }
//   { kind: 'weeklyReview', todayStr?, week }   // week = digestCore's digest data
export function buildMemoryUpdatePrompt(currentMemory, evidence) {
  const m = { ...emptyMemory(), ...(currentMemory || {}) };
  const kind = evidence?.kind === "season" || evidence?.kind === "weeklyReview"
    ? evidence.kind
    : "match";
  const todayStr = evidence?.todayStr ?? new Date().toISOString().slice(0, 10);

  const userContent = `CURRENT MEMORY:
${JSON.stringify(memoryForPrompt(m), null, 2)}

${evidenceBlock(evidence, todayStr)}

${MEMORY_SCHEMA_BLOCK}`;

  return { system: memorySystemPrompt(kind), userContent, maxTokens: MEMORY_MAX_TOKENS };
}

// ── mergeMemoryUpdate ────────────────────────────────────────────────────────
// Pure. Folds the model's reply onto the current memory and re-applies every
// cap. divisionHistory and shoutouts are restored from the current memory after
// the spread — the model must never be able to rewrite either.
export function mergeMemoryUpdate(currentMemory, parsed, nowIso) {
  const base = { ...emptyMemory(), ...(currentMemory || {}) };
  return capMemory({
    ...base,
    ...(parsed || {}),
    divisionHistory: base.divisionHistory,
    shoutouts:       base.shoutouts,
    updatedAt:       nowIso ?? new Date().toISOString(),
  });
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
