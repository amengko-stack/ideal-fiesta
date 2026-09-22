#!/usr/bin/env node
// Weekly-review qualification harness — runs the REAL orchestrator offline.
//
// functions/test-orchestrator.md covers the emulator path, which needs a live
// Anthropic key and running emulators. This script needs neither: it runs
// runWeeklyReviewForAthlete against an in-memory Firestore double and a stubbed
// Anthropic client, so the acceptance properties can be checked anywhere —
// including an environment with no Firebase credentials at all.
//
// It qualifies: schema v2, the block week being read from the persistent
// programState/strength document, Session A on Monday, Session B on Thursday,
// Sunday as recovery, no Mirwald-derived Guardian escalation, historical
// sessions left untouched, a repeated Run-now neither advancing the block nor
// duplicating records, and the next calendar week advancing by exactly one.
//
// It does NOT replace a production Run-now: it cannot prove the deployed
// function runs, that Firestore accepts the write, or that the app renders it.
//
// Usage:  cd functions && npm install && node scripts/qualify-weekly-review.mjs
// Exit code 0 = every check passed.

process.env.TZ = 'Asia/Jakarta';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Anthropic stub ───────────────────────────────────────────────────────────
// Registered before weeklyReview.js is imported so its `callAnthropicJSON`
// binding resolves to this. The plan reply is a minimal, valid adjustment set.
const anthropicCalls = [];

// ── in-memory Firestore double ───────────────────────────────────────────────
// Only the surface the orchestrator actually uses: doc/collection refs, get,
// set(+merge), add, where/orderBy/limit, and runTransaction.
const admin = (await import('firebase-admin')).default;

// weeklyReview.js reads admin.firestore.FieldValue at module scope but never
// calls admin.firestore() — `db` is injected — so the REAL sentinels are used
// and the double resolves them the way the server would.
const FieldValue = admin.firestore.FieldValue;
const isSentinel = (v) => v instanceof FieldValue;
const sentinelKind = (v) => (v.isEqual(FieldValue.delete()) ? 'delete' : 'serverTimestamp');

const store = new Map(); // "path/to/doc" -> data object
const writeLog = [];

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const materialise = (data, prev = {}) => {
  const out = Array.isArray(data) ? [] : { ...prev };
  for (const [k, v] of Object.entries(data || {})) {
    if (isSentinel(v)) {
      if (sentinelKind(v) === 'delete') delete out[k];
      else out[k] = new Date().toISOString();
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = materialise(v, prev?.[k] && typeof prev[k] === 'object' ? prev[k] : {});
    } else out[k] = v;
  }
  return out;
};

function docRef(path) {
  return {
    path,
    id: path.split('/').pop(),
    collection: (name) => collRef(`${path}/${name}`),
    async get() {
      const data = store.get(path);
      return { exists: data !== undefined, id: path.split('/').pop(), data: () => clone(data) };
    },
    async set(data, opts) {
      const prev = opts?.merge ? (store.get(path) || {}) : {};
      store.set(path, materialise(data, clone(prev)));
      writeLog.push({ op: opts?.merge ? 'merge' : 'set', path });
      return this;
    },
    async update(data) { return this.set(data, { merge: true }); },
  };
}

