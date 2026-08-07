import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  GUARDIAN_THRESHOLDS, GUARDIAN_ENGINE_VERSION, TRIGGER_FAMILIES, MODIFIER_FAMILIES,
  dailyWellbeing, seriesTrend, evaluateGate, assessGuardian, cooldownDecision, clearedCooldown,
  athleteActions, buildGuardianNotesPrompt, buildGuardianAlert, guardianPushPayload,
  supersededReminderKinds,
} from "./guardianCore.js";
import { toLocalDateStr } from "./dates.js";

// The Firebase-free guarantee for this module is enforced repo-wide by the
// transitive import guard in athleteMemoryCore.test.js; the purity of its
// imports is enforced by sharedSync.test.js's allowlist + closure checks.
//
// ─── REAL-CLOCK LEAK (read before adding a fixture) ──────────────────────────
// Two of guardianCore's dependencies read new Date() internally and ignore the
// `now` it is given:
//   * computeLoad → getWeekBounds (dates.js) — the four Mon-Sun week buckets
//     the whole LOAD family is computed from are anchored to the REAL today.
//   * recurringAreas (injuries.js:105) — its 180-day window likewise.
// Everything else (monotony's 7-day window, dailyWellbeing, injuryDuration,
// maturityOffset, growthVelocity) honours the injected clock.
//
// Consequences for this suite:
//   1. Load fixtures build their dates through realMonday(weeksAgo) — a copy of
//      the helper reminders.test.js:123-131 uses — so logs land in the buckets
//      computeLoad will actually look in.
//   2. The load describes freeze the system clock on a SUNDAY. The monotony
//      window ends at the injected `now` while the ACWR buckets come from the
//      real clock, so the two windows only coincide on a Sunday; on a Monday it
//      is arithmetically impossible for both to fire together (week 0 is one
//      day, so a uniform 7-day window drives the chronic mean up faster than
//      the acute week). Without the freeze, the family-collapse regression test
//      — the single most important test in this file — would pass six days out
//      of seven. Same vi.setSystemTime pattern planGenCore.test.js uses.
//      realMonday() resolves against the frozen clock, so fixtures still line
//      up. The recurring-injury test freezes for the same reason.
//   3. The GATE, KEY and COOLDOWN suites are built from recovery/tissue/growth
//      factors only, all of which are fully time-injectable — so the logic that
//      actually decides whether a parent's phone buzzes runs on a deterministic
//      clock, not on which day of the week CI happened to run.
//
// One more trap, inherited from load.js: sessionSRPE reads `log.duration || 60`,
// so a rest day logged as a zero-duration row silently becomes a 600 sRPE
// session. Rest days must be ABSENT from a fixture, never zeroed.

const TODAY = new Date("2026-08-09T06:00:00");   // a Sunday
const TODAY_STR = "2026-08-09";

const idsOf     = (list) => (list || []).map(f => f.id);
const familiesOf = (a) => a.families;

// YYYY-MM-DD `offset` days from `base` (negative = in the past).
const dayStr = (base, offset) => {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return toLocalDateStr(d);
};

// A run of daily check-in docs ending TODAY, oldest first. `rows` carry any of
// { mood, soreness, sleep }.
const wbDays = (rows, base = TODAY) =>
  rows.map((r, i) => ({ date: dayStr(base, -(rows.length - 1 - i)), type: "checkin", ...r }));

// A benign check-in, used purely to get past the insufficient-data
// short-circuit in fixtures that are about injuries or growth. Nothing in it
// can fire a recovery factor.
const CALM_DAY = [{ date: TODAY_STR, type: "checkin", mood: 4, soreness: 1, sleep: 9 }];

// Mid-PHV per maturity.test.js's own fixture (age 13, 160cm, 80cm sitting,
// 48kg → offset 0.84). One measurement only, so growthVelocity stays null and
// the mid-phv-window factor is isolated.
const MID_PHV_ATHLETE = {
  dob: "2013-08-09",
  measurements: [{ date: "2026-08-01", height: 160, sittingHeight: 80, weight: 48 }],
};
// Pre-PHV (age 10, 150/75/35 → offset -1.42).
const PRE_PHV_ATHLETE = {
  dob: "2016-08-09",
  measurements: [{ date: "2026-08-01", height: 150, sittingHeight: 75, weight: 35 }],
};

describe("GUARDIAN_THRESHOLDS", () => {
  it("is frozen so server and client can never drift on a number", () => {
    expect(Object.isFrozen(GUARDIAN_THRESHOLDS)).toBe(true);
  });
  it("carries the two load-bearing numbers the design argued for", () => {
    // 1.35 sits deliberately above the dashboard's own 1.3 warn chip.
    expect(GUARDIAN_THRESHOLDS.acwrSpike).toBe(1.35);
    expect(GUARDIAN_THRESHOLDS.acwrSpike).toBeGreaterThan(1.3);
    // 6.0 cm/yr is meaningless without the span guard.
    expect(GUARDIAN_THRESHOLDS.growthVelocityHigh).toBe(6.0);
    expect(GUARDIAN_THRESHOLDS.growthMinSpanDays).toBe(60);
  });
  it("keeps growth out of the trigger families", () => {
    expect(TRIGGER_FAMILIES).toEqual(["load", "recovery", "tissue"]);
    expect(MODIFIER_FAMILIES).toContain("growth");
  });
});

// ─── MALFORMED INPUT ─────────────────────────────────────────────────────────

describe("assessGuardian — malformed/empty input", () => {
  const expectQuiet = (a, reason) => {
    expect(a.fires).toBe(false);
    if (reason) expect(a.reason).toBe(reason);
    expect(a.families).toEqual([]);
    expect(a.factors).toEqual([]);
    expect(a.storyKey).toBeNull();
    expect(a.actions.athlete).toEqual([]);
  };

  it("returns insufficient-data for null", () => {
    expectQuiet(assessGuardian(null, TODAY), "insufficient-data");
  });
  it("returns insufficient-data for {}", () => {
    expectQuiet(assessGuardian({}, TODAY), "insufficient-data");
  });
  it("returns insufficient-data for a non-object", () => {
    expectQuiet(assessGuardian("nonsense", TODAY), "insufficient-data");
    expectQuiet(assessGuardian(undefined, TODAY), "insufficient-data");
    expectQuiet(assessGuardian(42, TODAY), "insufficient-data");
  });
  it("coerces wrong field types to empty instead of throwing", () => {
    const raw = { weekLogs: "x", wellbeing: 5, injuries: {}, athlete: "z" };
    expect(() => assessGuardian(raw, TODAY)).not.toThrow();
    expectQuiet(assessGuardian(raw, TODAY), "insufficient-data");
  });
  it("survives garbage inside otherwise well-shaped arrays", () => {
    const raw = {
      weekLogs: [null, {}, { date: 7 }, { date: "not-a-date", rpe: "hard" }],
      wellbeing: [null, { date: "x" }, { date: TODAY_STR, mood: "great", sleep: {} }],
      injuries: [null, {}, { status: "open", severity: "bad" }],
      athlete: { dob: "nope", measurements: "nope" },
    };
    expect(() => assessGuardian(raw, TODAY)).not.toThrow();
    expect(assessGuardian(raw, TODAY).fires).toBe(false);
  });
  it("falls back to the real clock when `now` is missing or invalid", () => {
    expect(() => assessGuardian({ wellbeing: CALM_DAY })).not.toThrow();
    expect(() => assessGuardian({ wellbeing: CALM_DAY }, "not-a-date")).not.toThrow();
    expect(() => assessGuardian({ wellbeing: CALM_DAY }, null)).not.toThrow();
  });
  it("short-circuits BEFORE any factor runs when there are no logs, check-ins or injuries", () => {
    expectQuiet(assessGuardian({ weekLogs: [], wellbeing: [], injuries: [] }, TODAY), "insufficient-data");
  });
  it("still fires a standalone severe injury with no logs and no check-ins", () => {
    // The athlete most likely to have stopped both training and checking in is
    // the one who is too hurt to do either — so injuries are exempt from the
    // short-circuit, or the standalone override would be silent in exactly the
    // case it exists for.
    const raw = { injuries: [{ bodyArea: "Knee", severity: 5, status: "open", onsetDate: dayStr(TODAY, -2) }] };
    const a = assessGuardian(raw, TODAY);
    expect(a.fires).toBe(true);
    expect(a.severity).toBe("urgent");
    expect(a.families).toEqual(["tissue"]);
  });
  it("never throws on any of the other exported entry points given junk", () => {
    expect(() => cooldownDecision(null, null, TODAY)).not.toThrow();
    expect(() => cooldownDecision("x", "y", "z")).not.toThrow();
    expect(() => clearedCooldown(null, TODAY)).not.toThrow();
    expect(() => clearedCooldown("x", "y")).not.toThrow();
    expect(() => athleteActions(null, null)).not.toThrow();
    expect(() => buildGuardianNotesPrompt(null, null)).not.toThrow();
    expect(() => buildGuardianAlert()).not.toThrow();
    expect(() => guardianPushPayload(null)).not.toThrow();
    expect(() => supersededReminderKinds("nope")).not.toThrow();
  });
});

// ─── dailyWellbeing ──────────────────────────────────────────────────────────

