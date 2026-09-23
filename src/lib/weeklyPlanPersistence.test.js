import { describe, it, expect } from "vitest";
import { assembleAthleteContext } from "./athleteContextCore.js";
import { calculateMetrics } from "./load.js";
import { buildWeeklyStrengthPlanPrompt, toWeeklyPlanData } from "./planGenCore.js";
import {
  buildSession, resolveProgramState, startNextBlock, SESSION_TEMPLATES, BLOCK_LENGTH_WEEKS,
} from "./weeklyPlanCore.js";
import { planPriorityUpserts } from "./deferredPrioritiesCore.js";
import { buildDigestData } from "./digestCore.js";
import { mergeMemoryUpdate, emptyMemory } from "./athleteMemoryCore.js";
import { findUndefinedPaths, assertFirestoreSafe } from "../../functions/scripts/firestore-safe.mjs";
import {
  FIXTURE_NOW, fixtureProfile, fixtureWeekLogs, fixtureSessionHistory, fixtureWellbeing,
} from "./__fixtures__/weeklyPlanFixture.js";

// ─── plans/current PERSISTENCE ───────────────────────────────────────────────
// Firestore rejects a whole document on one explicit `undefined`, and on
// 2026-09-23 it rejected the first production weekly plan: buildSession wrote
// `distanceM: undefined` onto 35 of the 37 exercises. The unit tests all
// passed, because toEqual treats an undefined property as absent, and the
// qualification double stored whatever it was given.
//
// These tests build the EXACT object the orchestrator hands to
// plans/current().set() — the same call sequence as the plan step in
// functions/weeklyReview.js — and assert the invariant on it directly.

const NOW = new Date(FIXTURE_NOW);
const PLAN_WEEK = "2026-03-16"; // upcomingWeekKey on the fixture's Sunday
const UID = "athlete-1";

const MATCH = {
  id: "m1", athleteId: UID, opponentName: "Kirana",
  matchStartTime: "2026-03-14T02:00:00.000Z", whoWonMatch: 1,
};

const rawAthlete = (over = {}) => ({
  athleteUid: UID,
  profile: fixtureProfile,
  weekLogs: fixtureWeekLogs,
  wellbeing: fixtureWellbeing,
  sessions: fixtureSessionHistory,
  matches: [MATCH],
  matchAnalysisDoc: { criticalFindings: [{ finding: "Late split-step.", priority: "critical" }], deferredPriorities: [] },
  deferredDocs: [],
  tournaments: [],
  injuries: [],
  memoryDoc: null,
  ...over,
});

// A realistic model reply: adjustments that swap a variant, lower sets and
// reps, and add notes — every branch of mergeSessionAdjustments that writes.
const REPLY = {
  sessions: [
    { id: "A", sessionType: "full", coachFocus: "Quiet landings first.", adjustments: [
      { id: "goblet_squat", loadNote: "hold 8 kg", tennisConnection: "Lateral power" },
      { id: "split_squat", variant: "reverse_lunge", sets: 1, note: "Regress while the ankle settles" },
    ] },
    { id: "B", sessionType: "reduced", coachFocus: "Braking mechanics.", adjustments: [
      { id: "hip_thrust", swapTo: "bridge", reps: 8 },
    ] },
  ],
  loadRationale: "Court volume was steady.",
  growthRationale: "Growing quickly — quality first.",
  overallRationale: "A steady build week.",
  deferredPriorities: [{ priority: "Serve toss", key: "serve_toss" }],
  coachNote: "Steady week.",
  athleteNote: "Great landings last week!",
};

// Block chronology the way ensureProgramStateAdmin resolves it: from a stored
// programState/strength whose start puts the plan week at `blockWeek`.
function blockStateFor(blockWeek) {
  const start = new Date(`${PLAN_WEEK}T00:00:00`);
  start.setDate(start.getDate() - (blockWeek - 1) * 7);
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const { position } = resolveProgramState({
    state: {
      schemaVersion: 1, blockId: `blk-${key}-1`, blockNumber: 1, blockStartWeekKey: key,
      blockLengthWeeks: BLOCK_LENGTH_WEEKS, createdAt: FIXTURE_NOW, status: "active",
      previousBlockId: null, initReason: "initialised-week-1",
    },
    currentWeekKey: PLAN_WEEK,
    now: NOW,
  });
  return {
    blockWeek: position.blockWeek, blockNumber: position.blockNumber, blockId: position.blockId,
    blockStatus: position.status, blockStartWeekKey: position.blockStartWeekKey,
    needsNewBlock: position.needsNewBlock,
  };
}

