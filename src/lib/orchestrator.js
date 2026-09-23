import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";

// ─── ORCHESTRATOR CALLABLES — CLIENT HELPERS ─────────────────────────────────
// Thin wrappers over the scheduled pipelines' "run it now" callables:
// `runWeeklyReviewNow` (functions/weeklyReview.js) and `runGuardianNow`
// (functions/guardian.js) — both gen-1, default region us-central1 (no
// .region() anywhere in functions/index.js, so none is pinned here either).
//
// Both are allowlisted to the three family UIDs and return the per-athlete
// summary the function itself built.
//
// Impure by design: this module talks to Firebase, so it must never be imported
// by a pure core (the import-graph guard in athleteMemoryCore.test.js enforces
// that from the other direction).

// A callable failure reaches the UI as a code plus whatever the function threw.
// The codes below are the ones these pipelines can realistically produce; the
// tone matches aiErrors.js — specific, actionable, never a generic shrug.
// Worded without naming a pipeline because both callables share this table and
// every call site already prefixes its own context ("Couldn't run the review —").
const CODE_MESSAGE = {
  "functions/permission-denied": "Only the family accounts can run this.",
  "functions/unauthenticated":   "You're signed out — sign in again and retry.",
  "functions/not-found":         "That function isn't deployed yet.",
  "functions/unavailable":       "Couldn't reach the server — check your connection.",
  "functions/deadline-exceeded": "It took too long and was cut off — try again.",
  "functions/resource-exhausted": "The server hit a rate limit. Wait a minute and try again.",
  "functions/cancelled":         "It was cancelled before it finished.",
};

const MAX_LEN = 140;

// Same reasoning as aiErrors.js: an unrecognised message is more useful
// verbatim than replaced with "try again". `internal` carries the pipeline's
// own error text, which is the whole point of surfacing it.
export function friendlyCallableError(err) {
  const mapped = CODE_MESSAGE[err?.code];
  if (mapped) return mapped;

  const raw = typeof err === "string" ? err : err?.message ? String(err.message) : "";
  if (!raw.trim()) return "Something went wrong — no error detail was reported.";
  const t = raw.trim();
  return t.length > MAX_LEN ? `${t.slice(0, MAX_LEN - 1)}…` : t;
}

// ─── WEEKLY REVIEW RUN-NOW — FAIL CLOSED ─────────────────────────────────────
// Success is a POSITIVE claim: the function's own summary says the pipeline
// completed. It used to be inferred from the promise merely resolving —
// `await runWeeklyReviewNow(); showToast("complete")` — so any resolved
// payload that was not a completed run (a `no-athlete-doc` summary, an empty
// all-athletes result, anything a future server change returns) was announced
// to the family as a finished review. Now only isCompletedWeeklyReview(data)
// is success; a rejection, an explicit failure payload and an unrecognised
// payload are all failures, and all three say so.
//
// The response schema is functions/weeklyReview.js runWeeklyReviewNow:
//   one athlete  → { athleteId, weekKey, status, steps }
//   several      → { weekKey, results: [{ athleteId, weekKey, status, steps }] }
// and a failed run rejects with HttpsError('internal', message, summary), so
// the rejection's `details` carries the same { status: "error", steps }.
//
// A "complete" summary always carries all five STEPS keys — weeklyReview.js
// sets every one of hygiene/plan/memory/digest/push before returning, even
// when a step was only skipped or (memory only, explicitly non-fatal there)
// failed — so a real success is distinguishable from a bare
// `{ status: "complete" }` stub by requiring the full shape, not just the
// status string. Shape alone is not enough either: each step's value must
// also be one this backend can legitimately produce for a completed run
// (WEEKLY_REVIEW_VALID_STEPS below) — a structurally full but internally
// contradictory response, such as status:"complete" with steps.plan
// "not-reached" (a status:"error"-only value), still fails closed.
export const WEEKLY_REVIEW_COMPLETE_TOAST = "Weekly review complete 🗞️";

