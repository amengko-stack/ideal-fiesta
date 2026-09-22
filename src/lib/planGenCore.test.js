import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildWeeklyStrengthPlanPrompt, buildSundayPlanPrompt,
  toWeeklyPlanData, toPlanData, resolvedPriorityLabels, adjustmentConnections,
  WEEKLY_PLAN_MAX_TOKENS, SUNDAY_PLAN_MAX_TOKENS,
} from "./planGenCore.js";
import { buildWeeklyFramework, plyometricContacts } from "./weeklyPlanCore.js";
import { FIXTURE_NOW, fixtureArgs, fixtureCtx } from "./__fixtures__/weeklyPlanFixture.js";

const golden = (name) =>
  fs.readFileSync(path.resolve("src/lib/__fixtures__", name), "utf8");

// The golden files pin the prompt bytes. They are regenerated deliberately with
// `node scripts/regen-plan-goldens.mjs` — never to turn a red test green
// without reading the diff, because that diff is the only thing standing
// between a bad wording change and the athlete.
describe("buildWeeklyStrengthPlanPrompt — golden prompt bytes", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  it("reproduces the user prompt exactly", () => {
    const { prompt } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(prompt).toBe(golden("weeklyPlanPrompt.golden.txt"));
  });

  it("reproduces the system prompt exactly", () => {
    const { system } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(system).toBe(golden("weeklyPlanSystem.golden.txt"));
  });

  it("keeps maxTokens at 6000 under both the new and the old export name", () => {
    const { maxTokens } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(maxTokens).toBe(6000);
    expect(WEEKLY_PLAN_MAX_TOKENS).toBe(6000);
    expect(SUNDAY_PLAN_MAX_TOKENS).toBe(6000);
  });

  it("still answers to the old buildSundayPlanPrompt name", () => {
    expect(buildSundayPlanPrompt).toBe(buildWeeklyStrengthPlanPrompt);
  });

  it("collapses to one shortened maintenance session on a tournament week", () => {
    const { prompt, framework } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, tournament: "week_of", ctx: fixtureCtx });
    expect(prompt).toBe(golden("weeklyPlanPrompt.tournament.golden.txt"));
    expect(framework.sessions).toHaveLength(1);
    expect(framework.sessions[0].id).toBe("A");
    expect(framework.sessions[0].durationMin).toBe(35);
    expect(framework.omittedSessions.map(s => s.id)).toEqual(["B"]);
    expect(prompt).toContain("one shortened maintenance session (30–40 min) early in the week");
    expect(prompt).toContain("the second S&C session becomes recovery");

    const normal = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(normal.framework.sessions.map(s => s.id)).toEqual(["A", "B"]);
    expect(normal.prompt).toContain("Tournament mode: normal");
  });
});

describe("buildWeeklyStrengthPlanPrompt — weekly structure", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  const build = (over = {}) => buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx, ...over });

  it("describes Session A on Monday and Session B on Thursday", () => {
    const { prompt } = build();
    expect(prompt).toContain("SESSION A — Monday — Strength Foundation + Acceleration + Landing");
    expect(prompt).toContain("SESSION B — Thursday — Single-Leg Strength + Deceleration/COD + Rotational Power");
  });

  it("states Sunday is a rest day and forbids make-up sessions", () => {
    const { prompt } = build();
    expect(prompt).toContain("SUNDAY: Complete structured-training rest day");
    expect(prompt).toContain("Do not propose a make-up session for a missed Session A or B, and never move missed work to Sunday.");
  });

  it("restricts exercise choice to the approved database", () => {
    const { prompt } = build();
    expect(prompt).toContain("Select exercises only from the approved exercise database and approved regressions/progressions.");
    expect(prompt).not.toContain("You may introduce new exercises beyond the familiar list");
    expect(prompt).toContain("Suppressed for this block (do not prescribe): depth jumps, box jumping");
    // A suppressed movement never appears as a selectable option.
    expect(prompt).not.toMatch(/^Depth Jump,/m);
  });
});

