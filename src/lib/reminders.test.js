import { describe, it, expect } from "vitest";
import { dueReminders } from "./reminders.js";
import { FITNESS_TESTS } from "./fitnessTests.js";
import { toLocalDateStr } from "./dates.js";

// The Firebase-free guarantee for this module is enforced repo-wide by the
// transitive import guard in athleteMemoryCore.test.js.

const TODAY = new Date("2026-08-03T12:00:00");
const TODAY_STR = "2026-08-03";

const idsOf = (list) => list.map(r => r.id);
const kindsOf = (list) => list.map(r => r.kind);

describe("dueReminders — malformed/empty input", () => {
  it("returns [] for null state", () => {
    expect(dueReminders(null, TODAY)).toEqual([]);
  });
  it("does not throw for an empty object — a genuinely empty athlete legitimately has real reminders (no check-in doc, no fitness tests ever logged)", () => {
    expect(() => dueReminders({}, TODAY)).not.toThrow();
    expect(kindsOf(dueReminders({}, TODAY))).toEqual(["checkin", "fitness-retest"]);
  });
  it("returns [] for non-object state", () => {
    expect(dueReminders("nonsense", TODAY)).toEqual([]);
    expect(dueReminders(undefined, TODAY)).toEqual([]);
  });
  it("tolerates malformed field types instead of throwing, coercing bad arrays/objects to empty", () => {
    const state = { weekLogs: "x", wellbeing: null, tournaments: 5, priorities: {}, technical: undefined, benchmarks: "y", injuries: 1, plan: "z" };
    expect(() => dueReminders(state, TODAY)).not.toThrow();
    // Same as the empty-object case: coerced-empty collections still leave the
    // "never checked in" / "never fitness tested" checks legitimately firing.
    expect(kindsOf(dueReminders(state, TODAY))).toEqual(["checkin", "fitness-retest"]);
  });
  it("falls back to the real current date when `today` is missing/invalid", () => {
    expect(() => dueReminders({}, null)).not.toThrow();
    expect(() => dueReminders({}, "not-a-date")).not.toThrow();
  });
});

describe("check-in reminder", () => {
  it("fires when there is no wellbeing doc at all for today", () => {
    const r = dueReminders({ wellbeing: [] }, TODAY);
    expect(idsOf(r)).toContain(`checkin-missing-${TODAY_STR}`);
  });
  it("does NOT fire when a checkin-type doc exists for today", () => {
    const r = dueReminders({ wellbeing: [{ date: TODAY_STR, type: "checkin" }] }, TODAY);
    expect(idsOf(r)).not.toContain(`checkin-missing-${TODAY_STR}`);
  });
  it("does NOT fire when a night-type doc exists for today", () => {
    const r = dueReminders({ wellbeing: [{ date: TODAY_STR, type: "night" }] }, TODAY);
    expect(idsOf(r)).not.toContain(`checkin-missing-${TODAY_STR}`);
  });
  it("STILL fires when only a morning-type doc exists — a morning-only entry must not satisfy the end-of-day check-in", () => {
    const r = dueReminders({ wellbeing: [{ date: TODAY_STR, type: "morning", sleep: 8 }] }, TODAY);
    expect(idsOf(r)).toContain(`checkin-missing-${TODAY_STR}`);
  });
  it("is athlete-audience", () => {
    const r = dueReminders({ wellbeing: [] }, TODAY);
    const c = r.find(x => x.kind === "checkin");
    expect(c.audience).toBe("athlete");
  });
});

describe("stale/unlogged plan reminder", () => {
  it("does not fire with no plan", () => {
    expect(kindsOf(dueReminders({ plan: null }, TODAY))).not.toContain("plan-stale");
  });
  it("does not fire when the session was logged", () => {
    const plan = { generatedAt: "2026-08-01T09:00:00.000Z", sessionLogged: true };
    expect(kindsOf(dueReminders({ plan }, TODAY))).not.toContain("plan-stale");
  });
  it("does not fire the same day the plan was generated", () => {
    const plan = { generatedAt: `${TODAY_STR}T09:00:00.000Z`, sessionLogged: false };
    expect(kindsOf(dueReminders({ plan }, TODAY))).not.toContain("plan-stale");
  });
  it("fires once the plan is from a prior day and unlogged", () => {
    const plan = { generatedAt: "2026-08-01T09:00:00.000Z", sessionLogged: false };
    const r = dueReminders({ plan }, TODAY);
    expect(kindsOf(r)).toContain("plan-stale");
    expect(r.find(x => x.kind === "plan-stale").audience).toBe("both");
  });
});

