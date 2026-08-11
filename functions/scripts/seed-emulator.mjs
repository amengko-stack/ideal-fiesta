#!/usr/bin/env node
// Seeds the Firestore EMULATOR with one representative athlete so the weekly
// review orchestrator can be exercised end to end. See test-orchestrator.md.
//
//   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-emulator.mjs
//
// Refuses to run without FIRESTORE_EMULATOR_HOST — this writes fabricated data
// and must never touch production.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

import admin from 'firebase-admin';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set.');
  console.error('Start the emulator first, e.g. FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-emulator.mjs');
  process.exit(1);
}

// The real athlete document id the app uses (ALLOWED_USERS in src/App.jsx maps
// all three family UIDs onto it). Using it keeps the emulator data shaped like
// production; override with SEED_ATHLETE_ID if you want a throwaway id.
const ATHLETE_ID = process.env.SEED_ATHLETE_ID || 'kDybMQH9lefwHI0dRway';
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'athlete-os-15c3b';

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const athleteRef = db.collection('athletes').doc(ATHLETE_ID);

// ── local-date helpers (never toISOString — this app is UTC+7) ───────────────
const toLocalDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const dateAgo = (n) => toLocalDateStr(daysAgo(n));
const isoAgo = (n) => daysAgo(n).toISOString();

const Timestamp = admin.firestore.Timestamp;