describe("dailyWellbeing", () => {
  it("merges the morning and night docs for one date into one day", () => {
    const entries = [
      { date: TODAY_STR, type: "morning", time: "07:00", sleep: 6 },
      { date: TODAY_STR, type: "night", time: "21:00", mood: 3, soreness: 4 },
    ];
    const days = dailyWellbeing(entries, TODAY);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: TODAY_STR, sleep: 6, mood: 3, soreness: 4 });
  });

  it("returns NUMBERS, not calculateMetrics' toFixed(1) strings", () => {
    const days = dailyWellbeing(wbDays([{ mood: 2, soreness: 3, sleep: 7 }]), TODAY);
    for (const field of ["mood", "soreness", "sleep"]) {
      expect(typeof days[0][field]).toBe("number");
    }
  });

  it("accepts the AM/PM field variants the legacy docs use", () => {
    const days = dailyWellbeing([{ date: TODAY_STR, moodAM: 2, sorenessPM: 4 }], TODAY);
    expect(days[0].mood).toBe(2);
    expect(days[0].soreness).toBe(4);
  });

  it("sorts oldest → newest and drops days outside the window or in the future", () => {
    const entries = [
      { date: dayStr(TODAY, -1), mood: 3 },
      { date: dayStr(TODAY, -30), mood: 1 },   // older than the 14-day window
      { date: dayStr(TODAY, +2), mood: 5 },    // future
      { date: dayStr(TODAY, -3), mood: 4 },
    ];
    const days = dailyWellbeing(entries, TODAY);
    expect(days.map(d => d.date)).toEqual([dayStr(TODAY, -3), dayStr(TODAY, -1)]);
  });

  it("nulls out non-numeric readings rather than passing them through", () => {
    const days = dailyWellbeing([{ date: TODAY_STR, mood: "great", soreness: null, sleep: "8h" }], TODAY);
    expect(days[0]).toMatchObject({ mood: null, soreness: null, sleep: null });
  });

  it("returns [] for junk", () => {
    expect(dailyWellbeing(null, TODAY)).toEqual([]);
    expect(dailyWellbeing("x", TODAY)).toEqual([]);
  });
});

// ─── seriesTrend ─────────────────────────────────────────────────────────────

describe("seriesTrend", () => {
  it("reports no direction under 4 points — 3 readings is not a trend", () => {
    expect(seriesTrend([1, 2, 3], { noiseFloor: 0.5 }).direction).toBeNull();
    expect(seriesTrend([], { noiseFloor: 0.5 }).direction).toBeNull();
    expect(seriesTrend(null).direction).toBeNull();
  });
  it("splits older half vs newer half and reports rising", () => {
    const t = seriesTrend([1, 1, 3, 3], { noiseFloor: 0.5 });
    expect(t.older).toBe(1);
    expect(t.newer).toBe(3);
    expect(t.direction).toBe("rising");
  });
  it("reports falling on the mirror case", () => {
    expect(seriesTrend([4, 4, 1, 1], { noiseFloor: 0.5 }).direction).toBe("falling");
  });
  it("reports flat when the move is inside the noise floor", () => {
    expect(seriesTrend([3, 3, 3.2, 3.2], { noiseFloor: 0.5 }).direction).toBe("flat");
    expect(seriesTrend([3, 3, 3, 3], { noiseFloor: 0.5 }).direction).toBe("flat");
  });
  it("scales the noise floor up with the series' own spread, like matchTrends", () => {
    // Same +3 move, two different spreads. In a series that ranges over 100 the
    // move is noise; in one that ranges over 4 it is the whole signal.
    expect(seriesTrend([0, 100, 3, 103], { noiseFloor: 0.1 }).direction).toBe("flat");
    expect(seriesTrend([0, 1, 3, 4], { noiseFloor: 0.1 }).direction).toBe("rising");
  });
  it("ignores non-numeric entries", () => {
    expect(seriesTrend([1, "x", 1, null, 3, 3], { noiseFloor: 0.5 }).count).toBe(4);
  });
});

// ─── LOAD FAMILY (real-clock dependent — see the header) ─────────────────────

// getWeekBounds (load.js → dates.js) anchors Mon-Sun weeks to the REAL current
// date, not the `now` passed into assessGuardian, so fixtures anchor off the
// real "now" too. Copied from reminders.test.js:123-131.
function realMonday(weeksAgo) {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - daysToMonday - weeksAgo * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// One session per day for the week `weeksAgo` back, `daily` giving each day's
// sRPE. Zero days are DROPPED, not logged as zero (see the header trap).
const weekOf = (weeksAgo, daily) => {
  const monday = realMonday(weeksAgo);
  return daily.map((srpe, d) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + d);
    return { date: toLocalDateStr(dt), rpe: 10, duration: srpe / 10 };
  }).filter(l => l.duration > 0);
};
const flat = (srpe) => Array(7).fill(srpe);
// Six days level, one dipped: sd is tiny but non-zero, so monotony is very
// high (a perfectly flat week gives sd 0, which reads as no signal at all).
const repetitive = (srpe) => [...Array(6).fill(srpe), srpe * 0.9];
const spike = (srpe) => [srpe, 0, 0, 0, 0, 0, 0];

describe("load family", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(TODAY); });
  afterAll(() => vi.useRealTimers());

  const factorsFor = (weekLogs) => assessGuardian({ weekLogs }, TODAY).factors;
  const ids = (weekLogs) => idsOf(factorsFor(weekLogs));

  it("really is running on a frozen Sunday — everything below depends on it", () => {
    // If the freeze ever stops covering Date, getWeekBounds silently reverts to
    // the real today and the family-collapse test starts passing by luck.
    expect(new Date().getDay()).toBe(0);
    expect(toLocalDateStr(new Date())).toBe(TODAY_STR);
    expect(toLocalDateStr(realMonday(0))).toBe("2026-08-03");
  });

  describe("acwr-spike", () => {
    it("fires above the line", () => {
      const logs = [...weekOf(0, spike(1600)), ...weekOf(1, spike(1000)), ...weekOf(2, spike(1000)), ...weekOf(3, spike(1000))];
      expect(ids(logs)).toContain("acwr-spike");
      expect(factorsFor(logs).find(f => f.id === "acwr-spike").weight).toBe(2);
    });
    it("fires at exactly 1.35", () => {
      const logs = [...weekOf(0, spike(1529)), ...weekOf(1, spike(1000)), ...weekOf(2, spike(1000)), ...weekOf(3, spike(1000))];
      expect(factorsFor(logs).find(f => f.id === "acwr-spike").metrics.acwr).toBe(1.35);
      expect(ids(logs)).toContain("acwr-spike");
    });
    it("does not fire below the line", () => {
      const logs = [...weekOf(0, spike(1400)), ...weekOf(1, spike(1000)), ...weekOf(2, spike(1000)), ...weekOf(3, spike(1000))];
      expect(ids(logs)).not.toContain("acwr-spike");
    });
    it("upgrades to weight 3 at the 1.5 danger line", () => {
      const logs = [...weekOf(0, spike(2000)), ...weekOf(1, spike(1000)), ...weekOf(2, spike(1000)), ...weekOf(3, spike(1000))];
      const f = factorsFor(logs).find(x => x.id === "acwr-spike");
      expect(f.weight).toBe(3);
      expect(f.severe).toBe(true);
    });
    it("refuses to fire on a ratio computed against empty history", () => {
      // One logged week after three blank ones reads as ACWR 4.0 — arithmetic,
      // not a spike. Only 1 of 4 buckets is non-zero.
      const logs = weekOf(0, spike(3000));
      expect(assessGuardian({ weekLogs: logs }, TODAY).metrics.acwr).toBe(4);
      expect(ids(logs)).not.toContain("acwr-spike");
    });
    it("fires once exactly 3 of the 4 buckets carry load", () => {
      const logs = [...weekOf(0, spike(1600)), ...weekOf(1, spike(1000)), ...weekOf(2, spike(1000))];
      expect(ids(logs)).toContain("acwr-spike");
    });
  });

  describe("sustained-load", () => {
    it("fires on three weeks over 2000", () => {
      const logs = [0, 1, 2, 3].flatMap(w => weekOf(w, flat(300)));  // 2100/week
      expect(ids(logs)).toContain("sustained-load");
    });
    it("does not fire at exactly 2000 — the comparison is strict, matching reminders.js", () => {
      const logs = [0, 1, 2].flatMap(w => weekOf(w, spike(2000)));
      expect(ids(logs)).not.toContain("sustained-load");
    });
    it("fires one sRPE point above the line", () => {
      const logs = [0, 1, 2].flatMap(w => weekOf(w, spike(2001)));
      expect(ids(logs)).toContain("sustained-load");
    });
    it("does not fire when only 2 weeks are high", () => {
      const logs = [...weekOf(0, flat(300)), ...weekOf(1, flat(300))];
      expect(ids(logs)).not.toContain("sustained-load");
    });
  });

  describe("monotony-high", () => {
    // [300 x4, 100 x3] → monotony 2.17, 1500 sRPE over the week.
    const bumpy = [300, 300, 300, 300, 100, 100, 100];
    const scaled = (k) => bumpy.map(v => v * k);

    it("fires between 2.0 and 2.5 at weight 1", () => {
      const logs = [0, 1, 2, 3].flatMap(w => weekOf(w, bumpy));
      const f = assessGuardian({ weekLogs: logs }, TODAY).factors.find(x => x.id === "monotony-high");
      expect(f).toBeTruthy();
      expect(f.weight).toBe(1);
      expect(f.severe).toBe(false);
    });
    it("upgrades to weight 2 past 2.5", () => {
      const logs = [0, 1, 2, 3].flatMap(w => weekOf(w, repetitive(400)));
      const f = assessGuardian({ weekLogs: logs }, TODAY).factors.find(x => x.id === "monotony-high");
      expect(f.weight).toBe(2);
      expect(f.severe).toBe(true);
    });
    it("does not fire on a varied week", () => {
      const logs = [0, 1, 2, 3].flatMap(w => weekOf(w, spike(1500)));
      expect(ids(logs)).not.toContain("monotony-high");
    });
    it("fires at exactly the 1200 sRPE volume floor", () => {
      const logs = [0, 1, 2, 3].flatMap(w => weekOf(w, scaled(0.8)));  // 1200/week
      expect(assessGuardian({ weekLogs: logs }, TODAY).metrics.sevenDaySRPE).toBe(1200);
      expect(ids(logs)).toContain("monotony-high");
    });
    it("stays quiet below the volume floor — repetitive but trivial is not a risk", () => {
      const logs = [0, 1, 2, 3].flatMap(w => weekOf(w, scaled(0.5)));  // 750/week
      const a = assessGuardian({ weekLogs: logs }, TODAY);
      expect(a.metrics.monotony).toBeGreaterThanOrEqual(GUARDIAN_THRESHOLDS.monotonyHigh);
      expect(idsOf(a.factors)).not.toContain("monotony-high");
    });
  });

  // ── THE REGRESSION TEST THIS ENGINE EXISTS FOR ─────────────────────────────
  describe("family collapse — three load factors are ONE story", () => {
    // week 0 repetitive at 2760 sRPE (ACWR 1.59 severe + monotony 28.17
    // severe), weeks 1-2 at 2100 (over the sustained-volume line), week 3 empty.
    const ALL_THREE = [...weekOf(0, repetitive(400)), ...weekOf(1, flat(300)), ...weekOf(2, flat(300))];

    it("finds all three load factors", () => {
      expect(idsOf(assessGuardian({ weekLogs: ALL_THREE }, TODAY).factors).sort())
        .toEqual(["acwr-spike", "monotony-high", "sustained-load"]);
    });

    it("collapses them to a single family", () => {
      expect(familiesOf(assessGuardian({ weekLogs: ALL_THREE }, TODAY))).toEqual(["load"]);
    });

    it("counts the family's MAXIMUM weight, not the sum of its factors", () => {
      // 3 + 2 + 2 summed would be 7 (urgent!). The family contributes 3.
      expect(assessGuardian({ weekLogs: ALL_THREE }, TODAY).totalWeight).toBe(3);
    });

    it("DOES NOT FIRE — one story told three ways is still one story", () => {
      const a = assessGuardian({ weekLogs: ALL_THREE }, TODAY);
      expect(a.fires).toBe(false);
      expect(a.reason).toBe("single-family");
      expect(a.severity).toBeNull();
      expect(a.storyKey).toBeNull();
    });

    it("fires the moment a SECOND family joins the same load story", () => {
      const wellbeing = wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]);
      const a = assessGuardian({ weekLogs: ALL_THREE, wellbeing }, TODAY);
      expect(a.fires).toBe(true);
      expect(a.families).toEqual(["load", "recovery"]);
      expect(a.totalWeight).toBe(5);          // load 3 + recovery 2
      expect(a.severity).toBe("concern");
      expect(a.tone).toBe("warn");
    });
  });
});

