import { findExercise, isApprovedExercise, BLOCK_SUPPRESSED_EXERCISE_IDS } from "./exerciseDb.js";

// ─── WEEKLY S&C FRAMEWORK — PURE CORE ────────────────────────────────────────
// The deterministic half of "deterministic framework + AI adjustment".
//
// This module owns everything the model is NOT allowed to decide: which two
// sessions exist and what they are for, which exercise families each block
// contains, the starting and ceiling volumes, the eight-week progression
// shape, the landing-contact budget, and what a tournament week or a
// growth-watch week does to all of the above. planGenCore.js renders it into a
// prompt; toWeeklyPlanData folds the model's choices back in, clamped to these
// limits. Nothing here touches Firestore, the clock or the network.
//
// What the model MAY decide, inside these bounds: regression vs progression,
// 2 vs 3 sets where the block allows a third, holding or reducing load,
// simplifying the acceleration/deceleration work, cutting Session B back for
// competition or recovery, and which approved variant best fits right now.

export const WEEKLY_PLAN_SCHEMA_VERSION = 2;

// ── Weekly coaching target ───────────────────────────────────────────────────
// A development target for the current phase, not a medical ceiling and not a
// pass/fail line. Exceeding it is information for the parent, never a failure
// grade, and the app never edits logged tennis sessions to make the week fit.
export const WEEKLY_TARGETS = {
  tennisHoursMin: 11.5,
  tennisHoursMax: 12.5,
  strengthSessions: 2,
  strengthSessionMinutesMin: 45,
  strengthSessionMinutesMax: 60,
  swimSessions: 1,
  swimMinutesMin: 30,
  swimMinutesMax: 45,
  yogaSessions: 1,
  completeRestDays: 1,
};

export const OVER_TARGET_TENNIS_MESSAGE =
  "Current tennis volume is above the present developmental target; consider replacing court volume rather than adding S&C.";

// ── Landing / plyometric budget ──────────────────────────────────────────────
// Purposeful ground contacts per session. The objective is quality, not
// exhaustion — and a low workload number is never a reason to spend more of
// this budget, which is why the cap is a ceiling the model can only move down.
export const PLYO_CONTACT_BUDGET = { min: 20, max: 30, growthWatchMax: 20 };

// ── Effort target ────────────────────────────────────────────────────────────
export const EFFORT_TARGET = {
  rpeMin: 6,
  rpeMax: 7,
  repsInReserveMin: 2,
  repsInReserveMax: 3,
  loadIncrementPctMin: 5,
  loadIncrementPctMax: 10,
  growthWatchLoadIncrementPctMax: 5,
};

// ── Equipment ────────────────────────────────────────────────────────────────
// What this block uses. Youth resistance training is appropriate with good
// technique and supervision; the restriction here is about THIS block being
// submaximal and technique-led, not a claim that a barbell is unsafe for a
// twelve-year-old.
export const BLOCK_EQUIPMENT = [
  "bodyweight", "dumbbells", "kettlebells", "bands", "medicine balls", "cables",
];

export const YOUTH_STRENGTH_STATEMENT =
  "Youth resistance training is appropriate when technique and supervision are good. For the current block, use submaximal loads, technique-driven progression and no maximal lifting. Exercise selection and load should reflect training age, current growth, total weekly workload and movement competency.";

export const NEUROMUSCULAR_STATEMENT =
  "Include lower-limb strength, single-leg control, landing mechanics and deceleration/COD technique as part of general neuromuscular development and knee-injury-risk reduction.";

// ── Session templates ────────────────────────────────────────────────────────
// Each entry:
//   key            exerciseDb id it must resolve to
//   role           warmup | landing | speed | power | strength | core
//   sets/reps      the STARTING prescription (weeks 1–2)
//   targetSets     the ceiling a competent, pain-free athlete may reach
//   targetReps     the rep range at that ceiling
//   perSide        reps are per side (doubles the contact count)
//   unit           reps | sec | m
//   minSets        never trimmed below this, even on a deload
//   trimPriority   lower is trimmed FIRST on a deload (impact volume goes
//                  before the strength pattern the block is built on)
//   contactsPerRep landing contacts each rep costs, for the plyo budget
//   regressions/progressions  approved swaps the model may choose between
const A_WARMUP = [
  { key: "easy_skip",         role: "warmup", sets: 1, reps: 60, unit: "sec", cue: "Easy, relaxed — raise temperature only" },
  { key: "ankle_rock",        role: "warmup", sets: 1, reps: 8, perSide: true, cue: "Knee tracks over the middle toes" },
  { key: "squat_to_stand",    role: "warmup", sets: 1, reps: 6, cue: "Chest tall out of the bottom" },
  { key: "walking_lunge_rot", role: "warmup", sets: 1, reps: 5, perSide: true, cue: "Rotate over the front leg, ribs down" },
  { key: "a_march",           role: "warmup", sets: 2, reps: 10, unit: "m", cue: "Tall posture, dorsiflexed foot" },
  { key: "lateral_shuffle",   role: "warmup", sets: 2, reps: 10, unit: "m", cue: "Low hips, feet never cross" },
  { key: "band_pull_apart",   role: "warmup", sets: 1, reps: 12, cue: "Shoulder blades set, no shrug" },
];

const B_WARMUP = [
  { key: "easy_skip",       role: "warmup", sets: 1, reps: 60, unit: "sec", cue: "Easy, relaxed" },
  { key: "ankle_rock",      role: "warmup", sets: 1, reps: 8, perSide: true, cue: "Heel stays down" },
  { key: "reverse_lunge",   role: "warmup", sets: 1, reps: 5, perSide: true, cue: "Step back under control" },
  { key: "lateral_squat",   role: "warmup", sets: 1, reps: 5, perSide: true, cue: "Sit into the bent hip, trail leg straight" },
  { key: "a_skip",          role: "warmup", sets: 2, reps: 10, unit: "m", cue: "Rhythm before speed" },
  { key: "lateral_shuffle", role: "warmup", sets: 2, reps: 10, unit: "m", cue: "Push the ground away sideways" },
  { key: "band_pull_apart", role: "warmup", sets: 1, reps: 12, cue: "Scapular and cuff activation" },
];

