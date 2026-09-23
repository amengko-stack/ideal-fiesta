// Direct Guardian/Mirwald qualification, against the REAL pure core the Cloud
// Function deploys (functions/shared/guardianCore.js — not the src/lib copy).
//
// WHY THIS FILE EXISTS. qualify-weekly-review.mjs used to claim it proved "no
// Mirwald-derived Guardian escalation" by observing that the weekly review had
// written no guardianAlert document. That proved nothing: the weekly review
// never invokes the Guardian, so the document was always going to be absent,
// and the fixture had no sitting height, so no Mirwald estimate existed to
// escalate from in the first place. The check passed for two reasons that had
// nothing to do with the property.
//
// This runs the Guardian itself. It holds every non-Mirwald signal constant and
// changes ONLY the maturity estimate, across the full Pre-PHV -> Mid-PHV ->
// Post-PHV range, and asserts that not one output moves.
//
// The single-variable lever is `dob`. Inside guardianCore it is read by exactly
// one thing — maturityOffset — because the growth factor that DOES carry weight
// takes its velocity from dated height history, which contains no birthday. So
// three athletes with identical bodies, identical training, identical wellbeing
// and three different birthdays differ in the maturity estimate and in nothing
// else the engine can see.
//
// Exported rather than executed so the same assertions run inside the existing
// CI gate (qualify-weekly-review.mjs) instead of as a second entry point.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(HERE, '..', 'shared');

const AT = new Date('2026-08-12T06:00:00');

// Identical bodies and identical measured growth (149 cm -> 153 cm over ~6
// months, which is what actually earns the growth family its place).
const MEASUREMENTS = [
  { date: '2026-08-01', height: 153, sittingHeight: 80, weight: 43 },
  { date: '2026-02-01', height: 149, sittingHeight: 78, weight: 40 },
];

// Three birthdays that land in three different Mirwald bands.
const DOBS = { pre: '2017-03-07', mid: '2014-03-07', post: '2010-03-07' };