// The failure copy is deliberately generic: the pipeline's own error text is
// a Firestore/Anthropic internal ("Value for argument \"data\" is not a valid
// Firestore document…") that means nothing to a parent and does not belong on
// screen. It goes to the console instead.
//
// It is also deliberately silent about whether a plan exists. The plan
// document is written (plans/current .set()) several awaits before its step
// is checkpointed — priority upserts and label resolutions run in between —
// so a failure in that gap leaves `steps.plan` at "not-reached" even though a
// new plan really was saved. Only `steps.plan === "done"` is positive proof
// the plan was written; every other value, "not-reached" included, is
// genuinely unknown rather than evidence of absence, so the wording must
// never claim "no plan was created" from it.
export const WEEKLY_REVIEW_FAILED = "Weekly review failed. Check the Plan tab before retrying.";
export const WEEKLY_REVIEW_FAILED_AFTER_PLAN = "Weekly review failed after saving the new plan. Check the Plan tab.";
// No server summary at all: the connection dropped (the SDK reports a fetch
// that never got a response as a bare `internal`) or the function died
// without answering. Either way the run's outcome is UNKNOWN and it may well
// still be going — on 2026-09-23 this message's predecessor, "failed",
// appeared while the server was still mid-run. Pressing again then is what
// must not happen, so the copy says to wait.
export const WEEKLY_REVIEW_UNCONFIRMED = "Lost contact with the weekly review — it may still be running. Check the Plan tab in a few minutes before retrying.";
// The server refused to start a second pipeline beside a live one.
export const WEEKLY_REVIEW_IN_PROGRESS = "A weekly review is already running. Check the Plan tab in a few minutes.";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// noAnswer(error, summary) → true when the callable rejected without the
// server ever describing the run. Both pipelines attach their summary to every
// failure they report, so its absence means the request itself was lost: the
// SDK turns a fetch that never got a response — and a 5xx with no body — into
// a bare `functions/internal` whose message is just "internal". A handler that
// crashes with something other than an HttpsError reaches the client the same
// way but UPPERCASE — firebase-functions answers `HttpsError("internal",
// "INTERNAL")` — and is just as unknown. The SDK's other `internal`
// rejections carry their own text (e.g. a 200 missing its data field: the
// server DID answer, malformed) and stay ordinary failures.
function noAnswer(error, summary) {
  if (!error || summary) return false;
  if (error.code && error.code !== "functions/internal") return false;
  const msg = String(error.message ?? "").trim().toLowerCase();
  return msg === "" || msg === "internal";
}

// The five step keys runWeeklyReviewForAthlete always populates on a run that
// reaches "complete" (functions/weeklyReview.js STEPS).
const WEEKLY_REVIEW_STEP_KEYS = ["hygiene", "plan", "memory", "digest", "push"];

// The legitimate per-step outcomes when the outer result says "complete" —
// read off functions/weeklyReview.js runWeeklyReviewForAthlete, not guessed.
// On the success path every step is reached and stepStatus[step] is set
// exactly once, to one of a small fixed set of strings per step:
//   hygiene → 'done' (ran) | 'skipped' (already checkpointed)
//   plan    → 'done' | 'skipped' — no try/catch wraps this step, so any
//             failure throws out to the pipeline's own catch instead of
//             ever recording a per-step failure here.
//   memory  → 'done' | 'skipped' | 'failed' — the ONE step with its own
//             try/catch; a failed memory update is logged and checkpointed
//             but explicitly does not fail the run (weeklyReview.js: "NON-
//             FATAL. A memory failure must never cost the digest or push").
//   digest  → 'done' | 'done-without-notes' (LLM notes failed, stats-only
//             digest still saved) | 'skipped'
//   push    → 'skipped' | 'already-claimed' | 'no-digest' | the two
//             sendPushToRole outcomes when nothing aborted it, 'no-tokens'
//             or 'sent' (functions/adminData.js — no beforeSend hook is
//             passed here, so its other abort reasons never appear)
// 'not-reached' is NOT in any of these sets on purpose: it is written only
// by the pipeline's outer catch, backfilling whichever steps stepStatus
// never touched — and that catch always also sets the outer status to
// 'error', never 'complete'. Same for 'failed' outside of memory: no other
// step's block ever assigns it. A payload claiming status:"complete" with
// e.g. steps.plan === "not-reached" or "failed" is therefore not a stricter
// read of the contract, it is impossible under it — and so is any string
// this list doesn't name, unknown values included.
const WEEKLY_REVIEW_VALID_STEPS = {
  hygiene: new Set(["done", "skipped"]),
  plan: new Set(["done", "skipped"]),
  memory: new Set(["done", "skipped", "failed"]),
  digest: new Set(["done", "done-without-notes", "skipped"]),
  push: new Set(["skipped", "already-claimed", "no-digest", "no-tokens", "sent"]),
};

// A genuine per-athlete completion, not just a status string: real ids, and a
// steps map where every step both is present and holds one of its own
// legitimate completed-run values (WEEKLY_REVIEW_VALID_STEPS) — a step that
// is missing, non-string, or holds a value impossible for a completed run
// (e.g. plan: "not-reached") fails closed rather than passing on shape alone.
function isCompleteAthleteResult(r) {
  return isObject(r)
    && typeof r.athleteId === "string" && r.athleteId.length > 0
    && typeof r.weekKey === "string" && r.weekKey.length > 0
    && r.status === "complete"
    && isObject(r.steps)
    && WEEKLY_REVIEW_STEP_KEYS.every((k) => WEEKLY_REVIEW_VALID_STEPS[k].has(r.steps[k]));
}

