#!/usr/bin/env node
// Regenerates the weekly-plan golden prompt fixtures from the current
// buildWeeklyStrengthPlanPrompt output.
//
// The goldens exist to make an unintended wording change fail CI. Running this
// script is therefore a deliberate act: read `git diff src/lib/__fixtures__`
// afterwards and confirm every changed line is a change you meant to make.
//
// Usage: node scripts/regen-plan-goldens.mjs

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(repoRoot, 'src', 'lib', '__fixtures__');

const { buildWeeklyStrengthPlanPrompt } = await import(path.join(repoRoot, 'src/lib/planGenCore.js'));
const { FIXTURE_NOW, fixtureArgs, fixtureCtx } = await import(path.join(FIXTURE_DIR, 'weeklyPlanFixture.js'));

// getWeekBounds() reads the real clock (it takes no reference date), so the
// week window inside the prompt would otherwise depend on the day this script
// runs. Freeze the clock exactly the way planGenCore.test.js does with
// vi.setSystemTime, so the goldens this writes are the bytes the test compares.
const FROZEN_MS = new Date(FIXTURE_NOW).getTime();
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FROZEN_MS);
    else super(...args);
  }
  static now() { return FROZEN_MS; }
}
globalThis.Date = FrozenDate;

const now = new Date(FIXTURE_NOW);

const normal = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, ctx: fixtureCtx, now });
const tournament = buildWeeklyStrengthPlanPrompt({ ...fixtureArgs, tournament: 'week_of', ctx: fixtureCtx, now });

globalThis.Date = RealDate;

const files = {
  'weeklyPlanPrompt.golden.txt': normal.prompt,
  'weeklyPlanSystem.golden.txt': normal.system,
  'weeklyPlanPrompt.tournament.golden.txt': tournament.prompt,
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(path.join(FIXTURE_DIR, name), content, 'utf8');
  console.log(`[regen-plan-goldens] wrote ${name} (${content.length} bytes)`);
}
