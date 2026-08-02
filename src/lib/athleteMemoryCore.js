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
