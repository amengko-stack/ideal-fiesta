import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, BarChart2, Calendar, ChevronLeft, ClipboardCheck, ClipboardList,
  Dumbbell, FileText, Heart, History, MessageSquare, Moon,
  Plus, Ruler, Settings, Sprout, Sun, Target, Trash2, TrendingUp,
  User, UserPlus, Users, Zap,
} from "lucide-react";
import { auth, db } from "./firebase";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, addDoc, deleteDoc,
  collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";
import { saveDeferredPriorities, checkEscalations, resolveDeferred } from "./deferredPriorities.js";

// In development the Express proxy runs on localhost:3001.
// In production (Firebase Hosting) /api/chat is rewritten to the Cloud Function.
const API_URL = import.meta.env.DEV
  ? "http://localhost:3001/api/chat"
  : "/api/chat";

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
  .header { padding: 16px 0 14px; border-bottom: 1px solid ${COLORS.border}; margin-bottom: 22px; }
  .header h1 { font-size: clamp(1.4rem, 3.5vw, 2rem); color: ${COLORS.accent}; line-height: 1; letter-spacing: 0.06em; }
  .header p { color: ${COLORS.muted}; font-size: 0.9rem; margin-top: 6px; }
  .tabs { display: flex; gap: 4px; background: ${COLORS.surface}; border-radius: 10px; padding: 4px; margin-bottom: 28px; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { flex-shrink: 0; padding: 10px 14px; border: none; border-radius: 7px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500; color: ${COLORS.muted}; background: transparent; transition: all 0.18s; text-align: center; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .tab.active { background: ${COLORS.accent}; color: #000; font-weight: 600; }
  .card { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .card-title { font-size: 1.1rem; color: ${COLORS.accent}; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .badge-green { background: rgba(0,229,160,0.15); color: ${COLORS.accent}; }
  .badge-yellow { background: rgba(245,197,24,0.15); color: ${COLORS.yellow}; }
  .badge-red { background: rgba(255,77,109,0.15); color: ${COLORS.red}; }
  .badge-gray { background: rgba(90,106,126,0.2); color: ${COLORS.muted}; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  @media(max-width:640px){ .grid2 { grid-template-columns: 1fr; } .grid3 { grid-template-columns: 1fr; } }
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
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: COLORS.accent, marginBottom: 6, letterSpacing: "0.06em" }}>Performance Tracker</h1>
        <p style={{ color: COLORS.muted, fontSize: "0.82rem", marginBottom: 36 }}>Tennis · Cheerleading · Strength</p>
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
              name="athleteName"
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
          <div className="flex-between" style={{ alignItems: "center" }}>
            <div>
              <h1>Performance Tracker</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.7rem", background: COLORS.accentMuted, color: COLORS.accent, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Parent</span>
                <span style={{ fontSize: "0.75rem", color: COLORS.muted }}>{user.displayName}</span>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Users size={18} /> Athletes</div>
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
            <div className="card-title"><UserPlus size={18} /> New Athlete</div>
            <div className="label">Athlete Name</div>
            <input
              name="newAthleteName"
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

// ─── ALERTS BANNER ────────────────────────────────────────────────────────────
function AlertsBanner({ athleteId, wellbeing, sessionHistory, weekLogs }) {
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dismissed, setDismissed] = useState({});

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);

      // Load dismissed alert IDs first
      let dismissedMap = {};
      try {
        const snap = await getDocs(collection(db, "athletes", athleteId, "dismissedAlerts"));
        snap.docs.forEach(d => { dismissedMap[d.id] = true; });
      } catch (_) {}
      if (cancelled) return;
      setDismissed(dismissedMap);

      const metrics = calculateMetrics(weekLogs, wellbeing);

      // Helpers
      const recentWellbeing = (days) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split("T")[0];
        const byDate = {};
        (wellbeing || [])
          .filter(w => w.date >= cutoffStr)
          .forEach(w => {
            if (!byDate[w.date] || (w.time || "") > (byDate[w.date].time || ""))
              byDate[w.date] = w;
          });
        return Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1);
      };

      const checks = [
        // 1. Load spike — ACWR > 1.3
        async () => {
          const { acwr } = metrics;
          if (acwr === null || acwr <= 1.3) return null;
          const id = `load-spike-${Math.round(acwr * 10)}`;
          return {
            id, severity: "red",
            title: "Load Spike Detected",
            body:  `Acute:chronic workload ratio is ${acwr} (threshold: 1.3). High injury risk — consider reducing intensity this week.`,
          };
        },

        // 2. Mood decline — avg mood < 2.5 for 3+ consecutive recent days
        async () => {
          const recent = recentWellbeing(7);
          const moodDays = recent.filter(w => w.mood != null);
          if (moodDays.length < 3) return null;
          let consecutiveLow = 0;
          for (let i = moodDays.length - 1; i >= 0; i--) {
            if (moodDays[i].mood < 2.5) consecutiveLow++;
            else break;
          }
          if (consecutiveLow < 3) return null;
          const id = `mood-decline-${moodDays[moodDays.length - 1].date}`;
          return {
            id, severity: "orange",
            title: "Mood Decline",
            body:  `Mood has been below 2.5/5 for ${consecutiveLow} consecutive days. Check in with your athlete.`,
          };
        },

        // 3. Deferred escalations
        async () => {
          const escalated = await checkEscalations(athleteId);
          if (!escalated.length) return null;
          return escalated.map(e => ({
            id:       `escalation-${e.id}`,
            severity: "red",
            title:    `Priority Escalated: ${e.priority}`,
            body:     `"${e.priority}" has been deferred for ${e.weeksDeferredCount} weeks without resolution.${e.reason ? ` Reason: ${e.reason}` : ""}`,
          }));
        },

        // 4. Overdue fitness test — no benchmark session in 56 days, or never logged
        async () => {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 56);
          const cutoffStr = cutoff.toISOString().split("T")[0];
          const hasRecent = (sessionHistory || []).some(
            s => (s.type === "fitness_test" || s.isBenchmark) && s.date >= cutoffStr
          );
          if (hasRecent) return null;
          const id = `fitness-test-overdue`;
          return {
            id, severity: "gray",
            title: "Fitness Test Overdue",
            body:  "No benchmark fitness test logged in the past 8 weeks. Consider scheduling one.",
          };
        },

        // 5. Upcoming tournament within 7 days
        async () => {
          const snap = await getDocs(collection(db, "athletes", athleteId, "weekLogs"));
          const logs = snap.docs.map(d => d.data());
          const today = new Date().toISOString().split("T")[0];
          const in7 = new Date();
          in7.setDate(in7.getDate() + 7);
          const in7Str = in7.toISOString().split("T")[0];
          const upcoming = logs.find(
            l => l.tournamentDate && l.tournamentDate >= today && l.tournamentDate <= in7Str
          );
          if (!upcoming) return null;
          const id = `tournament-${upcoming.tournamentDate}`;
          return {
            id, severity: "blue",
            title: "Tournament This Week",
            body:  `Tournament on ${upcoming.tournamentDate}. Review the weekly plan and ensure a taper is in place.`,
          };
        },

        // 6. Sleep deficit — avg sleep < 7h for 5 recent days
        async () => {
          const recent = recentWellbeing(7);
          const sleepDays = recent.filter(w => w.sleep != null);
          if (sleepDays.length < 5) return null;
          const avgSleep = sleepDays.reduce((s, w) => s + w.sleep, 0) / sleepDays.length;
          if (avgSleep >= 7) return null;
          const id = `sleep-deficit-${sleepDays[sleepDays.length - 1].date}`;
          return {
            id, severity: "orange",
            title: "Sleep Deficit",
            body:  `Average sleep is ${avgSleep.toFixed(1)} hours over the past ${sleepDays.length} days (recommended: 7+).`,
          };
        },

        // 7. Extended high load — 3 consecutive weeks sRPE > 2000
        async () => {
          const { weekSRPEs } = metrics;
          const consecutiveHigh = weekSRPEs.slice(0, 3).every(s => s > 2000);
          if (!consecutiveHigh) return null;
          return {
            id: `high-load-3wk`, severity: "orange",
            title: "Extended High Training Load",
            body:  `sRPE has exceeded 2000 for 3 consecutive weeks (${weekSRPEs[2]}, ${weekSRPEs[1]}, ${weekSRPEs[0]}). Consider a deload week.`,
          };
        },

        // 8. Technical review due
        async () => {
          const today = new Date().toISOString().split("T")[0];
          const snap = await getDocs(collection(db, "athletes", athleteId, "technicalAssessments"));
          const allDocs = snap.docs.map(d => d.data());
          // latest entry per stroke area
          const byArea = {};
          allDocs.forEach(a => {
            if (!byArea[a.strokeArea] || a.date > byArea[a.strokeArea].date) byArea[a.strokeArea] = a;
          });
          const due = Object.values(byArea).filter(a => a.reviewDueDate && a.reviewDueDate <= today);
          if (!due.length) return null;
          return due.map(a => ({
            id:       `tech-review-${(a.strokeArea || "").replace(/\s+/g, "-")}-${a.reviewDueDate}`,
            severity: "blue",
            title:    `🎥 Video Review Due: ${a.strokeArea}`,
            body:     `Scheduled review date reached. Last assessed ${a.date}.`,
          }));
        },
      ];

      const results = await Promise.all(checks.map(fn => fn().catch(() => null)));
      if (cancelled) return;

      const severityOrder = { red: 0, orange: 1, blue: 2, gray: 3 };
      const flat = results
        .flat()
        .filter(Boolean)
        .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
      setAlerts(flat);
      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [athleteId, weekLogs, wellbeing, sessionHistory]);

  const dismiss = async (alertId) => {
    setDismissed(prev => ({ ...prev, [alertId]: true }));
    try {
      await setDoc(
        doc(db, "athletes", athleteId, "dismissedAlerts", alertId),
        { dismissedAt: new Date().toISOString() }
      );
    } catch (_) {}
  };

  const visible = alerts.filter(a => !dismissed[a.id]);

  if (loading) {
    return (
      <div style={{ padding: "8px 16px", color: COLORS.muted, fontSize: "0.75rem" }}>
        Checking alerts…
      </div>
    );
  }

  if (!visible.length) return null;

  const severityStyle = {
    red:    { border: `1px solid ${COLORS.red}`,    background: "rgba(255,77,109,0.08)",  color: COLORS.red    },
    orange: { border: "1px solid #f59e0b",           background: "rgba(245,158,11,0.08)",  color: "#f59e0b"     },
    blue:   { border: "1px solid #3b82f6",           background: "rgba(59,130,246,0.08)",  color: "#3b82f6"     },
    gray:   { border: `1px solid ${COLORS.muted}`,   background: "rgba(90,106,126,0.08)",  color: COLORS.muted  },
  };

  return (
    <div style={{ padding: "0 16px 8px" }}>
      {visible.map(alert => {
        const s = severityStyle[alert.severity] || severityStyle.gray;
        return (
          <div key={alert.id} style={{
            ...s,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 8,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", color: s.color, marginBottom: 2 }}>
                {alert.title}
              </div>
              <div style={{ fontSize: "0.78rem", color: COLORS.text, lineHeight: 1.5 }}>
                {alert.body}
              </div>
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.muted, fontSize: "1rem", lineHeight: 1,
                padding: "0 2px", flexShrink: 0,
              }}
              aria-label="Dismiss"
            >×</button>
          </div>
        );
      })}
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
    const load = async () => {
      try {
        const [profileSnap, logsSnap, sessSnap, wellSnap, planSnap] = await Promise.all([
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
          getDoc(doc(db, "athletes", athleteId, "plans", "current")),
        ]);
        if (profileSnap.exists()) setProfile(profileSnap.data());
        setWeekLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setSessionHistory(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setWellbeing(wellSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (planSnap.exists()) {
          setPlanResult(planSnap.data());
        }
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
          <div className="flex-between" style={{ alignItems: "center" }}>
            <h1>Performance Tracker</h1>
            <div style={{ display: "flex", gap: 8 }}>
              {onBack && (
                <button className="btn btn-ghost btn-sm" onClick={onBack}>← Athletes</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { label: profile?.name || "Athlete",   color: COLORS.accent,  bg: COLORS.accentMuted },
              { label: "Age 12",                     color: COLORS.muted,   bg: COLORS.surface },
              { label: "Tennis",                     color: COLORS.tennis,  bg: "rgba(200,245,100,0.1)" },
              { label: "Cheer",                      color: COLORS.cheer,   bg: "rgba(245,100,200,0.1)" },
              ...(isParent ? [{ label: "Parent View", color: COLORS.yellow, bg: "rgba(245,197,24,0.12)" }] : []),
            ].map(chip => (
              <span key={chip.label} style={{
                fontSize: "0.68rem", fontWeight: 600, padding: "2px 8px",
                borderRadius: 20, color: chip.color, background: chip.bg,
                whiteSpace: "nowrap",
              }}>{chip.label}</span>
            ))}
          </div>
        </div>

        {isParent && !loading && (
          <AlertsBanner
            athleteId={athleteId}
            wellbeing={wellbeing}
            sessionHistory={sessionHistory}
            weekLogs={weekLogs}
          />
        )}

        <div className="tabs">
          {[
            { id: "plan",     Icon: Target,        label: "Sunday Plan" },
            { id: "log",      Icon: ClipboardList, label: "Log Activity" },
            { id: "strength", Icon: Dumbbell,      label: "Log Strength" },
            { id: "matches",    Icon: History,        label: "Matches" },
            { id: "priorities", Icon: ClipboardCheck, label: "Priorities" },
            ...(isParent ? [
              { id: "benchmarks", Icon: TrendingUp, label: "Benchmarks" },
              { id: "technical",  Icon: FileText,   label: "Technical"  },
            ] : []),
            { id: "profile",    Icon: Settings,       label: "Profile" },
          ].map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <t.Icon size={14} strokeWidth={2} style={{ flexShrink: 0 }} />{t.label}
            </button>
          ))}
        </div>

        {tab === "plan"     && <PlanTab athleteId={athleteId} profile={profile} weekLogs={weekLogs} sessionHistory={sessionHistory} wellbeing={wellbeing} aiLoading={aiLoading} setAiLoading={setAiLoading} planResult={planResult} setPlanResult={setPlanResult} />}
        {tab === "log"      && <LogTab weekLogs={weekLogs} addWeekLog={addWeekLog} deleteWeekLog={deleteWeekLog} />}
        {tab === "strength" && <StrengthLogTab sessionHistory={sessionHistory} addSession={addSession} planResult={planResult} />}
        {tab === "matches"     && <MatchesTab     athleteId={athleteId} />}
        {tab === "priorities"  && <PrioritiesTab  athleteId={athleteId} />}
        {tab === "benchmarks"  && isParent && <BenchmarksTab athleteId={athleteId} profile={profile} />}
        {tab === "technical"   && isParent && <TechnicalTab  athleteId={athleteId} />}
        {tab === "profile"     && <ProfileTab     profile={profile} saveProfile={saveProfile} />}
      </div>
    </>
  );
}

// ─── PLAN TAB ─────────────────────────────────────────────────────────────────
function PlanTab({ athleteId, profile, weekLogs, sessionHistory, wellbeing, aiLoading, setAiLoading, planResult, setPlanResult }) {
  const [tournament, setTournament] = useState("none");
  const [sessionTime, setSessionTime] = useState("10:00");
  const [aiError, setAiError] = useState("");
  const [escalations, setEscalations] = useState([]);
  const isGenerating = useRef(false);

  const gaps = profile?.gaps || [];

  const handleGenerate = async () => {
    if (isGenerating.current) return;
    isGenerating.current = true;
    setAiLoading(true);
    setAiError("");
    setPlanResult(null);
    setEscalations([]);

    // Fetch unified context (includes match analysis + deferred priorities)
    const ctx = athleteId ? await buildAthleteContext(athleteId).catch(() => null) : null;

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
RECENT MATCH FINDINGS
═══════════════════════════════════════════
${(() => {
      const rm = ctx?.recentMatch;
      const ma = ctx?.matchAnalysis;
      if (!rm || !ma) return "No recent match within the last 14 days.";
      const matchDate = rm.matchStartTime ? new Date(rm.matchStartTime).toLocaleDateString() : "unknown date";
      const findingsText = (ma.criticalFindings || []).length > 0
        ? ma.criticalFindings.map(f => `  - [${f.priority}] ${f.finding}`).join("\n")
        : "  None recorded.";
      const matchDeferredText = (ma.deferredPriorities || []).length > 0
        ? ma.deferredPriorities.map(d => `  - ${d.priority}${d.resolveCondition ? ` — resolve when: ${d.resolveCondition}` : ""}`).join("\n")
        : "  None.";
      return `Match vs ${rm.opponentName || "Unknown"} on ${matchDate} (${rm.whoWonMatch === 1 ? "WIN" : "LOSS"}):
Critical findings:
${findingsText}
Deferred from match analysis:
${matchDeferredText}`;
    })()}

═══════════════════════════════════════════
ACTIVE DEFERRED PRIORITIES (all previous weeks)
═══════════════════════════════════════════
${(ctx?.deferredPriorities || []).length > 0
      ? (ctx.deferredPriorities).map(d => `  - ${d.priority} (deferred ${d.weeksDeferredCount} wk${d.weeksDeferredCount !== 1 ? "s" : ""})${d.resolveCondition ? ` — resolve when: ${d.resolveCondition}` : ""}`).join("\n")
      : "  None."}

═══════════════════════════════════════════
RECENT TECHNICAL ASSESSMENTS (High priority only)
═══════════════════════════════════════════
${(ctx?.technicalAssessments || []).length > 0
      ? ctx.technicalAssessments.map(a =>
          `- ${a.strokeArea} (${a.category}) — assessed ${a.date} via ${a.source}:\n  ${a.assessment}`
        ).join('\n\n')
      : 'None recorded.'}

INSTRUCTION: Use the technical assessments above to inform exercise selection. Map each assessment to the most relevant physical training component:
- Kinetic chain issues → rotational power, hip hinge, med ball rotational throws
- Drive consistency → core stability, lateral movement, deceleration
- Serve mechanics → shoulder stability, overhead pressing, trunk rotation
- Movement/footwork → agility, plyometrics, lateral hops
If a technical assessment conflicts with load constraints, acknowledge it and defer the physical component — do not ignore it entirely.

═══════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════
Design the best possible Sunday session using ALL context above:
- Heavy tennis/cheer week → reduce strength volume to prevent overtraining
- Light week → can handle more volume and harder progressions
- Progress exercises from history: easy last time → increase; hard → hold or reduce
- Prioritise exercises that address critical match findings and longest-deferred priorities
- Always include ACL-risk mitigation (hip/glute work + landing mechanics)
- You may introduce new exercises beyond the familiar list when appropriate

SESSION STRUCTURE:
- Order: Warmup → Mobility → Plyometrics → Power → Strength → Core → Agility → Conditioning → Recovery
- Total exercises: 8–12 | At least 2 warmup/mobility to open
- Tournament week: max 6 exercises, activation only, nothing that causes soreness next day

Respond with ONLY valid JSON, no other text:
{
  "sessionType": "full | reduced | activation | recovery",
  "sessionDuration": 60,
  "loadRationale": "2-3 sentences on how this week's load shaped the prescription",
  "matchRationale": "2-3 sentences on which match findings are addressed today and which are deferred — or null if no recent match",
  "techAssessmentRationale": "1-2 sentences on which technical assessments influenced today's exercise selection and how — or null if none recorded",
  "overallRationale": "one paragraph integrating load + match + tournament into a coherent session explanation",
  "exercises": [
    {
      "name": "Exercise Name",
      "category": "Warmup|Mobility|Plyometrics|Power|Strength|Core|Agility|Conditioning|Recovery",
      "sets": 2,
      "reps": 10,
      "restSeconds": 60,
      "progressionNote": "what changed from last session and why",
      "tennisConnection": "which match finding or tennis gap this addresses",
      "ageFlag": "safe | formCheck | advanced"
    }
  ],
  "deferredPriorities": [
    {
      "priority": "what was identified but not trained today",
      "reason": "why deferred",
      "resolveCondition": "condition for when to address"
    }
  ],
  "coachNote": "short paragraph for the parent — plain language, no jargon",
  "athleteNote": "one encouraging sentence written directly to Valissa"
}`;

    const systemPrompt =
`You are an elite junior tennis strength and conditioning coach for adolescent athletes. You make integrated decisions balancing training load, match findings, tournament proximity, and long-term athletic development.

PRIORITY HIERARCHY — apply strictly in this order:
1. Safety: if acute:chronic ratio > 1.3 OR average mood < 2 for 3+ consecutive days OR athlete within 48 hours post-tournament → prescribe recovery session only, override everything else
2. Tournament proximity: if tournament within 7 days → reduce all volume 35%, familiar exercises only, no new movements, keep agility and movement quality intact
3. Weekly load: if sRPE > 2000 → reduce weighted sets by 1, shorten session by 15 minutes. ALWAYS protect regardless of load: at least one agility movement, at least one plyometric, one core exercise — non-negotiable for age 12 athletic development window
4. Match findings: within constraints set by rules 1-3, prioritise exercises addressing critical findings and active deferred priorities — longest deferred first
5. Progression: apply progressive overload only if rules 1-4 leave room — never sacrifice recovery for progression

Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` anywhere in your response. Start your response with { and end with }.`;

    try {
      console.log('[plan-debug] technicalAssessments in context:', ctx?.technicalAssessments?.length, JSON.stringify(ctx?.technicalAssessments?.[0]));
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: [{ role: "user", content: prompt }], max_tokens: 4000 })
      });
      const data = await res.json();
      const rawText = (data.content?.[0]?.text ?? data.content?.map(b => b.text || "").join("") ?? "").trim();
      const cleanText = rawText
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!cleanText.endsWith("}")) throw new Error("AI response was truncated — max_tokens too low");
      const clean = cleanText.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_, inner) =>
        '"' + inner
          .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") + '"'
      );
      const parsed = JSON.parse(clean);
      console.log('[plan-debug] techAssessmentRationale:', parsed?.techAssessmentRationale);

      // Map new exercises schema → existing plan format so all display logic is unchanged
      const plan = (parsed.exercises || []).map(ex => ({
        ...ex,
        id:   ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        unit: "reps",
        note: [ex.progressionNote, ex.tennisConnection ? `Tennis: ${ex.tennisConnection}` : null]
          .filter(Boolean).join(" · "),
      }));

      const rm = ctx?.recentMatch;
      const planData = {
        plan,
        briefing:        parsed.overallRationale || parsed.coachNote || "",
        sessionType:     parsed.sessionType     ?? null,
        sessionDuration: parsed.sessionDuration ?? null,
        loadRationale:   parsed.loadRationale   ?? null,
        matchRationale:          parsed.matchRationale          ?? null,
        techAssessmentRationale: parsed.techAssessmentRationale ?? null,
        coachNote:       parsed.coachNote       ?? null,
        athleteNote:     parsed.athleteNote     ?? null,
        matchInformedBy: rm ? { opponentName: rm.opponentName, matchStartTime: rm.matchStartTime } : null,
        metrics,
        generatedAt: new Date().toISOString(),
      };
      setPlanResult(planData);
      if (athleteId) {
        await setDoc(doc(db, "athletes", athleteId, "plans", "current"), planData);
      }

      // Persist deferred priorities from today's plan
      if (athleteId && parsed.deferredPriorities?.length > 0) {
        await saveDeferredPriorities(athleteId, parsed.deferredPriorities);
      }

      // Resolve deferred items addressed by today's exercises
      if (athleteId && ctx?.deferredPriorities?.length > 0 && parsed.exercises?.length > 0) {
        for (const ex of parsed.exercises) {
          if (!ex.tennisConnection) continue;
          const matched = ctx.deferredPriorities.find(d =>
            d.priority && ex.tennisConnection.toLowerCase().includes(d.priority.toLowerCase())
          );
          if (matched) await resolveDeferred(athleteId, matched.priority);
        }
      }

      // Check for any escalated priorities
      if (athleteId) {
        const escalatedItems = await checkEscalations(athleteId);
        setEscalations(escalatedItems);
      }
    } catch (e) {
      console.error("Plan generation error:", e);
      setAiError(`Could not generate plan — ${e.message}`);
    } finally {
      isGenerating.current = false;
      setAiLoading(false);
    }
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

  // ACWR gauge: maps 0–2+ range onto a 180° arc
  const acwrGauge = (() => {
    const pct = metrics.acwr === null ? 0 : Math.min(metrics.acwr / 2, 1);
    const angle = pct * 180 - 90; // -90° (left) to +90° (right)
    const r = 52;
    const cx = 70; const cy = 62;
    const toXY = (deg) => ({
      x: cx + r * Math.cos((deg - 90) * Math.PI / 180),
      y: cy + r * Math.sin((deg - 90) * Math.PI / 180),
    });
    // Arc segments: underload (blue) 0–72°, optimal (green) 72–117°, caution (yellow) 117–144°, danger (red) 144–180°
    const segments = [
      { from: 0,   to: 72,  color: "#6eb5ff" },
      { from: 72,  to: 117, color: COLORS.accent },
      { from: 117, to: 144, color: COLORS.yellow },
      { from: 144, to: 180, color: COLORS.red },
    ];
    const arcPath = (fromDeg, toDeg, color) => {
      const start = toXY(fromDeg); const end = toXY(toDeg);
      const large = toDeg - fromDeg > 180 ? 1 : 0;
      return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
    };
    const needle = toXY(metrics.acwr === null ? 0 : Math.min(metrics.acwr / 2, 1) * 180);
    return { segments, arcPath, needle, cx, cy };
  })();

  // Wellbeing colour coding
  const sleepColor  = !metrics.avgSleep  ? COLORS.muted : parseFloat(metrics.avgSleep)  >= 8 ? COLORS.accent  : parseFloat(metrics.avgSleep)  >= 6 ? COLORS.yellow : COLORS.red;
  const moodColor   = !metrics.avgMood   ? COLORS.muted : parseFloat(metrics.avgMood)   >= 4 ? COLORS.accent  : parseFloat(metrics.avgMood)   >= 3 ? COLORS.yellow : COLORS.red;
  const sorenessColor = !metrics.avgSoreness ? COLORS.muted : parseFloat(metrics.avgSoreness) <= 2 ? COLORS.accent : parseFloat(metrics.avgSoreness) <= 3 ? COLORS.yellow : COLORS.red;

  return (
    <div>
      <div className="card">
        <div className="card-title"><BarChart2 size={18} /> Training Load Analysis</div>

        {/* ACWR gauge — hero element */}
        <div style={{ background: COLORS.surface, borderRadius: 12, padding: "16px 14px 10px", marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Acute : Chronic Workload Ratio</div>
          <svg width="140" height="72" viewBox="0 0 140 72" style={{ overflow: "visible" }}>
            {acwrGauge.segments.map((s, i) => (
              <path key={i} d={acwrGauge.arcPath(s.from, s.to, s.color)}
                stroke={s.color} strokeWidth="10" fill="none" strokeLinecap="butt" opacity="0.35" />
            ))}
            {metrics.acwr !== null && (
              <path d={acwrGauge.arcPath(0, Math.min(metrics.acwr / 2, 1) * 180, acwrColor)}
                stroke={acwrColor} strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.9" />
            )}
            {/* Needle */}
            <line
              x1={acwrGauge.cx} y1={acwrGauge.cy}
              x2={acwrGauge.needle.x} y2={acwrGauge.needle.y}
              stroke={acwrColor} strokeWidth="2.5" strokeLinecap="round"
            />
            <circle cx={acwrGauge.cx} cy={acwrGauge.cy} r="4" fill={acwrColor} />
          </svg>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: acwrColor, lineHeight: 1, marginTop: -4 }}>
            {metrics.acwr !== null ? metrics.acwr : "—"}
          </div>
          <span className="badge" style={{ background: `${acwrColor}22`, color: acwrColor, fontSize: "0.78rem", marginTop: 6, display: "inline-flex" }}>{acwrLabel}</span>
          <div style={{ fontSize: "0.66rem", color: COLORS.muted, marginTop: 8 }}>
            <span style={{ color: "#6eb5ff" }}>■</span> Underload &lt;0.8 &nbsp;
            <span style={{ color: COLORS.accent }}>■</span> Optimal 0.8–1.3 &nbsp;
            <span style={{ color: COLORS.yellow }}>■</span> Caution &gt;1.3 &nbsp;
            <span style={{ color: COLORS.red }}>■</span> Danger &gt;1.5
          </div>
        </div>

        {/* sRPE — this week prominent, 4-week avg secondary */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: `${COLORS.accent}14`, border: `1px solid ${COLORS.accentDim}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: "0.68rem", color: COLORS.accentDim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>This week sRPE</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.accent, lineHeight: 1 }}>{metrics.thisWeekSRPE}</div>
            <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 4 }}>{thisWeekLogs.length} session{thisWeekLogs.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ background: COLORS.surface, borderRadius: 10, padding: "14px 12px" }}>
            <div style={{ fontSize: "0.68rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>4-wk avg</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.muted, lineHeight: 1 }}>{metrics.fourWeekAvg || "—"}</div>
            <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 4 }}>sRPE / wk</div>
          </div>
        </div>

        {/* Wellbeing — colour coded */}
        {(metrics.avgSleep || metrics.avgMood || metrics.avgSoreness) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Sleep",    value: metrics.avgSleep    ? `${metrics.avgSleep}h`   : "—", icon: "🌙", color: sleepColor,    hint: metrics.avgSleep ? (parseFloat(metrics.avgSleep) >= 8 ? "Good" : parseFloat(metrics.avgSleep) >= 6 ? "Low" : "Poor") : "" },
              { label: "Mood",     value: metrics.avgMood     ? `${metrics.avgMood}/5`   : "—", icon: "😊", color: moodColor,     hint: metrics.avgMood ? (parseFloat(metrics.avgMood) >= 4 ? "Good" : parseFloat(metrics.avgMood) >= 3 ? "OK" : "Low") : "" },
              { label: "Soreness", value: metrics.avgSoreness ? `${metrics.avgSoreness}/5` : "—", icon: "💪", color: sorenessColor, hint: metrics.avgSoreness ? (parseFloat(metrics.avgSoreness) <= 2 ? "Low" : parseFloat(metrics.avgSoreness) <= 3 ? "Mod" : "High") : "" },
            ].map(s => (
              <div key={s.label} style={{
                background: `${s.color}12`, border: `1px solid ${s.color}33`,
                borderRadius: 8, padding: "10px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: "1rem", marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "0.6rem", color: s.color, opacity: 0.8, marginTop: 1 }}>{s.hint}</div>
                <div style={{ fontSize: "0.6rem", color: COLORS.muted, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 10 }}>
          {metrics.wellbeingDays} days of wellbeing data (7-day avg)
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Zap size={18} /> Generate Sunday Plan</div>
        <div className="grid2">
          <div>
            <div className="label">Tournament Status</div>
            <select name="tournament" value={tournament} onChange={e => setTournament(e.target.value)}>
              <option value="none">Normal week</option>
              <option value="pre">Pre-tournament (next 7 days)</option>
              <option value="week_of">Tournament this week</option>
              <option value="post_easy">Post-tournament (easy)</option>
              <option value="post_hard">Post-tournament (heavy)</option>
            </select>
          </div>
          <div>
            <div className="label">Session Time (Sunday)</div>
            <input name="sessionTime" type="time" value={sessionTime} onChange={e => setSessionTime(e.target.value)} />
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

      {escalations.length > 0 && (
        <div className="card" style={{ borderColor: COLORS.red, background: `${COLORS.red}10` }}>
          <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.9rem", marginBottom: 8 }}>⚠ Escalated Priorities</div>
          {escalations.map((e, i) => (
            <div key={i} style={{ fontSize: "0.83rem", color: COLORS.text, marginBottom: 4 }}>
              <strong>{e.priority}</strong> — deferred {e.weeksDeferredCount} weeks
            </div>
          ))}
        </div>
      )}

      {planResult && (
        <>
          {/* ── Context Summary Card ── */}
          <div className="card" style={{ borderColor: COLORS.accentDim, background: `${COLORS.accent}06` }}>
            <div className="card-title"><BarChart2 size={16} /> Session Context</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: planResult.loadRationale ? 14 : 0 }}>
              {[
                {
                  label: "Load",
                  value: `${planResult.metrics?.thisWeekSRPE ?? "—"} sRPE`,
                  sub: planResult.metrics?.acwr != null
                    ? (planResult.metrics.acwr > 1.5 ? "Very High" : planResult.metrics.acwr > 1.3 ? "High" : planResult.metrics.acwr < 0.8 ? "Low" : "Optimal")
                    : "No data",
                  color: planResult.metrics?.acwr == null ? COLORS.muted
                    : planResult.metrics.acwr > 1.5 ? COLORS.red
                    : planResult.metrics.acwr > 1.3 ? COLORS.yellow
                    : planResult.metrics.acwr < 0.8 ? "#6eb5ff"
                    : COLORS.accent,
                },
                {
                  label: "ACWR",
                  value: planResult.metrics?.acwr != null ? planResult.metrics.acwr.toFixed(2) : "—",
                  sub: "acute:chronic",
                  color: COLORS.text,
                },
                {
                  label: "Session",
                  value: planResult.sessionType ?? "—",
                  sub: planResult.sessionDuration ? `${planResult.sessionDuration} min` : "",
                  color: COLORS.accent,
                },
                {
                  label: "Tournament",
                  value: tournament === "none" ? "Normal week" : tournament.replace(/_/g, " "),
                  sub: "",
                  color: tournament !== "none" ? COLORS.yellow : COLORS.muted,
                },
              ].map(s => (
                <div key={s.label} style={{ background: COLORS.surface, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: "0.62rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: s.color, marginTop: 2 }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize: "0.68rem", color: COLORS.muted, marginTop: 1 }}>{s.sub}</div>}
                </div>
              ))}
            </div>
            {planResult.matchInformedBy && (
              <div style={{ fontSize: "0.78rem", color: COLORS.accentDim, marginBottom: planResult.loadRationale ? 10 : 0 }}>
                ✦ Informed by match vs {planResult.matchInformedBy.opponentName || "opponent"}{planResult.matchInformedBy.matchStartTime ? ` on ${new Date(planResult.matchInformedBy.matchStartTime).toLocaleDateString()}` : ""}
              </div>
            )}
            {planResult.loadRationale && (
              <p style={{ fontSize: "0.82rem", color: COLORS.muted, lineHeight: 1.5, margin: "6px 0 0" }}>{planResult.loadRationale}</p>
            )}
            {planResult.matchRationale && (
              <p style={{ fontSize: "0.82rem", color: COLORS.muted, lineHeight: 1.5, margin: "6px 0 0" }}>{planResult.matchRationale}</p>
            )}
          </div>

          {planResult.techAssessmentRationale && (
            <div className="card" style={{ borderColor: "#7c3aed" }}>
              <div className="card-title" style={{ color: "#7c3aed" }}><FileText size={18} /> Technical Focus</div>
              <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: COLORS.text }}>{planResult.techAssessmentRationale}</p>
            </div>
          )}

          <div className="card" style={{ borderColor: COLORS.accentDim }}>
            <div className="card-title"><MessageSquare size={18} /> Coach's Briefing</div>
            <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: COLORS.text }}>{planResult.briefing}</p>
            {planResult.athleteNote && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: `${COLORS.accent}10`, borderRadius: 8, fontSize: "0.84rem", color: COLORS.accent, fontStyle: "italic" }}>
                "{planResult.athleteNote}"
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><ClipboardCheck size={18} /> Today's Session — {planResult.plan.length} Exercises</div>
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
        <div className="card-title"><Plus size={18} /> Log Activity</div>
        <div className="grid2">
          <div>
            <div className="label">Activity Type</div>
            <select name="activityType" value={type} onChange={e => { setType(e.target.value); setFocus(""); setSportName(""); }}>
              <option value="tennis">🎾 Tennis</option>
              <option value="cheer">📣 Cheerleading</option>
              <option value="other">🏃 Other Sport</option>
            </select>
          </div>
          <div>
            <div className="label">Date</div>
            <input name="activityDate" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Duration (minutes)</div>
            <input name="duration" type="number" placeholder="e.g. 90" value={duration} onChange={e => setDuration(e.target.value)} min="10" max="300" />
          </div>
          <div>
            <div className="label">Time of Day</div>
            <input name="activityTime" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        {type === "other" && (
          <div className="mt16">
            <div className="label">Sport Name</div>
            <input
              name="sportName"
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
          <div className="label" style={{ marginBottom: 10 }}>
            RPE (how hard? 1–10)
            {rpe && <span style={{ marginLeft: 8, color: COLORS.accent, fontWeight: 700 }}>
              {rpe} — {["","Very easy","Easy","Moderate","Somewhat hard","Hard","Hard","Very hard","Very hard","Almost max","Max"][rpe]}
            </span>}
          </div>
          <style>{`
            .rpe-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px; outline: none; cursor: pointer; background: linear-gradient(to right, ${COLORS.accent} 0%, ${COLORS.accent} ${rpe ? (rpe - 1) / 9 * 100 : 0}%, ${COLORS.border} ${rpe ? (rpe - 1) / 9 * 100 : 0}%, ${COLORS.border} 100%); }
            .rpe-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: ${rpe ? COLORS.accent : COLORS.muted}; border: 3px solid ${COLORS.bg}; box-shadow: 0 0 0 2px ${rpe ? COLORS.accent : COLORS.border}; cursor: pointer; transition: background 0.15s, box-shadow 0.15s; }
            .rpe-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: ${rpe ? COLORS.accent : COLORS.muted}; border: 3px solid ${COLORS.bg}; box-shadow: 0 0 0 2px ${rpe ? COLORS.accent : COLORS.border}; cursor: pointer; }
          `}</style>
          <input
            name="rpe"
            type="range" min="1" max="10" step="1"
            value={rpe || 1}
            onChange={e => setRpe(parseInt(e.target.value))}
            className="rpe-slider"
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {[
              { val: 1,  label: "Very Easy" },
              { val: 5,  label: "Moderate"  },
              { val: 10, label: "Max Effort" },
            ].map(({ val, label }) => (
              <div key={val} style={{ textAlign: val === 5 ? "center" : val === 1 ? "left" : "right" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: rpe === val ? COLORS.accent : COLORS.muted }}>{val}</div>
                <div style={{ fontSize: "0.66rem", color: rpe === val ? COLORS.accent : COLORS.muted }}>{label}</div>
              </div>
            ))}
          </div>
          {!rpe && <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 6 }}>Drag to set intensity</div>}
        </div>

        <div className="mt16">
          <div className="label">Session Focus</div>
          <select name="focus" value={focus} onChange={e => setFocus(e.target.value)}>
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
        <div className="card-title"><Calendar size={18} /> This Week's Activity</div>
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
        <div className="card-title"><Dumbbell size={18} /> Log Strength Session</div>
        <div className="grid2">
          <div>
            <div className="label">Date</div>
            <input name="sessionDate" type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Session Time</div>
            <input name="sessionTimeLog" type="time" value={sessionTimeLog} onChange={e => setSessionTimeLog(e.target.value)} />
          </div>
        </div>
        {planResult && <div className="note-box mt16">✓ Pre-filled from today's generated plan. Adjust as needed.</div>}
      </div>

      {logExercises.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "28px 20px" }}>
          <Dumbbell size={32} color={COLORS.muted} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>No exercises yet</div>
          <div style={{ color: COLORS.muted, fontSize: "0.82rem", marginBottom: 18 }}>
            Add your first exercise to get started
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {["Squats", "Lunges", "Push-ups", "Plank"].map(name => (
              <button
                key={name}
                className="btn btn-ghost btn-sm"
                onClick={() => setLogExercises(prev => [...prev, {
                  id: `custom_${Date.now()}_${name}`, name,
                  sets: 2, reps: 10, weight: "", difficulty: 3, completed: true, notes: ""
                }])}
                style={{ borderRadius: 20, padding: "6px 14px", fontSize: "0.82rem" }}
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {logExercises.map((ex, idx) => (
        <div key={idx} className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>
              {ex.name
                ? ex.name
                : <input name="exerciseName" placeholder="Exercise name…" value={ex.name} onChange={e => updateEx(idx, "name", e.target.value)} style={{ fontWeight: 600 }} />
              }
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => setLogExercises(prev => prev.filter((_, i) => i !== idx))}>✕</button>
          </div>
          <div className="grid2">
            <div>
              <div className="label">Sets Done</div>
              <input name="sets" type="number" value={ex.sets} onChange={e => updateEx(idx, "sets", e.target.value)} min="1" max="8" />
            </div>
            <div>
              <div className="label">Reps Done</div>
              <input name="reps" type="number" value={ex.reps} onChange={e => updateEx(idx, "reps", e.target.value)} min="1" max="50" />
            </div>
            <div>
              <div className="label">Weight (kg, optional)</div>
              <input name="exerciseWeight" placeholder="e.g. 4kg or bodyweight" value={ex.weight} onChange={e => updateEx(idx, "weight", e.target.value)} />
            </div>
            <div>
              <div className="label">Completed all sets?</div>
              <select name="completed" value={ex.completed ? "yes" : "no"} onChange={e => updateEx(idx, "completed", e.target.value === "yes")}>
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

// ─── PLIST PARSER ─────────────────────────────────────────────────────────────
function parsePlistNode(node) {
  const tag = node.tagName;
  if (tag === "dict") {
    const children = [...node.childNodes].filter(n => n.nodeType === 1);
    const obj = {};
    for (let i = 0; i < children.length - 1; i += 2) {
      const key = children[i].textContent.trim();
      obj[key] = parsePlistNode(children[i + 1]);
    }
    return obj;
  }
  if (tag === "array") {
    return [...node.childNodes].filter(n => n.nodeType === 1).map(parsePlistNode);
  }
  if (tag === "string")  return node.textContent;
  if (tag === "integer") return parseInt(node.textContent, 10);
  if (tag === "real")    return parseFloat(node.textContent);
  if (tag === "true")    return true;
  if (tag === "false")   return false;
  if (tag === "date")    return node.textContent.trim();
  return node.textContent;
}

function parsePlist(xmlString) {
  if (xmlString.startsWith("bplist")) {
    throw new Error("binary-plist");
  }

  const xmlDoc = new DOMParser().parseFromString(xmlString, "text/xml");
  const parseErr = xmlDoc.querySelector("parsererror");
  if (parseErr) {
    console.error("[matchtrack] DOMParser error:", parseErr.textContent);
    throw new Error("xml-parse-error");
  }

  const plist = xmlDoc.querySelector("plist");
  if (!plist) {
    console.error("[matchtrack] no <plist> element found. Document element:", xmlDoc.documentElement?.tagName);
    throw new Error("no-plist-element");
  }

  const root = [...plist.childNodes].find(n => n.nodeType === 1);
  if (!root) {
    console.error("[matchtrack] plist has no child element nodes");
    throw new Error("empty-plist");
  }

  return parsePlistNode(root);
}

function extractMatchData(plistObj) {
  const players  = plistObj.players ?? [];
  const { id, matchStartTime, season, whoWonMatch, matchLog = [] } = plistObj;

  // ─── CRITICAL FIX ────────────────────────────────────────────────────────────
  // The plist has 4 player objects. The outer playerNumber is NOT reliable.
  // Real stats are found by reading stats[last].playerNumber:
  //   stats[last].playerNumber === 1  →  Valissa's real cumulative stats
  //   stats[last].playerNumber === 2  →  Opponent's real cumulative stats
  // The player objects where outer playerNumber is 1 or 2 contain only zeros.
  // ─────────────────────────────────────────────────────────────────────────────
  const resolveStats = p => {
    const s = p.stats;
    if (Array.isArray(s) && s.length > 0) return s[s.length - 1];
    if (s && typeof s === "object") return s;
    return {};
  };

  // Detect if stats completely absent (addMatch format — all stats arrays empty)
  const totalActivity = players.reduce((sum, p) => {
    const s = resolveStats(p);
    return sum + (s.winners ?? 0) + (s.unforcedErrors ?? 0) + (s.forcedErrors ?? 0);
  }, 0);
  const statsCompletelyAbsent = totalActivity === 0;

  // Player names from matchLog are always reliable
  const firstPoint = matchLog[0] ?? {};
  const valissaName = firstPoint.pOneName ?? "Valissa";
  const opponentName = firstPoint.pTwoName ?? "Opponent";

  const STAT_FIELDS = [
    "aces", "doubleFaults", "firstServePct", "firstServePoints", "firstServePointsWon",
    "secondServePoints", "secondServePointsWon", "winners", "unforcedErrors", "forcedErrors",
    "breakPointsWon", "breakPoints", "breakPointsSaved", "breakPointsFaced",
    "firstReturnPoints", "firstReturnPointsWon", "secondReturnPoints", "secondReturnPointsWon",
    "deucePointsWon", "fhWinner", "fhError", "bhWinner", "bhError",
    "fhReturnWinner", "fhReturnError", "bhReturnWinner", "bhReturnError",
    "fhVolleyWinner", "fhVolleyError", "bhVolleyWinner", "bhVolleyError",
    "approachWinner", "approachError", "fhSliceWinner", "fhSliceError",
    "bhSliceWinner", "bhSliceError", "overheadWinner", "overheadError",
    "setOneScore", "setTwoScore", "setsWon",
  ];

  const POINT_FIELDS = [
    "pointNumber", "setNumber", "gameNumber", "rallyLength",
    "whoHitShot", "whoWonPoint", "whoServed", "pointShotType", "pointWonType",
    "errorType", "shotLocation", "serveType", "breakPoint",
    "gameEndedOnPoint", "setEndedOnPoint", "matchEndedOnPoint",
    "pOneGameScore", "pTwoGameScore", "pOneSetScore", "pTwoSetScore", "pointTime",
  ];

  const pickStatFields = (source, fields) => {
    const result = {};
    for (const f of fields) result[f] = (source ?? {})[f] ?? 0;
    return result;
  };
  const pickFields = (source, fields) => {
    const result = {};
    for (const f of fields) result[f] = (source ?? {})[f] ?? null;
    return result;
  };

  let p1Stats, p2Stats;

  if (statsCompletelyAbsent) {
    p1Stats = Object.fromEntries(STAT_FIELDS.map(f => [f, 0]));
    p2Stats = Object.fromEntries(STAT_FIELDS.map(f => [f, 0]));
  } else {
    const scoredPlayers = players.map(p => {
      const s = resolveStats(p);
      const activity = (s.winners ?? 0) + (s.unforcedErrors ?? 0) + (s.forcedErrors ?? 0);
      return { p, s, activity };
    }).sort((a, b) => b.activity - a.activity);

    let p1Raw = scoredPlayers[0]?.p ?? {};
    let p2Raw = scoredPlayers[1]?.p ?? {};

    const pTwoName = firstPoint.pTwoName ?? "";
    if (p1Raw.name && pTwoName && p1Raw.name === pTwoName) {
      [p1Raw, p2Raw] = [p2Raw, p1Raw];
    }

    p1Stats = pickStatFields(resolveStats(p1Raw), STAT_FIELDS);
    p2Stats = pickStatFields(resolveStats(p2Raw), STAT_FIELDS);
  }

  // Parse matchLog — whoWonPoint "1" = Valissa, "2" = opponent
  const points = matchLog
    .map(pt => pickFields(pt, POINT_FIELDS))
    .sort((a, b) => (a.pointNumber ?? 0) - (b.pointNumber ?? 0));

  // ─── COMPLETE STATS RECONSTRUCTION FROM MATCHLOG ─────────────────────────────
  // Runs for all matches. For absent-stats matches, provides all values.
  // For normal matches, fills in missing shot breakdown only.

  const SHOT_FIELD_MAP = {
    'fh': 'fh', 'fhS': 'fhSlice', 'fhV': 'fhVolley', 'fhR': 'fhReturn',
    'fhIO': 'fhIO', 'fhOH': 'overhead', 'fhA': 'approach',
    'bh': 'bh', 'bhS': 'bhSlice', 'bhV': 'bhVolley', 'bhR': 'bhReturn', 'bhA': 'approach',
  };
  const SVC_WINNER_SHOTS = new Set(['svcW', 'svcW-t', 'svcW-w']);

  // Initialize reconstruction accumulators
  const rec = {
    p1: { firstServeIn:0, firstServePointsWon:0, secondServePoints:0, secondServePointsWon:0,
      doubleFaults:0, serviceWinners:0, aces:0,
      breakPointsFaced:0, breakPointsSaved:0, breakPointsWon:0, breakPoints:0,
      firstReturnPoints:0, firstReturnPointsWon:0, secondReturnPoints:0, secondReturnPointsWon:0,
      winners:0, unforcedErrors:0, forcedErrors:0,
      fhWinner:0, fhError:0, bhWinner:0, bhError:0,
      fhSliceWinner:0, fhSliceError:0, fhVolleyWinner:0, fhVolleyError:0,
      fhReturnWinner:0, fhReturnError:0, fhIOWinner:0, fhIOError:0,
      overheadWinner:0, overheadError:0, approachWinner:0, approachError:0,
      bhSliceWinner:0, bhSliceError:0, bhVolleyWinner:0, bhVolleyError:0,
      bhReturnWinner:0, bhReturnError:0,
    },
    p2: { firstServeIn:0, firstServePointsWon:0, secondServePoints:0, secondServePointsWon:0,
      doubleFaults:0, serviceWinners:0, aces:0,
      breakPointsFaced:0, breakPointsSaved:0, breakPointsWon:0, breakPoints:0,
      firstReturnPoints:0, firstReturnPointsWon:0, secondReturnPoints:0, secondReturnPointsWon:0,
      winners:0, unforcedErrors:0, forcedErrors:0,
      fhWinner:0, fhError:0, bhWinner:0, bhError:0,
      fhSliceWinner:0, fhSliceError:0, fhVolleyWinner:0, fhVolleyError:0,
      fhReturnWinner:0, fhReturnError:0, fhIOWinner:0, fhIOError:0,
      overheadWinner:0, overheadError:0, approachWinner:0, approachError:0,
      bhSliceWinner:0, bhSliceError:0, bhVolleyWinner:0, bhVolleyError:0,
      bhReturnWinner:0, bhReturnError:0,
    }
  };

  for (const pt of points) {
    const whoServedRaw = pt.whoServed ?? pt.whoHitShot;
    const whoServedInt = parseInt(whoServedRaw, 10);
    if (whoServedInt !== 1 && whoServedInt !== 2) continue;
    const whoHit      = pt.whoHitShot;
    const whoWon      = pt.whoWonPoint;
    const serve       = parseInt(pt.serveType, 10);
    const wonType     = pt.pointWonType ?? '';
    const shot        = pt.pointShotType ?? '';
    const isP1Serving = whoServedInt === 1;
    const serverWon   = parseInt(whoWon, 10) === whoServedInt;
    const server      = isP1Serving ? rec.p1 : rec.p2;
    const returner    = isP1Serving ? rec.p2 : rec.p1;
    // eslint-disable-next-line eqeqeq
    const hitter      = whoHit == 1 ? rec.p1 : rec.p2;
    const field       = SHOT_FIELD_MAP[shot];
    // eslint-disable-next-line eqeqeq
    const isBreak     = pt.breakPoint == 1;

    // SERVICE STATS
    if (serve === 1) {
      server.firstServeIn += 1;
      if (serverWon) server.firstServePointsWon += 1;
      if (SVC_WINNER_SHOTS.has(shot)) server.serviceWinners += 1;
    } else if (serve === 2) {
      server.secondServePoints += 1;
      if (wonType === 'df') server.doubleFaults += 1;
      else if (serverWon) server.secondServePointsWon += 1;
    }

    // BREAK POINTS
    if (isBreak) {
      server.breakPointsFaced += 1;
      if (serverWon) server.breakPointsSaved += 1;
      returner.breakPoints += 1;
      if (!serverWon) returner.breakPointsWon += 1;
    }

    // RETURN STATS
    if (serve === 1) {
      returner.firstReturnPoints += 1;
      if (!serverWon) returner.firstReturnPointsWon += 1;
    } else if (serve === 2 && wonType !== 'df') {
      returner.secondReturnPoints += 1;
      if (!serverWon) returner.secondReturnPointsWon += 1;
    }

    // WINNERS AND ERRORS
    if (wonType === 'w' && !SVC_WINNER_SHOTS.has(shot)) {
      hitter.winners += 1;
      if (field) hitter[`${field}Winner`] += 1;
    } else if (wonType === 'ufE') {
      hitter.unforcedErrors += 1;
      if (field) hitter[`${field}Error`] += 1;
    } else if (wonType === 'fE') {
      hitter.forcedErrors += 1;
      if (field) hitter[`${field}Error`] += 1;
    }
  }

  // Calculate first serve %
  const p1TotalFirstAttempts = rec.p1.firstServeIn + rec.p1.secondServePoints;
  const p2TotalFirstAttempts = rec.p2.firstServeIn + rec.p2.secondServePoints;
  rec.p1.firstServePct = p1TotalFirstAttempts > 0 ? rec.p1.firstServeIn / p1TotalFirstAttempts * 100 : 0;
  rec.p2.firstServePct = p2TotalFirstAttempts > 0 ? rec.p2.firstServeIn / p2TotalFirstAttempts * 100 : 0;
  rec.p1.firstServePoints = rec.p1.firstServeIn;
  rec.p2.firstServePoints = rec.p2.firstServeIn;

  // Apply reconstruction:
  // For absent-stats matches — use reconstruction for everything
  // For normal matches — only fill in shot breakdown if missing from stats
  if (statsCompletelyAbsent) {
    Object.assign(p1Stats, rec.p1);
    Object.assign(p2Stats, rec.p2);
  } else {
    const statsHasShotData = (p1Stats.fhWinner ?? 0) + (p1Stats.fhError ?? 0) +
      (p1Stats.bhWinner ?? 0) + (p1Stats.bhError ?? 0) > 0;
    if (!statsHasShotData) {
      const shotOnlyFields = ['fhWinner','fhError','bhWinner','bhError',
        'fhSliceWinner','fhSliceError','fhVolleyWinner','fhVolleyError',
        'fhReturnWinner','fhReturnError','fhIOWinner','fhIOError',
        'overheadWinner','overheadError','approachWinner','approachError',
        'bhSliceWinner','bhSliceError','bhVolleyWinner','bhVolleyError',
        'bhReturnWinner','bhReturnError','winners','unforcedErrors','forcedErrors'];
      for (const f of shotOnlyFields) {
        p1Stats[f] = rec.p1[f];
        p2Stats[f] = rec.p2[f];
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────



  // Derived calculations
  const wueRatio = p1Stats.unforcedErrors > 0
    ? +((p1Stats.winners ?? 0) / p1Stats.unforcedErrors).toFixed(2)
    : null;
  const firstServePointsWonPct = p1Stats.firstServePoints > 0
    ? +((p1Stats.firstServePointsWon ?? 0) / p1Stats.firstServePoints * 100).toFixed(1)
    : null;
  const secondServePointsWonPct = p1Stats.secondServePoints > 0
    ? +((p1Stats.secondServePointsWon ?? 0) / p1Stats.secondServePoints * 100).toFixed(1)
    : null;

  // Rally length distribution
  // whoWonPoint in matchLog is a string "1" or "2" — must use loose equality
  const buckets = {
    "0-4": { total: 0, won: 0 },
    "5-8": { total: 0, won: 0 },
    "9+":  { total: 0, won: 0 },
  };
  for (const pt of points) {
    const rl = parseInt(pt.rallyLength, 10);
    if (isNaN(rl)) continue;
    // eslint-disable-next-line eqeqeq
    const valissaWon = pt.whoWonPoint == "1";
    const key = rl <= 4 ? "0-4" : rl <= 8 ? "5-8" : "9+";
    buckets[key].total++;
    if (valissaWon) buckets[key].won++;
  }
  const rallyDistribution = {};
  for (const [key, { total, won }] of Object.entries(buckets)) {
    rallyDistribution[key] = {
      total,
      valissaWins: won,
      valissaWinPct: total > 0 ? +(won / total * 100).toFixed(1) : null,
    };
  }

  // Set scores — read from stats when available, reconstruct from matchLog when absent
  let setScores;
  if (statsCompletelyAbsent) {
    const setMap = {};
    for (const pt of points) {
      const setNum = pt.setNumber;
      if (setNum == null) continue;
      if (!setMap[setNum]) setMap[setNum] = { p1: 0, p2: 0 };
      // eslint-disable-next-line eqeqeq
      if (pt.pOneSetScore != null) setMap[setNum].p1 = Math.max(setMap[setNum].p1, Number(pt.pOneSetScore));
      // eslint-disable-next-line eqeqeq
      if (pt.pTwoSetScore != null) setMap[setNum].p2 = Math.max(setMap[setNum].p2, Number(pt.pTwoSetScore));
    }
    const setNums = Object.keys(setMap).map(Number).sort((a, b) => a - b);
    setScores = {
      p1: setNums.map(n => setMap[n].p1),
      p2: setNums.map(n => setMap[n].p2),
    };
  } else {
    setScores = {
      p1: [p1Stats.setOneScore, p1Stats.setTwoScore].filter(s => s !== null),
      p2: [p2Stats.setOneScore, p2Stats.setTwoScore].filter(s => s !== null),
    };
  }

  return {
    matchId:        String(id),
    matchStartTime: matchStartTime ?? null,
    season:         season ?? null,
    whoWonMatch:    whoWonMatch ?? null,
    valissaName,
    opponentName,
    setScores,
    valissa:        p1Stats,
    opponent:       p2Stats,
    matchLog:       points,
    calculated: {
      wueRatio,
      firstServePointsWonPct,
      secondServePointsWonPct,
      rallyDistribution,
    },
  };
}

// ─── ATHLETE CONTEXT BUILDER ─────────────────────────────────────────────────
// Assembles a unified context object from Firestore before every AI analysis.
// tournamentStatus lives at: athletes/{uid}/config/tournamentStatus
// deferredPriorities live at: athletes/{uid}/deferredPriorities (status="active")
async function buildAthleteContext(athleteUid) {
  const now       = new Date();
  const msPerDay  = 24 * 60 * 60 * 1000;
  const isoToday  = now.toISOString().slice(0, 10);
  const cutoff28  = new Date(now - 28 * msPerDay).toISOString().slice(0, 10);
  const cutoff14  = new Date(now - 14 * msPerDay).toISOString().slice(0, 10);
  const cutoff7   = new Date(now - 7  * msPerDay).toISOString().slice(0, 10);

  // Assign a ISO week key (Monday-anchored) to a YYYY-MM-DD date string
  const weekKey = dateStr => {
    const d   = new Date(dateStr);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return mon.toISOString().slice(0, 10);
  };
  const thisWeekKey = weekKey(isoToday);

  // ── 1. Session logs (weekLogs) — last 28 days ──────────────────────────────
  const logsSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "weekLogs"), orderBy("date", "desc"))
  );
  const allLogs = logsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.date >= cutoff28);

  const logsWithSrpe = allLogs.map(l => ({
    ...l,
    srpe: (l.rpe ?? 0) * (l.duration ?? 0),
  }));

  const weeklyTotals = {};
  for (const l of logsWithSrpe) {
    const wk = weekKey(l.date);
    weeklyTotals[wk] = (weeklyTotals[wk] ?? 0) + l.srpe;
  }
  const thisWeekSrpe  = weeklyTotals[thisWeekKey] ?? 0;
  // 4-week average divides total load by 4 regardless of how many weeks have data
  const fourWeekTotal = Object.values(weeklyTotals).reduce((s, v) => s + v, 0);
  const fourWeekAvg   = +(fourWeekTotal / 4).toFixed(1);
  const acwr          = fourWeekAvg > 0 ? +(thisWeekSrpe / fourWeekAvg).toFixed(2) : null;

  const sessionLogs = {
    sessions:        logsWithSrpe,
    thisWeekSrpe,
    fourWeekAvgSrpe: fourWeekAvg,
    acwr,
  };

  // ── 2. Wellbeing — last 7 days ─────────────────────────────────────────────
  const wellSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "wellbeing"), orderBy("date", "desc"), limit(14))
  );
  const wellEntries = wellSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(w => w.date >= cutoff7);

  const numAvg = vals => vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;

  const sleepVals    = wellEntries.map(e => e.sleep).filter(v => v != null);
  // Wellbeing entries store mood/soreness as mood or moodAM/moodPM depending on type
  const moodVals     = wellEntries.map(e => e.mood ?? e.moodAM ?? e.moodPM).filter(v => v != null);
  const sorenessVals = wellEntries.map(e => e.soreness ?? e.sorenessAM ?? e.sorenessPM).filter(v => v != null);

  // Consecutive low-mood check (sort asc so days are in order)
  const sortedWell = [...wellEntries].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0, maxStreak = 0;
  for (const e of sortedWell) {
    const m = e.mood ?? e.moodAM ?? e.moodPM;
    if (m != null && m < 2.5) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else if (m != null)        { streak = 0; }
  }

  const wellbeing = {
    entries:        wellEntries,
    avgSleepHours:  numAvg(sleepVals),
    avgMood:        numAvg(moodVals),
    avgSoreness:    numAvg(sorenessVals),
    lowMoodFlag:    maxStreak >= 3,
    lowSleepFlag:   sleepVals.filter(s => s < 7).length >= 5,
  };

  // ── 3. Tournament status ───────────────────────────────────────────────────
  let tournamentStatus = {
    hasUpcomingTournament:   false,
    daysUntilTournament:     null,
    playedTournamentRecently: false,
    daysSinceTournament:     null,
  };
  try {
    const tSnap = await getDoc(doc(db, "athletes", athleteUid, "config", "tournamentStatus"));
    if (tSnap.exists()) {
      const t        = tSnap.data();
      const daysUntil = t.upcomingTournamentDate
        ? Math.round((new Date(t.upcomingTournamentDate) - now) / msPerDay)
        : null;
      const daysSince = t.lastTournamentDate
        ? Math.round((now - new Date(t.lastTournamentDate)) / msPerDay)
        : null;
      tournamentStatus = {
        hasUpcomingTournament:    daysUntil != null && daysUntil >= 0,
        daysUntilTournament:      daysUntil != null && daysUntil >= 0 ? daysUntil : null,
        playedTournamentRecently: daysSince != null && daysSince <= 14,
        daysSinceTournament:      daysSince,
      };
    }
  } catch (_) { /* document not yet created — defaults stand */ }

  // ── 4. Last strength session ───────────────────────────────────────────────
  const strengthSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "sessions"), orderBy("date", "desc"), limit(1))
  );
  let lastStrengthSession = null;
  if (!strengthSnap.empty) {
    const s = strengthSnap.docs[0].data();
    lastStrengthSession = {
      date:      s.date ?? null,
      exercises: (s.exercises ?? []).map(ex => ({
        name:             ex.name,
        setsCompleted:    ex.sets,
        repsCompleted:    ex.reps,
        difficultyRating: ex.difficulty,
        completed:        ex.completed,
      })),
    };
  }

  // ── 5. Athlete profile ─────────────────────────────────────────────────────
  const profileSnap = await getDoc(doc(db, "athletes", athleteUid));
  let athleteProfile = null;
  if (profileSnap.exists()) {
    const p   = profileSnap.data();
    const dob = p.dob ? new Date(p.dob) : null;
    athleteProfile = {
      name:       p.name ?? null,
      age:        dob ? Math.floor((now - dob) / (365.25 * msPerDay)) : null,
      tennisSaps: p.gaps ?? [],
      phvStage:   p.phvStage ?? null,
    };
  }

  // ── 6. Most recent match — last 14 days ────────────────────────────────────
  const matchesSnap = await getDocs(collection(db, "matches"));
  const recentMatch = matchesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.athleteId === athleteUid && (m.matchStartTime ?? "") >= cutoff14)
    .sort((a, b) => (b.matchStartTime ?? "").localeCompare(a.matchStartTime ?? ""))[0] ?? null;

  // ── 6b. AI match analysis for the most recent match ───────────────────────
  let matchAnalysis = { criticalFindings: [], deferredPriorities: [] };
  if (recentMatch?.id) {
    try {
      const analysisSnap = await getDoc(doc(db, "athletes", athleteUid, "matchAnalyses", recentMatch.id));
      if (analysisSnap.exists()) {
        const a = analysisSnap.data();
        matchAnalysis = {
          criticalFindings:   Array.isArray(a.criticalFindings)   ? a.criticalFindings   : [],
          deferredPriorities: Array.isArray(a.deferredPriorities) ? a.deferredPriorities : [],
        };
      }
    } catch (_) {}
  }

  // ── 7. Deferred priorities (status = "active") ─────────────────────────────
  const dpSnap = await getDocs(collection(db, "athletes", athleteUid, "deferredPriorities"));
  const deferredPriorities = dpSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(dp => dp.status === "active")
    .map(dp => ({
      priority:          dp.priority   ?? null,
      reason:            dp.reason     ?? null,
      deferredDate:      dp.deferredDate ?? null,
      resolveCondition:  dp.resolveCondition ?? null,
      weeksDeferredCount: dp.weeksDeferredCount ?? 0,
    }));

  // ── 8. Technical assessments — 3 most recent High priority ────────────────
  let technicalAssessments = [];
  try {
    const taSnap = await getDocs(
      query(collection(db, "athletes", athleteUid, "technicalAssessments"), orderBy("date", "desc"), limit(30))
    );
    const priorityOrder = { High: 0, Medium: 1, Monitor: 2 };
    technicalAssessments = taSnap.docs
      .map(d => d.data())
      .filter(a => a.priority === "High" || a.priority === "Medium")
      .sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))
      .slice(0, 3)
      .map(a => ({
        strokeArea:  a.strokeArea  ?? null,
        category:    a.category    ?? null,
        date:        a.date        ?? null,
        source:      a.source      ?? null,
        assessment:  a.assessment  ?? null,
        priority:    a.priority    ?? null,
      }));
  } catch (_) {}

  const context = {
    generatedAt:         now.toISOString(),
    athleteUid,
    sessionLogs,
    wellbeing,
    tournamentStatus,
    lastStrengthSession,
    athleteProfile,
    recentMatch,
    matchAnalysis,
    deferredPriorities,
    technicalAssessments,
  };

  return context;
}

// ─── MATCH DETAIL VIEW ────────────────────────────────────────────────────────
function MatchDetail({ match, onBack, onDelete, athleteId }) {
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [analysis,        setAnalysis]        = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError,   setAnalysisError]   = useState(null);
  const [escalations,     setEscalations]     = useState([]);

  const v    = match.valissa  || {};
  const o    = match.opponent || {};
  const calc = match.calculated || {};
  const rally = calc.rallyDistribution || {};

  // Load existing saved analysis on mount
  useEffect(() => {
    if (!athleteId) return;
    const matchId = match.id || match.matchId;
    if (!matchId) return;
    getDoc(doc(db, "athletes", athleteId, "matchAnalyses", matchId))
      .then(snap => { if (snap.exists()) setAnalysis(snap.data()); })
      .catch(() => {});
  }, [athleteId, match.id, match.matchId]);

  const handleGenerateAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const context = await buildAthleteContext(athleteId);

      const acwr = context.sessionLogs.acwr;
      const loadLevel = acwr == null ? "Unknown"
        : acwr < 0.8  ? "Low"
        : acwr <= 1.3 ? "Optimal"
        : acwr <= 1.5 ? "High"
        : "Very High";

      const matchId = match.id || match.matchId;
      const dp = context.deferredPriorities;

      const scoreStr = (match.setScores?.p1 || [])
        .map((s, i) => `${s}–${match.setScores?.p2?.[i] ?? "?"}`)
        .join(", ") || "unknown";

      const safePct = (won, total) =>
        won != null && total > 0 ? Math.round(won / total * 100) + "%" : "—";

      const systemPrompt =
        "You are an expert youth tennis coach analyzing a competitive match for a developing athlete. " +
        "Your role is to provide developmental coaching insights — find patterns, highlight strengths, " +
        "identify priorities for growth. Be constructive and age-appropriate. " +
        "Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include ```json or ``` anywhere in your response. Start your response with { and end with }.";

      const userPrompt =
`Analyze this tennis match for ${context.athleteProfile?.name || "Valissa"}, age ${context.athleteProfile?.age || 12}.

