// Fixture inputs for the Sunday-plan prompt golden test.
//
// The golden file (sundayPlanPrompt.golden.txt / .system.txt) was captured from
// planGen.js's inline prompt construction BEFORE it was extracted into
// planGenCore.js, with the system clock frozen at FIXTURE_NOW. The test asserts
// buildSundayPlanPrompt reproduces those bytes exactly, which is what proves the
// extraction changed nothing.
//
// Pure data only — no Firestore, no network.

export const FIXTURE_NOW = "2026-03-15T09:00:00.000Z"; // a Sunday

export const fixtureProfile = {
  name: "Valissa",
  dob: "2013-05-04",
  competitionCategory: "U14",
  gaps: ["first_serve", "movement_footwork"],
  height: 154,
  weight: 41,
  sittingHeight: 80,
  coachNotes: "  Right ankle a bit sore after Thursday.  ",
  measurements: [
    { date: "2026-03-01", height: 154, weight: 41, sittingHeight: 80 },
    { date: "2026-02-01", height: 153, weight: 40.5 },
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
    date: "2026-03-08",
    exercises: [
      { name: "Goblet Squat", sets: 3, reps: 10, weight: "8kg", difficulty: 3, completed: true },
      { name: "Single-Leg Balance", sets: 2, reps: 30, difficulty: 2, completed: true },
    ],
  },
  {
    date: "2026-03-01",
    exercises: [
      { name: "Med Ball Rotational Throw", sets: 3, reps: 8, difficulty: 4, completed: false },
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
};
