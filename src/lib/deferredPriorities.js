import {
  collection, getDocs, addDoc, updateDoc,
  query, where, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { currentWeekKey } from "./dates.js";
import { samePriority, clusterPriorities } from "./priorityKeys.js";
import { isMetricTarget, matchesSince, streakMet, toISO } from "./priorityMetrics.js";

const col = (athleteUid) =>
  collection(db, "athletes", athleteUid, "deferredPriorities");

const ref = (athleteUid, id) =>
  doc(db, "athletes", athleteUid, "deferredPriorities", id);

// A priority is "open" while it still needs work. `superseded` docs are the
// older wording of a priority that was re-raised — they are history, and every
// reader (this module, athleteContext, PrioritiesTab, MeScreen) filters on
// active/escalated, so they never surface again.
const OPEN_STATUSES = ["active", "escalated"];

async function loadOpen(athleteUid) {
  const snap = await getDocs(col(athleteUid));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => OPEN_STATUSES.includes(d.status));
}

// Only a well-formed target is persisted — a hallucinated metric id must never
// reach the auto-resolver.
const cleanTarget = (t) => (isMetricTarget(t) ? {
  metric: t.metric, comparator: t.comparator, value: t.value,
} : null);


// ── saveDeferredPriorities ───────────────────────────────────────────────────
// Takes the deferredPriorities array returned by the AI and upserts each item.
//
// Matching is by development area (priorityKeys.samePriority), not by exact
// label: the match analysis and the Sunday plan each word the same problem
// differently, and exact-string matching let those pile up as duplicate rows.
//   - identical wording   → update in place, incrementing weeksDeferredCount
//                           once per ISO week (guarded by lastCountedWeek)
//   - reworded            → supersede the old doc and create the new wording,
//                           carrying over deferredDate, the deferral count and
//                           any escalation, so rewording can never reset the
//                           4-week escalation clock
//   - genuinely new       → create with weeksDeferredCount: 0
export async function saveDeferredPriorities(athleteUid, deferredArray) {
  const thisWeek = currentWeekKey();
  let open = await loadOpen(athleteUid);

  for (const item of deferredArray || []) {
    const label = item?.priority;
    if (!label) continue;

    const key = item.key ?? null;
    const shared = {
      priority:         label,
      key,
      reason:           item.reason           ?? null,
      resolveCondition: item.resolveCondition ?? null,
      metricTarget:     cleanTarget(item.metricTarget),
    };

    const existing = open.find(d => samePriority(d, { priority: label, key }));

    // ── new development area ────────────────────────────────────────────────
    if (!existing) {
      const fields = {
        ...shared,
        deferredDate:       serverTimestamp(),
        weeksDeferredCount: 0,
        lastCountedWeek:    thisWeek,
        status:             "active",
        addressedDate:      null,
        escalatedDate:      null,
      };
      const created = await addDoc(col(athleteUid), fields);
      // Track locally so a second item in the same batch describing the same
      // area matches this one instead of creating another duplicate.
      open.push({ id: created.id, ...fields, deferredDate: new Date().toISOString() });
      continue;
    }

    const countedThisWeek = existing.lastCountedWeek === thisWeek;

    // ── same area, same wording ─────────────────────────────────────────────
    if (existing.priority === label) {
      if (countedThisWeek) continue;   // re-generating a plan must not inflate the count
      const nextCount = (existing.weeksDeferredCount ?? 0) + 1;
      await updateDoc(ref(athleteUid, existing.id), {
        ...shared,
        weeksDeferredCount: nextCount,
        lastCountedWeek:    thisWeek,
      });
      Object.assign(existing, shared, { weeksDeferredCount: nextCount, lastCountedWeek: thisWeek });
      continue;
    }

    // ── same area, new wording → supersede and carry the clock over ─────────
    const carriedCount = countedThisWeek
      ? (existing.weeksDeferredCount ?? 0)
      : (existing.weeksDeferredCount ?? 0) + 1;

    const fields = {
      ...shared,
      // Fall back to the incoming target only when the newest wording omits one,
      // so a re-worded priority doesn't lose its auto-resolve condition.
      metricTarget:       shared.metricTarget ?? cleanTarget(existing.metricTarget),
      deferredDate:       existing.deferredDate ?? serverTimestamp(),
      weeksDeferredCount: carriedCount,
      lastCountedWeek:    thisWeek,
      status:             existing.status === "escalated" ? "escalated" : "active",
      escalatedDate:      existing.escalatedDate ?? null,
      addressedDate:      null,
      supersedes:         existing.id,
    };
    const created = await addDoc(col(athleteUid), fields);
    await updateDoc(ref(athleteUid, existing.id), {
      status:         "superseded",
      supersededBy:   created.id,
      supersededDate: serverTimestamp(),
    });

    open = open.filter(d => d.id !== existing.id);
    open.push({ id: created.id, ...fields });
  }
}