MATCH: ${match.whoWonMatch === 1 ? "WIN" : "LOSS"} vs ${match.opponentName || "Opponent"} on ${match.matchStartTime ? new Date(match.matchStartTime).toLocaleDateString() : "unknown date"}
Score: ${scoreStr}

SERVICE STATS (Valissa / Opponent):
- 1st Serve %: ${v.firstServePct != null ? Math.round(v.firstServePct <= 1 ? v.firstServePct * 100 : v.firstServePct) : "—"}% / ${o.firstServePct != null ? Math.round(o.firstServePct <= 1 ? o.firstServePct * 100 : o.firstServePct) : "—"}%
- 1st Serve Pts Won: ${safePct(v.firstServePointsWon, v.firstServePoints)} / ${safePct(o.firstServePointsWon, o.firstServePoints)}
- 2nd Serve Pts Won: ${safePct(v.secondServePointsWon, v.secondServePoints)} / ${safePct(o.secondServePointsWon, o.secondServePoints)}
- Aces: ${v.aces ?? "—"} / ${o.aces ?? "—"}
- Double Faults: ${v.doubleFaults ?? "—"} / ${o.doubleFaults ?? "—"}

POINT STATS (Valissa / Opponent):
- Winners: ${v.winners ?? "—"} / ${o.winners ?? "—"}
- Unforced Errors: ${v.unforcedErrors ?? "—"} / ${o.unforcedErrors ?? "—"}
- Forced Errors: ${v.forcedErrors ?? "—"} / ${o.forcedErrors ?? "—"}
- W:UE Ratio: ${calc.wueRatio != null ? Number(calc.wueRatio).toFixed(2) : "—"} / ${o.unforcedErrors > 0 ? (o.winners / o.unforcedErrors).toFixed(2) : "—"}

