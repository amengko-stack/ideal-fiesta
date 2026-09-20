// Fixture inputs for the weekly S&C plan prompt golden test.
//
// The golden files (weeklyPlanPrompt.golden.txt / weeklyPlanSystem.golden.txt /
// weeklyPlanPrompt.tournament.golden.txt) are the byte-exact output of
// buildWeeklyStrengthPlanPrompt for these inputs with the clock frozen at
// FIXTURE_NOW. They exist so an unintended wording change — a reinstated
// growth-plate blanket rule, a puberty-stage claim, a resurrected "danger zone"
// — fails CI instead of quietly reaching the athlete.
//
// Regenerate deliberately (never to make a red test green without reading the
// diff first):
//   node scripts/regen-plan-goldens.mjs
//
// Pure data only — no Firestore, no network.

export const FIXTURE_NOW = "2026-03-15T09:00:00.000Z"; // a Sunday

// Height history is the point of this fixture: 148.5 cm → 153 cm across 183
// days annualises to ~9 cm/year, which is what puts the athlete on growth
// watch. A sitting height is present so the test can also prove the Mirwald
// estimate no longer reaches the S&C prompt.
export const fixtureProfile = {
  name: "Marsha",
  dob: "2014-03-07",
  competitionCategory: "U14",
  gaps: ["first_step", "movement_footwork"],
  height: 153,
  weight: 43,
  sittingHeight: 80,
  coachNotes: "  Right ankle a bit sore after Thursday.  ",
  measurements: [
    { date: "2026-03-14", height: 153, weight: 43, sittingHeight: 80 },
    { date: "2025-09-12", height: 148.5, weight: 37.5 },
  ],
};

export const fixtureWeekLogs = [
  { id: "l1", date: "2026-03-09", time: "16:00", type: "tennis", duration: 90, rpe: 7, focus: "serve" },
  { id: "l2", date: "2026-03-11", time: "16:00", type: "tennis", duration: 75, intensity: 4 },
  { id: "l3", date: "2026-03-13", time: "07:30", type: "other", duration: 45, rpe: 5, sportName: "Swimming" },
  { id: "l4", date: "2026-03-05", time: "16:00", type: "tennis", duration: 90, rpe: 8 },
  { id: "l5", date: "2026-02-25", time: "16:00", type: "tennis", duration: 60, rpe: 6 },
  { id: "l6", date: "2026-02-18", time: "16:00", type: "tennis", duration: 60, rpe: 6 },
];

export const fixtureSessionHistory = [
  {
    date: "2026-03-09",
    plannedSessionId: "A",
    exercises: [
      { name: "Goblet Squat", sets: 2, reps: 8, weight: "8kg", difficulty: 3, completed: true },
      { name: "Snap-Down", sets: 2, reps: 5, difficulty: 2, completed: true },
    ],
  },
  {
    date: "2026-03-05",
    plannedSessionId: "B",
    exercises: [
      { name: "Single Leg RDL", sets: 2, reps: 6, difficulty: 3, completed: true },
    ],
  },
];

export const fixtureWellbeing = [
  { date: "2026-03-14", type: "night", sleep: 7.5, energy: 3, mood: 4, soreness: 2, notes: "legs a bit heavy" },
  { date: "2026-03-13", type: "morning", sleep: 6.5, mood: 3, soreness: 3 },
  { date: "2026-03-12", type: "night", energy: 4, mood: 4 },
];

export const fixtureCtx = {
  generatedAt: FIXTURE_NOW,
  athleteUid: "athlete-1",
  memoryText: "ATHLETE DEVELOPMENT MEMORY:\nWho she is: A counter-puncher learning to attack short balls.",
  injuryText: "OPEN INJURIES:\n- Ankle (Right): severity 2/5, open 6 days",
  injuries: {
    open: [{ id: "i1", bodyArea: "Ankle", side: "Right", severity: 2, status: "open", onsetDate: "2026-03-09" }],
    flag: { tone: "info", headline: "Ankle — keep an eye on it", guidance: "Monitor the niggle and avoid movements that aggravate it." },
    recurring: [],
  },
  standingSeasonPriority: {
    nextMonthPriority: "Convert short balls instead of resetting the rally.",
    longTermOutlook: "Aggressive baseliner with a reliable second serve.",
  },
  recentMatch: {
    id: "m1",
    opponentName: "Kirana",
    matchStartTime: "2026-03-07T02:00:00.000Z",
    whoWonMatch: 1,
  },
  matchAnalysis: {
    criticalFindings: [
      { finding: "Second serve sat up under pressure at 4-4.", priority: "critical" },
      { finding: "Late split-step on wide returns.", priority: "important" },
    ],
    deferredPriorities: [
      { priority: "Second serve under pressure", resolveCondition: "2nd serve pts won >= 45% in two matches" },
    ],
  },
  deferredPriorities: [
    {
      priority: "Second serve under pressure",
      key: "second_serve",
      reason: "Needs on-court reps first",
      deferredDate: "2026-02-15T00:00:00.000Z",
      resolveCondition: "2nd serve pts won >= 45% in two matches",
      metricTarget: { metric: "secondServePointsWonPct", comparator: ">=", value: 45 },
      weeksDeferredCount: 3,
    },
    {
      priority: "Movement recovery after wide balls",
      key: "movement_footwork",
      reason: "Load was already high",
      deferredDate: "2026-03-01T00:00:00.000Z",
      resolveCondition: null,
      metricTarget: null,
      weeksDeferredCount: 1,
    },
  ],
  technicalAssessments: [
    {
      strokeArea: "Second serve",
      category: "Technical",
      date: "2026-03-02",
      source: "coach video review",
      assessment: "Toss drifts behind the head, forcing an arm-only swing.",
      priority: "High",
    },
  ],
};

export const fixtureArgs = {
  profile: fixtureProfile,
  weekLogs: fixtureWeekLogs,
  sessionHistory: fixtureSessionHistory,
  wellbeing: fixtureWellbeing,
  tournament: "none",
  sessionTime: "09:00",
  // Pinned so the golden files do not depend on how far into the eight-week
  // block the real athlete happens to be.
  blockState: { blockWeek: 3, blockNumber: 1 },
};