// ── mergeDuplicatePriorities ─────────────────────────────────────────────────
// One-time cleanup for the duplicates already in Firestore, written before
// matching became area-based. Groups the open items, keeps the newest wording
// of each group with the ORIGINAL deferredDate and the highest deferral count,
// and supersedes the rest. Idempotent: once the list is clean every cluster has
// one member and this writes nothing, so it is safe to call on every load.
// Returns the number of docs folded away.
export async function mergeDuplicatePriorities(athleteUid) {
  const open = await loadOpen(athleteUid);
  if (open.length < 2) return 0;

  const clusters = clusterPriorities(
    open.map(d => ({ ...d, sortDate: toISO(d.deferredDate) ?? "" }))
  );

  let folded = 0;
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;

    const survivor = cluster[cluster.length - 1];        // newest wording
    const others   = cluster.slice(0, -1);

    const dated    = cluster.filter(d => d.sortDate);
    const earliest = dated.length ? dated[0] : survivor; // clusters are sorted oldest → newest
    const maxCount = Math.max(...cluster.map(d => d.weeksDeferredCount ?? 0));
    const escalated = cluster.find(d => d.status === "escalated") || null;
    const withTarget = cluster.find(d => isMetricTarget(d.metricTarget)) || null;

    await updateDoc(ref(athleteUid, survivor.id), {
      deferredDate:       earliest.deferredDate ?? survivor.deferredDate ?? serverTimestamp(),
      weeksDeferredCount: maxCount,
      status:             escalated ? "escalated" : survivor.status,
      escalatedDate:      escalated?.escalatedDate ?? survivor.escalatedDate ?? null,
      metricTarget:       cleanTarget(survivor.metricTarget) ?? cleanTarget(withTarget?.metricTarget),
      mergedFrom:         others.map(d => d.id),
    });

    for (const old of others) {
      await updateDoc(ref(athleteUid, old.id), {
        status:         "superseded",
        supersededBy:   survivor.id,
        supersededDate: serverTimestamp(),
      });
      folded += 1;
    }
  }

  return folded;
}

// ── resolveMetricTargets ─────────────────────────────────────────────────────
// Closes any open priority whose match-statistic target has been met. A target
// only counts against matches played AFTER the priority was raised, and must
// hold in the two most recent matches with a large enough sample — one good
// match against a weak opponent must not clear a real weakness.
// Returns the priorities it resolved, for the caller to surface as a toast.
export async function resolveMetricTargets(athleteUid) {
  const open = await loadOpen(athleteUid);
  const withTargets = open.filter(d => isMetricTarget(d.metricTarget));
  if (withTargets.length === 0) return [];

  const matchesSnap = await getDocs(collection(db, "matches"));
  const matches = matchesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.athleteId === athleteUid);
  if (matches.length === 0) return [];

  const resolved = [];
  for (const item of withTargets) {
    const since  = toISO(item.deferredDate);
    const streak = streakMet(matchesSince(matches, since), item.metricTarget);
    if (!streak.met) continue;

    // Resolved by document id, not by label — label matching is exactly the
    // fragility this whole change is removing.
    await updateDoc(ref(athleteUid, item.id), {
      status:              "resolved",
      addressedDate:       serverTimestamp(),
      resolvedBy:          "metric",
      resolvedByMatchIds:  streak.matchIds.filter(Boolean),
    });
    resolved.push(item);
  }

  return resolved;
}

// ── resolveDeferred ──────────────────────────────────────────────────────────
// Sets status to 'resolved' and records addressedDate for any open document
// describing the same development area as the given label. Area matching (not
// exact string equality) means the ✓ Resolved button still works after the AI
// has re-worded a priority.
export async function resolveDeferred(athleteUid, priorityLabel) {
  if (!priorityLabel) return;
  const open = await loadOpen(athleteUid);
  const targets = open.filter(d => d.priority === priorityLabel || samePriority(d, priorityLabel));

  for (const d of targets) {
    await updateDoc(ref(athleteUid, d.id), {
      status:        "resolved",
      addressedDate: serverTimestamp(),
    });
  }
}

// ── checkEscalations ─────────────────────────────────────────────────────────
// Promotes active items deferred 4+ weeks to 'escalated' (a write). This MUTATES,
// so its return value only reflects items it flipped on this call — do not rely
// on it for display (use refreshEscalations / getEscalated instead).
// Requires a Firestore composite index on: status ASC, weeksDeferredCount ASC
export async function checkEscalations(athleteUid) {
  const snap = await getDocs(
    query(
      col(athleteUid),
      where("status", "==", "active"),
      where("weeksDeferredCount", ">=", 4)
    )
  );

  const escalated = [];
  for (const d of snap.docs) {
    await updateDoc(ref(athleteUid, d.id), {
      status:        "escalated",
      escalatedDate: serverTimestamp(),
    });
    escalated.push({ id: d.id, ...d.data() });
  }

  return escalated;
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