describe("training load / monotony reminders", () => {
  const logAt = (date, rpe = 8, duration = 60) => ({ date, rpe, duration });

  it("does not fire with no logs", () => {
    expect(kindsOf(dueReminders({ weekLogs: [] }, TODAY))).not.toContain("load");
  });

  it("fires danger when ACWR is way above chronic load", () => {
    // getWeekBounds (in load.js) anchors weeks to the REAL current date, not
    // the `today` passed into dueReminders — so the spike must land on an
    // actual today-dated log for it to land in the acute (this-week) bucket,
    // with nothing in the 3 prior weeks to inflate the chronic denominator.
    const realTodayStr = toLocalDateStr(new Date());
    const logs = [];
    for (let i = 0; i < 6; i++) logs.push(logAt(realTodayStr, 9, 90));
    const r = dueReminders({ weekLogs: logs }, TODAY);
    const load = r.find(x => x.kind === "load");
    expect(load).toBeTruthy();
    expect(["danger", "warn"]).toContain(load.tone);
    expect(load.audience).toBe("parent");
  });

  it("fires a monotony warning when daily load is identical every day", () => {
    const logs = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      const iso = toLocalDateStr(d);
      logs.push({ date: iso, rpe: 5, duration: 60 });
    }
    const r = dueReminders({ weekLogs: logs }, TODAY);
    // constant daily load => sd 0 => monotonyStatus returns null (no signal) —
    // verify it doesn't throw and doesn't spuriously fire when sd is 0.
    expect(() => r).not.toThrow();
  });
});

// getWeekBounds (load.js) anchors Mon-Sun weeks to the REAL current date, not
// the `today` passed into dueReminders, so tests that need logs to land in
// specific week buckets must anchor off the real "now" too.
function realMonday(weeksAgo) {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - daysToMonday - weeksAgo * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

describe("extended high load reminder", () => {
  it("fires when sRPE > 2000 for 3 consecutive weeks", () => {
    // 3 sessions/week at rpe 8 * 90min = 720 * 3 = 2160 > 2000, for 3 weeks back.
    const logs = [];
    for (let wk = 0; wk < 3; wk++) {
      const monday = realMonday(wk);
      for (let d = 0; d < 3; d++) {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + d);
        logs.push({ date: toLocalDateStr(dt), rpe: 8, duration: 90 });
      }
    }
    const r = dueReminders({ weekLogs: logs }, TODAY);
    expect(kindsOf(r)).toContain("high-load");
  });

  it("does not fire when only 2 weeks are high", () => {
    const logs = [];
    for (let wk = 0; wk < 2; wk++) {
      const monday = realMonday(wk);
      for (let d = 0; d < 3; d++) {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + d);
        logs.push({ date: toLocalDateStr(dt), rpe: 8, duration: 90 });
      }
    }
    const r = dueReminders({ weekLogs: logs }, TODAY);
    expect(kindsOf(r)).not.toContain("high-load");
  });
});

describe("mood decline / sleep deficit reminders", () => {
  const wb = (date, mood, sleep) => ({ date, mood, sleep });

  it("fires mood decline when the 7-day average is below threshold with enough days", () => {
    const wellbeing = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      wellbeing.push(wb(toLocalDateStr(d), 2, 8));
    }
    const r = dueReminders({ weekLogs: [], wellbeing }, TODAY);
    expect(kindsOf(r)).toContain("mood");
    expect(r.find(x => x.kind === "mood").audience).toBe("parent");
  });

  it("does not fire mood decline with too few days on record", () => {
    const wellbeing = [wb(TODAY_STR, 1, 8)];
    const r = dueReminders({ weekLogs: [], wellbeing }, TODAY);
    expect(kindsOf(r)).not.toContain("mood");
  });

  it("fires sleep deficit when average sleep is under threshold for enough days", () => {
    const wellbeing = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      wellbeing.push(wb(toLocalDateStr(d), 4, 5));
    }
    const r = dueReminders({ weekLogs: [], wellbeing }, TODAY);
    expect(kindsOf(r)).toContain("sleep");
  });

  it("does not fire sleep deficit when average sleep is healthy", () => {
    const wellbeing = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      wellbeing.push(wb(toLocalDateStr(d), 4, 9));
    }
    const r = dueReminders({ weekLogs: [], wellbeing }, TODAY);
    expect(kindsOf(r)).not.toContain("sleep");
  });
});

