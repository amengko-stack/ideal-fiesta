import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildSundayPlanPrompt, toPlanData, resolvedPriorityLabels, SUNDAY_PLAN_MAX_TOKENS,
} from "./planGenCore.js";
import { FIXTURE_NOW, fixtureArgs, fixtureCtx } from "./__fixtures__/sundayPlanFixture.js";

const golden = (name) =>
  fs.readFileSync(path.resolve("src/lib/__fixtures__", name), "utf8");

// The three golden files were captured from planGen.js's inline prompt
// construction BEFORE the extraction, with the clock frozen at FIXTURE_NOW.
// Byte-equality here is the proof that moving the code changed nothing.
describe("buildSundayPlanPrompt — extraction is byte-identical", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  it("reproduces the pre-refactor user prompt exactly", () => {
    const { prompt } = buildSundayPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(prompt).toBe(golden("sundayPlanPrompt.golden.txt"));
  });

  it("reproduces the pre-refactor system prompt exactly", () => {
    const { system } = buildSundayPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(system).toBe(golden("sundayPlanSystem.golden.txt"));
  });

  it("keeps maxTokens at 6000", () => {
    const { maxTokens } = buildSundayPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(maxTokens).toBe(6000);
    expect(SUNDAY_PLAN_MAX_TOKENS).toBe(6000);
  });

  it("flips the taper instructions on a tournament week", () => {
    const { prompt } = buildSundayPlanPrompt({ ...fixtureArgs, tournament: "week_of", ctx: fixtureCtx });
    expect(prompt).toBe(golden("sundayPlanPrompt.tournament.golden.txt"));
    expect(prompt).toContain("Tournament THIS week: activation only, max 6 exercises, nothing causing soreness");
    expect(prompt).toContain("- Tournament status: week_of");

    const normal = buildSundayPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx }).prompt;
    expect(normal).toContain("- Tournament status: Normal week");
    expect(normal).not.toContain("Tournament THIS week: activation only");
  });
});

describe("buildSundayPlanPrompt — injected context sections", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  it("injects memory, injuries, season priority, priorities and assessments", () => {
    const { prompt } = buildSundayPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(prompt).toContain("ATHLETE DEVELOPMENT MEMORY:");
    expect(prompt).toContain("OPEN INJURIES:");
    expect(prompt).toContain("⚠ INJURY LOAD FLAG (info): Ankle — keep an eye on it");
    expect(prompt).toContain("STANDING SEASON PRIORITY:");
    expect(prompt).toContain("- Next month priority: Convert short balls instead of resetting the rally.");
    expect(prompt).toContain("[key: second_serve] Second serve under pressure (deferred 3 wks)");
    expect(prompt).toContain("Toss drifts behind the head, forcing an arm-only swing.");
    expect(prompt).toContain("Match vs Kirana on");
    expect(prompt).toContain("- [critical] Second serve sat up under pressure at 4-4.");
  });

  it("omits every optional section when there is no context", () => {
    const { prompt } = buildSundayPlanPrompt({ ...fixtureArgs, ctx: null });
    expect(prompt).not.toContain("ATHLETE DEVELOPMENT MEMORY:");
    expect(prompt).not.toContain("OPEN INJURIES:");
    expect(prompt).not.toContain("INJURY LOAD FLAG");
    expect(prompt).not.toContain("STANDING SEASON PRIORITY:");
    expect(prompt).toContain("No recent match within the last 14 days.");
    expect(prompt).toContain("None recorded.");
  });

  it("renders the Mid-PHV maturation rule from the fixture's measurements", () => {
    const { prompt } = buildSundayPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(prompt).toContain("Maturation: Mid-PHV");
    expect(prompt).toContain("- MID-PHV WINDOW:");
  });

  it("drops the maturation line when no measurement carries a sitting height", () => {
    const profile = { ...fixtureArgs.profile, measurements: [{ date: "2026-03-01", height: 154, weight: 41 }] };
    const { prompt } = buildSundayPlanPrompt({ ...fixtureArgs, profile, ctx: fixtureCtx });
    expect(prompt).not.toContain("Maturation:");
    expect(prompt).not.toContain("MID-PHV WINDOW");
  });

  it("puts her current age in the system prompt's load rule", () => {
    const { system } = buildSundayPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(system).toContain("non-negotiable for her 12-year-old athletic development window");
  });
});