// The object weeklyReview.js writes to plans/current, built the same way.
function planDocFor({ tournament = "none", blockWeek = 1, reply = REPLY, raw = rawAthlete() } = {}) {
  const ctx = assembleAthleteContext(raw, NOW);
  const metrics = calculateMetrics(raw.weekLogs, raw.wellbeing);
  const built = buildWeeklyStrengthPlanPrompt({
    profile: raw.profile, weekLogs: raw.weekLogs, sessionHistory: raw.sessions, wellbeing: raw.wellbeing,
    tournament, sessionTime: "10:00", ctx, now: NOW, metrics, blockState: blockStateFor(blockWeek),
  });
  const planData = toWeeklyPlanData(reply, ctx, NOW.toISOString(), metrics, {
    framework: built.framework, weekKey: PLAN_WEEK, growthContext: built.growthContext,
    weekSummary: built.weekSummary, targetComparison: built.targetComparison, trend: built.trend,
    generatedBy: "weeklyReview",
  });
  return { planData, ctx, raw };
}

const allExercises = (plan) => plan.sessions.flatMap(s => s.exercises);

describe("plans/current — a complete normal S&C v2 week is Firestore-safe", () => {
  const { planData } = planDocFor();

  it("contains zero explicit undefined values anywhere in the document", () => {
    expect(findUndefinedPaths(planData)).toEqual([]);
    expect(() => assertFirestoreSafe(planData, "set plans/current")).not.toThrow();
  });

  it("is the full v2 week — the sections below are really there, not vacuously clean", () => {
    expect(planData.schemaVersion).toBe(2);
    expect(planData.sessions.map(s => `${s.id}/${s.plannedDay}`)).toEqual(["A/Monday", "B/Thursday"]);
    expect(planData.sessions[0].exercises).toHaveLength(19);
    expect(planData.sessions[1].exercises).toHaveLength(18);
    expect(planData.sunday).toMatchObject({ type: "recovery", structuredTraining: false });
    expect(planData.growthContext.recentGrowthVelocityCmYr).not.toBeNull();
    expect(Object.keys(planData.loadContext)).toEqual(["weekSummary", "targetComparison", "trend"]);
    expect(planData.weeklyTargets.tennisHoursMin).toBeTypeOf("number");
    expect(planData.block).toMatchObject({ week: 1, number: 1, status: "active" });
  });

  it.each([
    ["block", (p) => p.block],
    ["Session A", (p) => p.sessions[0]],
    ["Session B", (p) => p.sessions[1]],
    ["every exercise", (p) => allExercises(p)],
    ["Sunday Recovery", (p) => p.sunday],
    ["growth context", (p) => p.growthContext],
    ["workload context", (p) => p.loadContext],
    ["weekly targets", (p) => p.weeklyTargets],
    ["metrics", (p) => p.metrics],
    ["match provenance", (p) => p.matchInformedBy],
  ])("%s holds no explicit undefined", (_label, pick) => {
    expect(findUndefinedPaths(pick(planData))).toEqual([]);
  });

  it("omits distanceM on every exercise that is not distance-based, and keeps it on the two that are", () => {
    const withDistance = allExercises(planData).filter(e => Object.hasOwn(e, "distanceM"));
    expect(withDistance.map(e => [e.key, e.distanceM])).toEqual([["accel_5m", 5], ["decel_stop", 5]]);
  });
});

describe("plans/current — the 2026-09-23 production failure is caught", () => {
  // Pre-fix, buildSession projected `distanceM: <expr>` onto EVERY exercise, so
  // each one without a distance carried an explicit undefined. This rebuilds
  // that exact document from today's real plan, so the guard is proven against
  // the shape production actually rejected rather than a toy.
  const asShippedAt4bf55bd = (plan) => ({
    ...plan,
    sessions: plan.sessions.map(s => ({
      ...s,
      exercises: s.exercises.map(e => (Object.hasOwn(e, "distanceM") ? e : { ...e, distanceM: undefined })),
    })),
  });

  it("reproduces the production numbers: Session A 18/19, Session B 17/18, 35 of 37", () => {
    const broken = asShippedAt4bf55bd(planDocFor().planData);
    const paths = findUndefinedPaths(broken);
    expect(paths).toHaveLength(35);
    expect(paths.filter(p => p.startsWith("sessions.0.")).length).toBe(18);
    expect(paths.filter(p => p.startsWith("sessions.1.")).length).toBe(17);
    expect(paths.every(p => /^sessions\.\d+\.exercises\.\d+\.distanceM$/.test(p))).toBe(true);
  });

  it("rejects it with the exact field production reported", () => {
    const broken = asShippedAt4bf55bd(planDocFor().planData);
    expect(() => assertFirestoreSafe(broken, "set plans/current"))
      .toThrow('found in field "sessions.0.exercises.0.distanceM"');
  });

  it("buildSession no longer creates the key at all for a template entry without a distance", () => {
    for (const id of ["A", "B"]) {
      const session = buildSession(id, { blockWeek: 5 });
      for (const ex of session.exercises) {
        const template = SESSION_TEMPLATES[id].exercises.find(t => t.key === ex.key);
        expect(Object.hasOwn(ex, "distanceM"), ex.key).toBe(Object.hasOwn(template, "distanceM"));
      }
    }
  });
});

