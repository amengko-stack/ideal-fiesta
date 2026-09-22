import { describe, it, expect } from "vitest";
import {
  growthVelocity, recentGrowthContext, growthSummaryLine,
  GROWTH_WATCH_CM_PER_YEAR, MIN_INTERVAL_DAYS,
} from "./growth.js";

describe("growthVelocity", () => {
  it("computes cm/yr from the last two height measurements", () => {
    const ms = [
      { date: "2025-07-08", height: 146 },
      { date: "2026-07-08", height: 152 },
    ];
    expect(growthVelocity(ms)).toBe(6);
  });
  it("uses the LAST two when more exist and sorts by date", () => {
    const ms = [
      { date: "2026-01-08", height: 149 },
      { date: "2024-07-08", height: 140 },
      { date: "2026-07-08", height: 152 },
    ];
    // Jan→Jul 2026: +3cm over ~0.4956yr ≈ 6.1
    expect(growthVelocity(ms)).toBeCloseTo(6.1, 1);
  });
  it("ignores entries without height", () => {
    const ms = [
      { date: "2025-07-08", height: 146 },
      { date: "2026-07-01", weight: 41 },
      { date: "2026-07-08", height: 152 },
    ];
    expect(growthVelocity(ms)).toBe(6);
  });
  it("returns null with fewer than two heights or a zero gap", () => {
    expect(growthVelocity([])).toBeNull();
    expect(growthVelocity([{ date: "2026-07-08", height: 152 }])).toBeNull();
    expect(growthVelocity([
      { date: "2026-07-08", height: 151 },
      { date: "2026-07-08", height: 152 },
    ])).toBeNull();
  });
});

