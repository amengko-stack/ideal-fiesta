import functions from 'firebase-functions';
import admin from 'firebase-admin';
// The FCM send/prune block this file's reminder pioneered now lives in
// adminData.js as sendPushToRole, so the weekly digest push uses the identical
// token lookup, multicast and dead-token pruning (only the three codes that
// mean the token itself is dead are ever pruned).
import { sendPushToRole } from './adminData.js';
// Node 20 provides a global `fetch` — no node-fetch dependency needed.

if (!admin.apps.length) {
  // Ambient Application Default Credentials — do NOT reference the gitignored
  // serviceAccountKey.json; Cloud Functions supplies ADC automatically.
  admin.initializeApp();
}

// The Sunday orchestrator lives in its own module (it pins process.env.TZ and
// pulls in the shared pure cores); re-exported here because firebase deploys
// what index.js exports.
export { weeklyReview, runWeeklyReviewNow } from './weeklyReview.js';

// The daily load & health guardian, same arrangement.
export { guardian, runGuardianNow } from './guardian.js';

export const api = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const { messages, system, max_tokens } = req.body || {};
  // ANTHROPIC_API_KEY is supplied out-of-band via `functions/.env` (a path the
  // root .gitignore already reserves) or set directly in the Firebase console —
  // it is never committed to this repo.
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    console.error('[api] ANTHROPIC_API_KEY is not set');
    res.status(500).json({
      error: 'Server misconfigured: ANTHROPIC_API_KEY is not set. Set it in functions/.env or the Firebase console, then redeploy.'
    });
    return;
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages must be a non-empty array' });
    return;
  }

  // Clamp client-supplied max_tokens so a caller can't request oversized (costly) completions.
  const cappedMaxTokens = Math.min(Number(max_tokens) || 4000, 6000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: cappedMaxTokens,
        system,
        messages
      })
    });

    const data = await response.json();
    console.log('[api] Anthropic response status:', response.status);
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[api] error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

const REMINDER_TITLE = 'Evening check-in';
const REMINDER_BODY = "Don't forget your evening check-in!";

/**
 * Runs the evening check-in nudge for a single athlete document.
 * Returns a skip-reason string (for logging) or null if a push was sent.
 */
async function sendCheckinReminderForAthlete(db, athleteDoc, summary) {
  const athlete = athleteDoc.data() || {};
  const timeZone = athlete.timezone || 'Asia/Jakarta';

  // Opt-in default: absent or falsy remindersEnabled means disabled.
  if (!athlete.remindersEnabled) {
    return 'reminders-disabled';
  }

  // Cloud Functions run in UTC, but every stored `date` is a Jakarta local
  // calendar day (see src/lib/dates.js — the app deliberately never uses
  // toISOString because it runs at UTC+7/+8). Derive today's and tomorrow's
  // local date strings the same way the client does.
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone });
  const todayStr = fmt.format(new Date());
  const tomorrowStr = fmt.format(new Date(Date.now() + 24 * 60 * 60 * 1000));

  const wellbeingRef = athleteDoc.ref.collection('wellbeing');
  // Single-field `in` query on `date` — no composite index needed. We accept
  // tomorrow's date, not yesterday's: this job fires at 19:30 Jakarta, so a
  // device in a zone AHEAD of hers (e.g. UTC+9) can stamp a just-completed
  // check-in with tomorrow's local date. A tomorrow-dated doc can only exist
  // if she checked in within the last few hours from an ahead-zone device,
  // so it tolerates travel without ever masking a genuinely missed day. A
  // yesterday-dated doc, by contrast, is simply a day she didn't check in —
  // accepting it would silence the nudge the day after every check-in.
  const wellbeingSnap = await wellbeingRef
    .where('date', 'in', [todayStr, tomorrowStr])
    .get();

  // "Checked in" only counts checkin/night docs — a legacy morning-only doc
  // must not suppress the evening nudge. Filtered in memory (≤ a few docs).
  const hasCheckedIn = wellbeingSnap.docs.some((d) => {
    const type = d.data().type;
    return type === 'checkin' || type === 'night';
  });
  if (hasCheckedIn) {
    return 'already-checked-in';
  }

  // Idempotency: gen-1 pubsub is at-least-once and executions can overlap.
  // .create() throws ALREADY_EXISTS on a duplicate run for the same local day.
  // claimedAt is set first and sentAt only after a successful send, so a
  // claimed-but-never-sent doc (e.g. crash mid-send) is recoverable — deleting
  // that claim doc lets the next run retry instead of being blocked forever.
  //
  // The claim is taken from sendPushToRole's `beforeSend` hook, which runs AFTER
  // the token lookup and only when there is somewhere to send: if there's
  // nowhere to send today we must not burn the claim, or a token registered
  // later that same day would find the day already "claimed" and stay silent.
  const claimRef = athleteDoc.ref.collection('reminderSends').doc(`${todayStr}_checkin`);

  const result = await sendPushToRole(
    db,
    athleteDoc.ref,
    'athlete',
    { title: REMINDER_TITLE, body: REMINDER_BODY },
    {
      beforeSend: async () => {
        try {
          await claimRef.create({ claimedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (err) {
          if (err.code === 6 || /ALREADY_EXISTS/i.test(err.message || '')) {
            return 'duplicate-run';
          }
          throw err;
        }
        return null;
      }
    }
  );

  summary.pruned += result.pruned;

  if (result.status === 'no-tokens') return 'no-athlete-tokens';
  if (result.status !== 'sent') return result.status;

  await claimRef.update({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
  summary.sent++;
  return null;
}

// Gen-1 scheduled function: ~19:30 Asia/Jakarta, nudges the athlete (never
// parents) to do her evening check-in if she hasn't already. Deliberately
// the only push in this phase — see task notes on why a broader digest is
// out of scope (no resolution path in the data model yet).
export const sendCheckinReminder = functions.pubsub
  .schedule('30 19 * * *')
  .timeZone('Asia/Jakarta')
  .onRun(async () => {
    const db = admin.firestore();
    const athletesSnap = await db.collection('athletes').get();

    const summary = { considered: 0, skipped: {}, sent: 0, pruned: 0 };

    for (const athleteDoc of athletesSnap.docs) {
      summary.considered++;
      try {
        const skipReason = await sendCheckinReminderForAthlete(db, athleteDoc, summary);
        if (skipReason) {
          summary.skipped[skipReason] = (summary.skipped[skipReason] || 0) + 1;
        }
      } catch (err) {
        console.error(`[sendCheckinReminder] athlete ${athleteDoc.id} failed:`, err.message);
        summary.skipped['error'] = (summary.skipped['error'] || 0) + 1;
      }
    }

    console.log('[sendCheckinReminder] summary:', JSON.stringify(summary));
    return null;
  });