function collRef(path) {
  const docsIn = () =>
    [...store.entries()]
      .filter(([k]) => k.startsWith(`${path}/`) && k.slice(path.length + 1).indexOf('/') === -1)
      .map(([k, v]) => ({ id: k.split('/').pop(), ref: docRef(k), data: () => clone(v) }));

  const q = (docs) => ({
    where(field, op, value) {
      const f = (d) => {
        const val = d.data()[field];
        return op === '==' ? val === value : op === '>=' ? val >= value : true;
      };
      return q(docs.filter(f));
    },
    orderBy(field, dir = 'asc') {
      const key = (d) => (field === '__name__' ? d.id : d.data()[field]);
      const sorted = [...docs].sort((a, b) => String(key(a)).localeCompare(String(key(b))));
      return q(dir === 'desc' ? sorted.reverse() : sorted);
    },
    limit(n) { return q(docs.slice(0, n)); },
    async get() { return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) }; },
  });

  return {
    path,
    doc: (id) => docRef(`${path}/${id}`),
    async add(data) {
      const id = `auto-${Math.random().toString(36).slice(2, 10)}`;
      store.set(`${path}/${id}`, materialise(data));
      writeLog.push({ op: 'add', path: `${path}/${id}` });
      return docRef(`${path}/${id}`);
    },
    where: (...a) => q(docsIn()).where(...a),
    orderBy: (...a) => q(docsIn()).orderBy(...a),
    limit: (...a) => q(docsIn()).limit(...a),
    get: () => q(docsIn()).get(),
  };
}

const fakeDb = {
  collection: (name) => collRef(name),
  doc: (path) => docRef(path),
  async runTransaction(fn) {
    return fn({
      get: (ref) => ref.get(),
      set: (ref, data, opts) => { ref.set(data, opts); },
      update: (ref, data) => { ref.set(data, { merge: true }); },
    });
  },
};

// ── stub the Anthropic module before weeklyReview imports it ─────────────────
const anthropicPath = `${REPO}/functions/anthropic.js`;
const { default: fs } = await import('node:fs');
const anthropicReal = fs.readFileSync(anthropicPath, 'utf8');
const STUB = `
export async function callAnthropicJSON({ model, system, userContent, maxTokens }) {
  globalThis.__anthropicCalls.push({ model, maxTokens, promptLength: userContent.length, systemLength: system.length });
  if (userContent.includes("THIS WEEK'S FRAMEWORK")) {
    return {
      sessions: [
        { id: "A", sessionType: "full", coachFocus: "Quiet landings first.",
          adjustments: [{ id: "goblet_squat", loadNote: "hold 8 kg", tennisConnection: "Lateral power" }] },
        { id: "B", sessionType: "full", coachFocus: "Braking mechanics.", adjustments: [] },
      ],
      loadRationale: "Court volume was steady.",
      growthRationale: "Growing quickly — quality first.",
      overallRationale: "A steady build week.",
      deferredPriorities: [],
      coachNote: "Steady week.",
      athleteNote: "Great landings last week!",
    };
  }
  if (userContent.includes("WEEK IN REVIEW")) return { parentNote: "A steady week.", athleteNote: "Nice work!" };
  return { patterns: [], shoutouts: [] };
}
export const __real = ${JSON.stringify(anthropicReal.length)};
`;
globalThis.__anthropicCalls = anthropicCalls;

// Both shims are written into functions/ so Node resolves firebase-admin from
// functions/node_modules. They are removed unconditionally on exit — a failed
// run must not leave them behind for the next `git status` to trip over.
const TEMP_SHIMS = [`${REPO}/functions/anthropic.stub.mjs`, `${REPO}/functions/weeklyReview.harness.mjs`];
const cleanUp = () => {
  for (const f of TEMP_SHIMS) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
};
process.on('exit', cleanUp);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanUp(); process.exit(130); });
process.on('uncaughtException', (err) => { cleanUp(); console.error(err); process.exit(1); });

fs.writeFileSync(`${REPO}/functions/anthropic.stub.mjs`, STUB);

// Swap the import specifier by writing a temporary shim module next to it.
const reviewSrc = fs.readFileSync(`${REPO}/functions/weeklyReview.js`, 'utf8')
  .replace("from './anthropic.js'", "from './anthropic.stub.mjs'");
fs.writeFileSync(`${REPO}/functions/weeklyReview.harness.mjs`, reviewSrc);

// pathToFileURL: a bare Windows path (C:\...) is not a legal ESM specifier --
// dynamic import() rejects it with ERR_UNSUPPORTED_ESM_URL_SCHEME.
const { runWeeklyReviewForAthlete } = await import(pathToFileURL(`${REPO}/functions/weeklyReview.harness.mjs`).href);

