import { samePriority, clusterPriorities } from "./priorityKeys.js";
import { isMetricTarget, matchesSince, streakMet, toISO } from "./priorityMetrics.js";

// ─── DEFERRED PRIORITIES — PURE CORE ─────────────────────────────────────────
// Every decision about the deferredPriorities collection, split out of
// deferredPriorities.js as PLANNERS: each takes the already-loaded open docs
// plus whatever else it needs and returns a list of write ops, mutating nothing
// and touching no SDK. deferredPriorities.js (client SDK) and the Cloud
// Function adapter (admin SDK) each apply the same ops, so the two can never
// diverge on the wording-vs-area matching, the escalation clock carryover or
// the once-per-week counting guard.
//
// ── the serverTimestamp problem ──────────────────────────────────────────────
// A pure module cannot call the client SDK's serverTimestamp(). Ops therefore
// carry the sentinel { __serverTimestamp: true } in any field that wants a
// server clock, and each applier swaps it for its own SDK's sentinel.
export const SERVER_TIMESTAMP = Object.freeze({ __serverTimestamp: true });

export const isServerTimestamp = (v) =>
  !!v && typeof v === "object" && v.__serverTimestamp === true;

// A priority is "open" while it still needs work. `superseded` docs are the
// older wording of a priority that was re-raised — they are history, and every
// reader (this module, athleteContext, PrioritiesTab, MeScreen) filters on
// active/escalated, so they never surface again.
export const OPEN_STATUSES = ["active", "escalated"];

export const isOpen = (d) => OPEN_STATUSES.includes(d?.status);

// Only a well-formed target is persisted — a hallucinated metric id must never
// reach the auto-resolver.
export const cleanTarget = (t) => (isMetricTarget(t) ? {
  metric: t.metric, comparator: t.comparator, value: t.value,
} : null);

// ── planPriorityUpserts ──────────────────────────────────────────────────────
// Takes the open docs, the deferredPriorities array returned by the AI and this
// week's key, and returns the upsert ops.
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
//
// Ops:
//   { op: 'create',    tempId, fields }
//   { op: 'update',    id, fields }
//   { op: 'supersede', oldId, tempId, newFields }
//
// `tempId` names a doc this op list is about to create. A later op in the SAME
// list can reference it (as `oldId`, or as `newFields.supersedes`) when a second
// incoming item describes the area a earlier item just created; the applier maps
// tempIds to the real ids it gets back.
export function planPriorityUpserts(openDocs, incomingArray, thisWeek) {
  const ops = [];
  // Shallow copies: the local bookkeeping below assigns onto these, and a
  // planner must never mutate its caller's documents.
  let open = (openDocs || []).map(d => ({ ...d }));
  let tempSeq = 0;

  for (const item of incomingArray || []) {
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
      const tempId = `new-${tempSeq++}`;
      const fields = {
        ...shared,
        deferredDate:       SERVER_TIMESTAMP,
        weeksDeferredCount: 0,
        lastCountedWeek:    thisWeek,
        status:             "active",
        addressedDate:      null,
        escalatedDate:      null,
      };
      ops.push({ op: "create", tempId, fields });
      // Track locally so a second item in the same batch describing the same
      // area matches this one instead of creating another duplicate.
      open.push({ id: tempId, ...fields, deferredDate: new Date().toISOString() });
      continue;
    }

    const countedThisWeek = existing.lastCountedWeek === thisWeek;

    // ── same area, same wording ─────────────────────────────────────────────
    if (existing.priority === label) {
      if (countedThisWeek) continue;   // re-generating a plan must not inflate the count
      const nextCount = (existing.weeksDeferredCount ?? 0) + 1;
      const fields = {
        ...shared,
        weeksDeferredCount: nextCount,
        lastCountedWeek:    thisWeek,
      };
      ops.push({ op: "update", id: existing.id, fields });
      Object.assign(existing, shared, { weeksDeferredCount: nextCount, lastCountedWeek: thisWeek });
      continue;
    }

    // ── same area, new wording → supersede and carry the clock over ─────────
    const carriedCount = countedThisWeek
      ? (existing.weeksDeferredCount ?? 0)
      : (existing.weeksDeferredCount ?? 0) + 1;

    const tempId = `new-${tempSeq++}`;
    const newFields = {
      ...shared,
      // Fall back to the incoming target only when the newest wording omits one,
      // so a re-worded priority doesn't lose its auto-resolve condition.
      metricTarget:       shared.metricTarget ?? cleanTarget(existing.metricTarget),
      deferredDate:       existing.deferredDate ?? SERVER_TIMESTAMP,
      weeksDeferredCount: carriedCount,
      lastCountedWeek:    thisWeek,
      status:             existing.status === "escalated" ? "escalated" : "active",
      escalatedDate:      existing.escalatedDate ?? null,
      addressedDate:      null,
      supersedes:         existing.id,
    };
    ops.push({ op: "supersede", oldId: existing.id, tempId, newFields });

    open = open.filter(d => d.id !== existing.id);
    open.push({ id: tempId, ...newFields });
  }

  return ops;
}

