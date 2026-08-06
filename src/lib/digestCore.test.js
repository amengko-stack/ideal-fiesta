import { describe, it, expect } from "vitest";
import { buildDigestData, buildDigestNotesPrompt, digestPushPayload } from "./digestCore.js";

const WEEK_KEY = "2026-03-09";                  // Monday
const NOW_ISO  = "2026-03-15T09:00:00.000Z";    // the Sunday of that week
const now = () => new Date(NOW_ISO);

const ctx = {
  athleteUid: "athlete-1",
  athleteProfile: { name: "Valissa", age: 12 },
  sessionLogs: {
    sessions: [
      { id: "l1", date: "2026-03-09", type: "tennis",   duration: 90, rpe: 7, srpe: 630 },
      { id: "l2", date: "2026-03-11", type: "tennis",   duration: 60, rpe: 6, srpe: 360 },
      { id: "l3", date: "2026-03-13", type: "other",    duration: 45, rpe: 5, srpe: 225 },
      { id: "l4", date: "2026-03-04", type: "tennis",   duration: 60, rpe: 5, srpe: 300 }, // previous week
    ],
    thisWeekSrpe: 1215,
    fourWeekAvgSrpe: 379,
    acwr: 3.21,
  },
  wellbeing: {
    entries: [
      { id: "w1", date: "2026-03-14", sleep: 6, mood: 2, soreness: 3 },
      { id: "w2", date: "2026-03-13", sleep: 6.5, mood: 2, soreness: 2 },
    ],
    avgSleepHours: 6.25,
    avgMood: 2,
    avgSoreness: 2.5,
    lowMoodFlag: true,
    lowSleepFlag: false,
  },
  recentMatch: null,
  matches: [
    { id: "m1", matchStartTime: "2026-03-14T02:00:00.000Z", opponentName: "Kirana", whoWonMatch: 1 },
    { id: "m2", matchStartTime: "2026-03-02T02:00:00.000Z", opponentName: "Older", whoWonMatch: 0 },
  ],
  deferredPriorities: [
    { priority: "Second serve under pressure", key: "second_serve", weeksDeferredCount: 5 },
    { priority: "Movement recovery", key: "movement_footwork", weeksDeferredCount: 1 },
  ],
  injuries: {
    open: [{ id: "i1", bodyArea: "Ankle", severity: 3, status: "open", onsetDate: "2026-03-09" }],
    flag: { tone: "warn", headline: "Ankle — avoid loading this area", guidance: "Avoid loading it." },
    recurring: [],
  },
};

const planData = {
  plan: [{ name: "A" }, { name: "B" }, { name: "C" }],
  sessionType: "reduced",
  sessionDuration: 45,
  coachNote: "A lighter session while the ankle settles.",
};

const hygieneResults = {
  merged: 1,
  resolved: [{ id: "d9", priority: "Drop shot disguise" }],
  escalated: [{ id: "d1", priority: "Second serve under pressure" }],
};

const build = (over = {}) =>
  buildDigestData({ ctx, planData, hygieneResults, weekKey: WEEK_KEY, now: now(), ...over });

describe("buildDigestData — envelope", () => {
  it("dates the week Monday to Sunday and stamps provenance", () => {
    const d = build();
    expect(d.weekKey).toBe("2026-03-09");
    expect(d.weekStart).toBe("2026-03-09");
    expect(d.weekEnd).toBe("2026-03-15");
    expect(d.generatedAt).toBe(NOW_ISO);
    expect(d.generatedBy).toBe("weeklyReview");
    expect(d.athleteName).toBe("Valissa");
  });

  it("accepts an explicit generatedBy", () => {
    expect(build({ generatedBy: "manual" }).generatedBy).toBe("manual");
  });

  it("emits exactly the documented sections", () => {
    expect(Object.keys(build()).sort()).toEqual([
      "athleteName", "generatedAt", "generatedBy", "injuries", "load", "matches",
      "plan", "priorities", "weekEnd", "weekKey", "weekStart", "wellbeing",
    ]);
  });
});