describe("plans/current — every block week, tournament shape and model reply is Firestore-safe", () => {
  const TOURNAMENTS = ["none", "pre", "week_of", "post_hard", "post_easy"];
  const REPLIES = {
    realistic: REPLY,
    empty: {},
    null: null,
    notesOnly: { coachNote: "Only a note." },
    bareAdjustments: { sessions: [{ id: "A", adjustments: [{ id: "db_row" }, {}] }, { id: "B" }] },
  };

  // One sweep rather than 225 separate tests: the property is a single one,
  // and a failure still names every combination that broke it.
  it("holds for all 9 block weeks (incl. the week-8 hold) × 5 tournament shapes × 5 model replies", () => {
    const offending = [];
    let checked = 0;
    for (let blockWeek = 1; blockWeek <= BLOCK_LENGTH_WEEKS + 1; blockWeek++) {
      for (const tournament of TOURNAMENTS) {
        for (const [reply, parsed] of Object.entries(REPLIES)) {
          const paths = findUndefinedPaths(planDocFor({ blockWeek, tournament, reply: parsed }).planData);
          checked++;
          if (paths.length) offending.push(`wk${blockWeek}/${tournament}/${reply}: ${paths.slice(0, 3).join(", ")}`);
        }
      }
    }
    expect(checked).toBe(225);
    expect(offending).toEqual([]);
  });

  it("the tournament week's materially different shape (one session + a recovery stub) is covered", () => {
    const { planData } = planDocFor({ tournament: "week_of" });
    expect(planData.sessions.map(s => `${s.id}/${s.sessionType}/${s.exercises.length}`))
      .toEqual([`A/maintenance/${planData.sessions[0].exercises.length}`, "B/recovery/0"]);
    expect(planData.sessions[1].omittedReason).toBeTypeOf("string");
    expect(findUndefinedPaths(planData)).toEqual([]);
  });

  it("an athlete with no growth history (growthContext absent) is covered", () => {
    const raw = rawAthlete({ profile: { ...fixtureProfile, measurements: [] } });
    const { planData } = planDocFor({ raw });
    expect(planData.growthContext).toEqual({
      recentGrowthVelocityCmYr: null, intervalDays: null, growthWatch: false, sufficientInterval: false,
    });
    expect(findUndefinedPaths(planData)).toEqual([]);
  });

  it("a recent match with no opponent name writes null, not undefined", () => {
    const unnamed = { ...MATCH };
    delete unnamed.opponentName;
    const { planData } = planDocFor({ raw: rawAthlete({ matches: [unnamed] }) });
    expect(planData.matchInformedBy).toEqual({ opponentName: null, matchStartTime: MATCH.matchStartTime });
    expect(findUndefinedPaths(planData)).toEqual([]);
  });
});

describe("the rest of the weekly-review pipeline's Firestore writes are Firestore-safe", () => {
  it("programState/strength: migration, completion and the explicit next block", () => {
    const migrated = resolveProgramState({ state: null, previousPlan: null, currentWeekKey: PLAN_WEEK, now: NOW });
    expect(findUndefinedPaths(migrated.state)).toEqual([]);
    const completed = resolveProgramState({
      state: { ...migrated.state, blockStartWeekKey: "2025-12-01" }, currentWeekKey: PLAN_WEEK, now: NOW,
    });
    expect(completed.transition).toBe("completed");
    expect(findUndefinedPaths(completed.state)).toEqual([]);
    expect(findUndefinedPaths(startNextBlock(completed.state, PLAN_WEEK, NOW))).toEqual([]);
  });

  it("deferredPriorities upserts from a sparse model item", () => {
    const ops = planPriorityUpserts([], [{ priority: "Serve toss" }, { priority: "Footwork", key: "movement_footwork" }], "2026-03-09");
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) expect(findUndefinedPaths(op.fields ?? op.newFields)).toEqual([]);
  });

  it("digests/{weekKey} and memory/current", () => {
    const { planData, ctx, raw } = planDocFor();
    const digest = buildDigestData({
      ctx, planData, hygieneResults: { merged: 0, resolved: [], escalated: [] }, weekKey: "2026-03-09",
      now: NOW, matches: raw.matches, priorities: [], athleteName: raw.profile.name, generatedBy: "manual",
    });
    expect(findUndefinedPaths({ ...digest, parentNote: null, athleteNote: null, notesError: null })).toEqual([]);
    expect(findUndefinedPaths(mergeMemoryUpdate(emptyMemory(), {}, NOW.toISOString()))).toEqual([]);
  });
});
