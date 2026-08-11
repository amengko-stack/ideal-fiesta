import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

// ─── LOAD FAMILY ─────────────────────────────────────────────────────────────
// The ACWR, monotony and sustained-volume drivers disagree about which days
// they look at: the week buckets come from getWeekBounds (real clock), the
// monotony window from the injected `today`. Under a live clock those two only
// coincide on a Sunday, and on a Monday it is arithmetically impossible for
// ACWR and monotony to fire together at all (week 0 is one day, so a uniform
// 7-day window forces the chronic mean up faster than the acute week) — which
// would make the multi-driver case untestable six days out of seven. So this
// block freezes the system clock on a Sunday, where the acute week and the
// monotony window are the same seven days. Fixtures still build their dates
// through realMonday(), which now resolves against the frozen clock. Same
// vi.setSystemTime pattern planGenCore.test.js uses.
const LOAD_SUNDAY = new Date("2026-08-09T12:00:00");
const LOAD_SUNDAY_STR = "2026-08-09";

describe("training load family — one reminder for ACWR, monotony and sustained volume", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(LOAD_SUNDAY); });
  afterAll(() => vi.useRealTimers());

  // One session per day for the week `weeksAgo` back, `daily` giving each day's
  // sRPE (rpe * duration). Written as sRPE rather than rpe/duration because
  // every threshold in the family is expressed in sRPE.
  const weekOf = (weeksAgo, daily) => {
    const monday = realMonday(weeksAgo);
    return daily.map((srpe, d) => {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + d);
      return { date: toLocalDateStr(dt), rpe: 10, duration: srpe / 10 };
    // A rest day must be *absent*, not a zero-duration log: sessionSRPE reads
    // `duration || 60`, so a 0 would silently become a 600 sRPE session.
    }).filter(l => l.duration > 0);
  };
  const flat = (srpe) => Array(7).fill(srpe);
  // Six days level and one dipped: sd is tiny but non-zero, so monotony is high
  // (a perfectly flat week gives sd 0, which monotonyStatus reports as no
  // signal at all rather than as maximum repetitiveness).
  const repetitive = (srpe) => [...Array(6).fill(srpe), srpe * 0.9];

  const loadOf = (state) => dueReminders(state, LOAD_SUNDAY).filter(x => x.kind === "load");

  it("does not fire with no logs", () => {
    expect(kindsOf(dueReminders({ weekLogs: [] }, LOAD_SUNDAY))).not.toContain("load");
  });

  it("emits exactly ONE reminder when all three drivers fire at once", () => {
    // week 0 repetitive at ~2760 sRPE (acute spike + monotony), weeks 1-2 at
    // 2100 (over the 2000 sustained-volume line, low enough to leave ACWR
    // above 1.5), week 3 empty.
    const weekLogs = [...weekOf(0, repetitive(400)), ...weekOf(1, flat(300)), ...weekOf(2, flat(300))];
    const loads = loadOf({ weekLogs });
    expect(loads.length).toBe(1);
    expect(loads[0].audience).toBe("parent");
    expect(loads[0].id).toBe(`load-danger-${LOAD_SUNDAY_STR}`);
  });

  it("names every driver that fired in the one body", () => {
    const weekLogs = [...weekOf(0, repetitive(400)), ...weekOf(1, flat(300)), ...weekOf(2, flat(300))];
    const [load] = loadOf({ weekLogs });
    expect(load.body).toContain("ACWR is in the danger zone");
    expect(load.body).toContain("repetitive");
    expect(load.body).toContain("3 consecutive weeks");
  });

  it("escalates the single reminder to danger when any driver is danger", () => {
    // Sustained volume alone is warn; the repetitive week 0 is danger. Even
    // uniform volume across all four weeks keeps ACWR at ~1.0, so this is the
    // monotony driver escalating the sustained-volume one.
    const weekLogs = [
      ...weekOf(0, repetitive(400)), ...weekOf(1, flat(400)),
      ...weekOf(2, flat(400)), ...weekOf(3, flat(400)),
    ];
    const [load] = loadOf({ weekLogs });
    expect(load.tone).toBe("danger");
    expect(load.title).toBe("Too repetitive");           // dominant (danger) driver
    expect(load.body).toContain("repetitive");
    expect(load.body).toContain("3 consecutive weeks");
    expect(load.body).not.toContain("ACWR");             // that driver did not fire
  });

  it("still fires for an acute ACWR spike on its own", () => {
    // One big session in week 0, quiet weeks behind it: spiky enough that
    // monotony reads as varied, and the prior weeks stay under 2000.
    const weekLogs = [
      ...weekOf(0, [3000, 0, 0, 0, 0, 0, 0]),
      ...weekOf(1, flat(200)), ...weekOf(2, flat(200)), ...weekOf(3, flat(200)),
    ];
    const [load, ...rest] = loadOf({ weekLogs });
    expect(rest).toEqual([]);
    expect(load.tone).toBe("danger");
    expect(load.title).toBe("Training load is high");
    expect(load.body).toContain("ACWR is in the danger zone");
    expect(load.body).not.toContain("repetitive");
    expect(load.body).not.toContain("consecutive weeks");
  });

  it("still fires for monotony on its own", () => {
    // Repetitive but modest week 0, with enough behind it that ACWR stays
    // balanced and no week clears the 2000 sustained-volume line.
    const weekLogs = [
      ...weekOf(0, repetitive(200)), ...weekOf(1, flat(180)),
      ...weekOf(2, flat(180)), ...weekOf(3, flat(180)),
    ];
    const [load, ...rest] = loadOf({ weekLogs });
    expect(rest).toEqual([]);
    expect(load.title).toBe("Too repetitive");
    expect(load.body).toContain("repetitive");
    expect(load.body).not.toContain("ACWR");
    expect(load.body).not.toContain("consecutive weeks");
  });

  it("still fires for sustained volume on its own, at warn", () => {
    // Flat 2100/week across all four weeks: over the line three weeks running,
    // ACWR exactly 1.0, and sd 0 means monotony reports nothing.
    const weekLogs = [0, 1, 2, 3].flatMap(wk => weekOf(wk, flat(300)));
    const [load, ...rest] = loadOf({ weekLogs });
    expect(rest).toEqual([]);
    expect(load.tone).toBe("warn");
    expect(load.title).toBe("Extended high training load");
    expect(load.body).toContain("3 consecutive weeks");
    expect(load.body).not.toContain("ACWR");
    expect(load.body).not.toContain("repetitive");
  });

  it("does not fire sustained volume when only 2 weeks are high", () => {
    const weekLogs = [...weekOf(0, flat(300)), ...weekOf(1, flat(300))];
    expect(loadOf({ weekLogs }).some(l => l.body.includes("consecutive weeks"))).toBe(false);
  });

  it("no longer emits the separate monotony / high-load kinds", () => {
    const weekLogs = [...weekOf(0, repetitive(400)), ...weekOf(1, flat(300)), ...weekOf(2, flat(300))];
    const kinds = kindsOf(dueReminders({ weekLogs }, LOAD_SUNDAY));
    expect(kinds).not.toContain("monotony");
    expect(kinds).not.toContain("high-load");
  });
});

