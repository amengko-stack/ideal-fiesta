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
// Sunday as recovery, historical sessions left untouched, a repeated Run-now
// neither advancing the block nor duplicating records, and the next calendar
// week advancing by exactly one.
//
// It ALSO runs the Guardian directly (guardian-maturity-check.mjs) to qualify
// that the Mirwald estimate decides nothing. That used to be asserted here by
// observing that no guardianAlert document existed after a weekly review — a
// check that could never fail, because the weekly review does not invoke the
// Guardian at all and the fixture had no sitting height for a Mirwald estimate
// to be derived from. The real property needs the real engine, so the checks
// numbered 7x below come from that helper, run inside this same CI gate.
//
// Every write the pipeline makes goes through the double, and the double now
// enforces the one Firestore rule that broke production on 2026-09-23: no
// explicit `undefined` anywhere in a written document (firestore-safe.mjs).
// Before that, the double stored whatever it was given, so a plan carrying
// `distanceM: undefined` on 35 of 37 exercises passed here and was rejected by
// real Firestore on the first Run-now. Checks R1–R3 prove the double rejects
// that exact shape; check 13 asserts the exact plans/current object is clean.
//
// It does NOT replace a production Run-now: it cannot prove the deployed
// function runs, that Firestore accepts the write on grounds other than an
// undefined value (document size, nested arrays, reserved field names), or
// that the app renders it.
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
//
// Every write path validates its payload the way real Firestore does before
// anything is stored: an explicit undefined at any depth rejects the write and
// names the full field path. set/update/add reject their promise; a
// transaction's set/update throw synchronously, as the admin SDK's do, so the
// failure surfaces from runTransaction instead of as a stray rejection.
const admin = (await import('firebase-admin')).default;
const { assertFirestoreSafe, findUndefinedPaths } = await import(
  pathToFileURL(`${REPO}/functions/scripts/firestore-safe.mjs`).href);

// weeklyReview.js reads admin.firestore.FieldValue at module scope but never
// calls admin.firestore() — `db` is injected — so the REAL sentinels are used
// and the double resolves them the way the server would.
const FieldValue = admin.firestore.FieldValue;
const isSentinel = (v) => v instanceof FieldValue;
const sentinelKind = (v) => (v.isEqual(FieldValue.delete()) ? 'delete' : 'serverTimestamp');

const store = new Map(); // "path/to/doc" -> data object
// Every accepted write, with the RAW payload the pipeline handed over (not a
// clone — JSON cloning drops undefined, which is how the old double hid it).
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
      const op = opts?.merge ? 'merge' : 'set';
      assertFirestoreSafe(data, `${op} ${path}`);
      const prev = opts?.merge ? (store.get(path) || {}) : {};
      store.set(path, materialise(data, clone(prev)));
      writeLog.push({ op, path, data });
      return this;
    },
    async update(data) {
      assertFirestoreSafe(data, `update ${path}`);
      return this.set(data, { merge: true });
    },
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
      assertFirestoreSafe(data, `add ${path}/${id}`);
      store.set(`${path}/${id}`, materialise(data));
      writeLog.push({ op: 'add', path: `${path}/${id}`, data });
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
      set: (ref, data, opts) => {
        assertFirestoreSafe(data, `transaction ${opts?.merge ? 'merge' : 'set'} ${ref.path}`);
        ref.set(data, opts);
      },
      update: (ref, data) => {
        assertFirestoreSafe(data, `transaction update ${ref.path}`);
        ref.set(data, { merge: true });
      },
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