describe("buildDigestData — load", () => {
  it("reuses the context's sRPE/ACWR rather than recomputing them", () => {
    const { load } = build();
    expect(load.thisWeekSRPE).toBe(1215);
    expect(load.fourWeekAvg).toBe(379);
    expect(load.acwr).toBe(3.21);
    expect(load.acwrStatus).toEqual({ label: "Ease up", tone: "danger" });
  });

  it("counts only this week's sessions and splits sRPE by type", () => {
    const { load } = build();
    expect(load.sessionCount).toBe(3);            // l4 is the previous week
    expect(load.byType).toEqual({ tennis: 990, other: 225 });
  });

  it("computes monotony and strain from load.js over the 7 days ending now", () => {
    const { load } = build();
    // Daily loads over 2026-03-09…03-15: 630, 0, 360, 0, 225, 0, 0.
    expect(load.monotony).toBe(0.76);
    expect(load.strain).toBe(923);   // 7-day total 1215 × monotony
  });

  it("reports a no-data ACWR status when there is no history", () => {
    const bare = { ...ctx, sessionLogs: { sessions: [], thisWeekSrpe: 0, fourWeekAvgSrpe: 0, acwr: null } };
    const { load } = build({ ctx: bare });
    expect(load.acwr).toBeNull();
    expect(load.acwrStatus).toEqual({ label: "No data", tone: "muted" });
    expect(load.sessionCount).toBe(0);
    expect(load.byType).toEqual({});
    expect(load.monotony).toBeNull();
    expect(load.strain).toBeNull();
  });
});

describe("buildDigestData — wellbeing", () => {
  it("carries the context's averages and flags", () => {
    expect(build().wellbeing).toEqual({
      checkinCount: 2,
      avgSleep: 6.25,
      avgMood: 2,
      avgSoreness: 2.5,
      lowMoodFlag: true,
      lowSleepFlag: false,
    });
  });
});

describe("buildDigestData — matches", () => {
  it("keeps only matches played inside the week, oldest first", () => {
    expect(build().matches).toEqual([
      { matchId: "m1", opponentName: "Kirana", date: "2026-03-14", won: true },
    ]);
  });

  it("falls back to ctx.recentMatch when no match list is available", () => {
    const only = {
      ...ctx,
      matches: undefined,
      recentMatch: { id: "m9", matchStartTime: "2026-03-10T02:00:00.000Z", opponentName: "Solo", whoWonMatch: 0 },
    };
    expect(build({ ctx: only }).matches).toEqual([
      { matchId: "m9", opponentName: "Solo", date: "2026-03-10", won: false },
    ]);
  });

  it("is empty when nothing was played", () => {
    expect(build({ matches: [] }).matches).toEqual([]);
  });
});

describe("buildDigestData — priorities", () => {
  it("counts the open list and names the week's focus", () => {
    const { priorities } = build();
    expect(priorities.open).toBe(2);
    // Longest-deferred wins when nothing is escalated in the passed-in list.
    expect(priorities.weeklyFocus).toBe("Second serve under pressure");
  });

  it("prefers an escalated priority as the focus when raw docs are supplied", () => {
    const raw = [
      { priority: "Second serve under pressure", status: "active", weeksDeferredCount: 9 },
      { priority: "Movement recovery", status: "escalated", weeksDeferredCount: 1 },
    ];
    expect(build({ priorities: raw }).priorities.weeklyFocus).toBe("Movement recovery");
  });

  it("reports what this run resolved and escalated, as labels", () => {
    const { priorities } = build();
    expect(priorities.escalatedThisRun).toEqual(["Second serve under pressure"]);
    expect(priorities.resolvedThisRun).toEqual(["Drop shot disguise"]);
  });

  it("accepts plain label strings from hygiene results", () => {
    const { priorities } = build({ hygieneResults: { resolved: ["A"], escalated: ["B", "C"] } });
    expect(priorities.resolvedThisRun).toEqual(["A"]);
    expect(priorities.escalatedThisRun).toEqual(["B", "C"]);
  });

  it("degrades to empty lists and a null focus with nothing open", () => {
    const empty = { ...ctx, deferredPriorities: [] };
    const { priorities } = build({ ctx: empty, hygieneResults: null });
    expect(priorities).toEqual({ open: 0, escalatedThisRun: [], resolvedThisRun: [], weeklyFocus: null });
  });
});

describe("buildDigestData — injuries and plan", () => {
  it("summarises open injuries by count and headline", () => {
    expect(build().injuries).toEqual({ openCount: 1, flagHeadline: "Ankle — avoid loading this area" });
  });

  it("reports zero injuries when the context has none", () => {
    expect(build({ ctx: { ...ctx, injuries: null } }).injuries).toEqual({ openCount: 0, flagHeadline: null });
  });

  it("summarises the plan", () => {
    expect(build().plan).toEqual({
      sessionType: "reduced",
      sessionDuration: 45,
      exerciseCount: 3,
      coachNote: "A lighter session while the ankle settles.",
    });
  });

  it("nulls the plan section when no plan was generated", () => {
    expect(build({ planData: null }).plan).toEqual({
      sessionType: null, sessionDuration: null, exerciseCount: 0, coachNote: null,
    });
  });
});

