import { describe, it, expect } from "vitest";
import {
  SERVER_TIMESTAMP, isServerTimestamp, OPEN_STATUSES, cleanTarget,
  planPriorityUpserts, planMergeDuplicates, planMetricResolutions,
  planEscalations, planLabelResolutions,
} from "./deferredPrioritiesCore.js";

const THIS_WEEK = "2026-03-09";
const LAST_WEEK = "2026-03-02";

const target = { metric: "secondServePointsWonPct", comparator: ">=", value: 45 };

const openDoc = (over = {}) => ({
  id: "d1",
  priority: "Second serve under pressure",
  key: "second_serve",
  reason: "Needs on-court reps",
  resolveCondition: "2nd serve pts won >= 45%",
  metricTarget: null,
  deferredDate: "2026-02-01T00:00:00.000Z",
  weeksDeferredCount: 2,
  lastCountedWeek: LAST_WEEK,
  status: "active",
  ...over,
});

describe("the serverTimestamp sentinel", () => {
  it("is recognisable and carries no SDK reference", () => {
    expect(SERVER_TIMESTAMP).toEqual({ __serverTimestamp: true });
    expect(isServerTimestamp(SERVER_TIMESTAMP)).toBe(true);
    expect(isServerTimestamp({ __serverTimestamp: true })).toBe(true);
    expect(isServerTimestamp(null)).toBe(false);
    expect(isServerTimestamp("2026-03-09")).toBe(false);
    expect(isServerTimestamp({})).toBe(false);
  });

  it("is frozen, so an applier cannot corrupt the shared instance", () => {
    expect(Object.isFrozen(SERVER_TIMESTAMP)).toBe(true);
  });

  it("treats only active/escalated as open", () => {
    expect(OPEN_STATUSES).toEqual(["active", "escalated"]);
  });
});

describe("cleanTarget", () => {
  it("keeps only the three fields of a well-formed target", () => {
    expect(cleanTarget({ ...target, junk: "x" })).toEqual(target);
  });

  it("drops a hallucinated metric id, comparator or value", () => {
    expect(cleanTarget({ metric: "vibesPct", comparator: ">=", value: 45 })).toBeNull();
    expect(cleanTarget({ ...target, comparator: "≥" })).toBeNull();
    expect(cleanTarget({ ...target, value: "45" })).toBeNull();
    expect(cleanTarget(null)).toBeNull();
  });
});

describe("planPriorityUpserts — create", () => {
  it("creates a genuinely new area at count 0 with the timestamp sentinel", () => {
    const ops = planPriorityUpserts([], [{
      priority: "Net play conversion", key: "net_play", reason: "No time", resolveCondition: "when approaching more",
      metricTarget: target,
    }], THIS_WEEK);

    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("create");
    expect(ops[0].tempId).toBe("new-0");
    expect(ops[0].fields).toEqual({
      priority: "Net play conversion",
      key: "net_play",
      reason: "No time",
      resolveCondition: "when approaching more",
      metricTarget: target,
      deferredDate: SERVER_TIMESTAMP,
      weeksDeferredCount: 0,
      lastCountedWeek: THIS_WEEK,
      status: "active",
      addressedDate: null,
      escalatedDate: null,
    });
  });

  it("cleans a malformed metricTarget to null on the way in", () => {
    const ops = planPriorityUpserts([], [{
      priority: "Net play", key: "net_play", metricTarget: { metric: "notAMetric", comparator: ">=", value: 1 },
    }], THIS_WEEK);
    expect(ops[0].fields.metricTarget).toBeNull();
  });

  it("skips items with no priority label", () => {
    expect(planPriorityUpserts([], [{ key: "net_play" }, {}, null], THIS_WEEK)).toEqual([]);
  });

  it("matches a second item in the same batch against the one it just created", () => {
    const ops = planPriorityUpserts([], [
      { priority: "Second serve consistency", key: "second_serve" },
      { priority: "Second serve reliability", key: "second_serve" },
    ], THIS_WEEK);

    expect(ops.map(o => o.op)).toEqual(["create", "supersede"]);
    // The supersede references the doc the create is about to make, by tempId.
    expect(ops[1].oldId).toBe("new-0");
    expect(ops[1].newFields.supersedes).toBe("new-0");
    expect(ops[1].tempId).toBe("new-1");
  });
});