export const SESSION_TEMPLATES = {
  A: {
    id: "A",
    plannedDay: "Monday",
    title: "Strength Foundation + Acceleration + Landing",
    purpose: "Build the bilateral strength base, teach quiet controlled landings, and expose short high-quality acceleration.",
    durationMin: 55,
    exercises: [
      ...A_WARMUP,
      { key: "snap_down", role: "landing", sets: 2, reps: 5, minSets: 1, trimPriority: 1, contactsPerRep: 1,
        cue: "Land quiet, hips back, knees over the middle toes — no valgus collapse" },
      { key: "jump_and_stick", role: "landing", sets: 2, reps: 4, minSets: 1, trimPriority: 1, contactsPerRep: 1,
        cue: "Stick and hold two seconds before the next rep" },
      { key: "accel_5m", role: "speed", sets: 4, reps: 1, unit: "m", distanceM: 5, restSeconds: 55,
        targetSets: 6, targetDistanceM: 10, targetFromBlockWeek: 5, minSets: 2, trimPriority: 2,
        cue: "Speed work, not conditioning — full recovery, stop the set the moment quality drops" },
      { key: "goblet_squat", role: "strength", sets: 2, reps: 8, targetSets: 3, targetReps: "6-8", minSets: 1, trimPriority: 5,
        regressions: ["wall_squat"], cue: "Submaximal — leave 2–3 good reps in reserve" },
      { key: "db_rdl", role: "strength", sets: 2, reps: 8, targetSets: 3, targetReps: "6-8", minSets: 1, trimPriority: 5,
        regressions: ["hip_hinge"], cue: "Hinge, long spine, hamstrings loaded" },
      { key: "split_squat", role: "strength", sets: 2, reps: 6, perSide: true, targetSets: 3, targetReps: "6-8", minSets: 1, trimPriority: 5,
        regressions: ["reverse_lunge"], progressions: ["bulgarian_split"], cue: "Front knee stable, torso tall" },
      { key: "db_row", role: "strength", sets: 2, reps: 10, targetSets: 3, targetReps: "8-10", minSets: 1, trimPriority: 4,
        cue: "Row to the ribs, no trunk swing" },
      { key: "floor_pushup", role: "strength", sets: 2, reps: 8, targetReps: "6-10", minSets: 1, trimPriority: 4,
        regressions: ["incline_pushup"], cue: "Incline version is fine — full range beats floor reps" },
      { key: "calf_raise", role: "strength", sets: 2, reps: 12, targetReps: "10-12", minSets: 1, trimPriority: 3,
        cue: "Slow controlled lowering" },
      { key: "pallof_press", role: "core", sets: 2, reps: 8, perSide: true, minSets: 1, trimPriority: 3,
        cue: "Resist rotation — ribs stay down" },
      { key: "band_external_rot", role: "core", sets: 2, reps: 12, perSide: true, targetReps: "10-12", minSets: 1, trimPriority: 3,
        cue: "Elbow pinned, slow return" },
      { key: "serratus_wall_slide", role: "core", sets: 2, reps: 8, minSets: 1, trimPriority: 3,
        cue: "Reach long at the top" },
    ],
  },
  B: {
    id: "B",
    plannedDay: "Thursday",
    title: "Single-Leg Strength + Deceleration/COD + Rotational Power",
    purpose: "Single-leg strength and control, rotational power transfer, and braking mechanics before any reactive change of direction.",
    durationMin: 55,
    exercises: [
      ...B_WARMUP,
      { key: "mb_side_scoop", role: "power", sets: 2, reps: 4, perSide: true, minSets: 1, trimPriority: 2,
        loadKg: "1–2 kg", cue: "Both directions, full-quality recovery — intent, not fatigue" },
      { key: "lateral_bound_stick", role: "landing", sets: 2, reps: 4, perSide: true, minSets: 1, trimPriority: 1, contactsPerRep: 1,
        cue: "Distance is secondary to sticking the landing" },
      { key: "decel_stop", role: "speed", sets: 4, reps: 1, unit: "m", distanceM: 5, restSeconds: 55,
        progressions: ["cod_cue_stop"], minSets: 2, trimPriority: 2,
        cue: "Accelerate 5 m, stop over 2–3 controlled steps — no chaotic reactive COD in this block" },
      { key: "step_up", role: "strength", sets: 2, reps: 8, perSide: true, targetSets: 3, targetReps: "6-8", minSets: 1, trimPriority: 5,
        cue: "Drive through the whole foot, no push-off from the trailing leg" },
      { key: "sl_rdl", role: "strength", sets: 2, reps: 6, perSide: true, targetSets: 3, targetReps: "6-8", minSets: 1, trimPriority: 5,
        cue: "Hips square, slow down and up" },
      { key: "hip_thrust", role: "strength", sets: 2, reps: 10, targetSets: 3, targetReps: "8-10", minSets: 1, trimPriority: 5,
        regressions: ["bridge"], cue: "Ribs down, finish with the glutes not the low back" },
      { key: "sa_row", role: "strength", sets: 2, reps: 8, perSide: true, minSets: 1, trimPriority: 4,
        cue: "Trunk still — this is an anti-rotation drill too" },
      { key: "floor_pushup", role: "strength", sets: 2, reps: 8, minSets: 1, trimPriority: 4,
        regressions: ["incline_pushup"], cue: "Incline version allowed" },
      { key: "side_plank", role: "core", sets: 2, reps: 25, perSide: true, unit: "sec", targetReps: "20-30", minSets: 1, trimPriority: 3,
        cue: "Straight line from ear to ankle" },
      { key: "y_raise", role: "core", sets: 2, reps: 8, minSets: 1, trimPriority: 3,
        cue: "Thumbs up, lower traps do the work" },
      { key: "tibialis_raise", role: "core", sets: 2, reps: 12, targetReps: "10-12", minSets: 1, trimPriority: 3,
        cue: "Controlled lowering — shin strength for braking" },
    ],
  },
};

export const SESSION_IDS = ["A", "B"];