describe("buildDigestData — robustness", () => {
  it("survives being called with nothing at all", () => {
    const d = buildDigestData();
    expect(d.weekKey).toBeNull();
    expect(d.load.sessionCount).toBe(0);
    expect(d.matches).toEqual([]);
    expect(d.priorities.open).toBe(0);
  });

  it("does not mutate the context it was given", () => {
    const snapshot = JSON.parse(JSON.stringify(ctx));
    build();
    expect(ctx).toEqual(snapshot);
  });
});

describe("buildDigestNotesPrompt", () => {
  it("asks for exactly the two note fields as JSON", () => {
    const { system, prompt, maxTokens } = buildDigestNotesPrompt(build(), "Valissa");
    expect(system).toContain("Return ONLY a raw JSON object");
    expect(prompt).toContain('"parentNote"');
    expect(prompt).toContain('"athleteNote"');
    expect(maxTokens).toBeGreaterThan(0);
  });

  it("carries the tone conventions matchAnalysis.js established", () => {
    const { prompt } = buildDigestNotesPrompt(build(), "Valissa");
    expect(prompt).toContain("Message for the parent — context, encouragement, and what to watch for");
    expect(prompt).toContain("3-5 sentences");
    expect(prompt).toContain("no jargon");
    expect(prompt).toContain("Direct message for Valissa");
    expect(prompt).toContain("1-2 sentences, written to her, positive and motivating.");
  });

  it("injects the week's real numbers, not placeholders", () => {
    const { prompt } = buildDigestNotesPrompt(build(), "Valissa");
    expect(prompt).toContain("week of 2026-03-09 to 2026-03-15");
    expect(prompt).toContain("This week sRPE: 1215 (4-week average 379)");
    expect(prompt).toContain("ACWR: 3.21 — Ease up");
    expect(prompt).toContain("Sessions logged: 3 (sRPE by type: tennis 990, other 225)");
    expect(prompt).toContain("Low mood flag: YES");
    expect(prompt).toContain("- 2026-03-14: WIN vs Kirana");
    expect(prompt).toContain("This week's focus: Second serve under pressure");
    expect(prompt).toContain("OPEN INJURIES: 1 — Ankle — avoid loading this area");
    expect(prompt).toContain("- Session: reduced · 45 min · 3 exercises");
  });

  it("forbids the model from inventing anything", () => {
    const { system } = buildDigestNotesPrompt(build(), "Valissa");
    expect(system).toContain("never invent an event");
  });

  it("falls back to the digest's own athlete name, then to Valissa", () => {
    expect(buildDigestNotesPrompt(build(), null).prompt).toContain("WEEK IN REVIEW for Valissa");
    expect(buildDigestNotesPrompt({}, null).prompt).toContain("WEEK IN REVIEW for Valissa");
  });

  it("renders em-dashes rather than undefined for a bare digest", () => {
    const { prompt } = buildDigestNotesPrompt({}, "Valissa");
    expect(prompt).not.toContain("undefined");
    expect(prompt).toContain("- None this week.");
  });
});

describe("digestPushPayload", () => {
  it("titles the push with the athlete's name", () => {
    expect(digestPushPayload({ athleteName: "Valissa" }).title).toBe("Valissa's week in review");
    expect(digestPushPayload({}).title).toBe("Valissa's week in review");
  });

  it("uses the first sentence of parentNote as the body", () => {
    const { body } = digestPushPayload({
      athleteName: "Valissa",
      parentNote: "She trained hard this week. Sleep was short on two nights, so keep an eye on that. Nice progress on the serve.",
    });
    expect(body).toBe("She trained hard this week.");
  });

  it("handles a question or exclamation as the first sentence", () => {
    expect(digestPushPayload({ parentNote: "What a week! Three sessions and a win." }).body)
      .toBe("What a week!");
  });

  it("uses the whole note when it has no sentence break", () => {
    expect(digestPushPayload({ parentNote: "A steady week all round" }).body)
      .toBe("A steady week all round");
  });

  it("falls back to the deterministic stats when parentNote is missing", () => {
    const digest = build();
    expect(digestPushPayload(digest)).toEqual({
      title: "Valissa's week in review",
      body: "3 sessions · load 1215 · Ease up · 1 match · reduced session planned.",
    });
  });

  it("falls back for an empty or whitespace parentNote too", () => {
    expect(digestPushPayload({ ...build(), parentNote: "   " }).body).toContain("3 sessions");
    expect(digestPushPayload({ ...build(), parentNote: null }).body).toContain("3 sessions");
  });

  it("produces a sane body for a completely empty week", () => {
    expect(digestPushPayload({}).body).toBe("0 sessions.");
  });
});