RALLY PATTERNS:
- 0–4 shots: ${rally["0-4"]?.total ?? "—"} pts, Valissa win ${rally["0-4"]?.valissaWinPct != null ? rally["0-4"].valissaWinPct + "%" : "—"}
- 5–8 shots: ${rally["5-8"]?.total ?? "—"} pts, Valissa win ${rally["5-8"]?.valissaWinPct != null ? rally["5-8"].valissaWinPct + "%" : "—"}
- 9+ shots: ${rally["9+"]?.total ?? "—"} pts, Valissa win ${rally["9+"]?.valissaWinPct != null ? rally["9+"].valissaWinPct + "%" : "—"}

SHOT BREAKDOWN — Valissa (winners / errors):
- Forehand: ${v.fhWinner ?? 0}W / ${v.fhError ?? 0}E
- Backhand: ${v.bhWinner ?? 0}W / ${v.bhError ?? 0}E
- Return (combined): ${(v.fhReturnWinner ?? 0) + (v.bhReturnWinner ?? 0)}W / ${(v.fhReturnError ?? 0) + (v.bhReturnError ?? 0)}E
- Approach: ${v.approachWinner ?? 0}W / ${v.approachError ?? 0}E

ATHLETE CONTEXT:
- Training load this week (sRPE): ${context.sessionLogs.thisWeekSrpe}
- 4-week avg sRPE: ${context.sessionLogs.fourWeekAvgSrpe}
- ACWR: ${acwr ?? "N/A"} — Load level: ${loadLevel}
- Avg sleep (7 days): ${context.wellbeing.avgSleepHours != null ? context.wellbeing.avgSleepHours + "h" : "no data"}
- Avg mood: ${context.wellbeing.avgMood != null ? context.wellbeing.avgMood + "/5" : "no data"}
- Low mood flag: ${context.wellbeing.lowMoodFlag ? "YES — 3+ consecutive low mood days" : "No"}
- Upcoming tournament: ${context.tournamentStatus.hasUpcomingTournament ? `Yes, ${context.tournamentStatus.daysUntilTournament} days away` : "None"}
- Recent tournament (last 14 days): ${context.tournamentStatus.playedTournamentRecently ? `Yes, ${context.tournamentStatus.daysSinceTournament} days ago` : "No"}

