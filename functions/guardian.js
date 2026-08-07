// Cloud Functions run with TZ unset (UTC). This job fires at 06:00
// Asia/Jakarta, which is 23:00 UTC the PREVIOUS calendar day — with the process
// timezone left at UTC every run would key its claim doc, its date windows and
// `assessedAt` to yesterday, and the cooldown arithmetic (whole days between two
// YYYY-MM-DD strings) would be off by one for the whole feature. Pinned as the
// first statement so dates.js and guardianCore, which read LOCAL date parts, see
// Jakarta from the first Date they construct. (ESM hoists the imports above this
// line; that is safe here because no imported module constructs a Date at
// module-evaluation time — the same assumption weeklyReview.js already makes.)
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

import functions from 'firebase-functions';
import admin from 'firebase-admin';

import { toLocalDateStr } from './shared/dates.js';
import {
  assessGuardian,
  cooldownDecision,
  buildGuardianNotesPrompt,
  buildGuardianAlert,
  guardianPushPayload,
  GUARDIAN_ENGINE_VERSION,
  GUARDIAN_THRESHOLDS,
} from './shared/guardianCore.js';
import { callAnthropicJSON } from './anthropic.js';
import { sendPushToRole } from './adminData.js';
// FAMILY_UIDS, the 15-minute staleness window and the Timestamp reader are the
// weekly review's, already exported and already the codebase's single copy of
// each. The claim TRANSACTION is not shared — see claimGuardianRun.
import { FAMILY_UIDS, STALE_RUN_MS, toMillis } from './weeklyReview.js';

// ─── LOAD & HEALTH GUARDIAN — DAILY JOB ──────────────────────────────────────
// 06:00 Asia/Jakarta, every day. Training is in the morning, so a load warning
// is only actionable *before* the session; the slot is also clear of the 19:30
// check-in reminder and the Sunday 09:00 weekly review.
//
// Every decision belongs to the pure core (functions/shared/guardianCore.js,
// byte-identical to src/lib/, enforced by src/lib/sharedSync.test.js). This file
// only fetches, sequences, writes and owns idempotency.
//
// ── COST ─────────────────────────────────────────────────────────────────────
// A QUIET DAY — which is almost every day, by design — costs 4 Firestore data
// queries (weekLogs, wellbeing, injuries, cooldowns; issued in parallel), the
// claim-doc read inside the transaction, one open-alert sweep, two small claim
// writes, and ZERO TOKENS. The LLM sits below both early returns and nothing
// else in this file can move it above them.
//
// A FIRING DAY adds one Haiku call (~600 output tokens), about three writes (the
// alert, the cooldown entry, the push bookkeeping) and one push. The combination
// gate (two families, weight ≥ 4) and the 10-day cooldown are sized so that is
// roughly 1–3 days a month. If the observed rate climbs above that, the
// thresholds in GUARDIAN_THRESHOLDS are wrong — not the schedule. Running this
// less often would only make the Guardian slower to notice, not cheaper per
// alert.

const GUARDIAN_MODEL = 'claude-haiku-4-5-20251001';

// computeLoad buckets four Monday–Sunday weeks, so the oldest bucket can start
// 27 days back; +7 days of slack covers the Sunday-vs-Monday edge and the
// 7-day monotony window with room to spare. Anything older cannot influence a
// single factor, so reading it would be waste.
const WEEK_LOGS_WINDOW_DAYS = 35;

// The core's own window, not a second opinion: dailyWellbeing re-filters to
// GUARDIAN_THRESHOLDS.wellbeingWindowDays, so querying wider here would read
// documents the engine then throws away, and querying narrower would silently
// change the engine's answer between the server and a client-side replay.
const WELLBEING_WINDOW_DAYS = GUARDIAN_THRESHOLDS.wellbeingWindowDays;

const FieldValue = admin.firestore.FieldValue;