// ── seed a realistic athlete ─────────────────────────────────────────────────
const ATHLETE = 'kDybMQH9lefwHI0dRway';
const A = `athletes/${ATHLETE}`;

const today = new Date();
const dayStr = (d) => {
  const x = new Date(today); x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

store.set(A, {
  name: 'Marsha',
  dob: '2014-03-07',
  competitionCategory: 'U14',
  weeklyReviewEnabled: true,
  gaps: ['first_step'],
  height: 153, weight: 43,
  measurements: [
    { date: dayStr(-6), height: 153, weight: 43 },
    { date: dayStr(-189), height: 148.5, weight: 37.5 },
  ],
});
for (const [i, l] of [
  { type: 'tennis', duration: 120, rpe: 7, date: dayStr(-6), time: '16:00' },
  { type: 'tennis', duration: 120, rpe: 7, date: dayStr(-5), time: '16:00' },
  { type: 'strength', duration: 55, rpe: 6, date: dayStr(-6), time: '07:00' },
  { type: 'other', duration: 40, rpe: 4, date: dayStr(-3), time: '07:00', sportName: 'Swimming' },
  { type: 'match', duration: 75, rpe: 8, date: dayStr(-1), time: '09:00', result: 'W' },
].entries()) store.set(`${A}/weekLogs/l${i}`, l);

store.set(`${A}/wellbeing/w1`, { date: dayStr(-1), type: 'checkin', mood: 4, soreness: 2, sleep: 8 });

// HISTORICAL sessions that must survive the run untouched.
store.set(`${A}/sessions/hist-1`, {
  date: dayStr(-11), time: '07:00', plannedSessionId: 'A',
  exercises: [{ name: 'Goblet Squat', sets: 2, reps: 8, difficulty: 3, completed: true }],
});
store.set(`${A}/sessions/hist-2`, {
  date: dayStr(-8), time: '07:00', plannedSessionId: 'B',
  exercises: [{ name: 'Single Leg RDL', sets: 2, reps: 6, difficulty: 3, completed: true }],
});

// ── run ──────────────────────────────────────────────────────────────────────
const check = [];
const ok = (n, pass, detail = '') => { check.push({ n, pass, detail }); };

const run1 = await runWeeklyReviewForAthlete(fakeDb, ATHLETE, { force: true });
const plan1 = store.get(`${A}/plans/current`);
const state1 = store.get(`${A}/programState/strength`);
const sessionsAfter1 = [...store.keys()].filter(k => k.startsWith(`${A}/sessions/`));

ok('1. pipeline completes', run1.status === 'complete', JSON.stringify(run1.steps));
ok('2. plan uses schema v2', plan1?.schemaVersion === 2, `schemaVersion=${plan1?.schemaVersion}`);
ok('3. block week read from persistent program state',
  !!state1 && plan1.block.week === 1 && plan1.block.startWeekKey === state1.blockStartWeekKey,
  `state=${JSON.stringify(state1)} planBlock=${JSON.stringify(plan1.block)}`);
const sA = plan1.sessions.find(s => s.id === 'A');
const sB = plan1.sessions.find(s => s.id === 'B');
ok('4. Session A on Monday', sA?.plannedDay === 'Monday' && sA.exercises.length > 0, `${sA?.exercises.length} exercises`);
ok('5. Session B on Thursday', sB?.plannedDay === 'Thursday' && sB.exercises.length > 0, `${sB?.exercises.length} exercises`);
ok('6. Sunday is a recovery day',
  plan1.sunday?.type === 'recovery' && plan1.sunday.structuredTraining === false,
  JSON.stringify(plan1.sunday));
ok('8. plan written to Firestore', !!plan1 && !!plan1.weekKey, `weekKey=${plan1?.weekKey}`);
ok('10. historical sessions untouched', sessionsAfter1.length === 2, `${sessionsAfter1.length} session docs`);

// A second forced run in the SAME calendar week.
const stateBefore2 = JSON.stringify(state1);
const run2 = await runWeeklyReviewForAthlete(fakeDb, ATHLETE, { force: true });
const plan2 = store.get(`${A}/plans/current`);
const state2 = store.get(`${A}/programState/strength`);
const sessionsAfter2 = [...store.keys()].filter(k => k.startsWith(`${A}/sessions/`));
const planDocs = [...store.keys()].filter(k => k.startsWith(`${A}/plans/`));

ok('11. second run does not advance the block week',
  plan2.block.week === plan1.block.week && JSON.stringify(state2) === stateBefore2,
  `week ${plan1.block.week} → ${plan2.block.week}`);
ok('12. no duplicate plan or session records',
  planDocs.length === 1 && sessionsAfter2.length === 2,
  `${planDocs.length} plan doc(s), ${sessionsAfter2.length} session doc(s)`);
ok('   run 2 completes', run2.status === 'complete', JSON.stringify(run2.steps));

// A run in the FOLLOWING calendar week must advance by exactly one. The clock
// cannot be injected into the orchestrator, so the equivalent move is made on
// the stored state: shifting the block start back one week is exactly what the
// calendar turning over looks like to the derivation.
const shifted = { ...state2 };
const bs = new Date(`${shifted.blockStartWeekKey}T00:00:00`);
bs.setDate(bs.getDate() - 7);
shifted.blockStartWeekKey = `${bs.getFullYear()}-${String(bs.getMonth() + 1).padStart(2, '0')}-${String(bs.getDate()).padStart(2, '0')}`;
store.set(`${A}/programState/strength`, shifted);
const run3 = await runWeeklyReviewForAthlete(fakeDb, ATHLETE, { force: true });
const plan3 = store.get(`${A}/plans/current`);
ok('   next calendar week advances exactly one block week',
  run3.status === 'complete' && plan3.block.week === 2,
  `week ${plan2.block.week} → ${plan3.block.week}`);
ok('   still one plan doc and two historical sessions',
  [...store.keys()].filter(k => k.startsWith(`${A}/plans/`)).length === 1
  && [...store.keys()].filter(k => k.startsWith(`${A}/sessions/`)).length === 2);

// No Mirwald-derived escalation: the weekly review writes no guardian alert at
// all, and the growth context in the plan comes from measured height only.
const guardianDocs = [...store.keys()].filter(k => k.includes('guardianAlert'));
ok('7. no Mirwald-derived Guardian escalation',
  guardianDocs.length === 0 && plan1.growthContext.recentGrowthVelocityCmYr != null
    && !JSON.stringify(plan1).match(/PHV|maturity/i),
  `guardianAlerts=${guardianDocs.length} growthVelocity=${plan1.growthContext.recentGrowthVelocityCmYr}`);

// ── report ───────────────────────────────────────────────────────────────────
console.log('\n══ LOCAL QUALIFICATION (in-memory Firestore, stubbed Anthropic) ══\n');
for (const c of check) console.log(`${c.pass ? '  PASS' : '  FAIL'}  ${c.n}${c.detail ? `  — ${c.detail}` : ''}`);
console.log(`\nAnthropic calls: ${anthropicCalls.length} in run 1+2 (${anthropicCalls.map(c => c.model).join(', ')})`);
console.log(`Program state:   ${JSON.stringify(state2)}`);
console.log(`Plan block:      ${JSON.stringify(plan2.block)}`);
console.log(`Plan sessions:   ${plan2.sessions.map(s => `${s.id}/${s.plannedDay}/${s.sessionType}/${s.exercises.length}ex`).join('  ')}`);
console.log(`\n${check.every(c => c.pass) ? 'ALL LOCAL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);

// cleanUp also runs from the `exit` handler registered above.
cleanUp();
process.exit(check.every(c => c.pass) ? 0 : 1);
