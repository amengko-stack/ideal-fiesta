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
  { id: "goblet_squat",       name: "Goblet Squat",               cat: "Strength",    movement: "Bilateral Lower",   tennis: ["lateral_power","deceleration"],           ageFlag: "green",  progressionChain: ["bw_squat","goblet_squat","front_squat"], defaultSets: 2, defaultReps: 10 },
  { id: "fwd_lunge",          name: "Forward Lunge",              cat: "Strength",    movement: "Single-Leg",        tennis: ["deceleration","linear_speed"],            ageFlag: "green",  progressionChain: ["fwd_lunge","reverse_lunge","weighted_lunge"], defaultSets: 2, defaultReps: 10 },
  { id: "reverse_lunge",      name: "Reverse Lunge",              cat: "Strength",    movement: "Single-Leg",        tennis: ["deceleration","lateral_power"],           ageFlag: "green",  progressionChain: ["fwd_lunge","reverse_lunge","weighted_lunge"], defaultSets: 2, defaultReps: 10 },
  { id: "side_lunge",         name: "Side Lunge",                 cat: "Strength",    movement: "Lateral",           tennis: ["lateral_agility","lateral_power"],        ageFlag: "green",  progressionChain: ["side_lunge","weighted_side_lunge"], defaultSets: 2, defaultReps: 10 },
  { id: "nordic_curl",        name: "Nordic Curl",                cat: "Strength",    movement: "Single-Leg",        tennis: ["deceleration","hamstring"],               ageFlag: "yellow", progressionChain: ["bridge","nordic_curl_eccentric","nordic_curl"], defaultSets: 2, defaultReps: 5 },
  { id: "hip_hinge",          name: "Hip Hinge",                  cat: "Strength",    movement: "Bilateral Lower",   tennis: ["rotational_power","hamstring"],           ageFlag: "green",  progressionChain: ["hip_hinge","kb_swing"], defaultSets: 2, defaultReps: 10 },
  { id: "calf_raise",         name: "Calf Raise",                 cat: "Strength",    movement: "Bilateral Lower",   tennis: ["first_step","linear_speed"],              ageFlag: "green",  progressionChain: ["calf_raise","sl_calf_raise"], defaultSets: 2, defaultReps: 10 },
  { id: "bridge",             name: "Glute Bridge",               cat: "Strength",    movement: "Bilateral Lower",   tennis: ["rotational_power","stability"],           ageFlag: "green",  progressionChain: ["bridge","single_leg_bridge"], defaultSets: 2, defaultReps: 10 },
  { id: "wall_squat",         name: "Isometric Wall Squat",       cat: "Strength",    movement: "Bilateral Lower",   tennis: ["deceleration","stability"],               ageFlag: "green",  progressionChain: ["wall_squat","goblet_squat"], defaultSets: 2, defaultReps: 30 },
  { id: "step_up",            name: "Step Up",                    cat: "Strength",    movement: "Single-Leg",        tennis: ["first_step","deceleration","stability"],  ageFlag: "green",  progressionChain: ["step_up"], defaultSets: 2, defaultReps: 10 },
  { id: "sl_rdl",             name: "Single Leg RDL",             cat: "Strength",    movement: "Single-Leg",        tennis: ["hamstring","stability","deceleration"],   ageFlag: "green",  progressionChain: ["sl_rdl"], defaultSets: 2, defaultReps: 8 },
  { id: "bulgarian_split",    name: "Bulgarian Split Squat",      cat: "Strength",    movement: "Single-Leg",        tennis: ["lateral_power","deceleration","stability"],ageFlag: "yellow", progressionChain: ["reverse_lunge","bulgarian_split"], defaultSets: 2, defaultReps: 8 },
  { id: "lateral_band_walk",  name: "Lateral Band Walk",          cat: "Strength",    movement: "Lateral",           tennis: ["lateral_agility","lateral_power","stability"],ageFlag:"green", progressionChain: ["lateral_band_walk"], defaultSets: 2, defaultReps: 15 },
  // UPPER BODY
  { id: "floor_pushup",       name: "Floor Push Up",              cat: "Strength",    movement: "Upper Push",        tennis: ["serve_power","stability"],                ageFlag: "green",  progressionChain: ["floor_pushup","push_press"], defaultSets: 2, defaultReps: 10 },
  { id: "push_press",         name: "Push Press",                 cat: "Strength",    movement: "Upper Push",        tennis: ["serve_power","rotational_power"],         ageFlag: "green",  progressionChain: ["floor_pushup","push_press"], defaultSets: 2, defaultReps: 10 },
  { id: "pullup",             name: "Pull Up",                    cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "yellow", progressionChain: ["dead_hang","reverse_pullup","pullup"], defaultSets: 2, defaultReps: 8 },
  { id: "reverse_pullup",     name: "Reverse Pull Up",            cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability"],                    ageFlag: "green",  progressionChain: ["dead_hang","reverse_pullup","pullup"], defaultSets: 2, defaultReps: 10 },
  { id: "band_facepull",      name: "Band Face Pull",             cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "green",  progressionChain: ["band_facepull","pullup"], defaultSets: 2, defaultReps: 10 },
  { id: "dead_hang",          name: "Dead Hang",                  cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","grip"],              ageFlag: "green",  progressionChain: ["dead_hang","reverse_pullup"], defaultSets: 1, defaultReps: 60 },
  { id: "band_pull_apart",    name: "Band Pull Apart",            cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "green",  progressionChain: ["band_pull_apart"], defaultSets: 2, defaultReps: 15 },
  { id: "wall_angels",        name: "Wall Angels",                cat: "Mobility",    movement: "Upper Push",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "green",  progressionChain: ["wall_angels"], defaultSets: 2, defaultReps: 10 },
  // CORE
  { id: "dead_bug",           name: "Dead Bug",                   cat: "Core",        movement: "Anti-Extension",    tennis: ["core_stability","rotational_power"],      ageFlag: "green",  progressionChain: ["dead_bug"], defaultSets: 2, defaultReps: 10 },
  { id: "hip_flexor",         name: "Hip Flexor Raise",           cat: "Core",        movement: "Hip Flexion",       tennis: ["first_step","core_stability"],            ageFlag: "green",  progressionChain: ["hip_flexor"], defaultSets: 2, defaultReps: 10 },
  { id: "plank",              name: "Plank Hold",                 cat: "Core",        movement: "Anti-Extension",    tennis: ["core_stability","stability"],             ageFlag: "green",  progressionChain: ["plank"], defaultSets: 3, defaultReps: 30 },
  { id: "side_plank",         name: "Side Plank",                 cat: "Core",        movement: "Anti-Lateral",      tennis: ["core_stability","lateral_power"],         ageFlag: "green",  progressionChain: ["side_plank"], defaultSets: 2, defaultReps: 20 },
  { id: "russian_twist",      name: "Russian Twist",              cat: "Core",        movement: "Rotational",        tennis: ["rotational_power","core_stability"],      ageFlag: "green",  progressionChain: ["russian_twist"], defaultSets: 2, defaultReps: 16 },
  { id: "pallof_press",       name: "Pallof Press",               cat: "Core",        movement: "Anti-Rotation",     tennis: ["core_stability","rotational_power"],      ageFlag: "green",  progressionChain: ["pallof_press"], defaultSets: 2, defaultReps: 10 },
  // POWER
  { id: "kb_swing",           name: "Kettlebell Swing",           cat: "Power",       movement: "Bilateral Lower",   tennis: ["rotational_power","first_step"],          ageFlag: "yellow", progressionChain: ["hip_hinge","kb_swing"], defaultSets: 2, defaultReps: 10 },
  { id: "slam_ball",          name: "Slam Ball",                  cat: "Power",       movement: "Rotational",        tennis: ["rotational_power","serve_power"],         ageFlag: "green",  progressionChain: ["slam_ball"], defaultSets: 2, defaultReps: 8 },
  { id: "med_ball_throw",     name: "Medicine Ball Throw",        cat: "Power",       movement: "Rotational",        tennis: ["rotational_power","serve_power"],         ageFlag: "green",  progressionChain: ["med_ball_throw"], defaultSets: 2, defaultReps: 10 },
  { id: "med_ball_chest",     name: "Medicine Ball Chest Pass",   cat: "Power",       movement: "Upper Push",        tennis: ["serve_power","rotational_power"],         ageFlag: "green",  progressionChain: ["med_ball_chest"], defaultSets: 2, defaultReps: 8 },
  { id: "broad_jump",         name: "Broad Jump",                 cat: "Power",       movement: "Linear",            tennis: ["first_step","linear_speed"],              ageFlag: "green",  progressionChain: ["broad_jump","broad_jump_sl"], defaultSets: 2, defaultReps: 6 },
  // PLYOMETRICS
  { id: "box_jump",           name: "Box Jump",                   cat: "Plyometrics", movement: "Vertical",          tennis: ["first_step","deceleration"],              ageFlag: "green",  progressionChain: ["box_jump","box_jump_sl"], defaultSets: 2, defaultReps: 8 },
  { id: "box_jump_sl",        name: "Box Jump — Land Single Leg", cat: "Plyometrics", movement: "Vertical",          tennis: ["deceleration","stability"],               ageFlag: "yellow", progressionChain: ["box_jump","box_jump_sl"], defaultSets: 2, defaultReps: 6 },
  { id: "skater_jump",        name: "Skater Jumps",               cat: "Plyometrics", movement: "Lateral",           tennis: ["lateral_agility","lateral_power"],        ageFlag: "green",  progressionChain: ["skater_jump"], defaultSets: 2, defaultReps: 8 },
  { id: "ski_jump",           name: "Ski / Skate Jump",           cat: "Plyometrics", movement: "Lateral",           tennis: ["lateral_agility","first_step"],           ageFlag: "green",  progressionChain: ["ski_jump"], defaultSets: 2, defaultReps: 8 },
  { id: "lateral_hops",       name: "Lateral Side-to-Side Hops", cat: "Plyometrics", movement: "Lateral",           tennis: ["lateral_agility","first_step"],           ageFlag: "green",  progressionChain: ["lateral_hops"], defaultSets: 2, defaultReps: 20 },
  { id: "pogo_jumps",         name: "Linear Pogo Jumps",          cat: "Plyometrics", movement: "Linear",            tennis: ["linear_speed","first_step"],              ageFlag: "green",  progressionChain: ["pogo_jumps"], defaultSets: 2, defaultReps: 10 },
  { id: "broad_jump_sl",      name: "Single Leg Broad Jump",      cat: "Plyometrics", movement: "Linear",            tennis: ["linear_speed","deceleration"],            ageFlag: "yellow", progressionChain: ["broad_jump_sl"], defaultSets: 2, defaultReps: 4 },
  { id: "depth_jump",         name: "Depth Jump",                 cat: "Plyometrics", movement: "Vertical",          tennis: ["first_step","deceleration","lateral_power"],ageFlag:"yellow", progressionChain: ["box_jump","depth_jump"], defaultSets: 2, defaultReps: 6 },
  { id: "jump_rope",          name: "Jump Rope",                  cat: "Plyometrics", movement: "Linear",            tennis: ["footwork","first_step","conditioning"],   ageFlag: "green",  progressionChain: ["jump_rope"], defaultSets: 3, defaultReps: 1 },
  // AGILITY & CONDITIONING
  { id: "ladder",             name: "Ladder Coordination",        cat: "Agility",     movement: "Multi-Directional", tennis: ["lateral_agility","first_step","footwork"],ageFlag: "green",  progressionChain: ["ladder"], defaultSets: 3, defaultReps: 1 },
  { id: "crab_walk",          name: "Crab Walk",                  cat: "Agility",     movement: "Lateral",           tennis: ["lateral_agility","stability"],            ageFlag: "green",  progressionChain: ["crab_walk"], defaultSets: 3, defaultReps: 5 },
  { id: "bear_crawl",         name: "Bear Crawl",                 cat: "Agility",     movement: "Multi-Directional", tennis: ["core_stability","footwork","conditioning"],ageFlag: "green",  progressionChain: ["bear_crawl"], defaultSets: 3, defaultReps: 5 },
  { id: "t_drill",            name: "T-Drill",                    cat: "Agility",     movement: "Multi-Directional", tennis: ["lateral_agility","first_step","footwork"],ageFlag: "green",  progressionChain: ["t_drill"], defaultSets: 3, defaultReps: 1 },
  { id: "cone_drill",         name: "Cone Drill",                 cat: "Agility",     movement: "Multi-Directional", tennis: ["lateral_agility","deceleration","footwork"],ageFlag:"green",  progressionChain: ["cone_drill"], defaultSets: 3, defaultReps: 1 },
  { id: "parachute_run",      name: "Parachute Hill Run",         cat: "Conditioning",movement: "Linear",            tennis: ["linear_speed","conditioning"],            ageFlag: "green",  progressionChain: ["parachute_run"], defaultSets: 3, defaultReps: 1 },
  { id: "shuttle_run",        name: "Shuttle Run",                cat: "Conditioning",movement: "Linear",            tennis: ["linear_speed","deceleration","conditioning"],ageFlag:"green", progressionChain: ["shuttle_run"], defaultSets: 4, defaultReps: 1 },
  // MOBILITY / WARMUP
  { id: "squat_mobility",     name: "Squat Mobility",             cat: "Mobility",    movement: "Bilateral Lower",   tennis: ["deceleration","stability"],               ageFlag: "green",  progressionChain: ["squat_mobility"], defaultSets: 2, defaultReps: 10 },
  { id: "hip_raise",          name: "Hip Raise",                  cat: "Mobility",    movement: "Hip Flexion",       tennis: ["core_stability","first_step"],            ageFlag: "green",  progressionChain: ["hip_raise"], defaultSets: 2, defaultReps: 10 },
  { id: "leg_lateral_raise",  name: "Leg Lateral Raise",          cat: "Mobility",    movement: "Lateral",           tennis: ["lateral_agility","stability"],            ageFlag: "green",  progressionChain: ["leg_lateral_raise"], defaultSets: 2, defaultReps: 10 },
  { id: "open_book",          name: "Side-Lying Open Book",       cat: "Mobility",    movement: "Rotational",        tennis: ["rotational_power","shoulder_stability"],  ageFlag: "green",  progressionChain: ["open_book"], defaultSets: 1, defaultReps: 10 },
  { id: "inchworm",           name: "Inchworm",                   cat: "Mobility",    movement: "Multi-Directional", tennis: ["hamstring","core_stability"],             ageFlag: "green",  progressionChain: ["inchworm"], defaultSets: 2, defaultReps: 8 },
  { id: "worlds_greatest",    name: "World's Greatest Stretch",   cat: "Mobility",    movement: "Multi-Directional", tennis: ["lateral_agility","rotational_power","stability"],ageFlag:"green",progressionChain:["worlds_greatest"], defaultSets: 1, defaultReps: 6 },
  { id: "hip_circles",        name: "Hip Circles",                cat: "Mobility",    movement: "Rotational",        tennis: ["rotational_power","lateral_agility"],     ageFlag: "green",  progressionChain: ["hip_circles"], defaultSets: 1, defaultReps: 10 },
  { id: "ankle_circles",      name: "Ankle Circles & Hops",       cat: "Mobility",    movement: "Bilateral Lower",   tennis: ["first_step","footwork"],                 ageFlag: "green",  progressionChain: ["ankle_circles"], defaultSets: 1, defaultReps: 10 },
  // RECOVERY
  { id: "foam_rolling",       name: "Foam Rolling",               cat: "Recovery",    movement: "Recovery",          tennis: ["recovery"],                              ageFlag: "green",  progressionChain: ["foam_rolling"], defaultSets: 1, defaultReps: 1 },
  { id: "static_stretch",     name: "Static Stretching",          cat: "Recovery",    movement: "Recovery",          tennis: ["recovery","hamstring"],                  ageFlag: "green",  progressionChain: ["static_stretch"], defaultSets: 1, defaultReps: 1 },
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

function getLoadContext(weekLoad, tournamentStatus, sessionTime) {
  const notes = [];
  if (tournamentStatus === "pre")       notes.push("Pre-tournament (next 7 days): reduce volume by ~35%, use only familiar exercises, no new movements");
  if (tournamentStatus === "week_of")   notes.push("Tournament THIS week: activation only, max 6 exercises, very low volume, nothing that causes soreness");
  if (tournamentStatus === "post_hard") notes.push("Post heavy tournament: reduce volume by ~25%, prioritise mobility and recovery exercises");
  if (tournamentStatus === "post_easy") notes.push("Post light tournament: normal plan, monitor energy");
  if (weekLoad > 300) notes.push("HIGH weekly load from tennis+cheer: reduce total sets, protect legs");
  else if (weekLoad < 100) notes.push("Light training week: can push volume and introduce progressive overload");
  if (sessionTime) {
    const h = parseInt(sessionTime.split(":")[0]);
    if (h < 10) notes.push("Morning session: CNS not fully activated, add extra warmup time");
    if (h >= 19) notes.push("Evening session: avoid high-intensity plyometrics after 7pm for sleep quality");
  }
  return notes;
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
  const [aiError, setAiError] = useState("");

  const gaps = profile?.gaps || [];

  const handleGenerate = async () => {
    setAiLoading(true);
    setAiError("");
    setPlanResult(null);

    const weekLoad = calculateWeekLoad(weekLogs);
    const loadNotes = getLoadContext(weekLoad, tournament, sessionTime);

    // Format recent session history for AI context
    const recentSessions = [...(sessionHistory || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6)
      .map(s => ({
        date: s.date,
        exercises: (s.exercises || []).map(e => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight || null,
          difficulty: e.difficulty, // 1=very easy, 2=easy, 3=just right, 4=hard, 5=max
          completed: e.completed,
        }))
      }));

    // Familiar exercises reference list (what she's been doing)
    const familiarExercises = EXERCISE_DB.map(e => e.name).join(", ");

    const gapLabels = gaps.map(g => TENNIS_GAPS.find(x => x.id === g)?.label || g);

    const prompt = `You are an expert youth sports conditioning coach. Design a complete Sunday strength training session for this athlete.

ATHLETE:
- Age: 12, Female
- Sports: Tennis (primary) + Cheerleading
- Tennis areas to develop: ${gapLabels.join(", ") || "general athletic development"}

THIS WEEK'S CONTEXT:
- Weekly load score: ${Math.round(weekLoad)} (0–150 = low, 150–300 = medium, 300+ = high)
- Tournament status: ${tournament === "none" ? "Normal week" : tournament}
- Session time: ${sessionTime}
- Important notes: ${loadNotes.length ? loadNotes.join(" | ") : "None"}

RECENT TRAINING HISTORY (last ${recentSessions.length} sessions, most recent first):
${recentSessions.length === 0 ? "No history yet — this is the first session." : recentSessions.map(s =>
  `${s.date}:\n${s.exercises.map(e =>
    `  - ${e.name}: ${e.sets}×${e.reps}${e.weight ? " @ " + e.weight : ""} | difficulty ${e.difficulty}/5 | ${e.completed ? "completed" : "did NOT complete"}`
  ).join("\n")}`
).join("\n\n")}

FAMILIAR EXERCISES (exercises the athlete already knows — use as reference, not as a strict limit):
${familiarExercises}

YOUR TASK:
Design the best possible training session for this athlete TODAY. You are free to:
- Use any of the familiar exercises above
- Introduce new exercises that are appropriate for her age and goals
- Adjust volume based on past difficulty ratings (if she rated an exercise 1-2 last time, increase load; if 4-5, hold or reduce)
- Adapt to the week's load and tournament status

IMPORTANT RULES:
- Age-appropriate only: no heavy barbell lifts, no Olympic lifting, bodyweight and light loads (dumbbells, bands, medicine ball, kettlebell)
- Order: Warmup → Mobility → Plyometrics → Power → Strength → Core → Agility → Conditioning → Recovery
- Total exercises: 8–12
- Always start with at least 2 warmup/mobility exercises
- For tournament week: max 6 exercises, activation only

Respond with ONLY valid JSON, no other text:
{
  "briefing": "4–6 sentences. Warm, direct coach voice. What today focuses on, why, and any safety reminders.",
  "plan": [
    {
      "name": "Exercise Name",
      "category": "Warmup|Mobility|Plyometrics|Power|Strength|Core|Agility|Conditioning|Recovery",
      "sets": 2,
      "reps": 10,
      "unit": "reps|seconds|meters",
      "note": "Coaching cue or progression reason based on history"
    }
  ]
}`;

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      const parsed = JSON.parse(text);
      // Attach a slug id to each exercise for logging
      const plan = (parsed.plan || []).map(ex => ({
        ...ex,
        id: ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      }));
      setPlanResult({ plan, briefing: parsed.briefing, weekLoad });
    } catch (e) {
      setAiError("Could not generate plan — check that your API key is set in .env and the server is running.");
    }
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

      {aiLoading && (
        <div className="card" style={{ borderColor: COLORS.accentDim }}>
          <div className="flex" style={{ gap: 10 }}>
            <div className="spinner" />
            <span style={{ color: COLORS.muted, fontSize: "0.85rem" }}>AI coach is designing your session…</span>
          </div>
        </div>
      )}

      {aiError && (
        <div className="note-box warn">{aiError}</div>
      )}

      {planResult && (
        <>
          <div className="card" style={{ borderColor: COLORS.accentDim }}>
            <div className="card-title">🧠 Coach's Briefing</div>
            <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: COLORS.text }}>{planResult.briefing}</p>
          </div>

          <div className="card">
            <div className="card-title">📋 Today's Session — {planResult.plan.length} Exercises</div>
            {planResult.plan.map((ex, i) => {
              const isTime = ex.unit === "seconds";
              return (
                <div key={i} className="ex-row">
                  <div className="ex-num">{String(i + 1).padStart(2, "0")}</div>
                  <div style={{ flex: 1 }}>
                    <div className="ex-name">{ex.name}</div>
                    <div className="ex-meta">
                      <span className="badge badge-gray">{ex.category}</span>
                    </div>
                    {ex.note && <div className="ex-note mt8">→ {ex.note}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="ex-prescription">{ex.sets}×{ex.reps}{isTime ? "s" : ""}</div>
                    <div style={{ fontSize: "0.7rem", color: COLORS.muted }}>sets × {isTime ? "sec" : ex.unit || "reps"}</div>
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
        sets: ex.sets || 2,
        reps: ex.reps || 10,
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