const withIds = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const shiftDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// ── fetchGuardianRaw ─────────────────────────────────────────────────────────
// The raw bundle assessGuardian(raw, now) expects, plus the cooldown doc.
//
// Deliberately NOT fetchAthleteRaw: that reads ~11 collections sequentially,
// including an unbounded weekLogs, to build a context this engine never looks
// at (matches, plans, priorities, memory, technical assessments…). The Guardian
// needs four reads and issues them in parallel.
//
//   1. athlete doc — NOT read here. The scheduled loop already holds it from
//      the athletes collection scan, and it carries `dob`, `measurements`,
//      `height`, `sittingHeight` and `weight`, which is the entire input to the
//      growth family. The whole growth story therefore costs zero extra reads.
//   2. weekLogs   where date >= today-35d  (single-field range, no index)
//   3. wellbeing  where date >= today-14d  (single-field range, no index)
//   4. injuries   whole collection — under 30 docs in a lifetime, and a date
//      filter would need `status` + `date` (a composite index) to save nothing.
//   5. guardianState/cooldowns — one document.
export async function fetchGuardianRaw(db, athleteId, now = new Date(), athleteData = null) {
  const athleteRef = db.collection('athletes').doc(athleteId);

  const logsCutoff = toLocalDateStr(shiftDays(now, -WEEK_LOGS_WINDOW_DAYS));
  const wellCutoff = toLocalDateStr(shiftDays(now, -WELLBEING_WINDOW_DAYS));

  const [logsSnap, wellSnap, injurySnap, cooldownSnap] = await Promise.all([
    athleteRef.collection('weekLogs').where('date', '>=', logsCutoff).get(),
    athleteRef.collection('wellbeing').where('date', '>=', wellCutoff).get(),
    athleteRef.collection('injuries').get(),
    athleteRef.collection('guardianState').doc('cooldowns').get(),
  ]);

  return {
    athlete: athleteData ?? null,
    weekLogs: withIds(logsSnap),
    wellbeing: withIds(wellSnap),
    injuries: withIds(injurySnap),
    cooldowns: cooldownSnap.exists ? cooldownSnap.data() : null,
  };
}

// ── claimGuardianRun ─────────────────────────────────────────────────────────
// Idempotency, in one transaction on athletes/{id}/guardianRuns/{YYYY-MM-DD}.
// Same semantics as weeklyReview.js's claimRun:
//
//   status 'complete'                        → skip (today is done)
//   status 'running', startedAt < 15 min ago → skip (another execution owns it;
//                                              gen-1 pubsub is at-least-once)
//   anything else (absent, errored, stale)   → claim it
//
// force (the Run-now callable) takes the day over unconditionally and REPLACES
// the doc — no merge — clearing completedAt, pushClaimedAt/pushSentAt and any
// recorded error, so the whole day genuinely re-runs including the push.
//
// NOT weeklyReview's function reused: that one carries a `steps` checkpoint map
// forward so a resumed run does not re-pay for LLM calls it already made. The
// Guardian makes exactly one LLM call and has nothing to resume, so it has no
// steps map — and generalising the weekly review's transaction with a
// steps/no-steps switch plus a configurable key field would make one function
// serve two shapes with two flags. The 15-minute window and toMillis, which are
// genuinely identical, ARE imported rather than copied.
async function claimGuardianRun(db, claimRef, date, force) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(claimRef);
    const data = snap.exists ? snap.data() : null;

    if (!force && data) {
      if (data.status === 'complete') return 'already-complete';
      if (data.status === 'running') {
        const startedAt = toMillis(data.startedAt);
        // An unresolved startedAt (write not yet visible) counts as fresh.
        if (startedAt == null || Date.now() - startedAt < STALE_RUN_MS) return 'run-in-progress';
      }
    }

    const base = {
      date,
      status: 'running',
      startedAt: FieldValue.serverTimestamp(),
      engineVersion: GUARDIAN_ENGINE_VERSION,
    };

    if (force) {
      tx.set(claimRef, { ...base, forced: true });
      return null;
    }

    tx.set(claimRef, {
      ...base,
      // A previous attempt's failure is history the moment we retry.
      error: FieldValue.delete(),
      failedAt: FieldValue.delete(),
    }, { merge: true });
    return null;
  });
}

