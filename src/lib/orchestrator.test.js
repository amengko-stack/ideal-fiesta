import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── RUN-NOW — FAIL-CLOSED REGRESSION ────────────────────────────────────────
// Drives the Profile → "Run weekly review now" path as the button does:
// reportWeeklyReviewRun (the handler MobileApp.jsx delegates to) →
// runWeeklyReviewNow → the REAL firebase/functions httpsCallable. Only the
// network is replaced: `fetch` answers with exactly what the gen-1 callable
// sends, so the SDK's own status/body handling is part of what is tested —
// including the literal HTTP 500 the 2026-09-23 production run returned.
//
// firebase.js is swapped for a real FirebaseApp with a throwaway config: the
// real module calls getAuth() at import, which throws without the VITE_*
// secrets CI does not have. No request can leave the process.

vi.mock("../firebase", async () => ({ app: await testApp(), db: {}, auth: {} }));
vi.mock("../firebase.js", async () => ({ app: await testApp(), db: {}, auth: {} }));
async function testApp() {
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  const name = "orchestrator-test";
  return getApps().some(a => a.name === name)
    ? getApp(name)
    : initializeApp({ apiKey: "test-key", projectId: "demo-athlete-os", appId: "1:1:web:1" }, name);
}

const {
  reportWeeklyReviewRun, runWeeklyReviewNow, isCompletedWeeklyReview, weeklyReviewFailureMessage,
  WEEKLY_REVIEW_COMPLETE_TOAST, WEEKLY_REVIEW_FAILED, WEEKLY_REVIEW_FAILED_AFTER_PLAN,
} = await import("./orchestrator.js");

const ATHLETE = "kDybMQH9lefwHI0dRway";

// The production failure, byte for byte: firebase-functions 4.9 serialises
// HttpsError('internal', err.message, err.summary) as this body with HTTP 500.
const PRODUCTION_ERROR_MESSAGE = 'Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field "sessions.`0`.exercises.`0`.distanceM"). If you want to ignore undefined values, enable `ignoreUndefinedProperties`.';
const PRODUCTION_500 = {
  error: {
    details: {
      athleteId: ATHLETE, weekKey: "2026-09-21", status: "error",
      steps: { hygiene: "done", plan: "not-reached", memory: "not-reached", digest: "not-reached", push: "not-reached" },
    },
    message: PRODUCTION_ERROR_MESSAGE,
    status: "INTERNAL",
  },
};

const COMPLETE = {
  athleteId: ATHLETE, weekKey: "2026-09-21", status: "complete",
  steps: { hygiene: "done", plan: "done", memory: "done", digest: "done", push: "sent" },
};

let fetchMock;
const respond = (status, body) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  }));
};

// Presses the button once and reports what the family would have seen.
async function pressRunNow() {
  const toasts = [];
  const onComplete = vi.fn();
  const returned = await reportWeeklyReviewRun(ATHLETE, { showToast: (m) => toasts.push(m), onComplete });
  return { toasts, onComplete, returned };
}

const expectFailureUi = ({ toasts, onComplete, returned }, message) => {
  expect(returned).toBe(false);
  expect(toasts).toEqual([message]);
  expect(toasts.join(" ")).not.toContain("complete");
  expect(onComplete).not.toHaveBeenCalled();
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Run now — 1. a valid complete response", () => {
  it("shows the success toast and refreshes, and nothing else", async () => {
    respond(200, { result: COMPLETE });
    const ui = await pressRunNow();
    expect(ui.returned).toBe(true);
    expect(ui.toasts).toEqual([WEEKLY_REVIEW_COMPLETE_TOAST]);
    expect(ui.onComplete).toHaveBeenCalledTimes(1);
  });

  it("really goes through the callable: the runWeeklyReviewNow URL with the athlete id", async () => {
    respond(200, { result: COMPLETE });
    await pressRunNow();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us-central1-demo-athlete-os.cloudfunctions.net/runWeeklyReviewNow");
    expect(JSON.parse(init.body)).toEqual({ data: { athleteId: ATHLETE } });
  });

  it("accepts the multi-athlete shape only when every athlete completed", async () => {
    respond(200, { result: { weekKey: "2026-09-21", results: [COMPLETE, { ...COMPLETE, athleteId: "b" }] } });
    expect((await pressRunNow()).toasts).toEqual([WEEKLY_REVIEW_COMPLETE_TOAST]);
  });
});

