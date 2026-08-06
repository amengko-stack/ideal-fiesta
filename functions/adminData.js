import admin from 'firebase-admin';
import { selectRecentMatch } from './shared/athleteContextCore.js';
import { isServerTimestamp } from './shared/deferredPrioritiesCore.js';
import { emptyMemory } from './shared/athleteMemoryCore.js';

// ─── ADMIN-SDK DATA ADAPTER ──────────────────────────────────────────────────
// The functions-side twin of the client's Firestore wiring: reads the same
// documents with the admin SDK and applies the same op lists. Deliberately free
// of decision logic — every cutoff, average, match/priority pairing and
// escalation rule lives in functions/shared/ (synced byte-for-byte from
// src/lib/), so the scheduled orchestrator and the app can never diverge on
// what the AI is told or on what a write means.
//
// Mirrors:
//   fetchAthleteRaw   ← src/lib/athleteContext.js  buildAthleteContext (reads)
//   applyPriorityOps  ← src/lib/deferredPriorities.js applyPriorityOps
//   sendPushToRole    ← functions/index.js sendCheckinReminderForAthlete (FCM)

const FieldValue = admin.firestore.FieldValue;

const athleteRefOf = (db, athleteId) => db.collection('athletes').doc(athleteId);

const withIds = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ── fetchAthleteRaw ──────────────────────────────────────────────────────────
// The raw bundle assembleAthleteContext(raw, now) expects, plus `sessions` —
// the strength-session history buildSundayPlanPrompt renders (planGen.js gets
// it from MobileApp's `sessionHistory`; planGenCore already slices to the
// newest 6, so we read 6).
//
// Query-for-query mirror of buildAthleteContext:
//   weekLogs             orderBy date desc (no limit — the core cuts to 28d)
//   wellbeing            orderBy date desc, limit 14
//   tournaments          whole collection; when EMPTY, also read the legacy
//                        config/tournamentStatus doc. `tournaments` is assigned
//                        last so a read failure leaves it null and the core
//                        keeps its defaults — the client's exact degradation.
//   sessions             orderBy date desc, limit 1  → lastStrengthSession
//   profile              athletes/{id}
//   matches              top-level /matches. The client reads the whole
//                        collection and the core filters on athleteId; the
//                        server filters in the query instead — same rows, one
//                        less document read. planMetricResolutions REQUIRES
//                        matches already scoped to this athlete.
//   matchAnalyses/{id}   for selectRecentMatch's pick (14-day window)
//   deferredPriorities   whole collection, with ids
//   technicalAssessments orderBy date desc, limit 30 (data only, no ids —
//                        matching the client, whose core reads no id here)
//   memory/current       merged onto emptyMemory(), never throws (loadMemory)
//   reports/seasonLatest
//   injuries             whole collection, with ids
export async function fetchAthleteRaw(db, athleteId, now = new Date()) {
  const athleteRef = athleteRefOf(db, athleteId);

  // 1. Session logs (weekLogs)
  const logsSnap = await athleteRef.collection('weekLogs').orderBy('date', 'desc').get();
  const weekLogs = withIds(logsSnap);

  // 2. Wellbeing
  const wellSnap = await athleteRef
    .collection('wellbeing')
    .orderBy('date', 'desc')
    .limit(14)
    .get();
  const wellbeing = withIds(wellSnap);

  // 3. Tournaments (+ legacy tournamentStatus doc)
  let tournaments = null;
  let tournamentStatusDoc = null;
  try {
    const tourSnap = await athleteRef.collection('tournaments').get();
    const docs = withIds(tourSnap);
    if (docs.length === 0) {
      const tSnap = await athleteRef.collection('config').doc('tournamentStatus').get();
      tournamentStatusDoc = tSnap.exists ? tSnap.data() : null;
    }
    tournaments = docs;
  } catch { /* absent or unreadable — the core's defaults stand */ }

  // 4. Last strength session
  const strengthSnap = await athleteRef
    .collection('sessions')
    .orderBy('date', 'desc')
    .limit(1)
    .get();
  const lastStrengthSession = strengthSnap.empty ? null : strengthSnap.docs[0].data();

  // 4b. Strength session history for the plan prompt (client: sessionHistory).
  const sessionsSnap = await athleteRef
    .collection('sessions')
    .orderBy('date', 'desc')
    .limit(6)
    .get();
  const sessions = withIds(sessionsSnap);

  // 5. Athlete profile
  const profileSnap = await athleteRef.get();
  const profile = profileSnap.exists ? profileSnap.data() : null;

  // 6. Matches (+ the AI analysis for the most recent one)
  const matchesSnap = await db.collection('matches').where('athleteId', '==', athleteId).get();
  const matches = withIds(matchesSnap);

  const recentMatch = selectRecentMatch(matches, athleteId, now);
  let matchAnalysisDoc = null;
  if (recentMatch?.id) {
    try {
      const analysisSnap = await athleteRef
        .collection('matchAnalyses')
        .doc(recentMatch.id)
        .get();
      matchAnalysisDoc = analysisSnap.exists ? analysisSnap.data() : null;
    } catch { /* absent or unreadable — the core degrades to its default */ }
  }

  // 7. Deferred priorities
  const deferredDocs = await fetchDeferredPriorities(db, athleteId);

  // 8. Technical assessments
  let technicalAssessments = null;
  try {
    const taSnap = await athleteRef
      .collection('technicalAssessments')
      .orderBy('date', 'desc')
      .limit(30)
      .get();
    technicalAssessments = taSnap.docs.map((d) => d.data());
  } catch { /* absent or unreadable — the core degrades to its default */ }

  // 9. Athlete development memory (loadMemory never throws)
  let memoryDoc;
  try {
    const memSnap = await athleteRef.collection('memory').doc('current').get();
    memoryDoc = memSnap.exists ? { ...emptyMemory(), ...memSnap.data() } : emptyMemory();
  } catch {
    memoryDoc = emptyMemory();
  }

  // 10. Season report
  let seasonReportDoc = null;
  try {
    const seasonSnap = await athleteRef.collection('reports').doc('seasonLatest').get();
    seasonReportDoc = seasonSnap.exists ? seasonSnap.data() : null;
  } catch { /* absent or unreadable — the core degrades to its default */ }

  // 11. Injuries
  let injuries = null;
  try {
    const injSnap = await athleteRef.collection('injuries').get();
    injuries = withIds(injSnap);
  } catch { /* absent or unreadable — the core degrades to its default */ }

  return {
    athleteUid: athleteId,
    weekLogs,
    wellbeing,
    tournaments,
    tournamentStatusDoc,
    lastStrengthSession,
    sessions,
    profile,
    matches,
    matchAnalysisDoc,
    deferredDocs,
    technicalAssessments,
    memoryDoc,
    seasonReportDoc,
    injuries,
  };
}

