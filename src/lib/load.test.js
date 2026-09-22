import { describe, it, expect } from "vitest";
import { sessionSRPE, computeLoad, computeLoadHistory, mergeWellbeingByDate, calculateMetrics, readinessScore, acwrStatus, loadLevelFromAcwr, workloadTrendStatus, workloadTrendLabel, getLoadContext, rollingSRPE, loadTrend, weeklyTrainingSummary, computeMonotonyStrain, monotonyStatus } from "./load.js";
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

describe("workloadTrendLabel", () => {
  it("returns Unknown for null", () => {
    expect(workloadTrendLabel(null)).toBe("Unknown");
  });
  it("describes the direction of the change and never prescribes", () => {
    expect(workloadTrendLabel(0.7)).toBe("Below recent average");
    expect(workloadTrendLabel(0.8)).toBe("In line with recent average");
    expect(workloadTrendLabel(1.3)).toBe("In line with recent average");
    expect(workloadTrendLabel(1.4)).toBe("Above recent average");
    expect(workloadTrendLabel(1.5)).toBe("Above recent average");
    expect(workloadTrendLabel(1.6)).toBe("Well above recent average");
  });
  it("emits no medicalised or prescriptive label at any ratio", () => {
    const banned = /optimal|danger|underload|push more|ease up|caution|risk/i;
    for (const r of [null, 0.2, 0.7, 0.8, 1.0, 1.3, 1.4, 1.5, 1.6, 4]) {
      expect(workloadTrendLabel(r)).not.toMatch(banned);
    }
  });
  it("is what loadLevelFromAcwr now resolves to", () => {
    expect(loadLevelFromAcwr).toBe(workloadTrendLabel);
  });
});

describe("workloadTrendStatus", () => {
  it("maps thresholds to neutral labels; tone is colour emphasis only", () => {
    expect(workloadTrendStatus(1.6)).toEqual({ label: "Well above recent", tone: "danger" });
    expect(workloadTrendStatus(1.4)).toEqual({ label: "Above recent", tone: "warn" });
    expect(workloadTrendStatus(0.7)).toEqual({ label: "Below recent", tone: "muted" });
    expect(workloadTrendStatus(1.0)).toEqual({ label: "In line with recent", tone: "success" });
  });
  it("handles a missing ratio", () => {
    expect(workloadTrendStatus(null)).toEqual({ label: "No data", tone: "muted" });
  });
  it("never tells a low week to train more", () => {
    for (const r of [0.1, 0.5, 0.79]) {
      expect(workloadTrendStatus(r).label).not.toMatch(/push|more|increase|underload/i);
    }
  });
  it("is what acwrStatus now resolves to", () => {
    expect(acwrStatus).toBe(workloadTrendStatus);
  });
});

describe("getLoadContext", () => {
  it("describes the ratio without medicalised zone language", () => {
    const notes = getLoadContext(1.6, "none", null).join(" | ");
    expect(notes).toContain("well above recent average");
    expect(notes).toContain("review progression and recovery");
    expect(notes).not.toMatch(/danger zone|OPTIMAL|UNDERLOADED/i);
  });
  it("says explicitly that a low figure is not an instruction to train more", () => {
    const notes = getLoadContext(0.5, "none", null).join(" | ");
    expect(notes).toContain("never a reason to add training");
    expect(notes).not.toMatch(/can handle more|push more/i);
  });
  it("stays neutral in the middle of the range", () => {
    const notes = getLoadContext(1.0, "none", null).join(" | ");
    expect(notes).toContain("in line with recent average");
    expect(notes).not.toContain("review progression and recovery");
  });
  it("keeps the tournament guidance, now describing the one-session week", () => {
    expect(getLoadContext(1.0, "week_of", null).join(" | ")).toContain("one shortened maintenance session");
  });
  it("handles no history at all", () => {
    expect(getLoadContext(null, "none", null).join(" | ")).toContain("Not enough load history");
  });
});

describe("rollingSRPE", () => {
  const ref = new Date(2026, 6, 15, 12, 0, 0); // Wed 2026-07-15
  const dayStr = (daysAgo) => {
    const d = new Date(ref);
    d.setDate(ref.getDate() - daysAgo);
    return toLocalDateStr(d);
  };

  it("sums the window inclusive of the reference day", () => {
    const logs = [
      { type: "tennis", rpe: 5, duration: 60, date: dayStr(0) },  // 300
      { type: "tennis", rpe: 5, duration: 60, date: dayStr(6) },  // 300
      { type: "tennis", rpe: 5, duration: 60, date: dayStr(7) },  // outside a 7-day window
    ];
    expect(rollingSRPE(logs, 7, ref)).toBe(600);
    expect(rollingSRPE(logs, 8, ref)).toBe(900);
  });

  it("is zero with no logs", () => {
    expect(rollingSRPE([], 7, ref)).toBe(0);
  });
});