// Sunday is the default complete structured-training rest day. A missed A or B
// is NOT moved here and no make-up session is generated: missed work is not
// training debt.
export const SUNDAY_RECOVERY = {
  type: "recovery",
  structuredTraining: false,
  note: "Complete structured-training rest day. No make-up session — a missed Session A or B is not training debt.",
};

// ─── EIGHT-WEEK BLOCK ────────────────────────────────────────────────────────
// Calendar position only. It says which shape the week has; it never by itself
// authorises heavier work — that is what progressionGate() decides.
export const BLOCK_LENGTH_WEEKS = 8;

const BLOCK_PHASES = {
  1: { phase: "learn",       volumeMultiplier: 1.00, allowThirdSet: false, allowLoadIncrease: false,
       intent: "Learn the patterns. Two working sets, conservative resistance, basic landing, planned deceleration, low plyometric volume." },
  2: { phase: "learn",       volumeMultiplier: 1.00, allowThirdSet: false, allowLoadIncrease: false,
       intent: "Same shape as week 1. Consolidate technique before adding anything." },
  3: { phase: "build",       volumeMultiplier: 1.00, allowThirdSet: true,  allowLoadIncrease: true,
       intent: "Build. A third set is allowed on key movements only where technique is clearly competent." },
  4: { phase: "deload",      volumeMultiplier: 0.775, allowThirdSet: false, allowLoadIncrease: false,
       intent: "Consolidation / deload — roughly 20–25% less S&C volume. Hold loads, keep quality high." },
  5: { phase: "build",       volumeMultiplier: 1.00, allowThirdSet: true,  allowLoadIncrease: true,
       intent: "Build. Main strength work may progress toward 3 × 6–8 with a modest load increase." },
  6: { phase: "build",       volumeMultiplier: 1.00, allowThirdSet: true,  allowLoadIncrease: true,
       intent: "Build. Slightly more advanced landing and deceleration where quality allows." },
  7: { phase: "quality",     volumeMultiplier: 1.00, allowThirdSet: true,  allowLoadIncrease: true,
       intent: "Quality week. Hold volume, small resistance increase where justified, prioritise speed and intent over extra repetitions." },
  8: { phase: "reassess",    volumeMultiplier: 0.70, allowThirdSet: false, allowLoadIncrease: false,
       intent: "Consolidate and reassess — roughly 30% less S&C volume. Review movement quality and what should change next block." },
};

export function blockPhase(blockWeek) {
  const wk = clampBlockWeek(blockWeek);
  return { blockWeek: wk, ...BLOCK_PHASES[wk] };
}

export function clampBlockWeek(blockWeek) {
  const n = Number(blockWeek);
  if (!Number.isFinite(n)) return 1;
  return Math.min(BLOCK_LENGTH_WEEKS, Math.max(1, Math.round(n)));
}

// ─── PROGRAM STATE — THE CANONICAL BLOCK CHRONOLOGY ──────────────────────────
// The weekly plan is an OUTPUT. It must not be the source of truth for where
// the athlete is in her programme: deleting or regenerating plans/current would
// then silently restart her at week 1, and a manual re-run would advance her a
// week she has not lived.
//
// So chronology lives in its own document — athletes/{id}/programState/strength
// — and the block week is DERIVED from the calendar, not incremented:
//
//   weekIndex = calendarWeeksBetween(blockStartWeekKey, currentWeekKey)
//   blockWeek = clamp(weekIndex + 1, 1, BLOCK_LENGTH_WEEKS)
//
// which makes every one of these true by construction rather than by care:
//   • deleting plans/current does not reset the block;
//   • regenerating a plan in the same week does not advance it;
//   • a missed weekly run does not corrupt the sequence — the next run lands on
//     the correct calendar week;
//   • pressing "Run now" twice does not double-advance;
//   • week 8 never becomes week 9.
export const PROGRAM_STATE_SCHEMA_VERSION = 1;
export const PROGRAM_STATE_DOC = { collection: "programState", id: "strength" };

// Whole weeks between two Monday week keys. Negative when `toWeekKey` is the
// earlier of the two, which is how a state dated in the future is detected.
export function calendarWeeksBetween(fromWeekKey, toWeekKey) {
  const from = new Date(`${fromWeekKey}T00:00:00`);
  const to = new Date(`${toWeekKey}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.floor((to - from) / (7 * 86400000));
}

const newBlockId = (weekKey, blockNumber) => `blk-${weekKey}-${blockNumber}`;

// ── newProgramState ──────────────────────────────────────────────────────────
// A fresh block starting at `blockStartWeekKey` (a Monday week key).
export function newProgramState({
  blockStartWeekKey,
  blockNumber = 1,
  createdAt = new Date().toISOString(),
  previousBlockId = null,
  initReason = "new-block",
} = {}) {
  return {
    schemaVersion: PROGRAM_STATE_SCHEMA_VERSION,
    blockId: newBlockId(blockStartWeekKey, blockNumber),
    blockNumber,
    blockStartWeekKey,
    blockLengthWeeks: BLOCK_LENGTH_WEEKS,
    createdAt,
    status: "active",
    previousBlockId,
    initReason,
  };
}

// ── readProgramState ─────────────────────────────────────────────────────────
// Where the athlete is in the block for `currentWeekKey`, derived from state
// alone. Returns null when the state is unusable, so callers migrate rather
// than guess.
//
// `status` is "active" until the calendar passes the last week of the block, at
// which point it becomes "completed": the block stays parked on week 8
// (consolidate / reassess — a safe holding pattern) and `needsNewBlock` says a
// human decision is due. A new block is NEVER started as a side effect of
// generating a plan.
export function readProgramState(state, currentWeekKey) {
  if (!state?.blockStartWeekKey || !currentWeekKey) return null;
  const weeks = calendarWeeksBetween(state.blockStartWeekKey, currentWeekKey);
  if (weeks == null) return null;

  const lengthWeeks = Number(state.blockLengthWeeks) || BLOCK_LENGTH_WEEKS;
  const weekIndex = Math.max(0, weeks);
  const blockWeek = Math.min(lengthWeeks, Math.max(1, weekIndex + 1));
  const overrun = weekIndex + 1 > lengthWeeks;

  return {
    blockId: state.blockId ?? null,
    blockNumber: Number(state.blockNumber) || 1,
    blockStartWeekKey: state.blockStartWeekKey,
    blockLengthWeeks: lengthWeeks,
    blockWeek,
    weekIndex,
    status: overrun ? "completed" : "active",
    needsNewBlock: overrun,
    // True when the state was written for a later week than the one being
    // planned — a clock or back-fill anomaly, reported rather than hidden.
    aheadOfBlockStart: weeks < 0,
  };
}

// ── migrateProgramState ──────────────────────────────────────────────────────
// Produces the state document for an athlete who has none yet, WITHOUT ever
// inferring chronology from a missing plan.
//
//   • A previous plan that carries both its own weekKey and a block week is
//     trustworthy evidence of where she is: the block start is back-derived so
//     she keeps the week she was on.
//   • Anything else — no plan, a legacy plan, a plan with no weekKey — starts an
//     explicit week 1 at `currentWeekKey`, and says so in `initReason` so the
//     assumption is visible in Firestore rather than implied.
export function migrateProgramState({ previousPlan = null, currentWeekKey, now = new Date() } = {}) {
  const createdAt = now.toISOString();

  const planWeekKey = previousPlan?.weekKey ?? null;
  const planBlockWeek = Number(previousPlan?.block?.week);
  const planBlockNumber = Number(previousPlan?.block?.number) || 1;

  if (!previousPlan?.legacy && planWeekKey && Number.isFinite(planBlockWeek) && planBlockWeek >= 1) {
    const clamped = Math.min(BLOCK_LENGTH_WEEKS, Math.round(planBlockWeek));
    const start = new Date(`${planWeekKey}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      start.setDate(start.getDate() - (clamped - 1) * 7);
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, "0");
      const d = String(start.getDate()).padStart(2, "0");
      return newProgramState({
        blockStartWeekKey: `${y}-${m}-${d}`,
        blockNumber: planBlockNumber,
        createdAt,
        initReason: "migrated-from-plan",
      });
    }
  }

  return newProgramState({
    blockStartWeekKey: currentWeekKey,
    blockNumber: 1,
    createdAt,
    initReason: "initialised-week-1",
  });
}

