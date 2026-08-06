# Weekly review orchestrator — emulator integration test

End-to-end check for `weeklyReview` / `runWeeklyReviewNow` (functions/weeklyReview.js).
Everything below runs against the **emulators**; nothing touches production.

## 0. Prerequisites

```bash
npm run sync:shared                 # from the repo root — functions/shared/ must match src/lib/
cd functions && npm install         # firebase-admin + firebase-functions
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> functions/.env   # gitignored; a real key makes the LLM steps run
```

Without a real key the run fails at the plan step — which is itself a useful
test: the hygiene checkpoint must already be recorded and the claim doc must
read `status: "error"` (see §5).

## 1. Start the emulators

```bash
firebase emulators:start --only functions,firestore
```

Note the ports it prints (defaults: functions `5001`, firestore `8080`).

## 2. Seed

In a second terminal:

```bash
cd functions
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-emulator.mjs
```

Seeds `athletes/kDybMQH9lefwHI0dRway` with a profile (`weeklyReviewEnabled: true`),
4 weeks of weekLogs, 8 wellbeing check-ins, 3 strength sessions, 3 matches, three
open deferred priorities (one whose metric target the two recent matches meet,
one at the 4-week escalation threshold, one that stays open), `memory/current`
and a technical assessment. `plans/current`, `digests` and `orchestratorRuns` are
cleared. Override the athlete id with `SEED_ATHLETE_ID=…`.

## 3. Invoke the callable

Callable endpoints in the emulator are plain HTTPS:

```
http://localhost:5001/<projectId>/<region>/runWeeklyReviewNow
```

`<region>` is `us-central1` (the gen-1 default; nothing here sets a region) and
`<projectId>` is the project the emulator started with — `athlete-os-15c3b`
unless you passed `--project`.

```bash
curl -s -X POST \
  http://localhost:5001/athlete-os-15c3b/us-central1/runWeeklyReviewNow \
  -H 'Content-Type: application/json' \
  -d '{"data":{"athleteId":"kDybMQH9lefwHI0dRway"}}' | jq
```

**Auth caveat.** A callable normally requires a Firebase ID token
(`Authorization: Bearer <token>`), and `runWeeklyReviewNow` only accepts the three
family UIDs (`FAMILY_UIDS`, mirroring `ALLOWED_USERS` in src/App.jsx and
`isFamilyMember()` in firestore.rules). Minting one of those tokens in the
emulator is awkward, so the gate is bypassed when `process.env.FUNCTIONS_EMULATOR === 'true'`
— a variable the emulator sets and a deployed function never has. Curl with no
`Authorization` header therefore works locally and is rejected in production.

Omit `athleteId` to run every athlete document (the scheduled behaviour, forced).

Expected response for one athlete:

```json
{ "result": { "athleteId": "kDybMQH9lefwHI0dRway", "weekKey": "YYYY-MM-DD",
              "status": "complete",
              "steps": { "hygiene": "done", "plan": "done", "memory": "done",
                         "digest": "done", "push": "no-tokens" } } }
```

`push: "no-tokens"` is correct — the seed registers no `pushTokens`, and FCM is
not emulated. Add a `pushTokens` doc with `role: "parent"` only if you want to
watch the send fail against real FCM.

## 4. Assert (Firestore emulator UI at http://localhost:4000/firestore, or the shell below)

```bash
cd functions
export FIRESTORE_EMULATOR_HOST=localhost:8080
node -e '
import("firebase-admin").then(async ({default: admin}) => {
  admin.initializeApp({projectId: "athlete-os-15c3b"});
  const a = admin.firestore().collection("athletes").doc("kDybMQH9lefwHI0dRway");
  const week = (await a.collection("orchestratorRuns").get()).docs[0];
  console.log("claim:", week.id, JSON.stringify(week.data()));
  console.log("plan.generatedBy:", (await a.collection("plans").doc("current").get()).data()?.generatedBy);
  for (const d of (await a.collection("deferredPriorities").get()).docs)
    console.log("priority:", d.id, d.data().status, d.data().weeksDeferredCount);
  console.log("digest:", JSON.stringify((await a.collection("digests").doc(week.id).get()).data()));
  process.exit(0);
});'
```

| What | Expected |
| --- | --- |
| `orchestratorRuns/{weekKey}` | `status: "complete"`, `completedAt` set, `steps.{hygiene,plan,memory,digest,push}.completedAt` all present |
| `plans/current` | exists, `generatedBy: "weeklyReview"`, non-empty `plan` array, `metrics` populated |
| `deferredPriorities/seed-stale` | `status: "escalated"`, `escalatedDate` set |
| `deferredPriorities/seed-metric-met` | `status: "resolved"`, `resolvedBy: "metric"`, `resolvedByMatchIds` = the two recent match ids |
| `digests/{weekKey}` | exists; `load`, `wellbeing`, `matches`, `priorities`, `plan` populated; `parentNote` / `athleteNote` written (or `notesError` set, with the stats still there) |
| `memory/current` | `updatedAt` newer than the seed's |
| `steps.hygiene.summary` | `{ merged: 0, resolvedByMetric: ["Second serve points won consistency"], escalated: ["Rally tolerance in long baseline exchanges"] }` |

## 5. Re-invoke — idempotency

```bash
# Same command as §3 → force:true takes the week over and re-runs everything.
# To test the SKIP path instead, flip the claim back to a scheduled-style run:
node -e '…set orchestratorRuns/{weekKey}.status = "complete"…'
```

Then check the two invariants that matter:

- **Skip.** A non-forced run (the scheduled path, or a forced run against a claim
  doc whose `status` is `complete` after removing `force`) returns
  `status: "already-complete"` and writes nothing.
- **No double counting.** After a second forced run, `weeksDeferredCount` on any
  still-open priority must NOT have advanced twice in the same week —
  `lastCountedWeek` (set to `currentWeekKey()`) is the guard in
  `planPriorityUpserts`. Compare the counts printed in §4 before and after.
- **Push not repeated.** `pushClaimedAt` is claimed in a transaction, so a resumed
  (non-forced) run reports `push: "already-claimed"` instead of sending twice.

## 6. Failure-path check (no API key)

Unset `ANTHROPIC_API_KEY`, reseed, invoke. Expected:

- the callable returns a `500 INTERNAL` whose message names the missing key,
- `orchestratorRuns/{weekKey}` has `status: "error"` and `error` set,
- `steps.hygiene.completedAt` **is** present — the deterministic hygiene work is
  checkpointed, so restoring the key and invoking again resumes at the plan step
  rather than re-escalating or re-resolving anything.
