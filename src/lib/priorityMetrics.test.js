import { describe, it, expect } from "vitest";
import {
  PRIORITY_METRICS, METRIC_IDS, isMetricTarget, readMetric, targetMet,
  describeTarget, describeMetricValue, streakMet, matchesSince, toISO, REQUIRED_STREAK,
} from "./priorityMetrics.js";

// Canonical match shape as produced by extractMatchData / finalizeMatch.
const match = (over = {}) => ({
  id: "m1",
  matchStartTime: "2026-07-01T10:00:00Z",
  valissa: {
    firstServePct: 71.4,
    firstServePoints: 30, firstServePointsWon: 20,
    secondServePoints: 12, secondServePointsWon: 6,
    doubleFaults: 3, aces: 1,
    winners: 12, unforcedErrors: 18, forcedErrors: 6,
    fhError: 8, bhError: 10,
    fhReturnError: 4, bhReturnError: 3,
    firstReturnPoints: 25, secondReturnPoints: 10,
  },
  calculated: {
    wueRatio: 0.67,
    firstServePointsWonPct: 66.7,
    secondServePointsWonPct: 50,
    rallyDistribution: {
      "0-4": { total: 30, valissaWins: 15, valissaWinPct: 50 },
      "5-8": { total: 12, valissaWins: 7,  valissaWinPct: 58.3 },
      "9+":  { total: 4,  valissaWins: 1,  valissaWinPct: 25 },   // too few to judge
    },
  },
  ...over,
});

const withValissa = (over) => match({ valissa: { ...match().valissa, ...over } });
const withCalc    = (over) => match({ calculated: { ...match().calculated, ...over } });

// The Firebase-free guarantee for this module is enforced repo-wide by the
// transitive import guard in athleteMemoryCore.test.js.

describe("readMetric", () => {
  it("reads serve, point and rally metrics off the canonical match doc", () => {
    const m = match();
    expect(readMetric(m, "secondServePointsWonPct")).toBe(50);
    expect(readMetric(m, "firstServePointsWonPct")).toBe(66.7);
    expect(readMetric(m, "firstServePct")).toBe(71.4);
    expect(readMetric(m, "doubleFaults")).toBe(3);
    expect(readMetric(m, "wueRatio")).toBe(0.7);          // rounded to 1dp
    expect(readMetric(m, "rallyWinPct0to4")).toBe(50);
    expect(readMetric(m, "returnErrors")).toBe(7);        // fh 4 + bh 3
  });

  it("normalizes a first-serve percentage stored as a fraction", () => {
    expect(readMetric(withValissa({ firstServePct: 0.714 }), "firstServePct")).toBe(71.4);
  });

  it("falls back to computing serve percentages when `calculated` is absent", () => {
    const m = match({ calculated: {} });
    expect(readMetric(m, "secondServePointsWonPct")).toBe(50);
    expect(readMetric(m, "firstServePointsWonPct")).toBe(66.7);
  });

  it("returns null below the minimum sample — 2 of 3 second serves is not 67% form", () => {
    const tiny = withValissa({ secondServePoints: 3, secondServePointsWon: 2 });
    expect(readMetric(withCalc({ secondServePointsWonPct: 66.7 }), "secondServePointsWonPct")).toBe(66.7);
    expect(readMetric({ ...tiny, calculated: { secondServePointsWonPct: 66.7 } }, "secondServePointsWonPct")).toBeNull();
  });

  it("returns null for a rally bucket with too few points", () => {
    expect(readMetric(match(), "rallyWinPct9plus")).toBeNull();   // only 4 points
    expect(readMetric(match(), "rallyWinPct5to8")).toBe(58.3);    // 12 points is enough
  });

  it("returns null for a missing stat or an unknown metric", () => {
    expect(readMetric(match({ valissa: {}, calculated: {} }), "aces")).toBeNull();
    expect(readMetric(match(), "notAMetric")).toBeNull();
    expect(readMetric(null, "aces")).toBeNull();
  });
});

describe("isMetricTarget", () => {
  it("accepts a well-formed target", () => {
    expect(isMetricTarget({ metric: "secondServePointsWonPct", comparator: ">=", value: 45 })).toBe(true);
  });

  it("rejects anything the model may have hallucinated", () => {
    expect(isMetricTarget({ metric: "vibes", comparator: ">=", value: 45 })).toBe(false);
    expect(isMetricTarget({ metric: "aces", comparator: "much more than", value: 3 })).toBe(false);
    expect(isMetricTarget({ metric: "aces", comparator: ">=", value: "lots" })).toBe(false);
    expect(isMetricTarget(null)).toBe(false);
    expect(isMetricTarget("secondServePointsWonPct >= 45")).toBe(false);
  });
});

describe("targetMet", () => {
  const target = (over) => ({ metric: "secondServePointsWonPct", comparator: ">=", value: 45, ...over });

  it("is true when a higher-is-better metric clears the bar", () => {
    expect(targetMet(match(), target())).toBe(true);
  });

  it("is false when it falls short", () => {
    expect(targetMet(match(), target({ value: 55 }))).toBe(false);
  });

  it("handles lower-is-better metrics", () => {
    expect(targetMet(match(), { metric: "doubleFaults", comparator: "<=", value: 2 })).toBe(false);
    expect(targetMet(match(), { metric: "doubleFaults", comparator: "<=", value: 4 })).toBe(true);
  });

  it("is null — not false — when the match cannot answer the question", () => {
    expect(targetMet(match(), { metric: "rallyWinPct9plus", comparator: ">=", value: 40 })).toBeNull();
    expect(targetMet(match(), { metric: "vibes", comparator: ">=", value: 1 })).toBeNull();
  });
});