// ── resolveProgramState ──────────────────────────────────────────────────────
// The one call a plan generator makes. Returns the state to persist, where the
// athlete is, and whether the document changed — so a caller writes only when
// something actually moved.
//
// Note what it does NOT do: it never advances a week, and it never starts a new
// block. The only write it can produce is the initial migration or the
// active → completed transition, both of which are deterministic.
export function resolveProgramState({ state = null, previousPlan = null, currentWeekKey, now = new Date() } = {}) {
  let nextState = state;
  let migrated = false;

  let position = readProgramState(nextState, currentWeekKey);
  if (!position) {
    nextState = migrateProgramState({ previousPlan, currentWeekKey, now });
    position = readProgramState(nextState, currentWeekKey);
    migrated = true;
  }

  let transition = null;
  if (position.status === "completed" && nextState.status !== "completed") {
    nextState = { ...nextState, status: "completed", completedAt: now.toISOString() };
    transition = "completed";
  }

  return {
    state: nextState,
    position,
    migrated,
    transition,
    changed: migrated || transition != null,
  };
}

// ── startNextBlock ───────────────────────────────────────────────────────────
// The explicit new-block transition. Only ever called deliberately (the parent
// pressing "Start the next block" after the week-8 review) — never as a side
// effect of generating a plan.
export function startNextBlock(state, weekKey, now = new Date()) {
  const blockNumber = (Number(state?.blockNumber) || 1) + 1;
  return newProgramState({
    blockStartWeekKey: weekKey,
    blockNumber,
    createdAt: now.toISOString(),
    previousBlockId: state?.blockId ?? null,
    initReason: "next-block",
  });
}

// ─── MOVEMENT QUALITY ────────────────────────────────────────────────────────
// The competency signal the design always claimed controlled progression and
// production could not actually observe. One question, asked once, after the
// session is logged — not a biomechanics score.
//
// Stored on the session document as `movementQuality`, using these stable
// machine values so the string a 2026 session was written with still means the
// same thing to a later reader.
export const MOVEMENT_QUALITY = Object.freeze({
  GOOD: "good",
  MIXED: "mixed",
  POOR: "poor",
  UNKNOWN: "unknown",
});

// The three a human can actually choose. UNKNOWN is never written — it is what
// reading a session that predates the field returns.
export const MOVEMENT_QUALITY_OPTIONS = Object.freeze([
  { value: MOVEMENT_QUALITY.GOOD,  label: "Good",  hint: "technique stayed controlled" },
  { value: MOVEMENT_QUALITY.MIXED, label: "Mixed", hint: "some reps lost quality" },
  { value: MOVEMENT_QUALITY.POOR,  label: "Poor",  hint: "technique broke down" },
]);

const MOVEMENT_QUALITY_VALUES = MOVEMENT_QUALITY_OPTIONS.map(o => o.value);

// readMovementQuality(session) → "good" | "mixed" | "poor" | "unknown"
//
// BACKWARD COMPATIBILITY, and the one rule that matters: a session written
// before this field existed returns UNKNOWN, never GOOD. Absent evidence of
// good technique is not evidence of good technique. UNKNOWN is also not POOR —
// treating every historical session as a technique breakdown would freeze
// progression for an athlete who has done nothing wrong — so it holds nothing
// by itself and is instead reported explicitly, so the plan is built knowing
// that nobody looked rather than assuming someone did and liked what they saw.
export function readMovementQuality(session) {
  const raw = session?.movementQuality;
  return MOVEMENT_QUALITY_VALUES.includes(raw) ? raw : MOVEMENT_QUALITY.UNKNOWN;
}

// ─── PROGRESSION GATE ────────────────────────────────────────────────────────
// Movement quality overrides rep count. Progress only when the prescribed reps
// were technically sound, no pain was reported, effort was manageable and
// movement quality held. Any one of those failing holds the prescription where
// it is — it never reduces it on its own, that is the model's call within the
// volume bounds. The one exception is a technique breakdown, which explicitly
// authorises a deterministic step back (`regressionAllowed`).
//
// Pain is independent of all of it: an open injury or a pain note holds the
// prescription whatever the technique rating says, including "good".
//
// `difficulty` is the 1–5 star rating the finish-and-log sheet writes.
export const HARD_SESSION_DIFFICULTY = 5;

