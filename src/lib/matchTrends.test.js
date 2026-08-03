import { describe, it, expect } from "vitest";
import { TREND_METRICS, metricSeries, trendSummary, describeTrend } from "./matchTrends.js";

// Same canonical match shape as priorityMetrics.test.js — trends read through
// readMetric, so the fixtures have to satisfy its minSample guards.
const match = ({ id, date, won = true, secondServePoints = 12, secondServePointsWonPct = 50, ue = 18 } = {}) => ({
  id,
  matchStartTime: `${date}T10:00:00Z`,
  opponentName: `Opp ${id}`,
  whoWonMatch: won ? 1 : 2,
  valissa: {
    firstServePct: 71.4,
    firstServePoints: 30, firstServePointsWon: 20,
    secondServePoints, secondServePointsWon: 6,
    doubleFaults: 3, aces: 1,
    winners: 12, unforcedErrors: ue, forcedErrors: 6,
  },
  calculated: { wueRatio: 0.67, secondServePointsWonPct },
});

const series = (pcts) => metricSeries(
  pcts.map((p, i) => match({ id: `m${i}`, date: `2026-0${i + 1}-01`, secondServePointsWonPct: p })),
  "secondServePointsWonPct",
);

describe("metricSeries", () => {
  it("returns points oldest first regardless of input order", () => {
    const out = metricSeries([
      match({ id: "b", date: "2026-03-01", secondServePointsWonPct: 60 }),
      match({ id: "a", date: "2026-01-01", secondServePointsWonPct: 40 }),
    ], "secondServePointsWonPct");
    expect(out.map(p => p.matchId)).toEqual(["a", "b"]);
    expect(out.map(p => p.value)).toEqual([40, 60]);
  });

  it("carries the label fields a chart tooltip needs", () => {
    const [p] = metricSeries([match({ id: "m1", date: "2026-01-01", won: false })], "secondServePointsWonPct");
    expect(p).toMatchObject({ matchId: "m1", date: "2026-01-01", opponent: "Opp m1", won: false });
  });

  it("drops matches whose sample is too small to mean anything", () => {
    // 3 second serves is below the metric's minSample of 6 — readMetric returns
    // null and the match must not appear as a data point at all.
    const out = metricSeries([
      match({ id: "big", date: "2026-01-01", secondServePoints: 12 }),
      match({ id: "tiny", date: "2026-02-01", secondServePoints: 3 }),
    ], "secondServePointsWonPct");
    expect(out.map(p => p.matchId)).toEqual(["big"]);
  });

  it("ignores matches with no date and unknown metrics", () => {
    expect(metricSeries([{ valissa: {} }], "secondServePointsWonPct")).toEqual([]);
    expect(metricSeries([match({ id: "m1", date: "2026-01-01" })], "notAMetric")).toEqual([]);
  });

  it("offers only real metric ids in the UI shortlist", () => {
    for (const id of TREND_METRICS) {
      expect(metricSeries([match({ id: "m1", date: "2026-01-01" })], id).length).toBeLessThanOrEqual(1);
      expect(trendSummary([{ value: 1 }], id)).not.toBeNull();
    }
  });
});

describe("trendSummary", () => {
  it("summarises spread and average across the series", () => {
    const s = trendSummary(series([40, 50, 60, 70]), "secondServePointsWonPct");
    expect(s).toMatchObject({ count: 4, first: 40, last: 70, avg: 55, best: 70, worst: 40, delta: 30 });
  });

  it("calls a rising higher-is-better metric improving", () => {
    const s = trendSummary(series([30, 34, 48, 52]), "secondServePointsWonPct");
    expect(s.direction).toBe("improving");
    expect(s.change).toBe(18);
  });

  it("calls a rising lower-is-better metric declining", () => {
    // Unforced errors going UP is worse, so gain is inverted.
    const matches = [10, 12, 24, 26].map((ue, i) => match({ id: `m${i}`, date: `2026-0${i + 1}-01`, ue }));
    const s = trendSummary(metricSeries(matches, "unforcedErrors"), "unforcedErrors");
    expect(s.direction).toBe("declining");
  });

  it("treats a metric wobbling around one level as flat", () => {
    const s = trendSummary(series([50, 52, 49, 51]), "secondServePointsWonPct");
    expect(s.direction).toBe("flat");
  });

  it("refuses to call a direction from fewer than four matches", () => {
    const s = trendSummary(series([30, 70, 90]), "secondServePointsWonPct");
    expect(s.count).toBe(3);
    expect(s.direction).toBeNull();
    expect(s.change).toBeNull();
  });

  it("returns null for an empty series or unknown metric", () => {
    expect(trendSummary([], "secondServePointsWonPct")).toBeNull();
    expect(trendSummary(series([50, 50, 50, 50]), "notAMetric")).toBeNull();
  });
});

describe("describeTrend", () => {
  it("names the direction and the size of the move", () => {
    const text = describeTrend(trendSummary(series([30, 34, 48, 52]), "secondServePointsWonPct"));
    expect(text).toContain("2nd serve pts won is improving");
    expect(text).toContain("4 matches");
    expect(text).toContain("18%");
  });

  it("says so plainly when there is not enough data", () => {
    expect(describeTrend(trendSummary(series([30, 70]), "secondServePointsWonPct")))
      .toContain("too few to call a trend yet");
  });

  it("returns an empty string for no summary", () => {
    expect(describeTrend(null)).toBe("");
  });
});