// ─── RECOVERY FAMILY (fully time-injectable) ─────────────────────────────────

describe("recovery family", () => {
  const factorsFor = (wellbeing) => assessGuardian({ wellbeing }, TODAY).factors;
  const ids = (wellbeing) => idsOf(factorsFor(wellbeing));

  describe("soreness-high", () => {
    it("fires on a 3-reading mean above the line", () => {
      expect(ids(wbDays([{ soreness: 4 }, { soreness: 4 }, { soreness: 4 }]))).toContain("soreness-high");
    });
    it("fires at exactly 3.5", () => {
      const w = wbDays([{ soreness: 3 }, { soreness: 3.5 }, { soreness: 4 }]);
      expect(assessGuardian({ wellbeing: w }, TODAY).metrics.sorenessMean).toBe(3.5);
      expect(ids(w)).toContain("soreness-high");
    });
    it("does not fire below it", () => {
      expect(ids(wbDays([{ soreness: 2 }, { soreness: 3 }, { soreness: 3 }]))).not.toContain("soreness-high");
    });
    it("does not fire on fewer than 3 readings — one brutal session is not a pattern", () => {
      expect(ids(wbDays([{ soreness: 5 }, { soreness: 5 }]))).not.toContain("soreness-high");
    });
  });

  describe("soreness-rising", () => {
    it("fires on a rising run that is heading somewhere", () => {
      const w = wbDays([{ soreness: 2 }, { soreness: 2 }, { soreness: 2 }, { soreness: 3 }, { soreness: 3 }, { soreness: 3 }, { soreness: 4 }]);
      expect(ids(w)).toContain("soreness-rising");
      expect(ids(w)).not.toContain("soreness-high");   // the two are independent
    });
    it("does not fire when the trend is flat", () => {
      expect(ids(wbDays(Array(7).fill({ soreness: 3 })))).not.toContain("soreness-rising");
    });
    it("does not fire when it is rising from nothing towards nothing", () => {
      const w = wbDays([{ soreness: 1 }, { soreness: 1 }, { soreness: 1 }, { soreness: 1.5 }, { soreness: 2 }, { soreness: 2 }, { soreness: 2.5 }]);
      expect(ids(w)).not.toContain("soreness-rising");
    });
    it("does not fire on fewer than 4 readings", () => {
      expect(ids(wbDays([{ soreness: 1 }, { soreness: 3 }, { soreness: 4 }]))).not.toContain("soreness-rising");
    });
  });

  describe("sleep-deficit", () => {
    it("fires on three short nights", () => {
      expect(ids(wbDays([{ sleep: 6 }, { sleep: 6.5 }, { sleep: 7 }]))).toContain("sleep-deficit");
    });
    // The boundary reminders.js:190 owns: `Number(avgSleep) < sleepDeficitHours`.
    // A `<=` here would fire at exactly the target and print "averaged 7h (7h+
    // is the target)" — an alert contradicting itself, and this is a mean over
    // three nights so 6+7+8 reaches it for real.
    it("does not fire at exactly the 7h line — 7h IS the target, and reminders.js uses <", () => {
      const w = wbDays([{ sleep: 7 }, { sleep: 7 }, { sleep: 7 }]);
      expect(assessGuardian({ wellbeing: w }, TODAY).metrics.sleepMean).toBe(7);
      expect(ids(w)).not.toContain("sleep-deficit");
    });
    it("does not fire when three uneven nights average to exactly 7.0", () => {
      const w = wbDays([{ sleep: 6 }, { sleep: 7 }, { sleep: 8 }]);
      expect(assessGuardian({ wellbeing: w }, TODAY).metrics.sleepMean).toBe(7);
      expect(ids(w)).not.toContain("sleep-deficit");
    });
    it("fires at 6.9 — one tenth under the line is under the line", () => {
      const w = wbDays([{ sleep: 6.9 }, { sleep: 6.9 }, { sleep: 6.9 }]);
      expect(assessGuardian({ wellbeing: w }, TODAY).metrics.sleepMean).toBe(6.9);
      expect(ids(w)).toContain("sleep-deficit");
    });
    it("does not fire on healthy sleep", () => {
      expect(ids(wbDays([{ sleep: 8 }, { sleep: 9 }, { sleep: 8.5 }]))).not.toContain("sleep-deficit");
    });
    it("does not fire on fewer than 3 nights", () => {
      expect(ids(wbDays([{ sleep: 4 }, { sleep: 4 }]))).not.toContain("sleep-deficit");
    });
  });

  describe("mood-decline", () => {
    it("fires on 3 consecutive low days", () => {
      expect(ids(wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]))).toContain("mood-decline");
    });
    it("fires at exactly 2.5 — the threshold is inclusive", () => {
      expect(ids(wbDays([{ mood: 2.5 }, { mood: 2.5 }, { mood: 2.5 }]))).toContain("mood-decline");
    });
    it("does not fire on 2 consecutive low days", () => {
      expect(ids(wbDays([{ mood: 2 }, { mood: 2 }, { mood: 4 }]))).not.toContain("mood-decline");
    });
    it("does not fire when a good day breaks the run — this is the consecutive test the reminder engine had to give up", () => {
      expect(ids(wbDays([{ mood: 2 }, { mood: 2 }, { mood: 4 }, { mood: 2 }, { mood: 2 }]))).not.toContain("mood-decline");
    });
    it("treats a missing check-in as missing data, not as a good day", () => {
      const w = [
        { date: dayStr(TODAY, -4), type: "checkin", mood: 2 },
        { date: dayStr(TODAY, -2), type: "checkin", mood: 2 },
        { date: dayStr(TODAY, 0),  type: "checkin", mood: 2 },
      ];
      expect(ids(w)).toContain("mood-decline");
    });

    // The recency anchor. Without it the loop kept the LONGEST low run anywhere
    // in the 14-day window, so a dip that recovered a week and a half ago still
    // carried weight 2 today — and weight 2 in a second family is exactly what
    // tips the gate.
    describe("recency anchor — only the run that is still open counts", () => {
      it("does not fire on a dip that recovered eleven days ago", () => {
        const w = wbDays([
          { mood: 2 }, { mood: 2 }, { mood: 2 },                        // -13..-11
          { mood: 4 }, { mood: 4 }, { mood: 4 }, { mood: 4 },
          { mood: 4 }, { mood: 4 }, { mood: 4 }, { mood: 4 },
          { mood: 4 }, { mood: 4 }, { mood: 4 },                        // recovered through today
        ]);
        expect(ids(w)).not.toContain("mood-decline");
      });
      it("still fires on a current run even when a LONGER stale run sits behind it", () => {
        // 4 low days that recovered, then 3 low days ending today. The old
        // max-run scan would have reported the stale 4 and rejected nothing;
        // the current run is what matters.
        const w = wbDays([
          { mood: 2 }, { mood: 2 }, { mood: 2 }, { mood: 2 },
          { mood: 5 }, { mood: 5 }, { mood: 5 }, { mood: 5 }, { mood: 5 }, { mood: 5 }, { mood: 5 },
          { mood: 2 }, { mood: 2 }, { mood: 2 },
        ]);
        expect(ids(w)).toContain("mood-decline");
        const f = factorsFor(w).find(x => x.id === "mood-decline");
        expect(f.metrics.moodLowStreak).toBe(3);
        expect(f.metrics.moodStreakThrough).toBe(TODAY_STR);
        expect(f.evidence).toContain(TODAY_STR);
      });
      it("survives a one-day gap at the end — a missed check-in is not a recovery", () => {
        const w = [
          { date: dayStr(TODAY, -3), type: "checkin", mood: 2 },
          { date: dayStr(TODAY, -2), type: "checkin", mood: 2 },
          { date: dayStr(TODAY, -1), type: "checkin", mood: 2 },
        ];
        expect(ids(w)).toContain("mood-decline");
      });
      it("goes quiet once the newest low reading is older than recentReadingDays", () => {
        // Same three low days, but she stopped checking in four days ago. The
        // run never closed; it simply stopped describing now.
        const w = [
          { date: dayStr(TODAY, -6), type: "checkin", mood: 2 },
          { date: dayStr(TODAY, -5), type: "checkin", mood: 2 },
          { date: dayStr(TODAY, -4), type: "checkin", mood: 2 },
        ];
        expect(ids(w)).not.toContain("mood-decline");
      });
    });
  });

  describe("readiness-low", () => {
    it("is recorded as evidence but does not count towards the gate", () => {
      const w = wbDays([{ mood: 1, soreness: 5, sleep: 4 }]);
      const a = assessGuardian({ wellbeing: w }, TODAY);
      const f = a.factors.find(x => x.id === "readiness-low");
      expect(f).toBeTruthy();
      expect(f.counts).toBe(false);
      expect(f.weight).toBe(0);
      // One low-readiness morning must not put `recovery` on the board.
      expect(a.families).toEqual([]);
      expect(a.totalWeight).toBe(0);
    });
    it("does not appear on a good morning", () => {
      expect(ids(wbDays([{ mood: 5, soreness: 1, sleep: 9 }]))).not.toContain("readiness-low");
    });

    // This string goes verbatim into the model prompt under "never contradict a
    // factor", so it has to be true for every input that reaches it. The newest
    // COMPLETE reading (mood and soreness both present) can be a fortnight old.
    it("drops out entirely when the newest complete reading is stale", () => {
      const w = [{ date: dayStr(TODAY, -9), type: "checkin", mood: 1, soreness: 5, sleep: 4 }];
      expect(ids(w)).not.toContain("readiness-low");
    });
    it("still speaks for yesterday's check-in — mood is logged at night, the Guardian assesses at 6am", () => {
      const w = [{ date: dayStr(TODAY, -1), type: "checkin", mood: 1, soreness: 5, sleep: 4 }];
      expect(ids(w)).toContain("readiness-low");
    });
    it("names the check-in's own date instead of claiming 'today'", () => {
      const yesterday = dayStr(TODAY, -1);
      const w = [{ date: yesterday, type: "checkin", mood: 1, soreness: 5, sleep: 4 }];
      const f = factorsFor(w).find(x => x.id === "readiness-low");
      expect(f.evidence).toContain(yesterday);
      expect(f.evidence).not.toMatch(/today/i);
      expect(f.label).not.toMatch(/this morning|today/i);
      expect(f.metrics.readinessDate).toBe(yesterday);
    });
  });
});

