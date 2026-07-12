import { describe, it, expect } from "vitest";
import { buildCoachReport } from "./coachReport.js";
import { createMatch, recordPoint, finalizeMatch } from "./liveScoring.js";

const fullMatch = {
  opponentName: "Rival",
  valissaName: "Valissa",
  whoWonMatch: 1,
  matchStartTime: "2026-07-10T09:00:00.000Z",
  durationMin: 74,
  setScores: { p1: [6, 6], p2: [3, 4] },
  valissa: {
    firstServePct: 62.5, firstServePoints: 40, firstServePointsWon: 28,
    secondServePoints: 24, secondServePointsWon: 11,
    aces: 3, doubleFaults: 4,
    firstReturnPoints: 30, firstReturnPointsWon: 12,
    secondReturnPoints: 20, secondReturnPointsWon: 11,
    breakPoints: 7, breakPointsWon: 4, breakPointsFaced: 5, breakPointsSaved: 3,
    winners: 18, unforcedErrors: 12, forcedErrors: 6,
    fhWinner: 9, bhWinner: 4, fhError: 5, bhError: 6,
  },
  calculated: {
    wueRatio: 1.5,
    rallyDistribution: {
      "0-4": { total: 40, valissaWins: 26, valissaWinPct: 65 },
      "5-8": { total: 25, valissaWins: 12, valissaWinPct: 48 },
      "9+":  { total: 11, valissaWins: 6, valissaWinPct: 54.5 },
    },
  },
};

describe("buildCoachReport", () => {
  it("renders every section for a fully-tagged match", () => {
    const text = buildCoachReport(fullMatch);
    expect(text).toContain("MATCH REPORT — Valissa vs Rival");
    expect(text).toContain("Win 6-3, 6-4");
    expect(text).toContain("74 min");
    expect(text).toContain("1st in 63%");
    expect(text).toContain("1st-serve pts won 70%");
    expect(text).toContain("Aces 3 · Double faults 4");
    expect(text).toContain("vs 1st serve won 40%");
    expect(text).toContain("Converted 4/7 · Saved 3/5 faced");
    expect(text).toContain("Winners 18 (FH 9 · BH 4)");
    expect(text).toContain("Winner:unforced ratio 1.5");
    expect(text).toContain("0-4: 65% of 40 pts");
  });

  it("appends AI notes when an analysis is provided", () => {
    const text = buildCoachReport(fullMatch, {
      matchSummary: "Strong first-strike tennis.",
      criticalFindings: [{ finding: "Second serve sat up short", priority: "important" }],
      strengthsToReinforce: ["FH down the line"],
    });
    expect(text).toContain("COACH NOTES (AI)");
    expect(text).toContain("• Second serve sat up short");
    expect(text).toContain("Strengths: FH down the line");
  });

  it("omits empty sections for a quick-mode match", () => {
    const text = buildCoachReport({
      opponentName: "Rival", whoWonMatch: 2,
      setScores: { p1: [4], p2: [6] },
      valissa: { firstServePct: 55, firstServePoints: 20, firstServePointsWon: 10, secondServePoints: 10, secondServePointsWon: 4, aces: 1, doubleFaults: 2 },
      calculated: {},
    });
    expect(text).toContain("Loss 4-6");
    expect(text).toContain("SERVE");
    expect(text).not.toContain("WINNERS & ERRORS");
    expect(text).not.toContain("RALLY LENGTH");
    expect(text).not.toContain("COACH NOTES");
  });

  it("works end-to-end on a live-scored match doc", () => {
    let s = createMatch({ format: "set1", opponentName: "Ana" });
    s = recordPoint(s, { serve: 1, outcome: "ace" });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w", shot: "fh", rallyLength: 3 });
    s = recordPoint(s, { winner: 1, serve: 2 });
    s = recordPoint(s, { winner: 1, serve: 1 });
    for (let g = 0; g < 5; g++) for (let i = 0; i < 4; i++) s = recordPoint(s, { winner: 1, serve: 1 });
    const doc = finalizeMatch(s, { durationMin: 31 });
    const text = buildCoachReport(doc);
    expect(text).toContain("Valissa vs Ana");
    expect(text).toContain("Win 6-0");
    expect(text).toContain("31 min");
    expect(text).toContain("Aces 1");
  });
});