// ── planMergeDuplicates ──────────────────────────────────────────────────────
// Cleanup for duplicates written before matching became area-based. Groups the
// open items, keeps the newest wording of each group with the ORIGINAL
// deferredDate and the highest deferral count, and supersedes the rest.
// Idempotent: once the list is clean every cluster has one member and this
// returns no ops, so it is safe to run on every load.
//
// Ops: { op: 'update', kind: 'survivor'|'fold', id, fields }
// The number of `fold` ops is the "docs folded away" count.
export function planMergeDuplicates(openDocs) {
  const open = openDocs || [];
  if (open.length < 2) return [];

  const clusters = clusterPriorities(
    open.map(d => ({ ...d, sortDate: toISO(d.deferredDate) ?? "" }))
  );

  const ops = [];
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;

    const survivor = cluster[cluster.length - 1];        // newest wording
    const others   = cluster.slice(0, -1);

    const dated    = cluster.filter(d => d.sortDate);
    const earliest = dated.length ? dated[0] : survivor; // clusters are sorted oldest → newest
    const maxCount = Math.max(...cluster.map(d => d.weeksDeferredCount ?? 0));
    const escalated = cluster.find(d => d.status === "escalated") || null;
    const withTarget = cluster.find(d => isMetricTarget(d.metricTarget)) || null;

    ops.push({
      op: "update",
      kind: "survivor",
      id: survivor.id,
      fields: {
        deferredDate:       earliest.deferredDate ?? survivor.deferredDate ?? SERVER_TIMESTAMP,
        weeksDeferredCount: maxCount,
        status:             escalated ? "escalated" : survivor.status,
        escalatedDate:      escalated?.escalatedDate ?? survivor.escalatedDate ?? null,
        metricTarget:       cleanTarget(survivor.metricTarget) ?? cleanTarget(withTarget?.metricTarget),
        mergedFrom:         others.map(d => d.id),
      },
    });

    for (const old of others) {
      ops.push({
        op: "update",
        kind: "fold",
        id: old.id,
        fields: {
          status:         "superseded",
          supersededBy:   survivor.id,
          supersededDate: SERVER_TIMESTAMP,
        },
      });
    }
  }

  return ops;
}

// ── planMetricResolutions ────────────────────────────────────────────────────
// Closes any open priority whose match-statistic target has been met. A target
// only counts against matches played AFTER the priority was raised, and must
// hold in the two most recent matches with a large enough sample — one good
// match against a weak opponent must not clear a real weakness.
//
// `matches` must already be scoped to this athlete.
// Ops: { op: 'resolve', id, doc, fields } — `doc` is the open document, so the
// caller can surface what it resolved without a second read.
export function planMetricResolutions(openDocs, matches) {
  const withTargets = (openDocs || []).filter(d => isMetricTarget(d.metricTarget));
  if (withTargets.length === 0) return [];
  if (!matches || matches.length === 0) return [];

  const ops = [];
  for (const item of withTargets) {
    const since  = toISO(item.deferredDate);
    const streak = streakMet(matchesSince(matches, since), item.metricTarget);
    if (!streak.met) continue;

    // Resolved by document id, not by label — label matching is exactly the
    // fragility this whole design removes.
    ops.push({
      op: "resolve",
      id: item.id,
      doc: item,
      fields: {
        status:             "resolved",
        addressedDate:      SERVER_TIMESTAMP,
        resolvedBy:         "metric",
        resolvedByMatchIds: streak.matchIds.filter(Boolean),
      },
    });
  }

  return ops;
}

// ── planEscalations ──────────────────────────────────────────────────────────
// Promotes active items deferred 4+ weeks to 'escalated'. The numeric guard
// mirrors the Firestore `where("weeksDeferredCount", ">=", 4)` this replaces:
// a doc missing the field is not matched by that query, so it is not matched
// here either.
// Ops: { op: 'escalate', id, doc, fields }
export function planEscalations(openDocs) {
  return (openDocs || [])
    .filter(d => d.status === "active"
      && typeof d.weeksDeferredCount === "number"
      && d.weeksDeferredCount >= 4)
    .map(d => ({
      op: "escalate",
      id: d.id,
      doc: d,
      fields: {
        status:        "escalated",
        escalatedDate: SERVER_TIMESTAMP,
      },
    }));
}

// ── planLabelResolutions ─────────────────────────────────────────────────────
// The docs describing the same development area as `priorityLabel`. Area
// matching (not exact string equality) means the ✓ Resolved button still works
// after the AI has re-worded a priority.
// Ops: { op: 'resolve', id, doc, fields }
export function planLabelResolutions(openDocs, priorityLabel) {
  if (!priorityLabel) return [];
  return (openDocs || [])
    .filter(d => d.priority === priorityLabel || samePriority(d, priorityLabel))
    .map(d => ({
      op: "resolve",
      id: d.id,
      doc: d,
      fields: {
        status:        "resolved",
        addressedDate: SERVER_TIMESTAMP,
      },
    }));
}