// ─── TISSUE FAMILY ───────────────────────────────────────────────────────────

describe("tissue family", () => {
  const inj = (over = {}) => ({ id: "i1", bodyArea: "Knee", side: "Left", status: "open", severity: 2, onsetDate: dayStr(TODAY, -2), ...over });
  const factorsFor = (injuries) => assessGuardian({ wellbeing: CALM_DAY, injuries }, TODAY).factors;
  const ids = (injuries) => idsOf(factorsFor(injuries));

  it("fires open-injury-severe at severity 5", () => {
    expect(ids([inj({ severity: 5 })])).toContain("open-injury-severe");
  });
  it("fires open-injury-severe at exactly 4 — 'can barely train'", () => {
    const f = factorsFor([inj({ severity: 4 })]).find(x => x.id === "open-injury-severe");
    expect(f.weight).toBe(3);
    expect(f.standalone).toBe(true);
  });
  it("fires open-injury-moderate at exactly 3, and it is NOT standalone", () => {
    const f = factorsFor([inj({ severity: 3 })]).find(x => x.id === "open-injury-moderate");
    expect(f.weight).toBe(2);
    expect(f.standalone).toBe(false);
    expect(ids([inj({ severity: 3 })])).not.toContain("open-injury-severe");
  });
  it("fires nothing at severity 2", () => {
    expect(ids([inj({ severity: 2 })])).toEqual([]);
  });
  it("ignores resolved injuries", () => {
    expect(ids([inj({ severity: 5, status: "resolved", resolvedDate: dayStr(TODAY, -1) })])).toEqual([]);
  });

  describe("injury-lingering — the clock injuryLoadFlag deliberately lacks", () => {
    it("fires at exactly 14 days open", () => {
      expect(ids([inj({ onsetDate: dayStr(TODAY, -14) })])).toContain("injury-lingering");
    });
    it("does not fire at 13 days", () => {
      expect(ids([inj({ onsetDate: dayStr(TODAY, -13) })])).not.toContain("injury-lingering");
    });
    it("fires on a mild niggle that simply will not go away", () => {
      // Severity 2 raises nothing else, so this is the only tissue factor.
      expect(ids([inj({ severity: 2, onsetDate: dayStr(TODAY, -40) })])).toEqual(["injury-lingering"]);
    });
  });

  // recurringAreas reads new Date() internally, so this one describe pins the
  // system clock rather than relying on the injected `now`.
  describe("recurring-area (real-clock dependent)", () => {
    beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(TODAY); });
    afterAll(() => vi.useRealTimers());

    // Healed episodes, used to build a history the current flare sits on top of.
    const healed = (id, area, onsetOffset) => inj({
      id, bodyArea: area, severity: 2, status: "resolved",
      onsetDate: dayStr(TODAY, onsetOffset), resolvedDate: dayStr(TODAY, onsetOffset + 20),
    });

    it("does not fire on a SECOND flare — twice in six months is often just a season", () => {
      const injuries = [
        healed("a", "Ankle", -100),
        inj({ id: "b", bodyArea: "Ankle", severity: 2, onsetDate: dayStr(TODAY, -3) }),
      ];
      expect(ids(injuries)).not.toContain("recurring-area");
    });
    it("fires on the THIRD flare in the same area, counting the two that healed", () => {
      const injuries = [
        healed("a", "Ankle", -150),
        healed("b", "Ankle", -80),
        inj({ id: "c", bodyArea: "Ankle", severity: 2, onsetDate: dayStr(TODAY, -3) }),
      ];
      expect(ids(injuries)).toContain("recurring-area");
      const f = factorsFor(injuries).find(x => x.id === "recurring-area");
      expect(f.metrics.recurringCount).toBe(3);
      expect(f.evidence).toContain("3 times");
      expect(f.evidence).toContain("open now");
    });
    it("goes quiet when all three have healed — history alone is not a flare-up today", () => {
      const injuries = [healed("a", "Ankle", -150), healed("b", "Ankle", -80), healed("c", "Ankle", -20)];
      expect(ids(injuries)).not.toContain("recurring-area");
    });
    it("does not fire on three flares spread across different areas", () => {
      const injuries = [
        healed("a", "Ankle", -150),
        healed("b", "Wrist", -80),
        inj({ id: "c", bodyArea: "Knee", severity: 2, onsetDate: dayStr(TODAY, -3) }),
      ];
      expect(ids(injuries)).not.toContain("recurring-area");
    });
    it("does not count a flare that fell outside the 180-day window", () => {
      const injuries = [
        healed("a", "Ankle", -400),
        healed("b", "Ankle", -80),
        inj({ id: "c", bodyArea: "Ankle", severity: 2, onsetDate: dayStr(TODAY, -3) }),
      ];
      expect(ids(injuries)).not.toContain("recurring-area");
    });
    it("counts the open episode against the area it is open in, not another one", () => {
      // Three Ankle records inside the window, but the only OPEN injury is a
      // Knee — the ankle is history, so it does not speak.
      const injuries = [
        healed("a", "Ankle", -150),
        healed("b", "Ankle", -100),
        healed("c", "Ankle", -50),
        inj({ id: "d", bodyArea: "Knee", severity: 2, onsetDate: dayStr(TODAY, -3) }),
      ];
      expect(ids(injuries)).not.toContain("recurring-area");
    });
  });
});