// isCompletedWeeklyReview(data) → true ONLY for a summary that says complete
// AND has the shape runWeeklyReviewNow actually returns. The single- and
// multi-athlete shapes are mutually exclusive on the wire (one has `status`,
// the other has `results`, never both), so a payload carrying both, or
// neither, is malformed and fails closed.
export function isCompletedWeeklyReview(data) {
  if (!isObject(data)) return false;
  const hasStatus = "status" in data;
  const hasResults = "results" in data;
  if (hasStatus && !hasResults) return isCompleteAthleteResult(data);
  if (hasResults && !hasStatus) {
    return typeof data.weekKey === "string" && data.weekKey.length > 0
      && Array.isArray(data.results) && data.results.length > 0
      && data.results.every(isCompleteAthleteResult);
  }
  return false;
}

// weeklyReviewFailureMessage({ error, data }) → the one sentence the family
// sees. Never the backend's text.
export function weeklyReviewFailureMessage({ error = null, data = null } = {}) {
  // Access/transport failures have fixed, non-sensitive wording already.
  const mapped = error ? CODE_MESSAGE[error.code] : null;
  if (mapped) return `Weekly review failed. ${mapped}`;

  const summary = isObject(data) ? data : isObject(error?.details) ? error.details : null;
  if (noAnswer(error, summary)) return WEEKLY_REVIEW_UNCONFIRMED;
  const statuses = isObject(summary) && Array.isArray(summary.results)
    ? summary.results.map(r => r?.status)
    : [summary?.status];
  if (statuses.includes("run-in-progress")) return WEEKLY_REVIEW_IN_PROGRESS;
  const steps = isObject(summary?.steps) ? summary.steps : null;
  // Only a confirmed "done" checkpoint is proof the plan was saved; anything
  // else — absent, "not-reached", mid-run — is unknown, not "no plan."
  if (steps?.plan === "done") return WEEKLY_REVIEW_FAILED_AFTER_PLAN;
  return WEEKLY_REVIEW_FAILED;
}

const userFacingError = (userMessage, extra) => {
  const err = new Error(userMessage);
  err.userMessage = userMessage;
  return Object.assign(err, extra);
};

// Runs the whole weekly pipeline now (hygiene → plan → memory → digest → push),
// bypassing both the schedule and the weeklyReviewEnabled flag. Resolves with
// the callable's summary ONLY when that summary says the run completed;
// otherwise throws an Error whose message (also on `.userMessage`) is safe to
// show. The callable's raw error is kept on `.cause`, a non-complete payload on
// `.result`.
export async function runWeeklyReviewNow(athleteId) {
  const callable = httpsCallable(getFunctions(app), "runWeeklyReviewNow", {
    // The function itself runs with a 540s timeout; a shorter client timeout
    // would report a failure for a run that is still going to succeed.
    timeout: 570000,
  });
  let data;
  try {
    ({ data } = await callable(athleteId ? { athleteId } : {}));
  } catch (e) {
    console.error("runWeeklyReviewNow:", e);
    throw userFacingError(weeklyReviewFailureMessage({ error: e }), { cause: e });
  }
  if (!isCompletedWeeklyReview(data)) {
    console.error("runWeeklyReviewNow: resolved without a completed run:", data);
    throw userFacingError(weeklyReviewFailureMessage({ data }), { result: data });
  }
  return data;
}

// reportWeeklyReviewRun — the Profile → "Run weekly review now" button's whole
// contract, kept here (not inline in MobileApp.jsx) so the tests drive the
// same code the button does. The success toast exists in exactly one place
// and is reachable only through a completed summary. Resolves true/false and
// never rejects, so the caller's running flag always clears.
export async function reportWeeklyReviewRun(athleteId, { showToast, onComplete } = {}) {
  try {
    await runWeeklyReviewNow(athleteId);
  } catch (e) {
    console.error("runWeeklyReview:", e);
    // userMessage is set only by runWeeklyReviewNow; anything else that throws
    // is a bug, and its text is no more fit for the screen than the backend's.
    showToast?.(e?.userMessage || WEEKLY_REVIEW_FAILED);
    return false;
  }
  showToast?.(WEEKLY_REVIEW_COMPLETE_TOAST);
  onComplete?.();
  return true;
}