// These rules read calculateMetrics, whose 7-day wellbeing window is measured
// against the REAL clock rather than the injected `today` — the same leak the
// load block above works around. Fixtures dated back from TODAY drift out of
// that window as the real date moves, so the sleep rule (which needs 5 days on
// record) silently loses a day and stops firing. Freezing the clock to TODAY
// makes the two agree, exactly as the load block does.
describe("mood decline / sleep deficit reminders", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(TODAY); });
  afterAll(() => vi.useRealTimers());

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

  it("caps at escalatedAlertCap (2) even with five escalated", () => {
    const priorities = [1, 2, 3, 4, 5].map(n => ({
      id: `p${n}`, status: "escalated", priority: `Priority ${n}`, weeksDeferredCount: n,
    }));
    const r = dueReminders({ priorities }, TODAY);
    expect(r.filter(x => x.kind === "priority-escalated").length).toBe(2);
  });

  it("keeps the two most-deferred when capping", () => {
    const priorities = [1, 2, 3, 4, 5].map(n => ({
      id: `p${n}`, status: "escalated", priority: `Priority ${n}`, weeksDeferredCount: n,
    }));
    const r = dueReminders({ priorities }, TODAY);
    expect(r.filter(x => x.kind === "priority-escalated").map(x => x.id)).toEqual(["esc-p5", "esc-p4"]);
  });

  it("does not mutate the caller's priorities array while ordering them", () => {
    const priorities = [1, 2, 3].map(n => ({
      id: `p${n}`, status: "escalated", priority: `Priority ${n}`, weeksDeferredCount: n,
    }));
    dueReminders({ priorities }, TODAY);
    expect(priorities.map(p => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("treats a missing weeksDeferredCount as least-deferred rather than throwing", () => {
    const priorities = [
      { id: "p1", status: "escalated", priority: "No count" },
      { id: "p2", status: "escalated", priority: "Counted", weeksDeferredCount: 4 },
      { id: "p3", status: "escalated", priority: "Counted more", weeksDeferredCount: 9 },
    ];
    const r = dueReminders({ priorities }, TODAY);
    expect(r.filter(x => x.kind === "priority-escalated").map(x => x.id)).toEqual(["esc-p3", "esc-p2"]);
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

// There is deliberately no injury rule: HomeScreen renders its own injury Card
// off the same injuryLoadFlag(injuries) source, unconditionally and with more
// detail than the alert carried, so a parent in parentMode read the same injury
// twice. These tests lock the removal in.
describe("open injuries produce no reminder", () => {
  const severe = [{ id: "i1", bodyArea: "Shoulder", severity: 4, status: "open", onsetDate: "2026-07-28" }];

  it("emits no injury reminder for a severe open injury", () => {
    expect(kindsOf(dueReminders({ injuries: severe }, TODAY))).not.toContain("injury");
  });

  it("emits no injury reminder for a mild open injury either", () => {
    const mild = [{ id: "i2", bodyArea: "Wrist", severity: 2, status: "open", onsetDate: "2026-07-28" }];
    expect(kindsOf(dueReminders({ injuries: mild }, TODAY))).not.toContain("injury");
  });

  it("yields exactly the same reminder set with open injuries as without", () => {
    expect(idsOf(dueReminders({ injuries: severe }, TODAY)))
      .toEqual(idsOf(dueReminders({ injuries: [] }, TODAY)));
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
    // Built entirely from time-injectable rules — the load family is the one
    // real-clock-dependent source, and ordering doesn't need it.
    const wellbeing = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      wellbeing.push({ date: toLocalDateStr(d), mood: 2, sleep: 8 });
    }
    const state = {
      priorities: [{ id: "p1", status: "escalated", priority: "Second serve", weeksDeferredCount: 6 }], // danger
      wellbeing, // mood decline -> warn; no checkin/night doc today -> info
    };
    const r = dueReminders(state, TODAY);
    const tones = r.map(x => x.tone);
    const firstDanger = tones.indexOf("danger");
    const firstWarn = tones.indexOf("warn");
    const firstInfo = tones.indexOf("info");
    expect(firstDanger).toBe(0);
    expect(firstWarn).toBeGreaterThan(firstDanger);
    expect(firstInfo).toBeGreaterThan(firstWarn);
  });
});

// The third argument the Load & Health Guardian passes in: when it has an open
// alert it is already telling a richer version of the same story, so the
// reminders it supersedes (guardianCore.supersededReminderKinds) must not
// repeat it in less detail on the same screen.
describe("suppressKinds", () => {
  const stateWithMoodAndSleep = () => {
    const wellbeing = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      wellbeing.push({ date: toLocalDateStr(d), mood: 2, sleep: 5 });
    }
    return { weekLogs: [], wellbeing, benchmarks: [] };
  };

  it("is byte-identical to not passing the argument when absent or empty", () => {
    const state = stateWithMoodAndSleep();
    const base = dueReminders(state, TODAY);
    expect(dueReminders(state, TODAY, {})).toEqual(base);
    expect(dueReminders(state, TODAY, { suppressKinds: [] })).toEqual(base);
    expect(dueReminders(state, TODAY, undefined)).toEqual(base);
  });

  it("drops exactly the named kinds and nothing else", () => {
    const state = stateWithMoodAndSleep();
    const kinds = kindsOf(dueReminders(state, TODAY, { suppressKinds: ["mood", "sleep"] }));
    expect(kinds).not.toContain("mood");
    expect(kinds).not.toContain("sleep");
    // The rules the Guardian says nothing about survive untouched.
    expect(kinds).toContain("checkin");
    expect(kinds).toContain("fitness-retest");
  });

  it("preserves the urgency ordering of whatever survives", () => {
    const state = { ...stateWithMoodAndSleep(), priorities: [{ id: "p1", status: "escalated", priority: "Second serve" }] };
    const r = dueReminders(state, TODAY, { suppressKinds: ["mood"] });
    const tones = r.map(x => x.tone);
    expect(tones).toEqual([...tones].sort((a, b) => ({ danger: 0, warn: 1, info: 2 })[a] - ({ danger: 0, warn: 1, info: 2 })[b]));
  });

  it("ignores an unknown kind, and tolerates a non-array", () => {
    const state = stateWithMoodAndSleep();
    const base = dueReminders(state, TODAY);
    expect(dueReminders(state, TODAY, { suppressKinds: ["not-a-kind"] })).toEqual(base);
    expect(dueReminders(state, TODAY, { suppressKinds: "mood" })).toEqual(base);
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