// ── assessmentRecord ─────────────────────────────────────────────────────────
// What gets stored on the claim doc so a day can be understood without opening
// the logs — including, and especially, a day that stayed silent. This is what
// makes the plan's enablement procedure work: force several runs, read why the
// engine did or did not fire, and only then flip guardianEnabled. `metrics` is
// carried in full because it is what the thresholds get tuned against.
const assessmentRecord = (a) => ({
  fires: a.fires,
  reason: a.reason,
  severity: a.severity ?? null,
  totalWeight: a.totalWeight ?? 0,
  families: [...(a.families || [])],
  storyKey: a.storyKey ?? null,
  factorIds: (a.factors || []).map((f) => f.id),
  metrics: a.metrics ?? {},
});

// ── resolveOpenAlerts ────────────────────────────────────────────────────────
// Auto-resolve: the card clears itself. Every un-resolved alert other than the
// one just written gets `resolvedAt`, both when today's assessment is quiet
// (the story is over) and when a new alert supersedes an older one (there is
// only ever one live Guardian card). Equality on a single field — Firestore
// indexes that automatically, so no composite index is involved.
async function resolveOpenAlerts(athleteRef, reason, exceptId = null) {
  const snap = await athleteRef.collection('guardianAlerts').where('resolvedAt', '==', null).get();
  const stale = snap.docs.filter((d) => d.id !== exceptId);
  await Promise.all(stale.map((d) => d.ref.set({
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedReason: reason,
  }, { merge: true })));
  return stale.map((d) => d.id);
}