EXISTING DEFERRED PRIORITIES (${dp.length} active):
${dp.length > 0 ? dp.map(d => `- ${d.priority} (deferred ${d.weeksDeferredCount} weeks)`).join("\n") : "None"}

Respond with exactly this JSON structure:
{
  "matchSummary": "2-3 sentence tactical overview of the match",
  "loadContext": "How her current training load, sleep and wellbeing context affects interpretation of this match",
  "criticalFindings": [
    { "finding": "specific observation", "priority": "critical|important|monitor" }
  ],
  "strengthsToReinforce": ["strength1", "strength2"],
  "rallyPatternAnalysis": "Analysis of short/medium/long rally win rates and what they reveal tactically",
  "serveAnalysis": "Specific serve observations and development priorities",
  "shotBreakdownInsights": "Key insights from shot-level winner and error patterns",
  "deferredPriorities": [
    { "priority": "short label", "reason": "why defer now", "resolveCondition": "when to address" }
  ],
  "parentNote": "Message for the parent — context, encouragement, what to watch for",
  "athleteNote": "Direct message for ${context.athleteProfile?.name || "Valissa"} — positive, motivating, 1-2 action points"
}`;

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: [{ role: "user", content: userPrompt }], max_tokens: 4000 })
      });
      const data = await res.json();
      const rawText = (data.content?.[0]?.text ?? data.content?.map(b => b.text || "").join("") ?? "").trim();
      console.log("[analysis] raw API response (first 300):", rawText.slice(0, 300));
      const cleanText = rawText
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!cleanText.endsWith("}")) throw new Error("AI response was truncated — max_tokens too low");
      const clean = cleanText.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_, inner) =>
        '"' + inner
          .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") + '"'
      );
      const parsed = JSON.parse(clean);

      await setDoc(doc(db, "athletes", athleteId, "matchAnalyses", matchId), {
        ...parsed,
        matchId,
        generatedAt: new Date().toISOString(),
      });

      if (parsed.deferredPriorities?.length > 0) {
        await saveDeferredPriorities(athleteId, parsed.deferredPriorities);
      }

      const escalatedItems = await checkEscalations(athleteId);

      setAnalysis(parsed);
      setEscalations(escalatedItems);
    } catch (err) {
      console.error("Analysis error:", err);
      setAnalysisError("Failed to generate analysis. Make sure the backend server is running.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const won = match.whoWonMatch === 1;

  const fmtDate = ts => ts
    ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const fmt      = val => val != null ? val : "—";
  // firstServePct may be stored as decimal (0.65) or integer percentage (65)
  const fmtPct   = val => val != null ? `${Math.round(typeof val === "number" && val <= 1 ? val * 100 : val)}%` : "—";
  const fmtRatio = val => val != null ? Number(val).toFixed(2) : "—";
  const calcPct  = (won, total) => (total > 0 && won != null) ? `${Math.round(won / total * 100)}%` : "—";

  // Score from top-level setScores arrays (setOnePlayerOne etc.)
  const score = (() => {
    const sc = match.setScores;
    if (sc && sc.p1 && sc.p1.length) {
      return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
    }
    // Legacy fallback (old documents stored setOneScore on valissa stats)
    const sets = [];
    if (v.setOneScore != null && o.setOneScore != null) sets.push(`${v.setOneScore}–${o.setOneScore}`);
    if (v.setTwoScore != null && o.setTwoScore != null) sets.push(`${v.setTwoScore}–${o.setTwoScore}`);
    return sets.length ? sets.join(", ") : "—";
  })();

  const oppWueRatio = o.unforcedErrors > 0 ? o.winners / o.unforcedErrors : null;

  // ── Shared table styles ──
  const TH  = { fontSize: "0.7rem", color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", padding: "5px 8px", textAlign: "right" };
  const THL = { ...TH, textAlign: "left" };
  const THV = { ...TH, color: COLORS.accent };
  const TD  = { padding: "9px 8px", fontSize: "0.88rem", textAlign: "right", borderTop: `1px solid ${COLORS.border}`, color: COLORS.text };
  const TDL = { ...TD, textAlign: "left", color: COLORS.muted, fontSize: "0.82rem" };

  // Side-by-side stat table: rows = [label, valissaVal, oppVal, valissaColor?]
  const SideBySide = ({ rows }) => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={THL}>Stat</th>
          <th style={THV}>{match.valissaName || "Valissa"}</th>
          <th style={TH}>{match.opponentName || "Opponent"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, vVal, oVal, vColor]) => (
          <tr key={label}>
            <td style={TDL}>{label}</td>
            <td style={{ ...TD, color: vColor || COLORS.text, fontWeight: vColor ? 700 : 400 }}>{vVal}</td>
            <td style={TD}>{oVal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Match History
      </button>

      {/* ── Section 1: Match Info ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.text, lineHeight: 1.1 }}>
              vs {match.opponentName || "Unknown Opponent"}
            </div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginTop: 3 }}>{fmtDate(match.matchStartTime)}</div>
          </div>
          <span className={`badge ${won ? "badge-green" : "badge-red"}`}>{won ? "Win" : "Loss"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[["Score", score], ["Tournament", match.season || "—"]].map(([label, val]) => (
            <div key={label}>
              <div className="label">{label}</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: COLORS.text, marginTop: 3 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Service Stats ── */}
      <div className="card">
        <div className="card-title"><Zap size={16} /> Service Stats</div>
        <SideBySide rows={[
          ["1st Serve %",          fmtPct(v.firstServePct),                               fmtPct(o.firstServePct)],
          ["1st Serve Pts Won",    calcPct(v.firstServePointsWon, v.firstServePoints),     calcPct(o.firstServePointsWon, o.firstServePoints)],
          ["2nd Serve Pts Won",    calcPct(v.secondServePointsWon, v.secondServePoints),   calcPct(o.secondServePointsWon, o.secondServePoints)],
          ["Aces",                 fmt(v.aces),                                            fmt(o.aces)],
          ["Double Faults",        fmt(v.doubleFaults),                                   fmt(o.doubleFaults)],
        ]} />
      </div>

      {/* ── Section 3: Return Stats ── */}
      <div className="card">
        <div className="card-title"><Activity size={16} /> Return Stats</div>
        <SideBySide rows={[
          ["1st Return Pts Won",   calcPct(v.firstReturnPointsWon, v.firstReturnPoints),   calcPct(o.firstReturnPointsWon, o.firstReturnPoints)],
          ["2nd Return Pts Won",   calcPct(v.secondReturnPointsWon, v.secondReturnPoints), calcPct(o.secondReturnPointsWon, o.secondReturnPoints)],
          ["Break Pts Converted",  calcPct(v.breakPointsWon, v.breakPoints),               calcPct(o.breakPointsWon, o.breakPoints)],
        ]} />
      </div>

      {/* ── Section 4: Point Stats ── */}
      <div className="card">
        <div className="card-title"><BarChart2 size={16} /> Point Stats</div>
        <SideBySide rows={[
          ["Winners",        fmt(v.winners),       fmt(o.winners)],
          ["Unforced Errors",fmt(v.unforcedErrors), fmt(o.unforcedErrors), v.unforcedErrors > o.unforcedErrors ? COLORS.red : null],
          ["Forced Errors",  fmt(v.forcedErrors),  fmt(o.forcedErrors)],
          ["W:UE Ratio",     fmtRatio(calc.wueRatio), fmtRatio(oppWueRatio)],
        ]} />
      </div>

      {/* ── Section 5: Rally Length ── */}
      <div className="card">
        <div className="card-title"><TrendingUp size={16} /> Rally Length</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={THL}>Rally</th>
              <th style={TH}>Total Pts</th>
              <th style={THV}>Valissa Win %</th>
            </tr>
          </thead>
          <tbody>
            {[["0–4 shots", "0-4"], ["5–8 shots", "5-8"], ["9+ shots", "9+"]].map(([label, key]) => {
              const b = rally[key] || {};
              const pct = b.valissaWinPct;
              const col = pct == null ? COLORS.muted : pct >= 50 ? COLORS.accent : pct >= 40 ? COLORS.yellow : COLORS.red;
              return (
                <tr key={key}>
                  <td style={TDL}>{label}</td>
                  <td style={TD}>{b.total ?? "—"}</td>
                  <td style={{ ...TD, color: col, fontWeight: 700 }}>{pct != null ? `${pct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Section 6: Shot Breakdown (Valissa only) ── */}
      <div className="card">
        <div className="card-title"><Target size={16} /> Shot Breakdown — {match.valissaName || "Valissa"}</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={THL}>Shot</th>
              <th style={{ ...TH, color: COLORS.accent }}>Winners</th>
              <th style={{ ...TH, color: COLORS.red }}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Forehand",  v.fhWinner,       v.fhError],
              ["Backhand",  v.bhWinner,       v.bhError],
              ["Return",    (v.fhReturnWinner ?? 0) + (v.bhReturnWinner ?? 0),
                            (v.fhReturnError  ?? 0) + (v.bhReturnError  ?? 0)],
              ["Approach",  v.approachWinner, v.approachError],
            ].map(([label, w, e]) => (
              <tr key={label}>
                <td style={TDL}>{label}</td>
                <td style={{ ...TD, color: COLORS.accent, fontWeight: 600 }}>{fmt(w)}</td>
                <td style={{ ...TD, color: COLORS.red }}>{fmt(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── AI Coach Analysis ── */}
      <div className="card" style={{ borderColor: COLORS.accentDim, background: `${COLORS.accent}08` }}>
        <div className="card-title"><MessageSquare size={16} /> AI Coach Analysis</div>

        {analysisError && (
          <div style={{ color: COLORS.red, fontSize: "0.83rem", marginBottom: 12 }}>{analysisError}</div>
        )}

        {escalations.length > 0 && (
          <div style={{ background: `${COLORS.red}18`, border: `1px solid ${COLORS.red}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.85rem", marginBottom: 6 }}>⚠ Escalated Priorities</div>
            {escalations.map((e, i) => (
              <div key={i} style={{ fontSize: "0.82rem", color: COLORS.text, marginBottom: 4 }}>
                <strong>{e.priority}</strong> — deferred {e.weeksDeferredCount} weeks
              </div>
            ))}
          </div>
        )}

        {!analysis && !analysisLoading && (
          <>
            <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>
              Generate a personalized coaching report for this match based on serve stats, return stats, rally patterns, and shot distribution.
            </p>
            <button className="btn btn-primary" onClick={handleGenerateAnalysis} style={{ gap: 8 }}>
              <Zap size={14} /> Generate Analysis
            </button>
          </>
        )}

        {analysisLoading && (
          <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.muted }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: "0.9rem" }}>Analyzing match...</div>
          </div>
        )}

        {analysis && !analysisLoading && (() => {
          const SecHeader = ({ children, color }) => (
            <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: color || COLORS.muted, marginBottom: 6 }}>
              {children}
            </div>
          );
          return (
            <div>
              {/* Match Summary */}
              <div style={{ marginBottom: 18 }}>
                <SecHeader>Match Summary</SecHeader>
                <p style={{ fontSize: "0.88rem", color: COLORS.text, lineHeight: 1.6, margin: 0 }}>{analysis.matchSummary}</p>
              </div>

              {/* Load & Wellbeing Context */}
              {analysis.loadContext && (
                <div style={{ background: `${COLORS.accent}10`, border: `1px solid ${COLORS.accentDim}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.accentDim}>Load & Wellbeing Context</SecHeader>
                  <p style={{ fontSize: "0.83rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.loadContext}</p>
                </div>
              )}

              {/* Critical Findings */}
              {analysis.criticalFindings?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Critical Findings</SecHeader>
                  {analysis.criticalFindings.map((cf, i) => {
                    const borderCol = cf.priority === "critical" ? COLORS.red : cf.priority === "important" ? COLORS.yellow : COLORS.border;
                    const bgCol     = cf.priority === "critical" ? `${COLORS.red}12` : cf.priority === "important" ? `${COLORS.yellow}12` : "transparent";
                    return (
                      <div key={i} style={{ border: `1px solid ${borderCol}`, background: bgCol, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: borderCol }}>{cf.priority}</span>
                        <p style={{ fontSize: "0.84rem", color: COLORS.text, margin: "4px 0 0" }}>{cf.finding}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Strengths */}
              {analysis.strengthsToReinforce?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Strengths to Reinforce</SecHeader>
                  {analysis.strengthsToReinforce.map((s, i) => (
                    <div key={i} style={{ fontSize: "0.84rem", color: COLORS.text, padding: "5px 0", borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}>
                      ✓ {s}
                    </div>
                  ))}
                </div>
              )}

              {/* Rally Pattern Analysis */}
              {analysis.rallyPatternAnalysis && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Rally Pattern Analysis</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.rallyPatternAnalysis}</p>
                </div>
              )}

              {/* Serve Analysis */}
              {analysis.serveAnalysis && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Serve Analysis</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.serveAnalysis}</p>
                </div>
              )}

              {/* Shot Breakdown Insights */}
              {analysis.shotBreakdownInsights && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Shot Breakdown Insights</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.shotBreakdownInsights}</p>
                </div>
              )}

              {/* Deferred Priorities */}
              {analysis.deferredPriorities?.length > 0 && (
                <div style={{ background: `${COLORS.yellow}10`, border: `1px solid ${COLORS.yellow}50`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.yellow}>Deferred Priorities</SecHeader>
                  {analysis.deferredPriorities.map((dp, i) => (
                    <div key={i} style={{ marginBottom: i < analysis.deferredPriorities.length - 1 ? 10 : 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.84rem", color: COLORS.text }}>{dp.priority}</div>
                      {dp.reason && <div style={{ fontSize: "0.78rem", color: COLORS.muted, marginTop: 2 }}>{dp.reason}</div>}
                      {dp.resolveCondition && <div style={{ fontSize: "0.78rem", color: COLORS.muted, marginTop: 2, fontStyle: "italic" }}>Resolve when: {dp.resolveCondition}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Parent Note */}
              {analysis.parentNote && (
                <div style={{ background: `${COLORS.accent}0d`, border: `1px solid ${COLORS.accentDim}60`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.accentDim}>Note for Parent</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.parentNote}</p>
                </div>
              )}

              {/* Athlete Note */}
              {analysis.athleteNote && (
                <div style={{ background: `${COLORS.border}60`, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <SecHeader>Note for {match.valissaName || "Valissa"}</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.athleteNote}</p>
                </div>
              )}

              <button className="btn btn-ghost btn-sm" onClick={handleGenerateAnalysis} style={{ gap: 6 }}>
                <Zap size={13} /> Regenerate Analysis
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Delete Match ── */}
      <div className="card" style={{ borderColor: COLORS.red, background: "rgba(255,77,109,0.06)" }}>
        {!confirmDelete ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmDelete(true)}
            style={{ color: COLORS.red, borderColor: COLORS.red }}
          >
            Delete Match
          </button>
        ) : (
          <>
            <div style={{ fontSize: "0.85rem", color: COLORS.text, marginBottom: 12 }}>
              Delete this match and re-import?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                style={{ background: COLORS.red, color: "#fff", border: "none" }}
                onClick={() => onDelete(match.id || match.matchId)}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PRIORITIES TAB ──────────────────────────────────────────────────────────
function PrioritiesTab({ athleteId }) {
  const [items,            setItems]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [escalationBanner, setEscalationBanner] = useState([]);
  const [bannerDismissed,  setBannerDismissed]  = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "athletes", athleteId, "deferredPriorities"));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Failed to load deferred priorities:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!athleteId) return;
    loadItems();
    checkEscalations(athleteId)
      .then(escalated => { if (escalated.length > 0) setEscalationBanner(escalated); })
      .catch(() => {});
  }, [athleteId]);

  const handleResolve = async (priority) => {
    try {
      await resolveDeferred(athleteId, priority);
      await loadItems();
    } catch (e) {
      console.error("Failed to resolve priority:", e);
    }
  };

  const toDate = ts => {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

  const fmtDate = ts => {
    const d = toDate(ts);
    return d ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
  };

  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const active = items
    .filter(i => i.status === "active")
    .sort((a, b) => (b.weeksDeferredCount ?? 0) - (a.weeksDeferredCount ?? 0));

  const escalated = items.filter(i => i.status === "escalated");

  const resolved = items.filter(i => {
    if (i.status !== "resolved") return false;
    const d = toDate(i.addressedDate);
    return d && d >= cutoff30;
  });

  const SectionHeader = ({ children, count }) => (
    <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.muted, marginBottom: 10 }}>
      {children} <span style={{ color: COLORS.accent }}>({count})</span>
    </div>
  );

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 32 }}>
        <div className="spinner" />
      </div>
    );
  }

  const isEmpty = active.length === 0 && escalated.length === 0 && resolved.length === 0;

  return (
    <div>
      {/* Escalation banner */}
      {!bannerDismissed && escalationBanner.length > 0 && (
        <div style={{ background: `${COLORS.red}18`, border: `1px solid ${COLORS.red}`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.88rem", marginBottom: 6 }}>
              ⚠ {escalationBanner.length} priority item{escalationBanner.length !== 1 ? "s" : ""} newly escalated
            </div>
            {escalationBanner.map((e, i) => (
              <div key={i} style={{ fontSize: "0.82rem", color: COLORS.text }}>{e.priority}</div>
            ))}
          </div>
          <button onClick={() => setBannerDismissed(true)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: "1.1rem", padding: "0 0 0 12px", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: 10 }}>✓</div>
          <div style={{ color: COLORS.muted, fontSize: "0.88rem" }}>
            No deferred priorities — all development areas are being addressed.
          </div>
        </div>
      )}

      {/* Group 1 — Active */}
      {active.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader count={active.length}>Active</SectionHeader>
          {active.map(item => (
            <div key={item.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: COLORS.text, flex: 1, marginRight: 10 }}>
                  {(item.weeksDeferredCount ?? 0) >= 3 && <span style={{ marginRight: 5 }}>⚠️</span>}
                  {item.priority}
                </div>
                <span style={{ fontSize: "0.7rem", background: `${COLORS.accent}18`, color: COLORS.accent, borderRadius: 20, padding: "3px 9px", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {item.weeksDeferredCount ?? 0} wk{(item.weeksDeferredCount ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
              {item.reason && (
                <div style={{ fontSize: "0.82rem", color: COLORS.muted, marginBottom: 5 }}>{item.reason}</div>
              )}
              {item.resolveCondition && (
                <div style={{ fontSize: "0.79rem", color: COLORS.muted, fontStyle: "italic", marginBottom: 5 }}>
                  Resolve when: {item.resolveCondition}
                </div>
              )}
              {item.targetWeek && (
                <div style={{ fontSize: "0.74rem", color: COLORS.muted, marginBottom: 10 }}>Target: {item.targetWeek}</div>
              )}
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.78rem", marginTop: item.reason || item.resolveCondition || item.targetWeek ? 4 : 0 }}
                onClick={() => handleResolve(item.priority)}
              >
                ✓ Mark as Addressed
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Group 2 — Escalated */}
      {escalated.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="card" style={{ borderColor: COLORS.red, background: `${COLORS.red}08` }}>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.88rem", marginBottom: 12 }}>
              🚨 Needs Attention — Deferred 4+ Weeks
            </div>
            {escalated.map((item, i) => (
              <div key={item.id} style={{
                paddingBottom: i < escalated.length - 1 ? 12 : 0,
                marginBottom:  i < escalated.length - 1 ? 12 : 0,
                borderBottom:  i < escalated.length - 1 ? `1px solid ${COLORS.border}` : "none",
              }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text, marginBottom: 4 }}>{item.priority}</div>
                <div style={{ fontSize: "0.76rem", color: COLORS.muted, marginBottom: 8 }}>
                  First deferred: {fmtDate(item.deferredDate)} · Escalated: {fmtDate(item.escalatedDate)}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.78rem" }}
                  onClick={() => handleResolve(item.priority)}
                >
                  ✓ Mark as Addressed
                </button>
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.red}33`, fontSize: "0.78rem", color: COLORS.red, fontStyle: "italic" }}>
              These development areas have not been trainable for 4+ consecutive weeks. Review whether the weekly schedule has capacity.
            </div>
          </div>
        </div>
      )}

      {/* Group 3 — Recently Resolved */}
      {resolved.length > 0 && (
        <div>
          <SectionHeader count={resolved.length}>Recently Resolved</SectionHeader>
          {resolved.map(item => (
            <div key={item.id} className="card" style={{ borderColor: `${COLORS.accent}40`, background: `${COLORS.accent}06`, marginBottom: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: COLORS.accent, fontSize: "1.2rem", lineHeight: 1 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text }}>{item.priority}</div>
                  <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginTop: 2 }}>Addressed {fmtDate(item.addressedDate)}</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: "0.71rem", color: COLORS.muted, marginTop: 2 }}>Resolved items auto-archive after 30 days.</div>
        </div>
      )}
    </div>
  );
}

// ─── MATCHES TAB ──────────────────────────────────────────────────────────────
// ─── SEASON REPORT VIEW ──────────────────────────────────────────────────────
function SeasonReportView({ report, onBack, onRegenerate, seasonLoading }) {
  const urgencyColor = u => u === "high" ? COLORS.red : u === "medium" ? COLORS.yellow : COLORS.muted;
  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const sorted = [...(report.consistentWeaknesses ?? [])].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3);
  });

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        <ChevronLeft size={15} /> Match History
      </button>

      {/* Header */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="flex-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: COLORS.text }}>Season Analysis</div>
            <div style={{ color: COLORS.muted, fontSize: "0.78rem", marginTop: 4 }}>
              {report.totalMatchesAnalyzed ?? report.matchCount} matches · Generated {fmtDate(report.generatedAt)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="label" style={{ marginBottom: 2 }}>Overall Record</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.7rem", color: COLORS.accent, lineHeight: 1 }}>
              {report.overallRecord}
            </div>
          </div>
        </div>
      </div>

      {/* Next Month Priority */}
      <div className="card" style={{ border: `1.5px solid ${COLORS.accent}`, marginBottom: 14 }}>
        <div className="label" style={{ color: COLORS.accent, marginBottom: 8 }}>🎯 Next Month Priority</div>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: COLORS.text, lineHeight: 1.55 }}>
          {report.nextMonthPriority}
        </div>
      </div>

      {/* Consistent Weaknesses */}
      {sorted.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Consistent Weaknesses</div>
          {sorted.map((w, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${urgencyColor(w.urgency)}` }}>
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: "0.93rem" }}>{w.metric}</div>
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
                  color: urgencyColor(w.urgency),
                  background: `${urgencyColor(w.urgency)}22`,
                  padding: "2px 8px", borderRadius: 4,
                }}>
                  {w.urgency}
                </span>
              </div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem", marginBottom: 8 }}>{w.pattern}</div>
              <div style={{ color: COLORS.accent, fontSize: "0.82rem" }}>💡 {w.trainingFocus}</div>
            </div>
          ))}
        </div>
      )}

      {/* Improvements */}
      {(report.improvements ?? []).length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Improvements</div>
          {(report.improvements ?? []).map((imp, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${COLORS.accent}` }}>
              <div style={{ fontWeight: 700, fontSize: "0.93rem", color: COLORS.accent, marginBottom: 4 }}>↑ {imp.metric}</div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem" }}>{imp.trend}</div>
            </div>
          ))}
        </div>
      )}

      {/* Inconsistencies */}
      {(report.inconsistencies ?? []).length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Inconsistencies</div>
          {(report.inconsistencies ?? []).map((inc, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${COLORS.yellow}` }}>
              <div style={{ fontWeight: 700, fontSize: "0.93rem", color: COLORS.yellow, marginBottom: 4 }}>{inc.metric}</div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem" }}>{inc.observation}</div>
            </div>
          ))}
        </div>
      )}

      {/* Developmental Stage */}
      {report.developmentalStageAssessment && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Developmental Stage</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65 }}>{report.developmentalStageAssessment}</div>
        </div>
      )}

      {/* Long Term Outlook */}
      {report.longTermOutlook && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Long Term Outlook</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65 }}>{report.longTermOutlook}</div>
        </div>
      )}

      {/* Parent Note */}
      {report.parentNote && (
        <div className="card" style={{ marginBottom: 14, background: "rgba(0,229,160,0.06)", borderColor: COLORS.accentDim }}>
          <div className="card-title" style={{ color: COLORS.accent, marginBottom: 8 }}>A Note for You</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65, fontStyle: "italic" }}>{report.parentNote}</div>
        </div>
      )}

      <button
        className="btn btn-ghost"
        onClick={onRegenerate}
        disabled={seasonLoading}
        style={{ width: "100%", marginTop: 4 }}
      >
        {seasonLoading ? "Analyzing season…" : "↺ Regenerate Season Analysis"}
      </button>
    </div>
  );
}