async function wipe(collectionRef) {
  const snap = await collectionRef.get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function main() {
  console.log(`Seeding athlete ${ATHLETE_ID} in project ${PROJECT_ID} …`);

  // ── profile ────────────────────────────────────────────────────────────────
  await athleteRef.set({
    name: 'Valissa',
    dob: '2013-04-18',                 // ~12 at seed time
    height: 152,
    sittingHeight: 78,
    weight: 41,
    competitionCategory: 'U14',
    gaps: ['explosive_power', 'lateral_movement'],
    coachNotes: 'Occasional right shoulder tightness after long serving sessions.',
    measurements: [
      { date: dateAgo(14), height: 152, sittingHeight: 78, weight: 41 },
      { date: dateAgo(75), height: 150, sittingHeight: 77, weight: 40 },
    ],
    remindersEnabled: false,
    weeklyReviewEnabled: true,         // the orchestrator's opt-in flag
  });

  // ── weekLogs: 4 weeks, mixed tennis / strength / match ─────────────────────
  await wipe(athleteRef.collection('weekLogs'));
  const logPattern = [
    { offset: 0,  type: 'tennis',   duration: 90,  rpe: 7, focus: 'Baseline rallying' },
    { offset: 1,  type: 'strength', duration: 45,  rpe: 6, focus: 'Full session' },
    { offset: 3,  type: 'tennis',   duration: 120, rpe: 8, focus: 'Match play' },
    { offset: 5,  type: 'match',    duration: 75,  rpe: 9, focus: 'Competition' },
    { offset: 6,  type: 'tennis',   duration: 60,  rpe: 5, focus: 'Serve practice' },
  ];
  const logs = [];
  for (let week = 0; week < 4; week++) {
    for (const p of logPattern) {
      const offset = week * 7 + p.offset;
      logs.push({
        date: dateAgo(offset),
        time: '16:00',
        type: p.type,
        duration: p.duration,
        // Taper the oldest weeks slightly so ACWR is not exactly 1.00.
        rpe: Math.max(3, p.rpe - week),
        focus: p.focus,
      });
    }
  }
  await Promise.all(logs.map((l) => athleteRef.collection('weekLogs').add(l)));

  // ── wellbeing: 8 check-ins over the last 8 days ────────────────────────────
  await wipe(athleteRef.collection('wellbeing'));
  const wellbeing = [
    { sleep: 8.0, mood: 4, soreness: 2, energy: 4 },
    { sleep: 7.5, mood: 4, soreness: 3, energy: 3 },
    { sleep: 6.5, mood: 3, soreness: 3, energy: 3, notes: 'Legs heavy after match' },
    { sleep: 7.0, mood: 3, soreness: 2, energy: 4 },
    { sleep: 8.5, mood: 5, soreness: 1, energy: 5 },
    { sleep: 6.0, mood: 3, soreness: 4, energy: 2, notes: 'Right shoulder tight' },
    { sleep: 7.5, mood: 4, soreness: 2, energy: 4 },
    { sleep: 8.0, mood: 4, soreness: 2, energy: 4 },
  ];
  await Promise.all(
    wellbeing.map((w, i) =>
      athleteRef.collection('wellbeing').add({
        ...w, date: dateAgo(i), time: '20:30', type: 'checkin',
      })
    )
  );

  // ── strength sessions (plan prompt history) ────────────────────────────────
  await wipe(athleteRef.collection('sessions'));
  await Promise.all([1, 8, 15].map((offset, i) =>
    athleteRef.collection('sessions').add({
      date: dateAgo(offset),
      difficulty: 3,
      exercises: [
        { name: 'Goblet Squat', sets: 3, reps: 10, weight: `${6 + i} kg`, difficulty: 3, completed: true },
        { name: 'Single-Leg Romanian Deadlift', sets: 3, reps: 8, difficulty: 4, completed: true },
        { name: 'Lateral Bound', sets: 3, reps: 6, difficulty: 3, completed: i !== 0 },
        { name: 'Dead Bug', sets: 2, reps: 12, difficulty: 2, completed: true },
      ],
    })
  ));

  // ── matches (top-level collection) ─────────────────────────────────────────
  // The two most recent matches satisfy the metric target below:
  // secondServePointsWonPct >= 45 needs (priorityMetrics.js) a sample of at
  // least 6 second-serve points and a reading >= 45. Both matches read 52.9%
  // and 50.0% off 17 / 16 second serves, so streakMet (REQUIRED_STREAK = 2)
  // returns met: true. Both were played AFTER the priority's deferredDate.
  const oldMatches = await db.collection('matches').where('athleteId', '==', ATHLETE_ID).get();
  await Promise.all(oldMatches.docs.map((d) => d.ref.delete()));

  const match = (id, offsetDays, won, second) => ({
    id,
    data: {
      athleteId: ATHLETE_ID,
      opponentName: won ? 'Amara S.' : 'Priya K.',
      matchStartTime: isoAgo(offsetDays),
      ageCategory: 'U14',
      whoWonMatch: won ? 1 : 2,
      valissa: {
        firstServePoints: 34,
        firstServePointsWon: 21,
        firstServePct: 0.62,
        secondServePoints: second.points,
        secondServePointsWon: second.won,
        doubleFaults: 3,
        aces: 1,
        winners: 12,
        unforcedErrors: 18,
        forcedErrors: 6,
        fhError: 8,
        bhError: 10,
        firstReturnPoints: 30,
        secondReturnPoints: 14,
        fhReturnError: 4,
        bhReturnError: 5,
      },
      calculated: {
        firstServePointsWonPct: 61.8,
        secondServePointsWonPct: second.pct,
        wueRatio: 0.67,
        rallyDistribution: {
          '0-4': { total: 40, valissaWinPct: 47.5 },
          '5-8': { total: 22, valissaWinPct: 54.5 },
          '9+':  { total: 9,  valissaWinPct: 44.4 },
        },
      },
    },
  });

  const matches = [
    match('seed-match-recent', 3,  true,  { points: 17, won: 9, pct: 52.9 }),
    match('seed-match-prior',  10, false, { points: 16, won: 8, pct: 50.0 }),
    // Older, weaker match — BEFORE the priority was raised, so it must not count.
    match('seed-match-old',    45, false, { points: 15, won: 4, pct: 26.7 }),
  ];
  await Promise.all(matches.map((m) => db.collection('matches').doc(m.id).set(m.data)));

  // ── deferred priorities ────────────────────────────────────────────────────
  await wipe(athleteRef.collection('deferredPriorities'));

  // (a) open, with a metric target the two recent matches have MET → the
  //     hygiene step's planMetricResolutions must resolve this one.
  await athleteRef.collection('deferredPriorities').doc('seed-metric-met').set({
    priority: 'Second serve points won consistency',
    key: 'second_serve',
    reason: 'Second serve was attacked repeatedly in the last tournament.',
    resolveCondition: 'Second serve points won above 45% in two consecutive matches',
    metricTarget: { metric: 'secondServePointsWonPct', comparator: '>=', value: 45 },
    deferredDate: Timestamp.fromDate(daysAgo(21)),  // BEFORE both recent matches
    weeksDeferredCount: 2,
    lastCountedWeek: dateAgo(21),
    status: 'active',
    addressedDate: null,
    escalatedDate: null,
  });

  // (b) open, stale — weeksDeferredCount is at planEscalations' threshold (>= 4,
  //     deferredPrioritiesCore.js), so the hygiene step must escalate it.
  await athleteRef.collection('deferredPriorities').doc('seed-stale').set({
    priority: 'Rally tolerance in long baseline exchanges',
    key: 'rally_tolerance',
    reason: 'Errors climb sharply after the eighth shot.',
    resolveCondition: 'Wins 50%+ of 9+ shot rallies across two matches',
    metricTarget: null,
    deferredDate: Timestamp.fromDate(daysAgo(35)),
    weeksDeferredCount: 4,
    lastCountedWeek: dateAgo(14),
    status: 'active',
    addressedDate: null,
    escalatedDate: null,
  });

  // (c) a third open item with no target and a low count — stays open, so the
  //     digest's "open priorities" count is not zero after hygiene.
  await athleteRef.collection('deferredPriorities').doc('seed-open').set({
    priority: 'Forehand depth under pressure',
    key: 'forehand_consistency',
    reason: 'Short balls invited attack in the last two matches.',
    resolveCondition: 'Depth holds through a full practice set',
    metricTarget: null,
    deferredDate: Timestamp.fromDate(daysAgo(7)),
    weeksDeferredCount: 1,
    lastCountedWeek: dateAgo(7),
    status: 'active',
    addressedDate: null,
    escalatedDate: null,
  });

  // ── memory/current ─────────────────────────────────────────────────────────
  await athleteRef.collection('memory').doc('current').set({
    updatedAt: isoAgo(7),
    version: 1,
    narrative: 'Aggressive baseliner with a heavy forehand who is still learning to construct points. Competes well and rarely gives up on a ball, but leans on the forehand when tired.',
    trajectory: 'Serve speed and first-serve percentage have improved over the last two months; second serve remains the point of attack.',
    persistentPatterns: [
      { pattern: 'Second serve sits up under pressure', firstSeen: dateAgo(70), lastSeen: dateAgo(10), status: 'improving', evidence: 'Opponents step in on the second serve in tight games.' },
      { pattern: 'Backhand errors climb in long rallies', firstSeen: dateAgo(50), lastSeen: dateAgo(3), status: 'active', evidence: '10 backhand errors in the most recent match.' },
    ],
    whatWorked: [
      { intervention: 'Weekly single-leg stability block', evidence: 'Fewer late-set movement errors.', date: dateAgo(28) },
    ],
    whatDidNotWork: [],
    milestones: [{ date: dateAgo(21), text: 'First win in the U14 division.' }],
    standingConstraints: ['Right shoulder tightens after high-volume serving — cap overhead work.'],
    divisionHistory: [{ from: null, to: 'U14', date: dateAgo(120) }],
    shoutouts: [],
  });

  // ── technical assessment ───────────────────────────────────────────────────
  await wipe(athleteRef.collection('technicalAssessments'));
  await athleteRef.collection('technicalAssessments').add({
    date: dateAgo(9),
    strokeArea: 'Serve',
    category: 'Kinetic chain',
    source: 'video review',
    priority: 'High',
    assessment: 'Leg drive disconnects from trunk rotation on the second serve — the toss drifts behind her and she arms the ball.',
  });

  // ── plans/current must be ABSENT so the run generates one ──────────────────
  await athleteRef.collection('plans').doc('current').delete();

  // ── a clean claim slate for this week ──────────────────────────────────────
  await wipe(athleteRef.collection('orchestratorRuns'));
  await wipe(athleteRef.collection('digests'));

  console.log('Seed complete:');
  console.log(`  athletes/${ATHLETE_ID}                    profile, weeklyReviewEnabled: true`);
  console.log(`  weekLogs                                  ${logs.length} docs (4 weeks)`);
  console.log('  wellbeing                                 8 check-ins');
  console.log('  sessions                                  3 strength sessions');
  console.log('  matches                                   3 (2 recent ones meet the metric target)');
  console.log('  deferredPriorities                        seed-metric-met (resolves), seed-stale (escalates), seed-open');
  console.log('  memory/current, technicalAssessments      seeded');
  console.log('  plans/current, digests, orchestratorRuns  cleared');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
