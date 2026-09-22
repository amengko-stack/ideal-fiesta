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
//   1. the Node major version matches package.json engines;
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
const wantMajor = Number(String(pkg.engines?.node ?? '').match(/\d+/)?.[0]);
const haveMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(wantMajor)) {
  fail('package.json declares no engines.node — the deploy runtime is unpinned');
} else if (haveMajor < wantMajor) {
  fail(`Node ${process.versions.node} is older than the declared runtime (node ${wantMajor})`);
} else {
  pass(`Node ${process.versions.node} satisfies engines.node "${pkg.engines.node}"`);
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