describe("toPlanData", () => {
  const parsed = {
    sessionType: "reduced",
    sessionDuration: 45,
    loadRationale: "ACWR is high.",
    matchRationale: "Serve work deferred.",
    techAssessmentRationale: "Toss drill informs the overhead block.",
    overallRationale: "Keep it light.",
    coachNote: "Short and easy today.",
    athleteNote: "Nice work this week!",
    exercises: [
      {
        name: "Single-Leg Balance Reach", category: "Strength", sets: 3, reps: 8,
        progressionNote: "Added a reach", tennisConnection: "Movement & footwork recovery", ageFlag: "safe",
      },
      { name: "Dead Bug", category: "Core", sets: 2, reps: 10, progressionNote: "Hold longer" },
    ],
  };

  it("maps ids, unit and the composed note", () => {
    const data = toPlanData(parsed, fixtureCtx, "2026-03-15T09:00:00.000Z", { acwr: 2.01 });
    expect(data.plan).toHaveLength(2);
    expect(data.plan[0].id).toBe("single_leg_balance_reach");
    expect(data.plan[0].unit).toBe("reps");
    expect(data.plan[0].note).toBe("Added a reach · Tennis: Movement & footwork recovery");
    // No tennisConnection → note is just the progression note, no separator.
    expect(data.plan[1].id).toBe("dead_bug");
    expect(data.plan[1].note).toBe("Hold longer");
  });

  it("carries the rationales, metrics, generatedAt and matchInformedBy", () => {
    const data = toPlanData(parsed, fixtureCtx, "2026-03-15T09:00:00.000Z", { acwr: 2.01 });
    expect(data.sessionType).toBe("reduced");
    expect(data.sessionDuration).toBe(45);
    expect(data.briefing).toBe("Keep it light.");
    expect(data.loadRationale).toBe("ACWR is high.");
    expect(data.matchRationale).toBe("Serve work deferred.");
    expect(data.techAssessmentRationale).toBe("Toss drill informs the overhead block.");
    expect(data.coachNote).toBe("Short and easy today.");
    expect(data.athleteNote).toBe("Nice work this week!");
    expect(data.metrics).toEqual({ acwr: 2.01 });
    expect(data.generatedAt).toBe("2026-03-15T09:00:00.000Z");
    expect(data.matchInformedBy).toEqual({
      opponentName: "Kirana", matchStartTime: "2026-03-07T02:00:00.000Z",
    });
  });

  it("falls back to coachNote for the briefing and nulls matchInformedBy without a match", () => {
    const data = toPlanData({ coachNote: "Only a note.", exercises: [] }, {}, "t", null);
    expect(data.briefing).toBe("Only a note.");
    expect(data.matchInformedBy).toBeNull();
    expect(data.sessionType).toBeNull();
    expect(data.plan).toEqual([]);
  });

  it("survives an empty parsed response", () => {
    const data = toPlanData({}, null, "t");
    expect(data.plan).toEqual([]);
    expect(data.briefing).toBe("");
    expect(data.metrics).toBeNull();
  });
});

describe("resolvedPriorityLabels", () => {
  const open = fixtureCtx.deferredPriorities;

  it("matches an exercise's tennisConnection to a deferred priority", () => {
    const labels = resolvedPriorityLabels(
      [{ name: "Ladder Drill", tennisConnection: "Improves movement and footwork recovery on wide balls" }],
      open,
    );
    expect(labels).toEqual(["Movement recovery after wide balls"]);
  });

  it("skips exercises with no tennisConnection", () => {
    expect(resolvedPriorityLabels([{ name: "Dead Bug" }], open)).toEqual([]);
  });

  it("returns nothing when the connection is unrelated", () => {
    const labels = resolvedPriorityLabels(
      [{ name: "Calf Raise", tennisConnection: "General ankle robustness" }],
      open,
    );
    expect(labels).toEqual([]);
  });

  it("handles missing inputs without throwing", () => {
    expect(resolvedPriorityLabels(null, null)).toEqual([]);
    expect(resolvedPriorityLabels([], open)).toEqual([]);
  });
});