describe("buildWeeklyStrengthPlanPrompt — growth, not maturity", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  it("reports measured growth velocity and the growth-watch flag", () => {
    const { prompt, growthContext } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(growthContext.velocityCmYr).toBe(9);
    expect(growthContext.growthWatch).toBe(true);
    expect(prompt).toContain("- Recent growth: 9 cm/year, measured over 183 days (~6 months)");
    expect(prompt).toContain("GROWTH WATCH: Rapid recent growth");
  });

  it("never renders a Mirwald/PHV classification, even though sitting height is on file", () => {
    const { prompt, system } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    for (const text of [prompt, system]) {
      expect(text).not.toContain("Mid-PHV");
      expect(text).not.toContain("Pre-PHV");
      expect(text).not.toContain("Post-PHV");
      expect(text).not.toContain("Maturation:");
      expect(text).not.toMatch(/\bAt PHV\b/);
    }
    expect(prompt).toContain("Do NOT infer a puberty stage");
  });

  it("caps landing volume tighter on a growth-watch week", () => {
    const watch = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    const noWatch = buildWeeklyStrengthPlanPrompt({
      ...fixtureArgs,
      ctx: fixtureCtx,
      profile: { ...fixtureArgs.profile, measurements: [{ date: "2026-03-14", height: 153, weight: 43 }] },
    });
    expect(watch.framework.sessions[0].plyoContactCap).toBe(20);
    expect(noWatch.framework.sessions[0].plyoContactCap).toBe(30);
    expect(watch.framework.maxLoadIncrementPct).toBe(5);
    expect(noWatch.framework.maxLoadIncrementPct).toBe(10);
  });

  it("handles a profile with no measurements at all", () => {
    const { prompt, growthContext } = buildWeeklyStrengthPlanPrompt({
      ...fixtureArgs, ctx: fixtureCtx, profile: { ...fixtureArgs.profile, measurements: [] },
    });
    expect(growthContext).toBeNull();
    expect(prompt).toContain("No height measurements recorded yet — measure monthly.");
  });
});

describe("buildWeeklyStrengthPlanPrompt — corrected safety language", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  const both = () => {
    const { prompt, system } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    return `${prompt}\n${system}`;
  };

  it("drops the blanket growth-plate prohibition", () => {
    const text = both();
    expect(text).not.toContain("Growth plates are open");
    expect(text).not.toContain("NO heavy axial loading");
    expect(text).toContain("Youth resistance training is appropriate when technique and supervision are good.");
    expect(text).toContain("no maximal lifting");
  });

  it("drops the single-predictor knee-injury claim", () => {
    const text = both();
    expect(text).not.toMatch(/#1 predictor/i);
    expect(text).not.toMatch(/number one predictor/i);
    expect(text).toContain("Include lower-limb strength, single-leg control, landing mechanics and deceleration/COD technique");
  });

  it("describes workload without medicalised zone labels", () => {
    const text = both();
    expect(text).not.toMatch(/danger zone/i);
    expect(text).not.toMatch(/OPTIMAL \(0\.8/);
    expect(text).not.toMatch(/UNDERLOADED/);
    expect(text).toContain("It does not classify injury risk, and a low figure is never an instruction to train more.");
  });

  it("prints the weekly target as a target, not a ceiling or a grade", () => {
    const { prompt } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(prompt).toContain("WEEKLY TARGET vs ACTUAL (coaching target, not a medical ceiling)");
    expect(prompt).toContain("Exceeding the target is information, not a failure.");
  });

  it("takes the athlete's name from the profile and hardcodes none", () => {
    const { prompt } = buildWeeklyStrengthPlanPrompt({
      ...fixtureArgs, ctx: fixtureCtx, profile: { ...fixtureArgs.profile, name: "Testa Player" },
    });
    expect(prompt).toContain("- Name: Testa Player");
    expect(prompt).toContain('"athleteNote": "one encouraging sentence written directly to Testa Player"');
    expect(prompt).not.toContain("Valissa");
    expect(prompt).not.toContain("Marsha");
  });
});

describe("buildWeeklyStrengthPlanPrompt — injected context sections", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  it("injects memory, injuries, season priority, priorities and assessments", () => {
    const { prompt } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
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
    const { prompt } = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: null });
    expect(prompt).not.toContain("ATHLETE DEVELOPMENT MEMORY:");
    expect(prompt).not.toContain("OPEN INJURIES:");
    expect(prompt).not.toContain("INJURY LOAD FLAG");
    expect(prompt).not.toContain("STANDING SEASON PRIORITY:");
    expect(prompt).toContain("No recent match within the last 14 days.");
    expect(prompt).toContain("None recorded.");
  });

  it("holds the progression gate when an injury is open, and opens it when clean", () => {
    const held = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx });
    expect(held.progression.allowed).toBe(false);
    expect(held.prompt).toContain("Progression gate: HELD");
    expect(held.framework.allowThirdSet).toBe(false);

    const open = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: null });
    expect(open.progression.allowed).toBe(true);
    expect(open.prompt).toContain("Progression gate: open");
    expect(open.framework.allowThirdSet).toBe(true); // fixture pins block week 3
  });
});