// ─── GROWTH FAMILY ───────────────────────────────────────────────────────────

describe("growth family", () => {
  const factorsFor = (athlete) => assessGuardian({ wellbeing: CALM_DAY, athlete }, TODAY).factors;
  const ids = (athlete) => idsOf(factorsFor(athlete));

  it("fires mid-phv-window — the app's only encoded growth-risk statement, which never alerted before", () => {
    expect(ids(MID_PHV_ATHLETE)).toEqual(["mid-phv-window"]);
    expect(factorsFor(MID_PHV_ATHLETE)[0].weight).toBe(2);
  });
  it("does not fire for a Pre-PHV athlete", () => {
    expect(ids(PRE_PHV_ATHLETE)).toEqual([]);
  });

  it("yields NO growth family at all when maturityOffset returns null for want of a sitting height", () => {
    const athlete = { dob: "2013-08-09", measurements: [{ date: "2026-08-01", height: 160, weight: 48 }] };
    const a = assessGuardian({ wellbeing: CALM_DAY, athlete }, TODAY);
    expect(a.metrics.maturityStage).toBeNull();
    expect(a.families).toEqual([]);
    expect(idsOf(a.factors)).not.toContain("mid-phv-window");
  });

  describe("rapid-growth — the span guard is not optional", () => {
    const grew = (fromDate, toDate, fromH, toH) => ({
      dob: "2016-08-09",   // Pre-PHV, so mid-phv-window cannot muddy the result
      measurements: [
        { date: fromDate, height: fromH, sittingHeight: 75, weight: 35 },
        { date: toDate,   height: toH,   sittingHeight: 75, weight: 35 },
      ],
    });

    it("fires on fast growth measured over a long enough span", () => {
      // 6cm over 153 days → 14.3 cm/yr.
      expect(ids(grew("2026-03-01", "2026-08-01", 150, 156))).toContain("rapid-growth");
    });

    it("does NOT fire over a 30-day span, even at 7.3 cm/yr — that is tape-measure noise, not growth", () => {
      // 0.6cm of measurement error across 3 weeks annualises to ~7 cm/yr.
      const athlete = grew("2026-07-02", "2026-08-01", 155, 155.6);
      const a = assessGuardian({ wellbeing: CALM_DAY, athlete }, TODAY);
      expect(a.metrics.growthVelocity).toBe(7.3);
      expect(a.metrics.growthSpanDays).toBe(30);
      expect(idsOf(a.factors)).not.toContain("rapid-growth");
    });

    it("fires at exactly 6.0 cm/yr over exactly a 60-day span", () => {
      const athlete = grew("2026-06-02", "2026-08-01", 150, 150.99);
      const a = assessGuardian({ wellbeing: CALM_DAY, athlete }, TODAY);
      expect(a.metrics.growthVelocity).toBe(6);
      expect(a.metrics.growthSpanDays).toBe(60);
      expect(idsOf(a.factors)).toContain("rapid-growth");
    });

    it("does not fire on ordinary growth over a long span", () => {
      // 1.5cm over 180 days → 3.0 cm/yr.
      expect(ids(grew("2026-02-02", "2026-08-01", 150, 151.5))).not.toContain("rapid-growth");
    });

    it("does not fire on a single measurement", () => {
      expect(ids({ dob: "2016-08-09", measurements: [{ date: "2026-08-01", height: 150 }] })).not.toContain("rapid-growth");
    });
  });
});

// ─── THE GATE ────────────────────────────────────────────────────────────────
// Built entirely from recovery/tissue/growth, all of which honour the injected
// clock — so the rule that decides whether a phone buzzes is tested
// deterministically. (load + recovery is covered in the load describe above,
// under the frozen Sunday clock.)

describe("the gate — combinations, not factors", () => {
  const MOOD_3_LOW    = wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]);           // recovery, w2
  const MODERATE_INJ  = [{ id: "i1", bodyArea: "Knee", severity: 3, status: "open", onsetDate: dayStr(TODAY, -3) }]; // tissue, w2

  it("fires on recovery + tissue at exactly the weight floor", () => {
    const a = assessGuardian({ wellbeing: MOOD_3_LOW, injuries: MODERATE_INJ }, TODAY);
    expect(a.fires).toBe(true);
    expect(a.families).toEqual(["recovery", "tissue"]);
    expect(a.totalWeight).toBe(4);
    expect(a.severity).toBe("watch");
    expect(a.tone).toBe("info");
    expect(a.reason).toBe("family-stack");
  });

  it("does NOT fire on growth alone — a modifier family that persists for months can never be the story", () => {
    const athlete = {
      dob: "2013-08-09",
      measurements: [
        { date: "2026-03-01", height: 154, sittingHeight: 80, weight: 48 },
        { date: "2026-08-01", height: 160, sittingHeight: 80, weight: 48 },
      ],
    };
    const a = assessGuardian({ wellbeing: CALM_DAY, athlete }, TODAY);
    // Both growth factors are present, and they still collapse to one family.
    expect(idsOf(a.factors).sort()).toEqual(["mid-phv-window", "rapid-growth"]);
    expect(a.families).toEqual(["growth"]);
    expect(a.fires).toBe(false);
    expect(a.reason).toBe("single-family");
  });

  it("lets growth tip a borderline recovery story over the line", () => {
    const a = assessGuardian({ wellbeing: MOOD_3_LOW, athlete: MID_PHV_ATHLETE }, TODAY);
    expect(a.families).toEqual(["growth", "recovery"]);
    expect(a.totalWeight).toBe(4);
    expect(a.fires).toBe(true);
  });

  it("escalates to urgent on three families", () => {
    const a = assessGuardian({ wellbeing: MOOD_3_LOW, injuries: MODERATE_INJ, athlete: MID_PHV_ATHLETE }, TODAY);
    expect(a.families).toEqual(["growth", "recovery", "tissue"]);
    expect(a.totalWeight).toBe(6);
    expect(a.severity).toBe("urgent");
    expect(a.tone).toBe("danger");
  });

  it("does not fire on a single recovery factor", () => {
    const a = assessGuardian({ wellbeing: MOOD_3_LOW }, TODAY);
    expect(a.fires).toBe(false);
    expect(a.reason).toBe("single-family");
  });

  describe("standalone override", () => {
    const SEVERE_INJ = [{ id: "i1", bodyArea: "Shoulder", severity: 5, status: "open", onsetDate: dayStr(TODAY, -2) }];

    it("a lone severity-5 open injury fires, urgent, with one family and weight 3", () => {
      const a = assessGuardian({ wellbeing: CALM_DAY, injuries: SEVERE_INJ }, TODAY);
      expect(a.fires).toBe(true);
      expect(a.reason).toBe("standalone");
      expect(a.families).toEqual(["tissue"]);
      expect(a.totalWeight).toBe(3);          // below the normal weight floor
      expect(a.severity).toBe("urgent");
      expect(a.headline).toMatch(/open injury/i);
    });
  });
});

describe("evaluateGate — combinations the live factor table cannot reach yet", () => {
  const f = (family, weight, extra = {}) => ({ id: `${family}-${weight}`, family, weight, counts: true, standalone: false, ...extra });

  it("refuses two MODIFIER families — asymmetry + growth have no trigger between them", () => {
    const g = evaluateGate([f("growth", 2), f("asymmetry", 2)]);
    expect(g.fires).toBe(false);
    expect(g.reason).toBe("modifiers-only");
    expect(g.totalWeight).toBe(4);            // it clears the weight floor and still does not fire
  });

  it("refuses two weight-1 families — a repetitive week plus one grumpy morning is a normal fortnight", () => {
    const g = evaluateGate([f("load", 1), f("recovery", 1)]);
    expect(g.fires).toBe(false);
    expect(g.reason).toBe("below-weight-floor");
    expect(g.totalWeight).toBe(2);
  });

  it("fires urgent on three trigger families", () => {
    const g = evaluateGate([f("load", 2), f("recovery", 2), f("tissue", 2)]);
    expect(g.fires).toBe(true);
    expect(g.severity).toBe("urgent");
    expect(g.families).toEqual(["load", "recovery", "tissue"]);
  });

  it("bands severity at 4 / 5 / 6", () => {
    expect(evaluateGate([f("load", 2), f("recovery", 2)]).severity).toBe("watch");
    expect(evaluateGate([f("load", 3), f("recovery", 2)]).severity).toBe("concern");
    expect(evaluateGate([f("load", 3), f("recovery", 3)]).severity).toBe("urgent");
  });

  it("takes each family's max weight, never the sum of its factors", () => {
    const g = evaluateGate([f("load", 3), f("load", 2), f("load", 2), f("recovery", 2)]);
    expect(g.totalWeight).toBe(5);
    expect(g.weightByFamily).toEqual({ load: 3, recovery: 2 });
  });

  it("ignores counts:false factors entirely", () => {
    const g = evaluateGate([f("load", 2), f("recovery", 0, { counts: false, weight: 0 })]);
    expect(g.families).toEqual(["load"]);
    expect(g.fires).toBe(false);
  });

  it("a standalone factor overrides everything, at urgent", () => {
    const g = evaluateGate([f("tissue", 3, { standalone: true })]);
    expect(g.fires).toBe(true);
    expect(g.reason).toBe("standalone");
    expect(g.severity).toBe("urgent");
  });

  it("returns no-factors for an empty or junk list", () => {
    expect(evaluateGate([]).reason).toBe("no-factors");
    expect(evaluateGate(null).reason).toBe("no-factors");
  });
});