export function progressionGate({
  lastSession = null,
  painReported = false,
  movementQualityConcern = false,
  movementQuality = null,
} = {}) {
  const quality = MOVEMENT_QUALITY_VALUES.includes(movementQuality)
    ? movementQuality
    : readMovementQuality(lastSession);

  // An explicit caller flag and an observed "poor" mean the same thing.
  const concern = movementQualityConcern === true || quality === MOVEMENT_QUALITY.POOR;

  const reasons = [];
  const notes = [];
  if (painReported) reasons.push("pain, discomfort or an open injury is on record");
  if (concern) reasons.push("movement quality was flagged");
  // Hold, not a flag: mixed technique means do not add resistance or volume at
  // the next exposure, but it is not the breakdown that authorises a step back.
  if (!concern && quality === MOVEMENT_QUALITY.MIXED) {
    reasons.push("some reps lost quality last session — hold the prescription, do not add load");
  }

  if (lastSession) {
    const exercises = lastSession.exercises || [];
    const anyIncomplete = exercises.length > 0 && exercises.some(e => e.completed === false);
    if (anyIncomplete) reasons.push("prescribed reps were not completed last session");

    const difficulties = exercises.map(e => Number(e.difficulty)).filter(Number.isFinite);
    const peak = difficulties.length ? Math.max(...difficulties) : Number(lastSession.difficulty);
    if (Number.isFinite(peak) && peak >= HARD_SESSION_DIFFICULTY) {
      reasons.push("last session was rated maximally hard");
    }
    if (lastSession.painNote) reasons.push("last session carried a pain note");

    if (quality === MOVEMENT_QUALITY.UNKNOWN) {
      notes.push("movement quality was not rated last session — do not assume technique was clean");
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    notes,
    movementQuality: quality,
    movementQualityConcern: concern,
    // Only a recorded technique breakdown deterministically authorises
    // reducing complexity or load; every other hold leaves it where it is.
    regressionAllowed: concern,
  };
}

// ─── TOURNAMENT SHAPE ────────────────────────────────────────────────────────
// Tournament matches ARE training load. A full tournament is not added on top
// of a normal twelve-hour week: the week gets one shortened maintenance session
// early on, and the second session may become recovery rather than being forced.
const TOURNAMENT_SHAPES = {
  none: {
    mode: "normal", sessionIds: ["A", "B"], volumeMultiplier: 1,
    durationOverride: null, sessionType: "full", secondSession: "full", notes: [],
  },
  pre: {
    mode: "pre", sessionIds: ["A", "B"], volumeMultiplier: 0.85,
    durationOverride: 45, sessionType: "reduced", secondSession: "reduced",
    notes: ["Tournament within ~2 weeks: familiar movements only, no new exercises, keep loads submaximal."],
  },
  week_of: {
    mode: "tournament", sessionIds: ["A"], volumeMultiplier: 0.5,
    durationOverride: 35, sessionType: "maintenance", secondSession: "recovery",
    dropHardPlyometrics: true, reduceLowerBodyVolume: true, dropDemandingCod: true,
    notes: [
      "Tournament this week: one shortened maintenance session (30–40 min) early in the week.",
      "Priorities are basic strength maintenance, trunk, shoulder/scapular work and low-fatigue movement preparation.",
      "Matches count as training load — the second S&C session becomes recovery rather than being forced in.",
    ],
  },
  post_hard: {
    mode: "post_hard", sessionIds: ["A"], volumeMultiplier: 0.6,
    durationOverride: 40, sessionType: "reduced", secondSession: "recovery",
    dropHardPlyometrics: true, reduceLowerBodyVolume: true,
    notes: ["After a heavy tournament: the matches were the load. One reduced session, second stays recovery."],
  },
  post_easy: {
    mode: "normal", sessionIds: ["A", "B"], volumeMultiplier: 0.9,
    durationOverride: null, sessionType: "full", secondSession: "full",
    notes: ["After a light tournament: normal week, monitor energy."],
  },
};

export function tournamentShape(tournamentMode) {
  return TOURNAMENT_SHAPES[tournamentMode] || TOURNAMENT_SHAPES.none;
}

// ─── VOLUME MATHS ────────────────────────────────────────────────────────────
const isWorking = (ex) => ex.role !== "warmup";

export function workingSetCount(exercises) {
  return (exercises || []).filter(isWorking).reduce((sum, e) => sum + (e.sets || 0), 0);
}

// plyometricContacts — purposeful ground contacts in a session. Per-side reps
// count twice, because they are.
export function plyometricContacts(exercises) {
  return (exercises || []).reduce((sum, e) => {
    const perRep = e.contactsPerRep || 0;
    if (!perRep) return sum;
    const reps = Number(e.reps) || 0;
    return sum + (e.sets || 0) * reps * perRep * (e.perSide ? 2 : 1);
  }, 0);
}

// applyVolumeMultiplier — trims WORKING sets down to the multiplier, lowest
// trimPriority first (impact volume before the strength pattern), never below
// each entry's minSets, warm-up untouched. Deterministic: the trim order is
// (trimPriority, template position).
function applyVolumeMultiplier(exercises, multiplier) {
  const out = exercises.map(e => ({ ...e }));
  if (!(multiplier < 1)) return out;

  const baseline = workingSetCount(out);
  let total = baseline;
  const target = Math.round(baseline * multiplier);

  const order = out
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => isWorking(e))
    .sort((a, b) => ((a.e.trimPriority ?? 5) - (b.e.trimPriority ?? 5)) || (a.i - b.i))
    .map(({ e }) => e);

  while (total > target) {
    const before = total;
    for (const e of order) {
      if (total <= target) break;
      if (e.sets > (e.minSets ?? 1)) { e.sets -= 1; total -= 1; }
    }
    if (total === before) break; // everything is at its floor
  }
  return out;
}

