import { describe, it, expect } from "vitest";
import {
  buildWeeklyFramework, buildSession, buildWeeklyPlanDoc, readWeeklyPlan,
  advanceBlockWeek, blockPhase, clampBlockWeek, progressionGate,
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

describe("advanceBlockWeek — earned, not automatic", () => {
  it("starts a fresh block at week 1", () => {
    expect(advanceBlockWeek(null)).toEqual({ blockWeek: 1, blockNumber: 1 });
  });

  it("advances when at least one session was logged", () => {
    expect(advanceBlockWeek({
      blockWeek: 3, blockNumber: 1,
      sessions: [{ id: "A", sessionLogged: true }, { id: "B", sessionLogged: false }],
    })).toEqual({ blockWeek: 4, blockNumber: 1 });
  });

  it("holds the block week when nothing was logged — a calendar week is not progress", () => {
    expect(advanceBlockWeek({
      blockWeek: 3, blockNumber: 1,
      sessions: [{ id: "A", sessionLogged: false }, { id: "B", sessionLogged: false }],
    })).toEqual({ blockWeek: 3, blockNumber: 1 });
  });

  it("rolls into the next block after week 8", () => {
    expect(advanceBlockWeek({
      blockWeek: 8, blockNumber: 1, sessions: [{ id: "A", sessionLogged: true }],
    })).toEqual({ blockWeek: 1, blockNumber: 2 });
  });
});

describe("progressionGate — movement quality over rep count", () => {
  it("opens for a clean, completed, manageable session", () => {
    const gate = progressionGate({
      lastSession: { exercises: [{ completed: true, difficulty: 3 }, { completed: true, difficulty: 4 }] },
    });
    expect(gate).toEqual({ allowed: true, reasons: [] });
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

  it("holds when movement quality was flagged", () => {
    expect(progressionGate({ movementQualityConcern: true }).allowed).toBe(false);
  });

  it("holds on a session-level pain note", () => {
    const gate = progressionGate({
      lastSession: { exercises: [{ completed: true, difficulty: 2 }], painNote: "right knee tight" },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain("last session carried a pain note");
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
