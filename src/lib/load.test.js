import { describe, it, expect } from "vitest";
import { sessionSRPE, computeLoad, computeLoadHistory, mergeWellbeingByDate, calculateMetrics, readinessScore, acwrStatus, loadLevelFromAcwr, computeMonotonyStrain, monotonyStatus } from "./load.js";
import { getWeekBounds, toLocalDateStr } from "./dates.js";

describe("sessionSRPE", () => {
  it("uses rpe × duration for tennis", () => {
    expect(sessionSRPE({ type: "tennis", rpe: 7, duration: 90 })).toBe(630);
  });
  it("counts 'other' (cross-training) at full weight", () => {
    expect(sessionSRPE({ type: "other", rpe: 5, duration: 60 })).toBe(300);
  });
  it("falls back to intensity × 2 when rpe is missing", () => {
    expect(sessionSRPE({ type: "tennis", intensity: 4, duration: 60 })).toBe(480);
  });
  it("defaults to rpe 5 and duration 60 when absent", () => {
    expect(sessionSRPE({ type: "tennis" })).toBe(300);
  });
});

describe("computeLoad", () => {
  it("returns null ACWR with no history (no division by zero)", () => {
    expect(computeLoad([]).acwr).toBeNull();
  });
  it("computes ACWR = thisWeek / mean(4 weeks)", () => {
    const logs = [
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start },
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(1).start },
    ];
    // weekly totals [300, 300, 0, 0] → avg 150 → acwr 2
    const out = computeLoad(logs);
    expect(out.thisWeekSRPE).toBe(300);
    expect(out.fourWeekAvg).toBe(150);
    expect(out.acwr).toBe(2);
  });
  it("buckets a Monday log into the week starting that Monday", () => {
    const logs = [{ type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start }];
    const { weekSRPEs } = computeLoad(logs);
    expect(weekSRPEs[0]).toBe(300);
    expect(weekSRPEs[1]).toBe(0);
  });
});

describe("mergeWellbeingByDate", () => {
  it("merges AM sleep with PM energy/notes on the same date", () => {
    const merged = mergeWellbeingByDate([
      { date: "2026-07-06", time: "07:30", type: "morning", sleep: 8, mood: 4, soreness: 2 },
      { date: "2026-07-06", time: "21:00", type: "night", energy: 3, mood: 3, soreness: 3, notes: "tired" },
    ]);
    const day = merged["2026-07-06"];
    expect(day.sleep).toBe(8);      // AM field survives — the review's B1 fix
    expect(day.energy).toBe(3);
    expect(day.notes).toBe("tired");
    expect(day.mood).toBe(3);       // later non-null wins
  });
  it("a later entry does not erase earlier fields it lacks", () => {
    const merged = mergeWellbeingByDate([
      { date: "2026-07-06", time: "07:30", sleep: 7 },
      { date: "2026-07-06", time: "21:00", energy: 4 },
    ]);
    expect(merged["2026-07-06"].sleep).toBe(7);
  });
  it("keeps different dates separate", () => {
    const merged = mergeWellbeingByDate([
      { date: "2026-07-05", time: "07:00", sleep: 6 },
      { date: "2026-07-06", time: "07:00", sleep: 9 },
    ]);
    expect(merged["2026-07-05"].sleep).toBe(6);
    expect(merged["2026-07-06"].sleep).toBe(9);
  });
});

describe("calculateMetrics", () => {
  it("computes avgSleep from merged same-day AM+PM docs", () => {
    const today = toLocalDateStr(new Date());
    const m = calculateMetrics([], [
      { date: today, time: "07:30", sleep: 8 },
      { date: today, time: "21:00", energy: 3 },
    ]);
    expect(m.avgSleep).toBe("8.0");
    expect(m.wellbeingDays).toBe(1);
  });
});