// Seven training days ending at AT, no rest day, plus three flat-mood check-ins
// — enough for the Guardian to genuinely FIRE, so the comparison is between
// three live alerts rather than between three silences.
const WEEK_LOGS = [
  { date: '2026-08-06', rpe: 10, duration: 60 }, { date: '2026-08-07', rpe: 10, duration: 60 },
  { date: '2026-08-08', rpe: 10, duration: 60 }, { date: '2026-08-09', rpe: 10, duration: 20 },
  { date: '2026-08-10', rpe: 10, duration: 60 }, { date: '2026-08-11', rpe: 10, duration: 20 },
  { date: '2026-08-12', rpe: 10, duration: 20 },
];
const WELLBEING = [
  { date: '2026-08-10', type: 'checkin', mood: 2, soreness: 2, sleep: 8 },
  { date: '2026-08-11', type: 'checkin', mood: 2, soreness: 2, sleep: 8 },
  { date: '2026-08-12', type: 'checkin', mood: 2, soreness: 2, sleep: 8 },
];

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Returns [{ n, pass, detail }] in the shape qualify-weekly-review.mjs collects.
export async function guardianMaturityChecks() {
  const { assessGuardian, cooldownDecision, buildGuardianNotesPrompt, isDecisionEvidence } =
    await import(pathToFileURL(path.join(SHARED, 'guardianCore.js')).href);
  const { maturityOffset } =
    await import(pathToFileURL(path.join(SHARED, 'maturity.js')).href);

  const out = [];
  const ok = (n, pass, detail = '') => out.push({ n, pass, detail });

  const assess = (dob) => assessGuardian(
    { athlete: { dob, measurements: MEASUREMENTS }, weekLogs: WEEK_LOGS, wellbeing: WELLBEING },
    AT,
  );
  const [a, b, c] = [assess(DOBS.pre), assess(DOBS.mid), assess(DOBS.post)];
  const stages = [a, b, c].map(x => x.metrics.maturityStage);
  const offsets = [a, b, c].map(x => x.metrics.maturityOffset);

  // 0. The fixture is not vacuous: an estimate exists and it really does move.
  ok('7a. fixture carries anthropometry that yields materially different Mirwald estimates',
    eq(stages, ['Pre-PHV', 'Mid-PHV', 'Post-PHV'])
      && new Set(offsets).size === 3
      && Math.abs(offsets[2] - offsets[0]) > 3
      && maturityOffset({ dob: DOBS.mid, heightCm: 153, sittingHeightCm: 80, weightKg: 43, date: AT }) != null,
    `stages=${stages.join('/')} offsets=${offsets.join('/')}`);

  // 0b. ...and the Guardian is actually speaking, so there is something to move.
  ok('7b. the Guardian fires on this fixture (a real alert, not three silences)',
    a.fires === true && a.severity != null && a.actions.athlete.length > 0,
    `fires=${a.fires} severity=${a.severity} families=${(a.families || []).join('+')}`);

  // 1. gate result
  ok('7c. changing only Mirwald cannot change the gate result',
    a.fires === b.fires && b.fires === c.fires && a.reason === b.reason && b.reason === c.reason,
    `fires=${[a, b, c].map(x => x.fires).join('/')} reason=${[a, b, c].map(x => x.reason).join('/')}`);

  // 2. severity
  ok('7d. changing only Mirwald cannot change severity',
    a.severity === b.severity && b.severity === c.severity
      && a.tone === b.tone && b.tone === c.tone
      && a.acuteWeight === b.acuteWeight && b.acuteWeight === c.acuteWeight,
    `severity=${[a, b, c].map(x => x.severity).join('/')} weight=${[a, b, c].map(x => x.acuteWeight).join('/')}`);

  // 3. counted factor set
  const counted = (x) => x.factors.filter(f => f.counts !== false).map(f => f.id).sort();
  ok('7e. changing only Mirwald cannot change the counted factor set',
    eq(counted(a), counted(b)) && eq(counted(b), counted(c))
      && eq(a.families, b.families) && eq(b.families, c.families)
      && a.factorKey === b.factorKey && b.factorKey === c.factorKey,
    `counted=${counted(a).join('+')}`);

  // 4. recommended action
  ok('7f. changing only Mirwald cannot change the recommended action',
    eq(a.actions, b.actions) && eq(b.actions, c.actions)
      && a.headline === b.headline && b.headline === c.headline,
    `actions=${JSON.stringify(a.actions.athlete)}`);

  // 5. cooldown / escalation
  const prior = { current: {
    storyKey: a.storyKey, factorKey: a.factorKey, families: [...a.families],
    severity: a.severity, acuteWeight: a.acuteWeight,
    firstFiredDate: '2026-08-10', lastFiredDate: '2026-08-10', firstSeenDate: '2026-08-10',
    fireCount: 1, cleared: false, clearedDate: null, reason: 'first-fire',
  } };
  const held = [a, b, c].map(x => cooldownDecision(prior, x, AT));
  const fresh = [a, b, c].map(x => cooldownDecision(null, x, AT));
  ok('7g. changing only Mirwald cannot change cooldown or escalation',
    eq(held[0], held[1]) && eq(held[1], held[2]) && eq(fresh[0], fresh[1]) && eq(fresh[1], fresh[2]),
    `held=${held.map(d => d.reason).join('/')} fresh=${fresh.map(d => d.reason).join('/')}`);

  // 6. readiness
  ok('7h. changing only Mirwald cannot change readiness',
    a.metrics.readiness != null
      && a.metrics.readiness === b.metrics.readiness && b.metrics.readiness === c.metrics.readiness,
    `readiness=${[a, b, c].map(x => x.metrics.readiness).join('/')}`);

  // 7. Growth Watch and the measured velocity behind it
  const growth = (x) => [x.metrics.growthWatch, x.metrics.growthVelocity, x.metrics.growthSpanDays];
  ok('7i. changing only Mirwald cannot change Growth Watch or measured growth velocity',
    eq(growth(a), growth(b)) && eq(growth(b), growth(c)) && a.metrics.growthVelocity != null,
    `growth=${JSON.stringify(growth(a))}`);

  // The informational factor may exist — it just has to stay inert.
  const midFactor = b.factors.find(f => f.id === 'mid-phv-window') || null;
  ok('7j. the informational mid-PHV factor stays weight 0 / counts:false / non-standalone',
    midFactor == null
      || (midFactor.weight === 0 && midFactor.counts === false && midFactor.standalone === false),
    midFactor ? `weight=${midFactor.weight} counts=${midFactor.counts}` : 'factor absent');

  // The AI note prompt. Every check above is deterministic; this is the one
  // output written by a model, and it is the last place the estimate could
  // reach an actionable recommendation — the parent note it produces ends with
  // "the one concrete change to make today". The only statement worth making
  // about it is that the model receives the same bytes whatever the estimate.
  const prompts = [a, b, c].map(x => buildGuardianNotesPrompt(x, 'Vee'));
  const evidenceOf = (pr) => pr.prompt.slice(0, pr.prompt.indexOf('Respond with exactly this JSON structure:'));
  const BANNED = ['mid-phv-window', 'Mid-PHV', 'Pre-PHV', 'Post-PHV', 'PHV',
                  'Mirwald', 'maturity', 'maturation', 'growth spurt', 'estimate'];
  const leaked = BANNED.filter(w => prompts.some(pr => evidenceOf(pr).includes(w) || pr.system.includes(w)));

  ok('7k. changing only Mirwald cannot change a single byte of the Guardian note prompt',
    prompts[0].prompt === prompts[1].prompt && prompts[1].prompt === prompts[2].prompt
      && prompts[0].system === prompts[1].system && prompts[1].system === prompts[2].system
      && evidenceOf(prompts[0]).includes('FACTORS THE ENGINE FOUND:'),
    `promptLen=${prompts.map(p => p.prompt.length).join('/')} systemLen=${prompts.map(p => p.system.length).join('/')}`);

  ok('7l. the note prompt names no maturity band, offset or stage in its evidence',
    leaked.length === 0,
    leaked.length ? `leaked: ${leaked.join(', ')}` : 'no maturity term in system or evidence');

  // ...and the reason it is absent is the rule, not the fixture: the Mid-PHV
  // variant really does carry an extra factor that the prompt does not show.
  const countedLen = (x) => x.factors.filter(isDecisionEvidence).length;
  const evidenceLines = (pr) => evidenceOf(pr).split('\n').filter(l => l.startsWith('- [')).length;
  ok('7m. the informational factor exists on the assessment but not in the prompt',
    b.factors.length > a.factors.length
      && countedLen(b) === countedLen(a)
      && evidenceLines(prompts[1]) === countedLen(b)
      && b.factors.some(f => f.id === 'mid-phv-window'),
    `factors=${a.factors.length}/${b.factors.length} counted=${countedLen(a)}/${countedLen(b)} promptLines=${evidenceLines(prompts[1])}`);

  return out;
}