describe("toWeeklyPlanData", () => {
  const framework = buildWeeklyFramework({ blockWeek: 3, blockNumber: 1 });

  const parsed = {
    sessions: [
      {
        id: "A",
        sessionType: "reduced",
        coachFocus: "Quiet landings before anything else.",
        adjustments: [
          { id: "goblet_squat", sets: 2, loadNote: "hold 8 kg", note: "Depth was inconsistent", tennisConnection: "Movement & footwork recovery" },
          { id: "split_squat", variant: "reverse_lunge", note: "Regress while the ankle settles" },
        ],
      },
      { id: "B", sessionType: "recovery", adjustments: [] },
    ],
    loadRationale: "Court volume was high.",
    growthRationale: "Growing quickly, so quality first.",
    overallRationale: "A steady week.",
    coachNote: "Short and easy this week.",
    athleteNote: "Nice work this week!",
  };

  const build = (p = parsed) =>
    toWeeklyPlanData(p, fixtureCtx, "2026-03-15T09:00:00.000Z", { acwr: 2.01 }, {
      framework, weekKey: "2026-03-16", generatedBy: "app",
    });

  it("writes schema v2 with both sessions and Sunday recovery", () => {
    const data = build();
    expect(data.schemaVersion).toBe(2);
    expect(data.weekKey).toBe("2026-03-16");
    expect(data.sessions.map(s => s.id)).toEqual(["A", "B"]);
    expect(data.sessions[0].plannedDay).toBe("Monday");
    expect(data.sessions[1].plannedDay).toBe("Thursday");
    expect(data.sunday).toEqual({
      type: "recovery",
      structuredTraining: false,
      note: expect.stringContaining("Complete structured-training rest day"),
    });
  });

  it("gives every session its own done map and logged flag", () => {
    const data = build();
    for (const s of data.sessions) {
      expect(s.doneMap).toEqual({});
      expect(s.sessionLogged).toBe(false);
    }
  });

  it("applies the model's adjustments to the framework", () => {
    const data = build();
    const a = data.sessions.find(s => s.id === "A");
    const goblet = a.exercises.find(e => e.id === "goblet_squat");
    expect(goblet.loadNote).toBe("hold 8 kg");
    expect(goblet.note).toBe("Depth was inconsistent");
    expect(a.coachFocus).toBe("Quiet landings before anything else.");

    const split = a.exercises.find(e => e.swappedFrom === "Split Squat");
    expect(split.name).toBe("Reverse Lunge");
  });

  it("lets the model soften a session but never harden one", () => {
    const data = build();
    expect(data.sessions.find(s => s.id === "A").sessionType).toBe("reduced");
    expect(data.sessions.find(s => s.id === "B").sessionType).toBe("recovery");

    const harder = build({
      sessions: [{ id: "A", sessionType: "full", adjustments: [] }],
    });
    // The framework already says "full"; asking for "full" cannot upgrade a
    // reduced framework session either.
    const reducedFramework = buildWeeklyFramework({ blockWeek: 3, tournamentMode: "pre" });
    const upgraded = toWeeklyPlanData(
      { sessions: [{ id: "A", sessionType: "full", adjustments: [] }] },
      null, "t", null, { framework: reducedFramework }
    );
    expect(harder.sessions[0].sessionType).toBe("full");
    expect(upgraded.sessions[0].sessionType).toBe("reduced");
  });

  it("never lets the model add sets, reps, exercises or landing contacts", () => {
    const greedy = {
      sessions: [{
        id: "A",
        adjustments: [
          { id: "goblet_squat", sets: 9, reps: 30 },
          { id: "snap_down", sets: 8 },
          { id: "depth_jump", sets: 4, reps: 6 },
          { id: "Completely Made Up Move", sets: 3, reps: 10 },
        ],
      }],
    };
    const data = toWeeklyPlanData(greedy, null, "t", null, { framework });
    const a = data.sessions.find(s => s.id === "A");
    const names = a.exercises.map(e => e.name);

    expect(a.exercises.find(e => e.id === "goblet_squat").sets).toBe(3); // framework value, unchanged
    expect(a.exercises.find(e => e.id === "snap_down").sets).toBe(2);
    expect(names).not.toContain("Depth Jump");
    expect(names).not.toContain("Completely Made Up Move");
    expect(a.exercises).toHaveLength(framework.sessions[0].exercises.length);
    expect(plyometricContacts(a.exercises)).toBeLessThanOrEqual(a.plyoContactCap);
  });

  it("carries the rationales, metrics, generatedAt and matchInformedBy", () => {
    const data = build();
    expect(data.briefing).toBe("A steady week.");
    expect(data.loadRationale).toBe("Court volume was high.");
    expect(data.growthRationale).toBe("Growing quickly, so quality first.");
    expect(data.coachNote).toBe("Short and easy this week.");
    expect(data.athleteNote).toBe("Nice work this week!");
    expect(data.metrics).toEqual({ acwr: 2.01 });
    expect(data.generatedAt).toBe("2026-03-15T09:00:00.000Z");
    expect(data.generatedBy).toBe("app");
    expect(data.matchInformedBy).toEqual({
      opponentName: "Kirana", matchStartTime: "2026-03-07T02:00:00.000Z",
    });
  });

  it("survives an empty parsed response", () => {
    const data = toWeeklyPlanData({}, null, "t", null, { framework });
    expect(data.sessions).toHaveLength(2);
    expect(data.briefing).toBe("");
    expect(data.metrics).toBeNull();
    expect(data.matchInformedBy).toBeNull();
  });

  it("still answers to the old toPlanData name", () => {
    expect(toPlanData).toBe(toWeeklyPlanData);
  });
});

describe("adjustmentConnections", () => {
  it("flattens the per-session adjustments into name/connection pairs", () => {
    const out = adjustmentConnections({
      sessions: [
        { id: "A", adjustments: [{ id: "goblet_squat", tennisConnection: "Lateral power" }] },
        { id: "B", adjustments: [{ id: "step_up" }] },
      ],
    });
    expect(out).toEqual([
      { name: "goblet_squat", tennisConnection: "Lateral power" },
      { name: "step_up", tennisConnection: null },
    ]);
  });

  it("returns an empty list for a missing or empty response", () => {
    expect(adjustmentConnections(null)).toEqual([]);
    expect(adjustmentConnections({ sessions: [] })).toEqual([]);
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

  it("also accepts a parsed weekly response directly", () => {
    const labels = resolvedPriorityLabels(
      {
        sessions: [{
          id: "A",
          adjustments: [{ id: "lateral_shuffle", tennisConnection: "Improves movement and footwork recovery on wide balls" }],
        }],
      },
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