// ─── GUARDIAN CHECK-NOW — FAIL CLOSED ────────────────────────────────────────
// Same rule as the weekly review, for the same reason: "Guardian check
// complete" used to follow the promise merely resolving, so a resolved
// `no-athlete-doc` or `run-in-progress` summary — or any payload at all — was
// announced as a finished check.
//
// The response schema is functions/guardian.js runGuardianNow:
//   one athlete → { athleteId, date, status, ... }
//   several     → { date, results: [{ athleteId, date, status, ... }] }
// and a failed assessment rejects with HttpsError('internal', message,
// { athleteId, date, status: "error", error }).
//
// A FORCED run (which Check-now always is) that finishes an assessment returns
// exactly one of three statuses — read off runGuardianForAthlete, not guessed:
//   quiet      → the gate did not fire (cards cleared, zero tokens)
//   suppressed → it fired, but the same story is inside its cooldown
//   alerted    → a new alert was written (and pushed, if tokens exist)
// Everything else it can return is not a completed check: 'no-athlete-doc',
// 'run-in-progress' (another check is live), and 'guardian-disabled' /
// 'already-complete', which a forced run cannot produce at all.
export const GUARDIAN_COMPLETE_TOAST = "Guardian check complete 🛡️";
export const GUARDIAN_FAILED = "Guardian check failed. Try again in a minute.";
export const GUARDIAN_UNCONFIRMED = "Lost contact with the Guardian check — it may still be running. Check Home in a minute.";
export const GUARDIAN_IN_PROGRESS = "A Guardian check is already running. Check Home in a minute.";

const GUARDIAN_COMPLETED_STATUSES = new Set(["quiet", "suppressed", "alerted"]);

function isCompleteGuardianResult(r) {
  return isObject(r)
    && typeof r.athleteId === "string" && r.athleteId.length > 0
    && typeof r.date === "string" && r.date.length > 0
    && GUARDIAN_COMPLETED_STATUSES.has(r.status);
}

// isCompletedGuardianCheck(data) → true ONLY for a summary of a finished
// assessment, in one of the two shapes runGuardianNow returns.
export function isCompletedGuardianCheck(data) {
  if (!isObject(data)) return false;
  const hasStatus = "status" in data;
  const hasResults = "results" in data;
  if (hasStatus && !hasResults) return isCompleteGuardianResult(data);
  if (hasResults && !hasStatus) {
    return typeof data.date === "string" && data.date.length > 0
      && Array.isArray(data.results) && data.results.length > 0
      && data.results.every(isCompleteGuardianResult);
  }
  return false;
}

export function guardianFailureMessage({ error = null, data = null } = {}) {
  const mapped = error ? CODE_MESSAGE[error.code] : null;
  if (mapped) return `Guardian check failed. ${mapped}`;
  const summary = isObject(data) ? data : isObject(error?.details) ? error.details : null;
  if (noAnswer(error, summary)) return GUARDIAN_UNCONFIRMED;
  const statuses = isObject(summary) && Array.isArray(summary.results)
    ? summary.results.map(r => r?.status)
    : [summary?.status];
  if (statuses.includes("run-in-progress")) return GUARDIAN_IN_PROGRESS;
  return GUARDIAN_FAILED;
}

// Runs the Load & Health Guardian's daily assessment now, bypassing both the
// 6am schedule and the guardianEnabled flag. Resolves with the callable's
// summary ONLY when it describes a finished assessment; otherwise throws an
// Error whose message (also on `.userMessage`) is safe to show, with the raw
// error on `.cause` and a non-complete payload on `.result`.
export async function runGuardianNow(athleteId) {
  const callable = httpsCallable(getFunctions(app), "runGuardianNow", {
    // 30s past the function's own 120s budget, for the same reason the weekly
    // helper allows 570s against a 540s function: a client timeout at or below
    // the server's would report a failure for a run still on its way to
    // succeeding, and the round trip itself needs room.
    timeout: 150000,
  });
  let data;
  try {
    ({ data } = await callable(athleteId ? { athleteId } : {}));
  } catch (e) {
    console.error("runGuardianNow:", e);
    throw userFacingError(guardianFailureMessage({ error: e }), { cause: e });
  }
  if (!isCompletedGuardianCheck(data)) {
    console.error("runGuardianNow: resolved without a completed check:", data);
    throw userFacingError(guardianFailureMessage({ data }), { result: data });
  }
  return data;
}

// reportGuardianRun — the Profile → "Check now" button's whole contract, kept
// here so the tests drive the code the button does. Resolves true/false and
// never rejects.
export async function reportGuardianRun(athleteId, { showToast, onComplete } = {}) {
  try {
    await runGuardianNow(athleteId);
  } catch (e) {
    console.error("runGuardian:", e);
    showToast?.(e?.userMessage || GUARDIAN_FAILED);
    return false;
  }
  showToast?.(GUARDIAN_COMPLETE_TOAST);
  onComplete?.();
  return true;
}
