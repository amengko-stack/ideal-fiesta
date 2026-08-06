// Cloud Functions run with TZ unset (UTC). Every stored `date` in this app is a
// Jakarta local calendar day and every week key is a Jakarta Monday, so the
// process timezone is pinned BEFORE any Date is constructed — dates.js and the
// shared cores all read local date parts, and at UTC they would silently roll
// the week back by a day for most of the Sunday evening run.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

import functions from 'firebase-functions';
import admin from 'firebase-admin';

import { currentWeekKey, toLocalDateStr } from './shared/dates.js';
import { assembleAthleteContext } from './shared/athleteContextCore.js';
import { calculateMetrics } from './shared/load.js';
import { nearestUpcoming, daysUntil, tournamentModeFor } from './shared/tournaments.js';
import {
  buildSundayPlanPrompt, toPlanData, resolvedPriorityLabels, SUNDAY_PLAN_MAX_TOKENS,
} from './shared/planGenCore.js';
import {
  isOpen, planPriorityUpserts, planMergeDuplicates,
  planMetricResolutions, planEscalations, planLabelResolutions,
} from './shared/deferredPrioritiesCore.js';
import { buildMemoryUpdatePrompt, mergeMemoryUpdate, emptyMemory } from './shared/athleteMemoryCore.js';
import { buildDigestData, buildDigestNotesPrompt, digestPushPayload } from './shared/digestCore.js';
import { callAnthropicJSON } from './anthropic.js';
import {
  fetchAthleteRaw, fetchDeferredPriorities, applyPriorityOps, sendPushToRole,
} from './adminData.js';

// ─── WEEKLY REVIEW ORCHESTRATOR ──────────────────────────────────────────────
// Sunday 18:00 Asia/Jakarta (before the 19:30 check-in reminder). A fixed,
// strictly ordered pipeline — gather → hygiene → plan → memory → digest → push —
// with three one-shot LLM calls (Sonnet for the plan, Haiku for the memory
// update and the digest notes). Not a tool loop: the steps never vary, which is
// what makes cost, latency and testing bounded.
//
// Every decision is made by the pure cores in functions/shared/ (byte-identical
// copies of src/lib/, enforced by src/lib/sharedSync.test.js). This file only
// sequences them, checkpoints progress and owns idempotency.

const PLAN_MODEL = 'claude-sonnet-4-5';
const SMALL_MODEL = 'claude-haiku-4-5-20251001';
const SESSION_TIME = '10:00';

// A run left 'running' for longer than this is presumed dead (crash, timeout,
// container recycled) and may be taken over. Comfortably longer than the 540s
// function timeout, so a live run is never stolen from underneath itself.
const STALE_RUN_MS = 15 * 60 * 1000;

// The three family accounts. Mirrors ALLOWED_USERS in src/App.jsx and
// isFamilyMember() in firestore.rules — update all three together.
export const FAMILY_UIDS = [
  'jFXQ9SamJ6QnIpaam5dLedKcFkA2', // parent
  '2Hxj2FUJP4YQSvnsR2fkStu0uoC2', // parent
  'qmj32jhoYnQ9OJCQCXM1soIhHPx2', // athlete
];

const STEPS = ['hygiene', 'plan', 'memory', 'digest', 'push'];

const FieldValue = admin.firestore.FieldValue;

// Firestore Timestamp | Date | millis → millis (null when unreadable).
function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return null;
}

const openOnly = (docs) => (docs || []).filter(isOpen);

const labelOf = (op) => op?.doc?.priority ?? null;

// ── tournamentModeForRun ─────────────────────────────────────────────────────
// The tournament argument the plan prompt takes, derived exactly the way the UI
// derives it when nobody overrides the picker — src/screens/PlanScreen.jsx
// lines 16 + 27:
//   const AUTO_MODE = { normal: "none", pre: "pre", week_of: "week_of" };
//   const autoMode = AUTO_MODE[tournamentModeFor(nearest ? daysUntil(...) : null)];
// tournaments.js owns the thresholds (≤6 days → week_of, ≤13 → pre, else
// normal). The post_easy / post_hard modes exist only as a manual override in
// the UI, so an unattended run never selects them.
const AUTO_MODE = { normal: 'none', pre: 'pre', week_of: 'week_of' };