// ── fetchDeferredPriorities ──────────────────────────────────────────────────
// Every deferred-priority doc with its id. Filtering to the OPEN ones is the
// core's job (isOpen / OPEN_STATUSES), never this module's.
export async function fetchDeferredPriorities(db, athleteId) {
  const snap = await athleteRefOf(db, athleteId).collection('deferredPriorities').get();
  return withIds(snap);
}

// ── materialize ──────────────────────────────────────────────────────────────
// The planners can't call the admin SDK's FieldValue.serverTimestamp(), so they
// emit the sentinel { __serverTimestamp: true }. Swap every sentinel for the
// real one on the way to Firestore.
//
// RECURSIVE, unlike the client's one-level version: the client only ever writes
// flat op fields today, but a nested sentinel silently persisting as the literal
// map { __serverTimestamp: true } is exactly the divergence the plan's "Known
// risks" calls out. Arrays are walked too, so a sentinel can never slip through
// unnoticed.
export function materialize(value) {
  if (isServerTimestamp(value)) return FieldValue.serverTimestamp();
  if (Array.isArray(value)) return value.map(materialize);
  // Plain objects only — a Timestamp/GeoPoint/FieldValue must pass through as-is.
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = materialize(v);
    return out;
  }
  return value;
}

// ── applyPriorityOps ─────────────────────────────────────────────────────────
// Applies a planner's op list in order, with the same semantics as
// src/lib/deferredPriorities.js applyPriorityOps:
//   create    → add a doc; register tempId → real id
//   supersede → add the new wording (carrying `supersedes`), register its
//               tempId, then mark the old doc superseded
//   update | resolve | escalate → a plain field write on one document
// Ops may reference a doc an earlier op in the same list created, by its
// tempId; those resolve through the id map.
export async function applyPriorityOps(db, athleteId, ops) {
  const col = athleteRefOf(db, athleteId).collection('deferredPriorities');
  const idMap = new Map(); // tempId → real Firestore id
  const realId = (id) => idMap.get(id) ?? id;

  for (const op of ops || []) {
    if (op.op === 'create') {
      const created = await col.add(materialize(op.fields));
      if (op.tempId) idMap.set(op.tempId, created.id);
      continue;
    }

    if (op.op === 'supersede') {
      const oldId = realId(op.oldId);
      const created = await col.add(materialize({ ...op.newFields, supersedes: oldId }));
      if (op.tempId) idMap.set(op.tempId, created.id);
      await col.doc(oldId).update({
        status: 'superseded',
        supersededBy: created.id,
        supersededDate: FieldValue.serverTimestamp(),
      });
      continue;
    }

    await col.doc(realId(op.id)).update(materialize(op.fields));
  }

  return idMap;
}