// ─── MATCHES TAB ─────────────────────────────────────────────────────────────
function MatchesTab({ athleteId }) {
  const fileRef = useRef(null);
  const [status,              setStatus]             = useState(null);
  const [busy,                setBusy]               = useState(false);
  const [matches,             setMatches]            = useState([]);
  const [loadingMatches,      setLoadingMatches]     = useState(true);
  const [selectedMatch,       setSelectedMatch]      = useState(null);
  const [seasonReport,        setSeasonReport]       = useState(null);
  const [seasonLoading,       setSeasonLoading]      = useState(false);
  const [viewingSeasonReport, setViewingSeasonReport] = useState(false);

  // Fetch matches + cached season report on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [matchSnap, reportSnap] = await Promise.all([
          getDocs(collection(db, "matches")),
          getDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest")),
        ]);
        if (cancelled) return;
        const all = matchSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.athleteId === athleteId)
          .sort((a, b) => {
            if (!a.matchStartTime) return 1;
            if (!b.matchStartTime) return -1;
            return b.matchStartTime.localeCompare(a.matchStartTime);
          });
        setMatches(all);
        if (reportSnap.exists()) setSeasonReport(reportSnap.data());
      } catch (err) {
        console.error("Failed to load matches:", err);
      } finally {
        if (!cancelled) setLoadingMatches(false);
      }
    })();
    return () => { cancelled = true; };
  }, [athleteId]);

  const handleGenerateSeasonAnalysis = async () => {
    setSeasonLoading(true);
    setStatus(null);
    try {
      const chronoMatches = [...matches].sort((a, b) => {
        if (!a.matchStartTime) return 1;
        if (!b.matchStartTime) return -1;
        return a.matchStartTime.localeCompare(b.matchStartTime);
      });

      const matchesWithAnalysis = [];
      for (const match of chronoMatches) {
        const snap = await getDoc(doc(db, "athletes", athleteId, "matchAnalyses", match.id));
        if (snap.exists()) matchesWithAnalysis.push({ ...match, analysis: snap.data() });
      }

      if (matchesWithAnalysis.length === 0) {
        setStatus({ ok: false, text: "No match analyses found — generate AI analysis for at least one match first." });
        setSeasonLoading(false);
        return;
      }

      const ctx = await buildAthleteContext(athleteId);

      const fmtMatchScore = m => {
        const sc = m.setScores;
        if (sc?.p1?.length) return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
        return "—";
      };

      const matchLines = matchesWithAnalysis.map((m, idx) => {
        const date = m.matchStartTime
          ? new Date(m.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
          : "Unknown date";
        const result = m.whoWonMatch === 1 ? "Win" : "Loss";
        const v = m.valissa ?? {};
        const o = m.opponent ?? {};
        const calc = m.calculated ?? {};
        const rally = calc.rallyDistribution ?? {};
        const findings = (m.analysis?.criticalFindings ?? []).map(f => `${f.area}: ${f.finding}`).join(" | ");
        return [
          `Match ${idx + 1} — ${date} vs ${m.opponentName || "Opponent"} — ${result} ${fmtMatchScore(m)}`,
          `Tournament: ${m.season || "—"}`,
          `Valissa: W=${v.winners ?? 0} UE=${v.unforcedErrors ?? 0} FE=${v.forcedErrors ?? 0} 1st serve=${v.firstServePct != null ? Number(v.firstServePct).toFixed(1) : "—"}% DF=${v.doubleFaults ?? 0}`,
          `Opponent: W=${o.winners ?? 0} UE=${o.unforcedErrors ?? 0}`,
          `Rally win rates: 0-4shots=${rally["0-4"]?.valissaWinPct ?? "—"}% 5-8shots=${rally["5-8"]?.valissaWinPct ?? "—"}% 9+shots=${rally["9+"]?.valissaWinPct ?? "—"}%`,
          `W:UE ratio: ${calc.wueRatio ?? "—"}`,
          findings ? `AI analysis critical findings: ${findings}` : null,
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const userMsg = `Athlete: Valissa, age 12, female junior tennis player
Season review across ${matchesWithAnalysis.length} matches:

${matchLines}

Current training load context:
Weekly sRPE: ${ctx.thisWeekSRPE ?? "—"} | ACWR: ${ctx.acuteChronicRatio ?? "—"} | Load level: ${ctx.loadLevel ?? "—"}`;

      const systemPrompt = `You are a junior tennis development coach conducting a season review for a 12-year-old female athlete named Valissa. Analyze the following match statistics across multiple matches in chronological order. Return ONLY a raw JSON object — no markdown fences, start with { and end with }:

{
  "totalMatchesAnalyzed": integer,
  "overallRecord": "W-L format",
  "consistentWeaknesses": [
    {
      "metric": "short label",
      "pattern": "what the data shows across matches with specific numbers",
      "urgency": "high | medium | low",
      "trainingFocus": "specific training recommendation"
    }
  ],
  "improvements": [
    {
      "metric": "short label",
      "trend": "specific improvement observed with numbers from earliest to latest match"
    }
  ],
  "inconsistencies": [
    {
      "metric": "short label",
      "observation": "good in some matches poor in others — possible cause"
    }
  ],
  "developmentalStageAssessment": "paragraph on where she is as a developing junior athlete based on all match data — contextualised for age 12",
  "nextMonthPriority": "the single most important technical or physical development focus for the next 30 days with specific reasoning from the data",
  "longTermOutlook": "2-3 sentences on trajectory and what consistent training in her weak areas could produce over 6-12 months",
  "parentNote": "one encouraging paragraph for the parent contextualising the season so far"
}`;

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: [{ role: "user", content: userMsg }], max_tokens: 4000 }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text ?? "";
      if (!raw) throw new Error("Empty response from AI");
      const cleanText = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!cleanText.endsWith("}")) throw new Error("AI response was truncated — max_tokens too low");
      const parsed = JSON.parse(cleanText);

      const report = { ...parsed, generatedAt: new Date().toISOString(), matchCount: matchesWithAnalysis.length };
      await setDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest"), report);
      setSeasonReport(report);
      setViewingSeasonReport(true);
    } catch (err) {
      console.error("Season analysis error:", err);
      setStatus({ ok: false, text: `Season analysis failed: ${err.message}` });
    } finally {
      setSeasonLoading(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setStatus(null);

    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = ev => resolve(ev.target.result);
        reader.onerror = () => reject(new Error("read error"));
        reader.readAsText(file);
      });

      let plistObj;
      try {
        plistObj = parsePlist(text);
      } catch (parseErr) {
        console.error("[matchtrack] parsePlist threw:", parseErr.message);
        const msg = parseErr.message === "binary-plist"
          ? "Binary plist format detected — the app expected XML. Check the console for details."
          : "Invalid file format — please select a .matchtrack file";
        setStatus({ ok: false, text: msg });
        setBusy(false);
        return;
      }

      let matchData;
      try {
        matchData = extractMatchData(plistObj);
      } catch (extractErr) {
        console.error("[matchtrack] extractMatchData threw:", extractErr);
        setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
        setBusy(false);
        return;
      }

      if (!matchData.matchId || matchData.matchId === "undefined") {
        console.error("[matchtrack] matchId missing — top-level plist keys:", Object.keys(plistObj));
        setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
        setBusy(false);
        return;
      }

      const existing = await getDoc(doc(db, "matches", matchData.matchId));
      if (existing.exists()) {
        setStatus({ ok: false, text: "This match has already been imported" });
        setBusy(false);
        return;
      }

      const stored = { ...matchData, athleteId, importedAt: new Date().toISOString() };
      await setDoc(doc(db, "matches", matchData.matchId), stored);

      // Optimistically prepend to list so it appears immediately
      setMatches(prev => [{ id: matchData.matchId, ...stored }, ...prev]);

      const dateStr = matchData.matchStartTime
        ? new Date(matchData.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
        : "unknown date";
      setStatus({ ok: true, text: `Match imported — Valissa vs ${matchData.opponentName || "Opponent"} on ${dateStr}` });
    } catch (err) {
      console.error("Match import error:", err);
      setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = ts => ts
    ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "Unknown date";

  const fmtScore = match => {
    const sc = match.setScores;
    if (sc?.p1?.length) return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
    return "—";
  };

  const handleDelete = async (matchId) => {
    try {
      await deleteDoc(doc(db, "matches", matchId));
      setMatches(prev => prev.filter(m => m.id !== matchId));
      setSelectedMatch(null);
    } catch (err) {
      console.error("Failed to delete match:", err);
    }
  };

  if (selectedMatch) {
    return <MatchDetail match={selectedMatch} onBack={() => setSelectedMatch(null)} onDelete={handleDelete} athleteId={athleteId} />;
  }

  if (viewingSeasonReport && seasonReport) {
    return (
      <SeasonReportView
        report={seasonReport}
        onBack={() => setViewingSeasonReport(false)}
        onRegenerate={handleGenerateSeasonAnalysis}
        seasonLoading={seasonLoading}
      />
    );
  }

  return (
    <div>
      {/* ── Import card ── */}
      <div className="card">
        <div className="card-title"><History size={18} /> Match History</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Import .matchtrack files to build Valissa's match record.
        </p>
        <input ref={fileRef} name="matchFile" type="file" accept=".matchtrack" style={{ display: "none" }} onChange={handleFile} />
        <button
          className="btn btn-primary"
          onClick={() => { setStatus(null); fileRef.current.click(); }}
          disabled={busy}
          style={{ gap: 8 }}
        >
          <FileText size={16} />
          {busy ? "Importing…" : "Import Match File"}
        </button>
        {status && (
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: status.ok ? "rgba(0,229,160,0.12)" : "rgba(255,77,109,0.12)",
            color: status.ok ? COLORS.accent : COLORS.red,
            fontSize: "0.85rem", fontWeight: 500,
          }}>
            {status.text}
          </div>
        )}
      </div>

      {/* ── Season Intelligence ── */}
      {!loadingMatches && matches.length >= 3 && (
        <div className="card" style={{ borderColor: COLORS.accentDim }}>
          <div className="card-title" style={{ marginBottom: 6 }}>
            <TrendingUp size={16} style={{ color: COLORS.accent }} /> Season Intelligence
          </div>
          {seasonReport ? (
            <div>
              <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginBottom: 12 }}>
                Last generated {new Date(seasonReport.generatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}Record: <span style={{ color: COLORS.accent, fontWeight: 600 }}>{seasonReport.overallRecord}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={() => setViewingSeasonReport(true)} style={{ gap: 6 }}>
                  <BarChart2 size={13} /> View Season Report
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleGenerateSeasonAnalysis} disabled={seasonLoading} style={{ gap: 6 }}>
                  {seasonLoading ? "Analyzing…" : "↺ Regenerate"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 12 }}>
                {matches.length} matches recorded. Generate an AI-powered season analysis to identify patterns, improvements, and development priorities.
              </p>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGenerateSeasonAnalysis}
                disabled={seasonLoading}
                style={{ gap: 6 }}
              >
                <TrendingUp size={13} />
                {seasonLoading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 13, height: 13, border: `2px solid ${COLORS.bg}`,
                      borderTopColor: "transparent", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.7s linear infinite",
                    }} />
                    Analyzing season…
                  </span>
                ) : "Generate Season Analysis"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Match list ── */}
      {loadingMatches ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: COLORS.muted, fontSize: "0.85rem" }}>
          Loading matches…
        </div>
      ) : matches.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
          <History size={34} color={COLORS.muted} style={{ opacity: 0.35, marginBottom: 10 }} />
          <div style={{ color: COLORS.muted, fontSize: "0.88rem" }}>No matches imported yet</div>
        </div>
      ) : (
        matches.map(match => {
          const won   = match.whoWonMatch === 1;
          const score = fmtScore(match);
          return (
            <div key={match.id} className="card">
              <div className="flex-between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.97rem", marginBottom: 3 }}>
                    vs {match.opponentName || "Unknown Opponent"}
                  </div>
                  <div style={{ color: COLORS.muted, fontSize: "0.78rem" }}>{fmtDate(match.matchStartTime)}</div>
                </div>
                <span className={`badge ${won ? "badge-green" : "badge-red"}`}>
                  {won ? "Win" : "Loss"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                <div>
                  <div className="label">Score</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", color: COLORS.text, lineHeight: 1.1 }}>
                    {score}
                  </div>
                </div>
                {match.season ? (
                  <div>
                    <div className="label">Tournament</div>
                    <div style={{ fontSize: "0.85rem", color: COLORS.text, paddingTop: 2 }}>{match.season}</div>
                  </div>
                ) : null}
              </div>

              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMatch(match)}>
                <BarChart2 size={13} /> View Analysis
              </button>
            </div>
          );
        })
      )}
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

  // Week-over-week trend calculations
  const { start: thisWeekStart, end: thisWeekEnd } = getWeekBounds(0);
  const { start: lastWeekStart, end: lastWeekEnd } = getWeekBounds(1);

  const thisWeekSessions = sessionHistory.filter(s => s.date >= thisWeekStart && s.date < thisWeekEnd).length;
  const lastWeekSessions = sessionHistory.filter(s => s.date >= lastWeekStart && s.date < lastWeekEnd).length;

  const thisWeekTennis = weekLogs.filter(l => l.type === "tennis" && l.date >= thisWeekStart && l.date < thisWeekEnd).reduce((a, l) => a + l.duration, 0);
  const lastWeekTennis = weekLogs.filter(l => l.type === "tennis" && l.date >= lastWeekStart && l.date < lastWeekEnd).reduce((a, l) => a + l.duration, 0);

  const thisWeekCheer  = weekLogs.filter(l => l.type === "cheer"  && l.date >= thisWeekStart && l.date < thisWeekEnd).reduce((a, l) => a + l.duration, 0);
  const lastWeekCheer  = weekLogs.filter(l => l.type === "cheer"  && l.date >= lastWeekStart && l.date < lastWeekEnd).reduce((a, l) => a + l.duration, 0);

  const thisWeekOther  = weekLogs.filter(l => l.type === "other"  && l.date >= thisWeekStart && l.date < thisWeekEnd).reduce((a, l) => a + l.duration, 0);
  const lastWeekOther  = weekLogs.filter(l => l.type === "other"  && l.date >= lastWeekStart && l.date < lastWeekEnd).reduce((a, l) => a + l.duration, 0);

  const Trend = ({ current, previous, unit = "" }) => {
    if (previous === 0 && current === 0) return null;
    const diff = current - previous;
    if (diff === 0) return <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 3 }}>→ same as last week</div>;
    const up = diff > 0;
    const label = unit === "h"
      ? `${up ? "+" : ""}${Math.round(diff / 60)}h`
      : `${up ? "+" : ""}${diff}`;
    return (
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: up ? COLORS.accent : COLORS.red, marginTop: 3 }}>
        {up ? "↑" : "↓"} {label} vs last week
      </div>
    );
  };

  return (
    <div>
      <div className="card">
        <div className="card-title"><BarChart2 size={18} /> Overview</div>
        <div className="grid2">
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.accent }}>{totalSessions}</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Strength Sessions</div>
            <Trend current={thisWeekSessions} previous={lastWeekSessions} />
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.tennis }}>{Math.round(totalTennisMin / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Tennis Logged</div>
            <Trend current={thisWeekTennis} previous={lastWeekTennis} unit="h" />
          </div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.cheer }}>{Math.round(totalCheerMin / 60)}h</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Cheer Logged</div>
            <Trend current={thisWeekCheer} previous={lastWeekCheer} unit="h" />
          </div>
          {totalOtherMin > 0 && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.yellow }}>{Math.round(totalOtherMin / 60)}h</div>
              <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Other Sports</div>
              <Trend current={thisWeekOther} previous={lastWeekOther} unit="h" />
            </div>
          )}
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.8rem", color: COLORS.yellow }}>{exIds.length}</div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem" }}>Exercises Tracked</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Activity size={18} /> Exercise Progression</div>
        {exIds.length === 0
          ? <div className="empty">Log strength sessions to see progression data</div>
          : (
            <>
              <div className="label">Select Exercise</div>
              <select name="exerciseSelect" value={selected || ""} onChange={e => setSelected(e.target.value)} style={{ marginTop: 6 }}>
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
        <div className="card-title"><History size={18} /> Session History</div>
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

// ─── TECHNICAL TAB ────────────────────────────────────────────────────────────
function TechnicalTab({ athleteId }) {
  const today6wk = () => {
    const d = new Date(); d.setDate(d.getDate() + 42);
    return d.toISOString().split("T")[0];
  };
  const todayStr = new Date().toISOString().split("T")[0];

  const [assessments,      setAssessments]      = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [showForm,         setShowForm]         = useState(false);
  const [formArea,         setFormArea]         = useState("");
  const [formDate,         setFormDate]         = useState(todayStr);
  const [formSource,       setFormSource]       = useState("Video Analysis");
  const [formText,         setFormText]         = useState("");
  const [formPriority,     setFormPriority]     = useState("Medium");
  const [formSchedule,     setFormSchedule]     = useState(false);
  const [formReviewDate,   setFormReviewDate]   = useState(today6wk());
  const [formSaving,       setFormSaving]       = useState(false);
  const [expandedHistory,  setExpandedHistory]  = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    getDocs(query(
      collection(db, "athletes", athleteId, "technicalAssessments"),
      orderBy("date", "desc")
    ))
      .then(snap => setAssessments(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [athleteId]);

  // Group assessments by strokeArea, newest-first
  const byArea = {};
  assessments.forEach(a => {
    if (!byArea[a.strokeArea]) byArea[a.strokeArea] = [];
    byArea[a.strokeArea].push(a);
  });

  const openForm = (area = "") => {
    setFormArea(area || Object.values(STROKE_AREAS).flat()[0]);
    setFormDate(todayStr);
    setFormSource("Video Analysis");
    setFormText("");
    setFormPriority("Medium");
    setFormSchedule(true);
    setFormReviewDate(today6wk());
    setShowForm(true);
    setTimeout(() => document.getElementById("tech-form-top")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleSave = async () => {
    if (!formArea || !formText.trim() || !formDate) return;
    setFormSaving(true);
    const category = Object.entries(STROKE_AREAS).find(([, areas]) => areas.includes(formArea))?.[0] ?? "";
    const entry = {
      strokeArea:    formArea,
      category,
      date:          formDate,
      source:        formSource,
      assessment:    formText.trim().slice(0, 1500),
      priority:      formPriority,
      reviewDueDate: formSchedule ? formReviewDate : null,
      status:        "active",
    };
    try {
      const ref = await addDoc(collection(db, "athletes", athleteId, "technicalAssessments"), entry);
      const newEntry = { id: ref.id, ...entry };
      setAssessments(prev => [newEntry, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setShowForm(false);
    } catch (e) {
      console.error("Failed to save assessment:", e);
    }
    setFormSaving(false);
  };

  const priorityRank = { High: 2, Medium: 1, Monitor: 0 };
  const priorityColor = { High: COLORS.red, Medium: COLORS.yellow, Monitor: COLORS.accent };

  const changeIndicator = (entries) => {
    if (entries.length < 2) return null;
    const latestRank = priorityRank[entries[0].priority] ?? 1;
    const prevRank   = priorityRank[entries[1].priority] ?? 1;
    if (latestRank < prevRank) return { label: "Improving",  color: COLORS.accent };
    if (latestRank > prevRank) return { label: "Needs Work", color: COLORS.red    };
    return                           { label: "Unchanged",   color: COLORS.muted  };
  };

  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

  // Review-due areas (reviewDueDate <= today)
  const reviewDue = Object.entries(byArea)
    .filter(([, entries]) => entries[0]?.reviewDueDate && entries[0].reviewDueDate <= todayStr)
    .map(([area, entries]) => ({ area, lastDate: entries[0].date, reviewDueDate: entries[0].reviewDueDate }));

  const allAreas = Object.values(STROKE_AREAS).flat();

  if (loading) return <div className="card" style={{ textAlign: "center", padding: 32 }}><div className="spinner" /></div>;

  return (
    <div>
      {/* Log form */}
      <div id="tech-form-top" />
      {showForm ? (
        <div className="card" style={{ marginBottom: 16, border: `1px solid ${COLORS.accentDim}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="card-title" style={{ margin: 0 }}><FileText size={16} /> Log Assessment</div>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: "1.1rem", lineHeight: 1 }}>✕</button>
          </div>

          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <div className="label">Stroke Area</div>
              <select value={formArea} onChange={e => setFormArea(e.target.value)}>
                {Object.entries(STROKE_AREAS).map(([cat, areas]) => (
                  <optgroup key={cat} label={cat}>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <div className="label">Date</div>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
          </div>

          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <div className="label">Source</div>
              <select value={formSource} onChange={e => { setFormSource(e.target.value); setFormSchedule(e.target.value === "Video Analysis"); }}>
                {["Video Analysis", "Court Coach", "Match Observation", "Self"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="label">Priority</div>
              <select value={formPriority} onChange={e => setFormPriority(e.target.value)}>
                <option>High</option>
                <option>Medium</option>
                <option>Monitor</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="label">Assessment Notes ({formText.length}/1500)</div>
            <textarea
              placeholder="Paste video analysis notes, coaching observations, or assessment summary…"
              value={formText}
              onChange={e => setFormText(e.target.value.slice(0, 1500))}
              rows={5}
              style={{ width: "100%", resize: "vertical", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 12px", color: COLORS.text, fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", lineHeight: 1.5, boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div className="label">Schedule Follow-Up Review?</div>
            <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.85rem" }}>
                <input type="radio" checked={!formSchedule} onChange={() => setFormSchedule(false)} /> No
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.85rem" }}>
                <input type="radio" checked={formSchedule} onChange={() => setFormSchedule(true)} /> Yes
              </label>
              {formSchedule && (
                <input type="date" value={formReviewDate} onChange={e => setFormReviewDate(e.target.value)}
                  style={{ marginLeft: 8 }} />
              )}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={formSaving || !formArea || !formText.trim()}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {formSaving ? "Saving…" : "Save Assessment"}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => openForm()} style={{ width: "100%", justifyContent: "center", marginBottom: 16 }}>
          + Log Assessment
        </button>
      )}

      {/* Review due reminders */}
      {reviewDue.length > 0 && (
        <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid #3b82f6", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: "0.75rem", color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            🎥 Reviews Due
          </div>
          {reviewDue.map(r => (
            <div key={r.area} style={{ fontSize: "0.82rem", color: COLORS.text, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>{r.area}</span>
              <span style={{ color: COLORS.muted }}>Last assessed {fmtDate(r.lastDate)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Not-yet-assessed reminders */}
      {(() => {
        const unassessed = allAreas.filter(a => !byArea[a]);
        if (!unassessed.length) return null;
        return (
          <div style={{ background: "rgba(90,106,126,0.08)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: "0.75rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              Not Yet Assessed ({unassessed.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unassessed.map(a => (
                <span key={a} style={{ fontSize: "0.74rem", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "2px 9px", color: COLORS.muted }}>{a}</span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Per-category sections */}
      {Object.entries(STROKE_AREAS).map(([cat, areas]) => (
        <div key={cat} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.muted, marginBottom: 10, paddingLeft: 2 }}>
            {cat}
          </div>
          {areas.map(area => {
            const entries = byArea[area] || [];
            const latest  = entries[0] || null;
            const change  = changeIndicator(entries);
            const isDue   = latest?.reviewDueDate && latest.reviewDueDate <= todayStr;
            const isExpanded = expandedHistory === area;

            return (
              <div key={area} style={{
                background: COLORS.card, border: `1px solid ${isDue ? "#3b82f6" : COLORS.border}`,
                borderRadius: 10, marginBottom: 8, overflow: "hidden",
              }}>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: latest ? 8 : 0 }}>
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text, marginBottom: 3 }}>{area}</div>
                      <div style={{ fontSize: "0.73rem", color: isDue ? "#3b82f6" : COLORS.muted }}>
                        {!latest    ? "Not yet assessed"
                          : isDue   ? `🎥 Review due — last assessed ${fmtDate(latest.date)}`
                          :           `Last assessed ${fmtDate(latest.date)}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {latest && (
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: priorityColor[latest.priority] || COLORS.muted, background: `${priorityColor[latest.priority] || COLORS.muted}18`, whiteSpace: "nowrap" }}>
                          {latest.priority}
                        </span>
                      )}
                      {change && (
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: change.color, whiteSpace: "nowrap" }}>{change.label}</span>
                      )}
                    </div>
                  </div>

                  {latest?.assessment && (
                    <div style={{ fontSize: "0.79rem", color: COLORS.muted, lineHeight: 1.5, marginBottom: 10, borderLeft: `2px solid ${priorityColor[latest.priority] || COLORS.border}`, paddingLeft: 8 }}>
                      {latest.assessment.length > 160 ? latest.assessment.slice(0, 160) + "…" : latest.assessment}
                      {latest.source && <span style={{ fontSize: "0.7rem", color: COLORS.muted, marginLeft: 8 }}>— {latest.source}</span>}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.76rem" }}
                      onClick={() => openForm(area)}
                    >
                      + Log Assessment
                    </button>
                    {entries.length >= 2 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: "0.76rem" }}
                        onClick={() => setExpandedHistory(isExpanded ? null : area)}
                      >
                        {isExpanded ? "Hide History" : `View History (${entries.length})`}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px", background: COLORS.surface }}>
                    <div style={{ fontSize: "0.7rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Full History</div>
                    {entries.map((e, i) => (
                      <div key={e.id} style={{ marginBottom: i < entries.length - 1 ? 14 : 0, paddingBottom: i < entries.length - 1 ? 14 : 0, borderBottom: i < entries.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: COLORS.text }}>{fmtDate(e.date)}</span>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: "0.68rem", color: COLORS.muted }}>{e.source}</span>
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: priorityColor[e.priority] || COLORS.muted }}>{e.priority}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: COLORS.muted, lineHeight: 1.5 }}>{e.assessment}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── BENCHMARKS TAB ───────────────────────────────────────────────────────────
const STROKE_AREAS = {
  Groundstrokes: ["Forehand Drive", "Forehand Kinetic Chain", "Backhand Drive", "Backhand Kinetic Chain", "Forehand Slice", "Backhand Slice"],
  Serve:         ["First Serve", "Second Serve", "Serve Toss & Rhythm"],
  Return:        ["Forehand Return", "Backhand Return"],
  "Net Play":    ["Forehand Volley", "Backhand Volley", "Overhead", "Approach Shot"],
  Movement:      ["Split Step Timing", "Lateral Movement & Recovery", "First-Step Explosiveness", "Deceleration & Balance"],
  Specialty:     ["Drop Shot", "Lob", "Passing Shots"],
};

const FITNESS_TESTS = [
  { name: "5m Sprint",                    unit: "s",    lowerIsBetter: true  },
  { name: "10m Sprint",                   unit: "s",    lowerIsBetter: true  },
  { name: "Spider Run",                   unit: "s",    lowerIsBetter: true  },
  { name: "Standing Broad Jump",          unit: "cm",   lowerIsBetter: false },
  { name: "Single-Leg Broad Jump (Left)", unit: "cm",   lowerIsBetter: false },
  { name: "Single-Leg Broad Jump (Right)",unit: "cm",   lowerIsBetter: false },
  { name: "Overhead Med Ball Throw",      unit: "cm",   lowerIsBetter: false },
  { name: "Push-Up Max",                  unit: "reps", lowerIsBetter: false },
  { name: "Dead Hang",                    unit: "s",    lowerIsBetter: false },
  { name: "Single-Leg Squat (Left)",      unit: "reps", lowerIsBetter: false },
  { name: "Single-Leg Squat (Right)",     unit: "reps", lowerIsBetter: false },
  { name: "Plank Hold",                   unit: "s",    lowerIsBetter: false },
];

function BenchmarksTab({ athleteId, profile }) {
  // ── Fitness tests state ────────────────────────────────────────────────────
  const [ftEntries,    setFtEntries]    = useState([]);
  const [ftLoading,    setFtLoading]    = useState(true);
  const [ftTestName,   setFtTestName]   = useState(FITNESS_TESTS[0].name);
  const [ftResult,     setFtResult]     = useState("");
  const [ftDate,       setFtDate]       = useState(new Date().toISOString().split("T")[0]);
  const [ftNotes,      setFtNotes]      = useState("");
  const [ftSaving,     setFtSaving]     = useState(false);
  const [expandedTest, setExpandedTest] = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    getDocs(query(
      collection(db, "athletes", athleteId, "benchmarks"),
      orderBy("date", "desc")
    ))
      .then(snap => setFtEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setFtLoading(false));
  }, [athleteId]);

  const handleFtSave = async () => {
    const val = parseFloat(ftResult);
    if (!val || val <= 0 || !ftTestName || !ftDate) return;
    setFtSaving(true);
    const testDef = FITNESS_TESTS.find(t => t.name === ftTestName);
    const entry = { testName: ftTestName, result: val, unit: testDef?.unit ?? "", date: ftDate, notes: ftNotes.trim() };
    try {
      const ref = await addDoc(collection(db, "athletes", athleteId, "benchmarks"), entry);
      setFtEntries(prev => [{ id: ref.id, ...entry }, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setFtResult(""); setFtNotes("");
    } catch (e) {
      console.error("Failed to save benchmark:", e);
    }
    setFtSaving(false);
  };

  // ── Maturity offset data ───────────────────────────────────────────────────
  const height        = parseFloat(profile?.height)        || null;
  const sittingHeight = parseFloat(profile?.sittingHeight) || null;
  const weight        = parseFloat(profile?.weight)        || null;
  const dob           = profile?.dob ? new Date(profile.dob) : null;
  const ageYears      = dob ? (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000) : null;

  let mirwald = null;
  if (height && sittingHeight && weight && ageYears) {
    const legLength = height - sittingHeight;
    const a = ageYears;
    const mo =
      -9.376
      + (0.0001882 * legLength * sittingHeight)
      + (0.0022    * a         * legLength)
      + (0.005841  * a         * sittingHeight)
      - (0.002658  * a         * weight)
      + (0.07693   * (weight / height) * 100);
    mirwald = Math.round(mo * 100) / 100;
  }

  const phvStage = mirwald === null ? null
    : mirwald < -1  ? "Pre-PHV"
    : mirwald <= 1  ? "Mid-PHV"
    : "Post-PHV";

  const phvColor = phvStage === "Pre-PHV"  ? COLORS.accent
    : phvStage === "Mid-PHV"  ? COLORS.yellow
    : COLORS.cheer;

  const implications = {
    "Pre-PHV":  "Foundation phase — emphasise fundamental movement skills, coordination, and technical quality. Growth plates are open; avoid heavy axial loading. Light resistance and bodyweight work are appropriate.",
    "Mid-PHV":  "Rapid growth phase — most sensitive period for injury. Reduce high-impact and plyometric volume. Monitor flexibility closely as bone growth outpaces muscle length. Prioritise injury prevention and movement quality over performance.",
    "Post-PHV": "Post-growth phase — progressive loading becomes more appropriate. Strength training gains accelerate. Can begin building structured resistance load while maintaining technical standards.",
  };

  const missing = [];
  if (!height)        missing.push("standing height");
  if (!sittingHeight) missing.push("sitting height");
  if (!weight)        missing.push("weight");
  if (!dob)           missing.push("date of birth");

  return (
    <div>
      <div className="card">
        <div className="card-title"><TrendingUp size={18} /> Maturity Assessment</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Mirwald maturity offset estimates years to/from Peak Height Velocity (PHV) — the point of fastest growth. Used to calibrate training load and injury risk.
        </p>

        {missing.length > 0 ? (
          <div className="note-box" style={{ borderColor: COLORS.yellow, background: "rgba(245,197,24,0.07)" }}>
            <span style={{ color: COLORS.yellow, fontWeight: 600 }}>Missing data: </span>
            <span style={{ color: COLORS.text }}>
              {missing.join(", ")} — enter in the Profile tab to enable this calculation.
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Maturity Offset</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: mirwald >= 0 ? COLORS.accent : COLORS.yellow, lineHeight: 1 }}>
                  {mirwald >= 0 ? "+" : ""}{mirwald}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>years from PHV</div>
              </div>

              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `2px solid ${phvColor}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>PHV Stage</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: phvColor, lineHeight: 1.1 }}>
                  {phvStage}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>
                  {phvStage === "Pre-PHV"  && "approaching peak growth"}
                  {phvStage === "Mid-PHV"  && "in peak growth window"}
                  {phvStage === "Post-PHV" && "past peak growth"}
                </div>
              </div>

              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Age</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: COLORS.text, lineHeight: 1 }}>
                  {Math.floor(ageYears)}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>years old</div>
              </div>
            </div>

            <div style={{
              borderLeft: `3px solid ${phvColor}`,
              paddingLeft: 12, marginBottom: 16,
            }}>
              <div style={{ fontSize: "0.75rem", color: phvColor, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Training Implication — {phvStage}
              </div>
              <div style={{ fontSize: "0.83rem", color: COLORS.text, lineHeight: 1.6 }}>
                {implications[phvStage]}
              </div>
            </div>

            <div style={{ background: COLORS.surface, borderRadius: 8, padding: "10px 14px", fontSize: "0.78rem", color: COLORS.muted }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Standing height</span><span style={{ color: COLORS.text }}>{height} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Sitting height</span><span style={{ color: COLORS.text }}>{sittingHeight} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Leg length (standing − sitting)</span><span style={{ color: COLORS.text }}>{Math.round((height - sittingHeight) * 10) / 10} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Weight</span><span style={{ color: COLORS.text }}>{weight} kg</span>
              </div>
            </div>

            <div className="note-box mt16">
              💡 Re-measure monthly and update Profile to track maturity progression over time.
            </div>
          </>
        )}
      </div>

      {/* ── Fitness Tests ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title"><Activity size={18} /> Fitness Tests</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Log standardised fitness tests to track physical development over time. Aim to retest every 6–8 weeks.
        </p>

        {/* Log form */}
        <div style={{ background: COLORS.surface, borderRadius: 10, padding: "14px", marginBottom: 20 }}>
          <div style={{ fontSize: "0.75rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Log New Result</div>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <div>
              <div className="label">Test</div>
              <select value={ftTestName} onChange={e => setFtTestName(e.target.value)}>
                {FITNESS_TESTS.map(t => <option key={t.name} value={t.name}>{t.name} ({t.unit})</option>)}
              </select>
            </div>
            <div>
              <div className="label">Result ({FITNESS_TESTS.find(t => t.name === ftTestName)?.unit})</div>
              <input
                type="number" placeholder="e.g. 1.85" step="0.01" min="0"
                value={ftResult} onChange={e => setFtResult(e.target.value)}
              />
            </div>
          </div>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <div>
              <div className="label">Date</div>
              <input type="date" value={ftDate} onChange={e => setFtDate(e.target.value)} />
            </div>
            <div>
              <div className="label">Notes (optional)</div>
              <input placeholder="e.g. slightly fatigued" value={ftNotes} onChange={e => setFtNotes(e.target.value)} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleFtSave}
            disabled={ftSaving || !parseFloat(ftResult) || !ftDate}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {ftSaving ? "Saving…" : "Save Result"}
          </button>
        </div>

        {ftLoading ? (
          <div style={{ textAlign: "center", padding: 20 }}><div className="spinner" /></div>
        ) : (() => {
          const cutoff56 = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          // Group entries by test name, sorted newest-first per test
          const byTest = {};
          ftEntries.forEach(e => {
            if (!byTest[e.testName]) byTest[e.testName] = [];
            byTest[e.testName].push(e);
          });

          // Overdue / never tested reminders
          const reminders = FITNESS_TESTS.filter(t => {
            const entries = byTest[t.name];
            if (!entries?.length) return true;
            return entries[0].date < cutoff56;
          });

          const fmtDate = d => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

          return (
            <>
              {reminders.length > 0 && (
                <div style={{ background: "rgba(245,197,24,0.07)", border: `1px solid ${COLORS.yellow}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: "0.75rem", color: COLORS.yellow, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Overdue / Not Yet Recorded
                  </div>
                  {reminders.map(t => {
                    const last = byTest[t.name]?.[0];
                    return (
                      <div key={t.name} style={{ fontSize: "0.8rem", color: COLORS.text, marginBottom: 4 }}>
                        {last
                          ? <><span style={{ color: COLORS.yellow }}>Overdue:</span> {t.name} — last tested {fmtDate(last.date)}</>
                          : <><span style={{ color: COLORS.muted }}>Not yet recorded:</span> {t.name}</>
                        }
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Per-test result cards */}
              {FITNESS_TESTS.map(testDef => {
                const entries = byTest[testDef.name] || [];
                if (!entries.length) return null;
                const latest = entries[0];
                const prev   = entries[1] || null;
                const delta  = prev ? Math.round((latest.result - prev.result) * 100) / 100 : null;
                const improved = delta === null ? null
                  : testDef.lowerIsBetter ? delta < 0 : delta > 0;
                const isExpanded = expandedTest === testDef.name;

                return (
                  <div key={testDef.name} style={{
                    background: COLORS.surface, borderRadius: 10,
                    border: `1px solid ${COLORS.border}`, marginBottom: 10, overflow: "hidden",
                  }}>
                    <div
                      style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                      onClick={() => setExpandedTest(isExpanded ? null : testDef.name)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{testDef.name}</div>
                        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", color: COLORS.accent, lineHeight: 1 }}>
                            {latest.result}<span style={{ fontSize: "0.7rem", fontFamily: "'DM Sans', sans-serif", color: COLORS.muted, marginLeft: 2 }}>{testDef.unit}</span>
                          </span>
                          {prev && (
                            <span style={{ fontSize: "0.78rem", color: COLORS.muted }}>
                              prev: {prev.result} {testDef.unit}
                            </span>
                          )}
                          {delta !== null && (
                            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: improved ? COLORS.accent : COLORS.red }}>
                              {improved ? "↑" : "↓"} {Math.abs(delta)} {testDef.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ color: COLORS.muted, fontSize: "0.75rem", marginLeft: 8 }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "10px 14px" }}>
                        <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>History</div>
                        {entries.map((e, i) => (
                          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < entries.length - 1 ? 6 : 0, marginBottom: i < entries.length - 1 ? 6 : 0, borderBottom: i < entries.length - 1 ? `1px solid ${COLORS.border}` : "none", fontSize: "0.8rem" }}>
                            <span style={{ color: COLORS.muted }}>{fmtDate(e.date)}</span>
                            <span style={{ fontWeight: 600, color: COLORS.text }}>{e.result} {testDef.unit}</span>
                            {e.notes && <span style={{ color: COLORS.muted, fontStyle: "italic", fontSize: "0.74rem", maxWidth: 120, textAlign: "right" }}>{e.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {ftEntries.length === 0 && (
                <div className="empty">No fitness tests logged yet. Use the form above to record the first result.</div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab({ profile, saveProfile }) {
  const [form, setForm] = useState(() => profile || {
    name: "", dob: "", gaps: [],
    tennisSchedule: "", cheerSchedule: "", coachNotes: "",
    weight: "", height: "", sittingHeight: "", measurements: [],
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
      const w  = parseFloat(form.weight);
      const h  = parseFloat(form.height);
      const sh = parseFloat(form.sittingHeight);
      if (w > 0 || h > 0 || sh > 0) {
        const entry = { date: new Date().toISOString().split("T")[0] };
        if (w  > 0) entry.weight        = w;
        if (h  > 0) entry.height        = h;
        if (sh > 0) entry.sittingHeight = sh;
        const prev = (form.measurements || []).filter(m => m.date !== entry.date);
        updatedForm = {
          ...updatedForm,
          weight:        w  > 0 ? w  : (updatedForm.weight        || null),
          height:        h  > 0 ? h  : (updatedForm.height        || null),
          sittingHeight: sh > 0 ? sh : (updatedForm.sittingHeight || null),
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
        <div className="card-title"><User size={18} /> Athlete Profile</div>
        <div className="grid2">
          <div>
            <div className="label">Athlete Name</div>
            <input name="profileName" placeholder="e.g. Sofia" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <div className="label">Date of Birth</div>
            <input name="dob" type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Calendar size={18} /> Weekly Schedule</div>
        <div className="grid2">
          <div>
            <div className="label">Tennis Schedule</div>
            <input name="tennisSchedule" placeholder="e.g. Mon, Wed, Fri — 2hrs each" value={form.tennisSchedule} onChange={e => setForm(f => ({ ...f, tennisSchedule: e.target.value }))} />
          </div>
          <div>
            <div className="label">Cheerleading Schedule</div>
            <input name="cheerSchedule" placeholder="e.g. Tue, Thu — 1.5hrs each" value={form.cheerSchedule} onChange={e => setForm(f => ({ ...f, cheerSchedule: e.target.value }))} />
          </div>
        </div>
        <div className="note-box mt16">
          💡 These are for reference. The app uses actual logged sessions for load calculations.
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Ruler size={18} /> Physical Measurements</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>Log monthly. The AI uses this to adjust loading recommendations as she grows.</p>
        <div className="grid3">
          <div>
            <div className="label">Height (cm)</div>
            <input
              name="profileHeight"
              type="number" placeholder="e.g. 155" min="100" max="220" step="0.5"
              value={form.height || ""}
              onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
            />
          </div>
          <div>
            <div className="label">Sitting Height (cm)</div>
            <input
              name="profileSittingHeight"
              type="number" placeholder="e.g. 82" min="50" max="130" step="0.5"
              value={form.sittingHeight || ""}
              onChange={e => setForm(f => ({ ...f, sittingHeight: e.target.value }))}
            />
            <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginTop: 5, lineHeight: 1.4 }}>
              Sit on a flat surface against a wall, measure from surface to top of head.
            </div>
          </div>
          <div>
            <div className="label">Weight (kg)</div>
            <input
              name="profileWeight"
              type="number" placeholder="e.g. 42" min="20" max="120" step="0.1"
              value={form.weight || ""}
              onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
            />
          </div>
        </div>
        {(form.measurements || []).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Measurement History</div>
            {(form.measurements || []).slice(0, 6).map((m, i) => (
              <div key={i} className="stat-row" style={{ fontSize: "0.82rem" }}>
                <span style={{ color: COLORS.muted }}>{m.date}</span>
                <span style={{ display: "flex", gap: 12 }}>
                  {m.height        ? <span style={{ color: COLORS.text }}>{m.height} cm</span>         : null}
                  {m.sittingHeight ? <span style={{ color: COLORS.muted }}>sit {m.sittingHeight} cm</span> : null}
                  {m.weight        ? <span style={{ color: COLORS.text }}>{m.weight} kg</span>          : null}
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
        <div className="card-title"><Target size={18} /> Tennis Gaps to Develop</div>
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
        <div className="card-title"><FileText size={18} /> Coach / Parent Notes</div>
        <textarea
          name="coachNotes"
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
    getDoc(doc(db, "athletes", athleteId, "plans", "current"))
      .then(snap => { if (snap.exists()) setPlan(snap.data()); })
      .catch(e => console.error("Load plan error:", e))
      .finally(() => setPlanLoading(false));
  }, [athleteId]);

  const NAV = [
    { id: "log",       Icon: ClipboardList, label: "Log Session" },
    { id: "wellbeing", Icon: Heart,         label: "Wellbeing"   },
    { id: "growth",    Icon: Sprout,        label: "My Growth"   },
    { id: "plan",      Icon: Target,        label: "My Plan"     },
    { id: "notes",     Icon: MessageSquare, label: "Match Notes" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      <style>{css}</style>

      <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(1.2rem, 4vw, 1.5rem)", color: COLORS.accent, lineHeight: 1, letterSpacing: "0.06em" }}>Performance Tracker</h1>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { label: user?.displayName?.split(" ")[0] || "Athlete", color: COLORS.accent, bg: COLORS.accentMuted },
            { label: "Age 12", color: COLORS.muted, bg: COLORS.surface },
            { label: "Tennis", color: COLORS.tennis, bg: "rgba(200,245,100,0.1)" },
            { label: "Cheer", color: COLORS.cheer, bg: "rgba(245,100,200,0.1)" },
            { label: "Athlete View", color: COLORS.yellow, bg: "rgba(245,197,24,0.12)" },
          ].map(chip => (
            <span key={chip.label} style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 7px", borderRadius: 20, color: chip.color, background: chip.bg, whiteSpace: "nowrap" }}>{chip.label}</span>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px 110px", maxWidth: 480, margin: "0 auto" }}>
        {section === "log"       && <AVLogSession  athleteId={athleteId} />}
        {section === "wellbeing" && <AVWellbeing   athleteId={athleteId} />}
        {section === "growth"    && <AVGrowth      athleteId={athleteId} />}
        {section === "plan"      && <AVPlan plan={currentPlan} loading={planLoading} />}
        {section === "notes"     && <AVMatchNotes  athleteId={athleteId} />}
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
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.65rem", fontWeight: 600,
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 5, transition: "color 0.15s",
            }}
          >
            <s.Icon size={22} strokeWidth={1.75} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── AV: LOG SESSION ──────────────────────────────────────────────────────────
// ─── AV: MATCH NOTES ─────────────────────────────────────────────────────────
function AVMatchNotes({ athleteId }) {
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, "athletes", athleteId, "matchAnalyses"),
          orderBy("generatedAt", "desc")
        ));
        const analyses = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => a.athleteNote);

        // Fetch parent match documents for date + opponent
        const enriched = await Promise.all(analyses.map(async a => {
          try {
            const matchSnap = await getDoc(doc(db, "matches", a.matchId || a.id));
            const m = matchSnap.exists() ? matchSnap.data() : {};
            return {
              id:           a.id,
              athleteNote:  a.athleteNote,
              generatedAt:  a.generatedAt,
              opponentName: m.opponentName || null,
              matchDate:    m.matchStartTime || null,
              won:          m.whoWonMatch === 1,
            };
          } catch (_) {
            return {
              id:          a.id,
              athleteNote: a.athleteNote,
              generatedAt: a.generatedAt,
              won:         null,
            };
          }
        }));

        setNotes(enriched);
      } catch (e) {
        console.error("Load match notes error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [athleteId]);

  const fmtDate = ts => {
    if (!ts) return null;
    return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
  };

  if (loading) return <div style={{ textAlign: "center", paddingTop: 60 }}><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 4 }}>Match Notes</div>
      <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginBottom: 24 }}>Personal notes from your coach after each match.</div>

      {notes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "2.8rem", marginBottom: 14 }}>🎾</div>
          <div style={{ fontSize: "0.95rem", color: COLORS.muted, lineHeight: 1.7 }}>
            No match notes yet —<br />your coach will add notes after your next match.
          </div>
        </div>
      ) : (
        notes.map(note => (
          <div key={note.id} style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: "20px 18px",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: "0.82rem", color: COLORS.muted, fontWeight: 500 }}>
                {note.opponentName
                  ? <>vs <span style={{ color: COLORS.text, fontWeight: 700 }}>{note.opponentName}</span>{note.matchDate ? ` — ${fmtDate(note.matchDate)}` : ""}</>
                  : note.matchDate ? fmtDate(note.matchDate) : "Match"
                }
              </div>
              {note.won !== null && (
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                  color:       note.won ? "#000"        : COLORS.red,
                  background:  note.won ? COLORS.accent : `${COLORS.red}20`,
                  border:      note.won ? "none"        : `1px solid ${COLORS.red}40`,
                }}>
                  {note.won ? "Win" : "Loss"}
                </span>
              )}
            </div>
            <div style={{ fontSize: "1.05rem", color: COLORS.text, lineHeight: 1.65, fontWeight: 500 }}>
              "{note.athleteNote}"
            </div>
          </div>
        ))
      )}
    </div>
  );
}

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

  // Motivation overlay
  const [showMotivation,    setShowMotivation]    = useState(false);
  const [motivationLoading, setMotivationLoading] = useState(false);
  const [motivationMsg,     setMotivationMsg]     = useState(null);
  const [savedEntry,        setSavedEntry]        = useState(null);

  // Delete confirmation
  const [confirmDeleteLog, setConfirmDeleteLog] = useState(null);

  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    getDocs(query(
      collection(db, "athletes", athleteId, "weekLogs"),
      orderBy("date", "desc"), limit(30)
    ))
      .then(snap => {
        const logs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(l => l.date >= cutoffStr)
          .sort((a, b) => `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`));
        setRecentLogs(logs);
      })
      .catch(() => {});
  }, [athleteId]);

  const handleDeleteLog = async (logId) => {
    try {
      await deleteDoc(doc(db, "athletes", athleteId, "weekLogs", logId));
      setRecentLogs(prev => prev.filter(l => l.id !== logId));
    } catch (e) {
      console.error("Delete log error:", e);
    }
    setConfirmDeleteLog(null);
  };

  const TENNIS_FOCUS = ["Baseline rallying", "Serve practice", "Footwork / movement", "Match play", "Volley / net", "Conditioning", "Full practice"];
  const CHEER_FOCUS  = ["Stunt practice", "Tumbling", "Dance / routine", "Competition prep", "Conditioning", "Full practice"];
  const OTHER_FOCUS  = ["Practice / Training", "Competition", "Conditioning", "Full session"];

  const handleSave = async () => {
    if (!duration || !rpe || saving) return;
    setSaving(true);
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const dayOfWeek = new Date(date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long" });
    const entry = {
      type, duration: parseInt(duration),
      intensity: Math.ceil(rpe / 2), rpe,
      focus, date, time: now.toTimeString().slice(0, 5),
    };
    if (type === "other" && sportName.trim()) entry.sportName = sportName.trim();

    // Save to Firestore immediately
    const ref = await addDoc(collection(db, "athletes", athleteId, "weekLogs"), entry);
    setRecentLogs(prev => {
      const updated = [{ id: ref.id, ...entry }, ...prev];
      updated.sort((a, b) =>
        `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`)
      );
      return updated.slice(0, 5);
    });

    // Show overlay immediately with loading state, reset form
    setSavedEntry({ ...entry, timeOfDay, dayOfWeek });
    setMotivationMsg(null);
    setMotivationLoading(true);
    setShowMotivation(true);
    setDuration(""); setRpe(null); setFocus(""); setSportName("");
    setSaving(false);

    // Fetch motivational message in background
    const activityLabel = type === "tennis" ? "Tennis" : type === "cheer" ? "Cheerleading" : entry.sportName || "Other Sport";
    const userMsg = `Valissa just logged a ${activityLabel} session:\n- Duration: ${entry.duration} minutes\n- Intensity: ${entry.intensity}/5\n- Focus: ${entry.focus || "general training"}\n- Time of day: ${timeOfDay}\n- Day of week: ${dayOfWeek}\n\nWrite a motivational confirmation message specifically referencing what she just did. Make it feel personal and real.`;
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: "You are an encouraging sports coach writing a short motivational message to a 12-year-old female tennis and cheerleading athlete named Valissa. Keep it genuine, specific, and energetic — not generic. Never use the same phrasing twice. Write like a coach who actually watched her train, not a robot. Maximum 2 sentences.",
        messages: [{ role: "user", content: userMsg }],
        max_tokens: 120,
      }),
    })
      .then(r => r.json())
      .then(data => {
        const msg = data?.content?.[0]?.text || data?.choices?.[0]?.message?.content || null;
        setMotivationMsg(msg || "Great work today — every session counts! Keep showing up. 💪");
      })
      .catch(() => setMotivationMsg("Great work today — every session counts! Keep showing up. 💪"))
      .finally(() => setMotivationLoading(false));
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

  const overlayEmoji = savedEntry?.type === "tennis" ? "🎾" : savedEntry?.type === "cheer" ? "📣" : "🏃";

  return (
    <div>
      {/* Full-screen motivational overlay */}
      {showMotivation && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: COLORS.accent,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "40px 28px", textAlign: "center",
        }}>
          <div style={{ fontSize: "4.5rem", marginBottom: 28, lineHeight: 1 }}>{overlayEmoji}</div>
          {motivationLoading ? (
            <>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#003d28", marginBottom: 20 }}>
                Getting your message…
              </div>
              <div className="spinner" style={{
                width: 28, height: 28,
                border: "3px solid rgba(0,0,0,0.15)",
                borderTopColor: "#003d28",
              }} />
            </>
          ) : (
            <>
              <div style={{
                fontSize: "1.35rem", fontWeight: 700, color: "#002a1c",
                lineHeight: 1.55, marginBottom: 40, maxWidth: 340,
              }}>
                "{motivationMsg}"
              </div>
              <button
                onClick={() => setShowMotivation(false)}
                style={{
                  background: "#002a1c", color: COLORS.accent,
                  border: "none", borderRadius: 14, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                  fontSize: "1rem", padding: "16px 48px",
                }}
              >
                Done ✓
              </button>
            </>
          )}
        </div>
      )}

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
            name="sportName"
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
          name="duration"
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
        <select name="focus" value={focus} onChange={e => setFocus(e.target.value)} style={{ fontSize: "1rem", padding: "13px 14px" }}>
          <option value="">Select focus…</option>
          {(type === "tennis" ? TENNIS_FOCUS : type === "cheer" ? CHEER_FOCUS : OTHER_FOCUS).map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div className="av-big-label">Date</div>
        <input name="date" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: "1rem", padding: "13px 14px" }} />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving || !duration || !rpe}
        style={{ width: "100%", justifyContent: "center", padding: "18px", fontSize: "1rem" }}
      >
        {saving ? "Saving…" : "Save Session"}
      </button>

      {recentLogs.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Last 7 Days</div>
          {recentLogs.map(log => {
            const typeColor = log.type === "tennis" ? COLORS.tennis : log.type === "cheer" ? COLORS.cheer : COLORS.yellow;
            const typeLabel = log.type === "tennis" ? "🎾 Tennis" : log.type === "cheer" ? "📣 Cheer" : `🏃 ${log.sportName || "Other"}`;
            const rpeVal = log.rpe ?? (log.intensity ? log.intensity * 2 : "?");
            const isConfirming = confirmDeleteLog === log.id;
            return (
              <div key={log.id} style={{
                background: COLORS.card, border: `1px solid ${isConfirming ? COLORS.red : COLORS.border}`,
                borderRadius: 12, padding: "12px 14px", marginBottom: 8,
              }}>
                {isConfirming ? (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "0.88rem", color: COLORS.text, marginBottom: 12 }}>Delete this session?</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteLog(null)}>Cancel</button>
                      <button className="btn btn-sm" onClick={() => handleDeleteLog(log.id)}
                        style={{ background: COLORS.red, color: "#fff", border: "none" }}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem", color: typeColor }}>{typeLabel}</span>
                      {log.focus && <span style={{ color: COLORS.muted, fontSize: "0.8rem", marginLeft: 8 }}>{log.focus}</span>}
                      <div style={{ color: COLORS.muted, fontSize: "0.72rem", marginTop: 3 }}>{log.date} · {log.duration} min</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", color: COLORS.accent }}>RPE {rpeVal}</div>
                      <button onClick={() => setConfirmDeleteLog(log.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4, lineHeight: 1 }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AV: GROWTH TAB ──────────────────────────────────────────────────────────
function AVGrowth({ athleteId }) {
  const [measurements, setMeasurements] = useState([]);
  const [weight, setWeight]             = useState("");
  const [height, setHeight]             = useState("");
  const [sittingHeight, setSittingHeight] = useState("");
  const [saving, setSaving]             = useState(false);
  const [celebration, setCelebration]   = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    getDoc(doc(db, "athletes", athleteId))
      .then(snap => {
        if (snap.exists()) setMeasurements(snap.data().measurements || []);
      })
      .catch(e => console.error("Load measurements error:", e))
      .finally(() => setLoading(false));
  }, [athleteId]);

  const getCelebration = (current, prev) => {
    if (!prev) return {
      emoji: "📏", color: COLORS.accent,
      title: "First measurement logged!",
      msg: "This is Day 1 of tracking your athletic growth. Your AI coach will use this to build smarter plans just for you. Let's go! 🚀",
    };
    const hDiff = (current.height && prev.height) ? +(current.height - prev.height).toFixed(1) : 0;
    const wDiff = (current.weight && prev.weight) ? +(current.weight - prev.weight).toFixed(1) : 0;
    const parts = [];
    if (hDiff > 0) parts.push(`You grew ${hDiff}cm taller! 🌱 Every centimetre gives you a longer lever — more reach, more power on that serve.`);
    if (wDiff > 0) parts.push(`Up ${wDiff}kg! 💪 That's not just weight — that's muscle and strength loading up for the court and the mat.`);
    if (parts.length > 0) return {
      emoji: "🎉", color: COLORS.yellow,
      title: "You're growing, athlete!",
      msg: parts.join(" "),
    };
    if (hDiff < 0 || wDiff < 0) return {
      emoji: "📊", color: COLORS.accent,
      title: "Logged!",
      msg: "Every data point makes your AI coach smarter. Keep showing up — growth happens in waves.",
    };
    return {
      emoji: "🔒", color: COLORS.accentDim,
      title: "Rock solid!",
      msg: "No change this time — your body is locked in, building strength and speed under the surface. Stay consistent!",
    };
  };

  const handleSave = async () => {
    const w  = parseFloat(weight);
    const h  = parseFloat(height);
    const sh = parseFloat(sittingHeight);
    if ((!w || w <= 0) && (!h || h <= 0) && (!sh || sh <= 0)) return;
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];
    const entry = { date: today };
    if (w  > 0) entry.weight        = w;
    if (h  > 0) entry.height        = h;
    if (sh > 0) entry.sittingHeight = sh;
    const prev = measurements.filter(m => m.date !== today);
    const updated = [entry, ...prev].slice(0, 12);
    await setDoc(doc(db, "athletes", athleteId), {
      measurements: updated,
      weight:        w  > 0 ? w  : (measurements[0]?.weight        || null),
      height:        h  > 0 ? h  : (measurements[0]?.height        || null),
      sittingHeight: sh > 0 ? sh : (measurements[0]?.sittingHeight || null),
    }, { merge: true });
    const prevEntry = measurements.find(m => m.date !== today) || null;
    setCelebration(getCelebration(entry, prevEntry));
    setMeasurements(updated);
    setWeight(""); setHeight(""); setSittingHeight("");
    setSaving(false);
  };

  const latest = measurements[0] || null;

  const StatBubble = ({ label, value, unit, color }) => (
    <div style={{
      flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: 16, padding: "20px 12px", textAlign: "center",
    }}>
      <div style={{ fontSize: "0.72rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      {value
        ? <>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "3rem", color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginTop: 2 }}>{unit}</div>
          </>
        : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", color: COLORS.muted, lineHeight: 1 }}>—</div>
      }
    </div>
  );

  if (loading) return <div className="empty" style={{ paddingTop: 60 }}><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 4 }}>My Growth</div>
      <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginBottom: 20 }}>Track your height, sitting height, and weight. Every measurement helps your AI coach plan smarter for you.</div>

      {/* Current stats hero */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <StatBubble label="Height" value={latest?.height} unit="cm" color={COLORS.tennis} />
        <StatBubble label="Sitting Ht" value={latest?.sittingHeight} unit="cm" color={COLORS.yellow} />
        <StatBubble label="Weight" value={latest?.weight} unit="kg" color={COLORS.accent} />
      </div>
      {latest && (
        <div style={{ textAlign: "center", color: COLORS.muted, fontSize: "0.72rem", marginTop: -18, marginBottom: 20 }}>
          Last logged {latest.date}
        </div>
      )}

      {/* Celebration card */}
      {celebration && (
        <div style={{
          background: `${celebration.color}18`,
          border: `2px solid ${celebration.color}`,
          borderRadius: 16, padding: "18px 20px", marginBottom: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: "2.4rem", marginBottom: 8 }}>{celebration.emoji}</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: celebration.color, marginBottom: 8 }}>{celebration.title}</div>
          <div style={{ fontSize: "0.88rem", color: COLORS.text, lineHeight: 1.6 }}>{celebration.msg}</div>
        </div>
      )}

      {/* Log new measurement */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "20px 16px", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", color: COLORS.accent, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Ruler size={16} /> Log New Measurement</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="av-big-label">Height (cm)</div>
              <input
                name="height"
                type="number" placeholder="e.g. 155" min="100" max="220" step="0.5"
                value={height} onChange={e => setHeight(e.target.value)}
                style={{ fontSize: "1.1rem", padding: "13px 14px" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="av-big-label">Weight (kg)</div>
              <input
                name="weight"
                type="number" placeholder="e.g. 42" min="20" max="120" step="0.1"
                value={weight} onChange={e => setWeight(e.target.value)}
                style={{ fontSize: "1.1rem", padding: "13px 14px" }}
              />
            </div>
          </div>
          <div>
            <div className="av-big-label">Sitting Height (cm)</div>
            <input
              name="sittingHeight"
              type="number" placeholder="e.g. 82" min="50" max="130" step="0.5"
              value={sittingHeight} onChange={e => setSittingHeight(e.target.value)}
              style={{ fontSize: "1.1rem", padding: "13px 14px" }}
            />
            <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginTop: 6, lineHeight: 1.4 }}>
              Sit straight against a wall — measure from seat to top of head.
            </div>
          </div>
        </div>
        <div className="av-hint" style={{ marginBottom: 14 }}>Log what you have — height, sitting height, weight, or all three.</div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || (!parseFloat(weight) && !parseFloat(height) && !parseFloat(sittingHeight))}
          style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "1rem" }}
        >
          {saving ? "Saving…" : "Save Measurement 🌱"}
        </button>
      </div>

      {/* Growth history */}
      {measurements.length > 0 && (
        <div>
          <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Growth History</div>
          {measurements.slice(0, 6).map((m, i) => {
            const prev = measurements[i + 1];
            const hDiff = (m.height && prev?.height) ? +(m.height - prev.height).toFixed(1) : null;
            const wDiff = (m.weight && prev?.weight) ? +(m.weight - prev.weight).toFixed(1) : null;
            return (
              <div key={i} style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 10,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginBottom: 4 }}>{m.date}</div>
                  <div style={{ display: "flex", gap: 14 }}>
                    {m.height        && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.tennis }}>{m.height}<span style={{ fontSize: "0.7rem", color: COLORS.muted, fontFamily: "'DM Sans', sans-serif" }}> cm</span></span>}
                    {m.sittingHeight && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.yellow }}>{m.sittingHeight}<span style={{ fontSize: "0.7rem", color: COLORS.muted, fontFamily: "'DM Sans', sans-serif" }}> sit</span></span>}
                    {m.weight        && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.accent }}>{m.weight}<span style={{ fontSize: "0.7rem", color: COLORS.muted, fontFamily: "'DM Sans', sans-serif" }}> kg</span></span>}
                  </div>
                </div>
                {(hDiff !== null || wDiff !== null) && (
                  <div style={{ textAlign: "right" }}>
                    {hDiff !== null && <div style={{ fontSize: "0.78rem", color: hDiff > 0 ? COLORS.tennis : COLORS.muted, fontWeight: 600 }}>{hDiff > 0 ? `+${hDiff}` : hDiff} cm</div>}
                    {wDiff !== null && <div style={{ fontSize: "0.78rem", color: wDiff > 0 ? COLORS.accent : COLORS.muted, fontWeight: 600 }}>{wDiff > 0 ? `+${wDiff}` : wDiff} kg</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {measurements.length === 0 && !celebration && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: COLORS.muted }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🌱</div>
          <div style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>No measurements yet.<br />Log your first one above and start tracking your athletic journey!</div>
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
  const [confirmDeleteWell, setConfirmDeleteWell] = useState(null);

  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    getDocs(query(
      collection(db, "athletes", athleteId, "wellbeing"),
      orderBy("date", "desc"), limit(30)
    ))
      .then(snap => setHistory(
        snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.date >= cutoffStr)
      ))
      .catch(e => console.error("Load wellbeing history error:", e))
      .finally(() => setHistLoading(false));
  }, [athleteId]);

  const handleDeleteWell = async (entryId) => {
    try {
      await deleteDoc(doc(db, "athletes", athleteId, "wellbeing", entryId));
      setHistory(prev => prev.filter(e => e.id !== entryId));
    } catch (e) {
      console.error("Delete wellbeing error:", e);
    }
    setConfirmDeleteWell(null);
  };

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
      <div style={{ fontSize: "0.72rem", color: COLORS.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Sun size={13} /> Morning Check-in</div>

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
      <div style={{ fontSize: "0.72rem", color: COLORS.accentDim, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Moon size={13} /> Tonight's Check-in</div>

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
          name="wellbeingNotes"
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
      <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Last 7 Days</div>
      {histLoading
        ? <div className="empty"><div className="spinner" /></div>
        : history.length === 0
          ? <div style={{ color: COLORS.muted, fontSize: "0.85rem", textAlign: "center", padding: "16px 0" }}>No check-ins logged yet</div>
          : history.map(entry => {
              const isConfirming = confirmDeleteWell === entry.id;
              return (
                <div key={entry.id} style={{
                  background: COLORS.card, border: `1px solid ${isConfirming ? COLORS.red : COLORS.border}`,
                  borderRadius: 10, padding: "12px 14px", marginBottom: 8,
                }}>
                  {isConfirming ? (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.88rem", color: COLORS.text, marginBottom: 12 }}>Delete this check-in?</div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteWell(null)}>Cancel</button>
                        <button className="btn btn-sm" onClick={() => handleDeleteWell(entry.id)}
                          style={{ background: COLORS.red, color: "#fff", border: "none" }}>Delete</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.text }}>{entry.date}</span>
                          <span style={{ fontSize: "0.7rem", color: COLORS.muted, background: COLORS.surface, padding: "2px 8px", borderRadius: 8 }}>
                            {entry.type === "night" ? "🌙 Tonight" : entry.type === "morning" ? "☀️ Morning" : "Check-in"}
                          </span>
                        </div>
                        <button onClick={() => setConfirmDeleteWell(entry.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4, lineHeight: 1 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: "0.78rem", color: COLORS.muted, flexWrap: "wrap" }}>
                        {entry.sleep    && <span>🌙 {entry.sleep}h sleep</span>}
                        {entry.energy   && <span>⚡ Energy {entry.energy}/5 ({energyLabel[entry.energy]})</span>}
                        {entry.mood     && <span>😊 Mood {entry.mood}/5 ({moodLabel[entry.mood]})</span>}
                        {entry.soreness && <span>💪 Soreness {entry.soreness}/5 ({sorenessLabel[entry.soreness]})</span>}
                        {entry.notes    && <span style={{ color: COLORS.text, fontStyle: "italic", width: "100%", marginTop: 2 }}>"{entry.notes}"</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })
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
