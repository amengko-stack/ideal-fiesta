import { useState, useEffect, useCallback } from "react";
import { auth, db } from "./firebase";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, addDoc, deleteDoc,
  collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";

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
function getWeekBounds(weeksAgo) {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - daysToMonday - weeksAgo * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return {
    start: start.toISOString().split("T")[0],
    end:   end.toISOString().split("T")[0],
  };
}

function sessionSRPE(log) {
  const rpe        = log.rpe ?? (log.intensity ? log.intensity * 2 : 5);
  const duration   = log.duration || 60;
  const multiplier = log.type === "other" ? 0.6 : 1.0;
  return rpe * duration * multiplier;
}

function calculateMetrics(logs, wellbeing) {
  const weekSRPEs = [0, 1, 2, 3].map(weeksAgo => {
    const { start, end } = getWeekBounds(weeksAgo);
    return (logs || [])
      .filter(l => l.date >= start && l.date < end)
      .reduce((sum, l) => sum + sessionSRPE(l), 0);
  });

  const thisWeekSRPE = weekSRPEs[0];
  const fourWeekAvg  = weekSRPEs.reduce((a, b) => a + b, 0) / 4;
  const acwr = fourWeekAvg > 0
    ? Math.round((thisWeekSRPE / fourWeekAvg) * 100) / 100
    : null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const byDate = {};
  (wellbeing || [])
    .filter(w => w.date >= sevenDaysAgoStr)
    .forEach(w => {
      if (!byDate[w.date] || (w.time || "") > (byDate[w.date].time || ""))
        byDate[w.date] = w;
    });
  const dailyEntries = Object.values(byDate);

  const avg = field => {
    const vals = dailyEntries.filter(w => w[field] != null).map(w => w[field]);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
  };

  return {
    thisWeekSRPE:  Math.round(thisWeekSRPE),
    weekSRPEs:     weekSRPEs.map(Math.round),
    fourWeekAvg:   Math.round(fourWeekAvg),
    acwr,
    avgSleep:      avg("sleep"),
    avgMood:       avg("mood"),
    avgSoreness:   avg("soreness"),
    wellbeingDays: dailyEntries.length,
  };
}