// ─── KEY STABILITY ───────────────────────────────────────────────────────────

describe("storyKey / factorKey stability", () => {
  const raw = (base) => ({
    wellbeing: wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }], base),
    injuries: [{ id: "i1", bodyArea: "Knee", severity: 3, status: "open", onsetDate: dayStr(base, -3) }],
  });

  it("gives the same families on a different date the same storyKey — cooldown depends on it", () => {
    const later = new Date("2026-09-20T06:00:00");
    const a = assessGuardian(raw(TODAY), TODAY);
    const b = assessGuardian(raw(later), later);
    expect(a.storyKey).toBe("g1:recovery+tissue");
    expect(b.storyKey).toBe(a.storyKey);
  });

  it("gives DIFFERENT factors in the same families the same storyKey but a different factorKey", () => {
    const viaMood  = raw(TODAY);
    const viaSleep = { ...raw(TODAY), wellbeing: wbDays([{ sleep: 6 }, { sleep: 6 }, { sleep: 6 }]) };
    const a = assessGuardian(viaMood, TODAY);
    const b = assessGuardian(viaSleep, TODAY);
    expect(a.families).toEqual(b.families);
    expect(a.storyKey).toBe(b.storyKey);
    expect(a.factorKey).not.toBe(b.factorKey);
    expect(a.factorKey).toContain("mood-decline");
    expect(b.factorKey).toContain("sleep-deficit");
  });

  it("sorts families so factor discovery order can never change the key", () => {
    const a = assessGuardian(raw(TODAY), TODAY);
    expect(a.families).toEqual([...a.families].sort());
    expect(a.storyKey.startsWith(`g${GUARDIAN_ENGINE_VERSION}:`)).toBe(true);
  });

  it("mints no keys at all for a non-firing assessment", () => {
    const a = assessGuardian({ wellbeing: wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]) }, TODAY);
    expect(a.storyKey).toBeNull();
    expect(a.factorKey).toBeNull();
  });
});

// ─── COOLDOWN ────────────────────────────────────────────────────────────────

// The window is compared against ONE current record, not a map keyed by
// storyKey. Keying it on storyKey was the bug: storyKey names the family set, so
// any change to the set minted a fresh key with no prior entry and the Guardian
// spoke again the next morning.
//
// Everything below runs on the injected clock. The chained cases build their
// prior record by running cooldownDecision for real, and the two that need
// genuine family sets build those with assessGuardian — recovery, tissue and
// growth only, so no realMonday and no frozen system clock are involved.
describe("cooldownDecision", () => {
  const FIRED_ON = "2026-08-01";
  const assessment = (over = {}) => ({
    fires: true, storyKey: "g1:recovery+tissue", factorKey: "g1:mood-decline+open-injury-moderate",
    families: ["recovery", "tissue"], severity: "watch", totalWeight: 4, ...over,
  });
  const at = (dateStr) => new Date(`${dateStr}T06:00:00`);

  // The doc as cooldownDecision itself would have left it after firing on
  // FIRED_ON — a record the engine can genuinely produce, not a hand-written
  // one. `over` patches the record afterwards for the malformed-input cases.
  const doc = (over = {}) => {
    const first = cooldownDecision(null, assessment(), at(FIRED_ON));
    return { current: { ...first.nextEntry, ...over } };
  };

  // Real assessments, so the family sets are ones the engine actually mints.
  const lowMood = (base) => wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }], base);
  const openKnee = (base) => [
    { id: "i1", bodyArea: "Knee", severity: 3, status: "open", onsetDate: dayStr(base, -3) },
  ];
  //  recovery + tissue          — weight 4, watch
  const recoveryTissue = (day) =>
    assessGuardian({ wellbeing: lowMood(at(day)), injuries: openKnee(at(day)) }, at(day));
  //  growth + recovery + tissue — weight 6, urgent
  const withGrowth = (day) =>
    assessGuardian(
      { wellbeing: lowMood(at(day)), injuries: openKnee(at(day)), athlete: MID_PHV_ATHLETE },
      at(day),
    );
  //  growth + recovery          — weight 4, watch (tissue gone, growth new)
  const recoveryGrowth = (day) =>
    assessGuardian({ wellbeing: lowMood(at(day)), athlete: MID_PHV_ATHLETE }, at(day));

  it("fires when the cooldown doc is empty", () => {
    const d = cooldownDecision({}, assessment(), at("2026-08-05"));
    expect(d.suppressed).toBe(false);
    expect(d.reason).toBe("first-fire");
    expect(d.nextEntry.firstFiredDate).toBe("2026-08-05");
    expect(d.nextEntry.fireCount).toBe(1);
    expect(d.nextEntry.cleared).toBe(false);
  });

  it("fires when the doc is missing entirely", () => {
    expect(cooldownDecision(null, assessment(), at("2026-08-05")).suppressed).toBe(false);
  });

  it("treats a doc with no readable `current` as no prior and fires", () => {
    // Includes the pre-rewrite `{ stories: {…} }` shape. Nothing is deployed, so
    // there is no real data behind it — this only has to not crash or suppress.
    const legacy = { stories: { "g1:recovery+tissue": { lastFiredDate: FIRED_ON, severity: "watch" } } };
    for (const junk of [legacy, { current: null }, { current: "nope" }, { current: [] }]) {
      const d = cooldownDecision(junk, assessment(), at("2026-08-02"));
      expect(d.suppressed).toBe(false);
      expect(d.reason).toBe("first-fire");
    }
  });

  it("suppresses inside the 10-day window", () => {
    for (const day of ["2026-08-02", "2026-08-05", "2026-08-10"]) {
      const d = cooldownDecision(doc(), assessment(), at(day));
      expect(d.suppressed).toBe(true);
      expect(d.reason).toBe("cooldown");
      expect(d.nextEntry).toBeNull();
    }
  });

  // ── THE REGRESSION ────────────────────────────────────────────────────────
  // The case the storyKey-keyed lookup got silently wrong. Two consecutive
  // mornings, two DIFFERENT family sets, therefore two different storyKeys —
  // under the old model the second found no entry under its own key and fired
  // as `first-fire`, which is precisely the nagging the window exists to stop.
  it("suppresses a DIFFERENT family set the very next day", () => {
    const mon = withGrowth("2026-08-01");         // growth+recovery+tissue
    const tue = recoveryTissue("2026-08-02");     // recovery+tissue — the knee story alone
    expect(mon.storyKey).not.toBe(tue.storyKey);

    const first = cooldownDecision(null, mon, at("2026-08-01"));
    expect(first.suppressed).toBe(false);

    const second = cooldownDecision({ current: first.nextEntry }, tue, at("2026-08-02"));
    expect(second.suppressed).toBe(true);
    expect(second.reason).toBe("cooldown");
    expect(second.nextEntry).toBeNull();
  });

  it("fires again on day 11", () => {
    const d = cooldownDecision(doc(), assessment(), at("2026-08-11"));
    expect(d.suppressed).toBe(false);
    expect(d.reason).toBe("cooldown-expired");
    expect(d.nextEntry.firstSeenDate).toBe(FIRED_ON);   // episode history is kept
    expect(d.nextEntry.firstFiredDate).toBe("2026-08-11");
    expect(d.nextEntry.fireCount).toBe(2);
  });

  it("restarts the episode history when the story that returns is a different one", () => {
    const other = assessment({ storyKey: "g1:growth+recovery", families: ["growth", "recovery"] });
    const d = cooldownDecision(doc(), other, at("2026-08-11"));
    expect(d.reason).toBe("cooldown-expired");
    expect(d.nextEntry.firstSeenDate).toBe("2026-08-11");
    expect(d.nextEntry.fireCount).toBe(1);
  });

  it("breaks the window when severity rises", () => {
    const d = cooldownDecision(doc(), assessment({ severity: "concern", totalWeight: 5 }), at("2026-08-03"));
    expect(d.suppressed).toBe(false);
    expect(d.reason).toBe("escalation-severity");
  });

  it("breaks the window when a NEW family joins", () => {
    // Both records come from the engine: recovery+tissue on the 1st, then
    // growth+recovery on the 3rd. Same weight (4) and same severity (watch), so
    // `growth` arriving is the only thing that can break the window — which is
    // what makes this branch reachable at all now that the lookup is not keyed
    // by storyKey.
    const first = recoveryTissue("2026-08-01");
    const later = recoveryGrowth("2026-08-03");
    expect(later.totalWeight).toBe(first.totalWeight);
    expect(later.severity).toBe(first.severity);
    expect(later.families).toContain("growth");

    const prior = cooldownDecision(null, first, at("2026-08-01"));
    const d = cooldownDecision({ current: prior.nextEntry }, later, at("2026-08-03"));
    expect(d.suppressed).toBe(false);
    expect(d.reason).toBe("escalation-new-family");
  });

  it("breaks the window on a +2 weight jump", () => {
    const d = cooldownDecision(doc(), assessment({ totalWeight: 6, severity: "watch" }), at("2026-08-03"));
    expect(d.suppressed).toBe(false);
    expect(d.reason).toBe("escalation-weight");
  });

  it("does NOT break on a +1 weight jump", () => {
    const d = cooldownDecision(doc(), assessment({ totalWeight: 5, severity: "watch" }), at("2026-08-03"));
    expect(d.suppressed).toBe(true);
  });

  it("does NOT break when an extra factor lands INSIDE an already-firing family", () => {
    // Same families, same weight, same severity — a second recovery factor is
    // the same story with more evidence, and the parent already has the point.
    const d = cooldownDecision(
      doc(),
      assessment({ factorKey: "g1:mood-decline+open-injury-moderate+sleep-deficit" }),
      at("2026-08-03"),
    );
    expect(d.suppressed).toBe(true);
    expect(d.reason).toBe("cooldown");
  });

  // ── A CLEARED STORY THAT COMES BACK ───────────────────────────────────────
  it("fires again inside the window when the story cleared and returned", () => {
    const a = assessment();
    const fired = cooldownDecision(null, a, at("2026-08-01"));

    // A quiet day: the gate does not fire, the card resolves, and the record is
    // marked cleared.
    const cleared = clearedCooldown({ current: fired.nextEntry }, at("2026-08-02"));
    expect(cleared.cleared).toBe(true);

    // It comes back on the 4th — day 4 of 10, so the old model held it silent
    // for another week.
    const back = cooldownDecision({ current: cleared }, a, at("2026-08-04"));
    expect(back.suppressed).toBe(false);
    expect(back.reason).toBe("resumed-after-clear");
    expect(back.nextEntry.firstSeenDate).toBe("2026-08-01");  // same story, still recurring
    expect(back.nextEntry.fireCount).toBe(2);
    // And the new record is NOT itself cleared, or the window would never bite.
    expect(back.nextEntry.cleared).toBe(false);
    expect(back.nextEntry.clearedDate).toBeNull();
    expect(cooldownDecision({ current: back.nextEntry }, a, at("2026-08-05")).suppressed).toBe(true);
  });

  it("suppresses a non-firing assessment and writes nothing", () => {
    const d = cooldownDecision(doc(), { fires: false, storyKey: null }, at("2026-08-03"));
    expect(d.suppressed).toBe(true);
    expect(d.reason).toBe("not-firing");
    expect(d.nextEntry).toBeNull();
  });

  it("fires rather than sulking when the stored date is unreadable", () => {
    const d = cooldownDecision(doc({ lastFiredDate: "garbage" }), assessment(), at("2026-08-03"));
    expect(d.suppressed).toBe(false);
  });
});