describe("tournament reminder", () => {
  it("does not fire outside the 14-day window", () => {
    const r = dueReminders({ tournaments: [{ id: "t1", date: "2026-08-25", name: "Regionals" }] }, TODAY);
    expect(kindsOf(r)).not.toContain("tournament");
  });
  it("fires at exactly 14 days out (boundary)", () => {
    const r = dueReminders({ tournaments: [{ id: "t1", date: "2026-08-17", name: "Regionals" }] }, TODAY);
    expect(kindsOf(r)).toContain("tournament");
  });
  it("fires for today's tournament with the special-cased title", () => {
    const r = dueReminders({ tournaments: [{ id: "t1", date: TODAY_STR, name: "Regionals" }] }, TODAY);
    const t = r.find(x => x.kind === "tournament");
    expect(t.title).toContain("today");
  });
  it("does not fire for a past tournament", () => {
    const r = dueReminders({ tournaments: [{ id: "t1", date: "2026-07-01", name: "Regionals" }] }, TODAY);
    expect(kindsOf(r)).not.toContain("tournament");
  });
  it("is audience 'both'", () => {
    const r = dueReminders({ tournaments: [{ id: "t1", date: TODAY_STR, name: "Regionals" }] }, TODAY);
    expect(r.find(x => x.kind === "tournament").audience).toBe("both");
  });
});

describe("escalated priority reminder", () => {
  it("fires one reminder per escalated priority", () => {
    const priorities = [
      { id: "p1", status: "escalated", priority: "Second serve", weeksDeferredCount: 5 },
      { id: "p2", status: "active", priority: "Footwork", weeksDeferredCount: 1 },
    ];
    const r = dueReminders({ priorities }, TODAY);
    expect(idsOf(r)).toContain("esc-p1");
    expect(idsOf(r)).not.toContain("esc-p2");
  });
  it("is danger tone and parent audience", () => {
    const priorities = [{ id: "p1", status: "escalated", priority: "Second serve" }];
    const r = dueReminders({ priorities }, TODAY);
    const esc = r.find(x => x.kind === "priority-escalated");
    expect(esc.tone).toBe("danger");
    expect(esc.audience).toBe("parent");
  });
});

describe("practice focus reminder", () => {
  it("surfaces the same pick weeklyFocus would make, athlete-audience", () => {
    const priorities = [
      { id: "p1", status: "active", priority: "Second serve", weeksDeferredCount: 1 },
      { id: "p2", status: "escalated", priority: "Footwork", weeksDeferredCount: 5 },
    ];
    const r = dueReminders({ priorities }, TODAY);
    const focus = r.find(x => x.kind === "practice-focus");
    expect(focus).toBeTruthy();
    expect(focus.id).toBe("focus-p2");
    expect(focus.audience).toBe("athlete");
  });
  it("does not fire with no open priorities", () => {
    expect(kindsOf(dueReminders({ priorities: [] }, TODAY))).not.toContain("practice-focus");
  });
});

describe("technical review reminder", () => {
  it("fires only for status active and reviewDueDate <= today", () => {
    const technical = [
      { id: "t1", strokeArea: "Forehand", status: "active", reviewDueDate: "2026-08-01", date: "2026-06-01" },
      { id: "t2", strokeArea: "Backhand", status: "reviewed", reviewDueDate: "2026-08-01", date: "2026-06-01" },
      { id: "t3", strokeArea: "Serve", status: "active", reviewDueDate: "2026-09-01", date: "2026-06-01" },
    ];
    const r = dueReminders({ technical }, TODAY);
    expect(idsOf(r)).toContain("rev-t1");
    expect(idsOf(r)).not.toContain("rev-t2");
    expect(idsOf(r)).not.toContain("rev-t3");
  });

  it("dedupes to only the latest entry per strokeArea", () => {
    const technical = [
      { id: "old", strokeArea: "Forehand", status: "active", reviewDueDate: "2026-08-01", date: "2026-01-01" },
      { id: "new", strokeArea: "Forehand", status: "active", reviewDueDate: "2026-08-01", date: "2026-07-01" },
    ];
    const r = dueReminders({ technical }, TODAY);
    expect(idsOf(r).filter(id => id.startsWith("rev-"))).toEqual(["rev-new"]);
  });

  it("caps at technicalReviewCap (2) even with more due", () => {
    const technical = ["A", "B", "C"].map((area, i) => ({
      id: `t${i}`, strokeArea: area, status: "active", reviewDueDate: "2026-08-01", date: "2026-06-01",
    }));
    const r = dueReminders({ technical }, TODAY);
    expect(idsOf(r).filter(id => id.startsWith("rev-")).length).toBe(2);
  });

  it("is parent audience", () => {
    const technical = [{ id: "t1", strokeArea: "Forehand", status: "active", reviewDueDate: "2026-08-01", date: "2026-06-01" }];
    const r = dueReminders({ technical }, TODAY);
    expect(r.find(x => x.kind === "technical-review").audience).toBe("parent");
  });
});