// ── runGuardianForAthlete ────────────────────────────────────────────────────
// One athlete, one day. Returns a summary the callable hands straight to the UI
// toast: { athleteId, date, status, … }.
export async function runGuardianForAthlete(db, athleteId, { force = false, athleteData = null } = {}) {
  const now = new Date();
  const date = toLocalDateStr(now);
  const athleteRef = db.collection('athletes').doc(athleteId);

  // a. Opt-in flag. Absent = disabled, mirroring weeklyReviewEnabled and
  //    remindersEnabled. Enabling the Guardian is a UI action, not a deploy.
  let athlete = athleteData;
  if (!athlete) {
    const snap = await athleteRef.get();
    athlete = snap.exists ? snap.data() : null;
  }
  if (!athlete) return { athleteId, date, status: 'no-athlete-doc' };
  if (!athlete.guardianEnabled && !force) {
    return { athleteId, date, status: 'guardian-disabled' };
  }

  // b. Claim today.
  const claimRef = athleteRef.collection('guardianRuns').doc(date);
  const skip = await claimGuardianRun(db, claimRef, date, force);
  if (skip) return { athleteId, date, status: skip };

  const athleteName = athlete.name ?? null;
  const complete = (fields) => claimRef.set({
    status: 'complete',
    completedAt: FieldValue.serverTimestamp(),
    ...fields,
  }, { merge: true });

  try {
    // ── c. GATHER (4 parallel queries) ───────────────────────────────────────
    const raw = await fetchGuardianRaw(db, athleteId, now, athlete);

    // ── d. ASSESS (pure, deterministic, free) ────────────────────────────────
    const assessment = assessGuardian(raw, now);

    // ── e. EARLY RETURN #1: the gate said no ─────────────────────────────────
    // THE LLM CALL LIVES BELOW THIS POINT AND MUST STAY THERE. The entire cost
    // argument for running this every morning is that a quiet day — which is
    // most days, deliberately — spends zero tokens. Hoisting the notes call
    // above these two returns would turn a 30-day month into 30 Haiku calls
    // whose output nobody would ever read.
    if (!assessment.fires) {
      const resolved = await resolveOpenAlerts(athleteRef, 'cleared');
      await complete({ outcome: 'quiet', assessment: assessmentRecord(assessment), resolvedAlerts: resolved });
      return {
        athleteId, date, status: 'quiet',
        reason: assessment.reason,
        resolvedAlerts: resolved.length,
      };
    }

    // ── f. EARLY RETURN #2: the story is inside its cooldown ─────────────────
    // Still no tokens spent. A story the parent read eight days ago is not news
    // today, and re-telling it is how a warning becomes a nag.
    const decision = cooldownDecision(raw.cooldowns, assessment, now);
    if (decision.suppressed) {
      await complete({
        outcome: 'suppressed',
        suppressed: decision.reason,
        assessment: assessmentRecord(assessment),
      });
      return {
        athleteId, date, status: 'suppressed',
        suppressed: decision.reason,
        severity: assessment.severity,
        storyKey: assessment.storyKey,
      };
    }

    // ── g. NOTES (Haiku) — NON-FATAL ─────────────────────────────────────────
    // The alert is complete and useful without it: the headline, every factor's
    // evidence and actions.athlete are all deterministic. A failed notes call
    // costs the prose, never the alert or the push.
    let notes = null;
    let notesError = null;
    try {
      const { system, prompt, maxTokens } = buildGuardianNotesPrompt(assessment, athleteName);
      const parsed = await callAnthropicJSON({
        model: GUARDIAN_MODEL, system, userContent: prompt, maxTokens,
      });
      notes = {
        parentNote: parsed?.parentNote ?? null,
        athleteNote: parsed?.athleteNote ?? null,
      };
    } catch (err) {
      console.error(`[guardian] ${athleteId} notes failed:`, err.message);
      notesError = err.message;
      notes = { error: err.message };
    }

    // ── h. ALERT ─────────────────────────────────────────────────────────────
    // alertId is `{date}_{storyKeySlug}`, so a same-day re-run overwrites the
    // same document instead of minting a duplicate card.
    const alert = buildGuardianAlert({
      assessment,
      notes,
      now,
      generatedBy: force ? 'manual' : 'guardian',
      athleteName,
    });
    const alertRef = athleteRef.collection('guardianAlerts').doc(alert.alertId);
    await alertRef.set(alert);

    // Any older alert is now history — there is one live Guardian card.
    const resolved = await resolveOpenAlerts(athleteRef, 'superseded', alert.alertId);

    // ── i. COOLDOWN ──────────────────────────────────────────────────────────
    // Merged, never replaced: other storyKeys keep their own windows. The key is
    // `g{version}:{families}` — letters, digits, ':' and '+', no dots — so it is
    // safe as a Firestore map key.
    await athleteRef.collection('guardianState').doc('cooldowns').set({
      stories: { [assessment.storyKey]: decision.nextEntry },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // ── j. PUSH (the only non-idempotent step) ───────────────────────────────
    // Parents only, and only above `watch` — a 6am buzz IS risk framing however
    // it is worded, and sendCheckinReminder already owns the athlete's one
    // gentle push. Her note reaches her in-app, on Home, before training.
    let pushResult = 'not-eligible';
    if (alert.push.eligible) {
      // Claim before sending, exactly like sendCheckinReminder: a
      // claimed-but-never-sent day is recoverable (clear pushClaimedAt), a
      // double-send is not.
      const claimedPush = await db.runTransaction(async (tx) => {
        const snap = await tx.get(claimRef);
        if (snap.exists && snap.data().pushClaimedAt) return false;
        tx.set(claimRef, { pushClaimedAt: FieldValue.serverTimestamp() }, { merge: true });
        return true;
      });

      if (!claimedPush) {
        pushResult = 'already-claimed';
      } else {
        const sendResult = await sendPushToRole(
          db, athleteRef, 'parent', guardianPushPayload(alert)
        );
        pushResult = sendResult.status;
        if (sendResult.status === 'sent') {
          await claimRef.set({ pushSentAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      }
      // Recorded on the alert itself so the card and the audit trail agree
      // about whether the phone ever buzzed.
      await alertRef.set({
        push: {
          result: pushResult,
          sentAt: pushResult === 'sent' ? FieldValue.serverTimestamp() : null,
        },
      }, { merge: true });
    }

    // ── k. Done ──────────────────────────────────────────────────────────────
    await complete({
      outcome: 'alerted',
      alertId: alert.alertId,
      cooldownReason: decision.reason,
      notesError,
      push: pushResult,
      resolvedAlerts: resolved,
      assessment: assessmentRecord(assessment),
    });

    return {
      athleteId, date, status: 'alerted',
      alertId: alert.alertId,
      severity: assessment.severity,
      storyKey: assessment.storyKey,
      families: assessment.families,
      totalWeight: assessment.totalWeight,
      cooldownReason: decision.reason,
      notesError,
      push: pushResult,
    };
  } catch (err) {
    // Record the failure and clear 'running' so the next attempt — the single
    // gen-1 retry, tomorrow's run, or a manual Run-now — can claim the day
    // immediately instead of waiting out the 15-minute staleness window.
    await claimRef.set({
      status: 'error',
      error: err.message,
      failedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch((e) => console.error('[guardian] claim error write:', e.message));

    err.summary = { athleteId, date, status: 'error', error: err.message };
    throw err;
  }
}

// ── runGuardianForAllAthletes ────────────────────────────────────────────────
// Sequential, passing each athlete's document data straight through so the job
// never re-reads what the collection scan already returned.
async function runGuardianForAllAthletes(db, { force }) {
  const athletesSnap = await db.collection('athletes').get();
  const results = [];
  const failures = [];

  for (const athleteDoc of athletesSnap.docs) {
    try {
      results.push(
        await runGuardianForAthlete(db, athleteDoc.id, { force, athleteData: athleteDoc.data() })
      );
    } catch (err) {
      console.error(`[guardian] athlete ${athleteDoc.id} failed:`, err.message);
      results.push(err.summary ?? { athleteId: athleteDoc.id, status: 'error' });
      failures.push(`${athleteDoc.id}: ${err.message}`);
    }
  }

  return { results, failures };
}

// ─── SCHEDULED: 06:00 Asia/Jakarta, daily ────────────────────────────────────
// Before training, so a load warning is still actionable, and clear of both the
// 19:30 check-in reminder and the Sunday 09:00 review.
//
// ONE retry, not the weekly review's two: this job has no checkpoints to resume
// from and a day it misses entirely is picked up by tomorrow's run against the
// same (slightly older) signals. A story worth telling on Tuesday is still worth
// telling on Wednesday; burning a second retry on a transient failure would only
// risk a duplicate alert for no extra coverage.
export const guardian = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub.schedule('0 6 * * *')
  .timeZone('Asia/Jakarta')
  .retryConfig({ retryCount: 1, minBackoffDuration: '300s' })
  .onRun(async () => {
    const db = admin.firestore();
    const { results, failures } = await runGuardianForAllAthletes(db, { force: false });

    console.log('[guardian] summary:', JSON.stringify(results));

    if (failures.length > 0) {
      // Throwing schedules the gen-1 retry; every athlete was still attempted.
      throw new Error(`guardian failed for ${failures.length} athlete(s): ${failures.join(' | ')}`);
    }
    return null;
  });

// ─── CALLABLE: Check now ─────────────────────────────────────────────────────
// The "Check now" button. ALWAYS force: true — it bypasses guardianEnabled and
// takes today's claim over, which is exactly what makes the plan's enablement
// procedure possible (run it, read the assessment on the claim doc, tune, and
// only then turn the schedule on for real).
//
// A forced run still sends the push when the alert is eligible: the parent
// pressing the button is expecting the full behaviour, not a dry run.
//
// Returns the single athlete's summary when there is exactly one result (the
// normal case), otherwise { date, results }.
export const runGuardianNow = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onCall(async (data, context) => {
    // The Firestore emulator has no real auth; without this bypass the
    // integration runbook in functions/test-guardian.md could not call this at
    // all. FUNCTIONS_EMULATOR is set by the emulator and is never true in a
    // deployed function.
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    const uid = context.auth?.uid;
    if (!isEmulator && !FAMILY_UIDS.includes(uid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only the family accounts may run the guardian.'
      );
    }

    const db = admin.firestore();
    const athleteId = data?.athleteId;

    let results;
    if (athleteId) {
      try {
        results = [await runGuardianForAthlete(db, athleteId, { force: true })];
      } catch (err) {
        console.error(`[runGuardianNow] athlete ${athleteId} failed:`, err.message);
        throw new functions.https.HttpsError('internal', err.message, err.summary ?? null);
      }
    } else {
      const all = await runGuardianForAllAthletes(db, { force: true });
      if (all.failures.length > 0) {
        throw new functions.https.HttpsError('internal', all.failures.join(' | '), all.results);
      }
      results = all.results;
    }

    console.log('[runGuardianNow] summary:', JSON.stringify(results));
    return results.length === 1 ? results[0] : { date: toLocalDateStr(new Date()), results };
  });