describe("clearedCooldown", () => {
  const at = (dateStr) => new Date(`${dateStr}T06:00:00`);
  const record = {
    storyKey: "g1:recovery+tissue", families: ["recovery", "tissue"],
    severity: "watch", totalWeight: 4,
    firstFiredDate: "2026-08-01", lastFiredDate: "2026-08-01",
    firstSeenDate: "2026-08-01", fireCount: 1, cleared: false, clearedDate: null,
    reason: "first-fire",
  };

  it("marks the current record cleared and dates it, keeping everything else", () => {
    const out = clearedCooldown({ current: record }, at("2026-08-02"));
    expect(out.cleared).toBe(true);
    expect(out.clearedDate).toBe("2026-08-02");
    expect(out.storyKey).toBe(record.storyKey);
    expect(out.lastFiredDate).toBe("2026-08-01");   // the window's anchor does not move
    expect(out.fireCount).toBe(1);
  });

  it("does not mutate the record it was given", () => {
    const current = { ...record };
    clearedCooldown({ current }, at("2026-08-02"));
    expect(current.cleared).toBe(false);
    expect(current.clearedDate).toBeNull();
  });

  it("returns null when there is nothing to clear, so a quiet day writes nothing", () => {
    for (const doc of [null, undefined, {}, "junk", { current: null }, { stories: {} }]) {
      expect(clearedCooldown(doc, at("2026-08-02"))).toBeNull();
    }
  });

  it("returns null for an already-cleared record — a run of quiet days writes once", () => {
    const once = clearedCooldown({ current: record }, at("2026-08-02"));
    expect(clearedCooldown({ current: once }, at("2026-08-03"))).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(() => clearedCooldown({ current: record }, "not a date")).not.toThrow();
    expect(() => clearedCooldown({ current: { cleared: "yes" } }, at("2026-08-02"))).not.toThrow();
  });
});

// ─── ATHLETE ACTIONS (the safety net) ────────────────────────────────────────

describe("athleteActions", () => {
  const FAMS = ["load", "recovery", "tissue", "growth"];
  const subsets = [];
  for (let mask = 1; mask < (1 << FAMS.length); mask++) {
    subsets.push(FAMS.filter((_, i) => mask & (1 << i)));
  }

  it.each(subsets.map(s => [s.join("+"), s]))("returns a usable action for %s", (_label, fams) => {
    const out = athleteActions(fams, []);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) {
      expect(typeof line).toBe("string");
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it("never returns an empty list, even for an empty or unknown family set", () => {
    expect(athleteActions([], []).length).toBeGreaterThan(0);
    expect(athleteActions(["not-a-family"], []).length).toBeGreaterThan(0);
    expect(athleteActions(null, null).length).toBeGreaterThan(0);
  });

  it("is never risk-framed — none of the parent's vocabulary reaches her card", () => {
    const forbidden = ["injury", "hurt", "risk", "growth spurt", "fragile", "worry", "acwr", "monotony"];
    for (const fams of [...subsets, [], ["asymmetry"]]) {
      for (const line of athleteActions(fams, [])) {
        for (const word of forbidden) expect(line.toLowerCase()).not.toContain(word);
      }
    }
  });

  it("tailors the line to the factor that actually fired", () => {
    const generic = athleteActions(["recovery"], [{ id: "mood-decline" }])[0];
    const sleepy  = athleteActions(["recovery"], [{ id: "sleep-deficit" }])[0];
    expect(sleepy).not.toBe(generic);
    expect(sleepy.toLowerCase()).toContain("bed");
  });

  it("is what assessGuardian puts on a firing assessment", () => {
    const a = assessGuardian({
      wellbeing: wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]),
      injuries: [{ id: "i1", bodyArea: "Knee", severity: 3, status: "open", onsetDate: dayStr(TODAY, -3) }],
    }, TODAY);
    expect(a.actions.athlete.length).toBeGreaterThan(0);
    expect(a.actions.athlete).toEqual(athleteActions(a.families, a.factors));
  });
});

// ─── PROMPT ──────────────────────────────────────────────────────────────────

describe("buildGuardianNotesPrompt", () => {
  const assessment = assessGuardian({
    wellbeing: wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]),
    injuries: [{ id: "i1", bodyArea: "Knee", severity: 3, status: "open", onsetDate: dayStr(TODAY, -3) }],
  }, TODAY);

  it("returns the { system, prompt, maxTokens } shape the ai layer expects", () => {
    const p = buildGuardianNotesPrompt(assessment, "Valissa");
    expect(typeof p.system).toBe("string");
    expect(typeof p.prompt).toBe("string");
    expect(typeof p.maxTokens).toBe("number");
  });

  it("tells the model the engine already decided, and that it is not re-deciding", () => {
    const { system } = buildGuardianNotesPrompt(assessment, "Valissa");
    expect(system).toContain("deterministic risk engine");
    expect(system).toContain("not re-deciding whether there is a problem");
    expect(system).toContain("never add one that is not listed");
  });

  it("carries the no-diagnosis clause", () => {
    const { system } = buildGuardianNotesPrompt(assessment, "Valissa");
    expect(system).toContain("Never name an injury, a diagnosis or a probability.");
  });

  it("keeps digestCore's raw-JSON shell so the response parses the same way", () => {
    const { system } = buildGuardianNotesPrompt(assessment, "Valissa");
    expect(system).toContain("Return ONLY a raw JSON object");
    expect(system).toContain("Start your response with { and end with }");
  });

  it("bans the jargon in parentNote and asks for the combination, not one signal", () => {
    const { prompt } = buildGuardianNotesPrompt(assessment, "Valissa");
    expect(prompt).toContain("never use the words sRPE, ACWR, monotony, strain or PHV");
    expect(prompt).toContain("why THESE signals matter together");
    expect(prompt).toContain("the one concrete change to make today");
  });

  it("carries the athlete forbidden-word list verbatim", () => {
    const { prompt } = buildGuardianNotesPrompt(assessment, "Valissa");
    expect(prompt).toContain("Never use these words: injury, hurt, risk, growth spurt, fragile, worry.");
    expect(prompt).toContain("No numbers.");
  });

  it("names the athlete and lists every factor with its evidence", () => {
    const { prompt } = buildGuardianNotesPrompt(assessment, "Vee");
    expect(prompt).toContain("Vee");
    for (const f of assessment.factors) expect(prompt).toContain(f.evidence);
  });

  it("falls back to a default name and does not throw on a null assessment", () => {
    const p = buildGuardianNotesPrompt(null, null);
    expect(p.prompt).toContain("Valissa");
  });
});