describe("planPriorityUpserts — update (same area, same wording)", () => {
  it("increments the count and stamps lastCountedWeek", () => {
    const ops = planPriorityUpserts(
      [openDoc()],
      [{ priority: "Second serve under pressure", key: "second_serve", reason: "still queued" }],
      THIS_WEEK,
    );

    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      op: "update",
      id: "d1",
      fields: {
        priority: "Second serve under pressure",
        key: "second_serve",
        reason: "still queued",
        resolveCondition: null,
        metricTarget: null,
        weeksDeferredCount: 3,
        lastCountedWeek: THIS_WEEK,
      },
    });
  });

  it("does NOT double-count when the week was already counted", () => {
    const ops = planPriorityUpserts(
      [openDoc({ lastCountedWeek: THIS_WEEK })],
      [{ priority: "Second serve under pressure", key: "second_serve" }],
      THIS_WEEK,
    );
    expect(ops).toEqual([]);
  });

  it("re-running the same batch twice is what the guard protects", () => {
    const doc = openDoc();
    const first = planPriorityUpserts([doc], [{ priority: doc.priority, key: doc.key }], THIS_WEEK);
    expect(first[0].fields.weeksDeferredCount).toBe(3);

    // Simulate the applied state, then run again in the same week.
    const applied = { ...doc, ...first[0].fields };
    const second = planPriorityUpserts([applied], [{ priority: doc.priority, key: doc.key }], THIS_WEEK);
    expect(second).toEqual([]);
  });
});

describe("planPriorityUpserts — supersede (same area, new wording)", () => {
  it("carries the clock over and increments once for an uncounted week", () => {
    const ops = planPriorityUpserts(
      [openDoc()],
      [{ priority: "Improve 2nd serve reliability", key: "second_serve", reason: "reworded" }],
      THIS_WEEK,
    );

    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.op).toBe("supersede");
    expect(op.oldId).toBe("d1");
    expect(op.newFields.weeksDeferredCount).toBe(3);         // 2 + 1
    expect(op.newFields.deferredDate).toBe("2026-02-01T00:00:00.000Z"); // original clock, not reset
    expect(op.newFields.lastCountedWeek).toBe(THIS_WEEK);
    expect(op.newFields.supersedes).toBe("d1");
    expect(op.newFields.status).toBe("active");
    expect(op.newFields.addressedDate).toBeNull();
  });

  it("does not increment when the week was already counted", () => {
    const ops = planPriorityUpserts(
      [openDoc({ lastCountedWeek: THIS_WEEK })],
      [{ priority: "Improve 2nd serve reliability", key: "second_serve" }],
      THIS_WEEK,
    );
    expect(ops[0].op).toBe("supersede");
    expect(ops[0].newFields.weeksDeferredCount).toBe(2);     // carried, not incremented
  });

  it("preserves an escalation across the rewording", () => {
    const ops = planPriorityUpserts(
      [openDoc({ status: "escalated", escalatedDate: "2026-03-01T00:00:00.000Z", weeksDeferredCount: 5 })],
      [{ priority: "Improve 2nd serve reliability", key: "second_serve" }],
      THIS_WEEK,
    );
    expect(ops[0].newFields.status).toBe("escalated");
    expect(ops[0].newFields.escalatedDate).toBe("2026-03-01T00:00:00.000Z");
    expect(ops[0].newFields.weeksDeferredCount).toBe(6);
  });

  it("falls back to the old metricTarget when the new wording omits one", () => {
    const ops = planPriorityUpserts(
      [openDoc({ metricTarget: target })],
      [{ priority: "Improve 2nd serve reliability", key: "second_serve", metricTarget: null }],
      THIS_WEEK,
    );
    expect(ops[0].newFields.metricTarget).toEqual(target);
  });

  it("prefers the incoming target when the new wording supplies one", () => {
    const newer = { metric: "doubleFaults", comparator: "<=", value: 3 };
    const ops = planPriorityUpserts(
      [openDoc({ metricTarget: target })],
      [{ priority: "Improve 2nd serve reliability", key: "second_serve", metricTarget: newer }],
      THIS_WEEK,
    );
    expect(ops[0].newFields.metricTarget).toEqual(newer);
  });

  it("uses the sentinel when the superseded doc had no deferredDate at all", () => {
    const ops = planPriorityUpserts(
      [openDoc({ deferredDate: null })],
      [{ priority: "Improve 2nd serve reliability", key: "second_serve" }],
      THIS_WEEK,
    );
    expect(isServerTimestamp(ops[0].newFields.deferredDate)).toBe(true);
  });
});