export function tournamentModeForRun(tournaments, now = new Date()) {
  const today = toLocalDateStr(now);
  const nearest = nearestUpcoming(tournaments, today);
  return AUTO_MODE[tournamentModeFor(nearest ? daysUntil(nearest.date, today) : null)] ?? 'none';
}

// ── claimRun ─────────────────────────────────────────────────────────────────
// Idempotency + resume, in one transaction on athletes/{id}/orchestratorRuns/{weekKey}.
//
//   status 'complete'                        → skip (this week is done)
//   status 'running', startedAt < 15 min ago → skip (another execution owns it;
//                                              gen-1 pubsub is at-least-once and
//                                              executions can overlap)
//   anything else (absent, errored, stale)   → claim it: status 'running',
//                                              startedAt = now, KEEPING the
//                                              existing steps map so a retry
//                                              resumes instead of redoing the
//                                              LLM calls it already paid for.
//
// force (the Run-now callable) takes the week over unconditionally and REPLACES
// the doc — no merge — so steps, pushClaimedAt/pushSentAt, completedAt and any
// recorded error are all cleared and the whole pipeline genuinely re-runs.
async function claimRun(db, claimRef, weekKey, force) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(claimRef);
    const data = snap.exists ? snap.data() : null;

    if (!force && data) {
      if (data.status === 'complete') return { skip: 'already-complete', steps: data.steps || {} };
      if (data.status === 'running') {
        const startedAt = toMillis(data.startedAt);
        // An unresolved startedAt (write not yet visible) counts as fresh.
        if (startedAt == null || Date.now() - startedAt < STALE_RUN_MS) {
          return { skip: 'run-in-progress', steps: data.steps || {} };
        }
      }
    }

    if (force) {
      tx.set(claimRef, {
        weekKey,
        status: 'running',
        startedAt: FieldValue.serverTimestamp(),
        forced: true,
        steps: {},
      });
      return { skip: null, steps: {} };
    }

    const steps = data?.steps || {};
    tx.set(claimRef, {
      weekKey,
      status: 'running',
      startedAt: FieldValue.serverTimestamp(),
      // A previous attempt's failure is history the moment we retry; leaving it
      // behind would make a completed doc still read as errored.
      error: FieldValue.delete(),
      failedAt: FieldValue.delete(),
    }, { merge: true });
    return { skip: null, steps };
  });
}

