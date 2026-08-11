# Load & health guardian — emulator integration test

End-to-end check for `guardian` / `runGuardianNow` (functions/guardian.js).
Everything below runs against the **emulators**; nothing touches production.

The thing worth testing here is not that it fires — it is that it *stays quiet*.
The guardian's whole value is being rare, so §5 and §6 (cooldown and escalation)
matter more than §4.

## 0. Prerequisites

```bash
npm run sync:shared                 # from the repo root — functions/shared/ must match src/lib/
cd functions && npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> functions/.env   # gitignored
```

Without a real key the notes call fails, which is a useful test in itself: the
alert must still be written with every deterministic field intact and
`notesError` set (see §7). The push must still go out.

## 1. Start the emulators

```bash
firebase emulators:start --only functions,firestore
```

Note the ports (defaults: functions `5001`, firestore `8080`).

## 2. Seed

The guardian reads the same athlete the weekly-review runbook seeds, so reuse it:

```bash
cd functions
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-emulator.mjs
```

Then set the opt-in flag and give it something to find. The seed's 4 weeks of
weekLogs are steady, so nothing fires yet — that is the correct starting point:

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 node -e '
import("firebase-admin").then(async ({default: admin}) => {
  admin.initializeApp({projectId: "athlete-os-15c3b"});
  const db = admin.firestore();
  const id = process.env.SEED_ATHLETE_ID || "kDybMQH9lefwHI0dRway";
  await db.doc(`athletes/${id}`).set({guardianEnabled: true}, {merge: true});
  console.log("guardianEnabled set for", id);
});'
```

## 3. Call it

`runGuardianNow` is an `onCall`, so the body is wrapped in `{"data": …}`. The
`FUNCTIONS_EMULATOR` auth bypass in guardian.js is what lets this run without a
real Firebase auth token.

```bash
curl -s -X POST \
  http://localhost:5001/athlete-os-15c3b/us-central1/runGuardianNow \
  -H 'Content-Type: application/json' \
  -d '{"data":{"athleteId":"kDybMQH9lefwHI0dRway"}}' | jq .
```

Expect `{"result":{"athleteId":…,"date":"YYYY-MM-DD","status":"quiet","reason":"single-family"|null,…}}`
against the unmodified seed. **A quiet first run is a pass, not a failure.**

Check the claim doc records the assessment even when nothing fired — that is how
you tune thresholds without reading logs:

```
athletes/{id}/guardianRuns/{today}   → status "complete", outcome "quiet",
                                        assessment.{families,acuteWeight,factors}
```

## 4. Make it fire

The gate needs **two different families**. The seeded athlete is Mid-PHV, so one
more family is enough — add three consecutive low-mood days (recovery):

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 node -e '
import("firebase-admin").then(async ({default: admin}) => {
  admin.initializeApp({projectId: "athlete-os-15c3b"});
  const db = admin.firestore();
  const id = process.env.SEED_ATHLETE_ID || "kDybMQH9lefwHI0dRway";
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n);
    return d.toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"}); };
  for (let i = 0; i < 3; i++) {
    await db.collection(`athletes/${id}/wellbeing`).add({
      date: day(i), type: "checkin", mood: 2, soreness: 4, sleep: 6, time: "20:00",
    });
  }
  console.log("3 low-mood, high-soreness days added");
});'
```

Re-run §3. Now expect `status: "fired"` and assert:

| Path | Expect |
|---|---|
| `guardianAlerts/{today}_g1-…` | `families` has ≥2 entries, one of them a trigger family; `severity`; `headline`; every `factors[].evidence` populated; `actions.athlete` **non-empty**; `dismissedAt` and `resolvedAt` null |
| `guardianState/cooldowns` | a single `current` record — `storyKey`, `families`, `severity`, `acuteWeight`, `firstFiredDate`, `lastFiredDate`, `fireCount`, `cleared: false` |
| `guardianRuns/{today}` | `outcome: "fired"`, `pushClaimedAt` set, `pushSentAt` set when severity is above `watch` |