describe("planPriorityUpserts — purity", () => {
  it("never mutates the documents it was handed", () => {
    const docs = [openDoc(), openDoc({ id: "d2", priority: "Movement recovery", key: "movement_footwork" })];
    const snapshot = JSON.parse(JSON.stringify(docs));
    planPriorityUpserts(docs, [
      { priority: "Second serve under pressure", key: "second_serve" },
      { priority: "Improve movement recovery on wide balls", key: "movement_footwork" },
      { priority: "Brand new area", key: "drop_shot" },
    ], THIS_WEEK);
    expect(docs).toEqual(snapshot);
  });

  it("never mutates the incoming AI array", () => {
    const incoming = [{ priority: "Net play", key: "net_play", metricTarget: { ...target } }];
    const snapshot = JSON.parse(JSON.stringify(incoming));
    planPriorityUpserts([], incoming, THIS_WEEK);
    expect(incoming).toEqual(snapshot);
  });

  it("handles null inputs", () => {
    expect(planPriorityUpserts(null, null, THIS_WEEK)).toEqual([]);
  });
});

describe("planMergeDuplicates", () => {
  const dupes = [
    { id: "a", priority: "Second serve consistency", key: "second_serve", status: "active", weeksDeferredCount: 1, deferredDate: "2026-01-01T00:00:00.000Z", metricTarget: target },
    { id: "b", priority: "Second serve reliability", key: "second_serve", status: "escalated", weeksDeferredCount: 5, escalatedDate: "2026-02-20T00:00:00.000Z", deferredDate: "2026-02-01T00:00:00.000Z", metricTarget: null },
  ];

  it("keeps the newest wording with the earliest date and the highest count", () => {
    const ops = planMergeDuplicates(dupes);
    const survivor = ops.find(o => o.kind === "survivor");
    expect(survivor.id).toBe("b");                                  // newest wording
    expect(survivor.fields.deferredDate).toBe("2026-01-01T00:00:00.000Z"); // earliest clock
    expect(survivor.fields.weeksDeferredCount).toBe(5);
    expect(survivor.fields.status).toBe("escalated");
    expect(survivor.fields.escalatedDate).toBe("2026-02-20T00:00:00.000Z");
    expect(survivor.fields.metricTarget).toEqual(target);           // rescued from the folded doc
    expect(survivor.fields.mergedFrom).toEqual(["a"]);
  });

  it("folds the rest with the timestamp sentinel", () => {
    const folds = planMergeDuplicates(dupes).filter(o => o.kind === "fold");
    expect(folds).toHaveLength(1);
    expect(folds[0]).toEqual({
      op: "update",
      kind: "fold",
      id: "a",
      fields: { status: "superseded", supersededBy: "b", supersededDate: SERVER_TIMESTAMP },
    });
  });

  it("is idempotent — a clean list produces no ops", () => {
    const clean = [
      { id: "a", priority: "Second serve", key: "second_serve", status: "active", weeksDeferredCount: 1 },
      { id: "b", priority: "Movement footwork", key: "movement_footwork", status: "active", weeksDeferredCount: 1 },
    ];
    expect(planMergeDuplicates(clean)).toEqual([]);
  });

  it("returns nothing for fewer than two docs", () => {
    expect(planMergeDuplicates([dupes[0]])).toEqual([]);
    expect(planMergeDuplicates([])).toEqual([]);
    expect(planMergeDuplicates(null)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const snapshot = JSON.parse(JSON.stringify(dupes));
    planMergeDuplicates(dupes);
    expect(dupes).toEqual(snapshot);
  });
});

describe("planMetricResolutions", () => {
  const withTarget = openDoc({ metricTarget: target, deferredDate: "2026-03-01T00:00:00.000Z" });

  const madeTarget = (id, date, pct) => ({
    id,
    matchStartTime: date,
    athleteId: "athlete-1",
    valissa: { secondServePoints: 12, secondServePointsWon: 7 },
    calculated: { secondServePointsWonPct: pct },
  });

  it("resolves once the target holds across two measurable matches", () => {
    const ops = planMetricResolutions([withTarget], [
      madeTarget("m1", "2026-03-05T00:00:00.000Z", 52),
      madeTarget("m2", "2026-03-12T00:00:00.000Z", 48),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("resolve");
    expect(ops[0].id).toBe("d1");
    expect(ops[0].doc).toBe(withTarget);       // the caller surfaces this as a toast
    expect(ops[0].fields.status).toBe("resolved");
    expect(ops[0].fields.resolvedBy).toBe("metric");
    expect(isServerTimestamp(ops[0].fields.addressedDate)).toBe(true);
    expect(ops[0].fields.resolvedByMatchIds).toEqual(["m2", "m1"]); // newest first
  });

  it("does not resolve on a single good match", () => {
    expect(planMetricResolutions([withTarget], [
      madeTarget("m1", "2026-03-05T00:00:00.000Z", 52),
    ])).toEqual([]);
  });

  it("ignores matches played before the priority was raised", () => {
    expect(planMetricResolutions([withTarget], [
      madeTarget("old1", "2026-01-05T00:00:00.000Z", 60),
      madeTarget("old2", "2026-02-05T00:00:00.000Z", 60),
    ])).toEqual([]);
  });

  it("skips priorities with no well-formed target, and no-ops without matches", () => {
    expect(planMetricResolutions([openDoc({ metricTarget: null })], [
      madeTarget("m1", "2026-03-05T00:00:00.000Z", 52),
    ])).toEqual([]);
    expect(planMetricResolutions([withTarget], [])).toEqual([]);
    expect(planMetricResolutions([withTarget], null)).toEqual([]);
    expect(planMetricResolutions(null, null)).toEqual([]);
  });
});

describe("planEscalations", () => {
  it("escalates active items deferred 4+ weeks", () => {
    const ops = planEscalations([
      openDoc({ id: "a", weeksDeferredCount: 4 }),
      openDoc({ id: "b", weeksDeferredCount: 3 }),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      op: "escalate",
      id: "a",
      fields: { status: "escalated", escalatedDate: SERVER_TIMESTAMP },
    });
    expect(ops[0].doc.id).toBe("a");
  });

  it("never re-escalates something already escalated", () => {
    expect(planEscalations([openDoc({ status: "escalated", weeksDeferredCount: 9 })])).toEqual([]);
  });

  it("mirrors the Firestore range query — a doc missing the field is not matched", () => {
    expect(planEscalations([openDoc({ weeksDeferredCount: undefined })])).toEqual([]);
    expect(planEscalations([openDoc({ weeksDeferredCount: "6" })])).toEqual([]);
    expect(planEscalations(null)).toEqual([]);
  });
});

describe("planLabelResolutions", () => {
  it("resolves by exact label", () => {
    const ops = planLabelResolutions([openDoc()], "Second serve under pressure");
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("resolve");
    expect(ops[0].id).toBe("d1");
    expect(ops[0].fields.status).toBe("resolved");
    expect(isServerTimestamp(ops[0].fields.addressedDate)).toBe(true);
  });

  it("still resolves after the AI has reworded the priority", () => {
    const ops = planLabelResolutions([openDoc()], "Second serve consistency under pressure");
    expect(ops).toHaveLength(1);
  });

  it("resolves nothing for an unrelated or empty label", () => {
    expect(planLabelResolutions([openDoc()], "Drop shot disguise")).toEqual([]);
    expect(planLabelResolutions([openDoc()], "")).toEqual([]);
    expect(planLabelResolutions([openDoc()], null)).toEqual([]);
  });
});
