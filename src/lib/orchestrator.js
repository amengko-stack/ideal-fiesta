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

// Runs the whole weekly pipeline now (hygiene → plan → memory → digest → push),
// bypassing both the schedule and the weeklyReviewEnabled flag. Resolves with
// the callable's summary; throws an Error whose message is already readable.
export async function runWeeklyReviewNow(athleteId) {
  const callable = httpsCallable(getFunctions(app), "runWeeklyReviewNow", {
    // The function itself runs with a 540s timeout; a shorter client timeout
    // would report a failure for a run that is still going to succeed.
    timeout: 570000,
  });
  try {
    const { data } = await callable(athleteId ? { athleteId } : {});
    return data;
  } catch (e) {
    console.error("runWeeklyReviewNow:", e);
    const err = new Error(friendlyCallableError(e));
    err.cause = e;
    throw err;
  }
}

// Runs the Load & Health Guardian's daily assessment now, bypassing both the
// 6am schedule and the guardianEnabled flag. Resolves with the callable's
// summary — which, because the assessment is written to Firestore in full,
// says exactly why it fired or stayed silent ({ status, suppressed, ... }).
// Throws an Error whose message is already readable.
export async function runGuardianNow(athleteId) {
  const callable = httpsCallable(getFunctions(app), "runGuardianNow", {
    // 30s past the function's own 120s budget, for the same reason the weekly
    // helper allows 570s against a 540s function: a client timeout at or below
    // the server's would report a failure for a run still on its way to
    // succeeding, and the round trip itself needs room.
    timeout: 150000,
  });
  try {
    const { data } = await callable(athleteId ? { athleteId } : {});
    return data;
  } catch (e) {
    console.error("runGuardianNow:", e);
    const err = new Error(friendlyCallableError(e));
    err.cause = e;
    throw err;
  }
}