// ─── SESSION BUILDER ─────────────────────────────────────────────────────────
// buildSession(sessionId, context) → the deterministic prescription for one
// session, before any AI adjustment.
export function buildSession(sessionId, {
  blockWeek = 1,
  tournamentMode = "none",
  growthWatch = false,
  progressionAllowed = true,
} = {}) {
  const template = SESSION_TEMPLATES[sessionId];
  if (!template) return null;

  const phase = blockPhase(blockWeek);
  const shape = tournamentShape(tournamentMode);
  const thirdSetAllowed = phase.allowThirdSet && progressionAllowed;

  let exercises = template.exercises.map((t) => {
    const db = findExercise(t.key);
    // An entry may hold its ceiling back until later in the block —
    // the sprint distance goes to 10 m in the second build phase, not the
    // first week a third set becomes available.
    const atCeiling = thirdSetAllowed && (!t.targetFromBlockWeek || phase.blockWeek >= t.targetFromBlockWeek);
    const sets = thirdSetAllowed && t.targetSets ? t.targetSets : t.sets;
    return {
      ...t,
      id: t.key,
      name: db?.name ?? t.key,
      category: db?.cat ?? "Strength",
      sets,
      reps: t.reps,
      unit: t.unit || "reps",
      distanceM: atCeiling && t.targetDistanceM ? t.targetDistanceM : t.distanceM,
      repRange: thirdSetAllowed && t.targetReps ? t.targetReps : String(t.reps),
    };
  });

  // Tournament week: strip the hard plyometrics and the demanding COD work
  // before any volume trim, so the trim is not spent on exercises that should
  // not be in the session at all.
  if (shape.dropHardPlyometrics) exercises = exercises.filter(e => e.role !== "landing");
  if (shape.dropDemandingCod) exercises = exercises.filter(e => e.key !== "cod_cue_stop" && e.role !== "speed");
  if (shape.reduceLowerBodyVolume) {
    exercises = exercises.map(e =>
      e.role === "strength" && ["goblet_squat", "db_rdl", "split_squat", "step_up", "sl_rdl", "hip_thrust", "calf_raise"].includes(e.key)
        ? { ...e, sets: Math.max(e.minSets ?? 1, e.sets - 1) }
        : e
    );
  }

  // Growth-watch week keeps landing volume at the low end of the budget. It is
  // a coaching bias towards quality, not a prohibition.
  if (growthWatch) {
    exercises = exercises.map(e =>
      e.role === "landing" ? { ...e, sets: Math.max(e.minSets ?? 1, Math.min(e.sets, 2)) } : e
    );
  }

  const multiplier = Math.min(phase.volumeMultiplier, shape.volumeMultiplier);
  exercises = applyVolumeMultiplier(exercises, multiplier);

  const durationMin = shape.durationOverride
    ?? Math.round(template.durationMin * (phase.volumeMultiplier < 1 ? 0.85 : 1));

  return {
    id: template.id,
    plannedDay: template.plannedDay,
    title: template.title,
    purpose: template.purpose,
    durationMin,
    sessionType: shape.sessionType,
    blockWeek: phase.blockWeek,
    blockPhase: phase.phase,
    exercises,
    workingSets: workingSetCount(exercises),
    plyoContacts: plyometricContacts(exercises),
    plyoContactCap: growthWatch ? PLYO_CONTACT_BUDGET.growthWatchMax : PLYO_CONTACT_BUDGET.max,
    doneMap: {},
    sessionLogged: false,
  };
}

// ── buildWeeklyFramework ─────────────────────────────────────────────────────
// The full deterministic week: which sessions exist, what each contains, and
// what Sunday is. This is what the prompt describes and what the model adjusts.
export function buildWeeklyFramework({
  blockWeek = 1,
  blockNumber = 1,
  blockId = null,
  blockStatus = "active",
  blockStartWeekKey = null,
  needsNewBlock = false,
  tournamentMode = "none",
  growthWatch = false,
  progressionAllowed = true,
  progressionHold = [],
  progressionNotes = [],
} = {}) {
  const shape = tournamentShape(tournamentMode);
  const phase = blockPhase(blockWeek);

  const sessions = shape.sessionIds
    .map(id => buildSession(id, { blockWeek, tournamentMode, growthWatch, progressionAllowed }))
    .filter(Boolean);

  // A session the tournament shape drops is still described, as recovery, so
  // the weekly view can say what happened to it instead of silently losing it.
  const omitted = SESSION_IDS
    .filter(id => !shape.sessionIds.includes(id))
    .map(id => ({
      id,
      plannedDay: SESSION_TEMPLATES[id].plannedDay,
      title: SESSION_TEMPLATES[id].title,
      sessionType: shape.secondSession,
      durationMin: 0,
      exercises: [],
      doneMap: {},
      sessionLogged: false,
      omittedReason: shape.notes[0] || "Reduced week — this session is recovery.",
    }));

  return {
    blockWeek: phase.blockWeek,
    blockNumber,
    blockId,
    blockStatus,
    blockStartWeekKey,
    needsNewBlock,
    blockPhase: phase.phase,
    blockIntent: phase.intent,
    allowThirdSet: phase.allowThirdSet && progressionAllowed,
    allowLoadIncrease: phase.allowLoadIncrease && progressionAllowed,
    maxLoadIncrementPct: growthWatch
      ? EFFORT_TARGET.growthWatchLoadIncrementPctMax
      : EFFORT_TARGET.loadIncrementPctMax,
    progressionAllowed,
    progressionHold,
    // Non-blocking observations — chiefly "technique was not rated", which
    // must reach the plan without being mistaken for a hold.
    progressionNotes,
    growthWatch,
    tournamentMode: shape.mode,
    tournamentNotes: shape.notes,
    sessions,
    omittedSessions: omitted,
    sunday: { ...SUNDAY_RECOVERY },
  };
}