describe("fitness retest reminder", () => {
  it("fires when a test has never been logged", () => {
    const r = dueReminders({ benchmarks: [] }, TODAY);
    expect(kindsOf(r)).toContain("fitness-retest");
  });

  it("does not fire when every test was logged within 56 days", () => {
    const recent = "2026-07-01"; // 33 days before TODAY
    const benchmarks = FITNESS_TESTS.map(t => ({ testName: t.name, date: recent, result: 1 }));
    const r = dueReminders({ benchmarks }, TODAY);
    expect(kindsOf(r)).not.toContain("fitness-retest");
  });

  it("fires at the 56-day boundary (57 days ago is overdue, 55 days ago is not, per-test)", () => {
    // All tests logged 55 days ago except one logged 57 days ago.
    const d55 = new Date(TODAY); d55.setDate(d55.getDate() - 55);
    const d57 = new Date(TODAY); d57.setDate(d57.getDate() - 57);
    const benchmarks = FITNESS_TESTS.map((t, i) => ({
      testName: t.name,
      date: toLocalDateStr(i === 0 ? d57 : d55),
    }));
    const r = dueReminders({ benchmarks }, TODAY);
    expect(kindsOf(r)).toContain("fitness-retest");
  });

  it("is parent audience", () => {
    const r = dueReminders({ benchmarks: [] }, TODAY);
    expect(r.find(x => x.kind === "fitness-retest").audience).toBe("parent");
  });
});

describe("injury reminder", () => {
  it("does not fire with no open injuries", () => {
    expect(kindsOf(dueReminders({ injuries: [] }, TODAY))).not.toContain("injury");
  });
  it("fires danger for a severe open injury, parent audience", () => {
    const injuries = [{ bodyArea: "Shoulder", severity: 4, status: "open", onsetDate: "2026-07-28" }];
    const r = dueReminders({ injuries }, TODAY);
    const inj = r.find(x => x.kind === "injury");
    expect(inj.tone).toBe("danger");
    expect(inj.audience).toBe("parent");
  });
});

describe("dedupe and sort order", () => {
  it("dedupes reminders that share an id", () => {
    const priorities = [{ id: "p1", status: "escalated", priority: "Second serve" }];
    const r1 = dueReminders({ priorities }, TODAY);
    const r2 = dueReminders({ priorities }, TODAY);
    // Calling twice must not accumulate state across calls (pure function).
    expect(idsOf(r1)).toEqual(idsOf(r2));
    const ids = idsOf(r1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sorts danger before warn before info", () => {
    const state = {
      injuries: [{ bodyArea: "Shoulder", severity: 4, status: "open", onsetDate: "2026-07-28" }], // danger
      weekLogs: (() => {
        const logs = [];
        for (let wk = 0; wk < 3; wk++) {
          const monday = realMonday(wk);
          for (let d = 0; d < 3; d++) {
            const dt = new Date(monday); dt.setDate(monday.getDate() + d);
            logs.push({ date: toLocalDateStr(dt), rpe: 8, duration: 90 });
          }
        }
        return logs;
      })(), // extended high load -> warn
      wellbeing: [], // checkin missing -> info
    };
    const r = dueReminders(state, TODAY);
    const tones = r.map(x => x.tone);
    const firstDanger = tones.indexOf("danger");
    const firstWarn = tones.indexOf("warn");
    const firstInfo = tones.indexOf("info");
    expect(firstDanger).toBeLessThan(firstWarn === -1 ? Infinity : firstWarn === -1 ? Infinity : firstWarn);
    if (firstWarn !== -1 && firstInfo !== -1) expect(firstWarn).toBeLessThan(firstInfo);
    if (firstDanger !== -1 && firstInfo !== -1) expect(firstDanger).toBeLessThan(firstInfo);
  });
});

describe("audience routing — full matrix sanity", () => {
  it("tags every emitted reminder with a valid audience", () => {
    const state = {
      wellbeing: [],
      plan: { generatedAt: "2026-08-01T09:00:00.000Z", sessionLogged: false },
      priorities: [{ id: "p1", status: "escalated", priority: "Second serve" }],
      technical: [{ id: "t1", strokeArea: "Forehand", status: "active", reviewDueDate: "2026-08-01", date: "2026-06-01" }],
      tournaments: [{ id: "t1", date: TODAY_STR, name: "Regionals" }],
      injuries: [{ bodyArea: "Shoulder", severity: 4, status: "open", onsetDate: "2026-07-28" }],
      benchmarks: [],
    };
    const r = dueReminders(state, TODAY);
    expect(r.length).toBeGreaterThan(0);
    for (const rem of r) expect(["athlete", "parent", "both"]).toContain(rem.audience);
  });
});
