import { describe, it, expect } from "vitest";
import {
  PRIORITY_KEYS, isRealKey, normalizeLabel, normalizeTokens,
  similarity, samePriority, clusterPriorities,
  deferredPrioritySchemaBlock, renderExistingPriorities,
  textAddressesPriority,
} from "./priorityKeys.js";
import { METRIC_IDS } from "./priorityMetrics.js";

// The Firebase-free guarantee for this module is enforced repo-wide by the
// transitive import guard in athleteMemoryCore.test.js.

describe("normalizeTokens", () => {
  it("drops filler words so 'Improve second serve' matches 'Second serve'", () => {
    expect(normalizeTokens("Improve second serve")).toEqual(["second", "serve"]);
    expect(normalizeTokens("Second serve")).toEqual(["second", "serve"]);
  });

  it("expands ordinal shorthand", () => {
    expect(normalizeTokens("2nd serve")).toEqual(["second", "serve"]);
    expect(normalizeTokens("1st serve %")).toEqual(["first", "serve"]);
  });

  it("de-duplicates repeated tokens", () => {
    expect(normalizeTokens("serve serve serve")).toEqual(["serve"]);
  });

  it("survives non-strings", () => {
    expect(normalizeTokens(null)).toEqual([]);
    expect(normalizeTokens(undefined)).toEqual([]);
    expect(normalizeTokens(42)).toEqual([]);
  });
});

describe("normalizeLabel", () => {
  it("is word-order independent", () => {
    expect(normalizeLabel("serve second")).toBe(normalizeLabel("second serve"));
  });
});

describe("samePriority", () => {
  it("merges the real duplicates seen in her data", () => {
    expect(samePriority("Second serve consistency", "Improve 2nd serve reliability")).toBe(true);
    expect(samePriority("Second serve consistency", "Second-serve consistency")).toBe(true);
  });

  it("keeps genuinely different areas apart", () => {
    expect(samePriority("Backhand consistency", "Forehand consistency")).toBe(false);
    expect(samePriority("Second serve consistency", "Net play approach volleys")).toBe(false);
    expect(samePriority("First serve percentage", "Second serve percentage")).toBe(false);
  });

  it("treats an equal taxonomy key as authoritative regardless of wording", () => {
    const a = { priority: "Get more free points off the serve", key: "first_serve" };
    const b = { priority: "First delivery has to land more often",  key: "first_serve" };
    expect(samePriority(a, b)).toBe(true);
  });

  it("treats different taxonomy keys as different even when wording overlaps", () => {
    const a = { priority: "Serve consistency", key: "first_serve" };
    const b = { priority: "Serve consistency", key: "second_serve" };
    expect(samePriority(a, b)).toBe(false);
  });

  it("does not let the 'other' escape hatch merge unrelated priorities", () => {
    const a = { priority: "Tighten the ball toss", key: "other" };
    const b = { priority: "Recover to centre after wide balls", key: "other" };
    expect(samePriority(a, b)).toBe(false);
    expect(isRealKey("other")).toBe(false);
  });

  it("falls back to label similarity when only one side has a key (legacy docs)", () => {
    const legacy = { priority: "2nd serve consistency" };            // written before keys existed
    const fresh  = { priority: "Second serve consistency", key: "second_serve" };
    expect(samePriority(legacy, fresh)).toBe(true);
  });

  it("returns false rather than throwing on empty input", () => {
    expect(samePriority("", "Second serve")).toBe(false);
    expect(samePriority({}, {})).toBe(false);
  });
});

describe("similarity", () => {
  it("scores identical normalized labels at 1", () => {
    expect(similarity("Improve 2nd serve", "Second serve")).toBe(1);
  });

  it("scores disjoint labels at 0", () => {
    expect(similarity("Backhand", "Serve")).toBe(0);
  });
});