describe("computeLoadHistory", () => {
  it("returns exactly `weeks` entries, oldest → newest, Monday-keyed", () => {
    const h = computeLoadHistory([], 12);
    expect(h).toHaveLength(12);
    expect(h[11].weekStart).toBe(getWeekBounds(0).start);
    expect(h[0].weekStart).toBe(getWeekBounds(11).start);
  });
  it("gives null ACWR and zero totals with no data", () => {
    const h = computeLoadHistory([], 4);
    expect(h.every(w => w.totalSrpe === 0 && w.acwr === null)).toBe(true);
  });
  it("buckets logs into the correct week and type", () => {
    const logs = [
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start }, // 300
      { type: "cheer",  rpe: 4, duration: 30, date: getWeekBounds(1).start }, // 120
      { type: "other",  rpe: 6, duration: 60, date: getWeekBounds(0).start }, // 360 (full weight)
    ];
    const h = computeLoadHistory(logs, 4);
    const now = h[3], prev = h[2];
    expect(now.srpeByType).toEqual({ tennis: 300, match: 0, strength: 0, cheer: 0, other: 360 });
    expect(now.totalSrpe).toBe(660);
    expect(prev.srpeByType.cheer).toBe(120);
    expect(prev.totalSrpe).toBe(120);
  });
  it("computes each week's ACWR from that week + 3 prior", () => {
    const logs = [
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(0).start }, // this wk: 300
      { type: "tennis", rpe: 5, duration: 60, date: getWeekBounds(1).start }, // prev wk: 300
    ];
    const h = computeLoadHistory(logs, 2);
    // newest week: window = [0,0,300,300] → avg 150 → acwr 2
    expect(h[1].acwr).toBe(2);
    // previous week: window = [0,0,0,300] → avg 75 → acwr 4
    expect(h[0].acwr).toBe(4);
  });
  it("matches computeLoad for the current week (shared source of truth)", () => {
    const logs = [
      { type: "tennis", rpe: 7, duration: 90, date: getWeekBounds(0).start },
      { type: "other",  rpe: 4, duration: 45, date: getWeekBounds(2).start },
    ];
    const current = computeLoadHistory(logs, 12).at(-1);
    const snapshot = computeLoad(logs);
    expect(current.totalSrpe).toBe(snapshot.thisWeekSRPE);
    expect(current.acwr).toBe(snapshot.acwr);
  });
  it("folds unknown types into 'other'", () => {
    const h = computeLoadHistory([{ type: "swimming", rpe: 5, duration: 60, date: getWeekBounds(0).start }], 1);
    expect(h[0].srpeByType.other).toBe(300);
  });
  it("buckets match and strength types explicitly", () => {
    const logs = [
      { type: "match",    rpe: 8, duration: 60, date: getWeekBounds(0).start }, // 480
      { type: "strength", rpe: 6, duration: 45, date: getWeekBounds(0).start }, // 270
    ];
    const h = computeLoadHistory(logs, 1);
    expect(h[0].srpeByType.match).toBe(480);
    expect(h[0].srpeByType.strength).toBe(270);
    expect(h[0].totalSrpe).toBe(750);
  });
});

describe("readinessScore", () => {
  it("combines mood (60%) and inverse soreness (40%)", () => {
    expect(readinessScore(5, 1)).toBe(92);   // 60 + 32
    expect(readinessScore(3, 3)).toBe(52);   // 36 + 16
    expect(readinessScore(1, 5)).toBe(12);   // 12 + 0
  });
  it("returns null when either input is missing", () => {
    expect(readinessScore(null, 2)).toBeNull();
    expect(readinessScore(4, undefined)).toBeNull();
  });
  it("clamps to 0..100", () => {
    expect(readinessScore(5, 0)).toBe(100);  // 60 + 40 = 100
  });
});