describe("streakMet", () => {
  const target = { metric: "secondServePointsWonPct", comparator: ">=", value: 45 };
  const at = (id, pct) => match({ id, calculated: { ...match().calculated, secondServePointsWonPct: pct } });

  it("does not resolve on a single good match", () => {
    expect(streakMet([at("m2", 60)], target).met).toBe(false);
  });

  it("resolves once the target holds in two consecutive matches", () => {
    const r = streakMet([at("m3", 61), at("m2", 52)], target);
    expect(r.met).toBe(true);
    expect(r.matchIds).toEqual(["m3", "m2"]);
  });

  it("does not resolve when the most recent match misses", () => {
    expect(streakMet([at("m3", 30), at("m2", 52)], target).met).toBe(false);
  });

  it("does not resolve when an older match in the streak misses", () => {
    expect(streakMet([at("m3", 61), at("m2", 30)], target).met).toBe(false);
  });

  it("skips unevaluable matches instead of letting them break the streak", () => {
    const tooShort = match({ id: "m-short", valissa: { ...match().valissa, secondServePoints: 2 } });
    const r = streakMet([at("m3", 61), tooShort, at("m2", 52)], target);
    expect(r.met).toBe(true);
    expect(r.matchIds).toEqual(["m3", "m2"]);
  });

  it("returns not-met for an empty history or a malformed target", () => {
    expect(streakMet([], target).met).toBe(false);
    expect(streakMet([at("m3", 99)], { metric: "vibes", comparator: ">=", value: 1 }).met).toBe(false);
  });

  it("requires two matches by default", () => {
    expect(REQUIRED_STREAK).toBe(2);
  });
});

describe("matchesSince", () => {
  const m = (id, date) => ({ id, matchStartTime: date });

  it("keeps only matches played after the priority was raised, newest first", () => {
    const all = [m("old", "2026-05-01"), m("new", "2026-07-10"), m("mid", "2026-06-20")];
    expect(matchesSince(all, "2026-06-01").map(x => x.id)).toEqual(["new", "mid"]);
  });

  it("returns everything when no cutoff is given", () => {
    expect(matchesSince([m("a", "2026-05-01"), m("b", "2026-07-10")], null).map(x => x.id)).toEqual(["b", "a"]);
  });

  it("drops matches with no start time and survives empty input", () => {
    expect(matchesSince([{ id: "x" }], null)).toEqual([]);
    expect(matchesSince(null, null)).toEqual([]);
  });
});

describe("toISO", () => {
  it("coerces a Firestore Timestamp so it can be compared with a match date", () => {
    const stamp = { toDate: () => new Date("2026-06-01T00:00:00.000Z") };
    expect(toISO(stamp)).toBe("2026-06-01T00:00:00.000Z");
  });

  it("coerces the raw { seconds } shape a cached Timestamp can arrive as", () => {
    expect(toISO({ seconds: 1780272000 })).toBe(new Date(1780272000 * 1000).toISOString());
  });

  it("passes ISO strings and Dates through", () => {
    expect(toISO("2026-06-01T00:00:00.000Z")).toBe("2026-06-01T00:00:00.000Z");
    expect(toISO(new Date("2026-06-01T00:00:00.000Z"))).toBe("2026-06-01T00:00:00.000Z");
  });

  it("returns null for nothing or nonsense", () => {
    expect(toISO(null)).toBeNull();
    expect(toISO(undefined)).toBeNull();
    expect(toISO("not a date")).toBeNull();
  });
});

describe("describeTarget / describeMetricValue", () => {
  it("renders a target the parent can read", () => {
    expect(describeTarget({ metric: "secondServePointsWonPct", comparator: ">=", value: 45 }))
      .toBe("2nd serve pts won ≥ 45%");
    expect(describeTarget({ metric: "doubleFaults", comparator: "<=", value: 2 }))
      .toBe("double faults ≤ 2");
  });

  it("renders nothing for a target it cannot evaluate", () => {
    expect(describeTarget({ metric: "vibes", comparator: ">=", value: 1 })).toBe("");
    expect(describeTarget(null)).toBe("");
  });

  it("renders the current reading, or nothing when unavailable", () => {
    expect(describeMetricValue(match(), "secondServePointsWonPct")).toBe("50%");
    expect(describeMetricValue(match(), "rallyWinPct9plus")).toBe("");
  });
});

describe("PRIORITY_METRICS", () => {
  it("gives every metric a label, a sample reader and a minimum sample", () => {
    for (const id of METRIC_IDS) {
      const def = PRIORITY_METRICS[id];
      expect(def.label, id).toBeTruthy();
      expect(typeof def.read, id).toBe("function");
      expect(typeof def.sample, id).toBe("function");
      expect(def.minSample, id).toBeGreaterThan(0);
    }
  });
});
