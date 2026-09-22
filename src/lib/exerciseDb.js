// ─── EXERCISE DATABASE ─────────────────────────────────────────────────────────
export const EXERCISE_DB = [
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
  // ── WEEKLY S&C BLOCK ADDITIONS ──────────────────────────────────────────────
  // Everything below was added for the Session A / Session B block. `aliases`
  // exists so a plan that names an exercise slightly differently ("DB RDL",
  // "Dumbbell Romanian Deadlift") still resolves to one database entry instead
  // of silently becoming a new, unvetted movement.
  // WARM-UP / MOVEMENT PREP
  { id: "easy_skip",          name: "Easy Skipping",              cat: "Warmup",      movement: "Linear",            tennis: ["footwork","first_step"],                  ageFlag: "green",  progressionChain: ["easy_skip"], defaultSets: 1, defaultReps: 60, aliases: ["easy skip", "easy skipping / jog", "skipping"] },
  { id: "ankle_rock",         name: "Ankle Rock",                 cat: "Mobility",    movement: "Bilateral Lower",   tennis: ["first_step","footwork","stability"],      ageFlag: "green",  progressionChain: ["ankle_rock"], defaultSets: 1, defaultReps: 8, aliases: ["ankle rocks", "ankle mobility"] },
  { id: "squat_to_stand",     name: "Squat-to-Stand",             cat: "Mobility",    movement: "Bilateral Lower",   tennis: ["deceleration","stability"],               ageFlag: "green",  progressionChain: ["squat_to_stand"], defaultSets: 1, defaultReps: 6, aliases: ["squat to stand"] },
  { id: "walking_lunge_rot",  name: "Walking Lunge + Rotation",   cat: "Mobility",    movement: "Multi-Directional", tennis: ["rotational_power","lateral_agility"],     ageFlag: "green",  progressionChain: ["walking_lunge_rot"], defaultSets: 1, defaultReps: 5, aliases: ["walking lunge with rotation", "walking lunge + rotation"] },
  { id: "a_march",            name: "A-March",                    cat: "Warmup",      movement: "Linear",            tennis: ["linear_speed","footwork"],                ageFlag: "green",  progressionChain: ["a_march","a_skip"], defaultSets: 2, defaultReps: 10 },
  { id: "a_skip",             name: "A-Skip",                     cat: "Warmup",      movement: "Linear",            tennis: ["linear_speed","footwork","first_step"],   ageFlag: "green",  progressionChain: ["a_march","a_skip"], defaultSets: 2, defaultReps: 10, aliases: ["a-march/a-skip"] },
  { id: "lateral_shuffle",    name: "Lateral Shuffle",            cat: "Warmup",      movement: "Lateral",           tennis: ["lateral_agility","footwork"],             ageFlag: "green",  progressionChain: ["lateral_shuffle"], defaultSets: 2, defaultReps: 10 },
  { id: "lateral_squat",      name: "Lateral Squat",              cat: "Mobility",    movement: "Lateral",           tennis: ["lateral_agility","lateral_power"],        ageFlag: "green",  progressionChain: ["lateral_squat","side_lunge"], defaultSets: 1, defaultReps: 5 },
  // LANDING
  { id: "snap_down",          name: "Snap-Down",                  cat: "Landing",     movement: "Vertical",          tennis: ["deceleration","stability"],               ageFlag: "green",  progressionChain: ["snap_down","jump_and_stick"], defaultSets: 2, defaultReps: 5, aliases: ["snap down", "snapdown"] },
  { id: "jump_and_stick",     name: "Jump & Stick",               cat: "Landing",     movement: "Vertical",          tennis: ["deceleration","stability","first_step"],  ageFlag: "green",  progressionChain: ["snap_down","jump_and_stick"], defaultSets: 2, defaultReps: 4, contactsPerRep: 1, aliases: ["jump and stick", "jump + stick", "jump-and-stick"] },
  { id: "lateral_bound_stick",name: "Lateral Bound & Stick",      cat: "Landing",     movement: "Lateral",           tennis: ["lateral_power","deceleration","stability"],ageFlag: "green", progressionChain: ["lateral_bound_stick"], defaultSets: 2, defaultReps: 4, contactsPerRep: 1, aliases: ["lateral bound and stick", "lateral bound + stick", "lateral bound"] },
  // SPEED / DECELERATION
  { id: "accel_5m",           name: "5 m Acceleration",           cat: "Speed",       movement: "Linear",            tennis: ["first_step","linear_speed"],              ageFlag: "green",  progressionChain: ["accel_5m"], defaultSets: 4, defaultReps: 1, aliases: ["5m acceleration", "5 m accel", "acceleration 5m", "5-10 m acceleration"] },
  { id: "decel_stop",         name: "Controlled Deceleration Stop", cat: "Speed",     movement: "Linear",            tennis: ["deceleration","stability"],               ageFlag: "green",  progressionChain: ["decel_stop","cod_cue_stop"], defaultSets: 4, defaultReps: 1, aliases: ["5 m acceleration to controlled stop", "deceleration stop", "controlled stop"] },
  { id: "cod_cue_stop",       name: "Cued Change of Direction",   cat: "Speed",       movement: "Multi-Directional", tennis: ["lateral_agility","deceleration","footwork"],ageFlag: "yellow",progressionChain: ["decel_stop","cod_cue_stop"], defaultSets: 3, defaultReps: 1, aliases: ["accelerate to cued change of direction", "cued cod"] },
  // ROTATIONAL POWER
  { id: "mb_side_scoop",      name: "Medicine Ball Side Scoop Throw", cat: "Power",   movement: "Rotational",        tennis: ["rotational_power","serve_power"],         ageFlag: "green",  progressionChain: ["mb_side_scoop"], defaultSets: 2, defaultReps: 4, aliases: ["side scoop throw", "medicine ball side scoop", "med ball side scoop toss"] },
  // STRENGTH
  { id: "db_rdl",             name: "Dumbbell Romanian Deadlift", cat: "Strength",    movement: "Bilateral Lower",   tennis: ["hamstring","rotational_power","deceleration"],ageFlag: "green",progressionChain: ["hip_hinge","db_rdl"], defaultSets: 2, defaultReps: 8, aliases: ["db rdl", "dumbbell rdl", "romanian deadlift"] },
  { id: "split_squat",        name: "Split Squat",                cat: "Strength",    movement: "Single-Leg",        tennis: ["deceleration","lateral_power","stability"],ageFlag: "green", progressionChain: ["split_squat","bulgarian_split"], defaultSets: 2, defaultReps: 6 },
  { id: "db_row",             name: "Dumbbell Row",               cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "green",  progressionChain: ["db_row"], defaultSets: 2, defaultReps: 10, aliases: ["row", "bent-over row", "dumbbell bent-over row"] },
  { id: "sa_row",             name: "Single-Arm Row",             cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","core_stability"],    ageFlag: "green",  progressionChain: ["db_row","sa_row"], defaultSets: 2, defaultReps: 8, aliases: ["single arm row", "one-arm row", "single-arm dumbbell row"] },
  { id: "incline_pushup",     name: "Incline Push Up",            cat: "Strength",    movement: "Upper Push",        tennis: ["serve_power","stability"],                ageFlag: "green",  progressionChain: ["incline_pushup","floor_pushup"], defaultSets: 2, defaultReps: 8, aliases: ["incline push-up", "incline push up"] },
  { id: "hip_thrust",         name: "Hip Thrust",                 cat: "Strength",    movement: "Bilateral Lower",   tennis: ["rotational_power","first_step","stability"],ageFlag: "green",progressionChain: ["bridge","hip_thrust"], defaultSets: 2, defaultReps: 10, aliases: ["hip bridge / hip thrust", "barbell-free hip thrust"] },
  { id: "tibialis_raise",     name: "Tibialis Raise",             cat: "Strength",    movement: "Bilateral Lower",   tennis: ["deceleration","footwork","first_step"],   ageFlag: "green",  progressionChain: ["tibialis_raise"], defaultSets: 2, defaultReps: 12, aliases: ["tib raise", "anterior tibialis raise"] },
  // SHOULDER / SCAPULAR
  { id: "band_external_rot",  name: "Band External Rotation",     cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "green",  progressionChain: ["band_external_rot"], defaultSets: 2, defaultReps: 12, aliases: ["band external rotation", "external rotation"] },
  { id: "serratus_wall_slide",name: "Serratus Wall Slide",        cat: "Mobility",    movement: "Upper Push",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "green",  progressionChain: ["serratus_wall_slide"], defaultSets: 2, defaultReps: 8, aliases: ["wall slide", "serratus slide"] },
  { id: "y_raise",            name: "Lower-Trapezius Y Raise",    cat: "Strength",    movement: "Upper Pull",        tennis: ["shoulder_stability","serve_power"],       ageFlag: "green",  progressionChain: ["y_raise"], defaultSets: 2, defaultReps: 8, aliases: ["y raise", "lower trap raise", "lower-trapezius / y raise"] },
  // RECOVERY
  { id: "foam_rolling",       name: "Foam Rolling",               cat: "Recovery",    movement: "Recovery",          tennis: ["recovery"],                              ageFlag: "green",  progressionChain: ["foam_rolling"], defaultSets: 1, defaultReps: 1 },
  { id: "static_stretch",     name: "Static Stretching",          cat: "Recovery",    movement: "Recovery",          tennis: ["recovery","hamstring"],                  ageFlag: "green",  progressionChain: ["static_stretch"], defaultSets: 1, defaultReps: 1 },
];

// ─── APPROVED-EXERCISE GATE ────────────────────────────────────────────────────
// The weekly S&C generator picks from this database and nothing else. Anything
// the model names that does not resolve here is replaced by the deterministic
// template entry rather than prescribed — an invented movement has had no
// safety review, no regression path and no progression history.

// Suppressed for the current eight-week block only (they stay in the database
// so historical sessions still resolve, and so a later block can re-enable them
// by changing this list rather than re-adding entries):
//   • depth jumps and box jumping — high ground-reaction landings this block is
//     not yet building towards;
//   • continuous hop/pogo circuits — plyometrics run to fatigue, which is the
//     opposite of the 20–30 quality-contact budget;
//   • near-maximal eccentric and ballistic lifting (Nordic curl, KB swing,
//     slam ball) — the block is explicitly submaximal and technique-led;
//   • running conditioning — the acceleration work here is speed, not fitness.
export const BLOCK_SUPPRESSED_EXERCISE_IDS = [
  "depth_jump", "box_jump", "box_jump_sl", "broad_jump_sl",
  "pogo_jumps", "lateral_hops", "skater_jump", "ski_jump",
  "nordic_curl", "kb_swing", "slam_ball",
  "shuttle_run", "parachute_run",
];

// Canonical slug for an exercise name — the same transform toWeeklyPlanData
// uses to build plan ids, so the two can never disagree about identity.
export function exerciseSlug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const BY_KEY = (() => {
  const map = new Map();
  for (const ex of EXERCISE_DB) {
    map.set(ex.id, ex);
    map.set(exerciseSlug(ex.name), ex);
    for (const alias of ex.aliases || []) map.set(exerciseSlug(alias), ex);
  }
  return map;
})();

// findExercise(nameOrId) → the database entry, or null. Matches on id, on the
// slugged name, and on any declared alias.
export function findExercise(nameOrId) {
  if (!nameOrId) return null;
  const raw = String(nameOrId).trim();
  return BY_KEY.get(raw) || BY_KEY.get(exerciseSlug(raw)) || null;
}

// isApprovedExercise(nameOrId, {allowSuppressed}) → boolean. Suppressed entries
// are NOT approved for the current block unless a caller explicitly opts in
// (history rendering does; plan generation never does).
export function isApprovedExercise(nameOrId, { allowSuppressed = false } = {}) {
  const found = findExercise(nameOrId);
  if (!found) return false;
  return allowSuppressed || !BLOCK_SUPPRESSED_EXERCISE_IDS.includes(found.id);
}

// The names the prompt is allowed to choose from, in database order.
export function approvedExerciseNames({ allowSuppressed = false } = {}) {
  return EXERCISE_DB
    .filter(e => allowSuppressed || !BLOCK_SUPPRESSED_EXERCISE_IDS.includes(e.id))
    .map(e => e.name);
}

export const TENNIS_GAPS = [
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