// Sitting height is present throughout — on the profile and on the dated
// measurements — so a Mirwald estimate genuinely exists for this fixture. It
// did not before, which is why "no Mirwald-derived escalation" used to be
// trivially true.
store.set(A, {
  name: 'Marsha',
  dob: '2014-03-07',
  competitionCategory: 'U14',
  weeklyReviewEnabled: true,
  gaps: ['first_step'],
  height: 153, weight: 43, sittingHeight: 80,
  measurements: [
    { date: dayStr(-6), height: 153, weight: 43, sittingHeight: 80 },
    { date: dayStr(-189), height: 148.5, weight: 37.5, sittingHeight: 77 },
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

const report = () => {
  console.log('\n══ LOCAL QUALIFICATION (in-memory Firestore, stubbed Anthropic) ══\n');
  for (const c of check) console.log(`${c.pass ? '  PASS' : '  FAIL'}  ${c.n}${c.detail ? `  — ${c.detail}` : ''}`);
};

// ── R. the double enforces the Firestore-safe invariant ──────────────────────
// Proven on the double itself, through every write path the weekly review
// uses, with the literal shape that production rejected. A double that
// quietly regained its old permissiveness would fail here, before any plan is
// generated.
const BROKEN = { sessions: [{ exercises: [{ distanceM: undefined }] }] };
const CLEAN = { sessions: [{ exercises: [{}] }] };
const BROKEN_PATH = 'sessions.0.exercises.0.distanceM';
const SELFTEST = 'qualification/selftest';

const rejects = async (write) => {
  try { await write(); return null; } catch (err) { return err; }
};
const writePaths = {
  set: () => fakeDb.doc(SELFTEST).set(BROKEN),
  'set+merge': () => fakeDb.doc(SELFTEST).set(BROKEN, { merge: true }),
  update: () => fakeDb.doc(SELFTEST).update(BROKEN),
  add: () => fakeDb.collection('qualification').add(BROKEN),
  'transaction set': () => fakeDb.runTransaction(async (tx) => { tx.set(fakeDb.doc(SELFTEST), BROKEN); }),
  'transaction update': () => fakeDb.runTransaction(async (tx) => { tx.update(fakeDb.doc(SELFTEST), BROKEN); }),
};
const rejected = [];
for (const [name, write] of Object.entries(writePaths)) {
  const err = await rejects(write);
  rejected.push({ name, named: !!err && err.message.includes(`"${BROKEN_PATH}"`), message: err?.message });
}
ok('R1. double REJECTS the production-broken shape on every write path, naming the path',
  rejected.every(r => r.named) && !store.has(SELFTEST),
  rejected.map(r => `${r.name}:${r.named ? 'rejected' : `ACCEPTED (${r.message ?? 'no error'})`}`).join(' '));

const cleanErr = await rejects(async () => {
  await fakeDb.doc(SELFTEST).set(CLEAN);
  await fakeDb.doc(SELFTEST).update(CLEAN);
  await fakeDb.runTransaction(async (tx) => { tx.set(fakeDb.doc(SELFTEST), CLEAN, { merge: true }); });
});
ok('R2. double ACCEPTS the corrected shape (key omitted)', cleanErr === null, cleanErr?.message ?? '');

// Legitimate values, including the real admin-SDK sentinels and Timestamp the
// pipeline itself writes, must not be mistaken for undefined.
const legit = {
  nothing: null, zero: 0, negative: -1.5, empty: '', text: 'x', yes: true, no: false,
  list: [0, null, 'a', { nested: false }],
  when: new Date(0),
  at: admin.firestore.Timestamp.fromMillis(0),
  stamp: FieldValue.serverTimestamp(),
};
const legitErr = await rejects(async () => {
  await fakeDb.doc(SELFTEST).set(legit);
  await fakeDb.doc(SELFTEST).set({ gone: FieldValue.delete() }, { merge: true });
});
ok('R3. double ACCEPTS null, 0, strings, booleans, Date, Timestamp and FieldValue sentinels',
  legitErr === null, legitErr?.message ?? '');
store.delete(SELFTEST);
writeLog.length = 0;

// A run that dies on a rejected write is reported as a FAIL with the error,
// not as a crash that skips the report.
const attempt = (label) => runWeeklyReviewForAthlete(fakeDb, ATHLETE, { force: true })
  .catch((err) => ({ status: 'error', error: err.message, steps: err.summary?.steps ?? {}, label }));

const run1 = await attempt('run 1');
const plan1 = store.get(`${A}/plans/current`);
const state1 = store.get(`${A}/programState/strength`);
const sessionsAfter1 = [...store.keys()].filter(k => k.startsWith(`${A}/sessions/`));

ok('1. pipeline completes', run1.status === 'complete',
  run1.error ? `${run1.error}  steps=${JSON.stringify(run1.steps)}` : JSON.stringify(run1.steps));

if (run1.status !== 'complete' || !plan1) {
  // Nothing downstream is meaningful without a written plan.
  report();
  console.log('\nSOME CHECKS FAILED');
  cleanUp();
  process.exit(1);
}

// The exact object the pipeline handed to plans/current, before the double's
// JSON round-trip — the object Firestore would have been asked to accept.
const rawPlanWrites = writeLog.filter(w => w.path === `${A}/plans/current`);
const rawPlan = rawPlanWrites.at(-1)?.data;
const planUndefined = findUndefinedPaths(rawPlan);
ok('13. plans/current as written contains zero explicit undefined values',
  !!rawPlan && planUndefined.length === 0,
  planUndefined.length
    ? `${planUndefined.length} undefined: ${planUndefined.slice(0, 5).join(', ')}`
    : `${rawPlan.sessions.flatMap(s => s.exercises).length} exercises, ${writeLog.length} writes in run 1 all Firestore-safe`);
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
const run2 = await attempt('run 2');
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
const run3 = await attempt('run 3');
const plan3 = store.get(`${A}/plans/current`);
ok('   next calendar week advances exactly one block week',
  run3.status === 'complete' && plan3.block.week === 2,
  `week ${plan2.block.week} → ${plan3.block.week}`);
ok('   still one plan doc and two historical sessions',
  [...store.keys()].filter(k => k.startsWith(`${A}/plans/`)).length === 1
  && [...store.keys()].filter(k => k.startsWith(`${A}/sessions/`)).length === 2);

// ── Mirwald decides nothing ──────────────────────────────────────────────────
// Two separate properties, and the old single check conflated them.
//
// (7) The generated PLAN carries measured growth and never a maturity band.
//     This is about the S&C path, and the fixture now has a sitting height, so
//     a Mirwald estimate exists and is demonstrably still absent from the plan.
ok('7. the weekly plan uses MEASURED growth and never a maturity band',
  plan1.growthContext.recentGrowthVelocityCmYr != null
    && !JSON.stringify(plan1).match(/PHV|maturity|mirwald/i),
  `growthVelocity=${plan1.growthContext.recentGrowthVelocityCmYr}`);

// (7a-7j) The GUARDIAN itself, run directly against the real pure core with
// every non-Mirwald signal held constant. Absence of a document proves nothing
// about an engine that was never invoked, so this invokes it.
const { guardianMaturityChecks } = await import(
  pathToFileURL(`${REPO}/functions/scripts/guardian-maturity-check.mjs`).href);
for (const c of await guardianMaturityChecks()) ok(c.n, c.pass, c.detail);

// ── report ───────────────────────────────────────────────────────────────────
report();
console.log(`\nWrites validated: ${writeLog.length} across runs 1–3, every one Firestore-safe`);
console.log(`Anthropic calls: ${anthropicCalls.length} in run 1+2 (${anthropicCalls.map(c => c.model).join(', ')})`);
console.log(`Program state:   ${JSON.stringify(state2)}`);
console.log(`Plan block:      ${JSON.stringify(plan2.block)}`);
console.log(`Plan sessions:   ${plan2.sessions.map(s => `${s.id}/${s.plannedDay}/${s.sessionType}/${s.exercises.length}ex`).join('  ')}`);
console.log(`\n${check.every(c => c.pass) ? 'ALL LOCAL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);

// cleanUp also runs from the `exit` handler registered above.
cleanUp();
process.exit(check.every(c => c.pass) ? 0 : 1);