describe("Run now — 2. the callable rejects (the production HTTP 500)", () => {
  it("shows failure, never success, for the exact 2026-09-23 response", async () => {
    respond(500, PRODUCTION_500);
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED);
  });

  it("keeps the backend's internals off the screen and in the console", async () => {
    respond(500, PRODUCTION_500);
    const { toasts } = await pressRunNow();
    for (const leak of ["Firestore", "undefined", "distanceM", "ignoreUndefinedProperties", "Value for argument"]) {
      expect(toasts[0]).not.toContain(leak);
    }
    const logged = console.error.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("distanceM");
  });

  it("rejects from runWeeklyReviewNow itself, with the SDK error preserved as the cause", async () => {
    respond(500, PRODUCTION_500);
    const err = await runWeeklyReviewNow(ATHLETE).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.userMessage).toBe(WEEKLY_REVIEW_FAILED);
    expect(err.cause.code).toBe("functions/internal");
    expect(err.cause.details.steps.plan).toBe("not-reached");
  });

  it("says the plan was saved when the run failed after the plan step", async () => {
    respond(500, { error: { ...PRODUCTION_500.error, details: { ...PRODUCTION_500.error.details,
      steps: { hygiene: "done", plan: "done", memory: "done", digest: "not-reached", push: "not-reached" } } } });
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED_AFTER_PLAN);
  });

  it("a network failure or a bare 500 is unconfirmed, not success", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED);
    respond(500, {});
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED);
  });

  it("an access failure keeps its fixed, non-sensitive wording", async () => {
    respond(403, { error: { status: "PERMISSION_DENIED", message: "Only the family accounts may run the weekly review." } });
    expectFailureUi(await pressRunNow(), "Weekly review failed. Only the family accounts can run this.");
  });
});

describe("Run now — 3. the callable resolves with an explicit error payload", () => {
  it("shows failure, never success", async () => {
    respond(200, { result: { ...PRODUCTION_500.error.details } });
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED);
  });

  it("a real non-complete summary the server can return today (no athlete doc) is a failure", async () => {
    respond(200, { result: { athleteId: ATHLETE, weekKey: "2026-09-21", status: "no-athlete-doc", steps: {} } });
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED);
  });

  it("one failed athlete in a multi-athlete result fails the whole run", async () => {
    respond(200, { result: { weekKey: "2026-09-21", results: [COMPLETE, PRODUCTION_500.error.details] } });
    expect((await pressRunNow()).toasts).not.toContain(WEEKLY_REVIEW_COMPLETE_TOAST);
  });
});

describe("Run now — 4. the callable resolves with a malformed or unknown payload", () => {
  it.each([
    ["an empty object", {}],
    ["null", null],
    ["a bare string", "ok"],
    ["an array", [COMPLETE]],
    ["a status that is not exactly 'complete'", { status: "COMPLETE" }],
    ["a truthy non-string status", { status: true }],
    ["an empty all-athletes result", { weekKey: "2026-09-21", results: [] }],
    // The exact defect this correction fixes: a bare status string is not a
    // completed-run summary — no athleteId/weekKey/steps back it up.
    ["a status-only stub with no athlete/week/steps", { status: "complete" }],
    ["a results array of status-only stubs", { weekKey: "2026-09-21", results: [{ status: "complete" }] }],
    // Required single-athlete fields missing even though status says complete.
    ["a single result missing weekKey and steps", { athleteId: ATHLETE, status: "complete" }],
    ["a single result with an empty steps map", { ...COMPLETE, steps: {} }],
    ["a single result missing one required step", { ...COMPLETE, steps: { hygiene: "done", memory: "done", digest: "done", push: "sent" } }],
    // One malformed entry among otherwise-valid ones still fails the batch.
    ["a multi-athlete result with one incomplete entry", {
      weekKey: "2026-09-21",
      results: [COMPLETE, { athleteId: "b", weekKey: "2026-09-21", status: "complete" }],
    }],
    // The single- and multi-athlete shapes never coexist on the wire; a
    // payload carrying both is contradictory, not a success either way reads it.
    ["a payload with both a top-level status and a results array", { status: "complete", results: [COMPLETE] }],
  ])("%s → failure, never success", async (_label, result) => {
    respond(200, { result });
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED);
  });

  it("a 200 with no result field at all → failure, never success", async () => {
    respond(200, { unexpected: true });
    expectFailureUi(await pressRunNow(), WEEKLY_REVIEW_FAILED);
  });
});

