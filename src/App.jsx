import { useState, useEffect, useCallback } from "react";

// ─── PERSISTENT STORAGE HELPERS ───────────────────────────────────────────────
const storage = {
  async get(key) {
    try {
      if (window.storage) {
        const r = await window.storage.get(key);
        if (r && r.value !== undefined && r.value !== null) {
          return JSON.parse(r.value);
        }
      }
    } catch(e) {}
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch(e) { return null; }
  },
  async set(key, value) {
    const serialized = JSON.stringify(value);
    let cloudOk = false;
    try {
      if (window.storage) {
        await window.storage.set(key, serialized);
        cloudOk = true;
      }
    } catch(e) { cloudOk = false; }
    try {
      localStorage.setItem(key, serialized);
      return true;
    } catch(e) {
      if (!cloudOk) throw new Error("Both storage methods failed");
      return true;
    }
  }
};

// ─── EXERCISE DATABASE ─────────────────────────────────────────────────────────
const EXERCISE_DB = [
  // LOWER BODY STRENGTH
  { id: "goblet_squat",     name: "Goblet Squat",         cat: "Strength",    movement: "Bilateral Lower",    tennis: ["lateral_power","deceleration"],  ageFlag: "green",  progressionChain: ["bw_squat","goblet_squat","front_squat"], defaultSets: 2, defaultReps: 10 },
  { id: "fwd_lunge",        name: "Forward Lunge",        cat: "Strength",    movement: "Single-Leg",         tennis: ["deceleration","linear_speed"],   ageFlag: "green",  progressionChain: ["fwd_lunge","reverse_lunge","weighted_lunge"], defaultSets: 2, defaultReps: 10 },
  { id: "reverse_lunge",    name: "Reverse Lunge",        cat: "Strength",    movement: "Single-Leg",         tennis: ["deceleration","lateral_power"],  ageFlag: "green",  progressionChain: ["fwd_lunge","reverse_lunge","weighted_lunge"], defaultSets: 2, defaultReps: 10 },
  { id: "side_lunge",       name: "Side Lunge",           cat: "Strength",    movement: "Lateral",            tennis: ["lateral_agility","lateral_power"],ageFlag: "green",  progressionChain: ["side_lunge","weighted_side_lunge"], defaultSets: 2, defaultReps: 10 },
  { id: "nordic_curl",      name: "Nordic Curl",          cat: "Strength",    movement: "Single-Leg",         tennis: ["deceleration","hamstring"],      ageFlag: "yellow", progressionChain: ["bridge","nordic_curl_eccentric","nordic_curl"], defaultSets: 2, defaultReps: 5 },
  { id: "hip_hinge",        name: "Hip Hinge",            cat: "Strength",    movement: "Bilateral Lower",    tennis: ["rotational_power","hamstring"],  ageFlag: "green",  progressionChain: ["hip_hinge","kb_swing"], defaultSets: 2, defaultReps: 10 },
  { id: "calf_raise",       name: "Calf Raise",           cat: "Strength",    movement: "Bilateral Lower",    tennis: ["first_step","linear_speed"],     ageFlag: "green",  progressionChain: ["calf_raise","sl_calf_raise"], defaultSets: 2, defaultReps: 10 },
  { id: "bridge",           name: "Glute Bridge",         cat: "Strength",    movement: "Bilateral Lower",    tennis: ["rotational_power","stability"],  ageFlag: "green",  progressionChain: ["bridge","single_leg_bridge"], defaultSets: 2, defaultReps: 10 },
  { id: "wall_squat",       name: "Isometric Wall Squat", cat: "Strength",    movement: "Bilateral Lower",    tennis: ["deceleration","stability"],      ageFlag: "green",  progressionChain: ["wall_squat","goblet_squat"], defaultSets: 2, defaultReps: 30 },
  { id: "kb_swing",         name: "Kettlebell Swing",     cat: "Power",       movement: "Bilateral Lower",    tennis: ["rotational_power","first_step"], ageFlag: "yellow", progressionChain: ["hip_hinge","kb_swing"], defaultSets: 2, defaultReps: 10 },
  // UPPER BODY
  { id: "floor_pushup",     name: "Floor Push Up",        cat: "Strength",    movement: "Upper Push",         tennis: ["serve_power","stability"],       ageFlag: "green",  progressionChain: ["floor_pushup","push_press"], defaultSets: 2, defaultReps: 10 },
  { id: "push_press",       name: "Push Press",           cat: "Strength",    movement: "Upper Push",         tennis: ["serve_power","rotational_power"],ageFlag: "green",  progressionChain: ["floor_pushup","push_press"], defaultSets: 2, defaultReps: 10 },
  { id: "pullup",           name: "Pull Up",              cat: "Strength",    movement: "Upper Pull",         tennis: ["shoulder_stability","serve_power"],ageFlag:"yellow", progressionChain: ["dead_hang","reverse_pullup","pullup"], defaultSets: 2, defaultReps: 8 },
  { id: "reverse_pullup",   name: "Reverse Pull Up",      cat: "Strength",    movement: "Upper Pull",         tennis: ["shoulder_stability"],            ageFlag: "green",  progressionChain: ["dead_hang","reverse_pullup","pullup"], defaultSets: 2, defaultReps: 10 },
  { id: "band_facepull",    name: "Band Face Pull",       cat: "Strength",    movement: "Upper Pull",         tennis: ["shoulder_stability","serve_power"],ageFlag:"green",  progressionChain: ["band_facepull","pullup"], defaultSets: 2, defaultReps: 10 },
  { id: "dead_hang",        name: "Dead Hang",            cat: "Strength",    movement: "Upper Pull",         tennis: ["shoulder_stability","grip"],     ageFlag: "green",  progressionChain: ["dead_hang","reverse_pullup"], defaultSets: 1, defaultReps: 60 },
  // CORE
  { id: "dead_bug",         name: "Dead Bug",             cat: "Core",        movement: "Anti-Extension",     tennis: ["core_stability","rotational_power"],ageFlag:"green", progressionChain: ["dead_bug"], defaultSets: 2, defaultReps: 10 },
  { id: "hip_flexor",       name: "Hip Flexor Raise",     cat: "Core",        movement: "Hip Flexion",        tennis: ["first_step","core_stability"],   ageFlag: "green",  progressionChain: ["hip_flexor"], defaultSets: 2, defaultReps: 10 },
  { id: "open_book",        name: "Side-Lying Open Book", cat: "Mobility",    movement: "Rotational",         tennis: ["rotational_power","shoulder_stability"],ageFlag:"green",progressionChain:["open_book"], defaultSets: 1, defaultReps: 10 },
  { id: "slam_ball",        name: "Slam Ball",            cat: "Power",       movement: "Rotational",         tennis: ["rotational_power","serve_power"],ageFlag: "green",  progressionChain: ["slam_ball"], defaultSets: 2, defaultReps: 8 },
  { id: "med_ball_throw",   name: "Medicine Ball Throw",  cat: "Power",       movement: "Rotational",         tennis: ["rotational_power","serve_power"],ageFlag: "green",  progressionChain: ["med_ball_throw"], defaultSets: 2, defaultReps: 10 },
  // PLYOMETRICS
  { id: "box_jump",         name: "Box Jump",             cat: "Plyometrics", movement: "Vertical",           tennis: ["first_step","deceleration"],     ageFlag: "green",  progressionChain: ["box_jump","box_jump_sl"], defaultSets: 2, defaultReps: 8 },
  { id: "box_jump_sl",      name: "Box Jump — Land Single Leg", cat: "Plyometrics", movement: "Vertical",    tennis: ["deceleration","stability"],      ageFlag: "yellow", progressionChain: ["box_jump","box_jump_sl"], defaultSets: 2, defaultReps: 6 },
  { id: "skater_jump",      name: "Skater Jumps",         cat: "Plyometrics", movement: "Lateral",            tennis: ["lateral_agility","lateral_power"],ageFlag: "green",  progressionChain: ["skater_jump"], defaultSets: 2, defaultReps: 8 },
  { id: "ski_jump",         name: "Ski / Skate Jump",     cat: "Plyometrics", movement: "Lateral",            tennis: ["lateral_agility","first_step"],  ageFlag: "green",  progressionChain: ["ski_jump"], defaultSets: 2, defaultReps: 8 },
  { id: "lateral_hops",     name: "Lateral Side-to-Side Hops", cat: "Plyometrics", movement: "Lateral",     tennis: ["lateral_agility","first_step"],  ageFlag: "green",  progressionChain: ["lateral_hops"], defaultSets: 2, defaultReps: 20 },
  { id: "pogo_jumps",       name: "Linear Pogo Jumps",    cat: "Plyometrics", movement: "Linear",             tennis: ["linear_speed","first_step"],     ageFlag: "green",  progressionChain: ["pogo_jumps"], defaultSets: 2, defaultReps: 10 },
  { id: "broad_jump_sl",    name: "Single Leg Broad Jump",cat: "Plyometrics", movement: "Linear",             tennis: ["linear_speed","deceleration"],   ageFlag: "yellow", progressionChain: ["broad_jump_sl"], defaultSets: 2, defaultReps: 4 },
  // AGILITY & CONDITIONING
  { id: "ladder",           name: "Ladder Coordination",  cat: "Agility",     movement: "Multi-Directional",  tennis: ["lateral_agility","first_step","footwork"],ageFlag:"green",progressionChain:["ladder"], defaultSets: 3, defaultReps: 1 },
  { id: "crab_walk",        name: "Crab Walk",            cat: "Agility",     movement: "Lateral",            tennis: ["lateral_agility","stability"],   ageFlag: "green",  progressionChain: ["crab_walk"], defaultSets: 3, defaultReps: 5 },
  { id: "parachute_run",    name: "Parachute Hill Run",   cat: "Conditioning",movement: "Linear",             tennis: ["linear_speed","conditioning"],   ageFlag: "green",  progressionChain: ["parachute_run"], defaultSets: 3, defaultReps: 1 },
  // MOBILITY / WARMUP
  { id: "squat_mobility",   name: "Squat Mobility",       cat: "Mobility",    movement: "Bilateral Lower",    tennis: ["deceleration","stability"],      ageFlag: "green",  progressionChain: ["squat_mobility"], defaultSets: 2, defaultReps: 10 },
  { id: "hip_raise",        name: "Hip Raise",            cat: "Mobility",    movement: "Hip Flexion",        tennis: ["core_stability","first_step"],   ageFlag: "green",  progressionChain: ["hip_raise"], defaultSets: 2, defaultReps: 10 },
  { id: "leg_lateral_raise",name: "Leg Lateral Raise",    cat: "Mobility",    movement: "Lateral",            tennis: ["lateral_agility","stability"],   ageFlag: "green",  progressionChain: ["leg_lateral_raise"], defaultSets: 2, defaultReps: 10 },
  { id: "foam_rolling",     name: "Foam Rolling",         cat: "Recovery",    movement: "Recovery",           tennis: ["recovery"],                     ageFlag: "green",  progressionChain: ["foam_rolling"], defaultSets: 1, defaultReps: 1 },
];