describe("recentGrowthContext", () => {
  // The athlete's real numbers: 148.5 cm → 153 cm across 183 days.
  const sixMonthHistory = [
    { date: "2025-09-12", height: 148.5, weight: 37.5 },
    { date: "2026-03-14", height: 153, weight: 43 },
  ];

  it("annualises ~4.5 cm over ~6 months to ~9 cm/year", () => {
    const ctx = recentGrowthContext(sixMonthHistory);
    expect(ctx.velocityCmYr).toBeCloseTo(9, 1);
    expect(ctx.intervalDays).toBe(183);
    expect(ctx.latestHeight).toBe(153);
    expect(ctx.priorHeight).toBe(148.5);
    expect(ctx.latestDate).toBe("2026-03-14");
    expect(ctx.priorDate).toBe("2025-09-12");
    expect(ctx.sufficientInterval).toBe(true);
    expect(ctx.growthWatch).toBe(true);
  });

  it("does not raise a confident growth watch on a short interval", () => {
    // +0.5 cm in 19 days annualises to ~9.6 cm/year — which is measurement
    // noise, not growth. It is reported, but never as a growth watch.
    const ctx = recentGrowthContext([
      { date: "2026-09-01", height: 152.5 },
      { date: "2026-09-20", height: 153 },
    ]);
    expect(ctx.intervalDays).toBe(19);
    expect(ctx.velocityCmYr).toBeGreaterThan(GROWTH_WATCH_CM_PER_YEAR);
    expect(ctx.sufficientInterval).toBe(false);
    expect(ctx.growthWatch).toBe(false);
  });

  it("prefers a 4–8 month comparison over the most recent reading", () => {
    const ctx = recentGrowthContext([
      { date: "2025-09-12", height: 148.5 }, // 183 days back — the one to use
      { date: "2026-03-01", height: 152.8 }, // 13 days back — too noisy
      { date: "2026-03-14", height: 153 },
    ]);
    expect(ctx.priorDate).toBe("2025-09-12");
    expect(ctx.intervalDays).toBe(183);
    expect(ctx.velocityCmYr).toBeCloseTo(9, 1);
  });

  it("picks the reading closest to six months when several are in the window", () => {
    const ctx = recentGrowthContext([
      { date: "2025-07-14", height: 147 },   // 243 days
      { date: "2025-09-12", height: 148.5 }, // 183 days — closest to 6 months
      { date: "2025-11-14", height: 150 },   // 120 days
      { date: "2026-03-14", height: 153 },
    ]);
    expect(ctx.priorDate).toBe("2025-09-12");
  });

  it("falls back to the longest available gap when nothing is in the window", () => {
    const ctx = recentGrowthContext([
      { date: "2026-02-14", height: 152 },  // 28 days
      { date: "2026-01-14", height: 151.5 }, // 59 days — longest available
      { date: "2026-03-14", height: 153 },
    ]);
    expect(ctx.priorDate).toBe("2026-01-14");
    expect(ctx.intervalDays).toBe(59);
    expect(ctx.intervalDays).toBeLessThan(MIN_INTERVAL_DAYS);
    expect(ctx.sufficientInterval).toBe(false);
    expect(ctx.growthWatch).toBe(false);
  });

  it("works on unordered input", () => {
    const shuffled = [
      { date: "2026-03-14", height: 153 },
      { date: "2025-09-12", height: 148.5 },
    ];
    expect(recentGrowthContext(shuffled)).toEqual(recentGrowthContext(sixMonthHistory));
  });

  it("ignores entries with no usable height", () => {
    const ctx = recentGrowthContext([
      { date: "2025-09-12", height: 148.5 },
      { date: "2026-01-01", weight: 41 },
      { date: "2026-02-01", height: null },
      { date: "2026-02-15", height: "not a number" },
      { date: "2026-03-14", height: 153 },
    ]);
    expect(ctx.intervalDays).toBe(183);
    expect(ctx.velocityCmYr).toBeCloseTo(9, 1);
  });

  it("returns null when nothing carries a height at all", () => {
    expect(recentGrowthContext([])).toBeNull();
    expect(recentGrowthContext(null)).toBeNull();
    expect(recentGrowthContext(undefined)).toBeNull();
    expect(recentGrowthContext([{ date: "2026-03-14", weight: 43 }])).toBeNull();
  });

  it("reports a single measurement without inventing a velocity", () => {
    const ctx = recentGrowthContext([{ date: "2026-03-14", height: 153 }]);
    expect(ctx.latestHeight).toBe(153);
    expect(ctx.velocityCmYr).toBeNull();
    expect(ctx.intervalDays).toBeNull();
    expect(ctx.sufficientInterval).toBe(false);
    expect(ctx.growthWatch).toBe(false);
  });

  it("ignores a duplicate reading on the latest date rather than dividing by zero", () => {
    const ctx = recentGrowthContext([
      { date: "2026-03-14", height: 152.8 },
      { date: "2026-03-14", height: 153 },
    ]);
    expect(ctx.velocityCmYr).toBeNull();
    expect(ctx.growthWatch).toBe(false);
  });

  it("does not raise a growth watch on ordinary growth", () => {
    const ctx = recentGrowthContext([
      { date: "2025-09-12", height: 151 },
      { date: "2026-03-14", height: 153 },
    ]);
    expect(ctx.velocityCmYr).toBeCloseTo(4, 1);
    expect(ctx.sufficientInterval).toBe(true);
    expect(ctx.growthWatch).toBe(false);
  });

  it("is a coaching flag, never a maturity classification", () => {
    const ctx = recentGrowthContext(sixMonthHistory);
    expect(Object.keys(ctx)).toEqual([
      "velocityCmYr", "intervalDays", "latestHeight", "priorHeight",
      "latestDate", "priorDate", "sufficientInterval", "growthWatch",
    ]);
    expect(JSON.stringify(ctx)).not.toMatch(/PHV|puberty|maturity|stage/i);
  });
});

describe("growthSummaryLine", () => {
  it("renders height, change and the growth-watch note", () => {
    const line = growthSummaryLine(recentGrowthContext([
      { date: "2025-09-12", height: 148.5 },
      { date: "2026-03-14", height: 153 },
    ]));
    expect(line).toBe("153 cm · +4.5 cm over ~6 months · rapid recent growth");
    expect(line).not.toMatch(/PHV|puberty/i);
  });

  it("asks for another measurement when the interval is too short to trust", () => {
    const line = growthSummaryLine(recentGrowthContext([
      { date: "2026-09-01", height: 152.5 },
      { date: "2026-09-20", height: 153 },
    ]));
    expect(line).toContain("measure again in a few months");
  });

  it("shows height alone with a single measurement, and null for no data", () => {
    expect(growthSummaryLine(recentGrowthContext([{ date: "2026-03-14", height: 153 }]))).toBe("153 cm");
    expect(growthSummaryLine(null)).toBeNull();
  });
});
