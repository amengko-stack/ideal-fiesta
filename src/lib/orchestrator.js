import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";

// ─── WEEKLY REVIEW ORCHESTRATOR — CLIENT HELPER ──────────────────────────────
// Thin wrapper over the `runWeeklyReviewNow` callable in functions/weeklyReview.js
// (gen-1, default region us-central1 — no .region() anywhere in functions/index.js,
// so none is pinned here either).
//
// The callable is allowlisted to the three family UIDs, takes ~1-3 minutes (it
// runs the whole Sunday pipeline with force: true) and returns the per-athlete
// summary { athleteId, weekKey, status, steps }.
//
// Impure by design: this module talks to Firebase, so it must never be imported
// by a pure core (the import-graph guard in athleteMemoryCore.test.js enforces
// that from the other direction).

// A callable failure reaches the UI as a code plus whatever the function threw.
// The codes below are the ones this pipeline can realistically produce; the
// tone matches aiErrors.js — specific, actionable, never a generic shrug.
const CODE_MESSAGE = {
  "functions/permission-denied": "Only the family accounts can run the weekly review.",
  "functions/unauthenticated":   "You're signed out — sign in again and retry.",
  "functions/not-found":         "The weekly review function isn't deployed yet.",
  "functions/unavailable":       "Couldn't reach the weekly review — check your connection.",
  "functions/deadline-exceeded": "The review took too long and was cut off. It resumes where it stopped — try again.",
  "functions/resource-exhausted": "The weekly review hit a rate limit. Wait a minute and try again.",
  "functions/cancelled":         "The review was cancelled before it finished.",
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
