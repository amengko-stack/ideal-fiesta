import { describe, it, expect } from "vitest";
import {
  buildWeeklyFramework, buildSession, buildWeeklyPlanDoc, readWeeklyPlan,
  blockPhase, clampBlockWeek, progressionGate,
  readMovementQuality, MOVEMENT_QUALITY, MOVEMENT_QUALITY_OPTIONS,
  newProgramState, readProgramState, migrateProgramState, resolveProgramState,
  startNextBlock, calendarWeeksBetween, PROGRAM_STATE_SCHEMA_VERSION, PROGRAM_STATE_DOC,
  mergeSessionAdjustments, clampPlyoVolume, plyometricContacts, workingSetCount,
  sessionProgress, planSessionById, flattenPlanExercises, compareToWeeklyTargets,
  SESSION_TEMPLATES, SUNDAY_RECOVERY, WEEKLY_TARGETS, PLYO_CONTACT_BUDGET,
  BLOCK_LENGTH_WEEKS, WEEKLY_PLAN_SCHEMA_VERSION, OVER_TARGET_TENNIS_MESSAGE,
} from "./weeklyPlanCore.js";
import { isApprovedExercise, BLOCK_SUPPRESSED_EXERCISE_IDS } from "./exerciseDb.js";

const doc = (framework, over = {}) => buildWeeklyPlanDoc({
  weekKey: "2026-03-16", framework, generatedAt: "2026-03-15T09:00:00.000Z", ...over,
});

