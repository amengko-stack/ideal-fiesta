import { toLocalDateStr } from "./dates.js";
import { sessionSRPE, computeMonotonyStrain, acwrStatus } from "./load.js";
import { weeklyFocus } from "./practiceFocus.js";

// ─── WEEKLY DIGEST — PURE CORE ───────────────────────────────────────────────
// The Sunday orchestrator's last step: one deterministic summary of the week
// (written to athletes/{id}/digests/{weekKey}), a small prompt that turns it
// into a parent- and athlete-readable note, and the push payload.
//
// Every number here comes from an existing pure helper — load.js owns sRPE,
// ACWR, monotony and strain; practiceFocus.js owns the weekly focus pick — so
// the digest can never report a different figure than the Load screen.
// No Firestore, no ai.js.

const DIGEST_NOTES_MAX_TOKENS = 700;

// Sunday of the Monday-anchored week starting at `weekKey`.
function endOfWeek(weekKey) {
  if (!weekKey) return null;
  const d = new Date(`${weekKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 6);
  return toLocalDateStr(d);
}

// Exclusive upper bound, so `date < weekEndExclusive` is a clean week filter.
function endOfWeekExclusive(weekKey) {
  if (!weekKey) return null;
  const d = new Date(`${weekKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 7);
  return toLocalDateStr(d);
}

const labelsOf = (items) =>
  (items || []).map(i => (typeof i === "string" ? i : i?.priority)).filter(Boolean);

// ── buildDigestData ──────────────────────────────────────────────────────────
// Pure. The whole digest except the two LLM-written notes.
//
//   ctx            — assembleAthleteContext output
//   planData       — toPlanData output for this week's plan (may be null)
//   hygieneResults — { merged, resolved: [doc|label], escalated: [doc|label] }
//   weekKey        — the week's Monday, YYYY-MM-DD (dates.currentWeekKey())
//   now            — Date; drives generatedAt and the monotony/strain window
//   matches        — optional match list; falls back to ctx.matches / recentMatch
//   priorities     — optional raw priority docs (they carry `status`, which the
//                    projection in ctx.deferredPriorities drops)
export function buildDigestData({
  ctx,
  planData = null,
  hygieneResults = null,
  weekKey,
  now = new Date(),
  matches = null,
  priorities = null,
  athleteName = null,
  generatedBy = "weeklyReview",
} = {}) {
  const weekStart = weekKey ?? null;
  const weekEnd   = endOfWeek(weekKey);
  const weekEndEx = endOfWeekExclusive(weekKey);

  // ── load ───────────────────────────────────────────────────────────────────
  const sessions = ctx?.sessionLogs?.sessions || [];
  const inWeek = (dateStr) =>
    !!dateStr && (!weekStart || dateStr >= weekStart) && (!weekEndEx || dateStr < weekEndEx);
  const weekSessions = sessions.filter(s => inWeek(s.date));

  const byType = {};
  for (const s of weekSessions) {
    const type = s.type || "other";
    byType[type] = (byType[type] ?? 0) + (s.srpe ?? sessionSRPE(s));
  }

  const acwr = ctx?.sessionLogs?.acwr ?? null;
  const { monotony, strain } = computeMonotonyStrain(sessions, now);

  const load = {
    thisWeekSRPE: ctx?.sessionLogs?.thisWeekSrpe ?? null,
    fourWeekAvg:  ctx?.sessionLogs?.fourWeekAvgSrpe ?? null,
    acwr,
    acwrStatus:   acwrStatus(acwr),
    monotony,
    strain,
    sessionCount: weekSessions.length,
    byType,
  };

  // ── wellbeing ──────────────────────────────────────────────────────────────
  const w = ctx?.wellbeing || {};
  const wellbeing = {
    checkinCount: (w.entries || []).length,
    avgSleep:     w.avgSleepHours ?? null,
    avgMood:      w.avgMood ?? null,
    avgSoreness:  w.avgSoreness ?? null,
    lowMoodFlag:  !!w.lowMoodFlag,
    lowSleepFlag: !!w.lowSleepFlag,
  };

  // ── matches ────────────────────────────────────────────────────────────────
  const matchSource = matches
    ?? ctx?.matches
    ?? (ctx?.recentMatch ? [ctx.recentMatch] : []);
  const weekMatches = matchSource
    .map(m => ({
      matchId:      m.id ?? m.matchId ?? null,
      opponentName: m.opponentName ?? null,
      date:         m.matchStartTime ? String(m.matchStartTime).slice(0, 10) : null,
      won:          m.whoWonMatch === 1,
    }))
    .filter(m => inWeek(m.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // ── priorities ─────────────────────────────────────────────────────────────
  // ctx.deferredPriorities is a projection that drops `status`; weeklyFocus
  // needs it, so default the projection's entries to the "active" they were
  // filtered on.
  const priorityDocs = priorities
    ?? (ctx?.deferredPriorities || []).map(p => ({ status: "active", ...p }));
  const focus = weeklyFocus(priorityDocs);

  const prioritiesSection = {
    open: priorityDocs.filter(p => p?.status === "active" || p?.status === "escalated").length,
    escalatedThisRun: labelsOf(hygieneResults?.escalated),
    resolvedThisRun:  labelsOf(hygieneResults?.resolved),
    weeklyFocus: focus?.priority ?? null,
  };

  // ── injuries ───────────────────────────────────────────────────────────────
  const injuries = {
    openCount:    (ctx?.injuries?.open || []).length,
    flagHeadline: ctx?.injuries?.flag?.headline ?? null,
  };

  // ── plan ───────────────────────────────────────────────────────────────────
  const plan = {
    sessionType:     planData?.sessionType ?? null,
    sessionDuration: planData?.sessionDuration ?? null,
    exerciseCount:   (planData?.plan || []).length,
    coachNote:       planData?.coachNote ?? null,
  };

  return {
    weekKey: weekKey ?? null,
    weekStart,
    weekEnd,
    generatedAt: now.toISOString(),
    generatedBy,
    athleteName: athleteName ?? ctx?.athleteProfile?.name ?? null,
    load,
    wellbeing,
    matches: weekMatches,
    priorities: prioritiesSection,
    injuries,
    plan,
  };
}

// ── buildDigestNotesPrompt ───────────────────────────────────────────────────
// Pure. Returns { system, prompt, maxTokens }. Tone conventions are the ones
// matchAnalysis.js already established for parentNote / athleteNote, so the
// weekly digest reads like the rest of the app rather than a second voice.
export function buildDigestNotesPrompt(digestData, athleteName) {
  const name = athleteName || digestData?.athleteName || "Valissa";
  const d = digestData || {};
  const load = d.load || {};
  const well = d.wellbeing || {};
  const prio = d.priorities || {};
  const plan = d.plan || {};
  const num = (x, suffix = "") => (x == null ? "—" : `${x}${suffix}`);

  const system =
    "You are an expert youth tennis coach writing the weekly summary a parent reads on a Sunday morning. " +
    "Be constructive, specific and age-appropriate. Work only from the numbers given — never invent an event, " +
    "a result or a statistic that is not below. " +
    "Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include ```json or ``` anywhere in your response. Start your response with { and end with }.";

  const byType = Object.entries(load.byType || {})
    .map(([type, srpe]) => `${type} ${srpe}`)
    .join(", ") || "none";

  const matchLines = (d.matches || []).length > 0
    ? d.matches.map(m => `- ${m.date || "unknown date"}: ${m.won ? "WIN" : "LOSS"} vs ${m.opponentName || "Unknown"}`).join("\n")
    : "- None this week.";

  const prompt = `WEEK IN REVIEW for ${name} — week of ${d.weekStart || "—"} to ${d.weekEnd || "—"}

TRAINING LOAD:
- This week sRPE: ${num(load.thisWeekSRPE)} (4-week average ${num(load.fourWeekAvg)})
- ACWR: ${num(load.acwr)} — ${load.acwrStatus?.label || "no data"}
- Monotony: ${num(load.monotony)} | Strain: ${num(load.strain)}
- Sessions logged: ${num(load.sessionCount)} (sRPE by type: ${byType})

WELLBEING (${num(well.checkinCount)} check-ins):
- Average sleep: ${num(well.avgSleep, "h")}
- Average mood: ${num(well.avgMood, "/5")}
- Average soreness: ${num(well.avgSoreness, "/5")}
- Low mood flag: ${well.lowMoodFlag ? "YES — 3+ consecutive low mood days" : "No"}
- Short sleep flag: ${well.lowSleepFlag ? "YES — repeatedly under 7h" : "No"}

MATCHES:
${matchLines}

FOCUS PRIORITIES:
- This week's focus: ${prio.weeklyFocus || "None set"}
- Open priorities: ${num(prio.open)}
- Resolved this week: ${(prio.resolvedThisRun || []).join(", ") || "None"}
- Escalated this week: ${(prio.escalatedThisRun || []).join(", ") || "None"}

OPEN INJURIES: ${d.injuries?.openCount ? `${d.injuries.openCount} — ${d.injuries.flagHeadline || "no guidance recorded"}` : "None"}

SUNDAY PLAN PRESCRIBED:
- Session: ${plan.sessionType || "—"}${plan.sessionDuration ? ` · ${plan.sessionDuration} min` : ""} · ${num(plan.exerciseCount)} exercises
- Coach note: ${plan.coachNote || "—"}

Respond with exactly this JSON structure:
{
  "parentNote": "Message for the parent — context, encouragement, and what to watch for in the week ahead. 3-5 sentences. Plain language, no jargon: never use the words sRPE, ACWR, monotony or strain — describe what they mean instead.",
  "athleteNote": "Direct message for ${name} — 1-2 sentences, written to her, positive and motivating."
}`;

  return { system, prompt, maxTokens: DIGEST_NOTES_MAX_TOKENS };
}

// ── digestPushPayload ────────────────────────────────────────────────────────
// Pure and deterministic. The parent push for the finished digest. The body is
// the first sentence of parentNote; when the notes call failed (or is not there
// yet) it degrades to the stats the digest always has.
export function digestPushPayload(digest) {
  const d = digest || {};
  const name = d.athleteName || "Valissa";
  const title = `${name}'s week in review`;

  const note = typeof d.parentNote === "string" ? d.parentNote.trim() : "";
  if (note) {
    const firstSentence = note.match(/^[\s\S]*?[.!?](?=\s|$)/);
    return { title, body: (firstSentence ? firstSentence[0] : note).trim() };
  }

  const load = d.load || {};
  const parts = [];
  parts.push(`${load.sessionCount ?? 0} session${load.sessionCount === 1 ? "" : "s"}`);
  if (load.thisWeekSRPE != null) parts.push(`load ${load.thisWeekSRPE}`);
  if (load.acwrStatus?.label && load.acwrStatus.label !== "No data") parts.push(load.acwrStatus.label);
  if ((d.matches || []).length > 0) {
    parts.push(`${d.matches.length} match${d.matches.length === 1 ? "" : "es"}`);
  }
  if (d.plan?.sessionType) parts.push(`${d.plan.sessionType} session planned`);

  return { title, body: `${parts.join(" · ")}.` };
}