// ─── AI ADJUSTMENT CLAMPS ────────────────────────────────────────────────────
// mergeSessionAdjustments — folds the model's per-exercise choices onto the
// deterministic session. The model may lower sets, swap to an approved
// regression/progression declared on that entry, and add notes. It may NOT
// exceed the framework's set count, add an exercise, resurrect one the block
// suppresses, or push landing volume past the contact cap.
export function mergeSessionAdjustments(session, adjustments = []) {
  if (!session) return null;
  const byId = new Map();
  for (const adj of adjustments || []) {
    const key = adj?.id || adj?.key || adj?.name;
    const found = findExercise(key);
    if (found) byId.set(found.id, adj);
    if (key) byId.set(String(key), adj);
  }

  const exercises = session.exercises.map((ex) => {
    const adj = byId.get(ex.id) || byId.get(ex.key) || byId.get(ex.name);
    if (!adj) return ex;

    let next = { ...ex };

    // Variant swap — only among the regressions/progressions this template
    // entry declares, and only if that variant is approved for this block.
    const wanted = adj.variant || adj.swapTo || null;
    if (wanted) {
      const allowed = [...(ex.regressions || []), ...(ex.progressions || [])];
      const resolved = findExercise(wanted);
      if (resolved && allowed.includes(resolved.id) && isApprovedExercise(resolved.id)) {
        next.id = resolved.id;
        next.name = resolved.name;
        next.swappedFrom = ex.name;
      }
    }

    // Sets: down only. A workload metric reading low is never a reason to add
    // volume, and the third set is the framework's to grant, not the model's.
    const wantedSets = Number(adj.sets);
    if (Number.isFinite(wantedSets) && wantedSets >= (ex.minSets ?? 1) && wantedSets < ex.sets) {
      next.sets = wantedSets;
    }

    // Reps: down only, and never below one.
    const wantedReps = Number(adj.reps);
    if (Number.isFinite(wantedReps) && wantedReps > 0 && wantedReps < Number(ex.reps)) {
      next.reps = wantedReps;
      next.repRange = String(wantedReps);
    }

    if (adj.loadNote) next.loadNote = String(adj.loadNote);
    if (adj.note || adj.progressionNote) next.note = String(adj.note || adj.progressionNote);
    if (adj.tennisConnection) next.tennisConnection = String(adj.tennisConnection);
    return next;
  });

  const clamped = clampPlyoVolume(exercises, session.plyoContactCap);

  return {
    ...session,
    exercises: clamped,
    workingSets: workingSetCount(clamped),
    plyoContacts: plyometricContacts(clamped),
  };
}

// clampPlyoVolume — trims landing sets until the session is inside its contact
// cap. Only ever removes contacts.
export function clampPlyoVolume(exercises, cap = PLYO_CONTACT_BUDGET.max) {
  const out = exercises.map(e => ({ ...e }));
  const landing = out.filter(e => (e.contactsPerRep || 0) > 0);
  let guard = 50;
  while (plyometricContacts(out) > cap && guard-- > 0) {
    const trimmable = landing.filter(e => e.sets > (e.minSets ?? 1));
    if (trimmable.length === 0) break;
    trimmable[trimmable.length - 1].sets -= 1;
  }
  return out;
}

// ─── WEEKLY PLAN DOCUMENT ────────────────────────────────────────────────────
// buildWeeklyPlanDoc — the schema-v2 plans/current document.
export function buildWeeklyPlanDoc({
  weekKey,
  framework,
  generatedAt,
  generatedBy = "weeklyReview",
  growthContext = null,
  weeklyTargets = WEEKLY_TARGETS,
  loadContext = {},
  coachNote = "",
  athleteNote = "",
  metrics = null,
  matchInformedBy = null,
  rationales = {},
}) {
  return {
    schemaVersion: WEEKLY_PLAN_SCHEMA_VERSION,
    weekKey,
    generatedAt,
    generatedBy,
    growthContext: growthContext
      ? {
          recentGrowthVelocityCmYr: growthContext.velocityCmYr ?? null,
          intervalDays: growthContext.intervalDays ?? null,
          growthWatch: !!growthContext.growthWatch,
          sufficientInterval: !!growthContext.sufficientInterval,
        }
      : { recentGrowthVelocityCmYr: null, intervalDays: null, growthWatch: false, sufficientInterval: false },
    block: {
      // Identity comes from programState/strength — the plan reports where the
      // athlete is, it does not decide it.
      id: framework.blockId ?? null,
      number: framework.blockNumber,
      week: framework.blockWeek,
      startWeekKey: framework.blockStartWeekKey ?? null,
      status: framework.blockStatus ?? "active",
      needsNewBlock: !!framework.needsNewBlock,
      phase: framework.blockPhase,
      intent: framework.blockIntent,
      lengthWeeks: BLOCK_LENGTH_WEEKS,
      progressionAllowed: framework.progressionAllowed,
      progressionHold: framework.progressionHold || [],
      progressionNotes: framework.progressionNotes || [],
    },
    weeklyTargets: {
      tennisHoursMin: weeklyTargets.tennisHoursMin,
      tennisHoursMax: weeklyTargets.tennisHoursMax,
      strengthSessions: weeklyTargets.strengthSessions,
      completeRestDays: weeklyTargets.completeRestDays,
      swimSessions: weeklyTargets.swimSessions,
      yogaSessions: weeklyTargets.yogaSessions,
    },
    sessions: [...framework.sessions, ...framework.omittedSessions].map(s => ({
      id: s.id,
      plannedDay: s.plannedDay,
      title: s.title,
      purpose: s.purpose ?? null,
      durationMin: s.durationMin,
      sessionType: s.sessionType,
      omittedReason: s.omittedReason ?? null,
      coachFocus: s.coachFocus ?? null,
      workingSets: s.workingSets ?? 0,
      plyoContacts: s.plyoContacts ?? 0,
      plyoContactCap: s.plyoContactCap ?? PLYO_CONTACT_BUDGET.max,
      exercises: s.exercises || [],
      doneMap: s.doneMap || {},
      sessionLogged: !!s.sessionLogged,
      difficulty: null,
      loggedAt: null,
    })),
    sunday: { ...SUNDAY_RECOVERY },
    tournamentMode: framework.tournamentMode,
    tournamentNotes: framework.tournamentNotes || [],
    loadContext,
    metrics,
    matchInformedBy,
    coachNote,
    athleteNote,
    ...rationales,
  };
}