function getACWRContext(acwr, tournamentStatus, sessionTime) {
  const notes = [];
  if (tournamentStatus === "pre")       notes.push("Pre-tournament (next 7 days): reduce volume ~35%, familiar exercises only, no new movements");
  if (tournamentStatus === "week_of")   notes.push("Tournament THIS week: activation only, max 6 exercises, nothing causing soreness");
  if (tournamentStatus === "post_hard") notes.push("Post heavy tournament: reduce volume ~25%, prioritise mobility and recovery");
  if (tournamentStatus === "post_easy") notes.push("Post light tournament: normal plan, monitor energy");

  if (acwr === null) {
    notes.push("Not enough load history yet — use conservative volume, focus on movement quality");
  } else if (acwr > 1.5) {
    notes.push(`ACWR ${acwr} — DANGER ZONE: significantly reduce volume, recovery and mobility only`);
  } else if (acwr > 1.3) {
    notes.push(`ACWR ${acwr} — CAUTION: reduce sets by 1–2, avoid new high-intensity exercises`);
  } else if (acwr < 0.8) {
    notes.push(`ACWR ${acwr} — UNDERLOADED: athlete can handle more volume and harder progressions`);
  } else {
    notes.push(`ACWR ${acwr} — OPTIMAL (0.8–1.3): normal progression, standard volume`);
  }

  if (sessionTime) {
    const h = parseInt(sessionTime.split(":")[0]);
    if (h < 10) notes.push("Morning session: CNS not fully activated, add extra warmup time");
    if (h >= 19) notes.push("Evening session: avoid high-intensity plyometrics after 7pm");
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
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: ${COLORS.accent}; color: #000; }
  .btn-primary:hover:not(:disabled) { background: ${COLORS.accentDim}; }
  .btn-ghost { background: ${COLORS.accentMuted}; color: ${COLORS.accent}; }
  .btn-ghost:hover:not(:disabled) { background: rgba(0,229,160,0.2); }
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
  .pill-other { background: rgba(245,197,24,0.15); color: ${COLORS.yellow}; }
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
  .athlete-row { cursor: pointer; transition: background 0.15s; }
  .athlete-row:hover { background: ${COLORS.border}; border-radius: 8px; }
  .av-big-label { font-size: 1rem; font-weight: 600; color: ${COLORS.text}; margin-bottom: 8px; }
  .av-hint { font-size: 0.78rem; color: ${COLORS.muted}; margin-bottom: 10px; }
`;

// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState]         = useState("loading");
  const [user, setUser]                   = useState(null);
  const [athleteId, setAthleteId]         = useState(null);
  const [viewingAthleteId, setViewingId]  = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setAuthState("unauthenticated");
        return;
      }
      setUser(u);
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (!snap.exists()) {
          setAuthState("setup");
        } else {
          const data = snap.data();
          if (data.role === "athlete") {
            setAthleteId(data.athleteId);
            setAuthState("athlete");
          } else {
            setAuthState("parent");
          }
        }
      } catch (e) {
        console.error("Auth check error:", e);
        setAuthState("setup");
      }
    });
  }, []);

  const handleSetupComplete = useCallback(async (role, newAthleteId) => {
    const userData = { role, displayName: user.displayName, email: user.email };
    if (role === "athlete") userData.athleteId = newAthleteId;
    await setDoc(doc(db, "users", user.uid), userData);
    if (role === "athlete") {
      setAthleteId(newAthleteId);
      setAuthState("athlete");
    } else {
      setAuthState("parent");
    }
  }, [user]);

  const handleSignOut = useCallback(() => signOut(auth), []);

  if (authState === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: COLORS.bg }}>
        <style>{css}</style>
        <div className="spinner" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginScreen />;
  }

  if (authState === "setup") {
    return <RoleSetup user={user} onComplete={handleSetupComplete} />;
  }

  if (authState === "parent" && viewingAthleteId) {
    return (
      <AthleteMain
        athleteId={viewingAthleteId}
        isParent={true}
        user={user}
        onBack={() => setViewingId(null)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (authState === "parent") {
    return (
      <ParentDashboard
        user={user}
        onSelectAthlete={(id) => setViewingId(id)}
        onSignOut={handleSignOut}
      />
    );
  }

  // authState === "athlete"
  return (
    <AthleteView
      athleteId={athleteId}
      user={user}
      onSignOut={handleSignOut}
    />
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: COLORS.bg, padding: 16 }}>
      <style>{css}</style>
      <div className="card" style={{ maxWidth: 420, width: "100%", textAlign: "center", padding: "40px 32px" }}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "3.5rem", color: COLORS.accent, marginBottom: 8 }}>Athlete OS</h1>
        <p style={{ color: COLORS.muted, fontSize: "0.88rem", marginBottom: 36 }}>Training Intelligence · Tennis + Cheerleading</p>
        <button
          className="btn btn-primary"
          onClick={handleGoogle}
          disabled={loading}
          style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "0.95rem" }}
        >
          {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : "Sign in with Google"}
        </button>
        {error && <div className="note-box warn" style={{ marginTop: 16, textAlign: "left" }}>{error}</div>}
      </div>
    </div>
  );
}

// ─── ROLE SETUP ───────────────────────────────────────────────────────────────
function RoleSetup({ user, onComplete }) {
  const [role, setRole]           = useState("parent");
  const [athleteName, setName]    = useState(user?.displayName?.split(" ")[0] || "");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      if (role === "athlete") {
        if (!athleteName.trim()) { setError("Please enter your name."); setSaving(false); return; }
        const ref = await addDoc(collection(db, "athletes"), {
          name: athleteName.trim(), dob: "", gaps: [],
          tennisSchedule: "", cheerSchedule: "", coachNotes: "",
          weight: null, height: null, measurements: [],
          createdBy: user.uid,
        });
        await onComplete("athlete", ref.id);
      } else {
        await onComplete("parent", null);
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: COLORS.bg, padding: 16 }}>
      <style>{css}</style>
      <div className="card" style={{ maxWidth: 480, width: "100%", padding: "32px 28px" }}>
        <div className="card-title">Welcome, {user?.displayName?.split(" ")[0] || "there"} 👋</div>
        <p style={{ color: COLORS.muted, fontSize: "0.85rem", marginBottom: 20 }}>Choose your role to get started.</p>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button
            className={`btn ${role === "parent" ? "btn-primary" : "btn-ghost"}`}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => setRole("parent")}
          >
            👨‍👩‍👧 Parent / Coach
          </button>
          <button
            className={`btn ${role === "athlete" ? "btn-primary" : "btn-ghost"}`}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => setRole("athlete")}
          >
            🎾 Athlete
          </button>
        </div>

        {role === "parent" && (
          <div className="note-box" style={{ marginBottom: 20 }}>
            As a parent/coach you can create and manage multiple athlete profiles and see all their data.
          </div>
        )}

        {role === "athlete" && (
          <div style={{ marginBottom: 20 }}>
            <div className="label">Your Name</div>
            <input
              placeholder="e.g. Sofia"
              value={athleteName}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
            <div className="note-box" style={{ marginTop: 12 }}>
              As an athlete you will see only your own training logs and current plan.
            </div>
          </div>
        )}

        {error && <div className="note-box warn" style={{ marginBottom: 12 }}>{error}</div>}

        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={saving}
          style={{ width: "100%", justifyContent: "center", padding: "13px" }}
        >
          {saving
            ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Setting up…</>
            : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// ─── PARENT DASHBOARD ────────────────────────────────────────────────────────
function ParentDashboard({ user, onSelectAthlete, onSignOut }) {
  const [athletes, setAthletes]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]     = useState("");
  const [creating, setCreating]   = useState(false);

  useEffect(() => {
    getDocs(collection(db, "athletes"))
      .then(snap => setAthletes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(e => console.error("Load athletes error:", e))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "athletes"), {
        name: newName.trim(), dob: "", gaps: [],
        tennisSchedule: "", cheerSchedule: "", coachNotes: "",
        weight: null, height: null, measurements: [],
        createdBy: user.uid,
      });
      setAthletes(prev => [...prev, { id: ref.id, name: newName.trim(), gaps: [] }]);
      setNewName("");
      setShowCreate(false);
    } catch (e) {
      console.error("Create athlete error:", e);
    }
    setCreating(false);
  };

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="flex-between">
            <div>
              <h1>Athlete OS</h1>
              <p>Parent Dashboard · {user.displayName}</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">👤 Athletes</div>
          {loading
            ? <div className="empty"><div className="spinner" /></div>
            : athletes.length === 0
              ? <div className="empty">No athletes yet — add one below</div>
              : athletes.map(a => (
                  <div
                    key={a.id}
                    className="log-item athlete-row"
                    onClick={() => onSelectAthlete(a.id)}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{a.name || "Unnamed athlete"}</span>
                      {a.gaps?.length > 0 && (
                        <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>
                          {a.gaps.length} tennis gap{a.gaps.length !== 1 ? "s" : ""} set
                        </div>
                      )}
                    </div>
                    <span style={{ color: COLORS.accent, fontWeight: 600 }}>View →</span>
                  </div>
                ))
          }
        </div>

        {showCreate ? (
          <div className="card">
            <div className="card-title">➕ New Athlete</div>
            <div className="label">Athlete Name</div>
            <input
              placeholder="e.g. Sofia"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              style={{ marginBottom: 14 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {creating ? "Creating…" : "Create Athlete"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setNewName(""); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-ghost"
            onClick={() => setShowCreate(true)}
            style={{ width: "100%", justifyContent: "center", padding: "12px" }}
          >
            + Add New Athlete
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ATHLETE MAIN ─────────────────────────────────────────────────────────────
function AthleteMain({ athleteId, isParent, user, onBack, onSignOut }) {
  const [tab, setTab]                     = useState("plan");
  const [profile, setProfile]             = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [weekLogs, setWeekLogs]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [planResult, setPlanResult]       = useState(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [wellbeing, setWellbeing]         = useState([]);

  useEffect(() => {
    setLoading(true);
    setPlanResult(null);
    const load = async () => {
      try {
        const [profileSnap, logsSnap, sessSnap, wellSnap] = await Promise.all([
          getDoc(doc(db, "athletes", athleteId)),
          getDocs(collection(db, "athletes", athleteId, "weekLogs")),
          getDocs(query(
            collection(db, "athletes", athleteId, "sessions"),
            orderBy("date", "desc")
          )),
          getDocs(query(
            collection(db, "athletes", athleteId, "wellbeing"),
            orderBy("date", "desc"), limit(28)
          )),
        ]);
        if (profileSnap.exists()) setProfile(profileSnap.data());
        setWeekLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setSessionHistory(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setWellbeing(wellSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [athleteId]);

  const saveProfile = useCallback(async (p) => {
    setProfile(p);
    await setDoc(doc(db, "athletes", athleteId), p, { merge: true });
  }, [athleteId]);

  const addWeekLog = useCallback(async (logData) => {
    const ref = await addDoc(collection(db, "athletes", athleteId, "weekLogs"), logData);
    setWeekLogs(prev => [...prev, { id: ref.id, ...logData }]);
  }, [athleteId]);

  const deleteWeekLog = useCallback(async (logId) => {
    await deleteDoc(doc(db, "athletes", athleteId, "weekLogs", logId));
    setWeekLogs(prev => prev.filter(l => l.id !== logId));
  }, [athleteId]);

  const addSession = useCallback(async (sessionData) => {
    const ref = await addDoc(collection(db, "athletes", athleteId, "sessions"), sessionData);
    setSessionHistory(prev => [{ id: ref.id, ...sessionData }, ...prev]);
  }, [athleteId]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: COLORS.bg }}>
        <style>{css}</style>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="flex-between" style={{ alignItems: "flex-start" }}>
            <h1>Athlete OS</h1>
            <div style={{ display: "flex", gap: 8, paddingTop: 6 }}>
              {onBack && (
                <button className="btn btn-ghost btn-sm" onClick={onBack}>← Athletes</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
            </div>
          </div>
          <p>Training Intelligence · {profile?.name || "Setup your athlete profile"} · Age 12 · Tennis + Cheer
            {isParent && <span style={{ color: COLORS.yellow, marginLeft: 8 }}>· Parent View</span>}
          </p>
        </div>

        <div className="tabs">
          {[
            { id: "plan",     label: "🎯 Sunday Plan" },
            { id: "log",      label: "📋 Log Activity" },
            { id: "strength", label: "💪 Log Strength" },
            { id: "progress", label: "📈 Progress" },
            { id: "profile",  label: "⚙️ Profile" },
          ].map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "plan"     && <PlanTab athleteId={athleteId} profile={profile} weekLogs={weekLogs} sessionHistory={sessionHistory} wellbeing={wellbeing} aiLoading={aiLoading} setAiLoading={setAiLoading} planResult={planResult} setPlanResult={setPlanResult} />}
        {tab === "log"      && <LogTab weekLogs={weekLogs} addWeekLog={addWeekLog} deleteWeekLog={deleteWeekLog} />}
        {tab === "strength" && <StrengthLogTab sessionHistory={sessionHistory} addSession={addSession} planResult={planResult} />}
        {tab === "progress" && <ProgressTab sessionHistory={sessionHistory} weekLogs={weekLogs} />}
        {tab === "profile"  && <ProfileTab profile={profile} saveProfile={saveProfile} />}
      </div>
    </>
  );
}

// ─── PLAN TAB ─────────────────────────────────────────────────────────────────
function PlanTab({ athleteId, profile, weekLogs, sessionHistory, wellbeing, aiLoading, setAiLoading, planResult, setPlanResult }) {
  const [tournament, setTournament] = useState("none");
  const [sessionTime, setSessionTime] = useState("10:00");
  const [aiError, setAiError] = useState("");

  const gaps = profile?.gaps || [];

  const handleGenerate = async () => {
    setAiLoading(true);
    setAiError("");
    setPlanResult(null);

    const metrics   = calculateMetrics(weekLogs, wellbeing);
    const loadNotes = getACWRContext(metrics.acwr, tournament, sessionTime);

    const { start: thisWeekStart } = getWeekBounds(0);
    const thisWeekLogs = weekLogs.filter(l => l.date >= thisWeekStart);
    const typeLabel = { tennis: "Tennis", cheer: "Cheerleading", other: "Other sport" };
    const weekActivity = thisWeekLogs.length === 0
      ? "No activity sessions logged this week."
      : [...thisWeekLogs]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(l => {
            const rpe = l.rpe ?? (l.intensity ? l.intensity * 2 : "?");
            return `  - ${l.date} ${l.time}: ${typeLabel[l.type] || l.type}${l.sportName ? ` (${l.sportName})` : ""} — ${l.duration} min, RPE ${rpe}/10${l.focus ? ", focus: " + l.focus : ""}${l.type === "other" ? " [0.6× load multiplier]" : ""}`;
          })
          .join("\n");

    const recentSessions = [...(sessionHistory || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6)
      .map(s => ({
        date: s.date,
        exercises: (s.exercises || []).map(e => ({
          name: e.name, sets: e.sets, reps: e.reps,
          weight: e.weight || null, difficulty: e.difficulty, completed: e.completed,
        }))
      }));

    const familiarExercises = EXERCISE_DB.map(e => e.name).join(", ");
    const gapLabels = gaps.map(g => TENNIS_GAPS.find(x => x.id === g)?.label || g);

    const moodLabel     = ["","Rough","Meh","OK","Good","Great"];
    const sorenessLabel = ["","None","Mild","Moderate","Sore","Very sore"];
    const energyLabel   = ["","Empty","Low","OK","Good","Great"];
    const recentWellbeing = [...(wellbeing || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
    const wellbeingText = recentWellbeing.length === 0
      ? "No wellbeing check-ins logged yet."
      : recentWellbeing.map(w => {
          const parts = [];
          const label = w.type === "night" ? "🌙 Tonight" : w.type === "morning" ? "☀️ Morning" : "Check-in";
          if (w.sleep)    parts.push(`Sleep ${w.sleep}h`);
          if (w.energy)   parts.push(`Energy ${w.energy}/5 (${energyLabel[w.energy]})`);
          if (w.mood)     parts.push(`Mood ${w.mood}/5 (${moodLabel[w.mood]})`);
          if (w.soreness) parts.push(`Soreness ${w.soreness}/5 (${sorenessLabel[w.soreness]})`);
          if (w.notes)    parts.push(`Note: "${w.notes}"`);
          return `  - ${w.date} [${label}]: ${parts.join(" · ")}`;
        }).join("\n");

    const measurementText = (() => {
      const hist = profile?.measurements || [];
      if (hist.length === 0) return "Not yet recorded.";
      return hist.slice(0, 2).map(m =>
        `  ${m.date}: ${m.weight ? m.weight + " kg" : ""}${m.weight && m.height ? " · " : ""}${m.height ? m.height + " cm" : ""}`
      ).join("\n");
    })();

    const prompt = `You are an expert youth sports conditioning coach specialising in adolescent female multi-sport athletes. Design a complete Sunday strength training session for this athlete.

═══════════════════════════════════════════
ATHLETE PROFILE
═══════════════════════════════════════════
- Name: ${profile?.name || "Athlete"}
- Age: 12 · Female · Growth phase (growth plates NOT yet fused)
- Primary sport: Tennis | Secondary sport: Cheerleading
- Training age: youth athlete, still developing fundamental movement patterns
- Tennis areas to develop: ${gapLabels.join(", ") || "general athletic development"}

PHYSICAL MEASUREMENTS (last 2 recorded):
${measurementText}
Note: Use for loading context only. Do NOT comment on body composition.

COACH / PARENT NOTES:
${profile?.coachNotes?.trim() || "None"}
⚠ Treat any mentioned injuries or pain areas as HARD restrictions — do not include exercises that stress those areas.

═══════════════════════════════════════════
AGE & DEVELOPMENT RULES — APPLY TO EVERY SESSION
═══════════════════════════════════════════
- Growth plates are open: NO heavy axial loading (no barbell squats/deadlifts, no heavy overhead pressing)
- Equipment allowed: bodyweight, light dumbbells, resistance bands, medicine ball, kettlebell ONLY
- Prioritise movement quality and body control over load — technique always beats weight
- Plyometrics are appropriate but capped: max 2 plyometric exercises per session
- This is a critical motor-pattern window; every session should reinforce correct mechanics

FEMALE ATHLETE MANDATORY INCLUSIONS:
- ACL injury risk is significantly elevated in 12-year-old female athletes (growth, hormones, biomechanics)
- EVERY session must include at least one landing-mechanics or single-leg stability exercise
- Emphasise hip abductors and glute strength — weakness here is the #1 predictor of knee injury in female athletes
- Watch for and cue against valgus collapse (knees caving in) on all landings and single-leg work
- Shoulder health: monitor for impingement patterns given overhead cheerleading demands

MULTI-SPORT ATHLETE CONTEXT:
- She trains more total hours than single-sport peers her age — cumulative fatigue is a real risk
- Tennis + cheerleading together create high rotational, overhead, and lower-limb demands
- Overuse injury risk is elevated: do NOT add volume just because ACWR looks low; quality > quantity
- Sunday strength session must complement the week, not compete with it

CHEERLEADING-SPECIFIC DEMANDS (factor into exercise selection):
- Stunting: requires full-body tension, core stability, wrist and shoulder strength (basing or flying)
- Tumbling (back handsprings, round-offs): explosive hip extension, shoulder stability, wrist loading
- Basing: high ground-reaction forces through wrists — include wrist mobility/prehab when cheer was heavy
- Cheerleading overlaps with tennis on: rotational power, core anti-rotation, shoulder health, landing mechanics

═══════════════════════════════════════════
THIS WEEK'S ACTIVITY (Mon–Sat logged sessions)
═══════════════════════════════════════════
${weekActivity}

═══════════════════════════════════════════
TRAINING LOAD ANALYSIS
═══════════════════════════════════════════
sRPE = RPE × duration in minutes | Other sports weighted 0.6×

- This week sRPE: ${metrics.thisWeekSRPE}
- Weekly sRPE last 4 weeks (oldest → newest): ${[...metrics.weekSRPEs].reverse().join(" → ")}
- 4-week average sRPE: ${metrics.fourWeekAvg}
- Acute:Chronic Workload Ratio (ACWR): ${metrics.acwr !== null ? metrics.acwr : "insufficient data — less than 4 weeks of history"}
  Optimal 0.8–1.3 | Caution >1.3 | Danger >1.5 | Underload <0.8

7-DAY WELLBEING AVERAGES (${metrics.wellbeingDays} days logged):
- Average sleep: ${metrics.avgSleep !== null ? metrics.avgSleep + "h" : "no data"}
- Average mood: ${metrics.avgMood !== null ? metrics.avgMood + "/5" : "no data"}
- Average soreness: ${metrics.avgSoreness !== null ? metrics.avgSoreness + "/5" : "no data"}

SESSION CONTEXT:
- Tournament status: ${tournament === "none" ? "Normal week" : tournament}
- Session time today: ${sessionTime}
- Load guidance: ${loadNotes.join(" | ")}

═══════════════════════════════════════════
ATHLETE WELLBEING (last ${recentWellbeing.length} check-ins, most recent first)
═══════════════════════════════════════════
${wellbeingText}

Wellbeing rules:
- Soreness 3+: reduce impact and plyometrics, prioritise mobility and recovery
- Sleep under 7h: avoid max-effort work, keep intensity moderate
- Energy 1–2 (night before): scale back volume
- Mood 1–2: keep session positive and light, no new hard exercises
- Any noted pain or tightness: avoid exercises that load that area

═══════════════════════════════════════════
PAST STRENGTH TRAINING HISTORY (last ${recentSessions.length} sessions)
═══════════════════════════════════════════
${recentSessions.length === 0
  ? "No strength history yet — this is the first session. Start conservative, focus on form."
  : recentSessions.map(s =>
      `${s.date}:\n${s.exercises.map(e =>
        `  - ${e.name}: ${e.sets}×${e.reps}${e.weight ? " @ " + e.weight : ""} | difficulty ${e.difficulty}/5 | ${e.completed ? "completed" : "did NOT complete"}`
      ).join("\n")}`
    ).join("\n\n")}

FAMILIAR EXERCISES (athlete knows these — use as base, not a ceiling):
${familiarExercises}

═══════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════
Design the best possible Sunday session using ALL context above:
- Heavy tennis/cheer week → reduce strength volume to prevent overtraining
- Light week → can handle more volume and harder progressions
- Progress exercises from history: easy last time → increase; hard → hold or reduce
- Always target her tennis development gaps
- Always include ACL-risk mitigation (hip/glute work + landing mechanics)
- You may introduce new exercises beyond the familiar list when appropriate

SESSION STRUCTURE:
- Order: Warmup → Mobility → Plyometrics → Power → Strength → Core → Agility → Conditioning → Recovery
- Total exercises: 8–12 | At least 2 warmup/mobility to open
- Tournament week: max 6 exercises, activation only, nothing that causes soreness next day

Respond with ONLY valid JSON, no other text:
{
  "briefing": "4–6 sentences. Warm, direct coach voice. Mention what her tennis/cheer week means for today, what the session focuses on, and one female-athlete or age-specific safety point relevant to this session.",
  "plan": [
    {
      "name": "Exercise Name",
      "category": "Warmup|Mobility|Plyometrics|Power|Strength|Core|Agility|Conditioning|Recovery",
      "sets": 2,
      "reps": 10,
      "unit": "reps|seconds|meters",
      "note": "Specific coaching cue or reason chosen based on her week, history, or development needs"
    }
  ]
}`;

    try {
      const res = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "You are an expert youth sports conditioning coach. Always respond with valid JSON only — no markdown, no code fences, no extra text.",
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      console.log("API response:", JSON.stringify(data).slice(0, 500));
      const raw  = (data.content?.map(b => b.text || "").join("") || "").trim();
      const text = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      // Fix literal control characters inside JSON string values (e.g. newlines in briefing)
      const clean = text.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_, inner) =>
        '"' + inner
          .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") + '"'
      );
      const parsed = JSON.parse(clean);
      const plan = (parsed.plan || []).map(ex => ({
        ...ex,
        id: ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      }));
      const planData = { plan, briefing: parsed.briefing, metrics, generatedAt: new Date().toISOString() };
      setPlanResult(planData);
      if (athleteId) {
        await setDoc(doc(db, "plans", athleteId), planData);
      }
    } catch (e) {
      console.error("Plan generation error:", e);
      setAiError(`Could not generate plan — ${e.message}`);
    }
    setAiLoading(false);
  };

  const metrics = calculateMetrics(weekLogs, wellbeing);
  const { start: _thisWeekStart } = getWeekBounds(0);
  const thisWeekLogs = weekLogs.filter(l => l.date >= _thisWeekStart);
  const acwrColor = metrics.acwr === null ? COLORS.muted
    : metrics.acwr > 1.5 ? COLORS.red
    : metrics.acwr > 1.3 ? COLORS.yellow
    : metrics.acwr < 0.8 ? "#6eb5ff"
    : COLORS.accent;
  const acwrLabel = metrics.acwr === null ? "No data yet"
    : metrics.acwr > 1.5 ? "Danger zone"
    : metrics.acwr > 1.3 ? "Caution"
    : metrics.acwr < 0.8 ? "Underloaded"
    : "Optimal";

  return (
    <div>
      <div className="card">
        <div className="card-title">📊 Training Load Analysis</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div style={{ background: COLORS.surface, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>This week sRPE</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", color: COLORS.text, lineHeight: 1 }}>{metrics.thisWeekSRPE}</div>
          </div>
          <div style={{ background: COLORS.surface, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>4-week avg sRPE</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", color: COLORS.text, lineHeight: 1 }}>{metrics.fourWeekAvg || "—"}</div>
          </div>
        </div>
        <div style={{ background: COLORS.surface, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Acute:Chronic Ratio (ACWR)</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: acwrColor, lineHeight: 1 }}>
                {metrics.acwr !== null ? metrics.acwr : "—"}
              </div>
            </div>
            <span className="badge" style={{ background: `${acwrColor}22`, color: acwrColor, fontSize: "0.75rem" }}>{acwrLabel}</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 6 }}>
            Optimal 0.8–1.3 · Caution &gt;1.3 · Danger &gt;1.5 · Underload &lt;0.8
          </div>
        </div>
        {(metrics.avgSleep || metrics.avgMood || metrics.avgSoreness) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Avg Sleep", value: metrics.avgSleep ? `${metrics.avgSleep}h` : "—", icon: "🌙" },
              { label: "Avg Mood",  value: metrics.avgMood  ? `${metrics.avgMood}/5` : "—", icon: "😊" },
              { label: "Avg Soreness", value: metrics.avgSoreness ? `${metrics.avgSoreness}/5` : "—", icon: "💪" },
            ].map(s => (
              <div key={s.label} style={{ background: COLORS.surface, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: "1rem", marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: COLORS.text }}>{s.value}</div>
                <div style={{ fontSize: "0.62rem", color: COLORS.muted, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 10 }}>
          {thisWeekLogs.length} sessions this week · {metrics.wellbeingDays} days of wellbeing data (7-day avg)
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
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={aiLoading}
            style={{ width: "100%", justifyContent: "center", padding: "13px" }}
          >
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

      {aiError && <div className="note-box warn">{aiError}</div>}

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
function LogTab({ weekLogs, addWeekLog, deleteWeekLog }) {
  const [type, setType]         = useState("tennis");
  const [sportName, setSportName] = useState("");
  const [duration, setDuration] = useState("");
  const [rpe, setRpe]           = useState(null);
  const [focus, setFocus]       = useState("");
  const [date, setDate]         = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime]         = useState(new Date().toTimeString().slice(0, 5));
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const TENNIS_FOCUS = ["Baseline rallying", "Serve practice", "Footwork / movement", "Match play", "Volley / net", "Conditioning", "Full practice"];
  const CHEER_FOCUS  = ["Stunt practice", "Tumbling", "Dance / routine", "Competition prep", "Conditioning", "Full practice"];
  const OTHER_FOCUS  = ["Practice / Training", "Competition", "Conditioning", "Full session"];

  const handleLog = async () => {
    if (!duration || !rpe || saving) return;
    setSaving(true);
    const entry = { type, duration: parseInt(duration), rpe, intensity: Math.ceil(rpe / 2), focus, date, time };
    if (type === "other" && sportName.trim()) entry.sportName = sportName.trim();
    await addWeekLog(entry);
    setSaved(true);
    setDuration(""); setFocus(""); setRpe(null); setSportName("");
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const thisWeekStart = new Date();
  const _day = thisWeekStart.getDay();
  thisWeekStart.setDate(thisWeekStart.getDate() - (_day === 0 ? 6 : _day - 1));
  const thisWeek = weekLogs.filter(l => new Date(l.date) >= thisWeekStart);

  return (
    <div>
      <div className="card">
        <div className="card-title">➕ Log Activity</div>
        <div className="grid2">
          <div>
            <div className="label">Activity Type</div>
            <select value={type} onChange={e => { setType(e.target.value); setFocus(""); setSportName(""); }}>
              <option value="tennis">🎾 Tennis</option>
              <option value="cheer">📣 Cheerleading</option>
              <option value="other">🏃 Other Sport</option>
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

        {type === "other" && (
          <div className="mt16">
            <div className="label">Sport Name</div>
            <input
              placeholder="e.g. Swimming, Basketball, Dance…"
              value={sportName}
              onChange={e => setSportName(e.target.value)}
            />
            <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>
              Other sport sessions are weighted at 0.6× in load calculations.
            </div>
          </div>
        )}

        <div className="mt16">
          <div className="label">RPE (how hard? 1–10)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 8 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button
                key={n}
                onClick={() => setRpe(n)}
                style={{
                  padding: "10px 4px", borderRadius: 8,
                  border: `2px solid ${rpe === n ? COLORS.accent : COLORS.border}`,
                  background: rpe === n ? COLORS.accentMuted : "transparent",
                  color: rpe === n ? COLORS.accent : COLORS.muted,
                  fontFamily: "'DM Sans', sans-serif", fontSize: "1rem", fontWeight: 700,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >{n}</button>
            ))}
          </div>
          <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>
            {rpe ? ["","Very easy","Easy","Moderate","Somewhat hard","Hard","Hard","Very hard","Very hard","Max","Max"][rpe] + ` (RPE ${rpe}/10)` : "1 = very easy · 5 = moderate · 10 = max effort"}
          </div>
        </div>

        <div className="mt16">
          <div className="label">Session Focus</div>
          <select value={focus} onChange={e => setFocus(e.target.value)}>
            <option value="">Select focus…</option>
            {(type === "tennis" ? TENNIS_FOCUS : type === "cheer" ? CHEER_FOCUS : OTHER_FOCUS).map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-primary mt16"
          onClick={handleLog}
          disabled={saving || !duration || !rpe}
          style={{ width: "100%", justifyContent: "center", padding: "12px" }}
        >
          {saving ? "Saving…" : saved ? "✓ Logged!" : "Save Session"}
        </button>
      </div>

      <div className="card">
        <div className="card-title">📅 This Week's Activity</div>
        {thisWeek.length === 0
          ? <div className="empty">No sessions logged this week yet</div>
          : [...thisWeek].sort((a,b) => new Date(b.date)-new Date(a.date)).map(log => {
              const pillClass = log.type === "tennis" ? "pill-tennis" : log.type === "cheer" ? "pill-cheer" : "pill-other";
              const typeLabel = log.type === "tennis" ? "🎾 Tennis" : log.type === "cheer" ? "📣 Cheer" : `🏃 ${log.sportName || "Other"}`;
              const rpeDisplay = log.rpe != null ? log.rpe : (log.intensity ? log.intensity * 2 : "?");
              return (
                <div key={log.id} className="log-item">
                  <div>
                    <span className={`pill ${pillClass}`}>{typeLabel}</span>
                    <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>{log.focus || "Session"}</span>
                    <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>{log.date} · {log.time} · {log.duration}min · RPE {rpeDisplay}/10</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteWeekLog(log.id)}>✕</button>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ─── STRENGTH LOG TAB ─────────────────────────────────────────────────────────
function StrengthLogTab({ sessionHistory, addSession, planResult }) {
  const [logExercises, setLogExercises]   = useState([]);
  const [sessionDate, setSessionDate]     = useState(new Date().toISOString().split("T")[0]);
  const [sessionTimeLog, setSessionTimeLog] = useState(new Date().toTimeString().slice(0, 5));
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);

  useEffect(() => {
    if (planResult?.plan && logExercises.length === 0) {
      setLogExercises(planResult.plan.map(ex => ({
        id: ex.id, name: ex.name,
        sets: ex.sets || 2, reps: ex.reps || 10,
        weight: "", difficulty: 3, completed: true, notes: ""
      })));
    }
  }, [planResult]);

  const addExercise = () => {
    setLogExercises(prev => [...prev, {
      id: `custom_${Date.now()}`, name: "", sets: 2, reps: 10,
      weight: "", difficulty: 3, completed: true, notes: ""
    }]);
  };

  const updateEx = (idx, field, val) => {
    setLogExercises(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  };

  const handleSave = async () => {
    setSaving(true);
    await addSession({
      date: sessionDate,
      time: sessionTimeLog,
      exercises: logExercises.filter(e => e.name),
    });
    setSaved(true);
    setSaving(false);
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
              {ex.name
                ? ex.name
                : <input placeholder="Exercise name…" value={ex.name} onChange={e => updateEx(idx, "name", e.target.value)} style={{ fontWeight: 600 }} />
              }
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
      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{ width: "100%", justifyContent: "center", padding: "13px" }}
      >
        {saving ? "Saving…" : saved ? "✓ Session Saved!" : "Save Strength Session"}
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
      exMap[ex.id].entries.push({
        date: session.date, sets: ex.sets, reps: ex.reps,
        weight: ex.weight, difficulty: ex.difficulty, completed: ex.completed,
      });
    });
  });

  const exIds = Object.keys(exMap);
  const totalSessions  = sessionHistory.length;
  const totalTennisMin = weekLogs.filter(l => l.type === "tennis").reduce((a, l) => a + l.duration, 0);
  const totalCheerMin  = weekLogs.filter(l => l.type === "cheer").reduce((a, l) => a + l.duration, 0);
  const totalOtherMin  = weekLogs.filter(l => l.type === "other").reduce((a, l) => a + l.duration, 0);

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
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.tennis }}>{Math.round(totalTennisMin / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Tennis Logged</div>
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.cheer }}>{Math.round(totalCheerMin / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Cheer Logged</div>
          </div>
          {totalOtherMin > 0 && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.yellow }}>{Math.round(totalOtherMin / 60)}h</div>
              <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Other Sports</div>
            </div>
          )}
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
                      {[...exMap[selected].entries].sort((a,b) => new Date(b.date)-new Date(a.date)).map((e, i) => (
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
          : [...sessionHistory].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0, 10).map(s => (
              <div key={s.id} className="log-item">
                <div>
                  <span className="pill pill-strength">💪 Strength</span>
                  <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>{s.exercises?.length || 0} exercises</span>
                  <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>{s.date} · {s.time}</div>
                </div>
                <div style={{ color: COLORS.accent, fontSize: "0.8rem" }}>
                  {s.exercises?.map(e => e.name).slice(0,3).join(", ")}{s.exercises?.length > 3 ? "…" : ""}
                </div>
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
    tennisSchedule: "", cheerSchedule: "", coachNotes: "",
    weight: "", height: "", measurements: [],
  });
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (profile && profile.name) setForm(profile);
  }, [profile]);

  const toggleGap = (id) => {
    const current = form.gaps || [];
    const next = current.includes(id) ? current.filter(g => g !== id) : [...current, id];
    setForm(f => ({ ...f, gaps: next }));
  };

  const handleSave = async () => {
    setSaved(false); setSaveError(false);
    try {
      let updatedForm = { ...form };
      const w = parseFloat(form.weight);
      const h = parseFloat(form.height);
      if (w > 0 || h > 0) {
        const entry = { date: new Date().toISOString().split("T")[0] };
        if (w > 0) entry.weight = w;
        if (h > 0) entry.height = h;
        const prev = (form.measurements || []).filter(m => m.date !== entry.date);
        updatedForm = {
          ...updatedForm,
          weight: w > 0 ? w : (updatedForm.weight || null),
          height: h > 0 ? h : (updatedForm.height || null),
          measurements: [entry, ...prev].slice(0, 12),
        };
        setForm(updatedForm);
      }
      await saveProfile(updatedForm);
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
        <div className="card-title">📏 Physical Measurements</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>Log monthly. The AI uses this to adjust loading recommendations as she grows.</p>
        <div className="grid2">
          <div>
            <div className="label">Weight (kg)</div>
            <input
              type="number" placeholder="e.g. 42" min="20" max="120" step="0.1"
              value={form.weight || ""}
              onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
            />
          </div>
          <div>
            <div className="label">Height (cm)</div>
            <input
              type="number" placeholder="e.g. 155" min="100" max="220" step="0.5"
              value={form.height || ""}
              onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
            />
          </div>
        </div>
        {(form.measurements || []).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Measurement History</div>
            {(form.measurements || []).slice(0, 6).map((m, i) => (
              <div key={i} className="stat-row" style={{ fontSize: "0.82rem" }}>
                <span style={{ color: COLORS.muted }}>{m.date}</span>
                <span>
                  {m.weight ? <span style={{ color: COLORS.text, marginRight: 12 }}>{m.weight} kg</span> : null}
                  {m.height ? <span style={{ color: COLORS.text }}>{m.height} cm</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="note-box mt16">
          💡 Save the profile each time you update measurements. A new entry is recorded with today's date.
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
        <textarea
          rows={4}
          placeholder="Any injuries, form concerns, exercises to avoid, or special instructions…"
          value={form.coachNotes}
          onChange={e => setForm(f => ({ ...f, coachNotes: e.target.value }))}
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        style={{ width: "100%", justifyContent: "center", padding: "13px" }}
      >
        {saved ? "✓ Profile Saved!" : saveError ? "⚠ Save Failed — Try Again" : "Save Profile"}
      </button>
    </div>
  );
}

// ─── ATHLETE VIEW (mobile-first) ─────────────────────────────────────────────
function AthleteView({ athleteId, user, onSignOut }) {
  const [section, setSection]     = useState("log");
  const [currentPlan, setPlan]    = useState(null);
  const [planLoading, setPlanLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "plans", athleteId))
      .then(snap => { if (snap.exists()) setPlan(snap.data()); })
      .catch(e => console.error("Load plan error:", e))
      .finally(() => setPlanLoading(false));
  }, [athleteId]);

  const NAV = [
    { id: "log",       icon: "📋", label: "Log Session" },
    { id: "wellbeing", icon: "💚", label: "Wellbeing" },
    { id: "plan",      icon: "🎯", label: "My Plan" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      <style>{css}</style>

      <div style={{ padding: "20px 16px 14px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.accent, lineHeight: 1 }}>Athlete OS</h1>
        <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
      </div>

      <div style={{ padding: "20px 16px 110px", maxWidth: 480, margin: "0 auto" }}>
        {section === "log"       && <AVLogSession athleteId={athleteId} />}
        {section === "wellbeing" && <AVWellbeing  athleteId={athleteId} />}
        {section === "plan"      && <AVPlan plan={currentPlan} loading={planLoading} />}
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`,
        display: "flex", zIndex: 100,
      }}>
        {NAV.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              flex: 1, padding: "12px 4px 20px", border: "none",
              background: "transparent",
              color: section === s.id ? COLORS.accent : COLORS.muted,
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.72rem", fontWeight: 600,
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 5, transition: "color 0.15s",
            }}
          >
            <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── AV: LOG SESSION ──────────────────────────────────────────────────────────
