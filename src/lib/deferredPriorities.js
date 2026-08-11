import {
  collection, getDocs, addDoc, updateDoc,
  query, where, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { currentWeekKey } from "./dates.js";
import { isMetricTarget } from "./priorityMetrics.js";
import {
  OPEN_STATUSES, isServerTimestamp,
  planPriorityUpserts, planMergeDuplicates, planMetricResolutions,
  planEscalations, planLabelResolutions,
} from "./deferredPrioritiesCore.js";

// ─── DEFERRED PRIORITIES — FIRESTORE WIRING ──────────────────────────────────
// Reads the open docs, asks deferredPrioritiesCore.js what should change, and
// applies the ops with the client SDK. No decision logic lives here: the
// wording-vs-area matching, the escalation clock carryover, the once-per-week
// `lastCountedWeek` guard and the metric-target cleaning are all in the core so
// a Cloud Function can run them against the admin SDK.

const col = (athleteUid) =>
  collection(db, "athletes", athleteUid, "deferredPriorities");

const ref = (athleteUid, id) =>
  doc(db, "athletes", athleteUid, "deferredPriorities", id);

async function loadOpen(athleteUid) {
  const snap = await getDocs(col(athleteUid));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => OPEN_STATUSES.includes(d.status));
}

// The core can't call serverTimestamp(), so it emits a sentinel instead. Swap
// every sentinel for the client SDK's real one on the way to Firestore.
const materialize = (fields) => {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    out[k] = isServerTimestamp(v) ? serverTimestamp() : v;
  }
  return out;
};

// ── applyPriorityOps ─────────────────────────────────────────────────────────
// Applies a planner's op list in order. Ops may reference a doc an earlier op
// in the same list created, by its `tempId`; those are mapped to the real id
// Firestore hands back.
async function applyPriorityOps(athleteUid, ops) {
  const idMap = new Map();                       // tempId → real Firestore id
  const realId = (id) => idMap.get(id) ?? id;

  for (const op of ops || []) {
    if (op.op === "create") {
      const created = await addDoc(col(athleteUid), materialize(op.fields));
      if (op.tempId) idMap.set(op.tempId, created.id);
      continue;
    }

    if (op.op === "supersede") {
      const oldId = realId(op.oldId);
      const created = await addDoc(
        col(athleteUid),
        materialize({ ...op.newFields, supersedes: oldId }),
      );
      if (op.tempId) idMap.set(op.tempId, created.id);
      await updateDoc(ref(athleteUid, oldId), {
        status:         "superseded",
        supersededBy:   created.id,
        supersededDate: serverTimestamp(),
      });
      continue;
    }

    // update | resolve | escalate — all a plain field write on one document.
    await updateDoc(ref(athleteUid, realId(op.id)), materialize(op.fields));
  }

  return idMap;
}

// ── saveDeferredPriorities ───────────────────────────────────────────────────
// Takes the deferredPriorities array returned by the AI and upserts each item.
export async function saveDeferredPriorities(athleteUid, deferredArray) {
  const open = await loadOpen(athleteUid);
  const ops = planPriorityUpserts(open, deferredArray, currentWeekKey());
  await applyPriorityOps(athleteUid, ops);
}

// ── mergeDuplicatePriorities ─────────────────────────────────────────────────
// One-time cleanup for the duplicates already in Firestore, written before
// matching became area-based. Idempotent: once the list is clean this writes
// nothing, so it is safe to call on every load.
// Returns the number of docs folded away.
export async function mergeDuplicatePriorities(athleteUid) {
  const open = await loadOpen(athleteUid);
  const ops = planMergeDuplicates(open);
  if (ops.length === 0) return 0;
  await applyPriorityOps(athleteUid, ops);
  return ops.filter(o => o.kind === "fold").length;
}

// ── resolveMetricTargets ─────────────────────────────────────────────────────
// Closes any open priority whose match-statistic target has been met.
// Returns the priorities it resolved, for the caller to surface as a toast.
export async function resolveMetricTargets(athleteUid) {
  const open = await loadOpen(athleteUid);
  // Skip the matches read entirely when nothing is target-driven.
  if (!open.some(d => isMetricTarget(d.metricTarget))) return [];

  const matchesSnap = await getDocs(collection(db, "matches"));
  const matches = matchesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.athleteId === athleteUid);

  const ops = planMetricResolutions(open, matches);
  await applyPriorityOps(athleteUid, ops);
  return ops.map(o => o.doc);
}

// ── resolveDeferred ──────────────────────────────────────────────────────────
// Sets status to 'resolved' and records addressedDate for any open document
// describing the same development area as the given label.
export async function resolveDeferred(athleteUid, priorityLabel) {
  if (!priorityLabel) return;
  const open = await loadOpen(athleteUid);
  await applyPriorityOps(athleteUid, planLabelResolutions(open, priorityLabel));
}

// ── checkEscalations ─────────────────────────────────────────────────────────
// Promotes active items deferred 4+ weeks to 'escalated' (a write). This MUTATES,
// so its return value only reflects items it flipped on this call — do not rely
// on it for display (use refreshEscalations / getEscalated instead).
export async function checkEscalations(athleteUid) {
  const open = await loadOpen(athleteUid);
  const ops = planEscalations(open);
  await applyPriorityOps(athleteUid, ops);
  return ops.map(o => o.doc);
}

// ── getEscalated ─────────────────────────────────────────────────────────────
// Read-only: returns ALL currently-escalated items. Safe to call from any number
// of callers/effects without racing, since it never writes.
export async function getEscalated(athleteUid) {
  const snap = await getDocs(
    query(col(athleteUid), where("status", "==", "escalated"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── refreshEscalations ───────────────────────────────────────────────────────
// Promotes any newly-eligible items, then returns the FULL set of escalated
// items. Use this for display: regardless of which caller ran the promotion
// first, every caller sees the complete escalated set.
export async function refreshEscalations(athleteUid) {
  await checkEscalations(athleteUid);
  return getEscalated(athleteUid);
}
