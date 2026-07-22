import { describe, it, expect } from "vitest";
import { hasResolvableStats, selectAutoResolvable } from "./autoResolve.js";

describe("hasResolvableStats", () => {
  it("is false for empty or stats-free matches", () => {
    expect(hasResolvableStats(null)).toBe(false);
    expect(hasResolvableStats({})).toBe(false);
    expect(hasResolvableStats({ valissa: {} })).toBe(false);
  });
  it("is true for quick-mode (serve only) and detailed matches", () => {
    expect(hasResolvableStats({ valissa: { firstServePct: 55 } })).toBe(true);
    expect(hasResolvableStats({ valissa: { winners: 3 } })).toBe(true);
    expect(hasResolvableStats({ valissa: { unforcedErrors: 0 } })).toBe(true);
  });
});

describe("selectAutoResolvable", () => {
  const active = [{ priority: "Second serve consistency" }, { priority: "Backhand under pressure" }];

  it("keeps only exact matches against the active deferred list", () => {
    const out = selectAutoResolvable(
      [{ priority: "Second serve consistency", evidence: "2nd serve 56%" },
       { priority: "Net game", evidence: "n/a" }],
      active,
    );
    expect(out).toEqual([{ priority: "Second serve consistency", evidence: "2nd serve 56%" }]);
  });

  it("ignores case/whitespace mismatches (must be exact)", () => {
    expect(selectAutoResolvable([{ priority: "second serve consistency" }], active)).toEqual([]);
    expect(selectAutoResolvable([{ priority: " Backhand under pressure " }], active)).toEqual([]);
  });

  it("drops priorities re-deferred by the same analysis", () => {
    const out = selectAutoResolvable(
      [{ priority: "Backhand under pressure", evidence: "1E / 4W" }],
      active,
      [{ priority: "Backhand under pressure" }],
    );
    expect(out).toEqual([]);
  });

  it("de-duplicates and tolerates malformed entries", () => {
    const out = selectAutoResolvable(
      [{ priority: "Second serve consistency", evidence: "a" },
       { priority: "Second serve consistency", evidence: "b" },
       {}, null, "Backhand under pressure", { evidence: "no label" }],
      active,
    );
    expect(out).toEqual([
      { priority: "Second serve consistency", evidence: "a" },
      { priority: "Backhand under pressure", evidence: null },
    ]);
  });

  it("returns [] for non-array input", () => {
    expect(selectAutoResolvable(undefined, active)).toEqual([]);
    expect(selectAutoResolvable(null, active)).toEqual([]);
  });
});