describe("clusterPriorities", () => {
  it("groups duplicates and orders each cluster oldest → newest", () => {
    const docs = [
      { id: "a", priority: "Second serve consistency",   sortDate: "2026-06-01" },
      { id: "b", priority: "Backhand down-the-line",     sortDate: "2026-06-10" },
      { id: "c", priority: "Improve 2nd serve reliability", sortDate: "2026-07-20" },
    ];
    const clusters = clusterPriorities(docs);
    expect(clusters).toHaveLength(2);

    const serve = clusters.find(c => c.length === 2);
    expect(serve.map(d => d.id)).toEqual(["a", "c"]);   // original first, newest wording last
  });

  it("leaves a clean list untouched — one cluster per doc", () => {
    const docs = [
      { id: "a", priority: "First serve percentage" },
      { id: "b", priority: "Net play" },
      { id: "c", priority: "Rally tolerance in long points" },
    ];
    expect(clusterPriorities(docs)).toHaveLength(3);
  });

  it("ignores null entries", () => {
    expect(clusterPriorities([null, undefined, { priority: "Net play" }])).toHaveLength(1);
  });
});

describe("textAddressesPriority", () => {
  // Note: plain samePriority(text, priorityDoc) Jaccard similarity between this
  // sentence and the priority label is only 0.5 (below SIMILARITY_THRESHOLD of
  // 0.6) because the full sentence dilutes token overlap — a bare
  // samePriority wrapper would wrongly return false here. textAddressesPriority
  // instead checks whether the taxonomy key's own tokens are all present in
  // the text, which is what makes this reworded case resolve correctly.
  it("matches a reworded tennisConnection via the priority's real taxonomy key", () => {
    const priority = { priority: "Improve second serve reliability", key: "second_serve" };
    const tennisConnection = "Builds a heavier, more consistent 2nd serve under pressure";
    expect(samePriority(tennisConnection, priority)).toBe(false); // documents the dilution finding
    expect(textAddressesPriority(tennisConnection, priority)).toBe(true);
  });

  it("does not let a short generic label false-match an unrelated connection", () => {
    const priority = { priority: "Net play", key: "net_play" };
    const tennisConnection = "Improves footwork and split-step timing for baseline recovery";
    expect(textAddressesPriority(tennisConnection, priority)).toBe(false);
  });

  it("still matches the old exact-substring case (legacy doc with no key)", () => {
    const priority = { priority: "second serve consistency" };
    const tennisConnection = "This drill directly targets second serve consistency under match pressure";
    expect(textAddressesPriority(tennisConnection, priority)).toBe(true);
  });

  it("returns false rather than throwing on empty input", () => {
    expect(textAddressesPriority("", { priority: "Net play" })).toBe(false);
    expect(textAddressesPriority("some text", null)).toBe(false);
  });
});

describe("PRIORITY_KEYS", () => {
  it("has unique ids and includes the 'other' escape hatch", () => {
    const ids = PRIORITY_KEYS.map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("other");
  });
});

describe("deferredPrioritySchemaBlock", () => {
  const block = deferredPrioritySchemaBlock();

  it("lists every taxonomy key the model is allowed to pick", () => {
    for (const k of PRIORITY_KEYS) expect(block, k.id).toContain(k.id);
  });

  it("lists every metric id the auto-resolver can actually evaluate", () => {
    for (const id of METRIC_IDS) expect(block, id).toContain(id);
  });

  it("tells the model to reuse an existing key rather than re-word a problem", () => {
    expect(block).toMatch(/reuse that item's exact "key"/i);
  });
});

describe("renderExistingPriorities", () => {
  it("shows the key so the model can reuse it", () => {
    const out = renderExistingPriorities([
      { priority: "Second serve consistency", key: "second_serve", weeksDeferredCount: 3, resolveCondition: "when serve holds up" },
    ]);
    expect(out).toContain("[key: second_serve]");
    expect(out).toContain("Second serve consistency");
    expect(out).toContain("deferred 3 wks");
    expect(out).toContain("resolve when: when serve holds up");
  });

  it("marks a legacy item with no key as unset rather than hiding it", () => {
    expect(renderExistingPriorities([{ priority: "Net play", weeksDeferredCount: 1 }]))
      .toBe("- [key: unset] Net play (deferred 1 wk)");
  });

  it("renders 'None' for an empty or missing list", () => {
    expect(renderExistingPriorities([])).toBe("None");
    expect(renderExistingPriorities(null)).toBe("None");
  });
});