describe("isCompletedWeeklyReview — the one definition of success", () => {
  it("is true only for a completed summary", () => {
    expect(isCompletedWeeklyReview(COMPLETE)).toBe(true);
    expect(isCompletedWeeklyReview({ ...COMPLETE, status: "error" })).toBe(false);
    expect(isCompletedWeeklyReview(undefined)).toBe(false);
  });

  // The exact sample payloads from the correction brief, checked directly
  // against the predicate — no callable, no toast, just true/false.
  it("rejects every malformed sample and accepts only the real backend shapes", () => {
    const MULTI_COMPLETE = { weekKey: "2026-09-21", results: [COMPLETE, { ...COMPLETE, athleteId: "b" }] };

    expect(isCompletedWeeklyReview(null)).toBe(false);
    expect(isCompletedWeeklyReview({})).toBe(false);
    expect(isCompletedWeeklyReview({ status: "complete" })).toBe(false);
    expect(isCompletedWeeklyReview({ results: [{ status: "complete" }] })).toBe(false);
    expect(isCompletedWeeklyReview({ status: "complete", results: [] })).toBe(false);

    expect(isCompletedWeeklyReview(COMPLETE)).toBe(true);
    expect(isCompletedWeeklyReview(MULTI_COMPLETE)).toBe(true);
  });
});

describe("isCompletedWeeklyReview — critical-step contract (backend: functions/weeklyReview.js)", () => {
  // A structurally full response is not enough: steps.plan "not-reached" is a
  // status:"error"-only value (the pipeline's catch backfills it), so it can
  // never legitimately accompany status:"complete" — the exact gap Codex
  // flagged as still passing.
  const withSteps = (steps) => ({ ...COMPLETE, steps: { ...COMPLETE.steps, ...steps } });

  it("accepts every legitimate completed-run step combination", () => {
    // 1. Fully valid single-athlete completed response.
    expect(isCompletedWeeklyReview(COMPLETE)).toBe(true);
    // 2. memory:"failed" is explicitly non-fatal on the backend.
    expect(isCompletedWeeklyReview(withSteps({ memory: "failed" }))).toBe(true);
    // 3. Valid supported push outcomes: no tokens registered, or claimed by
    //    an earlier attempt — neither is a pipeline failure.
    expect(isCompletedWeeklyReview(withSteps({ push: "no-tokens" }))).toBe(true);
    expect(isCompletedWeeklyReview(withSteps({ push: "already-claimed" }))).toBe(true);
    expect(isCompletedWeeklyReview(withSteps({ push: "no-digest" }))).toBe(true);
    // Every step's "already checkpointed, this run resumed past it" value.
    expect(isCompletedWeeklyReview(withSteps({
      hygiene: "skipped", plan: "skipped", memory: "skipped", digest: "skipped", push: "skipped",
    }))).toBe(true);
    // digest notes degrading to stats-only is still a completed digest step.
    expect(isCompletedWeeklyReview(withSteps({ digest: "done-without-notes" }))).toBe(true);
    // 4. Multi-athlete, every entry independently legitimate.
    expect(isCompletedWeeklyReview({
      weekKey: "2026-09-21",
      results: [COMPLETE, withSteps({ athleteId: "b", memory: "failed" })],
    })).toBe(true);
  });

  it("rejects a structurally full response with an impossible critical-step state", () => {
    // 5 & the reported defect itself: status:"complete" + plan:"not-reached".
    expect(isCompletedWeeklyReview(withSteps({ plan: "not-reached" }))).toBe(false);
    // 6. plan can never be "failed" either — no try/catch wraps that step.
    expect(isCompletedWeeklyReview(withSteps({ plan: "failed" }))).toBe(false);
    // 7. Same impossibility for the other steps: "not-reached" only ever
    //    comes from status:"error"'s backfill, never a "complete" result.
    expect(isCompletedWeeklyReview(withSteps({ hygiene: "not-reached" }))).toBe(false);
    expect(isCompletedWeeklyReview(withSteps({ digest: "not-reached" }))).toBe(false);
    expect(isCompletedWeeklyReview(withSteps({ push: "not-reached" }))).toBe(false);
    // "failed" is memory's own non-fatal exception, not a blanket allowance —
    // every other step rejects it too.
    expect(isCompletedWeeklyReview(withSteps({ hygiene: "failed" }))).toBe(false);
    expect(isCompletedWeeklyReview(withSteps({ digest: "failed" }))).toBe(false);
    expect(isCompletedWeeklyReview(withSteps({ push: "failed" }))).toBe(false);
  });

  it("rejects an unknown step value even when every other field looks valid", () => {
    // 8. A future/typo'd backend string is unknown, not implicitly trusted.
    expect(isCompletedWeeklyReview(withSteps({ plan: "in-progress" }))).toBe(false);
    expect(isCompletedWeeklyReview(withSteps({ push: "queued" }))).toBe(false);
  });

  it("fails the whole multi-athlete batch when one entry has an impossible step state", () => {
    // 9. One contradictory entry among otherwise-valid ones is still a fail.
    const oneImpossible = {
      weekKey: "2026-09-21",
      results: [COMPLETE, withSteps({ athleteId: "b", plan: "not-reached" })],
    };
    expect(isCompletedWeeklyReview(oneImpossible)).toBe(false);
  });

  it("rejects a contradictory outer/inner completion state", () => {
    // 10. status:"complete" wrapping the real production error's step map —
    //     the outer status alone must never be trusted over inner evidence.
    expect(isCompletedWeeklyReview({
      ...COMPLETE,
      steps: { hygiene: "done", plan: "not-reached", memory: "not-reached", digest: "not-reached", push: "not-reached" },
    })).toBe(false);
  });
});