function AVLogSession({ athleteId }) {
  const [type, setType]           = useState("tennis");
  const [sportName, setSportName] = useState("");
  const [duration, setDuration]   = useState("");
  const [rpe, setRpe]             = useState(null);
  const [focus, setFocus]         = useState("");
  const [date, setDate]           = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    getDocs(query(
      collection(db, "athletes", athleteId, "weekLogs"),
      orderBy("date", "desc"), limit(5)
    ))
      .then(snap => {
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) =>
          `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`)
        );
        setRecentLogs(logs);
      })
      .catch(() => {});
  }, [athleteId]);

  const TENNIS_FOCUS = ["Baseline rallying", "Serve practice", "Footwork / movement", "Match play", "Volley / net", "Conditioning", "Full practice"];
  const CHEER_FOCUS  = ["Stunt practice", "Tumbling", "Dance / routine", "Competition prep", "Conditioning", "Full practice"];
  const OTHER_FOCUS  = ["Practice / Training", "Competition", "Conditioning", "Full session"];

  const handleSave = async () => {
    if (!duration || !rpe || saving) return;
    setSaving(true);
    const entry = {
      type, duration: parseInt(duration),
      intensity: Math.ceil(rpe / 2), rpe,
      focus, date, time: new Date().toTimeString().slice(0, 5),
    };
    if (type === "other" && sportName.trim()) entry.sportName = sportName.trim();
    const ref = await addDoc(collection(db, "athletes", athleteId, "weekLogs"), entry);
    setRecentLogs(prev => {
      const updated = [{ id: ref.id, ...entry }, ...prev];
      updated.sort((a, b) =>
        `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`)
      );
      return updated.slice(0, 5);
    });
    setSaved(true); setDuration(""); setRpe(null); setFocus(""); setSportName("");
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const TypeBtn = ({ t, icon, label, color }) => (
    <button
      onClick={() => { setType(t); setFocus(""); setSportName(""); }}
      style={{
        flex: 1, padding: "16px 6px", borderRadius: 14,
        border: `2px solid ${type === t ? color : COLORS.border}`,
        background: type === t ? `${color}14` : "transparent",
        color: type === t ? color : COLORS.muted,
        fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>{icon}</div>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 20 }}>Log Session</div>

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">Activity</div>
        <div style={{ display: "flex", gap: 10 }}>
          <TypeBtn t="tennis" icon="🎾" label="Tennis"      color={COLORS.tennis} />
          <TypeBtn t="cheer"  icon="📣" label="Cheerleading" color={COLORS.cheer}  />
          <TypeBtn t="other"  icon="🏃" label="Other Sport"  color={COLORS.yellow} />
        </div>
      </div>

      {type === "other" && (
        <div style={{ marginBottom: 22 }}>
          <div className="av-big-label">Sport Name</div>
          <input
            placeholder="e.g. Swimming, Basketball…"
            value={sportName}
            onChange={e => setSportName(e.target.value)}
            style={{ fontSize: "1rem", padding: "13px 14px" }}
          />
          <div className="av-hint" style={{ marginTop: 6 }}>Weighted at 0.6× in load calculations</div>
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">Duration (minutes)</div>
        <input
          type="number" placeholder="e.g. 90"
          value={duration} onChange={e => setDuration(e.target.value)}
          min="10" max="300"
          style={{ fontSize: "1.2rem", padding: "14px 16px" }}
        />
      </div>

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">How hard was it? (RPE 1–10)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 10 }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button
              key={n}
              onClick={() => setRpe(n)}
              style={{
                padding: "16px 4px", borderRadius: 10,
                border: `2px solid ${rpe === n ? COLORS.accent : COLORS.border}`,
                background: rpe === n ? COLORS.accentMuted : "transparent",
                color: rpe === n ? COLORS.accent : COLORS.muted,
                fontFamily: "'DM Sans', sans-serif", fontSize: "1.15rem", fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >{n}</button>
          ))}
        </div>
        {rpe ? (
          <div style={{
            background: COLORS.accentMuted, border: `1px solid ${COLORS.accentDim}`,
            borderRadius: 10, padding: "10px 14px", textAlign: "center",
          }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.accent }}>RPE {rpe} — </span>
            <span style={{ fontSize: "0.9rem", color: COLORS.text, fontWeight: 500 }}>
              {[,"Very easy — barely moving","Easy — could do this all day","Moderate — comfortable but working","Somewhat hard","Hard — starting to breathe heavy","Hard","Very hard — difficult to maintain","Very very hard","Almost max — can barely speak","Maximum — couldn't do more"][rpe]}
            </span>
          </div>
        ) : (
          <div style={{ background: COLORS.surface, borderRadius: 10, padding: "10px 14px" }}>
            {[
              [1,"Very easy — barely moving"],
              [2,"Easy — could do this all day"],
              [3,"Moderate — comfortable but working"],
              [4,"Somewhat hard"],
              [5,"Hard — starting to breathe heavy"],
              [6,"Hard"],
              [7,"Very hard — difficult to maintain"],
              [8,"Very very hard"],
              [9,"Almost max — can barely speak"],
              [10,"Maximum — couldn't do more"],
            ].map(([n, desc]) => (
              <div key={n} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0" }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1rem", color: COLORS.accent, minWidth: 20 }}>{n}</span>
                <span style={{ fontSize: "0.78rem", color: COLORS.muted }}>{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 22 }}>
        <div className="av-big-label">Session Focus</div>
        <select value={focus} onChange={e => setFocus(e.target.value)} style={{ fontSize: "1rem", padding: "13px 14px" }}>
          <option value="">Select focus…</option>
          {(type === "tennis" ? TENNIS_FOCUS : type === "cheer" ? CHEER_FOCUS : OTHER_FOCUS).map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div className="av-big-label">Date</div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: "1rem", padding: "13px 14px" }} />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving || !duration || !rpe}
        style={{ width: "100%", justifyContent: "center", padding: "18px", fontSize: "1rem" }}
      >
        {saving ? "Saving…" : saved ? "✓ Session Logged!" : "Save Session"}
      </button>

      {recentLogs.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Recent Sessions</div>
          {recentLogs.map(log => {
            const typeColor = log.type === "tennis" ? COLORS.tennis : log.type === "cheer" ? COLORS.cheer : COLORS.yellow;
            const typeLabel = log.type === "tennis" ? "🎾 Tennis" : log.type === "cheer" ? "📣 Cheer" : `🏃 ${log.sportName || "Other"}`;
            const rpeVal = log.rpe ?? (log.intensity ? log.intensity * 2 : "?");
            return (
              <div key={log.id} style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 12, padding: "12px 14px", marginBottom: 8,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: typeColor }}>{typeLabel}</span>
                  {log.focus && <span style={{ color: COLORS.muted, fontSize: "0.8rem", marginLeft: 8 }}>{log.focus}</span>}
                  <div style={{ color: COLORS.muted, fontSize: "0.72rem", marginTop: 3 }}>{log.date} · {log.duration} min</div>
                </div>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem",
                  color: COLORS.accent, textAlign: "right",
                }}>RPE {rpeVal}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AV: WELLBEING CHECK ──────────────────────────────────────────────────────
function AVWellbeing({ athleteId }) {
  // Morning state
  const [sleep, setSleep]       = useState(null);
  const [moodAM, setMoodAM]     = useState(null);
  const [sorenessAM, setSorenessAM] = useState(null);
  const [savingAM, setSavingAM] = useState(false);
  const [savedAM, setSavedAM]   = useState(false);

  // Night state
  const [energy, setEnergy]     = useState(null);
  const [moodPM, setMoodPM]     = useState(null);
  const [sorenessPM, setSorenessPM] = useState(null);
  const [notes, setNotes]       = useState("");
  const [savingPM, setSavingPM] = useState(false);
  const [savedPM, setSavedPM]   = useState(false);

  // History
  const [history, setHistory]   = useState([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    getDocs(query(
      collection(db, "athletes", athleteId, "wellbeing"),
      orderBy("date", "desc"), limit(5)
    ))
      .then(snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(e => console.error("Load wellbeing history error:", e))
      .finally(() => setHistLoading(false));
  }, [athleteId]);

  const saveEntry = async (type, data, setSaving, setSaved) => {
    setSaving(true);
    const entry = {
      ...data, type,
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
    };
    const ref = await addDoc(collection(db, "athletes", athleteId, "wellbeing"), entry);
    setHistory(prev => [{ id: ref.id, ...entry }, ...prev].slice(0, 5));
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSaveAM = () => {
    if (!sleep || !moodAM || !sorenessAM || savingAM) return;
    saveEntry("morning", { sleep, mood: moodAM, soreness: sorenessAM }, setSavingAM, setSavedAM);
  };

  const handleSavePM = () => {
    if (!energy || !moodPM || !sorenessPM || savingPM) return;
    saveEntry("night", { energy, mood: moodPM, soreness: sorenessPM, notes: notes.trim() }, setSavingPM, setSavedPM);
  };

  const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
  const SORENESS_OPTIONS = [
    { icon: "💚", label: "None" }, { icon: "🟡", label: "Mild" },
    { icon: "🟠", label: "Mod"  }, { icon: "🔴", label: "Sore" }, { icon: "🆘", label: "Bad" },
  ];
  const ENERGY_OPTIONS = [
    { icon: "🪫", label: "Empty" }, { icon: "😴", label: "Low" },
    { icon: "😐", label: "OK"    }, { icon: "⚡", label: "Good" }, { icon: "🔥", label: "Great" },
  ];

  const EmojiRow = ({ options, value, onChange, activeColor }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      {options.map(({ icon, label }, i) => {
        const n = i + 1;
        return (
          <button
            key={n} onClick={() => onChange(n)}
            style={{
              flex: 1, padding: "14px 4px", borderRadius: 12,
              border: `2px solid ${value === n ? activeColor : COLORS.border}`,
              background: value === n ? `${activeColor}18` : "transparent",
              fontSize: "1.4rem", cursor: "pointer", transition: "all 0.15s",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}
          >
            {icon}
            <span style={{ fontSize: "0.65rem", color: value === n ? activeColor : COLORS.muted, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const NumGrid = ({ value, onChange, color }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 8 }}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button
          key={n} onClick={() => onChange(n)}
          style={{
            padding: "14px 4px", borderRadius: 10,
            border: `2px solid ${value === n ? color : COLORS.border}`,
            background: value === n ? `${color}18` : "transparent",
            color: value === n ? color : COLORS.muted,
            fontFamily: "'DM Sans', sans-serif", fontSize: "1.1rem", fontWeight: 700,
            cursor: "pointer", transition: "all 0.15s",
          }}
        >{n}</button>
      ))}
    </div>
  );

  const moodLabel     = ["","Rough","Meh","OK","Good","Great"];
  const sorenessLabel = ["","None","Mild","Moderate","Sore","Very sore"];
  const energyLabel   = ["","Empty","Low","OK","Good","Great"];

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 20 }}>Wellbeing</div>

      {/* ── MORNING ── */}
      <div style={{ fontSize: "0.72rem", color: COLORS.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>☀️ Morning Check-in</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">🌙 Sleep last night — how many hours?</div>
        <NumGrid value={sleep} onChange={setSleep} color={COLORS.accent} />
        {sleep && <div style={{ marginTop: 8, color: COLORS.muted, fontSize: "0.82rem", textAlign: "center" }}>{sleep} hour{sleep !== 1 ? "s" : ""}</div>}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">😊 How are you feeling this morning?</div>
        <EmojiRow options={MOODS.map((icon, i) => ({ icon, label: moodLabel[i+1] }))} value={moodAM} onChange={setMoodAM} activeColor={COLORS.yellow} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="av-big-label">💪 Body soreness this morning?</div>
        <EmojiRow options={SORENESS_OPTIONS} value={sorenessAM} onChange={setSorenessAM} activeColor={COLORS.red} />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSaveAM}
        disabled={savingAM || !sleep || !moodAM || !sorenessAM}
        style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "1rem", marginBottom: 32 }}
      >
        {savingAM ? "Saving…" : savedAM ? "✓ Morning Saved!" : "Save Morning Check-in"}
      </button>

      {/* ── NIGHT ── */}
      <div style={{ fontSize: "0.72rem", color: COLORS.accentDim, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>🌙 Tonight's Check-in</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">⚡ Energy level today?</div>
        <EmojiRow options={ENERGY_OPTIONS} value={energy} onChange={setEnergy} activeColor={COLORS.yellow} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">💪 Body soreness tonight?</div>
        <EmojiRow options={SORENESS_OPTIONS} value={sorenessPM} onChange={setSorenessPM} activeColor={COLORS.red} />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="av-big-label">😊 Mood tonight?</div>
        <EmojiRow options={MOODS.map((icon, i) => ({ icon, label: moodLabel[i+1] }))} value={moodPM} onChange={setMoodPM} activeColor={COLORS.yellow} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="av-big-label">📝 Notes <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: "0.85rem" }}>(optional)</span></div>
        <textarea
          rows={3}
          placeholder="e.g. knee felt tight after practice, very tired…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ fontSize: "0.95rem", marginTop: 4, resize: "none" }}
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSavePM}
        disabled={savingPM || !energy || !moodPM || !sorenessPM}
        style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "1rem", marginBottom: 32, background: COLORS.accentDim }}
      >
        {savingPM ? "Saving…" : savedPM ? "✓ Tonight Saved!" : "Save Tonight's Check-in"}
      </button>

      {/* ── HISTORY ── */}
      <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Recent Check-ins</div>
      {histLoading
        ? <div className="empty"><div className="spinner" /></div>
        : history.length === 0
          ? <div style={{ color: COLORS.muted, fontSize: "0.85rem", textAlign: "center", padding: "16px 0" }}>No check-ins logged yet</div>
          : history.map(entry => (
              <div key={entry.id} style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.text }}>{entry.date}</span>
                  <span style={{ fontSize: "0.7rem", color: COLORS.muted, background: COLORS.surface, padding: "2px 8px", borderRadius: 8 }}>
                    {entry.type === "night" ? "🌙 Tonight" : entry.type === "morning" ? "☀️ Morning" : "Check-in"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: "0.78rem", color: COLORS.muted, flexWrap: "wrap" }}>
                  {entry.sleep    && <span>🌙 {entry.sleep}h sleep</span>}
                  {entry.energy   && <span>⚡ Energy {entry.energy}/5 ({energyLabel[entry.energy]})</span>}
                  {entry.mood     && <span>😊 Mood {entry.mood}/5 ({moodLabel[entry.mood]})</span>}
                  {entry.soreness && <span>💪 Soreness {entry.soreness}/5 ({sorenessLabel[entry.soreness]})</span>}
                  {entry.notes    && <span style={{ color: COLORS.text, fontStyle: "italic", width: "100%", marginTop: 2 }}>"{entry.notes}"</span>}
                </div>
              </div>
            ))
      }
    </div>
  );
}