const TENNIS_GAPS = [
  { id: "lateral_agility",   label: "Lateral Agility",      desc: "Slow side-to-side movement, poor wide ball coverage" },
  { id: "first_step",        label: "First Step Quickness",  desc: "Slow reaction and initial movement to the ball" },
  { id: "deceleration",      label: "Deceleration / Control",desc: "Poor braking after sprints, off-balance on shots" },
  { id: "rotational_power",  label: "Rotational Power",      desc: "Weak forehand/backhand drive, lack of body rotation" },
  { id: "serve_power",       label: "Serve Power",           desc: "Weak serve, limited shoulder/upper body power" },
  { id: "shoulder_stability",label: "Shoulder Stability",    desc: "Shoulder fatigue, inconsistent serve toss" },
  { id: "core_stability",    label: "Core Stability",        desc: "Unstable base, loses form when running and hitting" },
  { id: "lateral_power",     label: "Lateral Explosive Power",desc: "Can't generate explosive push-off on wide balls" },
  { id: "linear_speed",      label: "Linear Speed",          desc: "Slow on transition, poor recovery to baseline" },
  { id: "footwork",          label: "Footwork Coordination", desc: "Poor split step, inefficient footwork patterns" },
  { id: "hamstring",         label: "Hamstring Strength",    desc: "Hamstring fatigue, risk during explosive movements" },
  { id: "stability",         label: "Single-Leg Stability",  desc: "Wobbles on one-leg landings, poor balance mid-rally" },
  { id: "conditioning",      label: "Aerobic Conditioning",  desc: "Fatigues in long matches or 3rd sets" },
];