// ── runWeeklyReviewForAthlete ────────────────────────────────────────────────
// The pipeline for one athlete. Returns { athleteId, status, weekKey, steps }.
export async function runWeeklyReviewForAthlete(db, athleteId, { force = false, athleteData = null } = {}) {
  const weekKey = currentWeekKey();
  const athleteRef = db.collection('athletes').doc(athleteId);

  // a. Opt-in flag. Absent = disabled, mirroring remindersEnabled.
  let athlete = athleteData;
  if (!athlete) {
    const snap = await athleteRef.get();
    athlete = snap.exists ? snap.data() : null;
  }
  if (!athlete) return { athleteId, weekKey, status: 'no-athlete-doc', steps: {} };
  if (!athlete.weeklyReviewEnabled && !force) {
    return { athleteId, weekKey, status: 'weekly-review-disabled', steps: {} };
  }

  // b. Claim / resume / take over.
  const claimRef = athleteRef.collection('orchestratorRuns').doc(weekKey);
  const claim = await claimRun(db, claimRef, weekKey, force);
  if (claim.skip) return { athleteId, weekKey, status: claim.skip, steps: claim.steps };

  const steps = claim.steps || {};
  const done = (step) => !!steps[step]?.completedAt;
  const stepStatus = {};

  // c. Per-step checkpoints. Merge-set so a resumed run keeps earlier steps.
  const checkpoint = async (step, extra = {}) => {
    steps[step] = { ...extra, completedAt: new Date().toISOString() };
    await claimRef.set(
      { steps: { [step]: { ...extra, completedAt: FieldValue.serverTimestamp() } } },
      { merge: true }
    );
  };

  try {
    // ── d. GATHER ────────────────────────────────────────────────────────────
    const now = new Date();
    const raw = await fetchAthleteRaw(db, athleteId, now);
    let ctx = assembleAthleteContext(raw, now);
    const athleteName = raw.profile?.name ?? null;

    // ── e. HYGIENE (deterministic, idempotent) ───────────────────────────────
    let hygiene = steps.hygiene?.summary ?? null;
    if (done('hygiene')) {
      stepStatus.hygiene = 'skipped';
    } else {
      // 1. Fold duplicates written before matching became area-based.
      const mergeOps = planMergeDuplicates(openOnly(raw.deferredDocs));
      await applyPriorityOps(db, athleteId, mergeOps);
      const merged = mergeOps.filter((o) => o.kind === 'fold').length;

      // 2. Close priorities whose match-statistic target has been met. Each
      //    planner reads the docs the previous one just rewrote.
      const afterMerge = openOnly(await fetchDeferredPriorities(db, athleteId));
      const metricOps = planMetricResolutions(afterMerge, raw.matches);
      await applyPriorityOps(db, athleteId, metricOps);
      const resolvedByMetric = metricOps.map(labelOf).filter(Boolean);

      // 3. Promote anything deferred 4+ weeks.
      const afterResolve = openOnly(await fetchDeferredPriorities(db, athleteId));
      const escalationOps = planEscalations(afterResolve);
      await applyPriorityOps(db, athleteId, escalationOps);
      const escalated = escalationOps.map(labelOf).filter(Boolean);

      hygiene = { merged, resolvedByMetric, escalated };
      await checkpoint('hygiene', { summary: hygiene });
      stepStatus.hygiene = 'done';
    }

    // Hygiene rewrote the priority list — re-read it and rebuild the context so
    // the plan prompt never mentions a priority that was just resolved.
    raw.deferredDocs = await fetchDeferredPriorities(db, athleteId);
    ctx = assembleAthleteContext(raw, now);

    // ── f. PLAN (Sonnet) ─────────────────────────────────────────────────────
    let planData = null;
    if (done('plan')) {
      const planSnap = await athleteRef.collection('plans').doc('current').get();
      planData = planSnap.exists ? planSnap.data() : null;
      stepStatus.plan = 'skipped';
    } else {
      const tournament = tournamentModeForRun(raw.tournaments, now);
      // Same metrics object generateSundayPlan computes (planGen.js line 17) and
      // hands to BOTH the prompt and toPlanData — PlanScreen renders plan.metrics.
      const metrics = calculateMetrics(raw.weekLogs, raw.wellbeing);

      const { system, prompt, maxTokens } = buildSundayPlanPrompt({
        profile: raw.profile,
        weekLogs: raw.weekLogs,
        sessionHistory: raw.sessions,
        wellbeing: raw.wellbeing,
        tournament,
        sessionTime: SESSION_TIME,
        ctx,
        now,
        metrics,
      });

      const parsed = await callAnthropicJSON({
        model: PLAN_MODEL,
        system,
        userContent: prompt,
        maxTokens: maxTokens ?? SUNDAY_PLAN_MAX_TOKENS,
      });

      planData = {
        ...toPlanData(parsed, ctx, new Date().toISOString(), metrics),
        generatedBy: 'weeklyReview',
      };
      await athleteRef.collection('plans').doc('current').set(planData);

      // Upsert the priorities this plan deferred. `thisWeek` is currentWeekKey()
      // — the same value saveDeferredPriorities passes (deferredPriorities.js
      // line 85) — and it is what makes a re-run safe: lastCountedWeek stops
      // weeksDeferredCount being incremented twice in one week.
      const openBeforeUpserts = openOnly(await fetchDeferredPriorities(db, athleteId));
      await applyPriorityOps(
        db, athleteId,
        planPriorityUpserts(openBeforeUpserts, parsed.deferredPriorities || [], weekKey)
      );

      // Resolve the priorities today's exercises actually address. Matched
      // against the ctx snapshot the prompt was built from, exactly as
      // generateSundayPlan does (planGen.js lines 37-41).
      const labels = resolvedPriorityLabels(parsed.exercises, ctx.deferredPriorities);
      for (const label of labels) {
        const open = openOnly(await fetchDeferredPriorities(db, athleteId));
        await applyPriorityOps(db, athleteId, planLabelResolutions(open, label));
      }

      await checkpoint('plan', {
        sessionType: planData.sessionType ?? null,
        exerciseCount: (planData.plan || []).length,
        resolvedByPlan: labels.length,
      });
      stepStatus.plan = 'done';
    }

    // The plan step rewrote priorities again — refresh once more so the digest
    // and the memory evidence count what is actually open now.
    raw.deferredDocs = await fetchDeferredPriorities(db, athleteId);
    ctx = assembleAthleteContext(raw, now);

    const hygieneResults = hygiene
      ? { merged: hygiene.merged, resolved: hygiene.resolvedByMetric, escalated: hygiene.escalated }
      : null;

    // The deterministic digest — pure, no LLM. Built once and used twice: as the
    // memory step's weeklyReview evidence (athleteMemoryCore documents `week` as
    // exactly this object) and as the body of the digest document.
    const digestData = buildDigestData({
      ctx,
      planData,
      hygieneResults,
      weekKey,
      now,
      matches: raw.matches,
      priorities: raw.deferredDocs,
      athleteName,
      generatedBy: force ? 'manual' : 'weeklyReview',
    });

    // ── g. MEMORY (Haiku) — NON-FATAL ────────────────────────────────────────
    // Same contract as athleteMemory.js: a memory failure must never cost the
    // digest or the push. The step is still checkpointed so a retry doesn't
    // burn another LLM call on it.
    if (done('memory')) {
      stepStatus.memory = 'skipped';
    } else {
      try {
        const current = { ...emptyMemory(), ...(raw.memoryDoc || {}) };
        const { system, userContent, maxTokens } = buildMemoryUpdatePrompt(current, {
          kind: 'weeklyReview',
          week: digestData,
        });
        const parsed = await callAnthropicJSON({
          model: SMALL_MODEL, system, userContent, maxTokens,
        });
        const merged = mergeMemoryUpdate(current, parsed, new Date().toISOString());
        await athleteRef.collection('memory').doc('current').set(merged);
        await checkpoint('memory', { ok: true });
        stepStatus.memory = 'done';
      } catch (err) {
        console.error(`[weeklyReview] ${athleteId} memory update failed:`, err.message);
        await checkpoint('memory', { ok: false, error: err.message });
        stepStatus.memory = 'failed';
      }
    }

    // ── h. DIGEST (Haiku notes, degrading to stats-only) ─────────────────────
    if (done('digest')) {
      stepStatus.digest = 'skipped';
    } else {
      let digest;
      try {
        const { system, prompt, maxTokens } = buildDigestNotesPrompt(digestData, athleteName);
        const notes = await callAnthropicJSON({
          model: SMALL_MODEL, system, userContent: prompt, maxTokens,
        });
        digest = {
          ...digestData,
          parentNote: notes?.parentNote ?? null,
          athleteNote: notes?.athleteNote ?? null,
          notesError: null,
        };
      } catch (err) {
        console.error(`[weeklyReview] ${athleteId} digest notes failed:`, err.message);
        digest = {
          ...digestData,
          parentNote: null,
          athleteNote: null,
          notesError: err.message,
        };
      }
      // Fixed doc id = the week key, so writing it twice is a no-op.
      await athleteRef.collection('digests').doc(weekKey).set(digest);
      await checkpoint('digest', { notesError: digest.notesError ?? null });
      stepStatus.digest = digest.notesError ? 'done-without-notes' : 'done';
    }

    // ── i. PUSH (the only non-idempotent step) ───────────────────────────────
    if (done('push')) {
      stepStatus.push = 'skipped';
    } else {
      // Claim before sending, exactly like sendCheckinReminder: a claimed-but-
      // never-sent run is recoverable (clear pushClaimedAt), a double-send is not.
      const claimedPush = await db.runTransaction(async (tx) => {
        const snap = await tx.get(claimRef);
        if (snap.exists && snap.data().pushClaimedAt) return false;
        tx.set(claimRef, { pushClaimedAt: FieldValue.serverTimestamp() }, { merge: true });
        return true;
      });

      let result = 'already-claimed';
      if (claimedPush) {
        const digestSnap = await athleteRef.collection('digests').doc(weekKey).get();
        const digest = digestSnap.exists ? digestSnap.data() : null;
        if (!digest) {
          result = 'no-digest';
        } else {
          const sendResult = await sendPushToRole(
            db, athleteRef, 'parent', digestPushPayload(digest)
          );
          result = sendResult.status;
          if (sendResult.status === 'sent') {
            await claimRef.set({ pushSentAt: FieldValue.serverTimestamp() }, { merge: true });
          }
        }
      }
      await checkpoint('push', { result });
      stepStatus.push = result;
    }

    // ── j. Done ──────────────────────────────────────────────────────────────
    await claimRef.set(
      { status: 'complete', completedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { athleteId, weekKey, status: 'complete', steps: stepStatus };
  } catch (err) {
    // Record the failure and clear 'running' so the next attempt (gen-1 retry or
    // a manual Run-now) can claim the week immediately and resume from the last
    // checkpoint rather than waiting out the 15-minute staleness window.
    await claimRef.set({
      status: 'error',
      error: err.message,
      failedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch((e) => console.error('[weeklyReview] claim error write:', e.message));

    for (const step of STEPS) if (!stepStatus[step]) stepStatus[step] = 'not-reached';
    err.summary = { athleteId, weekKey, status: 'error', steps: stepStatus };
    throw err;
  }
}

// ── runForAllAthletes ────────────────────────────────────────────────────────
async function runForAllAthletes(db, { force }) {
  const athletesSnap = await db.collection('athletes').get();
  const results = [];
  const failures = [];

  for (const athleteDoc of athletesSnap.docs) {
    try {
      results.push(
        await runWeeklyReviewForAthlete(db, athleteDoc.id, { force, athleteData: athleteDoc.data() })
      );
    } catch (err) {
      console.error(`[weeklyReview] athlete ${athleteDoc.id} failed:`, err.message);
      results.push(err.summary ?? { athleteId: athleteDoc.id, status: 'error', steps: {} });
      failures.push(`${athleteDoc.id}: ${err.message}`);
    }
  }

  return { results, failures };
}

// ─── SCHEDULED: Sunday 18:00 Asia/Jakarta ────────────────────────────────────
// Ninety minutes before the 19:30 check-in reminder, so the digest push and the
// nudge never land together. Retries twice with a 5-minute floor: the per-step
// checkpoints make a retry cheap (it resumes at the failed step), which is why
// this rethrows instead of swallowing.
export const weeklyReview = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('0 18 * * 0')
  .timeZone('Asia/Jakarta')
  .retryConfig({ retryCount: 2, minBackoffDuration: '300s' })
  .onRun(async () => {
    const db = admin.firestore();
    const { results, failures } = await runForAllAthletes(db, { force: false });

    console.log('[weeklyReview] summary:', JSON.stringify(results));

    if (failures.length > 0) {
      // Throwing schedules the gen-1 retry; every athlete was still attempted.
      throw new Error(`weeklyReview failed for ${failures.length} athlete(s): ${failures.join(' | ')}`);
    }
    return null;
  });

// ─── CALLABLE: Run now ───────────────────────────────────────────────────────
// Manual/testing trigger for the parent's "Run now" button. force: true bypasses
// weeklyReviewEnabled AND takes over this week's claim, so a run can be repeated
// while the feature is still being tuned. A forced run still sends the digest
// push — the parent pressing the button is expecting it.
//
// Returns the single athlete's summary { athleteId, status, weekKey, steps } when
// there is exactly one result (the normal case: one athlete), otherwise
// { weekKey, results }.
export const runWeeklyReviewNow = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    // The Firestore emulator has no real auth; without this bypass the
    // integration test in functions/test-orchestrator.md could not call this at
    // all. FUNCTIONS_EMULATOR is set by the emulator itself and is never true
    // in a deployed function.
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    const uid = context.auth?.uid;
    if (!isEmulator && !FAMILY_UIDS.includes(uid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only the family accounts may run the weekly review.'
      );
    }

    const db = admin.firestore();
    const athleteId = data?.athleteId;

    let results;
    if (athleteId) {
      try {
        results = [await runWeeklyReviewForAthlete(db, athleteId, { force: true })];
      } catch (err) {
        console.error(`[runWeeklyReviewNow] athlete ${athleteId} failed:`, err.message);
        throw new functions.https.HttpsError('internal', err.message, err.summary ?? null);
      }
    } else {
      const all = await runForAllAthletes(db, { force: true });
      if (all.failures.length > 0) {
        throw new functions.https.HttpsError('internal', all.failures.join(' | '), all.results);
      }
      results = all.results;
    }

    console.log('[runWeeklyReviewNow] summary:', JSON.stringify(results));
    return results.length === 1 ? results[0] : { weekKey: currentWeekKey(), results };
  });