`pushSentAt` will be absent with no registered push tokens — `sendPushToRole`
returns `no-tokens` and deliberately does **not** burn the claim, so a token
registered later the same day still gets the alert.

**The athlete-facing check.** Read the alert's `athleteNote` and confirm it
contains none of: injury, hurt, risk, growth spurt, fragile, worry, or any
number. That separation is structural — her card renders only `athleteNote` and
`actions.athlete`, never `factors[].evidence` — but read it once with your own
eyes before trusting it with a 12-year-old.

## 5. Cooldown — the important one

Immediately call §3 again. Expect:

```json
{"result":{"status":"suppressed","suppressed":"cooldown","storyKey":"g1:…"}}
```

No new alert document, no second push, and **no Haiku call** — the cooldown
return sits above the notes call. Confirm the `guardianRuns` doc for today reads
`outcome: "suppressed"`.

`force: true` takes today's claim over but does **not** bypass the cooldown: the
cooldown is about the story, not the run. That is deliberate — pressing "Check
now" twice should not produce two identical cards.

## 6. Escalation breaks the cooldown

Adding a factor *within* a family already firing must stay suppressed; adding a
**new family** must break through. Add an open severity-4 injury (tissue):

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 node -e '
import("firebase-admin").then(async ({default: admin}) => {
  admin.initializeApp({projectId: "athlete-os-15c3b"});
  const db = admin.firestore();
  const id = process.env.SEED_ATHLETE_ID || "kDybMQH9lefwHI0dRway";
  const d = new Date(); d.setDate(d.getDate() - 3);
  await db.collection(`athletes/${id}/injuries`).add({
    bodyArea: "Knee", side: "Left", severity: 4, status: "open",
    onsetDate: d.toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"}),
    resolvedDate: null, note: "emulator test",
  });
  console.log("severity-4 knee injury added");
});'
```

Re-run §3. Expect a **new** alert doc with a different `storyKey` (now including
`tissue`) and a higher `severity`, and `current` overwritten with the new story —
there is exactly one cooldown record, not one per story, which is what makes
`escalation-new-family` reachable at all. Check `current.reason` names which
escalation let it through (`escalation-severity` or `escalation-new-family`).
The previous alert must now carry `resolvedAt` with reason `superseded`: there
is only ever one live card.

Then re-run once more with nothing changed and confirm it goes back to
`suppressed` — escalating breaks the window once, it does not disarm it.

## 7. Failure paths

**Notes failure.** Break the key and re-run after clearing the cooldown:

```bash
ANTHROPIC_API_KEY=sk-ant-invalid firebase emulators:start --only functions,firestore
```

The alert must still be written with `notesError` set, `parentNote`/`athleteNote`
null, and `actions.athlete` populated. This is the safety net: the card degrades
to deterministic guidance instead of going blank.

**Auto-resolve.** Delete the low-mood wellbeing docs and the injury, then re-run.
Expect `status: "quiet"` and the open alert to gain `resolvedAt` with reason
`cleared` — the card clears itself without anyone tapping ×.

**Crash recovery.** Set `guardianRuns/{today}.status` to `"running"` with a
`startedAt` 20 minutes old, then re-run: the stale claim is taken over. With a
fresh `startedAt`, expect `status: "run-in-progress"` instead.

## 8. Reset

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 node -e '
import("firebase-admin").then(async ({default: admin}) => {
  admin.initializeApp({projectId: "athlete-os-15c3b"});
  const db = admin.firestore();
  const id = process.env.SEED_ATHLETE_ID || "kDybMQH9lefwHI0dRway";
  for (const c of ["guardianAlerts", "guardianRuns", "guardianState"]) {
    const s = await db.collection(`athletes/${id}/${c}`).get();
    await Promise.all(s.docs.map(d => d.ref.delete()));
  }
  console.log("guardian state cleared");
});'
```

Re-running `scripts/seed-emulator.mjs` restores the base fixture, but it does not
touch the guardian collections — clear them with the above.
