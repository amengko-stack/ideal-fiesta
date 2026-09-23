#!/usr/bin/env node
// Deployable-package verification for functions/.
//
// `npm test` at the repo root exercises the pure cores from src/lib, with the
// root dependency tree. It cannot see the thing that actually breaks a deploy:
// functions/ is its own npm package with its own lockfile, and Cloud Functions
// ships ONLY that directory. A shared module that was never synced, a relative
// import that does not resolve, or a firebase-admin/firebase-functions version
// the entrypoint cannot load are all invisible to the root suite and fatal at
// deploy time.
//
// So this runs against the real functions/node_modules and checks, in order:
//   1. the running Node SATISFIES package.json engines.node (not "is at least
//      as new as" — see the engines section for why that distinction matters);
//   2. every declared dependency resolves;
//   3. every relative import in the deployed .js files points at a file that
//      exists (this is what catches an unsynced functions/shared module);
//   4. the deployed entrypoint (index.js) imports and exports every trigger
//      firebase deploy expects;
//   5. weeklyReview.js imports and exports its own public surface.
//
// It needs NO credentials: index.js calls admin.initializeApp() with ambient
// ADC, which resolves lazily, and defining a gen-1 trigger touches nothing.
// Nothing here calls a trigger, so nothing reaches Firebase or Anthropic.
//
// Usage:  cd functions && npm ci && node scripts/verify-package.mjs
// Exit code 0 = the deployable package is sound.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.resolve(HERE, '..');

const failures = [];
const pass = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => { failures.push(msg); console.log(`  FAIL  ${msg}`); };

const pkg = JSON.parse(readFileSync(path.join(FUNCTIONS_DIR, 'package.json'), 'utf8'));

console.log('\n══ functions/ deployable package verification ══\n');

// ── 1. engines ───────────────────────────────────────────────────────────────
// The question is whether the running Node SATISFIES engines.node, which is a
// semver RANGE. It is not "is this Node at least as new as the declared major".
//
// That distinction is the whole point of this check. The original comparison
// was `haveMajor < wantMajor`, which passes every newer major — so on a Node 24
// machine `npm ci` printed EBADENGINE (correctly: npm reads "20" as 20.x) while
// this script printed PASS on the very next line. The verifier was reassuring
// the reader about the exact thing npm had just refused. Cloud Functions runs
// the declared runtime, so "newer" is not "compatible"; it is a different
// runtime that nothing has tested this package on.
//
// Matching is delegated to semver when it resolves from the real functions tree
// (it does — firebase-admin depends on it), because hand-rolling range
// semantics is how this bug happened in the first place. The fallback below
// understands only a `||` list of bare majors and REFUSES anything else, so an
// engines expression nobody has taught it about fails the check instead of
// sliding through it.

const DECLARED = String(pkg.engines?.node ?? '').trim();

// A bare major ("20") or a `||` list of them ("20 || 22"). Deliberately narrow.
const BARE_MAJOR_LIST = /^\d+(\s*\|\|\s*\d+)*$/;
function satisfiesFallback(version, range) {
  if (!BARE_MAJOR_LIST.test(range)) return null;   // null = "I cannot judge this"
  const have = Number(version.split('.')[0]);
  return range.split('||').map(s => Number(s.trim())).includes(have);
}

let semverSatisfies = null;
let matcher = 'fallback (bare-major list)';
try {
  const semver = (await import('semver')).default;
  if (typeof semver?.satisfies === 'function') {
    semverSatisfies = (v, r) => semver.satisfies(v, r, { includePrerelease: true });
    matcher = 'semver';
  }
} catch { /* not resolvable from this tree — the fallback stands */ }

const satisfies = (v, r) => (semverSatisfies ? semverSatisfies(v, r) : satisfiesFallback(v, r));

// Self-check: the matcher proves itself on known pairs BEFORE it is trusted to
// judge this machine. These are the cases the old comparison got wrong, so they
// are the ones that must stay right — and they hold whichever Node runs them.
const MATCHER_CASES = [
  ['20.11.0', '20', true],
  ['20.0.0',  '20', true],
  ['20.19.5', '20', true],
  ['24.15.0', '20', false],   // the bug: a newer major is NOT a match
  ['22.0.0',  '20', false],
  ['18.20.0', '20', false],
  ['22.1.0',  '20 || 22', true],
  ['21.7.0',  '20 || 22', false],
];
const matcherWrong = MATCHER_CASES
  .filter(([v, r, want]) => satisfies(v, r) !== want)
  .map(([v, r, want]) => `${v} vs "${r}" should be ${want}`);
if (matcherWrong.length) {
  fail(`the engines matcher (${matcher}) is wrong about: ${matcherWrong.join('; ')}`);
} else {
  pass(`engines matcher (${matcher}) agrees with npm on ${MATCHER_CASES.length} known version/range pairs`);
}