describe("weekly framework — a normal week", () => {
  const fw = buildWeeklyFramework({ blockWeek: 1 });

  it("creates Session A on Monday and Session B on Thursday", () => {
    expect(fw.sessions.map(s => s.id)).toEqual(["A", "B"]);
    expect(fw.sessions[0].plannedDay).toBe("Monday");
    expect(fw.sessions[0].title).toBe("Strength Foundation + Acceleration + Landing");
    expect(fw.sessions[1].plannedDay).toBe("Thursday");
    expect(fw.sessions[1].title).toBe("Single-Leg Strength + Deceleration/COD + Rotational Power");
    expect(fw.omittedSessions).toEqual([]);
  });

  it("targets 50–60 minutes per session", () => {
    for (const s of fw.sessions) {
      expect(s.durationMin).toBeGreaterThanOrEqual(50);
      expect(s.durationMin).toBeLessThanOrEqual(60);
    }
  });

  it("makes Sunday a complete rest day with no structured training", () => {
    expect(fw.sunday).toEqual(SUNDAY_RECOVERY);
    expect(fw.sunday.type).toBe("recovery");
    expect(fw.sunday.structuredTraining).toBe(false);
    expect(fw.sunday.note).toContain("not training debt");
  });

  it("builds both sessions only from approved, non-suppressed exercises", () => {
    for (const s of fw.sessions) {
      for (const ex of s.exercises) {
        expect(isApprovedExercise(ex.id)).toBe(true);
        expect(BLOCK_SUPPRESSED_EXERCISE_IDS).not.toContain(ex.id);
      }
    }
  });

  it("covers the block's required elements in Session A", () => {
    const ids = fw.sessions[0].exercises.map(e => e.id);
    for (const required of [
      "snap_down", "jump_and_stick", "accel_5m", "goblet_squat", "db_rdl",
      "split_squat", "db_row", "floor_pushup", "calf_raise",
      "pallof_press", "band_external_rot", "serratus_wall_slide",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("covers the block's required elements in Session B", () => {
    const ids = fw.sessions[1].exercises.map(e => e.id);
    for (const required of [
      "mb_side_scoop", "lateral_bound_stick", "decel_stop", "step_up",
      "sl_rdl", "hip_thrust", "sa_row", "floor_pushup",
      "side_plank", "y_raise", "tibialis_raise",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("keeps landing volume inside the contact budget", () => {
    for (const s of fw.sessions) {
      expect(s.plyoContacts).toBeLessThanOrEqual(PLYO_CONTACT_BUDGET.max);
      expect(s.plyoContacts).toBeGreaterThan(0);
    }
  });
});

describe("eight-week block progression", () => {
  const setsFor = (blockWeek) =>
    buildWeeklyFramework({ blockWeek }).sessions.map(s => s.workingSets);

  it("weeks 1 and 2 use the starting volume and two working sets", () => {
    expect(setsFor(1)).toEqual(setsFor(2));
    const a = buildWeeklyFramework({ blockWeek: 1 }).sessions[0];
    expect(a.exercises.find(e => e.id === "goblet_squat").sets).toBe(2);
    expect(a.exercises.find(e => e.id === "db_rdl").sets).toBe(2);
    expect(blockPhase(1).allowThirdSet).toBe(false);
    expect(blockPhase(2).allowThirdSet).toBe(false);
  });

  it("week 3 allows a third set on the key movements", () => {
    const a = buildWeeklyFramework({ blockWeek: 3 }).sessions[0];
    expect(a.exercises.find(e => e.id === "goblet_squat").sets).toBe(3);
    expect(a.exercises.find(e => e.id === "goblet_squat").repRange).toBe("6-8");
    expect(setsFor(3)[0]).toBeGreaterThan(setsFor(1)[0]);
  });

  it("week 4 deloads S&C volume by roughly 20–25%", () => {
    const base = setsFor(1);
    const deload = setsFor(4);
    deload.forEach((sets, i) => {
      const reduction = 1 - sets / base[i];
      expect(reduction).toBeGreaterThanOrEqual(0.20);
      expect(reduction).toBeLessThanOrEqual(0.25);
    });
    expect(blockPhase(4).allowThirdSet).toBe(false);
    expect(blockPhase(4).allowLoadIncrease).toBe(false);
  });

  it("extends the acceleration distance only in the second build phase", () => {
    const accel = (wk) => buildWeeklyFramework({ blockWeek: wk }).sessions[0]
      .exercises.find(e => e.id === "accel_5m");
    expect(accel(1)).toMatchObject({ sets: 4, distanceM: 5 });
    expect(accel(3)).toMatchObject({ sets: 6, distanceM: 5 });
    expect(accel(5)).toMatchObject({ sets: 6, distanceM: 10 });
    // A held progression gate keeps both the set count and the distance back.
    const held = buildWeeklyFramework({ blockWeek: 5, progressionAllowed: false }).sessions[0]
      .exercises.find(e => e.id === "accel_5m");
    expect(held).toMatchObject({ sets: 4, distanceM: 5 });
  });

  it("weeks 5 and 6 build back toward 3 × 6–8 on the main lifts", () => {
    for (const wk of [5, 6]) {
      const a = buildWeeklyFramework({ blockWeek: wk }).sessions[0];
      expect(a.exercises.find(e => e.id === "goblet_squat").sets).toBe(3);
      expect(blockPhase(wk).allowLoadIncrease).toBe(true);
    }
  });

  it("week 7 holds volume and prioritises intent over extra reps", () => {
    expect(setsFor(7)).toEqual(setsFor(6));
    expect(blockPhase(7).intent).toContain("speed and intent over extra repetitions");
  });

  it("week 8 deloads by roughly 30%", () => {
    const base = setsFor(1);
    const deload = setsFor(8);
    deload.forEach((sets, i) => {
      const reduction = 1 - sets / base[i];
      expect(reduction).toBeGreaterThanOrEqual(0.27);
      expect(reduction).toBeLessThanOrEqual(0.33);
    });
  });

  it("never trims warm-up volume on a deload", () => {
    const warmupSets = (wk) => buildWeeklyFramework({ blockWeek: wk }).sessions[0]
      .exercises.filter(e => e.role === "warmup").reduce((sum, e) => sum + e.sets, 0);
    expect(warmupSets(4)).toBe(warmupSets(1));
    expect(warmupSets(8)).toBe(warmupSets(1));
  });

  it("clamps a block week outside 1–8", () => {
    expect(clampBlockWeek(0)).toBe(1);
    expect(clampBlockWeek(99)).toBe(BLOCK_LENGTH_WEEKS);
    expect(clampBlockWeek(null)).toBe(1);
    expect(clampBlockWeek("not a week")).toBe(1);
  });
});

// ─── PROGRAM STATE ───────────────────────────────────────────────────────────
// The block week is DERIVED from the calendar against a persisted block start,
// never incremented off the previous plan. Everything below is a property that
// the old plan-derived model got wrong.
describe("program state — block chronology", () => {
  const NOW = new Date("2026-09-20T09:00:00.000Z");
  // Mondays, one week apart.
  const W1 = "2026-09-21";
  const W2 = "2026-09-28";
  const W3 = "2026-10-05";
  const W8 = "2026-11-09";
  const W9 = "2026-11-16";

  const freshState = () => newProgramState({ blockStartWeekKey: W1, createdAt: NOW.toISOString() });

  it("lives at athletes/{id}/programState/strength", () => {
    expect(PROGRAM_STATE_DOC).toEqual({ collection: "programState", id: "strength" });
    expect(PROGRAM_STATE_SCHEMA_VERSION).toBe(1);
  });

  it("stores the documented shape", () => {
    expect(freshState()).toEqual({
      schemaVersion: 1,
      blockId: "blk-2026-09-21-1",
      blockNumber: 1,
      blockStartWeekKey: W1,
      blockLengthWeeks: 8,
      createdAt: NOW.toISOString(),
      status: "active",
      previousBlockId: null,
      initReason: "new-block",
    });
  });

  it("counts whole calendar weeks between two week keys", () => {
    expect(calendarWeeksBetween(W1, W1)).toBe(0);
    expect(calendarWeeksBetween(W1, W2)).toBe(1);
    expect(calendarWeeksBetween(W1, W8)).toBe(7);
    expect(calendarWeeksBetween(W2, W1)).toBe(-1);
    expect(calendarWeeksBetween("nonsense", W1)).toBeNull();
  });

  it("an initial block is week 1", () => {
    const pos = readProgramState(freshState(), W1);
    expect(pos.blockWeek).toBe(1);
    expect(pos.blockNumber).toBe(1);
    expect(pos.status).toBe("active");
    expect(pos.needsNewBlock).toBe(false);
  });

  it("a second generation in the SAME week stays on the same block week", () => {
    const state = freshState();
    const first = resolveProgramState({ state, currentWeekKey: W1, now: NOW });
    const second = resolveProgramState({ state: first.state, currentWeekKey: W1, now: NOW });
    const third = resolveProgramState({ state: second.state, currentWeekKey: W1, now: NOW });
    expect(first.position.blockWeek).toBe(1);
    expect(second.position.blockWeek).toBe(1);
    expect(third.position.blockWeek).toBe(1);
    // Nothing to persist after the first read — a repeated run is a no-op.
    expect(second.changed).toBe(false);
    expect(third.changed).toBe(false);
    expect(second.state).toEqual(first.state);
  });

  it("the next calendar week advances exactly one block week", () => {
    const state = freshState();
    expect(readProgramState(state, W1).blockWeek).toBe(1);
    expect(readProgramState(state, W2).blockWeek).toBe(2);
    expect(readProgramState(state, W3).blockWeek).toBe(3);
  });

  it("skipping a generation week still lands on the correct later week", () => {
    const state = freshState();
    // Nothing ran for weeks 2-4; week 5's run must say week 5, not week 2.
    expect(readProgramState(state, "2026-10-19").blockWeek).toBe(5);
    expect(readProgramState(state, "2026-11-02").blockWeek).toBe(7);
  });

  it("deleting plans/current does not change the block week", () => {
    const state = freshState();
    const withPlan = resolveProgramState({
      state, previousPlan: { weekKey: W3, block: { week: 3, number: 1 } }, currentWeekKey: W3, now: NOW,
    });
    const planDeleted = resolveProgramState({ state, previousPlan: null, currentWeekKey: W3, now: NOW });
    expect(withPlan.position.blockWeek).toBe(3);
    expect(planDeleted.position.blockWeek).toBe(3);
    expect(planDeleted.changed).toBe(false);
  });

  it("a manual Run-now does not double-advance", () => {
    const state = freshState();
    const runs = [1, 2, 3, 4].map(() => resolveProgramState({ state, currentWeekKey: W2, now: NOW }));
    expect(runs.map(r => r.position.blockWeek)).toEqual([2, 2, 2, 2]);
  });

  it("week 8 never becomes week 9", () => {
    const state = freshState();
    expect(readProgramState(state, W8).blockWeek).toBe(8);
    expect(readProgramState(state, W9).blockWeek).toBe(8);
    expect(readProgramState(state, "2027-01-04").blockWeek).toBe(8);
  });

  it("marks the block completed once the calendar passes week 8 — deterministically", () => {
    const state = freshState();
    const atWeek8 = resolveProgramState({ state, currentWeekKey: W8, now: NOW });
    expect(atWeek8.position.status).toBe("active");
    expect(atWeek8.position.needsNewBlock).toBe(false);
    expect(atWeek8.transition).toBeNull();

    const past = resolveProgramState({ state, currentWeekKey: W9, now: NOW });
    expect(past.position.status).toBe("completed");
    expect(past.position.needsNewBlock).toBe(true);
    expect(past.position.blockWeek).toBe(8);
    expect(past.transition).toBe("completed");
    expect(past.state.status).toBe("completed");
    expect(past.state.completedAt).toBe(NOW.toISOString());
    // Still block 1 — generating a plan never starts the next one.
    expect(past.position.blockNumber).toBe(1);
    expect(past.state.blockId).toBe("blk-2026-09-21-1");

    // And the transition is idempotent.
    const again = resolveProgramState({ state: past.state, currentWeekKey: W9, now: NOW });
    expect(again.transition).toBeNull();
    expect(again.changed).toBe(false);
  });

  it("only an explicit startNextBlock begins block 2", () => {
    const completed = resolveProgramState({ state: freshState(), currentWeekKey: W9, now: NOW }).state;
    const next = startNextBlock(completed, W9, NOW);
    expect(next.blockNumber).toBe(2);
    expect(next.blockStartWeekKey).toBe(W9);
    expect(next.status).toBe("active");
    expect(next.previousBlockId).toBe("blk-2026-09-21-1");
    expect(next.initReason).toBe("next-block");
    expect(readProgramState(next, W9).blockWeek).toBe(1);
    expect(readProgramState(next, "2026-11-23").blockWeek).toBe(2);
  });
});

describe("program state — migration", () => {
  const NOW = new Date("2026-09-20T09:00:00.000Z");
  const W = "2026-09-21";

  it("preserves the intended block week from a schema-v2 plan", () => {
    const state = migrateProgramState({
      previousPlan: { weekKey: "2026-09-14", block: { week: 5, number: 2 } },
      currentWeekKey: W, now: NOW,
    });
    expect(state.initReason).toBe("migrated-from-plan");
    expect(state.blockNumber).toBe(2);
    // Week 5 on the week of 2026-09-14 → the block started four weeks earlier.
    expect(state.blockStartWeekKey).toBe("2026-08-17");
    expect(readProgramState(state, "2026-09-14").blockWeek).toBe(5);
    // And the following week reads as 6, exactly as it should.
    expect(readProgramState(state, W).blockWeek).toBe(6);
  });

  it("starts an explicit week 1 when there is no usable evidence", () => {
    for (const previousPlan of [
      null,
      { legacy: true, weekKey: null },
      { weekKey: null, block: { week: 4 } },
      { weekKey: "2026-09-14", block: null },
      { weekKey: "not-a-date", block: { week: 3 } },
    ]) {
      const state = migrateProgramState({ previousPlan, currentWeekKey: W, now: NOW });
      expect(state.initReason).toBe("initialised-week-1");
      expect(state.blockStartWeekKey).toBe(W);
      expect(readProgramState(state, W).blockWeek).toBe(1);
    }
  });

  it("never infers chronology from a legacy plan", () => {
    const state = migrateProgramState({
      previousPlan: { legacy: true, weekKey: "2026-09-14", block: { week: 7, number: 1 } },
      currentWeekKey: W, now: NOW,
    });
    expect(state.initReason).toBe("initialised-week-1");
    expect(readProgramState(state, W).blockWeek).toBe(1);
  });

  it("resolveProgramState migrates once, then stops writing", () => {
    const first = resolveProgramState({ state: null, previousPlan: null, currentWeekKey: W, now: NOW });
    expect(first.migrated).toBe(true);
    expect(first.changed).toBe(true);
    expect(first.position.blockWeek).toBe(1);

    const second = resolveProgramState({ state: first.state, currentWeekKey: W, now: NOW });
    expect(second.migrated).toBe(false);
    expect(second.changed).toBe(false);
  });

  it("re-migrates rather than crashing on an unusable stored document", () => {
    for (const junk of [{}, { blockStartWeekKey: null }, { blockStartWeekKey: "nope" }, "string", 7]) {
      const r = resolveProgramState({ state: junk, currentWeekKey: W, now: NOW });
      expect(r.migrated).toBe(true);
      expect(r.position.blockWeek).toBe(1);
    }
  });

  it("reports a state dated after the week being planned instead of hiding it", () => {
    const state = newProgramState({ blockStartWeekKey: "2026-10-05", createdAt: NOW.toISOString() });
    const pos = readProgramState(state, "2026-09-21");
    expect(pos.aheadOfBlockStart).toBe(true);
    expect(pos.blockWeek).toBe(1);
  });
});

describe("block identity reaches the plan document", () => {
  it("carries the block id, start week and status through to plans/current", () => {
    const fw = buildWeeklyFramework({
      blockWeek: 8, blockNumber: 2, blockId: "blk-2026-08-17-2",
      blockStartWeekKey: "2026-08-17", blockStatus: "completed", needsNewBlock: true,
    });
    const d = doc(fw);
    expect(d.block).toMatchObject({
      id: "blk-2026-08-17-2",
      number: 2,
      week: 8,
      startWeekKey: "2026-08-17",
      status: "completed",
      needsNewBlock: true,
      lengthWeeks: 8,
    });
  });

  it("defaults to an active block with no id when nothing is passed", () => {
    const d = doc(buildWeeklyFramework({ blockWeek: 1 }));
    expect(d.block.id).toBeNull();
    expect(d.block.status).toBe("active");
    expect(d.block.needsNewBlock).toBe(false);
  });
});

describe("progressionGate — movement quality over rep count", () => {
  it("opens for a clean, completed, manageable session rated good", () => {
    const gate = progressionGate({
      lastSession: {
        movementQuality: "good",
        exercises: [{ completed: true, difficulty: 3 }, { completed: true, difficulty: 4 }],
      },
    });
    expect(gate).toEqual({
      allowed: true,
      reasons: [],
      notes: [],
      movementQuality: "good",
      movementQualityConcern: false,
      regressionAllowed: false,
    });
  });

  it("holds when pain or an open injury is on record", () => {
    const gate = progressionGate({ painReported: true });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain("pain, discomfort or an open injury is on record");
  });

  it("holds when the prescribed reps were not completed", () => {
    const gate = progressionGate({
      lastSession: { exercises: [{ completed: true, difficulty: 3 }, { completed: false, difficulty: 3 }] },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain("prescribed reps were not completed last session");
  });

  it("holds when the last session was rated maximally hard", () => {
    const gate = progressionGate({
      lastSession: { exercises: [{ completed: true, difficulty: 5 }] },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain("last session was rated maximally hard");
  });

  it("holds when movement quality was flagged by the caller", () => {
    expect(progressionGate({ movementQualityConcern: true }).allowed).toBe(false);
  });

  it("holds on a session-level pain note", () => {
    const gate = progressionGate({
      lastSession: { exercises: [{ completed: true, difficulty: 2 }], painNote: "right knee tight" },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain("last session carried a pain note");
  });

  // ── THE MOVEMENT-QUALITY SIGNAL ──────────────────────────────────────────
  // The design always said technique controls progression. These are the tests
  // that make that true of the code rather than of the comment.
  describe("movement quality drives the gate", () => {
    const clean = [{ completed: true, difficulty: 3 }];

    it("good technique may progress when every other gate permits", () => {
      const gate = progressionGate({ lastSession: { movementQuality: "good", exercises: clean } });
      expect(gate.allowed).toBe(true);
      expect(gate.movementQuality).toBe("good");
      expect(gate.movementQualityConcern).toBe(false);
      expect(gate.regressionAllowed).toBe(false);
    });

    it("mixed technique HOLDS progression without authorising a step back", () => {
      const gate = progressionGate({ lastSession: { movementQuality: "mixed", exercises: clean } });
      expect(gate.allowed).toBe(false);
      expect(gate.reasons).toContain("some reps lost quality last session — hold the prescription, do not add load");
      expect(gate.movementQualityConcern).toBe(false);
      expect(gate.regressionAllowed).toBe(false);
    });

    it("poor technique BLOCKS progression and authorises a regression", () => {
      const gate = progressionGate({ lastSession: { movementQuality: "poor", exercises: clean } });
      expect(gate.allowed).toBe(false);
      expect(gate.movementQualityConcern).toBe(true);
      expect(gate.regressionAllowed).toBe(true);
      expect(gate.reasons).toContain("movement quality was flagged");
    });

    it("pain holds progression regardless of the movement-quality rating", () => {
      for (const q of ["good", "mixed", "poor"]) {
        const byInjury = progressionGate({ lastSession: { movementQuality: q, exercises: clean }, painReported: true });
        expect(byInjury.allowed).toBe(false);
        expect(byInjury.reasons).toContain("pain, discomfort or an open injury is on record");

        const byNote = progressionGate({ lastSession: { movementQuality: q, exercises: clean, painNote: "left ankle" } });
        expect(byNote.allowed).toBe(false);
        expect(byNote.reasons).toContain("last session carried a pain note");
      }
    });

    it("difficulty alone never stands in for technique", () => {
      // An easy session is not a well-executed one, and vice versa.
      const easyUnrated = progressionGate({ lastSession: { exercises: [{ completed: true, difficulty: 1 }] } });
      expect(easyUnrated.movementQuality).toBe("unknown");
      const hardButClean = progressionGate({ lastSession: { movementQuality: "good", exercises: [{ completed: true, difficulty: 4 }] } });
      expect(hardButClean.movementQuality).toBe("good");
    });

    describe("historical sessions with no rating", () => {
      const historical = { date: "2026-05-01", exercises: clean };

      it("still load, and read as unknown rather than good", () => {
        expect(readMovementQuality(historical)).toBe("unknown");
        expect(readMovementQuality({})).toBe("unknown");
        expect(readMovementQuality(null)).toBe("unknown");
        expect(readMovementQuality({ movementQuality: "excellent" })).toBe("unknown");
      });

      it("do not corrupt progression — unknown holds nothing by itself", () => {
        const gate = progressionGate({ lastSession: historical });
        expect(gate.allowed).toBe(true);
        expect(gate.movementQualityConcern).toBe(false);
      });

      it("but say so explicitly, so nobody reads silence as approval", () => {
        const gate = progressionGate({ lastSession: historical });
        expect(gate.movementQuality).toBe("unknown");
        expect(gate.notes).toContain("movement quality was not rated last session — do not assume technique was clean");
      });
    });

    it("exposes the three choices a human is actually offered", () => {
      expect(MOVEMENT_QUALITY_OPTIONS.map(o => o.value))
        .toEqual([MOVEMENT_QUALITY.GOOD, MOVEMENT_QUALITY.MIXED, MOVEMENT_QUALITY.POOR]);
      // "unknown" is a read result, never something anyone can pick.
      expect(MOVEMENT_QUALITY_OPTIONS.map(o => o.value)).not.toContain(MOVEMENT_QUALITY.UNKNOWN);
      expect(MOVEMENT_QUALITY.UNKNOWN).toBe("unknown");
    });
  });

  it("a held gate withholds the third set even in a build week", () => {
    const held = buildWeeklyFramework({ blockWeek: 3, progressionAllowed: false });
    expect(held.allowThirdSet).toBe(false);
    expect(held.sessions[0].exercises.find(e => e.id === "goblet_squat").sets).toBe(2);
  });
});

describe("tournament weeks", () => {
  const fw = buildWeeklyFramework({ blockWeek: 3, tournamentMode: "week_of" });

  it("schedules one shortened maintenance session and leaves the second as recovery", () => {
    expect(fw.sessions).toHaveLength(1);
    expect(fw.sessions[0].id).toBe("A");
    expect(fw.sessions[0].sessionType).toBe("maintenance");
    expect(fw.sessions[0].durationMin).toBeGreaterThanOrEqual(30);
    expect(fw.sessions[0].durationMin).toBeLessThanOrEqual(40);
    expect(fw.omittedSessions.map(s => s.id)).toEqual(["B"]);
    expect(fw.omittedSessions[0].sessionType).toBe("recovery");
  });

  it("drops the hard plyometrics and the demanding change-of-direction work", () => {
    expect(fw.sessions[0].plyoContacts).toBe(0);
    expect(fw.sessions[0].exercises.some(e => e.role === "landing")).toBe(false);
    expect(fw.sessions[0].exercises.some(e => e.role === "speed")).toBe(false);
  });

  it("keeps trunk and shoulder/scapular maintenance work", () => {
    const ids = fw.sessions[0].exercises.map(e => e.id);
    expect(ids).toContain("pallof_press");
    expect(ids).toContain("band_external_rot");
    expect(ids).toContain("serratus_wall_slide");
  });

  it("cuts lower-body volume relative to a normal week", () => {
    const normal = buildWeeklyFramework({ blockWeek: 3 });
    expect(fw.sessions[0].workingSets).toBeLessThan(normal.sessions[0].workingSets);
  });

  it("keeps two sessions on a pre-tournament week, both reduced", () => {
    const pre = buildWeeklyFramework({ blockWeek: 3, tournamentMode: "pre" });
    expect(pre.sessions.map(s => s.id)).toEqual(["A", "B"]);
    expect(pre.sessions.every(s => s.sessionType === "reduced")).toBe(true);
    expect(pre.sessions[0].workingSets).toBeLessThan(buildWeeklyFramework({ blockWeek: 3 }).sessions[0].workingSets);
  });
});

describe("growth-watch weeks", () => {
  it("tightens the landing cap and the load increment without banning anything", () => {
    const watch = buildWeeklyFramework({ blockWeek: 5, growthWatch: true });
    const normal = buildWeeklyFramework({ blockWeek: 5 });
    expect(watch.sessions[0].plyoContactCap).toBe(PLYO_CONTACT_BUDGET.growthWatchMax);
    expect(normal.sessions[0].plyoContactCap).toBe(PLYO_CONTACT_BUDGET.max);
    expect(watch.maxLoadIncrementPct).toBe(5);
    expect(watch.sessions[0].exercises.some(e => e.role === "landing")).toBe(true);
    expect(watch.sessions[0].plyoContacts).toBeLessThanOrEqual(PLYO_CONTACT_BUDGET.growthWatchMax);
  });
});

describe("mergeSessionAdjustments — the model's room to move", () => {
  const session = buildSession("A", { blockWeek: 3 });

  it("lets the model reduce sets and reps", () => {
    const merged = mergeSessionAdjustments(session, [
      { id: "goblet_squat", sets: 2, reps: 6 },
    ]);
    const goblet = merged.exercises.find(e => e.id === "goblet_squat");
    expect(goblet.sets).toBe(2);
    expect(goblet.reps).toBe(6);
  });

  it("refuses to raise sets or reps above the framework", () => {
    const merged = mergeSessionAdjustments(session, [
      { id: "goblet_squat", sets: 6, reps: 20 },
    ]);
    const goblet = merged.exercises.find(e => e.id === "goblet_squat");
    expect(goblet.sets).toBe(3);
    expect(goblet.reps).toBe(8);
  });

  it("allows a declared regression or progression swap", () => {
    const merged = mergeSessionAdjustments(session, [
      { id: "split_squat", variant: "reverse_lunge" },
      { id: "floor_pushup", variant: "incline_pushup" },
    ]);
    expect(merged.exercises.find(e => e.swappedFrom === "Split Squat").name).toBe("Reverse Lunge");
    expect(merged.exercises.find(e => e.swappedFrom === "Floor Push Up").name).toBe("Incline Push Up");
  });

  it("refuses an undeclared or suppressed swap", () => {
    const merged = mergeSessionAdjustments(session, [
      { id: "goblet_squat", variant: "depth_jump" },
      { id: "db_rdl", variant: "kb_swing" },
      { id: "db_row", variant: "totally_invented" },
    ]);
    expect(merged.exercises.find(e => e.id === "goblet_squat").name).toBe("Goblet Squat");
    expect(merged.exercises.find(e => e.id === "db_rdl").name).toBe("Dumbbell Romanian Deadlift");
    expect(merged.exercises.find(e => e.id === "db_row").name).toBe("Dumbbell Row");
  });

  it("ignores an exercise the framework does not contain", () => {
    const merged = mergeSessionAdjustments(session, [{ id: "depth_jump", sets: 3, reps: 5 }]);
    expect(merged.exercises).toHaveLength(session.exercises.length);
    expect(merged.exercises.map(e => e.id)).not.toContain("depth_jump");
  });

  it("carries notes, load notes and the tennis connection through", () => {
    const merged = mergeSessionAdjustments(session, [
      { id: "step_up", note: "n/a" },
      { id: "goblet_squat", loadNote: "+5%", note: "clean last week", tennisConnection: "Lateral power" },
    ]);
    const goblet = merged.exercises.find(e => e.id === "goblet_squat");
    expect(goblet.loadNote).toBe("+5%");
    expect(goblet.note).toBe("clean last week");
    expect(goblet.tennisConnection).toBe("Lateral power");
  });
});

describe("clampPlyoVolume", () => {
  it("trims landing sets until the session is inside its cap", () => {
    const greedy = [
      { id: "snap_down", sets: 6, reps: 5, contactsPerRep: 1, minSets: 1 },
      { id: "jump_and_stick", sets: 6, reps: 4, contactsPerRep: 1, minSets: 1 },
    ];
    expect(plyometricContacts(greedy)).toBe(54);
    const clamped = clampPlyoVolume(greedy, 20);
    expect(plyometricContacts(clamped)).toBeLessThanOrEqual(20);
  });

  it("counts per-side reps twice", () => {
    expect(plyometricContacts([
      { sets: 2, reps: 4, contactsPerRep: 1, perSide: true },
    ])).toBe(16);
  });

  it("leaves a compliant session untouched", () => {
    const fine = [{ id: "snap_down", sets: 2, reps: 5, contactsPerRep: 1, minSets: 1 }];
    expect(clampPlyoVolume(fine, 30)).toEqual(fine);
  });
});

describe("weekly plan document + compatibility reader", () => {
  const fw = buildWeeklyFramework({ blockWeek: 2, blockNumber: 1 });

  it("writes schema v2 with the documented shape", () => {
    const d = doc(fw, {
      growthContext: { velocityCmYr: 9, intervalDays: 183, growthWatch: true, sufficientInterval: true },
    });
    expect(d.schemaVersion).toBe(WEEKLY_PLAN_SCHEMA_VERSION);
    expect(d.weekKey).toBe("2026-03-16");
    expect(d.generatedBy).toBe("weeklyReview");
    expect(d.growthContext).toEqual({
      recentGrowthVelocityCmYr: 9, intervalDays: 183, growthWatch: true, sufficientInterval: true,
    });
    expect(d.weeklyTargets.tennisHoursMin).toBe(WEEKLY_TARGETS.tennisHoursMin);
    expect(d.weeklyTargets.tennisHoursMax).toBe(WEEKLY_TARGETS.tennisHoursMax);
    expect(d.weeklyTargets.strengthSessions).toBe(2);
    expect(d.weeklyTargets.completeRestDays).toBe(1);
    expect(d.sunday).toEqual(SUNDAY_RECOVERY);
    expect(d.tournamentMode).toBe("normal");
  });

  it("gives each session an independent done map and logged flag", () => {
    const d = doc(fw);
    expect(d.sessions).toHaveLength(2);
    for (const s of d.sessions) {
      expect(s.doneMap).toEqual({});
      expect(s.sessionLogged).toBe(false);
      expect(s.difficulty).toBeNull();
    }
  });

  it("completing Session A does not complete Session B", () => {
    const d = doc(fw);
    const a = d.sessions[0];
    const finished = {
      ...d,
      sessions: d.sessions.map(s => s.id === "A"
        ? { ...s, sessionLogged: true, doneMap: Object.fromEntries(s.exercises.map(e => [e.id, true])) }
        : s),
    };
    const read = readWeeklyPlan(finished);
    expect(sessionProgress(planSessionById(read, "A")).complete).toBe(true);
    expect(planSessionById(read, "A").sessionLogged).toBe(true);
    expect(sessionProgress(planSessionById(read, "B")).complete).toBe(false);
    expect(planSessionById(read, "B").sessionLogged).toBe(false);
    expect(a.exercises.length).toBeGreaterThan(0);
  });

  it("a missed Session B never moves to Sunday or becomes a make-up session", () => {
    const d = doc(fw);
    const missedB = {
      ...d,
      sessions: d.sessions.map(s => s.id === "A" ? { ...s, sessionLogged: true } : s),
    };
    const read = readWeeklyPlan(missedB);
    expect(read.sunday.type).toBe("recovery");
    expect(read.sunday.structuredTraining).toBe(false);
    // Sunday carries no exercises and no session id of its own.
    expect(read.sunday.exercises).toBeUndefined();
    expect(read.sessions.map(s => s.plannedDay)).not.toContain("Sunday");
  });

  it("reads a legacy single-session plan as a one-session week", () => {
    const legacy = {
      plan: [{ id: "goblet_squat", name: "Goblet Squat", sets: 3, reps: 10 }, { id: "plank", name: "Plank Hold", sets: 3, reps: 30 }],
      doneMap: { goblet_squat: true },
      sessionLogged: false,
      sessionType: "reduced",
      sessionDuration: 45,
      briefing: "Old plan.",
      coachNote: "Keep it light.",
      metrics: { acwr: 1.1 },
      generatedAt: "2026-02-01T00:00:00.000Z",
    };
    const read = readWeeklyPlan(legacy);
    expect(read.legacy).toBe(true);
    expect(read.schemaVersion).toBe(WEEKLY_PLAN_SCHEMA_VERSION);
    expect(read.sessions).toHaveLength(1);
    expect(read.sessions[0].exercises).toHaveLength(2);
    expect(read.sessions[0].doneMap).toEqual({ goblet_squat: true });
    expect(read.sessions[0].sessionLogged).toBe(false);
    expect(read.briefing).toBe("Old plan.");
    expect(read.metrics).toEqual({ acwr: 1.1 });
    expect(read.sunday).toEqual(SUNDAY_RECOVERY);
    expect(sessionProgress(read.sessions[0])).toEqual({ done: 1, total: 2, pct: 50, complete: false });
  });

  it("returns null for no plan and never throws on a malformed one", () => {
    expect(readWeeklyPlan(null)).toBeNull();
    expect(readWeeklyPlan(undefined)).toBeNull();
    expect(() => readWeeklyPlan({})).not.toThrow();
    expect(readWeeklyPlan({}).sessions[0].exercises).toEqual([]);
  });

  it("flattens scheduled sessions for the classic screens, skipping recovery", () => {
    const tournamentDoc = doc(buildWeeklyFramework({ blockWeek: 3, tournamentMode: "week_of" }));
    const flat = flattenPlanExercises(readWeeklyPlan(tournamentDoc));
    expect(flat.length).toBeGreaterThan(0);
    expect(new Set(flat.map(e => e.sessionId))).toEqual(new Set(["A"]));
    expect(flat.every(e => e.plannedDay === "Monday")).toBe(true);
  });
});

describe("compareToWeeklyTargets", () => {
  const summary = {
    onCourtHours: 14.5, strengthSessions: 2, crossTrainingMinutes: 40, restDays: 1,
  };

  it("reports target vs actual without grading the athlete", () => {
    const cmp = compareToWeeklyTargets(summary);
    expect(cmp.tennis.targetLabel).toBe("11.5–12.5 h");
    expect(cmp.tennis.actualLabel).toBe("14.5 h");
    expect(cmp.tennis.status).toBe("over");
    expect(cmp.strength.status).toBe("within");
    expect(cmp.crossTraining.status).toBe("within");
    expect(cmp.restDays.status).toBe("within");
    expect(JSON.stringify(cmp)).not.toMatch(/fail|bad|too much|excessive/i);
  });

  it("suggests replacing court volume rather than adding S&C when over target", () => {
    expect(compareToWeeklyTargets(summary).tennisOverTargetMessage).toBe(OVER_TARGET_TENNIS_MESSAGE);
    expect(OVER_TARGET_TENNIS_MESSAGE).toContain("replacing court volume rather than adding S&C");
  });

  it("carries no over-target message on a week inside the band", () => {
    expect(compareToWeeklyTargets({ ...summary, onCourtHours: 12 }).tennisOverTargetMessage).toBeNull();
  });

  it("marks a week below target as under, without telling anyone to train more", () => {
    const cmp = compareToWeeklyTargets({ ...summary, onCourtHours: 6, restDays: 0 });
    expect(cmp.tennis.status).toBe("under");
    expect(cmp.restDays.status).toBe("under");
    expect(cmp.tennisOverTargetMessage).toBeNull();
  });

  it("returns null with no summary", () => {
    expect(compareToWeeklyTargets(null)).toBeNull();
  });
});

describe("session templates", () => {
  it("expose exactly the two sessions the block defines", () => {
    expect(Object.keys(SESSION_TEMPLATES)).toEqual(["A", "B"]);
  });

  it("count working sets excluding the warm-up", () => {
    const s = buildSession("A", { blockWeek: 1 });
    const warmup = s.exercises.filter(e => e.role === "warmup").reduce((sum, e) => sum + e.sets, 0);
    const all = s.exercises.reduce((sum, e) => sum + e.sets, 0);
    expect(workingSetCount(s.exercises)).toBe(all - warmup);
  });

  it("return null for an unknown session id", () => {
    expect(buildSession("Z", {})).toBeNull();
  });
});