// ─── COMPATIBILITY READER ────────────────────────────────────────────────────
// readWeeklyPlan — normalises whatever is in plans/current to the v2 shape the
// UI renders. A pre-v2 document (one flat `plan` array with a single doneMap
// and sessionLogged flag) becomes a one-session week so old plans keep
// rendering instead of crashing the new screen. Nothing is written back and no
// history is discarded.
export function readWeeklyPlan(doc) {
  if (!doc) return null;
  if (doc.schemaVersion >= WEEKLY_PLAN_SCHEMA_VERSION && Array.isArray(doc.sessions)) {
    return {
      ...doc,
      sessions: doc.sessions.map(s => ({
        ...s,
        exercises: s.exercises || [],
        doneMap: s.doneMap || {},
        sessionLogged: !!s.sessionLogged,
      })),
      sunday: doc.sunday || { ...SUNDAY_RECOVERY },
      legacy: false,
    };
  }

  // Legacy (schemaVersion absent / 1).
  const exercises = (doc.plan || []).map(ex => ({ ...ex, unit: ex.unit || "reps" }));
  return {
    schemaVersion: WEEKLY_PLAN_SCHEMA_VERSION,
    legacy: true,
    weekKey: doc.weekKey ?? null,
    generatedAt: doc.generatedAt ?? null,
    generatedBy: doc.generatedBy ?? null,
    growthContext: { recentGrowthVelocityCmYr: null, intervalDays: null, growthWatch: false, sufficientInterval: false },
    block: null,
    weeklyTargets: { ...WEEKLY_TARGETS },
    sessions: [{
      id: "A",
      plannedDay: null,
      title: doc.sessionType ? `Previous plan · ${doc.sessionType}` : "Previous plan",
      purpose: null,
      durationMin: typeof doc.sessionDuration === "number" ? doc.sessionDuration : null,
      sessionType: doc.sessionType ?? "full",
      omittedReason: null,
      workingSets: exercises.length,
      plyoContacts: 0,
      exercises,
      doneMap: doc.doneMap || {},
      sessionLogged: !!doc.sessionLogged,
      difficulty: doc.difficulty ?? null,
      loggedAt: null,
    }],
    sunday: { ...SUNDAY_RECOVERY },
    tournamentMode: "normal",
    tournamentNotes: [],
    loadContext: {},
    metrics: doc.metrics ?? null,
    matchInformedBy: doc.matchInformedBy ?? null,
    briefing: doc.briefing ?? "",
    loadRationale: doc.loadRationale ?? null,
    matchRationale: doc.matchRationale ?? null,
    techAssessmentRationale: doc.techAssessmentRationale ?? null,
    coachNote: doc.coachNote ?? "",
    athleteNote: doc.athleteNote ?? "",
  };
}

// ── planSessionById / weeklyPlanProgress ─────────────────────────────────────
export function planSessionById(plan, sessionId) {
  return (plan?.sessions || []).find(s => s.id === sessionId) || null;
}

// Per-session progress. Completing Session A must never mark Session B done, so
// this is always computed per session and never rolled into one flag.
export function sessionProgress(session) {
  const exercises = session?.exercises || [];
  const done = exercises.filter(ex => session?.doneMap?.[ex.id]).length;
  return {
    done,
    total: exercises.length,
    pct: exercises.length ? Math.round((done / exercises.length) * 100) : 0,
    complete: exercises.length > 0 && done === exercises.length,
  };
}

// ── flattenPlanExercises ─────────────────────────────────────────────────────
// Every scheduled session's exercises in one list, each tagged with the session
// it belongs to. The classic (pre-mobile) screens render a single flat list, so
// this is how they read a weekly plan without a second Firestore field.
export function flattenPlanExercises(plan) {
  return (plan?.sessions || [])
    .filter(s => s.sessionType !== "recovery" && (s.exercises || []).length > 0)
    .flatMap(s => (s.exercises || []).map(ex => ({
      ...ex,
      sessionId: s.id,
      plannedDay: s.plannedDay,
    })));
}

// ── compareToWeeklyTargets ───────────────────────────────────────────────────
// Target vs Actual, with no pass/fail grading. `status` is "under" | "within" |
// "over" — a description of where the week landed, never a verdict on the
// athlete. Exceeding the tennis target produces guidance about replacing court
// volume, not a failure.
export function compareToWeeklyTargets(summary, targets = WEEKLY_TARGETS) {
  if (!summary) return null;
  const band = (actual, min, max) => (actual < min ? "under" : actual > max ? "over" : "within");

  const tennisStatus = band(summary.onCourtHours ?? 0, targets.tennisHoursMin, targets.tennisHoursMax);
  return {
    tennis: {
      label: "Tennis (incl. matches)",
      targetLabel: `${targets.tennisHoursMin}–${targets.tennisHoursMax} h`,
      actual: summary.onCourtHours ?? 0,
      actualLabel: `${summary.onCourtHours ?? 0} h`,
      status: tennisStatus,
    },
    strength: {
      label: "S&C sessions",
      targetLabel: `${targets.strengthSessions}`,
      actual: summary.strengthSessions ?? 0,
      actualLabel: `${summary.strengthSessions ?? 0}`,
      status: band(summary.strengthSessions ?? 0, targets.strengthSessions, targets.strengthSessions),
    },
    crossTraining: {
      label: "Swim / cross-training",
      targetLabel: `${targets.swimMinutesMin}–${targets.swimMinutesMax} min`,
      actual: summary.crossTrainingMinutes ?? 0,
      actualLabel: `${summary.crossTrainingMinutes ?? 0} min`,
      status: band(summary.crossTrainingMinutes ?? 0, targets.swimMinutesMin, targets.swimMinutesMax),
    },
    restDays: {
      label: "Complete rest days",
      targetLabel: `≥ ${targets.completeRestDays}`,
      actual: summary.restDays ?? 0,
      actualLabel: `${summary.restDays ?? 0}`,
      status: (summary.restDays ?? 0) < targets.completeRestDays ? "under" : "within",
    },
    tennisOverTargetMessage: tennisStatus === "over" ? OVER_TARGET_TENNIS_MESSAGE : null,
  };
}

// The exercise ids this block will not prescribe, re-exported so the prompt can
// state them without importing two modules.
export { BLOCK_SUPPRESSED_EXERCISE_IDS };