if (!DECLARED) {
  fail('package.json declares no engines.node — the deploy runtime is unpinned');
} else {
  const ok = satisfies(process.versions.node, DECLARED);
  if (ok === null) {
    fail(`engines.node "${DECLARED}" is a range this verifier cannot evaluate — install semver in functions/, or teach satisfiesFallback this syntax. Refusing to guess.`);
  } else if (!ok) {
    fail(`Node ${process.versions.node} does NOT satisfy engines.node "${DECLARED}" — this is the runtime mismatch npm reports as EBADENGINE. Run this under Node ${DECLARED}; do not widen engines.node to make the local machine pass.`);
  } else {
    pass(`Node ${process.versions.node} satisfies engines.node "${DECLARED}"`);
  }
}

// ── 2. declared dependencies resolve ─────────────────────────────────────────
for (const name of Object.keys(pkg.dependencies ?? {})) {
  try {
    await import.meta.resolve(name, pathToFileURL(path.join(FUNCTIONS_DIR, 'index.js')).href);
    const installed = JSON.parse(
      readFileSync(path.join(FUNCTIONS_DIR, 'node_modules', name, 'package.json'), 'utf8')
    ).version;
    pass(`dependency ${name} resolves (installed ${installed}, declared ${pkg.dependencies[name]})`);
  } catch (err) {
    fail(`dependency ${name} does not resolve — ${err.message}`);
  }
}

// ── 3. every relative import points at a file that exists ────────────────────
// This is the unsynced-shared-module check. A missing functions/shared/*.js
// only surfaces at runtime otherwise, i.e. in production.
const deployedFiles = readdirSync(FUNCTIONS_DIR)
  .filter(f => f.endsWith('.js'))
  .concat(readdirSync(path.join(FUNCTIONS_DIR, 'shared')).filter(f => f.endsWith('.js')).map(f => `shared/${f}`));

const RELATIVE_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["'](\.[^"']+)["']/g;
let relativeChecked = 0;
let relativeMissing = 0;
for (const rel of deployedFiles) {
  const filePath = path.join(FUNCTIONS_DIR, rel);
  const src = readFileSync(filePath, 'utf8');
  for (const [, spec] of src.matchAll(RELATIVE_IMPORT)) {
    relativeChecked += 1;
    const target = path.resolve(path.dirname(filePath), spec);
    if (!existsSync(target)) {
      relativeMissing += 1;
      fail(`${rel} imports "${spec}" — ${path.relative(FUNCTIONS_DIR, target)} does not exist`);
    }
  }
}
if (relativeMissing === 0) {
  pass(`all ${relativeChecked} relative imports across ${deployedFiles.length} deployed files resolve to real files`);
}

// ── 4. the deployed entrypoint ───────────────────────────────────────────────
// firebase deploy ships whatever index.js exports; a missing export is a
// silently un-deployed trigger.
const EXPECTED_TRIGGERS = ['api', 'guardian', 'runGuardianNow', 'runWeeklyReviewNow', 'sendCheckinReminder', 'weeklyReview'];
try {
  const index = await import(pathToFileURL(path.join(FUNCTIONS_DIR, 'index.js')).href);
  const exported = Object.keys(index).sort();
  pass(`index.js imports with the real dependency tree (exports: ${exported.join(', ')})`);
  const missing = EXPECTED_TRIGGERS.filter(t => !(t in index));
  if (missing.length) fail(`index.js is missing expected trigger export(s): ${missing.join(', ')}`);
  else pass(`index.js exports every expected trigger (${EXPECTED_TRIGGERS.length})`);
} catch (err) {
  fail(`index.js failed to import — ${err.message}`);
}

// ── 5. weeklyReview.js public surface ────────────────────────────────────────
const EXPECTED_REVIEW = ['FAMILY_UIDS', 'STALE_RUN_MS', 'runWeeklyReviewForAthlete', 'runWeeklyReviewNow', 'toMillis', 'tournamentModeForRun', 'weeklyReview'];
try {
  const review = await import(pathToFileURL(path.join(FUNCTIONS_DIR, 'weeklyReview.js')).href);
  pass('weeklyReview.js imports with the real dependency tree');
  const missing = EXPECTED_REVIEW.filter(n => !(n in review));
  if (missing.length) fail(`weeklyReview.js is missing expected export(s): ${missing.join(', ')}`);
  else pass(`weeklyReview.js exports its full public surface (${EXPECTED_REVIEW.length})`);
  if (typeof review.runWeeklyReviewForAthlete !== 'function') {
    fail('runWeeklyReviewForAthlete is not callable');
  }
} catch (err) {
  fail(`weeklyReview.js failed to import — ${err.message}`);
}

console.log('');
if (failures.length) {
  console.error(`::error::functions/ package verification failed (${failures.length} problem(s))`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('functions/ deployable package VERIFIED\n');