// ─── PUSH ────────────────────────────────────────────────────────────────────
// Prune push tokens only on these codes — they mean the token itself is dead.
// Never prune on internal-error/unavailable/quota codes: those are transient
// outages, and pruning on them would silently destroy push for that device.
export const PRUNABLE_FCM_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export const APP_URL = 'https://athlete-os-15c3b.web.app';

// ── sendPushToRole ───────────────────────────────────────────────────────────
// Generalised out of sendCheckinReminderForAthlete's FCM block: send one
// notification to every token registered for `role` under this athlete, then
// prune the tokens FCM reports as dead.
//
// `beforeSend` preserves the reminder's exact ordering: tokens are looked up
// FIRST, and the idempotency claim is only taken once we know there is somewhere
// to send — otherwise a token registered later the same day would find the day
// already "claimed" and stay silent. Return a reason string from `beforeSend` to
// abort without sending.
//
// Returns { status, sent, pruned }, where status is 'sent' | 'no-tokens' | the
// reason `beforeSend` returned.
export async function sendPushToRole(db, athleteRef, role, { title, body }, { beforeSend } = {}) {
  const tokensSnap = await athleteRef.collection('pushTokens').where('role', '==', role).get();

  if (tokensSnap.empty) {
    return { status: 'no-tokens', sent: 0, pruned: 0 };
  }

  if (beforeSend) {
    const abortReason = await beforeSend();
    if (abortReason) return { status: abortReason, sent: 0, pruned: 0 };
  }

  const tokenDocs = tokensSnap.docs;
  const tokens = tokenDocs.map((d) => d.data().token || d.id);

  // sendEachForMulticast throws on an empty tokens array; guarded above.
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: {
        title,
        body,
        icon: '/icons/apple-touch-icon.png',
        // No badge: there is no monochrome asset for it.
      },
      fcmOptions: { link: APP_URL },
    },
  });

  let pruned = 0;
  await Promise.all(
    response.responses.map(async (resp, i) => {
      if (resp.success) return;
      const code = resp.error && resp.error.code;
      if (PRUNABLE_FCM_ERROR_CODES.has(code)) {
        pruned++;
        // Delete by doc.ref — never reconstruct the path from the token string.
        await tokenDocs[i].ref.delete();
      }
    })
  );

  return { status: 'sent', sent: response.successCount ?? 0, pruned };
}