// ─── PROGRESSION LOGIC ────────────────────────────────────────────────────────
function prescribeProgression(exercise, history) {
  const logs = (history || [])
    .filter(s => s.exercises?.some(e => e.id === exercise.id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!logs.length) {
    return { sets: exercise.defaultSets, reps: exercise.defaultReps, note: "Starting baseline", weight: null };
  }

  const lastSession = logs[0];
  const lastEx = lastSession.exercises.find(e => e.id === exercise.id);
  const difficulty = lastEx?.difficulty || 3;
  const completed = lastEx?.completed !== false;

  let sets = lastEx?.sets || exercise.defaultSets;
  let reps = lastEx?.reps || exercise.defaultReps;
  let weight = lastEx?.weight || null;
  let note = "";

  if (!completed) {
    note = "Reduce: did not complete last session";
    reps = Math.max(Math.round(reps * 0.85), 3);
  } else if (difficulty <= 2) {
    if (reps < 12) { reps += 1; note = "⬆ +1 rep (was easy)"; }
    else if (sets < 4) { sets += 1; reps = exercise.defaultReps; note = "⬆ +1 set (was easy)"; }
    else { note = "⬆ Consider adding weight next session"; }
  } else if (difficulty === 3) {
    note = "Maintain — good effort";
  } else if (difficulty >= 4) {
    note = "Hold — challenging, consolidate before progressing";
  }

  return { sets, reps, weight, note };
}

// ─── LOAD CALCULATOR ──────────────────────────────────────────────────────────
function calculateWeekLoad(weekLogs) {
  let score = 0;
  (weekLogs || []).forEach(log => {
    const base = log.duration || 60;
    const intensity = log.intensity || 3;
    score += base * (intensity / 3);
  });
  return score;
}

function getPlanModifier(weekLoad, tournamentStatus, sessionTime) {
  let volumeMod = 1.0;
  let intensityMod = 1.0;
  let notes = [];

  if (tournamentStatus === "pre") {
    volumeMod *= 0.65; intensityMod *= 0.7;
    notes.push("⚠️ Pre-tournament: -35% volume, familiar exercises only, no new movements");
  } else if (tournamentStatus === "week_of") {
    volumeMod *= 0.3; intensityMod *= 0.5;
    notes.push("🎾 Tournament week: activation only — 15–20 min max");
  } else if (tournamentStatus === "post_hard") {
    volumeMod *= 0.75; intensityMod *= 0.8;
    notes.push("🔄 Post heavy tournament: -25% volume, prioritise mobility & recovery");
  } else if (tournamentStatus === "post_easy") {
    notes.push("✅ Post light tournament: normal plan, monitor energy levels");
  }

  if (weekLoad > 300) {
    volumeMod *= 0.85;
    notes.push("📊 High weekly load (tennis + cheer): reduce weighted sets by 1, protect agility & plyometrics");
  } else if (weekLoad < 100) {
    volumeMod *= 1.1;
    notes.push("📊 Light training week: can push volume and try progressive overload");
  }

  if (sessionTime) {
    const h = parseInt(sessionTime.split(":")[0]);
    if (h < 10) notes.push("🕗 Morning session: add 2 extra warm-up sets, CNS not fully activated");
    if (h >= 19) notes.push("🌙 Evening session: flag recovery — avoid high-intensity plyos after 7pm for sleep quality");
  }

  return { volumeMod, intensityMod, notes };
}

// ─── PLAN GENERATOR ──────────────────────────────────────────────────────────
function generatePlan(gaps, weekLogs, tournamentStatus, sessionTime, sessionHistory) {
  const weekLoad = calculateWeekLoad(weekLogs);
  const { volumeMod, intensityMod, notes: modNotes } = getPlanModifier(weekLoad, tournamentStatus, sessionTime);

  const ALWAYS_INCLUDE_CATS = ["Agility", "Plyometrics"];

  const scored = EXERCISE_DB.map(ex => {
    let score = 0;
    (gaps || []).forEach(gap => {
      if (ex.tennis?.includes(gap)) score += 3;
    });
    if (ALWAYS_INCLUDE_CATS.includes(ex.cat)) score += 2;
    if (ex.cat === "Mobility") score += 1;
    return { ...ex, score };
  }).sort((a, b) => b.score - a.score);

  const plan = [];
  const catCount = {};
  const catLimits = {
    Mobility: 2, Strength: 4, Power: 2, Plyometrics: 2, Agility: 1, Conditioning: 1, Recovery: 1
  };

  plan.push({ ...EXERCISE_DB.find(e => e.id === "squat_mobility"), sets: 2, reps: 10, note: "Warmup", prescribed: { sets: 2, reps: 10, note: "Warmup", weight: null } });
  plan.push({ ...EXERCISE_DB.find(e => e.id === "open_book"), sets: 1, reps: 10, note: "Warmup", prescribed: { sets: 1, reps: 10, note: "Warmup", weight: null } });

  scored.forEach(ex => {
    if (plan.find(p => p.id === ex.id)) return;
    if ((catCount[ex.cat] || 0) >= (catLimits[ex.cat] || 2)) return;
    if (plan.length >= 12) return;

    const prescribed = prescribeProgression(ex, sessionHistory);
    const finalSets = Math.max(1, Math.round(prescribed.sets * volumeMod));
    catCount[ex.cat] = (catCount[ex.cat] || 0) + 1;
    plan.push({ ...ex, prescribed: { ...prescribed, sets: finalSets } });
  });

  return { plan, weekLoad, modNotes };
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');`;

const COLORS = {
  bg: "#0a0e14", surface: "#111620", card: "#161d2a", border: "#1e2a3a",
  accent: "#00e5a0", accentDim: "#00b87a", accentMuted: "rgba(0,229,160,0.12)",
  yellow: "#f5c518", red: "#ff4d6d", text: "#e8edf5", muted: "#5a6a7e",
  tennis: "#c8f564", cheer: "#f564c8"
};

const css = `
  ${FONTS}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${COLORS.bg}; color: ${COLORS.text}; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
  .app { max-width: 900px; margin: 0 auto; padding: 0 16px 80px; }
  h1, h2, h3 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }
  .header { padding: 32px 0 24px; border-bottom: 1px solid ${COLORS.border}; margin-bottom: 28px; }
  .header h1 { font-size: clamp(2.4rem, 6vw, 4rem); color: ${COLORS.accent}; line-height: 1; }
  .header p { color: ${COLORS.muted}; font-size: 0.9rem; margin-top: 6px; }
  .tabs { display: flex; gap: 4px; background: ${COLORS.surface}; border-radius: 10px; padding: 4px; margin-bottom: 28px; flex-wrap: wrap; }
  .tab { flex: 1; min-width: 100px; padding: 10px 12px; border: none; border-radius: 7px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500; color: ${COLORS.muted}; background: transparent; transition: all 0.18s; text-align: center; }
  .tab.active { background: ${COLORS.accent}; color: #000; font-weight: 600; }
  .card { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .card-title { font-size: 1.1rem; color: ${COLORS.accent}; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .badge-green { background: rgba(0,229,160,0.15); color: ${COLORS.accent}; }
  .badge-yellow { background: rgba(245,197,24,0.15); color: ${COLORS.yellow}; }
  .badge-red { background: rgba(255,77,109,0.15); color: ${COLORS.red}; }
  .badge-gray { background: rgba(90,106,126,0.2); color: ${COLORS.muted}; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media(max-width:600px){ .grid2 { grid-template-columns: 1fr; } }
  .label { font-size: 0.75rem; color: ${COLORS.muted}; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 6px; }
  input, select, textarea { width: 100%; padding: 10px 12px; background: ${COLORS.surface}; border: 1px solid ${COLORS.border}; border-radius: 8px; color: ${COLORS.text}; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; outline: none; transition: border 0.15s; }
  input:focus, select:focus, textarea:focus { border-color: ${COLORS.accent}; }
  select option { background: ${COLORS.surface}; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.88rem; transition: all 0.15s; }
  .btn-primary { background: ${COLORS.accent}; color: #000; }
  .btn-primary:hover { background: ${COLORS.accentDim}; }
  .btn-ghost { background: ${COLORS.accentMuted}; color: ${COLORS.accent}; }
  .btn-ghost:hover { background: rgba(0,229,160,0.2); }
  .btn-danger { background: rgba(255,77,109,0.12); color: ${COLORS.red}; }
  .btn-sm { padding: 6px 12px; font-size: 0.78rem; }
  .gap-checkbox { display: flex; flex-wrap: wrap; gap: 8px; }
  .gap-chip { padding: 7px 13px; border-radius: 20px; border: 1.5px solid ${COLORS.border}; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; color: ${COLORS.muted}; background: transparent; }
  .gap-chip.selected { border-color: ${COLORS.tennis}; color: ${COLORS.tennis}; background: rgba(200,245,100,0.08); }
  .ex-row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; border-bottom: 1px solid ${COLORS.border}; }
  .ex-row:last-child { border-bottom: none; }
  .ex-num { font-family: 'Bebas Neue', sans-serif; font-size: 1.4rem; color: ${COLORS.border}; min-width: 28px; padding-top: 2px; }
  .ex-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 4px; }
  .ex-meta { font-size: 0.78rem; color: ${COLORS.muted}; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .ex-prescription { font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; color: ${COLORS.accent}; min-width: 90px; text-align: right; line-height: 1; }
  .ex-note { font-size: 0.72rem; color: ${COLORS.accentDim}; }
  .note-box { background: ${COLORS.surface}; border-left: 3px solid ${COLORS.accent}; border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 0.83rem; color: ${COLORS.muted}; margin-bottom: 12px; }
  .note-box.warn { border-color: ${COLORS.yellow}; }
  .note-box.danger { border-color: ${COLORS.red}; }
  .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid ${COLORS.border}; font-size: 0.88rem; }
  .stat-row:last-child { border-bottom: none; }
  .star-row { display: flex; gap: 6px; }
  .star { font-size: 1.3rem; cursor: pointer; transition: transform 0.1s; filter: grayscale(1); }
  .star.lit { filter: none; transform: scale(1.15); }
  .log-item { background: ${COLORS.surface}; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 0.83rem; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
  .pill-tennis { background: rgba(200,245,100,0.15); color: ${COLORS.tennis}; }
  .pill-cheer { background: rgba(245,100,200,0.15); color: ${COLORS.cheer}; }
  .pill-strength { background: rgba(0,229,160,0.12); color: ${COLORS.accent}; }
  .load-bar-wrap { height: 8px; background: ${COLORS.surface}; border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .load-bar { height: 100%; border-radius: 4px; transition: width 0.4s; }
  .section-label { font-family: 'Bebas Neue', sans-serif; font-size: 0.85rem; letter-spacing: 0.1em; color: ${COLORS.muted}; margin: 18px 0 10px; }
  .flex { display: flex; align-items: center; gap: 10px; }
  .flex-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .mt8 { margin-top: 8px; }
  .mt16 { margin-top: 16px; }
  .empty { text-align: center; color: ${COLORS.muted}; padding: 32px 0; font-size: 0.9rem; }
  .prog-table { width: 100%; font-size: 0.82rem; border-collapse: collapse; }
  .prog-table th { text-align: left; color: ${COLORS.muted}; font-weight: 500; padding: 8px 6px 10px; border-bottom: 1px solid ${COLORS.border}; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .prog-table td { padding: 10px 6px; border-bottom: 1px solid ${COLORS.border}; vertical-align: middle; }
  .prog-table tr:last-child td { border-bottom: none; }
  .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid ${COLORS.border}; border-top-color: ${COLORS.accent}; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("plan");
  const [profile, setProfile] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [weekLogs, setWeekLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planResult, setPlanResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, sh, wl] = await Promise.all([
          storage.get("athlete_profile"),
          storage.get("athlete_sessionHistory"),
          storage.get("athlete_weekLogs"),
        ]);
        if (p && typeof p === "object") setProfile(p);
        if (Array.isArray(sh)) setSessionHistory(sh);
        if (Array.isArray(wl)) setWeekLogs(wl);
      } catch (e) {
        console.error("Load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveProfile = useCallback(async (p) => {
    setProfile(p);
    await storage.set("athlete_profile", p);
  }, []);

  const saveHistory = useCallback(async (h) => {
    setSessionHistory(h);
    await storage.set("athlete_sessionHistory", h);
  }, []);

  const saveWeekLogs = useCallback(async (w) => {
    setWeekLogs(w);
    await storage.set("athlete_weekLogs", w);
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: COLORS.bg }}>
      <style>{css}</style>
      <div className="spinner" />
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <h1>Athlete OS</h1>
          <p>Training Intelligence · {profile?.name || "Setup your athlete profile"} · Age 12 · Tennis + Cheer</p>
        </div>

        <div className="tabs">
          {[
            { id: "plan", label: "🎯 Sunday Plan" },
            { id: "log", label: "📋 Log Activity" },
            { id: "strength", label: "💪 Log Strength" },
            { id: "progress", label: "📈 Progress" },
            { id: "profile", label: "⚙️ Profile" },
          ].map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "plan" && <PlanTab profile={profile} weekLogs={weekLogs} sessionHistory={sessionHistory} aiLoading={aiLoading} setAiLoading={setAiLoading} planResult={planResult} setPlanResult={setPlanResult} />}
        {tab === "log" && <LogTab weekLogs={weekLogs} saveWeekLogs={saveWeekLogs} />}
        {tab === "strength" && <StrengthLogTab sessionHistory={sessionHistory} saveHistory={saveHistory} planResult={planResult} />}
        {tab === "progress" && <ProgressTab sessionHistory={sessionHistory} weekLogs={weekLogs} />}
        {tab === "profile" && <ProfileTab profile={profile} saveProfile={saveProfile} />}
      </div>
    </>
  );
}

// ─── PLAN TAB ─────────────────────────────────────────────────────────────────
function PlanTab({ profile, weekLogs, sessionHistory, aiLoading, setAiLoading, planResult, setPlanResult }) {
  const [tournament, setTournament] = useState("none");
  const [sessionTime, setSessionTime] = useState("10:00");
  const [aiInsight, setAiInsight] = useState("");

  const gaps = profile?.gaps || [];

  const handleGenerate = async () => {
    const result = generatePlan(gaps, weekLogs, tournament, sessionTime, sessionHistory);
    setPlanResult(result);

    setAiLoading(true);
    setAiInsight("");
    try {
      const weekLoad = result.weekLoad;
      const prompt = `You are a youth sports conditioning coach. A 12-year-old female tennis and cheerleading athlete is doing Sunday strength training.

Weekly load score: ${Math.round(weekLoad)} (0-150=low, 150-300=medium, 300+=high)
Tournament status: ${tournament}
Session time: ${sessionTime}
Tennis gaps to develop: ${gaps.join(", ") || "general athletic development"}
Plan modifiers applied: ${result.modNotes.join(" | ")}
Exercises planned: ${result.plan.map(e => e.name).join(", ")}

Write a SHORT (4-6 sentences) coach's briefing for today's session. Be specific, motivating, and practical. Mention what today focuses on and why. Flag any safety reminders. Tone: direct, warm, professional coach talking to a parent/athlete. NO bullet points, just paragraph text.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      setAiInsight(text);
    } catch {}
    setAiLoading(false);
  };

  const weekLoad = calculateWeekLoad(weekLogs);
  const loadPct = Math.min(100, (weekLoad / 400) * 100);
  const loadColor = weekLoad < 150 ? COLORS.accent : weekLoad < 300 ? COLORS.yellow : COLORS.red;
  const loadLabel = weekLoad < 150 ? "Low" : weekLoad < 300 ? "Medium" : "High";

  return (
    <div>
      <div className="card">
        <div className="card-title">📊 This Week's Load</div>
        <div className="flex-between">
          <span style={{ fontSize: "0.85rem", color: COLORS.muted }}>Tennis + Cheer accumulated load</span>
          <span className="badge" style={{ background: `${loadColor}22`, color: loadColor }}>{loadLabel}</span>
        </div>
        <div className="load-bar-wrap mt8">
          <div className="load-bar" style={{ width: `${loadPct}%`, background: loadColor }} />
        </div>
        <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginTop: 6 }}>
          {weekLogs.length} sessions logged this week · Load score: {Math.round(weekLoad)}
        </div>
      </div>

      <div className="card">
        <div className="card-title">🎾 Generate Sunday Plan</div>
        <div className="grid2">
          <div>
            <div className="label">Tournament Status</div>
            <select value={tournament} onChange={e => setTournament(e.target.value)}>
              <option value="none">Normal week</option>
              <option value="pre">Pre-tournament (next 7 days)</option>
              <option value="week_of">Tournament this week</option>
              <option value="post_easy">Post-tournament (easy)</option>
              <option value="post_hard">Post-tournament (heavy)</option>
            </select>
          </div>
          <div>
            <div className="label">Session Time (Sunday)</div>
            <input type="time" value={sessionTime} onChange={e => setSessionTime(e.target.value)} />
          </div>
        </div>
        <div className="mt16">
          <div className="label">Tennis Gaps Targeted (from profile)</div>
          {gaps.length === 0
            ? <div style={{ color: COLORS.muted, fontSize: "0.85rem" }}>No gaps set — go to Profile tab to add tennis weaknesses</div>
            : <div className="gap-checkbox" style={{ marginTop: 8 }}>
                {gaps.map(g => {
                  const gd = TENNIS_GAPS.find(x => x.id === g);
                  return <span key={g} className="badge badge-green">{gd?.label || g}</span>;
                })}
              </div>
          }
        </div>
        <div className="mt16">
          <button className="btn btn-primary" onClick={handleGenerate} style={{ width: "100%", justifyContent: "center", padding: "13px" }}>
            ⚡ Generate This Sunday's Plan
          </button>
        </div>
      </div>

      {planResult && (
        <>
          {planResult.modNotes.length > 0 && (
            <div>
              {planResult.modNotes.map((n, i) => (
                <div key={i} className={`note-box ${n.includes("⚠️") || n.includes("🌙") ? "warn" : n.includes("🎾") ? "danger" : ""}`}>
                  {n}
                </div>
              ))}
            </div>
          )}

          {(aiLoading || aiInsight) && (
            <div className="card" style={{ borderColor: COLORS.accentDim }}>
              <div className="card-title">🧠 Coach's Briefing</div>
              {aiLoading
                ? <div className="flex" style={{ gap: 10 }}><div className="spinner" /> <span style={{ color: COLORS.muted, fontSize: "0.85rem" }}>Analyzing session…</span></div>
                : <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: COLORS.text }}>{aiInsight}</p>
              }
            </div>
          )}

          <div className="card">
            <div className="card-title">📋 Today's Session — {planResult.plan.length} Exercises</div>
            {planResult.plan.map((ex, i) => {
              const p = ex.prescribed;
              const isReps = ex.id !== "dead_hang" && ex.id !== "wall_squat";
              return (
                <div key={ex.id} className="ex-row">
                  <div className="ex-num">{String(i + 1).padStart(2, "0")}</div>
                  <div style={{ flex: 1 }}>
                    <div className="ex-name">{ex.name}</div>
                    <div className="ex-meta">
                      <span className={`badge badge-${ex.ageFlag}`}>{ex.ageFlag === "green" ? "✓ Safe" : ex.ageFlag === "yellow" ? "⚠ Form check" : "⛔ Advanced"}</span>
                      <span className="badge badge-gray">{ex.cat}</span>
                      <span style={{ fontSize: "0.72rem" }}>{ex.movement}</span>
                    </div>
                    {p.note && p.note !== "Warmup" && <div className="ex-note mt8">→ {p.note}</div>}
                    {p.weight && <div className="ex-note">Weight: {p.weight}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="ex-prescription">{p.sets}×{p.reps}{!isReps ? "s" : ""}</div>
                    <div style={{ fontSize: "0.7rem", color: COLORS.muted }}>sets × {isReps ? "reps" : "sec"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── LOG ACTIVITY TAB ─────────────────────────────────────────────────────────
function LogTab({ weekLogs, saveWeekLogs }) {
  const [type, setType] = useState("tennis");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState(3);
  const [focus, setFocus] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [saved, setSaved] = useState(false);

  const TENNIS_FOCUS = ["Baseline rallying", "Serve practice", "Footwork / movement", "Match play", "Volley / net", "Conditioning", "Full practice"];
  const CHEER_FOCUS = ["Stunt practice", "Tumbling", "Dance / routine", "Competition prep", "Conditioning", "Full practice"];

  const handleLog = () => {
    if (!duration) return;
    const log = { id: Date.now(), type, duration: parseInt(duration), intensity, focus, date, time };
    saveWeekLogs([...weekLogs, log]);
    setSaved(true);
    setDuration(""); setFocus(""); setSaved(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const thisWeek = weekLogs.filter(l => new Date(l.date) >= thisWeekStart);

  return (
    <div>
      <div className="card">
        <div className="card-title">➕ Log Tennis or Cheer Session</div>
        <div className="grid2">
          <div>
            <div className="label">Activity Type</div>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="tennis">🎾 Tennis</option>
              <option value="cheer">📣 Cheerleading</option>
            </select>
          </div>
          <div>
            <div className="label">Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Duration (minutes)</div>
            <input type="number" placeholder="e.g. 90" value={duration} onChange={e => setDuration(e.target.value)} min="10" max="300" />
          </div>
          <div>
            <div className="label">Time of Day</div>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        <div className="mt16">
          <div className="label">Intensity</div>
          <div className="star-row mt8">
            {[1,2,3,4,5].map(n => (
              <span key={n} className={`star ${intensity >= n ? "lit" : ""}`} onClick={() => setIntensity(n)}>
                {intensity >= n ? "🔥" : "○"}
              </span>
            ))}
            <span style={{ color: COLORS.muted, fontSize: "0.8rem", marginLeft: 6 }}>
              {["","Very light","Light","Moderate","Hard","Max effort"][intensity]}
            </span>
          </div>
        </div>

        <div className="mt16">
          <div className="label">Session Focus</div>
          <select value={focus} onChange={e => setFocus(e.target.value)}>
            <option value="">Select focus…</option>
            {(type === "tennis" ? TENNIS_FOCUS : CHEER_FOCUS).map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary mt16" onClick={handleLog} style={{ width: "100%", justifyContent: "center", padding: "12px" }}>
          {saved ? "✓ Logged!" : "Save Session"}
        </button>
      </div>

      <div className="card">
        <div className="card-title">📅 This Week's Activity</div>
        {thisWeek.length === 0
          ? <div className="empty">No sessions logged this week yet</div>
          : thisWeek.sort((a,b) => new Date(b.date)-new Date(a.date)).map(log => (
              <div key={log.id} className="log-item">
                <div>
                  <span className={`pill pill-${log.type}`}>{log.type === "tennis" ? "🎾 Tennis" : "📣 Cheer"}</span>
                  <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>{log.focus || "Session"}</span>
                  <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>{log.date} · {log.time} · {log.duration}min</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem" }}>{"🔥".repeat(log.intensity)}</span>
                  <button className="btn btn-danger btn-sm" onClick={() => saveWeekLogs(weekLogs.filter(l => l.id !== log.id))}>✕</button>
                </div>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ─── STRENGTH LOG TAB ─────────────────────────────────────────────────────────
function StrengthLogTab({ sessionHistory, saveHistory, planResult }) {
  const [logExercises, setLogExercises] = useState([]);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [sessionTimeLog, setSessionTimeLog] = useState(new Date().toTimeString().slice(0, 5));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (planResult?.plan && logExercises.length === 0) {
      setLogExercises(planResult.plan.map(ex => ({
        id: ex.id, name: ex.name,
        sets: ex.prescribed?.sets || ex.defaultSets,
        reps: ex.prescribed?.reps || ex.defaultReps,
        weight: "", difficulty: 3, completed: true, notes: ""
      })));
    }
  }, [planResult]);

  const addExercise = () => {
    setLogExercises(prev => [...prev, { id: `custom_${Date.now()}`, name: "", sets: 2, reps: 10, weight: "", difficulty: 3, completed: true, notes: "" }]);
  };

  const updateEx = (idx, field, val) => {
    setLogExercises(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  };

  const handleSave = () => {
    const session = {
      id: Date.now(), date: sessionDate, time: sessionTimeLog,
      exercises: logExercises.filter(e => e.name)
    };
    saveHistory([...sessionHistory, session]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">💪 Log Strength Session</div>
        <div className="grid2">
          <div>
            <div className="label">Date</div>
            <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Session Time</div>
            <input type="time" value={sessionTimeLog} onChange={e => setSessionTimeLog(e.target.value)} />
          </div>
        </div>
        {planResult && <div className="note-box mt16">✓ Pre-filled from today's generated plan. Adjust as needed.</div>}
      </div>

      {logExercises.map((ex, idx) => (
        <div key={idx} className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>
              {ex.name || (
                <input placeholder="Exercise name…" value={ex.name} onChange={e => updateEx(idx, "name", e.target.value)} style={{ fontWeight: 600 }} />
              )}
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => setLogExercises(prev => prev.filter((_, i) => i !== idx))}>✕</button>
          </div>
          <div className="grid2">
            <div>
              <div className="label">Sets Done</div>
              <input type="number" value={ex.sets} onChange={e => updateEx(idx, "sets", e.target.value)} min="1" max="8" />
            </div>
            <div>
              <div className="label">Reps Done</div>
              <input type="number" value={ex.reps} onChange={e => updateEx(idx, "reps", e.target.value)} min="1" max="50" />
            </div>
            <div>
              <div className="label">Weight (kg, optional)</div>
              <input placeholder="e.g. 4kg or bodyweight" value={ex.weight} onChange={e => updateEx(idx, "weight", e.target.value)} />
            </div>
            <div>
              <div className="label">Completed all sets?</div>
              <select value={ex.completed ? "yes" : "no"} onChange={e => updateEx(idx, "completed", e.target.value === "yes")}>
                <option value="yes">✅ Yes, completed</option>
                <option value="no">⚠️ No, stopped early</option>
              </select>
            </div>
          </div>
          <div className="mt16">
            <div className="label">Difficulty</div>
            <div className="star-row mt8">
              {[1,2,3,4,5].map(n => (
                <span key={n} className={`star ${ex.difficulty >= n ? "lit" : ""}`} onClick={() => updateEx(idx, "difficulty", n)}>
                  {ex.difficulty >= n ? "⭐" : "○"}
                </span>
              ))}
              <span style={{ color: COLORS.muted, fontSize: "0.8rem", marginLeft: 6 }}>
                {["","Very easy","Easy","Just right","Hard","Max effort"][ex.difficulty]}
              </span>
            </div>
          </div>
        </div>
      ))}

      <div className="flex" style={{ gap: 10, marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={addExercise} style={{ flex: 1, justifyContent: "center" }}>+ Add Exercise</button>
      </div>
      <button className="btn btn-primary" onClick={handleSave} style={{ width: "100%", justifyContent: "center", padding: "13px" }}>
        {saved ? "✓ Session Saved!" : "Save Strength Session"}
      </button>
    </div>
  );
}

// ─── PROGRESS TAB ────────────────────────────────────────────────────────────
function ProgressTab({ sessionHistory, weekLogs }) {
  const [selected, setSelected] = useState(null);

  const exMap = {};
  sessionHistory.forEach(session => {
    (session.exercises || []).forEach(ex => {
      if (!exMap[ex.id]) exMap[ex.id] = { name: ex.name, entries: [] };
      exMap[ex.id].entries.push({ date: session.date, sets: ex.sets, reps: ex.reps, weight: ex.weight, difficulty: ex.difficulty, completed: ex.completed });
    });
  });

  const exIds = Object.keys(exMap);
  const totalSessions = sessionHistory.length;
  const totalTennisHours = weekLogs.filter(l => l.type === "tennis").reduce((a, l) => a + l.duration, 0);
  const totalCheerHours = weekLogs.filter(l => l.type === "cheer").reduce((a, l) => a + l.duration, 0);

  return (
    <div>
      <div className="card">
        <div className="card-title">📈 Overview</div>
        <div className="grid2">
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.accent }}>{totalSessions}</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Strength Sessions</div>
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.tennis }}>{Math.round(totalTennisHours / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Tennis Logged</div>
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.cheer }}>{Math.round(totalCheerHours / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Cheer Logged</div>
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.yellow }}>{exIds.length}</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Exercises Tracked</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🏋️ Exercise Progression</div>
        {exIds.length === 0
          ? <div className="empty">Log strength sessions to see progression data</div>
          : (
            <>
              <div className="label">Select Exercise</div>
              <select value={selected || ""} onChange={e => setSelected(e.target.value)} style={{ marginTop: 6 }}>
                <option value="">Choose exercise…</option>
                {exIds.map(id => <option key={id} value={id}>{exMap[id].name}</option>)}
              </select>

              {selected && exMap[selected] && (
                <div style={{ marginTop: 16 }}>
                  <table className="prog-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Sets × Reps</th>
                        <th>Weight</th>
                        <th>Difficulty</th>
                        <th>Done?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exMap[selected].entries.sort((a,b) => new Date(b.date)-new Date(a.date)).map((e, i) => (
                        <tr key={i}>
                          <td style={{ color: COLORS.muted }}>{e.date}</td>
                          <td><strong>{e.sets}×{e.reps}</strong></td>
                          <td style={{ color: COLORS.muted }}>{e.weight || "—"}</td>
                          <td>{"⭐".repeat(e.difficulty || 0)}</td>
                          <td>{e.completed ? <span style={{color:COLORS.accent}}>✓</span> : <span style={{color:COLORS.red}}>✗</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        }
      </div>

      <div className="card">
        <div className="card-title">📅 Session History</div>
        {sessionHistory.length === 0
          ? <div className="empty">No strength sessions logged yet</div>
          : sessionHistory.sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0, 10).map(s => (
              <div key={s.id} className="log-item">
                <div>
                  <span className="pill pill-strength">💪 Strength</span>
                  <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>{s.exercises?.length || 0} exercises</span>
                  <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>{s.date} · {s.time}</div>
                </div>
                <div style={{ color: COLORS.accent, fontSize: "0.8rem" }}>{s.exercises?.map(e => e.name).slice(0,3).join(", ")}{s.exercises?.length > 3 ? "…" : ""}</div>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab({ profile, saveProfile }) {
  const [form, setForm] = useState(() => profile || {
    name: "", dob: "", gaps: [],
    tennisSchedule: "", cheerSchedule: "",
    coachNotes: ""
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (profile && profile.name) {
      setForm(profile);
    }
  }, [profile]);

  const toggleGap = (id) => {
    const current = form.gaps || [];
    const next = current.includes(id) ? current.filter(g => g !== id) : [...current, id];
    setForm(f => ({ ...f, gaps: next }));
  };

  const handleSave = async () => {
    setSaved(false); setSaveError(false);
    try {
      await saveProfile(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch(e) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">👤 Athlete Profile</div>
        <div className="grid2">
          <div>
            <div className="label">Athlete Name</div>
            <input placeholder="e.g. Sofia" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <div className="label">Date of Birth</div>
            <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🗓️ Weekly Schedule</div>
        <div className="grid2">
          <div>
            <div className="label">Tennis Schedule</div>
            <input placeholder="e.g. Mon, Wed, Fri — 2hrs each" value={form.tennisSchedule} onChange={e => setForm(f => ({ ...f, tennisSchedule: e.target.value }))} />
          </div>
          <div>
            <div className="label">Cheerleading Schedule</div>
            <input placeholder="e.g. Tue, Thu — 1.5hrs each" value={form.cheerSchedule} onChange={e => setForm(f => ({ ...f, cheerSchedule: e.target.value }))} />
          </div>
        </div>
        <div className="note-box mt16">
          💡 These are for reference. The app uses actual logged sessions for load calculations.
        </div>
      </div>

      <div className="card">
        <div className="card-title">🎾 Tennis Gaps to Develop</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>Select all areas where she needs improvement. The plan generator will prioritize exercises that target these gaps.</p>
        <div className="gap-checkbox">
          {TENNIS_GAPS.map(g => (
            <button key={g.id} className={`gap-chip ${(form.gaps||[]).includes(g.id) ? "selected" : ""}`} onClick={() => toggleGap(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
        {(form.gaps||[]).length > 0 && (
          <div style={{ marginTop: 16 }}>
            {(form.gaps||[]).map(id => {
              const g = TENNIS_GAPS.find(x => x.id === id);
              return g ? (
                <div key={id} style={{ fontSize: "0.78rem", color: COLORS.muted, marginBottom: 4 }}>
                  <span style={{ color: COLORS.tennis }}>▸ {g.label}:</span> {g.desc}
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">📝 Coach / Parent Notes</div>
        <textarea rows={4} placeholder="Any injuries, form concerns, exercises to avoid, or special instructions…" value={form.coachNotes} onChange={e => setForm(f => ({ ...f, coachNotes: e.target.value }))} />
      </div>

      <button className="btn btn-primary" onClick={handleSave} style={{ width: "100%", justifyContent: "center", padding: "13px" }}>
        {saved ? "✓ Profile Saved!" : saveError ? "⚠ Save Failed — Try Again" : "Save Profile"}
      </button>
    </div>
  );
}