describe("loadTrend", () => {
  const ref = new Date(2026, 6, 15, 12, 0, 0);
  const dayStr = (daysAgo) => {
    const d = new Date(ref);
    d.setDate(ref.getDate() - daysAgo);
    return toLocalDateStr(d);
  };

  it("compares the last 7 days to the 28-day weekly-equivalent baseline", () => {
    // 400 sRPE in each of the four weeks → baseline 400, this week 400.
    const logs = [0, 7, 14, 21].map(d => ({ type: "tennis", rpe: 5, duration: 80, date: dayStr(d) }));
    const t = loadTrend(logs, ref);
    expect(t.last7DaySRPE).toBe(400);
    expect(t.last28DaySRPE).toBe(1600);
    expect(t.baselineWeeklySRPE).toBe(400);
    expect(t.pctFromBaseline).toBe(0);
    expect(t.ratio).toBe(1);
    expect(t.label).toBe("In line with recent average");
  });

  it("reports the percent difference from the baseline", () => {
    const logs = [
      { type: "tennis", rpe: 10, duration: 100, date: dayStr(0) }, // 1000 this week
      { type: "tennis", rpe: 5, duration: 40, date: dayStr(10) },  // 200
      { type: "tennis", rpe: 5, duration: 40, date: dayStr(20) },  // 200
    ];
    const t = loadTrend(logs, ref);
    expect(t.baselineWeeklySRPE).toBe(350); // 1400 / 4
    expect(t.pctFromBaseline).toBe(186);
    expect(t.label).toBe("Well above recent average");
  });

  it("returns nulls rather than dividing by zero with no history", () => {
    const t = loadTrend([], ref);
    expect(t.baselineWeeklySRPE).toBe(0);
    expect(t.pctFromBaseline).toBeNull();
    expect(t.ratio).toBeNull();
    expect(t.label).toBe("Unknown");
  });
});

describe("weeklyTrainingSummary", () => {
  const monday = getWeekBounds(0).start;
  const dayInWeek = (offset) => {
    const d = new Date(`${monday}T00:00:00`);
    d.setDate(d.getDate() + offset);
    return toLocalDateStr(d);
  };
  // A Sunday reference makes the whole week elapsed, so rest days are stable
  // regardless of which day the suite actually runs on.
  const sundayRef = new Date(`${dayInWeek(6)}T12:00:00`);

  it("splits minutes by training category", () => {
    const logs = [
      { type: "tennis",   rpe: 7, duration: 90, date: dayInWeek(0) },
      { type: "tennis",   rpe: 6, duration: 120, date: dayInWeek(1) },
      { type: "match",    rpe: 8, duration: 75, date: dayInWeek(5) },
      { type: "strength", rpe: 6, duration: 55, date: dayInWeek(0) },
      { type: "other",    rpe: 4, duration: 40, date: dayInWeek(2), sportName: "Swimming" },
    ];
    const sum = weeklyTrainingSummary(logs, 0, sundayRef);
    expect(sum.tennisMinutes).toBe(210);
    expect(sum.matchMinutes).toBe(75);
    expect(sum.strengthMinutes).toBe(55);
    expect(sum.crossTrainingMinutes).toBe(40);
    expect(sum.totalMinutes).toBe(380);
    expect(sum.onCourtHours).toBe(4.8);
    expect(sum.strengthSessions).toBe(1);
  });

  it("counts legacy cheer logs as cross-training rather than losing them", () => {
    const sum = weeklyTrainingSummary(
      [{ type: "cheer", rpe: 5, duration: 60, date: dayInWeek(0) }], 0, sundayRef
    );
    expect(sum.crossTrainingMinutes).toBe(60);
    expect(sum.totalMinutes).toBe(60);
  });

  it("counts complete rest days only over days that have elapsed", () => {
    const logs = [
      { type: "tennis", rpe: 6, duration: 60, date: dayInWeek(0) },
      { type: "tennis", rpe: 6, duration: 60, date: dayInWeek(1) },
    ];
    const fullWeek = weeklyTrainingSummary(logs, 0, sundayRef);
    expect(fullWeek.trainingDays).toBe(2);
    expect(fullWeek.daysElapsed).toBe(7);
    expect(fullWeek.restDays).toBe(5);

    // Read on the Tuesday, only two days have happened — no phantom rest days.
    const tuesday = new Date(`${dayInWeek(1)}T12:00:00`);
    const partWeek = weeklyTrainingSummary(logs, 0, tuesday);
    expect(partWeek.daysElapsed).toBe(2);
    expect(partWeek.restDays).toBe(0);
  });

  it("keeps sRPE as duration × RPE", () => {
    const sum = weeklyTrainingSummary(
      [{ type: "tennis", rpe: 7, duration: 90, date: dayInWeek(0) }], 0, sundayRef
    );
    expect(sum.srpe).toBe(630);
  });
});