// ─── AV: MY PLAN (read-only) ──────────────────────────────────────────────────
function AVPlan({ plan, loading }) {
  if (loading) return <div className="empty" style={{ paddingTop: 60 }}><div className="spinner" /></div>;

  if (!plan) return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 20 }}>My Plan</div>
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🎯</div>
        <div style={{ color: COLORS.muted, fontSize: "0.9rem", lineHeight: 1.6 }}>No plan yet.<br />Your coach will generate one for you.</div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 4 }}>My Plan</div>
      {plan.generatedAt && (
        <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginBottom: 16 }}>
          Generated {new Date(plan.generatedAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </div>
      )}

      {plan.briefing && (
        <div className="card" style={{ borderColor: COLORS.accentDim, marginBottom: 16 }}>
          <div style={{ fontSize: "0.72rem", color: COLORS.accentDim, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Coach's Note</div>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.7, color: COLORS.text }}>{plan.briefing}</p>
        </div>
      )}

      {(plan.plan || []).map((ex, i) => (
        <div
          key={i}
          style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "16px", marginBottom: 10,
            display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 6 }}>{ex.name}</div>
            <span className="badge badge-gray">{ex.category}</span>
            {ex.note && <div style={{ fontSize: "0.78rem", color: COLORS.accentDim, marginTop: 8, lineHeight: 1.5 }}>→ {ex.note}</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: COLORS.accent, lineHeight: 1 }}>
              {ex.sets}×{ex.reps}{ex.unit === "seconds" ? "s" : ""}
            </div>
            <div style={{ fontSize: "0.65rem", color: COLORS.muted, marginTop: 2 }}>
              sets × {ex.unit === "seconds" ? "sec" : ex.unit || "reps"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