// ─── ALERT ARTIFACT ──────────────────────────────────────────────────────────

describe("buildGuardianAlert", () => {
  const assessment = assessGuardian({
    wellbeing: wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]),
    injuries: [{ id: "i1", bodyArea: "Knee", severity: 3, status: "open", onsetDate: dayStr(TODAY, -3) }],
  }, TODAY);

  it("returns null for an assessment that did not fire", () => {
    expect(buildGuardianAlert({ assessment: assessGuardian({}, TODAY), now: TODAY })).toBeNull();
    expect(buildGuardianAlert({ assessment: null, now: TODAY })).toBeNull();
    expect(buildGuardianAlert()).toBeNull();
  });

  it("builds a DATE-FIRST alertId so orderBy(documentId(),'desc') is chronological", () => {
    const alert = buildGuardianAlert({ assessment, now: TODAY });
    expect(alert.alertId).toBe("2026-08-09_g1-recovery-tissue");
    const older = buildGuardianAlert({ assessment, now: new Date("2026-07-01T06:00:00") });
    expect([alert.alertId, older.alertId].sort().reverse()[0]).toBe(alert.alertId);
  });

  it("is idempotent for a same-day re-run", () => {
    const a = buildGuardianAlert({ assessment, now: new Date("2026-08-09T06:00:00") });
    const b = buildGuardianAlert({ assessment, now: new Date("2026-08-09T18:30:00") });
    expect(a.alertId).toBe(b.alertId);
  });

  it("carries the whole deterministic assessment plus the lifecycle fields", () => {
    const alert = buildGuardianAlert({ assessment, now: TODAY, generatedBy: "runGuardianNow", athleteName: "Valissa" });
    expect(alert.engineVersion).toBe(GUARDIAN_ENGINE_VERSION);
    expect(alert.storyKey).toBe(assessment.storyKey);
    expect(alert.factorKey).toBe(assessment.factorKey);
    expect(alert.families).toEqual(assessment.families);
    expect(alert.severity).toBe("watch");
    expect(alert.tone).toBe("info");
    expect(alert.totalWeight).toBe(4);
    expect(alert.headline).toBe(assessment.headline);
    expect(alert.factors.map(f => f.id).sort()).toEqual(idsOf(assessment.factors).sort());
    expect(alert.actions.athlete.length).toBeGreaterThan(0);
    expect(alert.generatedBy).toBe("runGuardianNow");
    expect(alert.dismissedAt).toBeNull();
    expect(alert.dismissedBy).toBeNull();
    expect(alert.resolvedAt).toBeNull();
  });

  it("is complete and useful with no LLM notes at all", () => {
    const alert = buildGuardianAlert({ assessment, notes: null, now: TODAY });
    expect(alert.parentNote).toBeNull();
    expect(alert.athleteNote).toBeNull();
    expect(alert.notesError).toBeNull();
    expect(alert.headline).toBeTruthy();
    expect(alert.actions.athlete.length).toBeGreaterThan(0);
  });

  it("records a notes failure without losing the assessment", () => {
    const alert = buildGuardianAlert({ assessment, notes: { error: "overloaded" }, now: TODAY });
    expect(alert.notesError).toBe("overloaded");
    expect(alert.factors.length).toBeGreaterThan(0);
  });

  it("marks a watch-level alert as push-ineligible — a 6am buzz IS risk framing", () => {
    expect(buildGuardianAlert({ assessment, now: TODAY }).push).toEqual({ eligible: false, role: "parent", sentAt: null });
  });

  it("marks an urgent alert push-eligible, parents only", () => {
    const urgent = assessGuardian({
      wellbeing: wbDays([{ mood: 2 }, { mood: 2 }, { mood: 2 }]),
      injuries: [{ id: "i1", bodyArea: "Knee", severity: 3, status: "open", onsetDate: dayStr(TODAY, -3) }],
      athlete: MID_PHV_ATHLETE,
    }, TODAY);
    expect(urgent.severity).toBe("urgent");
    const alert = buildGuardianAlert({ assessment: urgent, now: TODAY });
    expect(alert.push).toEqual({ eligible: true, role: "parent", sentAt: null });
  });

  it("does not let the athlete's own view inherit risk language", () => {
    const alert = buildGuardianAlert({ assessment, now: TODAY });
    // actions.athlete is the ONLY field the athlete card renders.
    for (const line of alert.actions.athlete) {
      expect(line.toLowerCase()).not.toContain("injury");
      expect(line.toLowerCase()).not.toContain("risk");
    }
  });
});

// ─── PUSH ────────────────────────────────────────────────────────────────────

describe("guardianPushPayload", () => {
  const alert = {
    athleteName: "Valissa", severity: "urgent", headline: "Training load and recovery are stacking up",
    parentNote: "Her load jumped this week while she slept badly. Ease off today.",
  };

  it("collapses in the tray via a stable tag", () => {
    expect(guardianPushPayload(alert).tag).toBe("guardian");
    expect(guardianPushPayload({}).tag).toBe("guardian");
  });
  it("uses the first sentence of parentNote as the body", () => {
    expect(guardianPushPayload(alert).body).toBe("Her load jumped this week while she slept badly.");
  });
  it("degrades to the deterministic headline when the note is missing", () => {
    const { body } = guardianPushPayload({ ...alert, parentNote: null });
    expect(body).toBe(alert.headline);
  });
  it("always produces a title and body, even for junk", () => {
    for (const input of [null, {}, "x", { severity: "watch" }]) {
      const p = guardianPushPayload(input);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.body.length).toBeGreaterThan(0);
    }
  });
});

// ─── SUPERSESSION ────────────────────────────────────────────────────────────

describe("supersededReminderKinds", () => {
  const alert = (families, over = {}) => ({ families, engineVersion: GUARDIAN_ENGINE_VERSION, dismissedAt: null, resolvedAt: null, ...over });

  it("supersedes the load reminder for a load story", () => {
    expect(supersededReminderKinds(alert(["load"]))).toEqual(["load"]);
  });
  it("supersedes both mood and sleep for a recovery story", () => {
    expect(supersededReminderKinds(alert(["recovery"]))).toEqual(["mood", "sleep"]);
  });
  it("supersedes NOTHING for a tissue story — the injury reminder no longer exists, HomeScreen's own Card owns it", () => {
    expect(supersededReminderKinds(alert(["tissue"]))).toEqual([]);
  });
  it("supersedes nothing for growth", () => {
    expect(supersededReminderKinds(alert(["growth"]))).toEqual([]);
  });
  it("unions the families without duplicating a kind", () => {
    const kinds = supersededReminderKinds(alert(["load", "recovery", "tissue"]));
    expect(kinds.sort()).toEqual(["load", "mood", "sleep"]);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
  it("never touches the reminder kinds the Guardian says nothing about", () => {
    const kinds = supersededReminderKinds(alert(["load", "recovery", "tissue", "growth"]));
    for (const untouched of ["checkin", "plan-stale", "tournament", "priority-escalated", "practice-focus", "technical-review", "fitness-retest"]) {
      expect(kinds).not.toContain(untouched);
    }
  });
  it("returns [] for no alert", () => {
    expect(supersededReminderKinds(null)).toEqual([]);
    expect(supersededReminderKinds(undefined)).toEqual([]);
    expect(supersededReminderKinds("nope")).toEqual([]);
  });
  it("returns [] once the alert is dismissed — the reminders must come back", () => {
    expect(supersededReminderKinds(alert(["load", "recovery"], { dismissedAt: "2026-08-09T06:00:00Z" }))).toEqual([]);
  });
  it("returns [] once the alert is auto-resolved", () => {
    expect(supersededReminderKinds(alert(["load", "recovery"], { resolvedAt: "2026-08-09T06:00:00Z" }))).toEqual([]);
  });
  it("returns [] for an alert written by a different engine version", () => {
    expect(supersededReminderKinds(alert(["load"], { engineVersion: 99 }))).toEqual([]);
  });
  // Fails closed the same way GuardianCard does. Skipping the check on a
  // missing field gave the worst of both worlds: the card refused to render
  // (it compares strictly) while the reminders it was standing in for stayed
  // suppressed, so the parent saw nothing at all.
  it("returns [] for an alert with no engineVersion at all — the card would not render it either", () => {
    expect(supersededReminderKinds(alert(["load", "recovery"], { engineVersion: undefined }))).toEqual([]);
    expect(supersededReminderKinds(alert(["load", "recovery"], { engineVersion: null }))).toEqual([]);
    expect(supersededReminderKinds({ families: ["load", "recovery"] })).toEqual([]);
  });
});
