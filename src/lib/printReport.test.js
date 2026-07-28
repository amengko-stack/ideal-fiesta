import { describe, it, expect } from "vitest";
import { buildReportHtml } from "./printReport.js";
import { computeMatchStats, statsFromAggregates } from "./matchStats.js";

const pt = (o = {}) => ({
  whoServed: String(o.server ?? 1),
  whoWonPoint: String(o.won ?? 1),
  whoHitShot: String(o.hitter ?? o.won ?? 1),
  serveType: o.serveType ?? 1,
  pointWonType: o.type ?? "w",
  pointShotType: o.shot ?? "fh",
  rallyLength: o.rally ?? 3,
  breakPoint: o.bp ? 1 : 0,
});

const log = [
  pt({ won: 1, shot: "fh" }),
  pt({ won: 1, shot: "fhDS" }),
  pt({ won: 2, hitter: 1, type: "ufE", shot: "bh" }),
  pt({ won: 2, hitter: 1, type: "fE", shot: "bhV", rally: 9 }),
  pt({ server: 2, won: 2, serveType: 2 }),
];

const match = {
  valissaName: "Valissa", opponentName: "Rival", whoWonMatch: 1,
  matchStartTime: "2026-07-10T09:00:00.000Z", durationMin: 74,
  setScores: { p1: [6, 6], p2: [3, 4] },
};

const analysis = {
  matchSummary: "Aggressive first-strike tennis.",
  criticalFindings: [{ finding: "Second serve sat short", priority: "important" }],
  strengthsToReinforce: ["Forehand down the line"],
  serveAnalysis: "Good first-serve percentage.",
  resolvedPriorities: [{ priority: "Second serve consistency", evidence: "2nd serve points won 56%" }],
};

describe("buildReportHtml", () => {
  const stats = computeMatchStats(log);
  const html = buildReportHtml({ match, stats, analysis });

  it("heads the report with the players, result and meta", () => {
    expect(html).toContain("Valissa vs Rival");
    expect(html).toContain("Win 6-3, 6-4");
    expect(html).toContain("74 min");
    expect(html).toContain("10 July 2026");
  });

  it("includes the full match stats table", () => {
    expect(html).toContain("Match stats");
    expect(html).toContain("1st Serve %");
    expect(html).toContain("Total Points Won");
    expect(html).toContain("9+ Touches");
  });

  it("includes the shot breakdown split by outcome", () => {
    expect(html).toContain("Shot stats");
    expect(html).toContain("Winners");
    expect(html).toContain("Forced errors");
    expect(html).toContain("Unforced errors");
    expect(html).toContain("Drop Shot");
  });

  it("includes the AI coaching analysis", () => {
    expect(html).toContain("AI coaching analysis");
    expect(html).toContain("Aggressive first-strike tennis.");
    expect(html).toContain("Second serve sat short");
    expect(html).toContain("Forehand down the line");
    expect(html).toContain("Good first-serve percentage.");
    expect(html).toContain("Cleared from the focus list");
    expect(html).toContain("Second serve consistency");
  });

  it("omits the analysis section entirely when there is none", () => {
    const bare = buildReportHtml({ match, stats, analysis: null });
    expect(bare).not.toContain("AI coaching analysis");
    expect(bare).toContain("Match stats");
  });

  it("drops log-only sections for aggregate-only matches", () => {
    const agg = statsFromAggregates({ valissa: { winners: 4, firstServePoints: 10, firstServePointsWon: 6 }, opponent: { winners: 2 } });
    const out = buildReportHtml({ match, stats: agg, analysis: null });
    expect(out).not.toContain("Shot stats");
    expect(out).not.toContain("Touches");
    expect(out).toContain("Match stats");
  });

  it("escapes names so a stray character can't break the markup", () => {
    const out = buildReportHtml({
      match: { ...match, opponentName: '<script>"x"</script>' },
      stats, analysis: null,
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
