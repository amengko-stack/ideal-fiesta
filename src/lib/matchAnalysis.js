import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { buildAthleteContext } from "./athleteContext.js";
import { saveDeferredPriorities, refreshEscalations } from "./deferredPriorities.js";
import { callClaudeJSON } from "./ai.js";

// Match-analysis generation, shared by the classic MatchDetail and any future
// UI. Logic moved verbatim from MatchDetail (2026-07-09).
export async function generateMatchAnalysis(athleteId, match) {
  const v     = match.valissa    || {};
  const o     = match.opponent   || {};
  const calc  = match.calculated || {};
  const rally = calc.rallyDistribution || {};

  const context = await buildAthleteContext(athleteId);

  const acwr = context.sessionLogs.acwr;
  const loadLevel = acwr == null ? "Unknown"
    : acwr < 0.8  ? "Low"
    : acwr <= 1.3 ? "Optimal"
    : acwr <= 1.5 ? "High"
    : "Very High";

  const matchId = match.id || match.matchId;
  const dp = context.deferredPriorities;

  const scoreStr = (match.setScores?.p1 || [])
    .map((s, i) => `${s}–${match.setScores?.p2?.[i] ?? "?"}`)
    .join(", ") || "unknown";

  const safePct = (won, total) =>
    won != null && total > 0 ? Math.round(won / total * 100) + "%" : "—";

  const systemPrompt =
    "You are an expert youth tennis coach analyzing a competitive match for a developing athlete. " +
    "Your role is to provide developmental coaching insights — find patterns, highlight strengths, " +
    "identify priorities for growth. Be constructive and age-appropriate. " +
    "Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include ```json or ``` anywhere in your response. Start your response with { and end with }.";

  const userPrompt =
`Analyze this tennis match for ${context.athleteProfile?.name || "Valissa"}, age ${context.athleteProfile?.age || 12}.

MATCH: ${match.whoWonMatch === 1 ? "WIN" : "LOSS"} vs ${match.opponentName || "Opponent"} on ${match.matchStartTime ? new Date(match.matchStartTime).toLocaleDateString() : "unknown date"}
Score: ${scoreStr}

SERVICE STATS (Valissa / Opponent):
- 1st Serve %: ${v.firstServePct != null ? Math.round(v.firstServePct <= 1 ? v.firstServePct * 100 : v.firstServePct) : "—"}% / ${o.firstServePct != null ? Math.round(o.firstServePct <= 1 ? o.firstServePct * 100 : o.firstServePct) : "—"}%
- 1st Serve Pts Won: ${safePct(v.firstServePointsWon, v.firstServePoints)} / ${safePct(o.firstServePointsWon, o.firstServePoints)}
- 2nd Serve Pts Won: ${safePct(v.secondServePointsWon, v.secondServePoints)} / ${safePct(o.secondServePointsWon, o.secondServePoints)}
- Aces: ${v.aces ?? "—"} / ${o.aces ?? "—"}
- Double Faults: ${v.doubleFaults ?? "—"} / ${o.doubleFaults ?? "—"}

POINT STATS (Valissa / Opponent):
- Winners: ${v.winners ?? "—"} / ${o.winners ?? "—"}
- Unforced Errors: ${v.unforcedErrors ?? "—"} / ${o.unforcedErrors ?? "—"}
- Forced Errors: ${v.forcedErrors ?? "—"} / ${o.forcedErrors ?? "—"}
- W:UE Ratio: ${calc.wueRatio != null ? Number(calc.wueRatio).toFixed(2) : "—"} / ${o.unforcedErrors > 0 ? (o.winners / o.unforcedErrors).toFixed(2) : "—"}

RALLY PATTERNS:
- 0–4 shots: ${rally["0-4"]?.total ?? "—"} pts, Valissa win ${rally["0-4"]?.valissaWinPct != null ? rally["0-4"].valissaWinPct + "%" : "—"}
- 5–8 shots: ${rally["5-8"]?.total ?? "—"} pts, Valissa win ${rally["5-8"]?.valissaWinPct != null ? rally["5-8"].valissaWinPct + "%" : "—"}
- 9+ shots: ${rally["9+"]?.total ?? "—"} pts, Valissa win ${rally["9+"]?.valissaWinPct != null ? rally["9+"].valissaWinPct + "%" : "—"}

SHOT BREAKDOWN — Valissa (winners / errors):
- Forehand: ${v.fhWinner ?? 0}W / ${v.fhError ?? 0}E
- Backhand: ${v.bhWinner ?? 0}W / ${v.bhError ?? 0}E
- Return (combined): ${(v.fhReturnWinner ?? 0) + (v.bhReturnWinner ?? 0)}W / ${(v.fhReturnError ?? 0) + (v.bhReturnError ?? 0)}E
- Approach: ${v.approachWinner ?? 0}W / ${v.approachError ?? 0}E

ATHLETE CONTEXT:
- Training load this week (sRPE): ${context.sessionLogs.thisWeekSrpe}
- 4-week avg sRPE: ${context.sessionLogs.fourWeekAvgSrpe}
- ACWR: ${acwr ?? "N/A"} — Load level: ${loadLevel}
- Avg sleep (7 days): ${context.wellbeing.avgSleepHours != null ? context.wellbeing.avgSleepHours + "h" : "no data"}
- Avg mood: ${context.wellbeing.avgMood != null ? context.wellbeing.avgMood + "/5" : "no data"}
- Low mood flag: ${context.wellbeing.lowMoodFlag ? "YES — 3+ consecutive low mood days" : "No"}
- Upcoming tournament: ${context.tournamentStatus.hasUpcomingTournament ? `Yes, ${context.tournamentStatus.daysUntilTournament} days away` : "None"}
- Recent tournament (last 14 days): ${context.tournamentStatus.playedTournamentRecently ? `Yes, ${context.tournamentStatus.daysSinceTournament} days ago` : "No"}

EXISTING DEFERRED PRIORITIES (${dp.length} active):
${dp.length > 0 ? dp.map(d => `- ${d.priority} (deferred ${d.weeksDeferredCount} weeks)`).join("\n") : "None"}

Respond with exactly this JSON structure:
{
  "matchSummary": "2-3 sentence tactical overview of the match",
  "loadContext": "How her current training load, sleep and wellbeing context affects interpretation of this match",
  "criticalFindings": [
    { "finding": "specific observation", "priority": "critical|important|monitor" }
  ],
  "strengthsToReinforce": ["strength1", "strength2"],
  "rallyPatternAnalysis": "Analysis of short/medium/long rally win rates and what they reveal tactically",
  "serveAnalysis": "Specific serve observations and development priorities",
  "shotBreakdownInsights": "Key insights from shot-level winner and error patterns",
  "deferredPriorities": [
    { "priority": "short label", "reason": "why defer now", "resolveCondition": "when to address" }
  ],
  "parentNote": "Message for the parent — context, encouragement, what to watch for",
  "athleteNote": "Direct message for ${context.athleteProfile?.name || "Valissa"} — positive, motivating, 1-2 action points"
}`;

  const parsed = await callClaudeJSON({ system: systemPrompt, userContent: userPrompt, maxTokens: 6000 });

  await setDoc(doc(db, "athletes", athleteId, "matchAnalyses", matchId), {
    ...parsed,
    matchId,
    generatedAt: new Date().toISOString(),
  });

  if (parsed.deferredPriorities?.length > 0) {
    await saveDeferredPriorities(athleteId, parsed.deferredPriorities);
  }

  const escalatedItems = await refreshEscalations(athleteId);

  return { analysis: parsed, escalations: escalatedItems };
}