describe("computeMonotonyStrain", () => {
  const ref = new Date(2026, 6, 15, 12, 0, 0); // Wed 2026-07-15, noon local

  const dayStr = (daysAgo) => {
    const d = new Date(ref);
    d.setDate(ref.getDate() - daysAgo);
    return toLocalDateStr(d);
  };

  it("computes monotony (mean/SD) and strain (total × monotony) for a known week", () => {
    // Daily loads 100..700 (oldest → newest): mean 400, population SD 200.
    const logs = [6, 5, 4, 3, 2, 1, 0].map((daysAgo, i) => ({
      type: "tennis", rpe: i + 1, duration: 100, date: dayStr(daysAgo),
    }));
    const { monotony, strain } = computeMonotonyStrain(logs, ref);
    expect(monotony).toBe(2.00);
    expect(strain).toBe(5600); // total 2800 × monotony 2
  });

  it("returns nulls for an all-zero week (no logs)", () => {
    expect(computeMonotonyStrain([], ref)).toEqual({ monotony: null, strain: null });
  });

  it("returns null monotony/strain when every day has the same load (SD = 0)", () => {
    const logs = [0, 1, 2, 3, 4, 5, 6].map(daysAgo => ({
      type: "tennis", rpe: 2, duration: 100, date: dayStr(daysAgo),
    }));
    expect(computeMonotonyStrain(logs, ref)).toEqual({ monotony: null, strain: null });
  });
});

describe("monotonyStatus", () => {
  it("returns null when monotony is null", () => {
    expect(monotonyStatus(null)).toBeNull();
  });
  it("flags danger at 2.5+", () => {
    expect(monotonyStatus(2.6)).toEqual({ label: "Too repetitive", tone: "danger" });
  });
  it("flags warn between 2.0 and 2.5", () => {
    expect(monotonyStatus(2.2)).toEqual({ label: "Getting repetitive", tone: "warn" });
  });
  it("is fine below 2.0", () => {
    expect(monotonyStatus(1.0)).toEqual({ label: "Good variety", tone: "success" });
  });
});

describe("readinessScore with sleep", () => {
  it("gives full sleep credit at 8h+", () => {
    expect(readinessScore(5, 0, 8)).toBe(100); // 40 + 30 + 30
  });
  it("gives zero sleep credit at 5h or less", () => {
    expect(readinessScore(5, 0, 5)).toBe(70); // 40 + 30 + 0
  });
  it("gives partial sleep credit in between", () => {
    expect(readinessScore(5, 0, 6.5)).toBe(85); // 40 + 30 + 15 (sleepFactor 0.5)
  });
  it("falls back to the original mood/soreness-only formula when sleep is omitted", () => {
    expect(readinessScore(5, 1)).toBe(92);
    expect(readinessScore(5, 1, undefined)).toBe(92);
    expect(readinessScore(5, 1, null)).toBe(92);
  });
});

describe("loadLevelFromAcwr", () => {
  it("returns Unknown for null", () => {
    expect(loadLevelFromAcwr(null)).toBe("Unknown");
  });
  it("returns Low below 0.8", () => {
    expect(loadLevelFromAcwr(0.7)).toBe("Low");
  });
  it("returns Optimal between 0.8 and 1.3 inclusive", () => {
    expect(loadLevelFromAcwr(0.8)).toBe("Optimal");
    expect(loadLevelFromAcwr(1.3)).toBe("Optimal");
  });
  it("returns High between 1.3 (exclusive) and 1.5 inclusive", () => {
    expect(loadLevelFromAcwr(1.4)).toBe("High");
    expect(loadLevelFromAcwr(1.5)).toBe("High");
  });
  it("returns Very High above 1.5", () => {
    expect(loadLevelFromAcwr(1.6)).toBe("Very High");
  });
});

describe("acwrStatus", () => {
  it("maps thresholds to labels/tones", () => {
    expect(acwrStatus(1.6)).toEqual({ label: "Ease up", tone: "danger" });
    expect(acwrStatus(1.4)).toEqual({ label: "Careful", tone: "warn" });
    expect(acwrStatus(0.7)).toEqual({ label: "Push more", tone: "limeDim" });
    expect(acwrStatus(1.0)).toEqual({ label: "Balanced", tone: "success" });
  });
  it("handles missing ACWR", () => {
    expect(acwrStatus(null)).toEqual({ label: "No data", tone: "muted" });
  });
});