describe("weeklyReviewFailureMessage — never claims a plan is missing without proof", () => {
  it("uses the uncertainty-safe generic wording when the plan checkpoint is absent", () => {
    // The real production shape: the failure landed before the plan step's
    // checkpoint was ever written, but that does NOT prove no plan exists —
    // the .set() that writes plans/current happens before the checkpoint.
    const msg = weeklyReviewFailureMessage({
      data: { athleteId: ATHLETE, weekKey: "2026-09-21", status: "error",
        steps: { hygiene: "done", plan: "not-reached", memory: "not-reached", digest: "not-reached", push: "not-reached" } },
    });
    expect(msg).toBe(WEEKLY_REVIEW_FAILED);
    expect(msg).not.toMatch(/no (new )?plan/i);
  });

  it("uses the same safe wording when there is no steps map at all", () => {
    expect(weeklyReviewFailureMessage({ data: null })).toBe(WEEKLY_REVIEW_FAILED);
    expect(weeklyReviewFailureMessage({ data: {} })).toBe(WEEKLY_REVIEW_FAILED);
  });

  it("only claims the plan was saved when steps.plan is positively 'done'", () => {
    const msg = weeklyReviewFailureMessage({
      data: { athleteId: ATHLETE, weekKey: "2026-09-21", status: "error",
        steps: { hygiene: "done", plan: "done", memory: "done", digest: "not-reached", push: "not-reached" } },
    });
    expect(msg).toBe(WEEKLY_REVIEW_FAILED_AFTER_PLAN);
  });
});

describe("Run now — the Profile button reaches the success toast only through this path", () => {
  const SRC = fileURLToPath(new URL("..", import.meta.url));
  const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");

  it("MeScreen's button → MobileApp's handler → reportWeeklyReviewRun", () => {
    expect(read("screens/MeScreen.jsx")).toMatch(/onClick=\{weeklyReviewRunning \? undefined : onRunWeeklyReview\}/);
    const app = read("screens/MobileApp.jsx");
    expect(app).toContain("onRunWeeklyReview={runWeeklyReview}");
    expect(app).toMatch(/const runWeeklyReview = async \(\) => \{[\s\S]*?await reportWeeklyReviewRun\(athleteId, \{ showToast, onComplete: refresh \}\);/);
    // No second, unvalidated caller that could announce success on its own.
    expect(app).not.toContain("runWeeklyReviewNow(");
  });

  it("the success wording exists in exactly one source file", () => {
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)
          && fs.readFileSync(p, "utf8").includes("Weekly review complete")) hits.push(path.relative(SRC, p));
      }
    };
    walk(SRC);
    expect(hits.map(h => h.replace(/\\/g, "/"))).toEqual(["lib/orchestrator.js"]);
  });
});
