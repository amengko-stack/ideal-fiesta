import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { callClaudeJSON } from "./ai.js";
import { buildAthleteContext } from "./athleteContext.js";
import { resolveIdentity, categoryLabel } from "./athleteIdentity.js";
import { loadLevelFromAcwr } from "./load.js";
import { updateMemoryFromSeasonReport } from "./athleteMemory.js";

// Season-report generation, shared by the classic MatchesTab and the new
// MatchesScreen. Logic moved verbatim from MatchesTab (2026-07-08).
export async function generateSeasonReport(athleteId, matches) {
  const chronoMatches = [...matches].sort((a, b) => {
    if (!a.matchStartTime) return 1;
    if (!b.matchStartTime) return -1;
    return a.matchStartTime.localeCompare(b.matchStartTime);
  });

  const matchesWithAnalysis = [];
  for (const match of chronoMatches) {
    const snap = await getDoc(doc(db, "athletes", athleteId, "matchAnalyses", match.id));
    if (snap.exists()) matchesWithAnalysis.push({ ...match, analysis: snap.data() });
  }

  if (matchesWithAnalysis.length === 0) {
    throw new Error("No match analyses found — generate AI analysis for at least one match first.");
  }

  const ctx = await buildAthleteContext(athleteId);
  const identity = resolveIdentity(ctx.athleteProfile || {});
  const profileCategory = ctx.athleteProfile?.competitionCategory;

  const fmtMatchScore = m => {
    const sc = m.setScores;
    if (sc?.p1?.length) return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
    return "—";
  };

  const matchLines = matchesWithAnalysis.map((m, idx) => {
    const date = m.matchStartTime
      ? new Date(m.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : "Unknown date";
    const result = m.whoWonMatch === 1 ? "Win" : "Loss";
    const v = m.valissa ?? {};
    const o = m.opponent ?? {};
    const calc = m.calculated ?? {};
    const rally = calc.rallyDistribution ?? {};
    const findings = (m.analysis?.criticalFindings ?? []).map(f => `${f.priority}: ${f.finding}`).join(" | ");
    return [
      `Match ${idx + 1} — ${date} vs ${m.opponentName || "Opponent"} — ${result} ${fmtMatchScore(m)}`,
      `Division: ${categoryLabel(m.ageCategory ?? profileCategory)}`,
      `Valissa: W=${v.winners ?? 0} UE=${v.unforcedErrors ?? 0} FE=${v.forcedErrors ?? 0} 1st serve=${v.firstServePct != null ? Number(v.firstServePct).toFixed(1) : "—"}% DF=${v.doubleFaults ?? 0}`,
      `Opponent: W=${o.winners ?? 0} UE=${o.unforcedErrors ?? 0}`,
      `Rally win rates: 0-4shots=${rally["0-4"]?.valissaWinPct ?? "—"}% 5-8shots=${rally["5-8"]?.valissaWinPct ?? "—"}% 9+shots=${rally["9+"]?.valissaWinPct ?? "—"}%`,
      `W:UE ratio: ${calc.wueRatio ?? "—"}`,
      findings ? `AI analysis critical findings: ${findings}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const memorySection = ctx.memoryText ? `\n${ctx.memoryText}\n` : "";

  const userMsg = `${ctx.athleteProfile?.identityText || `ATHLETE: ${identity.name} · female · age ${identity.age ?? "unknown"}`}
${memorySection}
Season review across ${matchesWithAnalysis.length} matches:

${matchLines}

Current training load context:
Weekly sRPE: ${ctx.sessionLogs?.thisWeekSrpe ?? "—"} | ACWR: ${ctx.sessionLogs?.acwr ?? "—"} | Load level: ${loadLevelFromAcwr(ctx.sessionLogs?.acwr)}`;

  const ageDescriptor = identity.age != null ? `a ${identity.age}-year-old` : "a junior";
  const upNote = identity.isPlayingUp
    ? ` She is playing UP by ${identity.playingUp} year${identity.playingUp === 1 ? "" : "s"} — weigh her results against opponents who may be that much older and further developed.`
    : "";

  const systemPrompt = `You are a junior tennis development coach conducting a season review for ${identity.name}, ${ageDescriptor} female athlete competing in ${identity.categoryLabel}.${upNote} Analyze the following match statistics across multiple matches in chronological order. Return ONLY a raw JSON object — no markdown fences, start with { and end with }:

{
  "totalMatchesAnalyzed": integer,
  "overallRecord": "W-L format",
  "consistentWeaknesses": [
    {
      "metric": "short label",
      "pattern": "what the data shows across matches with specific numbers",
      "urgency": "high | medium | low",
      "trainingFocus": "specific training recommendation"
    }
  ],
  "improvements": [
    {
      "metric": "short label",
      "trend": "specific improvement observed with numbers from earliest to latest match"
    }
  ],
  "inconsistencies": [
    {
      "metric": "short label",
      "observation": "good in some matches poor in others — possible cause"
    }
  ],
  "developmentalStageAssessment": "paragraph on where she is as a developing junior athlete based on all match data — contextualised for age ${identity.age ?? "her age"} and her ${identity.categoryLabel} division",
  "nextMonthPriority": "the single most important technical or physical development focus for the next 30 days with specific reasoning from the data",
  "longTermOutlook": "2-3 sentences on trajectory and what consistent training in her weak areas could produce over 6-12 months",
  "parentNote": "one encouraging paragraph for the parent contextualising the season so far",
  "divisionContext": "how the step up in division across this season's matches (if any) affects the reading of her results — narrate any transition between age divisions rather than treating the season as homogeneous"
}`;

  const parsed = await callClaudeJSON({ system: systemPrompt, userContent: userMsg, maxTokens: 4000 });

  const report = { ...parsed, generatedAt: new Date().toISOString(), matchCount: matchesWithAnalysis.length };
  await setDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest"), report);

  // Memory update is an enhancement, never a reason for report generation to fail.
  try {
    await updateMemoryFromSeasonReport(athleteId, { profile: ctx.athleteProfile, report });
  } catch (e) {
    console.error("athleteMemory update (season):", e);
  }

  return report;
}
